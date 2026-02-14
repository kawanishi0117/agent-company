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
 * @description CLI側 ApprovalDecision に準拠
 */
export interface ApprovalDecisionData {
  /** ワークフローID */
  workflowId?: string;
  /** 承認アクション */
  action: 'approve' | 'request_revision' | 'reject';
  /** 対象フェーズ */
  phase: WorkflowPhase;
  /** フィードバック（オプション） */
  feedback?: string;
  /** 決定日時（ISO8601形式） */
  decidedAt: string;
}

/**
 * 提案書
 * @description CLI側 Proposal に準拠
 */
export interface ProposalData {
  /** ワークフローID */
  workflowId?: string;
  /** サマリー */
  summary: string;
  /** スコープ */
  scope: string;
  /** タスク分解一覧 */
  taskBreakdown: Array<{
    /** タスクID */
    id: string;
    /** タイトル */
    title: string;
    /** 説明 */
    description: string;
    /** ワーカータイプ */
    workerType: string;
    /** 見積もり工数 */
    estimatedEffort: string;
    /** 依存タスクID一覧 */
    dependencies: string[];
  }>;
  /** ワーカー割り当て一覧 */
  workerAssignments: Array<{
    /** タスクID */
    taskId: string;
    /** ワーカータイプ */
    workerType: string;
    /** 割り当て根拠 */
    rationale: string;
  }>;
  /** リスク評価一覧 */
  riskAssessment: Array<{
    /** リスク説明 */
    description: string;
    /** 重要度 */
    severity: 'low' | 'medium' | 'high';
    /** 対策 */
    mitigation: string;
  }>;
  /** 依存関係一覧 */
  dependencies: Array<{
    from: string;
    to: string;
    type: string;
  }>;
  /** 参照会議録ID一覧 */
  meetingMinutesIds?: string[];
  /** 作成日時（ISO8601形式） */
  createdAt?: string;
  /** バージョン番号（永続化時） */
  version?: number;
}

/**
 * 納品物
 * @description CLI側 Deliverable に準拠
 */
export interface DeliverableData {
  /** ワークフローID */
  workflowId?: string;
  /** サマリーレポート */
  summaryReport: string;
  /** 変更一覧 */
  changes: Array<{
    /** ファイルパス */
    path: string;
    /** アクション種別 */
    action: 'created' | 'modified' | 'deleted';
  }>;
  /** テスト結果サマリー */
  testResults: {
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
  };
  /** レビュー履歴 */
  reviewHistory: Array<{ reviewer: string; result: string; feedback: string }>;
  /** 成果物パス一覧 */
  artifacts: string[];
  /** 作成日時（ISO8601形式） */
  createdAt?: string;
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
 * @description CLI側 WorkflowState に準拠
 */
export interface WorkflowStateData {
  /** ワークフローID */
  workflowId: string;
  /** 実行ID */
  runId?: string;
  /** 社長からの指示 */
  instruction: string;
  /** プロジェクトID */
  projectId: string;
  /** 現在のフェーズ */
  currentPhase: WorkflowPhase;
  /** ワークフローステータス */
  status: WorkflowStatus;
  /** フェーズ遷移履歴 */
  phaseHistory: PhaseTransition[];
  /** 承認決定履歴 */
  approvalDecisions: ApprovalDecisionData[];
  /** 提案書（オプション） */
  proposal?: ProposalData;
  /** 納品物（オプション） */
  deliverable?: DeliverableData;
  /** 会議録ID一覧 */
  meetingMinutesIds?: string[];
  /** エスカレーション情報（オプション） */
  escalation?: EscalationData;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}
