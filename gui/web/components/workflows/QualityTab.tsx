/**
 * @file QualityTab コンポーネント
 * @description ワークフロー詳細 - 品質タブ（仕様適合レポート含む）
 * @see Requirements: 9.7, 8.4
 */

'use client';

import { useState, useEffect } from 'react';
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
  /** ワークフローID（仕様適合レポート取得用） */
  workflowId?: string;
}

/** 仕様適合チェック項目 */
interface ComplianceItem {
  requirement: string;
  status: 'implemented' | 'missing' | 'partial';
  evidence?: string;
  notes?: string;
}

/** 仕様適合レポート */
interface ComplianceReport {
  workflowId: string;
  totalRequirements: number;
  implemented: number;
  missing: number;
  partial: number;
  compliancePercentage: number;
  details: ComplianceItem[];
  checkedAt: string;
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
export function QualityTab({ quality, currentPhase, workflowId }: QualityTabProps): JSX.Element {
  const isQAReached = PHASE_INDEX[currentPhase] >= QA_PHASE_INDEX;
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);

  // 仕様適合レポートを取得
  useEffect(() => {
    if (!workflowId || !isQAReached) return;
    const fetchCompliance = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}/compliance`);
        if (res.ok) {
          const data = await res.json();
          setCompliance(data.data ?? null);
        }
      } catch {
        // 取得失敗は無視
      }
    };
    fetchCompliance();
  }, [workflowId, isQAReached]);

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

      {/* 仕様適合レポート */}
      {compliance && (
        <ComplianceSection compliance={compliance} />
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

/** 仕様適合レポートセクション */
function ComplianceSection({ compliance }: { compliance: ComplianceReport }): JSX.Element {
  const passed = compliance.compliancePercentage >= 80;
  const statusColor = compliance.compliancePercentage >= 80
    ? 'text-status-pass'
    : compliance.compliancePercentage >= 50
      ? 'text-status-waiver'
      : 'text-status-fail';

  return (
    <QualitySection
      title="仕様適合チェック"
      icon="📋"
      passed={passed}
    >
      {/* 適合率バー */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">適合率</span>
          <span className={`text-sm font-medium ${statusColor}`}>
            {compliance.compliancePercentage}%
          </span>
        </div>
        <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              passed ? 'bg-status-pass' : 'bg-status-waiver'
            }`}
            style={{ width: `${Math.min(compliance.compliancePercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* サマリー */}
      <div className="flex gap-4 text-sm mb-3">
        <span className="text-status-pass">実装済: {compliance.implemented}</span>
        <span className="text-status-waiver">部分: {compliance.partial}</span>
        <span className="text-status-fail">未実装: {compliance.missing}</span>
        <span className="text-text-muted">合計: {compliance.totalRequirements}</span>
      </div>

      {/* 詳細項目（未実装・部分実装のみ表示） */}
      {compliance.details
        .filter((d) => d.status !== 'implemented')
        .length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-text-muted mb-1">要対応項目:</p>
          {compliance.details
            .filter((d) => d.status !== 'implemented')
            .map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs p-1.5 bg-bg-primary rounded"
              >
                <span className={item.status === 'missing' ? 'text-status-fail' : 'text-status-waiver'}>
                  {item.status === 'missing' ? '✗' : '△'}
                </span>
                <div>
                  <span className="text-text-primary">{item.requirement}</span>
                  {item.notes && (
                    <span className="text-text-muted ml-1">({item.notes})</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </QualitySection>
  );
}
