/**
 * @file StatusIndicator コンポーネント
 * @description 社員のリアルタイムステータスを色付きドットで表示
 * @see Requirements: 1.3, 2.2
 */

'use client';

// =============================================================================
// 型定義
// =============================================================================

/** ステータスタイプ */
type EmployeeStatusType = 'idle' | 'working' | 'in_meeting' | 'reviewing' | 'on_break' | 'offline';

interface StatusIndicatorProps {
  /** 現在のステータス */
  status: string;
  /** サイズ */
  size?: 'sm' | 'md' | 'lg';
  /** ラベルを表示するか */
  showLabel?: boolean;
}

// =============================================================================
// ステータス設定マップ
// =============================================================================

const STATUS_CONFIG: Record<EmployeeStatusType, { color: string; pulse: boolean; label: string }> = {
  idle: { color: 'bg-slate-400', pulse: false, label: 'アイドル' },
  working: { color: 'bg-green-500', pulse: true, label: '作業中' },
  in_meeting: { color: 'bg-blue-500', pulse: true, label: '会議中' },
  reviewing: { color: 'bg-yellow-500', pulse: true, label: 'レビュー中' },
  on_break: { color: 'bg-orange-400', pulse: false, label: '休憩中' },
  offline: { color: 'bg-slate-600', pulse: false, label: 'オフライン' },
};

const SIZE_MAP = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * ステータスインジケータ
 * 社員の現在のステータスを色付きドットで表示する
 */
export function StatusIndicator({
  status,
  size = 'md',
  showLabel = false,
}: StatusIndicatorProps): JSX.Element {
  const config = STATUS_CONFIG[status as EmployeeStatusType] ?? STATUS_CONFIG.offline;
  const sizeClass = SIZE_MAP[size];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex">
        <span className={`${sizeClass} rounded-full ${config.color}`} />
        {config.pulse && (
          <span
            className={`absolute inset-0 ${sizeClass} rounded-full ${config.color} opacity-75 animate-ping`}
          />
        )}
      </span>
      {showLabel && (
        <span className="text-xs text-text-secondary">{config.label}</span>
      )}
    </span>
  );
}
