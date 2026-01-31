/**
 * @file Backlog ページ
 * @description チケット管理画面 - カンバンボードでチケットを表示
 * @requirements 3.1 - workflows/backlog/からチケットを表示
 * @requirements 3.7 - 30秒ごとにデータを自動リフレッシュ
 * @requirements 3.8 - チケットが存在しない場合は空状態メッセージを表示
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { KanbanBoard } from '@/components/backlog/KanbanBoard';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay, EmptyState } from '@/components/ui/Error';
import type { TicketSummary, ApiResponse } from '@/lib/types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 自動リフレッシュ間隔（ミリ秒）
 * @requirements 3.7 - 30秒ごとにデータを自動リフレッシュ
 */
const REFRESH_INTERVAL_MS = 30 * 1000;

// =============================================================================
// カスタムフック
// =============================================================================

/**
 * チケットデータを取得・管理するカスタムフック
 * @returns チケットデータ、ローディング状態、エラー状態、リフレッシュ関数
 */
function useTickets(): {
  tickets: TicketSummary[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
} {
  // 状態管理
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /**
   * チケットデータを取得
   */
  const fetchTickets = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/backlog');
      const result: ApiResponse<TicketSummary[]> = await response.json();

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
  }, []);

  /**
   * 手動リフレッシュ
   */
  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    await fetchTickets();
  }, [fetchTickets]);

  // 初回データ取得
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // 自動リフレッシュ設定
  // @requirements 3.7 - 30秒ごとにデータを自動リフレッシュ
  useEffect(() => {
    const intervalId = setInterval((): void => {
      // バックグラウンドでリフレッシュ（ローディング表示なし）
      void fetchTickets();
    }, REFRESH_INTERVAL_MS);

    // クリーンアップ
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

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * ページヘッダーコンポーネント
 */
interface PageHeaderProps {
  /** 最終更新日時 */
  lastUpdated: Date | null;
  /** リフレッシュ中かどうか */
  isRefreshing: boolean;
  /** リフレッシュハンドラ */
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
          Backlog
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          チケット管理 - カンバンボード
        </p>
      </div>

      {/* 更新情報とリフレッシュボタン */}
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
    </div>
  );
}

/**
 * 空状態表示用のアイコン
 */
function EmptyTicketIcon(): JSX.Element {
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
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * Backlogページコンポーネント
 * チケットをカンバンボード形式で表示
 * @requirements 3.1 - workflows/backlog/からチケットを表示
 * @requirements 3.7 - 30秒ごとにデータを自動リフレッシュ
 * @requirements 3.8 - チケットが存在しない場合は空状態メッセージを表示
 */
export default function BacklogPage(): JSX.Element {
  const { tickets, isLoading, error, lastUpdated, refresh } = useTickets();

  // ローディング状態（初回のみ）
  if (isLoading && tickets.length === 0) {
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
  // @requirements 3.8 - チケットが存在しない場合は空状態メッセージを表示
  if (tickets.length === 0) {
    return (
      <>
        <PageHeader
          lastUpdated={lastUpdated}
          isRefreshing={isLoading}
          onRefresh={refresh}
        />
        <EmptyState
          title="チケットがありません"
          description="workflows/backlog/ ディレクトリにチケットファイルを作成してください。"
          icon={<EmptyTicketIcon />}
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

      {/* カンバンボード */}
      <KanbanBoard tickets={tickets} />
    </>
  );
}
