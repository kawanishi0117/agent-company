import type { Metadata } from 'next';
import { Header } from '@/components/layout';
import './globals.css';

/**
 * メタデータ設定
 * AgentCompany GUIダッシュボード
 */
export const metadata: Metadata = {
  title: 'AgentCompany Dashboard',
  description: 'AIエージェントを「会社組織」として運用するフレームワークのダッシュボード',
};

/**
 * ルートレイアウト
 * 全ページで共通のHTML構造を提供
 * @requirements 2.1, 2.4 - 一貫したヘッダーとグローバルスタイル
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        {/* ヘッダー（ナビゲーション含む） */}
        <Header />
        
        {/* メインコンテンツ */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
