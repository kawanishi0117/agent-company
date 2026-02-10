/**
 * エージェント実行エンジン（Agent Execution Engine）の共通型定義
 *
 * M6: Agent Execution Engineで使用される全ての型定義を集約
 * - タスク管理、実行結果、エージェント設定、システム設定に関する型
 * - チケット階層構造（Parent/Child/Grandchild）
 * - ワーカータイプ定義
 * - レビュー結果
 *
 * @module execution/types
 * @see Requirements: 20.1, 20.2, 20.4, 2.5, 2.6, 2.7, 3.1, 5.2
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
  | 'pending' // 待機中
  | 'decomposing' // 分解中
  | 'executing' // 実行中
  | 'reviewing' // レビュー中
  | 'completed' // 完了
  | 'failed'; // 失敗

/**
 * サブタスクステータス
 * @description サブタスクの状態を表す列挙型
 */
export type SubTaskStatus =
  | 'pending' // 待機中
  | 'assigned' // 割り当て済み
  | 'running' // 実行中
  | 'quality_check' // 品質チェック中
  | 'completed' // 完了
  | 'failed' // 失敗
  | 'blocked'; // ブロック中

/**
 * 実行結果ステータス
 * @description 実行結果の状態を表す列挙型
 * @see Requirement 20.4: THE status field SHALL be one of: success, partial, quality_failed, error
 */
export type ExecutionStatus =
  | 'success' // 成功
  | 'partial' // 部分完了（最大イテレーション到達）
  | 'quality_failed' // 品質ゲート失敗
  | 'error'; // エラー

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
  defaultModel: 'llama3.2:1b',

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
 * @see Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 4.6
 */
export type AgentMessageType =
  | 'task_assign' // タスク割り当て
  | 'task_complete' // タスク完了
  | 'task_failed' // タスク失敗
  | 'escalate' // エスカレーション
  | 'status_request' // ステータス要求
  | 'status_response' // ステータス応答
  | 'review_request' // レビュー要求
  | 'review_response' // レビュー応答
  | 'conflict_escalate'; // コンフリクトエスカレーション

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

// =============================================================================
// チケット階層構造の型定義
// @see Requirements: 2.5, 2.6, 2.7, 2.8
// =============================================================================

/**
 * チケットステータス
 * @description チケットの状態を表す列挙型
 * @see Requirement 2.8: WHEN a ticket status changes, THE Ticket_Manager SHALL propagate status updates
 */
export type TicketStatus =
  | 'pending' // 待機中
  | 'decomposing' // 分解中
  | 'in_progress' // 実行中
  | 'review_requested' // レビュー待ち
  | 'revision_required' // 修正要求
  | 'completed' // 完了
  | 'failed' // 失敗
  | 'pr_created'; // PR作成済み

/**
 * 有効なチケットステータス一覧
 */
export const VALID_TICKET_STATUSES: TicketStatus[] = [
  'pending',
  'decomposing',
  'in_progress',
  'review_requested',
  'revision_required',
  'completed',
  'failed',
  'pr_created',
];

/**
 * 親チケットメタデータ
 * @description 親チケットに付随するメタ情報
 */
export interface ParentTicketMetadata {
  /** 優先度 */
  priority: 'low' | 'medium' | 'high';
  /** 期限（ISO8601形式、オプション） */
  deadline?: string;
  /** タグ一覧 */
  tags: string[];
}

/**
 * 親チケット（社長の指示）
 * @description 社長（ユーザー）からの指示を表す親チケット
 * @see Requirement 2.5: THE Parent_Ticket SHALL contain: id, projectId, instruction, status, createdAt, childTickets[]
 */
export interface ParentTicket {
  /** チケットID（形式: <project-id>-<sequence>） */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** 社長からの指示 */
  instruction: string;
  /** チケットステータス */
  status: TicketStatus;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
  /** 子チケット一覧 */
  childTickets: ChildTicket[];
  /** メタデータ */
  metadata: ParentTicketMetadata;
}

/**
 * 親チケットの必須フィールド一覧
 * @see Requirement 2.5
 */
export const PARENT_TICKET_REQUIRED_FIELDS: (keyof ParentTicket)[] = [
  'id',
  'projectId',
  'instruction',
  'status',
  'createdAt',
  'childTickets',
];

/**
 * 子チケット（部長が分解）
 * @description Manager Agentが分解した子チケット
 * @see Requirement 2.6: THE Child_Ticket SHALL contain: id, parentId, title, description, status, workerType, grandchildTickets[]
 */
export interface ChildTicket {
  /** チケットID（形式: <parent-id>-<sequence>） */
  id: string;
  /** 親チケットID */
  parentId: string;
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** チケットステータス */
  status: TicketStatus;
  /** 担当ワーカータイプ */
  workerType: WorkerType;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
  /** 孫チケット一覧 */
  grandchildTickets: GrandchildTicket[];
}

/**
 * 子チケットの必須フィールド一覧
 * @see Requirement 2.6
 */
export const CHILD_TICKET_REQUIRED_FIELDS: (keyof ChildTicket)[] = [
  'id',
  'parentId',
  'title',
  'description',
  'status',
  'workerType',
  'grandchildTickets',
];

/**
 * 孫チケット（実作業）
 * @description 実際の作業単位となる孫チケット
 * @see Requirement 2.7: THE Grandchild_Ticket SHALL contain: id, parentId, title, description, acceptanceCriteria[], status, assignee, gitBranch, artifacts[]
 */
export interface GrandchildTicket {
  /** チケットID（形式: <child-id>-<sequence>） */
  id: string;
  /** 親チケットID（子チケットのID） */
  parentId: string;
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** 受け入れ基準一覧 */
  acceptanceCriteria: string[];
  /** チケットステータス */
  status: TicketStatus;
  /** 割り当てられたワーカーID（オプション） */
  assignee?: string;
  /** 作業ブランチ名（オプション） */
  gitBranch?: string;
  /** 成果物パス一覧 */
  artifacts: string[];
  /** レビュー結果（オプション） */
  reviewResult?: ReviewResult;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * 孫チケットの必須フィールド一覧
 * @see Requirement 2.7
 */
export const GRANDCHILD_TICKET_REQUIRED_FIELDS: (keyof GrandchildTicket)[] = [
  'id',
  'parentId',
  'title',
  'description',
  'acceptanceCriteria',
  'status',
  'artifacts',
];

// =============================================================================
// ワーカータイプの型定義
// @see Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
// =============================================================================

/**
 * ワーカータイプ
 * @description エージェントの専門分野を表す列挙型
 * @see Requirement 3.1: THE System SHALL support the following worker types: research, design, designer, developer, test, reviewer
 */
export type WorkerType =
  | 'research' // 市場調査・技術調査
  | 'design' // アーキテクチャ設計
  | 'designer' // UI/UXデザイン
  | 'developer' // コード実装
  | 'test' // テスト作成・実行
  | 'reviewer'; // コードレビュー

/**
 * 有効なワーカータイプ一覧
 * @see Requirement 3.1
 */
export const VALID_WORKER_TYPES: WorkerType[] = [
  'research',
  'design',
  'designer',
  'developer',
  'test',
  'reviewer',
];

/**
 * ワーカータイプ設定
 * @description 各ワーカータイプの能力・ツール・ペルソナ設定
 * @see Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
export interface WorkerTypeConfig {
  /** ワーカータイプ */
  type: WorkerType;
  /** 能力一覧 */
  capabilities: string[];
  /** 使用可能ツール一覧 */
  tools: string[];
  /** ペルソナ（性格・振る舞いの説明） */
  persona: string;
  /** AI設定 */
  aiConfig: {
    /** アダプタ名 */
    adapter: string;
    /** モデル名 */
    model: string;
    /** 温度パラメータ */
    temperature: number;
  };
}

/**
 * ワーカータイプ設定の必須フィールド一覧
 */
export const WORKER_TYPE_CONFIG_REQUIRED_FIELDS: (keyof WorkerTypeConfig)[] = [
  'type',
  'capabilities',
  'tools',
  'persona',
  'aiConfig',
];

// =============================================================================
// レビュー関連の型定義
// @see Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
// =============================================================================

/**
 * レビューチェックリスト
 * @description レビュー時のチェック項目
 * @see Requirement 5.2: THE Reviewer_Agent SHALL check: code quality, test coverage, acceptance criteria fulfillment
 */
export interface ReviewChecklist {
  /** コード品質チェック結果 */
  codeQuality: boolean;
  /** テストカバレッジチェック結果 */
  testCoverage: boolean;
  /** 受け入れ基準充足チェック結果 */
  acceptanceCriteria: boolean;
}

/**
 * レビュー決定
 * @description レビュアーの判定結果
 * @see Requirements: 5.3, 5.4, 5.5
 */
export interface ReviewDecision {
  /** 承認フラグ */
  approved: boolean;
  /** フィードバック（却下時は必須） */
  feedback?: string;
  /** チェックリスト結果 */
  checklist: ReviewChecklist;
}

/**
 * レビュー結果
 * @description レビューの完全な結果情報
 * @see Requirement 5.6: THE Reviewer_Agent SHALL log all review decisions
 */
export interface ReviewResult {
  /** レビュアーID */
  reviewerId: string;
  /** 承認フラグ */
  approved: boolean;
  /** フィードバック（オプション） */
  feedback?: string;
  /** チェックリスト結果 */
  checklist: ReviewChecklist;
  /** レビュー日時（ISO8601形式） */
  reviewedAt: string;
}

/**
 * レビュー結果の必須フィールド一覧
 */
export const REVIEW_RESULT_REQUIRED_FIELDS: (keyof ReviewResult)[] = [
  'reviewerId',
  'approved',
  'checklist',
  'reviewedAt',
];

/**
 * レビューステータス
 * @description レビューの状態
 */
export type ReviewStatus =
  | 'pending' // レビュー待ち
  | 'in_review' // レビュー中
  | 'approved' // 承認済み
  | 'rejected'; // 却下

/**
 * 有効なレビューステータス一覧
 */
export const VALID_REVIEW_STATUSES: ReviewStatus[] = [
  'pending',
  'in_review',
  'approved',
  'rejected',
];

// =============================================================================
// チケット永続化の型定義
// @see Requirement 9.1
// =============================================================================

/**
 * チケット永続化データ
 * @description チケット階層を永続化するためのデータ構造
 * @see Requirement 9.1: THE System SHALL persist ticket hierarchy to `runtime/state/tickets/<project-id>.json`
 */
export interface TicketPersistenceData {
  /** プロジェクトID */
  projectId: string;
  /** 親チケット一覧 */
  parentTickets: ParentTicket[];
  /** 最終更新日時（ISO8601形式） */
  lastUpdated: string;
}

/**
 * 実行永続化データ
 * @description 実行状態を永続化するためのデータ構造
 * @see Requirement 9.2: THE System SHALL persist execution state to `runtime/state/runs/<run-id>/state.json`
 */
export interface ExecutionPersistenceData {
  /** 実行ID */
  runId: string;
  /** チケットID */
  ticketId: string;
  /** 実行状態 */
  status: 'running' | 'paused' | 'completed' | 'failed';
  /** ワーカー状態マップ */
  workerStates: Record<string, WorkerState>;
  /** 会話履歴マップ */
  conversationHistories: Record<string, ConversationHistory>;
  /** Gitブランチマップ */
  gitBranches: Record<string, string>;
  /** 最終更新日時（ISO8601形式） */
  lastUpdated: string;
}

/**
 * ワーカー状態
 * @description ワーカーの実行状態
 */
export interface WorkerState {
  /** ワーカーID */
  workerId: string;
  /** ワーカータイプ */
  workerType: WorkerType;
  /** 現在のステータス */
  status: WorkerStatus;
  /** 割り当てられたチケットID */
  assignedTicketId?: string;
  /** 最終アクティビティ日時（ISO8601形式） */
  lastActivity: string;
}

// =============================================================================
// 拡張プロジェクトの型定義
// @see Requirements: 1.1, 1.2, 1.5
// =============================================================================

/**
 * 拡張プロジェクト
 * @description ブランチ設定を含む拡張プロジェクト情報
 * @see Requirement 1.1: THE Project SHALL include `baseBranch` field for PR target branch (default: 'main')
 * @see Requirement 1.2: THE Project SHALL include `agentBranch` field for agent work integration branch
 */
export interface ExtendedProject extends Project {
  /** PRの作成先ブランチ（デフォルト: 'main'） */
  baseBranch: string;
  /** エージェント作業用ブランチ（デフォルト: 'agent/<project-id>'） */
  agentBranch: string;
}

/**
 * 拡張プロジェクトの必須フィールド一覧
 * @see Requirements: 1.1, 1.2
 */
export const EXTENDED_PROJECT_REQUIRED_FIELDS: (keyof ExtendedProject)[] = [
  'id',
  'name',
  'gitUrl',
  'defaultBranch',
  'integrationBranch',
  'workDir',
  'createdAt',
  'lastUsed',
  'baseBranch',
  'agentBranch',
];

/**
 * プロジェクト登録オプション
 * @description プロジェクト登録時のオプション（name, gitUrlは別引数で渡す）
 */
export interface AddProjectOptions {
  /** デフォルトブランチ（オプション、デフォルト: 'main'） */
  defaultBranch?: string;
  /** 統合ブランチ（オプション、デフォルト: 'develop'） */
  integrationBranch?: string;
  /** 作業ディレクトリ（オプション） */
  workDir?: string;
}

/**
 * 拡張プロジェクト登録オプション
 * @description ブランチ設定を含む拡張プロジェクト登録オプション
 * @see Requirements: 1.1, 1.2, 1.3
 */
export interface ExtendedAddProjectOptions extends AddProjectOptions {
  /** PRの作成先ブランチ（オプション、デフォルト: 'main'） */
  baseBranch?: string;
  /** エージェント作業用ブランチ（オプション、デフォルト: 'agent/<project-id>'） */
  agentBranch?: string;
  /**
   * Git URL検証をスキップするか（オプション、デフォルト: false）
   * @description テスト時やオフライン環境で使用
   */
  skipGitUrlValidation?: boolean;
  /**
   * Git URLのアクセシビリティチェックを行うか（オプション、デフォルト: false）
   * @description trueの場合、git ls-remoteでリモートリポジトリへのアクセスを確認
   * @see Requirement 1.3
   */
  validateAccessibility?: boolean;
  /**
   * アクセシビリティチェックのタイムアウト秒数（オプション、デフォルト: 30）
   */
  validationTimeoutSeconds?: number;
}

/**
 * Git URL検証結果
 * @description Git URLの形式検証とアクセシビリティチェックの結果
 * @see Requirement 1.3
 */
export interface GitUrlValidationResult {
  /** 検証が成功したか（形式とアクセシビリティの両方が有効な場合にtrue） */
  valid: boolean;
  /** URL形式が有効か */
  formatValid: boolean;
  /** リモートリポジトリにアクセス可能か */
  accessible: boolean;
  /** エラーメッセージ（検証失敗時） */
  error?: string;
}

/**
 * デフォルトのブランチ設定
 */
export const DEFAULT_BRANCH_CONFIG = {
  /** デフォルトのベースブランチ */
  baseBranch: 'main',
  /** エージェントブランチのプレフィックス */
  agentBranchPrefix: 'agent/',
} as const;

/**
 * エージェントブランチ名を生成
 * @param projectId - プロジェクトID
 * @returns エージェントブランチ名
 */
export function generateAgentBranchName(projectId: string): string {
  return `${DEFAULT_BRANCH_CONFIG.agentBranchPrefix}${projectId}`;
}

/**
 * ExtendedProjectのバリデーション
 * @param project - バリデーション対象のプロジェクト
 * @returns バリデーション結果
 */
export function validateExtendedProject(project: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // nullまたはundefinedチェック
  if (project === null || project === undefined) {
    return {
      valid: false,
      errors: ['プロジェクトがnullまたはundefinedです'],
      warnings: [],
    };
  }

  // オブジェクトチェック
  if (typeof project !== 'object') {
    return {
      valid: false,
      errors: ['プロジェクトはオブジェクトである必要があります'],
      warnings: [],
    };
  }

  const proj = project as Record<string, unknown>;

  // 必須フィールドのチェック
  for (const field of EXTENDED_PROJECT_REQUIRED_FIELDS) {
    if (proj[field] === undefined || proj[field] === null) {
      errors.push(`必須フィールド '${field}' が存在しません`);
    }
  }

  // 文字列フィールドのチェック
  const stringFields: (keyof ExtendedProject)[] = [
    'id',
    'name',
    'gitUrl',
    'defaultBranch',
    'integrationBranch',
    'workDir',
    'createdAt',
    'lastUsed',
    'baseBranch',
    'agentBranch',
  ];

  for (const field of stringFields) {
    if (proj[field] !== undefined && typeof proj[field] !== 'string') {
      errors.push(`フィールド '${field}' は文字列である必要があります`);
    }
  }

  // agentBranchの形式チェック
  if (typeof proj.agentBranch === 'string') {
    if (!proj.agentBranch.startsWith(DEFAULT_BRANCH_CONFIG.agentBranchPrefix)) {
      warnings.push(
        `agentBranchは '${DEFAULT_BRANCH_CONFIG.agentBranchPrefix}' で始まることを推奨します`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// エージェントブランチ確保結果
// =============================================================================

/**
 * エージェントブランチ確保の結果
 * @description ensureAgentBranchメソッドの戻り値
 * @see Requirement 1.4: WHEN a project is registered, THE System SHALL create the agent branch if it does not exist
 */
export interface EnsureAgentBranchResult {
  /** 操作が成功したか */
  success: boolean;
  /** ブランチが既に存在していたか */
  exists: boolean;
  /** 新しくブランチを作成したか */
  created: boolean;
  /** ブランチ名 */
  branchName: string;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

// =============================================================================
// 実行ディレクトリ用タスクメタデータ
// @see Requirements: 2.4, 2.5 (AI Execution Integration)
// =============================================================================

/**
 * 実行ディレクトリ用タスクメタデータ
 *
 * タスク送信時に `runtime/runs/<run-id>/task.json` に永続化されるメタデータ。
 * 既存の TaskMetadata（優先度・期限・タグ）とは異なり、
 * 実行コンテキスト全体を記録する。
 *
 * @see Requirement 2.4: WHEN a task is submitted, THE System SHALL create a run directory
 * @see Requirement 2.5: THE System SHALL persist task metadata to task.json
 */
export interface RunTaskMetadata {
  /** タスクID */
  taskId: string;
  /** 実行ID */
  runId: string;
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
  /** 使用するAIアダプタ名 */
  aiAdapter: string;
  /** 使用するAIモデル名 */
  model: string;
}


// =============================================================================
// ExecutionReporter関連の型定義
// @see Requirements: 5.1, 5.2, 5.3, 5.4 (AI Execution Integration)
// =============================================================================

/**
 * 変更エントリ
 * @description 実行中に発生したファイル変更の記録
 * @see Requirement 5.3: レポートには変更点を含むこと
 */
export interface ChangeEntry {
  /** ファイルパス */
  path: string;
  /** アクション種別 */
  action: 'created' | 'modified' | 'deleted';
}

/**
 * テスト結果サマリー
 * @description lint/testの結果を要約した構造体
 * @see Requirement 5.3: レポートにはテスト結果を含むこと
 */
export interface TestResultSummary {
  /** lint合格フラグ */
  lintPassed: boolean;
  /** lint出力ログ */
  lintOutput: string;
  /** test合格フラグ */
  testPassed: boolean;
  /** test出力ログ */
  testOutput: string;
  /** 総合合格フラグ */
  overallPassed: boolean;
}

/**
 * レポートデータ
 * @description 実行結果のレポートデータ構造体
 * @see Requirement 5.1: 完了タスクの成果物を収集すること
 * @see Requirement 5.2: レポートを生成すること
 * @see Requirement 5.3: レポートにはtask description, changes, test results, conversation summaryを含むこと
 * @see Requirement 5.4: 成果物をrunディレクトリに収集すること
 */
export interface ReportData {
  /** 実行ID */
  runId: string;
  /** タスク説明 */
  taskDescription: string;
  /** 実行ステータス */
  status: ExecutionStatus;
  /** 開始日時（ISO8601形式） */
  startTime: string;
  /** 終了日時（ISO8601形式） */
  endTime: string;
  /** 所要時間（ミリ秒） */
  duration: number;
  /** 変更エントリ一覧 */
  changes: ChangeEntry[];
  /** テスト結果サマリー */
  testResults: TestResultSummary;
  /** 会話サマリー */
  conversationSummary: string;
  /** 成果物パス一覧 */
  artifacts: string[];
}

// =============================================================================
// エラーハンドリング強化の型定義
// @see Requirements: 1.5, 6.1, 6.3, 6.5
// =============================================================================

/**
 * エラーハンドリング強化用エラーカテゴリ
 * @description エラーの分類（error-handler.ts内のErrorCategoryとは別定義）
 * @see Requirement 6.1
 */
export type EnhancedErrorCategory =
  | 'ai_unavailable'
  | 'ai_timeout'
  | 'tool_execution'
  | 'quality_gate'
  | 'persistence'
  | 'validation'
  | 'unknown';

/**
 * エラー統計情報
 * @description 実行中のエラー統計
 * @see Requirement 6.1
 */
export interface ErrorStatistics {
  /** 実行ID */
  runId: string;
  /** カテゴリ別エラー数 */
  byCategory: Record<string, number>;
  /** 総エラー数 */
  totalErrors: number;
  /** 復旧可能エラー数 */
  recoverableErrors: number;
  /** 復旧不可能エラー数 */
  unrecoverableErrors: number;
  /** 最初のエラー日時 */
  firstErrorAt?: string;
  /** 最後のエラー日時 */
  lastErrorAt?: string;
}

/**
 * 一時停止状態
 * @description AI利用不可時の一時停止状態
 * @see Requirement 1.5, 6.3
 */
export interface PausedState {
  /** 実行ID */
  runId: string;
  /** 一時停止理由 */
  reason: string;
  /** 一時停止日時（ISO8601形式） */
  pausedAt: string;
  /** 一時停止時のタスクステータス */
  taskStatus: TaskStatus;
  /** 保存された進捗情報 */
  progress: {
    /** 完了したサブタスク数 */
    completedSubTasks: number;
    /** 総サブタスク数 */
    totalSubTasks: number;
    /** 最後に処理したサブタスクID */
    lastProcessedSubTaskId?: string;
  };
  /** リカバリー手順 */
  recoveryInstructions: string;
}

/**
 * 失敗レポートデータ
 * @description 永続的失敗時のレポートデータ
 * @see Requirement 6.5
 */
export interface FailureReportData {
  /** 実行ID */
  runId: string;
  /** タスク説明 */
  taskDescription: string;
  /** エラー一覧 */
  errors: ErrorInfo[];
  /** 失敗日時（ISO8601形式） */
  failedAt: string;
  /** 推奨アクション */
  recommendedActions: string[];
  /** リカバリー手順 */
  recoverySteps: string[];
}
