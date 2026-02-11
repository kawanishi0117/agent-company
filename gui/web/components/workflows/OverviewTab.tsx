/**
 * @file OverviewTab コンポーネント
 * @description ワークフロー詳細 - 概要タブ
 * @see Requirements: 9.2, 9.11
 */

'use client';

import { useState } from 'react';
import { Badge, getVariantFromStatus } from '@/components/ui/Badge';
import { RollbackDialog } from './RollbackDialog';
import type { WorkflowStateData, PhaseTransition, WorkflowPhase } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface OverviewTabProps {
  /** ワークフロー状態 */
  workflow: WorkflowStateData;
  /** ロールバック実行ハンドラ */
  onRollback: (targetPhase: WorkflowPhase) => Promise<void>;
}

// =============================================================================
// 定数
// =============================================================================

const PHASE_LABELS: Record<string, string> = {
  init: '初期化',
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
 * 概要タブコンポーネント
 */
export function OverviewTab({ workflow, onRollback }: OverviewTabProps): JSX.Element {
  const [rollbackOpen, setRollbackOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* 指示内容 */}
      <section>
        <h3 className="text-sm font-medium text-text-muted mb-2">指示内容</h3>
        <div className="p-4 bg-bg-secondary rounded-md border border-bg-tertiary">
          <p className="text-sm text-text-primary whitespace-pre-wrap">{workflow.instruction}</p>
        </div>
      </section>

      {/* メタデータ */}
      <section>
        <h3 className="text-sm font-medium text-text-muted mb-2">メタデータ</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetaItem label="ワークフローID" value={workflow.workflowId} mono />
          <MetaItem label="プロジェクト" value={workflow.projectId} />
          <MetaItem label="作成日時" value={new Date(workflow.createdAt).toLocaleString('ja-JP')} />
          <MetaItem label="更新日時" value={new Date(workflow.updatedAt).toLocaleString('ja-JP')} />
        </div>
      </section>

      {/* フェーズ遷移タイムライン */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-text-muted">フェーズ遷移タイムライン</h3>
          {/* ロールバックボタン */}
          {workflow.status === 'running' && (
            <button
              onClick={() => setRollbackOpen(true)}
              className="
                px-3 py-1.5 text-xs rounded-md
                bg-status-waiver/20 text-status-waiver border border-status-waiver/30
                hover:bg-status-waiver/30 transition-colors
              "
            >
              ↩ ロールバック
            </button>
          )}
        </div>
        <div className="space-y-0">
          {workflow.phaseHistory.length > 0 ? (
            workflow.phaseHistory.map((transition, idx) => (
              <TimelineItem
                key={idx}
                transition={transition}
                isLast={idx === workflow.phaseHistory.length - 1}
              />
            ))
          ) : (
            <p className="text-sm text-text-muted p-4 bg-bg-secondary rounded-md">
              フェーズ遷移はまだありません
            </p>
          )}
        </div>
      </section>

      {/* ロールバックダイアログ */}
      <RollbackDialog
        isOpen={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        onConfirm={onRollback}
        currentPhase={workflow.currentPhase}
        workflowId={workflow.workflowId}
      />
    </div>
  );
}

/** メタデータ項目 */
function MetaItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="p-3 bg-bg-secondary rounded-md border border-bg-tertiary">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-sm text-text-primary ${mono ? 'font-mono text-xs' : ''} truncate`}>
        {value}
      </div>
    </div>
  );
}

/** タイムライン項目 */
function TimelineItem({
  transition,
  isLast,
}: {
  transition: PhaseTransition;
  isLast: boolean;
}): JSX.Element {
  return (
    <div className="flex gap-3">
      {/* タイムラインドット・線 */}
      <div className="flex flex-col items-center">
        <div className="w-3 h-3 rounded-full bg-accent-primary border-2 border-accent-primary/50 mt-1.5" />
        {!isLast && <div className="w-0.5 flex-1 bg-bg-tertiary my-1" />}
      </div>
      {/* 内容 */}
      <div className={`pb-4 ${isLast ? '' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary">
            {PHASE_LABELS[transition.from] ?? transition.from} → {PHASE_LABELS[transition.to] ?? transition.to}
          </span>
        </div>
        <div className="text-xs text-text-muted mt-0.5">
          {new Date(transition.timestamp).toLocaleString('ja-JP')}
        </div>
        {transition.reason && (
          <div className="text-xs text-text-secondary mt-1">{transition.reason}</div>
        )}
      </div>
    </div>
  );
}

export default OverviewTab;
