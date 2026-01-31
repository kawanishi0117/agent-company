/**
 * @file Card コンポーネント
 * @description 汎用カードコンポーネント
 * @requirements 7.1, 8.5 - カードとパネルは微妙なボーダーとシャドウで深みを表現
 */

import { ReactNode } from 'react';

interface CardProps {
  /** カードの内容 */
  children: ReactNode;
  /** 追加のCSSクラス */
  className?: string;
  /** クリックハンドラ（指定時はホバー効果が有効） */
  onClick?: () => void;
  /** パディングを無効化 */
  noPadding?: boolean;
  /** テスト用ID */
  'data-testid'?: string;
}

/**
 * 汎用カードコンポーネント
 * ダークテーマに適したスタイリング
 */
export function Card({
  children,
  className = '',
  onClick,
  noPadding = false,
  'data-testid': testId,
}: CardProps): JSX.Element {
  const baseClasses = `
    bg-bg-secondary
    border border-bg-tertiary
    rounded-lg
    shadow-md
    ${noPadding ? '' : 'p-4'}
    ${onClick ? 'cursor-pointer hover:bg-bg-tertiary hover:border-accent-primary transition-all duration-200' : ''}
  `;

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={`${baseClasses} ${className}`.trim()}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      data-testid={testId}
    >
      {children}
    </Component>
  );
}

export default Card;
