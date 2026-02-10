/**
 * @file StatusBadge コンポーネント
 * @description チケットステータスを色分け表示するバッジ
 * @requirements 7.2 - ステータスに応じた色分け表示
 */

'use client';

// =============================================================================
// 型定義
// =============================================================================

/**
 * チケットステータス
 */
export type TicketStatus =
  | 'pending'
  | 'decomposing'
  | 'in_progress'
  | 'review_requested'
  | 'revision_required'
  | 'completed'
  | 'failed'
  | 'pr_created';

/**
 * ステータスバッジのプロパティ
 */
interface StatusBadgeProps {
  /** チケットステータス */
  status: TicketStatus;
  /** サイズ */
  size?: 'sm' | 'md';
  /** 追加のCSSクラス */
  className?: string;
}

// =============================================================================
// ステータス設定
// =============================================================================

/**
 * ステータスごとの表示設定
 * @requirements 7.2 - ステータスに応じた色分け
 * - pending: gray
 * - in_progress: blue
 * - review_requested: yellow
 * - completed: green
 * - failed: red
 */
const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bgColor: string }> = {
  pending: {
    label: '待機中',
    color: 'text-text-muted',
    bgColor: 'bg-bg-tertiary',
  },
  decomposing: {
    label: '分解中',
    color: 'text-accent-primary',
    bgColor: 'bg-accent-primary/10',
  },
  in_progress: {
    label: '実行中',
    color: 'text-accent-primary',
    bgColor: 'bg-accent-primary/10',
  },
  review_requested: {
    label: 'レビュー待ち',
    color: 'text-status-waiver',
    bgColor: 'bg-status-waiver/10',
  },
  revision_required: {
    label: '修正要求',
    color: 'text-status-waiver',
    bgColor: 'bg-status-waiver/10',
  },
  completed: {
    label: '完了',
    color: 'text-status-pass',
    bgColor: 'bg-status-pass/10',
  },
  failed: {
    label: '失敗',
    color: 'text-status-fail',
    bgColor: 'bg-status-fail/10',
  },
  pr_created: {
    label: 'PR作成済み',
    color: 'text-status-pass',
    bgColor: 'bg-status-pass/10',
  },
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * ステータスバッジコンポーネント
 * チケットのステータスを色分けして表示
 * @requirements 7.2 - ステータスに応じた色分け表示
 */
export function StatusBadge({
  status,
  size = 'md',
  className = '',
}: StatusBadgeProps): JSX.Element {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2 py-1 text-xs';

  return (
    <span
      className={`
        inline-flex items-center
        ${sizeClasses}
        ${config.bgColor}
        ${config.color}
        font-medium
        rounded-full
        ${className}
      `.trim()}
    >
      {config.label}
    </span>
  );
}

/**
 * ステータスドットコンポーネント
 * コンパクトなステータス表示用
 */
export function StatusDot({
  status,
  className = '',
}: {
  status: TicketStatus;
  className?: string;
}): JSX.Element {
  const colorMap: Record<TicketStatus, string> = {
    pending: 'bg-text-muted',
    decomposing: 'bg-accent-primary',
    in_progress: 'bg-accent-primary',
    review_requested: 'bg-status-waiver',
    revision_required: 'bg-status-waiver',
    completed: 'bg-status-pass',
    failed: 'bg-status-fail',
    pr_created: 'bg-status-pass',
  };

  const color = colorMap[status] || colorMap.pending;

  return (
    <span
      className={`
        inline-block w-2 h-2 rounded-full
        ${color}
        ${className}
      `.trim()}
      aria-label={STATUS_CONFIG[status]?.label || '不明'}
    />
  );
}

export default StatusBadge;
