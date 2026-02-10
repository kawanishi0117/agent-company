/**
 * @file チケット詳細ページ
 * @description チケットの詳細情報、ログ、成果物リンクを表示
 * @requirements 7.6 - チケット詳細表示
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay } from '@/components/ui/Error';
import { StatusBadge, TicketStatus } from '@/components/tickets';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * ワーカータイプ
 */
type WorkerType = 'research' | 'design' | 'designer' | 'developer' | 'test' | 'reviewer';

/**
 * レビュー結果
 */
interface ReviewResult {
  reviewerId: string;
  approved: boolean;
  feedback?: string;
  checklist: {
    codeQuality: boolean;
    testCoverage: boolean;
    acceptanceCriteria: boolean;
  };
  reviewedAt: string;
}

/**
 * チケット詳細（統合型）
 */
interface TicketDetail {
  id: string;
  type: 'parent' | 'child' | 'grandchild';
  projectId?: string;
  parentId?: string;
  instruction?: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  status: TicketStatus;
  workerType?: WorkerType;
  assignee?: string;
  gitBranch?: string;
  artifacts?: string[];
  reviewResult?: ReviewResult;
  metadata?: {
    priority: 'low' | 'medium' | 'high';
    deadline?: string;
    tags: string[];
  };
  createdAt: string;
  updatedAt: string;
  childCount?: number;
  grandchildCount?: number;
}

// =============================================================================
// ワーカータイプ設定
// =============================================================================

const WORKER_TYPE_CONFIG: Record<WorkerType, { label: string; icon: string }> = {
  research: { label: '調査', icon: '🔍' },
  design: { label: '設計', icon: '📐' },
  designer: { label: 'UI/UX', icon: '🎨' },
  developer: { label: '開発', icon: '💻' },
  test: { label: 'テスト', icon: '🧪' },
  reviewer: { label: 'レビュー', icon: '👀' },
};

// =============================================================================
// カスタムフック
// =============================================================================

/**
 * チケット詳細を取得するカスタムフック
 */
function useTicketDetail(ticketId: string): {
  ticket: TicketDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTicket = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}`);
      const result: ApiResponse<TicketDetail> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'チケットの取得に失敗しました');
      }

      setTicket(result.data || null);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  return {
    ticket,
    isLoading,
    error,
    refresh: fetchTicket,
  };
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * 情報行コンポーネント
 */
interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function InfoRow({ label, value, mono = false }: InfoRowProps): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b border-bg-tertiary last:border-b-0">
      <dt className="text-sm text-text-muted w-40 flex-shrink-0 mb-1 sm:mb-0">
        {label}
      </dt>
      <dd className={`text-sm text-text-primary ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * レビュー結果表示
 */
function ReviewResultDisplay({ result }: { result: ReviewResult }): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${result.approved ? 'text-status-pass' : 'text-status-fail'}`}>
          {result.approved ? '✓ 承認' : '✗ 却下'}
        </span>
        <span className="text-xs text-text-muted">
          by {result.reviewerId}
        </span>
      </div>

      {result.feedback && (
        <div className="bg-bg-tertiary/50 rounded p-3">
          <p className="text-sm text-text-secondary whitespace-pre-wrap">
            {result.feedback}
          </p>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs">
        <span className={result.checklist.codeQuality ? 'text-status-pass' : 'text-status-fail'}>
          {result.checklist.codeQuality ? '✓' : '✗'} コード品質
        </span>
        <span className={result.checklist.testCoverage ? 'text-status-pass' : 'text-status-fail'}>
          {result.checklist.testCoverage ? '✓' : '✗'} テストカバレッジ
        </span>
        <span className={result.checklist.acceptanceCriteria ? 'text-status-pass' : 'text-status-fail'}>
          {result.checklist.acceptanceCriteria ? '✓' : '✗'} 受け入れ基準
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * チケット詳細ページ
 * @requirements 7.6 - チケット詳細表示
 */
export default function TicketDetailPage(): JSX.Element {
  const params = useParams();
  const ticketId = params.id as string;

  const { ticket, isLoading, error, refresh } = useTicketDetail(ticketId);

  /**
   * 日付フォーマット
   */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="チケットを読み込み中..." size="lg" />
      </div>
    );
  }

  // エラー状態
  if (error || !ticket) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <ErrorDisplay
          message="チケットの読み込みに失敗しました"
          details={error || 'チケットが見つかりません'}
          onRetry={refresh}
        />
      </div>
    );
  }

  // チケットタイプに応じたラベル
  const typeLabels = {
    parent: '親チケット',
    child: '子チケット',
    grandchild: '孫チケット',
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* パンくずリスト */}
      <nav className="mb-6">
        <ol className="flex items-center gap-2 text-sm">
          <li>
            <Link
              href="/tickets"
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              Tickets
            </Link>
          </li>
          <li className="text-text-muted">/</li>
          <li className="text-text-primary">{ticket.id}</li>
        </ol>
      </nav>

      {/* ページヘッダー */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-text-muted px-2 py-0.5 bg-bg-tertiary rounded">
              {typeLabels[ticket.type]}
            </span>
            <StatusBadge status={ticket.status} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            {ticket.title || ticket.instruction || ticket.id}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {ticket.id}
          </p>
        </div>
      </div>

      {/* 基本情報 */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">基本情報</h2>
        <dl>
          {ticket.projectId && (
            <InfoRow
              label="プロジェクト"
              value={
                <Link
                  href={`/projects/${ticket.projectId}`}
                  className="text-accent-primary hover:underline"
                >
                  {ticket.projectId}
                </Link>
              }
            />
          )}
          {ticket.parentId && (
            <InfoRow
              label="親チケット"
              value={
                <Link
                  href={`/tickets/${ticket.parentId}`}
                  className="text-accent-primary hover:underline"
                >
                  {ticket.parentId}
                </Link>
              }
            />
          )}
          {ticket.workerType && (
            <InfoRow
              label="ワーカータイプ"
              value={
                <span>
                  {WORKER_TYPE_CONFIG[ticket.workerType].icon}{' '}
                  {WORKER_TYPE_CONFIG[ticket.workerType].label}
                </span>
              }
            />
          )}
          {ticket.assignee && (
            <InfoRow label="アサイニー" value={ticket.assignee} />
          )}
          {ticket.gitBranch && (
            <InfoRow label="Gitブランチ" value={ticket.gitBranch} mono />
          )}
          {ticket.metadata?.priority && (
            <InfoRow
              label="優先度"
              value={
                <span className={
                  ticket.metadata.priority === 'high'
                    ? 'text-status-fail'
                    : ticket.metadata.priority === 'medium'
                    ? 'text-status-waiver'
                    : 'text-text-muted'
                }>
                  {ticket.metadata.priority.toUpperCase()}
                </span>
              }
            />
          )}
          {ticket.metadata?.deadline && (
            <InfoRow label="期限" value={formatDate(ticket.metadata.deadline)} />
          )}
          <InfoRow label="作成日時" value={formatDate(ticket.createdAt)} />
          <InfoRow label="更新日時" value={formatDate(ticket.updatedAt)} />
        </dl>
      </Card>

      {/* 説明・指示 */}
      {(ticket.description || ticket.instruction) && (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            {ticket.type === 'parent' ? '指示内容' : '説明'}
          </h2>
          <p className="text-text-secondary whitespace-pre-wrap">
            {ticket.description || ticket.instruction}
          </p>
        </Card>
      )}

      {/* 受け入れ基準 */}
      {ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0 && (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">受け入れ基準</h2>
          <ul className="space-y-2">
            {ticket.acceptanceCriteria.map((criteria, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-accent-primary mt-0.5">•</span>
                <span className="text-text-secondary">{criteria}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 成果物 */}
      {ticket.artifacts && ticket.artifacts.length > 0 && (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">成果物</h2>
          <ul className="space-y-2">
            {ticket.artifacts.map((artifact, index) => (
              <li key={index} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-text-secondary font-mono">{artifact}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* レビュー結果 */}
      {ticket.reviewResult && (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">レビュー結果</h2>
          <ReviewResultDisplay result={ticket.reviewResult} />
        </Card>
      )}

      {/* タグ */}
      {ticket.metadata?.tags && ticket.metadata.tags.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">タグ</h2>
          <div className="flex flex-wrap gap-2">
            {ticket.metadata.tags.map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 text-xs bg-bg-tertiary text-text-secondary rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
