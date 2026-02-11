/**
 * Orchestrator - 全体制御コンポーネント
 *
 * エージェント実行エンジンの全体制御を担当するメインコンポーネント。
 * タスク管理、エージェント管理、設定管理を統合的に行う。
 * TicketManager, PRCreator, ReviewWorkflowと連携してチケットベースのワークフローを実行。
 *
 * @module execution/orchestrator
 * @see Requirements: 23.2, 23.3, 13.1, 13.2, 13.5
 */

import * as crypto from 'crypto';
import {
  AgentId,
  RunId,
  TaskId,
  Task,
  SubTask,
  TaskStatus,
  ExecutionState,
  ExecutionResult,
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  ErrorInfo,
  ParentTicket,
  RunTaskMetadata,
} from './types';
import { StateManager } from './state-manager';
import { AgentBus, createAgentBus } from './agent-bus';
import { ManagerAgent, ManagerAgentConfig, createManagerAgent } from './agents/manager';
import { WorkerPool, createWorkerPoolFromConfig } from './worker-pool';
import {
  ErrorHandler,
  createErrorHandler,
  ErrorHandlerOptions,
  RetryConfig,
  RetryResult,
  EscalationInfo,
  ErrorCategory,
} from './error-handler';
import { TicketManager, createTicketManager } from './ticket-manager';
import { PRCreator, createPRCreator } from './pr-creator';
import { ReviewWorkflow, createReviewWorkflow } from './review-workflow';
import { WorkerTypeRegistry, createWorkerTypeRegistry } from './worker-type-registry';
import { AIHealthChecker, createAIHealthChecker, AIHealthStatus } from './ai-health-checker';
import { ExecutionReporter, ExecutionReporterOptions } from './execution-reporter';
import {
  QualityGateIntegration,
  createQualityGateIntegration,
  QualityGateIntegrationConfig,
} from './quality-gate-integration';
import { RunDirectoryManager } from './run-directory-manager';
import { WorkflowEngine, createWorkflowEngine } from './workflow-engine';
import { MeetingCoordinator, createMeetingCoordinator } from './meeting-coordinator';
import { ApprovalGate, createApprovalGate } from './approval-gate';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのマネージャーエージェントID
 */
const DEFAULT_MANAGER_ID = 'manager-001';

/**
 * タスクID生成用のプレフィックス
 */
const TASK_ID_PREFIX = 'task';

/**
 * 実行ID生成用のプレフィックス
 */
const RUN_ID_PREFIX = 'run';

/**
 * 緊急停止のタイムアウト（ミリ秒）
 */
const EMERGENCY_STOP_TIMEOUT_MS = 5000;

// =============================================================================
// 型定義
// =============================================================================

/**
 * エージェント情報
 * @description アクティブなエージェントの情報
 */
export interface AgentInfo {
  /** エージェントID */
  id: AgentId;
  /** エージェント種別 */
  type: 'manager' | 'worker' | 'reviewer' | 'merger';
  /** ステータス */
  status: 'idle' | 'working' | 'paused' | 'error' | 'terminated';
  /** 現在のタスク（存在する場合） */
  currentTask?: {
    taskId: string;
    title: string;
  };
  /** 最終アクティブ日時（ISO8601形式） */
  lastActiveAt: string;
}

/**
 * タスクステータス詳細
 * @description タスクの詳細なステータス情報
 */
export interface TaskStatusDetail {
  /** タスクID */
  taskId: TaskId;
  /** タスクステータス */
  status: TaskStatus;
  /** 進捗率（0-100） */
  progressPercent: number;
  /** サブタスク数 */
  totalSubTasks: number;
  /** 完了サブタスク数 */
  completedSubTasks: number;
  /** 実行中サブタスク数 */
  runningSubTasks: number;
  /** 失敗サブタスク数 */
  failedSubTasks: number;
  /** 割り当てられたマネージャー */
  assignedManager?: AgentId;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * Orchestrator設定
 */
export interface OrchestratorConfig {
  /** State Manager（オプション、指定しない場合は新規作成） */
  stateManager?: StateManager;
  /** Agent Bus（オプション、指定しない場合は新規作成） */
  agentBus?: AgentBus;
  /** Worker Pool（オプション、指定しない場合は新規作成） */
  workerPool?: WorkerPool;
  /** Manager Agent（オプション、指定しない場合は新規作成） */
  managerAgent?: ManagerAgent;
  /** Error Handler（オプション、指定しない場合は新規作成） */
  errorHandler?: ErrorHandler;
  /** Ticket Manager（オプション、指定しない場合は新規作成） */
  ticketManager?: TicketManager;
  /** PR Creator（オプション、指定しない場合は新規作成） */
  prCreator?: PRCreator;
  /** Review Workflow（オプション、指定しない場合は新規作成） */
  reviewWorkflow?: ReviewWorkflow;
  /** Worker Type Registry（オプション、指定しない場合は新規作成） */
  workerTypeRegistry?: WorkerTypeRegistry;
  /** AI Health Checker（オプション、指定しない場合は新規作成） */
  aiHealthChecker?: AIHealthChecker;
  /** Execution Reporter（オプション、指定しない場合は新規作成） */
  executionReporter?: ExecutionReporter;
  /** Quality Gate Integration（オプション、指定しない場合は新規作成） */
  qualityGateIntegration?: QualityGateIntegration;
  /** Run Directory Manager（オプション、指定しない場合は新規作成） */
  runDirectoryManager?: RunDirectoryManager;
  /** Workflow Engine（オプション、指定しない場合は新規作成） */
  workflowEngine?: WorkflowEngine;
  /** Meeting Coordinator（オプション、指定しない場合は新規作成） */
  meetingCoordinator?: MeetingCoordinator;
  /** Approval Gate（オプション、指定しない場合は新規作成） */
  approvalGate?: ApprovalGate;
  /** システム設定（オプション） */
  systemConfig?: Partial<SystemConfig>;
  /** エラーハンドラーオプション（オプション） */
  errorHandlerOptions?: ErrorHandlerOptions;
}

/**
 * タスク送信オプション
 */
export interface SubmitTaskOptions {
  /** 優先度 */
  priority?: 'low' | 'medium' | 'high';
  /** タグ */
  tags?: string[];
  /** 期限（ISO8601形式） */
  deadline?: string;
  /** 自動分解フラグ（デフォルト: true） */
  autoDecompose?: boolean;
}

/**
 * Orchestratorインターフェース
 * @see Requirement 23.2: WHEN President submits instruction via GUI, THE Manager_Agent SHALL automatically start processing
 * @see Requirement 23.3: THE Manager_Agent SHALL decompose, assign, and monitor without manual intervention
 */
export interface IOrchestrator {
  // タスク管理
  submitTask(instruction: string, projectId: string, options?: SubmitTaskOptions): Promise<TaskId>;
  getTaskStatus(taskId: TaskId): Promise<TaskStatusDetail>;
  cancelTask(taskId: TaskId): Promise<void>;
  resumeTask(runId: RunId): Promise<void>;

  // エージェント管理
  getActiveAgents(): Promise<AgentInfo[]>;
  pauseAllAgents(): Promise<void>;
  resumeAllAgents(): Promise<void>;
  emergencyStop(): Promise<void>;

  // 設定
  updateConfig(config: Partial<SystemConfig>): Promise<void>;
  getConfig(): Promise<SystemConfig>;
}

// =============================================================================
// Orchestrator クラス
// =============================================================================

/**
 * Orchestrator - 全体制御コンポーネント
 *
 * エージェント実行エンジンの全体制御を担当するメインコンポーネント。
 * 社長（ユーザー）からの指示を受け取り、Manager Agentに自動的に処理を開始させる。
 *
 * @see Requirement 23.2: WHEN President submits instruction via GUI, THE Manager_Agent SHALL automatically start processing
 * @see Requirement 23.3: THE Manager_Agent SHALL decompose, assign, and monitor without manual intervention
 * @see Requirement 13.1: WHEN AI connection fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
 * @see Requirement 13.2: WHEN Tool_Call fails, THE System SHALL report error to AI and continue conversation
 * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
 *
 * @example
 * ```typescript
 * // Orchestratorの作成と初期化
 * const orchestrator = new Orchestrator();
 * await orchestrator.initialize();
 *
 * // タスクの送信
 * const taskId = await orchestrator.submitTask(
 *   'ユーザー認証機能を実装してください',
 *   'project-001'
 * );
 *
 * // タスクステータスの確認
 * const status = await orchestrator.getTaskStatus(taskId);
 * console.log(`進捗: ${status.progressPercent}%`);
 * ```
 */
export class Orchestrator implements IOrchestrator {
  /** State Manager */
  private stateManager: StateManager;

  /** Agent Bus */
  private agentBus: AgentBus;

  /** Worker Pool */
  private workerPool: WorkerPool;

  /** Manager Agent */
  private managerAgent: ManagerAgent;

  /** Error Handler */
  private errorHandler: ErrorHandler;

  /** Ticket Manager - チケット管理 */
  private ticketManager: TicketManager;

  /** PR Creator - Pull Request作成 */
  private prCreator: PRCreator;

  /** Review Workflow - レビューワークフロー */
  private reviewWorkflow: ReviewWorkflow;

  /** Worker Type Registry - ワーカータイプ管理 */
  private workerTypeRegistry: WorkerTypeRegistry;

  /** AI Health Checker - AI可用性チェック */
  private aiHealthChecker: AIHealthChecker;

  /** Execution Reporter - 実行レポート生成 */
  private executionReporter: ExecutionReporter;

  /** Quality Gate Integration - 品質ゲート統合 */
  private qualityGateIntegration: QualityGateIntegration;

  /** Run Directory Manager - 実行ディレクトリ管理 */
  private runDirectoryManager: RunDirectoryManager;

  /** Workflow Engine - ワークフローエンジン */
  private workflowEngine: WorkflowEngine;

  /** Meeting Coordinator - 会議調整 */
  private meetingCoordinator: MeetingCoordinator;

  /** Approval Gate - 承認ゲート */
  private approvalGate: ApprovalGate;

  /** AI可用性ステータス（最新のチェック結果） */
  private aiHealthStatus: AIHealthStatus | null = null;

  /** システム設定 */
  private systemConfig: SystemConfig;

  /** 管理中のタスク */
  private tasks: Map<TaskId, Task> = new Map();

  /** 実行状態マップ（RunId -> ExecutionState） */
  private executionStates: Map<RunId, ExecutionState> = new Map();

  /** 一時停止フラグ */
  private paused: boolean = false;

  /** 緊急停止フラグ */
  private emergencyStopped: boolean = false;

  /** 初期化済みフラグ */
  private initialized: boolean = false;

  /**
   * コンストラクタ
   * @param config - Orchestrator設定
   */
  constructor(config?: OrchestratorConfig) {
    // システム設定を初期化
    this.systemConfig = {
      ...DEFAULT_SYSTEM_CONFIG,
      ...config?.systemConfig,
    };

    // State Managerを設定
    this.stateManager = config?.stateManager ?? new StateManager();

    // Agent Busを設定
    this.agentBus = config?.agentBus ?? createAgentBus();

    // Worker Poolを設定
    this.workerPool = config?.workerPool ?? createWorkerPoolFromConfig(this.systemConfig);

    // Error Handlerを設定（エスカレーションコールバック付き）
    this.errorHandler =
      config?.errorHandler ??
      createErrorHandler({
        ...config?.errorHandlerOptions,
        onEscalation: async (info) => {
          await this.handleEscalation(info);
        },
      });

    // Manager Agentを設定
    if (config?.managerAgent) {
      this.managerAgent = config.managerAgent;
    } else {
      const managerConfig: ManagerAgentConfig = {
        agentId: DEFAULT_MANAGER_ID,
        adapterName: this.systemConfig.defaultAiAdapter,
        modelName: this.systemConfig.defaultModel,
        agentBus: this.agentBus,
        stateManager: this.stateManager,
      };
      this.managerAgent = createManagerAgent(managerConfig);
    }

    // Ticket Managerを設定
    this.ticketManager = config?.ticketManager ?? createTicketManager();

    // PR Creatorを設定
    this.prCreator = config?.prCreator ?? createPRCreator();

    // Review Workflowを設定
    this.reviewWorkflow = config?.reviewWorkflow ?? createReviewWorkflow();

    // Worker Type Registryを設定
    this.workerTypeRegistry = config?.workerTypeRegistry ?? createWorkerTypeRegistry();

    // AI Health Checkerを設定
    // @see Requirement 1.1: THE Orchestrator SHALL check AI adapter availability
    this.aiHealthChecker = config?.aiHealthChecker ?? createAIHealthChecker();

    // Execution Reporterを設定
    // @see Requirements: 5.1, 5.2, 5.3, 5.4
    this.executionReporter = config?.executionReporter ?? new ExecutionReporter();

    // Quality Gate Integrationを設定
    // @see Requirements: 4.1, 4.2, 4.3
    this.qualityGateIntegration = config?.qualityGateIntegration ?? createQualityGateIntegration();

    // Run Directory Managerを設定
    // @see Requirements: 2.4, 2.5
    this.runDirectoryManager = config?.runDirectoryManager ?? new RunDirectoryManager();

    // Approval Gateを設定
    // @see Requirements: 3.1, 3.2, 3.6, 3.7
    this.approvalGate = config?.approvalGate ?? createApprovalGate();

    // Meeting Coordinatorを設定
    // @see Requirements: 2.1, 2.2, 2.6, 2.7
    this.meetingCoordinator = config?.meetingCoordinator ?? createMeetingCoordinator(this.agentBus);

    // Workflow Engineを設定
    // @see Requirements: 1.1, 1.2, 1.3, 7.1
    this.workflowEngine =
      config?.workflowEngine ??
      createWorkflowEngine(this.meetingCoordinator, this.approvalGate);
  }

  // ===========================================================================
  // 初期化
  // ===========================================================================

  /**
   * Orchestratorを初期化
   * @description 各コンポーネントの初期化と状態の復元を行う
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Agent Busを初期化
    await this.agentBus.initialize();

    // 保存された設定を読み込み
    const savedConfig = await this.stateManager.loadConfig();
    this.systemConfig = { ...this.systemConfig, ...savedConfig };

    // Worker Poolの設定を更新
    this.workerPool.setMaxWorkers(this.systemConfig.maxConcurrentWorkers);

    // 保存された実行状態を復元
    await this.restoreSavedStates();

    // AI可用性チェック（graceful degradation: 失敗してもシステムは起動する）
    // @see Requirement 1.1: WHEN the system starts, THE Orchestrator SHALL check AI adapter availability
    // @see Requirement 1.5: THE System SHALL support graceful degradation when AI is temporarily unavailable
    try {
      this.aiHealthStatus = await this.aiHealthChecker.getHealthStatus();
      if (!this.aiHealthStatus.available) {
        console.warn('[Orchestrator] AI実行基盤が利用不可です');
        if (this.aiHealthStatus.setupInstructions) {
          console.warn(`[Orchestrator] ${this.aiHealthStatus.setupInstructions}`);
        }
      } else {
        console.log(
          `[Orchestrator] AI実行基盤: 利用可能 (モデル: ${this.aiHealthStatus.modelsInstalled.join(', ')})`
        );
      }
    } catch (error) {
      // AI可用性チェック失敗時もシステムは起動する（graceful degradation）
      console.warn('[Orchestrator] AI可用性チェックに失敗しました（システムは起動を継続）:', error);
      this.aiHealthStatus = null;
    }

    this.initialized = true;
    console.log('[Orchestrator] 初期化完了');
  }

  /**
   * 初期化を確認し、未初期化の場合は初期化を実行
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 保存された実行状態を復元
   */
  private async restoreSavedStates(): Promise<void> {
    try {
      const runs = await this.stateManager.listRuns({ status: 'running' });
      for (const run of runs) {
        const state = await this.stateManager.loadState(run.runId);
        if (state) {
          this.executionStates.set(run.runId, state);
          console.log(`[Orchestrator] 実行状態を復元: ${run.runId}`);
        }
      }
    } catch (error) {
      console.warn('[Orchestrator] 実行状態の復元に失敗:', error);
    }
  }

  // ===========================================================================
  // タスク管理
  // ===========================================================================

  /**
   * タスクを送信
   *
   * 社長（ユーザー）からの指示を受け取り、Manager Agentに自動的に処理を開始させる。
   * AI可用性チェック → 実行ディレクトリ作成 → メタデータ保存 → タスク処理開始の順で実行。
   *
   * @param instruction - 指示内容
   * @param projectId - プロジェクトID
   * @param options - 送信オプション
   * @returns タスクID
   *
   * @see Requirement 1.1: WHEN the system starts, THE Orchestrator SHALL check AI adapter availability
   * @see Requirement 2.4: WHEN a task is submitted, THE System SHALL create a run directory
   * @see Requirement 2.5: THE System SHALL persist task metadata to task.json
   * @see Requirement 23.2: WHEN President submits instruction via GUI, THE Manager_Agent SHALL automatically start processing
   */
  async submitTask(
    instruction: string,
    projectId: string,
    options?: SubmitTaskOptions
  ): Promise<TaskId> {
    await this.ensureInitialized();

    // 緊急停止中は新規タスクを受け付けない
    if (this.emergencyStopped) {
      throw new OrchestratorError(
        '緊急停止中のため、新規タスクを受け付けられません',
        'EMERGENCY_STOPPED'
      );
    }

    // 入力バリデーション
    if (!instruction || instruction.trim().length === 0) {
      throw new OrchestratorError('指示内容は必須です', 'INVALID_INPUT');
    }

    if (!projectId || projectId.trim().length === 0) {
      throw new OrchestratorError('プロジェクトIDは必須です', 'INVALID_INPUT');
    }

    // AI可用性チェック（タスク送信前に確認、結果をステータスに反映）
    // @see Requirement 1.1: THE Orchestrator SHALL check AI adapter availability
    // @see Requirement 1.2: IF Ollama is not available, display error message with setup instructions
    // @see Requirement 1.5: THE System SHALL support graceful degradation when AI is temporarily unavailable
    // 注: AI利用不可でもタスク送信自体はブロックしない（graceful degradation）
    //      OrchestratorServerレベルでブロック判断を行う
    try {
      const healthStatus = await this.aiHealthChecker.getHealthStatus();
      this.aiHealthStatus = healthStatus;

      if (!healthStatus.available) {
        console.warn('[Orchestrator] AI実行基盤が利用不可です（タスクは受付済み、実行時にエラーの可能性あり）');
        if (healthStatus.setupInstructions) {
          console.warn(`[Orchestrator] ${healthStatus.setupInstructions}`);
        }
      }
    } catch (error) {
      // ヘルスチェック自体の失敗はgraceful degradation（警告のみで続行）
      console.warn('[Orchestrator] AI可用性チェックに失敗しました（タスク処理は続行）:', error);
    }

    // タスクIDを生成
    const taskId = this.generateTaskId();
    const now = new Date().toISOString();

    // タスクを作成
    const task: Task = {
      id: taskId,
      projectId,
      instruction: instruction.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      subTasks: [],
      metadata: {
        priority: options?.priority ?? 'medium',
        deadline: options?.deadline,
        tags: options?.tags ?? [],
      },
    };

    // タスクを保存
    this.tasks.set(taskId, task);

    console.log(`[Orchestrator] タスクを受信: ${taskId}`);
    console.log(`[Orchestrator] 指示: ${instruction.substring(0, 100)}...`);

    // 実行ディレクトリを作成し、タスクメタデータを保存
    // @see Requirement 2.4: WHEN a task is submitted, THE System SHALL create a run directory
    // @see Requirement 2.5: THE System SHALL persist task metadata to task.json
    const runId = this.generateRunId();
    try {
      await this.runDirectoryManager.createRunDirectory(runId);

      const taskMetadata: RunTaskMetadata = {
        taskId,
        runId,
        projectId,
        instruction: instruction.trim(),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        aiAdapter: this.systemConfig.defaultAiAdapter,
        model: this.systemConfig.defaultModel,
      };
      await this.runDirectoryManager.saveTaskMetadata(runId, taskMetadata);
    } catch (dirError) {
      // ディレクトリ作成失敗時もタスク処理は継続（graceful degradation）
      console.warn(`[Orchestrator] 実行ディレクトリ作成に失敗: ${runId}`, dirError);
    }

    // 一時停止中でなければ自動的に処理を開始
    if (!this.paused) {
      // 非同期で処理を開始（awaitしない）
      this.startTaskProcessing(task, options?.autoDecompose ?? true, runId).catch((error) => {
        console.error(`[Orchestrator] タスク処理エラー: ${taskId}`, error);
        this.updateTaskStatus(taskId, 'failed');
      });
    }

    return taskId;
  }

  /**
   * タスク処理を開始
   *
   * Manager Agentにタスクを渡し、分解・割り当て・監視を自動的に行わせる。
   * タスク完了後に品質ゲート実行、成果物収集、レポート生成を行う。
   *
   * @param task - タスク
   * @param autoDecompose - 自動分解フラグ
   * @param preGeneratedRunId - 事前生成された実行ID（submitTaskで生成済み）
   *
   * @see Requirement 23.3: THE Manager_Agent SHALL decompose, assign, and monitor without manual intervention
   * @see Requirements: 4.1, 4.2, 4.3 (品質ゲート統合)
   * @see Requirements: 5.1, 5.2, 5.3 (レポート生成)
   */
  private async startTaskProcessing(
    task: Task,
    autoDecompose: boolean,
    preGeneratedRunId?: RunId
  ): Promise<void> {
    // タスクステータスを更新
    this.updateTaskStatus(task.id, 'decomposing');

    // 実行IDを使用（事前生成済みがあればそれを使用、なければ新規生成）
    const runId = preGeneratedRunId ?? this.generateRunId();
    const startTime = new Date().toISOString();

    // 実行状態を作成
    const executionState: ExecutionState = {
      runId,
      taskId: task.id,
      status: 'running',
      workerAssignments: {},
      conversationHistories: {},
      gitBranches: {},
      artifacts: [],
      lastUpdated: new Date().toISOString(),
    };

    // 実行状態を保存
    this.executionStates.set(runId, executionState);
    await this.stateManager.saveState(runId, executionState);

    // Manager Agentにタスクを渡す
    await this.managerAgent.receiveTask(task);

    // 自動分解が有効な場合
    if (autoDecompose) {
      // タスクを分解
      const subTasks = await this.managerAgent.decomposeTask(task);

      // タスクを更新
      task.subTasks = subTasks;
      task.status = 'executing';
      task.updatedAt = new Date().toISOString();
      this.tasks.set(task.id, task);

      // 進捗監視を開始
      this.managerAgent.startProgressMonitoring(runId);

      // ワーカーにタスクを割り当て、全結果を待つ
      const results = await this.assignSubTasksToWorkers(subTasks, runId, task.projectId);

      // ワーカー実行結果をExecutionStateに反映
      for (const result of results) {
        // 成果物パスを追加（ArtifactInfo -> string変換）
        for (const artifact of result.artifacts) {
          if (typeof artifact === 'string') {
            executionState.artifacts.push(artifact);
          } else {
            executionState.artifacts.push(artifact.path);
          }
        }

        // 会話履歴を記録
        if (result.conversationTurns > 0) {
          executionState.conversationHistories[result.agentId] = [];
        }

        // 失敗したワーカーの結果をExecutionStateに反映
        if (result.status === 'error' || result.status === 'quality_failed') {
          executionState.status = 'failed';
        }
      }

      // 実行状態を保存
      executionState.lastUpdated = new Date().toISOString();
      this.executionStates.set(runId, executionState);
      await this.stateManager.saveState(runId, executionState);
    }

    // タスク完了後の後処理（品質ゲート・レポート生成）
    // @see Requirements: 4.1, 4.2, 4.3 (品質ゲート統合)
    // @see Requirements: 5.1, 5.2, 5.3 (レポート生成)
    await this.finalizeTaskExecution(task, runId, executionState, startTime);
  }

  /**
   * タスク実行の後処理を実行
   *
   * 品質ゲートの実行、成果物の収集、レポートの生成・保存を行う。
   * 各ステップでエラーが発生しても、可能な限り後続処理を継続する。
   *
   * @param task - 実行対象タスク
   * @param runId - 実行ID
   * @param executionState - 実行状態
   * @param startTime - 実行開始日時（ISO8601形式）
   *
   * @see Requirement 4.1: WHEN a Worker_Agent completes code changes, THE System SHALL run lint automatically
   * @see Requirement 4.2: WHEN lint passes, THE System SHALL run tests automatically
   * @see Requirement 4.3: THE System SHALL record quality gate results to quality.json
   * @see Requirement 5.1: WHEN a task completes, THE System SHALL collect all artifacts to Run_Directory
   * @see Requirement 5.2: THE System SHALL generate a summary report at report.md
   * @see Requirement 5.3: THE report SHALL include: task description, changes made, test results, conversation summary
   */
  private async finalizeTaskExecution(
    task: Task,
    runId: RunId,
    executionState: ExecutionState,
    startTime: string
  ): Promise<void> {
    const endTime = new Date().toISOString();

    // --- 品質ゲート実行 ---
    // @see Requirement 4.1: THE System SHALL run lint automatically
    // @see Requirement 4.2: WHEN lint passes, THE System SHALL run tests automatically
    let qualityGatesPassed = false;
    try {
      const qualityResults = await this.qualityGateIntegration.runAllChecks('.');
      qualityGatesPassed = qualityResults.overall;

      // 品質ゲート結果を保存
      // @see Requirement 4.3: THE System SHALL record quality gate results to quality.json
      await this.qualityGateIntegration.saveResults(runId, qualityResults);

      if (qualityGatesPassed) {
        console.log(`[Orchestrator] 品質ゲート通過: ${runId}`);
      } else {
        console.warn(`[Orchestrator] 品質ゲート失敗: ${runId}`);
      }
    } catch (qgError) {
      // 品質ゲート実行エラーはログに記録して続行
      console.warn(`[Orchestrator] 品質ゲート実行エラー: ${runId}`, qgError);
    }

    // --- 成果物収集 ---
    // @see Requirement 5.1: WHEN a task completes, THE System SHALL collect all artifacts
    const artifacts = executionState.artifacts ?? [];
    try {
      if (artifacts.length > 0) {
        await this.executionReporter.collectArtifacts(runId, artifacts);
        console.log(`[Orchestrator] 成果物収集完了: ${runId} (${artifacts.length}件)`);
      }
    } catch (artifactError) {
      // 成果物収集エラーはログに記録して続行
      console.warn(`[Orchestrator] 成果物収集エラー: ${runId}`, artifactError);
    }

    // --- レポート生成 ---
    // @see Requirement 5.2: THE System SHALL generate a summary report at report.md
    // @see Requirement 5.3: THE report SHALL include: task description, changes made, test results, conversation summary
    try {
      // ExecutionResultを構築
      const executionResult: ExecutionResult = {
        runId,
        ticketId: task.id,
        agentId: this.managerAgent.agentId,
        status: qualityGatesPassed ? 'success' : 'quality_failed',
        startTime,
        endTime,
        artifacts,
        gitBranch: Object.values(executionState.gitBranches)[0] ?? '',
        commits: [],
        qualityGates: {
          lint: { passed: qualityGatesPassed, output: '' },
          test: { passed: qualityGatesPassed, output: '' },
          overall: qualityGatesPassed,
        },
        errors: [],
        conversationTurns: this.countConversationTurns(executionState),
        tokensUsed: 0,
      };

      // レポートを生成・保存
      const report = this.executionReporter.generateReport(runId, executionResult);
      await this.executionReporter.saveReport(runId, report);
      console.log(`[Orchestrator] レポート生成完了: ${runId}`);
    } catch (reportError) {
      // レポート生成エラーはログに記録して続行
      console.warn(`[Orchestrator] レポート生成エラー: ${runId}`, reportError);
    }

    // --- 実行状態の最終更新 ---
    executionState.status = qualityGatesPassed ? 'completed' : 'failed';
    executionState.lastUpdated = new Date().toISOString();
    this.executionStates.set(runId, executionState);
    await this.stateManager.saveState(runId, executionState);

    // タスクステータスの最終更新
    this.updateTaskStatus(task.id, qualityGatesPassed ? 'completed' : 'failed');
  }

  /**
   * 実行状態から会話ターン数を集計
   *
   * @param executionState - 実行状態
   * @returns 会話ターン数の合計
   */
  private countConversationTurns(executionState: ExecutionState): number {
    let totalTurns = 0;
    for (const history of Object.values(executionState.conversationHistories)) {
      if (Array.isArray(history)) {
        totalTurns += history.length;
      }
    }
    return totalTurns;
  }

  /**
   * サブタスクをワーカーに割り当て
   *
   * @param subTasks - サブタスク一覧
   * @param runId - 実行ID
   * @param _projectId - プロジェクトID（将来の拡張用）
   */
  /**
   * サブタスクをワーカーに割り当て、全ワーカーの実行結果を収集する
   *
   * 各ワーカーの executeTask の Promise を収集し、Promise.allSettled で
   * 全ワーカーの完了を待つ。ワーカーが利用できない場合はキューに追加し、
   * 割り当て後の結果も収集する。
   *
   * @param subTasks - サブタスク一覧
   * @param runId - 実行ID
   * @param _projectId - プロジェクトID（将来使用）
   * @returns 全ワーカーの実行結果配列
   *
   * @see Requirements: 9.3, 9.4 (ワーカー管理)
   */
  private async assignSubTasksToWorkers(
    subTasks: SubTask[],
    runId: RunId,
    _projectId: string
  ): Promise<ExecutionResult[]> {
    // 並列実行可能なタスクを取得
    const parallelizableTasks = subTasks.filter((t) => t.status === 'pending');

    // 各ワーカーの実行結果Promiseを収集
    const resultPromises: Promise<ExecutionResult>[] = [];

    for (const subTask of parallelizableTasks) {
      // 利用可能なワーカーを取得
      const worker = await this.workerPool.getAvailableWorker({ runId });

      if (worker) {
        // ワーカーにタスクを割り当て
        await this.managerAgent.assignTask(subTask, worker.agentId);

        // 実行状態を更新
        const state = this.executionStates.get(runId);
        if (state) {
          state.workerAssignments[worker.agentId] = subTask;
          state.lastUpdated = new Date().toISOString();
          await this.stateManager.saveState(runId, state);
        }

        // ワーカーのタスク実行Promiseを収集
        resultPromises.push(
          worker.executeTask(subTask, { runId })
        );
      } else {
        // ワーカーが利用できない場合はキューに追加し、Promiseで結果を待つ
        const pendingPromise = new Promise<ExecutionResult>((resolve, reject) => {
          this.workerPool.addPendingTask(subTask, runId, {
            onAssigned: async (workerId) => {
              try {
                await this.managerAgent.assignTask(subTask, workerId);

                // 割り当てられたワーカーの情報を取得
                const workerInfo = this.workerPool.getWorkerInfo(workerId);
                if (workerInfo) {
                  const result = await workerInfo.agent.executeTask(subTask, { runId });
                  resolve(result);
                } else {
                  reject(new OrchestratorError(
                    `ワーカー ${workerId} の情報が取得できません`,
                    'WORKER_NOT_FOUND'
                  ));
                }
              } catch (error) {
                reject(error);
              }
            },
          });
        });
        resultPromises.push(pendingPromise);
      }
    }

    // 全ワーカーの完了を待つ
    const settledResults = await Promise.allSettled(resultPromises);

    // 結果を収集（成功・失敗を分けて返す）
    const results: ExecutionResult[] = [];
    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        // 失敗した場合はエラー結果を生成
        const errorResult: ExecutionResult = {
          runId,
          ticketId: '',
          agentId: 'unknown',
          status: 'error',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          artifacts: [],
          gitBranch: '',
          commits: [],
          qualityGates: {
            lint: { passed: false, output: '' },
            test: { passed: false, output: '' },
            overall: false,
          },
          errors: [{
            code: 'WORKER_EXECUTION_FAILED',
            message: settled.reason instanceof Error
              ? settled.reason.message
              : String(settled.reason),
            timestamp: new Date().toISOString(),
            category: 'execution' as ErrorCategory,
            severity: 'high',
          }],
          conversationTurns: 0,
          tokensUsed: 0,
        };
        results.push(errorResult);
      }
    }

    return results;
  }

  /**
   * タスクステータスを取得
   *
   * @param taskId - タスクID
   * @returns タスクステータス詳細
   */
  async getTaskStatus(taskId: TaskId): Promise<TaskStatusDetail> {
    await this.ensureInitialized();

    const task = this.tasks.get(taskId);
    if (!task) {
      throw new OrchestratorError(`タスクが見つかりません: ${taskId}`, 'TASK_NOT_FOUND');
    }

    // サブタスクのステータスを集計
    const subTasks = task.subTasks;
    const completedSubTasks = subTasks.filter((t) => t.status === 'completed').length;
    const runningSubTasks = subTasks.filter(
      (t) => t.status === 'running' || t.status === 'assigned'
    ).length;
    const failedSubTasks = subTasks.filter((t) => t.status === 'failed').length;

    // 進捗率を計算
    const progressPercent =
      subTasks.length > 0 ? Math.round((completedSubTasks / subTasks.length) * 100) : 0;

    return {
      taskId: task.id,
      status: task.status,
      progressPercent,
      totalSubTasks: subTasks.length,
      completedSubTasks,
      runningSubTasks,
      failedSubTasks,
      assignedManager: task.assignedManager,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  /**
   * タスクをキャンセル
   *
   * @param taskId - タスクID
   */
  async cancelTask(taskId: TaskId): Promise<void> {
    await this.ensureInitialized();

    const task = this.tasks.get(taskId);
    if (!task) {
      throw new OrchestratorError(`タスクが見つかりません: ${taskId}`, 'TASK_NOT_FOUND');
    }

    // 既に完了または失敗している場合はエラー
    if (task.status === 'completed' || task.status === 'failed') {
      throw new OrchestratorError(
        `タスクは既に${task.status === 'completed' ? '完了' : '失敗'}しています`,
        'INVALID_STATE'
      );
    }

    // タスクステータスを更新
    this.updateTaskStatus(taskId, 'failed');

    // 関連する実行状態を更新
    for (const [runId, state] of this.executionStates) {
      if (state.taskId === taskId) {
        state.status = 'failed';
        state.lastUpdated = new Date().toISOString();
        await this.stateManager.saveState(runId, state);
      }
    }

    // 進捗監視を停止
    this.managerAgent.stopProgressMonitoring();

    console.log(`[Orchestrator] タスクをキャンセル: ${taskId}`);
  }

  /**
   * タスクを再開
   *
   * @param runId - 実行ID
   */
  async resumeTask(runId: RunId): Promise<void> {
    await this.ensureInitialized();

    // 保存された状態を読み込み
    const state = await this.stateManager.loadState(runId);
    if (!state) {
      throw new OrchestratorError(`実行状態が見つかりません: ${runId}`, 'STATE_NOT_FOUND');
    }

    // タスクを取得
    const task = this.tasks.get(state.taskId);
    if (!task) {
      throw new OrchestratorError(`タスクが見つかりません: ${state.taskId}`, 'TASK_NOT_FOUND');
    }

    // 実行状態を復元
    this.executionStates.set(runId, state);
    state.status = 'running';
    state.lastUpdated = new Date().toISOString();
    await this.stateManager.saveState(runId, state);

    // タスクステータスを更新
    this.updateTaskStatus(task.id, 'executing');

    // 進捗監視を再開
    this.managerAgent.startProgressMonitoring(runId);

    console.log(`[Orchestrator] タスクを再開: ${runId}`);
  }

  /**
   * タスクステータスを更新
   *
   * @param taskId - タスクID
   * @param status - 新しいステータス
   */
  private updateTaskStatus(taskId: TaskId, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      this.tasks.set(taskId, task);
    }
  }

  // ===========================================================================
  // エージェント管理
  // ===========================================================================

  /**
   * アクティブなエージェント一覧を取得
   *
   * @returns エージェント情報の配列
   */
  async getActiveAgents(): Promise<AgentInfo[]> {
    await this.ensureInitialized();

    const agents: AgentInfo[] = [];
    const now = new Date().toISOString();

    // Manager Agentを追加
    // 緊急停止が最優先、次に一時停止をチェック
    let managerStatus: AgentInfo['status'] = 'working';
    if (this.emergencyStopped) {
      managerStatus = 'terminated';
    } else if (this.paused) {
      managerStatus = 'paused';
    }

    agents.push({
      id: this.managerAgent.agentId,
      type: 'manager',
      status: managerStatus,
      lastActiveAt: now,
    });

    // Worker Poolからワーカー情報を取得
    const workers = this.workerPool.getAllWorkers();
    for (const worker of workers) {
      agents.push({
        id: worker.workerId,
        type: 'worker',
        status: this.mapWorkerStatus(worker.status),
        currentTask: worker.currentTask
          ? {
              taskId: worker.currentTask.id,
              title: worker.currentTask.title,
            }
          : undefined,
        lastActiveAt: worker.lastActiveAt,
      });
    }

    return agents;
  }

  /**
   * ワーカーステータスをエージェントステータスにマッピング
   *
   * @param workerStatus - ワーカーステータス
   * @returns エージェントステータス
   */
  private mapWorkerStatus(
    workerStatus: 'idle' | 'working' | 'error' | 'terminated'
  ): AgentInfo['status'] {
    // 緊急停止が最優先
    if (this.emergencyStopped) {
      return 'terminated';
    }
    // 次に一時停止をチェック
    if (this.paused) {
      return 'paused';
    }
    return workerStatus;
  }

  /**
   * 全エージェントを一時停止
   */
  async pauseAllAgents(): Promise<void> {
    await this.ensureInitialized();

    this.paused = true;

    // 進捗監視を停止
    this.managerAgent.stopProgressMonitoring();

    // 実行状態を更新
    for (const [runId, state] of this.executionStates) {
      if (state.status === 'running') {
        state.status = 'paused';
        state.lastUpdated = new Date().toISOString();
        await this.stateManager.saveState(runId, state);
      }
    }

    console.log('[Orchestrator] 全エージェントを一時停止');
  }

  /**
   * 全エージェントを再開
   */
  async resumeAllAgents(): Promise<void> {
    await this.ensureInitialized();

    if (this.emergencyStopped) {
      throw new OrchestratorError(
        '緊急停止中のため、再開できません。システムを再起動してください。',
        'EMERGENCY_STOPPED'
      );
    }

    this.paused = false;

    // 一時停止中の実行状態を再開
    for (const [runId, state] of this.executionStates) {
      if (state.status === 'paused') {
        state.status = 'running';
        state.lastUpdated = new Date().toISOString();
        await this.stateManager.saveState(runId, state);

        // 進捗監視を再開
        this.managerAgent.startProgressMonitoring(runId);
      }
    }

    console.log('[Orchestrator] 全エージェントを再開');
  }

  /**
   * 緊急停止
   *
   * 全てのエージェントを即座に停止し、実行中のタスクを中断する。
   */
  async emergencyStop(): Promise<void> {
    await this.ensureInitialized();

    console.log('[Orchestrator] 緊急停止を開始');

    this.emergencyStopped = true;
    this.paused = true;

    // 進捗監視を停止
    this.managerAgent.stopProgressMonitoring();

    // Worker Poolを停止
    await Promise.race([this.workerPool.stop(), this.sleep(EMERGENCY_STOP_TIMEOUT_MS)]);

    // 全ての実行状態を失敗に更新
    for (const [runId, state] of this.executionStates) {
      if (state.status === 'running' || state.status === 'paused') {
        state.status = 'failed';
        state.lastUpdated = new Date().toISOString();
        await this.stateManager.saveState(runId, state);
      }
    }

    // 全てのタスクを失敗に更新
    for (const [taskId, task] of this.tasks) {
      if (task.status !== 'completed' && task.status !== 'failed') {
        this.updateTaskStatus(taskId, 'failed');
      }
    }

    console.log('[Orchestrator] 緊急停止完了');
  }

  // ===========================================================================
  // 設定管理
  // ===========================================================================

  /**
   * システム設定を更新
   *
   * @param config - 更新する設定（部分的）
   */
  async updateConfig(config: Partial<SystemConfig>): Promise<void> {
    await this.ensureInitialized();

    // 設定をマージ
    this.systemConfig = {
      ...this.systemConfig,
      ...config,
    };

    // Worker Poolの設定を更新
    if (config.maxConcurrentWorkers !== undefined) {
      this.workerPool.setMaxWorkers(config.maxConcurrentWorkers);
    }

    if (config.containerRuntime !== undefined) {
      this.workerPool.setContainerRuntime(config.containerRuntime);
    }

    // 設定を保存
    await this.stateManager.saveConfig(this.systemConfig);

    console.log('[Orchestrator] システム設定を更新');
  }

  /**
   * システム設定を取得
   *
   * @returns システム設定
   */
  async getConfig(): Promise<SystemConfig> {
    await this.ensureInitialized();
    return { ...this.systemConfig };
  }

  // ===========================================================================
  // ユーティリティメソッド
  // ===========================================================================

  /**
   * タスクIDを生成
   * @returns 一意のタスクID
   */
  private generateTaskId(): TaskId {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomUUID().substring(0, 8);
    return `${TASK_ID_PREFIX}-${timestamp}-${random}`;
  }

  /**
   * 実行IDを生成
   * @returns 一意の実行ID
   */
  private generateRunId(): RunId {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomUUID().substring(0, 8);
    return `${RUN_ID_PREFIX}-${timestamp}-${random}`;
  }

  /**
   * スリープ
   * @param ms - ミリ秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // エラーハンドリング
  // ===========================================================================

  /**
   * エスカレーションを処理
   *
   * ErrorHandlerからのエスカレーションを受け取り、適切な対応を行う。
   *
   * @param info - エスカレーション情報
   *
   * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
   */
  private async handleEscalation(info: EscalationInfo): Promise<void> {
    console.error(`[Orchestrator] エスカレーション受信: ${info.category}`);
    console.error(`[Orchestrator] エージェント: ${info.agentId}, 理由: ${info.reason}`);

    // Agent Busを通じてManager Agentに通知
    try {
      await this.agentBus.send({
        id: crypto.randomUUID(),
        type: 'escalate',
        from: info.agentId,
        to: this.managerAgent.agentId,
        payload: {
          runId: info.runId,
          category: info.category,
          error: info.error,
          attempts: info.attempts,
          reason: info.reason,
        },
        timestamp: info.timestamp,
      });
    } catch (busError) {
      console.error('[Orchestrator] エスカレーション通知失敗:', busError);
    }

    // 実行状態を更新
    const state = this.executionStates.get(info.runId);
    if (state) {
      // エラーカテゴリに応じた対応
      if (!info.error.recoverable) {
        state.status = 'failed';
        state.lastUpdated = new Date().toISOString();
        await this.stateManager.saveState(info.runId, state);
      }
    }
  }

  /**
   * リトライ付きで操作を実行
   *
   * 指数バックオフ付きリトライを使用して操作を実行する。
   *
   * @param operation - 実行する操作
   * @param context - エラーコンテキスト
   * @returns リトライ結果
   *
   * @see Requirement 13.1: WHEN AI connection fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
   *
   * @example
   * ```typescript
   * const result = await orchestrator.executeWithRetry(
   *   () => aiAdapter.chat(options),
   *   { category: 'ai_connection', runId: 'run-001', agentId: 'worker-001' }
   * );
   * ```
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      category: ErrorCategory;
      runId: RunId;
      agentId: AgentId;
      customRetryConfig?: Partial<RetryConfig>;
    }
  ): Promise<RetryResult<T>> {
    return this.errorHandler.withRetry(operation, context);
  }

  /**
   * ツール呼び出しエラーを処理
   *
   * エラーをAIに報告可能な形式に変換し、会話を継続できるようにする。
   *
   * @param error - 発生したエラー
   * @param toolName - ツール名
   * @param runId - 実行ID
   * @returns AIに報告するエラーメッセージ
   *
   * @see Requirement 13.2: WHEN Tool_Call fails, THE System SHALL report error to AI and continue conversation
   */
  async handleToolCallError(error: Error, toolName: string, runId: RunId): Promise<string> {
    return this.errorHandler.handleToolCallError(error, toolName, runId);
  }

  /**
   * エラーをログに記録
   *
   * @param runId - 実行ID
   * @param error - エラー情報
   *
   * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
   */
  async logError(runId: RunId, error: ErrorInfo): Promise<void> {
    await this.errorHandler.logError(runId, error);
  }

  /**
   * フォールバック付きで操作を実行
   *
   * @param primary - プライマリ操作
   * @param fallback - フォールバック操作
   * @param context - エラーコンテキスト
   * @returns 操作結果
   */
  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    context: {
      runId: RunId;
      agentId: AgentId;
    }
  ): Promise<{ result: T; usedFallback: boolean }> {
    return this.errorHandler.withFallback(primary, fallback, context);
  }

  // ===========================================================================
  // 状態取得メソッド（テスト・デバッグ用）
  // ===========================================================================

  /**
   * 一時停止状態を取得
   * @returns 一時停止中の場合はtrue
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * 緊急停止状態を取得
   * @returns 緊急停止中の場合はtrue
   */
  isEmergencyStopped(): boolean {
    return this.emergencyStopped;
  }

  /**
   * 初期化状態を取得
   * @returns 初期化済みの場合はtrue
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * タスクを取得
   * @param taskId - タスクID
   * @returns タスク（存在しない場合はundefined）
   */
  getTask(taskId: TaskId): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 全タスクを取得
   * @returns タスクの配列
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 実行状態を取得
   * @param runId - 実行ID
   * @returns 実行状態（存在しない場合はundefined）
   */
  getExecutionState(runId: RunId): ExecutionState | undefined {
    return this.executionStates.get(runId);
  }

  /**
   * Manager Agentを取得
   * @returns Manager Agent
   */
  getManagerAgent(): ManagerAgent {
    return this.managerAgent;
  }

  /**
   * Worker Poolを取得
   * @returns Worker Pool
   */
  getWorkerPool(): WorkerPool {
    return this.workerPool;
  }

  /**
   * Agent Busを取得
   * @returns Agent Bus
   */
  getAgentBus(): AgentBus {
    return this.agentBus;
  }

  /**
   * State Managerを取得
   * @returns State Manager
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * Error Handlerを取得
   * @returns Error Handler
   */
  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
  }

  /**
   * Ticket Managerを取得
   * @returns Ticket Manager
   */
  getTicketManager(): TicketManager {
    return this.ticketManager;
  }

  /**
   * PR Creatorを取得
   * @returns PR Creator
   */
  getPRCreator(): PRCreator {
    return this.prCreator;
  }

  /**
   * Review Workflowを取得
   * @returns Review Workflow
   */
  getReviewWorkflow(): ReviewWorkflow {
    return this.reviewWorkflow;
  }

  /**
   * Worker Type Registryを取得
   * @returns Worker Type Registry
   */
  getWorkerTypeRegistry(): WorkerTypeRegistry {
    return this.workerTypeRegistry;
  }

  /**
   * AI Health Checkerを取得
   * @returns AI Health Checker
   */
  getAIHealthChecker(): AIHealthChecker {
    return this.aiHealthChecker;
  }

  /**
   * Execution Reporterを取得
   * @returns Execution Reporter
   */
  getExecutionReporter(): ExecutionReporter {
    return this.executionReporter;
  }

  /**
   * Quality Gate Integrationを取得
   * @returns Quality Gate Integration
   */
  getQualityGateIntegration(): QualityGateIntegration {
    return this.qualityGateIntegration;
  }

  /**
   * Run Directory Managerを取得
   * @returns Run Directory Manager
   */
  getRunDirectoryManager(): RunDirectoryManager {
    return this.runDirectoryManager;
  }

  /**
   * Workflow Engineを取得
   * @returns Workflow Engine
   * @see Requirements: 1.1, 7.1
   */
  getWorkflowEngine(): WorkflowEngine {
    return this.workflowEngine;
  }

  /**
   * Meeting Coordinatorを取得
   * @returns Meeting Coordinator
   * @see Requirements: 2.1, 2.2
   */
  getMeetingCoordinator(): MeetingCoordinator {
    return this.meetingCoordinator;
  }

  /**
   * Approval Gateを取得
   * @returns Approval Gate
   * @see Requirements: 3.1, 3.2
   */
  getApprovalGate(): ApprovalGate {
    return this.approvalGate;
  }

  /**
   * AI可用性ステータスを取得
   * @returns 最新のAI可用性ステータス（未チェックの場合はnull）
   * @see Requirement 1.1: THE Orchestrator SHALL check AI adapter availability
   */
  getAIHealthStatus(): AIHealthStatus | null {
    return this.aiHealthStatus;
  }

  /**
   * AI可用性を再チェック
   * @returns 最新のAI可用性ステータス
   * @see Requirement 1.1: THE Orchestrator SHALL check AI adapter availability
   */
  async recheckAIHealth(): Promise<AIHealthStatus> {
    this.aiHealthStatus = await this.aiHealthChecker.getHealthStatus();
    return this.aiHealthStatus;
  }

  // ===========================================================================
  // チケットベースワークフロー
  // ===========================================================================

  /**
   * チケットからワークフローを実行
   * @param ticketId - 親チケットID
   * @returns 実行ID
   * @see Requirements: 2.1, 2.2, 2.3, 2.4
   */
  async executeTicketWorkflow(ticketId: string): Promise<RunId> {
    if (!this.initialized) {
      throw new OrchestratorError('Orchestrator is not initialized', 'NOT_INITIALIZED');
    }

    // チケットを取得
    const ticket = await this.ticketManager.getParentTicket(ticketId);
    if (!ticket) {
      throw new OrchestratorError(`Ticket not found: ${ticketId}`, 'TICKET_NOT_FOUND');
    }

    // 実行IDを生成
    const runId = this.generateRunId();

    // チケットステータスを更新
    await this.ticketManager.updateTicketStatus(ticketId, 'decomposing');

    // タスクとして送信（戻り値は将来のチケット追跡用に保持可能）
    await this.submitTask(ticket.instruction, ticket.projectId, {
      priority: ticket.metadata.priority,
      tags: ticket.metadata.tags,
      deadline: ticket.metadata.deadline,
    });

    // チケットとタスクを関連付け
    await this.ticketManager.updateTicketStatus(ticketId, 'in_progress');

    return runId;
  }

  /**
   * チケットのレビューをリクエスト
   * @param ticketId - チケットID
   * @param reviewerId - レビュアーID
   * @returns レビューリクエストID
   * @see Requirements: 5.1, 5.2
   */
  async requestTicketReview(ticketId: string, reviewerId: string): Promise<string> {
    // チケットステータスを更新
    await this.ticketManager.updateTicketStatus(ticketId, 'review_requested');

    // レビューをリクエスト
    const reviewId = await this.reviewWorkflow.requestReview({
      ticketId,
      reviewerId,
      requestedAt: new Date().toISOString(),
    });

    return reviewId;
  }

  /**
   * チケットのPRを作成
   * @param ticketId - 親チケットID
   * @returns PR作成結果
   * @see Requirements: 10.1, 10.2, 10.3
   */
  async createTicketPR(
    ticketId: string
  ): Promise<{ success: boolean; prUrl?: string; error?: string }> {
    // チケットを取得
    const ticket = await this.ticketManager.getParentTicket(ticketId);
    if (!ticket) {
      return { success: false, error: `Ticket not found: ${ticketId}` };
    }

    // PR作成
    const result = await this.prCreator.createPullRequest({
      ticketId,
      projectId: ticket.projectId,
      title: `[AgentCompany] ${ticket.instruction.substring(0, 50)}`,
      body: this.generatePRBody(ticket),
    });

    if (result.success) {
      // チケットステータスを更新
      await this.ticketManager.updateTicketStatus(ticketId, 'pr_created');
    }

    return result;
  }

  /**
   * PR本文を生成
   * @param ticket - 親チケット
   * @returns PR本文
   */
  private generatePRBody(ticket: ParentTicket): string {
    const childSummary = ticket.childTickets
      .map((child) => `- ${child.title} (${child.status})`)
      .join('\n');

    return `## Overview
${ticket.instruction}

## Changes
${childSummary}

## Ticket ID
${ticket.id}

## Created by
AgentCompany Autonomous Workflow
`;
  }
}

// =============================================================================
// エラークラス
// =============================================================================

/**
 * Orchestratorエラー
 */
export class OrchestratorError extends Error {
  /** エラーコード */
  readonly code: string;

  /** 元のエラー */
  readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = 'OrchestratorError';
    this.code = code;
    this.cause = cause;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * Orchestratorを作成
 *
 * @param config - Orchestrator設定
 * @returns Orchestratorインスタンス
 *
 * @example
 * ```typescript
 * // デフォルト設定でOrchestratorを作成
 * const orchestrator = createOrchestrator();
 *
 * // カスタム設定でOrchestratorを作成
 * const customOrchestrator = createOrchestrator({
 *   systemConfig: {
 *     maxConcurrentWorkers: 5,
 *     defaultAiAdapter: 'gemini',
 *   },
 * });
 * ```
 */
export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}

/**
 * システム設定からOrchestratorを作成
 *
 * @param systemConfig - システム設定
 * @returns Orchestratorインスタンス
 */
export function createOrchestratorFromConfig(systemConfig: Partial<SystemConfig>): Orchestrator {
  return new Orchestrator({ systemConfig });
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default Orchestrator;
