/**
 * @file ReportCard コンポーネント
 * @description レポートカードコンポーネント - レポート一覧上の個別レポート表示
 * @requirements 5.4 - レポートカードにはdate, title, summary（最初の100文字）を表示
 */

'use client';

import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import type { ReportSummary, ReportType } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface ReportCardProps {
  /** レポート情報 */
  report: ReportSummary;
  /** クリックハンドラ */
  onClick?: () => void;
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
    month: 'short',
    day: 'numeric',
  });
}

/**
 * レポートタイプの日本語ラベルを取得
 * @param type - レポートタイプ
 * @returns 日本語ラベル
 */
function getReportTypeLabel(type: ReportType): string {
  const labels: Record<ReportType, string> = {
    daily: '日次',
    weekly: '週次',
  };
  return labels[type];
}

/**
 * レポートタイプに応じたバッジバリアントを取得
 * @param type - レポートタイプ
 * @returns バッジバリアント
 */
function getReportTypeVariant(type: ReportType): 'running' | 'review' {
  // daily: 青（running）, weekly: 紫（review）
  return type === 'daily' ? 'running' : 'review';
}

/**
 * サマリーを指定文字数で切り詰める
 * @param summary - サマリー文字列
 * @param maxLength - 最大文字数（デフォルト: 100）
 * @returns 切り詰められたサマリー
 */
function truncateSummary(summary: string, maxLength: number = 100): string {
  if (summary.length <= maxLength) {
    return summary;
  }
  return summary.slice(0, maxLength).trim() + '...';
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * レポートカードコンポーネント
 * レポート一覧で個別のレポートを表示
 */
export function ReportCard({ report, onClick }: ReportCardProps): JSX.Element {
  return (
    <Card
      onClick={onClick}
      className="w-full text-left group"
    >
      {/* ヘッダー: 日付とタイプバッジ */}
      <div className="flex items-center justify-between mb-3">
        {/* 日付 */}
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-text-muted"
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
          <span className="text-sm text-text-secondary">
            {formatDate(report.date)}
          </span>
        </div>

        {/* タイプバッジ */}
        <Badge
          variant={getReportTypeVariant(report.type)}
          size="sm"
        >
          {getReportTypeLabel(report.type)}
        </Badge>
      </div>

      {/* タイトル */}
      <h3 className="text-base font-medium text-text-primary mb-3 line-clamp-2 group-hover:text-accent-primary transition-colors">
        {report.title}
      </h3>

      {/* サマリー（最初の100文字） */}
      <p className="text-sm text-text-muted line-clamp-3 leading-relaxed">
        {truncateSummary(report.summary)}
      </p>

      {/* フッター: ファイル名 */}
      <div className="mt-4 pt-3 border-t border-bg-tertiary">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <svg
            className="w-3.5 h-3.5"
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
          <span className="truncate">{report.filename}</span>
        </div>
      </div>
    </Card>
  );
}

export default ReportCard;
