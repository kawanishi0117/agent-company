/**
 * @file Navigation コンポーネント
 * @description ナビゲーションリンクコンポーネント（承認待ち通知バッジ付き）
 * @requirements 2.2, 2.3 - ナビゲーションリンクと現在ページのハイライト
 * @requirements 8.8, 10.3, 16.12 - ワークフロー承認待ち通知バッジ
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** 承認待ちポーリング間隔（ミリ秒） */
const APPROVAL_POLL_INTERVAL = 10000;

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
  /** 通知バッジ表示用カウント（0以下で非表示） */
  badgeCount?: number;
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
    href: '/employees',
    label: 'Employees',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    href: '/meetings',
    label: 'Meetings',
    iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    href: '/workflows',
    label: 'Workflows',
    iconPath: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
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
    href: '/kpi',
    label: 'KPI',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    href: '/market',
    label: 'Market',
    iconPath: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
  {
    href: '/knowledge',
    label: 'Knowledge',
    iconPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
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
 * 承認待ちワークフロー数を取得するカスタムフック
 * @returns 承認待ちワークフロー数
 * @see Requirements: 8.8, 10.3, 16.12
 */
function useApprovalCount(): number {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows?status=waiting_approval');
      if (!res.ok) return;
      const json = await res.json();
      // APIレスポンスが配列の場合はその長さ、data配列の場合はdata.length
      const workflows = Array.isArray(json) ? json : json.data;
      if (Array.isArray(workflows)) {
        setCount(workflows.length);
      }
    } catch {
      // ポーリング失敗時は前回の値を維持
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, APPROVAL_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return count;
}

/**
 * ナビゲーションコンポーネント
 * 各画面へのリンクを表示し、承認待ちワークフローの通知バッジを表示
 */
export function Navigation({ className = '' }: NavigationProps): JSX.Element {
  const pathname = usePathname();
  const approvalCount = useApprovalCount();

  // Workflows アイテムにバッジカウントを動的に設定
  const itemsWithBadge = navItems.map((item) =>
    item.href === '/workflows' ? { ...item, badgeCount: approvalCount } : item
  );

  return (
    <nav className={`flex items-center gap-1 ${className}`}>
      {itemsWithBadge.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const showBadge = item.badgeCount !== undefined && item.badgeCount > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              relative flex items-center gap-2 px-4 py-2
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
            {/* 承認待ち通知バッジ */}
            {showBadge && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center
                  min-w-[18px] h-[18px] px-1 text-[10px] font-bold
                  text-white bg-status-fail rounded-full
                  animate-pulse"
                aria-label={`${item.badgeCount}件の承認待ち`}
              >
                {item.badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default Navigation;
