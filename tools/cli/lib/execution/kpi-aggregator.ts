/**
 * KPIデータ集計ロジック
 *
 * AgentPerformanceTracker、TechDebtTracker、ReportGeneratorから
 * KPIデータを集計し、OKRデータを永続化する。
 *
 * @module execution/kpi-aggregator
 * @see Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentPerformanceTracker } from './agent-performance-tracker.js';
import { TechDebtTracker } from './tech-debt-tracker.js';

// =============================================================================
// 型定義
// =============================================================================

/** KPIカテゴリ */
export type KpiCategory = 'productivity' | 'quality' | 'cost' | 'growth';

/** KPIメトリクス */
export interface KpiMetric {
  /** メトリクス名 */
  name: string;
  /** カテゴリ */
  category: KpiCategory;
  /** 現在値 */
  value: number;
  /** 単位 */
  unit: string;
  /** 目標値 */
  target?: number;
  /** 前期比（%） */
  changePercent?: number;
}

/** KPIサマリー */
export interface KpiSummary {
  /** 集計日時 */
  aggregatedAt: string;
  /** メトリクス一覧 */
  metrics: KpiMetric[];
}

/** OKR目標 */
export interface OkrObjective {
  /** 目標ID */
  id: string;
  /** 目標タイトル */
  title: string;
  /** 主要結果 */
  keyResults: OkrKeyResult[];
  /** 進捗率（0-100） */
  progress: number;
}

/** OKR主要結果 */
export interface OkrKeyResult {
  /** 結果ID */
  id: string;
  /** 説明 */
  description: string;
  /** 現在値 */
  currentValue: number;
  /** 目標値 */
  targetValue: number;
  /** 単位 */
  unit: string;
}

/** OKRデータ */
export interface OkrData {
  /** 期間 */
  period: string;
  /** 目標一覧 */
  objectives: OkrObjective[];
  /** 最終更新日時 */
  updatedAt: string;
}

// =============================================================================
// 定数
// =============================================================================

/** OKRデータ保存パス */
const OKR_DIR = 'runtime/state/okr';
const OKR_FILE = 'current.json';

// =============================================================================
// KpiAggregator
// =============================================================================

/**
 * KPIデータ集計クラス
 *
 * 各トラッカーからデータを収集し、統合KPIサマリーを生成する。
 */
export class KpiAggregator {
  private readonly performanceTracker: AgentPerformanceTracker;
  private readonly techDebtTracker: TechDebtTracker;
  private readonly okrPath: string;

  /**
   * @param performanceTracker - パフォーマンストラッカー
   * @param techDebtTracker - 技術的負債トラッカー
   * @param okrBasePath - OKRデータ保存ベースパス
   */
  constructor(
    performanceTracker: AgentPerformanceTracker,
    techDebtTracker: TechDebtTracker,
    okrBasePath: string = OKR_DIR
  ) {
    this.performanceTracker = performanceTracker;
    this.techDebtTracker = techDebtTracker;
    this.okrPath = okrBasePath;
  }

  /**
   * KPIサマリーを集計する
   *
   * @param projectId - プロジェクトID（技術的負債トレンド取得用）
   * @returns KPIサマリー
   */
  async aggregate(projectId: string = 'default'): Promise<KpiSummary> {
    const metrics: KpiMetric[] = [];

    // 1. 生産性KPI（パフォーマンストラッカーから）
    const productivityMetrics = await this.aggregateProductivity();
    metrics.push(...productivityMetrics);

    // 2. 品質KPI（技術的負債トラッカーから）
    const qualityMetrics = await this.aggregateQuality(projectId);
    metrics.push(...qualityMetrics);

    // 3. コストKPI（簡易集計）
    const costMetrics = this.aggregateCost();
    metrics.push(...costMetrics);

    // 4. 成長KPI
    const growthMetrics = await this.aggregateGrowth();
    metrics.push(...growthMetrics);

    return {
      aggregatedAt: new Date().toISOString(),
      metrics,
    };
  }

  /**
   * OKRデータを取得する
   *
   * @returns OKRデータ（存在しない場合はデフォルト）
   */
  async getOkr(): Promise<OkrData> {
    try {
      const filePath = path.join(this.okrPath, OKR_FILE);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as OkrData;
    } catch {
      return this.createDefaultOkr();
    }
  }

  /**
   * OKRデータを更新する
   *
   * @param data - 更新するOKRデータ
   */
  async updateOkr(data: OkrData): Promise<void> {
    data.updatedAt = new Date().toISOString();
    await fs.mkdir(this.okrPath, { recursive: true });
    const filePath = path.join(this.okrPath, OKR_FILE);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /** 生産性KPIを集計 */
  private async aggregateProductivity(): Promise<KpiMetric[]> {
    const metrics: KpiMetric[] = [];

    try {
      const profiles = await this.performanceTracker.getAllProfiles();
      let totalTasks = 0;
      let completedTasks = 0;
      let totalScore = 0;

      for (const profile of profiles) {
        totalTasks += profile.totalTasks;
        completedTasks += Math.round(profile.successRate * profile.totalTasks);
        totalScore += profile.averageQuality;
      }

      const agentCount = profiles.length;

      metrics.push({
        name: 'タスク完了数',
        category: 'productivity',
        value: completedTasks,
        unit: '件',
        target: totalTasks,
      });

      metrics.push({
        name: 'タスク成功率',
        category: 'productivity',
        value: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        unit: '%',
        target: 90,
      });

      metrics.push({
        name: '平均品質スコア',
        category: 'productivity',
        value: agentCount > 0 ? Math.round(totalScore / agentCount) : 0,
        unit: '点',
        target: 80,
      });
    } catch {
      // パフォーマンスデータ取得失敗時はデフォルト値
      metrics.push({
        name: 'タスク完了数',
        category: 'productivity',
        value: 0,
        unit: '件',
      });
    }

    return metrics;
  }

  /** 品質KPIを集計 */
  private async aggregateQuality(projectId: string): Promise<KpiMetric[]> {
    const metrics: KpiMetric[] = [];

    try {
      const latest = await this.techDebtTracker.getLatest(projectId);
      if (latest) {
        metrics.push({
          name: 'テストカバレッジ',
          category: 'quality',
          value: latest.metrics.testCoverage,
          unit: '%',
          target: 80,
        });

        metrics.push({
          name: 'テスト通過率',
          category: 'quality',
          value: latest.metrics.testPassRate,
          unit: '%',
          target: 95,
        });

        metrics.push({
          name: 'Lintエラー数',
          category: 'quality',
          value: latest.metrics.lintErrors,
          unit: '件',
          target: 0,
        });

        metrics.push({
          name: 'テスト総数',
          category: 'quality',
          value: latest.metrics.totalTests,
          unit: '件',
        });
      }
    } catch {
      // 技術的負債データ取得失敗時はスキップ
    }

    return metrics;
  }

  /** コストKPIを集計（簡易版） */
  private aggregateCost(): KpiMetric[] {
    // コストデータは将来CFOコンポーネントから取得予定
    return [
      {
        name: 'エージェント稼働数',
        category: 'cost',
        value: 7, // 固定エージェント数
        unit: '名',
      },
    ];
  }

  /** 成長KPIを集計 */
  private async aggregateGrowth(): Promise<KpiMetric[]> {
    const metrics: KpiMetric[] = [];

    try {
      const profiles = await this.performanceTracker.getAllProfiles();
      metrics.push({
        name: '登録エージェント数',
        category: 'growth',
        value: profiles.length,
        unit: '名',
      });
    } catch {
      metrics.push({
        name: '登録エージェント数',
        category: 'growth',
        value: 0,
        unit: '名',
      });
    }

    return metrics;
  }

  /** デフォルトOKRを生成 */
  private createDefaultOkr(): OkrData {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return {
      period: `${now.getFullYear()} Q${quarter}`,
      objectives: [
        {
          id: 'obj-1',
          title: '品質の向上',
          keyResults: [
            {
              id: 'kr-1-1',
              description: 'テストカバレッジ80%以上を維持',
              currentValue: 0,
              targetValue: 80,
              unit: '%',
            },
            {
              id: 'kr-1-2',
              description: 'Lintエラーゼロを達成',
              currentValue: 0,
              targetValue: 0,
              unit: '件',
            },
          ],
          progress: 0,
        },
        {
          id: 'obj-2',
          title: '生産性の向上',
          keyResults: [
            {
              id: 'kr-2-1',
              description: 'タスク成功率90%以上',
              currentValue: 0,
              targetValue: 90,
              unit: '%',
            },
          ],
          progress: 0,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }
}
