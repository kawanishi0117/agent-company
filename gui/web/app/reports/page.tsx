/**
 * @file Reports ページ
 * @description レポート画面 - 日次/週次レポートをタブで切り替えて表示
 * @requirements 5.1 - workflows/reports/daily/とworkflows/reports/weekly/からレポートを表示
 * @requirements 5.2 - レポートはタブで分類（Daily, Weekly）
 * @requirements 5.5 - レポートカードクリックで全文を表示
 * @requirements 5.7 - レポートが存在しない場合は空状態メッセージを表示
 * @requirements 5.8 - レポートは新しい順（降順）でソート
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { ReportList } from '@/components/reports/ReportList';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay } from '@/components/ui/Error';
import type { ReportSummary, Report, GroupedReports, ApiResponse, ReportType } from '@/lib/types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * タブID
 */
const TAB_IDS = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  AUTO_DAILY: 'auto-daily',
  AUTO_WEEKLY: 'auto-weekly',
} as const;

// =============================================================================
// カスタムフック
// =============================================================================

/**
 * レポートデータを取得・管理するカスタムフック
 * @returns レポートデータ、ローディング状態、エラー状態、リフレッシュ関数
 */
function useReports(): {
  dailyReports: ReportSummary[];
  weeklyReports: ReportSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  // 状態管理
  const [dailyReports, setDailyReports] = useState<ReportSummary[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<ReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * レポートデータを取得
   */
  const fetchReports = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/reports');
      const result: ApiResponse<GroupedReports> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'レポートの取得に失敗しました');
      }

      // データを設定（新しい順にソート済みのはず）
      // @requirements 5.8 - レポートは新しい順（降順）でソート
      setDailyReports(result.data?.daily || []);
      setWeeklyReports(result.data?.weekly || []);
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
    await fetchReports();
  }, [fetchReports]);

  // 初回データ取得
  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  return {
    dailyReports,
    weeklyReports,
    isLoading,
    error,
    refresh,
  };
}

/**
 * レポート詳細を取得するカスタムフック
 * @param type - レポートタイプ
 * @param filename - ファイル名
 * @returns レポート詳細、ローディング状態、エラー状態
 */
function useReportDetail(
  type: ReportType | null,
  filename: string | null
): {
  report: Report | null;
  isLoading: boolean;
  error: string | null;
} {
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // typeまたはfilenameがnullの場合はリセット
    if (!type || !filename) {
      setReport(null);
      setError(null);
      return;
    }

    const fetchReportDetail = async (): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/reports/${type}/${encodeURIComponent(filename)}`);
        const result: ApiResponse<Report> = await response.json();

        if (!response.ok || result.error) {
          throw new Error(result.error || 'レポートの取得に失敗しました');
        }

        setReport(result.data || null);
      } catch (err) {
        const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchReportDetail();
  }, [type, filename]);

  return {
    report,
    isLoading,
    error,
  };
}

// =============================================================================
// 自動生成レポート用フック
// =============================================================================

/** 自動生成レポートの型 */
interface AutoReport {
  id: string;
  date: string;
  type: 'daily' | 'weekly';
  summary: string;
  metrics?: Record<string, number>;
  generatedAt: string;
}

/**
 * 自動生成レポートを取得するカスタムフック
 * @see Requirements: 4.4, 4.5, 4.6
 */
function useAutoReports(): {
  dailyAuto: AutoReport[];
  weeklyAuto: AutoReport[];
  isLoading: boolean;
} {
  const [dailyAuto, setDailyAuto] = useState<AutoReport[]>([]);
  const [weeklyAuto, setWeeklyAuto] = useState<AutoReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [dailyRes, weeklyRes] = await Promise.all([
          fetch('/api/reports/daily').catch(() => null),
          fetch('/api/reports/weekly').catch(() => null),
        ]);
        if (dailyRes?.ok) {
          const json = await dailyRes.json();
          setDailyAuto(json.data ?? []);
        }
        if (weeklyRes?.ok) {
          const json = await weeklyRes.json();
          setWeeklyAuto(json.data ?? []);
        }
      } catch {
        // 失敗時は空配列を維持
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  return { dailyAuto, weeklyAuto, isLoading };
}

/** 自動生成レポートカード */
function AutoReportCard({ report }: { report: AutoReport }): JSX.Element {
  return (
    <div className="p-4 rounded-lg bg-bg-tertiary/30 border border-bg-tertiary hover:border-slate-500 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-primary">{report.date}</span>
        <span className="text-xs text-text-muted">
          {new Date(report.generatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="text-sm text-text-secondary line-clamp-3">{report.summary}</p>
      {report.metrics && Object.keys(report.metrics).length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-bg-tertiary">
          {Object.entries(report.metrics).map(([key, val]) => (
            <span key={key} className="text-xs text-text-muted">
              {key}: <span className="text-text-secondary font-medium">{val}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 自動生成レポートリスト */
function AutoReportList({ reports }: { reports: AutoReport[] }): JSX.Element {
  if (reports.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted">
        自動生成レポートはありません
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <AutoReportCard key={r.id} report={r} />
      ))}
    </div>
  );
}

/** 自動生成日報アイコン */
function AutoDailyIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

/** 自動生成週報アイコン */
function AutoWeeklyIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  );
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
          Reports
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          日次・週次レポート
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
 * レポート詳細モーダルコンポーネント
 * @requirements 5.5 - レポートカードクリックで全文を表示
 * @requirements 5.6 - レポートコンテンツはMarkdownからHTMLに変換して表示
 */
interface ReportDetailModalProps {
  /** モーダルの表示状態 */
  isOpen: boolean;
  /** 閉じるハンドラ */
  onClose: () => void;
  /** レポート詳細 */
  report: Report | null;
  /** ローディング状態 */
  isLoading: boolean;
  /** エラーメッセージ */
  error: string | null;
}

function ReportDetailModal({
  isOpen,
  onClose,
  report,
  isLoading,
  error,
}: ReportDetailModalProps): JSX.Element {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={report?.title || 'レポート詳細'}
      size="xl"
    >
      {/* ローディング状態 */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loading message="レポートを読み込み中..." />
        </div>
      )}

      {/* エラー状態 */}
      {error && !isLoading && (
        <ErrorDisplay
          message="レポートの読み込みに失敗しました"
          details={error}
        />
      )}

      {/* レポート詳細 */}
      {report && !isLoading && !error && (
        <div className="space-y-4">
          {/* メタ情報 */}
          <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-bg-tertiary">
            {/* 日付 */}
            <div className="flex items-center gap-2 text-sm text-text-secondary">
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>{formatDate(report.date)}</span>
            </div>

            {/* タイプ */}
            <div className="flex items-center gap-2 text-sm text-text-secondary">
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
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <span>{report.type === 'daily' ? '日次レポート' : '週次レポート'}</span>
            </div>

            {/* ファイル名 */}
            <div className="flex items-center gap-2 text-sm text-text-muted">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>{report.filename}</span>
            </div>
          </div>

          {/* Markdownコンテンツ */}
          {/* @requirements 5.6 - MarkdownをHTMLに変換して表示 */}
          <div
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-text-primary
              prose-p:text-text-secondary
              prose-a:text-accent-primary
              prose-strong:text-text-primary
              prose-code:text-accent-primary prose-code:bg-bg-tertiary prose-code:px-1 prose-code:rounded
              prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-bg-tertiary
              prose-ul:text-text-secondary
              prose-ol:text-text-secondary
              prose-li:text-text-secondary
              prose-blockquote:border-accent-primary prose-blockquote:text-text-muted
            "
            dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(report.content) }}
          />
        </div>
      )}
    </Modal>
  );
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 日付を表示形式にフォーマット
 * @param dateString - YYYY-MM-DD形式の日付文字列
 * @returns フォーマットされた日付文字列
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * MarkdownをHTMLに変換（簡易版）
 * @param markdown - Markdownテキスト
 * @returns HTML文字列
 * @requirements 5.6 - MarkdownをHTMLに変換して表示
 */
function convertMarkdownToHtml(markdown: string): string {
  // 簡易的なMarkdown→HTML変換
  // 本番環境では marked や remark などのライブラリを使用することを推奨
  let html = markdown;

  // XSS対策: HTMLエスケープ
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 見出し（h1-h6）
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 太字
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // インラインコード
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // コードブロック
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.slice(3, -3).replace(/^\w+\n/, ''); // 言語指定を除去
    return `<pre><code>${code}</code></pre>`;
  });

  // リンク
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 水平線
  html = html.replace(/^---$/gm, '<hr />');

  // リスト（箇条書き）
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // 番号付きリスト
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // 引用
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 段落（空行で区切られたテキスト）
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  // 不要な空のタグを削除
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr \/>)/g, '$1');
  html = html.replace(/(<hr \/>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

  return html;
}

// =============================================================================
// タブアイコン
// =============================================================================

/**
 * 日次レポートアイコン
 */
function DailyIcon(): JSX.Element {
  return (
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
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

/**
 * 週次レポートアイコン
 */
function WeeklyIcon(): JSX.Element {
  return (
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
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * Reportsページコンポーネント
 * 日次・週次レポートをタブで切り替えて表示
 * @requirements 5.1 - workflows/reports/daily/とworkflows/reports/weekly/からレポートを表示
 * @requirements 5.2 - レポートはタブで分類（Daily, Weekly）
 * @requirements 5.5 - レポートカードクリックで全文を表示
 * @requirements 5.7 - レポートが存在しない場合は空状態メッセージを表示
 * @requirements 5.8 - レポートは新しい順（降順）でソート
 */
export default function ReportsPage(): JSX.Element {
  // レポートデータ取得
  const { dailyReports, weeklyReports, isLoading, error, refresh } = useReports();
  // 自動生成レポートデータ取得
  const { dailyAuto, weeklyAuto, isLoading: autoLoading } = useAutoReports();

  // モーダル状態
  const [selectedReport, setSelectedReport] = useState<{
    type: ReportType;
    filename: string;
  } | null>(null);

  // レポート詳細取得
  const {
    report: reportDetail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useReportDetail(
    selectedReport?.type || null,
    selectedReport?.filename || null
  );

  /**
   * レポートカードクリックハンドラ
   * @requirements 5.5 - レポートカードクリックで全文を表示
   */
  const handleReportClick = useCallback((report: ReportSummary): void => {
    setSelectedReport({
      type: report.type,
      filename: report.filename,
    });
  }, []);

  /**
   * モーダルを閉じる
   */
  const handleCloseModal = useCallback((): void => {
    setSelectedReport(null);
  }, []);

  // ローディング状態（初回のみ）
  if (isLoading && dailyReports.length === 0 && weeklyReports.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="レポートを読み込み中..." size="lg" />
      </div>
    );
  }

  // エラー状態（データがない場合）
  if (error && dailyReports.length === 0 && weeklyReports.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <ErrorDisplay
          message="レポートの読み込みに失敗しました"
          details={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  // タブ定義
  // @requirements 5.2 - レポートはタブで分類（Daily, Weekly）
  const tabs = [
    {
      id: TAB_IDS.DAILY,
      label: 'Daily',
      icon: <DailyIcon />,
      badge: dailyReports.length,
      content: (
        <ReportList
          reports={dailyReports}
          isLoading={false}
          error={null}
          onRetry={refresh}
          onReportClick={handleReportClick}
        />
      ),
    },
    {
      id: TAB_IDS.WEEKLY,
      label: 'Weekly',
      icon: <WeeklyIcon />,
      badge: weeklyReports.length,
      content: (
        <ReportList
          reports={weeklyReports}
          isLoading={false}
          error={null}
          onRetry={refresh}
          onReportClick={handleReportClick}
        />
      ),
    },
    {
      id: TAB_IDS.AUTO_DAILY,
      label: '自動日報',
      icon: <AutoDailyIcon />,
      badge: dailyAuto.length,
      content: autoLoading
        ? <div className="py-8 text-center text-text-muted">読み込み中...</div>
        : <AutoReportList reports={dailyAuto} />,
    },
    {
      id: TAB_IDS.AUTO_WEEKLY,
      label: '自動週報',
      icon: <AutoWeeklyIcon />,
      badge: weeklyAuto.length,
      content: autoLoading
        ? <div className="py-8 text-center text-text-muted">読み込み中...</div>
        : <AutoReportList reports={weeklyAuto} />,
    },
  ];

  // 通常表示
  return (
    <>
      {/* ページヘッダー */}
      <PageHeader
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

      {/* タブ */}
      {/* @requirements 5.2 - レポートはタブで分類（Daily, Weekly） */}
      <Tabs
        tabs={tabs}
        defaultTab={TAB_IDS.DAILY}
      />

      {/* レポート詳細モーダル */}
      {/* @requirements 5.5 - レポートカードクリックで全文を表示 */}
      <ReportDetailModal
        isOpen={selectedReport !== null}
        onClose={handleCloseModal}
        report={reportDetail}
        isLoading={isDetailLoading}
        error={detailError}
      />
    </>
  );
}
