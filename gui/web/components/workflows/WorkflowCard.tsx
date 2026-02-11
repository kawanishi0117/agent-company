/**
 * @file WorkflowCard コンポーネント
 * @description ワークフローカード（一覧画面用）
 * @see Requirements: 8.2, 8.3, 8.6
 */

'use client';

import { Card } from '@/components/ui/Card';
import { Badge, getVariantFromStatus } from '@/components/ui/Badge';
import { PhaseProgress } from './PhaseProgress';
import type { WorkflowStateData, WorkflowStatus } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface WorkflowCardProps {
  /** ワークフロー状態 */
  workflow: WorkflowStateData;
  /** クリックハンドラ */
  onClick?: () => void;
}

// =============================================================================
// ユーティリティ
// =============================================================================

/** ステータスの日本語ラベル */
const STATUS_LABELS: Record<WorkflowStatus, string> = {
  running: '実行中',
  waiting_approval: '承認待ち',
  completed: '完了',
  failed: '失敗',
  terminated: '終了',
};

/**
 * 日時をフォーマット
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 指示文を短縮表示
 */
function truncateInstruction(instruction: string, maxLen: number = 80): string {
  if (instruction.length <= maxLen) return instruction;
  return instruction.slice(0, maxLen) + '…';
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * ワークフローカードコンポーネント
 * 一覧画面で個別のワークフローを表示
 */
export function WorkflowCard({ workflow, onClick }: WorkflowCardProps): JSX.Element {
  const isWaitingApproval = workflow.status === 'waiting_approval';

  return (
    <Card
      onClick={onClick}
      className="w-full text-left group relative"
      data-testid="workflow-card"
    >
      {/* 承認待ち通知バッジ */}
      {isWaitingApproval && (
        <span className="absolute -top-2 -right-2 flex h-5 w-5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-5 w-5 bg-accent-primary items-center justify-center text-[10px] text-white font-bold">
            !
          </span>
        </span>
      )}

      {/* ヘッダー: ID とステータス */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-text-muted truncate max-w-[200px]">
          {workflow.workflowId}
        </span>
        <Badge variant={getVariantFromStatus(workflow.status)} size="sm">
          {STATUS_LABELS[workflow.status]}
        </Badge>
      </div>

      {/* 指示サマリー */}
      <p className="text-sm text-text-secondary mb-3 line-clamp-2 group-hover:text-text-primary transition-colors">
        {truncateInstruction(workflow.instruction)}
      </p>

      {/* フェーズ進捗（コンパクト） */}
      <div className="mb-3">
        <PhaseProgress
          currentPhase={workflow.currentPhase}
          status={workflow.status}
          compact
        />
      </div>

      {/* フッター: 日時 */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>作成: {formatDate(workflow.createdAt)}</span>
        <span>更新: {formatDate(workflow.updatedAt)}</span>
      </div>
    </Card>
  );
}

export default WorkflowCard;
