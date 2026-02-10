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
    href: '/dashboard',
    label: 'Dashboard',
    iconPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    href: '/command',
    label: 'Command',
    iconPath: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  {
    href: '/projects',
    label: 'Projects',
    iconPath: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  },
  {
    href: '/tickets',
    label: 'Tickets',
    iconPath: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
  },
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
    href: '/review',
    label: 'Review',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    href: '/reports',
    label: 'Reports',
    iconPath: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    href: '/settings',
    label: 'Settings',
    iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
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
