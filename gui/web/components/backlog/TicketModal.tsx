/**
 * @file TicketModal コンポーネント
 * @description チケット詳細モーダルコンポーネント
 * @requirements 3.5 - チケットカードクリックで詳細をモーダル表示
 * @requirements 3.6 - チケット詳細はMarkdownをHTMLとしてレンダリング
 */

'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Badge, getVariantFromStatus } from '../ui/Badge';
import { Loading } from '../ui/Loading';
import { Error as ErrorDisplay } from '../ui/Error';
import type { Ticket, TicketStatus } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface TicketModalProps {
  /** モーダルの表示状態 */
  isOpen: boolean;
  /** 閉じるハンドラ */
  onClose: () => void;
  /** 表示するチケットID */
  ticketId: string | null;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 日付をフォーマット
 * @param dateString - ISO 8601形式の日付文字列
 * @returns フォーマットされた日付文字列
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * ステータスの日本語ラベルを取得
 * @param status - チケットステータス
 * @returns 日本語ラベル
 */
function getStatusLabel(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    todo: 'Todo',
    doing: 'Doing',
    review: 'Review',
    done: 'Done',
  };
  return labels[status];
}

/**
 * MarkdownをHTMLに変換（簡易版）
 * @param markdown - Markdownテキスト
 * @returns HTML文字列
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // コードブロック（```）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="bg-bg-primary rounded-lg p-4 overflow-x-auto my-4"><code class="text-sm text-text-secondary">${escapeHtml(code.trim())}</code></pre>`;
  });

  // インラインコード（`）
  html = html.replace(/`([^`]+)`/g, '<code class="bg-bg-primary px-1.5 py-0.5 rounded text-sm text-accent-primary">$1</code>');

  // 見出し（H1-H4）
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold text-text-primary mt-4 mb-2">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-text-primary mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-text-primary mt-8 mb-4 pb-2 border-b border-bg-tertiary">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-text-primary mb-6">$1</h1>');

  // リスト（箇条書き）
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 text-text-secondary list-disc">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-3 space-y-1">$&</ul>');

  // 番号付きリスト
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-text-secondary list-decimal">$1</li>');

  // 太字
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>');

  // 斜体
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');

  // リンク
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // 段落
  html = html.replace(/\n\n/g, '</p><p class="text-text-secondary my-3">');
  html = `<p class="text-text-secondary my-3">${html}</p>`;

  // 空の段落を削除
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

  return html;
}

/**
 * HTMLエスケープ
 * @param text - エスケープするテキスト
 * @returns エスケープされたテキスト
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * チケット詳細モーダルコンポーネント
 * チケットの詳細情報をモーダルで表示
 */
export function TicketModal({
  isOpen,
  onClose,
  ticketId,
}: TicketModalProps): JSX.Element | null {
  // ステート
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // チケット詳細を取得
  useEffect(() => {
    if (!isOpen || !ticketId) {
      setTicket(null);
      setError(null);
      return;
    }

    const fetchTicket = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/backlog/${ticketId}`);
        const data = await response.json();

        if (!response.ok) {
          const errorMessage: string = data.error || 'チケットの取得に失敗しました';
          throw new Error(errorMessage);
        }

        setTicket(data.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : '不明なエラー';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTicket();
  }, [isOpen, ticketId]);

  // モーダルが閉じている場合は何も表示しない
  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={ticket ? `#${ticket.id} ${ticket.title}` : 'チケット詳細'}
      size="xl"
    >
      {/* ローディング状態 */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loading size="lg" message="チケットを読み込み中..." />
        </div>
      )}

      {/* エラー状態 */}
      {error && (
        <ErrorDisplay
          message={error}
          onRetry={() => {
            if (ticketId) {
              setError(null);
              setIsLoading(true);
              fetch(`/api/backlog/${ticketId}`)
                .then((res) => res.json())
                .then((data) => {
                  if (data.error) throw new Error(data.error);
                  setTicket(data.data);
                })
                .catch((err) => setError(err.message))
                .finally(() => setIsLoading(false));
            }
          }}
        />
      )}

      {/* チケット詳細 */}
      {ticket && !isLoading && !error && (
        <div className="space-y-6">
          {/* メタ情報 */}
          <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-bg-tertiary">
            {/* ステータス */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">ステータス:</span>
              <Badge variant={getVariantFromStatus(ticket.status)}>
                {getStatusLabel(ticket.status)}
              </Badge>
            </div>

            {/* 担当者 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">担当者:</span>
              <span className="text-sm text-text-primary">
                {ticket.assignee || '未割当'}
              </span>
            </div>
          </div>

          {/* 日時情報 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-muted">作成日時:</span>
              <span className="ml-2 text-text-secondary">
                {formatDate(ticket.created)}
              </span>
            </div>
            <div>
              <span className="text-text-muted">更新日時:</span>
              <span className="ml-2 text-text-secondary">
                {formatDate(ticket.updated)}
              </span>
            </div>
          </div>

          {/* Markdownコンテンツ */}
          <div className="pt-4 border-t border-bg-tertiary">
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: markdownToHtml(ticket.content),
              }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default TicketModal;
