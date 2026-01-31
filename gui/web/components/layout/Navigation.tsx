/**
 * @file Navigation コンポーネント
 * @description ナビゲーションリンクコンポーネント
 * @requirements 2.2, 2.3 - ナビゲーションリンクと現在ページのハイライト
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * ナビゲーションアイテムの定義
 */
interface NavItem {
  /** リンク先のパス */
  href: string;
  /** 表示ラベル */
  label: string;
  /** アイコン（SVGパス） */
  iconPath: string;
}

/**
 * ナビゲーションアイテムの一覧
 */
const navItems: NavItem[] = [
  {
    href: '/backlog',
    label: 'Backlog',
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  {
    href: '/runs',
    label: 'Runs',
    iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    href: '/reports',
    label: 'Reports',
    iconPath: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
];

interface NavigationProps {
  /** 追加のCSSクラス */
  className?: string;
}

/**
 * ナビゲーションコンポーネント
 * 各画面へのリンクを表示
 */
export function Navigation({ className = '' }: NavigationProps): JSX.Element {
  const pathname = usePathname();

  return (
    <nav className={`flex items-center gap-1 ${className}`}>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-2 px-4 py-2
              text-sm font-medium rounded-md
              transition-colors duration-200
              ${
                isActive
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }
            `.trim()}
            aria-current={isActive ? 'page' : undefined}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={item.iconPath}
              />
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default Navigation;
