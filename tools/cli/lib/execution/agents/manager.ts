/**
 * Manager Agent - タスク管理エージェント
 *
 * 社長（ユーザー）からの指示を受け取り、タスクを分解して
 * ワーカーエージェントに割り当てる上司エージェント。
 *
 * @module execution/agents/manager
 * @see Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 13.3, 13.4
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AgentId,
  RunId,
  Task,
  SubTask,
  TaskStatus,
  SubTaskStatus,
  ExecutionResult,
  AgentMessage,
  Project,
  ErrorInfo,
} from '../types';
import { AgentBus, createAgentBus } from '../agent-bus';
import { StateManager } from '../state-manager';
import {
  TaskDecomposer,
  createTaskDecomposer,
  ProjectContext,
  DecomposeOptions,
  DecomposeResult,
} from '../decomposer';
import { BaseAdapter } from '../../../../adapters/base';
import { getAdapter } from '../../../../adapters/index';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのポーリング間隔（ミリ秒）
 */
const DEFAULT_POLL_INTERVAL = 1000;

/**
 * デフォルトのポーリングタイムアウト（ミリ秒）
 */
const DEFAULT_POLL_TIMEOUT = 5000;

/**
 * 失敗通知のしきい値（連続失敗回数）
 * @see Requirement 13.3: WHEN Worker_Agent fails repeatedly
 */
const FAILURE_NOTIFICATION_THRESHOLD = 3;

/**
 * 進捗監視の更新間隔（ミリ秒）
 */
const PROGRESS_MONITOR_INTERVAL = 2000;

/**
 * エラーログファイル名
 * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
 */
const ERROR_LOG_FILENAME = 'errors.log';

/**
 * ランタイムディレクトリのベースパス
 */
const RUNTIME_BASE_PATH = 'runtime/runs';

// =============================================================================
// 型定義
// =============================================================================

/**
 * Manager Agent設定
 */
export interface ManagerAgentConfig {
  /** エージェントID */
  agentId: AgentId;
  /** 使用するAIアダプタ名 */
  adapterName?: string;
  /** 使用するモデル名 */
  modelName?: string;
  /** Agent Bus（オプション、指定しない場合は新規作成） */
  agentBus?: AgentBus;
  /** State Manager（オプション、指定しない場合は新規作成） */
  stateManager?: StateManager;
  /** ポーリング間隔（ミリ秒） */
  pollInterval?: number;
  /** ポーリングタイムアウト（ミリ秒） */
  pollTimeout?: number;
}

/**
 * ワーカー仕様
 * @description 新しいワーカーを雇用する際の仕様
 */
export interface WorkerSpec {
  /** ワーカー名 */
  name: string;
  /** 能力一覧 */
  capabilities: string[];
  /** AIアダプタ名 */
  adapterName?: string;
  /** モデル名 */
  modelName?: string;
  /** 優先度（高いほど優先的に割り当て） */
  priority?: number;
  /** リソース制限 */
  resourceLimits?: {
    cpuLimit?: string;
    memoryLimit?: string;
    timeoutSeconds?: number;
  };
}

/**
 * ワーカー情報
 * @description 登録済みワーカーの詳細情報
 * @see Requirement 1.6: THE Manager_Agent SHALL be able to dynamically hire/fire Worker_Agents
 */
export interface WorkerInfo {
  /** ワーカーID */
  id: AgentId;
  /** ワーカー名 */
  name: string;
  /** 能力一覧 */
  capabilities: string[];
  /** ステータス */
  status: 'idle' | 'working' | 'error' | 'terminated';
  /** 雇用日時（ISO8601形式） */
  hiredAt: string;
  /** 最終アクティビティ日時（ISO8601形式） */
  lastActivityAt: string;
  /** 完了タスク数 */
  completedTasks: number;
  /** 失敗タスク数 */
  failedTasks: number;
  /** 連続失敗回数 */
  consecutiveFailures: number;
  /** ヘルススコア（0-100） */
  healthScore: number;
  /** 優先度 */
  priority: number;
  /** AIアダプタ名 */
  adapterName?: string;
  /** モデル名 */
  modelName?: string;
}

/**
 * ワークロード情報
 * @description 現在のワークロード状況
 * @see Requirement 1.6: dynamically hire/fire Worker_Agents based on workload
 */
export interface WorkloadInfo {
  /** 保留中タスク数 */
  pendingTasks: number;
  /** 実行中タスク数 */
  runningTasks: number;
  /** アイドルワーカー数 */
  idleWorkers: number;
  /** アクティブワーカー数 */
  activeWorkers: number;
  /** 総ワーカー数 */
  totalWorkers: number;
  /** ワークロード比率（保留タスク / アクティブワーカー） */
  workloadRatio: number;
  /** スケーリング推奨 */
  scalingRecommendation: 'scale_up' | 'scale_down' | 'maintain';
}

/**
 * スケーリング設定
 * @description 動的スケーリングの設定
 */
export interface ScalingConfig {
  /** 最小ワーカー数 */
  minWorkers: number;
  /** 最大ワーカー数 */
  maxWorkers: number;
  /** スケールアップしきい値（保留タスク/ワーカー比率） */
  scaleUpThreshold: number;
  /** スケールダウンしきい値（アイドルワーカー比率） */
  scaleDownThreshold: number;
  /** スケーリングクールダウン（ミリ秒） */
  scalingCooldown: number;
  /** 自動スケーリング有効フラグ */
  autoScalingEnabled: boolean;
}

/**
 * デフォルトスケーリング設定
 */
export const DEFAULT_SCALING_CONFIG: ScalingConfig = {
  minWorkers: 1,
  maxWorkers: 10,
  scaleUpThreshold: 2.0,    // 保留タスクがワーカー数の2倍以上でスケールアップ
  scaleDownThreshold: 0.5,  // アイドルワーカーが50%以上でスケールダウン
  scalingCooldown: 30000,   // 30秒のクールダウン
  autoScalingEnabled: true,
};

/**
 * 進捗レポート
 * @description タスク実行の進捗状況
 */
export interface ProgressReport {
  /** 総タスク数 */
  totalTasks: number;
  /** 完了タスク数 */
  completedTasks: number;
  /** 実行中タスク数 */
  runningTasks: number;
  /** 失敗タスク数 */
  failedTasks: number;
  /** 保留中タスク数 */
  pendingTasks: number;
  /** ワーカー割り当て状況 */
  workerAssignments: Map<AgentId, SubTask | null>;
  /** 最終更新日時 */
  lastUpdated: string;
}

/**
 * 詳細進捗レポート
 * @description リアルタイム進捗監視用の詳細レポート
 * @see Requirement 1.5: THE Manager_Agent SHALL monitor Worker_Agent progress
 */
export interface DetailedProgressReport extends ProgressReport {
  /** 実行ID */
  runId?: RunId;
  /** タスクID */
  taskId?: string;
  /** ワーカー別進捗 */
  workerProgress: WorkerProgressInfo[];
  /** 失敗履歴 */
  failureHistory: FailureRecord[];
  /** 推定完了時間（ISO8601形式） */
  estimatedCompletionTime?: string;
  /** 全体進捗率（0-100） */
  overallProgressPercent: number;
  /** アクティブなエスカレーション数 */
  activeEscalations: number;
}

/**
 * ワーカー進捗情報
 * @description 個別ワーカーの進捗状況
 */
export interface WorkerProgressInfo {
  /** ワーカーID */
  workerId: AgentId;
  /** 現在のサブタスク */
  currentSubTask: SubTask | null;
  /** ステータス */
  status: 'idle' | 'working' | 'error' | 'waiting_support';
  /** 開始時刻（ISO8601形式） */
  startedAt?: string;
  /** 連続失敗回数 */
  consecutiveFailures: number;
  /** 最終アクティビティ時刻（ISO8601形式） */
  lastActivityAt: string;
}

/**
 * 失敗記録
 * @description ワーカーの失敗履歴
 * @see Requirement 13.3: WHEN Worker_Agent fails repeatedly
 */
export interface FailureRecord {
  /** 記録ID */
  id: string;
  /** ワーカーID */
  workerId: AgentId;
  /** サブタスクID */
  subTaskId: string;
  /** エラー情報 */
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  /** 発生時刻（ISO8601形式） */
  timestamp: string;
  /** 提供されたサポート */
  supportProvided?: string;
  /** 解決済みフラグ */
  resolved: boolean;
}

/**
 * エスカレーション情報
 * @description ワーカーからのエスカレーション
 */
export interface Escalation {
  /** エスカレーションID */
  id: string;
  /** 送信元ワーカーID */
  workerId: AgentId;
  /** サブタスクID */
  subTaskId: string;
  /** 問題の説明 */
  issue: string;
  /** エスカレーション種別 */
  type: 'error' | 'blocked' | 'help_needed' | 'quality_failed';
  /** タイムスタンプ */
  timestamp: string;
}

/**
 * 問題情報
 * @description ワーカーが直面している問題
 */
export interface Issue {
  /** 問題の説明 */
  description: string;
  /** エラーメッセージ（オプション） */
  errorMessage?: string;
  /** 関連ファイル（オプション） */
  relatedFiles?: string[];
  /** 試行回数 */
  attemptCount: number;
}

/**
 * ガイダンス
 * @description マネージャーからワーカーへのサポート
 */
export interface Guidance {
  /** ガイダンスID */
  id: string;
  /** 対象ワーカーID */
  workerId: AgentId;
  /** アドバイス内容 */
  advice: string;
  /** 推奨アクション */
  suggestedActions: string[];
  /** 追加リソース（オプション） */
  additionalResources?: string[];
  /** タイムスタンプ */
  timestamp: string;
}

/**
 * 失敗分析結果
 * @description 失敗パターンの分析結果
 * @see Requirement 13.4: THE Manager_Agent SHALL analyze failure
 */
export interface FailureAnalysis {
  /** 総失敗回数 */
  totalFailures: number;
  /** 最も頻繁なエラーコード */
  mostFrequentError: string;
  /** エラーパターン（コード -> 回数） */
  errorPatterns: Map<string, number>;
  /** 推奨アクション */
  recommendedAction: 'retry' | 'reassign' | 'escalate';
  /** 繰り返し発生フラグ */
  isRecurring: boolean;
}

/**
 * タスク割り当てペイロード
 * @description Agent Bus経由でワーカーに送信するタスク情報
 */
export interface TaskAssignPayload {
  /** サブタスク */
  subTask: SubTask;
  /** 実行ID */
  runId: RunId;
  /** プロジェクト情報 */
  project: Project;
  /** 追加指示（オプション） */
  additionalInstructions?: string;
}

/**
 * タスク完了ペイロード
 * @description ワーカーからの完了報告
 */
export interface TaskCompletePayload {
  /** サブタスクID */
  subTaskId: string;
  /** 実行結果 */
  result: ExecutionResult;
}

/**
 * タスク失敗ペイロード
 * @description ワーカーからの失敗報告
 */
export interface TaskFailedPayload {
  /** サブタスクID */
  subTaskId: string;
  /** エラー情報 */
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * 品質ゲート失敗ペイロード
 * @description ワーカーからの品質ゲート失敗報告
 * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
 */
export interface QualityGateFailedPayload {
  /** サブタスクID */
  subTaskId: string;
  /** 実行ID */
  runId: RunId;
  /** 品質ゲート結果 */
  qualityGateResult: {
    lint: { passed: boolean; output: string };
    test: { passed: boolean; output: string };
    overall: boolean;
  };
  /** 失敗したゲート一覧 */
  failedGates: ('lint' | 'test')[];
  /** エラー情報 */
  errors: Array<{
    code: string;
    message: string;
    recoverable: boolean;
  }>;
}

/**
 * Manager Agentの決定種別
 * @description 品質ゲート失敗時のManager Agentの決定
 * @see Requirement 12.5: THE Manager_Agent SHALL decide whether to retry, reassign, or escalate
 */
export type QualityGateDecision = 'retry' | 'reassign' | 'escalate';

/**
 * Manager Agentの決定結果
 * @description 品質ゲート失敗に対するManager Agentの決定内容
 */
export interface QualityGateDecisionResult {
  /** 決定種別 */
  decision: QualityGateDecision;
  /** 理由 */
  reason: string;
  /** 再割り当て先ワーカーID（reassignの場合） */
  reassignTo?: string;
  /** 追加指示（retryの場合） */
  additionalInstructions?: string;
  /** エスカレーション先（escalateの場合） */
  escalateTo?: string;
}

// =============================================================================
// ManagerAgent インターフェース
// =============================================================================

/**
 * ManagerAgent インターフェース
 * @see Requirement 1.2: WHEN President submits a high-level task, THE Manager_Agent SHALL receive and analyze it
 * @see Requirement 1.3: THE Manager_Agent SHALL decompose tasks into independent sub-tasks with no dependencies
 * @see Requirement 1.4: THE Manager_Agent SHALL assign sub-tasks to Worker_Agents for parallel execution
 */
export interface IManagerAgent {
  // タスク管理
  receiveTask(task: Task): Promise<void>;
  decomposeTask(task: Task): Promise<SubTask[]>;
  assignTask(subTask: SubTask, workerId: AgentId): Promise<void>;

  // 監視・サポート
  monitorProgress(): Promise<ProgressReport>;
  handleEscalation(escalation: Escalation): Promise<void>;
  provideSupport(workerId: AgentId, issue: Issue): Promise<Guidance>;

  // ワーカー管理
  hireWorker(spec: WorkerSpec): Promise<AgentId>;
  fireWorker(workerId: AgentId): Promise<void>;
}


// =============================================================================
// ManagerAgent クラス
// =============================================================================

/**
 * ManagerAgent - タスク管理エージェント
 *
 * 社長（ユーザー）からの指示を受け取り、タスクを分解して
 * ワーカーエージェントに割り当てる上司エージェント。
 *
 * @see Requirement 1.2: WHEN President submits a high-level task, THE Manager_Agent SHALL receive and analyze it
 * @see Requirement 1.3: THE Manager_Agent SHALL decompose tasks into independent sub-tasks with no dependencies
 * @see Requirement 1.4: THE Manager_Agent SHALL assign sub-tasks to Worker_Agents for parallel execution
 * @see Requirement 1.5: THE Manager_Agent SHALL monitor Worker_Agent progress and provide support when failures occur
 * @see Requirement 13.3: WHEN Worker_Agent fails repeatedly, THE Manager_Agent SHALL be notified via Agent_Bus
 * @see Requirement 13.4: THE Manager_Agent SHALL analyze failure and provide guidance or reassign task
 *
 * @example
 * ```typescript
 * // Manager Agentの作成
 * const manager = new ManagerAgent({
 *   agentId: 'manager-001',
 *   adapterName: 'ollama',
 *   modelName: 'llama3',
 * });
 *
 * // タスクの受信と分解
 * await manager.receiveTask(task);
 * const subTasks = await manager.decomposeTask(task);
 *
 * // ワーカーへの割り当て
 * await manager.assignTask(subTasks[0], 'worker-001');
 *
 * // 進捗監視の開始
 * manager.startProgressMonitoring('run-001');
 * ```
 */
export class ManagerAgent implements IManagerAgent {
  /** エージェントID */
  readonly agentId: AgentId;

  /** AIアダプタ */
  private adapter: BaseAdapter;

  /** Task Decomposer */
  private decomposer: TaskDecomposer;

  /** Agent Bus */
  private agentBus: AgentBus;

  /** State Manager */
  private stateManager: StateManager;

  /** モデル名 */
  private modelName: string;

  /** ポーリング間隔（ミリ秒） - 将来の拡張用 */
  private _pollInterval: number;

  /** ポーリングタイムアウト（ミリ秒） */
  private pollTimeout: number;

  /** 管理中のタスク */
  private currentTask: Task | null = null;

  /** サブタスク一覧 */
  private subTasks: Map<string, SubTask> = new Map();

  /** ワーカー割り当て */
  private workerAssignments: Map<AgentId, SubTask | null> = new Map();

  /** 登録済みワーカー一覧 */
  private registeredWorkers: Set<AgentId> = new Set();

  /** エスカレーション履歴 */
  private escalations: Escalation[] = [];

  // =========================================================================
  // 進捗監視とサポート用の追加プロパティ
  // @see Requirement 1.5, 13.3, 13.4
  // =========================================================================

  /** 現在の実行ID */
  private currentRunId: RunId | null = null;

  /** ワーカー別連続失敗回数 */
  private workerFailureCounts: Map<AgentId, number> = new Map();

  /** 失敗履歴 */
  private failureHistory: FailureRecord[] = [];

  /** ワーカー進捗情報 */
  private workerProgressInfo: Map<AgentId, WorkerProgressInfo> = new Map();

  /** 進捗監視タイマーID */
  private progressMonitorTimer: NodeJS.Timeout | null = null;

  /** 進捗監視中フラグ */
  private isMonitoring: boolean = false;

  /** ランタイムベースパス */
  private runtimeBasePath: string;

  // =========================================================================
  // 動的ワーカー管理用の追加プロパティ
  // @see Requirement 1.6: dynamically hire/fire Worker_Agents based on workload
  // =========================================================================

  /** ワーカー詳細情報 */
  private workerInfoMap: Map<AgentId, WorkerInfo> = new Map();

  /** スケーリング設定 */
  private scalingConfig: ScalingConfig = { ...DEFAULT_SCALING_CONFIG };

  /** 最終スケーリング日時 */
  private lastScalingTime: number = 0;

  /** 自動スケーリングタイマーID */
  private autoScalingTimer: NodeJS.Timeout | null = null;

  /** ヘルスチェック間隔（ミリ秒） */
  private readonly HEALTH_CHECK_INTERVAL = 10000;

  /** ヘルススコア低下しきい値 */
  private readonly HEALTH_SCORE_THRESHOLD = 30;

  /** 自動置換しきい値（連続失敗回数） */
  private readonly AUTO_REPLACE_THRESHOLD = 5;

  /**
   * コンストラクタ
   * @param config - Manager Agent設定
   */
  constructor(config: ManagerAgentConfig) {
    this.agentId = config.agentId;
    this.modelName = config.modelName ?? 'llama3.2:1b';
    this._pollInterval = config.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.pollTimeout = config.pollTimeout ?? DEFAULT_POLL_TIMEOUT;
    this.runtimeBasePath = RUNTIME_BASE_PATH;

    // AIアダプタを取得
    const adapterName = config.adapterName ?? 'ollama';
    this.adapter = getAdapter(adapterName);

    // Task Decomposerを作成
    this.decomposer = createTaskDecomposer(this.adapter, this.modelName);

    // Agent Busを設定（指定がなければ新規作成）
    this.agentBus = config.agentBus ?? createAgentBus();

    // State Managerを設定（指定がなければ新規作成）
    this.stateManager = config.stateManager ?? new StateManager();
  }


  // ===========================================================================
  // タスク管理メソッド
  // ===========================================================================

  /**
   * タスクを受信して分析
   *
   * 社長（ユーザー）からの高レベルタスクを受け取り、
   * 内部状態を更新して処理を開始する。
   *
   * @param task - 受信するタスク
   *
   * @see Requirement 1.2: WHEN President submits a high-level task, THE Manager_Agent SHALL receive and analyze it
   */
  async receiveTask(task: Task): Promise<void> {
    // 入力バリデーション
    if (!task || !task.id) {
      throw new ManagerAgentError('Task is required', 'INVALID_INPUT');
    }

    if (!task.instruction || task.instruction.trim().length === 0) {
      throw new ManagerAgentError('Task instruction is required', 'INVALID_INPUT');
    }

    // 現在のタスクを設定
    this.currentTask = {
      ...task,
      status: 'decomposing' as TaskStatus,
      assignedManager: this.agentId,
      updatedAt: new Date().toISOString(),
    };

    // サブタスクをクリア
    this.subTasks.clear();

    // ログ出力
    console.log(`[Manager ${this.agentId}] タスクを受信: ${task.id}`);
    console.log(`[Manager ${this.agentId}] 指示: ${task.instruction.substring(0, 100)}...`);
  }

  /**
   * タスクを独立したサブタスクに分解
   *
   * Task Decomposerを使用してタスクを分析し、
   * 依存関係のない独立したサブタスクに分解する。
   *
   * @param task - 分解するタスク
   * @returns 分解されたサブタスク一覧
   *
   * @see Requirement 1.3: THE Manager_Agent SHALL decompose tasks into independent sub-tasks with no dependencies
   */
  async decomposeTask(task: Task): Promise<SubTask[]> {
    // 入力バリデーション
    if (!task || !task.id) {
      throw new ManagerAgentError('Task is required for decomposition', 'INVALID_INPUT');
    }

    // プロジェクトコンテキストを構築
    const context = await this.buildProjectContext(task);

    // 分解オプション
    const options: DecomposeOptions = {
      maxSubTasks: 10,
      minSubTasks: 1,
      includeEstimates: true,
      generateAcceptanceCriteria: true,
    };

    try {
      // Task Decomposerで分解
      const result: DecomposeResult = await this.decomposer.decompose(
        task.instruction,
        context,
        options
      );

      // サブタスクを内部状態に保存
      for (const subTask of result.subTasks) {
        this.subTasks.set(subTask.id, subTask);
      }

      // タスクステータスを更新
      if (this.currentTask && this.currentTask.id === task.id) {
        this.currentTask.status = 'executing';
        this.currentTask.subTasks = result.subTasks;
        this.currentTask.updatedAt = new Date().toISOString();
      }

      console.log(`[Manager ${this.agentId}] タスク分解完了: ${result.subTasks.length}個のサブタスク`);

      return result.subTasks;
    } catch (error) {
      throw new ManagerAgentError(
        `タスク分解に失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DECOMPOSITION_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }


  /**
   * サブタスクをワーカーに割り当て
   *
   * Agent Busを通じてワーカーエージェントにサブタスクを割り当てる。
   *
   * @param subTask - 割り当てるサブタスク
   * @param workerId - 割り当て先ワーカーID
   *
   * @see Requirement 1.4: THE Manager_Agent SHALL assign sub-tasks to Worker_Agents for parallel execution
   */
  async assignTask(subTask: SubTask, workerId: AgentId): Promise<void> {
    // 入力バリデーション
    if (!subTask || !subTask.id) {
      throw new ManagerAgentError('SubTask is required', 'INVALID_INPUT');
    }

    if (!workerId || workerId.trim().length === 0) {
      throw new ManagerAgentError('Worker ID is required', 'INVALID_INPUT');
    }

    // サブタスクのステータスを更新
    const updatedSubTask: SubTask = {
      ...subTask,
      status: 'assigned' as SubTaskStatus,
      assignee: workerId,
      updatedAt: new Date().toISOString(),
    };

    // 内部状態を更新
    this.subTasks.set(subTask.id, updatedSubTask);
    this.workerAssignments.set(workerId, updatedSubTask);

    // ワーカーを登録済みに追加
    this.registeredWorkers.add(workerId);

    // ワーカー情報を更新（タスク割り当て時）
    const workerInfo = this.workerInfoMap.get(workerId);
    if (workerInfo) {
      workerInfo.status = 'working';
      workerInfo.lastActivityAt = new Date().toISOString();
    }

    // 実行IDを生成
    const runId = this.generateRunId();

    // プロジェクト情報を取得
    const project = await this.getProjectForTask();

    // タスク割り当てペイロードを作成
    const payload: TaskAssignPayload = {
      subTask: updatedSubTask,
      runId,
      project,
    };

    // Agent Bus経由でワーカーにメッセージを送信
    const message = this.agentBus.createTaskAssignMessage(
      this.agentId,
      workerId,
      payload
    );

    await this.agentBus.send(message, { runId });

    console.log(`[Manager ${this.agentId}] タスク割り当て: ${subTask.id} -> ${workerId}`);
  }

  /**
   * 複数のサブタスクを複数のワーカーに並列で割り当て
   *
   * @param assignments - サブタスクとワーカーIDのペア配列
   */
  async assignTasksInParallel(
    assignments: Array<{ subTask: SubTask; workerId: AgentId }>
  ): Promise<void> {
    const promises = assignments.map(({ subTask, workerId }) =>
      this.assignTask(subTask, workerId)
    );

    await Promise.all(promises);

    console.log(`[Manager ${this.agentId}] ${assignments.length}個のタスクを並列割り当て完了`);
  }

  // ===========================================================================
  // 監視・サポートメソッド
  // ===========================================================================

  /**
   * 進捗状況を監視
   *
   * 現在のタスク実行状況をレポートとして返す。
   *
   * @returns 進捗レポート
   *
   * @see Requirement 1.5: THE Manager_Agent SHALL monitor Worker_Agent progress
   */
  async monitorProgress(): Promise<ProgressReport> {
    const subTaskArray = Array.from(this.subTasks.values());

    // ステータス別にカウント
    const completedTasks = subTaskArray.filter((t) => t.status === 'completed').length;
    const runningTasks = subTaskArray.filter(
      (t) => t.status === 'running' || t.status === 'assigned'
    ).length;
    const failedTasks = subTaskArray.filter((t) => t.status === 'failed').length;
    const pendingTasks = subTaskArray.filter((t) => t.status === 'pending').length;

    return {
      totalTasks: subTaskArray.length,
      completedTasks,
      runningTasks,
      failedTasks,
      pendingTasks,
      workerAssignments: new Map(this.workerAssignments),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 詳細な進捗状況を監視
   *
   * リアルタイム監視用の詳細な進捗レポートを返す。
   *
   * @returns 詳細進捗レポート
   *
   * @see Requirement 1.5: THE Manager_Agent SHALL monitor Worker_Agent progress
   */
  async monitorDetailedProgress(): Promise<DetailedProgressReport> {
    const basicReport = await this.monitorProgress();
    const subTaskArray = Array.from(this.subTasks.values());

    // ワーカー別進捗情報を収集
    const workerProgress: WorkerProgressInfo[] = [];
    for (const workerId of Array.from(this.registeredWorkers)) {
      const progressInfo = this.workerProgressInfo.get(workerId);
      if (progressInfo) {
        workerProgress.push(progressInfo);
      } else {
        // 進捗情報がない場合はデフォルト値を設定
        workerProgress.push({
          workerId,
          currentSubTask: this.workerAssignments.get(workerId) ?? null,
          status: 'idle',
          consecutiveFailures: this.workerFailureCounts.get(workerId) ?? 0,
          lastActivityAt: new Date().toISOString(),
        });
      }
    }

    // 全体進捗率を計算
    const overallProgressPercent = subTaskArray.length > 0
      ? Math.round((basicReport.completedTasks / subTaskArray.length) * 100)
      : 0;

    // アクティブなエスカレーション数をカウント
    const activeEscalations = this.escalations.filter(
      (e) => !this.failureHistory.some((f) => f.id === e.id && f.resolved)
    ).length;

    return {
      ...basicReport,
      runId: this.currentRunId ?? undefined,
      taskId: this.currentTask?.id,
      workerProgress,
      failureHistory: [...this.failureHistory],
      overallProgressPercent,
      activeEscalations,
    };
  }

  /**
   * 進捗監視を開始
   *
   * 定期的にワーカーの進捗を監視し、失敗を検出してサポートを提供する。
   *
   * @param runId - 実行ID
   *
   * @see Requirement 1.5: THE Manager_Agent SHALL monitor Worker_Agent progress
   * @see Requirement 13.3: WHEN Worker_Agent fails repeatedly, THE Manager_Agent SHALL be notified
   */
  startProgressMonitoring(runId: RunId): void {
    if (this.isMonitoring) {
      console.log(`[Manager ${this.agentId}] 進捗監視は既に実行中です`);
      return;
    }

    this.currentRunId = runId;
    this.isMonitoring = true;

    console.log(`[Manager ${this.agentId}] 進捗監視を開始: ${runId}`);

    // 定期的な監視ループを開始
    this.progressMonitorTimer = setInterval(async () => {
      await this.performProgressCheck();
    }, PROGRESS_MONITOR_INTERVAL);
  }

  /**
   * 進捗監視を停止
   */
  stopProgressMonitoring(): void {
    if (this.progressMonitorTimer) {
      clearInterval(this.progressMonitorTimer);
      this.progressMonitorTimer = null;
    }
    this.isMonitoring = false;
    console.log(`[Manager ${this.agentId}] 進捗監視を停止`);
  }

  /**
   * 進捗チェックを実行
   *
   * @private
   */
  private async performProgressCheck(): Promise<void> {
    try {
      // Agent Busからメッセージをポーリング
      const messages = await this.pollMessages();

      // メッセージを処理
      for (const message of messages) {
        await this.processMessage(message);
      }

      // ワーカー進捗情報を更新
      await this.updateWorkerProgressInfo();

      // 失敗パターンを検出
      await this.detectFailurePatterns();

    } catch (error) {
      console.error(`[Manager ${this.agentId}] 進捗チェックエラー:`, error);
    }
  }

  /**
   * ワーカー進捗情報を更新
   *
   * @private
   */
  private async updateWorkerProgressInfo(): Promise<void> {
    for (const workerId of Array.from(this.registeredWorkers)) {
      const currentTask = this.workerAssignments.get(workerId);
      const failureCount = this.workerFailureCounts.get(workerId) ?? 0;

      // ステータスを判定
      let status: WorkerProgressInfo['status'] = 'idle';
      if (currentTask) {
        if (failureCount >= FAILURE_NOTIFICATION_THRESHOLD) {
          status = 'waiting_support';
        } else if (currentTask.status === 'failed') {
          status = 'error';
        } else {
          status = 'working';
        }
      }

      const existingInfo = this.workerProgressInfo.get(workerId);
      this.workerProgressInfo.set(workerId, {
        workerId,
        currentSubTask: currentTask ?? null,
        status,
        startedAt: existingInfo?.startedAt,
        consecutiveFailures: failureCount,
        lastActivityAt: new Date().toISOString(),
      });
    }
  }

  /**
   * 失敗パターンを検出
   *
   * 連続失敗を検出し、しきい値を超えた場合はサポートを提供する。
   *
   * @private
   * @see Requirement 13.3: WHEN Worker_Agent fails repeatedly, THE Manager_Agent SHALL be notified
   */
  private async detectFailurePatterns(): Promise<void> {
    for (const [workerId, failureCount] of Array.from(this.workerFailureCounts.entries())) {
      if (failureCount >= FAILURE_NOTIFICATION_THRESHOLD) {
        const currentTask = this.workerAssignments.get(workerId);
        if (currentTask) {
          console.log(
            `[Manager ${this.agentId}] ワーカー ${workerId} が連続 ${failureCount} 回失敗 - サポート提供`
          );

          // 自動サポートを提供
          await this.provideAutomaticSupport(workerId, currentTask);
        }
      }
    }
  }

  /**
   * 自動サポートを提供
   *
   * 失敗パターンを分析し、適切なガイダンスを生成して提供する。
   *
   * @param workerId - 対象ワーカーID
   * @param subTask - 失敗したサブタスク
   *
   * @see Requirement 13.4: THE Manager_Agent SHALL analyze failure and provide guidance or reassign task
   */
  private async provideAutomaticSupport(workerId: AgentId, subTask: SubTask): Promise<void> {
    // 失敗履歴から問題を分析
    const recentFailures = this.failureHistory.filter(
      (f) => f.workerId === workerId && !f.resolved
    );

    // 問題情報を構築
    const issue: Issue = {
      description: `サブタスク「${subTask.title}」で連続失敗が発生`,
      errorMessage: recentFailures.length > 0
        ? recentFailures[recentFailures.length - 1].error.message
        : undefined,
      attemptCount: this.workerFailureCounts.get(workerId) ?? 0,
    };

    // ガイダンスを提供
    const guidance = await this.provideSupport(workerId, issue);

    // 失敗履歴を更新
    for (const failure of recentFailures) {
      failure.supportProvided = guidance.advice;
    }

    // エラーログに記録
    if (this.currentRunId) {
      await this.logError(this.currentRunId, {
        code: 'REPEATED_FAILURE',
        message: `ワーカー ${workerId} が連続失敗 - サポート提供済み`,
        timestamp: new Date().toISOString(),
        recoverable: true,
      });
    }
  }

  /**
   * ワーカーの失敗を記録
   *
   * @param workerId - ワーカーID
   * @param subTaskId - サブタスクID
   * @param error - エラー情報
   *
   * @see Requirement 13.3: WHEN Worker_Agent fails repeatedly, THE Manager_Agent SHALL be notified
   */
  recordWorkerFailure(
    workerId: AgentId,
    subTaskId: string,
    error: { code: string; message: string; recoverable: boolean }
  ): void {
    // 連続失敗回数をインクリメント
    const currentCount = this.workerFailureCounts.get(workerId) ?? 0;
    this.workerFailureCounts.set(workerId, currentCount + 1);

    // ワーカー情報を更新
    const workerInfo = this.workerInfoMap.get(workerId);
    if (workerInfo) {
      workerInfo.failedTasks++;
      workerInfo.consecutiveFailures = currentCount + 1;
      workerInfo.lastActivityAt = new Date().toISOString();
      // ヘルススコアを更新
      this.updateWorkerHealthScore(workerId);
    }

    // 失敗履歴に追加
    const failureRecord: FailureRecord = {
      id: crypto.randomUUID(),
      workerId,
      subTaskId,
      error,
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    this.failureHistory.push(failureRecord);

    console.log(
      `[Manager ${this.agentId}] ワーカー失敗を記録: ${workerId} (連続 ${currentCount + 1} 回)`
    );
  }

  /**
   * ワーカーの成功を記録（失敗カウントをリセット）
   *
   * @param workerId - ワーカーID
   */
  recordWorkerSuccess(workerId: AgentId): void {
    // 連続失敗回数をリセット
    this.workerFailureCounts.set(workerId, 0);

    // ワーカー情報を更新
    const workerInfo = this.workerInfoMap.get(workerId);
    if (workerInfo) {
      workerInfo.completedTasks++;
      workerInfo.consecutiveFailures = 0;
      workerInfo.lastActivityAt = new Date().toISOString();
      workerInfo.status = 'idle';
      // ヘルススコアを更新
      this.updateWorkerHealthScore(workerId);
    }

    // 未解決の失敗を解決済みにマーク
    for (const failure of this.failureHistory) {
      if (failure.workerId === workerId && !failure.resolved) {
        failure.resolved = true;
      }
    }

    console.log(`[Manager ${this.agentId}] ワーカー成功を記録: ${workerId} (失敗カウントリセット)`);
  }

  /**
   * エラーをログファイルに記録
   *
   * @param runId - 実行ID
   * @param error - エラー情報
   *
   * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
   */
  private async logError(runId: RunId, error: ErrorInfo): Promise<void> {
    const logDir = path.join(this.runtimeBasePath, runId);
    const logPath = path.join(logDir, ERROR_LOG_FILENAME);

    try {
      // ディレクトリを作成
      await fs.mkdir(logDir, { recursive: true });

      // ログエントリを作成
      const logEntry = this.formatErrorLogEntry(error);

      // ログファイルに追記
      await fs.appendFile(logPath, logEntry + '\n', 'utf-8');
    } catch (err) {
      console.warn(`[Manager ${this.agentId}] エラーログ記録失敗:`, err);
    }
  }

  /**
   * エラーログエントリをフォーマット
   *
   * @param error - エラー情報
   * @returns フォーマットされたログエントリ
   */
  private formatErrorLogEntry(error: ErrorInfo): string {
    const timestamp = error.timestamp;
    const code = error.code.padEnd(20);
    const recoverable = error.recoverable ? 'RECOVERABLE' : 'FATAL';
    const message = error.message;

    return `[${timestamp}] ${code} ${recoverable.padEnd(12)} | ${message}`;
  }


  /**
   * エスカレーションを処理
   *
   * ワーカーからのエスカレーションを受け取り、適切な対応を行う。
   *
   * @param escalation - エスカレーション情報
   *
   * @see Requirement 1.5: THE Manager_Agent SHALL provide support when failures occur
   */
  async handleEscalation(escalation: Escalation): Promise<void> {
    // 入力バリデーション
    if (!escalation || !escalation.id) {
      throw new ManagerAgentError('Escalation is required', 'INVALID_INPUT');
    }

    // エスカレーション履歴に追加
    this.escalations.push(escalation);

    // サブタスクのステータスを更新
    const subTask = this.subTasks.get(escalation.subTaskId);
    if (subTask) {
      const updatedSubTask: SubTask = {
        ...subTask,
        status: escalation.type === 'error' ? 'failed' : 'blocked',
        updatedAt: new Date().toISOString(),
      };
      this.subTasks.set(escalation.subTaskId, updatedSubTask);
    }

    console.log(`[Manager ${this.agentId}] エスカレーション受信: ${escalation.type} from ${escalation.workerId}`);
    console.log(`[Manager ${this.agentId}] 問題: ${escalation.issue}`);

    // エスカレーション種別に応じた対応
    switch (escalation.type) {
      case 'error':
        // エラーの場合はリトライまたは再割り当てを検討
        await this.handleErrorEscalation(escalation);
        break;
      case 'blocked':
        // ブロックの場合は依存関係を解決
        await this.handleBlockedEscalation(escalation);
        break;
      case 'help_needed':
        // ヘルプ要求の場合はガイダンスを提供
        await this.provideSupport(escalation.workerId, {
          description: escalation.issue,
          attemptCount: 1,
        });
        break;
      case 'quality_failed':
        // 品質ゲート失敗の場合は修正指示
        await this.handleQualityFailure(escalation);
        break;
    }
  }

  /**
   * ワーカーにサポートを提供
   *
   * 問題に直面しているワーカーにガイダンスを提供する。
   *
   * @param workerId - 対象ワーカーID
   * @param issue - 問題情報
   * @returns ガイダンス
   *
   * @see Requirement 1.5: THE Manager_Agent SHALL provide support when failures occur
   * @see Requirement 13.4: THE Manager_Agent SHALL analyze failure and provide guidance or reassign task
   */
  async provideSupport(workerId: AgentId, issue: Issue): Promise<Guidance> {
    // 入力バリデーション
    if (!workerId || workerId.trim().length === 0) {
      throw new ManagerAgentError('Worker ID is required', 'INVALID_INPUT');
    }

    if (!issue || !issue.description) {
      throw new ManagerAgentError('Issue description is required', 'INVALID_INPUT');
    }

    // 失敗パターンを分析
    const failureAnalysis = this.analyzeFailurePattern(workerId, issue);

    // ガイダンスを生成
    const guidance: Guidance = {
      id: crypto.randomUUID(),
      workerId,
      advice: this.generateAdvice(issue, failureAnalysis),
      suggestedActions: this.generateSuggestedActions(issue, failureAnalysis),
      additionalResources: this.generateAdditionalResources(issue),
      timestamp: new Date().toISOString(),
    };

    // Agent Bus経由でワーカーにガイダンスを送信
    const message = this.agentBus.createStatusResponseMessage(
      this.agentId,
      workerId,
      { type: 'guidance', guidance }
    );

    await this.agentBus.send(message, { runId: this.currentRunId ?? undefined });

    console.log(`[Manager ${this.agentId}] ガイダンス提供: ${workerId}`);
    console.log(`[Manager ${this.agentId}] アドバイス: ${guidance.advice}`);

    // エラーログに記録
    if (this.currentRunId) {
      await this.logError(this.currentRunId, {
        code: 'SUPPORT_PROVIDED',
        message: `ワーカー ${workerId} にサポート提供: ${guidance.advice.substring(0, 100)}...`,
        timestamp: new Date().toISOString(),
        recoverable: true,
      });
    }

    return guidance;
  }

  /**
   * 失敗パターンを分析
   *
   * @param workerId - ワーカーID
   * @param issue - 問題情報
   * @returns 分析結果
   *
   * @see Requirement 13.4: THE Manager_Agent SHALL analyze failure
   */
  private analyzeFailurePattern(
    workerId: AgentId,
    issue: Issue
  ): FailureAnalysis {
    const workerFailures = this.failureHistory.filter(
      (f) => f.workerId === workerId
    );

    // エラーパターンを分類
    const errorPatterns = new Map<string, number>();
    for (const failure of workerFailures) {
      const count = errorPatterns.get(failure.error.code) ?? 0;
      errorPatterns.set(failure.error.code, count + 1);
    }

    // 最も頻繁なエラーを特定
    let mostFrequentError = '';
    let maxCount = 0;
    for (const [code, count] of Array.from(errorPatterns.entries())) {
      if (count > maxCount) {
        mostFrequentError = code;
        maxCount = count;
      }
    }

    // 推奨アクションを決定
    let recommendedAction: 'retry' | 'reassign' | 'escalate' = 'retry';
    if (issue.attemptCount >= FAILURE_NOTIFICATION_THRESHOLD * 2) {
      recommendedAction = 'escalate';
    } else if (issue.attemptCount >= FAILURE_NOTIFICATION_THRESHOLD) {
      recommendedAction = 'reassign';
    }

    return {
      totalFailures: workerFailures.length,
      mostFrequentError,
      errorPatterns,
      recommendedAction,
      isRecurring: workerFailures.length > 1,
    };
  }


  // ===========================================================================
  // ワーカー管理メソッド
  // @see Requirement 1.6: THE Manager_Agent SHALL be able to dynamically hire/fire Worker_Agents
  // ===========================================================================

  /**
   * 新しいワーカーを雇用
   *
   * 指定された仕様に基づいて新しいワーカーエージェントを登録する。
   *
   * @param spec - ワーカー仕様
   * @returns 新しいワーカーのエージェントID
   *
   * @see Requirement 1.6: THE Manager_Agent SHALL be able to dynamically hire/fire Worker_Agents
   */
  async hireWorker(spec: WorkerSpec): Promise<AgentId> {
    // 入力バリデーション
    if (!spec || !spec.name) {
      throw new ManagerAgentError('Worker spec with name is required', 'INVALID_INPUT');
    }

    // 最大ワーカー数チェック
    if (this.registeredWorkers.size >= this.scalingConfig.maxWorkers) {
      throw new ManagerAgentError(
        `Maximum worker limit (${this.scalingConfig.maxWorkers}) reached`,
        'INVALID_INPUT'
      );
    }

    // 新しいワーカーIDを生成
    const workerId = `worker-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

    // ワーカーを登録
    this.registeredWorkers.add(workerId);
    this.workerAssignments.set(workerId, null);

    // ワーカー詳細情報を作成
    const workerInfo: WorkerInfo = {
      id: workerId,
      name: spec.name,
      capabilities: spec.capabilities || [],
      status: 'idle',
      hiredAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      completedTasks: 0,
      failedTasks: 0,
      consecutiveFailures: 0,
      healthScore: 100,
      priority: spec.priority ?? 0,
      adapterName: spec.adapterName,
      modelName: spec.modelName,
    };
    this.workerInfoMap.set(workerId, workerInfo);

    // 失敗カウントを初期化
    this.workerFailureCounts.set(workerId, 0);

    console.log(`[Manager ${this.agentId}] ワーカー雇用: ${workerId} (${spec.name})`);
    console.log(`[Manager ${this.agentId}]   能力: ${spec.capabilities.join(', ')}`);

    return workerId;
  }

  /**
   * ワーカーを解雇
   *
   * 指定されたワーカーエージェントを登録から削除する。
   *
   * @param workerId - 解雇するワーカーID
   *
   * @see Requirement 1.6: THE Manager_Agent SHALL be able to dynamically hire/fire Worker_Agents
   */
  async fireWorker(workerId: AgentId): Promise<void> {
    // 入力バリデーション
    if (!workerId || workerId.trim().length === 0) {
      throw new ManagerAgentError('Worker ID is required', 'INVALID_INPUT');
    }

    // ワーカーが登録されているか確認
    if (!this.registeredWorkers.has(workerId)) {
      throw new ManagerAgentError(`Worker ${workerId} is not registered`, 'WORKER_NOT_FOUND');
    }

    // 最小ワーカー数チェック
    if (this.registeredWorkers.size <= this.scalingConfig.minWorkers) {
      throw new ManagerAgentError(
        `Cannot fire worker: minimum worker count (${this.scalingConfig.minWorkers}) reached`,
        'INVALID_INPUT'
      );
    }

    // 割り当て中のタスクがあるか確認
    const assignedTask = this.workerAssignments.get(workerId);
    if (assignedTask) {
      // タスクを未割り当てに戻す
      const updatedSubTask: SubTask = {
        ...assignedTask,
        status: 'pending' as SubTaskStatus,
        assignee: undefined,
        updatedAt: new Date().toISOString(),
      };
      this.subTasks.set(assignedTask.id, updatedSubTask);
      console.log(`[Manager ${this.agentId}] タスク ${assignedTask.id} を未割り当てに戻しました`);
    }

    // ワーカー情報を更新（終了状態に）
    const workerInfo = this.workerInfoMap.get(workerId);
    if (workerInfo) {
      workerInfo.status = 'terminated';
      workerInfo.lastActivityAt = new Date().toISOString();
    }

    // ワーカーを削除
    this.registeredWorkers.delete(workerId);
    this.workerAssignments.delete(workerId);
    this.workerFailureCounts.delete(workerId);
    this.workerProgressInfo.delete(workerId);
    // workerInfoMapは履歴として保持（terminated状態で）

    console.log(`[Manager ${this.agentId}] ワーカー解雇: ${workerId}`);
  }

  /**
   * ワークロードに基づいてワーカーを動的にスケーリング
   *
   * 現在のワークロードを分析し、必要に応じてワーカーを追加または削除する。
   *
   * @returns スケーリングアクションの結果
   *
   * @see Requirement 1.6: dynamically hire/fire Worker_Agents based on workload
   */
  async scaleWorkersByWorkload(): Promise<{
    action: 'scaled_up' | 'scaled_down' | 'no_change';
    workersAdded: number;
    workersRemoved: number;
  }> {
    // クールダウンチェック
    const now = Date.now();
    if (now - this.lastScalingTime < this.scalingConfig.scalingCooldown) {
      return { action: 'no_change', workersAdded: 0, workersRemoved: 0 };
    }

    // ワークロード情報を取得
    const workload = this.getWorkloadInfo();

    let workersAdded = 0;
    let workersRemoved = 0;

    // スケールアップ判定
    if (
      workload.scalingRecommendation === 'scale_up' &&
      workload.totalWorkers < this.scalingConfig.maxWorkers
    ) {
      // 追加するワーカー数を計算（保留タスク数に基づく）
      const workersToAdd = Math.min(
        Math.ceil(workload.pendingTasks / 2),
        this.scalingConfig.maxWorkers - workload.totalWorkers
      );

      for (let i = 0; i < workersToAdd; i++) {
        try {
          await this.hireWorker({
            name: `auto-worker-${Date.now().toString(36)}`,
            capabilities: ['general'],
            priority: 0,
          });
          workersAdded++;
        } catch (error) {
          console.warn(`[Manager ${this.agentId}] 自動ワーカー追加失敗:`, error);
          break;
        }
      }

      if (workersAdded > 0) {
        this.lastScalingTime = now;
        console.log(`[Manager ${this.agentId}] スケールアップ: ${workersAdded}ワーカー追加`);
        return { action: 'scaled_up', workersAdded, workersRemoved: 0 };
      }
    }

    // スケールダウン判定
    if (
      workload.scalingRecommendation === 'scale_down' &&
      workload.totalWorkers > this.scalingConfig.minWorkers
    ) {
      // 削除するワーカー数を計算
      const workersToRemove = Math.min(
        workload.idleWorkers - 1, // 少なくとも1つはアイドルを残す
        workload.totalWorkers - this.scalingConfig.minWorkers
      );

      // アイドルワーカーを優先度の低い順に削除
      const idleWorkers = this.getIdleWorkers().sort((a, b) => a.priority - b.priority);

      for (let i = 0; i < workersToRemove && i < idleWorkers.length; i++) {
        try {
          await this.fireWorker(idleWorkers[i].id);
          workersRemoved++;
        } catch (error) {
          console.warn(`[Manager ${this.agentId}] 自動ワーカー削除失敗:`, error);
          break;
        }
      }

      if (workersRemoved > 0) {
        this.lastScalingTime = now;
        console.log(`[Manager ${this.agentId}] スケールダウン: ${workersRemoved}ワーカー削除`);
        return { action: 'scaled_down', workersAdded: 0, workersRemoved };
      }
    }

    return { action: 'no_change', workersAdded: 0, workersRemoved: 0 };
  }

  /**
   * タスクに最適なワーカーを選択（能力マッチング）
   *
   * サブタスクの要件に基づいて、最適なワーカーを選択する。
   *
   * @param subTask - 割り当てるサブタスク
   * @returns 最適なワーカーID、または利用可能なワーカーがない場合はnull
   *
   * @see Requirement 1.6: dynamically hire/fire Worker_Agents based on workload
   */
  selectBestWorkerForTask(subTask: SubTask): AgentId | null {
    const idleWorkers = this.getIdleWorkers();

    if (idleWorkers.length === 0) {
      return null;
    }

    // タスクから必要な能力を抽出（タイトルと説明から推測）
    const requiredCapabilities = this.extractRequiredCapabilities(subTask);

    // ワーカーをスコアリング
    const scoredWorkers = idleWorkers.map((worker) => {
      let score = 0;

      // 能力マッチングスコア
      const matchingCapabilities = worker.capabilities.filter((cap) =>
        requiredCapabilities.some(
          (req) => cap.toLowerCase().includes(req.toLowerCase()) ||
                   req.toLowerCase().includes(cap.toLowerCase())
        )
      );
      score += matchingCapabilities.length * 20;

      // ヘルススコア（高いほど良い）
      score += worker.healthScore * 0.3;

      // 優先度スコア
      score += worker.priority * 5;

      // 成功率スコア
      const totalTasks = worker.completedTasks + worker.failedTasks;
      if (totalTasks > 0) {
        const successRate = worker.completedTasks / totalTasks;
        score += successRate * 30;
      }

      // 連続失敗ペナルティ
      score -= worker.consecutiveFailures * 10;

      return { worker, score };
    });

    // スコアの高い順にソート
    scoredWorkers.sort((a, b) => b.score - a.score);

    // 最高スコアのワーカーを返す
    return scoredWorkers[0]?.worker.id ?? null;
  }

  /**
   * ワーカーのヘルスチェックを実行
   *
   * 全ワーカーのヘルス状態を評価し、必要に応じて対処する。
   *
   * @returns ヘルスチェック結果
   *
   * @see Requirement 1.6: dynamically hire/fire Worker_Agents based on workload
   */
  async performHealthCheck(): Promise<{
    healthyWorkers: number;
    unhealthyWorkers: number;
    replacedWorkers: AgentId[];
  }> {
    let healthyWorkers = 0;
    let unhealthyWorkers = 0;
    const replacedWorkers: AgentId[] = [];

    for (const [workerId, workerInfo] of Array.from(this.workerInfoMap.entries())) {
      if (workerInfo.status === 'terminated') {
        continue;
      }

      // ヘルススコアを更新
      this.updateWorkerHealthScore(workerId);

      const updatedInfo = this.workerInfoMap.get(workerId);
      if (!updatedInfo) continue;

      if (updatedInfo.healthScore >= this.HEALTH_SCORE_THRESHOLD) {
        healthyWorkers++;
      } else {
        unhealthyWorkers++;

        // 自動置換が必要かチェック
        if (
          updatedInfo.consecutiveFailures >= this.AUTO_REPLACE_THRESHOLD ||
          updatedInfo.healthScore < 10
        ) {
          console.log(
            `[Manager ${this.agentId}] ワーカー ${workerId} を自動置換（ヘルススコア: ${updatedInfo.healthScore}）`
          );

          try {
            // 新しいワーカーを雇用
            const newWorkerId = await this.replaceWorker(workerId, {
              name: `replacement-${updatedInfo.name}`,
              capabilities: updatedInfo.capabilities,
              priority: updatedInfo.priority,
            });

            replacedWorkers.push(workerId);
            console.log(`[Manager ${this.agentId}] ワーカー置換完了: ${workerId} -> ${newWorkerId}`);
          } catch (error) {
            console.error(`[Manager ${this.agentId}] ワーカー置換失敗:`, error);
          }
        }
      }
    }

    return { healthyWorkers, unhealthyWorkers, replacedWorkers };
  }

  /**
   * ワーカーを置換
   *
   * 問題のあるワーカーを解雇し、新しいワーカーを雇用する。
   *
   * @param oldWorkerId - 置換するワーカーID
   * @param spec - 新しいワーカーの仕様
   * @returns 新しいワーカーID
   *
   * @see Requirement 1.6: dynamically hire/fire Worker_Agents based on workload
   */
  async replaceWorker(oldWorkerId: AgentId, spec: WorkerSpec): Promise<AgentId> {
    // 一時的に最小ワーカー数を下げて解雇を許可
    const originalMinWorkers = this.scalingConfig.minWorkers;
    this.scalingConfig.minWorkers = Math.max(0, this.scalingConfig.minWorkers - 1);

    try {
      // 古いワーカーを解雇
      await this.fireWorker(oldWorkerId);

      // 新しいワーカーを雇用
      const newWorkerId = await this.hireWorker(spec);

      return newWorkerId;
    } finally {
      // 最小ワーカー数を元に戻す
      this.scalingConfig.minWorkers = originalMinWorkers;
    }
  }

  /**
   * 自動スケーリングを開始
   *
   * 定期的にワークロードをチェックし、自動的にスケーリングを行う。
   *
   * @see Requirement 1.6: dynamically hire/fire Worker_Agents based on workload
   */
  startAutoScaling(): void {
    if (this.autoScalingTimer) {
      console.log(`[Manager ${this.agentId}] 自動スケーリングは既に実行中です`);
      return;
    }

    if (!this.scalingConfig.autoScalingEnabled) {
      console.log(`[Manager ${this.agentId}] 自動スケーリングは無効です`);
      return;
    }

    console.log(`[Manager ${this.agentId}] 自動スケーリングを開始`);

    this.autoScalingTimer = setInterval(async () => {
      try {
        // ワークロードベースのスケーリング
        await this.scaleWorkersByWorkload();

        // ヘルスチェック
        await this.performHealthCheck();
      } catch (error) {
        console.error(`[Manager ${this.agentId}] 自動スケーリングエラー:`, error);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * 自動スケーリングを停止
   */
  stopAutoScaling(): void {
    if (this.autoScalingTimer) {
      clearInterval(this.autoScalingTimer);
      this.autoScalingTimer = null;
      console.log(`[Manager ${this.agentId}] 自動スケーリングを停止`);
    }
  }

  /**
   * スケーリング設定を更新
   *
   * @param config - 新しいスケーリング設定（部分的な更新可）
   */
  updateScalingConfig(config: Partial<ScalingConfig>): void {
    this.scalingConfig = {
      ...this.scalingConfig,
      ...config,
    };
    console.log(`[Manager ${this.agentId}] スケーリング設定を更新:`, this.scalingConfig);
  }

  /**
   * 現在のワークロード情報を取得
   *
   * @returns ワークロード情報
   */
  getWorkloadInfo(): WorkloadInfo {
    const subTaskArray = Array.from(this.subTasks.values());
    const pendingTasks = subTaskArray.filter((t) => t.status === 'pending').length;
    const runningTasks = subTaskArray.filter(
      (t) => t.status === 'running' || t.status === 'assigned'
    ).length;

    const idleWorkers = this.getIdleWorkers().length;
    const activeWorkers = this.registeredWorkers.size - idleWorkers;
    const totalWorkers = this.registeredWorkers.size;

    // ワークロード比率を計算
    const workloadRatio = activeWorkers > 0 ? pendingTasks / activeWorkers : pendingTasks;

    // スケーリング推奨を決定
    let scalingRecommendation: 'scale_up' | 'scale_down' | 'maintain' = 'maintain';

    if (workloadRatio >= this.scalingConfig.scaleUpThreshold && pendingTasks > 0) {
      scalingRecommendation = 'scale_up';
    } else if (
      totalWorkers > this.scalingConfig.minWorkers &&
      idleWorkers / totalWorkers >= this.scalingConfig.scaleDownThreshold &&
      pendingTasks === 0
    ) {
      scalingRecommendation = 'scale_down';
    }

    return {
      pendingTasks,
      runningTasks,
      idleWorkers,
      activeWorkers,
      totalWorkers,
      workloadRatio,
      scalingRecommendation,
    };
  }

  /**
   * アイドル状態のワーカー一覧を取得
   *
   * @returns アイドルワーカー情報の配列
   */
  getIdleWorkers(): WorkerInfo[] {
    const idleWorkers: WorkerInfo[] = [];

    for (const workerId of Array.from(this.registeredWorkers)) {
      const assignedTask = this.workerAssignments.get(workerId);
      const workerInfo = this.workerInfoMap.get(workerId);

      if (!assignedTask && workerInfo && workerInfo.status !== 'terminated') {
        idleWorkers.push(workerInfo);
      }
    }

    return idleWorkers;
  }

  /**
   * ワーカー情報を取得
   *
   * @param workerId - ワーカーID
   * @returns ワーカー情報、または未登録の場合はundefined
   */
  getWorkerInfo(workerId: AgentId): WorkerInfo | undefined {
    return this.workerInfoMap.get(workerId);
  }

  /**
   * 全ワーカー情報を取得
   *
   * @returns 全ワーカー情報のマップ
   */
  getAllWorkerInfo(): Map<AgentId, WorkerInfo> {
    return new Map(this.workerInfoMap);
  }

  /**
   * スケーリング設定を取得
   *
   * @returns 現在のスケーリング設定
   */
  getScalingConfig(): ScalingConfig {
    return { ...this.scalingConfig };
  }

  // ===========================================================================
  // プライベートメソッド - ワーカー管理ヘルパー
  // ===========================================================================

  /**
   * ワーカーのヘルススコアを更新
   *
   * @param workerId - ワーカーID
   */
  private updateWorkerHealthScore(workerId: AgentId): void {
    const workerInfo = this.workerInfoMap.get(workerId);
    if (!workerInfo) return;

    let healthScore = 100;

    // 連続失敗によるペナルティ
    healthScore -= workerInfo.consecutiveFailures * 15;

    // 総失敗率によるペナルティ
    const totalTasks = workerInfo.completedTasks + workerInfo.failedTasks;
    if (totalTasks > 0) {
      const failureRate = workerInfo.failedTasks / totalTasks;
      healthScore -= failureRate * 30;
    }

    // 最終アクティビティからの経過時間によるペナルティ
    const lastActivity = new Date(workerInfo.lastActivityAt).getTime();
    const inactiveMinutes = (Date.now() - lastActivity) / (1000 * 60);
    if (inactiveMinutes > 30) {
      healthScore -= Math.min(20, (inactiveMinutes - 30) * 0.5);
    }

    // エラー状態の場合は大幅にペナルティ
    if (workerInfo.status === 'error') {
      healthScore -= 30;
    }

    // スコアを0-100の範囲に制限
    workerInfo.healthScore = Math.max(0, Math.min(100, healthScore));
  }

  /**
   * サブタスクから必要な能力を抽出
   *
   * @param subTask - サブタスク
   * @returns 必要な能力の配列
   */
  private extractRequiredCapabilities(subTask: SubTask): string[] {
    const capabilities: string[] = [];
    const text = `${subTask.title} ${subTask.description}`.toLowerCase();

    // キーワードベースの能力抽出
    const capabilityKeywords: Record<string, string[]> = {
      frontend: ['ui', 'frontend', 'react', 'vue', 'css', 'html', 'component'],
      backend: ['api', 'backend', 'server', 'database', 'sql', 'rest'],
      testing: ['test', 'testing', 'unit', 'integration', 'e2e'],
      devops: ['docker', 'ci', 'cd', 'deploy', 'infrastructure'],
      documentation: ['doc', 'documentation', 'readme', 'comment'],
      general: ['general', 'task', 'implement', 'create', 'update'],
    };

    for (const [capability, keywords] of Object.entries(capabilityKeywords)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        capabilities.push(capability);
      }
    }

    // デフォルトで'general'を追加
    if (capabilities.length === 0) {
      capabilities.push('general');
    }

    return capabilities;
  }

  /**
   * ワーカー情報を更新（タスク完了時）
   *
   * @param workerId - ワーカーID
   * @param success - 成功フラグ
   */
  private updateWorkerInfoOnTaskCompletion(workerId: AgentId, success: boolean): void {
    const workerInfo = this.workerInfoMap.get(workerId);
    if (!workerInfo) return;

    workerInfo.lastActivityAt = new Date().toISOString();

    if (success) {
      workerInfo.completedTasks++;
      workerInfo.consecutiveFailures = 0;
      workerInfo.status = 'idle';
    } else {
      workerInfo.failedTasks++;
      workerInfo.consecutiveFailures++;
      workerInfo.status = workerInfo.consecutiveFailures >= FAILURE_NOTIFICATION_THRESHOLD
        ? 'error'
        : 'idle';
    }

    // ヘルススコアを更新
    this.updateWorkerHealthScore(workerId);
  }

  // ===========================================================================
  // メッセージ処理メソッド
  // ===========================================================================

  /**
   * Agent Busからメッセージをポーリング
   *
   * ワーカーからの完了報告やエスカレーションを受信する。
   *
   * @returns 受信したメッセージ一覧
   */
  async pollMessages(): Promise<AgentMessage[]> {
    await this.agentBus.initialize();
    return await this.agentBus.poll(this.agentId, this.pollTimeout);
  }

  /**
   * 受信したメッセージを処理
   *
   * @param messages - 処理するメッセージ一覧
   */
  async processMessages(messages: AgentMessage[]): Promise<void> {
    for (const message of messages) {
      await this.processMessage(message);
    }
  }

  /**
   * 単一のメッセージを処理
   *
   * @param message - 処理するメッセージ
   */
  private async processMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'task_complete':
        await this.handleTaskComplete(message);
        break;
      case 'task_failed':
        await this.handleTaskFailed(message);
        break;
      case 'escalate':
        await this.handleEscalateMessage(message);
        break;
      case 'status_response':
        // ステータス応答は現時点では特別な処理なし
        break;
      default:
        console.warn(`[Manager ${this.agentId}] 未知のメッセージタイプ: ${message.type}`);
    }
  }


  // ===========================================================================
  // プライベートメソッド - メッセージハンドラ
  // ===========================================================================

  /**
   * タスク完了メッセージを処理
   */
  private async handleTaskComplete(message: AgentMessage): Promise<void> {
    const payload = message.payload as TaskCompletePayload;
    const subTask = this.subTasks.get(payload.subTaskId);

    if (subTask) {
      const updatedSubTask: SubTask = {
        ...subTask,
        status: 'completed' as SubTaskStatus,
        updatedAt: new Date().toISOString(),
      };
      this.subTasks.set(payload.subTaskId, updatedSubTask);

      // ワーカーの割り当てをクリア
      this.workerAssignments.set(message.from, null);

      // ワーカーの成功を記録（失敗カウントをリセット）
      this.recordWorkerSuccess(message.from);

      // ワーカー情報を更新
      this.updateWorkerInfoOnTaskCompletion(message.from, true);

      console.log(`[Manager ${this.agentId}] タスク完了: ${payload.subTaskId} by ${message.from}`);

      // 全サブタスク完了チェック
      await this.checkAllTasksComplete();
    }
  }

  /**
   * タスク失敗メッセージを処理
   *
   * @see Requirement 13.3: WHEN Worker_Agent fails repeatedly, THE Manager_Agent SHALL be notified via Agent_Bus
   */
  private async handleTaskFailed(message: AgentMessage): Promise<void> {
    const payload = message.payload as TaskFailedPayload;
    const subTask = this.subTasks.get(payload.subTaskId);

    if (subTask) {
      const updatedSubTask: SubTask = {
        ...subTask,
        status: 'failed' as SubTaskStatus,
        updatedAt: new Date().toISOString(),
      };
      this.subTasks.set(payload.subTaskId, updatedSubTask);

      // ワーカーの割り当てをクリア
      this.workerAssignments.set(message.from, null);

      console.log(`[Manager ${this.agentId}] タスク失敗: ${payload.subTaskId} - ${payload.error.message}`);

      // 失敗を記録
      this.recordWorkerFailure(message.from, payload.subTaskId, payload.error);

      // ワーカー情報を更新
      this.updateWorkerInfoOnTaskCompletion(message.from, false);

      // エラーログに記録
      if (this.currentRunId) {
        await this.logError(this.currentRunId, {
          code: payload.error.code,
          message: `ワーカー ${message.from} - ${payload.error.message}`,
          timestamp: new Date().toISOString(),
          recoverable: payload.error.recoverable,
        });
      }

      // 連続失敗回数をチェック
      const failureCount = this.workerFailureCounts.get(message.from) ?? 0;
      if (failureCount >= FAILURE_NOTIFICATION_THRESHOLD) {
        // しきい値を超えた場合は自動サポートを提供
        console.log(
          `[Manager ${this.agentId}] 連続失敗しきい値超過 (${failureCount}回) - 自動サポート開始`
        );
        await this.provideAutomaticSupport(message.from, updatedSubTask);

        // 自動置換が必要かチェック
        const workerInfo = this.workerInfoMap.get(message.from);
        if (workerInfo && workerInfo.consecutiveFailures >= this.AUTO_REPLACE_THRESHOLD) {
          console.log(
            `[Manager ${this.agentId}] ワーカー ${message.from} の自動置換を検討中...`
          );
        }
      } else if (payload.error.recoverable) {
        // リカバリ可能な場合はリトライを検討
        await this.considerRetry(subTask, message.from);
      }
    }
  }

  /**
   * エスカレーションメッセージを処理
   */
  private async handleEscalateMessage(message: AgentMessage): Promise<void> {
    const escalation = message.payload as Escalation;
    await this.handleEscalation({
      ...escalation,
      workerId: message.from,
    });
  }

  // ===========================================================================
  // プライベートメソッド - エスカレーションハンドラ
  // ===========================================================================

  /**
   * エラーエスカレーションを処理
   */
  private async handleErrorEscalation(escalation: Escalation): Promise<void> {
    // リトライ回数をチェックして再割り当てを検討
    console.log(`[Manager ${this.agentId}] エラー対応: ${escalation.subTaskId}`);
  }

  /**
   * ブロックエスカレーションを処理
   */
  private async handleBlockedEscalation(escalation: Escalation): Promise<void> {
    // 依存関係を分析して解決策を提案
    console.log(`[Manager ${this.agentId}] ブロック対応: ${escalation.subTaskId}`);
  }

  /**
   * 品質ゲート失敗を処理
   *
   * 品質ゲート失敗の原因を分析し、リトライ、再割り当て、またはエスカレーションを決定する。
   *
   * @param escalation - エスカレーション情報
   *
   * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
   * @see Requirement 12.5: THE Manager_Agent SHALL decide whether to retry, reassign, or escalate
   */
  private async handleQualityFailure(escalation: Escalation): Promise<void> {
    console.log(`[Manager ${this.agentId}] 品質ゲート失敗対応: ${escalation.subTaskId}`);

    const subTask = this.subTasks.get(escalation.subTaskId);
    if (!subTask) {
      console.warn(`[Manager ${this.agentId}] サブタスク ${escalation.subTaskId} が見つかりません`);
      return;
    }

    // ワーカーの失敗回数を取得
    const failureCount = this.workerFailureCounts.get(escalation.workerId) ?? 0;

    // 品質ゲート失敗に対する決定を生成
    const decision = this.decideQualityGateAction(escalation, failureCount);

    console.log(`[Manager ${this.agentId}] 品質ゲート決定: ${decision.decision} - ${decision.reason}`);

    // エラーログに記録
    if (this.currentRunId) {
      await this.logError(this.currentRunId, {
        code: 'QUALITY_GATE_FAILURE',
        message: `品質ゲート失敗 - 決定: ${decision.decision}, 理由: ${decision.reason}`,
        timestamp: new Date().toISOString(),
        recoverable: decision.decision !== 'escalate',
      });
    }

    // 決定に基づいてアクションを実行
    switch (decision.decision) {
      case 'retry':
        await this.handleQualityGateRetry(escalation, subTask, decision);
        break;
      case 'reassign':
        await this.handleQualityGateReassign(escalation, subTask, decision);
        break;
      case 'escalate':
        await this.handleQualityGateEscalate(escalation, subTask, decision);
        break;
    }
  }

  /**
   * 品質ゲート失敗に対するアクションを決定
   *
   * @param escalation - エスカレーション情報
   * @param failureCount - 連続失敗回数
   * @returns 決定結果
   *
   * @see Requirement 12.5: THE Manager_Agent SHALL decide whether to retry, reassign, or escalate
   */
  private decideQualityGateAction(
    escalation: Escalation,
    failureCount: number
  ): QualityGateDecisionResult {
    // 連続失敗回数に基づいて決定
    if (failureCount >= 3) {
      // 3回以上失敗した場合はエスカレーション
      return {
        decision: 'escalate',
        reason: `品質ゲートが${failureCount}回連続で失敗しました。人間の介入が必要です。`,
        escalateTo: 'quality_authority',
      };
    } else if (failureCount >= 2) {
      // 2回失敗した場合は再割り当て
      return {
        decision: 'reassign',
        reason: `品質ゲートが${failureCount}回失敗しました。別のワーカーに再割り当てを推奨します。`,
      };
    } else {
      // 初回失敗はリトライ
      return {
        decision: 'retry',
        reason: '品質ゲートが失敗しました。エラーを修正してリトライしてください。',
        additionalInstructions: this.generateQualityGateRetryInstructions(escalation),
      };
    }
  }

  /**
   * 品質ゲートリトライ用の追加指示を生成
   *
   * @param escalation - エスカレーション情報
   * @returns 追加指示
   */
  private generateQualityGateRetryInstructions(escalation: Escalation): string {
    const instructions: string[] = [
      '品質ゲートが失敗しました。以下の手順で修正してください：',
      '',
    ];

    // エスカレーションの問題内容から指示を生成
    if (escalation.issue.toLowerCase().includes('lint')) {
      instructions.push('1. `make lint` を実行してLintエラーを確認してください');
      instructions.push('2. エラー箇所を修正してください');
      instructions.push('3. 再度 `make lint` を実行して確認してください');
    }

    if (escalation.issue.toLowerCase().includes('test')) {
      instructions.push('1. `make test` を実行してテスト失敗を確認してください');
      instructions.push('2. 失敗したテストの原因を分析してください');
      instructions.push('3. コードまたはテストを修正してください');
      instructions.push('4. 再度 `make test` を実行して確認してください');
    }

    if (!escalation.issue.toLowerCase().includes('lint') &&
        !escalation.issue.toLowerCase().includes('test')) {
      instructions.push('1. エラーメッセージを確認してください');
      instructions.push('2. 問題の原因を特定してください');
      instructions.push('3. 修正を行ってください');
      instructions.push('4. 品質ゲートを再実行してください');
    }

    return instructions.join('\n');
  }

  /**
   * 品質ゲート失敗時のリトライ処理
   *
   * @param escalation - エスカレーション情報
   * @param subTask - サブタスク
   * @param decision - 決定結果
   */
  private async handleQualityGateRetry(
    escalation: Escalation,
    subTask: SubTask,
    decision: QualityGateDecisionResult
  ): Promise<void> {
    console.log(`[Manager ${this.agentId}] 品質ゲートリトライ: ${subTask.id}`);

    // サブタスクのステータスを更新（再実行待ち）
    const updatedSubTask: SubTask = {
      ...subTask,
      status: 'assigned' as SubTaskStatus,
      updatedAt: new Date().toISOString(),
    };
    this.subTasks.set(subTask.id, updatedSubTask);

    // ワーカーにリトライ指示を送信
    const guidance: Guidance = {
      id: crypto.randomUUID(),
      workerId: escalation.workerId,
      advice: decision.reason,
      suggestedActions: [
        '品質ゲートエラーを確認する',
        'エラーを修正する',
        '品質ゲートを再実行する',
      ],
      additionalResources: decision.additionalInstructions
        ? [decision.additionalInstructions]
        : undefined,
      timestamp: new Date().toISOString(),
    };

    // Agent Bus経由でワーカーにガイダンスを送信
    const message = this.agentBus.createStatusResponseMessage(
      this.agentId,
      escalation.workerId,
      { type: 'quality_gate_retry', guidance }
    );

    await this.agentBus.send(message, { runId: this.currentRunId ?? undefined });
  }

  /**
   * 品質ゲート失敗時の再割り当て処理
   *
   * @param escalation - エスカレーション情報
   * @param subTask - サブタスク
   * @param decision - 決定結果
   */
  private async handleQualityGateReassign(
    escalation: Escalation,
    subTask: SubTask,
    decision: QualityGateDecisionResult
  ): Promise<void> {
    console.log(`[Manager ${this.agentId}] 品質ゲート再割り当て: ${subTask.id}`);

    // 現在のワーカーの割り当てをクリア
    this.workerAssignments.set(escalation.workerId, null);

    // サブタスクのステータスを更新（未割り当て）
    const updatedSubTask: SubTask = {
      ...subTask,
      status: 'pending' as SubTaskStatus,
      assignee: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.subTasks.set(subTask.id, updatedSubTask);

    // 最適なワーカーを選択
    const newWorkerId = decision.reassignTo ?? this.selectBestWorkerForTask(updatedSubTask);

    if (newWorkerId) {
      // 新しいワーカーに割り当て
      await this.assignTask(updatedSubTask, newWorkerId);
      console.log(`[Manager ${this.agentId}] タスク再割り当て完了: ${subTask.id} -> ${newWorkerId}`);
    } else {
      console.warn(`[Manager ${this.agentId}] 利用可能なワーカーがありません。タスクは保留中です。`);
    }
  }

  /**
   * 品質ゲート失敗時のエスカレーション処理
   *
   * @param escalation - エスカレーション情報
   * @param subTask - サブタスク
   * @param decision - 決定結果
   */
  private async handleQualityGateEscalate(
    escalation: Escalation,
    subTask: SubTask,
    decision: QualityGateDecisionResult
  ): Promise<void> {
    console.log(`[Manager ${this.agentId}] 品質ゲートエスカレーション: ${subTask.id}`);

    // サブタスクのステータスを更新（ブロック）
    const updatedSubTask: SubTask = {
      ...subTask,
      status: 'blocked' as SubTaskStatus,
      updatedAt: new Date().toISOString(),
    };
    this.subTasks.set(subTask.id, updatedSubTask);

    // エスカレーション先にメッセージを送信
    const escalateTo = decision.escalateTo ?? 'quality_authority';
    const escalateMessage = this.agentBus.createEscalateMessage(
      this.agentId,
      escalateTo,
      {
        type: 'quality_gate_escalation',
        subTaskId: subTask.id,
        workerId: escalation.workerId,
        issue: escalation.issue,
        reason: decision.reason,
        failureHistory: this.failureHistory.filter(
          (f) => f.subTaskId === subTask.id
        ),
        timestamp: new Date().toISOString(),
      }
    );

    await this.agentBus.send(escalateMessage, { runId: this.currentRunId ?? undefined });

    console.log(`[Manager ${this.agentId}] エスカレーション送信完了: ${escalateTo}`);
  }

  /**
   * リトライを検討
   */
  private async considerRetry(subTask: SubTask, _workerId: AgentId): Promise<void> {
    // 簡易的なリトライロジック（将来的にはより洗練された判断を行う）
    console.log(`[Manager ${this.agentId}] リトライ検討: ${subTask.id}`);
  }

  /**
   * 全タスク完了をチェック
   */
  private async checkAllTasksComplete(): Promise<void> {
    const subTaskArray = Array.from(this.subTasks.values());
    const allCompleted = subTaskArray.every((t) => t.status === 'completed');

    if (allCompleted && this.currentTask) {
      this.currentTask.status = 'reviewing';
      this.currentTask.updatedAt = new Date().toISOString();
      console.log(`[Manager ${this.agentId}] 全サブタスク完了 - レビュー待ち`);
    }
  }


  // ===========================================================================
  // プライベートメソッド - ユーティリティ
  // ===========================================================================

  /**
   * プロジェクトコンテキストを構築
   */
  private async buildProjectContext(task: Task): Promise<ProjectContext> {
    // プロジェクト情報を取得（簡易実装）
    const project: Project = {
      id: task.projectId,
      name: task.projectId,
      gitUrl: '',
      defaultBranch: 'main',
      integrationBranch: 'develop',
      workDir: '.',
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };

    return {
      project,
      techStack: ['TypeScript', 'Node.js'],
    };
  }

  /**
   * タスク用のプロジェクト情報を取得
   */
  private async getProjectForTask(): Promise<Project> {
    if (!this.currentTask) {
      throw new ManagerAgentError('No current task', 'NO_CURRENT_TASK');
    }

    return {
      id: this.currentTask.projectId,
      name: this.currentTask.projectId,
      gitUrl: '',
      defaultBranch: 'main',
      integrationBranch: 'develop',
      workDir: '.',
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };
  }

  /**
   * 実行IDを生成
   */
  private generateRunId(): RunId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `run-${timestamp}-${random}`;
  }

  /**
   * アドバイスを生成
   *
   * @param issue - 問題情報
   * @param analysis - 失敗分析結果（オプション）
   * @returns アドバイス文字列
   *
   * @see Requirement 13.4: THE Manager_Agent SHALL provide guidance
   */
  private generateAdvice(issue: Issue, analysis?: FailureAnalysis): string {
    const parts: string[] = [];

    // 基本的なアドバイス
    if (issue.errorMessage) {
      parts.push(`エラー「${issue.errorMessage}」が発生しています。`);
    } else {
      parts.push(`問題「${issue.description}」が発生しています。`);
    }

    // 分析結果に基づくアドバイス
    if (analysis) {
      if (analysis.isRecurring) {
        parts.push(`このエラーは ${analysis.totalFailures} 回発生しています。`);
      }

      switch (analysis.recommendedAction) {
        case 'retry':
          parts.push('問題を確認し、再試行してください。');
          break;
        case 'reassign':
          parts.push('別のアプローチを検討するか、タスクの再割り当てを検討します。');
          break;
        case 'escalate':
          parts.push('この問題は上位にエスカレーションが必要です。');
          break;
      }

      // 最も頻繁なエラーに対する具体的なアドバイス
      if (analysis.mostFrequentError) {
        const specificAdvice = this.getErrorSpecificAdvice(analysis.mostFrequentError);
        if (specificAdvice) {
          parts.push(specificAdvice);
        }
      }
    } else {
      parts.push('段階的にアプローチしてください。');
    }

    return parts.join(' ');
  }

  /**
   * エラーコード別の具体的なアドバイスを取得
   *
   * @param errorCode - エラーコード
   * @returns 具体的なアドバイス
   */
  private getErrorSpecificAdvice(errorCode: string): string | null {
    const adviceMap: Record<string, string> = {
      'TIMEOUT': 'コマンドのタイムアウトが発生しています。処理を分割するか、タイムアウト値を調整してください。',
      'FILE_NOT_FOUND': 'ファイルが見つかりません。パスを確認してください。',
      'PERMISSION_DENIED': '権限エラーです。必要な権限を確認してください。',
      'SYNTAX_ERROR': '構文エラーです。コードを確認してください。',
      'DEPENDENCY_ERROR': '依存関係のエラーです。パッケージのインストール状態を確認してください。',
      'GIT_CONFLICT': 'Gitコンフリクトが発生しています。手動での解決が必要かもしれません。',
      'AI_CONNECTION_ERROR': 'AI接続エラーです。ネットワーク状態を確認してください。',
      'CONTAINER_ERROR': 'コンテナエラーです。Dockerの状態を確認してください。',
    };

    return adviceMap[errorCode] ?? null;
  }

  /**
   * 推奨アクションを生成
   *
   * @param issue - 問題情報
   * @param analysis - 失敗分析結果（オプション）
   * @returns 推奨アクション一覧
   */
  private generateSuggestedActions(issue: Issue, analysis?: FailureAnalysis): string[] {
    const actions: string[] = [];

    // 基本的なアクション
    if (issue.errorMessage) {
      actions.push('エラーメッセージを詳細に確認する');
      actions.push('関連するログを確認する');
    }

    if (issue.relatedFiles && issue.relatedFiles.length > 0) {
      actions.push(`関連ファイル（${issue.relatedFiles.join(', ')}）を確認する`);
    }

    // 分析結果に基づくアクション
    if (analysis) {
      switch (analysis.recommendedAction) {
        case 'retry':
          actions.push('問題を修正して再試行する');
          break;
        case 'reassign':
          actions.push('別のワーカーへの再割り当てを検討する');
          actions.push('タスクの分割を検討する');
          break;
        case 'escalate':
          actions.push('マネージャーに詳細を報告する');
          actions.push('手動介入を要求する');
          break;
      }
    }

    // 共通のアクション
    actions.push('問題を小さな部分に分解して対処する');
    actions.push('必要に応じてマネージャーに再度エスカレーションする');

    return actions;
  }

  /**
   * 追加リソースを生成
   *
   * @param issue - 問題情報
   * @returns 追加リソース一覧
   */
  private generateAdditionalResources(issue: Issue): string[] {
    const resources: string[] = [];

    // エラーメッセージに基づいてリソースを提案
    if (issue.errorMessage) {
      if (issue.errorMessage.includes('TypeScript') || issue.errorMessage.includes('ts')) {
        resources.push('TypeScript公式ドキュメント: https://www.typescriptlang.org/docs/');
      }
      if (issue.errorMessage.includes('Docker') || issue.errorMessage.includes('container')) {
        resources.push('Docker公式ドキュメント: https://docs.docker.com/');
      }
      if (issue.errorMessage.includes('Git') || issue.errorMessage.includes('git')) {
        resources.push('Git公式ドキュメント: https://git-scm.com/doc');
      }
    }

    // 関連ファイルがある場合
    if (issue.relatedFiles && issue.relatedFiles.length > 0) {
      resources.push('関連ファイルのコードレビューを実施');
    }

    return resources;
  }

  // ===========================================================================
  // 状態取得メソッド
  // ===========================================================================

  /**
   * 現在のタスクを取得
   */
  getCurrentTask(): Task | null {
    return this.currentTask;
  }

  /**
   * サブタスク一覧を取得
   */
  getSubTasks(): SubTask[] {
    return Array.from(this.subTasks.values());
  }

  /**
   * 特定のサブタスクを取得
   */
  getSubTask(subTaskId: string): SubTask | undefined {
    return this.subTasks.get(subTaskId);
  }

  /**
   * 登録済みワーカー一覧を取得
   */
  getRegisteredWorkers(): AgentId[] {
    return Array.from(this.registeredWorkers);
  }

  /**
   * ワーカー割り当て状況を取得
   */
  getWorkerAssignments(): Map<AgentId, SubTask | null> {
    return new Map(this.workerAssignments);
  }

  /**
   * エスカレーション履歴を取得
   */
  getEscalations(): Escalation[] {
    return [...this.escalations];
  }

  /**
   * Agent Busを取得（テスト用）
   */
  getAgentBus(): AgentBus {
    return this.agentBus;
  }

  /**
   * State Managerを取得（テスト用）
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * 現在の実行IDを取得
   */
  getCurrentRunId(): RunId | null {
    return this.currentRunId;
  }

  /**
   * ワーカー別失敗回数を取得
   */
  getWorkerFailureCounts(): Map<AgentId, number> {
    return new Map(this.workerFailureCounts);
  }

  /**
   * 失敗履歴を取得
   */
  getFailureHistory(): FailureRecord[] {
    return [...this.failureHistory];
  }

  /**
   * ワーカー進捗情報を取得
   */
  getWorkerProgressInfo(): Map<AgentId, WorkerProgressInfo> {
    return new Map(this.workerProgressInfo);
  }

  /**
   * 進捗監視中かどうかを取得
   */
  isProgressMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * ランタイムベースパスを設定（テスト用）
   */
  setRuntimeBasePath(basePath: string): void {
    this.runtimeBasePath = basePath;
  }
}


// =============================================================================
// エラークラス
// =============================================================================

/**
 * ManagerAgentエラーコード
 */
export type ManagerAgentErrorCode =
  | 'INVALID_INPUT'
  | 'DECOMPOSITION_ERROR'
  | 'ASSIGNMENT_ERROR'
  | 'WORKER_NOT_FOUND'
  | 'NO_CURRENT_TASK'
  | 'COMMUNICATION_ERROR';

/**
 * ManagerAgentエラー
 */
export class ManagerAgentError extends Error {
  constructor(
    message: string,
    public readonly code: ManagerAgentErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ManagerAgentError';
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * Manager Agentを作成
 *
 * @param config - Manager Agent設定
 * @returns Manager Agentインスタンス
 *
 * @example
 * ```typescript
 * const manager = createManagerAgent({
 *   agentId: 'manager-001',
 *   adapterName: 'ollama',
 *   modelName: 'llama3',
 * });
 * ```
 */
export function createManagerAgent(config: ManagerAgentConfig): ManagerAgent {
  return new ManagerAgent(config);
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default ManagerAgent;
