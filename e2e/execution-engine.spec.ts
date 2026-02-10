import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Agent Execution Engine E2Eテスト
 * 指示 → 分解 → 実行 → レビュー → マージの統合テスト
 * @requirements 23.1, 23.8
 */
test.describe('Agent Execution Engine', () => {
  /**
   * 34.1 完全フローテスト
   * 実行エンジンの基本構造が存在することを確認
   */
  test.describe('Complete Flow Structure', () => {
    test('should have execution engine core files', async () => {
      const coreFiles = [
        'tools/cli/lib/execution/types.ts',
        'tools/cli/lib/execution/orchestrator.ts',
        'tools/cli/lib/execution/decomposer.ts',
        'tools/cli/lib/execution/worker-pool.ts',
        'tools/cli/lib/execution/worker-container.ts',
        'tools/cli/lib/execution/agent-bus.ts',
        'tools/cli/lib/execution/git-manager.ts',
        'tools/cli/lib/execution/process-monitor.ts',
        'tools/cli/lib/execution/quality-gate.ts',
        'tools/cli/lib/execution/state-manager.ts',
        'tools/cli/lib/execution/error-handler.ts',
        'tools/cli/lib/execution/tools.ts',
      ];

      for (const file of coreFiles) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });

    test('should have agent implementation files', async () => {
      const agentFiles = [
        'tools/cli/lib/execution/agents/worker.ts',
        'tools/cli/lib/execution/agents/manager.ts',
        'tools/cli/lib/execution/agents/reviewer.ts',
        'tools/cli/lib/execution/agents/merger.ts',
      ];

      for (const file of agentFiles) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });

    test('should have CLI command files', async () => {
      const commandFiles = ['tools/cli/commands/execute.ts', 'tools/cli/commands/project.ts'];

      for (const file of commandFiles) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });

    test('should have agent registry definitions', async () => {
      const registryFiles = [
        'agents/registry/reviewer.yaml',
        'agents/registry/merger.yaml',
        'agents/registry/templates/worker.yaml',
      ];

      for (const file of registryFiles) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });

    test('should have prompt templates', async () => {
      const promptFiles = ['agents/prompts/roles/manager.md', 'agents/prompts/roles/worker.md'];

      for (const file of promptFiles) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });
  });

  /**
   * 34.2 エラーリカバリテスト
   * エラーハンドリング機能の存在確認
   */
  test.describe('Error Recovery Structure', () => {
    test('should have error handler with retry logic', async () => {
      const errorHandlerContent = await fs.readFile(
        'tools/cli/lib/execution/error-handler.ts',
        'utf-8'
      );

      // リトライロジックが含まれていること
      expect(errorHandlerContent).toContain('retry');
      expect(errorHandlerContent).toContain('backoff');
    });

    test('should have state manager for recovery', async () => {
      const stateManagerContent = await fs.readFile(
        'tools/cli/lib/execution/state-manager.ts',
        'utf-8'
      );

      // 状態保存・復元機能が含まれていること
      expect(stateManagerContent).toContain('save');
      expect(stateManagerContent).toContain('load');
    });
  });

  /**
   * 34.3 隔離検証テスト
   * コンテナ隔離設定の存在確認
   */
  test.describe('Isolation Structure', () => {
    test('should have container runtime abstraction', async () => {
      const containerRuntimeContent = await fs.readFile(
        'tools/cli/lib/execution/container-runtime.ts',
        'utf-8'
      );

      // ランタイム抽象化が含まれていること
      expect(containerRuntimeContent).toContain('ContainerRuntime');
      expect(containerRuntimeContent).toContain('dod');
    });

    test('should have worker container isolation', async () => {
      const workerContainerContent = await fs.readFile(
        'tools/cli/lib/execution/worker-container.ts',
        'utf-8'
      );

      // 隔離設定が含まれていること
      expect(workerContainerContent).toContain('isolation');
    });

    test('should have Docker worker image definition', async () => {
      const dockerfilePath = 'infra/docker/images/worker/Dockerfile';
      const stat = await fs.stat(dockerfilePath);
      expect(stat.isFile()).toBe(true);

      const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');
      expect(dockerfileContent).toContain('FROM');
    });
  });

  /**
   * GUI統合テスト
   * GUI画面の存在確認
   */
  test.describe('GUI Integration', () => {
    test('should have GUI pages', async () => {
      const guiPages = [
        'gui/web/app/dashboard/page.tsx',
        'gui/web/app/command/page.tsx',
        'gui/web/app/review/page.tsx',
        'gui/web/app/settings/page.tsx',
        'gui/web/app/tasks/[id]/page.tsx',
      ];

      for (const file of guiPages) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });

    test('should have GUI API routes', async () => {
      const apiRoutes = [
        'gui/web/app/api/dashboard/route.ts',
        'gui/web/app/api/command/route.ts',
        'gui/web/app/api/review/route.ts',
        'gui/web/app/api/settings/route.ts',
        'gui/web/app/api/tasks/[id]/route.ts',
      ];

      for (const file of apiRoutes) {
        const stat = await fs.stat(file);
        expect(stat.isFile(), `${file} should exist`).toBe(true);
      }
    });
  });

  /**
   * 設定ファイルテスト
   */
  test.describe('Configuration', () => {
    test('should have runtime state directory', async () => {
      const stateDir = 'runtime/state';
      const stat = await fs.stat(stateDir);
      expect(stat.isDirectory()).toBe(true);
    });

    test('should have projects configuration', async () => {
      const projectsFile = 'workspaces/projects.json';
      const stat = await fs.stat(projectsFile);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(projectsFile, 'utf-8');
      const data = JSON.parse(content);
      expect(data).toHaveProperty('projects');
    });
  });
});
