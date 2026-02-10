/**
 * @file TicketTree コンポーネント
 * @description チケット階層をツリー形式で表示
 * @requirements 7.1, 7.3, 7.4, 7.5 - 階層表示、展開/折りたたみ、ワーカータイプ・ブランチ表示
 */

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { StatusBadge, StatusDot, TicketStatus } from './StatusBadge';

// =============================================================================
// 型定義
// =============================================================================

/**
 * ワーカータイプ
 */
type WorkerType = 'research' | 'design' | 'designer' | 'developer' | 'test' | 'reviewer';

/**
 * 孫チケット
 */
interface GrandchildTicket {
  id: string;
  parentId: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: TicketStatus;
  assignee?: string;
  gitBranch?: string;
  artifacts: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 子チケット
 */
interface ChildTicket {
  id: string;
  parentId: string;
  title: string;
  description: string;
  status: TicketStatus;
  workerType: WorkerType;
  createdAt: string;
  updatedAt: string;
  grandchildTickets: GrandchildTicket[];
}

/**
 * 親チケット
 */
interface ParentTicket {
  id: string;
  projectId: string;
  instruction: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  childTickets: ChildTicket[];
  metadata: {
    priority: 'low' | 'medium' | 'high';
    deadline?: string;
    tags: string[];
  };
}

/**
 * TicketTreeのプロパティ
 */
interface TicketTreeProps {
  /** 親チケット一覧 */
  tickets: ParentTicket[];
  /** 選択中のチケットID */
  selectedId?: string;
  /** チケット選択ハンドラ */
  onSelect?: (ticketId: string) => void;
}

// =============================================================================
// ワーカータイプ設定
// =============================================================================

/**
 * ワーカータイプの表示設定
 */
const WORKER_TYPE_CONFIG: Record<WorkerType, { label: string; icon: string }> = {
  research: { label: '調査', icon: '🔍' },
  design: { label: '設計', icon: '📐' },
  designer: { label: 'UI/UX', icon: '🎨' },
  developer: { label: '開発', icon: '💻' },
  test: { label: 'テスト', icon: '🧪' },
  reviewer: { label: 'レビュー', icon: '👀' },
};

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * 展開/折りたたみアイコン
 */
function ChevronIcon({ isExpanded }: { isExpanded: boolean }): JSX.Element {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

/**
 * 孫チケット行
 */
interface GrandchildRowProps {
  ticket: GrandchildTicket;
  isSelected: boolean;
  onSelect?: (id: string) => void;
}

function GrandchildRow({ ticket, isSelected, onSelect }: GrandchildRowProps): JSX.Element {
  return (
    <div
      className={`
        flex items-center gap-2 py-2 px-3 ml-12
        rounded-md cursor-pointer
        transition-colors duration-150
        ${isSelected
          ? 'bg-accent-primary/10 border-l-2 border-accent-primary'
          : 'hover:bg-bg-tertiary/50'
        }
      `}
      onClick={() => onSelect?.(ticket.id)}
    >
      <StatusDot status={ticket.status} />
      <Link
        href={`/tickets/${ticket.id}`}
        className="flex-1 text-sm text-text-primary hover:text-accent-primary truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {ticket.title}
      </Link>
      
      {/* アサイニー表示 */}
      {ticket.assignee && (
        <span className="text-xs text-text-muted px-1.5 py-0.5 bg-bg-tertiary rounded">
          {ticket.assignee}
        </span>
      )}
      
      {/* Gitブランチ表示 */}
      {ticket.gitBranch && (
        <span className="text-xs text-text-muted font-mono px-1.5 py-0.5 bg-bg-tertiary rounded truncate max-w-[150px]">
          {ticket.gitBranch}
        </span>
      )}
      
      <StatusBadge status={ticket.status} size="sm" />
    </div>
  );
}

/**
 * 子チケット行
 */
interface ChildRowProps {
  ticket: ChildTicket;
  isExpanded: boolean;
  isSelected: boolean;
  selectedGrandchildId?: string;
  onToggle: () => void;
  onSelect?: (id: string) => void;
}

function ChildRow({
  ticket,
  isExpanded,
  isSelected,
  selectedGrandchildId,
  onToggle,
  onSelect,
}: ChildRowProps): JSX.Element {
  const hasGrandchildren = ticket.grandchildTickets.length > 0;
  const workerConfig = WORKER_TYPE_CONFIG[ticket.workerType];

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 py-2 px-3 ml-6
          rounded-md cursor-pointer
          transition-colors duration-150
          ${isSelected
            ? 'bg-accent-primary/10 border-l-2 border-accent-primary'
            : 'hover:bg-bg-tertiary/50'
          }
        `}
        onClick={() => onSelect?.(ticket.id)}
      >
        {/* 展開/折りたたみボタン */}
        {hasGrandchildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-0.5 hover:bg-bg-tertiary rounded"
          >
            <ChevronIcon isExpanded={isExpanded} />
          </button>
        ) : (
          <span className="w-5" />
        )}

        <StatusDot status={ticket.status} />
        
        <Link
          href={`/tickets/${ticket.id}`}
          className="flex-1 text-sm text-text-primary hover:text-accent-primary truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {ticket.title}
        </Link>

        {/* ワーカータイプ表示 */}
        <span className="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded" title={workerConfig.label}>
          {workerConfig.icon} {workerConfig.label}
        </span>

        <StatusBadge status={ticket.status} size="sm" />
      </div>

      {/* 孫チケット */}
      {isExpanded && hasGrandchildren && (
        <div className="space-y-1 mt-1">
          {ticket.grandchildTickets.map((grandchild) => (
            <GrandchildRow
              key={grandchild.id}
              ticket={grandchild}
              isSelected={selectedGrandchildId === grandchild.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 親チケット行
 */
interface ParentRowProps {
  ticket: ParentTicket;
  isExpanded: boolean;
  isSelected: boolean;
  selectedChildId?: string;
  selectedGrandchildId?: string;
  expandedChildren: Set<string>;
  onToggle: () => void;
  onToggleChild: (childId: string) => void;
  onSelect?: (id: string) => void;
}

function ParentRow({
  ticket,
  isExpanded,
  isSelected,
  selectedChildId,
  selectedGrandchildId,
  expandedChildren,
  onToggle,
  onToggleChild,
  onSelect,
}: ParentRowProps): JSX.Element {
  const hasChildren = ticket.childTickets.length > 0;

  // 優先度の色
  const priorityColors = {
    low: 'text-text-muted',
    medium: 'text-status-waiver',
    high: 'text-status-fail',
  };

  return (
    <div className="border border-bg-tertiary rounded-lg overflow-hidden">
      <div
        className={`
          flex items-center gap-2 py-3 px-4
          cursor-pointer
          transition-colors duration-150
          ${isSelected
            ? 'bg-accent-primary/10'
            : 'hover:bg-bg-tertiary/50'
          }
        `}
        onClick={() => onSelect?.(ticket.id)}
      >
        {/* 展開/折りたたみボタン */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-0.5 hover:bg-bg-tertiary rounded"
          >
            <ChevronIcon isExpanded={isExpanded} />
          </button>
        ) : (
          <span className="w-5" />
        )}

        <StatusDot status={ticket.status} />

        <Link
          href={`/tickets/${ticket.id}`}
          className="flex-1 text-text-primary hover:text-accent-primary truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {ticket.instruction.length > 80
            ? `${ticket.instruction.substring(0, 80)}...`
            : ticket.instruction}
        </Link>

        {/* 優先度 */}
        <span className={`text-xs ${priorityColors[ticket.metadata.priority]}`}>
          {ticket.metadata.priority.toUpperCase()}
        </span>

        {/* 子チケット数 */}
        {hasChildren && (
          <span className="text-xs text-text-muted">
            {ticket.childTickets.length} tasks
          </span>
        )}

        <StatusBadge status={ticket.status} />
      </div>

      {/* 子チケット */}
      {isExpanded && hasChildren && (
        <div className="bg-bg-secondary/50 py-2 space-y-1">
          {ticket.childTickets.map((child) => (
            <ChildRow
              key={child.id}
              ticket={child}
              isExpanded={expandedChildren.has(child.id)}
              isSelected={selectedChildId === child.id}
              selectedGrandchildId={selectedGrandchildId}
              onToggle={() => onToggleChild(child.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * チケットツリーコンポーネント
 * チケット階層をツリー形式で表示
 * @requirements 7.1, 7.3 - 階層表示、展開/折りたたみ
 */
export function TicketTree({
  tickets,
  selectedId,
  onSelect,
}: TicketTreeProps): JSX.Element {
  // 展開状態の管理
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(new Set());

  /**
   * 親チケットの展開/折りたたみ
   */
  const toggleParent = useCallback((parentId: string): void => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  }, []);

  /**
   * 子チケットの展開/折りたたみ
   */
  const toggleChild = useCallback((childId: string): void => {
    setExpandedChildren((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) {
        next.delete(childId);
      } else {
        next.add(childId);
      }
      return next;
    });
  }, []);

  /**
   * 全て展開
   */
  const expandAll = useCallback((): void => {
    const parentIds = new Set(tickets.map((t) => t.id));
    const childIds = new Set(
      tickets.flatMap((t) => t.childTickets.map((c) => c.id))
    );
    setExpandedParents(parentIds);
    setExpandedChildren(childIds);
  }, [tickets]);

  /**
   * 全て折りたたみ
   */
  const collapseAll = useCallback((): void => {
    setExpandedParents(new Set());
    setExpandedChildren(new Set());
  }, []);

  // 選択中のチケットがどの階層にあるか判定
  const findSelectedLevel = (): { parentId?: string; childId?: string; grandchildId?: string } => {
    if (!selectedId) return {};

    for (const parent of tickets) {
      if (parent.id === selectedId) {
        return { parentId: selectedId };
      }
      for (const child of parent.childTickets) {
        if (child.id === selectedId) {
          return { parentId: parent.id, childId: selectedId };
        }
        for (const grandchild of child.grandchildTickets) {
          if (grandchild.id === selectedId) {
            return { parentId: parent.id, childId: child.id, grandchildId: selectedId };
          }
        }
      }
    }
    return {};
  };

  const { parentId: selectedParentId, childId: selectedChildId, grandchildId: selectedGrandchildId } = findSelectedLevel();

  if (tickets.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        チケットがありません
      </div>
    );
  }

  return (
    <div data-testid="ticket-tree">
      {/* ツールバー */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          onClick={expandAll}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          全て展開
        </button>
        <span className="text-text-muted">|</span>
        <button
          onClick={collapseAll}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          全て折りたたみ
        </button>
      </div>

      {/* チケットツリー */}
      <div className="space-y-3">
        {tickets.map((parent) => (
          <ParentRow
            key={parent.id}
            ticket={parent}
            isExpanded={expandedParents.has(parent.id)}
            isSelected={selectedParentId === parent.id && !selectedChildId}
            selectedChildId={selectedChildId}
            selectedGrandchildId={selectedGrandchildId}
            expandedChildren={expandedChildren}
            onToggle={() => toggleParent(parent.id)}
            onToggleChild={toggleChild}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default TicketTree;
