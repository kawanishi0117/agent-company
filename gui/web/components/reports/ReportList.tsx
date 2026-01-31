/**
 * @file ReportList コンポーネント
 * @description レポート一覧コンポーネント - レポートのリスト表示
 * @requirements 5.1 - Reports画面はworkflows/reports/からレポートを表示
 * @requirements 5.8 - レポートは新しい順（降順）でソート
 */

'use client';

import { ReportCard } from './ReportCard';
import { Loading } from '../ui/Loading';
import { Error as ErrorDisplay, EmptyState } from '../ui/Error';
import type { ReportSummary } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface ReportListProps {
  /** レポート一覧 */
  reports: ReportSummary[];
  /** ローディング状態 */
  isLoading?: boolean;
  /** エラーメッセージ */
  error?: string | null;
  /** リトライハンドラ */
  onRetry?: () => void;
  /** レポートクリックハンドラ */
  onReportClick?: (report: ReportSummary) => void;
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * レポート一覧コンポーネント
 * レポートのリストをカード形式で表示
 */
export function ReportList({
  reports,
  isLoading = false,
  error = null,
  onRetry,
  onReportClick,
}: ReportListProps): JSX.Element {
  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading size="lg" message="レポートを読み込み中..." />
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
  if (reports.length === 0) {
    return (
      <EmptyState
        icon={
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
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        }
        title="レポートがありません"
        description="まだレポートが作成されていません。日次・週次レポートが生成されると、ここに表示されます。"
      />
    );
  }

  // レポート一覧表示
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {reports.map((report) => (
        <ReportCard
          key={`${report.type}-${report.filename}`}
          report={report}
          onClick={onReportClick ? (): void => onReportClick(report) : undefined}
        />
      ))}
    </div>
  );
}

export default ReportList;
