/**
 * Worker Container プロパティテスト
 *
 * Property 10: Worker Container Isolation
 * - 任意の2つのWorker_Containerが同時に実行されている場合、
 *   それらは隔離されたファイルシステムとネットワーク名前空間を持つ
 *   （Git経由以外の共有状態なし）
 *
 * Property 11: Worker Container Cleanup
 * - 任意のWorker_Containerにおいて、割り当てられたタスクが完了（成功または失敗）すると、
 *   コンテナは妥当な時間内（設定可能、デフォルト60秒）に破棄される
 *
 * **Validates: Requirements 5.4, 5.5**
 *
 * @module tests/execution/worker-container.property.test
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  WorkerContainer,
  ContainerIsolationConfig,
  DEFAULT_ISOLATION_CONFIG,
  DEFAULT_CLEANUP_TIMEOUT_MS,
  CONTAINER_NAME_PREFIX,
  createIsolatedWorkerContainer,
  verifyContainerIsolation,
  extractWorkerIdFromContainerName,
  isWorkerContainerName,
} from '../../tools/cli/lib/execution/worker-container';
import {
  ContainerRuntime,
} from '../../tools/cli/lib/execution/container-runtime';
import { AgentId } from '../../tools/cli/lib/execution/types';

// =============================================================================
// モック設定
// =============================================================================

/**
 * モックContainerRuntimeを作成
 * 各テストケースで独立したモックを使用するためのファクトリ関数
 */
function createMockRuntime(): ContainerRuntime {
  let containerCounter = 0;

  return {
    createContainer: vi.fn().mockImplementation(async () => {
      containerCounter++;
      return `mock-container-id-${containerCounter}-${Date.now()}`;
    }),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    removeContainer: vi.fn().mockResolvedValue(undefined),
    getContainerLogs: vi.fn().mockResolvedValue('mock logs output'),
    inspectContainer: vi.fn().mockResolvedValue({ State: { Running: true } }),
    getConfig: vi.fn().mockReturnValue({ type: 'dod' }),
    getRuntimeType: vi.fn().mockReturnValue('dod'),
  } as unknown as ContainerRuntime;
}

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 有効なワーカーIDを生成するArbitrary
 */
const workerIdArb: fc.Arbitrary<AgentId> = fc
  .tuple(
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'), { minLength: 1, maxLength: 3 }),
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 3 })
  )
  .map(([prefix, suffix]) => `worker-${prefix}-${suffix}`);

/**
 * 異なる2つのワーカーIDを生成するArbitrary
 */
const twoDistinctWorkerIdsArb: fc.Arbitrary<[AgentId, AgentId]> = fc
  .tuple(workerIdArb, workerIdArb)
  .filter(([a, b]) => a !== b);

/**
 * ネットワークモードを生成するArbitrary
 */
const networkModeArb: fc.Arbitrary<'none' | 'bridge' | 'host'> = fc.constantFrom('none', 'bridge', 'host');

/**
 * 完全に隔離された設定を生成するArbitrary
 */
const fullyIsolatedConfigArb: fc.Arbitrary<Partial<ContainerIsolationConfig>> = fc.constant({
  networkMode: 'none' as const,
  noNewPrivileges: true,
  dropAllCapabilities: true,
  pidsLimit: 256,
});

/**
 * タスク完了状態を生成するArbitrary
 */
const taskCompletionStatusArb: fc.Arbitrary<'success' | 'failure'> = fc.constantFrom('success', 'failure');

// =============================================================================
// Property 10: Worker Container Isolation
// =============================================================================

describe('Property 10: Worker Container Isolation', () => {
  /**
   * Property 10.1: ネットワーク隔離
   * 任意の2つのWorker_Containerは、networkMode='none'により
   * 直接のネットワーク通信ができない
   *
   * **Validates: Requirement 5.4**
   * - Network: No inter-container communication except via Agent_Bus
   */
  it('Property 10.1: 任意の2つのワーカーコンテナはネットワーク隔離される', async () => {
    await fc.assert(
      fc.asyncProperty(twoDistinctWorkerIdsArb, async ([workerIdA, workerIdB]) => {
        // 各テストケースで独立したコンテナを作成
        const containerA = createIsolatedWorkerContainer(workerIdA);
        const containerB = createIsolatedWorkerContainer(workerIdB);

        const isolationA = containerA.getIsolationConfig();
        const isolationB = containerB.getIsolationConfig();

        // 両方のコンテナがnetworkMode='none'であること
        expect(isolationA.networkMode).toBe('none');
        expect(isolationB.networkMode).toBe('none');

        // 隔離検証
        const result = await verifyContainerIsolation(containerA, containerB);
        expect(result.networkIsolated).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.2: ファイルシステム隔離
   * 任意の2つのWorker_Containerは、独立したファイルシステムを持ち、
   * 共有ボリュームがない（Git経由以外）
   *
   * **Validates: Requirement 5.4**
   * - Filesystem: No shared volumes between workers (each has own `/workspace`)
   */
  it('Property 10.2: 任意の2つのワーカーコンテナはファイルシステム隔離される', async () => {
    await fc.assert(
      fc.asyncProperty(twoDistinctWorkerIdsArb, async ([workerIdA, workerIdB]) => {
        // 各テストケースで独立したモックを作成
        const mockRuntimeA = createMockRuntime();
        const mockRuntimeB = createMockRuntime();

        const containerA = new WorkerContainer({ workerId: workerIdA }, mockRuntimeA);
        const containerB = new WorkerContainer({ workerId: workerIdB }, mockRuntimeB);

        await containerA.create();
        await containerB.create();

        // 各コンテナの作成オプションを取得
        const callArgsA = vi.mocked(mockRuntimeA.createContainer).mock.calls[0][0];
        const callArgsB = vi.mocked(mockRuntimeB.createContainer).mock.calls[0][0];

        // /workspaceへの共有マウントがないことを確認
        const sharedVolumeA = callArgsA.volumes?.find((v: string) =>
          v.includes('/workspace') && !v.includes(':ro')
        );
        const sharedVolumeB = callArgsB.volumes?.find((v: string) =>
          v.includes('/workspace') && !v.includes(':ro')
        );

        expect(sharedVolumeA).toBeUndefined();
        expect(sharedVolumeB).toBeUndefined();

        // 隔離検証
        const result = await verifyContainerIsolation(containerA, containerB);
        expect(result.filesystemIsolated).toBe(true);
      }),
      { numRuns: 100 }
    );
  });


  /**
   * Property 10.3: セキュリティオプションによる隔離強化
   * 任意のワーカーコンテナは、セキュリティオプションにより
   * 特権昇格とcapabilitiesが制限される
   *
   * **Validates: Requirement 5.4**
   * - THE Worker_Container SHALL be isolated
   */
  it('Property 10.3: 任意のワーカーコンテナはセキュリティオプションで保護される', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, async (workerId) => {
        const container = createIsolatedWorkerContainer(workerId);

        // 隔離設定を検証
        const isolation = container.getIsolationConfig();
        expect(isolation.noNewPrivileges).toBe(true);
        expect(isolation.dropAllCapabilities).toBe(true);
        expect(isolation.pidsLimit).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.4: 読み取り専用共有ディレクトリ
   * 結果ディレクトリが指定された場合、読み取り専用でマウントされる
   *
   * **Validates: Requirement 5.4**
   * - Shared read-only: `runtime/runs/<run-id>/` for result collection only
   */
  it('Property 10.4: 結果ディレクトリは読み取り専用でマウントされる', async () => {
    await fc.assert(
      fc.asyncProperty(
        workerIdArb,
        fc.stringOf(fc.constantFrom('a', 'b', 'c', '0', '1', '2', '-'), { minLength: 5, maxLength: 10 }),
        async (workerId, runId) => {
          const mockRuntime = createMockRuntime();
          const resultsDir = `/host/runtime/runs/${runId}`;
          const container = new WorkerContainer(
            { workerId, resultsDir },
            mockRuntime
          );
          await container.create();

          const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];

          // 結果ディレクトリが:roでマウントされていることを確認
          const resultsVolume = callArgs.volumes?.find((v: string) => v.includes('/results'));
          expect(resultsVolume).toBeDefined();
          expect(resultsVolume).toContain(':ro');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.5: 隔離検証の一貫性
   * 同じ設定のコンテナに対して、隔離検証結果は常に同じ
   *
   * **Validates: Requirement 5.4**
   */
  it('Property 10.5: 隔離検証は一貫している', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, fullyIsolatedConfigArb, async (workerId, isolation) => {
        const mockRuntime = createMockRuntime();
        const container = new WorkerContainer(
          { workerId, isolation },
          mockRuntime
        );

        // 複数回検証を実行
        const result1 = await container.verifyIsolation();
        const result2 = await container.verifyIsolation();
        const result3 = await container.verifyIsolation();

        // すべて同じ結果であること
        expect(result1.valid).toBe(result2.valid);
        expect(result2.valid).toBe(result3.valid);
        expect(result1.networkIsolated).toBe(result2.networkIsolated);
        expect(result1.filesystemIsolated).toBe(result2.filesystemIsolated);
        expect(result1.securityOptionsCorrect).toBe(result2.securityOptionsCorrect);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.6: 複数コンテナ間の相互隔離
   * 任意のN個のワーカーコンテナは、すべてのペアで隔離されている
   *
   * **Validates: Requirement 5.4**
   */
  it('Property 10.6: 複数のワーカーコンテナは相互に隔離される', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(workerIdArb, { minLength: 2, maxLength: 4 })
          .map(ids => [...new Set(ids)]) // 重複を除去
          .filter(ids => ids.length >= 2),
        async (workerIds) => {
          // 各設定でコンテナを作成
          const containers = workerIds.map(workerId =>
            createIsolatedWorkerContainer(workerId)
          );

          // すべてのペアで隔離を検証
          for (let i = 0; i < containers.length; i++) {
            for (let j = i + 1; j < containers.length; j++) {
              const result = await verifyContainerIsolation(containers[i], containers[j]);
              expect(result.isolated).toBe(true);
              expect(result.networkIsolated).toBe(true);
              expect(result.filesystemIsolated).toBe(true);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10.7: ワーカーIDの一意性
   * 異なるワーカーIDを持つコンテナは、異なるコンテナ名を持つ
   *
   * **Validates: Requirement 5.4**
   */
  it('Property 10.7: 異なるワーカーIDは異なるコンテナ名を生成する', async () => {
    await fc.assert(
      fc.asyncProperty(twoDistinctWorkerIdsArb, async ([workerIdA, workerIdB]) => {
        const mockRuntimeA = createMockRuntime();
        const mockRuntimeB = createMockRuntime();

        const containerA = new WorkerContainer({ workerId: workerIdA }, mockRuntimeA);
        const containerB = new WorkerContainer({ workerId: workerIdB }, mockRuntimeB);

        await containerA.create();
        await containerB.create();

        const nameA = containerA.getContainerName();
        const nameB = containerB.getContainerName();

        // コンテナ名が異なることを確認
        expect(nameA).not.toBe(nameB);

        // 両方のコンテナ名がワーカーIDを含むことを確認
        expect(nameA).toContain(workerIdA);
        expect(nameB).toContain(workerIdB);
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// Property 11: Worker Container Cleanup
// =============================================================================

describe('Property 11: Worker Container Cleanup', () => {
  /**
   * Property 11.1: タスク完了後のコンテナ破棄
   * 任意のワーカーコンテナにおいて、タスクが完了（成功または失敗）すると、
   * コンテナは破棄される
   *
   * **Validates: Requirement 5.5**
   * - WHEN task execution completes, THE Worker_Container SHALL be destroyed (clean slate)
   */
  it('Property 11.1: タスク完了後にコンテナは破棄される', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, taskCompletionStatusArb, async (workerId, _status) => {
        const mockRuntime = createMockRuntime();
        const container = new WorkerContainer({ workerId }, mockRuntime);

        // コンテナを作成して起動
        await container.createAndStart();
        expect(container.isRunning()).toBe(true);

        // タスク完了後にコンテナを破棄
        const result = await container.destroy();

        expect(result.success).toBe(true);
        expect(container.isDestroyed()).toBe(true);
        expect(vi.mocked(mockRuntime.removeContainer)).toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.2: 破棄後の状態
   * 任意のワーカーコンテナにおいて、破棄後は'destroyed'状態になる
   *
   * **Validates: Requirement 5.5**
   */
  it('Property 11.2: 破棄後のコンテナは destroyed 状態になる', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, async (workerId) => {
        const mockRuntime = createMockRuntime();
        const container = new WorkerContainer({ workerId }, mockRuntime);

        // コンテナを作成
        await container.create();
        expect(container.getState()).toBe('created');

        // コンテナを破棄
        await container.destroy();

        // 状態が'destroyed'であることを確認
        expect(container.getState()).toBe('destroyed');
        expect(container.isDestroyed()).toBe(true);
        expect(container.isRunning()).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.3: 実行中コンテナの破棄
   * 任意の実行中ワーカーコンテナは、停止してから破棄される
   *
   * **Validates: Requirement 5.5**
   */
  it('Property 11.3: 実行中のコンテナは停止してから破棄される', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, async (workerId) => {
        const mockRuntime = createMockRuntime();
        const container = new WorkerContainer({ workerId }, mockRuntime);

        // コンテナを作成して起動
        await container.createAndStart();
        expect(container.isRunning()).toBe(true);

        // コンテナを破棄
        await container.destroy();

        // stopContainerが呼ばれたことを確認
        expect(vi.mocked(mockRuntime.stopContainer)).toHaveBeenCalled();
        // removeContainerが呼ばれたことを確認
        expect(vi.mocked(mockRuntime.removeContainer)).toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.4: 強制破棄
   * 任意のワーカーコンテナは、強制オプションで即座に破棄できる
   *
   * **Validates: Requirement 5.5**
   */
  it('Property 11.4: 強制オプションでコンテナを即座に破棄できる', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, async (workerId) => {
        // 停止に失敗するモックを設定
        const failingRuntime = createMockRuntime();
        vi.mocked(failingRuntime.stopContainer).mockRejectedValue(new Error('Stop failed'));

        const container = new WorkerContainer({ workerId }, failingRuntime);

        // コンテナを作成して起動
        await container.createAndStart();

        // 強制破棄
        const result = await container.destroy(true);

        // 停止に失敗しても削除は成功する
        expect(result.success).toBe(true);
        expect(container.isDestroyed()).toBe(true);
        expect(vi.mocked(failingRuntime.removeContainer)).toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.5: 破棄の冪等性
   * 任意のワーカーコンテナにおいて、複数回の破棄呼び出しは安全
   *
   * **Validates: Requirement 5.5**
   */
  it('Property 11.5: 破棄は冪等である（複数回呼び出しても安全）', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, fc.integer({ min: 2, max: 5 }), async (workerId, destroyCount) => {
        const mockRuntime = createMockRuntime();
        const container = new WorkerContainer({ workerId }, mockRuntime);

        // コンテナを作成
        await container.create();

        // 複数回破棄を呼び出す
        const results: boolean[] = [];
        for (let i = 0; i < destroyCount; i++) {
          const result = await container.destroy();
          results.push(result.success);
        }

        // すべての呼び出しが成功すること
        expect(results.every(r => r)).toBe(true);
        expect(container.isDestroyed()).toBe(true);

        // removeContainerは1回だけ呼ばれる
        expect(vi.mocked(mockRuntime.removeContainer)).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.6: 未作成コンテナの破棄
   * 未作成のワーカーコンテナに対する破棄は成功を返す
   *
   * **Validates: Requirement 5.5**
   */
  it('Property 11.6: 未作成のコンテナに対する破棄は成功を返す', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, async (workerId) => {
        const mockRuntime = createMockRuntime();
        const container = new WorkerContainer({ workerId }, mockRuntime);

        // 作成せずに破棄を呼び出す
        const result = await container.destroy();

        // 成功を返すこと
        expect(result.success).toBe(true);

        // removeContainerは呼ばれない
        expect(vi.mocked(mockRuntime.removeContainer)).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.7: 破棄時間の測定
   * 任意のワーカーコンテナの破棄は、操作時間を返す
   *
   * **Validates: Requirement 5.5**
   * - the container SHALL be destroyed within a reasonable time (configurable, default 60 seconds)
   */
  it('Property 11.7: 破棄操作は実行時間を返す', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, async (workerId) => {
        const mockRuntime = createMockRuntime();
        const container = new WorkerContainer({ workerId }, mockRuntime);

        // コンテナを作成
        await container.create();

        // 破棄
        const result = await container.destroy();

        // durationMsが0以上であること
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(typeof result.durationMs).toBe('number');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.8: クリーンスレート保証
   * 任意のワーカーコンテナが破棄された後、同じワーカーIDで新しいコンテナを作成できる
   *
   * **Validates: Requirement 5.5**
   * - THE Worker_Container SHALL be destroyed (clean slate)
   */
  it('Property 11.8: 破棄後に同じワーカーIDで新しいコンテナを作成できる', async () => {
    await fc.assert(
      fc.asyncProperty(workerIdArb, async (workerId) => {
        const mockRuntime1 = createMockRuntime();
        const mockRuntime2 = createMockRuntime();

        // 最初のコンテナを作成して破棄
        const container1 = new WorkerContainer({ workerId }, mockRuntime1);
        await container1.create();
        await container1.destroy();
        expect(container1.isDestroyed()).toBe(true);

        // 同じワーカーIDで新しいコンテナを作成
        const container2 = new WorkerContainer({ workerId }, mockRuntime2);
        const result = await container2.create();

        expect(result.success).toBe(true);
        expect(container2.getState()).toBe('created');
        expect(container2.getWorkerId()).toBe(workerId);
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// エッジケーステスト
// =============================================================================

describe('Worker Container Edge Cases', () => {
  /**
   * コンテナ名の形式検証
   */
  describe('container name format', () => {
    it('コンテナ名は正しいプレフィックスを持つ', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const mockRuntime = createMockRuntime();
          const container = new WorkerContainer({ workerId }, mockRuntime);
          await container.create();

          const name = container.getContainerName();
          expect(name).not.toBeNull();
          expect(name!.startsWith(CONTAINER_NAME_PREFIX)).toBe(true);
          expect(isWorkerContainerName(name!)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('コンテナ名からワーカーIDを抽出できる', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const mockRuntime = createMockRuntime();
          const container = new WorkerContainer({ workerId }, mockRuntime);
          await container.create();

          const name = container.getContainerName();
          const extractedId = extractWorkerIdFromContainerName(name!);

          expect(extractedId).toBe(workerId);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 状態遷移の検証
   */
  describe('state transitions', () => {
    it('正常な状態遷移: null -> created -> running -> stopped -> destroyed', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const mockRuntime = createMockRuntime();
          const container = new WorkerContainer({ workerId }, mockRuntime);

          // 初期状態
          expect(container.getState()).toBeNull();

          // 作成
          await container.create();
          expect(container.getState()).toBe('created');

          // 起動
          await container.start();
          expect(container.getState()).toBe('running');

          // 停止
          await container.stop();
          expect(container.getState()).toBe('stopped');

          // 破棄
          await container.destroy();
          expect(container.getState()).toBe('destroyed');
        }),
        { numRuns: 50 }
      );
    });

    it('ショートカット遷移: created -> destroyed', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const mockRuntime = createMockRuntime();
          const container = new WorkerContainer({ workerId }, mockRuntime);

          await container.create();
          expect(container.getState()).toBe('created');

          await container.destroy();
          expect(container.getState()).toBe('destroyed');
        }),
        { numRuns: 50 }
      );
    });

    it('ショートカット遷移: running -> destroyed', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const mockRuntime = createMockRuntime();
          const container = new WorkerContainer({ workerId }, mockRuntime);

          await container.createAndStart();
          expect(container.getState()).toBe('running');

          await container.destroy();
          expect(container.getState()).toBe('destroyed');
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 設定の不変性検証
   */
  describe('config immutability', () => {
    it('getInfo()で取得した情報を変更しても元の情報に影響しない', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const mockRuntime = createMockRuntime();
          const container = new WorkerContainer({ workerId }, mockRuntime);
          await container.create();

          const info1 = container.getInfo();
          const originalWorkerId = info1!.workerId;

          // 取得した情報を変更
          (info1 as any).workerId = 'modified-worker-id';
          (info1 as any).config.cpuLimit = '999';

          // 元の情報は変更されていない
          const info2 = container.getInfo();
          expect(info2!.workerId).toBe(originalWorkerId);
          expect(info2!.workerId).not.toBe('modified-worker-id');
        }),
        { numRuns: 50 }
      );
    });

    it('getIsolationConfig()で取得した設定を変更しても元の設定に影響しない', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const container = createIsolatedWorkerContainer(workerId);

          const config1 = container.getIsolationConfig();
          const originalNetworkMode = config1.networkMode;

          // 取得した設定を変更
          config1.networkMode = 'bridge';
          config1.pidsLimit = 9999;

          // 元の設定は変更されていない
          const config2 = container.getIsolationConfig();
          expect(config2.networkMode).toBe(originalNetworkMode);
          expect(config2.networkMode).not.toBe('bridge');
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * エラーハンドリング検証
   */
  describe('error handling', () => {
    it('作成エラー時に適切なエラーメッセージを返す', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const errorRuntime = createMockRuntime();
          vi.mocked(errorRuntime.createContainer).mockRejectedValue(
            new Error('Docker daemon not running')
          );

          const container = new WorkerContainer({ workerId }, errorRuntime);
          const result = await container.create();

          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('Docker daemon not running');
        }),
        { numRuns: 50 }
      );
    });

    it('削除エラー時に適切なエラーメッセージを返す', async () => {
      await fc.assert(
        fc.asyncProperty(workerIdArb, async (workerId) => {
          const errorRuntime = createMockRuntime();
          vi.mocked(errorRuntime.removeContainer).mockRejectedValue(
            new Error('Container in use')
          );

          const container = new WorkerContainer({ workerId }, errorRuntime);
          await container.create();
          const result = await container.destroy();

          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('Container in use');
        }),
        { numRuns: 50 }
      );
    });
  });
});

// =============================================================================
// デフォルト値検証テスト
// =============================================================================

describe('Default Values Verification', () => {
  it('DEFAULT_CLEANUP_TIMEOUT_MS は60秒（60000ミリ秒）である', () => {
    expect(DEFAULT_CLEANUP_TIMEOUT_MS).toBe(60000);
  });

  it('DEFAULT_ISOLATION_CONFIG は正しい隔離設定を持つ', () => {
    expect(DEFAULT_ISOLATION_CONFIG.networkMode).toBe('none');
    expect(DEFAULT_ISOLATION_CONFIG.noNewPrivileges).toBe(true);
    expect(DEFAULT_ISOLATION_CONFIG.dropAllCapabilities).toBe(true);
    expect(DEFAULT_ISOLATION_CONFIG.pidsLimit).toBeGreaterThan(0);
  });

  it('CONTAINER_NAME_PREFIX は正しい値を持つ', () => {
    expect(CONTAINER_NAME_PREFIX).toBe('agentcompany-worker');
  });
});
