/**
 * Manager Agent ユニットテスト
 *
 * Manager Agentの基本機能をテストする。
 * - タスク受信、分解、割り当て
 * - 進捗監視、エスカレーション処理
 * - ワーカー管理
 *
 * @module tests/execution/manager-agent.test
 * @see Requirements: 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ManagerAgent,
  createManagerAgent,
  ManagerAgentConfig,
  ManagerAgentError,
  WorkerSpec,
  WorkerInfo,
  WorkloadInfo,
  ScalingConfig,
  Escalation,
  Issue,
  ProgressReport,
} from '../../tools/cli/lib/execution/agents/manager';
import {
  Task,
  SubTask,
  TaskStatus,
  SubTaskStatus,
  Project,
} from '../../tools/cli/lib/execution/types';
import { AgentBus, createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { StateManager } from '../../tools/cli/lib/execution/state-manager';

// =============================================================================
// モック設定
// =============================================================================

// AIアダプタのモック
vi.mock('../../tools/adapters/index', () => ({
  getAdapter: vi.fn(() => ({
    name: 'mock-adapter',
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        subTasks: [
          {
            title: 'サブタスク1',
            description: 'テスト用サブタスク1の説明',
            acceptanceCriteria: ['基準1', '基準2'],
            estimatedEffort: 'small',
          },
          {
            title: 'サブタスク2',
            description: 'テスト用サブタスク2の説明',
            acceptanceCriteria: ['基準3'],
            estimatedEffort: 'medium',
          },
        ],
      }),
      tokensUsed: 100,
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
  })),
}));


// =============================================================================
// テストヘルパー
// =============================================================================

/**
 * テスト用タスクを作成
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    projectId: 'project-001',
    instruction: 'テスト用の指示です。ユーザー認証機能を実装してください。',
    status: 'pending' as TaskStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subTasks: [],
    metadata: {
      priority: 'medium',
      tags: ['test'],
    },
    ...overrides,
  };
}

/**
 * テスト用サブタスクを作成
 */
function createTestSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'subtask-001',
    parentId: 'task-001',
    title: 'テストサブタスク',
    description: 'テスト用サブタスクの説明',
    acceptanceCriteria: ['基準1', '基準2'],
    status: 'pending' as SubTaskStatus,
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * テスト用エスカレーションを作成
 */
function createTestEscalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: 'escalation-001',
    workerId: 'worker-001',
    subTaskId: 'subtask-001',
    issue: 'テスト用の問題が発生しました',
    type: 'error',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('ManagerAgent', () => {
  let manager: ManagerAgent;
  let agentBus: AgentBus;
  let stateManager: StateManager;

  beforeEach(async () => {
    // Agent Busを作成
    agentBus = createAgentBus({
      runtimeBasePath: 'runtime/test-runs',
    });
    await agentBus.initialize();

    // State Managerを作成
    stateManager = new StateManager('runtime/test-state');

    // Manager Agentを作成
    manager = createManagerAgent({
      agentId: 'manager-test-001',
      adapterName: 'ollama',
      modelName: 'llama3',
      agentBus,
      stateManager,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });


  // ===========================================================================
  // 基本機能テスト
  // ===========================================================================

  describe('基本機能', () => {
    it('Manager Agentを正しく作成できる', () => {
      expect(manager).toBeDefined();
      expect(manager.agentId).toBe('manager-test-001');
    });

    it('createManagerAgentファクトリ関数が動作する', () => {
      const config: ManagerAgentConfig = {
        agentId: 'manager-factory-001',
      };
      const factoryManager = createManagerAgent(config);
      expect(factoryManager).toBeInstanceOf(ManagerAgent);
      expect(factoryManager.agentId).toBe('manager-factory-001');
    });
  });

  // ===========================================================================
  // タスク受信テスト
  // ===========================================================================

  /**
   * @see Requirement 1.2: WHEN President submits a high-level task, THE Manager_Agent SHALL receive and analyze it
   */
  describe('タスク受信 (Requirement 1.2)', () => {
    it('タスクを正しく受信できる', async () => {
      const task = createTestTask();
      await manager.receiveTask(task);

      const currentTask = manager.getCurrentTask();
      expect(currentTask).toBeDefined();
      expect(currentTask?.id).toBe(task.id);
      expect(currentTask?.status).toBe('decomposing');
      expect(currentTask?.assignedManager).toBe('manager-test-001');
    });

    it('タスクがnullの場合はエラーをスローする', async () => {
      await expect(manager.receiveTask(null as unknown as Task)).rejects.toThrow(
        ManagerAgentError
      );
    });

    it('指示が空の場合はエラーをスローする', async () => {
      const task = createTestTask({ instruction: '' });
      await expect(manager.receiveTask(task)).rejects.toThrow(ManagerAgentError);
    });

    it('指示が空白のみの場合はエラーをスローする', async () => {
      const task = createTestTask({ instruction: '   ' });
      await expect(manager.receiveTask(task)).rejects.toThrow(ManagerAgentError);
    });
  });


  // ===========================================================================
  // タスク分解テスト
  // ===========================================================================

  /**
   * @see Requirement 1.3: THE Manager_Agent SHALL decompose tasks into independent sub-tasks with no dependencies
   */
  describe('タスク分解 (Requirement 1.3)', () => {
    it('タスクを独立したサブタスクに分解できる', async () => {
      const task = createTestTask();
      await manager.receiveTask(task);

      const subTasks = await manager.decomposeTask(task);

      expect(subTasks).toBeDefined();
      expect(subTasks.length).toBeGreaterThan(0);
      expect(subTasks.length).toBeLessThanOrEqual(10);

      // 各サブタスクが必要なフィールドを持っていることを確認
      for (const subTask of subTasks) {
        expect(subTask.id).toBeDefined();
        expect(subTask.parentId).toBeDefined();
        expect(subTask.title).toBeDefined();
        expect(subTask.description).toBeDefined();
        expect(subTask.status).toBe('pending');
      }
    });

    it('分解後のサブタスクが内部状態に保存される', async () => {
      const task = createTestTask();
      await manager.receiveTask(task);
      await manager.decomposeTask(task);

      const storedSubTasks = manager.getSubTasks();
      expect(storedSubTasks.length).toBeGreaterThan(0);
    });

    it('タスクがnullの場合はエラーをスローする', async () => {
      await expect(manager.decomposeTask(null as unknown as Task)).rejects.toThrow(
        ManagerAgentError
      );
    });
  });

  // ===========================================================================
  // タスク割り当てテスト
  // ===========================================================================

  /**
   * @see Requirement 1.4: THE Manager_Agent SHALL assign sub-tasks to Worker_Agents for parallel execution
   */
  describe('タスク割り当て (Requirement 1.4)', () => {
    it('サブタスクをワーカーに割り当てできる', async () => {
      // 先にタスクを受信
      const task = createTestTask();
      await manager.receiveTask(task);

      const subTask = createTestSubTask();
      const workerId = 'worker-001';

      await manager.assignTask(subTask, workerId);

      const assignments = manager.getWorkerAssignments();
      expect(assignments.get(workerId)).toBeDefined();
      expect(assignments.get(workerId)?.id).toBe(subTask.id);
    });

    it('割り当て後のサブタスクステータスがassignedになる', async () => {
      // 先にタスクを受信
      const task = createTestTask();
      await manager.receiveTask(task);

      const subTask = createTestSubTask();
      const workerId = 'worker-001';

      await manager.assignTask(subTask, workerId);

      const assignments = manager.getWorkerAssignments();
      expect(assignments.get(workerId)?.status).toBe('assigned');
      expect(assignments.get(workerId)?.assignee).toBe(workerId);
    });

    it('サブタスクがnullの場合はエラーをスローする', async () => {
      await expect(
        manager.assignTask(null as unknown as SubTask, 'worker-001')
      ).rejects.toThrow(ManagerAgentError);
    });

    it('ワーカーIDが空の場合はエラーをスローする', async () => {
      const subTask = createTestSubTask();
      await expect(manager.assignTask(subTask, '')).rejects.toThrow(
        ManagerAgentError
      );
    });

    it('複数のタスクを並列で割り当てできる', async () => {
      // 先にタスクを受信
      const task = createTestTask();
      await manager.receiveTask(task);

      const subTask1 = createTestSubTask({ id: 'subtask-001' });
      const subTask2 = createTestSubTask({ id: 'subtask-002' });

      await manager.assignTasksInParallel([
        { subTask: subTask1, workerId: 'worker-001' },
        { subTask: subTask2, workerId: 'worker-002' },
      ]);

      const assignments = manager.getWorkerAssignments();
      expect(assignments.size).toBe(2);
      expect(assignments.get('worker-001')?.id).toBe('subtask-001');
      expect(assignments.get('worker-002')?.id).toBe('subtask-002');
    });
  });


  // ===========================================================================
  // 進捗監視テスト
  // ===========================================================================

  /**
   * @see Requirement 1.5: THE Manager_Agent SHALL monitor Worker_Agent progress
   */
  describe('進捗監視 (Requirement 1.5)', () => {
    it('進捗レポートを取得できる', async () => {
      const task = createTestTask();
      await manager.receiveTask(task);
      await manager.decomposeTask(task);

      const report = await manager.monitorProgress();

      expect(report).toBeDefined();
      expect(report.totalTasks).toBeGreaterThan(0);
      expect(report.lastUpdated).toBeDefined();
    });

    it('進捗レポートにステータス別カウントが含まれる', async () => {
      const report = await manager.monitorProgress();

      expect(typeof report.completedTasks).toBe('number');
      expect(typeof report.runningTasks).toBe('number');
      expect(typeof report.failedTasks).toBe('number');
      expect(typeof report.pendingTasks).toBe('number');
    });
  });

  // ===========================================================================
  // エスカレーション処理テスト
  // ===========================================================================

  /**
   * @see Requirement 1.5: THE Manager_Agent SHALL provide support when failures occur
   */
  describe('エスカレーション処理 (Requirement 1.5)', () => {
    it('エスカレーションを処理できる', async () => {
      // 先にタスクを受信
      const task = createTestTask();
      await manager.receiveTask(task);

      // サブタスクを追加
      const subTask = createTestSubTask();
      await manager.assignTask(subTask, 'worker-001');

      const escalation = createTestEscalation();
      await manager.handleEscalation(escalation);

      const escalations = manager.getEscalations();
      expect(escalations.length).toBe(1);
      expect(escalations[0].id).toBe(escalation.id);
    });

    it('エラーエスカレーションでサブタスクがfailedになる', async () => {
      // 先にタスクを受信
      const task = createTestTask();
      await manager.receiveTask(task);

      const subTask = createTestSubTask({ id: 'subtask-001' });
      await manager.assignTask(subTask, 'worker-001');

      const escalation = createTestEscalation({
        subTaskId: 'subtask-001',
        type: 'error',
      });
      await manager.handleEscalation(escalation);

      const updatedSubTask = manager.getSubTask('subtask-001');
      expect(updatedSubTask?.status).toBe('failed');
    });

    it('blockedエスカレーションでサブタスクがblockedになる', async () => {
      // 先にタスクを受信
      const task = createTestTask();
      await manager.receiveTask(task);

      const subTask = createTestSubTask({ id: 'subtask-002' });
      await manager.assignTask(subTask, 'worker-002');

      const escalation = createTestEscalation({
        subTaskId: 'subtask-002',
        type: 'blocked',
      });
      await manager.handleEscalation(escalation);

      const updatedSubTask = manager.getSubTask('subtask-002');
      expect(updatedSubTask?.status).toBe('blocked');
    });

    it('エスカレーションがnullの場合はエラーをスローする', async () => {
      await expect(
        manager.handleEscalation(null as unknown as Escalation)
      ).rejects.toThrow(ManagerAgentError);
    });
  });


  // ===========================================================================
  // サポート提供テスト
  // ===========================================================================

  describe('サポート提供', () => {
    it('ワーカーにガイダンスを提供できる', async () => {
      const issue: Issue = {
        description: 'ファイルの読み込みに失敗しました',
        errorMessage: 'ENOENT: no such file or directory',
        attemptCount: 1,
      };

      const guidance = await manager.provideSupport('worker-001', issue);

      expect(guidance).toBeDefined();
      expect(guidance.id).toBeDefined();
      expect(guidance.workerId).toBe('worker-001');
      expect(guidance.advice).toBeDefined();
      expect(guidance.suggestedActions.length).toBeGreaterThan(0);
    });

    it('ワーカーIDが空の場合はエラーをスローする', async () => {
      const issue: Issue = {
        description: 'テスト問題',
        attemptCount: 1,
      };

      await expect(manager.provideSupport('', issue)).rejects.toThrow(
        ManagerAgentError
      );
    });

    it('問題説明が空の場合はエラーをスローする', async () => {
      const issue: Issue = {
        description: '',
        attemptCount: 1,
      };

      await expect(manager.provideSupport('worker-001', issue)).rejects.toThrow(
        ManagerAgentError
      );
    });
  });

  // ===========================================================================
  // ワーカー管理テスト
  // ===========================================================================

  /**
   * @see Requirement 1.6: THE Manager_Agent SHALL be able to dynamically hire/fire Worker_Agents
   */
  describe('ワーカー管理 (Requirement 1.6)', () => {
    describe('ワーカー雇用', () => {
      it('新しいワーカーを雇用できる', async () => {
        const spec: WorkerSpec = {
          name: 'Frontend Developer',
          capabilities: ['React', 'TypeScript'],
        };

        const workerId = await manager.hireWorker(spec);

        expect(workerId).toBeDefined();
        expect(workerId).toMatch(/^worker-/);

        const workers = manager.getRegisteredWorkers();
        expect(workers).toContain(workerId);
      });

      it('ワーカー仕様がnullの場合はエラーをスローする', async () => {
        await expect(
          manager.hireWorker(null as unknown as WorkerSpec)
        ).rejects.toThrow(ManagerAgentError);
      });

      it('ワーカー名が空の場合はエラーをスローする', async () => {
        const spec: WorkerSpec = {
          name: '',
          capabilities: [],
        };

        await expect(manager.hireWorker(spec)).rejects.toThrow(ManagerAgentError);
      });

      it('ワーカー情報が正しく保存される', async () => {
        const spec: WorkerSpec = {
          name: 'Backend Developer',
          capabilities: ['Node.js', 'PostgreSQL'],
          priority: 5,
        };

        const workerId = await manager.hireWorker(spec);
        const workerInfo = manager.getWorkerInfo(workerId);

        expect(workerInfo).toBeDefined();
        expect(workerInfo?.name).toBe('Backend Developer');
        expect(workerInfo?.capabilities).toEqual(['Node.js', 'PostgreSQL']);
        expect(workerInfo?.priority).toBe(5);
        expect(workerInfo?.status).toBe('idle');
        expect(workerInfo?.healthScore).toBe(100);
        expect(workerInfo?.completedTasks).toBe(0);
        expect(workerInfo?.failedTasks).toBe(0);
      });

      it('最大ワーカー数を超えると雇用できない', async () => {
        // スケーリング設定を更新（最大2ワーカー）
        manager.updateScalingConfig({ maxWorkers: 2 });

        // 2人雇用
        await manager.hireWorker({ name: 'Worker 1', capabilities: [] });
        await manager.hireWorker({ name: 'Worker 2', capabilities: [] });

        // 3人目は失敗
        await expect(
          manager.hireWorker({ name: 'Worker 3', capabilities: [] })
        ).rejects.toThrow(ManagerAgentError);
      });
    });

    describe('ワーカー解雇', () => {
      it('ワーカーを解雇できる', async () => {
        // スケーリング設定を調整（最小0ワーカー）
        manager.updateScalingConfig({ minWorkers: 0 });

        // まずワーカーを雇用
        const spec: WorkerSpec = {
          name: 'Test Worker',
          capabilities: [],
        };
        const workerId = await manager.hireWorker(spec);

        // 解雇
        await manager.fireWorker(workerId);

        const workers = manager.getRegisteredWorkers();
        expect(workers).not.toContain(workerId);
      });

      it('割り当て中のタスクがある場合はpendingに戻す', async () => {
        // スケーリング設定を調整（最小0ワーカー）
        manager.updateScalingConfig({ minWorkers: 0 });

        // 先にタスクを受信
        const task = createTestTask();
        await manager.receiveTask(task);

        // ワーカーを雇用
        const spec: WorkerSpec = {
          name: 'Test Worker',
          capabilities: [],
        };
        const workerId = await manager.hireWorker(spec);

        // タスクを割り当て
        const subTask = createTestSubTask({ id: 'subtask-fire-test' });
        await manager.assignTask(subTask, workerId);

        // 解雇
        await manager.fireWorker(workerId);

        // タスクがpendingに戻っていることを確認
        const updatedSubTask = manager.getSubTask('subtask-fire-test');
        expect(updatedSubTask?.status).toBe('pending');
        expect(updatedSubTask?.assignee).toBeUndefined();
      });

      it('登録されていないワーカーを解雇しようとするとエラー', async () => {
        await expect(manager.fireWorker('non-existent-worker')).rejects.toThrow(
          ManagerAgentError
        );
      });

      it('ワーカーIDが空の場合はエラーをスローする', async () => {
        await expect(manager.fireWorker('')).rejects.toThrow(ManagerAgentError);
      });

      it('最小ワーカー数を下回ると解雇できない', async () => {
        // スケーリング設定を更新（最小2ワーカー）
        manager.updateScalingConfig({ minWorkers: 2 });

        // 2人雇用
        const worker1 = await manager.hireWorker({ name: 'Worker 1', capabilities: [] });
        await manager.hireWorker({ name: 'Worker 2', capabilities: [] });

        // 1人目を解雇しようとすると失敗
        await expect(manager.fireWorker(worker1)).rejects.toThrow(ManagerAgentError);
      });

      it('解雇後のワーカー情報がterminatedになる', async () => {
        // スケーリング設定を調整（最小0ワーカー）
        manager.updateScalingConfig({ minWorkers: 0 });

        const spec: WorkerSpec = {
          name: 'Test Worker',
          capabilities: [],
        };
        const workerId = await manager.hireWorker(spec);

        await manager.fireWorker(workerId);

        // workerInfoMapには履歴として残る（terminated状態で）
        const workerInfo = manager.getWorkerInfo(workerId);
        expect(workerInfo?.status).toBe('terminated');
      });
    });

    describe('動的スケーリング', () => {
      it('ワークロード情報を取得できる', async () => {
        const workload = manager.getWorkloadInfo();

        expect(workload).toBeDefined();
        expect(typeof workload.pendingTasks).toBe('number');
        expect(typeof workload.runningTasks).toBe('number');
        expect(typeof workload.idleWorkers).toBe('number');
        expect(typeof workload.activeWorkers).toBe('number');
        expect(typeof workload.totalWorkers).toBe('number');
        expect(typeof workload.workloadRatio).toBe('number');
        expect(['scale_up', 'scale_down', 'maintain']).toContain(workload.scalingRecommendation);
      });

      it('保留タスクが多い場合はscale_upを推奨する', async () => {
        // タスクを受信して分解
        const task = createTestTask();
        await manager.receiveTask(task);
        await manager.decomposeTask(task);

        // スケーリング設定を調整
        manager.updateScalingConfig({ scaleUpThreshold: 0.5 });

        const workload = manager.getWorkloadInfo();
        // 保留タスクがあり、ワーカーがいない場合はscale_upを推奨
        if (workload.pendingTasks > 0 && workload.totalWorkers === 0) {
          expect(workload.scalingRecommendation).toBe('scale_up');
        }
      });

      it('ワークロードに基づいてスケーリングできる', async () => {
        // スケーリング設定を調整（クールダウンを0に）
        manager.updateScalingConfig({
          scalingCooldown: 0,
          minWorkers: 0,
          maxWorkers: 5,
        });

        // タスクを受信して分解
        const task = createTestTask();
        await manager.receiveTask(task);
        await manager.decomposeTask(task);

        const result = await manager.scaleWorkersByWorkload();

        expect(result).toBeDefined();
        expect(['scaled_up', 'scaled_down', 'no_change']).toContain(result.action);
        expect(typeof result.workersAdded).toBe('number');
        expect(typeof result.workersRemoved).toBe('number');
      });

      it('クールダウン中はスケーリングしない', async () => {
        // スケーリング設定を調整（長いクールダウン）
        manager.updateScalingConfig({ scalingCooldown: 60000 });

        // 最初のスケーリング
        await manager.scaleWorkersByWorkload();

        // 2回目のスケーリング（クールダウン中）
        const result = await manager.scaleWorkersByWorkload();

        expect(result.action).toBe('no_change');
      });
    });

    describe('能力マッチング', () => {
      it('タスクに最適なワーカーを選択できる', async () => {
        // ワーカーを雇用
        await manager.hireWorker({
          name: 'Frontend Dev',
          capabilities: ['frontend', 'react', 'ui'],
          priority: 5,
        });
        await manager.hireWorker({
          name: 'Backend Dev',
          capabilities: ['backend', 'api', 'database'],
          priority: 3,
        });

        // フロントエンドタスク
        const frontendTask = createTestSubTask({
          title: 'UIコンポーネント作成',
          description: 'Reactでフロントエンドのコンポーネントを実装',
        });

        const bestWorker = manager.selectBestWorkerForTask(frontendTask);

        expect(bestWorker).toBeDefined();
        // フロントエンドワーカーが選択されるはず
        const workerInfo = manager.getWorkerInfo(bestWorker!);
        expect(workerInfo?.capabilities).toContain('frontend');
      });

      it('アイドルワーカーがいない場合はnullを返す', async () => {
        // ワーカーを雇用してタスクを割り当て
        const task = createTestTask();
        await manager.receiveTask(task);

        const workerId = await manager.hireWorker({
          name: 'Busy Worker',
          capabilities: ['general'],
        });

        const subTask = createTestSubTask();
        await manager.assignTask(subTask, workerId);

        // 別のタスクに対してワーカーを選択
        const anotherTask = createTestSubTask({ id: 'another-task' });
        const bestWorker = manager.selectBestWorkerForTask(anotherTask);

        expect(bestWorker).toBeNull();
      });

      it('ヘルススコアが高いワーカーを優先する', async () => {
        // 2人のワーカーを雇用
        const worker1 = await manager.hireWorker({
          name: 'Healthy Worker',
          capabilities: ['general'],
        });
        const worker2 = await manager.hireWorker({
          name: 'Unhealthy Worker',
          capabilities: ['general'],
        });

        // worker2のヘルススコアを下げる（失敗を記録）
        for (let i = 0; i < 3; i++) {
          manager.recordWorkerFailure(worker2, 'test-task', {
            code: 'TEST_ERROR',
            message: 'Test failure',
            recoverable: true,
          });
        }

        const subTask = createTestSubTask();
        const bestWorker = manager.selectBestWorkerForTask(subTask);

        // ヘルシーなワーカーが選択されるはず
        expect(bestWorker).toBe(worker1);
      });
    });

    describe('ヘルスモニタリング', () => {
      it('ヘルスチェックを実行できる', async () => {
        // ワーカーを雇用
        await manager.hireWorker({
          name: 'Test Worker',
          capabilities: ['general'],
        });

        const result = await manager.performHealthCheck();

        expect(result).toBeDefined();
        expect(typeof result.healthyWorkers).toBe('number');
        expect(typeof result.unhealthyWorkers).toBe('number');
        expect(Array.isArray(result.replacedWorkers)).toBe(true);
      });

      it('連続失敗でヘルススコアが低下する', async () => {
        const workerId = await manager.hireWorker({
          name: 'Failing Worker',
          capabilities: ['general'],
        });

        // 初期ヘルススコアを確認
        let workerInfo = manager.getWorkerInfo(workerId);
        expect(workerInfo?.healthScore).toBe(100);

        // 失敗を記録
        for (let i = 0; i < 3; i++) {
          manager.recordWorkerFailure(workerId, 'test-task', {
            code: 'TEST_ERROR',
            message: 'Test failure',
            recoverable: true,
          });
        }

        // ヘルスチェックを実行
        await manager.performHealthCheck();

        // ヘルススコアが低下していることを確認
        workerInfo = manager.getWorkerInfo(workerId);
        expect(workerInfo?.healthScore).toBeLessThan(100);
      });

      it('成功でヘルススコアが回復する', async () => {
        const workerId = await manager.hireWorker({
          name: 'Recovering Worker',
          capabilities: ['general'],
        });

        // 失敗を記録
        manager.recordWorkerFailure(workerId, 'test-task', {
          code: 'TEST_ERROR',
          message: 'Test failure',
          recoverable: true,
        });

        // 成功を記録
        manager.recordWorkerSuccess(workerId);

        const workerInfo = manager.getWorkerInfo(workerId);
        expect(workerInfo?.consecutiveFailures).toBe(0);
      });
    });

    describe('ワーカー置換', () => {
      it('ワーカーを置換できる', async () => {
        // スケーリング設定を調整
        manager.updateScalingConfig({ minWorkers: 0, maxWorkers: 5 });

        const oldWorkerId = await manager.hireWorker({
          name: 'Old Worker',
          capabilities: ['general'],
        });

        const newWorkerId = await manager.replaceWorker(oldWorkerId, {
          name: 'New Worker',
          capabilities: ['general', 'advanced'],
        });

        expect(newWorkerId).toBeDefined();
        expect(newWorkerId).not.toBe(oldWorkerId);

        // 古いワーカーはterminatedになっている
        const oldWorkerInfo = manager.getWorkerInfo(oldWorkerId);
        expect(oldWorkerInfo?.status).toBe('terminated');

        // 新しいワーカーはidleになっている
        const newWorkerInfo = manager.getWorkerInfo(newWorkerId);
        expect(newWorkerInfo?.status).toBe('idle');
      });
    });

    describe('自動スケーリング', () => {
      it('自動スケーリングを開始・停止できる', () => {
        manager.startAutoScaling();
        // 2回目の開始は無視される
        manager.startAutoScaling();

        manager.stopAutoScaling();
        // 2回目の停止は無視される
        manager.stopAutoScaling();
      });

      it('自動スケーリングが無効の場合は開始しない', () => {
        manager.updateScalingConfig({ autoScalingEnabled: false });
        manager.startAutoScaling();
        // エラーなく完了することを確認
      });
    });

    describe('スケーリング設定', () => {
      it('スケーリング設定を更新できる', () => {
        manager.updateScalingConfig({
          minWorkers: 2,
          maxWorkers: 8,
          scaleUpThreshold: 3.0,
        });

        const config = manager.getScalingConfig();
        expect(config.minWorkers).toBe(2);
        expect(config.maxWorkers).toBe(8);
        expect(config.scaleUpThreshold).toBe(3.0);
      });

      it('スケーリング設定を取得できる', () => {
        const config = manager.getScalingConfig();

        expect(config).toBeDefined();
        expect(typeof config.minWorkers).toBe('number');
        expect(typeof config.maxWorkers).toBe('number');
        expect(typeof config.scaleUpThreshold).toBe('number');
        expect(typeof config.scaleDownThreshold).toBe('number');
        expect(typeof config.scalingCooldown).toBe('number');
        expect(typeof config.autoScalingEnabled).toBe('boolean');
      });
    });

    describe('アイドルワーカー取得', () => {
      it('アイドルワーカー一覧を取得できる', async () => {
        // ワーカーを雇用
        await manager.hireWorker({
          name: 'Idle Worker 1',
          capabilities: ['general'],
        });
        await manager.hireWorker({
          name: 'Idle Worker 2',
          capabilities: ['general'],
        });

        const idleWorkers = manager.getIdleWorkers();

        expect(idleWorkers.length).toBe(2);
        expect(idleWorkers.every(w => w.status === 'idle')).toBe(true);
      });

      it('タスク割り当て中のワーカーはアイドルに含まれない', async () => {
        const task = createTestTask();
        await manager.receiveTask(task);

        const workerId = await manager.hireWorker({
          name: 'Busy Worker',
          capabilities: ['general'],
        });

        const subTask = createTestSubTask();
        await manager.assignTask(subTask, workerId);

        const idleWorkers = manager.getIdleWorkers();

        expect(idleWorkers.find(w => w.id === workerId)).toBeUndefined();
      });
    });

    describe('全ワーカー情報取得', () => {
      it('全ワーカー情報を取得できる', async () => {
        await manager.hireWorker({
          name: 'Worker 1',
          capabilities: ['frontend'],
        });
        await manager.hireWorker({
          name: 'Worker 2',
          capabilities: ['backend'],
        });

        const allWorkers = manager.getAllWorkerInfo();

        expect(allWorkers.size).toBe(2);
      });
    });
  });


  // ===========================================================================
  // 状態取得テスト
  // ===========================================================================

  describe('状態取得', () => {
    it('現在のタスクを取得できる', async () => {
      const task = createTestTask();
      await manager.receiveTask(task);

      const currentTask = manager.getCurrentTask();
      expect(currentTask).toBeDefined();
      expect(currentTask?.id).toBe(task.id);
    });

    it('タスク受信前はnullを返す', () => {
      const currentTask = manager.getCurrentTask();
      expect(currentTask).toBeNull();
    });

    it('サブタスク一覧を取得できる', async () => {
      const task = createTestTask();
      await manager.receiveTask(task);
      await manager.decomposeTask(task);

      const subTasks = manager.getSubTasks();
      expect(Array.isArray(subTasks)).toBe(true);
    });

    it('特定のサブタスクを取得できる', async () => {
      // 先にタスクを受信
      const task = createTestTask();
      await manager.receiveTask(task);

      const subTask = createTestSubTask({ id: 'specific-subtask' });
      await manager.assignTask(subTask, 'worker-001');

      const retrieved = manager.getSubTask('specific-subtask');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('specific-subtask');
    });

    it('存在しないサブタスクはundefinedを返す', () => {
      const retrieved = manager.getSubTask('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('登録済みワーカー一覧を取得できる', async () => {
      const spec: WorkerSpec = {
        name: 'Test Worker',
        capabilities: [],
      };
      await manager.hireWorker(spec);

      const workers = manager.getRegisteredWorkers();
      expect(Array.isArray(workers)).toBe(true);
      expect(workers.length).toBeGreaterThan(0);
    });

    it('ワーカー割り当て状況を取得できる', async () => {
      const assignments = manager.getWorkerAssignments();
      expect(assignments).toBeInstanceOf(Map);
    });

    it('エスカレーション履歴を取得できる', () => {
      const escalations = manager.getEscalations();
      expect(Array.isArray(escalations)).toBe(true);
    });

    it('Agent Busを取得できる', () => {
      const bus = manager.getAgentBus();
      expect(bus).toBeDefined();
      expect(bus).toBe(agentBus);
    });

    it('State Managerを取得できる', () => {
      const sm = manager.getStateManager();
      expect(sm).toBeDefined();
      expect(sm).toBe(stateManager);
    });
  });

  // ===========================================================================
  // エラーハンドリングテスト
  // ===========================================================================

  describe('エラーハンドリング', () => {
    it('ManagerAgentErrorが正しいコードを持つ', () => {
      const error = new ManagerAgentError('Test error', 'INVALID_INPUT');
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ManagerAgentError');
    });

    it('ManagerAgentErrorがcauseを保持できる', () => {
      const cause = new Error('Original error');
      const error = new ManagerAgentError('Wrapped error', 'DECOMPOSITION_ERROR', cause);
      expect(error.cause).toBe(cause);
    });
  });
});
