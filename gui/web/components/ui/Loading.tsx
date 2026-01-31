/**
 * @file Loading コンポーネント
 * @description ローディングスピナーコンポーネント
 * @requirements 7.1, 7.5 - ローディング状態はページ全体をブロックしない
 */

interface LoadingProps {
  /** ローディングメッセージ */
  message?: string;
  /** サイズ */
  size?: 'sm' | 'md' | 'lg';
  /** 追加のCSSクラス */
  className?: string;
  /** フルスクリーン表示 */
  fullScreen?: boolean;
}

/**
 * サイズに応じたスタイルを取得
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg'): { spinner: string; text: string } {
  switch (size) {
    case 'sm':
      return { spinner: 'w-4 h-4', text: 'text-xs' };
    case 'lg':
      return { spinner: 'w-12 h-12', text: 'text-base' };
    default:
      return { spinner: 'w-8 h-8', text: 'text-sm' };
  }
}

/**
 * ローディングスピナーコンポーネント
 * データ読み込み中の状態を表示
 */
export function Loading({
  message = '読み込み中...',
  size = 'md',
  className = '',
  fullScreen = false,
}: LoadingProps): JSX.Element {
  const { spinner, text } = getSizeClasses(size);

  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      {/* スピナー */}
      <div
        className={`
          ${spinner}
          border-2 border-bg-tertiary border-t-accent-primary
          rounded-full animate-spin
        `}
        role="status"
        aria-label="読み込み中"
      />
      {/* メッセージ */}
      {message && (
        <p className={`${text} text-text-secondary`}>
          {message}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm z-50">
        {content}
      </div>
    );
  }

  return content;
}

/**
 * スケルトンローディングコンポーネント
 * コンテンツのプレースホルダーを表示
 */
export function Skeleton({
  className = '',
  width,
  height,
}: {
  className?: string;
  width?: string;
  height?: string;
}): JSX.Element {
  return (
    <div
      className={`
        bg-bg-tertiary rounded animate-pulse
        ${className}
      `}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/**
 * カードスケルトンコンポーネント
 * カード形式のプレースホルダーを表示
 */
export function CardSkeleton(): JSX.Element {
  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4 space-y-3">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export default Loading;
