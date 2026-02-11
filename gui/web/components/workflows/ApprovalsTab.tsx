/**
 * @file ApprovalsTab コンポーネント
 * @description ワークフロー詳細 - 承認履歴タブ
 * @see Requirements: 9.8
 */

'use client';

import type { ApprovalDecisionData } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface ApprovalsTabProps {
  /** 承認履歴 */
  approvals: ApprovalDecisionData[];
}

// =============================================================================
// 定数
// =============================================================================

/** アクションの表示設定 */
const ACTION_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  approve: { icon: '✅', label: '承認', color: 'text-status-pass border-status-pass/30 bg-status-pass/5' },
  request_revision: { icon: '↩', label: '修正要求', color: 'text-status-waiver border-status-waiver/30 bg-status-waiver/5' },
  reject: { icon: '✕', label: '却下', color: 'text-status-fail border-status-fail/30 bg-status-fail/5' },
};

/** フェーズラベル */
const PHASE_LABELS: Record<string, string> = {
  proposal: '提案',
  approval: '承認',
  development: '開発',
  quality_assurance: '品質確認',
  delivery: '納品',
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 承認履歴タブコンポーネント
 */
export function ApprovalsTab({ approvals }: ApprovalsTabProps): JSX.Element {
  if (approvals.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        <span className="text-4xl mb-4 block">📜</span>
        <p>承認履歴はまだありません</p>
      </div>
    );
  }

  // 時系列降順でソート
  const sorted = [...approvals].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="space-y-3">
      {sorted.map((decision, idx) => {
        const config = ACTION_CONFIG[decision.action] ?? ACTION_CONFIG['approve'];
        return (
          <div
            key={idx}
            className={`p-4 rounded-md border ${config.color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{config.icon}</span>
                <span className="text-sm font-medium">{config.label}</span>
                <span className="text-xs text-text-muted px-2 py-0.5 bg-bg-tertiary/50 rounded">
                  {PHASE_LABELS[decision.phase] ?? decision.phase}
                </span>
              </div>
              <span className="text-xs text-text-muted">
                {new Date(decision.timestamp).toLocaleString('ja-JP')}
              </span>
            </div>
            {decision.feedback && (
              <p className="text-sm text-text-secondary mt-1 pl-8">
                {decision.feedback}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ApprovalsTab;
