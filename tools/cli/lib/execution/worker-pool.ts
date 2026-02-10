/**
 * Worker Pool - ワーカープール管理
 *
 * ワーカーエージェントのプール管理を担当する。
 * ワーカーの取得・解放、プール状態管理、並列実行制御を行う。
 * WorkerTypeRegistryと連携してワーカータイプに基づく割り当てを行う。
 *
 * @module execution/worker-pool
 * @see Requirements: 9.1, 9.3, 9.4, 9.5, 3.1-3.8
 */

import {
  AgentId,
  ContainerId,
  RunId,
  SubTask,
  PoolStatus,
  WorkerStatus,
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  ContainerRuntimeType,
  WorkerType,
} from './types';
import { WorkerContainer, WorkerContainerConfig, createWorkerContainer } from './worker-container';
import { WorkerAgent, WorkerAgentConfig, createWorkerAgent } from './agents/worker';
import { ContainerRuntime, createContainerRuntime } from './container-runtime';
import { WorkerTypeRegistry, createWorkerTypeRegistry } from './worker-type-registry';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトの最大同時実行ワーカー数
 * @see Requirement 9.1: THE Worker_Pool SHALL limit concurrent workers to configurable max (default: 3)
 */
export const DEFAULT_MAX_WORKERS = 3;

/**
 * ワーカーID生成用のプレフィックス
 */
const WORKER_ID_PREFIX = 'worker';

/**
 * ワーカー取得のタイムアウト（ミリ秒）
 */
const WORKER_ACQUIRE_TIMEOUT_MS = 30000;

/**
 * ワーカー取得のポーリング間隔（ミリ秒）
 */
const WORKER_ACQUIRE_POLL_INTERVAL_MS = 500;

// =============================================================================
// 型定義
// =============================================================================

/**
 * ワーカー情報
 * @description プール内のワーカーの状態を管理
 */
export interface WorkerInfo {
  /** ワーカーID */
  workerId: AgentId;
  /** ワーカーエージェント */
  agent: WorkerAgent;
  /** ワーカーコンテナ（存在する場合） */
  container?: WorkerContainer;
  /** ワーカーステータス */
  status: WorkerStatus;
  /** 現在実行中のタスク */
  currentTask?: SubTask;
  /** 実行ID */
  runId?: RunId;
  /** 作成日時 */
  createdAt: string;
  /** 最終アクティブ日時 */
  lastActiveAt: string;
  /** 能力タグ（特定のタスクタイプに対応） */
  capabilities: string[];
}

/**
 * ワーカープール設定
 */
export interface WorkerPoolConfig {
  /** 最大同時実行ワーカー数 */
  maxWorkers?: number;
  /** デフォルトAIアダプタ */
  defaultAdapter?: string;
  /** デフォルトモデル */
  defaultModel?: string;
  /** コンテナランタイム設定 */
  containerRuntime?: ContainerRuntimeType;
  /** ワーカーCPU制限 */
  workerCpuLimit?: string;
  /** ワーカーメモリ制限 */
  workerMemoryLimit?: string;
  /** コンテナを使用するかどうか */
  useContainers?: boolean;
}

/**
 * ワーカー取得オプション
 */
export interface AcquireWorkerOptions {
  /** 実行ID */
  runId?: RunId;
  /** 必要な能力タグ */
  requiredCapabilities?: string[];
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** コンテナ設定 */
  containerConfig?: Partial<WorkerContainerConfig>;
}

/**
 * タスクキューアイテム
 * @description 保留中のタスクを管理
 */
export interface PendingTask {
  /** タスク */
  task: SubTask;
  /** 実行ID */
  runId: RunId;
  /** 必要な能力タグ */
  requiredCapabilities?: string[];
  /** 追加日時 */
  addedAt: string;
  /** コールバック（ワーカー割り当て時） */
  onAssigned?: (workerId: AgentId) => void;
}

/**
 * ワーカー解放結果
 */
export interface ReleaseWorkerResult {
  /** 成功フラグ */
  success: boolean;
  /** 次に割り当てられたタスク（存在する場合） */
  nextTask?: SubTask;
  /** エラーメッセージ */
  error?: string;
}

// =============================================================================
// WorkerPool クラス
// =============================================================================

/**
 * WorkerPool - ワーカープール管理クラス
 *
 * ワーカーエージェントのプール管理を担当する。
 * 最大同時実行数の制御、タスク完了時の次タスク割り当てを行う。
 * WorkerTypeRegistryと連携してワーカータイプに基づく割り当てを行う。
 *
 * @see Requirement 9.1: THE Worker_Pool SHALL limit concurrent workers to configurable max (default: 3)
 * @see Requirement 9.3: THE Worker_Pool SHALL manage worker lifecycle (create, assign, release, destroy)
 * @see Requirement 9.4: WHEN task completes, THE Worker_Pool SHALL assign next pending task to freed worker
 * @see Requirement 9.5: THE Worker_Pool SHALL support dynamic scaling within max limit
 * @see Requirement 3.8: WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements
 */
export class WorkerPool {
  /** プール設定 */
  private config: Required<WorkerPoolConfig>;

  /** ワーカー情報マップ */
  private workers: Map<AgentId, WorkerInfo> = new Map();

  /** 保留中タスクキュー */
  private pendingTasks: PendingTask[] = [];

  /** コンテナランタイム */
  private containerRuntime: ContainerRuntime;

  /** ワーカータイプレジストリ */
  private workerTypeRegistry: WorkerTypeRegistry;

  /** ワーカーID生成用カウンター */
  private workerIdCounter = 0;

  /** プール停止フラグ */
  private stopped = false;

  /**
   * コンストラクタ
   * @param config - プール設定
   */
  constructor(config?: WorkerPoolConfig) {
    this.config = {
      maxWorkers: config?.maxWorkers ?? DEFAULT_MAX_WORKERS,
      defaultAdapter: config?.defaultAdapter ?? DEFAULT_SYSTEM_CONFIG.defaultAiAdapter,
      defaultModel: config?.defaultModel ?? DEFAULT_SYSTEM_CONFIG.defaultModel,
      containerRuntime: config?.containerRuntime ?? DEFAULT_SYSTEM_CONFIG.containerRuntime,
      workerCpuLimit: config?.workerCpuLimit ?? DEFAULT_SYSTEM_CONFIG.workerCpuLimit,
      workerMemoryLimit: config?.workerMemoryLimit ?? DEFAULT_SYSTEM_CONFIG.workerMemoryLimit,
      useContainers: config?.useContainers ?? false,
    };

    this.containerRuntime = createContainerRuntime({
      containerRuntime: this.config.containerRuntime,
    });

    // ワーカータイプレジストリを初期化
    this.workerTypeRegistry = createWorkerTypeRegistry();
  }

  // ===========================================================================
  // プール状態管理
  // ===========================================================================

  /**
   * プール状態を取得
   * @returns プール状態
   */
  getPoolStatus(): PoolStatus {
    let activeWorkers = 0;
    let idleWorkers = 0;

    for (const worker of this.workers.values()) {
      if (worker.status === 'working') {
        activeWorkers++;
      } else if (worker.status === 'idle') {
        idleWorkers++;
      }
    }

    return {
      totalWorkers: this.workers.size,
      activeWorkers,
      idleWorkers,
      pendingTasks: this.pendingTasks.length,
      containerRuntime: this.config.containerRuntime,
    };
  }

  /**
   * 最大ワーカー数を設定
   * @param count - 新しい最大ワーカー数
   * @see Requirement 9.5: THE Worker_Pool SHALL support dynamic scaling within max limit
   */
  setMaxWorkers(count: number): void {
    if (count < 1) {
      throw new Error('最大ワーカー数は1以上である必要があります');
    }
    this.config.maxWorkers = count;
  }

  /**
   * 最大ワーカー数を取得
   * @returns 最大ワーカー数
   */
  getMaxWorkers(): number {
    return this.config.maxWorkers;
  }

  /**
   * コンテナランタイムを設定
   * @param runtime - コンテナランタイム種別
   */
  setContainerRuntime(runtime: ContainerRuntimeType): void {
    this.config.containerRuntime = runtime;
    this.containerRuntime = createContainerRuntime({
      containerRuntime: runtime,
    });
  }

  // ===========================================================================
  // ワーカー取得・解放
  // ===========================================================================

  /**
   * 利用可能なワーカーを取得
   *
   * アイドル状態のワーカーを返す。存在しない場合は新規作成を試みる。
   * 最大ワーカー数に達している場合はnullを返す。
   *
   * @param options - 取得オプション
   * @returns ワーカーエージェント（取得できない場合はnull）
   *
   * @see Requirement 9.3: THE Worker_Pool SHALL manage worker lifecycle (create, assign, release, destroy)
   */
  async getAvailableWorker(options?: AcquireWorkerOptions): Promise<WorkerAgent | null> {
    if (this.stopped) {
      return null;
    }

    // アイドル状態のワーカーを探す
    const idleWorker = this.findIdleWorker(options?.requiredCapabilities);
    if (idleWorker) {
      // ワーカーを作業中に設定
      idleWorker.status = 'working';
      idleWorker.runId = options?.runId;
      idleWorker.lastActiveAt = new Date().toISOString();
      return idleWorker.agent;
    }

    // 最大ワーカー数に達していない場合は新規作成
    if (this.workers.size < this.config.maxWorkers) {
      const newWorker = await this.createWorker(options);
      if (newWorker) {
        newWorker.status = 'working';
        newWorker.runId = options?.runId;
        return newWorker.agent;
      }
    }

    // 取得できない場合はnull
    return null;
  }

  /**
   * ワーカーを取得（タイムアウト付き）
   *
   * 利用可能なワーカーが見つかるまで待機する。
   * タイムアウトに達した場合はnullを返す。
   *
   * @param options - 取得オプション
   * @returns ワーカーエージェント（タイムアウト時はnull）
   */
  async acquireWorker(options?: AcquireWorkerOptions): Promise<WorkerAgent | null> {
    const timeout = options?.timeout ?? WORKER_ACQUIRE_TIMEOUT_MS;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const worker = await this.getAvailableWorker(options);
      if (worker) {
        return worker;
      }

      // 少し待ってから再試行
      await this.sleep(WORKER_ACQUIRE_POLL_INTERVAL_MS);
    }

    return null;
  }

  /**
   * ワーカーを解放
   *
   * タスク完了後にワーカーを解放し、保留中のタスクがあれば割り当てる。
   *
   * @param workerId - ワーカーID
   * @returns 解放結果
   *
   * @see Requirement 9.4: WHEN task completes, THE Worker_Pool SHALL assign next pending task to freed worker
   */
  async releaseWorker(workerId: AgentId): Promise<ReleaseWorkerResult> {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      return {
        success: false,
        error: `ワーカー ${workerId} が見つかりません`,
      };
    }

    // 現在のタスクをクリア
    workerInfo.currentTask = undefined;
    workerInfo.runId = undefined;
    workerInfo.lastActiveAt = new Date().toISOString();

    // 保留中のタスクがあれば割り当て
    const nextTask = this.getNextPendingTask(workerInfo.capabilities);
    if (nextTask) {
      workerInfo.status = 'working';
      workerInfo.currentTask = nextTask.task;
      workerInfo.runId = nextTask.runId;

      // コールバックを呼び出し
      if (nextTask.onAssigned) {
        nextTask.onAssigned(workerId);
      }

      return {
        success: true,
        nextTask: nextTask.task,
      };
    }

    // 保留中タスクがなければアイドル状態に
    workerInfo.status = 'idle';
    return {
      success: true,
    };
  }

  // ===========================================================================
  // タスクキュー管理
  // ===========================================================================

  /**
   * タスクをキューに追加
   *
   * 利用可能なワーカーがいない場合、タスクをキューに追加する。
   *
   * @param task - サブタスク
   * @param runId - 実行ID
   * @param options - オプション
   */
  addPendingTask(
    task: SubTask,
    runId: RunId,
    options?: {
      requiredCapabilities?: string[];
      onAssigned?: (workerId: AgentId) => void;
    }
  ): void {
    this.pendingTasks.push({
      task,
      runId,
      requiredCapabilities: options?.requiredCapabilities,
      addedAt: new Date().toISOString(),
      onAssigned: options?.onAssigned,
    });
  }

  /**
   * 保留中タスク数を取得
   * @returns 保留中タスク数
   */
  getPendingTaskCount(): number {
    return this.pendingTasks.length;
  }

  /**
   * 保留中タスクをクリア
   */
  clearPendingTasks(): void {
    this.pendingTasks = [];
  }

  // ===========================================================================
  // ワーカー管理
  // ===========================================================================

  /**
   * ワーカー情報を取得
   * @param workerId - ワーカーID
   * @returns ワーカー情報（存在しない場合はundefined）
   */
  getWorkerInfo(workerId: AgentId): WorkerInfo | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 全ワーカー情報を取得
   * @returns ワーカー情報の配列
   */
  getAllWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  /**
   * アクティブワーカー数を取得
   * @returns アクティブワーカー数
   */
  getActiveWorkerCount(): number {
    let count = 0;
    for (const worker of this.workers.values()) {
      if (worker.status === 'working') {
        count++;
      }
    }
    return count;
  }

  /**
   * アイドルワーカー数を取得
   * @returns アイドルワーカー数
   */
  getIdleWorkerCount(): number {
    let count = 0;
    for (const worker of this.workers.values()) {
      if (worker.status === 'idle') {
        count++;
      }
    }
    return count;
  }

  /**
   * ワーカーにタスクを割り当て
   * @param workerId - ワーカーID
   * @param task - サブタスク
   * @param runId - 実行ID
   * @returns 成功フラグ
   */
  assignTaskToWorker(workerId: AgentId, task: SubTask, runId: RunId): boolean {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      return false;
    }

    if (workerInfo.status !== 'idle') {
      return false;
    }

    workerInfo.status = 'working';
    workerInfo.currentTask = task;
    workerInfo.runId = runId;
    workerInfo.lastActiveAt = new Date().toISOString();
    return true;
  }

  // ===========================================================================
  // ワーカータイプ管理
  // ===========================================================================

  /**
   * タスク内容からワーカータイプを推定
   *
   * @param taskDescription - タスクの説明
   * @returns 推定されたワーカータイプ
   *
   * @see Requirement 3.8: WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements
   */
  matchWorkerTypeForTask(taskDescription: string): WorkerType {
    return this.workerTypeRegistry.matchWorkerType(taskDescription);
  }

  /**
   * ワーカータイプに基づいてワーカーを取得
   *
   * 指定されたワーカータイプに適したワーカーを取得する。
   * 適切なワーカーがいない場合は新規作成を試みる。
   *
   * @param workerType - ワーカータイプ
   * @param options - 取得オプション
   * @returns ワーカーエージェント（取得できない場合はnull）
   *
   * @see Requirement 3.8: WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements
   */
  async getWorkerByType(
    workerType: WorkerType,
    options?: AcquireWorkerOptions
  ): Promise<WorkerAgent | null> {
    if (this.stopped) {
      return null;
    }

    // ワーカータイプの能力を取得（将来のマッチング機能で使用予定）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _requiredCapabilities = this.workerTypeRegistry.getCapabilities(workerType);

    // 該当する能力を持つアイドルワーカーを探す
    const idleWorker = this.findIdleWorkerByType(workerType);
    if (idleWorker) {
      idleWorker.status = 'working';
      idleWorker.runId = options?.runId;
      idleWorker.lastActiveAt = new Date().toISOString();
      return idleWorker.agent;
    }

    // 最大ワーカー数に達していない場合は新規作成
    if (this.workers.size < this.config.maxWorkers) {
      const newWorker = await this.createWorkerWithType(workerType, options);
      if (newWorker) {
        newWorker.status = 'working';
        newWorker.runId = options?.runId;
        return newWorker.agent;
      }
    }

    // 取得できない場合はnull
    return null;
  }

  /**
   * ワーカータイプレジストリを取得
   *
   * @returns WorkerTypeRegistryインスタンス
   */
  getWorkerTypeRegistry(): WorkerTypeRegistry {
    return this.workerTypeRegistry;
  }

  /**
   * ワーカータイプの設定を取得
   *
   * @param workerType - ワーカータイプ
   * @returns ワーカータイプ設定
   */
  getWorkerTypeConfig(workerType: WorkerType): import('./types').WorkerTypeConfig {
    return this.workerTypeRegistry.getConfig(workerType);
  }

  // ===========================================================================
  // コンテナ管理
  // ===========================================================================

  /**
   * ワーカーコンテナを作成
   *
   * @param workerId - ワーカーID
   * @param config - コンテナ設定
   * @returns コンテナID
   */
  async createWorkerContainer(
    workerId: AgentId,
    config?: Partial<WorkerContainerConfig>
  ): Promise<ContainerId> {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      throw new Error(`ワーカー ${workerId} が見つかりません`);
    }

    // コンテナを作成
    const container = createWorkerContainer(
      workerId,
      {
        cpuLimit: this.config.workerCpuLimit,
        memoryLimit: this.config.workerMemoryLimit,
        ...config,
      },
      this.containerRuntime
    );

    const result = await container.createAndStart();
    if (!result.success) {
      throw new Error(`コンテナ作成に失敗: ${result.error}`);
    }

    workerInfo.container = container;
    return result.containerId!;
  }

  /**
   * ワーカーコンテナを破棄
   *
   * @param workerId - ワーカーID
   */
  async destroyWorkerContainer(workerId: AgentId): Promise<void> {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo?.container) {
      return;
    }

    await workerInfo.container.destroy(true);
    workerInfo.container = undefined;
  }

  // ===========================================================================
  // プールライフサイクル
  // ===========================================================================

  /**
   * プールを停止
   *
   * 全ワーカーを停止し、コンテナを破棄する。
   */
  async stop(): Promise<void> {
    this.stopped = true;

    // 全ワーカーのコンテナを破棄
    const destroyPromises: Promise<void>[] = [];
    for (const [workerId, workerInfo] of this.workers) {
      if (workerInfo.container) {
        destroyPromises.push(this.destroyWorkerContainer(workerId));
      }
      workerInfo.status = 'terminated';
    }

    await Promise.all(destroyPromises);
  }

  /**
   * プールをリセット
   *
   * 全ワーカーを削除し、初期状態に戻す。
   */
  async reset(): Promise<void> {
    await this.stop();
    this.workers.clear();
    this.pendingTasks = [];
    this.workerIdCounter = 0;
    this.stopped = false;
  }

  /**
   * プールが停止しているかどうか
   * @returns 停止している場合はtrue
   */
  isStopped(): boolean {
    return this.stopped;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * アイドル状態のワーカーを探す
   * @param requiredCapabilities - 必要な能力タグ
   * @returns ワーカー情報（見つからない場合はundefined）
   */
  private findIdleWorker(requiredCapabilities?: string[]): WorkerInfo | undefined {
    for (const workerInfo of this.workers.values()) {
      if (workerInfo.status !== 'idle') {
        continue;
      }

      // 能力タグのチェック
      if (requiredCapabilities && requiredCapabilities.length > 0) {
        const hasAllCapabilities = requiredCapabilities.every((cap) =>
          workerInfo.capabilities.includes(cap)
        );
        if (!hasAllCapabilities) {
          continue;
        }
      }

      return workerInfo;
    }
    return undefined;
  }

  /**
   * ワーカータイプに基づいてアイドル状態のワーカーを探す
   * @param workerType - ワーカータイプ
   * @returns ワーカー情報（見つからない場合はundefined）
   */
  private findIdleWorkerByType(workerType: WorkerType): WorkerInfo | undefined {
    const requiredCapabilities = this.workerTypeRegistry.getCapabilities(workerType);

    for (const workerInfo of this.workers.values()) {
      if (workerInfo.status !== 'idle') {
        continue;
      }

      // ワーカータイプの能力を持っているかチェック
      const hasRequiredCapabilities = requiredCapabilities.some((cap) =>
        workerInfo.capabilities.includes(cap)
      );
      if (hasRequiredCapabilities) {
        return workerInfo;
      }
    }
    return undefined;
  }

  /**
   * 新しいワーカーを作成
   * @param options - 取得オプション
   * @returns ワーカー情報
   */
  private async createWorker(options?: AcquireWorkerOptions): Promise<WorkerInfo | null> {
    const workerId = this.generateWorkerId();

    // ワーカーエージェントを作成
    const agentConfig: WorkerAgentConfig = {
      agentId: workerId,
      adapterName: this.config.defaultAdapter,
      modelName: this.config.defaultModel,
    };
    const agent = createWorkerAgent(agentConfig);

    const now = new Date().toISOString();
    const workerInfo: WorkerInfo = {
      workerId,
      agent,
      status: 'idle',
      createdAt: now,
      lastActiveAt: now,
      capabilities: [],
    };

    // コンテナを使用する場合は作成
    if (this.config.useContainers) {
      try {
        const container = createWorkerContainer(
          workerId,
          {
            cpuLimit: this.config.workerCpuLimit,
            memoryLimit: this.config.workerMemoryLimit,
            ...options?.containerConfig,
          },
          this.containerRuntime
        );

        const result = await container.createAndStart();
        if (result.success) {
          workerInfo.container = container;
        }
      } catch (error) {
        // コンテナ作成に失敗してもワーカーは使用可能
        console.warn(`コンテナ作成に失敗: ${error}`);
      }
    }

    this.workers.set(workerId, workerInfo);
    return workerInfo;
  }

  /**
   * ワーカータイプに基づいて新しいワーカーを作成
   * @param workerType - ワーカータイプ
   * @param options - 取得オプション
   * @returns ワーカー情報
   *
   * @see Requirement 3.8: WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements
   */
  private async createWorkerWithType(
    workerType: WorkerType,
    options?: AcquireWorkerOptions
  ): Promise<WorkerInfo | null> {
    const workerId = this.generateWorkerId();
    const typeConfig = this.workerTypeRegistry.getConfig(workerType);

    // ワーカータイプの設定に基づいてエージェントを作成
    const agentConfig: WorkerAgentConfig = {
      agentId: workerId,
      adapterName: typeConfig.aiConfig?.adapter ?? this.config.defaultAdapter,
      modelName: typeConfig.aiConfig?.model ?? this.config.defaultModel,
    };
    const agent = createWorkerAgent(agentConfig);

    const now = new Date().toISOString();
    const workerInfo: WorkerInfo = {
      workerId,
      agent,
      status: 'idle',
      createdAt: now,
      lastActiveAt: now,
      // ワーカータイプの能力を設定
      capabilities: [...typeConfig.capabilities],
    };

    // コンテナを使用する場合は作成
    if (this.config.useContainers) {
      try {
        const container = createWorkerContainer(
          workerId,
          {
            cpuLimit: this.config.workerCpuLimit,
            memoryLimit: this.config.workerMemoryLimit,
            ...options?.containerConfig,
          },
          this.containerRuntime
        );

        const result = await container.createAndStart();
        if (result.success) {
          workerInfo.container = container;
        }
      } catch (error) {
        // コンテナ作成に失敗してもワーカーは使用可能
        console.warn(`コンテナ作成に失敗: ${error}`);
      }
    }

    this.workers.set(workerId, workerInfo);
    return workerInfo;
  }

  /**
   * 次の保留中タスクを取得
   * @param workerCapabilities - ワーカーの能力タグ
   * @returns 保留中タスク（存在しない場合はundefined）
   */
  private getNextPendingTask(workerCapabilities: string[]): PendingTask | undefined {
    // 能力タグに一致するタスクを探す
    for (let i = 0; i < this.pendingTasks.length; i++) {
      const pendingTask = this.pendingTasks[i];

      // 必要な能力タグがない場合は任意のワーカーに割り当て可能
      if (!pendingTask.requiredCapabilities || pendingTask.requiredCapabilities.length === 0) {
        return this.pendingTasks.splice(i, 1)[0];
      }

      // 能力タグのチェック
      const hasAllCapabilities = pendingTask.requiredCapabilities.every((cap) =>
        workerCapabilities.includes(cap)
      );
      if (hasAllCapabilities) {
        return this.pendingTasks.splice(i, 1)[0];
      }
    }

    // 一致するタスクがない場合は最初のタスクを返す（能力タグを無視）
    if (this.pendingTasks.length > 0) {
      return this.pendingTasks.shift();
    }

    return undefined;
  }

  /**
   * ワーカーIDを生成
   * @returns 一意のワーカーID
   */
  private generateWorkerId(): AgentId {
    this.workerIdCounter++;
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${WORKER_ID_PREFIX}-${timestamp}-${random}`;
  }

  /**
   * スリープ
   * @param ms - ミリ秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * ワーカープールを作成
 *
 * @param config - プール設定
 * @returns WorkerPoolインスタンス
 */
export function createWorkerPool(config?: WorkerPoolConfig): WorkerPool {
  return new WorkerPool(config);
}

/**
 * システム設定からワーカープールを作成
 *
 * @param systemConfig - システム設定
 * @returns WorkerPoolインスタンス
 */
export function createWorkerPoolFromConfig(systemConfig: Partial<SystemConfig>): WorkerPool {
  return new WorkerPool({
    maxWorkers: systemConfig.maxConcurrentWorkers ?? DEFAULT_SYSTEM_CONFIG.maxConcurrentWorkers,
    defaultAdapter: systemConfig.defaultAiAdapter ?? DEFAULT_SYSTEM_CONFIG.defaultAiAdapter,
    defaultModel: systemConfig.defaultModel ?? DEFAULT_SYSTEM_CONFIG.defaultModel,
    containerRuntime: systemConfig.containerRuntime ?? DEFAULT_SYSTEM_CONFIG.containerRuntime,
    workerCpuLimit: systemConfig.workerCpuLimit ?? DEFAULT_SYSTEM_CONFIG.workerCpuLimit,
    workerMemoryLimit: systemConfig.workerMemoryLimit ?? DEFAULT_SYSTEM_CONFIG.workerMemoryLimit,
  });
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ワーカーステータスの説明を取得
 *
 * @param status - ワーカーステータス
 * @returns ステータスの説明
 */
export function describeWorkerStatus(status: WorkerStatus): string {
  switch (status) {
    case 'idle':
      return 'アイドル（待機中）';
    case 'working':
      return '作業中';
    case 'error':
      return 'エラー';
    case 'terminated':
      return '終了';
    default:
      return '不明';
  }
}

/**
 * プール状態の説明を取得
 *
 * @param status - プール状態
 * @returns 状態の説明
 */
export function describePoolStatus(status: PoolStatus): string {
  const lines: string[] = [
    '=== Worker Pool Status ===',
    `総ワーカー数: ${status.totalWorkers}`,
    `アクティブ: ${status.activeWorkers}`,
    `アイドル: ${status.idleWorkers}`,
    `保留中タスク: ${status.pendingTasks}`,
    `コンテナランタイム: ${status.containerRuntime}`,
  ];
  return lines.join('\n');
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default WorkerPool;
