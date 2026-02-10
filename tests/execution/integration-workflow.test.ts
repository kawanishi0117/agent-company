/**
 * 統合テスト - 自律エージェントワークフロー
 *
 * Orchestrator、WorkerPool、AgentBus、TicketManager、PRCreator、ReviewWorkflowの
 * 統合動作を検証するテスト。
 *
 * @module tests/execution/integration-workflow
 * @see Requirements: 2.1-2.8, 3.1-3.8, 4.1-4.6, 5.1-5.6, 10.1-10.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkerPool, createWorkerPool } from '../../tools/cli/lib/execution/worker-pool';
import { AgentBus, createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { TicketManager, createTicketManager } from '../../tools/cli/lib/execution/ticket-manager';
import {
  WorkerTypeRegistry,
  createWorkerTypeRegistry,
} from '../../tools/cli/lib/execution/worker-type-registry';
// FileMessageQueueはAgentBus内部で使用されるため、直接インポートは不要
import { WorkerType, AgentMessageType } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テストヘルパー
// =============================================================================

/**
 * テスト用のユニークIDを生成
 */
function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * テスト用ディレクトリのベースパス
 */
const TEST_BASE_PATH = 'runtime/test-integration';

/**
 * テスト用ディレクトリをクリーンアップ
 */
async function cleanupTestDir(testId: string): Promise<void> {
  const testDir = path.join(TEST_BASE_PATH, testId);
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // ディレクトリが存在しない場合は無視
  }
}

// =============================================================================
// 統合テスト
// =============================================================================

describe('Integration: Autonomous Agent Workflow', () => {
  let workerPool: WorkerPool;
  let agentBus: AgentBus;
  let ticketManager: TicketManager;
  let workerTypeRegistry: WorkerTypeRegistry;
  let testId: string;

  beforeEach(async () => {
    testId = generateTestId();

    // 各コンポーネントを初期化
    workerPool = createWorkerPool({ maxWorkers: 3, useContainers: false });

    // ファイルベースメッセージキューを使用（テスト用パス）
    const queueBasePath = path.join(TEST_BASE_PATH, testId, 'bus');
    // FileMessageQueueはAgentBus内部で使用される
    agentBus = createAgentBus({
      messageQueueConfig: { type: 'file', basePath: queueBasePath },
      runtimeBasePath: path.join(TEST_BASE_PATH, testId, 'runs'),
    });
    await agentBus.initialize();

    ticketManager = createTicketManager();
    workerTypeRegistry = createWorkerTypeRegistry();
  });

  afterEach(async () => {
    await workerPool.reset();
    await cleanupTestDir(testId);
  });

  // ===========================================================================
  // WorkerPool + WorkerTypeRegistry 統合テスト
  // ===========================================================================

  describe('WorkerPool + WorkerTypeRegistry Integration', () => {
    it('should match worker type based on task description', () => {
      // 開発タスク
      const devType = workerPool.matchWorkerTypeForTask('実装する機能を作成');
      expect(devType).toBe('developer');

      // テストタスク
      const testType = workerPool.matchWorkerTypeForTask('ユニットテストを作成');
      expect(testType).toBe('test');

      // リサーチタスク
      const researchType = workerPool.matchWorkerTypeForTask('技術調査を行う');
      expect(researchType).toBe('research');

      // デザインタスク
      const designType = workerPool.matchWorkerTypeForTask('APIスキーマを設計');
      expect(designType).toBe('design');

      // レビュータスク
      const reviewType = workerPool.matchWorkerTypeForTask('コードレビューを実施');
      expect(reviewType).toBe('reviewer');
    });

    it('should get worker by type with correct capabilities', async () => {
      const worker = await workerPool.getWorkerByType('developer');
      expect(worker).not.toBeNull();

      const workerInfo = workerPool.getAllWorkers()[0];
      expect(workerInfo.capabilities).toContain('code_implementation');
      expect(workerInfo.capabilities).toContain('file_operations');
    });

    it('should get worker type config from pool', () => {
      const config = workerPool.getWorkerTypeConfig('test');
      expect(config.type).toBe('test');
      expect(config.capabilities).toContain('test_creation');
      expect(config.capabilities).toContain('test_execution');
    });

    it('should respect max workers limit when getting workers by type', async () => {
      // 最大3ワーカーを取得
      const worker1 = await workerPool.getWorkerByType('developer');
      const worker2 = await workerPool.getWorkerByType('test');
      const worker3 = await workerPool.getWorkerByType('reviewer');

      expect(worker1).not.toBeNull();
      expect(worker2).not.toBeNull();
      expect(worker3).not.toBeNull();

      // 4つ目は取得できない
      const worker4 = await workerPool.getWorkerByType('research');
      expect(worker4).toBeNull();

      expect(workerPool.getPoolStatus().totalWorkers).toBe(3);
    });
  });

  // ===========================================================================
  // AgentBus メッセージタイプ統合テスト
  // ===========================================================================

  describe('AgentBus Message Types Integration', () => {
    it('should support review_request message type', async () => {
      const message = agentBus.createReviewRequestMessage('worker-001', 'reviewer-001', {
        ticketId: 'TICKET-001',
        changes: ['file1.ts', 'file2.ts'],
      });

      expect(message.type).toBe('review_request');
      expect(message.from).toBe('worker-001');
      expect(message.to).toBe('reviewer-001');

      // 送信できることを確認
      await expect(agentBus.send(message)).resolves.not.toThrow();
    });

    it('should support review_response message type', async () => {
      const message = agentBus.createReviewResponseMessage('reviewer-001', 'worker-001', {
        decision: 'approve',
        feedback: 'LGTM',
      });

      expect(message.type).toBe('review_response');
      await expect(agentBus.send(message)).resolves.not.toThrow();
    });

    it('should support conflict_escalate message type', async () => {
      const message = agentBus.createConflictEscalateMessage('merger-001', 'reviewer-001', {
        files: ['conflicted.ts'],
        details: 'Merge conflict in function X',
      });

      expect(message.type).toBe('conflict_escalate');
      await expect(agentBus.send(message)).resolves.not.toThrow();
    });

    it('should poll messages by agent ID', async () => {
      // レビュー要求を送信
      const reviewRequest = agentBus.createReviewRequestMessage('worker-001', 'reviewer-001', {
        ticketId: 'TICKET-001',
      });
      await agentBus.send(reviewRequest);

      // レビューアがポーリング
      const messages = await agentBus.poll('reviewer-001', 100);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('review_request');
    });
  });

  // ===========================================================================
  // TicketManager 統合テスト
  // ===========================================================================

  describe('TicketManager Integration', () => {
    const projectId = 'test-project';

    it('should create hierarchical tickets', async () => {
      // 親チケット作成
      const parent = await ticketManager.createParentTicket(projectId, 'ユーザー認証機能の実装');
      // IDはprojectId-連番形式
      expect(parent.id).toMatch(new RegExp(`^${projectId}-`));
      expect(parent.status).toBe('pending');

      // 子チケット作成
      const child = await ticketManager.createChildTicket(parent.id, {
        title: 'ログイン機能の実装',
        description: 'ユーザーログイン機能を実装する',
        workerType: 'developer',
      });
      expect(child.id).toMatch(new RegExp(`^${parent.id}-`));
      expect(child.parentId).toBe(parent.id);

      // 孫チケット作成
      const grandchild = await ticketManager.createGrandchildTicket(child.id, {
        title: 'ログインフォームの作成',
        description: 'ログインフォームUIを作成する',
        acceptanceCriteria: ['フォームが表示される', 'バリデーションが動作する'],
      });
      expect(grandchild.id).toMatch(new RegExp(`^${child.id}-`));
      expect(grandchild.parentId).toBe(child.id);
    });

    it('should propagate status from grandchild to parent', async () => {
      // チケット階層を作成
      const parent = await ticketManager.createParentTicket(projectId, 'Feature');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: 'Task',
        description: 'Task description',
        workerType: 'developer',
      });
      const grandchild = await ticketManager.createGrandchildTicket(child.id, {
        title: 'Subtask',
        description: 'Subtask description',
        acceptanceCriteria: ['Criteria 1'],
      });

      // 孫チケットを完了
      await ticketManager.updateTicketStatus(grandchild.id, 'completed');

      // 子チケットも完了になる
      const updatedChild = await ticketManager.getChildTicket(child.id);
      expect(updatedChild?.status).toBe('completed');

      // 親チケットも完了になる
      const updatedParent = await ticketManager.getParentTicket(parent.id);
      expect(updatedParent?.status).toBe('completed');
    });

    it('should list tickets by project', async () => {
      // 複数のチケットを作成
      await ticketManager.createParentTicket(projectId, 'Feature 1');
      await ticketManager.createParentTicket(projectId, 'Feature 2');
      await ticketManager.createParentTicket('other-project', 'Other Feature');

      const projectTickets = await ticketManager.listParentTickets(projectId);
      expect(projectTickets.length).toBe(2);
    });
  });

  // ===========================================================================
  // ワークフロー統合テスト
  // ===========================================================================

  describe('End-to-End Workflow Integration', () => {
    it('should execute complete ticket workflow', async () => {
      const projectId = 'workflow-test';

      // 1. チケット作成
      const parent = await ticketManager.createParentTicket(projectId, 'APIエンドポイントの実装');
      expect(parent.status).toBe('pending');

      // 2. タスク内容からワーカータイプを推定
      const workerType =
        workerPool.matchWorkerTypeForTask('ユーザー一覧を取得するエンドポイントを実装');
      expect(workerType).toBe('developer');

      // 3. 子チケット作成（ワーカータイプ付き）
      const child = await ticketManager.createChildTicket(parent.id, {
        title: 'GET /users エンドポイント',
        description: 'ユーザー一覧を取得するエンドポイントを実装',
        workerType: workerType,
      });

      // 4. 孫チケット作成
      const grandchild = await ticketManager.createGrandchildTicket(child.id, {
        title: 'ルートハンドラの実装',
        description: 'GET /users のルートハンドラを実装する',
        acceptanceCriteria: ['エンドポイントが動作する', 'JSONを返す'],
      });

      // 5. ワーカー取得
      const worker = await workerPool.getWorkerByType(workerType);
      expect(worker).not.toBeNull();
      const workerId = worker!.agentId;

      // 6. タスク割り当てメッセージ送信
      const assignMessage = agentBus.createTaskAssignMessage('manager-001', workerId, {
        ticketId: grandchild.id,
        description: grandchild.description,
      });
      await agentBus.send(assignMessage);

      // 7. ワーカーがメッセージを受信
      const messages = await agentBus.poll(workerId, 100);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('task_assign');

      // 8. タスク完了（シミュレート）
      await ticketManager.updateTicketStatus(grandchild.id, 'completed');

      // 9. レビュー要求メッセージ送信
      const reviewRequest = agentBus.createReviewRequestMessage(workerId, 'reviewer-001', {
        ticketId: grandchild.id,
      });
      await agentBus.send(reviewRequest);

      // 10. レビューア応答（シミュレート）
      const reviewResponse = agentBus.createReviewResponseMessage('reviewer-001', workerId, {
        decision: 'approve',
      });
      await agentBus.send(reviewResponse);

      // 11. ワーカー解放
      const releaseResult = await workerPool.releaseWorker(workerId);
      expect(releaseResult.success).toBe(true);

      // 12. 最終状態確認
      const finalParent = await ticketManager.getParentTicket(parent.id);
      expect(finalParent?.status).toBe('completed');
    });

    it('should handle multiple concurrent workers', async () => {
      // 複数のタスクを作成
      const tasks = [
        { description: 'コード実装を行う', expectedType: 'developer' as WorkerType },
        { description: 'ユニットテストを作成する', expectedType: 'test' as WorkerType },
        { description: 'コードレビューを実施する', expectedType: 'reviewer' as WorkerType },
      ];

      const workerIds: string[] = [];

      for (const task of tasks) {
        const workerType = workerPool.matchWorkerTypeForTask(task.description);
        expect(workerType).toBe(task.expectedType);

        const worker = await workerPool.getWorkerByType(workerType);
        expect(worker).not.toBeNull();
        workerIds.push(worker!.agentId);
      }

      // 全ワーカーがアクティブ
      expect(workerPool.getActiveWorkerCount()).toBe(3);

      // ワーカーを解放
      for (const workerId of workerIds) {
        await workerPool.releaseWorker(workerId);
      }

      // 全ワーカーがアイドル
      expect(workerPool.getIdleWorkerCount()).toBe(3);
    });
  });

  // ===========================================================================
  // エラーハンドリング統合テスト
  // ===========================================================================

  describe('Error Handling Integration', () => {
    it('should handle invalid worker type gracefully', () => {
      expect(() => {
        workerTypeRegistry.getConfig('invalid' as WorkerType);
      }).toThrow();
    });

    it('should handle ticket not found', async () => {
      const ticket = await ticketManager.getParentTicket('non-existent-id');
      expect(ticket).toBeNull();
    });

    it('should handle message validation errors', async () => {
      const invalidMessage = {
        id: '',
        type: 'task_assign' as AgentMessageType,
        from: 'sender',
        to: 'receiver',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      await expect(agentBus.send(invalidMessage)).rejects.toThrow();
    });
  });
});
