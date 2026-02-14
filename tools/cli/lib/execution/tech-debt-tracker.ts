/**
 * 技術的負債トラッカー
 *
 * QAフェーズ完了時にメトリクス（lint/test結果）を記録し、
 * 時系列でのトレンド分析とアラート生成を行う。
 *
 * @module execution/tech-debt-tracker
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** 技術的負債スナップショット */
export interface TechDebtSnapshot {
  /** 記録日（YYYY-MM-DD） */
  date: string;
  /** プロジェクトID */
  projectId: string;
  /** 関連ワークフローID */
  workflowId?: string;
  /** メトリクス */
  metrics: TechDebtMetrics;
}

/** 技術的負債メトリクス */
export interface TechDebtMetrics {
  /** lintエラー数 */
  lintErrors: number;
  /** lint警告数 */
  lintWarnings: number;
  /** テストカバレッジ（0-100） */
  testCoverage: number;
  /** テスト通過率（0-100） */
  testPassRate: number;
  /** テスト総数 */
  totalTests: number;
}

/** 技術的負債アラート */
export interface TechDebtAlert {
  /** アラート種別 */
  type: 'coverage_drop' | 'lint_increase' | 'test_failure_increase';
  /** 重要度 */
  severity: 'warning' | 'critical';
  /** メッセージ */
  message: string;
  /** 現在値 */
  currentValue: number;
  /** 前回値 */
  previousValue: number;
}

// =============================================================================
// 定数
// =============================================================================

/** データ保存ディレクトリ */
const TECH_DEBT_DIR = 'runtime/state/tech-debt';

/** カバレッジ低下アラート閾値（ポイント） */
const COVERAGE_DROP_WARNING = 5;
const COVERAGE_DROP_CRITICAL = 10;

/** lintエラー増加アラート閾値 */
const LINT_INCREASE_WARNING = 5;
const LINT_INCREASE_CRITICAL = 20;

/** テスト通過率低下アラート閾値（ポイント） */
const PASS_RATE_DROP_WARNING = 5;
const PASS_RATE_DROP_CRITICAL = 10;

// =============================================================================
// TechDebtTracker
// =============================================================================

/**
 * 技術的負債トラッカー
 *
 * QAメトリクスを時系列で記録し、悪化傾向を検出する。
 */
export class TechDebtTracker {
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス（デフォルト: runtime/state/tech-debt）
   */
  constructor(basePath: string = TECH_DEBT_DIR) {
    this.basePath = basePath;
  }

  /**
   * メトリクススナップショットを記録する
   *
   * @param snapshot - 記録するスナップショット
   */
  async recordSnapshot(snapshot: TechDebtSnapshot): Promise<void> {
    const snapshots = await this.loadSnapshots(snapshot.projectId);
    // 同日のスナップショットがあれば上書き
    const existingIdx = snapshots.findIndex(
      (s) => s.date === snapshot.date && s.workflowId === snapshot.workflowId
    );
    if (existingIdx >= 0) {
      snapshots[existingIdx] = snapshot;
    } else {
      snapshots.push(snapshot);
    }
    // 日付順にソート
    snapshots.sort((a, b) => a.date.localeCompare(b.date));
    await this.saveSnapshots(snapshot.projectId, snapshots);
  }

  /**
   * 指定期間のトレンドを取得する
   *
   * @param projectId - プロジェクトID
   * @param days - 取得する日数（デフォルト: 30）
   * @returns スナップショット配列
   */
  async getTrend(projectId: string, days: number = 30): Promise<TechDebtSnapshot[]> {
    const snapshots = await this.loadSnapshots(projectId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return snapshots.filter((s) => s.date >= cutoffStr);
  }

  /**
   * 悪化傾向のアラートを生成する
   *
   * 直近のスナップショットとその前のスナップショットを比較し、
   * 閾値を超える悪化があればアラートを生成する。
   *
   * @param projectId - プロジェクトID
   * @returns アラート配列
   */
  async checkAlerts(projectId: string): Promise<TechDebtAlert[]> {
    const snapshots = await this.loadSnapshots(projectId);
    if (snapshots.length < 2) {
      return [];
    }

    const current = snapshots[snapshots.length - 1];
    const previous = snapshots[snapshots.length - 2];
    const alerts: TechDebtAlert[] = [];

    // カバレッジ低下チェック
    const coverageDrop = previous.metrics.testCoverage - current.metrics.testCoverage;
    if (coverageDrop >= COVERAGE_DROP_CRITICAL) {
      alerts.push({
        type: 'coverage_drop',
        severity: 'critical',
        message: `テストカバレッジが${coverageDrop.toFixed(1)}ポイント低下（${previous.metrics.testCoverage}% → ${current.metrics.testCoverage}%）`,
        currentValue: current.metrics.testCoverage,
        previousValue: previous.metrics.testCoverage,
      });
    } else if (coverageDrop >= COVERAGE_DROP_WARNING) {
      alerts.push({
        type: 'coverage_drop',
        severity: 'warning',
        message: `テストカバレッジが${coverageDrop.toFixed(1)}ポイント低下（${previous.metrics.testCoverage}% → ${current.metrics.testCoverage}%）`,
        currentValue: current.metrics.testCoverage,
        previousValue: previous.metrics.testCoverage,
      });
    }

    // lintエラー増加チェック
    const lintIncrease = current.metrics.lintErrors - previous.metrics.lintErrors;
    if (lintIncrease >= LINT_INCREASE_CRITICAL) {
      alerts.push({
        type: 'lint_increase',
        severity: 'critical',
        message: `lintエラーが${lintIncrease}件増加（${previous.metrics.lintErrors} → ${current.metrics.lintErrors}）`,
        currentValue: current.metrics.lintErrors,
        previousValue: previous.metrics.lintErrors,
      });
    } else if (lintIncrease >= LINT_INCREASE_WARNING) {
      alerts.push({
        type: 'lint_increase',
        severity: 'warning',
        message: `lintエラーが${lintIncrease}件増加（${previous.metrics.lintErrors} → ${current.metrics.lintErrors}）`,
        currentValue: current.metrics.lintErrors,
        previousValue: previous.metrics.lintErrors,
      });
    }

    // テスト通過率低下チェック
    const passRateDrop = previous.metrics.testPassRate - current.metrics.testPassRate;
    if (passRateDrop >= PASS_RATE_DROP_CRITICAL) {
      alerts.push({
        type: 'test_failure_increase',
        severity: 'critical',
        message: `テスト通過率が${passRateDrop.toFixed(1)}ポイント低下（${previous.metrics.testPassRate}% → ${current.metrics.testPassRate}%）`,
        currentValue: current.metrics.testPassRate,
        previousValue: previous.metrics.testPassRate,
      });
    } else if (passRateDrop >= PASS_RATE_DROP_WARNING) {
      alerts.push({
        type: 'test_failure_increase',
        severity: 'warning',
        message: `テスト通過率が${passRateDrop.toFixed(1)}ポイント低下（${previous.metrics.testPassRate}% → ${current.metrics.testPassRate}%）`,
        currentValue: current.metrics.testPassRate,
        previousValue: previous.metrics.testPassRate,
      });
    }

    return alerts;
  }

  /**
   * 最新のスナップショットを取得する
   *
   * @param projectId - プロジェクトID
   * @returns 最新スナップショット（存在しない場合はnull）
   */
  async getLatest(projectId: string): Promise<TechDebtSnapshot | null> {
    const snapshots = await this.loadSnapshots(projectId);
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * プロジェクトのスナップショットを読み込む
   */
  private async loadSnapshots(projectId: string): Promise<TechDebtSnapshot[]> {
    try {
      const filePath = path.join(this.basePath, `${projectId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as TechDebtSnapshot[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * プロジェクトのスナップショットを保存する
   */
  private async saveSnapshots(
    projectId: string,
    snapshots: TechDebtSnapshot[]
  ): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${projectId}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshots, null, 2), 'utf-8');
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
