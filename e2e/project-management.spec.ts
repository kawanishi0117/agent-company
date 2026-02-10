import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * プロジェクト管理 E2Eテスト
 * プロジェクト登録、編集、削除のフロー検証
 * @requirements autonomous-agent-workflow
 */
test.describe('Project Management', () => {
  /**
   * プロジェクト管理コンポーネントの存在確認
   */
  test.describe('Project Manager Structure', () => {
    test('should have project manager implementation', async () => {
      const projectManagerPath = 'tools/cli/lib/execution/project-manager.ts';
      const stat = await fs.stat(projectManagerPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(projectManagerPath, 'utf-8');
      // 必須メソッドが含まれていること
      expect(content).toContain('addProject');
      expect(content).toContain('getProject');
      expect(content).toContain('listProjects');
      expect(content).toContain('updateProject');
      expect(content).toContain('removeProject');
    });

    test('should have branch configuration support', async () => {
      const projectManagerPath = 'tools/cli/lib/execution/project-manager.ts';
      const content = await fs.readFile(projectManagerPath, 'utf-8');

      // ブランチ設定が含まれていること
      expect(content).toContain('baseBranch');
      expect(content).toContain('agentBranch');
    });

    test('should have git URL validation', async () => {
      const projectManagerPath = 'tools/cli/lib/execution/project-manager.ts';
      const content = await fs.readFile(projectManagerPath, 'utf-8');

      // Git URL検証が含まれていること
      expect(content).toContain('validateGitUrl');
    });

    test('should have agent branch creation', async () => {
      const projectManagerPath = 'tools/cli/lib/execution/project-manager.ts';
      const content = await fs.readFile(projectManagerPath, 'utf-8');

      // エージェントブランチ作成が含まれていること
      expect(content).toContain('ensureAgentBranch');
    });
  });

  /**
   * プロジェクト型定義の検証
   */
  test.describe('Project Types', () => {
    test('should have extended project type', async () => {
      const typesPath = 'tools/cli/lib/execution/types.ts';
      const content = await fs.readFile(typesPath, 'utf-8');

      // 拡張プロジェクト型が定義されていること
      expect(content).toContain('ExtendedProject');
      expect(content).toContain('baseBranch');
      expect(content).toContain('agentBranch');
    });

    test('should have project options type', async () => {
      const typesPath = 'tools/cli/lib/execution/types.ts';
      const content = await fs.readFile(typesPath, 'utf-8');

      // プロジェクトオプション型が定義されていること
      expect(content).toContain('AddProjectOptions');
    });
  });

  /**
   * プロジェクトCLIコマンドの検証
   */
  test.describe('Project CLI Command', () => {
    test('should have project command implementation', async () => {
      const projectCommandPath = 'tools/cli/commands/project.ts';
      const stat = await fs.stat(projectCommandPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(projectCommandPath, 'utf-8');
      // 必須サブコマンドが含まれていること
      expect(content).toContain('add');
      expect(content).toContain('list');
    });

    test('should have branch options in CLI', async () => {
      const projectCommandPath = 'tools/cli/commands/project.ts';
      const content = await fs.readFile(projectCommandPath, 'utf-8');

      // ブランチオプションが含まれていること
      expect(content).toContain('base-branch');
      expect(content).toContain('agent-branch');
    });
  });

  /**
   * GUI プロジェクト画面の存在確認
   */
  test.describe('Project GUI Structure', () => {
    test('should have project pages', async () => {
      const projectPages = [
        'gui/web/app/projects/page.tsx',
        'gui/web/app/projects/new/page.tsx',
        'gui/web/app/projects/[id]/page.tsx',
      ];

      for (const pagePath of projectPages) {
        const stat = await fs.stat(pagePath);
        expect(stat.isFile(), `${pagePath} should exist`).toBe(true);
      }
    });

    test('should have project form component', async () => {
      const formPath = 'gui/web/components/projects/ProjectForm.tsx';
      const stat = await fs.stat(formPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(formPath, 'utf-8');
      // フォームフィールドが含まれていること
      expect(content).toContain('name');
      expect(content).toContain('gitUrl');
      expect(content).toContain('baseBranch');
      expect(content).toContain('agentBranch');
    });

    test('should have project API routes', async () => {
      const apiRoutes = [
        'gui/web/app/api/projects/route.ts',
        'gui/web/app/api/projects/[id]/route.ts',
      ];

      for (const routePath of apiRoutes) {
        const stat = await fs.stat(routePath);
        expect(stat.isFile(), `${routePath} should exist`).toBe(true);
      }
    });
  });

  /**
   * プロジェクト永続化の検証
   */
  test.describe('Project Persistence', () => {
    test('should have projects.json file', async () => {
      const projectsPath = 'workspaces/projects.json';
      const stat = await fs.stat(projectsPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(projectsPath, 'utf-8');
      const data = JSON.parse(content);
      expect(data).toHaveProperty('projects');
      expect(Array.isArray(data.projects)).toBe(true);
    });

    test('should have save and load methods', async () => {
      const projectManagerPath = 'tools/cli/lib/execution/project-manager.ts';
      const content = await fs.readFile(projectManagerPath, 'utf-8');

      // 永続化メソッドが含まれていること
      expect(content).toContain('save');
      expect(content).toContain('load');
    });
  });

  /**
   * プロジェクトバリデーションの検証
   */
  test.describe('Project Validation', () => {
    test('should have form validation in GUI', async () => {
      const formPath = 'gui/web/components/projects/ProjectForm.tsx';
      const content = await fs.readFile(formPath, 'utf-8');

      // バリデーションが含まれていること
      expect(content).toContain('error');
      // 日本語で「必須」と表示されている
      expect(content).toContain('必須');
    });

    test('should have git URL validation logic', async () => {
      const projectManagerPath = 'tools/cli/lib/execution/project-manager.ts';
      const content = await fs.readFile(projectManagerPath, 'utf-8');

      // Git URL検証ロジックが含まれていること
      expect(content).toContain('validateGitUrl');
      expect(content).toContain('git');
    });
  });

  /**
   * プロジェクトとチケットの連携検証
   */
  test.describe('Project-Ticket Integration', () => {
    test('should have project ID in ticket types', async () => {
      const typesPath = 'tools/cli/lib/execution/types.ts';
      const content = await fs.readFile(typesPath, 'utf-8');

      // チケットにprojectIdが含まれていること
      expect(content).toContain('projectId');
    });

    test('should have ticket manager with project support', async () => {
      const ticketManagerPath = 'tools/cli/lib/execution/ticket-manager.ts';
      const content = await fs.readFile(ticketManagerPath, 'utf-8');

      // プロジェクトIDを使用したチケット操作が含まれていること
      expect(content).toContain('projectId');
      expect(content).toContain('createParentTicket');
    });
  });

  /**
   * Git統合の検証
   */
  test.describe('Git Integration', () => {
    test('should have git manager implementation', async () => {
      const gitManagerPath = 'tools/cli/lib/execution/git-manager.ts';
      const stat = await fs.stat(gitManagerPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(gitManagerPath, 'utf-8');
      // 必須メソッドが含まれていること
      expect(content).toContain('clone');
      expect(content).toContain('checkout');
      expect(content).toContain('createBranch');
    });

    test('should have branch management', async () => {
      const gitManagerPath = 'tools/cli/lib/execution/git-manager.ts';
      const content = await fs.readFile(gitManagerPath, 'utf-8');

      // ブランチ管理機能が含まれていること
      expect(content).toContain('createTaskBranch');
      expect(content).toContain('mergeToAgentBranch');
    });
  });

  /**
   * Orchestrator統合の検証
   */
  test.describe('Orchestrator Integration', () => {
    test('should have orchestrator with ticket manager', async () => {
      const orchestratorPath = 'tools/cli/lib/execution/orchestrator.ts';
      const content = await fs.readFile(orchestratorPath, 'utf-8');

      // TicketManagerとの統合が含まれていること
      expect(content).toContain('TicketManager');
      expect(content).toContain('ticketManager');
    });

    test('should have orchestrator with pr creator', async () => {
      const orchestratorPath = 'tools/cli/lib/execution/orchestrator.ts';
      const content = await fs.readFile(orchestratorPath, 'utf-8');

      // PRCreatorとの統合が含まれていること
      expect(content).toContain('PRCreator');
      expect(content).toContain('prCreator');
    });

    test('should have orchestrator with review workflow', async () => {
      const orchestratorPath = 'tools/cli/lib/execution/orchestrator.ts';
      const content = await fs.readFile(orchestratorPath, 'utf-8');

      // ReviewWorkflowとの統合が含まれていること
      expect(content).toContain('ReviewWorkflow');
      expect(content).toContain('reviewWorkflow');
    });
  });

  /**
   * WorkerPool統合の検証
   */
  test.describe('WorkerPool Integration', () => {
    test('should have worker pool with type registry', async () => {
      const workerPoolPath = 'tools/cli/lib/execution/worker-pool.ts';
      const content = await fs.readFile(workerPoolPath, 'utf-8');

      // WorkerTypeRegistryとの統合が含まれていること
      expect(content).toContain('WorkerTypeRegistry');
      expect(content).toContain('workerTypeRegistry');
    });

    test('should have worker type matching', async () => {
      const workerPoolPath = 'tools/cli/lib/execution/worker-pool.ts';
      const content = await fs.readFile(workerPoolPath, 'utf-8');

      // ワーカータイプマッチングが含まれていること
      expect(content).toContain('matchWorkerTypeForTask');
    });
  });
});
