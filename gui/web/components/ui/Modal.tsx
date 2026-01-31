/**
 * @file Modal コンポーネント
 * @description モーダルダイアログコンポーネント
 * @requirements 7.1 - モーダルダイアログ
 */

'use client';

import { ReactNode, useEffect, useCallback } from 'react';

interface ModalProps {
  /** モーダルの表示状態 */
  isOpen: boolean;
  /** 閉じるハンドラ */
  onClose: () => void;
  /** モーダルのタイトル */
  title?: string;
  /** モーダルの内容 */
  children: ReactNode;
  /** モーダルのサイズ */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** 追加のCSSクラス */
  className?: string;
}

/**
 * サイズに応じたスタイルを取得
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg' | 'xl' | 'full'): string {
  switch (size) {
    case 'sm':
      return 'max-w-sm';
    case 'lg':
      return 'max-w-2xl';
    case 'xl':
      return 'max-w-4xl';
    case 'full':
      return 'max-w-[90vw] max-h-[90vh]';
    default:
      return 'max-w-lg';
  }
}

/**
 * モーダルダイアログコンポーネント
 * オーバーレイ付きのダイアログを表示
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = '',
}: ModalProps): JSX.Element | null {
  // ESCキーで閉じる
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // スクロールを無効化
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  const sizeClasses = getSizeClasses(size);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* モーダルコンテンツ */}
      <div
        className={`
          relative z-10 w-full ${sizeClasses}
          bg-bg-secondary border border-bg-tertiary
          rounded-lg shadow-xl
          overflow-hidden
          ${className}
        `.trim()}
      >
        {/* ヘッダー */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-bg-tertiary">
            <h2
              id="modal-title"
              className="text-lg font-semibold text-text-primary"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text-primary transition-colors rounded-md hover:bg-bg-tertiary"
              aria-label="閉じる"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;
