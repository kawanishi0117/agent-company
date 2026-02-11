/**
 * @file WorkflowFilter コンポーネント
 * @description ワークフロー一覧のフィルタ・ソート
 * @see Requirements: 8.4, 8.5
 */

'use client';

import { useState } from 'react';
import type { WorkflowStatus } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/** ソートキー */
type SortKey = 'createdAt' | 'updatedAt' | 'status';

interface WorkflowFilterProps {
  /** 選択中のステータスフィルタ */
  selectedStatus: WorkflowStatus | 'all';
  /** ステータス変更ハンドラ */
  onStatusChange: (status: WorkflowStatus | 'all') => void;
  /** ソートキー変更ハンドラ */
  onSortChange: (sort: SortKey) => void;
  /** 現在のソートキー */
  currentSort: SortKey;
  /** 追加CSSクラス */
  className?: string;
}

// =============================================================================
// 定数
// =============================================================================

/** フィルタオプション */
const STATUS_OPTIONS: { value: WorkflowStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'running', label: '実行中' },
  { value: 'waiting_approval', label: '承認待ち' },
  { value: 'completed', label: '完了' },
  { value: 'failed', label: '失敗' },
  { value: 'terminated', label: '終了' },
];

/** ソートオプション */
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'createdAt', label: '作成日時' },
  { value: 'updatedAt', label: '更新日時' },
  { value: 'status', label: 'ステータス' },
];

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * ワークフローフィルタコンポーネント
 * ステータスフィルタとソート機能を提供
 */
export function WorkflowFilter({
  selectedStatus,
  onStatusChange,
  onSortChange,
  currentSort,
  className = '',
}: WorkflowFilterProps): JSX.Element {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${className}`}>
      {/* ステータスフィルタ */}
      <div className="flex items-center gap-2">
        <label htmlFor="status-filter" className="text-xs text-text-muted whitespace-nowrap">
          ステータス:
        </label>
        <div className="flex gap-1" role="radiogroup" aria-label="ステータスフィルタ">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onStatusChange(opt.value)}
              className={`
                px-3 py-1.5 text-xs rounded-full border transition-all duration-200
                ${
                  selectedStatus === opt.value
                    ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                    : 'bg-bg-secondary border-bg-tertiary text-text-secondary hover:border-text-muted'
                }
              `}
              role="radio"
              aria-checked={selectedStatus === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ソート */}
      <div className="flex items-center gap-2">
        <label htmlFor="sort-select" className="text-xs text-text-muted whitespace-nowrap">
          並び替え:
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="
            px-3 py-1.5 text-xs rounded-md
            bg-bg-secondary border border-bg-tertiary text-text-secondary
            focus:border-accent-primary focus:outline-none
            transition-colors
          "
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default WorkflowFilter;
