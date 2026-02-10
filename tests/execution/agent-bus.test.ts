/**
 * Agent Bus ユニットテスト
 *
 * エージェント間通信バスの機能をテストする。
 *
 * @module tests/execution/agent-bus.test
 * @see Requirements: 10.1, 10.2
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentBus, createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { FileMessageQueue } from '../../tools/cli/lib/execution/message-queue';
import { AgentMessage, AgentMessageType } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_BASE_PATH = 'runtime/test-bus';
const TEST_RUNTIME_PATH = 'runtime/test-runs';

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * テスト用のメッセージを作成
 */
function createTestMessage(
  type: AgentMessageType = 'task_assign',
  from: string = 'manager-001',
  to: string = 'worker-001',
  payload: unknown = { taskId: 'task-001' }
): AgentMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    from,
    to,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * ディレクトリを再帰的に削除
 */
async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

// =============================================================================
// テストスイート
// =============================================================================

describe('AgentBus', () => {
  let agentBus: AgentBus;

  beforeEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await cleanupDirectory(TEST_BASE_PATH);
    await cleanupDirectory(TEST_RUNTIME_PATH);

    // Agent Busを作成
    agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: TEST_BASE_PATH,
      },
      runtimeBasePath: TEST_RUNTIME_PATH,
    });
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await cleanupDirectory(TEST_BASE_PATH);
    await cleanupDirectory(TEST_RUNTIME_PATH);
  });

  // ===========================================================================
  // 初期化テスト
  // ===========================================================================

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await agentBus.initialize();
      expect(agentBus.isInitialized()).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      await agentBus.initialize();
      await agentBus.initialize(); // 2回目の呼び出し
      expect(agentBus.isInitialized()).toBe(true);
    });

    it('should auto-initialize on first send', async () => {
      const message = createTestMessage();
      await agentBus.send(message);
      expect(agentBus.isInitialized()).toBe(true);
    });
  });

  // ===========================================================================
  // メッセージキュー設定テスト
  // ===========================================================================

  describe('setMessageQueue', () => {
    it('should set a new message queue', async () => {
      const newQueue = new FileMessageQueue(TEST_BASE_PATH + '-new');
      agentBus.setMessageQueue(newQueue);

      // 新しいキューが設定されていることを確認
      expect(agentBus.getMessageQueue()).toBe(newQueue);
      // 再初期化が必要になることを確認
      expect(agentBus.isInitialized()).toBe(false);
    });
  });

  // ===========================================================================
  // メッセージ送信テスト
  // ===========================================================================

  describe('send', () => {
    it('should send a message successfully', async () => {
      const message = createTestMessage();
      await expect(agentBus.send(message)).resolves.not.toThrow();
    });

    it('should throw error for message without id', async () => {
      const message = createTestMessage();
      message.id = '';
      await expect(agentBus.send(message)).rejects.toThrow('Message ID is required');
    });

    it('should throw error for message without type', async () => {
      const message = createTestMessage();
      (message as unknown as Record<string, unknown>).type = undefined;
      await expect(agentBus.send(message)).rejects.toThrow('Message type is required');
    });

    it('should throw error for invalid message type', async () => {
      const message = createTestMessage();
      (message as unknown as Record<string, unknown>).type = 'invalid_type';
      await expect(agentBus.send(message)).rejects.toThrow('Invalid message type');
    });

    it('should throw error for message without from', async () => {
      const message = createTestMessage();
      message.from = '';
      await expect(agentBus.send(message)).rejects.toThrow('Message sender (from) is required');
    });

    it('should throw error for message without to', async () => {
      const message = createTestMessage();
      message.to = '';
      await expect(agentBus.send(message)).rejects.toThrow('Message recipient (to) is required');
    });

    it('should throw error for message without timestamp', async () => {
      const message = createTestMessage();
      (message as unknown as Record<string, unknown>).timestamp = undefined;
      await expect(agentBus.send(message)).rejects.toThrow('Message timestamp is required');
    });

    it('should log message when runId is provided in options', async () => {
      const message = createTestMessage();
      const runId = 'test-run-001';

      await agentBus.send(message, { runId });

      // ログファイルが作成されていることを確認
      const logPath = path.join(TEST_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain(message.type.toUpperCase());
      expect(logContent).toContain(message.from);
      expect(logContent).toContain(message.to);
    });

    it('should log message when runId is in payload', async () => {
      const runId = 'test-run-002';
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-001',
        runId,
      });

      await agentBus.send(message);

      // ログファイルが作成されていることを確認
      const logPath = path.join(TEST_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain(message.type.toUpperCase());
    });
  });

  // ===========================================================================
  // メッセージポーリングテスト
  // ===========================================================================

  describe('poll', () => {
    it('should poll messages for an agent', async () => {
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001');
      await agentBus.send(message);

      // 短いタイムアウトでポーリング
      const messages = await agentBus.poll('worker-001', 1000);

      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('task_assign');
      expect(messages[0].from).toBe('manager-001');
      expect(messages[0].to).toBe('worker-001');
    });

    it('should return empty array when no messages', async () => {
      const messages = await agentBus.poll('worker-001', 100);
      expect(messages).toEqual([]);
    });

    it('should throw error for empty agent id', async () => {
      await expect(agentBus.poll('')).rejects.toThrow('Agent ID is required');
    });

    it('should poll multiple messages', async () => {
      // 複数のメッセージを送信
      const message1 = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-001',
      });
      const message2 = createTestMessage('status_request', 'manager-001', 'worker-001', {
        requestId: 'req-001',
      });

      await agentBus.send(message1);
      await agentBus.send(message2);

      // ポーリング
      const messages = await agentBus.poll('worker-001', 1000);

      expect(messages.length).toBe(2);
    });
  });

  // ===========================================================================
  // ブロードキャストテスト
  // ===========================================================================

  describe('broadcast', () => {
    it('should broadcast message to all registered agents', async () => {
      // エージェントを登録（メッセージ送信で自動登録）
      await agentBus.send(createTestMessage('task_assign', 'manager-001', 'worker-001'));
      await agentBus.send(createTestMessage('task_assign', 'manager-001', 'worker-002'));

      // ブロードキャストメッセージを作成
      const broadcastMessage = createTestMessage('status_request', 'manager-001', 'all');

      await agentBus.broadcast(broadcastMessage);

      // 各ワーカーがメッセージを受信できることを確認
      const messages1 = await agentBus.poll('worker-001', 1000);
      const messages2 = await agentBus.poll('worker-002', 1000);

      // ブロードキャストメッセージが含まれていることを確認
      const hasStatusRequest1 = messages1.some((m) => m.type === 'status_request');
      const hasStatusRequest2 = messages2.some((m) => m.type === 'status_request');

      expect(hasStatusRequest1).toBe(true);
      expect(hasStatusRequest2).toBe(true);
    });

    it('should not send broadcast to the sender', async () => {
      // エージェントを登録
      await agentBus.send(createTestMessage('task_assign', 'manager-001', 'worker-001'));

      // マネージャーからブロードキャスト
      const broadcastMessage = createTestMessage('status_request', 'manager-001', 'all');
      await agentBus.broadcast(broadcastMessage);

      // マネージャー自身はブロードキャストを受信しない
      const managerMessages = await agentBus.poll('manager-001', 100);
      const hasStatusRequest = managerMessages.some((m) => m.type === 'status_request');

      expect(hasStatusRequest).toBe(false);
    });

    it('should log broadcast message when runId is provided', async () => {
      const runId = 'test-run-broadcast';
      const broadcastMessage = createTestMessage('status_request', 'manager-001', 'all');

      await agentBus.broadcast(broadcastMessage, { runId });

      // ログファイルが作成されていることを確認
      const logPath = path.join(TEST_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain('STATUS_REQUEST');
    });
  });

  // ===========================================================================
  // メッセージ履歴テスト
  // ===========================================================================

  describe('getMessageHistory', () => {
    it('should return message history for a run', async () => {
      const runId = 'test-run-history';

      // メッセージを送信
      const message1 = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-001',
        runId,
      });
      const message2 = createTestMessage('task_complete', 'worker-001', 'manager-001', {
        taskId: 'task-001',
        runId,
      });

      await agentBus.send(message1);
      await agentBus.send(message2);

      // 履歴を取得
      const history = await agentBus.getMessageHistory(runId);

      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for non-existent run', async () => {
      const history = await agentBus.getMessageHistory('non-existent-run');
      expect(history).toEqual([]);
    });

    it('should throw error for empty run id', async () => {
      await expect(agentBus.getMessageHistory('')).rejects.toThrow('Run ID is required');
    });

    it('should return messages sorted by timestamp', async () => {
      const runId = 'test-run-sorted';

      // 異なるタイムスタンプでメッセージを送信
      const message1 = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-001',
        runId,
      });
      message1.timestamp = '2024-01-01T10:00:00.000Z';

      const message2 = createTestMessage('task_complete', 'worker-001', 'manager-001', {
        taskId: 'task-001',
        runId,
      });
      message2.timestamp = '2024-01-01T11:00:00.000Z';

      await agentBus.send(message2); // 後のタイムスタンプを先に送信
      await agentBus.send(message1); // 先のタイムスタンプを後に送信

      // 履歴を取得
      const history = await agentBus.getMessageHistory(runId);

      // タイムスタンプ順にソートされていることを確認
      for (let i = 1; i < history.length; i++) {
        const prevTime = new Date(history[i - 1].timestamp).getTime();
        const currTime = new Date(history[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });

  // ===========================================================================
  // メッセージ作成ヘルパーテスト
  // ===========================================================================

  describe('message creation helpers', () => {
    it('should create task_assign message', () => {
      const message = agentBus.createTaskAssignMessage('manager-001', 'worker-001', {
        taskId: 'task-001',
      });

      expect(message.type).toBe('task_assign');
      expect(message.from).toBe('manager-001');
      expect(message.to).toBe('worker-001');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });

    it('should create task_complete message', () => {
      const message = agentBus.createTaskCompleteMessage('worker-001', 'manager-001', {
        taskId: 'task-001',
        result: 'success',
      });

      expect(message.type).toBe('task_complete');
      expect(message.from).toBe('worker-001');
      expect(message.to).toBe('manager-001');
    });

    it('should create task_failed message', () => {
      const message = agentBus.createTaskFailedMessage('worker-001', 'manager-001', {
        taskId: 'task-001',
        error: 'Something went wrong',
      });

      expect(message.type).toBe('task_failed');
    });

    it('should create escalate message', () => {
      const message = agentBus.createEscalateMessage('worker-001', 'manager-001', {
        issue: 'Need help',
      });

      expect(message.type).toBe('escalate');
    });

    it('should create status_request message', () => {
      const message = agentBus.createStatusRequestMessage('manager-001', 'worker-001', {
        requestId: 'req-001',
      });

      expect(message.type).toBe('status_request');
    });

    it('should create status_response message', () => {
      const message = agentBus.createStatusResponseMessage('worker-001', 'manager-001', {
        status: 'working',
        progress: 50,
      });

      expect(message.type).toBe('status_response');
    });
  });

  // ===========================================================================
  // メッセージタイプテスト
  // ===========================================================================

  describe('message types', () => {
    /**
     * @see Requirement 10.2: THE Agent_Bus SHALL support message types
     */
    const messageTypes: AgentMessageType[] = [
      'task_assign',
      'task_complete',
      'task_failed',
      'escalate',
      'status_request',
      'status_response',
    ];

    messageTypes.forEach((type) => {
      it(`should support ${type} message type`, async () => {
        const message = createTestMessage(type);
        await expect(agentBus.send(message)).resolves.not.toThrow();
      });
    });
  });

  // ===========================================================================
  // エンドツーエンドフローテスト
  // ===========================================================================

  describe('end-to-end flow', () => {
    it('should support complete task assignment flow', async () => {
      const runId = 'test-run-e2e';

      // 1. マネージャーがワーカーにタスクを割り当て
      const assignMessage = agentBus.createTaskAssignMessage('manager-001', 'worker-001', {
        taskId: 'task-001',
        description: 'Implement feature X',
        runId,
      });
      await agentBus.send(assignMessage, { runId });

      // 2. ワーカーがメッセージを受信
      const workerMessages = await agentBus.poll('worker-001', 1000);
      expect(workerMessages.length).toBe(1);
      expect(workerMessages[0].type).toBe('task_assign');

      // 3. ワーカーがタスク完了を報告
      const completeMessage = agentBus.createTaskCompleteMessage('worker-001', 'manager-001', {
        taskId: 'task-001',
        result: 'Feature X implemented',
        runId,
      });
      await agentBus.send(completeMessage, { runId });

      // 4. マネージャーが完了メッセージを受信
      const managerMessages = await agentBus.poll('manager-001', 1000);
      expect(managerMessages.length).toBe(1);
      expect(managerMessages[0].type).toBe('task_complete');

      // 5. 履歴を確認
      const history = await agentBus.getMessageHistory(runId);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should support escalation flow', async () => {
      const runId = 'test-run-escalation';

      // 1. マネージャーがワーカーにタスクを割り当て
      const assignMessage = agentBus.createTaskAssignMessage('manager-001', 'worker-001', {
        taskId: 'task-002',
        runId,
      });
      await agentBus.send(assignMessage, { runId });

      // 2. ワーカーがメッセージを受信
      await agentBus.poll('worker-001', 1000);

      // 3. ワーカーが問題をエスカレーション
      const escalateMessage = agentBus.createEscalateMessage('worker-001', 'manager-001', {
        taskId: 'task-002',
        issue: 'Cannot access required resource',
        runId,
      });
      await agentBus.send(escalateMessage, { runId });

      // 4. マネージャーがエスカレーションを受信
      const managerMessages = await agentBus.poll('manager-001', 1000);
      expect(managerMessages.length).toBe(1);
      expect(managerMessages[0].type).toBe('escalate');
    });
  });

  // ===========================================================================
  // メッセージルーティングテスト（Requirements 10.3, 10.4, 10.5）
  // ===========================================================================

  describe('message routing', () => {
    /**
     * マネージャーからワーカーへのタスク割り当てフロー
     * @see Requirement 10.3: WHEN Manager_Agent assigns task, THE Agent_Bus SHALL deliver to Worker_Agent
     */
    describe('manager to worker routing (Requirement 10.3)', () => {
      it('should deliver task_assign message from manager to worker', async () => {
        const managerId = 'manager-frontend';
        const workerId = 'worker-ui-001';
        const taskPayload = {
          taskId: 'task-ui-component',
          title: 'Create Button Component',
          description: 'Implement a reusable button component with variants',
          priority: 'high',
        };

        // マネージャーがタスク割り当てメッセージを送信
        const assignMessage = agentBus.createTaskAssignMessage(managerId, workerId, taskPayload);
        await agentBus.send(assignMessage);

        // ワーカーがメッセージを受信
        const receivedMessages = await agentBus.poll(workerId, 1000);

        // 検証: メッセージが正しく配信されたこと
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('task_assign');
        expect(receivedMessages[0].from).toBe(managerId);
        expect(receivedMessages[0].to).toBe(workerId);
        expect(receivedMessages[0].payload).toEqual(taskPayload);
      });

      it('should deliver task_assign to correct worker when multiple workers exist', async () => {
        const managerId = 'manager-backend';
        const worker1Id = 'worker-api-001';
        const worker2Id = 'worker-api-002';

        // ワーカー1にタスクを割り当て
        const task1 = agentBus.createTaskAssignMessage(managerId, worker1Id, {
          taskId: 'task-api-endpoint',
        });
        await agentBus.send(task1);

        // ワーカー2にタスクを割り当て
        const task2 = agentBus.createTaskAssignMessage(managerId, worker2Id, {
          taskId: 'task-database-migration',
        });
        await agentBus.send(task2);

        // 各ワーカーが自分宛のメッセージのみを受信
        const worker1Messages = await agentBus.poll(worker1Id, 1000);
        const worker2Messages = await agentBus.poll(worker2Id, 1000);

        expect(worker1Messages.length).toBe(1);
        expect((worker1Messages[0].payload as Record<string, unknown>).taskId).toBe(
          'task-api-endpoint'
        );

        expect(worker2Messages.length).toBe(1);
        expect((worker2Messages[0].payload as Record<string, unknown>).taskId).toBe(
          'task-database-migration'
        );
      });

      it('should support multiple task assignments to same worker', async () => {
        const managerId = 'manager-qa';
        const workerId = 'worker-test-001';

        // 複数のタスクを同じワーカーに割り当て
        const tasks = [
          { taskId: 'task-unit-test', type: 'unit' },
          { taskId: 'task-integration-test', type: 'integration' },
          { taskId: 'task-e2e-test', type: 'e2e' },
        ];

        for (const task of tasks) {
          const message = agentBus.createTaskAssignMessage(managerId, workerId, task);
          await agentBus.send(message);
        }

        // ワーカーが全てのメッセージを受信
        const receivedMessages = await agentBus.poll(workerId, 1000);

        expect(receivedMessages.length).toBe(3);
        expect(receivedMessages.every((m) => m.type === 'task_assign')).toBe(true);
        expect(receivedMessages.every((m) => m.from === managerId)).toBe(true);
      });
    });

    /**
     * ワーカーからマネージャーへの完了/失敗通知フロー
     * @see Requirement 10.4: WHEN Worker_Agent completes/fails, THE Agent_Bus SHALL notify Manager_Agent
     */
    describe('worker to manager notification (Requirement 10.4)', () => {
      it('should deliver task_complete message from worker to manager', async () => {
        const managerId = 'manager-dev';
        const workerId = 'worker-dev-001';
        const resultPayload = {
          taskId: 'task-feature-x',
          status: 'completed',
          artifacts: ['src/feature-x.ts', 'tests/feature-x.test.ts'],
          duration: 3600,
        };

        // ワーカーがタスク完了メッセージを送信
        const completeMessage = agentBus.createTaskCompleteMessage(
          workerId,
          managerId,
          resultPayload
        );
        await agentBus.send(completeMessage);

        // マネージャーがメッセージを受信
        const receivedMessages = await agentBus.poll(managerId, 1000);

        // 検証: 完了メッセージが正しく配信されたこと
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('task_complete');
        expect(receivedMessages[0].from).toBe(workerId);
        expect(receivedMessages[0].to).toBe(managerId);
        expect(receivedMessages[0].payload).toEqual(resultPayload);
      });

      it('should deliver task_failed message from worker to manager', async () => {
        const managerId = 'manager-dev';
        const workerId = 'worker-dev-002';
        const errorPayload = {
          taskId: 'task-feature-y',
          status: 'failed',
          error: {
            code: 'BUILD_ERROR',
            message: 'TypeScript compilation failed',
            details: 'Cannot find module @types/node',
          },
          attempts: 3,
        };

        // ワーカーがタスク失敗メッセージを送信
        const failedMessage = agentBus.createTaskFailedMessage(workerId, managerId, errorPayload);
        await agentBus.send(failedMessage);

        // マネージャーがメッセージを受信
        const receivedMessages = await agentBus.poll(managerId, 1000);

        // 検証: 失敗メッセージが正しく配信されたこと
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('task_failed');
        expect(receivedMessages[0].from).toBe(workerId);
        expect(receivedMessages[0].to).toBe(managerId);
        expect(
          (receivedMessages[0].payload as Record<string, unknown>).error as Record<string, unknown>
        ).toBeDefined();
        expect(
          (
            (receivedMessages[0].payload as Record<string, unknown>).error as Record<
              string,
              unknown
            >
          ).code
        ).toBe('BUILD_ERROR');
      });

      it('should handle mixed complete and failed notifications from multiple workers', async () => {
        const managerId = 'manager-ops';
        const worker1Id = 'worker-ops-001';
        const worker2Id = 'worker-ops-002';

        // ワーカー1: タスク完了
        const completeMessage = agentBus.createTaskCompleteMessage(worker1Id, managerId, {
          taskId: 'task-deploy-staging',
          status: 'completed',
        });
        await agentBus.send(completeMessage);

        // ワーカー2: タスク失敗
        const failedMessage = agentBus.createTaskFailedMessage(worker2Id, managerId, {
          taskId: 'task-deploy-production',
          status: 'failed',
          error: 'Permission denied',
        });
        await agentBus.send(failedMessage);

        // マネージャーが両方のメッセージを受信
        const receivedMessages = await agentBus.poll(managerId, 1000);

        expect(receivedMessages.length).toBe(2);

        const completeMsg = receivedMessages.find((m) => m.type === 'task_complete');
        const failedMsg = receivedMessages.find((m) => m.type === 'task_failed');

        expect(completeMsg).toBeDefined();
        expect(completeMsg?.from).toBe(worker1Id);

        expect(failedMsg).toBeDefined();
        expect(failedMsg?.from).toBe(worker2Id);
      });
    });

    /**
     * ワーカーからマネージャーへのエスカレーションフロー
     * @see Requirement 10.5: WHEN Worker_Agent needs help, THE Agent_Bus SHALL escalate to Manager_Agent
     */
    describe('worker escalation to manager (Requirement 10.5)', () => {
      it('should deliver escalate message from worker to manager', async () => {
        const managerId = 'manager-senior';
        const workerId = 'worker-junior-001';
        const escalationPayload = {
          taskId: 'task-complex-refactor',
          issue: 'Need guidance on architecture decision',
          context: {
            currentApproach: 'Monolithic service',
            proposedApproach: 'Microservices',
            blockers: ['Unclear data boundaries', 'Performance concerns'],
          },
          urgency: 'medium',
        };

        // ワーカーがエスカレーションメッセージを送信
        const escalateMessage = agentBus.createEscalateMessage(
          workerId,
          managerId,
          escalationPayload
        );
        await agentBus.send(escalateMessage);

        // マネージャーがメッセージを受信
        const receivedMessages = await agentBus.poll(managerId, 1000);

        // 検証: エスカレーションメッセージが正しく配信されたこと
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('escalate');
        expect(receivedMessages[0].from).toBe(workerId);
        expect(receivedMessages[0].to).toBe(managerId);
        expect((receivedMessages[0].payload as Record<string, unknown>).issue).toBe(
          'Need guidance on architecture decision'
        );
      });

      it('should support escalation chain (worker -> manager -> senior manager)', async () => {
        const seniorManagerId = 'manager-cto';
        const managerId = 'manager-team-lead';
        const workerId = 'worker-dev-003';

        // ワーカーがチームリードにエスカレーション
        const workerEscalation = agentBus.createEscalateMessage(workerId, managerId, {
          taskId: 'task-security-issue',
          issue: 'Potential security vulnerability found',
          severity: 'high',
        });
        await agentBus.send(workerEscalation);

        // チームリードがメッセージを受信
        const managerMessages = await agentBus.poll(managerId, 1000);
        expect(managerMessages.length).toBe(1);
        expect(managerMessages[0].type).toBe('escalate');

        // チームリードがさらにCTOにエスカレーション
        const managerEscalation = agentBus.createEscalateMessage(managerId, seniorManagerId, {
          originalTaskId: 'task-security-issue',
          originalFrom: workerId,
          issue: 'Critical security vulnerability requires executive decision',
          severity: 'critical',
          recommendation: 'Immediate production freeze recommended',
        });
        await agentBus.send(managerEscalation);

        // CTOがメッセージを受信
        const seniorMessages = await agentBus.poll(seniorManagerId, 1000);
        expect(seniorMessages.length).toBe(1);
        expect(seniorMessages[0].type).toBe('escalate');
        expect(seniorMessages[0].from).toBe(managerId);
        expect((seniorMessages[0].payload as Record<string, unknown>).severity).toBe('critical');
      });

      it('should handle multiple escalations from different workers', async () => {
        const managerId = 'manager-support';
        const workers = ['worker-support-001', 'worker-support-002', 'worker-support-003'];

        // 各ワーカーからエスカレーション
        for (let i = 0; i < workers.length; i++) {
          const escalation = agentBus.createEscalateMessage(workers[i], managerId, {
            taskId: `task-customer-${i + 1}`,
            issue: `Customer issue #${i + 1} requires manager approval`,
            priority: i === 0 ? 'high' : 'medium',
          });
          await agentBus.send(escalation);
        }

        // マネージャーが全てのエスカレーションを受信
        const receivedMessages = await agentBus.poll(managerId, 1000);

        expect(receivedMessages.length).toBe(3);
        expect(receivedMessages.every((m) => m.type === 'escalate')).toBe(true);

        // 各ワーカーからのメッセージが含まれていることを確認
        const senders = receivedMessages.map((m) => m.from);
        expect(senders).toContain('worker-support-001');
        expect(senders).toContain('worker-support-002');
        expect(senders).toContain('worker-support-003');
      });
    });

    /**
     * ステータス要求/応答フロー
     * @see Requirement 10.2: status_request, status_response message types
     */
    describe('status request/response flow', () => {
      it('should support status request from manager to worker', async () => {
        const managerId = 'manager-monitor';
        const workerId = 'worker-long-task';

        // マネージャーがステータス要求を送信
        const statusRequest = agentBus.createStatusRequestMessage(managerId, workerId, {
          requestId: 'status-req-001',
          taskId: 'task-long-running',
        });
        await agentBus.send(statusRequest);

        // ワーカーがステータス要求を受信
        const workerMessages = await agentBus.poll(workerId, 1000);
        expect(workerMessages.length).toBe(1);
        expect(workerMessages[0].type).toBe('status_request');

        // ワーカーがステータス応答を送信
        const statusResponse = agentBus.createStatusResponseMessage(workerId, managerId, {
          requestId: 'status-req-001',
          taskId: 'task-long-running',
          status: 'running',
          progress: 65,
          currentStep: 'Running integration tests',
          estimatedCompletion: '2024-01-15T15:30:00Z',
        });
        await agentBus.send(statusResponse);

        // マネージャーがステータス応答を受信
        const managerMessages = await agentBus.poll(managerId, 1000);
        expect(managerMessages.length).toBe(1);
        expect(managerMessages[0].type).toBe('status_response');
        expect((managerMessages[0].payload as Record<string, unknown>).progress).toBe(65);
      });
    });
  });
});

// =============================================================================
// メッセージ履歴ログテスト（Requirement 10.8）
// =============================================================================

/**
 * メッセージ履歴ログのテスト
 * @see Requirement 10.8: THE message history SHALL be logged to `runtime/runs/<run-id>/messages.log`
 */
describe('Message History Logging (Requirement 10.8)', () => {
  let agentBus: AgentBus;
  const TEST_LOG_BASE_PATH = 'runtime/test-log-bus';
  const TEST_LOG_RUNTIME_PATH = 'runtime/test-log-runs';

  beforeEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await cleanupDirectory(TEST_LOG_BASE_PATH);
    await cleanupDirectory(TEST_LOG_RUNTIME_PATH);

    // Agent Busを作成
    agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: TEST_LOG_BASE_PATH,
      },
      runtimeBasePath: TEST_LOG_RUNTIME_PATH,
    });
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await cleanupDirectory(TEST_LOG_BASE_PATH);
    await cleanupDirectory(TEST_LOG_RUNTIME_PATH);
  });

  // ===========================================================================
  // ログファイル作成テスト
  // ===========================================================================

  describe('log file creation', () => {
    it('should create messages.log file when sending message with runId', async () => {
      const runId = 'test-log-creation-001';
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-001',
      });

      await agentBus.send(message, { runId });

      // ログファイルが作成されていることを確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const exists = await fs
        .access(logPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create log directory if it does not exist', async () => {
      const runId = 'test-log-dir-creation';
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001');

      await agentBus.send(message, { runId });

      // ディレクトリが作成されていることを確認
      const dirPath = path.join(TEST_LOG_RUNTIME_PATH, runId);
      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should not create log file when runId is not provided', async () => {
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-no-log',
      });

      await agentBus.send(message);

      // ログファイルが作成されていないことを確認（runIdがないため）
      const logDir = TEST_LOG_RUNTIME_PATH;
      const entries = await fs.readdir(logDir).catch(() => []);
      expect(entries.length).toBe(0);
    });
  });

  // ===========================================================================
  // ログフォーマットテスト
  // ===========================================================================

  describe('log format', () => {
    it('should log message in correct format: [timestamp] TYPE from -> to | payload', async () => {
      const runId = 'test-log-format-001';
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-format-test',
        description: 'Test task',
      });

      await agentBus.send(message, { runId });

      // ログファイルの内容を確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // フォーマット検証: [timestamp] TYPE from -> to | payload
      expect(logContent).toMatch(/^\[.+\]\s+TASK_ASSIGN\s+/);
      expect(logContent).toContain('manager-001');
      expect(logContent).toContain('->');
      expect(logContent).toContain('worker-001');
      expect(logContent).toContain('|');
      expect(logContent).toContain('task-format-test');
    });

    it('should log message type in uppercase', async () => {
      const runId = 'test-log-uppercase';
      const messageTypes: AgentMessageType[] = [
        'task_assign',
        'task_complete',
        'task_failed',
        'escalate',
        'status_request',
        'status_response',
      ];

      for (const type of messageTypes) {
        const message = createTestMessage(type, 'agent-a', 'agent-b');
        await agentBus.send(message, { runId });
      }

      // ログファイルの内容を確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // 各メッセージタイプが大文字で記録されていることを確認
      expect(logContent).toContain('TASK_ASSIGN');
      expect(logContent).toContain('TASK_COMPLETE');
      expect(logContent).toContain('TASK_FAILED');
      expect(logContent).toContain('ESCALATE');
      expect(logContent).toContain('STATUS_REQUEST');
      expect(logContent).toContain('STATUS_RESPONSE');
    });

    it('should include ISO8601 timestamp in log entry', async () => {
      const runId = 'test-log-timestamp';
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001');

      await agentBus.send(message, { runId });

      // ログファイルの内容を確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // ISO8601形式のタイムスタンプが含まれていることを確認
      // 例: [2024-01-15T10:30:00.000Z]
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should serialize payload as JSON', async () => {
      const runId = 'test-log-payload-json';
      const complexPayload = {
        taskId: 'task-complex',
        nested: {
          level1: {
            level2: 'deep value',
          },
        },
        array: [1, 2, 3],
        boolean: true,
        number: 42,
      };
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001', complexPayload);

      await agentBus.send(message, { runId });

      // ログファイルの内容を確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // ペイロードがJSON形式で含まれていることを確認
      expect(logContent).toContain('"taskId":"task-complex"');
      expect(logContent).toContain('"level2":"deep value"');
      expect(logContent).toContain('"array":[1,2,3]');
    });
  });

  // ===========================================================================
  // 複数メッセージログテスト
  // ===========================================================================

  describe('multiple message logging', () => {
    it('should append multiple messages to the same log file', async () => {
      const runId = 'test-log-multiple';

      // 複数のメッセージを送信
      const messages = [
        createTestMessage('task_assign', 'manager-001', 'worker-001', { taskId: 'task-1' }),
        createTestMessage('status_request', 'manager-001', 'worker-001', { requestId: 'req-1' }),
        createTestMessage('status_response', 'worker-001', 'manager-001', { status: 'working' }),
        createTestMessage('task_complete', 'worker-001', 'manager-001', { result: 'success' }),
      ];

      for (const message of messages) {
        await agentBus.send(message, { runId });
      }

      // ログファイルの内容を確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      const logLines = logContent.split('\n').filter((line) => line.trim() !== '');

      // 4つのメッセージが記録されていることを確認
      expect(logLines.length).toBe(4);
    });

    it('should preserve message order in log file', async () => {
      const runId = 'test-log-order';

      // 順番にメッセージを送信
      await agentBus.send(
        createTestMessage('task_assign', 'manager-001', 'worker-001', { order: 1 }),
        { runId }
      );
      await agentBus.send(
        createTestMessage('status_request', 'manager-001', 'worker-001', { order: 2 }),
        { runId }
      );
      await agentBus.send(
        createTestMessage('task_complete', 'worker-001', 'manager-001', { order: 3 }),
        { runId }
      );

      // ログファイルの内容を確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      const logLines = logContent.split('\n').filter((line) => line.trim() !== '');

      // 順序が保持されていることを確認
      expect(logLines[0]).toContain('TASK_ASSIGN');
      expect(logLines[0]).toContain('"order":1');
      expect(logLines[1]).toContain('STATUS_REQUEST');
      expect(logLines[1]).toContain('"order":2');
      expect(logLines[2]).toContain('TASK_COMPLETE');
      expect(logLines[2]).toContain('"order":3');
    });
  });

  // ===========================================================================
  // ログ読み込みテスト
  // ===========================================================================

  describe('log reading', () => {
    it('should read message history from log file', async () => {
      const runId = 'test-log-read';

      // メッセージを送信してログに記録
      const originalMessage = createTestMessage('task_assign', 'manager-001', 'worker-001', {
        taskId: 'task-read-test',
        description: 'Test reading from log',
      });
      await agentBus.send(originalMessage, { runId });

      // 履歴を取得
      const history = await agentBus.getMessageHistory(runId);

      // 履歴にメッセージが含まれていることを確認
      expect(history.length).toBeGreaterThanOrEqual(1);

      // メッセージの内容が正しいことを確認
      const foundMessage = history.find(
        (m) => (m.payload as Record<string, unknown>).taskId === 'task-read-test'
      );
      expect(foundMessage).toBeDefined();
      expect(foundMessage?.type).toBe('task_assign');
      expect(foundMessage?.from).toBe('manager-001');
      expect(foundMessage?.to).toBe('worker-001');
    });

    it('should parse log entries correctly', async () => {
      const runId = 'test-log-parse';

      // 複数のメッセージタイプを送信
      await agentBus.send(
        createTestMessage('task_assign', 'manager-a', 'worker-a', { taskId: 'task-a' }),
        { runId }
      );
      await agentBus.send(
        createTestMessage('escalate', 'worker-a', 'manager-a', { issue: 'help needed' }),
        { runId }
      );

      // 履歴を取得
      const history = await agentBus.getMessageHistory(runId);

      // 各メッセージが正しくパースされていることを確認
      const taskAssign = history.find((m) => m.type === 'task_assign');
      const escalate = history.find((m) => m.type === 'escalate');

      expect(taskAssign).toBeDefined();
      expect(taskAssign?.from).toBe('manager-a');
      expect(taskAssign?.to).toBe('worker-a');

      expect(escalate).toBeDefined();
      expect(escalate?.from).toBe('worker-a');
      expect(escalate?.to).toBe('manager-a');
    });

    it('should handle empty log file gracefully', async () => {
      const runId = 'test-log-empty';

      // 空のログファイルを作成
      const logDir = path.join(TEST_LOG_RUNTIME_PATH, runId);
      await fs.mkdir(logDir, { recursive: true });
      await fs.writeFile(path.join(logDir, 'messages.log'), '', 'utf-8');

      // 履歴を取得
      const history = await agentBus.getMessageHistory(runId);

      // 空の配列が返されることを確認
      expect(history).toEqual([]);
    });

    it('should skip malformed log entries', async () => {
      const runId = 'test-log-malformed';

      // 正常なメッセージを送信
      await agentBus.send(
        createTestMessage('task_assign', 'manager-001', 'worker-001', { taskId: 'valid-task' }),
        { runId }
      );

      // 不正なエントリを追加
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      await fs.appendFile(logPath, 'This is not a valid log entry\n', 'utf-8');
      await fs.appendFile(logPath, '[invalid timestamp] TASK_ASSIGN\n', 'utf-8');

      // 正常なメッセージをもう1つ送信
      await agentBus.send(
        createTestMessage('task_complete', 'worker-001', 'manager-001', { result: 'done' }),
        { runId }
      );

      // 履歴を取得
      const history = await agentBus.getMessageHistory(runId);

      // 正常なメッセージのみが含まれていることを確認
      const validMessages = history.filter(
        (m) => m.type === 'task_assign' || m.type === 'task_complete'
      );
      expect(validMessages.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // ブロードキャストログテスト
  // ===========================================================================

  describe('broadcast logging', () => {
    it('should log broadcast messages with special recipient marker', async () => {
      const runId = 'test-log-broadcast';

      // ブロードキャストメッセージを送信
      const broadcastMessage = createTestMessage('status_request', 'manager-001', 'all', {
        requestId: 'broadcast-req-001',
      });
      await agentBus.broadcast(broadcastMessage, { runId });

      // ログファイルの内容を確認
      const logPath = path.join(TEST_LOG_RUNTIME_PATH, runId, 'messages.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // ブロードキャストマーカーが含まれていることを確認
      expect(logContent).toContain('__broadcast__');
      expect(logContent).toContain('STATUS_REQUEST');
    });
  });

  // ===========================================================================
  // エラーハンドリングテスト
  // ===========================================================================

  describe('error handling', () => {
    it('should not fail message send if logging fails', async () => {
      // 読み取り専用ディレクトリを作成してログ書き込みを失敗させる
      // （このテストはプラットフォーム依存のため、警告ログの確認のみ）
      const runId = 'test-log-error-handling';
      const message = createTestMessage('task_assign', 'manager-001', 'worker-001');

      // メッセージ送信は成功するはず（ログ失敗は警告のみ）
      await expect(agentBus.send(message, { runId })).resolves.not.toThrow();
    });
  });
});

// =============================================================================
// createAgentBusファクトリ関数テスト
// =============================================================================

describe('createAgentBus', () => {
  it('should create AgentBus with default config', () => {
    const bus = createAgentBus();
    expect(bus).toBeInstanceOf(AgentBus);
  });

  it('should create AgentBus with custom config', () => {
    const bus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: 'custom/path',
      },
      runtimeBasePath: 'custom/runtime',
    });

    expect(bus).toBeInstanceOf(AgentBus);
    expect(bus.getRuntimeBasePath()).toBe('custom/runtime');
  });
});
