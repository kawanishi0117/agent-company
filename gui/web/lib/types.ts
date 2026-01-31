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
