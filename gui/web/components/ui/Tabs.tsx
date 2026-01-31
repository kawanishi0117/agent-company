/**
 * @file Tabs コンポーネント
 * @description タブコンポーネント
 * @requirements 7.1 - タブコンポーネント
 */

'use client';

import { ReactNode, useState } from 'react';

interface Tab {
  /** タブのID */
  id: string;
  /** タブのラベル */
  label: string;
  /** タブの内容 */
  content: ReactNode;
  /** タブのアイコン（オプション） */
  icon?: ReactNode;
  /** タブのバッジ（件数など） */
  badge?: number;
}

interface TabsProps {
  /** タブの配列 */
  tabs: Tab[];
  /** デフォルトで選択されるタブのID */
  defaultTab?: string;
  /** タブ変更時のコールバック */
  onChange?: (tabId: string) => void;
  /** 追加のCSSクラス */
  className?: string;
}

/**
 * タブコンポーネント
 * 複数のコンテンツを切り替えて表示
 */
export function Tabs({
  tabs,
  defaultTab,
  onChange,
  className = '',
}: TabsProps): JSX.Element {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');

  const handleTabClick = (tabId: string): void => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div className={className}>
      {/* タブヘッダー */}
      <div
        className="flex border-b border-bg-tertiary"
        role="tablist"
        aria-label="タブ"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => handleTabClick(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3
                text-sm font-medium
                border-b-2 -mb-px
                transition-colors duration-200
                ${
                  isActive
                    ? 'border-accent-primary text-accent-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-bg-tertiary'
                }
              `.trim()}
            >
              {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`
                    px-2 py-0.5 text-xs rounded-full
                    ${isActive ? 'bg-accent-primary/20' : 'bg-bg-tertiary'}
                  `}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* タブコンテンツ */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="pt-4"
      >
        {activeContent}
      </div>
    </div>
  );
}

export default Tabs;
