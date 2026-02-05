/**
 * エージェント実行エンジン（Agent Execution Engine）の共通型定義
 *
 * M6: Agent Execution Engineで使用される全ての型定義を集約
 * - タスク管理、実行結果、エージェント設定、システム設定に関する型
 *
 * @module execution/types
 * @see Requirements: 20.1, 20.2, 20.4
 */

// =============================================================================
// 基本型エイリアス
// =============================================================================

/**
 * エージェントID
 * @description エージェントを一意に識別するID
 */
export type AgentId = string;

/**
 * 実行ID
 * @description 実行インスタンスを一意に識別するID
 */
export type RunId = string;

/**
 * タスクID
 * @description タスクを一意に識別するID
 */
export type TaskId = string;

/**
 * コンテナID
 * @description Dockerコンテナを一意に識別するID
 */
export type ContainerId = string;

/**
 * プロセスID
 * @description バックグラウンドプロセスを一意に識別するID
 */
export type ProcessId = string;

/**
 * プルリクエストID
 * @description プルリクエストを一意に識別するID
 */
export type PullRequestId = string;

// =============================================================================
// タスクステータス定義
// =============================================================================

/**
 * タスクステータス
 * @description 親タスクの状態を表す列挙型
 */
export type TaskStatus =
  | 'pending'      // 待機中
  | 'decomposing'  // 分解中
  | 'executing'    // 実行中
  | 'reviewing'    // レビュー中
  | 'completed'    // 完了
  | 'failed';      // 失敗

/**
 * サブタスクステータス
 * @description サブタスクの状態を表す列挙型
 */
export type SubTaskStatus =
  | 'pending'       // 待機中
  | 'assigned'      // 割り当て済み
  | 'running'       // 実行中
  | 'quality_check' // 品質チェック中
  | 'completed'     // 完了
  | 'failed'        // 失敗
  | 'blocked';      // ブロック中

/**
 * 実行結果ステータス
 * @description 実行結果の状態を表す列挙型
 * @see Requirement 20.4: THE status field SHALL be one of: success, partial, quality_failed, error
 */
export type ExecutionStatus =
  | 'success'        // 成功
  | 'partial'        // 部分完了（最大イテレーション到達）
  | 'quality_failed' // 品質ゲート失敗
  | 'error';         // エラー

// =============================================================================
// タスク関連の型定義
// =============================================================================

/**
 * タスクメタデータ
 * @description タスクに付随するメタ情報
 */
export interface TaskMetadata {
  /** 優先度 */
  priority: 'low' | 'medium' | 'high';
  /** 期限（ISO8601形式、オプション） */
  deadline?: string;
  /** タグ一覧 */
  tags: string[];
}

/**
 * タスク
 * @description 社長（ユーザー）からの指示を表すタスク
 */
export interface Task {
  /** タスクID */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** 社長からの指示 */
  instruction: string;
  /** タスクステータス */
  status: TaskStatus;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
  /** 割り当てられたマネージャーエージェント */
  assignedManager?: AgentId;
  /** サブタスク一覧 */
  subTasks: SubTask[];
  /** メタデータ */
  metadata: TaskMetadata;
}

/**
 * サブタスク
 * @description タスクを分解した独立した作業単位
 */
export interface SubTask {
  /** サブタスクID */
  id: string;
  /** 親タスクID */
  parentId: string;
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** 受け入れ基準一覧 */
  acceptanceCriteria: string[];
  /** サブタスクステータス */
  status: SubTaskStatus;
  /** 割り当てられたワーカーエージェント */
  assignee?: AgentId;
  /** 実行ID */
  runId?: string;
  /** Gitブランチ名 */
  gitBranch?: string;
  /** 成果物パス一覧 */
  artifacts: string[];
  /** 品質ゲート結果 */
  qualityGateResult?: QualityGateResult;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

// =============================================================================
// 実行結果関連の型定義
// =============================================================================

/**
 * 成果物情報
 * @description 実行中に作成・変更・削除されたファイルの情報
 */
export interface ArtifactInfo {
  /** ファイルパス */
  path: string;
  /** アクション種別 */
  action: 'created' | 'modified' | 'deleted';
  /** 差分（オプション） */
  diff?: string;
}

/**
 * コミット情報
 * @description Gitコミットの情報
 */
export interface CommitInfo {
  /** コミットハッシュ */
  hash: string;
  /** コミットメッセージ */
  message: string;
  /** 作成者 */
  author: string;
  /** コミット日時（ISO8601形式） */
  timestamp: string;
}

/**
 * エラー情報
 * @description 実行中に発生したエラーの詳細
 */
export interface ErrorInfo {
  /** エラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
  /** スタックトレース（オプション） */
  stack?: string;
  /** 発生日時（ISO8601形式） */
  timestamp: string;
  /** 復旧可能フラグ */
  recoverable: boolean;
}

/**
 * 品質ゲート結果
 * @description lint/testの実行結果
 */
export interface QualityGateResult {
  /** lint結果 */
  lint: {
    /** 合格フラグ */
    passed: boolean;
    /** 出力ログ */
    output: string;
  };
  /** test結果 */
  test: {
    /** 合格フラグ */
    passed: boolean;
    /** 出力ログ */
    output: string;
  };
  /** 総合判定 */
  overall: boolean;
}

/**
 * 実行結果
 * @description タスク実行の結果を表す構造体
 * @see Requirement 20.1: THE Execution_Result SHALL be output in JSON format
 * @see Requirement 20.2: THE output SHALL include: run_id, ticket_id, agent_id, status, start_time, end_time, artifacts, git_branch, quality_gates, errors
 * @see Requirement 20.4: THE status field SHALL be one of: success, partial, quality_failed, error
 */
export interface ExecutionResult {
  /** 実行ID */
  runId: string;
  /** チケットID */
  ticketId: string;
  /** エージェントID */
  agentId: string;
  /** 実行ステータス */
  status: ExecutionStatus;
  /** 開始日時（ISO8601形式） */
  startTime: string;
  /** 終了日時（ISO8601形式） */
  endTime: string;
  /** 成果物一覧 */
  artifacts: ArtifactInfo[];
  /** Gitブランチ名 */
  gitBranch: string;
  /** コミット一覧 */
  commits: CommitInfo[];
  /** 品質ゲート結果 */
  qualityGates: QualityGateResult;
  /** エラー一覧 */
  errors: ErrorInfo[];
  /** 会話ターン数 */
  conversationTurns: number;
  /** 使用トークン数 */
  tokensUsed: number;
}

// =============================================================================
// エージェント設定関連の型定義
// =============================================================================

/**
 * エージェントロール
 * @description エージェントの役割を表す列挙型
 */
export type AgentRole = 'manager' | 'worker' | 'reviewer' | 'merger';

/**
 * AI設定
 * @description エージェントが使用するAIの設定
 */
export interface AIConfig {
  /** アダプタ名（'ollama' | 'gemini' | 'kiro' など） */
  adapter: string;
  /** モデル名 */
  model: string;
  /** 温度パラメータ（オプション） */
  temperature?: number;
  /** 最大トークン数（オプション） */
  maxTokens?: number;
}

/**
 * リソース制限
 * @description エージェントのリソース制限設定
 */
export interface ResourceLimits {
  /** CPU制限（例: '2'） */
  cpuLimit?: string;
  /** メモリ制限（例: '4g'） */
  memoryLimit?: string;
  /** タイムアウト秒数 */
  timeoutSeconds?: number;
}

/**
 * エスカレーション設定
 * @description 問題発生時のエスカレーション先設定
 */
export interface EscalationConfig {
  /** エスカレーション先エージェントID */
  to: string;
  /** エスカレーション条件一覧 */
  conditions: string[];
}

/**
 * エージェント設定
 * @description エージェントの設定情報
 */
export interface AgentConfig {
  /** エージェントID */
  id: string;
  /** タイトル */
  title: string;
  /** 役割 */
  role: AgentRole;
  /** 責務一覧 */
  responsibilities: string[];
  /** 能力一覧 */
  capabilities: string[];
  /** ペルソナ（性格・振る舞いの説明） */
  persona: string;
  /** AI設定 */
  aiConfig: AIConfig;
  /** リソース制限 */
  resourceLimits: ResourceLimits;
  /** エスカレーション設定 */
  escalation: EscalationConfig;
}

// =============================================================================
// システム設定関連の型定義
// =============================================================================

/**
 * コンテナランタイム種別
 * @description 使用するコンテナランタイムの種類
 */
export type ContainerRuntimeType = 'dod' | 'rootless' | 'dind';

/**
 * メッセージキュー種別
 * @description 使用するメッセージキューの種類
 */
export type MessageQueueType = 'file' | 'sqlite' | 'redis';

/**
 * Git認証種別
 * @description Git認証の方式
 */
export type GitCredentialType = 'deploy_key' | 'token' | 'ssh_agent';

/**
 * システム設定
 * @description システム全体の設定情報
 */
export interface SystemConfig {
  // ワーカー設定
  /** 最大同時実行ワーカー数（デフォルト: 3） */
  maxConcurrentWorkers: number;
  /** デフォルトタイムアウト秒数（デフォルト: 300） */
  defaultTimeout: number;
  /** ワーカーメモリ制限（デフォルト: '4g'） */
  workerMemoryLimit: string;
  /** ワーカーCPU制限（デフォルト: '2'） */
  workerCpuLimit: string;

  // AI設定
  /** デフォルトAIアダプタ（デフォルト: 'ollama'） */
  defaultAiAdapter: string;
  /** デフォルトモデル（デフォルト: 'llama3'） */
  defaultModel: string;

  // コンテナランタイム設定
  /** コンテナランタイム種別（デフォルト: 'dod'） */
  containerRuntime: ContainerRuntimeType;
  /** Dockerソケットパス（DoD用） */
  dockerSocketPath?: string;
  /** 許可されたDockerコマンド（デフォルト: ['run', 'stop', 'rm', 'logs', 'inspect']） */
  allowedDockerCommands: string[];

  // メッセージキュー設定
  /** メッセージキュー種別（デフォルト: 'file'） */
  messageQueueType: MessageQueueType;
  /** メッセージキューパス（ファイルベース用） */
  messageQueuePath?: string;

  // Git認証設定
  /** Git認証種別（デフォルト: 'token'） */
  gitCredentialType: GitCredentialType;
  /** SSH agent forwarding有効フラグ（デフォルト: false、開発環境のみtrue許可） */
  gitSshAgentEnabled: boolean;

  // その他
  /** 状態保持日数（デフォルト: 7） */
  stateRetentionDays: number;
  /** 統合ブランチ名（デフォルト: 'develop'） */
  integrationBranch: string;
  /** 自動更新間隔ミリ秒（デフォルト: 5000） */
  autoRefreshInterval: number;
}

/**
 * デフォルトシステム設定
 * @description システム設定のデフォルト値
 */
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  // ワーカー設定
  maxConcurrentWorkers: 3,
  defaultTimeout: 300,
  workerMemoryLimit: '4g',
  workerCpuLimit: '2',

  // AI設定
  defaultAiAdapter: 'ollama',
  defaultModel: 'llama3',

  // コンテナランタイム設定
  containerRuntime: 'dod',
  allowedDockerCommands: ['run', 'stop', 'rm', 'logs', 'inspect'],

  // メッセージキュー設定
  messageQueueType: 'file',

  // Git認証設定
  gitCredentialType: 'token',
  gitSshAgentEnabled: false,

  // その他
  stateRetentionDays: 7,
  integrationBranch: 'develop',
  autoRefreshInterval: 5000,
};

// =============================================================================
// プロジェクト関連の型定義
// =============================================================================

/**
 * プロジェクト
 * @description 管理対象のプロジェクト情報
 */
export interface Project {
  /** プロジェクトID */
  id: string;
  /** プロジェクト名 */
  name: string;
  /** GitリポジトリURL */
  gitUrl: string;
  /** デフォルトブランチ（例: 'main'） */
  defaultBranch: string;
  /** 統合ブランチ（例: 'develop'） */
  integrationBranch: string;
  /** 作業ディレクトリ */
  workDir: string;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 最終使用日時（ISO8601形式） */
  lastUsed: string;
}

// =============================================================================
// 会話履歴関連の型定義
// =============================================================================

/**
 * 会話メッセージロール
 * @description 会話メッセージの送信者種別
 */
export type ConversationRole = 'system' | 'user' | 'assistant';

/**
 * 会話メッセージ
 * @description AIとの会話における1つのメッセージ
 */
export interface ConversationMessage {
  /** 送信者ロール */
  role: ConversationRole;
  /** メッセージ内容 */
  content: string;
  /** 送信日時（ISO8601形式） */
  timestamp: string;
}

/**
 * ツール呼び出し記録
 * @description AIが要求したツール呼び出しの記録
 */
export interface ToolCallRecord {
  /** ツール呼び出しID */
  id: string;
  /** ツール名 */
  name: string;
  /** 引数 */
  arguments: Record<string, unknown>;
  /** 実行結果 */
  result: unknown;
  /** 実行日時（ISO8601形式） */
  timestamp: string;
  /** 実行時間（ミリ秒） */
  durationMs: number;
}

/**
 * 会話履歴
 * @description タスク実行中のAIとの会話履歴
 */
export interface ConversationHistory {
  /** 実行ID */
  runId: string;
  /** エージェントID */
  agentId: string;
  /** メッセージ一覧 */
  messages: ConversationMessage[];
  /** ツール呼び出し記録一覧 */
  toolCalls: ToolCallRecord[];
  /** 総トークン数 */
  totalTokens: number;
}

// =============================================================================
// エージェントバス関連の型定義
// =============================================================================

/**
 * エージェントメッセージ種別
 * @description エージェント間で送受信されるメッセージの種類
 */
export type AgentMessageType =
  | 'task_assign'      // タスク割り当て
  | 'task_complete'    // タスク完了
  | 'task_failed'      // タスク失敗
  | 'escalate'         // エスカレーション
  | 'status_request'   // ステータス要求
  | 'status_response'; // ステータス応答

/**
 * エージェントメッセージ
 * @description エージェント間で送受信されるメッセージ
 */
export interface AgentMessage {
  /** メッセージID */
  id: string;
  /** メッセージ種別 */
  type: AgentMessageType;
  /** 送信元エージェントID */
  from: AgentId;
  /** 送信先エージェントID */
  to: AgentId;
  /** ペイロード */
  payload: unknown;
  /** 送信日時（ISO8601形式） */
  timestamp: string;
}

// =============================================================================
// 実行状態関連の型定義
// =============================================================================

/**
 * 実行状態ステータス
 * @description 実行状態の種類
 */
export type ExecutionStateStatus = 'running' | 'paused' | 'completed' | 'failed';

/**
 * 実行状態
 * @description タスク実行の状態を永続化するための構造体
 */
export interface ExecutionState {
  /** 実行ID */
  runId: string;
  /** タスクID */
  taskId: string;
  /** 実行状態ステータス */
  status: ExecutionStateStatus;
  /** ワーカー割り当てマップ（AgentId -> SubTask） */
  workerAssignments: Record<AgentId, SubTask>;
  /** 会話履歴マップ（AgentId -> ConversationHistory） */
  conversationHistories: Record<AgentId, ConversationHistory>;
  /** Gitブランチマップ（AgentId -> ブランチ名） */
  gitBranches: Record<AgentId, string>;
  /** 成果物パス一覧 */
  artifacts: string[];
  /** 最終更新日時（ISO8601形式） */
  lastUpdated: string;
}

// =============================================================================
// コマンド実行関連の型定義
// =============================================================================

/**
 * コマンド実行オプション
 * @description コマンド実行時のオプション
 */
export interface ExecuteOptions {
  /** タイムアウト秒数（デフォルト: 300） */
  timeout?: number;
  /** 作業ディレクトリ */
  cwd?: string;
  /** 環境変数 */
  env?: Record<string, string>;
}

/**
 * コマンド拒否理由
 * @description コマンドが拒否された理由
 */
export type CommandRejectionReason = 'interactive_command';

/**
 * コマンド実行結果
 * @description コマンド実行の結果
 */
export interface CommandResult {
  /** 終了コード */
  exitCode: number;
  /** 標準出力 */
  stdout: string;
  /** 標準エラー出力 */
  stderr: string;
  /** タイムアウトフラグ */
  timedOut: boolean;
  /**
   * コマンド拒否フラグ
   * @description インタラクティブコマンドなど、実行が拒否された場合にtrue
   * @see Requirement 6.3: THE Process_Monitor SHALL detect and reject interactive commands
   */
  rejected?: boolean;
  /**
   * 拒否理由
   * @description コマンドが拒否された理由
   */
  rejectionReason?: CommandRejectionReason;
  /**
   * バックグラウンドプロセスID
   * @description サーバーコマンドがバックグラウンドで実行された場合のプロセスID
   * @see Requirement 6.4: THE Process_Monitor SHALL detect server commands and run in background
   * @see Requirement 6.5: WHEN background process starts, THE Process_Monitor SHALL return process_id
   */
  backgroundProcessId?: ProcessId;
}

/**
 * プロセスステータス
 * @description バックグラウンドプロセスの状態
 */
export type ProcessStatus = 'running' | 'stopped' | 'exited';

// =============================================================================
// Git関連の型定義
// =============================================================================

/**
 * Gitステータス
 * @description Gitリポジトリの状態
 */
export interface GitStatus {
  /** 現在のブランチ名 */
  branch: string;
  /** ステージングされたファイル一覧 */
  staged: string[];
  /** 変更されたファイル一覧 */
  modified: string[];
  /** 追跡されていないファイル一覧 */
  untracked: string[];
  /** コンフリクト中のファイル一覧 */
  conflicts: string[];
}

/**
 * コンフリクト情報
 * @description Gitコンフリクトの詳細情報
 */
export interface ConflictInfo {
  /** ファイルパス */
  file: string;
  /** ベースバージョン */
  base: string;
  /** 自分の変更 */
  ours: string;
  /** 相手の変更 */
  theirs: string;
}

// =============================================================================
// ワーカープール関連の型定義
// =============================================================================

/**
 * プールステータス
 * @description ワーカープールの状態
 */
export interface PoolStatus {
  /** 総ワーカー数 */
  totalWorkers: number;
  /** アクティブワーカー数 */
  activeWorkers: number;
  /** アイドルワーカー数 */
  idleWorkers: number;
  /** 保留中タスク数 */
  pendingTasks: number;
  /** コンテナランタイム種別 */
  containerRuntime: string;
}

/**
 * ワーカーステータス
 * @description 個別ワーカーの状態
 */
export type WorkerStatus = 'idle' | 'working' | 'error' | 'terminated';

// =============================================================================
// バリデーション関連の型定義
// =============================================================================

/**
 * バリデーション結果
 * @description 各種バリデーションの結果
 */
export interface ValidationResult {
  /** 有効フラグ */
  valid: boolean;
  /** エラーメッセージ一覧 */
  errors: string[];
  /** 警告メッセージ一覧 */
  warnings: string[];
}

// =============================================================================
// ユーティリティ型
// =============================================================================

/**
 * 実行結果の必須フィールド
 * @description ExecutionResultの必須フィールドを検証するためのユーティリティ型
 */
export type ExecutionResultRequiredFields = keyof Pick<
  ExecutionResult,
  | 'runId'
  | 'ticketId'
  | 'agentId'
  | 'status'
  | 'startTime'
  | 'endTime'
  | 'artifacts'
  | 'gitBranch'
  | 'qualityGates'
  | 'errors'
>;

/**
 * 実行結果の必須フィールド一覧
 * @description Requirement 20.2で定義された必須フィールドの配列
 */
export const EXECUTION_RESULT_REQUIRED_FIELDS: ExecutionResultRequiredFields[] = [
  'runId',
  'ticketId',
  'agentId',
  'status',
  'startTime',
  'endTime',
  'artifacts',
  'gitBranch',
  'qualityGates',
  'errors',
];

/**
 * 有効な実行ステータス一覧
 * @description Requirement 20.4で定義された有効なステータス値
 */
export const VALID_EXECUTION_STATUSES: ExecutionStatus[] = [
  'success',
  'partial',
  'quality_failed',
  'error',
];


// =============================================================================
// システム設定バリデーション
// =============================================================================

/**
 * 有効なコンテナランタイム種別一覧
 * @description Requirement 5.8で定義された有効なコンテナランタイム
 */
export const VALID_CONTAINER_RUNTIMES: ContainerRuntimeType[] = ['dod', 'rootless', 'dind'];

/**
 * 有効なメッセージキュー種別一覧
 */
export const VALID_MESSAGE_QUEUE_TYPES: MessageQueueType[] = ['file', 'sqlite', 'redis'];

/**
 * 有効なGit認証種別一覧
 */
export const VALID_GIT_CREDENTIAL_TYPES: GitCredentialType[] = ['deploy_key', 'token', 'ssh_agent'];

/**
 * デフォルトで許可されるDockerコマンド一覧
 * @description Requirement 5.9で定義された許可コマンド
 */
export const DEFAULT_ALLOWED_DOCKER_COMMANDS: string[] = ['run', 'stop', 'rm', 'logs', 'inspect'];

/**
 * システム設定のバリデーション
 *
 * @param config - バリデーション対象の設定
 * @returns バリデーション結果
 *
 * @see Requirement 5.8: THE container runtime selection SHALL be configurable via `runtime/state/config.json`
 */
export function validateSystemConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // nullまたはundefinedチェック
  if (config === null || config === undefined) {
    return {
      valid: false,
      errors: ['設定がnullまたはundefinedです'],
      warnings: [],
    };
  }

  // オブジェクトチェック
  if (typeof config !== 'object') {
    return {
      valid: false,
      errors: ['設定はオブジェクトである必要があります'],
      warnings: [],
    };
  }

  const cfg = config as Record<string, unknown>;

  // ワーカー設定のバリデーション
  if (cfg.maxConcurrentWorkers !== undefined) {
    if (typeof cfg.maxConcurrentWorkers !== 'number' || cfg.maxConcurrentWorkers < 1) {
      errors.push('maxConcurrentWorkersは1以上の数値である必要があります');
    }
  }

  if (cfg.defaultTimeout !== undefined) {
    if (typeof cfg.defaultTimeout !== 'number' || cfg.defaultTimeout < 1) {
      errors.push('defaultTimeoutは1以上の数値である必要があります');
    }
  }

  if (cfg.workerMemoryLimit !== undefined) {
    if (typeof cfg.workerMemoryLimit !== 'string') {
      errors.push('workerMemoryLimitは文字列である必要があります');
    }
  }

  if (cfg.workerCpuLimit !== undefined) {
    if (typeof cfg.workerCpuLimit !== 'string') {
      errors.push('workerCpuLimitは文字列である必要があります');
    }
  }

  // AI設定のバリデーション
  if (cfg.defaultAiAdapter !== undefined) {
    if (typeof cfg.defaultAiAdapter !== 'string') {
      errors.push('defaultAiAdapterは文字列である必要があります');
    }
  }

  if (cfg.defaultModel !== undefined) {
    if (typeof cfg.defaultModel !== 'string') {
      errors.push('defaultModelは文字列である必要があります');
    }
  }

  // コンテナランタイム設定のバリデーション
  if (cfg.containerRuntime !== undefined) {
    if (!VALID_CONTAINER_RUNTIMES.includes(cfg.containerRuntime as ContainerRuntimeType)) {
      errors.push(
        `containerRuntimeは ${VALID_CONTAINER_RUNTIMES.join(', ')} のいずれかである必要があります`
      );
    }
  }

  if (cfg.allowedDockerCommands !== undefined) {
    if (!Array.isArray(cfg.allowedDockerCommands)) {
      errors.push('allowedDockerCommandsは配列である必要があります');
    } else {
      for (const cmd of cfg.allowedDockerCommands) {
        if (typeof cmd !== 'string') {
          errors.push('allowedDockerCommandsの各要素は文字列である必要があります');
          break;
        }
      }
    }
  }

  // メッセージキュー設定のバリデーション
  if (cfg.messageQueueType !== undefined) {
    if (!VALID_MESSAGE_QUEUE_TYPES.includes(cfg.messageQueueType as MessageQueueType)) {
      errors.push(
        `messageQueueTypeは ${VALID_MESSAGE_QUEUE_TYPES.join(', ')} のいずれかである必要があります`
      );
    }
  }

  // Git認証設定のバリデーション
  if (cfg.gitCredentialType !== undefined) {
    if (!VALID_GIT_CREDENTIAL_TYPES.includes(cfg.gitCredentialType as GitCredentialType)) {
      errors.push(
        `gitCredentialTypeは ${VALID_GIT_CREDENTIAL_TYPES.join(', ')} のいずれかである必要があります`
      );
    }
  }

  if (cfg.gitSshAgentEnabled !== undefined) {
    if (typeof cfg.gitSshAgentEnabled !== 'boolean') {
      errors.push('gitSshAgentEnabledはブール値である必要があります');
    }
  }

  // その他の設定のバリデーション
  if (cfg.stateRetentionDays !== undefined) {
    if (typeof cfg.stateRetentionDays !== 'number' || cfg.stateRetentionDays < 1) {
      errors.push('stateRetentionDaysは1以上の数値である必要があります');
    }
  }

  if (cfg.integrationBranch !== undefined) {
    if (typeof cfg.integrationBranch !== 'string') {
      errors.push('integrationBranchは文字列である必要があります');
    }
  }

  if (cfg.autoRefreshInterval !== undefined) {
    if (typeof cfg.autoRefreshInterval !== 'number' || cfg.autoRefreshInterval < 100) {
      errors.push('autoRefreshIntervalは100以上の数値である必要があります');
    }
  }

  // 警告: DINDは明示的オプトインのみ
  if (cfg.containerRuntime === 'dind') {
    warnings.push('DINDはCI環境など必要な場合のみ使用してください（デフォルトはDoD）');
  }

  // 警告: SSH agent forwardingは開発環境のみ
  if (cfg.gitSshAgentEnabled === true) {
    warnings.push('SSH agent forwardingは開発環境のみで使用してください');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 設定をデフォルト値とマージ
 *
 * @param partialConfig - 部分的な設定
 * @returns デフォルト値とマージされた完全な設定
 */
export function mergeWithDefaultConfig(partialConfig: Partial<SystemConfig>): SystemConfig {
  return {
    ...DEFAULT_SYSTEM_CONFIG,
    ...partialConfig,
  };
}
