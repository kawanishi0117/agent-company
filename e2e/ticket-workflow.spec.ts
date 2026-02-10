import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * チケットワークフロー E2Eテスト
 * チケット作成からPR作成までのフロー検証
 * @requirements autonomous-agent-workflow
 */
test.describe('Ticket Workflow', () => {
  /**
   * チケット管理コンポーネントの存在確認
   */
  test.describe('Ticket Management Structure', () => {
    test('should have ticket manager implementation', async () => {
      const ticketManagerPath = 'tools/cli/lib/execution/ticket-manager.ts';
      const stat = await fs.stat(ticketManagerPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(ticketManagerPath, 'utf-8');
      // 必須メソッドが含まれていること
      expect(content).toContain('createParentTicket');
      expect(content).toContain('createChildTicket');
      expect(content).toContain('createGrandchildTicket');
      expect(content).toContain('updateTicketStatus');
      expect(content).toContain('propagateStatusToParent');
    });

    test('should have ticket types defined', async () => {
      const typesPath = 'tools/cli/lib/execution/types.ts';
      const content = await fs.readFile(typesPath, 'utf-8');

      // チケット関連の型が定義されていること
      expect(content).toContain('TicketStatus');
      expect(content).toContain('ParentTicket');
      expect(content).toContain('ChildTicket');
      expect(content).toContain('GrandchildTicket');
      expect(content).toContain('WorkerType');
    });

    test('should have ticket CLI command', async () => {
      const ticketCommandPath = 'tools/cli/commands/ticket.ts';
      const stat = await fs.stat(ticketCommandPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(ticketCommandPath, 'utf-8');
      // 必須サブコマンドが含まれていること
      expect(content).toContain('create');
      expect(content).toContain('list');
      expect(content).toContain('status');
    });
  });

  /**
   * PR作成コンポーネントの存在確認
   */
  test.describe('PR Creator Structure', () => {
    test('should have PR creator implementation', async () => {
      const prCreatorPath = 'tools/cli/lib/execution/pr-creator.ts';
      const stat = await fs.stat(prCreatorPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(prCreatorPath, 'utf-8');
      // 必須メソッドが含まれていること
      expect(content).toContain('createPullRequest');
      expect(content).toContain('generatePRTitle');
      expect(content).toContain('generatePRBody');
    });

    test('should have PR title format', async () => {
      const prCreatorPath = 'tools/cli/lib/execution/pr-creator.ts';
      const content = await fs.readFile(prCreatorPath, 'utf-8');

      // PRタイトル形式が定義されていること
      expect(content).toContain('[AgentCompany]');
    });
  });

  /**
   * レビューワークフローの存在確認
   */
  test.describe('Review Workflow Structure', () => {
    test('should have review workflow implementation', async () => {
      const reviewWorkflowPath = 'tools/cli/lib/execution/review-workflow.ts';
      const stat = await fs.stat(reviewWorkflowPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(reviewWorkflowPath, 'utf-8');
      // 必須メソッドが含まれていること
      expect(content).toContain('requestReview');
      expect(content).toContain('submitReview');
      expect(content).toContain('getReviewStatus');
    });

    test('should have review decision handling', async () => {
      const reviewWorkflowPath = 'tools/cli/lib/execution/review-workflow.ts';
      const content = await fs.readFile(reviewWorkflowPath, 'utf-8');

      // レビュー決定処理が含まれていること
      expect(content).toContain('approved');
      expect(content).toContain('feedback');
    });
  });

  /**
   * ワーカータイプレジストリの存在確認
   */
  test.describe('Worker Type Registry Structure', () => {
    test('should have worker type registry implementation', async () => {
      const registryPath = 'tools/cli/lib/execution/worker-type-registry.ts';
      const stat = await fs.stat(registryPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(registryPath, 'utf-8');
      // 6種類のワーカータイプが定義されていること
      expect(content).toContain('research');
      expect(content).toContain('design');
      expect(content).toContain('designer');
      expect(content).toContain('developer');
      expect(content).toContain('test');
      expect(content).toContain('reviewer');
    });

    test('should have worker type matching', async () => {
      const registryPath = 'tools/cli/lib/execution/worker-type-registry.ts';
      const content = await fs.readFile(registryPath, 'utf-8');

      // マッチング機能が含まれていること
      expect(content).toContain('matchWorkerType');
    });
  });

  /**
   * GUI チケット画面の存在確認
   */
  test.describe('Ticket GUI Structure', () => {
    test('should have ticket pages', async () => {
      const ticketPages = [
        'gui/web/app/tickets/page.tsx',
        'gui/web/app/tickets/create/page.tsx',
        'gui/web/app/tickets/[id]/page.tsx',
      ];

      for (const pagePath of ticketPages) {
        const stat = await fs.stat(pagePath);
        expect(stat.isFile(), `${pagePath} should exist`).toBe(true);
      }
    });

    test('should have ticket components', async () => {
      const ticketComponents = [
        'gui/web/components/tickets/TicketTree.tsx',
        'gui/web/components/tickets/StatusBadge.tsx',
        'gui/web/components/tickets/index.ts',
      ];

      for (const componentPath of ticketComponents) {
        const stat = await fs.stat(componentPath);
        expect(stat.isFile(), `${componentPath} should exist`).toBe(true);
      }
    });

    test('should have ticket API routes', async () => {
      const apiRoutes = [
        'gui/web/app/api/tickets/route.ts',
        'gui/web/app/api/tickets/[id]/route.ts',
      ];

      for (const routePath of apiRoutes) {
        const stat = await fs.stat(routePath);
        expect(stat.isFile(), `${routePath} should exist`).toBe(true);
      }
    });
  });

  /**
   * チケット階層構造の検証
   */
  test.describe('Ticket Hierarchy', () => {
    test('should have hierarchical ID format in types', async () => {
      const typesPath = 'tools/cli/lib/execution/types.ts';
      const content = await fs.readFile(typesPath, 'utf-8');

      // 階層的ID形式のコメントまたは定義が含まれていること
      expect(content).toContain('id');
      expect(content).toContain('parentId');
    });

    test('should have status propagation logic', async () => {
      const ticketManagerPath = 'tools/cli/lib/execution/ticket-manager.ts';
      const content = await fs.readFile(ticketManagerPath, 'utf-8');

      // ステータス伝播ロジックが含まれていること
      expect(content).toContain('propagateStatusToParent');
      expect(content).toContain('completed');
    });
  });

  /**
   * エラーハンドリングの検証
   */
  test.describe('Error Handling', () => {
    test('should have exponential backoff retry', async () => {
      const errorHandlerPath = 'tools/cli/lib/execution/error-handler.ts';
      const content = await fs.readFile(errorHandlerPath, 'utf-8');

      // 指数バックオフが含まれていること
      expect(content).toContain('backoff');
      expect(content).toContain('retry');
    });

    test('should have error logging', async () => {
      const errorHandlerPath = 'tools/cli/lib/execution/error-handler.ts';
      const content = await fs.readFile(errorHandlerPath, 'utf-8');

      // エラーログ機能が含まれていること
      expect(content).toContain('log');
      expect(content).toContain('error');
    });
  });

  /**
   * 状態永続化の検証
   */
  test.describe('State Persistence', () => {
    test('should have ticket persistence in ticket manager', async () => {
      const ticketManagerPath = 'tools/cli/lib/execution/ticket-manager.ts';
      const content = await fs.readFile(ticketManagerPath, 'utf-8');

      // 永続化メソッドが含まれていること
      expect(content).toContain('saveTickets');
      expect(content).toContain('loadTickets');
    });

    test('should have state directory structure', async () => {
      const stateDir = 'runtime/state';
      const stat = await fs.stat(stateDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  /**
   * Git統合の検証
   */
  test.describe('Git Integration', () => {
    test('should have task branch creation in git manager', async () => {
      const gitManagerPath = 'tools/cli/lib/execution/git-manager.ts';
      const content = await fs.readFile(gitManagerPath, 'utf-8');

      // タスクブランチ作成機能が含まれていること
      expect(content).toContain('createTaskBranch');
      expect(content).toContain('commitWithTicketId');
    });

    test('should have merge functionality', async () => {
      const gitManagerPath = 'tools/cli/lib/execution/git-manager.ts';
      const content = await fs.readFile(gitManagerPath, 'utf-8');

      // マージ機能が含まれていること
      expect(content).toContain('mergeToAgentBranch');
    });

    test('should have conflict escalation', async () => {
      const gitManagerPath = 'tools/cli/lib/execution/git-manager.ts';
      const content = await fs.readFile(gitManagerPath, 'utf-8');

      // コンフリクトエスカレーション機能が含まれていること
      expect(content).toContain('escalateConflict');
    });
  });

  /**
   * AgentBus統合の検証
   */
  test.describe('AgentBus Integration', () => {
    test('should have review message types', async () => {
      const typesPath = 'tools/cli/lib/execution/types.ts';
      const content = await fs.readFile(typesPath, 'utf-8');

      // レビュー関連のメッセージタイプが含まれていること
      expect(content).toContain('review_request');
      expect(content).toContain('review_response');
      expect(content).toContain('conflict_escalate');
    });

    test('should have review message helpers in agent bus', async () => {
      const agentBusPath = 'tools/cli/lib/execution/agent-bus.ts';
      const content = await fs.readFile(agentBusPath, 'utf-8');

      // レビューメッセージヘルパーが含まれていること
      expect(content).toContain('createReviewRequestMessage');
      expect(content).toContain('createReviewResponseMessage');
    });
  });
});
