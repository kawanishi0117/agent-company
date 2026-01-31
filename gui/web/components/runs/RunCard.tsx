/**
 * @file RunCard コンポーネント
 * @description Runカードコンポーネント - Run一覧上の個別Run表示
 * @requirements 4.4 - Runカードにはrun_id, ticket_id, status, start_time, end_timeを表示
 * @requirements 4.5 - judgment.jsonがある場合は判定ステータス（PASS/FAIL/WAIVER）を表示
 */

'use client';

import { Badge, getVariantFromStatus } from '../ui/Badge';
import { Card } from '../ui/Card';
import type { RunSummary, RunStatus, JudgmentStatus } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface RunCardProps {
  /** Run情報 */
  run: RunSummary;
  /** クリックハンドラ */
  onClick?: () => void;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================



/**
 * 日付を詳細な表示形式にフォーマット
 * @param dateString - ISO 8601形式の日付文字列
 * @returns フォーマットされた日付文字列
 */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 実行時間を計算してフォーマット
 * @param startTime - 開始時刻
 * @param endTime - 終了時刻（オプション）
 * @returns フォーマットされた実行時間
 */
function formatDuration(startTime: string, endTime?: string): string {
  if (!endTime) {
    return '実行中...';
  }

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const durationMs = end - start;

  // 1秒未満
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  // 1分未満
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}秒`;
  }
  // 1時間未満
  if (durationMs < 3600000) {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}分${seconds}秒`;
  }
  // それ以上
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  return `${hours}時間${minutes}分`;
}

/**
 * Runステータスの日本語ラベルを取得
 * @param status - Runステータス
 * @returns 日本語ラベル
 */
function getRunStatusLabel(status: RunStatus): string {
  const labels: Record<RunStatus, string> = {
    success: '成功',
    failure: '失敗',
    running: '実行中',
  };
  return labels[status];
}

/**
 * 判定ステータスの日本語ラベルを取得
 * @param status - 判定ステータス
 * @returns 日本語ラベル
 */
function getJudgmentLabel(status: JudgmentStatus): string {
  const labels: Record<JudgmentStatus, string> = {
    PASS: 'PASS',
    FAIL: 'FAIL',
    WAIVER: 'WAIVER',
  };
  return labels[status];
}

/**
 * 判定ステータスからバリアントを取得
 * @param status - 判定ステータス
 * @returns バッジバリアント
 */
function getJudgmentVariant(status: JudgmentStatus): 'pass' | 'fail' | 'waiver' {
  const variants: Record<JudgmentStatus, 'pass' | 'fail' | 'waiver'> = {
    PASS: 'pass',
    FAIL: 'fail',
    WAIVER: 'waiver',
  };
  return variants[status];
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * Runカードコンポーネント
 * Run一覧で個別のRunを表示
 */
export function RunCard({ run, onClick }: RunCardProps): JSX.Element {
  return (
    <Card
      onClick={onClick}
      className="w-full text-left group"
      data-testid="run-card"
    >
      {/* ヘッダー: Run ID とステータス */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Run ID */}
          <span className="text-xs font-mono text-text-muted truncate max-w-[180px]">
            {run.runId}
          </span>
        </div>
        
        {/* ステータスバッジ */}
        <div className="flex items-center gap-2">
          {/* 判定ステータス（存在する場合） */}
          {run.judgment && (
            <Badge
              variant={getJudgmentVariant(run.judgment.status)}
              size="sm"
            >
              {getJudgmentLabel(run.judgment.status)}
            </Badge>
          )}
          
          {/* 実行ステータス */}
          <Badge
            variant={getVariantFromStatus(run.status)}
            size="sm"
          >
            {getRunStatusLabel(run.status)}
          </Badge>
        </div>
      </div>

      {/* チケットID */}
      <div className="flex items-center gap-2 mb-3">
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
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <span className="text-sm text-text-secondary group-hover:text-accent-primary transition-colors">
          チケット #{run.ticketId}
        </span>
      </div>

      {/* 時間情報 */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        {/* 開始時刻 */}
        <div className="flex items-center gap-1.5">
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{formatDateTime(run.startTime)}</span>
        </div>

        {/* 実行時間 */}
        <div className="flex items-center gap-1.5">
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
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span>{formatDuration(run.startTime, run.endTime)}</span>
        </div>
      </div>

      {/* 成果物数（存在する場合） */}
      {run.artifacts && run.artifacts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-bg-tertiary">
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
            <span>{run.artifacts.length}件の成果物</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export default RunCard;
