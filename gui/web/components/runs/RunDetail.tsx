/**
 * @file RunDetail コンポーネント
 * @description Run詳細コンポーネント - ログ、成果物、判定の詳細表示
 * @requirements 4.7 - Run詳細にはログ、成果物リンク、判定詳細を表示
 */

'use client';

import { useEffect, useState } from 'react';
import { Badge, getVariantFromStatus } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Loading } from '../ui/Loading';
import { Error as ErrorDisplay } from '../ui/Error';
import type { Run, RunStatus, JudgmentStatus, CheckResult } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface RunDetailProps {
  /** Run ID */
  runId: string;
  /** 戻るハンドラ */
  onBack?: () => void;
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
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
    return `${(durationMs / 1000).toFixed(2)}秒`;
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
    PASS: '合格',
    FAIL: '不合格',
    WAIVER: '例外承認',
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

/**
 * チェック名の日本語ラベルを取得
 * @param checkName - チェック名
 * @returns 日本語ラベル
 */
function getCheckLabel(checkName: string): string {
  const labels: Record<string, string> = {
    lint: 'ESLint',
    test: 'ユニットテスト',
    e2e: 'E2Eテスト',
    format: 'フォーマット',
  };
  return labels[checkName] || checkName;
}

/**
 * ファイル名を取得
 * @param path - ファイルパス
 * @returns ファイル名
 */
function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * チェック結果表示コンポーネント
 */
function CheckResultItem({
  name,
  result,
}: {
  name: string;
  result: CheckResult;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2 border-b border-bg-tertiary last:border-b-0">
      <div className="flex items-center gap-2">
        {/* チェックアイコン */}
        {result.passed ? (
          <svg
            className="w-5 h-5 text-status-pass"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-status-fail"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )}
        <span className="text-sm text-text-primary">{getCheckLabel(name)}</span>
      </div>
      
      <Badge
        variant={result.passed ? 'pass' : 'fail'}
        size="sm"
      >
        {result.passed ? '成功' : '失敗'}
      </Badge>
    </div>
  );
}

/**
 * 成果物リンクコンポーネント
 */
function ArtifactLink({ path }: { path: string }): JSX.Element {
  const fileName = getFileName(path);
  
  return (
    <a
      href={`/api/artifacts/${encodeURIComponent(path)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-3 rounded-lg bg-bg-primary hover:bg-bg-tertiary transition-colors group"
    >
      {/* ファイルアイコン */}
      <svg
        className="w-5 h-5 text-text-muted group-hover:text-accent-primary transition-colors"
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
      
      <span className="text-sm text-text-secondary group-hover:text-accent-primary transition-colors truncate">
        {fileName}
      </span>
      
      {/* 外部リンクアイコン */}
      <svg
        className="w-4 h-4 text-text-muted ml-auto"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * Run詳細コンポーネント
 * Runの詳細情報（ログ、成果物、判定）を表示
 */
export function RunDetail({ runId, onBack }: RunDetailProps): JSX.Element {
  // ステート
  const [run, setRun] = useState<Run | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Run詳細を取得
  useEffect(() => {
    const fetchRun = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
        const data = await response.json();

        if (!response.ok) {
          const errorMessage: string = data.error || 'Runの取得に失敗しました';
          throw new Error(errorMessage);
        }

        setRun(data.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : '不明なエラー';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRun();
  }, [runId]);

  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading size="lg" message="Run詳細を読み込み中..." />
      </div>
    );
  }

  // エラー状態
  if (error) {
    return (
      <ErrorDisplay
        message={error}
        onRetry={() => {
          setError(null);
          setIsLoading(true);
          fetch(`/api/runs/${encodeURIComponent(runId)}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.error) throw new Error(data.error);
              setRun(data.data);
            })
            .catch((err) => setError(err.message))
            .finally(() => setIsLoading(false));
        }}
      />
    );
  }

  // Runが見つからない
  if (!run) {
    return (
      <ErrorDisplay
        message="Runが見つかりません"
        onRetry={onBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        {/* 戻るボタン */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>一覧に戻る</span>
          </button>
        )}
        
        {/* ステータスバッジ */}
        <div className="flex items-center gap-2">
          {run.judgment && (
            <Badge
              variant={getJudgmentVariant(run.judgment.status)}
              size="md"
            >
              {run.judgment.status}
            </Badge>
          )}
          <Badge
            variant={getVariantFromStatus(run.status)}
            size="md"
          >
            {getRunStatusLabel(run.status)}
          </Badge>
        </div>
      </div>

      {/* Run ID */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Run: {run.runId}
        </h1>
        <p className="text-sm text-text-muted">
          チケット #{run.ticketId}
        </p>
      </div>

      {/* メタ情報 */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          実行情報
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-muted">開始時刻:</span>
            <span className="ml-2 text-text-secondary">
              {formatDateTime(run.startTime)}
            </span>
          </div>
          <div>
            <span className="text-text-muted">終了時刻:</span>
            <span className="ml-2 text-text-secondary">
              {run.endTime ? formatDateTime(run.endTime) : '実行中'}
            </span>
          </div>
          <div>
            <span className="text-text-muted">実行時間:</span>
            <span className="ml-2 text-text-secondary">
              {formatDuration(run.startTime, run.endTime)}
            </span>
          </div>
          <div>
            <span className="text-text-muted">ステータス:</span>
            <span className="ml-2">
              <Badge
                variant={getVariantFromStatus(run.status)}
                size="sm"
              >
                {getRunStatusLabel(run.status)}
              </Badge>
            </span>
          </div>
        </div>
      </Card>

      {/* 判定結果（存在する場合） */}
      {run.judgment && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              品質判定
            </h2>
            <Badge
              variant={getJudgmentVariant(run.judgment.status)}
              size="md"
            >
              {getJudgmentLabel(run.judgment.status)}
            </Badge>
          </div>

          {/* チェック結果 */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-text-muted mb-2">
              チェック結果
            </h3>
            <div className="bg-bg-primary rounded-lg p-3">
              {Object.entries(run.judgment.checks).map(([name, result]) => (
                <CheckResultItem key={name} name={name} result={result} />
              ))}
            </div>
          </div>

          {/* 判定理由 */}
          {run.judgment.reasons.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-muted mb-2">
                判定理由
              </h3>
              <ul className="space-y-1">
                {run.judgment.reasons.map((reason, index) => (
                  <li
                    key={index}
                    className="text-sm text-text-secondary flex items-start gap-2"
                  >
                    <span className="text-text-muted">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Waiver ID（存在する場合） */}
          {run.judgment.waiver_id && (
            <div className="pt-3 border-t border-bg-tertiary">
              <span className="text-sm text-text-muted">Waiver ID:</span>
              <span className="ml-2 text-sm font-mono text-status-waiver">
                {run.judgment.waiver_id}
              </span>
            </div>
          )}

          {/* 判定日時 */}
          <div className="pt-3 border-t border-bg-tertiary text-xs text-text-muted">
            判定日時: {formatDateTime(run.judgment.timestamp)}
          </div>
        </Card>
      )}

      {/* 成果物 */}
      {run.artifacts && run.artifacts.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            成果物 ({run.artifacts.length}件)
          </h2>
          <div className="space-y-2">
            {run.artifacts.map((artifact, index) => (
              <ArtifactLink key={index} path={artifact} />
            ))}
          </div>
        </Card>
      )}

      {/* ログ */}
      {run.logs && run.logs.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            実行ログ
          </h2>
          <div className="bg-bg-primary rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-text-secondary font-mono whitespace-pre-wrap">
              {run.logs.join('\n')}
            </pre>
          </div>
        </Card>
      )}

      {/* ログが空の場合 */}
      {(!run.logs || run.logs.length === 0) && (
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            実行ログ
          </h2>
          <div className="text-center py-8 text-text-muted">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-50"
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
            <p className="text-sm">ログがありません</p>
          </div>
        </Card>
      )}
    </div>
  );
}

export default RunDetail;
