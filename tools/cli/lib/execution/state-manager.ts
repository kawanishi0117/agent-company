/**
 * State Manager - 状態永続化と履歴管理
 *
 * エージェント実行エンジンの状態を永続化し、システム再起動後も
 * 前回の作業状態を復元できるようにする。
 *
 * @module execution/state-manager
 * @see Requirements: 9.2, 9.3, 9.4, 9.5, 14.1, 14.2, 14.3, 14.4, 14.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ExecutionState,
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  RunId,
  ExecutionPersistenceData,
  WorkerState,
  ConversationHistory,
  // TicketStatusは将来の状態管理拡張で使用予定
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TicketStatus,
} from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 状態保存ディレクトリのベースパス
 * @see Requirement 14.1: THE System SHALL persist execution state to `runtime/state/`
 */
const STATE_BASE_DIR = 'runtime/state';

/**
 * 実行状態保存ディレクトリ（将来の拡張用）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _RUNS_DIR = path.join(STATE_BASE_DIR, 'runs');

/**
 * システム設定ファイルパス（将来の拡張用）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CONFIG_FILE = path.join(STATE_BASE_DIR, 'config.json');

// =============================================================================
// 型定義
// =============================================================================

/**
 * 実行情報フィルター
 * @description 実行履歴を絞り込むためのフィルター条件
 */
export interface RunFilter {
  /** ステータスでフィルター */
  status?: ExecutionState['status'];
  /** 開始日時以降でフィルター（ISO8601形式） */
  since?: string;
  /** 終了日時以前でフィルター（ISO8601形式） */
  until?: string;
  /** タスクIDでフィルター */
  taskId?: string;
}

/**
 * 実行情報
 * @description 実行履歴の概要情報
 */
export interface RunInfo {
  /** 実行ID */
  runId: string;
  /** タスクID */
  taskId: string;
  /** ステータス */
  status: ExecutionState['status'];
  /** 最終更新日時（ISO8601形式） */
  lastUpdated: string;
  /** 成果物数 */
  artifactCount: number;
}

/**
 * 一時停止・再開結果
 * @description pauseExecution/resumeExecutionメソッドの戻り値
 * @see Requirements: 9.4, 9.5
 */
export interface PauseResumeResult {
  /** 操作が成功したか */
  success: boolean;
  /** 実行ID */
  runId: string;
  /** 操作前のステータス */
  previousStatus: 'running' | 'paused' | 'completed' | 'failed';
  /** 操作後のステータス */
  newStatus: 'running' | 'paused' | 'completed' | 'failed';
  /** メッセージ（成功時） */
  message?: string;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 復元されたワーカー状態のID一覧（再開時） */
  restoredWorkerStates?: string[];
  /** 復元された会話履歴のID一覧（再開時） */
  restoredConversationHistories?: string[];
}

/**
 * 実行復元結果
 * @description restoreExecutionメソッドの戻り値
 * @see Requirement 9.3
 */
export interface RestoreExecutionResult {
  /** 操作が成功したか */
  success: boolean;
  /** 実行ID */
  runId: string;
  /** チケットID（成功時） */
  ticketId?: string;
  /** ステータス（成功時） */
  status?: 'running' | 'paused' | 'completed' | 'failed';
  /** ワーカー状態マップ（成功時） */
  workerStates?: Record<string, WorkerState>;
  /** 会話履歴マップ（成功時） */
  conversationHistories?: Record<string, ConversationHistory>;
  /** Gitブランチマップ（成功時） */
  gitBranches?: Record<string, string>;
  /** 最終更新日時（成功時） */
  lastUpdated?: string;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

// =============================================================================
// StateManager クラス
// =============================================================================

/**
 * StateManager - 状態永続化マネージャー
 *
 * 実行状態の保存・読み込み・クリーンアップを担当する。
 * システム再起動後も前回の作業状態を復元可能にする。
 *
 * @see Requirement 14.1: THE System SHALL persist execution state to `runtime/state/`
 * @see Requirement 14.2: THE state SHALL include: active tasks, worker assignments, conversation histories, git branches
 * @see Requirement 14.3: WHEN System restarts, THE Manager_Agent SHALL restore previous state
 * @see Requirement 14.4: THE System SHALL retain execution history for configurable period (default: 7 days)
 */
export class StateManager {
  /**
   * ベースディレクトリパス
   * @description テスト時にカスタムパスを指定可能
   */
  private readonly baseDir: string;

  /**
   * コンストラクタ
   * @param baseDir - ベースディレクトリパス（デフォルト: 'runtime/state'）
   */
  constructor(baseDir: string = STATE_BASE_DIR) {
    this.baseDir = baseDir;
  }

  // ===========================================================================
  // ディレクトリ管理
  // ===========================================================================

  /**
   * 実行状態保存ディレクトリのパスを取得
   * @returns 実行状態保存ディレクトリのパス
   */
  private get runsDir(): string {
    return path.join(this.baseDir, 'runs');
  }

  /**
   * システム設定ファイルのパスを取得
   * @returns システム設定ファイルのパス
   */
  private get configFile(): string {
    return path.join(this.baseDir, 'config.json');
  }

  /**
   * 必要なディレクトリを作成
   * @description 状態保存に必要なディレクトリが存在しない場合は作成する
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
  }

  // ===========================================================================
  // 状態保存・読み込み
  // ===========================================================================

  /**
   * 実行状態を保存
   *
   * @param runId - 実行ID
   * @param state - 保存する実行状態
   * @throws ファイル書き込みエラー
   *
   * @see Requirement 14.1: THE System SHALL persist execution state to `runtime/state/`
   * @see Requirement 14.2: THE state SHALL include: active tasks, worker assignments, conversation histories, git branches
   */
  async saveState(runId: RunId, state: ExecutionState): Promise<void> {
    // ディレクトリが存在することを確認
    await this.ensureDirectories();

    // 状態ファイルのパスを生成
    const statePath = path.join(this.runsDir, `${runId}.json`);

    // 状態をJSON形式で保存
    // Record型はそのままシリアライズ可能
    const stateJson = JSON.stringify(state, null, 2);
    await fs.writeFile(statePath, stateJson, 'utf-8');
  }

  /**
   * 実行状態を読み込み
   *
   * @param runId - 実行ID
   * @returns 実行状態（存在しない場合はnull）
   * @throws JSONパースエラー
   *
   * @see Requirement 14.3: WHEN System restarts, THE Manager_Agent SHALL restore previous state
   */
  async loadState(runId: RunId): Promise<ExecutionState | null> {
    const statePath = path.join(this.runsDir, `${runId}.json`);

    try {
      // ファイルを読み込み
      const stateJson = await fs.readFile(statePath, 'utf-8');

      // JSONをパースして返却
      // Record型はそのままデシリアライズ可能
      const state = JSON.parse(stateJson) as ExecutionState;
      return state;
    } catch (error) {
      // ファイルが存在しない場合はnullを返す
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      // その他のエラーは再スロー
      throw error;
    }
  }

  // ===========================================================================
  // 履歴管理
  // ===========================================================================

  /**
   * 実行履歴一覧を取得
   *
   * @param filter - フィルター条件（オプション）
   * @returns 実行情報の配列
   *
   * @see Requirement 14.4: THE System SHALL retain execution history for configurable period
   */
  async listRuns(filter?: RunFilter): Promise<RunInfo[]> {
    // ディレクトリが存在することを確認
    await this.ensureDirectories();

    try {
      // 実行状態ファイル一覧を取得
      const files = await fs.readdir(this.runsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      // 各ファイルから実行情報を抽出
      const runInfos: RunInfo[] = [];

      for (const file of jsonFiles) {
        const runId = file.replace('.json', '');
        const state = await this.loadState(runId);

        if (state) {
          // フィルター条件に合致するかチェック
          if (this.matchesFilter(state, filter)) {
            runInfos.push({
              runId: state.runId,
              taskId: state.taskId,
              status: state.status,
              lastUpdated: state.lastUpdated,
              artifactCount: state.artifacts.length,
            });
          }
        }
      }

      // 最終更新日時の降順でソート
      runInfos.sort((a, b) => {
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      });

      return runInfos;
    } catch (error) {
      // ディレクトリが存在しない場合は空配列を返す
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * 古い実行履歴をクリーンアップ
   *
   * @param retentionDays - 保持日数（デフォルト: 7日）
   * @returns 削除された実行IDの配列
   *
   * @see Requirement 14.4: THE System SHALL retain execution history for configurable period (default: 7 days)
   */
  async cleanupOldRuns(retentionDays: number = 7): Promise<string[]> {
    // ディレクトリが存在することを確認
    await this.ensureDirectories();

    // 保持期限を計算
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deletedRunIds: string[] = [];

    try {
      // 実行状態ファイル一覧を取得
      const files = await fs.readdir(this.runsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const runId = file.replace('.json', '');
        const state = await this.loadState(runId);

        if (state) {
          const lastUpdated = new Date(state.lastUpdated);

          // 保持期限を過ぎている場合は削除
          if (lastUpdated < cutoffDate) {
            const statePath = path.join(this.runsDir, file);
            await fs.unlink(statePath);
            deletedRunIds.push(runId);
          }
        }
      }
    } catch (error) {
      // ディレクトリが存在しない場合は何もしない
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
    }

    return deletedRunIds;
  }

  // ===========================================================================
  // 設定管理
  // ===========================================================================

  /**
   * システム設定を保存
   *
   * @param config - 保存するシステム設定
   * @throws ファイル書き込みエラー
   */
  async saveConfig(config: SystemConfig): Promise<void> {
    // ベースディレクトリが存在することを確認
    await fs.mkdir(this.baseDir, { recursive: true });

    // 設定をJSON形式で保存
    const configJson = JSON.stringify(config, null, 2);
    await fs.writeFile(this.configFile, configJson, 'utf-8');
  }

  /**
   * システム設定を読み込み
   *
   * @returns システム設定（存在しない場合はデフォルト値）
   */
  async loadConfig(): Promise<SystemConfig> {
    try {
      // ファイルを読み込み
      const configJson = await fs.readFile(this.configFile, 'utf-8');

      // JSONをパース
      const config = JSON.parse(configJson) as SystemConfig;

      // デフォルト値とマージして返却（新しいフィールドが追加された場合に対応）
      return { ...DEFAULT_SYSTEM_CONFIG, ...config };
    } catch (error) {
      // ファイルが存在しない場合はデフォルト値を返す
      if (this.isFileNotFoundError(error)) {
        return { ...DEFAULT_SYSTEM_CONFIG };
      }
      // その他のエラーは再スロー
      throw error;
    }
  }

  // ===========================================================================
  // ユーティリティメソッド
  // ===========================================================================

  /**
   * ファイルが存在しないエラーかどうかを判定
   *
   * @param error - エラーオブジェクト
   * @returns ファイルが存在しないエラーの場合はtrue
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }

  /**
   * 実行状態がフィルター条件に合致するかチェック
   *
   * @param state - 実行状態
   * @param filter - フィルター条件
   * @returns 合致する場合はtrue
   */
  private matchesFilter(state: ExecutionState, filter?: RunFilter): boolean {
    if (!filter) {
      return true;
    }

    // ステータスフィルター
    if (filter.status && state.status !== filter.status) {
      return false;
    }

    // タスクIDフィルター
    if (filter.taskId && state.taskId !== filter.taskId) {
      return false;
    }

    // 開始日時フィルター
    if (filter.since) {
      const sinceDate = new Date(filter.since);
      const lastUpdated = new Date(state.lastUpdated);
      if (lastUpdated < sinceDate) {
        return false;
      }
    }

    // 終了日時フィルター
    if (filter.until) {
      const untilDate = new Date(filter.until);
      const lastUpdated = new Date(state.lastUpdated);
      if (lastUpdated > untilDate) {
        return false;
      }
    }

    return true;
  }

  /**
   * 実行状態が存在するかチェック
   *
   * @param runId - 実行ID
   * @returns 存在する場合はtrue
   */
  async exists(runId: RunId): Promise<boolean> {
    const statePath = path.join(this.runsDir, `${runId}.json`);

    try {
      await fs.access(statePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 実行状態を削除
   *
   * @param runId - 実行ID
   * @returns 削除に成功した場合はtrue
   */
  async deleteState(runId: RunId): Promise<boolean> {
    const statePath = path.join(this.runsDir, `${runId}.json`);

    try {
      await fs.unlink(statePath);
      return true;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  // ===========================================================================
  // 実行永続化（Task 12.1）
  // @see Requirement 9.2: THE System SHALL persist execution state to `runtime/state/runs/<run-id>/state.json`
  // ===========================================================================

  /**
   * 実行永続化ディレクトリのパスを取得
   * @param runId - 実行ID
   * @returns 実行永続化ディレクトリのパス
   */
  private getExecutionDir(runId: RunId): string {
    return path.join(this.baseDir, 'runs', runId);
  }

  /**
   * 実行永続化データを保存
   *
   * ワーカー状態、会話履歴、Gitブランチ情報を含む完全な実行状態を永続化する。
   *
   * @param data - 実行永続化データ
   * @throws ファイル書き込みエラー
   *
   * @see Requirement 9.2: THE System SHALL persist execution state to `runtime/state/runs/<run-id>/state.json`
   */
  async saveExecutionData(data: ExecutionPersistenceData): Promise<void> {
    const execDir = this.getExecutionDir(data.runId);
    await fs.mkdir(execDir, { recursive: true });

    const statePath = path.join(execDir, 'state.json');
    const stateJson = JSON.stringify(data, null, 2);
    await fs.writeFile(statePath, stateJson, 'utf-8');
  }

  /**
   * 実行永続化データを読み込み
   *
   * @param runId - 実行ID
   * @returns 実行永続化データ（存在しない場合はnull）
   *
   * @see Requirement 9.3: WHEN system restarts, THE System SHALL restore in-progress tickets
   */
  async loadExecutionData(runId: RunId): Promise<ExecutionPersistenceData | null> {
    const statePath = path.join(this.getExecutionDir(runId), 'state.json');

    try {
      const stateJson = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(stateJson) as ExecutionPersistenceData;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * ワーカー状態を更新
   *
   * @param runId - 実行ID
   * @param workerId - ワーカーID
   * @param state - ワーカー状態
   *
   * @see Requirement 9.2
   */
  async updateWorkerState(runId: RunId, workerId: string, state: WorkerState): Promise<void> {
    const data = await this.loadExecutionData(runId);
    if (!data) {
      throw new Error(`実行データが見つかりません: ${runId}`);
    }

    data.workerStates[workerId] = state;
    data.lastUpdated = new Date().toISOString();
    await this.saveExecutionData(data);
  }

  /**
   * 会話履歴を更新
   *
   * @param runId - 実行ID
   * @param agentId - エージェントID
   * @param history - 会話履歴
   *
   * @see Requirement 9.5: WHEN a ticket is paused, THE System SHALL preserve all worker state and conversation history
   */
  async updateConversationHistory(
    runId: RunId,
    agentId: string,
    history: ConversationHistory
  ): Promise<void> {
    const data = await this.loadExecutionData(runId);
    if (!data) {
      throw new Error(`実行データが見つかりません: ${runId}`);
    }

    data.conversationHistories[agentId] = history;
    data.lastUpdated = new Date().toISOString();
    await this.saveExecutionData(data);
  }

  // ===========================================================================
  // 一時停止・再開機能（Task 12.2）
  // @see Requirements: 9.4, 9.5
  // ===========================================================================

  /**
   * チケット実行を一時停止
   *
   * 実行状態を'paused'に変更し、全てのワーカー状態と会話履歴を保存する。
   *
   * @param runId - 実行ID
   * @returns 一時停止結果
   *
   * @see Requirement 9.4: THE System SHALL support manual pause and resume of ticket execution
   * @see Requirement 9.5: WHEN a ticket is paused, THE System SHALL preserve all worker state and conversation history
   */
  async pauseExecution(runId: RunId): Promise<PauseResumeResult> {
    const data = await this.loadExecutionData(runId);
    if (!data) {
      return {
        success: false,
        runId,
        previousStatus: 'running',
        newStatus: 'running',
        error: `実行データが見つかりません: ${runId}`,
      };
    }

    // 既に一時停止中の場合
    if (data.status === 'paused') {
      return {
        success: true,
        runId,
        previousStatus: 'paused',
        newStatus: 'paused',
        message: '既に一時停止中です',
      };
    }

    // 完了または失敗の場合は一時停止不可
    if (data.status === 'completed' || data.status === 'failed') {
      return {
        success: false,
        runId,
        previousStatus: data.status,
        newStatus: data.status,
        error: `${data.status}状態の実行は一時停止できません`,
      };
    }

    const previousStatus = data.status;
    data.status = 'paused';
    data.lastUpdated = new Date().toISOString();

    await this.saveExecutionData(data);

    return {
      success: true,
      runId,
      previousStatus,
      newStatus: 'paused',
      message: '実行を一時停止しました',
    };
  }

  /**
   * チケット実行を再開
   *
   * 一時停止中の実行を再開し、保存されたワーカー状態と会話履歴を復元する。
   *
   * @param runId - 実行ID
   * @returns 再開結果
   *
   * @see Requirement 9.4: THE System SHALL support manual pause and resume of ticket execution
   */
  async resumeExecution(runId: RunId): Promise<PauseResumeResult> {
    const data = await this.loadExecutionData(runId);
    if (!data) {
      return {
        success: false,
        runId,
        previousStatus: 'paused',
        newStatus: 'paused',
        error: `実行データが見つかりません: ${runId}`,
      };
    }

    // 一時停止中でない場合
    if (data.status !== 'paused') {
      return {
        success: false,
        runId,
        previousStatus: data.status,
        newStatus: data.status,
        error: `一時停止中でない実行は再開できません（現在のステータス: ${data.status}）`,
      };
    }

    const previousStatus = data.status;
    data.status = 'running';
    data.lastUpdated = new Date().toISOString();

    await this.saveExecutionData(data);

    return {
      success: true,
      runId,
      previousStatus,
      newStatus: 'running',
      message: '実行を再開しました',
      restoredWorkerStates: Object.keys(data.workerStates),
      restoredConversationHistories: Object.keys(data.conversationHistories),
    };
  }

  // ===========================================================================
  // システム再起動時の復旧（Task 12.3）
  // @see Requirement 9.3
  // ===========================================================================

  /**
   * 進行中のチケットを検出
   *
   * システム再起動時に、'running'または'paused'状態のチケットを検出する。
   *
   * @returns 進行中の実行データ一覧
   *
   * @see Requirement 9.3: WHEN system restarts, THE System SHALL restore in-progress tickets and continue execution
   */
  async findInProgressExecutions(): Promise<ExecutionPersistenceData[]> {
    const runsDir = path.join(this.baseDir, 'runs');
    const inProgressExecutions: ExecutionPersistenceData[] = [];

    try {
      const entries = await fs.readdir(runsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const runId = entry.name;
          const data = await this.loadExecutionData(runId);

          if (data && (data.status === 'running' || data.status === 'paused')) {
            inProgressExecutions.push(data);
          }
        }
      }
    } catch (error) {
      // ディレクトリが存在しない場合は空配列を返す
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    // 最終更新日時の降順でソート
    inProgressExecutions.sort((a, b) => {
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });

    return inProgressExecutions;
  }

  /**
   * 実行状態を復元
   *
   * 保存された実行データから、ワーカー状態と会話履歴を復元する。
   *
   * @param runId - 実行ID
   * @returns 復元結果
   *
   * @see Requirement 9.3: WHEN system restarts, THE System SHALL restore in-progress tickets and continue execution
   */
  async restoreExecution(runId: RunId): Promise<RestoreExecutionResult> {
    const data = await this.loadExecutionData(runId);
    if (!data) {
      return {
        success: false,
        runId,
        error: `実行データが見つかりません: ${runId}`,
      };
    }

    // 完了または失敗の場合は復元不要
    if (data.status === 'completed' || data.status === 'failed') {
      return {
        success: false,
        runId,
        error: `${data.status}状態の実行は復元できません`,
      };
    }

    return {
      success: true,
      runId,
      ticketId: data.ticketId,
      status: data.status,
      workerStates: data.workerStates,
      conversationHistories: data.conversationHistories,
      gitBranches: data.gitBranches,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * 実行永続化データを初期化
   *
   * 新しい実行を開始する際に、空の永続化データを作成する。
   *
   * @param runId - 実行ID
   * @param ticketId - チケットID
   * @returns 作成された実行永続化データ
   */
  async initializeExecutionData(runId: RunId, ticketId: string): Promise<ExecutionPersistenceData> {
    const data: ExecutionPersistenceData = {
      runId,
      ticketId,
      status: 'running',
      workerStates: {},
      conversationHistories: {},
      gitBranches: {},
      lastUpdated: new Date().toISOString(),
    };

    await this.saveExecutionData(data);
    return data;
  }

  /**
   * 実行ステータスを更新
   *
   * @param runId - 実行ID
   * @param status - 新しいステータス
   */
  async updateExecutionStatus(
    runId: RunId,
    status: 'running' | 'paused' | 'completed' | 'failed'
  ): Promise<void> {
    const data = await this.loadExecutionData(runId);
    if (!data) {
      throw new Error(`実行データが見つかりません: ${runId}`);
    }

    data.status = status;
    data.lastUpdated = new Date().toISOString();
    await this.saveExecutionData(data);
  }

  /**
   * Gitブランチ情報を更新
   *
   * @param runId - 実行ID
   * @param agentId - エージェントID
   * @param branchName - ブランチ名
   */
  async updateGitBranch(runId: RunId, agentId: string, branchName: string): Promise<void> {
    const data = await this.loadExecutionData(runId);
    if (!data) {
      throw new Error(`実行データが見つかりません: ${runId}`);
    }

    data.gitBranches[agentId] = branchName;
    data.lastUpdated = new Date().toISOString();
    await this.saveExecutionData(data);
  }
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのStateManagerインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const stateManager = new StateManager();
