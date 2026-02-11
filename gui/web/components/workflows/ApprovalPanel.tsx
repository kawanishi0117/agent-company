/**
 * @file ApprovalPanel コンポーネント
 * @description 承認アクションパネル（詳細画面上部に表示）
 * @see Requirements: 9.9, 9.10, 16.6
 */

'use client';

import { useState } from 'react';
import type { ProposalData, DeliverableData } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/** 承認アクション */
type ApprovalAction = 'approve' | 'request_revision' | 'reject';

interface ApprovalPanelProps {
  /** ワークフローID */
  workflowId: string;
  /** 現在のフェーズ（approval or delivery） */
  phase: 'approval' | 'delivery';
  /** 提案書（approvalフェーズ時） */
  proposal?: ProposalData;
  /** 納品物（deliveryフェーズ時） */
  deliverable?: DeliverableData;
  /** 承認決定送信ハンドラ */
  onSubmit: (action: ApprovalAction, feedback: string) => Promise<void>;
  /** 追加CSSクラス */
  className?: string;
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 承認アクションパネル
 * CEO承認待ち時に表示される決定パネル
 */
export function ApprovalPanel({
  workflowId,
  phase,
  proposal,
  deliverable,
  onSubmit,
  className = '',
}: ApprovalPanelProps): JSX.Element {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ApprovalAction | null>(null);

  /** 決定を送信 */
  const handleSubmit = async (action: ApprovalAction): Promise<void> => {
    setSubmitting(true);
    setSelectedAction(action);
    try {
      await onSubmit(action, feedback);
      setFeedback('');
      setSelectedAction(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`
        border-2 border-accent-primary rounded-lg p-6
        bg-accent-primary/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]
        ${className}
      `}
      role="region"
      aria-label="承認パネル"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🔔</span>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {phase === 'approval' ? '提案書の承認' : '納品物の承認'}
          </h3>
          <p className="text-xs text-text-muted">
            ワークフロー: {workflowId}
          </p>
        </div>
      </div>

      {/* 提案書サマリー（approvalフェーズ） */}
      {phase === 'approval' && proposal && (
        <div className="mb-4 p-4 bg-bg-secondary rounded-md border border-bg-tertiary">
          <h4 className="text-sm font-medium text-text-primary mb-2">提案概要</h4>
          <p className="text-sm text-text-secondary mb-2">{proposal.summary}</p>
          <div className="flex gap-4 text-xs text-text-muted">
            <span>タスク数: {proposal.taskBreakdown.length}</span>
            <span>リスク: {proposal.risks.length}件</span>
          </div>
        </div>
      )}

      {/* 納品物サマリー（deliveryフェーズ） */}
      {phase === 'delivery' && deliverable && (
        <div className="mb-4 p-4 bg-bg-secondary rounded-md border border-bg-tertiary">
          <h4 className="text-sm font-medium text-text-primary mb-2">納品概要</h4>
          <p className="text-sm text-text-secondary mb-2">{deliverable.summaryReport}</p>
          <div className="flex gap-4 text-xs text-text-muted">
            <span>変更: {deliverable.changes.length}件</span>
            <span>テスト: {deliverable.testResults.passed}成功 / {deliverable.testResults.failed}失敗</span>
            <span>成果物: {deliverable.artifacts.length}件</span>
          </div>
        </div>
      )}

      {/* フィードバック入力 */}
      <div className="mb-4">
        <label htmlFor="approval-feedback" className="block text-sm text-text-secondary mb-2">
          フィードバック（任意）
        </label>
        <textarea
          id="approval-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="承認・修正要求・却下の理由を入力..."
          rows={3}
          className="
            w-full px-4 py-3 text-sm rounded-md
            bg-bg-secondary border border-bg-tertiary text-text-primary
            placeholder:text-text-muted
            focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50
            resize-none transition-colors
          "
          disabled={submitting}
        />
      </div>

      {/* アクションボタン */}
      <div className="flex gap-3">
        <button
          onClick={() => handleSubmit('approve')}
          disabled={submitting}
          className="
            flex-1 px-4 py-2.5 rounded-md text-sm font-medium
            bg-status-pass/20 text-status-pass border border-status-pass/30
            hover:bg-status-pass/30 disabled:opacity-50
            transition-all duration-200
          "
        >
          {submitting && selectedAction === 'approve' ? '送信中...' : '✅ 承認'}
        </button>
        <button
          onClick={() => handleSubmit('request_revision')}
          disabled={submitting}
          className="
            flex-1 px-4 py-2.5 rounded-md text-sm font-medium
            bg-status-waiver/20 text-status-waiver border border-status-waiver/30
            hover:bg-status-waiver/30 disabled:opacity-50
            transition-all duration-200
          "
        >
          {submitting && selectedAction === 'request_revision' ? '送信中...' : '↩ 修正要求'}
        </button>
        <button
          onClick={() => handleSubmit('reject')}
          disabled={submitting}
          className="
            flex-1 px-4 py-2.5 rounded-md text-sm font-medium
            bg-status-fail/20 text-status-fail border border-status-fail/30
            hover:bg-status-fail/30 disabled:opacity-50
            transition-all duration-200
          "
        >
          {submitting && selectedAction === 'reject' ? '送信中...' : '✕ 却下'}
        </button>
      </div>
    </div>
  );
}

export default ApprovalPanel;
