/**
 * @file PerformanceChart コンポーネント
 * @description パフォーマンスチャート（成功率、品質スコアの推移）
 * CSSベースのシンプルなバーチャートで表示
 * @see Requirements: 1.4, 1.5
 */

'use client';

// =============================================================================
// 型定義
// =============================================================================

interface PerformanceRecord {
  taskId: string;
  taskCategory: string;
  success: boolean;
  qualityScore: number;
  timestamp: string;
}

interface PerformanceChartProps {
  /** 直近のパフォーマンスレコード */
  records: PerformanceRecord[];
  /** 成功率 (0-1) */
  successRate: number;
  /** 平均品質スコア */
  averageQuality: number;
  /** 得意カテゴリ */
  strengths: string[];
  /** 苦手カテゴリ */
  weaknesses: string[];
}

// =============================================================================
// ヘルパー
// =============================================================================

/** スコアに応じた色クラス */
function getBarColor(score: number): string {
  if (score >= 80) return 'bg-status-pass';
  if (score >= 60) return 'bg-status-waiver';
  return 'bg-status-fail';
}

/** カテゴリ名の日本語マッピング */
const CATEGORY_LABELS: Record<string, string> = {
  coding: 'コーディング',
  review: 'レビュー',
  test: 'テスト',
  documentation: 'ドキュメント',
  planning: '計画',
  unknown: 'その他',
};

// =============================================================================
// コンポーネント
// =============================================================================

/** メトリクスカード */
function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}): JSX.Element {
  return (
    <div className="bg-bg-tertiary/50 rounded-lg p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

/**
 * パフォーマンスチャートコンポーネント
 * 社員のパフォーマンスデータを視覚的に表示する
 */
export function PerformanceChart({
  records,
  successRate,
  averageQuality,
  strengths,
  weaknesses,
}: PerformanceChartProps): JSX.Element {
  const successPct = Math.round(successRate * 100);
  const qualityColor =
    averageQuality >= 80
      ? 'text-status-pass'
      : averageQuality >= 60
        ? 'text-status-waiver'
        : 'text-status-fail';

  return (
    <div className="space-y-6">
      {/* サマリーメトリクス */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="成功率"
          value={`${successPct}%`}
          color={successPct >= 80 ? 'text-status-pass' : successPct >= 60 ? 'text-status-waiver' : 'text-status-fail'}
        />
        <MetricCard
          label="品質スコア"
          value={`${Math.round(averageQuality)}`}
          color={qualityColor}
        />
        <MetricCard
          label="タスク数"
          value={`${records.length}`}
          color="text-text-primary"
        />
      </div>

      {/* 品質スコア推移（バーチャート） */}
      {records.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted mb-2">品質スコア推移</p>
          <div className="flex items-end gap-0.5 h-20">
            {records.map((record, i) => (
              <div
                key={`${record.taskId}-${i}`}
                className="flex-1 flex flex-col justify-end"
                title={`${record.taskCategory}: ${record.qualityScore}点`}
              >
                <div
                  className={`rounded-t-sm ${getBarColor(record.qualityScore)} transition-all`}
                  style={{ height: `${Math.max(record.qualityScore, 4)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 得意/苦手 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-text-muted mb-1.5">得意分野</p>
          {strengths.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {strengths.map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 text-xs rounded-full bg-status-pass/10 text-status-pass"
                >
                  {CATEGORY_LABELS[s] ?? s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">データ不足</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted mb-1.5">改善分野</p>
          {weaknesses.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {weaknesses.map((w) => (
                <span
                  key={w}
                  className="px-2 py-0.5 text-xs rounded-full bg-status-fail/10 text-status-fail"
                >
                  {CATEGORY_LABELS[w] ?? w}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">データ不足</p>
          )}
        </div>
      </div>
    </div>
  );
}
