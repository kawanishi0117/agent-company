/**
 * @file Tickets ページ
 * @description チケット階層管理画面 - チケットツリー表示
 * @requirements 7.1, 7.2, 7.3 - チケット階層表示、ステータス色分け、展開/折りたたみ
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TicketTree } from '@/components/tickets';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay, EmptyState } from '@/components/ui/Error';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * チケットステータス
 */
type TicketStatus =
  | 'pending'
  | 'decomposing'
  | 'in_progress'
  | 'review_requested'
  | 'revision_required'
  | 'completed'
  | 'failed'
  | 'pr_created';

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
 * プロジェクト情報
 */
interface Project {
  id: string;
  name: string;
}

// =============================================================================
// 定数定義
// =============================================================================

/** 自動リフレッシュ間隔（ミリ秒） */
const REFRESH_INTERVAL_MS = 30 * 1000;

// =============================================================================
// カスタムフック
// =============================================================================

/**
 * チケットデータを取得・管理するカスタムフック
 */
function useTickets(projectId?: string): {
  tickets: ParentTicket[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
} {
  const [tickets, setTickets] = useState<ParentTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTickets = useCallback(async (): Promise<void> => {
    try {
      const url = projectId
        ? `/api/tickets?projectId=${projectId}`
        : '/api/tickets';
      const response = await fetch(url);
      const result: ApiResponse<ParentTicket[]> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'チケットの取得に失敗しました');
      }

      setTickets(result.data || []);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    await fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    const intervalId = setInterval((): void => {
      void fetchTickets();
    }, REFRESH_INTERVAL_MS);

    return (): void => clearInterval(intervalId);
  }, [fetchTickets]);

  return {
    tickets,
    isLoading,
    error,
    lastUpdated,
    refresh,
  };
}

/**
 * プロジェクト一覧を取得するカスタムフック
 */
function useProjects(): {
  projects: Project[];
  isLoading: boolean;
} {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async (): Promise<void> => {
      try {
        const response = await fetch('/api/projects');
        const result: ApiResponse<Project[]> = await response.json();
        if (result.data) {
          setProjects(result.data);
        }
      } catch {
        // エラーは無視（プロジェクト選択は任意）
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  return { projects, isLoading };
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * ページヘッダーコンポーネント
 */
interface PageHeaderProps {
  projects: Project[];
  selectedProjectId?: string;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function PageHeader({
  projects,
  selectedProjectId,
  lastUpdated,
  isRefreshing,
  onRefresh,
}: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      {/* タイトル */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Tickets
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          チケット階層管理 - タスクの進捗を確認
        </p>
      </div>

      {/* アクションボタン */}
      <div className="flex items-center gap-4">
        {/* プロジェクト選択 */}
        {projects.length > 0 && (
          <select
            value={selectedProjectId || ''}
            onChange={(e) => {
              const url = e.target.value
                ? `/tickets?projectId=${e.target.value}`
                : '/tickets';
              window.location.href = url;
            }}
            className="
              px-3 py-1.5
              text-sm
              bg-bg-secondary
              text-text-primary
              border border-bg-tertiary
              rounded-md
              focus:outline-none focus:ring-2 focus:ring-accent-primary
            "
          >
            <option value="">全プロジェクト</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}

        {/* 最終更新日時 */}
        {lastUpdated && (
          <span className="text-xs text-text-muted">
            最終更新: {lastUpdated.toLocaleTimeString('ja-JP')}
          </span>
        )}

        {/* リフレッシュボタン */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="
            flex items-center gap-2 px-3 py-1.5
            text-sm font-medium
            bg-bg-secondary hover:bg-bg-tertiary
            text-text-primary
            rounded-md border border-bg-tertiary
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <svg
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          更新
        </button>

        {/* 新規作成ボタン */}
        <Link
          href="/tickets/create"
          className="
            flex items-center gap-2 px-4 py-2
            text-sm font-medium
            bg-accent-primary hover:bg-accent-primary/90
            text-white
            rounded-md
            transition-colors duration-200
          "
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新規チケット
        </Link>
      </div>
    </div>
  );
}

/**
 * 空状態表示用のアイコン
 */
function EmptyTicketIcon(): JSX.Element {
  return (
    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
      />
    </svg>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * Ticketsページコンポーネント
 * チケット階層をツリー形式で表示
 */
export default function TicketsPage(): JSX.Element {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;

  const { projects, isLoading: projectsLoading } = useProjects();
  const { tickets, isLoading, error, lastUpdated, refresh } = useTickets(projectId);

  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>();

  // ローディング状態（初回のみ）
  if ((isLoading || projectsLoading) && tickets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="チケットを読み込み中..." size="lg" />
      </div>
    );
  }

  // エラー状態
  if (error && tickets.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <ErrorDisplay
          message="チケットの読み込みに失敗しました"
          details={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  // 空状態
  if (tickets.length === 0) {
    return (
      <>
        <PageHeader
          projects={projects}
          selectedProjectId={projectId}
          lastUpdated={lastUpdated}
          isRefreshing={isLoading}
          onRefresh={refresh}
        />
        <EmptyState
          title="チケットがありません"
          description="新規チケットを作成して、エージェントに作業を依頼してください。"
          icon={<EmptyTicketIcon />}
        />
      </>
    );
  }

  // 通常表示
  return (
    <>
      <PageHeader
        projects={projects}
        selectedProjectId={projectId}
        lastUpdated={lastUpdated}
        isRefreshing={isLoading}
        onRefresh={refresh}
      />

      {/* エラーバナー */}
      {error && (
        <div className="mb-4">
          <ErrorDisplay
            message="データの更新に失敗しました"
            details={error}
            variant="warning"
          />
        </div>
      )}

      {/* チケットツリー */}
      <TicketTree
        tickets={tickets}
        selectedId={selectedTicketId}
        onSelect={setSelectedTicketId}
      />
    </>
  );
}
