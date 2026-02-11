/**
 * @file PhaseProgress コンポーネント
 * @description 5フェーズの水平ステッパー表示
 * @see Requirements: 16.2, 16.3, 16.4, 16.5
 */

'use client';

import type { WorkflowPhase, WorkflowStatus } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/** フェーズの表示状態 */
type PhaseState = 'completed' | 'active' | 'pending' | 'failed';

interface PhaseProgressProps {
  /** 現在のフェーズ */
  currentPhase: WorkflowPhase;
  /** ワークフローステータス */
  status: WorkflowStatus;
  /** コンパクト表示（カード用） */
  compact?: boolean;
  /** 追加CSSクラス */
  className?: string;
}

// =============================================================================
// 定数
// =============================================================================

/** フェーズ定義（順序付き） */
const PHASES: { key: WorkflowPhase; label: string; icon: string }[] = [
  { key: 'proposal', label: '提案', icon: '📋' },
  { key: 'approval', label: '承認', icon: '✅' },
  { key: 'development', label: '開発', icon: '⚙️' },
  { key: 'quality_assurance', label: '品質確認', icon: '🔍' },
  { key: 'delivery', label: '納品', icon: '📦' },
];

/** フェーズのインデックスマップ */
const PHASE_INDEX: Record<WorkflowPhase, number> = {
  proposal: 0,
  approval: 1,
  development: 2,
  quality_assurance: 3,
  delivery: 4,
};

// =============================================================================
// ユーティリティ
// =============================================================================

/**
 * フェーズの表示状態を判定
 * @param phaseKey - 対象フェーズ
 * @param currentPhase - 現在のフェーズ
 * @param status - ワークフローステータス
 * @returns フェーズの表示状態
 */
function getPhaseState(
  phaseKey: WorkflowPhase,
  currentPhase: WorkflowPhase,
  status: WorkflowStatus
): PhaseState {
  const phaseIdx = PHASE_INDEX[phaseKey];
  const currentIdx = PHASE_INDEX[currentPhase];

  // 失敗・終了時は現在フェーズをfailedに
  if (phaseKey === currentPhase && (status === 'failed' || status === 'terminated')) {
    return 'failed';
  }
  // 完了済みフェーズ
  if (phaseIdx < currentIdx) {
    return 'completed';
  }
  // 現在のフェーズ
  if (phaseIdx === currentIdx && status !== 'completed') {
    return 'active';
  }
  // 全完了時
  if (status === 'completed') {
    return 'completed';
  }
  return 'pending';
}

/**
 * フェーズ状態に応じたスタイルを取得
 */
function getPhaseStyles(state: PhaseState): {
  circle: string;
  label: string;
  line: string;
} {
  switch (state) {
    case 'completed':
      return {
        circle: 'bg-status-pass border-status-pass text-white',
        label: 'text-status-pass',
        line: 'bg-status-pass',
      };
    case 'active':
      return {
        circle: 'bg-accent-primary/20 border-accent-primary text-accent-primary animate-pulse',
        label: 'text-accent-primary font-semibold',
        line: 'bg-bg-tertiary',
      };
    case 'failed':
      return {
        circle: 'bg-status-fail/20 border-status-fail text-status-fail',
        label: 'text-status-fail',
        line: 'bg-bg-tertiary',
      };
    default:
      return {
        circle: 'bg-bg-tertiary border-bg-tertiary text-text-muted',
        label: 'text-text-muted',
        line: 'bg-bg-tertiary',
      };
  }
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * フェーズ進捗ステッパーコンポーネント
 * 5フェーズの進捗を水平ステッパーで表示
 */
export function PhaseProgress({
  currentPhase,
  status,
  compact = false,
  className = '',
}: PhaseProgressProps): JSX.Element {
  return (
    <div
      className={`flex items-center ${compact ? 'gap-1' : 'gap-0'} ${className}`}
      role="progressbar"
      aria-label="ワークフロー進捗"
      aria-valuenow={PHASE_INDEX[currentPhase] + 1}
      aria-valuemin={1}
      aria-valuemax={5}
    >
      {PHASES.map((phase, idx) => {
        const state = getPhaseState(phase.key, currentPhase, status);
        const styles = getPhaseStyles(state);
        const isLast = idx === PHASES.length - 1;

        return (
          <div key={phase.key} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
            {/* フェーズ円 */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  flex items-center justify-center rounded-full border-2
                  ${compact ? 'w-6 h-6 text-xs' : 'w-10 h-10 text-base'}
                  ${styles.circle}
                  transition-all duration-300
                `}
                title={`${phase.label}: ${state}`}
              >
                {state === 'completed' ? (
                  <svg className={compact ? 'w-3 h-3' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : state === 'failed' ? (
                  <svg className={compact ? 'w-3 h-3' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <span>{compact ? '' : phase.icon}</span>
                )}
              </div>
              {/* ラベル（非コンパクト時のみ） */}
              {!compact && (
                <span className={`mt-2 text-xs whitespace-nowrap ${styles.label}`}>
                  {phase.label}
                </span>
              )}
            </div>

            {/* 接続線 */}
            {!isLast && (
              <div
                className={`
                  flex-1 mx-1
                  ${compact ? 'h-0.5 min-w-2' : 'h-1 min-w-8'}
                  ${styles.line}
                  rounded-full transition-all duration-300
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default PhaseProgress;
