/**
 * @file QualityTab コンポーネント
 * @description ワークフロー詳細 - 品質タブ
 * @see Requirements: 9.7
 */

'use client';

import { Badge } from '@/components/ui/Badge';
import type { QualityResultsData, WorkflowPhase } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface QualityTabProps {
  /** 品質結果 */
  quality?: QualityResultsData;
  /** 現在のフェーズ */
  currentPhase: WorkflowPhase;
}

// =============================================================================
// 定数
// =============================================================================

/** 品質確認フェーズ以降かどうか */
const QA_PHASE_INDEX = 3; // quality_assurance
const PHASE_INDEX: Record<WorkflowPhase, number> = {
  proposal: 0,
  approval: 1,
  development: 2,
  quality_assurance: 3,
  delivery: 4,
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 品質タブコンポーネント
 */
export function QualityTab({ quality, currentPhase }: QualityTabProps): JSX.Element {
  const isQAReached = PHASE_INDEX[currentPhase] >= QA_PHASE_INDEX;

  if (!isQAReached || !quality) {
    return (
      <div className="p-8 text-center text-text-muted">
        <span className="text-4xl mb-4 block">🔍</span>
        <p>品質確認フェーズ完了後に結果が表示されます</p>
        <p className="text-xs mt-1">
          現在のフェーズ: {currentPhase}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lint結果 */}
      {quality.lint && (
        <QualitySection
          title="Lint チェック"
          icon="📝"
          passed={quality.lint.passed}
        >
          <div className="flex gap-4 text-sm">
            <span className="text-status-fail">エラー: {quality.lint.errors}</span>
            <span className="text-status-waiver">警告: {quality.lint.warnings}</span>
          </div>
          {quality.lint.details && (
            <pre className="mt-2 text-xs text-text-muted bg-bg-primary p-2 rounded overflow-x-auto">
              {quality.lint.details}
            </pre>
          )}
        </QualitySection>
      )}

      {/* テスト結果 */}
      {quality.test && (
        <QualitySection
          title="テスト"
          icon="🧪"
          passed={quality.test.passed}
        >
          <div className="flex gap-4 text-sm">
            <span className="text-text-secondary">合計: {quality.test.total}</span>
            <span className="text-status-pass">成功: {quality.test.passed_count}</span>
            <span className="text-status-fail">失敗: {quality.test.failed}</span>
          </div>
          {/* カバレッジバー */}
          {quality.test.coverage !== undefined && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-muted">カバレッジ</span>
                <span className="text-xs font-medium text-text-primary">
                  {quality.test.coverage}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    quality.test.coverage >= 80 ? 'bg-status-pass' : 'bg-status-waiver'
                  }`}
                  style={{ width: `${Math.min(quality.test.coverage, 100)}%` }}
                />
              </div>
            </div>
          )}
          {quality.test.details && (
            <pre className="mt-2 text-xs text-text-muted bg-bg-primary p-2 rounded overflow-x-auto">
              {quality.test.details}
            </pre>
          )}
        </QualitySection>
      )}

      {/* レビュー結果 */}
      {quality.review && (
        <QualitySection
          title="最終レビュー"
          icon="👀"
          passed={quality.review.passed}
        >
          {quality.review.reviewer && (
            <div className="text-sm text-text-secondary">
              レビュアー: <span className="text-text-primary">{quality.review.reviewer}</span>
            </div>
          )}
          {quality.review.feedback && (
            <div className="mt-2 p-2 bg-bg-primary rounded text-sm text-text-secondary">
              {quality.review.feedback}
            </div>
          )}
        </QualitySection>
      )}
    </div>
  );
}

/** 品質セクション共通ラッパー */
function QualitySection({
  title,
  icon,
  passed,
  children,
}: {
  title: string;
  icon: string;
  passed: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="p-4 bg-bg-secondary rounded-md border border-bg-tertiary">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <h4 className="text-sm font-medium text-text-primary">{title}</h4>
        </div>
        <Badge variant={passed ? 'pass' : 'fail'} size="sm">
          {passed ? 'PASS' : 'FAIL'}
        </Badge>
      </div>
      {children}
    </div>
  );
}

export default QualityTab;
