/**
 * @file TicketCard コンポーネント
 * @description チケットカードコンポーネント - カンバンボード上の個別チケット表示
 * @requirements 3.4 - チケットカードにはid, title, assignee, updated dateを表示
 */

'use client';

import { Badge, getVariantFromStatus } from '../ui/Badge';
import { Card } from '../ui/Card';
import type { TicketSummary, TicketStatus } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface TicketCardProps {
  /** チケット情報 */
  ticket: TicketSummary;
  /** クリックハンドラ */
  onClick?: () => void;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 日付を相対的な表示形式にフォーマット
 * @param dateString - ISO 8601形式の日付文字列
 * @returns フォーマットされた日付文字列
 */
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  // 1分未満
  if (diffMinutes < 1) {
    return 'たった今';
  }
  // 1時間未満
  if (diffHours < 1) {
    return `${diffMinutes}分前`;
  }
  // 24時間未満
  if (diffDays < 1) {
    return `${diffHours}時間前`;
  }
  // 7日未満
  if (diffDays < 7) {
    return `${diffDays}日前`;
  }
  // それ以上は日付表示
  return date.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * ステータスの日本語ラベルを取得
 * @param status - チケットステータス
 * @returns 日本語ラベル
 */
function getStatusLabel(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    todo: 'Todo',
    doing: 'Doing',
    review: 'Review',
    done: 'Done',
  };
  return labels[status];
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * チケットカードコンポーネント
 * カンバンボード上で個別のチケットを表示
 */
export function TicketCard({ ticket, onClick }: TicketCardProps): JSX.Element {
  return (
    <Card
      onClick={onClick}
      className="w-full text-left group"
      data-testid="ticket-card"
    >
      {/* ヘッダー: ID とステータス */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-text-muted">
          #{ticket.id}
        </span>
        <Badge
          variant={getVariantFromStatus(ticket.status)}
          size="sm"
        >
          {getStatusLabel(ticket.status)}
        </Badge>
      </div>

      {/* タイトル */}
      <h3 className="text-sm font-medium text-text-primary mb-3 line-clamp-2 group-hover:text-accent-primary transition-colors">
        {ticket.title}
      </h3>

      {/* フッター: 担当者と更新日時 */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        {/* 担当者 */}
        <div className="flex items-center gap-1.5">
          {/* アバターアイコン */}
          <div className="w-5 h-5 rounded-full bg-bg-tertiary flex items-center justify-center">
            <svg
              className="w-3 h-3 text-text-secondary"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span className="truncate max-w-[80px]">
            {ticket.assignee || '未割当'}
          </span>
        </div>

        {/* 更新日時 */}
        <div className="flex items-center gap-1">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{formatRelativeDate(ticket.updated)}</span>
        </div>
      </div>
    </Card>
  );
}

export default TicketCard;
