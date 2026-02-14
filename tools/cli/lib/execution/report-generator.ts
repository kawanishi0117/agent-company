/**
 * レポートジェネレーター
 *
 * 日報・週報を自動生成する。各社員の活動データを集計し、
 * サマリー、前週比較、トップパフォーマー、課題を含むレポートを生成する。
 *
 * @module execution/report-generator
 * @see Requirements: 4.1, 4.2, 4.3, 4.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentPerformanceTracker, PerformanceRecord, PerformanceProfile } from './agent-performance-tracker.js';

// =============================================================================
// 型定義
// =============================================================================

/** 社員の日次活動 */
export interface EmployeeDailyActivity {
  /** エージェントID */
  agentId: string;
  /** 完了タスク数 */
  tasksCompleted: number;
  /** 失敗タスク数 */
  tasksFailed: number;
  /** 平均品質スコア */
  avgQuality: number;
  /** タスクカテゴリ内訳 */
  categories: Record<string, number>;
}

/** 日報 */
export interface DailyReport {
  /** 対象日（YYYY-MM-DD形式） */
  date: string;
  /** 各社員の活動 */
  employees: EmployeeDailyActivity[];
  /** サマリー */
  summary: {
    /** 完了タスク総数 */
    tasksCompleted: number;
    /** 全体平均品質スコア */
    avgQuality: number;
    /** 検出された課題 */
    issues: string[];
  };
}

/** 前週比較項目 */
export interface WeeklyComparison {
  /** メトリクス名 */
  metric: string;
  /** 今週の値 */
  current: number;
  /** 前週の値 */
  previous: number;
  /** トレンド */
  trend: 'up' | 'down' | 'stable';
}

/** 週報 */
export interface WeeklyReport {
  /** 週の開始日（YYYY-MM-DD形式） */
  weekStart: string;
  /** 週の終了日（YYYY-MM-DD形式） */
  weekEnd: string;
  /** サマリー */
  summary: {
    totalTasks: number;
    successRate: number;
    avgQuality: number;
    activeEmployees: number;
  };
  /** 前週比較 */
  comparison: WeeklyComparison[];
  /** トップパフォーマー */
  topPerformers: { agentId: string; score: number }[];
  /** 繰り返し発生している課題 */
  recurringIssues: string[];
}

/** ReportGeneratorのコンストラクタオプション */
export interface ReportGeneratorOptions {
  /** AgentPerformanceTrackerインスタンス */
  performanceTracker: AgentPerformanceTracker;
  /** レポート保存ディレクトリ */
  basePath?: string;
}

// =============================================================================
// 定数
// =============================================================================

/** デフォルトの保存ディレクトリ */
const DEFAULT_REPORTS_DIR = 'runtime/state/reports';

/** 週の日数 */
const DAYS_IN_WEEK = 7;

// =============================================================================
// ReportGenerator
// =============================================================================

/**
 * レポートジェネレーター
 *
 * パフォーマンスデータを集計して日報・週報を自動生成する。
 *
 * @see Requirement 4.1: 日報の自動生成
 * @see Requirement 4.2: 週報の自動生成
 * @see Requirement 4.3: 前週比較
 */
export class ReportGenerator {
  /** AgentPerformanceTrackerインスタンス */
  private readonly performanceTracker: AgentPerformanceTracker;
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param options - コンストラクタオプション
   */
  constructor(options: ReportGeneratorOptions) {
    this.performanceTracker = options.performanceTracker;
    this.basePath = options.basePath ?? DEFAULT_REPORTS_DIR;
  }

  /**
   * 日報を生成する
   *
   * @param date - 対象日（YYYY-MM-DD形式）
   * @returns 日報
   * @see Requirement 4.1
   */
  async generateDailyReport(date: string): Promise<DailyReport> {
    const profiles = await this.performanceTracker.getAllProfiles();
    const employees: EmployeeDailyActivity[] = [];

    for (const profile of profiles) {
      const records = await this.performanceTracker.getRecords(profile.agentId);
      const dayRecords = records.filter(
        (r) => r.timestamp.slice(0, 10) === date
      );

      if (dayRecords.length === 0) continue;

      employees.push(this.buildDailyActivity(profile.agentId, dayRecords));
    }

    // サマリー生成
    const totalCompleted = employees.reduce((s, e) => s + e.tasksCompleted, 0);
    const totalQuality = employees.length > 0
      ? employees.reduce((s, e) => s + e.avgQuality, 0) / employees.length
      : 0;
    const issues = this.detectDailyIssues(employees);

    const report: DailyReport = {
      date,
      employees,
      summary: {
        tasksCompleted: totalCompleted,
        avgQuality: Math.round(totalQuality * 10) / 10,
        issues,
      },
    };

    // 永続化
    await this.saveDailyReport(report);

    return report;
  }

  /**
   * 週報を生成する
   *
   * @param weekStart - 週の開始日（YYYY-MM-DD形式、月曜日）
   * @returns 週報
   * @see Requirement 4.2, 4.3
   */
  async generateWeeklyReport(weekStart: string): Promise<WeeklyReport> {
    const weekEnd = this.addDays(weekStart, DAYS_IN_WEEK - 1);
    const prevWeekStart = this.addDays(weekStart, -DAYS_IN_WEEK);

    // 今週と前週のレコードを収集
    const profiles = await this.performanceTracker.getAllProfiles();
    const currentWeekRecords: PerformanceRecord[] = [];
    const previousWeekRecords: PerformanceRecord[] = [];

    for (const profile of profiles) {
      const records = await this.performanceTracker.getRecords(profile.agentId);
      for (const r of records) {
        const d = r.timestamp.slice(0, 10);
        if (d >= weekStart && d <= weekEnd) {
          currentWeekRecords.push(r);
        } else if (d >= prevWeekStart && d < weekStart) {
          previousWeekRecords.push(r);
        }
      }
    }

    // 今週のサマリー
    const totalTasks = currentWeekRecords.length;
    const successCount = currentWeekRecords.filter((r) => r.success).length;
    const successRate = totalTasks > 0 ? successCount / totalTasks : 0;
    const avgQuality = totalTasks > 0
      ? currentWeekRecords.reduce((s, r) => s + r.qualityScore, 0) / totalTasks
      : 0;
    const activeAgents = new Set(currentWeekRecords.map((r) => r.agentId));

    // 前週比較
    const comparison = this.buildComparison(currentWeekRecords, previousWeekRecords);

    // トップパフォーマー
    const topPerformers = this.calculateTopPerformers(currentWeekRecords);

    // 繰り返し課題
    const recurringIssues = this.detectRecurringIssues(currentWeekRecords);

    const report: WeeklyReport = {
      weekStart,
      weekEnd,
      summary: {
        totalTasks,
        successRate: Math.round(successRate * 1000) / 1000,
        avgQuality: Math.round(avgQuality * 10) / 10,
        activeEmployees: activeAgents.size,
      },
      comparison,
      topPerformers,
      recurringIssues,
    };

    // 永続化
    await this.saveWeeklyReport(report);

    return report;
  }

  /**
   * 日報を取得する
   *
   * @param date - 対象日（YYYY-MM-DD形式）
   * @returns 日報（存在しない場合はnull）
   */
  async getDailyReport(date: string): Promise<DailyReport | null> {
    return this.loadJson<DailyReport>(
      path.join(this.basePath, 'daily', `${date}.json`)
    );
  }

  /**
   * 週報を取得する
   *
   * @param weekStart - 週の開始日（YYYY-MM-DD形式）
   * @returns 週報（存在しない場合はnull）
   */
  async getWeeklyReport(weekStart: string): Promise<WeeklyReport | null> {
    return this.loadJson<WeeklyReport>(
      path.join(this.basePath, 'weekly', `${weekStart}.json`)
    );
  }

  /**
   * 日報一覧を取得する（日付降順）
   *
   * @param limit - 取得件数上限
   * @returns 日報の配列
   */
  async listDailyReports(limit: number = 30): Promise<DailyReport[]> {
    return this.listReports<DailyReport>(
      path.join(this.basePath, 'daily'),
      limit
    );
  }

  /**
   * 週報一覧を取得する（日付降順）
   *
   * @param limit - 取得件数上限
   * @returns 週報の配列
   */
  async listWeeklyReports(limit: number = 12): Promise<WeeklyReport[]> {
    return this.listReports<WeeklyReport>(
      path.join(this.basePath, 'weekly'),
      limit
    );
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /** 1社員の日次活動を構築する */
  private buildDailyActivity(
    agentId: string,
    records: PerformanceRecord[]
  ): EmployeeDailyActivity {
    const completed = records.filter((r) => r.success).length;
    const failed = records.filter((r) => !r.success).length;
    const avg = records.reduce((s, r) => s + r.qualityScore, 0) / records.length;

    const categories: Record<string, number> = {};
    for (const r of records) {
      categories[r.taskCategory] = (categories[r.taskCategory] ?? 0) + 1;
    }

    return {
      agentId,
      tasksCompleted: completed,
      tasksFailed: failed,
      avgQuality: Math.round(avg * 10) / 10,
      categories,
    };
  }

  /** 日次の課題を検出する */
  private detectDailyIssues(employees: EmployeeDailyActivity[]): string[] {
    const issues: string[] = [];

    for (const emp of employees) {
      if (emp.avgQuality < 50) {
        issues.push(`${emp.agentId}: 品質スコアが低い（${emp.avgQuality}）`);
      }
      if (emp.tasksFailed > emp.tasksCompleted) {
        issues.push(`${emp.agentId}: 失敗タスクが完了タスクを上回っている`);
      }
    }

    return issues;
  }

  /** 前週比較を構築する */
  private buildComparison(
    current: PerformanceRecord[],
    previous: PerformanceRecord[]
  ): WeeklyComparison[] {
    const curTotal = current.length;
    const prevTotal = previous.length;
    const curSuccess = current.filter((r) => r.success).length;
    const prevSuccess = previous.filter((r) => r.success).length;
    const curAvgQ = curTotal > 0
      ? current.reduce((s, r) => s + r.qualityScore, 0) / curTotal
      : 0;
    const prevAvgQ = prevTotal > 0
      ? previous.reduce((s, r) => s + r.qualityScore, 0) / prevTotal
      : 0;

    return [
      {
        metric: 'タスク総数',
        current: curTotal,
        previous: prevTotal,
        trend: this.getTrend(curTotal, prevTotal),
      },
      {
        metric: '成功数',
        current: curSuccess,
        previous: prevSuccess,
        trend: this.getTrend(curSuccess, prevSuccess),
      },
      {
        metric: '平均品質',
        current: Math.round(curAvgQ * 10) / 10,
        previous: Math.round(prevAvgQ * 10) / 10,
        trend: this.getTrend(curAvgQ, prevAvgQ),
      },
    ];
  }

  /** トップパフォーマーを算出する */
  private calculateTopPerformers(
    records: PerformanceRecord[]
  ): { agentId: string; score: number }[] {
    const agentScores = new Map<string, { total: number; quality: number; count: number }>();

    for (const r of records) {
      const existing = agentScores.get(r.agentId) ?? { total: 0, quality: 0, count: 0 };
      existing.total += r.success ? 1 : 0;
      existing.quality += r.qualityScore;
      existing.count++;
      agentScores.set(r.agentId, existing);
    }

    return Array.from(agentScores.entries())
      .map(([agentId, stats]) => ({
        agentId,
        // スコア = 成功率 * 50 + 平均品質 * 0.5
        score: Math.round(
          ((stats.total / stats.count) * 50 +
            (stats.quality / stats.count) * 0.5) * 10
        ) / 10,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  /** 繰り返し課題を検出する */
  private detectRecurringIssues(records: PerformanceRecord[]): string[] {
    const errorCounts = new Map<string, number>();

    for (const r of records) {
      if (r.errorPatterns) {
        for (const pattern of r.errorPatterns) {
          errorCounts.set(pattern, (errorCounts.get(pattern) ?? 0) + 1);
        }
      }
    }

    // 2回以上出現したエラーパターンを繰り返し課題とする
    return Array.from(errorCounts.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, count]) => `${pattern}（${count}回）`);
  }

  /** トレンドを判定する */
  private getTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    if (previous === 0) return current > 0 ? 'up' : 'stable';
    const diff = (current - previous) / previous;
    if (diff > 0.05) return 'up';
    if (diff < -0.05) return 'down';
    return 'stable';
  }

  /** 日付に日数を加算する */
  private addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** 日報を永続化する */
  private async saveDailyReport(report: DailyReport): Promise<void> {
    const dir = path.join(this.basePath, 'daily');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${report.date}.json`);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  }

  /** 週報を永続化する */
  private async saveWeeklyReport(report: WeeklyReport): Promise<void> {
    const dir = path.join(this.basePath, 'weekly');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${report.weekStart}.json`);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  }

  /** JSONファイルを読み込む */
  private async loadJson<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /** レポート一覧を取得する */
  private async listReports<T>(dir: string, limit: number): Promise<T[]> {
    try {
      const files = await fs.readdir(dir);
      const jsonFiles = files
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const results: T[] = [];
      for (const file of jsonFiles) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        results.push(JSON.parse(content) as T);
      }
      return results;
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
