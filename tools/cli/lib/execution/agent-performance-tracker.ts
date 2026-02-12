/**
 * エージェントパフォーマンストラッカー
 *
 * エージェントの実行履歴を蓄積し、パフォーマンスプロファイルを生成する。
 * 成功率、平均品質スコア、得意/不得意領域を追跡し、
 * エージェントの成長・劣化を検出する。
 *
 * @module execution/agent-performance-tracker
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** タスク種別 */
export type TaskCategory = 'coding' | 'review' | 'test' | 'documentation' | 'other';

/** パフォーマンスレコード（1回の実行記録） */
export interface PerformanceRecord {
  /** エージェントID */
  agentId: string;
  /** タスクID */
  taskId: string;
  /** タスク種別 */
  taskCategory: TaskCategory;
  /** 成功フラグ */
  success: boolean;
  /** 品質スコア（0-100） */
  qualityScore: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** 記録日時（ISO8601） */
  timestamp: string;
  /** エラーパターン（失敗時） */
  errorPatterns?: string[];
}

/** パフォーマンスプロファイル（エージェントの総合評価） */
export interface PerformanceProfile {
  /** エージェントID */
  agentId: string;
  /** 総タスク数 */
  totalTasks: number;
  /** 成功率（0-1） */
  successRate: number;
  /** 平均品質スコア（0-100） */
  averageQuality: number;
  /** 得意なタスク種別 */
  strengths: TaskCategory[];
  /** 苦手なタスク種別 */
  weaknesses: TaskCategory[];
  /** 最近のトレンド */
  recentTrend: 'improving' | 'stable' | 'declining';
  /** 最終更新日時 */
  lastUpdated: string;
}

/** カテゴリ別統計 */
interface CategoryStats {
  total: number;
  successes: number;
  avgQuality: number;
}

// =============================================================================
// 定数
// =============================================================================

/** パフォーマンスデータ保存ディレクトリ */
const PERFORMANCE_DIR = 'runtime/state/performance';

/** トレンド判定に使う直近レコード数 */
const TREND_WINDOW_SIZE = 10;

/** 得意/苦手判定の成功率閾値 */
const STRENGTH_THRESHOLD = 0.8;
const WEAKNESS_THRESHOLD = 0.5;

/** カテゴリ別統計に必要な最小レコード数 */
const MIN_RECORDS_FOR_CATEGORY = 3;

// =============================================================================
// パフォーマンストラッカー
// =============================================================================

/**
 * エージェントパフォーマンストラッカー
 *
 * エージェントごとの実行履歴を蓄積し、パフォーマンスプロファイルを生成する。
 */
export class AgentPerformanceTracker {
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス（デフォルト: runtime/state/performance）
   */
  constructor(basePath: string = PERFORMANCE_DIR) {
    this.basePath = basePath;
  }

  /**
   * パフォーマンスレコードを記録する
   *
   * @param record - 記録するレコード
   */
  async recordPerformance(record: PerformanceRecord): Promise<void> {
    const records = await this.loadRecords(record.agentId);
    records.push(record);
    await this.saveRecords(record.agentId, records);
  }

  /**
   * エージェントのパフォーマンスプロファイルを生成する
   *
   * @param agentId - エージェントID
   * @returns パフォーマンスプロファイル（レコードがない場合はnull）
   */
  async getProfile(agentId: string): Promise<PerformanceProfile | null> {
    const records = await this.loadRecords(agentId);
    if (records.length === 0) {
      return null;
    }

    const totalTasks = records.length;
    const successes = records.filter((r) => r.success).length;
    const successRate = successes / totalTasks;
    const avgQuality =
      records.reduce((sum, r) => sum + r.qualityScore, 0) / totalTasks;

    // カテゴリ別統計
    const categoryStats = this.computeCategoryStats(records);
    const strengths = this.detectStrengths(categoryStats);
    const weaknesses = this.detectWeaknesses(categoryStats);

    // トレンド判定
    const recentTrend = this.computeTrend(records);

    return {
      agentId,
      totalTasks,
      successRate,
      averageQuality: Math.round(avgQuality * 10) / 10,
      strengths,
      weaknesses,
      recentTrend,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 全エージェントのプロファイル一覧を取得する
   *
   * @returns プロファイル配列
   */
  async getAllProfiles(): Promise<PerformanceProfile[]> {
    const agentIds = await this.listAgentIds();
    const profiles: PerformanceProfile[] = [];

    for (const agentId of agentIds) {
      const profile = await this.getProfile(agentId);
      if (profile) {
        profiles.push(profile);
      }
    }

    return profiles;
  }

  /**
   * エージェントの実行履歴を取得する
   *
   * @param agentId - エージェントID
   * @returns レコード配列
   */
  async getRecords(agentId: string): Promise<PerformanceRecord[]> {
    return this.loadRecords(agentId);
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * カテゴリ別統計を計算する
   */
  private computeCategoryStats(
    records: PerformanceRecord[]
  ): Map<TaskCategory, CategoryStats> {
    const stats = new Map<TaskCategory, CategoryStats>();

    for (const record of records) {
      const existing = stats.get(record.taskCategory) ?? {
        total: 0,
        successes: 0,
        avgQuality: 0,
      };
      existing.total++;
      if (record.success) existing.successes++;
      // 移動平均で品質スコアを更新
      existing.avgQuality =
        (existing.avgQuality * (existing.total - 1) + record.qualityScore) /
        existing.total;
      stats.set(record.taskCategory, existing);
    }

    return stats;
  }

  /**
   * 得意なカテゴリを検出する
   */
  private detectStrengths(
    stats: Map<TaskCategory, CategoryStats>
  ): TaskCategory[] {
    const strengths: TaskCategory[] = [];
    for (const [category, stat] of stats) {
      if (
        stat.total >= MIN_RECORDS_FOR_CATEGORY &&
        stat.successes / stat.total >= STRENGTH_THRESHOLD
      ) {
        strengths.push(category);
      }
    }
    return strengths;
  }

  /**
   * 苦手なカテゴリを検出する
   */
  private detectWeaknesses(
    stats: Map<TaskCategory, CategoryStats>
  ): TaskCategory[] {
    const weaknesses: TaskCategory[] = [];
    for (const [category, stat] of stats) {
      if (
        stat.total >= MIN_RECORDS_FOR_CATEGORY &&
        stat.successes / stat.total < WEAKNESS_THRESHOLD
      ) {
        weaknesses.push(category);
      }
    }
    return weaknesses;
  }

  /**
   * 直近のトレンドを判定する
   */
  private computeTrend(
    records: PerformanceRecord[]
  ): 'improving' | 'stable' | 'declining' {
    if (records.length < TREND_WINDOW_SIZE * 2) {
      return 'stable';
    }

    // 直近 TREND_WINDOW_SIZE 件と、その前の TREND_WINDOW_SIZE 件を比較
    const recent = records.slice(-TREND_WINDOW_SIZE);
    const previous = records.slice(
      -TREND_WINDOW_SIZE * 2,
      -TREND_WINDOW_SIZE
    );

    const recentAvg =
      recent.reduce((s, r) => s + r.qualityScore, 0) / recent.length;
    const previousAvg =
      previous.reduce((s, r) => s + r.qualityScore, 0) / previous.length;

    const diff = recentAvg - previousAvg;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  /**
   * エージェントのレコードをファイルから読み込む
   */
  private async loadRecords(agentId: string): Promise<PerformanceRecord[]> {
    try {
      const filePath = path.join(this.basePath, `${agentId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as PerformanceRecord[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * エージェントのレコードをファイルに保存する
   */
  private async saveRecords(
    agentId: string,
    records: PerformanceRecord[]
  ): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${agentId}.json`);
    await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
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
