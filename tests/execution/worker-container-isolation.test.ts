/**
 * Worker Container 隔離受け入れテスト
 *
 * Requirement 5.4 (Isolation Acceptance Test Criteria) に基づく受け入れテスト。
 * Worker Container間の隔離を検証する。
 *
 * ## 検証項目
 * - Worker A が Worker B の `/workspace` にアクセス不可
 * - Worker A が Worker B にネットワークパケット送信不可
 * - Worker A がホストファイルシステムにアクセス不可
 * - DoD使用時、他ワーカーに影響するコンテナ生成不可
 *
 * **Validates: Requirement 5.4 (Isolation Acceptance Test Criteria)**
 *
 * @module tests/execution/worker-container-isolation.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  WorkerContainer,
  WorkerContainerConfig,
  ContainerIsolationConfig,
  DEFAULT_ISOLATION_CONFIG,
  CONTAINER_WORKSPACE_PATH,
  CONTAINER_RESULTS_PATH,
  createIsolatedWorkerContainer,
  verifyContainerIsolation,
} from '../../tools/cli/lib/execution/worker-container';
import {
  ContainerRuntime,
  ContainerCreateOptions,
  DEFAULT_ALLOWED_DOCKER_COMMANDS,
} from '../../tools/cli/lib/execution/container-runtime';

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
// 受け入れテスト 1: ファイルシステム隔離
// Worker A が Worker B の `/workspace` にアクセス不可
// =============================================================================

describe('Isolation Acceptance Test: Filesystem Isolation', () => {
  let mockRuntimeA: ContainerRuntime;
  let mockRuntimeB: ContainerRuntime;

  beforeEach(() => {
    mockRuntimeA = createMockRuntime();
    mockRuntimeB = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 受け入れテスト 1.1: 各ワーカーは独自の /workspace を持つ
   *
   * Worker A と Worker B は、それぞれ独立した /workspace ディレクトリを持ち、
   * 互いのファイルシステムにアクセスできない。
   *
   * **Validates: Requirement 5.4**
   * - Worker A SHALL NOT be able to read/write files in Worker B's `/workspace`
   */
  it('各ワーカーは独自の /workspace を持ち、共有ボリュームがない', async () => {
    const containerA = new WorkerContainer(
      { workerId: 'worker-a-fs' },
      mockRuntimeA
    );
    const containerB = new WorkerContainer(
      { workerId: 'worker-b-fs' },
      mockRuntimeB
    );

    await containerA.create();
    await containerB.create();

    // 両方のコンテナの作成オプションを取得
    const callArgsA = vi.mocked(mockRuntimeA.createContainer).mock.calls[0][0];
    const callArgsB = vi.mocked(mockRuntimeB.createContainer).mock.calls[0][0];

    // /workspace への共有ボリュームマウントがないことを確認
    // 共有ボリュームは "host_path:/workspace" の形式で、:ro がないもの
    const sharedWorkspaceVolumeA = callArgsA.volumes?.find(
      (v: string) => v.includes('/workspace') && !v.includes(':ro')
    );
    const sharedWorkspaceVolumeB = callArgsB.volumes?.find(
      (v: string) => v.includes('/workspace') && !v.includes(':ro')
    );

    // 共有ボリュームがないことを確認
    expect(sharedWorkspaceVolumeA).toBeUndefined();
    expect(sharedWorkspaceVolumeB).toBeUndefined();

    // 作業ディレクトリが /workspace に設定されていることを確認
    expect(callArgsA.workDir).toBe(CONTAINER_WORKSPACE_PATH);
    expect(callArgsB.workDir).toBe(CONTAINER_WORKSPACE_PATH);
  });

  /**
   * 受け入れテスト 1.2: リポジトリはコンテナ内にcloneされる
   *
   * リポジトリはホストからのbind mountではなく、コンテナ内にcloneされる。
   * これにより、ワーカー間でファイルシステムが共有されない。
   *
   * **Validates: Requirement 5.3, 5.4**
   * - THE Worker_Container SHALL clone the repository into container-local `/workspace`
   */
  it('リポジトリはコンテナ内にcloneされる（ホストbind mountではない）', async () => {
    const containerA = new WorkerContainer(
      {
        workerId: 'worker-a-git',
        gitRepoUrl: 'https://github.com/example/repo-a.git',
      },
      mockRuntimeA
    );
    const containerB = new WorkerContainer(
      {
        workerId: 'worker-b-git',
        gitRepoUrl: 'https://github.com/example/repo-b.git',
      },
      mockRuntimeB
    );

    await containerA.create();
    await containerB.create();

    const callArgsA = vi.mocked(mockRuntimeA.createContainer).mock.calls[0][0];
    const callArgsB = vi.mocked(mockRuntimeB.createContainer).mock.calls[0][0];

    // GIT_REPO_URL が環境変数として設定される（コンテナ内でclone）
    expect(callArgsA.env?.GIT_REPO_URL).toBe('https://github.com/example/repo-a.git');
    expect(callArgsB.env?.GIT_REPO_URL).toBe('https://github.com/example/repo-b.git');

    // ホストの /workspace へのbind mountがないことを確認
    // bind mountは "host_path:container_path" の形式
    const hostWorkspaceMountA = callArgsA.volumes?.find(
      (v: string) => v.includes('workspace') && !v.includes(':ro') && !v.includes('/results')
    );
    const hostWorkspaceMountB = callArgsB.volumes?.find(
      (v: string) => v.includes('workspace') && !v.includes(':ro') && !v.includes('/results')
    );

    expect(hostWorkspaceMountA).toBeUndefined();
    expect(hostWorkspaceMountB).toBeUndefined();
  });

  /**
   * 受け入れテスト 1.3: 結果ディレクトリのみ読み取り専用で共有
   *
   * runtime/runs/<run-id>/ のみが読み取り専用で共有される。
   * 書き込みは不可。
   *
   * **Validates: Requirement 5.4**
   * - Shared read-only: `runtime/runs/<run-id>/` for result collection only
   */
  it('結果ディレクトリは読み取り専用でマウントされる', async () => {
    const containerA = new WorkerContainer(
      {
        workerId: 'worker-a-results',
        resultsDir: '/host/runtime/runs/run-123',
      },
      mockRuntimeA
    );

    await containerA.create();

    const callArgsA = vi.mocked(mockRuntimeA.createContainer).mock.calls[0][0];

    // 結果ディレクトリが :ro でマウントされていることを確認
    const resultsVolume = callArgsA.volumes?.find((v: string) => v.includes('/results'));
    expect(resultsVolume).toBeDefined();
    expect(resultsVolume).toContain(':ro');
    expect(resultsVolume).toBe('/host/runtime/runs/run-123:/results:ro');
  });

  /**
   * 受け入れテスト 1.4: verifyContainerIsolation でファイルシステム隔離を検証
   *
   * 2つのワーカーコンテナ間のファイルシステム隔離を検証する。
   *
   * **Validates: Requirement 5.4**
   */
  it('verifyContainerIsolation でファイルシステム隔離が検証される', async () => {
    const containerA = createIsolatedWorkerContainer('worker-a-verify');
    const containerB = createIsolatedWorkerContainer('worker-b-verify');

    const result = await verifyContainerIsolation(containerA, containerB);

    expect(result.filesystemIsolated).toBe(true);
    expect(result.errors.filter(e => e.includes('Filesystem'))).toHaveLength(0);
  });
});


// =============================================================================
// 受け入れテスト 2: ネットワーク隔離
// Worker A が Worker B にネットワークパケット送信不可
// =============================================================================

describe('Isolation Acceptance Test: Network Isolation', () => {
  let mockRuntimeA: ContainerRuntime;
  let mockRuntimeB: ContainerRuntime;

  beforeEach(() => {
    mockRuntimeA = createMockRuntime();
    mockRuntimeB = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 受け入れテスト 2.1: デフォルトで networkMode='none' が設定される
   *
   * ワーカーコンテナはデフォルトでネットワーク隔離される。
   * networkMode='none' により、コンテナ間の直接通信が禁止される。
   *
   * **Validates: Requirement 5.4**
   * - Worker A SHALL NOT be able to send network packets directly to Worker B
   * - Network: No inter-container communication except via Agent_Bus
   */
  it('デフォルトで networkMode=none が設定される', async () => {
    const containerA = new WorkerContainer(
      { workerId: 'worker-a-net' },
      mockRuntimeA
    );
    const containerB = new WorkerContainer(
      { workerId: 'worker-b-net' },
      mockRuntimeB
    );

    await containerA.create();
    await containerB.create();

    const callArgsA = vi.mocked(mockRuntimeA.createContainer).mock.calls[0][0];
    const callArgsB = vi.mocked(mockRuntimeB.createContainer).mock.calls[0][0];

    // 両方のコンテナが networkMode='none' であることを確認
    expect(callArgsA.networkMode).toBe('none');
    expect(callArgsB.networkMode).toBe('none');
  });

  /**
   * 受け入れテスト 2.2: 隔離設定でネットワーク隔離が有効
   *
   * getIsolationConfig() で取得した設定が networkMode='none' であることを確認。
   *
   * **Validates: Requirement 5.4**
   */
  it('隔離設定でネットワーク隔離が有効', () => {
    const containerA = createIsolatedWorkerContainer('worker-a-isolated');
    const containerB = createIsolatedWorkerContainer('worker-b-isolated');

    const isolationA = containerA.getIsolationConfig();
    const isolationB = containerB.getIsolationConfig();

    expect(isolationA.networkMode).toBe('none');
    expect(isolationB.networkMode).toBe('none');
  });

  /**
   * 受け入れテスト 2.3: verifyIsolation でネットワーク隔離を検証
   *
   * 単一コンテナのネットワーク隔離を検証する。
   *
   * **Validates: Requirement 5.4**
   */
  it('verifyIsolation でネットワーク隔離が検証される', async () => {
    const container = createIsolatedWorkerContainer('worker-verify-net');

    const result = await container.verifyIsolation();

    expect(result.networkIsolated).toBe(true);
    expect(result.errors.filter(e => e.includes('Network'))).toHaveLength(0);
  });

  /**
   * 受け入れテスト 2.4: verifyContainerIsolation で2コンテナ間のネットワーク隔離を検証
   *
   * 2つのワーカーコンテナ間のネットワーク隔離を検証する。
   *
   * **Validates: Requirement 5.4**
   */
  it('verifyContainerIsolation でネットワーク隔離が検証される', async () => {
    const containerA = createIsolatedWorkerContainer('worker-a-net-verify');
    const containerB = createIsolatedWorkerContainer('worker-b-net-verify');

    const result = await verifyContainerIsolation(containerA, containerB);

    expect(result.networkIsolated).toBe(true);
    expect(result.isolated).toBe(true);
  });

  /**
   * 受け入れテスト 2.5: ネットワーク隔離が無効な場合は検証失敗
   *
   * networkMode が 'none' 以外の場合、検証が失敗することを確認。
   *
   * **Validates: Requirement 5.4**
   */
  it('ネットワーク隔離が無効な場合は検証失敗', async () => {
    const containerA = new WorkerContainer(
      {
        workerId: 'worker-a-bridge',
        isolation: { networkMode: 'bridge' },
      },
      mockRuntimeA
    );
    const containerB = createIsolatedWorkerContainer('worker-b-isolated');

    const result = await verifyContainerIsolation(containerA, containerB);

    expect(result.networkIsolated).toBe(false);
    expect(result.isolated).toBe(false);
    expect(result.errors.some(e => e.includes('Network'))).toBe(true);
  });

  /**
   * 受け入れテスト 2.6: Agent_Bus経由のみ通信可能
   *
   * ワーカー間の通信はAgent_Bus（ファイルベースのメッセージキュー）経由のみ。
   * ネットワーク経由の直接通信は不可。
   *
   * **Validates: Requirement 5.4, 10.7**
   * - Network: No inter-container communication except via Agent_Bus
   * - THE Agent_Bus SHALL NOT require workers to listen on network ports (pull/poll model)
   */
  it('Agent_Bus経由のみ通信可能（ネットワークポート不要）', async () => {
    const container = createIsolatedWorkerContainer('worker-agent-bus');

    await container.create();

    // networkMode='none' により、ネットワークポートを開くことができない
    const isolation = container.getIsolationConfig();
    expect(isolation.networkMode).toBe('none');

    // Agent_Busはファイルベースのメッセージキューを使用するため、
    // ネットワークポートは不要
    // この設計により、ワーカー間の直接通信が物理的に不可能
  });
});


// =============================================================================
// 受け入れテスト 3: ホストファイルシステム隔離
// Worker A がホストファイルシステムにアクセス不可
// =============================================================================

describe('Isolation Acceptance Test: Host Filesystem Isolation', () => {
  let mockRuntime: ContainerRuntime;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 受け入れテスト 3.1: ホストファイルシステムへのアクセス制限
   *
   * ワーカーコンテナは、指定されたパス以外のホストファイルシステムに
   * アクセスできない。
   *
   * **Validates: Requirement 5.4**
   * - Worker A SHALL NOT be able to access host filesystem outside of designated paths
   */
  it('ホストファイルシステムへの直接マウントがない', async () => {
    const container = new WorkerContainer(
      { workerId: 'worker-host-fs' },
      mockRuntime
    );

    await container.create();

    const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];

    // ホストのルートディレクトリや重要なパスへのマウントがないことを確認
    const dangerousMounts = callArgs.volumes?.filter((v: string) => {
      const hostPath = v.split(':')[0];
      // 危険なホストパスのリスト
      const dangerousPaths = [
        '/',
        '/etc',
        '/var',
        '/usr',
        '/home',
        '/root',
        '/bin',
        '/sbin',
        '/lib',
        '/opt',
        '/proc',
        '/sys',
        '/dev',
      ];
      return dangerousPaths.some(p => hostPath === p || hostPath.startsWith(p + '/'));
    });

    // 危険なマウントがないことを確認（結果ディレクトリは除く）
    const nonResultsMounts = dangerousMounts?.filter(
      (v: string) => !v.includes('/results') && !v.includes('/runtime/runs')
    );
    expect(nonResultsMounts).toHaveLength(0);
  });

  /**
   * 受け入れテスト 3.2: 許可されたパスのみマウント可能
   *
   * 結果ディレクトリ（runtime/runs/<run-id>/）のみが読み取り専用でマウントされる。
   *
   * **Validates: Requirement 5.4**
   */
  it('許可されたパス（結果ディレクトリ）のみマウント可能', async () => {
    const container = new WorkerContainer(
      {
        workerId: 'worker-allowed-paths',
        resultsDir: '/host/runtime/runs/run-456',
      },
      mockRuntime
    );

    await container.create();

    const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];

    // マウントされているボリュームを確認
    const volumes = callArgs.volumes || [];

    // 結果ディレクトリのみがマウントされていることを確認
    expect(volumes.length).toBeLessThanOrEqual(1);
    if (volumes.length > 0) {
      expect(volumes[0]).toContain('/results');
      expect(volumes[0]).toContain(':ro');
    }
  });

  /**
   * 受け入れテスト 3.3: セキュリティオプションによるホストアクセス制限
   *
   * no-new-privileges と cap-drop=ALL により、
   * ホストファイルシステムへの不正アクセスを防止。
   *
   * **Validates: Requirement 5.4**
   */
  it('セキュリティオプションでホストアクセスが制限される', async () => {
    const container = createIsolatedWorkerContainer('worker-security');

    await container.create();

    const isolation = container.getIsolationConfig();

    // 特権昇格の禁止
    expect(isolation.noNewPrivileges).toBe(true);

    // 全てのcapabilitiesを削除
    expect(isolation.dropAllCapabilities).toBe(true);
  });

  /**
   * 受け入れテスト 3.4: verifyIsolation でセキュリティオプションを検証
   *
   * **Validates: Requirement 5.4**
   */
  it('verifyIsolation でセキュリティオプションが検証される', async () => {
    const container = createIsolatedWorkerContainer('worker-verify-security');

    const result = await container.verifyIsolation();

    expect(result.securityOptionsCorrect).toBe(true);
    expect(result.valid).toBe(true);
  });

  /**
   * 受け入れテスト 3.5: セキュリティオプションが無効な場合は検証失敗
   *
   * **Validates: Requirement 5.4**
   */
  it('セキュリティオプションが無効な場合は検証失敗', async () => {
    const container = new WorkerContainer(
      {
        workerId: 'worker-insecure',
        isolation: {
          noNewPrivileges: false,
          dropAllCapabilities: false,
        },
      },
      mockRuntime
    );

    const result = await container.verifyIsolation();

    expect(result.securityOptionsCorrect).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  /**
   * 受け入れテスト 3.6: プロセス数制限によるリソース保護
   *
   * pids-limit により、フォーク爆弾などのDoS攻撃を防止。
   *
   * **Validates: Requirement 5.4**
   */
  it('プロセス数制限が設定される', async () => {
    const container = new WorkerContainer(
      { workerId: 'worker-pids-limit' },
      mockRuntime
    );

    await container.create();

    const callArgs = vi.mocked(mockRuntime.createContainer).mock.calls[0][0];

    // pids-limit オプションが設定されていることを確認
    const pidsLimitOption = callArgs.additionalOptions?.find((opt: string) =>
      opt.includes('--pids-limit')
    );
    expect(pidsLimitOption).toBeDefined();
  });
});


// =============================================================================
// 受け入れテスト 4: DoD使用時のコンテナ生成制限
// DoD使用時、他ワーカーに影響するコンテナ生成不可
// =============================================================================

describe('Isolation Acceptance Test: DoD Container Spawn Restriction', () => {
  /**
   * 受け入れテスト 4.1: docker.sock アクセスは allowlist で制限
   *
   * DoD使用時、ワーカーが実行可能なDockerコマンドは allowlist で制限される。
   * 許可されたコマンド: run, stop, rm, logs, inspect のみ
   *
   * **Validates: Requirement 5.9**
   * - WHEN using DoD, THE System SHALL restrict docker.sock access to allowlisted commands only
   */
  it('許可されたDockerコマンドのみ実行可能', () => {
    // DEFAULT_ALLOWED_DOCKER_COMMANDS を確認
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('run');
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('stop');
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('rm');
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('logs');
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('inspect');

    // 危険なコマンドが含まれていないことを確認
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('exec');
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('cp');
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('network');
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('volume');
  });

  /**
   * 受け入れテスト 4.2: ContainerRuntime で allowlist 検証
   *
   * ContainerRuntime.validateDockerCommand() で、
   * allowlist 外のコマンドが拒否されることを確認。
   *
   * **Validates: Requirement 5.9, Property 30**
   */
  it('ContainerRuntime で allowlist 外のコマンドが拒否される', () => {
    const runtime = new ContainerRuntime({ type: 'dod' });

    // 許可されたコマンド
    expect(runtime.validateDockerCommand('docker run -d nginx').valid).toBe(true);
    expect(runtime.validateDockerCommand('docker stop container-id').valid).toBe(true);
    expect(runtime.validateDockerCommand('docker rm container-id').valid).toBe(true);
    expect(runtime.validateDockerCommand('docker logs container-id').valid).toBe(true);
    expect(runtime.validateDockerCommand('docker inspect container-id').valid).toBe(true);

    // 拒否されるコマンド
    expect(runtime.validateDockerCommand('docker exec container-id bash').valid).toBe(false);
    expect(runtime.validateDockerCommand('docker cp file container-id:/path').valid).toBe(false);
    expect(runtime.validateDockerCommand('docker network create mynet').valid).toBe(false);
    expect(runtime.validateDockerCommand('docker volume create myvol').valid).toBe(false);
  });

  /**
   * 受け入れテスト 4.3: 危険なコマンドは常に拒否
   *
   * exec, cp, network, volume などの危険なコマンドは、
   * allowlist に追加しても拒否される。
   *
   * **Validates: Requirement 5.9**
   */
  it('危険なコマンドは常に拒否される', () => {
    // allowlist に危険なコマンドを追加しても拒否される
    const runtime = new ContainerRuntime({
      type: 'dod',
      allowedCommands: ['run', 'stop', 'exec', 'cp', 'network'],
    });

    // 危険なコマンドは拒否される
    expect(runtime.validateDockerCommand('docker exec container-id bash').valid).toBe(false);
    expect(runtime.validateDockerCommand('docker cp file container-id:/path').valid).toBe(false);
    expect(runtime.validateDockerCommand('docker network create mynet').valid).toBe(false);
  });

  /**
   * 受け入れテスト 4.4: isCommandAllowed で個別コマンドを検証
   *
   * **Validates: Requirement 5.9**
   */
  it('isCommandAllowed で個別コマンドを検証できる', () => {
    const runtime = new ContainerRuntime({ type: 'dod' });

    // 許可されたコマンド
    expect(runtime.isCommandAllowed('run')).toBe(true);
    expect(runtime.isCommandAllowed('stop')).toBe(true);
    expect(runtime.isCommandAllowed('rm')).toBe(true);
    expect(runtime.isCommandAllowed('logs')).toBe(true);
    expect(runtime.isCommandAllowed('inspect')).toBe(true);

    // 拒否されるコマンド
    expect(runtime.isCommandAllowed('exec')).toBe(false);
    expect(runtime.isCommandAllowed('cp')).toBe(false);
    expect(runtime.isCommandAllowed('network')).toBe(false);
    expect(runtime.isCommandAllowed('volume')).toBe(false);
    expect(runtime.isCommandAllowed('build')).toBe(false);
    expect(runtime.isCommandAllowed('push')).toBe(false);
    expect(runtime.isCommandAllowed('pull')).toBe(false);
  });

  /**
   * 受け入れテスト 4.5: DoD以外のランタイムでは検証をスキップ
   *
   * Rootless や DIND では、allowlist 検証をスキップする。
   *
   * **Validates: Requirement 5.9**
   */
  it('DoD以外のランタイムでは検証をスキップ', () => {
    const rootlessRuntime = new ContainerRuntime({ type: 'rootless' });
    const dindRuntime = new ContainerRuntime({ type: 'dind' });

    // Rootless では全てのコマンドが許可される
    expect(rootlessRuntime.validateDockerCommand('docker exec container-id bash').valid).toBe(true);
    expect(rootlessRuntime.isCommandAllowed('exec')).toBe(true);

    // DIND では全てのコマンドが許可される
    expect(dindRuntime.validateDockerCommand('docker exec container-id bash').valid).toBe(true);
    expect(dindRuntime.isCommandAllowed('exec')).toBe(true);
  });

  /**
   * 受け入れテスト 4.6: 他ワーカーに影響するコンテナ操作の防止
   *
   * exec コマンドが拒否されることで、他ワーカーのコンテナに
   * コマンドを実行することができない。
   *
   * **Validates: Requirement 5.4**
   * - Worker A SHALL NOT be able to spawn containers affecting other workers (when using DoD)
   */
  it('他ワーカーのコンテナへの exec が拒否される', () => {
    const runtime = new ContainerRuntime({ type: 'dod' });

    // 他ワーカーのコンテナに exec しようとしても拒否される
    const result = runtime.validateDockerCommand(
      'docker exec agentcompany-worker-worker-b-12345 cat /workspace/secret.txt'
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed');
    expect(result.detectedCommand).toBe('exec');
  });

  /**
   * 受け入れテスト 4.7: ネットワーク操作の防止
   *
   * network コマンドが拒否されることで、ワーカー間の
   * ネットワーク接続を作成することができない。
   *
   * **Validates: Requirement 5.4**
   */
  it('ネットワーク操作が拒否される', () => {
    const runtime = new ContainerRuntime({ type: 'dod' });

    // ネットワーク作成が拒否される
    expect(runtime.validateDockerCommand('docker network create worker-net').valid).toBe(false);

    // ネットワーク接続が拒否される
    expect(runtime.validateDockerCommand('docker network connect worker-net container-id').valid).toBe(false);
  });

  /**
   * 受け入れテスト 4.8: ボリューム操作の防止
   *
   * volume コマンドが拒否されることで、ワーカー間で
   * 共有ボリュームを作成することができない。
   *
   * **Validates: Requirement 5.4**
   */
  it('ボリューム操作が拒否される', () => {
    const runtime = new ContainerRuntime({ type: 'dod' });

    // ボリューム作成が拒否される
    expect(runtime.validateDockerCommand('docker volume create shared-vol').valid).toBe(false);
  });
});


// =============================================================================
// 統合受け入れテスト: 全隔離条件の検証
// =============================================================================

describe('Isolation Acceptance Test: Comprehensive Verification', () => {
  let mockRuntimeA: ContainerRuntime;
  let mockRuntimeB: ContainerRuntime;

  beforeEach(() => {
    mockRuntimeA = createMockRuntime();
    mockRuntimeB = createMockRuntime();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 統合テスト: 全ての隔離条件を満たすコンテナ設定
   *
   * createIsolatedWorkerContainer() で作成されたコンテナが、
   * 全ての隔離条件を満たすことを確認。
   *
   * **Validates: Requirement 5.4 (All Isolation Acceptance Test Criteria)**
   */
  it('createIsolatedWorkerContainer で全隔離条件を満たす', async () => {
    const containerA = createIsolatedWorkerContainer('worker-a-full');
    const containerB = createIsolatedWorkerContainer('worker-b-full');

    // 個別の隔離検証
    const isolationA = await containerA.verifyIsolation();
    const isolationB = await containerB.verifyIsolation();

    // 両方のコンテナが全ての隔離条件を満たす
    expect(isolationA.valid).toBe(true);
    expect(isolationA.networkIsolated).toBe(true);
    expect(isolationA.filesystemIsolated).toBe(true);
    expect(isolationA.securityOptionsCorrect).toBe(true);

    expect(isolationB.valid).toBe(true);
    expect(isolationB.networkIsolated).toBe(true);
    expect(isolationB.filesystemIsolated).toBe(true);
    expect(isolationB.securityOptionsCorrect).toBe(true);

    // 2コンテナ間の隔離検証
    const crossIsolation = await verifyContainerIsolation(containerA, containerB);
    expect(crossIsolation.isolated).toBe(true);
    expect(crossIsolation.networkIsolated).toBe(true);
    expect(crossIsolation.filesystemIsolated).toBe(true);
    expect(crossIsolation.errors).toHaveLength(0);
  });

  /**
   * 統合テスト: 隔離設定の詳細確認
   *
   * **Validates: Requirement 5.4**
   */
  it('隔離設定の詳細が正しく設定される', async () => {
    const container = createIsolatedWorkerContainer('worker-detail');
    const isolation = container.getIsolationConfig();

    // ネットワーク隔離
    expect(isolation.networkMode).toBe('none');

    // セキュリティオプション
    expect(isolation.noNewPrivileges).toBe(true);
    expect(isolation.dropAllCapabilities).toBe(true);

    // プロセス数制限
    expect(isolation.pidsLimit).toBeGreaterThan(0);

    // tmpfsマウント
    expect(isolation.tmpfsMounts).toContain('/tmp');
    expect(isolation.tmpfsMounts).toContain('/var/tmp');
  });

  /**
   * 統合テスト: コンテナ作成オプションの検証
   *
   * **Validates: Requirement 5.4**
   */
  it('コンテナ作成オプションが正しく設定される', async () => {
    const container = new WorkerContainer(
      {
        workerId: 'worker-options',
        resultsDir: '/host/runtime/runs/run-789',
        gitRepoUrl: 'https://github.com/example/repo.git',
        gitBranch: 'main',
      },
      mockRuntimeA
    );

    await container.create();

    const callArgs = vi.mocked(mockRuntimeA.createContainer).mock.calls[0][0];

    // ネットワーク隔離
    expect(callArgs.networkMode).toBe('none');

    // 作業ディレクトリ
    expect(callArgs.workDir).toBe(CONTAINER_WORKSPACE_PATH);

    // 環境変数
    expect(callArgs.env?.GIT_REPO_URL).toBe('https://github.com/example/repo.git');
    expect(callArgs.env?.GIT_BRANCH).toBe('main');
    expect(callArgs.env?.WORKSPACE_PATH).toBe(CONTAINER_WORKSPACE_PATH);

    // ボリューム（結果ディレクトリのみ、読み取り専用）
    expect(callArgs.volumes).toContain('/host/runtime/runs/run-789:/results:ro');

    // セキュリティオプション
    expect(callArgs.additionalOptions).toContain('--security-opt=no-new-privileges:true');
    expect(callArgs.additionalOptions).toContain('--cap-drop=ALL');
    expect(callArgs.additionalOptions?.some((opt: string) => opt.includes('--pids-limit'))).toBe(true);
    expect(callArgs.additionalOptions?.some((opt: string) => opt.includes('--tmpfs=/tmp'))).toBe(true);
    expect(callArgs.additionalOptions?.some((opt: string) => opt.includes('--tmpfs=/var/tmp'))).toBe(true);
  });

  /**
   * 統合テスト: 複数ワーカーの同時実行シナリオ
   *
   * 複数のワーカーが同時に実行される場合でも、
   * 各ワーカーが完全に隔離されることを確認。
   *
   * **Validates: Requirement 5.4**
   */
  it('複数ワーカーの同時実行でも隔離が維持される', async () => {
    const workers = [
      createIsolatedWorkerContainer('worker-1'),
      createIsolatedWorkerContainer('worker-2'),
      createIsolatedWorkerContainer('worker-3'),
    ];

    // 全てのワーカーが隔離条件を満たす
    for (const worker of workers) {
      const isolation = await worker.verifyIsolation();
      expect(isolation.valid).toBe(true);
    }

    // 全てのペアで隔離が維持される
    for (let i = 0; i < workers.length; i++) {
      for (let j = i + 1; j < workers.length; j++) {
        const result = await verifyContainerIsolation(workers[i], workers[j]);
        expect(result.isolated).toBe(true);
      }
    }
  });
});

// =============================================================================
// 受け入れテスト基準のサマリー
// =============================================================================

describe('Isolation Acceptance Test Criteria Summary', () => {
  /**
   * 受け入れテスト基準のドキュメント
   *
   * このテストスイートは、Requirement 5.4 の Isolation Acceptance Test Criteria を
   * 検証するために設計されています。
   *
   * ## 検証項目
   *
   * 1. **ファイルシステム隔離**
   *    - Worker A が Worker B の `/workspace` にアクセス不可
   *    - 各ワーカーは独自の `/workspace` を持つ
   *    - リポジトリはコンテナ内にclone（ホストbind mountではない）
   *    - 結果ディレクトリのみ読み取り専用で共有
   *
   * 2. **ネットワーク隔離**
   *    - Worker A が Worker B にネットワークパケット送信不可
   *    - networkMode='none' でコンテナ間通信を禁止
   *    - Agent_Bus経由のみ通信可能（ファイルベースのメッセージキュー）
   *
   * 3. **ホストファイルシステム隔離**
   *    - Worker A がホストファイルシステムにアクセス不可
   *    - 指定されたパス以外へのアクセスが制限
   *    - セキュリティオプション（no-new-privileges, cap-drop=ALL）
   *
   * 4. **DoD使用時のコンテナ生成制限**
   *    - DoD使用時、他ワーカーに影響するコンテナ生成不可
   *    - docker.sock アクセスは allowlist で制限
   *    - 許可コマンド: run, stop, rm, logs, inspect のみ
   */
  it('全ての受け入れテスト基準が定義されている', () => {
    // このテストは、受け入れテスト基準のドキュメントとして機能
    const criteria = [
      'Worker A SHALL NOT be able to read/write files in Worker B\'s `/workspace`',
      'Worker A SHALL NOT be able to send network packets directly to Worker B',
      'Worker A SHALL NOT be able to access host filesystem outside of designated paths',
      'Worker A SHALL NOT be able to spawn containers affecting other workers (when using DoD)',
    ];

    // 全ての基準が定義されていることを確認
    expect(criteria.length).toBe(4);
  });
});
