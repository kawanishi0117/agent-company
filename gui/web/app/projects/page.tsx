/**
 * @file Projects ページ
 * @description プロジェクト管理画面 - プロジェクト一覧表示と登録
 * @requirements 6.1, 6.2 - プロジェクト一覧表示とステータスインジケーター
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay, EmptyState } from '@/components/ui/Error';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * プロジェクト情報
 */
interface Project {
  /** プロジェクトID */
  id: string;
  /** プロジェクト名 */
  name: string;
  /** GitリポジトリURL */
  gitUrl: string;
  /** デフォルトブランチ */
  defaultBranch: string;
  /** 統合ブランチ */
  integrationBranch: string;
  /** PRの作成先ブランチ */
  baseBranch: string;
  /** エージェント作業用ブランチ */
  agentBranch: string;
  /** 作業ディレクトリ */
  workDir: string;
  /** 作成日時 */
  createdAt: string;
  /** 最終使用日時 */
  lastUsed: string;
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
 * プロジェクトデータを取得・管理するカスタムフック
 */
function useProjects(): {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
} {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /**
   * プロジェクトデータを取得
   */
  const fetchProjects = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/projects');
      const result: ApiResponse<Project[]> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'プロジェクトの取得に失敗しました');
      }

      setProjects(result.data || []);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 手動リフレッシュ
   */
  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    await fetchProjects();
  }, [fetchProjects]);

  // 初回データ取得
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // 自動リフレッシュ設定
  useEffect(() => {
    const intervalId = setInterval((): void => {
      void fetchProjects();
    }, REFRESH_INTERVAL_MS);

    return (): void => clearInterval(intervalId);
  }, [fetchProjects]);

  return {
    projects,
    isLoading,
    error,
    lastUpdated,
    refresh,
  };
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * ページヘッダーコンポーネント
 */
interface PageHeaderProps {
  lastUpdated: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function PageHeader({
  lastUpdated,
  isRefreshing,
  onRefresh,
}: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      {/* タイトル */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Projects
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          プロジェクト管理 - 対象リポジトリの登録と設定
        </p>
      </div>

      {/* アクションボタン */}
      <div className="flex items-center gap-4">
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
            focus:outline-none focus:ring-2 focus:ring-accent-primary
          "
          aria-label="データを更新"
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
          href="/projects/new"
          className="
            flex items-center gap-2 px-4 py-2
            text-sm font-medium
            bg-accent-primary hover:bg-accent-primary/90
            text-white
            rounded-md
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary
          "
          data-testid="add-project"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          新規プロジェクト
        </Link>
      </div>
    </div>
  );
}

/**
 * プロジェクトカードコンポーネント
 */
interface ProjectCardProps {
  project: Project;
}

function ProjectCard({ project }: ProjectCardProps): JSX.Element {
  // 最終使用日時のフォーマット
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Link href={`/projects/${project.id}`}>
      <Card
        className="h-full hover:border-accent-primary transition-colors duration-200"
        data-testid={`project-card-${project.id}`}
      >
        <div className="flex flex-col h-full">
          {/* ヘッダー */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              {/* フォルダアイコン */}
              <div className="p-2 bg-accent-primary/10 rounded-lg">
                <svg
                  className="w-5 h-5 text-accent-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary">
                  {project.name}
                </h3>
                <p className="text-xs text-text-muted">
                  {project.id}
                </p>
              </div>
            </div>
          </div>

          {/* Git URL */}
          <div className="mb-3">
            <p className="text-sm text-text-secondary truncate" title={project.gitUrl}>
              {project.gitUrl}
            </p>
          </div>

          {/* ブランチ情報 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-bg-tertiary/50 rounded px-2 py-1">
              <span className="text-xs text-text-muted">Base</span>
              <p className="text-sm text-text-primary font-mono truncate">
                {project.baseBranch}
              </p>
            </div>
            <div className="bg-bg-tertiary/50 rounded px-2 py-1">
              <span className="text-xs text-text-muted">Agent</span>
              <p className="text-sm text-text-primary font-mono truncate">
                {project.agentBranch}
              </p>
            </div>
          </div>

          {/* フッター */}
          <div className="mt-auto pt-3 border-t border-bg-tertiary">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>最終使用</span>
              <span>{formatDate(project.lastUsed)}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/**
 * 空状態表示用のアイコン
 */
function EmptyProjectIcon(): JSX.Element {
  return (
    <svg
      className="w-full h-full"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * Projectsページコンポーネント
 * プロジェクト一覧を表示
 * @requirements 6.1, 6.2 - プロジェクト一覧表示とステータスインジケーター
 */
export default function ProjectsPage(): JSX.Element {
  const { projects, isLoading, error, lastUpdated, refresh } = useProjects();

  // ローディング状態（初回のみ）
  if (isLoading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="プロジェクトを読み込み中..." size="lg" />
      </div>
    );
  }

  // エラー状態
  if (error && projects.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <ErrorDisplay
          message="プロジェクトの読み込みに失敗しました"
          details={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  // 空状態
  if (projects.length === 0) {
    return (
      <>
        <PageHeader
          lastUpdated={lastUpdated}
          isRefreshing={isLoading}
          onRefresh={refresh}
        />
        <EmptyState
          title="プロジェクトがありません"
          description="新規プロジェクトを作成して、エージェントに作業させるリポジトリを登録してください。"
          icon={<EmptyProjectIcon />}
        />
      </>
    );
  }

  // 通常表示
  return (
    <>
      {/* ページヘッダー */}
      <PageHeader
        lastUpdated={lastUpdated}
        isRefreshing={isLoading}
        onRefresh={refresh}
      />

      {/* エラーバナー（データがある場合のリフレッシュエラー） */}
      {error && (
        <div className="mb-4">
          <ErrorDisplay
            message="データの更新に失敗しました"
            details={error}
            variant="warning"
          />
        </div>
      )}

      {/* プロジェクト一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </>
  );
}
