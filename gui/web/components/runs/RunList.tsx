/**
 * @file RunList コンポーネント
 * @description Run一覧コンポーネント - Runのリスト表示
 * @requirements 4.1 - Runs画面はruntime/runs/からRunを表示
 * @requirements 4.2 - Runは新しい順（降順）でソート
 */

'use client';

import { RunCard } from './RunCard';
import { Loading } from '../ui/Loading';
import { Error as ErrorDisplay } from '../ui/Error';
import type { RunSummary } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface RunListProps {
  /** Run一覧 */
  runs: RunSummary[];
  /** ローディング状態 */
  isLoading?: boolean;
  /** エラーメッセージ */
  error?: string | null;
  /** リトライハンドラ */
  onRetry?: () => void;
  /** Runクリックハンドラ */
  onRunClick?: (runId: string) => void;
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * Run一覧コンポーネント
 * Runのリストをカード形式で表示
 */
export function RunList({
  runs,
  isLoading = false,
  error = null,
  onRetry,
  onRunClick,
}: RunListProps): JSX.Element {
  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading size="lg" message="Runを読み込み中..." />
      </div>
    );
  }

  // エラー状態
  if (error) {
    return (
      <ErrorDisplay
        message={error}
        onRetry={onRetry}
      />
    );
  }

  // 空状態
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        {/* 空状態アイコン */}
        <div className="w-16 h-16 mb-4 rounded-full bg-bg-tertiary flex items-center justify-center">
          <svg
            className="w-8 h-8 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        
        {/* メッセージ */}
        <h3 className="text-lg font-medium text-text-primary mb-2">
          実行履歴がありません
        </h3>
        <p className="text-sm text-text-muted max-w-sm">
          まだ実行されたタスクがありません。
          タスクを実行すると、ここに履歴が表示されます。
        </p>
      </div>
    );
  }

  // Run一覧表示
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {runs.map((run) => (
        <RunCard
          key={run.runId}
          run={run}
          onClick={onRunClick ? (): void => onRunClick(run.runId) : undefined}
        />
      ))}
    </div>
  );
}

export default RunList;
