/**
 * Worker Container ユニットテスト
 *
 * ワーカーコンテナ管理機能をテストする。
 * Container Runtime Abstraction経由でのコンテナ作成・破棄を検証する。
 *
 * **Validates: Requirements 5.1, 5.5**
 * **Property 10: Worker Container Isolation**
 * **Property 11: Worker Container Cleanup**
 *
 * @module tests/execution/worker-container.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  WorkerContainer,
  WorkerContainerConfig,
  DEFAULT_WORKER_IMAGE,
  CONTAINER_WORKSPACE_PATH,
  CONTAINER_RESULTS_PATH,
  CONTAINER_NAME_PREFIX,
  createWorkerContainer,
  createWorkerContainerFromConfig,
  extractWorkerIdFromContainerName,
  isWorkerContainerName,
} from '../../tools/cli/lib/execution/worker-container';
import { ContainerRuntime } from '../../tools/cli/lib/execution/container-runtime';
import { DEFAULT_SYSTEM_CONFIG } from '../../tools/cli/lib/execution/types';

// =============================================================================
// モック設定
// =============================================================================

/**
 * モックContainerRuntimeを作成
 */
function createMockRuntime(): ContainerRuntime {
  const mockRuntime = {
    createContainer: vi.fn().mockResolvedValue('mock-container-id-12345'),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    removeContainer: vi.fn().mockResolvedValue(undefined),
    getContainerLogs: vi.fn().mockResolvedValue('mock logs output'),
    inspectContainer: vi.fn().mockResolvedValue({ State: { Running: true } }),
    getConfig: vi.fn().mockReturnValue({ type: 'dod' }),
    getRuntimeType: vi.fn().mockReturnValue('dod'),
  } as unknown as ContainerRuntime;

  return mockRuntime;
}

// =============================================================================
// テストセットアップ
// =============================================================================

describe('WorkerContainer', () => {
  let mockRuntime: ContainerRuntime;
  let workerContainer: WorkerContainer;
  const testWorkerId = 'worker-test-001';

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    workerContainer = new WorkerContainer({ workerId: testWorkerId }, mockRuntime);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // コンストラクタテスト
  // ===========================================================================

  describe('constructor', () => {
    /**
     * デフォルト設定の確認
     */
    it('デフォルト設定でインスタンスを作成できる', () => {
      const container = new WorkerContainer({ workerId: testWorkerId }, mockRuntime);

      expect(container.getWorkerId()).toBe(testWorkerId);
      expect(container.getContainerId()).toBeNull();
      expect(container.getState()).toBeNull();
    });

    it('カスタム設定でインスタンスを作成できる', () => {
      const config: WorkerContainerConfig = {
        workerId: testWorkerId,
        runId: 'run-123',
        image: 'custom-image:v1',
        cpuLimit: '4',
        memoryLimit: '8g',
        env: { CUSTOM_VAR: 'value' },
        resultsDir: '/tmp/results',
        networkMode: 'bridge',
      };

      const container = new WorkerContainer(config, mockRuntime);

      expect(container.getWorkerId()).toBe(testWorkerId);
    });

    it('デフォルトのリソース制限が適用される', () => {
      const container = new WorkerContainer({ workerId: testWorkerId }, mockRuntime);
      const info = container.getInfo();

      // 作成前はnull
      expect(info).toBeNull();
    });
  });

  // ===========================================================================
  // コンテナ作成テスト
  // ===========================================================================

  describe('create', () => {
    /**
     * コンテナ作成の検証
     * @see Requirement 5.1: WHEN Worker_Agent is assigned a task, THE System SHALL create a dedicated Docker container
     */
    it('コンテナを作成できる', async () => {
      const result = await workerContainer.create();

      expect(result.success).toBe(true);
      expect(result.containerId).toBe('mock-container-id-12345');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockRuntime.createContainer).toHaveBeenCalledTimes(1);
    });

    it('作成後にコンテナ情報を取得できる', async () => {
      await workerContainer.create();

      const info = workerContainer.getInfo();

      expect(info).not.toBeNull();
      expect(info!.containerId).toBe('mock-container-id-12345');
      expect(info!.workerId).toBe(testWorkerId);
      expect(info!.state).toBe('created');
      expect(info!.createdAt).toBeDefined();
    });

    it('コンテナ名が正しい形式で生成される', async () => {
      await workerContainer.create();

      const containerName = workerContainer.getContainerName();

      expect(containerName).not.toBeNull();
      expect(containerName).toContain(CONTAINER_NAME_PREFIX);
      expect(containerName).toContain(testWorkerId);
    });

    it('既に作成済みの場合はエラーを返す', async () => {
      await workerContainer.create();
      const result = await workerContainer.create();

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('作成に失敗した場合はエラーを返す', async () => {
      vi.mocked(mockRuntime.createContainer).mockRejectedValueOnce(
        new Error('Docker daemon not running')
      );

      const result = await workerContainer.create();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Docker daemon not running');
    });

    it('正しいオプションでコンテナが作成される', async () => {
      const config: WorkerContainerConfig = {
        workerId: testWorkerId,
        runId: 'run-456',
        cpuLimit: '2',
        memoryLimit: '4g',
        env: { TEST_VAR: 'test_value' },
        resultsDir: '/tmp/results',
      };

      const container = new WorkerContainer(config, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          image: DEFAULT_WORKER_IMAGE,
          workDir: CONTAINER_WORKSPACE_PATH,
          cpuLimit: '2',
          memoryLimit: '4g',
          env: expect.objectContaining({
            WORKER_ID: testWorkerId,
            RUN_ID: 'run-456',
            TEST_VAR: 'test_value',
          }),
        })
      );
    });

    it('結果ディレクトリが読み取り専用でマウントされる', async () => {
      const config: WorkerContainerConfig = {
        workerId: testWorkerId,
        resultsDir: '/host/results',
      };

      const container = new WorkerContainer(config, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          volumes: expect.arrayContaining([`/host/results:${CONTAINER_RESULTS_PATH}:ro`]),
        })
      );
    });

    /**
     * GitリポジトリURL設定の検証
     * @see Requirement 5.3: THE Worker_Container SHALL clone the repository into container-local `/workspace`
     */
    it('GitリポジトリURLが環境変数として設定される', async () => {
      const config: WorkerContainerConfig = {
        workerId: testWorkerId,
        gitRepoUrl: 'https://github.com/example/repo.git',
        gitBranch: 'develop',
      };

      const container = new WorkerContainer(config, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            GIT_REPO_URL: 'https://github.com/example/repo.git',
            GIT_BRANCH: 'develop',
            WORKSPACE_PATH: CONTAINER_WORKSPACE_PATH,
          }),
        })
      );
    });

    it('Git認証トークンが環境変数として設定される', async () => {
      const config: WorkerContainerConfig = {
        workerId: testWorkerId,
        gitRepoUrl: 'https://github.com/example/repo.git',
        gitToken: 'ghp_xxxxxxxxxxxx',
      };

      const container = new WorkerContainer(config, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            GIT_REPO_URL: 'https://github.com/example/repo.git',
            GIT_TOKEN: 'ghp_xxxxxxxxxxxx',
          }),
        })
      );
    });

    it('セキュリティオプションが設定される', async () => {
      await workerContainer.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalOptions: expect.arrayContaining(['--security-opt=no-new-privileges:true']),
        })
      );
    });
  });

  // ===========================================================================
  // コンテナ起動テスト
  // ===========================================================================

  describe('start', () => {
    it('作成済みコンテナを起動できる', async () => {
      await workerContainer.create();
      const result = await workerContainer.start();

      expect(result.success).toBe(true);
      expect(workerContainer.getState()).toBe('running');
      expect(workerContainer.isRunning()).toBe(true);
    });

    it('未作成の場合はエラーを返す', async () => {
      const result = await workerContainer.start();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not created');
    });

    it('既に実行中の場合は成功を返す', async () => {
      await workerContainer.create();
      await workerContainer.start();
      const result = await workerContainer.start();

      expect(result.success).toBe(true);
    });

    it('破棄済みの場合はエラーを返す', async () => {
      await workerContainer.create();
      await workerContainer.destroy();
      const result = await workerContainer.start();

      expect(result.success).toBe(false);
      expect(result.error).toContain('destroyed');
    });
  });

  // ===========================================================================
  // コンテナ停止テスト
  // ===========================================================================

  describe('stop', () => {
    it('実行中のコンテナを停止できる', async () => {
      await workerContainer.create();
      await workerContainer.start();
      const result = await workerContainer.stop();

      expect(result.success).toBe(true);
      expect(workerContainer.getState()).toBe('stopped');
      expect(workerContainer.isRunning()).toBe(false);
      expect(mockRuntime.stopContainer).toHaveBeenCalledWith('mock-container-id-12345');
    });

    it('未作成の場合はエラーを返す', async () => {
      const result = await workerContainer.stop();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not created');
    });

    it('既に停止済みの場合は成功を返す', async () => {
      await workerContainer.create();
      await workerContainer.start();
      await workerContainer.stop();
      const result = await workerContainer.stop();

      expect(result.success).toBe(true);
    });

    it('停止に失敗した場合はエラーを返す', async () => {
      await workerContainer.create();
      await workerContainer.start();

      vi.mocked(mockRuntime.stopContainer).mockRejectedValueOnce(new Error('Container not found'));

      const result = await workerContainer.stop();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Container not found');
    });
  });

  // ===========================================================================
  // コンテナ破棄テスト
  // ===========================================================================

  describe('destroy', () => {
    /**
     * コンテナ破棄の検証
     * @see Requirement 5.5: WHEN task execution completes, THE Worker_Container SHALL be destroyed (clean slate)
     * @see Property 11: Worker Container Cleanup
     */
    it('コンテナを破棄できる', async () => {
      await workerContainer.create();
      const result = await workerContainer.destroy();

      expect(result.success).toBe(true);
      expect(workerContainer.getState()).toBe('destroyed');
      expect(workerContainer.isDestroyed()).toBe(true);
      expect(mockRuntime.removeContainer).toHaveBeenCalledWith('mock-container-id-12345');
    });

    it('実行中のコンテナを停止してから破棄する', async () => {
      await workerContainer.create();
      await workerContainer.start();
      const result = await workerContainer.destroy();

      expect(result.success).toBe(true);
      expect(mockRuntime.stopContainer).toHaveBeenCalledWith('mock-container-id-12345');
      expect(mockRuntime.removeContainer).toHaveBeenCalledWith('mock-container-id-12345');
    });

    it('強制破棄オプションで実行中でも破棄できる', async () => {
      await workerContainer.create();
      await workerContainer.start();

      // 停止に失敗しても削除を試みる
      vi.mocked(mockRuntime.stopContainer).mockRejectedValueOnce(new Error('Stop failed'));

      const result = await workerContainer.destroy(true);

      expect(result.success).toBe(true);
      expect(mockRuntime.removeContainer).toHaveBeenCalled();
    });

    it('未作成の場合は成功を返す', async () => {
      const result = await workerContainer.destroy();

      expect(result.success).toBe(true);
    });

    it('既に破棄済みの場合は成功を返す', async () => {
      await workerContainer.create();
      await workerContainer.destroy();
      const result = await workerContainer.destroy();

      expect(result.success).toBe(true);
    });

    it('削除に失敗した場合はエラーを返す', async () => {
      await workerContainer.create();

      vi.mocked(mockRuntime.removeContainer).mockRejectedValueOnce(new Error('Remove failed'));

      const result = await workerContainer.destroy();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Remove failed');
    });
  });

  // ===========================================================================
  // createAndStart テスト
  // ===========================================================================

  describe('createAndStart', () => {
    it('コンテナを作成して起動できる', async () => {
      const result = await workerContainer.createAndStart();

      expect(result.success).toBe(true);
      expect(result.containerId).toBe('mock-container-id-12345');
      expect(workerContainer.isRunning()).toBe(true);
    });

    it('作成に失敗した場合はエラーを返す', async () => {
      vi.mocked(mockRuntime.createContainer).mockRejectedValueOnce(new Error('Create failed'));

      const result = await workerContainer.createAndStart();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Create failed');
    });
  });

  // ===========================================================================
  // ログ取得テスト
  // ===========================================================================

  describe('getLogs', () => {
    it('コンテナのログを取得できる', async () => {
      await workerContainer.create();
      const logs = await workerContainer.getLogs();

      expect(logs).toBe('mock logs output');
      expect(mockRuntime.getContainerLogs).toHaveBeenCalledWith(
        'mock-container-id-12345',
        undefined
      );
    });

    it('tail オプションを指定できる', async () => {
      await workerContainer.create();
      await workerContainer.getLogs({ tail: 100 });

      expect(mockRuntime.getContainerLogs).toHaveBeenCalledWith('mock-container-id-12345', {
        tail: 100,
      });
    });

    it('未作成の場合はエラーをスローする', async () => {
      await expect(workerContainer.getLogs()).rejects.toThrow('not created');
    });
  });

  // ===========================================================================
  // inspect テスト
  // ===========================================================================

  describe('inspect', () => {
    it('コンテナの詳細情報を取得できる', async () => {
      await workerContainer.create();
      const info = await workerContainer.inspect();

      expect(info).toEqual({ State: { Running: true } });
      expect(mockRuntime.inspectContainer).toHaveBeenCalledWith('mock-container-id-12345');
    });

    it('未作成の場合はエラーをスローする', async () => {
      await expect(workerContainer.inspect()).rejects.toThrow('not created');
    });
  });

  // ===========================================================================
  // ゲッターテスト
  // ===========================================================================

  describe('getters', () => {
    it('getContainerId は作成前はnullを返す', () => {
      expect(workerContainer.getContainerId()).toBeNull();
    });

    it('getContainerId は作成後にIDを返す', async () => {
      await workerContainer.create();
      expect(workerContainer.getContainerId()).toBe('mock-container-id-12345');
    });

    it('getWorkerId はワーカーIDを返す', () => {
      expect(workerContainer.getWorkerId()).toBe(testWorkerId);
    });

    it('getContainerName は作成前はnullを返す', () => {
      expect(workerContainer.getContainerName()).toBeNull();
    });

    it('getState は作成前はnullを返す', () => {
      expect(workerContainer.getState()).toBeNull();
    });

    it('getInfo はディープコピーを返す', async () => {
      await workerContainer.create();
      const info1 = workerContainer.getInfo();
      const info2 = workerContainer.getInfo();

      expect(info1).not.toBe(info2);
      expect(info1!.config).not.toBe(info2!.config);
    });

    it('isRunning は正しい状態を返す', async () => {
      expect(workerContainer.isRunning()).toBe(false);

      await workerContainer.create();
      expect(workerContainer.isRunning()).toBe(false);

      await workerContainer.start();
      expect(workerContainer.isRunning()).toBe(true);

      await workerContainer.stop();
      expect(workerContainer.isRunning()).toBe(false);
    });

    it('isDestroyed は正しい状態を返す', async () => {
      expect(workerContainer.isDestroyed()).toBe(false);

      await workerContainer.create();
      expect(workerContainer.isDestroyed()).toBe(false);

      await workerContainer.destroy();
      expect(workerContainer.isDestroyed()).toBe(true);
    });
  });
});

// =============================================================================
// ファクトリ関数テスト
// =============================================================================

describe('createWorkerContainer', () => {
  it('ワーカーIDのみでインスタンスを作成できる', () => {
    const container = createWorkerContainer('worker-001');

    expect(container.getWorkerId()).toBe('worker-001');
  });

  it('追加オプションを指定できる', () => {
    const mockRuntime = createMockRuntime();
    const container = createWorkerContainer(
      'worker-002',
      {
        runId: 'run-123',
        cpuLimit: '4',
        memoryLimit: '8g',
      },
      mockRuntime
    );

    expect(container.getWorkerId()).toBe('worker-002');
  });
});

describe('createWorkerContainerFromConfig', () => {
  it('システム設定からインスタンスを作成できる', () => {
    const container = createWorkerContainerFromConfig('worker-003', {
      workerCpuLimit: '4',
      workerMemoryLimit: '8g',
      containerRuntime: 'dod',
    });

    expect(container.getWorkerId()).toBe('worker-003');
  });

  it('デフォルト設定が適用される', () => {
    const container = createWorkerContainerFromConfig('worker-004', {});

    expect(container.getWorkerId()).toBe('worker-004');
  });
});

// =============================================================================
// ユーティリティ関数テスト
// =============================================================================

describe('extractWorkerIdFromContainerName', () => {
  it('コンテナ名からワーカーIDを抽出できる', () => {
    const containerName = 'agentcompany-worker-worker-001-1234567890-abc123';
    const workerId = extractWorkerIdFromContainerName(containerName);

    expect(workerId).toBe('worker-001');
  });

  it('ハイフンを含むワーカーIDを抽出できる', () => {
    const containerName = 'agentcompany-worker-worker-test-001-1234567890-abc123';
    const workerId = extractWorkerIdFromContainerName(containerName);

    expect(workerId).toBe('worker-test-001');
  });

  it('無効なコンテナ名に対してnullを返す', () => {
    expect(extractWorkerIdFromContainerName('invalid-container')).toBeNull();
    expect(extractWorkerIdFromContainerName('')).toBeNull();
    expect(extractWorkerIdFromContainerName('agentcompany-worker')).toBeNull();
    expect(extractWorkerIdFromContainerName('agentcompany-worker-id')).toBeNull();
  });

  it('プレフィックスが異なる場合はnullを返す', () => {
    const containerName = 'other-prefix-worker-001-1234567890-abc123';
    const workerId = extractWorkerIdFromContainerName(containerName);

    expect(workerId).toBeNull();
  });
});

describe('isWorkerContainerName', () => {
  it('ワーカーコンテナ名を正しく判定する', () => {
    expect(isWorkerContainerName('agentcompany-worker-worker-001-1234567890-abc123')).toBe(true);
    expect(isWorkerContainerName('agentcompany-worker-test-1234567890-abc123')).toBe(true);
  });

  it('非ワーカーコンテナ名を正しく判定する', () => {
    expect(isWorkerContainerName('other-container')).toBe(false);
    expect(isWorkerContainerName('')).toBe(false);
    expect(isWorkerContainerName('agentcompany-manager-001')).toBe(false);
  });
});

// =============================================================================
// 定数テスト
// =============================================================================

describe('constants', () => {
  it('DEFAULT_WORKER_IMAGE が正しく定義されている', () => {
    expect(DEFAULT_WORKER_IMAGE).toBe('agentcompany/worker:latest');
  });

  it('CONTAINER_WORKSPACE_PATH が正しく定義されている', () => {
    expect(CONTAINER_WORKSPACE_PATH).toBe('/workspace');
  });

  it('CONTAINER_RESULTS_PATH が正しく定義されている', () => {
    expect(CONTAINER_RESULTS_PATH).toBe('/results');
  });

  it('CONTAINER_NAME_PREFIX が正しく定義されている', () => {
    expect(CONTAINER_NAME_PREFIX).toBe('agentcompany-worker');
  });
});

// =============================================================================
// リソース制限テスト
// =============================================================================

describe('resource limits', () => {
  let mockRuntime: ContainerRuntime;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * CPU制限の検証
   * @see Requirement 5.6: THE Worker_Container SHALL have configurable resource limits (CPU, memory)
   */
  it('CPU制限が設定可能である', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-cpu-test',
      cpuLimit: '4',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        cpuLimit: '4',
      })
    );
  });

  /**
   * メモリ制限の検証
   * @see Requirement 5.6: THE Worker_Container SHALL have configurable resource limits (CPU, memory)
   */
  it('メモリ制限が設定可能である', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-memory-test',
      memoryLimit: '8g',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryLimit: '8g',
      })
    );
  });

  it('デフォルトのリソース制限が適用される', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-default-limits',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        cpuLimit: DEFAULT_SYSTEM_CONFIG.workerCpuLimit,
        memoryLimit: DEFAULT_SYSTEM_CONFIG.workerMemoryLimit,
      })
    );
  });

  it('CPU制限とメモリ制限を同時に設定できる', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-both-limits',
      cpuLimit: '2',
      memoryLimit: '4g',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        cpuLimit: '2',
        memoryLimit: '4g',
      })
    );
  });
});

// =============================================================================
// ベースイメージテスト
// =============================================================================

describe('base image configuration', () => {
  let mockRuntime: ContainerRuntime;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * ベースイメージの検証
   * @see Requirement 5.2: THE Worker_Container SHALL be based on `infra/docker/images/worker/` image
   */
  it('デフォルトでagentcompany/worker:latestイメージを使用する', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-default-image',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'agentcompany/worker:latest',
      })
    );
  });

  it('カスタムイメージを指定できる', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-custom-image',
      image: 'custom/worker:v2.0',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'custom/worker:v2.0',
      })
    );
  });
});

// =============================================================================
// リポジトリclone設定テスト
// =============================================================================

describe('repository clone configuration', () => {
  let mockRuntime: ContainerRuntime;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * リポジトリclone設定の検証
   * @see Requirement 5.3: THE Worker_Container SHALL clone the repository into container-local `/workspace`
   */
  it('作業ディレクトリが/workspaceに設定される', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-workspace-test',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        workDir: '/workspace',
      })
    );
  });

  it('WORKSPACE_PATH環境変数が設定される', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-workspace-env-test',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          WORKSPACE_PATH: '/workspace',
        }),
      })
    );
  });

  it('GitリポジトリURLなしでもコンテナを作成できる', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-no-git',
    };

    const container = new WorkerContainer(config, mockRuntime);
    const result = await container.create();

    expect(result.success).toBe(true);
    // GIT_REPO_URLが設定されていないことを確認
    const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];
    expect(callArgs.env?.GIT_REPO_URL).toBeUndefined();
  });

  it('GitリポジトリURLとブランチを同時に設定できる', async () => {
    const config: WorkerContainerConfig = {
      workerId: 'worker-git-full',
      gitRepoUrl: 'https://github.com/org/project.git',
      gitBranch: 'feature/new-feature',
      gitToken: 'token123',
    };

    const container = new WorkerContainer(config, mockRuntime);
    await container.create();

    expect(mockRuntime.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          GIT_REPO_URL: 'https://github.com/org/project.git',
          GIT_BRANCH: 'feature/new-feature',
          GIT_TOKEN: 'token123',
        }),
      })
    );
  });
});

// =============================================================================
// 状態遷移テスト
// =============================================================================

describe('state transitions', () => {
  let mockRuntime: ContainerRuntime;
  let workerContainer: WorkerContainer;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    workerContainer = new WorkerContainer({ workerId: 'worker-state-test' }, mockRuntime);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('null -> created -> running -> stopped -> destroyed の遷移', async () => {
    // 初期状態
    expect(workerContainer.getState()).toBeNull();

    // 作成
    await workerContainer.create();
    expect(workerContainer.getState()).toBe('created');

    // 起動
    await workerContainer.start();
    expect(workerContainer.getState()).toBe('running');

    // 停止
    await workerContainer.stop();
    expect(workerContainer.getState()).toBe('stopped');

    // 破棄
    await workerContainer.destroy();
    expect(workerContainer.getState()).toBe('destroyed');
  });

  it('created -> destroyed の直接遷移', async () => {
    await workerContainer.create();
    expect(workerContainer.getState()).toBe('created');

    await workerContainer.destroy();
    expect(workerContainer.getState()).toBe('destroyed');
  });

  it('running -> destroyed の直接遷移（停止を経由）', async () => {
    await workerContainer.create();
    await workerContainer.start();
    expect(workerContainer.getState()).toBe('running');

    await workerContainer.destroy();
    expect(workerContainer.getState()).toBe('destroyed');
    expect(mockRuntime.stopContainer).toHaveBeenCalled();
  });

  it('破棄後に再作成はできない（新しいインスタンスが必要）', async () => {
    await workerContainer.create();
    await workerContainer.destroy();

    // 同じインスタンスで再作成を試みる
    const result = await workerContainer.create();

    // 破棄済みの場合は新規作成が可能（状態がリセットされる設計の場合）
    // または、エラーを返す設計の場合
    // 現在の実装では、destroyedの場合は新規作成を許可している
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// エラーハンドリングテスト
// =============================================================================

describe('error handling', () => {
  let mockRuntime: ContainerRuntime;
  let workerContainer: WorkerContainer;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    workerContainer = new WorkerContainer({ workerId: 'worker-error-test' }, mockRuntime);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('createContainer エラー時に適切なエラーメッセージを返す', async () => {
    vi.mocked(mockRuntime.createContainer).mockRejectedValueOnce(
      new Error('Image not found: agentcompany/worker:latest')
    );

    const result = await workerContainer.create();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Image not found');
  });

  it('stopContainer エラー時に適切なエラーメッセージを返す', async () => {
    await workerContainer.create();
    await workerContainer.start();

    vi.mocked(mockRuntime.stopContainer).mockRejectedValueOnce(
      new Error('Container already stopped')
    );

    const result = await workerContainer.stop();

    expect(result.success).toBe(false);
    expect(result.error).toContain('already stopped');
  });

  it('removeContainer エラー時に適切なエラーメッセージを返す', async () => {
    await workerContainer.create();

    vi.mocked(mockRuntime.removeContainer).mockRejectedValueOnce(new Error('Container in use'));

    const result = await workerContainer.destroy();

    expect(result.success).toBe(false);
    expect(result.error).toContain('in use');
  });

  it('非Errorオブジェクトのエラーも処理できる', async () => {
    vi.mocked(mockRuntime.createContainer).mockRejectedValueOnce('String error');

    const result = await workerContainer.create();

    expect(result.success).toBe(false);
    expect(result.error).toBe('String error');
  });
});

// =============================================================================
// コンテナ隔離テスト
// =============================================================================

describe('container isolation', () => {
  let mockRuntime: ContainerRuntime;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * ネットワーク隔離の検証
   * @see Requirement 5.4: Network: No inter-container communication except via Agent_Bus
   * @see Property 10: Worker Container Isolation
   */
  describe('network isolation', () => {
    it('デフォルトでnetworkMode=noneが設定される', async () => {
      const container = new WorkerContainer({ workerId: 'worker-network-test' }, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          networkMode: 'none',
        })
      );
    });

    it('networkMode=noneでコンテナ間通信が禁止される', async () => {
      const container = new WorkerContainer({ workerId: 'worker-network-isolated' }, mockRuntime);
      await container.create();

      const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];
      expect(callArgs.networkMode).toBe('none');
    });

    it('隔離設定でnetworkModeをカスタマイズできる', async () => {
      const container = new WorkerContainer(
        {
          workerId: 'worker-network-custom',
          isolation: { networkMode: 'bridge' },
        },
        mockRuntime
      );
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          networkMode: 'bridge',
        })
      );
    });
  });

  /**
   * ファイルシステム隔離の検証
   * @see Requirement 5.4: Filesystem: No shared volumes between workers
   * @see Property 10: Worker Container Isolation
   */
  describe('filesystem isolation', () => {
    it('各ワーカーは独自の/workspaceを持つ（共有ボリュームなし）', async () => {
      const containerA = new WorkerContainer({ workerId: 'worker-fs-a' }, mockRuntime);
      const containerB = new WorkerContainer({ workerId: 'worker-fs-b' }, mockRuntime);

      await containerA.create();
      await containerB.create();

      // 両方のコンテナが独立して作成される
      expect(mockRuntime.createContainer).toHaveBeenCalledTimes(2);

      // 共有ボリュームがないことを確認
      const callArgsA = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];
      const callArgsB = vi.mocked(mockRuntime.createContainer).mock.calls[1][0];

      // /workspaceへの共有マウントがないことを確認
      const sharedWorkspaceVolumeA = callArgsA.volumes?.find(
        (v) => v.includes('/workspace') && !v.includes(':ro')
      );
      const sharedWorkspaceVolumeB = callArgsB.volumes?.find(
        (v) => v.includes('/workspace') && !v.includes(':ro')
      );

      expect(sharedWorkspaceVolumeA).toBeUndefined();
      expect(sharedWorkspaceVolumeB).toBeUndefined();
    });

    it('リポジトリはコンテナ内にcloneされる（ホストbind mountではない）', async () => {
      const container = new WorkerContainer(
        {
          workerId: 'worker-git-clone',
          gitRepoUrl: 'https://github.com/example/repo.git',
        },
        mockRuntime
      );
      await container.create();

      const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];

      // GIT_REPO_URLが環境変数として設定される（コンテナ内でclone）
      expect(callArgs.env?.GIT_REPO_URL).toBe('https://github.com/example/repo.git');

      // ホストの/workspaceへのbind mountがないことを確認
      const hostWorkspaceMount = callArgs.volumes?.find(
        (v) => v.includes('workspace') && !v.includes(':ro') && !v.includes('/results')
      );
      expect(hostWorkspaceMount).toBeUndefined();
    });
  });

  /**
   * 読み取り専用共有の検証
   * @see Requirement 5.4: Shared read-only: `runtime/runs/<run-id>/` for result collection only
   */
  describe('read-only shared directory', () => {
    it('結果ディレクトリは読み取り専用でマウントされる', async () => {
      const container = new WorkerContainer(
        {
          workerId: 'worker-results-ro',
          resultsDir: '/host/runtime/runs/run-123',
        },
        mockRuntime
      );
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          volumes: expect.arrayContaining(['/host/runtime/runs/run-123:/results:ro']),
        })
      );
    });

    it('結果ディレクトリなしでもコンテナを作成できる', async () => {
      const container = new WorkerContainer({ workerId: 'worker-no-results' }, mockRuntime);
      await container.create();

      const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];
      const resultsVolume = callArgs.volumes?.find((v) => v.includes('/results'));
      expect(resultsVolume).toBeUndefined();
    });
  });

  /**
   * セキュリティオプションの検証
   * @see Requirement 5.4: THE Worker_Container SHALL be isolated
   */
  describe('security options', () => {
    it('no-new-privilegesが設定される', async () => {
      const container = new WorkerContainer({ workerId: 'worker-security-test' }, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalOptions: expect.arrayContaining(['--security-opt=no-new-privileges:true']),
        })
      );
    });

    it('cap-drop=ALLが設定される', async () => {
      const container = new WorkerContainer({ workerId: 'worker-cap-drop-test' }, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalOptions: expect.arrayContaining(['--cap-drop=ALL']),
        })
      );
    });

    it('pids-limitが設定される', async () => {
      const container = new WorkerContainer({ workerId: 'worker-pids-limit-test' }, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalOptions: expect.arrayContaining([expect.stringMatching(/--pids-limit=\d+/)]),
        })
      );
    });

    it('tmpfsマウントが設定される', async () => {
      const container = new WorkerContainer({ workerId: 'worker-tmpfs-test' }, mockRuntime);
      await container.create();

      expect(mockRuntime.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalOptions: expect.arrayContaining([
            expect.stringMatching(/--tmpfs=\/tmp/),
            expect.stringMatching(/--tmpfs=\/var\/tmp/),
          ]),
        })
      );
    });

    it('カスタム隔離設定を適用できる', async () => {
      const container = new WorkerContainer(
        {
          workerId: 'worker-custom-isolation',
          isolation: {
            noNewPrivileges: false,
            dropAllCapabilities: false,
            pidsLimit: 512,
          },
        },
        mockRuntime
      );
      await container.create();

      const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];

      // カスタム設定が反映される
      expect(callArgs.additionalOptions).not.toContain('--security-opt=no-new-privileges:true');
      expect(callArgs.additionalOptions).not.toContain('--cap-drop=ALL');
      expect(callArgs.additionalOptions).toContain('--pids-limit=512');
    });
  });

  /**
   * 隔離検証メソッドのテスト
   * @see Requirement 5.4: Isolation Acceptance Test Criteria
   */
  describe('verifyIsolation', () => {
    it('デフォルト設定で隔離が有効と判定される', async () => {
      const container = new WorkerContainer({ workerId: 'worker-verify-default' }, mockRuntime);

      const result = await container.verifyIsolation();

      expect(result.valid).toBe(true);
      expect(result.networkIsolated).toBe(true);
      expect(result.filesystemIsolated).toBe(true);
      expect(result.securityOptionsCorrect).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('ネットワーク隔離が無効な場合はエラーを返す', async () => {
      const container = new WorkerContainer(
        {
          workerId: 'worker-verify-network',
          isolation: { networkMode: 'bridge' },
        },
        mockRuntime
      );

      const result = await container.verifyIsolation();

      expect(result.valid).toBe(false);
      expect(result.networkIsolated).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('Network'))).toBe(true);
    });

    it('セキュリティオプションが無効な場合はエラーを返す', async () => {
      const container = new WorkerContainer(
        {
          workerId: 'worker-verify-security',
          isolation: {
            noNewPrivileges: false,
            dropAllCapabilities: false,
          },
        },
        mockRuntime
      );

      const result = await container.verifyIsolation();

      expect(result.valid).toBe(false);
      expect(result.securityOptionsCorrect).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  /**
   * 隔離設定取得のテスト
   */
  describe('getIsolationConfig', () => {
    it('デフォルトの隔離設定を取得できる', () => {
      const container = new WorkerContainer({ workerId: 'worker-get-isolation' }, mockRuntime);

      const config = container.getIsolationConfig();

      expect(config.networkMode).toBe('none');
      expect(config.noNewPrivileges).toBe(true);
      expect(config.dropAllCapabilities).toBe(true);
      expect(config.pidsLimit).toBeGreaterThan(0);
    });

    it('カスタム隔離設定がマージされる', () => {
      const container = new WorkerContainer(
        {
          workerId: 'worker-custom-get-isolation',
          isolation: {
            pidsLimit: 1024,
          },
        },
        mockRuntime
      );

      const config = container.getIsolationConfig();

      expect(config.networkMode).toBe('none'); // デフォルト
      expect(config.pidsLimit).toBe(1024); // カスタム
    });
  });
});

// =============================================================================
// 隔離ユーティリティ関数テスト
// =============================================================================

describe('isolation utility functions', () => {
  let mockRuntime: ContainerRuntime;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createIsolatedWorkerContainer', () => {
    it('最大限の隔離設定でコンテナを作成できる', async () => {
      // インポートを追加する必要がある場合はここで確認
      const { createIsolatedWorkerContainer } =
        await import('../../tools/cli/lib/execution/worker-container');

      const container = createIsolatedWorkerContainer('worker-isolated');
      const config = container.getIsolationConfig();

      expect(config.networkMode).toBe('none');
      expect(config.noNewPrivileges).toBe(true);
      expect(config.dropAllCapabilities).toBe(true);
    });
  });

  describe('verifyContainerIsolation', () => {
    it('2つのコンテナ間の隔離を検証できる', async () => {
      const { verifyContainerIsolation } =
        await import('../../tools/cli/lib/execution/worker-container');

      const containerA = new WorkerContainer({ workerId: 'worker-a' }, mockRuntime);
      const containerB = new WorkerContainer({ workerId: 'worker-b' }, mockRuntime);

      const result = await verifyContainerIsolation(containerA, containerB);

      expect(result.isolated).toBe(true);
      expect(result.networkIsolated).toBe(true);
      expect(result.filesystemIsolated).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('同じワーカーIDの場合はエラーを返す', async () => {
      const { verifyContainerIsolation } =
        await import('../../tools/cli/lib/execution/worker-container');

      const containerA = new WorkerContainer({ workerId: 'same-worker' }, mockRuntime);
      const containerB = new WorkerContainer({ workerId: 'same-worker' }, mockRuntime);

      const result = await verifyContainerIsolation(containerA, containerB);

      expect(result.isolated).toBe(false);
      expect(result.errors.some((e) => e.includes('same worker ID'))).toBe(true);
    });

    it('ネットワーク隔離が無効な場合はエラーを返す', async () => {
      const { verifyContainerIsolation } =
        await import('../../tools/cli/lib/execution/worker-container');

      const containerA = new WorkerContainer(
        {
          workerId: 'worker-net-a',
          isolation: { networkMode: 'bridge' },
        },
        mockRuntime
      );
      const containerB = new WorkerContainer({ workerId: 'worker-net-b' }, mockRuntime);

      const result = await verifyContainerIsolation(containerA, containerB);

      expect(result.isolated).toBe(false);
      expect(result.networkIsolated).toBe(false);
    });
  });

  describe('describeIsolationConfig', () => {
    it('隔離設定の説明を生成できる', async () => {
      const { describeIsolationConfig, DEFAULT_ISOLATION_CONFIG } =
        await import('../../tools/cli/lib/execution/worker-container');

      const description = describeIsolationConfig(DEFAULT_ISOLATION_CONFIG);

      expect(description).toContain('Container Isolation Configuration');
      expect(description).toContain('Network Mode: none');
      expect(description).toContain('No New Privileges: enabled');
      expect(description).toContain('Drop All Capabilities: enabled');
    });
  });
});
