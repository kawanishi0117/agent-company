/**
 * @file ProgressTab コンポーネント
 * @description ワークフロー詳細 - 進捗タブ（Kanban風レイアウト）
 * @see Requirements: 9.5, 9.6, 9.12, 16.8
 */

'use client';

import { Badge } from '@/components/ui/Badge';
import type { SubtaskProgressItem } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface ProgressTabProps {
  /** サブタスク進捗一覧 */
  subtasks: SubtaskProgressItem[];
  /** 全体完了率（0-100） */
  completionRate?: number;
}

// =============================================================================
// 定数
// =============================================================================

/** Kanban列定義 */
type ColumnKey = 'pending' | 'working' | 'review' | 'completed' | 'failed';

const COLUMNS: { key: ColumnKey; label: string; color: string }[] = [
  { key: 'pending', label: '待機', color: 'text-text-muted' },
  { key: 'working', label: '作業中', color: 'text-accent-primary' },
  { key: 'review', label: 'レビュー', color: 'text-purple-400' },
  { key: 'completed', label: '完了', color: 'text-status-pass' },
  { key: 'failed', label: '失敗', color: 'text-status-fail' },
];

/** ステータスからバッジバリアントへのマッピング */
function getStatusVariant(status: string): 'todo' | 'running' | 'review' | 'pass' | 'fail' {
  switch (status) {
    case 'pending': return 'todo';
    case 'working': return 'running';
    case 'review': return 'review';
    case 'completed': return 'pass';
    case 'failed': return 'fail';
    case 'skipped': return 'waiver' as 'todo';
    default: return 'todo';
  }
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 進捗タブコンポーネント
 * Kanban風5列レイアウトでタスク進捗を表示
 */
export function ProgressTab({ subtasks, completionRate }: ProgressTabProps): JSX.Element {
  if (subtasks.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        <span className="text-4xl mb-4 block">📊</span>
        <p>開発フェーズ開始後に進捗が表示されます</p>
      </div>
    );
  }

  // 列ごとにタスクを分類
  const columnTasks: Record<ColumnKey, SubtaskProgressItem[]> = {
    pending: [],
    working: [],
    review: [],
    completed: [],
    failed: [],
  };

  subtasks.forEach((task) => {
    const col = task.status === 'skipped' ? 'completed' : (task.status as ColumnKey);
    if (columnTasks[col]) {
      columnTasks[col].push(task);
    }
  });

  // 完了率を計算（propsで渡されない場合）
  const rate = completionRate ?? Math.round(
    (subtasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length / subtasks.length) * 100
  );

  return (
    <div className="space-y-4">
      {/* 全体進捗バー */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-text-secondary">全体進捗</span>
          <span className="text-sm font-medium text-text-primary">{rate}%</span>
        </div>
        <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-primary rounded-full transition-all duration-500"
            style={{ width: `${rate}%` }}
          />
        </div>
        <div className="text-xs text-text-muted mt-1">
          {subtasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length} / {subtasks.length} タスク完了
        </div>
      </div>

      {/* Kanban風レイアウト */}
      <div className="grid grid-cols-5 gap-3 min-h-[200px]">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col">
            {/* 列ヘッダー */}
            <div className={`text-xs font-medium ${col.color} mb-2 flex items-center gap-1`}>
              <span>{col.label}</span>
              <span className="text-text-muted">({columnTasks[col.key].length})</span>
            </div>
            {/* タスクカード */}
            <div className="space-y-2 flex-1">
              {columnTasks[col.key].map((task) => (
                <TaskCard key={task.taskId} task={task} isWorking={col.key === 'working'} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** タスクカード */
function TaskCard({
  task,
  isWorking,
}: {
  task: SubtaskProgressItem;
  isWorking: boolean;
}): JSX.Element {
  return (
    <div
      className={`
        p-2 rounded-md border text-xs
        bg-bg-secondary
        ${isWorking
          ? 'border-accent-primary/50 shadow-[0_0_8px_rgba(59,130,246,0.15)] animate-pulse'
          : 'border-bg-tertiary'
        }
      `}
    >
      <div className="flex items-center gap-1 mb-1">
        <span className="font-mono text-text-muted">{task.taskId}</span>
      </div>
      <div className="text-text-primary truncate" title={task.title}>
        {task.title}
      </div>
      {task.workerType && (
        <div className="mt-1">
          <Badge variant="running" size="sm">{task.workerType}</Badge>
        </div>
      )}
      {task.error && (
        <div className="mt-1 text-status-fail truncate" title={task.error}>
          {task.error}
        </div>
      )}
    </div>
  );
}

export default ProgressTab;
