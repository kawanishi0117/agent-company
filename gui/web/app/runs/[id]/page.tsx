/**
 * @file Run詳細ページ
 * @description Run詳細画面 - ログ、成果物、判定の詳細表示
 * @requirements 4.6 - Runカードクリックでログと成果物を含む詳細を表示
 * @requirements 4.7 - Run詳細にはログ、成果物リンク、判定詳細を表示
 * @requirements 4.8 - 成果物リンククリックで成果物を開く/ダウンロード
 */

'use client';

import { useRouter, useParams } from 'next/navigation';
import { useCallback } from 'react';
import { RunDetail } from '@/components/runs/RunDetail';

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * Run詳細ページコンポーネント
 * 指定されたRunの詳細情報（ログ、成果物、判定）を表示
 * @requirements 4.6 - Runカードクリックでログと成果物を含む詳細を表示
 * @requirements 4.7 - Run詳細にはログ、成果物リンク、判定詳細を表示
 * @requirements 4.8 - 成果物リンククリックで成果物を開く/ダウンロード
 */
export default function RunDetailPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();

  // URLパラメータからrunIdを取得
  // paramsは string | string[] | undefined の可能性があるため、適切に処理
  const runId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  /**
   * 一覧ページに戻るハンドラ
   * ブラウザの履歴を使用して戻る
   */
  const handleBack = useCallback((): void => {
    router.push('/runs');
  }, [router]);

  // runIdが取得できない場合のエラー表示
  if (!runId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <svg
          className="w-16 h-16 text-text-muted mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Run IDが指定されていません
        </h2>
        <p className="text-text-secondary mb-6">
          URLが正しくありません。一覧ページからRunを選択してください。
        </p>
        <button
          onClick={handleBack}
          className="
            flex items-center gap-2 px-4 py-2
            text-sm font-medium
            bg-accent-primary hover:bg-accent-hover
            text-white
            rounded-md
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary
          "
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
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          一覧に戻る
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Run詳細コンポーネント */}
      <RunDetail
        runId={runId}
        onBack={handleBack}
      />
    </div>
  );
}
