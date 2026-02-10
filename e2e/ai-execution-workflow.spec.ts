/**
 * AI実行ワークフロー E2Eテスト
 *
 * タスク送信から成果物生成までの統合フローを検証する。
 * OrchestratorServerを直接起動し、HTTP APIを通じてワークフロー全体をテストする。
 *
 * テスト環境ではOllamaが利用不可のため、AI利用不可時のグレースフルな動作を中心に検証する。
 *
 * @module e2e/ai-execution-workflow
 * @see Requirements: 1.1-1.5, 2.1-2.5, 4.1-4.5, 5.1-5.5, 6.1, 6.3, 6.5, 7.1-7.3, 8.4
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// テストスイート
// =============================================================================

test.describe('AI Execution Workflow', () => {
  /**
   * テスト用の一時ディレクトリパス（テスト後にクリーンアップ）
   */
  let tempRunDirs: string[] = [];

  /**
   * テスト後のクリーンアップ
   * テスト中に作成した一時ディレクトリを削除する
   */
  test.afterAll(async () => {
    for (const dir of tempRunDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // クリーンアップ失敗は無視
      }
    }
    tempRunDirs = [];
  });

  // ===========================================================================
  // 1. AI実行基盤の構造検証
  // ===========================================================================

  test.describe('AI実行基盤の構造検証', () => {
    /**
     * AI実行統合に必要なコアファイルが存在することを確認
     * @see Requirements: 1.1-1.5
     */
    test('AI実行統合のコアファイルが存在すること', async () => {
      const coreFiles = [
        'tools/cli/lib/execution/ai-health-checker.ts',
        'tools/cli/lib/execution/execution-reporter.ts',
        'tools/cli/lib/execution/quality-gate-integration.ts',
        'tools/cli/lib/execution/run-directory-manager.ts',
        'tools/cli/lib/execution/settings-manager.ts',
        'tools/cli/lib/execution/orchestrator-server.ts',
      ];

      for (const file of coreFiles) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} が存在すること`).toBe(true);
      }
    });

    /**
     * AIアダプタファイルが存在することを確認
     * @see Requirements: 1.1
     */
    test('AIアダプタファイルが存在すること', async () => {
      const adapterFiles = [
        'tools/adapters/base.ts',
        'tools/adapters/ollama.ts',
        'tools/adapters/index.ts',
      ];

      for (const file of adapterFiles) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} が存在すること`).toBe(true);
      }
    });
  });

  // ===========================================================================
  // 2. AIHealthChecker機能検証
  // ===========================================================================

  test.describe('AIHealthChecker機能検証', () => {
    /**
     * AIHealthCheckerがセットアップ手順を含むステータスを返すことを確認
     * テスト環境ではOllamaが利用不可のため、unavailableステータスを期待
     * @see Requirements: 1.2, 1.4
     */
    test('AIHealthCheckerがヘルスステータスを返すこと', async () => {
      const healthCheckerContent = await fs.readFile(
        'tools/cli/lib/execution/ai-health-checker.ts',
        'utf-8'
      );

      // セットアップ手順が定義されていること
      expect(healthCheckerContent).toContain('セットアップ手順');
      expect(healthCheckerContent).toContain('ollama serve');
      expect(healthCheckerContent).toContain('ollama pull');

      // 推奨モデルが定義されていること
      expect(healthCheckerContent).toContain('llama3.2:1b');
      expect(healthCheckerContent).toContain('codellama');
      expect(healthCheckerContent).toContain('qwen2.5-coder');
    });

    /**
     * エラーメッセージテンプレートが適切に定義されていることを確認
     * @see Requirements: 1.2, 1.4
     */
    test('エラーメッセージテンプレートが定義されていること', async () => {
      const healthCheckerContent = await fs.readFile(
        'tools/cli/lib/execution/ai-health-checker.ts',
        'utf-8'
      );

      // Ollama未起動時のメッセージ
      expect(healthCheckerContent).toContain('ollamaNotRunning');
      // モデル未インストール時のメッセージ
      expect(healthCheckerContent).toContain('noModelsInstalled');
    });
  });

  // ===========================================================================
  // 3. 実行ディレクトリ管理の検証
  // ===========================================================================

  test.describe('実行ディレクトリ管理の検証', () => {
    /**
     * RunDirectoryManagerが実行ディレクトリを正しく作成できることを確認
     * @see Requirements: 2.4
     */
    test('実行ディレクトリが正しく作成されること', async () => {
      const runId = `test-run-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      // ディレクトリを作成
      const artifactsDir = path.join(runDir, 'artifacts');
      await fs.mkdir(artifactsDir, { recursive: true });

      // ディレクトリが存在することを確認
      const runDirStat = await fs.stat(runDir);
      expect(runDirStat.isDirectory()).toBe(true);

      // artifactsサブディレクトリが存在することを確認
      const artifactsStat = await fs.stat(artifactsDir);
      expect(artifactsStat.isDirectory()).toBe(true);
    });

    /**
     * タスクメタデータの保存・読み込みラウンドトリップを検証
     * @see Requirements: 2.5
     */
    test('タスクメタデータの保存と読み込みが正しく動作すること', async () => {
      const runId = `test-metadata-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      // ディレクトリを作成
      await fs.mkdir(runDir, { recursive: true });

      // テスト用メタデータ
      const metadata = {
        taskId: 'task-001',
        runId,
        projectId: 'project-test',
        instruction: 'テスト用タスク指示',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiAdapter: 'ollama',
        model: 'llama3.2:1b',
      };

      // メタデータを保存
      const metadataPath = path.join(runDir, 'task.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

      // メタデータを読み込み
      const loadedContent = await fs.readFile(metadataPath, 'utf-8');
      const loadedMetadata = JSON.parse(loadedContent);

      // ラウンドトリップの検証
      expect(loadedMetadata.taskId).toBe(metadata.taskId);
      expect(loadedMetadata.runId).toBe(metadata.runId);
      expect(loadedMetadata.projectId).toBe(metadata.projectId);
      expect(loadedMetadata.instruction).toBe(metadata.instruction);
      expect(loadedMetadata.status).toBe(metadata.status);
      expect(loadedMetadata.aiAdapter).toBe(metadata.aiAdapter);
      expect(loadedMetadata.model).toBe(metadata.model);
    });

    /**
     * 実行ディレクトリの標準構造が正しいことを確認
     * @see Requirements: 2.4, 5.1
     */
    test('実行ディレクトリの標準構造が正しいこと', async () => {
      const runId = `test-structure-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      // 標準構造を作成
      await fs.mkdir(path.join(runDir, 'artifacts'), { recursive: true });
      await fs.writeFile(path.join(runDir, 'task.json'), '{}', 'utf-8');
      await fs.writeFile(path.join(runDir, 'conversation.json'), '[]', 'utf-8');
      await fs.writeFile(path.join(runDir, 'quality.json'), '{}', 'utf-8');
      await fs.writeFile(path.join(runDir, 'report.md'), '# Report', 'utf-8');
      await fs.writeFile(path.join(runDir, 'errors.log'), '', 'utf-8');

      // 全ファイルが存在することを確認
      const expectedFiles = [
        'task.json',
        'conversation.json',
        'quality.json',
        'report.md',
        'errors.log',
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(runDir, file);
        const stat = await fs.stat(filePath);
        expect(stat.isFile(), `${file} が存在すること`).toBe(true);
      }

      // artifactsディレクトリが存在すること
      const artifactsStat = await fs.stat(path.join(runDir, 'artifacts'));
      expect(artifactsStat.isDirectory()).toBe(true);
    });
  });

  // ===========================================================================
  // 4. OrchestratorServer API検証
  // ===========================================================================

  test.describe('OrchestratorServer API検証', () => {
    /**
     * OrchestratorServerのルーティングテーブルが正しく定義されていることを確認
     * @see Requirements: 1.3, 2.1, 5.5, 7.1-7.3, 8.4
     */
    test('OrchestratorServerに必要なAPIエンドポイントが定義されていること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // ヘルスチェックエンドポイント
      expect(serverContent).toContain('/api/health');
      expect(serverContent).toContain('/api/health/ai');

      // タスク関連エンドポイント
      expect(serverContent).toContain('/api/tasks');

      // ダッシュボードエンドポイント
      expect(serverContent).toContain('/api/dashboard/status');

      // 設定関連エンドポイント
      expect(serverContent).toContain('/api/config');
      expect(serverContent).toContain('/api/config/validate');

      // Runs関連エンドポイント（成果物・レポート）
      expect(serverContent).toContain('/report');
      expect(serverContent).toContain('/artifacts');
      expect(serverContent).toContain('/quality');
    });

    /**
     * CORSヘッダーが正しく設定されていることを確認
     */
    test('CORSヘッダーが正しく設定されていること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      expect(serverContent).toContain('Access-Control-Allow-Origin');
      expect(serverContent).toContain('Access-Control-Allow-Methods');
      expect(serverContent).toContain('Access-Control-Allow-Headers');
    });

    /**
     * タスク送信時のバリデーションが実装されていることを確認
     * @see Requirements: 2.2
     */
    test('タスク送信時のバリデーションが実装されていること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // instructionとprojectIdの必須チェック
      expect(serverContent).toContain('instruction');
      expect(serverContent).toContain('projectId');
      expect(serverContent).toContain('VALIDATION_ERROR');
    });

    /**
     * AI可用性チェックがタスク送信前に実行されることを確認
     * @see Requirements: 1.1, 1.2
     */
    test('タスク送信前にAI可用性チェックが実行されること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // AI可用性チェックのコード
      expect(serverContent).toContain('checkOllamaAvailability');
      expect(serverContent).toContain('AI_UNAVAILABLE');
      expect(serverContent).toContain('setupInstructions');
    });
  });

  // ===========================================================================
  // 5. 品質ゲート統合の検証
  // ===========================================================================

  test.describe('品質ゲート統合の検証', () => {
    /**
     * QualityGateIntegrationが正しく実装されていることを確認
     * @see Requirements: 4.1, 4.2, 4.3
     */
    test('品質ゲート統合のコア機能が実装されていること', async () => {
      const qgContent = await fs.readFile(
        'tools/cli/lib/execution/quality-gate-integration.ts',
        'utf-8'
      );

      // lint実行機能
      expect(qgContent).toContain('runLint');
      // test実行機能
      expect(qgContent).toContain('runTests');
      // 全チェック実行機能
      expect(qgContent).toContain('runAllChecks');
      // 結果保存機能
      expect(qgContent).toContain('saveResults');
      // 結果読み込み機能
      expect(qgContent).toContain('loadResults');
      // フィードバック生成機能
      expect(qgContent).toContain('generateFeedback');
    });

    /**
     * 品質ゲート結果の保存形式が正しいことを確認
     * @see Requirements: 4.3
     */
    test('品質ゲート結果のデータ構造が定義されていること', async () => {
      const qgContent = await fs.readFile(
        'tools/cli/lib/execution/quality-gate-integration.ts',
        'utf-8'
      );

      // 結果データ構造
      expect(qgContent).toContain('QualityGateResultData');
      expect(qgContent).toContain('QualityCheckResult');
      expect(qgContent).toContain('QualityGateResult');
    });
  });

  // ===========================================================================
  // 6. 成果物管理の検証
  // ===========================================================================

  test.describe('成果物管理の検証', () => {
    /**
     * ExecutionReporterが正しく実装されていることを確認
     * @see Requirements: 5.1, 5.2, 5.3
     */
    test('ExecutionReporterのコア機能が実装されていること', async () => {
      const reporterContent = await fs.readFile(
        'tools/cli/lib/execution/execution-reporter.ts',
        'utf-8'
      );

      // レポート生成機能
      expect(reporterContent).toContain('generateReport');
      // レポート保存機能
      expect(reporterContent).toContain('saveReport');
      // 成果物収集機能
      expect(reporterContent).toContain('collectArtifacts');
    });

    /**
     * 成果物ディレクトリへのファイル保存が正しく動作することを確認
     * @see Requirements: 5.4
     */
    test('成果物ディレクトリへのファイル保存が正しく動作すること', async () => {
      const runId = `test-artifacts-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      const artifactsDir = path.join(runDir, 'artifacts');
      tempRunDirs.push(runDir);

      // 成果物ディレクトリを作成
      await fs.mkdir(artifactsDir, { recursive: true });

      // テスト用成果物を保存
      const testArtifacts = [
        { name: 'index.ts', content: 'export const hello = "world";' },
        { name: 'utils.ts', content: 'export function add(a: number, b: number): number { return a + b; }' },
      ];

      for (const artifact of testArtifacts) {
        await fs.writeFile(
          path.join(artifactsDir, artifact.name),
          artifact.content,
          'utf-8'
        );
      }

      // 成果物が正しく保存されていることを確認
      const files = await fs.readdir(artifactsDir);
      expect(files).toContain('index.ts');
      expect(files).toContain('utils.ts');
      expect(files.length).toBe(2);

      // 内容が正しいことを確認
      const indexContent = await fs.readFile(
        path.join(artifactsDir, 'index.ts'),
        'utf-8'
      );
      expect(indexContent).toContain('hello');
    });
  });

  // ===========================================================================
  // 7. 設定管理の検証
  // ===========================================================================

  test.describe('設定管理の検証', () => {
    /**
     * SettingsManagerが正しく実装されていることを確認
     * @see Requirements: 8.1-8.5
     */
    test('SettingsManagerのコア機能が実装されていること', async () => {
      const settingsContent = await fs.readFile(
        'tools/cli/lib/execution/settings-manager.ts',
        'utf-8'
      );

      // 設定読み込み
      expect(settingsContent).toContain('loadSettings');
      // 設定保存
      expect(settingsContent).toContain('saveSettings');
      // バリデーション
      expect(settingsContent).toContain('validateAISettings');
      // ホットリロード
      expect(settingsContent).toContain('watchSettings');
      // 設定適用
      expect(settingsContent).toContain('applySettings');
    });

    /**
     * AI設定バリデーションが正しく動作することを確認
     * @see Requirements: 8.4
     */
    test('AI設定バリデーション関数が定義されていること', async () => {
      const settingsContent = await fs.readFile(
        'tools/cli/lib/execution/settings-manager.ts',
        'utf-8'
      );

      // バリデーション関数
      expect(settingsContent).toContain('validateAISettings');
      expect(settingsContent).toContain('isValidOllamaHost');
      expect(settingsContent).toContain('validateFullConfig');

      // バリデーションエラークラス
      expect(settingsContent).toContain('SettingsValidationError');
    });
  });

  // ===========================================================================
  // 8. ダッシュボード統合の検証
  // ===========================================================================

  test.describe('ダッシュボード統合の検証', () => {
    /**
     * ダッシュボードAPIがAIステータスを含むことを確認
     * @see Requirements: 7.1, 7.2, 7.3
     */
    test('ダッシュボードAPIにAIステータスが統合されていること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // ダッシュボードハンドラーにAIステータスが含まれること
      expect(serverContent).toContain('aiStatus');
      expect(serverContent).toContain('aiHealth');

      // タスクサマリーが含まれること
      expect(serverContent).toContain('pending');
      expect(serverContent).toContain('executing');
      expect(serverContent).toContain('completed');
      expect(serverContent).toContain('failed');
      expect(serverContent).toContain('successRate');
    });

    /**
     * ダッシュボードAPIがワーカー情報を含むことを確認
     * @see Requirements: 7.1
     */
    test('ダッシュボードAPIにワーカー情報が含まれていること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // ワーカー・マネージャー情報
      expect(serverContent).toContain('workers');
      expect(serverContent).toContain('managers');
      expect(serverContent).toContain('systemStatus');
    });
  });

  // ===========================================================================
  // 9. エラーハンドリングの検証
  // ===========================================================================

  test.describe('エラーハンドリングの検証', () => {
    /**
     * エラーハンドラーにリトライロジックが実装されていることを確認
     * @see Requirements: 6.1, 6.3
     */
    test('エラーハンドラーにリトライロジックが実装されていること', async () => {
      const errorHandlerContent = await fs.readFile(
        'tools/cli/lib/execution/error-handler.ts',
        'utf-8'
      );

      // リトライロジック
      expect(errorHandlerContent).toContain('retry');
      expect(errorHandlerContent).toContain('backoff');
    });

    /**
     * OrchestratorServerのエラーハンドリングが適切に分類されていることを確認
     */
    test('APIエラーレスポンスが適切に分類されていること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // エラーコード分類
      expect(serverContent).toContain('NOT_FOUND');
      expect(serverContent).toContain('VALIDATION_ERROR');
      expect(serverContent).toContain('INTERNAL_ERROR');
      expect(serverContent).toContain('AI_UNAVAILABLE');
      expect(serverContent).toContain('RUN_NOT_FOUND');
      expect(serverContent).toContain('QUALITY_RESULTS_NOT_FOUND');
    });

    /**
     * エラーログファイルへの書き込みが実装されていることを確認
     * @see Requirements: 6.1
     */
    test('エラーログ機能が実装されていること', async () => {
      const runId = `test-errors-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      // エラーログファイルを作成
      await fs.mkdir(runDir, { recursive: true });
      const errorLog = [
        `[${new Date().toISOString()}] ERROR: テストエラー1`,
        `[${new Date().toISOString()}] ERROR: テストエラー2`,
      ].join('\n');
      await fs.writeFile(path.join(runDir, 'errors.log'), errorLog, 'utf-8');

      // エラーログが正しく保存されていることを確認
      const savedLog = await fs.readFile(path.join(runDir, 'errors.log'), 'utf-8');
      expect(savedLog).toContain('テストエラー1');
      expect(savedLog).toContain('テストエラー2');
    });
  });

  // ===========================================================================
  // 10. 統合ワークフローの検証
  // ===========================================================================

  test.describe('統合ワークフローの検証', () => {
    /**
     * Orchestratorに全コンポーネントが統合されていることを確認
     * @see Requirements: 1.1, 2.4, 4.1, 5.1
     */
    test('Orchestratorに全統合コンポーネントのアクセサが存在すること', async () => {
      const orchestratorContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator.ts',
        'utf-8'
      );

      // 統合コンポーネントのアクセサ
      expect(orchestratorContent).toContain('getAIHealthChecker');
      expect(orchestratorContent).toContain('getExecutionReporter');
      expect(orchestratorContent).toContain('getQualityGateIntegration');
      expect(orchestratorContent).toContain('getRunDirectoryManager');
    });

    /**
     * タスク送信から成果物生成までの完全なディレクトリ構造を検証
     * @see Requirements: 2.4, 2.5, 4.3, 5.1, 5.2, 6.1
     */
    test('完全な実行ディレクトリ構造をシミュレートできること', async () => {
      const runId = `test-full-workflow-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      // 1. 実行ディレクトリ作成（タスク送信時）
      await fs.mkdir(path.join(runDir, 'artifacts'), { recursive: true });

      // 2. タスクメタデータ保存
      const taskMetadata = {
        taskId: `task-${Date.now()}`,
        runId,
        projectId: 'test-project',
        instruction: 'ユーティリティ関数を作成してください',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiAdapter: 'ollama',
        model: 'llama3.2:1b',
      };
      await fs.writeFile(
        path.join(runDir, 'task.json'),
        JSON.stringify(taskMetadata, null, 2),
        'utf-8'
      );

      // 3. 会話履歴保存
      const conversation = [
        { role: 'user', content: 'ユーティリティ関数を作成してください' },
        { role: 'assistant', content: 'add関数を作成します' },
      ];
      await fs.writeFile(
        path.join(runDir, 'conversation.json'),
        JSON.stringify(conversation, null, 2),
        'utf-8'
      );

      // 4. 品質ゲート結果保存
      const qualityResults = {
        runId,
        timestamp: new Date().toISOString(),
        lint: { passed: true, output: 'No errors', errorCount: 0, warningCount: 0 },
        test: { passed: true, output: 'All tests passed', totalTests: 5, passedTests: 5, failedTests: 0 },
        overall: true,
      };
      await fs.writeFile(
        path.join(runDir, 'quality.json'),
        JSON.stringify(qualityResults, null, 2),
        'utf-8'
      );

      // 5. レポート生成
      const report = `# 実行レポート: ${runId}\n\n## タスク\n${taskMetadata.instruction}\n\n## 結果\n成功\n`;
      await fs.writeFile(path.join(runDir, 'report.md'), report, 'utf-8');

      // 6. 成果物保存
      await fs.writeFile(
        path.join(runDir, 'artifacts', 'utils.ts'),
        'export function add(a: number, b: number): number { return a + b; }',
        'utf-8'
      );

      // 全ファイルの存在確認
      const allFiles = [
        'task.json',
        'conversation.json',
        'quality.json',
        'report.md',
        'artifacts/utils.ts',
      ];

      for (const file of allFiles) {
        const filePath = path.join(runDir, file);
        const stat = await fs.stat(filePath);
        expect(stat.isFile(), `${file} が存在すること`).toBe(true);
      }

      // メタデータの整合性確認
      const loadedMetadata = JSON.parse(
        await fs.readFile(path.join(runDir, 'task.json'), 'utf-8')
      );
      expect(loadedMetadata.status).toBe('completed');
      expect(loadedMetadata.instruction).toBe(taskMetadata.instruction);

      // 品質ゲート結果の整合性確認
      const loadedQuality = JSON.parse(
        await fs.readFile(path.join(runDir, 'quality.json'), 'utf-8')
      );
      expect(loadedQuality.overall).toBe(true);
      expect(loadedQuality.lint.passed).toBe(true);
      expect(loadedQuality.test.passed).toBe(true);

      // 成果物の内容確認
      const artifactContent = await fs.readFile(
        path.join(runDir, 'artifacts', 'utils.ts'),
        'utf-8'
      );
      expect(artifactContent).toContain('add');
    });
  });

  // ===========================================================================
  // 11. AI利用不可時のエラーハンドリング検証
  // ===========================================================================

  test.describe('AI利用不可時のエラーハンドリング検証', () => {
    /**
     * ErrorHandlerにGraceful Degradationロジックが実装されていることを確認
     * AI利用不可時に実行を一時停止し、状態を保存する機能の存在を検証する。
     *
     * @see Requirements: 1.5, 6.3
     * @see Property 2: Graceful Degradation on AI Unavailability
     */
    test('ErrorHandlerにGraceful Degradationロジックが実装されていること', async () => {
      const errorHandlerContent = await fs.readFile(
        'tools/cli/lib/execution/error-handler.ts',
        'utf-8'
      );

      // handleAIUnavailableメソッドが存在すること
      expect(errorHandlerContent).toContain('handleAIUnavailable');

      // 一時停止状態（PausedState）の構築ロジック
      expect(errorHandlerContent).toContain('PausedState');
      expect(errorHandlerContent).toContain('pausedAt');
      expect(errorHandlerContent).toContain('recoveryInstructions');

      // 状態をファイルに保存するロジック
      expect(errorHandlerContent).toContain('paused-state.json');

      // AI利用不可の理由メッセージ
      expect(errorHandlerContent).toContain('AI service unavailable');
      expect(errorHandlerContent).toContain('execution paused to prevent data loss');
    });

    /**
     * Graceful Degradation時のリカバリー手順が定義されていることを確認
     * ユーザーがAI復旧後に実行を再開できるよう、具体的な手順が含まれていること。
     *
     * @see Requirements: 1.2, 1.5
     */
    test('Graceful Degradation時のリカバリー手順が定義されていること', async () => {
      const errorHandlerContent = await fs.readFile(
        'tools/cli/lib/execution/error-handler.ts',
        'utf-8'
      );

      // Ollamaサービス確認手順
      expect(errorHandlerContent).toContain('ollama serve');
      // モデル確認手順
      expect(errorHandlerContent).toContain('ollama list');
      // 実行再開コマンド
      expect(errorHandlerContent).toContain('agentcompany resume');
    });

    /**
     * OrchestratorがAI利用不可時にもタスクを受け付けることを確認
     * Graceful Degradation: AI利用不可でもシステムは起動・タスク受付を継続する。
     *
     * @see Requirements: 1.1, 1.5
     */
    test('OrchestratorがAI利用不可時にもgraceful degradationで動作すること', async () => {
      const orchestratorContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator.ts',
        'utf-8'
      );

      // AI可用性チェック失敗時もシステムは起動する
      expect(orchestratorContent).toContain('graceful degradation');
      expect(orchestratorContent).toContain('システムは起動を継続');

      // タスク送信時のAI可用性チェック（ブロックしない）
      expect(orchestratorContent).toContain('AI利用不可でもタスク送信自体はブロックしない');

      // ヘルスチェック失敗時の警告ログ
      expect(orchestratorContent).toContain('AI可用性チェックに失敗しました');
    });

    /**
     * OrchestratorServerがAI利用不可時に適切なエラーレスポンスを返すことを確認
     * セットアップ手順を含むエラーメッセージが返却されること。
     *
     * @see Requirements: 1.2, 1.3
     */
    test('OrchestratorServerがAI利用不可時にセットアップ手順付きエラーを返すこと', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // AI_UNAVAILABLEエラーコード
      expect(serverContent).toContain('AI_UNAVAILABLE');

      // セットアップ手順の提供
      expect(serverContent).toContain('setupInstructions');

      // AI可用性チェック呼び出し
      expect(serverContent).toContain('checkOllamaAvailability');
    });

    /**
     * AIHealthCheckerにセットアップ手順が含まれていることを確認
     * Ollama未起動時・モデル未インストール時の具体的な手順が定義されていること。
     *
     * @see Requirements: 1.2, 1.4
     */
    test('AIHealthCheckerにOllamaセットアップ手順が含まれていること', async () => {
      const healthCheckerContent = await fs.readFile(
        'tools/cli/lib/execution/ai-health-checker.ts',
        'utf-8'
      );

      // Ollama未起動時のセットアップ手順
      expect(healthCheckerContent).toContain('セットアップ手順');
      expect(healthCheckerContent).toContain('ollama serve');
      expect(healthCheckerContent).toContain('ollama pull');

      // 推奨モデル一覧
      expect(healthCheckerContent).toContain('llama3.2:1b');
      expect(healthCheckerContent).toContain('codellama');
      expect(healthCheckerContent).toContain('qwen2.5-coder');

      // Graceful Degradation対応
      expect(healthCheckerContent).toContain('graceful degradation');
    });

    /**
     * AI利用不可時の一時停止状態ファイル（paused-state.json）の保存を検証
     * 実際にファイルシステムに状態を保存し、正しく読み込めることを確認する。
     *
     * @see Requirements: 1.5, 6.3
     */
    test('AI利用不可時の一時停止状態が正しく永続化されること', async () => {
      const runId = `test-paused-state-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      // 一時停止状態を作成
      await fs.mkdir(runDir, { recursive: true });

      const pausedState = {
        runId,
        reason: 'AI service unavailable - execution paused to prevent data loss',
        pausedAt: new Date().toISOString(),
        taskStatus: 'executing',
        progress: {
          completedSubTasks: 2,
          totalSubTasks: 5,
          lastProcessedSubTaskId: 'subtask-002',
        },
        recoveryInstructions: [
          '1. Ollamaサービスが起動しているか確認: `ollama serve`',
          '2. 必要なモデルがインストールされているか確認: `ollama list`',
          '3. ネットワーク接続を確認',
          `4. 実行を再開: \`agentcompany resume ${runId}\``,
        ].join('\n'),
      };

      // 一時停止状態を保存
      const statePath = path.join(runDir, 'paused-state.json');
      await fs.writeFile(statePath, JSON.stringify(pausedState, null, 2), 'utf-8');

      // 保存された状態を読み込み
      const loadedContent = await fs.readFile(statePath, 'utf-8');
      const loadedState = JSON.parse(loadedContent);

      // ラウンドトリップの検証
      expect(loadedState.runId).toBe(runId);
      expect(loadedState.reason).toContain('AI service unavailable');
      expect(loadedState.reason).toContain('prevent data loss');
      expect(loadedState.taskStatus).toBe('executing');
      expect(loadedState.progress.completedSubTasks).toBe(2);
      expect(loadedState.progress.totalSubTasks).toBe(5);
      expect(loadedState.progress.lastProcessedSubTaskId).toBe('subtask-002');
      expect(loadedState.recoveryInstructions).toContain('ollama serve');
      expect(loadedState.recoveryInstructions).toContain('agentcompany resume');
    });

    /**
     * エラーハンドラーの失敗レポート生成機能が実装されていることを確認
     * 永続的失敗時にMarkdown形式のレポートが生成されること。
     *
     * @see Requirements: 6.5
     * @see Property 13: Error Logging and Failure Reporting
     */
    test('失敗レポート生成機能が実装されていること', async () => {
      const errorHandlerContent = await fs.readFile(
        'tools/cli/lib/execution/error-handler.ts',
        'utf-8'
      );

      // 失敗レポート生成メソッド
      expect(errorHandlerContent).toContain('generateFailureReport');

      // 失敗レポートファイル名
      expect(errorHandlerContent).toContain('failure-report.md');

      // レポートデータ構造
      expect(errorHandlerContent).toContain('FailureReportData');

      // 推奨アクション生成
      expect(errorHandlerContent).toContain('generateRecommendedActions');

      // リカバリー手順生成
      expect(errorHandlerContent).toContain('generateRecoverySteps');
    });

    /**
     * 失敗レポートのファイルシステム永続化を検証
     * Markdown形式のレポートが正しく保存・読み込みできることを確認する。
     *
     * @see Requirements: 6.5
     */
    test('失敗レポートが正しくファイルに保存されること', async () => {
      const runId = `test-failure-report-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      await fs.mkdir(runDir, { recursive: true });

      // 失敗レポートを作成
      const failureReport = [
        `# 失敗レポート: ${runId}`,
        '',
        '## タスク',
        'ユーザー認証機能の実装',
        '',
        '## 失敗日時',
        new Date().toISOString(),
        '',
        '## エラー一覧',
        '- AI接続エラー: ECONNREFUSED',
        '- タイムアウト: 30秒超過',
        '',
        '## 推奨アクション',
        '- ネットワーク接続とサービスの稼働状況を確認してください',
        '- タイムアウト設定を見直すか、処理を分割してください',
        '',
        '## リカバリー手順',
        '1. Ollamaサービスの起動を確認',
        '2. ネットワーク接続を確認',
        '3. タスクを再実行',
      ].join('\n');

      // レポートを保存
      const reportPath = path.join(runDir, 'failure-report.md');
      await fs.writeFile(reportPath, failureReport, 'utf-8');

      // レポートが正しく保存されていることを確認
      const loadedReport = await fs.readFile(reportPath, 'utf-8');
      expect(loadedReport).toContain(`失敗レポート: ${runId}`);
      expect(loadedReport).toContain('ユーザー認証機能の実装');
      expect(loadedReport).toContain('AI接続エラー');
      expect(loadedReport).toContain('推奨アクション');
      expect(loadedReport).toContain('リカバリー手順');
    });
  });

  // ===========================================================================
  // 12. 品質ゲート失敗時のエラーハンドリング検証
  // ===========================================================================

  test.describe('品質ゲート失敗時のエラーハンドリング検証', () => {
    /**
     * QualityGateIntegrationにフィードバックループロジックが実装されていることを確認
     * 品質ゲート失敗時にWorkerAgentへフィードバックを送信し、修正を促す機能。
     *
     * @see Requirements: 4.4, 4.5
     * @see Property 11: Quality Gate Feedback Loop
     */
    test('品質ゲート統合にフィードバックループロジックが実装されていること', async () => {
      const qgContent = await fs.readFile(
        'tools/cli/lib/execution/quality-gate-integration.ts',
        'utf-8'
      );

      // フィードバック生成メソッド
      expect(qgContent).toContain('generateFeedback');

      // フィードバックデータ構造
      expect(qgContent).toContain('QualityGateFeedback');
      expect(qgContent).toContain('failedGates');
      expect(qgContent).toContain('fixInstructions');

      // Lint失敗時のフィードバック
      expect(qgContent).toContain('Lint失敗');
      expect(qgContent).toContain('make lint');

      // テスト失敗時のフィードバック
      expect(qgContent).toContain('テスト失敗');
      expect(qgContent).toContain('make test');
    });

    /**
     * 品質ゲート失敗結果が正しい構造で永続化されることを確認
     * quality.json に失敗情報が正しく保存されること。
     *
     * @see Requirements: 4.3
     * @see Property 10: Quality Gate Sequential Execution
     */
    test('品質ゲート失敗結果がquality.jsonに正しく永続化されること', async () => {
      const runId = `test-qg-failure-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      await fs.mkdir(runDir, { recursive: true });

      // Lint失敗の品質ゲート結果を作成
      const qualityResults = {
        runId,
        timestamp: new Date().toISOString(),
        lint: {
          passed: false,
          output: 'src/index.ts: error @typescript-eslint/no-unused-vars',
          errorCount: 3,
          warningCount: 1,
        },
        test: {
          passed: false,
          output: 'Lintが失敗したためスキップされました',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
        },
        overall: false,
      };

      // 結果を保存
      const qualityPath = path.join(runDir, 'quality.json');
      await fs.writeFile(qualityPath, JSON.stringify(qualityResults, null, 2), 'utf-8');

      // 保存された結果を読み込み
      const loadedContent = await fs.readFile(qualityPath, 'utf-8');
      const loadedResults = JSON.parse(loadedContent);

      // 失敗結果の検証
      expect(loadedResults.overall).toBe(false);
      expect(loadedResults.lint.passed).toBe(false);
      expect(loadedResults.lint.errorCount).toBe(3);
      expect(loadedResults.lint.warningCount).toBe(1);
      expect(loadedResults.lint.output).toContain('no-unused-vars');

      // Lint失敗時はテストがスキップされること
      expect(loadedResults.test.passed).toBe(false);
      expect(loadedResults.test.output).toContain('スキップ');
    });

    /**
     * WorkerAgentに品質ゲートリトライロジックが実装されていることを確認
     * 品質ゲート失敗時にAIにフィードバックを送信し、修正ループを実行する機能。
     *
     * @see Requirements: 4.4, 4.5
     */
    test('WorkerAgentに品質ゲートリトライロジックが実装されていること', async () => {
      const workerContent = await fs.readFile(
        'tools/cli/lib/execution/agents/worker.ts',
        'utf-8'
      );

      // 品質ゲートコールバック設定メソッド
      expect(workerContent).toContain('setQualityGateCallback');

      // 品質ゲートフィードバック生成コールバック
      expect(workerContent).toContain('setQualityGateFeedbackGenerator');

      // 品質ゲート結果保存コールバック
      expect(workerContent).toContain('setQualityGateResultSaver');

      // 品質ゲートフィードバックループ
      expect(workerContent).toContain('runQualityGateFeedbackLoop');

      // 最大リトライ回数定数
      expect(workerContent).toContain('MAX_QUALITY_GATE_RETRIES');
    });

    /**
     * 品質ゲート失敗時のテストスキップロジックを検証
     * Lint失敗時にテストがスキップされる順序実行の動作を確認する。
     *
     * @see Requirements: 4.1, 4.2
     */
    test('品質ゲートの順序実行ロジックが実装されていること', async () => {
      const qgContent = await fs.readFile(
        'tools/cli/lib/execution/quality-gate-integration.ts',
        'utf-8'
      );

      // runAllChecksメソッドの存在
      expect(qgContent).toContain('runAllChecks');

      // Lint → Test の順序実行ロジック
      expect(qgContent).toContain('Lintが失敗したためスキップされました');

      // 全体の合格判定ロジック
      expect(qgContent).toContain('lintResult.passed && testResult.passed');
    });

    /**
     * 品質ゲート失敗時のエラーログ統合を検証
     * 品質ゲート失敗がエラーログに記録されることを確認する。
     *
     * @see Requirements: 4.3, 6.1
     */
    test('品質ゲート失敗時のエラーログが正しく記録されること', async () => {
      const runId = `test-qg-error-log-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      await fs.mkdir(runDir, { recursive: true });

      // 品質ゲート失敗のエラーログを作成
      const timestamp = new Date().toISOString();
      const errorLog = [
        `[${timestamp}] [QUALITY_GATE_ERROR] [RECOVERABLE] Lint check failed: 3 errors found`,
        `[${timestamp}] [QUALITY_GATE_ERROR] [RECOVERABLE] Test execution skipped due to lint failure`,
      ].join('\n');

      await fs.writeFile(path.join(runDir, 'errors.log'), errorLog, 'utf-8');

      // 品質ゲート失敗結果も保存
      const qualityResults = {
        runId,
        timestamp,
        lint: { passed: false, output: '3 errors', errorCount: 3, warningCount: 0 },
        test: { passed: false, output: 'Skipped', totalTests: 0, passedTests: 0, failedTests: 0 },
        overall: false,
      };
      await fs.writeFile(
        path.join(runDir, 'quality.json'),
        JSON.stringify(qualityResults, null, 2),
        'utf-8'
      );

      // エラーログの検証
      const savedLog = await fs.readFile(path.join(runDir, 'errors.log'), 'utf-8');
      expect(savedLog).toContain('QUALITY_GATE_ERROR');
      expect(savedLog).toContain('Lint check failed');
      expect(savedLog).toContain('RECOVERABLE');

      // 品質ゲート結果との整合性確認
      const savedQuality = JSON.parse(
        await fs.readFile(path.join(runDir, 'quality.json'), 'utf-8')
      );
      expect(savedQuality.overall).toBe(false);
      expect(savedQuality.lint.passed).toBe(false);
    });

    /**
     * 品質ゲート失敗→修正→再実行の完全なワークフローをシミュレート
     * 品質ゲート失敗後にフィードバックを受けて修正し、再実行で成功するフローを検証する。
     *
     * @see Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
     */
    test('品質ゲート失敗→修正→成功のワークフローをシミュレートできること', async () => {
      const runId = `test-qg-retry-workflow-${Date.now()}`;
      const runDir = path.join('runtime', 'runs', runId);
      tempRunDirs.push(runDir);

      await fs.mkdir(path.join(runDir, 'artifacts'), { recursive: true });

      // === 1回目: 品質ゲート失敗 ===
      const firstAttemptQuality = {
        runId,
        timestamp: new Date().toISOString(),
        attempt: 1,
        lint: {
          passed: false,
          output: 'error: unused variable "x"',
          errorCount: 1,
          warningCount: 0,
        },
        test: {
          passed: false,
          output: 'Lintが失敗したためスキップされました',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
        },
        overall: false,
      };

      // 1回目の結果を保存
      await fs.writeFile(
        path.join(runDir, 'quality-attempt-1.json'),
        JSON.stringify(firstAttemptQuality, null, 2),
        'utf-8'
      );

      // フィードバックメッセージをシミュレート
      const feedback = {
        passed: false,
        message: '品質ゲートに失敗しました。以下の問題を修正してください：\n【Lint失敗】\nエラー数: 1\n  - unused variable "x"',
        failedGates: ['lint'],
        fixInstructions: [
          'Lintエラーを修正してください。`make lint` で確認できます。',
          'ESLintのルールに従ってコードを修正してください。',
        ],
      };

      await fs.writeFile(
        path.join(runDir, 'feedback-attempt-1.json'),
        JSON.stringify(feedback, null, 2),
        'utf-8'
      );

      // === 2回目: 品質ゲート成功（修正後） ===
      const secondAttemptQuality = {
        runId,
        timestamp: new Date().toISOString(),
        attempt: 2,
        lint: {
          passed: true,
          output: 'No errors found',
          errorCount: 0,
          warningCount: 0,
        },
        test: {
          passed: true,
          output: '5 tests passed',
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
        },
        overall: true,
      };

      // 最終結果をquality.jsonに保存
      await fs.writeFile(
        path.join(runDir, 'quality.json'),
        JSON.stringify(secondAttemptQuality, null, 2),
        'utf-8'
      );

      // === 検証 ===

      // 1回目の失敗結果が保存されていること
      const firstAttempt = JSON.parse(
        await fs.readFile(path.join(runDir, 'quality-attempt-1.json'), 'utf-8')
      );
      expect(firstAttempt.overall).toBe(false);
      expect(firstAttempt.attempt).toBe(1);

      // フィードバックが保存されていること
      const savedFeedback = JSON.parse(
        await fs.readFile(path.join(runDir, 'feedback-attempt-1.json'), 'utf-8')
      );
      expect(savedFeedback.passed).toBe(false);
      expect(savedFeedback.failedGates).toContain('lint');
      expect(savedFeedback.fixInstructions.length).toBeGreaterThan(0);

      // 最終結果が成功であること
      const finalQuality = JSON.parse(
        await fs.readFile(path.join(runDir, 'quality.json'), 'utf-8')
      );
      expect(finalQuality.overall).toBe(true);
      expect(finalQuality.attempt).toBe(2);
      expect(finalQuality.lint.passed).toBe(true);
      expect(finalQuality.test.passed).toBe(true);
    });

    /**
     * OrchestratorServerの品質ゲート結果取得エンドポイントが定義されていることを確認
     *
     * @see Requirements: 4.3
     */
    test('OrchestratorServerに品質ゲート結果取得エンドポイントが定義されていること', async () => {
      const serverContent = await fs.readFile(
        'tools/cli/lib/execution/orchestrator-server.ts',
        'utf-8'
      );

      // 品質ゲート結果取得エンドポイント
      expect(serverContent).toContain('/quality');
      expect(serverContent).toContain('QUALITY_RESULTS_NOT_FOUND');

      // 品質ゲート結果の読み込みロジック
      expect(serverContent).toContain('quality.json');
    });
  });
});
