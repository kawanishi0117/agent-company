/**
 * State Manager - 状態永続化と履歴管理
 *
 * エージェント実行エンジンの状態を永続化し、システム再起動後も
 * 前回の作業状態を復元できるようにする。
 *
 * @module execution/state-manager
 * @see Requirements: 14.1, 14.2, 14.3, 14.4, 14.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ExecutionState,
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  RunId,
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
 * 実行状態保存ディレクトリ
 */
const RUNS_DIR = path.join(STATE_BASE_DIR, 'runs');

/**
 * システム設定ファイルパス
 */
const CONFIG_FILE = path.join(STATE_BASE_DIR, 'config.json');

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
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのStateManagerインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const stateManager = new StateManager();
