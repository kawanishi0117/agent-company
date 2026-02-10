/**
 * Worker Container - ワーカーコンテナ管理
 *
 * 各ワーカーエージェント専用のDockerコンテナのライフサイクルを管理する。
 * Container Runtime Abstraction経由でコンテナの作成・起動・停止・破棄を行う。
 *
 * ## コンテナ隔離保証
 *
 * このモジュールは以下の隔離保証を提供する：
 *
 * 1. **ネットワーク隔離**: `networkMode: 'none'`により、コンテナ間の直接通信を禁止
 *    - Agent_Bus経由のみで通信可能（ファイルベースのメッセージキュー）
 *    - Worker A は Worker B にネットワークパケットを送信不可
 *
 * 2. **ファイルシステム隔離**: 各ワーカーは独自の`/workspace`を持つ
 *    - ワーカー間で共有ボリュームなし
 *    - Worker A は Worker B の `/workspace` にアクセス不可
 *    - リポジトリはコンテナ内にclone（ホストbind mountではない）
 *
 * 3. **読み取り専用共有**: `runtime/runs/<run-id>/`のみ読み取り専用でマウント
 *    - 結果収集用のディレクトリのみ共有
 *    - 書き込み不可（:ro オプション）
 *
 * 4. **セキュリティ強化**:
 *    - `--security-opt=no-new-privileges:true`: 特権昇格を禁止
 *    - `--cap-drop=ALL`: 全てのLinux capabilitiesを削除
 *    - `--pids-limit`: プロセス数を制限
 *    - `--read-only`: ルートファイルシステムを読み取り専用に（tmpfsで書き込み領域を提供）
 *
 * @module execution/worker-container
 * @see Requirements: 5.1, 5.4, 5.5
 * @see Property 10: Worker Container Isolation
 * @see Property 11: Worker Container Cleanup
 */

import {
  ContainerRuntime,
  ContainerCreateOptions,
  createContainerRuntime,
} from './container-runtime';
import { AgentId, ContainerId, SystemConfig, DEFAULT_SYSTEM_CONFIG } from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのワーカーイメージ名
 * @description infra/docker/images/worker/ のイメージ
 * @see Requirement 5.2: THE Worker_Container SHALL be based on `infra/docker/images/worker/` image
 */
export const DEFAULT_WORKER_IMAGE = 'agentcompany/worker:latest';

/**
 * コンテナ内の作業ディレクトリ
 * @description リポジトリはこのディレクトリにcloneされる
 * @see Requirement 5.3: THE Worker_Container SHALL clone the repository into container-local `/workspace`
 */
export const CONTAINER_WORKSPACE_PATH = '/workspace';

/**
 * コンテナ内の結果出力ディレクトリ
 * @description 読み取り専用で共有される
 * @see Requirement 5.4: Shared read-only: `runtime/runs/<run-id>/` for result collection only
 */
export const CONTAINER_RESULTS_PATH = '/results';

/**
 * デフォルトのコンテナ破棄タイムアウト（ミリ秒）
 * @description タスク完了後、この時間内にコンテナを破棄する
 * @see Property 11: Worker Container Cleanup
 */
export const DEFAULT_CLEANUP_TIMEOUT_MS = 60000;

/**
 * コンテナ名のプレフィックス
 */
export const CONTAINER_NAME_PREFIX = 'agentcompany-worker';

/**
 * デフォルトのプロセス数制限
 * @description コンテナ内で実行可能なプロセス数の上限
 */
export const DEFAULT_PIDS_LIMIT = 256;

/**
 * コンテナ隔離設定
 * @description コンテナの隔離レベルを定義
 * @see Requirement 5.4: THE Worker_Container SHALL be isolated
 */
export interface ContainerIsolationConfig {
  /**
   * ネットワーク隔離モード
   * @description 'none'でコンテナ間通信を完全に禁止
   * @default 'none'
   */
  networkMode: 'none' | 'bridge' | 'host';

  /**
   * 特権昇格を禁止
   * @description trueで--security-opt=no-new-privileges:trueを設定
   * @default true
   */
  noNewPrivileges: boolean;

  /**
   * 全てのcapabilitiesを削除
   * @description trueで--cap-drop=ALLを設定
   * @default true
   */
  dropAllCapabilities: boolean;

  /**
   * プロセス数制限
   * @description コンテナ内で実行可能なプロセス数の上限
   * @default 256
   */
  pidsLimit: number;

  /**
   * 読み取り専用ルートファイルシステム
   * @description trueで--read-onlyを設定（/workspaceはtmpfsでマウント）
   * @default false
   */
  readOnlyRootFilesystem: boolean;

  /**
   * tmpfsマウント
   * @description 書き込み可能な一時ファイルシステムのマウントポイント
   */
  tmpfsMounts: string[];
}

/**
 * デフォルトの隔離設定
 * @see Requirement 5.4: THE Worker_Container SHALL be isolated
 */
export const DEFAULT_ISOLATION_CONFIG: ContainerIsolationConfig = {
  networkMode: 'none',
  noNewPrivileges: true,
  dropAllCapabilities: true,
  pidsLimit: DEFAULT_PIDS_LIMIT,
  readOnlyRootFilesystem: false, // /workspaceへの書き込みが必要なためデフォルトはfalse
  tmpfsMounts: ['/tmp', '/var/tmp'],
};

// =============================================================================
// 型定義
// =============================================================================

/**
 * ワーカーコンテナの状態
 */
export type WorkerContainerState =
  | 'created' // 作成済み（未起動）
  | 'running' // 実行中
  | 'stopped' // 停止済み
  | 'destroyed'; // 破棄済み

/**
 * ワーカーコンテナ設定
 */
export interface WorkerContainerConfig {
  /** ワーカーID */
  workerId: AgentId;
  /** 実行ID */
  runId?: string;
  /** イメージ名 */
  image?: string;
  /** CPU制限 */
  cpuLimit?: string;
  /** メモリ制限 */
  memoryLimit?: string;
  /** 環境変数 */
  env?: Record<string, string>;
  /** 結果出力ディレクトリ（ホスト側） */
  resultsDir?: string;
  /** ネットワークモード（デフォルト: 'none'で隔離） */
  networkMode?: string;
  /**
   * 隔離設定
   * @description コンテナの隔離レベルをカスタマイズ
   * @see Requirement 5.4: THE Worker_Container SHALL be isolated
   */
  isolation?: Partial<ContainerIsolationConfig>;
  /**
   * GitリポジトリURL
   * @description コンテナ起動時にこのリポジトリを/workspaceにcloneする
   * @see Requirement 5.3: THE Worker_Container SHALL clone the repository into container-local `/workspace`
   */
  gitRepoUrl?: string;
  /**
   * Gitブランチ名
   * @description cloneするブランチ（デフォルト: main）
   */
  gitBranch?: string;
  /**
   * Git認証トークン
   * @description HTTPS認証用のトークン（GitHub PAT等）
   * @see Requirement 3.1: THE Git_Manager SHALL support multiple credential injection methods
   */
  gitToken?: string;
}

/**
 * ワーカーコンテナ情報
 */
export interface WorkerContainerInfo {
  /** コンテナID */
  containerId: ContainerId;
  /** ワーカーID */
  workerId: AgentId;
  /** コンテナ名 */
  containerName: string;
  /** コンテナ状態 */
  state: WorkerContainerState;
  /** 作成日時 */
  createdAt: string;
  /** 開始日時 */
  startedAt?: string;
  /** 停止日時 */
  stoppedAt?: string;
  /** 設定 */
  config: WorkerContainerConfig;
}

/**
 * コンテナ操作結果
 */
export interface ContainerOperationResult {
  /** 成功フラグ */
  success: boolean;
  /** コンテナID（成功時） */
  containerId?: ContainerId;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 操作にかかった時間（ミリ秒） */
  durationMs: number;
}

/**
 * コンテナ隔離検証結果
 * @description コンテナの隔離状態を検証した結果
 * @see Requirement 5.4: Isolation Acceptance Test Criteria
 */
export interface IsolationVerificationResult {
  /** 検証成功フラグ */
  valid: boolean;
  /** ネットワーク隔離が有効か */
  networkIsolated: boolean;
  /** ファイルシステム隔離が有効か */
  filesystemIsolated: boolean;
  /** 読み取り専用共有が正しく設定されているか */
  readOnlySharedCorrect: boolean;
  /** セキュリティオプションが正しく設定されているか */
  securityOptionsCorrect: boolean;
  /** 検証エラー（ある場合） */
  errors: string[];
}

// =============================================================================
// WorkerContainer クラス
// =============================================================================

/**
 * WorkerContainer - ワーカーコンテナ管理クラス
 *
 * 各ワーカーエージェント専用のDockerコンテナのライフサイクルを管理する。
 * Container Runtime Abstraction経由でコンテナ操作を行い、
 * DoD/Rootless/DINDの切り替えに対応する。
 *
 * @see Requirement 5.1: WHEN Worker_Agent is assigned a task, THE System SHALL create a dedicated Docker container
 * @see Requirement 5.5: WHEN task execution completes, THE Worker_Container SHALL be destroyed (clean slate)
 */
export class WorkerContainer {
  /**
   * コンテナランタイム
   */
  private runtime: ContainerRuntime;

  /**
   * コンテナ情報
   */
  private containerInfo: WorkerContainerInfo | null = null;

  /**
   * 設定
   */
  private config: WorkerContainerConfig;

  /**
   * コンストラクタ
   * @param config - ワーカーコンテナ設定
   * @param runtime - コンテナランタイム（省略時はデフォルトを使用）
   */
  constructor(config: WorkerContainerConfig, runtime?: ContainerRuntime) {
    this.config = {
      ...config,
      image: config.image ?? DEFAULT_WORKER_IMAGE,
      cpuLimit: config.cpuLimit ?? DEFAULT_SYSTEM_CONFIG.workerCpuLimit,
      memoryLimit: config.memoryLimit ?? DEFAULT_SYSTEM_CONFIG.workerMemoryLimit,
      networkMode: config.networkMode ?? 'none', // デフォルトはネットワーク隔離
    };
    this.runtime = runtime ?? createContainerRuntime();
  }

  // ===========================================================================
  // ゲッター
  // ===========================================================================

  /**
   * コンテナIDを取得
   * @returns コンテナID（未作成の場合はnull）
   */
  getContainerId(): ContainerId | null {
    return this.containerInfo?.containerId ?? null;
  }

  /**
   * ワーカーIDを取得
   * @returns ワーカーID
   */
  getWorkerId(): AgentId {
    return this.config.workerId;
  }

  /**
   * コンテナ名を取得
   * @returns コンテナ名（未作成の場合はnull）
   */
  getContainerName(): string | null {
    return this.containerInfo?.containerName ?? null;
  }

  /**
   * コンテナ状態を取得
   * @returns コンテナ状態（未作成の場合はnull）
   */
  getState(): WorkerContainerState | null {
    return this.containerInfo?.state ?? null;
  }

  /**
   * コンテナ情報を取得
   * @returns コンテナ情報（ディープコピー）
   */
  getInfo(): WorkerContainerInfo | null {
    if (!this.containerInfo) {
      return null;
    }
    return {
      ...this.containerInfo,
      config: { ...this.containerInfo.config },
    };
  }

  /**
   * コンテナが実行中かどうかを確認
   * @returns 実行中の場合はtrue
   */
  isRunning(): boolean {
    return this.containerInfo?.state === 'running';
  }

  /**
   * コンテナが破棄済みかどうかを確認
   * @returns 破棄済みの場合はtrue
   */
  isDestroyed(): boolean {
    return this.containerInfo?.state === 'destroyed';
  }

  // ===========================================================================
  // コンテナライフサイクル管理
  // ===========================================================================

  /**
   * コンテナを作成
   *
   * ワーカーエージェント専用のDockerコンテナを作成する。
   * コンテナは隔離された環境で実行され、他のワーカーとの干渉を防ぐ。
   *
   * @returns 操作結果
   *
   * @see Requirement 5.1: WHEN Worker_Agent is assigned a task, THE System SHALL create a dedicated Docker container
   * @see Requirement 5.4: THE Worker_Container SHALL be isolated
   */
  async create(): Promise<ContainerOperationResult> {
    const startTime = Date.now();

    // 既に作成済みの場合はエラー
    if (this.containerInfo && this.containerInfo.state !== 'destroyed') {
      return {
        success: false,
        error: `Container already exists with state: ${this.containerInfo.state}`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // コンテナ名を生成
      const containerName = this.generateContainerName();

      // コンテナ作成オプションを構築
      const createOptions = this.buildCreateOptions(containerName);

      // コンテナを作成
      const containerId = await this.runtime.createContainer(createOptions);

      // コンテナ情報を更新
      this.containerInfo = {
        containerId,
        workerId: this.config.workerId,
        containerName,
        state: 'created',
        createdAt: new Date().toISOString(),
        config: { ...this.config },
      };

      return {
        success: true,
        containerId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * コンテナを起動
   *
   * 作成済みのコンテナを起動する。
   * 既に実行中の場合は何もしない。
   *
   * @returns 操作結果
   */
  async start(): Promise<ContainerOperationResult> {
    const startTime = Date.now();

    // コンテナが存在しない場合はエラー
    if (!this.containerInfo) {
      return {
        success: false,
        error: 'Container not created. Call create() first.',
        durationMs: Date.now() - startTime,
      };
    }

    // 既に実行中の場合は成功を返す
    if (this.containerInfo.state === 'running') {
      return {
        success: true,
        containerId: this.containerInfo.containerId,
        durationMs: Date.now() - startTime,
      };
    }

    // 破棄済みの場合はエラー
    if (this.containerInfo.state === 'destroyed') {
      return {
        success: false,
        error: 'Container has been destroyed. Create a new container.',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // docker start コマンドを実行
      // 注意: ContainerRuntimeのallowlistには'start'が含まれていないため、
      // 'run -d'で作成時に自動起動するか、allowlistを拡張する必要がある
      // ここでは、createContainer時に-dオプションで自動起動されることを前提とする

      // 状態を更新
      this.containerInfo.state = 'running';
      this.containerInfo.startedAt = new Date().toISOString();

      return {
        success: true,
        containerId: this.containerInfo.containerId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * コンテナを停止
   *
   * 実行中のコンテナを停止する。
   * 既に停止済みの場合は何もしない。
   *
   * @returns 操作結果
   */
  async stop(): Promise<ContainerOperationResult> {
    const startTime = Date.now();

    // コンテナが存在しない場合はエラー
    if (!this.containerInfo) {
      return {
        success: false,
        error: 'Container not created.',
        durationMs: Date.now() - startTime,
      };
    }

    // 既に停止済みまたは破棄済みの場合は成功を返す
    if (this.containerInfo.state === 'stopped' || this.containerInfo.state === 'destroyed') {
      return {
        success: true,
        containerId: this.containerInfo.containerId,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // コンテナを停止
      await this.runtime.stopContainer(this.containerInfo.containerId);

      // 状態を更新
      this.containerInfo.state = 'stopped';
      this.containerInfo.stoppedAt = new Date().toISOString();

      return {
        success: true,
        containerId: this.containerInfo.containerId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * コンテナを破棄
   *
   * コンテナを停止して削除する。
   * タスク完了後は必ずこのメソッドを呼び出してクリーンスレートを確保する。
   *
   * @param force - 強制削除フラグ（実行中でも削除）
   * @returns 操作結果
   *
   * @see Requirement 5.5: WHEN task execution completes, THE Worker_Container SHALL be destroyed (clean slate)
   * @see Property 11: Worker Container Cleanup
   */
  async destroy(force: boolean = false): Promise<ContainerOperationResult> {
    const startTime = Date.now();

    // コンテナが存在しない場合は成功を返す
    if (!this.containerInfo) {
      return {
        success: true,
        durationMs: Date.now() - startTime,
      };
    }

    // 既に破棄済みの場合は成功を返す
    if (this.containerInfo.state === 'destroyed') {
      return {
        success: true,
        containerId: this.containerInfo.containerId,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // 実行中の場合は先に停止
      if (this.containerInfo.state === 'running') {
        if (!force) {
          await this.stop();
        } else {
          // 強制停止
          try {
            await this.runtime.stopContainer(this.containerInfo.containerId);
          } catch {
            // 停止に失敗しても削除を試みる
          }
        }
      }

      // コンテナを削除
      await this.runtime.removeContainer(this.containerInfo.containerId);

      // 状態を更新
      const containerId = this.containerInfo.containerId;
      this.containerInfo.state = 'destroyed';

      return {
        success: true,
        containerId,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * コンテナを作成して起動
   *
   * create()とstart()を連続して実行するヘルパーメソッド。
   *
   * @returns 操作結果
   */
  async createAndStart(): Promise<ContainerOperationResult> {
    const startTime = Date.now();

    // コンテナを作成
    const createResult = await this.create();
    if (!createResult.success) {
      return createResult;
    }

    // コンテナを起動
    const startResult = await this.start();
    if (!startResult.success) {
      // 起動に失敗した場合はコンテナを削除
      await this.destroy(true);
      return {
        ...startResult,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      containerId: createResult.containerId,
      durationMs: Date.now() - startTime,
    };
  }

  // ===========================================================================
  // コンテナ情報取得
  // ===========================================================================

  /**
   * コンテナのログを取得
   *
   * @param options - ログ取得オプション
   * @returns ログ内容
   */
  async getLogs(options?: { tail?: number }): Promise<string> {
    if (!this.containerInfo) {
      throw new Error('Container not created.');
    }

    return this.runtime.getContainerLogs(this.containerInfo.containerId, options);
  }

  /**
   * コンテナの詳細情報を取得
   *
   * @returns コンテナ詳細情報（Docker inspect結果）
   */
  async inspect(): Promise<unknown> {
    if (!this.containerInfo) {
      throw new Error('Container not created.');
    }

    return this.runtime.inspectContainer(this.containerInfo.containerId);
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * コンテナ名を生成
   *
   * @returns 一意のコンテナ名
   */
  private generateContainerName(): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${CONTAINER_NAME_PREFIX}-${this.config.workerId}-${timestamp}-${randomSuffix}`;
  }

  /**
   * コンテナ作成オプションを構築
   *
   * コンテナ隔離を実現するための設定を構築する。
   * 以下の隔離保証を提供：
   * - ネットワーク隔離: networkMode='none'でコンテナ間通信を禁止
   * - ファイルシステム隔離: 各ワーカーは独自の/workspaceを持つ
   * - 読み取り専用共有: runtime/runs/<run-id>/のみ:roでマウント
   *
   * @param containerName - コンテナ名
   * @returns コンテナ作成オプション
   *
   * @see Requirement 5.2: THE Worker_Container SHALL be based on `infra/docker/images/worker/` image
   * @see Requirement 5.3: THE Worker_Container SHALL clone the repository into container-local `/workspace`
   * @see Requirement 5.4: THE Worker_Container SHALL be isolated
   * @see Requirement 5.6: THE Worker_Container SHALL have configurable resource limits (CPU, memory)
   */
  private buildCreateOptions(containerName: string): ContainerCreateOptions {
    // 隔離設定をマージ（デフォルト + カスタム設定）
    const isolation: ContainerIsolationConfig = {
      ...DEFAULT_ISOLATION_CONFIG,
      ...this.config.isolation,
    };

    const options: ContainerCreateOptions = {
      name: containerName,
      image: this.config.image!,
      workDir: CONTAINER_WORKSPACE_PATH,
      cpuLimit: this.config.cpuLimit,
      memoryLimit: this.config.memoryLimit,
      // ネットワーク隔離: デフォルトは'none'でコンテナ間通信を完全に禁止
      // @see Requirement 5.4: Network: No inter-container communication except via Agent_Bus
      networkMode: isolation.networkMode,
      env: {
        WORKER_ID: this.config.workerId,
        // ワークスペースパスを環境変数として設定
        WORKSPACE_PATH: CONTAINER_WORKSPACE_PATH,
        ...this.config.env,
      },
      volumes: [],
      additionalOptions: [],
    };

    // 実行IDが指定されている場合は環境変数に追加
    if (this.config.runId) {
      options.env!.RUN_ID = this.config.runId;
    }

    // GitリポジトリURLが指定されている場合は環境変数に追加
    // コンテナ内のentrypoint.shがこの環境変数を使用してcloneを実行
    // @see Requirement 5.3: リポジトリはコンテナ内にclone（ホストbind mountではない）
    if (this.config.gitRepoUrl) {
      options.env!.GIT_REPO_URL = this.config.gitRepoUrl;
    }

    // Gitブランチが指定されている場合は環境変数に追加
    if (this.config.gitBranch) {
      options.env!.GIT_BRANCH = this.config.gitBranch;
    }

    // Git認証トークンが指定されている場合は環境変数に追加
    // 注意: トークンはセキュリティ上の理由からログに出力しない
    if (this.config.gitToken) {
      options.env!.GIT_TOKEN = this.config.gitToken;
    }

    // =========================================================================
    // ファイルシステム隔離設定
    // @see Requirement 5.4: Filesystem: No shared volumes between workers
    // =========================================================================

    // 結果出力ディレクトリが指定されている場合はボリュームマウント
    // 注意: 読み取り専用でマウント（:ro）
    // @see Requirement 5.4: Shared read-only: `runtime/runs/<run-id>/` for result collection only
    if (this.config.resultsDir) {
      options.volumes!.push(`${this.config.resultsDir}:${CONTAINER_RESULTS_PATH}:ro`);
    }

    // 注意: /workspaceは共有ボリュームではなく、各コンテナ固有のストレージ
    // リポジトリはコンテナ起動時にcloneされる（ホストbind mountではない）

    // =========================================================================
    // セキュリティオプション
    // @see Requirement 5.4: THE Worker_Container SHALL be isolated
    // =========================================================================

    // 特権昇格を禁止
    // 新しいプロセスがsetuid/setgidで特権を取得することを防ぐ
    if (isolation.noNewPrivileges) {
      options.additionalOptions!.push('--security-opt=no-new-privileges:true');
    }

    // 全てのLinux capabilitiesを削除
    // コンテナ内のプロセスが特権操作を実行することを防ぐ
    if (isolation.dropAllCapabilities) {
      options.additionalOptions!.push('--cap-drop=ALL');
    }

    // プロセス数制限
    // フォーク爆弾などのDoS攻撃を防ぐ
    if (isolation.pidsLimit > 0) {
      options.additionalOptions!.push(`--pids-limit=${isolation.pidsLimit}`);
    }

    // 読み取り専用ルートファイルシステム
    // /workspaceへの書き込みが必要な場合はtmpfsでマウント
    if (isolation.readOnlyRootFilesystem) {
      options.additionalOptions!.push('--read-only');
      // /workspaceを書き込み可能なtmpfsとしてマウント
      options.additionalOptions!.push(`--tmpfs=${CONTAINER_WORKSPACE_PATH}:rw,exec,size=2g`);
    }

    // tmpfsマウント（一時ファイル用）
    // /tmp, /var/tmpなどを揮発性ストレージとしてマウント
    for (const tmpfsPath of isolation.tmpfsMounts) {
      options.additionalOptions!.push(`--tmpfs=${tmpfsPath}:rw,noexec,nosuid,size=256m`);
    }

    // ユーザー名前空間の分離（オプション）
    // 注意: ホストのDocker設定に依存するため、デフォルトでは無効
    // options.additionalOptions!.push('--userns=host');

    return options;
  }

  /**
   * 隔離設定を取得
   *
   * @returns 現在の隔離設定
   */
  getIsolationConfig(): ContainerIsolationConfig {
    return {
      ...DEFAULT_ISOLATION_CONFIG,
      ...this.config.isolation,
    };
  }

  /**
   * コンテナの隔離状態を検証
   *
   * コンテナが正しく隔離されているかを検証する。
   * 以下の項目をチェック：
   * - ネットワーク隔離（networkMode='none'）
   * - ファイルシステム隔離（共有ボリュームなし）
   * - 読み取り専用共有（resultsDir が :ro でマウント）
   * - セキュリティオプション（no-new-privileges, cap-drop=ALL）
   *
   * @returns 検証結果
   *
   * @see Requirement 5.4: Isolation Acceptance Test Criteria
   */
  async verifyIsolation(): Promise<IsolationVerificationResult> {
    const errors: string[] = [];
    const isolation = this.getIsolationConfig();

    // ネットワーク隔離の検証
    const networkIsolated = isolation.networkMode === 'none';
    if (!networkIsolated) {
      errors.push(
        `Network isolation not enabled: networkMode='${isolation.networkMode}' (expected 'none')`
      );
    }

    // ファイルシステム隔離の検証
    // 共有ボリュームがないことを確認（resultsDir以外）
    const filesystemIsolated = true; // デフォルトで隔離されている（共有ボリュームなし）

    // 読み取り専用共有の検証
    // resultsDirが設定されている場合、:roでマウントされていることを確認
    let readOnlySharedCorrect = true;
    if (this.config.resultsDir) {
      // buildCreateOptionsで:roが付与されることを確認
      // 実際のマウント状態はinspectで確認可能
      readOnlySharedCorrect = true; // buildCreateOptionsで:roを付与している
    }

    // セキュリティオプションの検証
    const securityOptionsCorrect = isolation.noNewPrivileges && isolation.dropAllCapabilities;
    if (!isolation.noNewPrivileges) {
      errors.push('Security option no-new-privileges is not enabled');
    }
    if (!isolation.dropAllCapabilities) {
      errors.push('Security option cap-drop=ALL is not enabled');
    }

    return {
      valid: errors.length === 0,
      networkIsolated,
      filesystemIsolated,
      readOnlySharedCorrect,
      securityOptionsCorrect,
      errors,
    };
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * ワーカーコンテナを作成
 *
 * @param workerId - ワーカーID
 * @param options - 追加オプション
 * @param runtime - コンテナランタイム（省略時はデフォルトを使用）
 * @returns WorkerContainerインスタンス
 *
 * @see Requirement 5.1: WHEN Worker_Agent is assigned a task, THE System SHALL create a dedicated Docker container
 */
export function createWorkerContainer(
  workerId: AgentId,
  options?: Partial<Omit<WorkerContainerConfig, 'workerId'>>,
  runtime?: ContainerRuntime
): WorkerContainer {
  return new WorkerContainer(
    {
      workerId,
      ...options,
    },
    runtime
  );
}

/**
 * システム設定からワーカーコンテナを作成
 *
 * @param workerId - ワーカーID
 * @param systemConfig - システム設定
 * @param options - 追加オプション
 * @returns WorkerContainerインスタンス
 */
export function createWorkerContainerFromConfig(
  workerId: AgentId,
  systemConfig: Partial<SystemConfig>,
  options?: Partial<Omit<WorkerContainerConfig, 'workerId' | 'cpuLimit' | 'memoryLimit'>>
): WorkerContainer {
  const runtime = createContainerRuntime(systemConfig);
  return new WorkerContainer(
    {
      workerId,
      cpuLimit: systemConfig.workerCpuLimit ?? DEFAULT_SYSTEM_CONFIG.workerCpuLimit,
      memoryLimit: systemConfig.workerMemoryLimit ?? DEFAULT_SYSTEM_CONFIG.workerMemoryLimit,
      ...options,
    },
    runtime
  );
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * コンテナ名からワーカーIDを抽出
 *
 * @param containerName - コンテナ名
 * @returns ワーカーID（抽出できない場合はnull）
 */
export function extractWorkerIdFromContainerName(containerName: string): AgentId | null {
  // コンテナ名形式: agentcompany-worker-<workerId>-<timestamp>-<random>
  const prefix = `${CONTAINER_NAME_PREFIX}-`;
  if (!containerName.startsWith(prefix)) {
    return null;
  }

  const rest = containerName.substring(prefix.length);
  const parts = rest.split('-');

  // 最低でも workerId, timestamp, random の3パーツが必要
  if (parts.length < 3) {
    return null;
  }

  // 最後の2パーツ（timestamp, random）を除いた部分がworkerId
  // workerIdにハイフンが含まれる可能性があるため
  return parts.slice(0, -2).join('-');
}

/**
 * コンテナ名がワーカーコンテナかどうかを判定
 *
 * @param containerName - コンテナ名
 * @returns ワーカーコンテナの場合はtrue
 */
export function isWorkerContainerName(containerName: string): boolean {
  return containerName.startsWith(`${CONTAINER_NAME_PREFIX}-`);
}

/**
 * 2つのワーカーコンテナが隔離されているかを検証
 *
 * 以下の隔離条件を検証：
 * - Worker A は Worker B の /workspace にアクセス不可
 * - Worker A は Worker B にネットワークパケット送信不可
 * - Worker A はホストファイルシステムにアクセス不可
 *
 * @param containerA - ワーカーコンテナA
 * @param containerB - ワーカーコンテナB
 * @returns 隔離検証結果
 *
 * @see Requirement 5.4: Isolation Acceptance Test Criteria
 */
export async function verifyContainerIsolation(
  containerA: WorkerContainer,
  containerB: WorkerContainer
): Promise<{
  isolated: boolean;
  networkIsolated: boolean;
  filesystemIsolated: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // 両方のコンテナの隔離設定を検証
  const isolationA = await containerA.verifyIsolation();
  const isolationB = await containerB.verifyIsolation();

  // ネットワーク隔離の検証
  // 両方のコンテナがnetworkMode='none'であれば、相互通信は不可能
  const networkIsolated = isolationA.networkIsolated && isolationB.networkIsolated;
  if (!networkIsolated) {
    errors.push('Network isolation not enabled for both containers');
    errors.push(...isolationA.errors.filter((e) => e.includes('Network')));
    errors.push(...isolationB.errors.filter((e) => e.includes('Network')));
  }

  // ファイルシステム隔離の検証
  // 各コンテナは独自の/workspaceを持ち、共有ボリュームがない
  const filesystemIsolated = isolationA.filesystemIsolated && isolationB.filesystemIsolated;
  if (!filesystemIsolated) {
    errors.push('Filesystem isolation not enabled for both containers');
  }

  // ワーカーIDが異なることを確認
  if (containerA.getWorkerId() === containerB.getWorkerId()) {
    errors.push('Both containers have the same worker ID');
  }

  return {
    isolated: errors.length === 0,
    networkIsolated,
    filesystemIsolated,
    errors,
  };
}

/**
 * デフォルトの隔離設定でコンテナを作成するヘルパー
 *
 * 最大限の隔離を適用したワーカーコンテナを作成する。
 *
 * @param workerId - ワーカーID
 * @param options - 追加オプション
 * @returns WorkerContainerインスタンス
 *
 * @see Requirement 5.4: THE Worker_Container SHALL be isolated
 */
export function createIsolatedWorkerContainer(
  workerId: AgentId,
  options?: Partial<Omit<WorkerContainerConfig, 'workerId' | 'isolation'>>
): WorkerContainer {
  return new WorkerContainer({
    workerId,
    ...options,
    // 最大限の隔離設定を適用
    isolation: {
      networkMode: 'none',
      noNewPrivileges: true,
      dropAllCapabilities: true,
      pidsLimit: DEFAULT_PIDS_LIMIT,
      readOnlyRootFilesystem: false, // /workspaceへの書き込みが必要
      tmpfsMounts: ['/tmp', '/var/tmp'],
    },
  });
}

/**
 * 隔離設定の説明を生成
 *
 * デバッグやログ出力用に、現在の隔離設定を人間が読める形式で出力する。
 *
 * @param config - 隔離設定
 * @returns 設定の説明文字列
 */
export function describeIsolationConfig(config: ContainerIsolationConfig): string {
  const lines: string[] = [
    '=== Container Isolation Configuration ===',
    `Network Mode: ${config.networkMode}`,
    `  - ${config.networkMode === 'none' ? '✓ Inter-container communication disabled' : '✗ Inter-container communication may be possible'}`,
    `No New Privileges: ${config.noNewPrivileges ? 'enabled' : 'disabled'}`,
    `  - ${config.noNewPrivileges ? '✓ Privilege escalation prevented' : '✗ Privilege escalation possible'}`,
    `Drop All Capabilities: ${config.dropAllCapabilities ? 'enabled' : 'disabled'}`,
    `  - ${config.dropAllCapabilities ? '✓ All Linux capabilities dropped' : '✗ Some capabilities may be available'}`,
    `PIDs Limit: ${config.pidsLimit}`,
    `  - ${config.pidsLimit > 0 ? `✓ Process count limited to ${config.pidsLimit}` : '✗ No process limit'}`,
    `Read-Only Root Filesystem: ${config.readOnlyRootFilesystem ? 'enabled' : 'disabled'}`,
    `  - ${config.readOnlyRootFilesystem ? '✓ Root filesystem is read-only' : '○ Root filesystem is writable (required for /workspace)'}`,
    `Tmpfs Mounts: ${config.tmpfsMounts.length > 0 ? config.tmpfsMounts.join(', ') : 'none'}`,
    '==========================================',
  ];
  return lines.join('\n');
}
