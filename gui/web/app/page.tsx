/**
 * ホームページ
 * AgentCompany GUIダッシュボード
 * 
 * 初期表示ページ。将来的にはBacklog画面へリダイレクトする予定。
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      {/* ヘッダーセクション */}
      <div className="text-center space-y-6">
        {/* ロゴ/タイトル */}
        <h1 className="text-4xl font-bold text-text-primary">
          AgentCompany
        </h1>
        
        {/* サブタイトル */}
        <p className="text-lg text-text-secondary max-w-md">
          AIエージェントを「会社組織」として運用するフレームワーク
        </p>
        
        {/* ナビゲーションリンク */}
        <nav className="flex flex-wrap justify-center gap-4 mt-8">
          <a
            href="/backlog"
            className="px-6 py-3 bg-accent-primary hover:bg-accent-hover text-white rounded-lg transition-colors duration-200 font-medium"
          >
            Backlog
          </a>
          <a
            href="/runs"
            className="px-6 py-3 bg-bg-secondary hover:bg-bg-tertiary text-text-primary rounded-lg transition-colors duration-200 font-medium border border-bg-tertiary"
          >
            Runs
          </a>
          <a
            href="/reports"
            className="px-6 py-3 bg-bg-secondary hover:bg-bg-tertiary text-text-primary rounded-lg transition-colors duration-200 font-medium border border-bg-tertiary"
          >
            Reports
          </a>
        </nav>
      </div>
      
      {/* フッター */}
      <footer className="absolute bottom-8 text-text-muted text-sm">
        <p>AgentCompany Dashboard v0.1.0</p>
      </footer>
    </main>
  );
}
