/**
 * 社員ステータストラッカー
 *
 * 各社員のリアルタイムステータスを追跡・永続化する。
 * ワークフロー実行中のフェーズ変化に応じてステータスを自動更新し、
 * 1日のタイムラインを記録する。
 *
 * @module execution/employee-status-tracker
 * @see Requirements: 2.1, 2.2, 2.3, 2.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  EmployeeStatus,
  EmployeeStatusType,
  EmployeeTimeline,
  EmployeeTimelineEntry,
  EmployeeStatusPersistence,
} from './types.js';

// =============================================================================
// 定数
// =============================================================================

/** ステータスデータ保存ディレクトリ */
const DEFAULT_STATUS_DIR = 'runtime/state/employee-status';

// =============================================================================
// EmployeeStatusTracker
// =============================================================================

/**
 * 社員ステータストラッカー
 *
 * 社員のリアルタイムステータスを管理し、ファイルベースで永続化する。
 * 各社員のステータス変化をタイムラインとして記録する。
 *
 * @see Requirement 2.1: リアルタイムステータス追跡
 * @see Requirement 2.3: ステータス変化の永続化
 */
export class EmployeeStatusTracker {
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス（デフォルト: runtime/state/employee-status）
   */
  constructor(basePath: string = DEFAULT_STATUS_DIR) {
    this.basePath = basePath;
  }

  /**
   * 社員ステータスを更新し永続化する
   *
   * @param agentId - エージェントID
   * @param status - 新しいステータス
   * @param task - 現在のタスク情報（オプション）
   * @see Requirement 2.1, 2.3
   */
  async updateStatus(
    agentId: string,
    status: EmployeeStatusType,
    task?: { id: string; title: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    const today = now.slice(0, 10); // YYYY-MM-DD
    const data = await this.loadData(agentId);

    // タイムラインが別の日のデータなら初期化
    const existingDate = data.timeline.length > 0
      ? data.timeline[0]?.timestamp?.slice(0, 10)
      : null;
    if (existingDate && existingDate !== today) {
      data.timeline = [];
    }

    // 前回のエントリに継続時間を記録
    if (data.timeline.length > 0) {
      const lastEntry = data.timeline[data.timeline.length - 1];
      if (lastEntry && !lastEntry.duration) {
        const lastTime = new Date(lastEntry.timestamp).getTime();
        lastEntry.duration = new Date(now).getTime() - lastTime;
      }
    }

    // 新しいタイムラインエントリを追加
    data.timeline.push({
      status,
      timestamp: now,
    });

    // ステータスを更新
    data.agentId = agentId;
    data.status = status;
    data.currentTask = task;
    data.lastChanged = now;

    await this.saveData(agentId, data);
  }

  /**
   * 特定社員の現在ステータスを取得する
   *
   * @param agentId - エージェントID
   * @returns 社員ステータス（データがない場合はnull）
   * @see Requirement 2.1
   */
  async getStatus(agentId: string): Promise<EmployeeStatus | null> {
    const data = await this.loadData(agentId);
    if (!data.agentId) {
      return null;
    }
    return {
      agentId: data.agentId,
      status: data.status,
      currentTask: data.currentTask,
      lastChanged: data.lastChanged,
    };
  }

  /**
   * 全社員のステータス一覧を取得する
   *
   * @returns 全社員のステータス配列
   * @see Requirement 2.2
   */
  async getAllStatuses(): Promise<EmployeeStatus[]> {
    const agentIds = await this.listAgentIds();
    const statuses: EmployeeStatus[] = [];

    for (const agentId of agentIds) {
      const status = await this.getStatus(agentId);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * 特定社員の1日のステータス変化タイムラインを取得する
   *
   * @param agentId - エージェントID
   * @param date - 対象日（YYYY-MM-DD形式）
   * @returns タイムラインデータ
   * @see Requirement 2.4
   */
  async getTimeline(agentId: string, date: string): Promise<EmployeeTimeline> {
    const data = await this.loadData(agentId);

    // 指定日のエントリのみフィルタ
    const entries: EmployeeTimelineEntry[] = data.timeline.filter(
      (entry) => entry.timestamp.slice(0, 10) === date
    );

    return {
      agentId,
      date,
      entries,
    };
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * エージェントのステータスデータをファイルから読み込む
   */
  private async loadData(agentId: string): Promise<EmployeeStatusPersistence> {
    try {
      const filePath = path.join(this.basePath, `${agentId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as EmployeeStatusPersistence;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        // デフォルトデータを返す
        return {
          agentId: '',
          status: 'offline',
          lastChanged: new Date().toISOString(),
          timeline: [],
        };
      }
      throw error;
    }
  }

  /**
   * エージェントのステータスデータをファイルに保存する
   */
  private async saveData(
    agentId: string,
    data: EmployeeStatusPersistence
  ): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${agentId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 保存済みエージェントID一覧を取得する
   */
  private async listAgentIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.basePath);
      return entries
        .filter((e) => e.endsWith('.json'))
        .map((e) => e.replace('.json', ''));
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /** ファイル未存在エラー判定 */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
