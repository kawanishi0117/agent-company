/**
 * Orchestrator テスト
 *
 * Orchestratorの基本機能をテストする。
 * - タスク管理（submitTask, getTaskStatus, cancelTask, resumeTask）
 * - エージェント管理（getActiveAgents, pauseAllAgents, resumeAllAgents, emergencyStop）
 * - 設定管理（updateConfig, getConfig）
 *
 * @see Requirements: 23.2, 23.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Orchestrator,
  createOrchestrator,
  createOrchestratorFromConfig,
  OrchestratorConfig,
  OrchestratorError,
  AgentInfo,
  TaskStatusDetail,
} from '../../tools/cli/lib/execution/orchestrator';
import { StateManager } from '../../tools/cli/lib/execution/state-manager';
import { AgentBus, createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { WorkerPool, createWorkerPool } from '../../tools/cli/lib/execution/worker-pool';
import { DEFAULT_SYSTEM_CONFIG, SystemConfig } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * テスト用の一時ディレクトリを作成
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join('runtime', 'test-orchestrator', `test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * テスト用の一時ディレクトリを削除
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

// =============================================================================
// テストスイート
// =============================================================================

describe('Orchestrator', () => {
  let tempDir: string;
  let orchestrator: Orchestrator;
  let stateManager: StateManager;
  let agentBus: AgentBus;
  let workerPool: WorkerPool;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = await createTempDir();

    // 各コンポーネントを作成
    stateManager = new StateManager(tempDir);
    agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: path.join(tempDir, 'bus'),
      },
      runtimeBasePath: path.join(tempDir, 'runs'),
    });
    workerPool = createWorkerPool({
      maxWorkers: 3,
      useContainers: false,
    });

    // Orchestratorを作成
    orchestrator = createOrchestrator({
      stateManager,
      agentBus,
      workerPool,
    });
  });

  afterEach(async () => {
    // クリーンアップ
    if (orchestrator && orchestrator.isInitialized()) {
      try {
        await orchestrator.emergencyStop();
      } catch {
        // エラーを無視
      }
    }
    await cleanupTempDir(tempDir);
  });

  // ===========================================================================
  // 初期化テスト
  // ===========================================================================

  describe('初期化', () => {
    it('createOrchestratorファクトリ関数が動作する', () => {
      const orch = createOrchestrator();
      expect(orch).toBeInstanceOf(Orchestrator);
      expect(orch.isInitialized()).toBe(false);
    });

    it('createOrchestratorFromConfigファクトリ関数が動作する', () => {
      const orch = createOrchestratorFromConfig({
        maxConcurrentWorkers: 5,
      });
      expect(orch).toBeInstanceOf(Orchestrator);
    });

    it('initializeが正常に完了する', async () => {
      await orchestrator.initialize();
      expect(orchestrator.isInitialized()).toBe(true);
    });

    it('複数回のinitializeは安全に処理される', async () => {
      await orchestrator.initialize();
      await orchestrator.initialize();
      expect(orchestrator.isInitialized()).toBe(true);
    });
  });

  // ===========================================================================
  // タスク管理テスト
  // ===========================================================================

  describe('タスク管理', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    describe('submitTask', () => {
      it('タスクを送信してタスクIDを取得できる', async () => {
        const taskId = await orchestrator.submitTask(
          'テスト機能を実装してください',
          'project-001'
        );

        expect(taskId).toBeDefined();
        expect(taskId).toMatch(/^task-/);
      });

      it('オプション付きでタスクを送信できる', async () => {
        const taskId = await orchestrator.submitTask(
          'テスト機能を実装してください',
          'project-001',
          {
            priority: 'high',
            tags: ['test', 'feature'],
            autoDecompose: false,
          }
        );

        expect(taskId).toBeDefined();
        const task = orchestrator.getTask(taskId);
        expect(task?.metadata.priority).toBe('high');
        expect(task?.metadata.tags).toContain('test');
      });

      it('空の指示でエラーになる', async () => {
        await expect(
          orchestrator.submitTask('', 'project-001')
        ).rejects.toThrow(OrchestratorError);
      });

      it('空のプロジェクトIDでエラーになる', async () => {
        await expect(
          orchestrator.submitTask('テスト機能を実装', '')
        ).rejects.toThrow(OrchestratorError);
      });

      it('緊急停止中は新規タスクを受け付けない', async () => {
        await orchestrator.emergencyStop();

        await expect(
          orchestrator.submitTask('テスト機能を実装', 'project-001')
        ).rejects.toThrow('緊急停止中');
      });
    });

    describe('getTaskStatus', () => {
      it('タスクステータスを取得できる', async () => {
        const taskId = await orchestrator.submitTask(
          'テスト機能を実装してください',
          'project-001',
          { autoDecompose: false }
        );

        const status = await orchestrator.getTaskStatus(taskId);

        expect(status.taskId).toBe(taskId);
        expect(status.status).toBeDefined();
        expect(status.progressPercent).toBeGreaterThanOrEqual(0);
        expect(status.progressPercent).toBeLessThanOrEqual(100);
      });

      it('存在しないタスクIDでエラーになる', async () => {
        await expect(
          orchestrator.getTaskStatus('non-existent-task')
        ).rejects.toThrow('タスクが見つかりません');
      });
    });

    describe('cancelTask', () => {
      it('タスクをキャンセルできる', async () => {
        const taskId = await orchestrator.submitTask(
          'テスト機能を実装してください',
          'project-001',
          { autoDecompose: false }
        );

        await orchestrator.cancelTask(taskId);

        const task = orchestrator.getTask(taskId);
        expect(task?.status).toBe('failed');
      });

      it('存在しないタスクIDでエラーになる', async () => {
        await expect(
          orchestrator.cancelTask('non-existent-task')
        ).rejects.toThrow('タスクが見つかりません');
      });
    });

    describe('getAllTasks', () => {
      it('全タスクを取得できる', async () => {
        await orchestrator.submitTask('タスク1', 'project-001', { autoDecompose: false });
        await orchestrator.submitTask('タスク2', 'project-001', { autoDecompose: false });

        const tasks = orchestrator.getAllTasks();
        expect(tasks.length).toBe(2);
      });
    });
  });

  // ===========================================================================
  // エージェント管理テスト
  // ===========================================================================

  describe('エージェント管理', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    describe('getActiveAgents', () => {
      it('アクティブなエージェント一覧を取得できる', async () => {
        const agents = await orchestrator.getActiveAgents();

        expect(agents).toBeInstanceOf(Array);
        // 少なくともManager Agentが存在する
        expect(agents.length).toBeGreaterThanOrEqual(1);

        const managerAgent = agents.find((a) => a.type === 'manager');
        expect(managerAgent).toBeDefined();
      });

      it('エージェント情報に必要なフィールドが含まれる', async () => {
        const agents = await orchestrator.getActiveAgents();
        const agent = agents[0];

        expect(agent.id).toBeDefined();
        expect(agent.type).toBeDefined();
        expect(agent.status).toBeDefined();
        expect(agent.lastActiveAt).toBeDefined();
      });
    });

    describe('pauseAllAgents', () => {
      it('全エージェントを一時停止できる', async () => {
        await orchestrator.pauseAllAgents();

        expect(orchestrator.isPaused()).toBe(true);
      });

      it('一時停止後のエージェントステータスがpausedになる', async () => {
        await orchestrator.pauseAllAgents();

        const agents = await orchestrator.getActiveAgents();
        const managerAgent = agents.find((a) => a.type === 'manager');
        expect(managerAgent?.status).toBe('paused');
      });
    });

    describe('resumeAllAgents', () => {
      it('一時停止後に再開できる', async () => {
        await orchestrator.pauseAllAgents();
        expect(orchestrator.isPaused()).toBe(true);

        await orchestrator.resumeAllAgents();
        expect(orchestrator.isPaused()).toBe(false);
      });

      it('緊急停止後は再開できない', async () => {
        await orchestrator.emergencyStop();

        await expect(orchestrator.resumeAllAgents()).rejects.toThrow('緊急停止中');
      });
    });

    describe('emergencyStop', () => {
      it('緊急停止が実行できる', async () => {
        await orchestrator.emergencyStop();

        expect(orchestrator.isEmergencyStopped()).toBe(true);
        expect(orchestrator.isPaused()).toBe(true);
      });

      it('緊急停止後のエージェントステータスがterminatedになる', async () => {
        // 新しいOrchestratorを作成（afterEachの影響を受けないように）
        const freshOrchestrator = createOrchestrator({
          stateManager: new StateManager(tempDir + '-fresh'),
        });
        await freshOrchestrator.initialize();
        await freshOrchestrator.emergencyStop();

        const agents = await freshOrchestrator.getActiveAgents();
        const managerAgent = agents.find((a) => a.type === 'manager');
        expect(managerAgent?.status).toBe('terminated');
      });
    });
  });

  // ===========================================================================
  // 設定管理テスト
  // ===========================================================================

  describe('設定管理', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    describe('getConfig', () => {
      it('システム設定を取得できる', async () => {
        const config = await orchestrator.getConfig();

        expect(config).toBeDefined();
        expect(config.maxConcurrentWorkers).toBeDefined();
        expect(config.defaultTimeout).toBeDefined();
        expect(config.defaultAiAdapter).toBeDefined();
      });

      it('デフォルト設定が適用されている', async () => {
        const config = await orchestrator.getConfig();

        expect(config.maxConcurrentWorkers).toBe(DEFAULT_SYSTEM_CONFIG.maxConcurrentWorkers);
        expect(config.containerRuntime).toBe(DEFAULT_SYSTEM_CONFIG.containerRuntime);
      });
    });

    describe('updateConfig', () => {
      it('設定を更新できる', async () => {
        await orchestrator.updateConfig({
          maxConcurrentWorkers: 5,
        });

        const config = await orchestrator.getConfig();
        expect(config.maxConcurrentWorkers).toBe(5);
      });

      it('部分的な設定更新が可能', async () => {
        const originalConfig = await orchestrator.getConfig();

        await orchestrator.updateConfig({
          defaultTimeout: 600,
        });

        const updatedConfig = await orchestrator.getConfig();
        expect(updatedConfig.defaultTimeout).toBe(600);
        // 他の設定は変更されていない
        expect(updatedConfig.maxConcurrentWorkers).toBe(originalConfig.maxConcurrentWorkers);
      });

      it('設定が永続化される', async () => {
        await orchestrator.updateConfig({
          maxConcurrentWorkers: 7,
        });

        // 新しいOrchestratorを作成して設定を読み込み
        const newOrchestrator = createOrchestrator({
          stateManager,
        });
        await newOrchestrator.initialize();

        const config = await newOrchestrator.getConfig();
        expect(config.maxConcurrentWorkers).toBe(7);
      });
    });
  });

  // ===========================================================================
  // コンポーネントアクセステスト
  // ===========================================================================

  describe('コンポーネントアクセス', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('Manager Agentを取得できる', () => {
      const manager = orchestrator.getManagerAgent();
      expect(manager).toBeDefined();
      expect(manager.agentId).toBeDefined();
    });

    it('Worker Poolを取得できる', () => {
      const pool = orchestrator.getWorkerPool();
      expect(pool).toBeDefined();
    });

    it('Agent Busを取得できる', () => {
      const bus = orchestrator.getAgentBus();
      expect(bus).toBeDefined();
    });

    it('State Managerを取得できる', () => {
      const sm = orchestrator.getStateManager();
      expect(sm).toBeDefined();
    });
  });

  // ===========================================================================
  // エラーハンドリングテスト
  // ===========================================================================

  describe('エラーハンドリング', () => {
    it('OrchestratorErrorが正しく作成される', () => {
      const error = new OrchestratorError('テストエラー', 'TEST_ERROR');

      expect(error.message).toBe('テストエラー');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('OrchestratorError');
    });

    it('OrchestratorErrorに原因エラーを含められる', () => {
      const cause = new Error('原因エラー');
      const error = new OrchestratorError('テストエラー', 'TEST_ERROR', cause);

      expect(error.cause).toBe(cause);
    });

    it('Error Handlerを取得できる', async () => {
      await orchestrator.initialize();
      const handler = orchestrator.getErrorHandler();
      expect(handler).toBeDefined();
    });

    it('リトライ付きで操作を実行できる', async () => {
      await orchestrator.initialize();

      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await orchestrator.executeWithRetry(operation, {
        category: 'ai_connection',
        runId: 'run-test-001',
        agentId: 'worker-test-001',
        customRetryConfig: { initialDelayMs: 10 },
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
    });

    it('ツール呼び出しエラーを処理できる', async () => {
      await orchestrator.initialize();

      const error = new Error('File not found');
      const message = await orchestrator.handleToolCallError(
        error,
        'read_file',
        'run-test-002'
      );

      expect(message).toContain('read_file');
      expect(message).toContain('File not found');
    });

    it('フォールバック付きで操作を実行できる', async () => {
      await orchestrator.initialize();

      const primary = async () => {
        throw new Error('Primary failed');
      };
      const fallback = async () => 'fallback-result';

      const result = await orchestrator.executeWithFallback(primary, fallback, {
        runId: 'run-test-003',
        agentId: 'worker-test-003',
      });

      expect(result.result).toBe('fallback-result');
      expect(result.usedFallback).toBe(true);
    });
  });
});
