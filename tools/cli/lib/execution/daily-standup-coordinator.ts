/**
 * デイリースタンドアップコーディネーター
 *
 * 毎朝の朝会（スタンドアップミーティング）を自動的に開催し、
 * 各社員の「前日の成果」「本日の予定」「課題」を集約する。
 * MeetingCoordinatorを使用して会議を実施し、結果を永続化する。
 *
 * @module execution/daily-standup-coordinator
 * @see Requirements: 3.1, 3.2, 3.3, 3.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MeetingMinutes } from './types.js';
import type { IMeetingCoordinator } from './meeting-coordinator.js';
import type { AgentPerformanceTracker, PerformanceRecord } from './agent-performance-tracker.js';

// =============================================================================
// 型定義
// =============================================================================

/** スタンドアップエントリ（1社員分の報告） */
export interface StandupEntry {
  /** エージェントID */
  agentId: string;
  /** 前日の成果 */
  accomplished: string[];
  /** 本日の予定 */
  planned: string[];
  /** 課題・ブロッカー */
  blockers: string[];
}

/** スタンドアップ結果 */
export interface StandupResult {
  /** 実施日（YYYY-MM-DD形式） */
  date: string;
  /** 各社員のエントリ */
  entries: StandupEntry[];
  /** 会議議事録 */
  meetingMinutes: MeetingMinutes;
  /** 全体サマリー */
  summary: string;
}

/** DailyStandupCoordinatorのコンストラクタオプション */
export interface DailyStandupCoordinatorOptions {
  /** MeetingCoordinatorインスタンス */
  meetingCoordinator: IMeetingCoordinator;
  /** AgentPerformanceTrackerインスタンス */
  performanceTracker: AgentPerformanceTracker;
  /** スタンドアップデータ保存ディレクトリ */
  basePath?: string;
}

// =============================================================================
// 定数
// =============================================================================

/** デフォルトの保存ディレクトリ */
const DEFAULT_STANDUP_DIR = 'runtime/state/standups';

/** ファシリテーターID（COO/PM） */
const FACILITATOR_ID = 'coo_pm';

/** スタンドアップ用ワークフローIDプレフィックス */
const STANDUP_WORKFLOW_PREFIX = 'standup';

/** パフォーマンス履歴の参照日数 */
const LOOKBACK_DAYS = 1;

// =============================================================================
// DailyStandupCoordinator
// =============================================================================

/**
 * デイリースタンドアップコーディネーター
 *
 * MeetingCoordinatorを使用して朝会を開催し、
 * AgentPerformanceTrackerから各社員の実績データを取得して
 * 「前日の成果」「本日の予定」「課題」を自動生成する。
 *
 * @see Requirement 3.1: 朝会の自動開催
 * @see Requirement 3.2: パフォーマンス履歴からの自動生成
 * @see Requirement 3.3: 結果の永続化
 */
export class DailyStandupCoordinator {
  /** MeetingCoordinatorインスタンス */
  private readonly meetingCoordinator: IMeetingCoordinator;
  /** AgentPerformanceTrackerインスタンス */
  private readonly performanceTracker: AgentPerformanceTracker;
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param options - コンストラクタオプション
   */
  constructor(options: DailyStandupCoordinatorOptions) {
    this.meetingCoordinator = options.meetingCoordinator;
    this.performanceTracker = options.performanceTracker;
    this.basePath = options.basePath ?? DEFAULT_STANDUP_DIR;
  }

  /**
   * 朝会を実施する
   *
   * 1. 全社員のパフォーマンス履歴を取得
   * 2. 各社員のスタンドアップエントリを自動生成
   * 3. MeetingCoordinatorで会議を開催
   * 4. 結果を永続化
   *
   * @returns スタンドアップ結果
   * @see Requirement 3.1, 3.2, 3.3, 3.4
   */
  async conductStandup(): Promise<StandupResult> {
    const today = new Date().toISOString().slice(0, 10);
    const workflowId = `${STANDUP_WORKFLOW_PREFIX}-${today}`;

    // 1. 全社員のパフォーマンスプロファイルを取得
    const profiles = await this.performanceTracker.getAllProfiles();

    // 2. 各社員のスタンドアップエントリを生成
    const entries: StandupEntry[] = [];
    for (const profile of profiles) {
      const records = await this.performanceTracker.getRecords(profile.agentId);
      const entry = this.generateStandupEntry(profile.agentId, records, today);
      entries.push(entry);
    }

    // 3. 朝会の指示文を構築
    const instruction = this.buildStandupInstruction(entries, today);

    // 4. MeetingCoordinatorで会議を開催
    const meetingMinutes = await this.meetingCoordinator.conveneMeeting(
      workflowId,
      instruction,
      FACILITATOR_ID
    );

    // 5. サマリーを生成
    const summary = this.generateSummary(entries);

    // 6. 結果を構築
    const result: StandupResult = {
      date: today,
      entries,
      meetingMinutes,
      summary,
    };

    // 7. 永続化
    await this.saveStandup(result);

    return result;
  }

  /**
   * 過去のスタンドアップ結果を取得する
   *
   * @param date - 対象日（YYYY-MM-DD形式）
   * @returns スタンドアップ結果（存在しない場合はnull）
   */
  async getStandup(date: string): Promise<StandupResult | null> {
    try {
      const filePath = path.join(this.basePath, `${date}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as StandupResult;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * スタンドアップ一覧を取得する（日付降順）
   *
   * @param limit - 取得件数上限（デフォルト: 30）
   * @returns スタンドアップ結果の配列
   */
  async listStandups(limit: number = 30): Promise<StandupResult[]> {
    try {
      const files = await fs.readdir(this.basePath);
      const jsonFiles = files
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const results: StandupResult[] = [];
      for (const file of jsonFiles) {
        const filePath = path.join(this.basePath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        results.push(JSON.parse(content) as StandupResult);
      }
      return results;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * パフォーマンス履歴から1社員分のスタンドアップエントリを生成する
   *
   * @param agentId - エージェントID
   * @param records - パフォーマンスレコード一覧
   * @param today - 本日の日付（YYYY-MM-DD形式）
   * @returns スタンドアップエントリ
   */
  private generateStandupEntry(
    agentId: string,
    records: PerformanceRecord[],
    today: string
  ): StandupEntry {
    // 前日のレコードを抽出
    const yesterday = this.getPreviousDate(today);
    const yesterdayRecords = records.filter(
      (r) => r.timestamp.slice(0, 10) === yesterday
    );

    // 前日の成果を生成
    const accomplished = this.extractAccomplishments(yesterdayRecords);

    // 本日の予定を生成（直近の傾向から推定）
    const planned = this.estimatePlannedWork(agentId, records);

    // 課題・ブロッカーを検出
    const blockers = this.detectBlockers(records);

    return {
      agentId,
      accomplished,
      planned,
      blockers,
    };
  }

  /**
   * 前日の成果を抽出する
   */
  private extractAccomplishments(records: PerformanceRecord[]): string[] {
    if (records.length === 0) {
      return ['前日の活動記録なし'];
    }

    const accomplishments: string[] = [];
    const successRecords = records.filter((r) => r.success);
    const failedRecords = records.filter((r) => !r.success);

    if (successRecords.length > 0) {
      accomplishments.push(
        `${successRecords.length}件のタスクを完了（平均品質: ${this.avgQuality(successRecords).toFixed(1)}）`
      );
      // カテゴリ別の内訳
      const categories = this.groupByCategory(successRecords);
      for (const [category, count] of categories) {
        accomplishments.push(`  - ${category}: ${count}件完了`);
      }
    }

    if (failedRecords.length > 0) {
      accomplishments.push(`${failedRecords.length}件のタスクが未完了/失敗`);
    }

    return accomplishments;
  }

  /**
   * 本日の予定を推定する
   */
  private estimatePlannedWork(
    agentId: string,
    records: PerformanceRecord[]
  ): string[] {
    if (records.length === 0) {
      return ['新規タスクの割り当て待ち'];
    }

    const planned: string[] = [];

    // 直近の失敗タスクがあればリトライ予定
    const recentFailed = records
      .filter((r) => !r.success)
      .slice(-3);
    if (recentFailed.length > 0) {
      planned.push(`未完了タスクのリトライ（${recentFailed.length}件）`);
    }

    // 得意カテゴリのタスクを予定
    const categoryStats = this.getCategorySuccessRates(records);
    const strongCategories = Array.from(categoryStats.entries())
      .filter(([_, rate]) => rate >= 0.8)
      .map(([cat]) => cat);

    if (strongCategories.length > 0) {
      planned.push(`得意領域（${strongCategories.join(', ')}）のタスク対応`);
    }

    if (planned.length === 0) {
      planned.push('通常業務の継続');
    }

    return planned;
  }

  /**
   * 課題・ブロッカーを検出する
   */
  private detectBlockers(records: PerformanceRecord[]): string[] {
    const blockers: string[] = [];

    // 直近の連続失敗を検出
    const recentRecords = records.slice(-5);
    const consecutiveFailures = this.countConsecutiveFailures(recentRecords);
    if (consecutiveFailures >= 2) {
      blockers.push(`連続失敗が${consecutiveFailures}件発生中`);
    }

    // エラーパターンの集約
    const errorPatterns = new Set<string>();
    for (const record of recentRecords) {
      if (record.errorPatterns) {
        for (const pattern of record.errorPatterns) {
          errorPatterns.add(pattern);
        }
      }
    }
    if (errorPatterns.size > 0) {
      blockers.push(`検出されたエラーパターン: ${Array.from(errorPatterns).join(', ')}`);
    }

    // 品質低下の検出
    if (records.length >= 10) {
      const recentAvg = this.avgQuality(records.slice(-5));
      const previousAvg = this.avgQuality(records.slice(-10, -5));
      if (recentAvg < previousAvg - 10) {
        blockers.push(`品質スコアが低下傾向（${previousAvg.toFixed(1)} → ${recentAvg.toFixed(1)}）`);
      }
    }

    return blockers;
  }

  /**
   * 朝会の指示文を構築する
   */
  private buildStandupInstruction(
    entries: StandupEntry[],
    date: string
  ): string {
    const lines: string[] = [
      `# デイリースタンドアップ（${date}）`,
      '',
      '各社員の状況報告を確認し、本日の業務計画を策定してください。',
      '',
    ];

    for (const entry of entries) {
      lines.push(`## ${entry.agentId}`);
      lines.push('### 前日の成果');
      for (const item of entry.accomplished) {
        lines.push(`- ${item}`);
      }
      lines.push('### 本日の予定');
      for (const item of entry.planned) {
        lines.push(`- ${item}`);
      }
      if (entry.blockers.length > 0) {
        lines.push('### 課題・ブロッカー');
        for (const item of entry.blockers) {
          lines.push(`- ${item}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 全体サマリーを生成する
   */
  private generateSummary(entries: StandupEntry[]): string {
    const totalEntries = entries.length;
    const withBlockers = entries.filter((e) => e.blockers.length > 0).length;
    const withAccomplishments = entries.filter(
      (e) => e.accomplished.length > 0 && e.accomplished[0] !== '前日の活動記録なし'
    ).length;

    const parts: string[] = [
      `参加者: ${totalEntries}名`,
      `活動報告あり: ${withAccomplishments}名`,
    ];

    if (withBlockers > 0) {
      parts.push(`課題あり: ${withBlockers}名（要対応）`);
    }

    return parts.join(' / ');
  }

  /**
   * スタンドアップ結果を永続化する
   */
  private async saveStandup(result: StandupResult): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${result.date}.json`);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  }

  // ===========================================================================
  // ユーティリティ
  // ===========================================================================

  /** 前日の日付を取得する */
  private getPreviousDate(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() - LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  }

  /** レコードの平均品質スコアを計算する */
  private avgQuality(records: PerformanceRecord[]): number {
    if (records.length === 0) return 0;
    return records.reduce((sum, r) => sum + r.qualityScore, 0) / records.length;
  }

  /** レコードをカテゴリ別にグループ化してカウントする */
  private groupByCategory(records: PerformanceRecord[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const r of records) {
      map.set(r.taskCategory, (map.get(r.taskCategory) ?? 0) + 1);
    }
    return map;
  }

  /** カテゴリ別成功率を計算する */
  private getCategorySuccessRates(
    records: PerformanceRecord[]
  ): Map<string, number> {
    const totals = new Map<string, number>();
    const successes = new Map<string, number>();

    for (const r of records) {
      totals.set(r.taskCategory, (totals.get(r.taskCategory) ?? 0) + 1);
      if (r.success) {
        successes.set(r.taskCategory, (successes.get(r.taskCategory) ?? 0) + 1);
      }
    }

    const rates = new Map<string, number>();
    for (const [cat, total] of totals) {
      rates.set(cat, (successes.get(cat) ?? 0) / total);
    }
    return rates;
  }

  /** 末尾からの連続失敗数をカウントする */
  private countConsecutiveFailures(records: PerformanceRecord[]): number {
    let count = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (!records[i].success) {
        count++;
      } else {
        break;
      }
    }
    return count;
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
