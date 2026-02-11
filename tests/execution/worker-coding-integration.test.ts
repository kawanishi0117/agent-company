/**
 * WorkerAgent コーディングエージェント統合テスト
 *
 * WorkerAgentがCodingAgentAdapterを使用してコーディングタスクを実行する
 * 統合ロジックをテストする。
 *
 * @module tests/execution/worker-coding-integration
 * @see Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkerAgent,
  createWorkerAgent,
  type WorkerAgentConfig,
  type ExecuteTaskOptions,
} from '../../tools/cli/lib/execution/agents/worker.js';
import type { SubTask, CodingTaskResult } from '../../tools/cli/lib/execution/types.js';
import type { CodingAgentAdapter } from '../../tools/coding-agents/base.js';
import { CodingAgentRegistry, CodingAgentError } from '../../tools/coding-agents/index.js';

// =============================================================================
// モック設定
// =============================================================================

// AIアダプタをモック化（非コーディングタスク用）
vi.mock('../../tools/adapters/index.js', () => ({
  getAdapter: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue({ content: 'TASK_COMPLETE', isComplete: true }),
    isAvailable: vi.fn().mockResolvedValue(true),
  })),
  globalRegistry: {
    isExtendedAdapter: vi.fn().mockReturnValue(false),
  },
}));

// fs/promisesをモック化
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue({ code: 'ENOENT' }),
}));

// =============================================================================
// テストヘルパー
// =============================================================================

/**
 * モックCodingAgentAdapterを作成
 */
function createMockAdapter(overrides?: Partial<CodingAgentAdapter>): CodingAgentAdapter {
  return {
    name: 'mock-agent',
    displayName: 'Mock Agent',
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: 'タスク完了',
      stderr: '',
      exitCode: 0,
      durationMs: 5000,
      filesChanged: ['src/index.ts', 'src/utils.ts'],
    } satisfies CodingTaskResult),
    isAvailable: vi.fn().mockResolvedValue(true),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    ...overrides,
  };
}

/**
 * テスト用SubTaskを作成
 */
function createTestTask(overrides?: Partial<SubTask>): SubTask {
  return {
    id: 'task-001',
    parentId: 'ticket-001',
    title: 'ログイン機能の実装',
    description: 'ユーザー認証のログイン機能を実装する',
    acceptanceCriteria: [
      'メールアドレスとパスワードでログインできること',
      'バリデーションエラーが表示されること',
    ],
    status: 'in_progress',
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * テスト用のCodingAgentRegistryを作成（モックアダプタ付き）
 */
function createTestRegistry(adapter?: CodingAgentAdapter): CodingAgentRegistry {
  const registry = new CodingAgentRegistry();
  registry.clearAdapters();
  const mockAdapter = adapter ?? createMockAdapter();
  registry.registerAdapter(mockAdapter);
  return registry;
}

// =============================================================================
// テスト
// =============================================================================

describe('WorkerAgent コーディングエージェント統合', () => {
  let registry: CodingAgentRegistry;
  let mockAdapter: CodingAgentAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockAdapter();
    registry = createTestRegistry(mockAdapter);
  });

  // ===========================================================================
  // コーディングタスク判定
  // ===========================================================================

  describe('コーディングタスク判定', () => {
    it('workerType=developer の場合、CodingAgentAdapterを使用する', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-001',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-001',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
      };

      const result = await agent.executeTask(task, options);

      // CodingAgentAdapterのexecuteが呼ばれたことを確認
      expect(mockAdapter.execute).toHaveBeenCalledOnce();
      expect(result.status).toBe('success');
    });

    it('workerType=test の場合、CodingAgentAdapterを使用する', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-002',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-002',
        workerType: 'test',
        codingWorkDir: '/tmp/workspace',
      };

      const result = await agent.executeTask(task, options);

      expect(mockAdapter.execute).toHaveBeenCalledOnce();
      expect(result.status).toBe('success');
    });

    it('workerType=research の場合、既存の会話ループを使用する', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-003',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-003',
        workerType: 'research',
      };

      const result = await agent.executeTask(task, options);

      // CodingAgentAdapterは呼ばれない
      expect(mockAdapter.execute).not.toHaveBeenCalled();
      // 会話ループで完了（モックがTASK_COMPLETEを返す）
      expect(result.status).toBe('success');
    });

    it('workerType=design の場合、既存の会話ループを使用する', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-004',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-004',
        workerType: 'design',
      };

      const result = await agent.executeTask(task, options);

      expect(mockAdapter.execute).not.toHaveBeenCalled();
    });

    it('workerTypeが未指定の場合、既存の会話ループを使用する', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-005',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-005',
      };

      const result = await agent.executeTask(task, options);

      expect(mockAdapter.execute).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // プロンプト構築
  // ===========================================================================

  describe('コーディングプロンプト構築', () => {
    it('タスク情報がプロンプトに含まれる', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-010',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask({
        title: 'API実装',
        description: 'REST APIエンドポイントを実装する',
        acceptanceCriteria: ['GET /api/users が動作すること', 'テストが通ること'],
      });
      const options: ExecuteTaskOptions = {
        runId: 'run-010',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
      };

      await agent.executeTask(task, options);

      // execute呼び出し時のプロンプトを検証
      const executeCall = vi.mocked(mockAdapter.execute).mock.calls[0][0];
      expect(executeCall.prompt).toContain('API実装');
      expect(executeCall.prompt).toContain('REST APIエンドポイントを実装する');
      expect(executeCall.prompt).toContain('GET /api/users が動作すること');
      expect(executeCall.prompt).toContain('テストが通ること');
    });

    it('追加のシステムプロンプトがプロンプトに含まれる', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-011',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-011',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
        systemPrompt: 'TypeScriptで実装すること',
      };

      await agent.executeTask(task, options);

      const executeCall = vi.mocked(mockAdapter.execute).mock.calls[0][0];
      expect(executeCall.prompt).toContain('TypeScriptで実装すること');
    });
  });

  // ===========================================================================
  // 結果変換
  // ===========================================================================

  describe('CodingTaskResult → ExecutionResult 変換', () => {
    it('成功時のExecutionResultが正しく構築される', async () => {
      const config: WorkerAgentConfig = {
        agentId: 'worker-020',
        codingAgentRegistry: registry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-020',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
      };

      const result = await agent.executeTask(task, options);

      expect(result.runId).toBe('run-020');
      expect(result.ticketId).toBe('ticket-001');
      expect(result.agentId).toBe('worker-020');
      expect(result.status).toBe('success');
      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts[0].path).toBe('src/index.ts');
      expect(result.artifacts[1].path).toBe('src/utils.ts');
      expect(result.conversationTurns).toBe(1);
    });

    it('失敗時のExecutionResultにエラー情報が含まれる', async () => {
      const failAdapter = createMockAdapter({
        execute: vi.fn().mockResolvedValue({
          success: false,
          output: '',
          stderr: 'コンパイルエラー',
          exitCode: 1,
          durationMs: 3000,
          filesChanged: [],
        } satisfies CodingTaskResult),
      });
      const failRegistry = createTestRegistry(failAdapter);

      const config: WorkerAgentConfig = {
        agentId: 'worker-021',
        codingAgentRegistry: failRegistry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-021',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
      };

      const result = await agent.executeTask(task, options);

      expect(result.status).toBe('error');
    });
  });

  // ===========================================================================
  // エラーハンドリング
  // ===========================================================================

  describe('エラーハンドリング', () => {
    it('CodingAgentErrorが適切にハンドリングされる', async () => {
      const errorAdapter = createMockAdapter({
        execute: vi.fn().mockRejectedValue(
          new CodingAgentError('エージェント未インストール', 'NOT_FOUND', 'mock-agent')
        ),
      });
      const errorRegistry = createTestRegistry(errorAdapter);

      const config: WorkerAgentConfig = {
        agentId: 'worker-030',
        codingAgentRegistry: errorRegistry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-030',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
      };

      const result = await agent.executeTask(task, options);

      expect(result.status).toBe('error');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('NOT_FOUND');
    });

    it('利用可能なエージェントがない場合のエラー', async () => {
      const emptyRegistry = new CodingAgentRegistry();
      emptyRegistry.clearAdapters();

      const config: WorkerAgentConfig = {
        agentId: 'worker-031',
        codingAgentRegistry: emptyRegistry,
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-031',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
      };

      const result = await agent.executeTask(task, options);

      expect(result.status).toBe('error');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 優先エージェント選択
  // ===========================================================================

  describe('優先エージェント選択', () => {
    it('codingAgentNameで指定したエージェントが優先される', async () => {
      const preferredAdapter = createMockAdapter({
        name: 'preferred-agent',
        displayName: 'Preferred Agent',
      });
      const multiRegistry = new CodingAgentRegistry();
      multiRegistry.clearAdapters();
      multiRegistry.registerAdapter(mockAdapter);
      multiRegistry.registerAdapter(preferredAdapter);

      const config: WorkerAgentConfig = {
        agentId: 'worker-040',
        codingAgentRegistry: multiRegistry,
        codingAgentName: 'preferred-agent',
      };
      const agent = createWorkerAgent(config);
      const task = createTestTask();
      const options: ExecuteTaskOptions = {
        runId: 'run-040',
        workerType: 'developer',
        codingWorkDir: '/tmp/workspace',
      };

      await agent.executeTask(task, options);

      // preferred-agentのexecuteが呼ばれたことを確認
      expect(preferredAdapter.execute).toHaveBeenCalledOnce();
      expect(mockAdapter.execute).not.toHaveBeenCalled();
    });
  });
});
