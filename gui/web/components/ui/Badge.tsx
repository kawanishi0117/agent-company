/**
 * @file Badge コンポーネント
 * @description ステータスバッジコンポーネント
 * @requirements 8.4 - ステータスインジケーターは一貫した色を使用
 */

import { ReactNode } from 'react';

/**
 * バッジのバリアント（色のテーマ）
 */
type BadgeVariant =
  | 'pass'      // 緑: PASS, success, done
  | 'fail'      // 赤: FAIL, failure
  | 'waiver'    // 黄: WAIVER, warning
  | 'running'   // 青: running, doing
  | 'todo'      // グレー: todo
  | 'review'    // 紫: review
  | 'default';  // デフォルト

interface BadgeProps {
  /** バッジの内容 */
  children: ReactNode;
  /** バッジのバリアント */
  variant?: BadgeVariant;
  /** 追加のCSSクラス */
  className?: string;
  /** サイズ */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * バリアントに応じたスタイルを取得
 */
function getVariantClasses(variant: BadgeVariant): string {
  switch (variant) {
    case 'pass':
      return 'bg-status-pass/20 text-status-pass border-status-pass/30';
    case 'fail':
      return 'bg-status-fail/20 text-status-fail border-status-fail/30';
    case 'waiver':
      return 'bg-status-waiver/20 text-status-waiver border-status-waiver/30';
    case 'running':
      return 'bg-status-running/20 text-status-running border-status-running/30';
    case 'todo':
      return 'bg-text-muted/20 text-text-secondary border-text-muted/30';
    case 'review':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default:
      return 'bg-bg-tertiary text-text-secondary border-bg-tertiary';
  }
}

/**
 * サイズに応じたスタイルを取得
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'px-2 py-0.5 text-xs';
    case 'lg':
      return 'px-4 py-2 text-base';
    default:
      return 'px-3 py-1 text-sm';
  }
}

/**
 * ステータスバッジコンポーネント
 * 各種ステータスを視覚的に表示
 */
export function Badge({
  children,
  variant = 'default',
  className = '',
  size = 'md',
}: BadgeProps): JSX.Element {
  const variantClasses = getVariantClasses(variant);
  const sizeClasses = getSizeClasses(size);

  return (
    <span
      className={`
        inline-flex items-center justify-center
        font-medium rounded-full border
        ${variantClasses}
        ${sizeClasses}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  );
}

/**
 * ステータス文字列からバリアントを推測するヘルパー関数
 */
export function getVariantFromStatus(status: string): BadgeVariant {
  const normalizedStatus = status.toLowerCase();
  
  switch (normalizedStatus) {
    case 'pass':
    case 'success':
    case 'done':
      return 'pass';
    case 'fail':
    case 'failure':
    case 'error':
      return 'fail';
    case 'waiver':
    case 'warning':
      return 'waiver';
    case 'running':
    case 'doing':
    case 'in_progress':
      return 'running';
    case 'todo':
    case 'pending':
      return 'todo';
    case 'review':
      return 'review';
    default:
      return 'default';
  }
}

export default Badge;
