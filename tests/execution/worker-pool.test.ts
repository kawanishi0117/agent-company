/**
 * Worker Pool テスト
 *
 * ワーカープール管理機能のユニットテスト
 *
 * @module tests/execution/worker-pool
 * @see Requirements: 9.1, 9.3, 9.4, 9.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WorkerPool,
  createWorkerPool,
  createWorkerPoolFromConfig,
  describeWorkerStatus,
  describePoolStatus,
  DEFAULT_MAX_WORKERS,
} from '../../tools/cli/lib/execution/worker-pool';
import { SubTask, PoolStatus } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テストヘルパー
// =============================================================================

/**
 * テスト用サブタスクを作成
 */
function createTestSubTask(id: string, parentId: string = 'parent-1'): SubTask {
  return {
    id,
    parentId,
    title: `テストタスク ${id}`,
    description: `テストタスク ${id} の説明`,
    acceptanceCriteria: ['基準1', '基準2'],
    status: 'pending',
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = createWorkerPool({
      maxWorkers: 3,
      useContainers: false, // テストではコンテナを使用しない
    });
  });

  afterEach(async () => {
    await pool.reset();
  });

  // ===========================================================================
  // 基本機能テスト
  // ===========================================================================

  describe('基本機能', () => {
    it('デフォルト設定でプールを作成できる', () => {
      const defaultPool = createWorkerPool();
      expect(defaultPool.getMaxWorkers()).toBe(DEFAULT_MAX_WORKERS);
      expect(defaultPool.isStopped()).toBe(false);
    });

    it('カスタム設定でプールを作成できる', () => {
      const customPool = createWorkerPool({
        maxWorkers: 5,
        defaultAdapter: 'test-adapter',
        defaultModel: 'test-model',
      });
      expect(customPool.getMaxWorkers()).toBe(5);
    });

    it('システム設定からプールを作成できる', () => {
      const systemPool = createWorkerPoolFromConfig({
        maxConcurrentWorkers: 4,
        defaultAiAdapter: 'ollama',
        defaultModel: 'llama3',
      });
      expect(systemPool.getMaxWorkers()).toBe(4);
    });
  });

  // ===========================================================================
  // プール状態管理テスト
  // ===========================================================================

  describe('プール状態管理', () => {
    it('初期状態のプール状態を取得できる', () => {
      const status = pool.getPoolStatus();
      expect(status.totalWorkers).toBe(0);
      expect(status.activeWorkers).toBe(0);
      expect(status.idleWorkers).toBe(0);
      expect(status.pendingTasks).toBe(0);
    });

    it('最大ワーカー数を変更できる', () => {
      pool.setMaxWorkers(5);
      expect(pool.getMaxWorkers()).toBe(5);
    });

    it('最大ワーカー数を0以下に設定するとエラー', () => {
      expect(() => pool.setMaxWorkers(0)).toThrow();
      expect(() => pool.setMaxWorkers(-1)).toThrow();
    });

    it('コンテナランタイムを変更できる', () => {
      pool.setContainerRuntime('rootless');
      const status = pool.getPoolStatus();
      expect(status.containerRuntime).toBe('rootless');
    });
  });

  // ===========================================================================
  // ワーカー取得・解放テスト
  // ===========================================================================

  describe('ワーカー取得・解放', () => {
    it('利用可能なワーカーを取得できる', async () => {
      const worker = await pool.getAvailableWorker();
      expect(worker).not.toBeNull();

      const status = pool.getPoolStatus();
      expect(status.totalWorkers).toBe(1);
      expect(status.activeWorkers).toBe(1);
    });

    it('最大ワーカー数まで取得できる', async () => {
      const workers = [];
      for (let i = 0; i < 3; i++) {
        const worker = await pool.getAvailableWorker();
        workers.push(worker);
      }

      expect(workers.every((w) => w !== null)).toBe(true);

      const status = pool.getPoolStatus();
      expect(status.totalWorkers).toBe(3);
      expect(status.activeWorkers).toBe(3);
    });

    it('最大ワーカー数を超えるとnullを返す', async () => {
      // 最大数まで取得
      for (let i = 0; i < 3; i++) {
        await pool.getAvailableWorker();
      }

      // 追加取得はnull
      const extraWorker = await pool.getAvailableWorker();
      expect(extraWorker).toBeNull();
    });

    it('ワーカーを解放できる', async () => {
      const worker = await pool.getAvailableWorker();
      expect(worker).not.toBeNull();

      const allWorkers = pool.getAllWorkers();
      const workerId = allWorkers[0].workerId;

      const result = await pool.releaseWorker(workerId);
      expect(result.success).toBe(true);

      const status = pool.getPoolStatus();
      expect(status.activeWorkers).toBe(0);
      expect(status.idleWorkers).toBe(1);
    });

    it('存在しないワーカーの解放はエラー', async () => {
      const result = await pool.releaseWorker('non-existent-worker');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================================================
  // タスクキュー管理テスト
  // ===========================================================================

  describe('タスクキュー管理', () => {
    it('保留中タスクを追加できる', () => {
      const task = createTestSubTask('task-1');
      pool.addPendingTask(task, 'run-1');

      expect(pool.getPendingTaskCount()).toBe(1);
    });

    it('複数の保留中タスクを追加できる', () => {
      for (let i = 1; i <= 5; i++) {
        const task = createTestSubTask(`task-${i}`);
        pool.addPendingTask(task, `run-${i}`);
      }

      expect(pool.getPendingTaskCount()).toBe(5);
    });

    it('保留中タスクをクリアできる', () => {
      const task = createTestSubTask('task-1');
      pool.addPendingTask(task, 'run-1');

      pool.clearPendingTasks();
      expect(pool.getPendingTaskCount()).toBe(0);
    });

    it('ワーカー解放時に保留中タスクが割り当てられる', async () => {
      // ワーカーを取得（戻り値は使用しないが、ワーカーを確保するために呼び出す）
      await pool.getAvailableWorker();
      const allWorkers = pool.getAllWorkers();
      const workerId = allWorkers[0].workerId;

      // 保留中タスクを追加
      const task = createTestSubTask('pending-task');
      pool.addPendingTask(task, 'run-pending');

      // ワーカーを解放
      const result = await pool.releaseWorker(workerId);

      expect(result.success).toBe(true);
      expect(result.nextTask).toBeDefined();
      expect(result.nextTask?.id).toBe('pending-task');
      expect(pool.getPendingTaskCount()).toBe(0);
    });
  });

  // ===========================================================================
  // ワーカー管理テスト
  // ===========================================================================

  describe('ワーカー管理', () => {
    it('ワーカー情報を取得できる', async () => {
      await pool.getAvailableWorker();
      const allWorkers = pool.getAllWorkers();

      expect(allWorkers.length).toBe(1);

      const workerInfo = pool.getWorkerInfo(allWorkers[0].workerId);
      expect(workerInfo).toBeDefined();
      expect(workerInfo?.status).toBe('working');
    });

    it('全ワーカー情報を取得できる', async () => {
      await pool.getAvailableWorker();
      await pool.getAvailableWorker();

      const allWorkers = pool.getAllWorkers();
      expect(allWorkers.length).toBe(2);
    });

    it('アクティブワーカー数を取得できる', async () => {
      await pool.getAvailableWorker();
      await pool.getAvailableWorker();

      expect(pool.getActiveWorkerCount()).toBe(2);
    });

    it('アイドルワーカー数を取得できる', async () => {
      // ワーカーを取得（戻り値は使用しないが、ワーカーを確保するために呼び出す）
      await pool.getAvailableWorker();
      const allWorkers = pool.getAllWorkers();

      await pool.releaseWorker(allWorkers[0].workerId);

      expect(pool.getIdleWorkerCount()).toBe(1);
    });

    it('ワーカーにタスクを割り当てできる', async () => {
      await pool.getAvailableWorker();
      const allWorkers = pool.getAllWorkers();
      const workerId = allWorkers[0].workerId;

      // 一度解放してアイドル状態に
      await pool.releaseWorker(workerId);

      // タスクを割り当て
      const task = createTestSubTask('assigned-task');
      const success = pool.assignTaskToWorker(workerId, task, 'run-assign');

      expect(success).toBe(true);

      const workerInfo = pool.getWorkerInfo(workerId);
      expect(workerInfo?.status).toBe('working');
      expect(workerInfo?.currentTask?.id).toBe('assigned-task');
    });

    it('作業中のワーカーにはタスクを割り当てできない', async () => {
      await pool.getAvailableWorker();
      const allWorkers = pool.getAllWorkers();
      const workerId = allWorkers[0].workerId;

      // 作業中のワーカーにタスクを割り当て
      const task = createTestSubTask('another-task');
      const success = pool.assignTaskToWorker(workerId, task, 'run-another');

      expect(success).toBe(false);
    });
  });

  // ===========================================================================
  // プールライフサイクルテスト
  // ===========================================================================

  describe('プールライフサイクル', () => {
    it('プールを停止できる', async () => {
      await pool.getAvailableWorker();
      await pool.stop();

      expect(pool.isStopped()).toBe(true);
    });

    it('停止後はワーカーを取得できない', async () => {
      await pool.stop();

      const worker = await pool.getAvailableWorker();
      expect(worker).toBeNull();
    });

    it('プールをリセットできる', async () => {
      await pool.getAvailableWorker();
      pool.addPendingTask(createTestSubTask('task-1'), 'run-1');

      await pool.reset();

      expect(pool.isStopped()).toBe(false);
      expect(pool.getAllWorkers().length).toBe(0);
      expect(pool.getPendingTaskCount()).toBe(0);
    });
  });

  // ===========================================================================
  // 並列実行制御テスト
  // ===========================================================================

  describe('並列実行制御', () => {
    it('最大ワーカー数を超えない', async () => {
      pool.setMaxWorkers(2);

      const worker1 = await pool.getAvailableWorker();
      const worker2 = await pool.getAvailableWorker();
      const worker3 = await pool.getAvailableWorker();

      expect(worker1).not.toBeNull();
      expect(worker2).not.toBeNull();
      expect(worker3).toBeNull();

      const status = pool.getPoolStatus();
      expect(status.totalWorkers).toBe(2);
    });

    it('ワーカー解放後に新しいワーカーを取得できる', async () => {
      pool.setMaxWorkers(1);

      const worker1 = await pool.getAvailableWorker();
      expect(worker1).not.toBeNull();

      const allWorkers = pool.getAllWorkers();
      await pool.releaseWorker(allWorkers[0].workerId);

      // 同じワーカーが再利用される
      const worker2 = await pool.getAvailableWorker();
      expect(worker2).not.toBeNull();
    });

    it('動的にワーカー数を増やせる', async () => {
      pool.setMaxWorkers(1);
      await pool.getAvailableWorker();

      // 最大数に達している
      let worker = await pool.getAvailableWorker();
      expect(worker).toBeNull();

      // 最大数を増やす
      pool.setMaxWorkers(2);
      worker = await pool.getAvailableWorker();
      expect(worker).not.toBeNull();

      const status = pool.getPoolStatus();
      expect(status.totalWorkers).toBe(2);
    });
  });
});

// =============================================================================
// ユーティリティ関数テスト
// =============================================================================

describe('ユーティリティ関数', () => {
  describe('describeWorkerStatus', () => {
    it('各ステータスの説明を返す', () => {
      expect(describeWorkerStatus('idle')).toContain('アイドル');
      expect(describeWorkerStatus('working')).toContain('作業中');
      expect(describeWorkerStatus('error')).toContain('エラー');
      expect(describeWorkerStatus('terminated')).toContain('終了');
    });
  });

  describe('describePoolStatus', () => {
    it('プール状態の説明を返す', () => {
      const status: PoolStatus = {
        totalWorkers: 3,
        activeWorkers: 2,
        idleWorkers: 1,
        pendingTasks: 5,
        containerRuntime: 'dod',
      };

      const description = describePoolStatus(status);
      expect(description).toContain('3');
      expect(description).toContain('2');
      expect(description).toContain('1');
      expect(description).toContain('5');
      expect(description).toContain('dod');
    });
  });
});
