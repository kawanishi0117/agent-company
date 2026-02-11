/**
 * @file RollbackDialog コンポーネント
 * @description ロールバック確認ダイアログ
 * @see Requirements: 9.11
 */

'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { WorkflowPhase } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface RollbackDialogProps {
  /** ダイアログ表示状態 */
  isOpen: boolean;
  /** 閉じるハンドラ */
  onClose: () => void;
  /** ロールバック実行ハンドラ */
  onConfirm: (targetPhase: WorkflowPhase) => Promise<void>;
  /** 現在のフェーズ */
  currentPhase: WorkflowPhase;
  /** ワークフローID */
  workflowId: string;
}

// =============================================================================
// 定数
// =============================================================================

/** ロールバック可能なフェーズ（現在より前のフェーズ） */
const PHASE_ORDER: WorkflowPhase[] = [
  'proposal',
  'approval',
  'development',
  'quality_assurance',
  'delivery',
];

/** フェーズラベル */
const PHASE_LABELS: Record<WorkflowPhase, string> = {
  proposal: '提案',
  approval: '承認',
  development: '開発',
  quality_assurance: '品質確認',
  delivery: '納品',
};

/** ロールバック影響の説明 */
const ROLLBACK_IMPACTS: Record<WorkflowPhase, string> = {
  proposal: '提案フェーズからやり直します。会議が再度開催され、新しい提案書が作成されます。',
  approval: '承認フェーズに戻ります。提案書の再承認が必要です。',
  development: '開発フェーズに戻ります。タスクが再実行されます。',
  quality_assurance: '品質確認フェーズに戻ります。品質チェックが再実行されます。',
  delivery: '納品フェーズに戻ります。',
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * ロールバック確認ダイアログ
 * フェーズのロールバック先を選択して実行
 */
export function RollbackDialog({
  isOpen,
  onClose,
  onConfirm,
  currentPhase,
  workflowId,
}: RollbackDialogProps): JSX.Element | null {
  const [targetPhase, setTargetPhase] = useState<WorkflowPhase | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 現在のフェーズより前のフェーズのみ選択可能
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const availablePhases = PHASE_ORDER.filter((_, idx) => idx < currentIdx);

  /** ロールバック実行 */
  const handleConfirm = async (): Promise<void> => {
    if (!targetPhase) return;
    setSubmitting(true);
    try {
      await onConfirm(targetPhase);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="フェーズロールバック" size="md">
      <div className="space-y-4">
        {/* 説明 */}
        <div className="p-3 bg-status-waiver/10 border border-status-waiver/30 rounded-md">
          <p className="text-sm text-status-waiver">
            ⚠️ ロールバックは現在のフェーズの進捗をリセットします。この操作は取り消せません。
          </p>
        </div>

        {/* ワークフロー情報 */}
        <div className="text-sm text-text-secondary">
          <span className="text-text-muted">ワークフロー:</span>{' '}
          <span className="font-mono text-xs">{workflowId}</span>
          <br />
          <span className="text-text-muted">現在のフェーズ:</span>{' '}
          <span className="text-text-primary">{PHASE_LABELS[currentPhase]}</span>
        </div>

        {/* ロールバック先選択 */}
        {availablePhases.length > 0 ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              ロールバック先を選択:
            </label>
            {availablePhases.map((phase) => (
              <button
                key={phase}
                onClick={() => setTargetPhase(phase)}
                className={`
                  w-full text-left p-3 rounded-md border transition-all duration-200
                  ${
                    targetPhase === phase
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-bg-tertiary bg-bg-secondary hover:border-text-muted'
                  }
                `}
              >
                <div className="text-sm font-medium text-text-primary">
                  {PHASE_LABELS[phase]}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {ROLLBACK_IMPACTS[phase]}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            現在のフェーズ（{PHASE_LABELS[currentPhase]}）は最初のフェーズのため、ロールバックできません。
          </p>
        )}

        {/* アクションボタン */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="
              flex-1 px-4 py-2.5 rounded-md text-sm font-medium
              bg-bg-tertiary text-text-secondary
              hover:bg-bg-tertiary/80 transition-colors
            "
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={!targetPhase || submitting}
            className="
              flex-1 px-4 py-2.5 rounded-md text-sm font-medium
              bg-status-waiver/20 text-status-waiver border border-status-waiver/30
              hover:bg-status-waiver/30 disabled:opacity-50
              transition-all duration-200
            "
          >
            {submitting ? 'ロールバック中...' : 'ロールバック実行'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default RollbackDialog;
