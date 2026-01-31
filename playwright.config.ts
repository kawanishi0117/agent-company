import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright設定
 * E2Eテスト用の設定ファイル
 */
export default defineConfig({
  // テストディレクトリ
  testDir: './e2e',

  // 並列実行
  fullyParallel: true,

  // CI環境では .only を禁止
  forbidOnly: !!process.env.CI,

  // CI環境ではリトライ2回
  retries: process.env.CI ? 2 : 0,

  // CI環境ではワーカー1つ
  workers: process.env.CI ? 1 : undefined,

  // レポーター設定（HTMLレポートは生成するが、サーバーは起動しない）
  reporter: [['list'], ['html', { outputFolder: 'runtime/e2e-report', open: 'never' }]],

  // 共通設定
  use: {
    // ベースURL（GUIテスト用）
    baseURL: 'http://localhost:3000',
    // トレース: リトライ時のみ
    trace: 'on-first-retry',
    // スクリーンショット: 失敗時のみ
    screenshot: 'only-on-failure',
    // 動画: リトライ時のみ
    video: 'on-first-retry',
  },

  // 成果物出力先
  outputDir: 'runtime/e2e-artifacts/',

  // テスト対象ブラウザ
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // タイムアウト設定
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  // GUIテスト用のWebサーバー設定
  // Next.js開発サーバーを起動してテストを実行
  webServer: {
    command: 'npm run dev',
    cwd: './gui/web',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2分（Next.jsの初回起動に時間がかかる場合がある）
  },
});
