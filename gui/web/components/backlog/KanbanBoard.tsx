/**
 * @file KanbanBoard コンポーネント
 * @description カンバンボードコンポーネント - 4カラム（Todo, Doing, Review, Done）でチケットを表示
 * @requirements 3.2 - チケットはステータス別にカラムに分類（todo, doing, review, done）
 */

'use client';

import { useState, useCallback } from 'react';
import { TicketCard } from './TicketCard';
import { TicketModal } from './TicketModal';
import type { TicketSummary, TicketStatus } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface KanbanBoardProps {
  /** チケット一覧 */
  tickets: TicketSummary[];
}

/**
 * カラム設定の型
 */
interface ColumnConfig {
  /** カラムのステータス */
  status: TicketStatus;
  /** カラムのタイトル */
  title: string;
  /** カラムのアクセントカラー */
  accentColor: string;
  /** カラムのアイコン */
  icon: JSX.Element;
}

// =============================================================================
// 定数定義
// =============================================================================

/**
 * カンバンボードのカラム設定
 */
const COLUMNS: ColumnConfig[] = [
  {
    status: 'todo',
    title: 'Todo',
    accentColor: 'border-text-muted',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    status: 'doing',
    title: 'Doing',
    accentColor: 'border-status-running',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    status: 'review',
    title: 'Review',
    accentColor: 'border-purple-500',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    status: 'done',
    title: 'Done',
    accentColor: 'border-status-pass',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * チケットをステータスごとにグループ化
 * @param tickets - チケット一覧
 * @returns ステータスをキーとしたチケットのマップ
 */
function groupTicketsByStatus(
  tickets: TicketSummary[]
): Record<TicketStatus, TicketSummary[]> {
  const grouped: Record<TicketStatus, TicketSummary[]> = {
    todo: [],
    doing: [],
    review: [],
    done: [],
  };

  for (const ticket of tickets) {
    grouped[ticket.status].push(ticket);
  }

  return grouped;
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * カンバンカラムコンポーネント
 */
interface KanbanColumnProps {
  /** カラム設定 */
  config: ColumnConfig;
  /** カラム内のチケット */
  tickets: TicketSummary[];
  /** チケットクリックハンドラ */
  onTicketClick: (ticketId: string) => void;
}

function KanbanColumn({
  config,
  tickets,
  onTicketClick,
}: KanbanColumnProps): JSX.Element {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1">
      {/* カラムヘッダー */}
      <div
        className={`
          flex items-center gap-2 px-3 py-2 mb-3
          bg-bg-secondary rounded-lg
          border-l-4 ${config.accentColor}
        `}
      >
        <span className="text-text-secondary">{config.icon}</span>
        <h2 className="text-sm font-semibold text-text-primary">
          {config.title}
        </h2>
        <span className="ml-auto text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
          {tickets.length}
        </span>
      </div>

      {/* チケットリスト */}
      <div className="flex-1 space-y-3 overflow-y-auto pr-1 pb-4">
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-text-muted border border-dashed border-bg-tertiary rounded-lg">
            チケットなし
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => onTicketClick(ticket.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * カンバンボードコンポーネント
 * チケットを4つのカラム（Todo, Doing, Review, Done）に分類して表示
 */
export function KanbanBoard({ tickets }: KanbanBoardProps): JSX.Element {
  // モーダル状態
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // チケットをステータスごとにグループ化
  const groupedTickets = groupTicketsByStatus(tickets);

  // チケットクリックハンドラ
  const handleTicketClick = useCallback((ticketId: string) => {
    setSelectedTicketId(ticketId);
    setIsModalOpen(true);
  }, []);

  // モーダルを閉じる
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    // アニメーション完了後にIDをクリア
    setTimeout(() => setSelectedTicketId(null), 200);
  }, []);

  return (
    <>
      {/* カンバンボード */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.status}
            config={column}
            tickets={groupedTickets[column.status]}
            onTicketClick={handleTicketClick}
          />
        ))}
      </div>

      {/* チケット詳細モーダル */}
      <TicketModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        ticketId={selectedTicketId}
      />
    </>
  );
}

export default KanbanBoard;
