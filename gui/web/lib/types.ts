/**
 * @file AgentCompany GUI 型定義
 * @description ダッシュボードで使用する全ての型を定義
 * @requirements 3.3, 4.3, 5.3
 */

// =============================================================================
// チケット関連の型定義
// =============================================================================

/**
 * チケットのステータス
 * @description カンバンボードの4つのカラムに対応
 */
export type TicketStatus = 'todo' | 'doing' | 'review' | 'done';

/**
 * チケット（タスク）
 * @description workflows/backlog/ に格納されるMarkdownファイルから抽出される情報
 * @requirements 3.3 - チケットファイルのパース結果
 */
export interface Ticket {
  /** チケットID（例: "0001"） */
  id: string;
  /** チケットのステータス */
  status: TicketStatus;
  /** 担当者（エージェント名） */
  assignee: string;
  /** チケットのタイトル */
  title: string;
  /** 作成日時（ISO 8601形式） */
  created: string;
  /** 更新日時（ISO 8601形式） */
  updated: string;
  /** Markdownコンテンツ（詳細表示用） */
  content: string;
}

// =============================================================================
// Run（実行結果）関連の型定義
// =============================================================================

/**
 * Runのステータス
 * @description 実行結果の状態を表す
 */
export type RunStatus = 'success' | 'failure' | 'running';

/**
 * 品質チェックの結果
 * @description 各品質ゲート（lint, test, e2e, format）の結果
 */
export interface CheckResult {
  /** チェックが成功したかどうか */
  passed: boolean;
  /** 詳細情報（エラーメッセージなど） */
  details?: string;
}

/**
 * 判定ステータス
 * @description Quality Authorityによる最終判定
 */
export type JudgmentStatus = 'PASS' | 'FAIL' | 'WAIVER';

/**
 * 判定結果
 * @description Quality Authorityによる品質判定の結果
 * @requirements 4.5 - judgment.jsonの内容
 */
export interface Judgment {
  /** 判定ステータス（PASS/FAIL/WAIVER） */
  status: JudgmentStatus;
  /** 判定日時（ISO 8601形式） */
  timestamp: string;
  /** 対象のRun ID */
  run_id: string;
  /** 各品質チェックの結果 */
  checks: {
    /** ESLint チェック結果 */
    lint: CheckResult;
    /** ユニットテスト結果 */
    test: CheckResult;
    /** E2Eテスト結果 */
    e2e: CheckResult;
    /** フォーマットチェック結果 */
    format: CheckResult;
  };
  /** 判定理由のリスト */
  reasons: string[];
  /** Waiver ID（WAIVERの場合のみ） */
  waiver_id?: string;
}

/**
 * Run（実行結果）
 * @description runtime/runs/<run-id>/ に格納される実行結果
 * @requirements 4.3 - result.jsonの内容
 */
export interface Run {
  /** Run ID（例: "2026-01-27-151426-q3me"） */
  runId: string;
  /** 対象チケットID */
  ticketId: string;
  /** 実行ステータス */
  status: RunStatus;
  /** 開始日時（ISO 8601形式） */
  startTime: string;
  /** 終了日時（ISO 8601形式、実行中の場合はundefined） */
  endTime?: string;
  /** 実行ログの配列 */
  logs: string[];
  /** 成果物ファイルパスの配列 */
  artifacts: string[];
  /** 判定結果（存在する場合） */
  judgment?: Judgment;
}

// =============================================================================
// レポート関連の型定義
// =============================================================================

/**
 * レポートの種類
 * @description 日次または週次
 */
export type ReportType = 'daily' | 'weekly';

/**
 * レポート
 * @description workflows/reports/ に格納されるMarkdownファイルから抽出される情報
 * @requirements 5.3 - レポートファイルのパース結果
 */
export interface Report {
  /** ファイル名 */
  filename: string;
  /** レポートの種類（daily/weekly） */
  type: ReportType;
  /** レポートの日付（YYYY-MM-DD形式） */
  date: string;
  /** レポートのタイトル */
  title: string;
  /** 要約（最初の100文字程度） */
  summary: string;
  /** Markdownコンテンツ（詳細表示用） */
  content: string;
}

// =============================================================================
// API レスポンス関連の型定義
// =============================================================================

/**
 * APIレスポンス
 * @description 全APIエンドポイントの共通レスポンス形式
 * @template T - レスポンスデータの型
 */
export interface ApiResponse<T> {
  /** 成功時のデータ */
  data?: T;
  /** エラー時のメッセージ */
  error?: string;
}

/**
 * ページネーション付きレスポンス
 * @description 一覧取得APIのレスポンス形式
 * @template T - アイテムの型
 */
export interface PaginatedResponse<T> {
  /** アイテムの配列 */
  items: T[];
  /** 総アイテム数 */
  total: number;
  /** 現在のページ番号（1始まり） */
  page: number;
  /** 1ページあたりのアイテム数 */
  pageSize: number;
  /** 次のページが存在するかどうか */
  hasMore: boolean;
}

// =============================================================================
// ユーティリティ型
// =============================================================================

/**
 * チケット一覧用の簡易型（contentを除く）
 * @description 一覧表示時に使用する軽量なチケット情報
 */
export type TicketSummary = Omit<Ticket, 'content'>;

/**
 * Run一覧用の簡易型（logsを除く）
 * @description 一覧表示時に使用する軽量なRun情報
 */
export type RunSummary = Omit<Run, 'logs'>;

/**
 * レポート一覧用の簡易型（contentを除く）
 * @description 一覧表示時に使用する軽量なレポート情報
 */
export type ReportSummary = Omit<Report, 'content'>;

/**
 * レポート一覧のグループ化された形式
 * @description /api/reports のレスポンス形式
 */
export interface GroupedReports {
  /** 日次レポートの配列 */
  daily: ReportSummary[];
  /** 週次レポートの配列 */
  weekly: ReportSummary[];
}


// =============================================================================
// ワークフロー関連の型定義
// =============================================================================

/**
 * ワークフローフェーズ
 * @description 5フェーズの業務フロー
 */
export type WorkflowPhase =
  | 'proposal'
  | 'approval'
  | 'development'
  | 'quality_assurance'
  | 'delivery';

/**
 * ワークフローステータス
 */
export type WorkflowStatus =
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'terminated';

/**
 * フェーズ遷移記録
 */
export interface PhaseTransition {
  from: WorkflowPhase | 'init';
  to: WorkflowPhase;
  timestamp: string;
  reason?: string;
}

/**
 * サブタスク進捗
 */
export interface SubtaskProgressItem {
  taskId: string;
  title: string;
  status: 'pending' | 'working' | 'review' | 'completed' | 'failed' | 'skipped';
  workerType?: string;
  assignedWorker?: string;
  retryCount?: number;
  error?: string;
}

/**
 * 品質結果
 */
export interface QualityResultsData {
  lint?: { passed: boolean; errors: number; warnings: number; details?: string };
  test?: { passed: boolean; total: number; passed_count: number; failed: number; coverage?: number; details?: string };
  review?: { passed: boolean; reviewer?: string; feedback?: string };
}

/**
 * 承認決定
 */
export interface ApprovalDecisionData {
  action: 'approve' | 'request_revision' | 'reject';
  phase: WorkflowPhase;
  feedback?: string;
  timestamp: string;
}

/**
 * 提案書
 */
export interface ProposalData {
  summary: string;
  scope: string;
  taskBreakdown: Array<{
    taskNumber: number;
    title: string;
    workerType: string;
    estimatedEffort: string;
    dependencies: string[];
  }>;
  workerAssignments: Array<{
    workerType: string;
    taskNumbers: number[];
  }>;
  risks: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string;
  }>;
  dependencies: Array<{
    from: string;
    to: string;
    type: string;
  }>;
  meetingId?: string;
  version?: number;
}

/**
 * 納品物
 */
export interface DeliverableData {
  summaryReport: string;
  changes: string[];
  testResults: { passed: number; failed: number; coverage?: number };
  reviewHistory: Array<{ reviewer: string; result: string; feedback: string }>;
  artifacts: string[];
}

/**
 * 会議録
 */
export interface MeetingMinutesData {
  meetingId: string;
  date: string;
  facilitator: string;
  participants: Array<{ agentId: string; role: string }>;
  agendaItems: Array<{ topic: string; description: string }>;
  discussions: Array<{
    agendaIndex: number;
    statements: Array<{ speaker: string; role: string; content: string; timestamp: string }>;
    summary?: string;
  }>;
  decisions: Array<{ topic: string; decision: string; rationale: string }>;
  actionItems: Array<{ assignee: string; task: string; deadline?: string }>;
}

/**
 * エスカレーション情報
 */
export interface EscalationData {
  taskId: string;
  workerType: string;
  retryCount: number;
  error: string;
  timestamp: string;
}

/**
 * ワークフロー状態
 */
export interface WorkflowStateData {
  workflowId: string;
  instruction: string;
  projectId: string;
  currentPhase: WorkflowPhase;
  status: WorkflowStatus;
  phaseHistory: PhaseTransition[];
  proposal?: ProposalData;
  deliverable?: DeliverableData;
  approvalHistory: ApprovalDecisionData[];
  escalation?: EscalationData;
  createdAt: string;
  updatedAt: string;
}
