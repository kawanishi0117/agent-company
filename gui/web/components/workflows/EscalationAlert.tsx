/**
 * @file EscalationAlert コンポーネント
 * @description エスカレーションアラートパネル
 * @see Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 16.9
 */

'use client';

import { useState } from 'react';
import type { EscalationData } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/** エスカレーション決定 */
type EscalationAction = 'retry' | 'skip' | 'abort';

interface EscalationAlertProps {
  /** ワークフローID */
  workflowId: string;
  /** エスカレーション情報 */
  escalation: EscalationData;
  /** 決定送信ハンドラ */
  onSubmit: (action: EscalationAction, options?: string) => Promise<void>;
  /** 追加CSSクラス */
  className?: string;
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * エスカレーションアラートコンポーネント
 * ワーカー失敗時のCEO決定パネル
 */
export function EscalationAlert({
  workflowId,
  escalation,
  onSubmit,
  className = '',
}: EscalationAlertProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const [retryOptions, setRetryOptions] = useState('');
  const [selectedAction, setSelectedAction] = useState<EscalationAction | null>(null);

  /** 決定を送信 */
  const handleSubmit = async (action: EscalationAction): Promise<void> => {
    setSubmitting(true);
    setSelectedAction(action);
    try {
      await onSubmit(action, action === 'retry' ? retryOptions : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`
        border-2 border-status-fail rounded-lg p-6
        bg-status-fail/5 animate-pulse-slow
        ${className}
      `}
      role="alert"
      aria-label="エスカレーションアラート"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl animate-bounce">⚠️</span>
        <div>
          <h3 className="text-lg font-semibold text-status-fail">
            エスカレーション: ワーカー失敗
          </h3>
          <p className="text-xs text-text-muted">
            ワークフロー: {workflowId}
          </p>
        </div>
      </div>

      {/* 失敗詳細 */}
      <div className="mb-4 p-4 bg-bg-secondary rounded-md border border-bg-tertiary space-y-2">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-text-muted">タスクID:</span>
            <span className="ml-2 text-text-primary font-mono text-xs">{escalation.taskId}</span>
          </div>
          <div>
            <span className="text-text-muted">ワーカータイプ:</span>
            <span className="ml-2 text-text-primary">{escalation.workerType}</span>
          </div>
          <div>
            <span className="text-text-muted">リトライ回数:</span>
            <span className="ml-2 text-status-waiver font-medium">{escalation.retryCount}回</span>
          </div>
          <div>
            <span className="text-text-muted">発生日時:</span>
            <span className="ml-2 text-text-secondary text-xs">
              {new Date(escalation.timestamp).toLocaleString('ja-JP')}
            </span>
          </div>
        </div>
        <div className="pt-2 border-t border-bg-tertiary">
          <span className="text-text-muted text-sm">エラー:</span>
          <p className="mt-1 text-sm text-status-fail bg-status-fail/10 p-2 rounded font-mono">
            {escalation.error}
          </p>
        </div>
      </div>

      {/* リトライオプション入力 */}
      <div className="mb-4">
        <label htmlFor="retry-options" className="block text-sm text-text-secondary mb-2">
          リトライオプション（retry選択時に使用）
        </label>
        <input
          id="retry-options"
          type="text"
          value={retryOptions}
          onChange={(e) => setRetryOptions(e.target.value)}
          placeholder="追加パラメータ（任意）"
          className="
            w-full px-4 py-2 text-sm rounded-md
            bg-bg-secondary border border-bg-tertiary text-text-primary
            placeholder:text-text-muted
            focus:border-accent-primary focus:outline-none
            transition-colors
          "
          disabled={submitting}
        />
      </div>

      {/* アクションボタン */}
      <div className="flex gap-3">
        <button
          onClick={() => handleSubmit('retry')}
          disabled={submitting}
          className="
            flex-1 px-4 py-2.5 rounded-md text-sm font-medium
            bg-accent-primary/20 text-accent-primary border border-accent-primary/30
            hover:bg-accent-primary/30 disabled:opacity-50
            transition-all duration-200
          "
        >
          {submitting && selectedAction === 'retry' ? '送信中...' : '🔄 リトライ'}
        </button>
        <button
          onClick={() => handleSubmit('skip')}
          disabled={submitting}
          className="
            flex-1 px-4 py-2.5 rounded-md text-sm font-medium
            bg-status-waiver/20 text-status-waiver border border-status-waiver/30
            hover:bg-status-waiver/30 disabled:opacity-50
            transition-all duration-200
          "
        >
          {submitting && selectedAction === 'skip' ? '送信中...' : '⏭ スキップ'}
        </button>
        <button
          onClick={() => handleSubmit('abort')}
          disabled={submitting}
          className="
            flex-1 px-4 py-2.5 rounded-md text-sm font-medium
            bg-status-fail/20 text-status-fail border border-status-fail/30
            hover:bg-status-fail/30 disabled:opacity-50
            transition-all duration-200
          "
        >
          {submitting && selectedAction === 'abort' ? '送信中...' : '🛑 中止'}
        </button>
      </div>
    </div>
  );
}

export default EscalationAlert;
