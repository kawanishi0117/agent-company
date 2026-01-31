/**
 * Vitest設定ファイル
 * GUI（Next.js）プロジェクト用のテスト設定
 *
 * - jsdom環境でReactコンポーネントをテスト
 * - Property-based testingにfast-checkを使用
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // グローバルなテストAPI（describe, it, expect）を有効化
    globals: true,
    // DOM環境（Reactコンポーネントテスト用）
    environment: 'jsdom',
    // テストファイルのパターン
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.property.test.ts'],
    // セットアップファイル
    setupFiles: ['./vitest.setup.ts'],
    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', '.next', 'coverage', '**/*.config.*', '**/*.d.ts'],
    },
  },
});
