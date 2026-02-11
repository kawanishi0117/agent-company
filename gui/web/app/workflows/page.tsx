/**
 * @file ワークフロー一覧ページ
 * @description ワークフロー一覧の表示・フィルタ・ソート
 * @see Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WorkflowCard } from '@/components/workflows/WorkflowCard';
import { WorkflowFilter } from '@/components/workflows/WorkflowFilter';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay, EmptyState } from '@/components/ui/Error';
import type { WorkflowStateData, WorkflowStatus } from '@/lib/types';

// =============================================================================
// 定数
// =============================================================================

/** 自動リフレッシュ間隔（ミリ秒） */
const REFRESH_INTERVAL_MS = 5000;

/** ソートキー */
type SortKey = 'createdAt' | 'updatedAt' | 'status';

// =============================================================================
// ページコンポーネント
// =============================================================================

/**
 * ワークフロー一覧ページ
 */
export default function WorkflowsPage(): JSX.Element {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowStateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');

  /** ワークフロー一覧を取得 */
  const fetchWorkflows = useCallback(async (): Promise<void> => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const res = await fetch(`/api/workflows?${params.toString()}`);
      if (!res.ok) throw new Error('ワークフロー一覧の取得に失敗しました');
      const data = await res.json();
      setWorkflows(data.data?.workflows ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // 初回読み込み + 自動リフレッシュ
  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchWorkflows]);

  /** ソート処理 */
  const sortedWorkflows = [...workflows].sort((a, b) => {
    switch (sortKey) {
      case 'createdAt':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'updatedAt':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'status':
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  if (loading) {
    return <Loading size="lg" text="ワークフローを読み込み中..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchWorkflows} />;
  }

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">ワークフロー</h1>
        <p className="text-sm text-text-muted mt-1">
          業務ワークフローの一覧と管理
        </p>
      </div>

      {/* フィルタ */}
      <WorkflowFilter
        selectedStatus={statusFilter}
        onStatusChange={setStatusFilter}
        onSortChange={setSortKey}
        currentSort={sortKey}
      />

      {/* ワークフロー一覧 */}
      {sortedWorkflows.length === 0 ? (
        <EmptyState message="ワークフローがありません" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedWorkflows.map((wf) => (
            <WorkflowCard
              key={wf.workflowId}
              workflow={wf}
              onClick={() => router.push(`/workflows/${wf.workflowId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
