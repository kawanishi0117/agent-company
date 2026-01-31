/**
 * @file Runs ページ
 * @description 実行履歴画面 - Runの一覧表示、フィルタリング、ページネーション
 * @requirements 4.1 - runtime/runs/からRunを表示
 * @requirements 4.2 - Runは新しい順（降順）でソート
 * @requirements 4.9 - ステータスフィルタ対応（success/failure）
 * @requirements 4.10 - ページネーション対応（10件/ページ）
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RunList } from '@/components/runs/RunList';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay } from '@/components/ui/Error';
import type { RunSummary, PaginatedResponse, RunStatus } from '@/lib/types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 1ページあたりの表示件数
 * @requirements 4.10 - 10件/ページ
 */
const PAGE_SIZE = 10;

/**
 * ステータスフィルタのオプション
 */
const STATUS_OPTIONS: { value: RunStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失敗' },
  { value: 'running', label: '実行中' },
];

// =============================================================================
// カスタムフック
// =============================================================================

/**
 * Runデータを取得・管理するカスタムフック
 * @param page - 現在のページ番号
 * @param statusFilter - ステータスフィルタ
 * @returns Runデータ、ローディング状態、エラー状態、ページネーション情報
 */
function useRuns(
  page: number,
  statusFilter: RunStatus | 'all'
): {
  runs: RunSummary[];
  isLoading: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
  refresh: () => Promise<void>;
} {
  // 状態管理
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  /**
   * Runデータを取得
   */
  const fetchRuns = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // クエリパラメータを構築
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      // ステータスフィルタを追加（'all'以外の場合）
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/runs?${params.toString()}`);
      const result: PaginatedResponse<RunSummary> | { error: string } = await response.json();

      if (!response.ok || 'error' in result) {
        throw new Error('error' in result ? result.error : 'Runの取得に失敗しました');
      }

      setRuns(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  /**
   * 手動リフレッシュ
   */
  const refresh = useCallback(async (): Promise<void> => {
    await fetchRuns();
  }, [fetchRuns]);

  // データ取得（ページ・フィルタ変更時）
  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  return {
    runs,
    isLoading,
    error,
    total,
    hasMore,
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
  /** リフレッシュ中かどうか */
  isRefreshing: boolean;
  /** リフレッシュハンドラ */
  onRefresh: () => void;
}

function PageHeader({
  isRefreshing,
  onRefresh,
}: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      {/* タイトル */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Runs
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          実行履歴 - ログと成果物
        </p>
      </div>

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
        {/* リフレッシュアイコン */}
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
    </div>
  );
}

/**
 * ステータスフィルタコンポーネント
 * @requirements 4.9 - ステータスフィルタ対応
 */
interface StatusFilterProps {
  /** 現在選択中のステータス */
  currentStatus: RunStatus | 'all';
  /** ステータス変更ハンドラ */
  onStatusChange: (status: RunStatus | 'all') => void;
}

function StatusFilter({
  currentStatus,
  onStatusChange,
}: StatusFilterProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <span className="text-sm text-text-secondary mr-2">
        フィルタ:
      </span>
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onStatusChange(option.value)}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-accent-primary
            ${
              currentStatus === option.value
                ? 'bg-accent-primary text-white'
                : 'bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-bg-tertiary'
            }
          `}
          aria-pressed={currentStatus === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * ページネーションコンポーネント
 * @requirements 4.10 - ページネーション対応
 */
interface PaginationProps {
  /** 現在のページ番号（1始まり） */
  currentPage: number;
  /** 総アイテム数 */
  total: number;
  /** 1ページあたりの件数 */
  pageSize: number;
  /** ページ変更ハンドラ */
  onPageChange: (page: number) => void;
}

function Pagination({
  currentPage,
  total,
  pageSize,
  onPageChange,
}: PaginationProps): JSX.Element {
  // 総ページ数を計算
  const totalPages = Math.ceil(total / pageSize);

  // ページが1ページ以下の場合は表示しない
  if (totalPages <= 1) {
    return <></>;
  }

  // 表示するページ番号の範囲を計算（最大5ページ表示）
  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);

    // 開始位置を調整
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      {/* 前へボタン */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="
          px-3 py-2 text-sm font-medium
          bg-bg-secondary hover:bg-bg-tertiary
          text-text-primary
          rounded-md border border-bg-tertiary
          transition-colors duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-accent-primary
        "
        aria-label="前のページ"
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
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      {/* ページ番号ボタン */}
      {pageNumbers.map((pageNum) => (
        <button
          key={pageNum}
          onClick={() => onPageChange(pageNum)}
          className={`
            px-3 py-2 text-sm font-medium rounded-md
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-accent-primary
            ${
              currentPage === pageNum
                ? 'bg-accent-primary text-white'
                : 'bg-bg-secondary hover:bg-bg-tertiary text-text-primary border border-bg-tertiary'
            }
          `}
          aria-current={currentPage === pageNum ? 'page' : undefined}
        >
          {pageNum}
        </button>
      ))}

      {/* 次へボタン */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="
          px-3 py-2 text-sm font-medium
          bg-bg-secondary hover:bg-bg-tertiary
          text-text-primary
          rounded-md border border-bg-tertiary
          transition-colors duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-accent-primary
        "
        aria-label="次のページ"
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
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      {/* ページ情報 */}
      <span className="ml-4 text-sm text-text-muted">
        {total}件中 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, total)}件
      </span>
    </div>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * Runsページコンポーネント
 * 実行履歴をリスト形式で表示
 * @requirements 4.1 - runtime/runs/からRunを表示
 * @requirements 4.2 - Runは新しい順（降順）でソート
 * @requirements 4.9 - ステータスフィルタ対応
 * @requirements 4.10 - ページネーション対応（10件/ページ）
 */
export default function RunsPage(): JSX.Element {
  const router = useRouter();

  // ページネーション状態
  const [currentPage, setCurrentPage] = useState(1);

  // ステータスフィルタ状態
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');

  // Runデータ取得
  const { runs, isLoading, error, total, refresh } = useRuns(currentPage, statusFilter);

  /**
   * ステータスフィルタ変更ハンドラ
   * フィルタ変更時はページを1に戻す
   */
  const handleStatusChange = useCallback((status: RunStatus | 'all'): void => {
    setStatusFilter(status);
    setCurrentPage(1);
  }, []);

  /**
   * ページ変更ハンドラ
   */
  const handlePageChange = useCallback((page: number): void => {
    setCurrentPage(page);
    // ページ上部にスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /**
   * Run詳細ページへ遷移
   */
  const handleRunClick = useCallback((runId: string): void => {
    router.push(`/runs/${runId}`);
  }, [router]);

  // ローディング状態（初回のみ）
  if (isLoading && runs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="実行履歴を読み込み中..." size="lg" />
      </div>
    );
  }

  // エラー状態（データがない場合）
  if (error && runs.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <ErrorDisplay
          message="実行履歴の読み込みに失敗しました"
          details={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  // 通常表示
  return (
    <>
      {/* ページヘッダー */}
      <PageHeader
        isRefreshing={isLoading}
        onRefresh={refresh}
      />

      {/* ステータスフィルタ */}
      <StatusFilter
        currentStatus={statusFilter}
        onStatusChange={handleStatusChange}
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

      {/* Run一覧 */}
      <RunList
        runs={runs}
        isLoading={isLoading}
        error={null}
        onRetry={refresh}
        onRunClick={handleRunClick}
      />

      {/* ページネーション */}
      <Pagination
        currentPage={currentPage}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={handlePageChange}
      />
    </>
  );
}
