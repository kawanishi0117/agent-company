/**
 * @file Header コンポーネント
 * @description ヘッダーコンポーネント（ロゴ + ナビゲーション）
 * @requirements 2.1, 2.5 - 一貫したヘッダーとロゴ/タイトル表示
 */

import Link from 'next/link';
import { Navigation } from './Navigation';

interface HeaderProps {
  /** 追加のCSSクラス */
  className?: string;
}

/**
 * ヘッダーコンポーネント
 * ロゴとナビゲーションを含むヘッダー
 */
export function Header({ className = '' }: HeaderProps): JSX.Element {
  return (
    <header
      className={`
        sticky top-0 z-40
        bg-bg-primary/95 backdrop-blur-sm
        border-b border-bg-tertiary
        ${className}
      `.trim()}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* ロゴ/タイトル */}
          <Link
            href="/"
            className="flex items-center gap-3 text-text-primary hover:text-accent-primary transition-colors"
          >
            {/* ロゴアイコン */}
            <div className="w-8 h-8 bg-accent-primary rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            {/* タイトル */}
            <span className="text-lg font-bold">
              AgentCompany
            </span>
          </Link>

          {/* ナビゲーション */}
          <Navigation />
        </div>
      </div>
    </header>
  );
}

export default Header;
