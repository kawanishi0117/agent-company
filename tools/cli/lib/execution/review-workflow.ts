/**
 * レビューワークフロー管理モジュール
 *
 * レビューリクエスト、レビュー結果の処理、レビューログの記録を担当する。
 *
 * @module tools/cli/lib/execution/review-workflow
 * @see Requirements: 5.1-5.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  ReviewResult,
  ReviewDecision,
  // GrandchildTicketは将来のレビューワークフロー拡張で使用予定
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  GrandchildTicket,
  TicketStatus,
} from './types.js';

// =============================================================================
// 型定義
// =============================================================================

/**
 * レビューリクエストオプション
 */
export interface ReviewRequestOptions {
  /** チケットID */
  ticketId: string;
  /** ワーカーID */
  workerId: string;
  /** 作業ブランチ名 */
  branch: string;
  /** 成果物パス一覧 */
  artifacts: string[];
  /** 追加コンテキスト */
  context?: string;
}

/**
 * レビュー送信オプション
 */
export interface ReviewSubmitOptions {
  /** チケットID */
  ticketId: string;
  /** レビュアーID */
  reviewerId: string;
  /** レビュー決定 */
  decision: ReviewDecision;
}

/**
 * レビューステータス
 */
export type ReviewStatus =
  | 'pending' // レビュー待ち
  | 'in_review' // レビュー中
  | 'approved' // 承認済み
  | 'rejected' // 却下
  | 'not_found'; // レビューリクエストなし

/**
 * レビューリクエスト情報
 */
export interface ReviewRequest {
  /** チケットID */
  ticketId: string;
  /** ワーカーID */
  workerId: string;
  /** 作業ブランチ名 */
  branch: string;
  /** 成果物パス一覧 */
  artifacts: string[];
  /** 追加コンテキスト */
  context?: string;
  /** リクエスト日時 */
  requestedAt: string;
  /** ステータス */
  status: ReviewStatus;
  /** レビュー結果（完了時） */
  result?: ReviewResult;
}

/**
 * レビューログエントリ
 */
export interface ReviewLogEntry {
  /** タイムスタンプ */
  timestamp: string;
  /** 実行ID */
  runId: string;
  /** チケットID */
  ticketId: string;
  /** イベントタイプ */
  eventType: 'request' | 'submit' | 'approve' | 'reject';
  /** レビュアーID（送信時） */
  reviewerId?: string;
  /** ワーカーID（リクエスト時） */
  workerId?: string;
  /** フィードバック */
  feedback?: string;
  /** チェックリスト */
  checklist?: ReviewDecision['checklist'];
}

/**
 * レビューワークフロー結果
 */
export interface ReviewWorkflowResult {
  /** 成功フラグ */
  success: boolean;
  /** レビューステータス */
  status: ReviewStatus;
  /** エラーメッセージ */
  error?: string;
  /** マージが必要かどうか */
  shouldMerge?: boolean;
  /** フィードバック（却下時） */
  feedback?: string;
}

/**
 * ステータス更新コールバック
 */
export type StatusUpdateCallback = (ticketId: string, status: TicketStatus) => Promise<void>;

/**
 * マージコールバック
 */
export type MergeCallback = (
  ticketId: string,
  branch: string
) => Promise<{ success: boolean; error?: string }>;

// =============================================================================
// ReviewWorkflowクラス
// =============================================================================

/**
 * レビューワークフロー管理クラス
 *
 * レビューリクエストの管理、レビュー結果の処理、ログ記録を行う。
 *
 * @see Requirements: 5.1-5.6
 */
export class ReviewWorkflow {
  /** レビューリクエストのマップ（ticketId -> ReviewRequest） */
  private requests: Map<string, ReviewRequest> = new Map();

  /** 実行ID */
  private runId: string = '';

  /** ランタイムディレクトリ */
  private runtimeDir: string;

  /** ステータス更新コールバック */
  private onStatusUpdate?: StatusUpdateCallback;

  /** マージコールバック */
  private onMerge?: MergeCallback;

  /**
   * コンストラクタ
   *
   * @param runtimeDir - ランタイムディレクトリ（デフォルト: 'runtime'）
   */
  constructor(runtimeDir: string = 'runtime') {
    this.runtimeDir = runtimeDir;
  }

  /**
   * 実行IDを設定
   *
   * @param runId - 実行ID
   */
  setRunId(runId: string): void {
    this.runId = runId;
  }

  /**
   * ステータス更新コールバックを設定
   *
   * @param callback - コールバック関数
   */
  setStatusUpdateCallback(callback: StatusUpdateCallback): void {
    this.onStatusUpdate = callback;
  }

  /**
   * マージコールバックを設定
   *
   * @param callback - コールバック関数
   */
  setMergeCallback(callback: MergeCallback): void {
    this.onMerge = callback;
  }

  /**
   * レビューをリクエスト
   *
   * ワーカーが作業完了後にレビューを依頼する。
   *
   * @param options - レビューリクエストオプション
   * @returns レビューワークフロー結果
   * @see Requirement 5.1
   */
  async requestReview(options: ReviewRequestOptions): Promise<ReviewWorkflowResult> {
    const { ticketId, workerId, branch, artifacts, context } = options;

    // バリデーション
    if (!ticketId || !workerId || !branch) {
      return {
        success: false,
        status: 'not_found',
        error: 'ticketId, workerId, and branch are required',
      };
    }

    // レビューリクエストを作成
    const request: ReviewRequest = {
      ticketId,
      workerId,
      branch,
      artifacts,
      context,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    // リクエストを保存
    this.requests.set(ticketId, request);

    // ログを記録
    await this.logReviewEvent({
      timestamp: request.requestedAt,
      runId: this.runId,
      ticketId,
      eventType: 'request',
      workerId,
    });

    // チケットステータスを更新
    if (this.onStatusUpdate) {
      await this.onStatusUpdate(ticketId, 'review_requested');
    }

    return {
      success: true,
      status: 'pending',
    };
  }

  /**
   * レビュー結果を送信
   *
   * レビュアーがレビュー結果を送信する。
   * 承認時はマージをトリガーし、却下時はフィードバックを提供する。
   *
   * @param options - レビュー送信オプション
   * @returns レビューワークフロー結果
   * @see Requirements: 5.2, 5.3, 5.4, 5.5
   */
  async submitReview(options: ReviewSubmitOptions): Promise<ReviewWorkflowResult> {
    const { ticketId, reviewerId, decision } = options;

    // リクエストを取得
    const request = this.requests.get(ticketId);
    if (!request) {
      return {
        success: false,
        status: 'not_found',
        error: `Review request not found for ticket: ${ticketId}`,
      };
    }

    // レビュー結果を作成
    const result: ReviewResult = {
      reviewerId,
      approved: decision.approved,
      feedback: decision.feedback,
      checklist: decision.checklist,
      reviewedAt: new Date().toISOString(),
    };

    // リクエストを更新
    request.result = result;
    request.status = decision.approved ? 'approved' : 'rejected';

    // ログを記録
    await this.logReviewEvent({
      timestamp: result.reviewedAt,
      runId: this.runId,
      ticketId,
      eventType: decision.approved ? 'approve' : 'reject',
      reviewerId,
      feedback: decision.feedback,
      checklist: decision.checklist,
    });

    // 承認時の処理
    if (decision.approved) {
      return await this.handleApproval(ticketId, request);
    }

    // 却下時の処理
    return await this.handleRejection(ticketId, decision.feedback);
  }

  /**
   * レビューステータスを取得
   *
   * @param ticketId - チケットID
   * @returns レビューステータス
   * @see Requirement 5.2
   */
  async getReviewStatus(ticketId: string): Promise<ReviewStatus> {
    const request = this.requests.get(ticketId);
    if (!request) {
      return 'not_found';
    }
    return request.status;
  }

  /**
   * レビューリクエストを取得
   *
   * @param ticketId - チケットID
   * @returns レビューリクエスト（存在しない場合はundefined）
   */
  getReviewRequest(ticketId: string): ReviewRequest | undefined {
    return this.requests.get(ticketId);
  }

  /**
   * レビュー結果を取得
   *
   * @param ticketId - チケットID
   * @returns レビュー結果（存在しない場合はundefined）
   */
  getReviewResult(ticketId: string): ReviewResult | undefined {
    const request = this.requests.get(ticketId);
    return request?.result;
  }

  /**
   * 全てのレビューリクエストを取得
   *
   * @returns レビューリクエストの配列
   */
  getAllRequests(): ReviewRequest[] {
    return Array.from(this.requests.values());
  }

  /**
   * 保留中のレビューリクエストを取得
   *
   * @returns 保留中のレビューリクエストの配列
   */
  getPendingRequests(): ReviewRequest[] {
    return this.getAllRequests().filter((r) => r.status === 'pending');
  }

  /**
   * レビューリクエストをクリア
   *
   * @param ticketId - チケットID（省略時は全てクリア）
   */
  clearRequests(ticketId?: string): void {
    if (ticketId) {
      this.requests.delete(ticketId);
    } else {
      this.requests.clear();
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * 承認時の処理
   *
   * マージをトリガーし、チケットステータスを更新する。
   *
   * @param ticketId - チケットID
   * @param request - レビューリクエスト
   * @returns レビューワークフロー結果
   * @see Requirement 5.3
   */
  private async handleApproval(
    ticketId: string,
    request: ReviewRequest
  ): Promise<ReviewWorkflowResult> {
    // マージコールバックが設定されている場合はマージを実行
    if (this.onMerge) {
      const mergeResult = await this.onMerge(ticketId, request.branch);
      if (!mergeResult.success) {
        return {
          success: false,
          status: 'approved',
          error: `Merge failed: ${mergeResult.error}`,
          shouldMerge: true,
        };
      }
    }

    // チケットステータスを更新
    if (this.onStatusUpdate) {
      await this.onStatusUpdate(ticketId, 'completed');
    }

    return {
      success: true,
      status: 'approved',
      shouldMerge: true,
    };
  }

  /**
   * 却下時の処理
   *
   * チケットステータスを更新し、フィードバックを返す。
   *
   * @param ticketId - チケットID
   * @param feedback - フィードバック
   * @returns レビューワークフロー結果
   * @see Requirements: 5.4, 5.5
   */
  private async handleRejection(
    ticketId: string,
    feedback?: string
  ): Promise<ReviewWorkflowResult> {
    // チケットステータスを更新
    if (this.onStatusUpdate) {
      await this.onStatusUpdate(ticketId, 'revision_required');
    }

    return {
      success: true,
      status: 'rejected',
      shouldMerge: false,
      feedback,
    };
  }

  /**
   * レビューイベントをログに記録
   *
   * @param entry - ログエントリ
   * @see Requirement 5.6
   */
  private async logReviewEvent(entry: ReviewLogEntry): Promise<void> {
    if (!this.runId) {
      return;
    }

    const logDir = path.join(this.runtimeDir, 'runs', this.runId);
    const logFile = path.join(logDir, 'reviews.log');

    try {
      // ディレクトリを作成
      await fs.mkdir(logDir, { recursive: true });

      // ログエントリをフォーマット
      const logLine = this.formatLogEntry(entry);

      // ログファイルに追記
      await fs.appendFile(logFile, logLine + '\n', 'utf-8');
    } catch (error) {
      // ログ記録の失敗は警告のみ
      console.warn(`Failed to log review event: ${error}`);
    }
  }

  /**
   * ログエントリをフォーマット
   *
   * @param entry - ログエントリ
   * @returns フォーマットされたログ行
   */
  private formatLogEntry(entry: ReviewLogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.eventType.toUpperCase()}]`,
      `ticket=${entry.ticketId}`,
    ];

    if (entry.workerId) {
      parts.push(`worker=${entry.workerId}`);
    }

    if (entry.reviewerId) {
      parts.push(`reviewer=${entry.reviewerId}`);
    }

    if (entry.checklist) {
      const checklistStr = Object.entries(entry.checklist)
        .map(([k, v]) => `${k}=${v ? 'pass' : 'fail'}`)
        .join(',');
      parts.push(`checklist={${checklistStr}}`);
    }

    if (entry.feedback) {
      // フィードバックは改行を除去して追加
      const sanitizedFeedback = entry.feedback.replace(/\n/g, ' ').substring(0, 200);
      parts.push(`feedback="${sanitizedFeedback}"`);
    }

    return parts.join(' ');
  }
}

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * レビュー決定を作成
 *
 * @param approved - 承認フラグ
 * @param options - オプション
 * @returns レビュー決定
 */
export function createReviewDecision(
  approved: boolean,
  options: {
    feedback?: string;
    codeQuality?: boolean;
    testCoverage?: boolean;
    acceptanceCriteria?: boolean;
  } = {}
): ReviewDecision {
  return {
    approved,
    feedback: options.feedback,
    checklist: {
      codeQuality: options.codeQuality ?? approved,
      testCoverage: options.testCoverage ?? approved,
      acceptanceCriteria: options.acceptanceCriteria ?? approved,
    },
  };
}

/**
 * レビュー結果からチケットステータスを決定
 *
 * @param result - レビュー結果
 * @returns チケットステータス
 */
export function getStatusFromReviewResult(result: ReviewResult): TicketStatus {
  return result.approved ? 'completed' : 'revision_required';
}

/**
 * レビューチェックリストが全て合格かどうかを判定
 *
 * @param checklist - チェックリスト
 * @returns 全て合格の場合true
 */
export function isChecklistPassed(checklist: ReviewDecision['checklist']): boolean {
  return checklist.codeQuality && checklist.testCoverage && checklist.acceptanceCriteria;
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * ReviewWorkflowインスタンスを作成
 * @returns ReviewWorkflowインスタンス
 */
export function createReviewWorkflow(): ReviewWorkflow {
  return new ReviewWorkflow();
}
