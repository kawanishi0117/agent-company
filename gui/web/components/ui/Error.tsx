/**
 * @file Error コンポーネント
 * @description エラー表示コンポーネント
 * @requirements 7.2, 7.4 - エラーメッセージはユーザーフレンドリーでアクション可能
 */

interface ErrorProps {
  /** エラーメッセージ */
  message: string;
  /** エラーの詳細（オプション） */
  details?: string;
  /** リトライハンドラ（指定時はリトライボタンを表示） */
  onRetry?: () => void;
  /** 追加のCSSクラス */
  className?: string;
  /** エラーの種類 */
  variant?: 'error' | 'warning' | 'info';
}

/**
 * バリアントに応じたスタイルを取得
 */
function getVariantClasses(variant: 'error' | 'warning' | 'info'): {
  container: string;
  icon: string;
  iconPath: string;
} {
  switch (variant) {
    case 'warning':
      return {
        container: 'bg-status-waiver/10 border-status-waiver/30',
        icon: 'text-status-waiver',
        iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
      };
    case 'info':
      return {
        container: 'bg-accent-primary/10 border-accent-primary/30',
        icon: 'text-accent-primary',
        iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      };
    default:
      return {
        container: 'bg-status-fail/10 border-status-fail/30',
        icon: 'text-status-fail',
        iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
      };
  }
}

/**
 * エラー表示コンポーネント
 * エラーメッセージとリトライオプションを表示
 */
export function Error({
  message,
  details,
  onRetry,
  className = '',
  variant = 'error',
}: ErrorProps): JSX.Element {
  const { container, icon, iconPath } = getVariantClasses(variant);

  return (
    <div
      className={`
        ${container}
        border rounded-lg p-4
        ${className}
      `.trim()}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {/* アイコン */}
        <svg
          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${icon}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={iconPath}
          />
        </svg>

        {/* メッセージ */}
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-medium">
            {message}
          </p>
          {details && (
            <p className="mt-1 text-sm text-text-secondary">
              {details}
            </p>
          )}

          {/* リトライボタン */}
          {onRetry && (
            <button
              onClick={onRetry}
              className="
                mt-3 px-4 py-2
                text-sm font-medium
                bg-bg-tertiary hover:bg-bg-secondary
                text-text-primary
                rounded-md
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-accent-primary
              "
            >
              再試行
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 空状態コンポーネント
 * データがない場合のメッセージを表示
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={`
        flex flex-col items-center justify-center
        py-12 px-4 text-center
        ${className}
      `.trim()}
    >
      {/* アイコン */}
      {icon ? (
        <div className="w-12 h-12 text-text-muted mb-4">
          {icon}
        </div>
      ) : (
        <svg
          className="w-12 h-12 text-text-muted mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      )}

      {/* タイトル */}
      <h3 className="text-lg font-medium text-text-primary mb-1">
        {title}
      </h3>

      {/* 説明 */}
      {description && (
        <p className="text-sm text-text-secondary max-w-sm">
          {description}
        </p>
      )}

      {/* アクション */}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
}

export default Error;
