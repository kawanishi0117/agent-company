/**
 * Error Handler - エラーハンドリングユーティリティ
 *
 * エージェント実行エンジンのエラーハンドリングを担当するモジュール。
 * - リトライ（指数バックオフ）
 * - フォールバック
 * - エスカレーション
 * - エラーログ出力
 *
 * @module execution/error-handler
 * @see Requirements: 13.1, 13.2, 13.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ErrorInfo,
  RunId,
  AgentId,
  TicketStatus,
  TaskStatus,
  ErrorStatistics,
  PausedState,
  FailureReportData,
} from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのリトライ設定
 *
 * 指数バックオフ: 1s → 2s → 4s（最大3回試行）
 * - 初回試行: 即時実行
 * - 1回目リトライ: 1秒後
 * - 2回目リトライ: 2秒後
 *
 * @see Requirement 11.1: retry with exponential backoff (1s, 2s, 4s) up to 3 times
 * @see Requirement 13.1: retry with exponential backoff (1s, 2s, 4s) up to 3 times
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  /** 最大試行回数（初回 + リトライ回数） */
  maxAttempts: 3,
  /** 初期遅延時間（ミリ秒） - 1秒 */
  initialDelayMs: 1000,
  /** バックオフ乗数 - 2倍ずつ増加 */
  backoffMultiplier: 2,
  /** 最大遅延時間（ミリ秒） - 4秒 */
  maxDelayMs: 4000,
};

/**
 * 後方互換性のためのエイリアス
 * @deprecated maxAttemptsを使用してください
 */
export const RETRY_CONFIG = DEFAULT_RETRY_CONFIG;

/**
 * エラーログファイル名
 * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
 */
const ERROR_LOG_FILENAME = 'errors.log';

/**
 * 失敗レポートファイル名
 * @see Requirement 6.5: 永続的失敗時のレポート出力先
 */
const FAILURE_REPORT_FILENAME = 'failure-report.md';

/**
 * 一時停止状態ファイル名
 * @see Requirement 6.3: AI利用不可時の状態保存先
 */
const PAUSED_STATE_FILENAME = 'paused-state.json';

/**
 * ランタイムベースディレクトリ
 */
const RUNTIME_BASE_DIR = 'runtime/runs';

// =============================================================================
// 型定義
// =============================================================================

/**
 * リトライ設定
 * @description リトライ動作を制御する設定
 * @see Requirement 11.1: exponential backoff (1s, 2s, 4s) up to 3 times
 */
export interface RetryConfig {
  /**
   * 最大試行回数（初回 + リトライ回数）
   * デフォルト: 3（初回 + 2回リトライ）
   */
  maxAttempts: number;
  /** 初期遅延時間（ミリ秒、デフォルト: 1000） */
  initialDelayMs: number;
  /** バックオフ乗数（デフォルト: 2） */
  backoffMultiplier: number;
  /** 最大遅延時間（ミリ秒、デフォルト: 4000） */
  maxDelayMs: number;
  /**
   * @deprecated maxAttemptsを使用してください
   */
  maxRetries?: number;
}

/**
 * リトライ結果
 * @description リトライ操作の結果
 */
export interface RetryResult<T> {
  /** 成功フラグ */
  success: boolean;
  /** 結果値（成功時） */
  result?: T;
  /** エラー（失敗時） */
  error?: Error;
  /** 試行回数 */
  attempts: number;
  /** 各試行のエラー履歴 */
  errorHistory: Error[];
}

/**
 * エラーカテゴリ
 * @description エラーの種類を分類
 */
export type ErrorCategory =
  | 'ai_connection' // AI接続エラー
  | 'tool_call' // ツール呼び出しエラー
  | 'git' // Gitエラー
  | 'container' // コンテナエラー
  | 'timeout' // タイムアウトエラー
  | 'validation' // バリデーションエラー
  | 'unknown'; // 不明なエラー

/**
 * エスカレーション情報
 * @description エスカレーション時に送信される情報
 */
export interface EscalationInfo {
  /** 実行ID */
  runId: RunId;
  /** エージェントID */
  agentId: AgentId;
  /** エラーカテゴリ */
  category: ErrorCategory;
  /** エラー詳細 */
  error: ErrorInfo;
  /** 試行回数 */
  attempts: number;
  /** エスカレーション理由 */
  reason: string;
  /** タイムスタンプ（ISO8601形式） */
  timestamp: string;
}

/**
 * エラーハンドラーオプション
 * @description ErrorHandlerの初期化オプション
 */
export interface ErrorHandlerOptions {
  /** ランタイムベースディレクトリ */
  runtimeBasePath?: string;
  /** リトライ設定 */
  retryConfig?: Partial<RetryConfig>;
  /** エスカレーションコールバック */
  onEscalation?: (info: EscalationInfo) => Promise<void>;
}

/**
 * ワーカー失敗通知ペイロード
 * @description Manager Agentへの失敗通知に含まれる情報
 * @see Requirement 11.2: IF all retries fail, THE System SHALL mark Grandchild_Ticket as failed and notify Manager_Agent
 */
export interface WorkerFailureNotification {
  /** チケットID */
  ticketId: string;
  /** ワーカーID */
  workerId: AgentId;
  /** 実行ID */
  runId: RunId;
  /** エラー情報 */
  error: ErrorInfo;
  /** 試行回数 */
  attempts: number;
  /** 失敗日時（ISO8601形式） */
  failedAt: string;
  /** 推奨アクション */
  recommendedAction: 'reassign' | 'escalate' | 'manual_review';
}

/**
 * チケットステータス更新コールバック
 * @description チケットステータスを更新するためのコールバック関数型
 */
export type TicketStatusUpdateCallback = (ticketId: string, status: TicketStatus) => Promise<void>;

/**
 * Manager Agent通知コールバック
 * @description Manager Agentに通知を送信するためのコールバック関数型
 */
export type ManagerNotificationCallback = (
  notification: WorkerFailureNotification
) => Promise<void>;

/**
 * 失敗時処理コンテキスト
 * @description ワーカー失敗時の処理に必要なコンテキスト情報
 * @see Requirement 11.2
 */
export interface FailureHandlingContext {
  /** 実行ID */
  runId: RunId;
  /** ワーカーID */
  workerId: AgentId;
  /** チケットID */
  ticketId: string;
  /** Manager AgentのID */
  managerAgentId: AgentId;
  /** チケットステータス更新コールバック */
  onTicketStatusUpdate?: TicketStatusUpdateCallback;
  /** Manager Agent通知コールバック */
  onManagerNotification?: ManagerNotificationCallback;
  /** リトライ時のコールバック */
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

/**
 * 失敗時処理結果
 * @description ワーカー失敗時の処理結果
 */
export interface FailureHandlingResult<T> extends RetryResult<T> {
  /** チケットステータスが更新されたか */
  ticketStatusUpdated: boolean;
  /** Manager Agentに通知されたか */
  managerNotified: boolean;
  /** 失敗通知情報（失敗時のみ） */
  failureNotification?: WorkerFailureNotification;
}

// =============================================================================
// ErrorHandler クラス
// =============================================================================

/**
 * ErrorHandler - エラーハンドリングユーティリティ
 *
 * エージェント実行エンジンのエラーハンドリングを統合的に管理する。
 *
 * @see Requirement 13.1: WHEN AI connection fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
 * @see Requirement 13.2: WHEN Tool_Call fails, THE System SHALL report error to AI and continue conversation
 * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
 *
 * @example
 * ```typescript
 * const errorHandler = new ErrorHandler({ runtimeBasePath: 'runtime/runs' });
 *
 * // リトライ付きでAI呼び出し
 * const result = await errorHandler.withRetry(
 *   () => aiAdapter.chat(options),
 *   { category: 'ai_connection', runId: 'run-001', agentId: 'worker-001' }
 * );
 *
 * // エラーログ出力
 * await errorHandler.logError('run-001', errorInfo);
 * ```
 */
export class ErrorHandler {
  /** ランタイムベースディレクトリ */
  private readonly runtimeBasePath: string;

  /** リトライ設定 */
  private readonly retryConfig: RetryConfig;

  /** エスカレーションコールバック */
  private readonly onEscalation?: (info: EscalationInfo) => Promise<void>;

  /**
   * コンストラクタ
   * @param options - エラーハンドラーオプション
   */
  constructor(options?: ErrorHandlerOptions) {
    this.runtimeBasePath = options?.runtimeBasePath ?? RUNTIME_BASE_DIR;

    // 後方互換性: maxRetriesが指定されている場合はmaxAttemptsに変換
    const retryConfigOverride = options?.retryConfig;
    let maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;

    if (retryConfigOverride?.maxRetries !== undefined) {
      // maxRetries + 1 = maxAttempts（初回 + リトライ回数）
      maxAttempts = retryConfigOverride.maxRetries + 1;
    } else if (retryConfigOverride?.maxAttempts !== undefined) {
      maxAttempts = retryConfigOverride.maxAttempts;
    }

    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfigOverride,
      maxAttempts,
    };
    this.onEscalation = options?.onEscalation;
  }

  // ===========================================================================
  // リトライ機能
  // ===========================================================================

  /**
   * 指数バックオフ付きリトライを実行
   *
   * 指数バックオフ遅延パターン:
   * - 1回目リトライ: 1秒後 (1000ms)
   * - 2回目リトライ: 2秒後 (2000ms)
   * - 3回目リトライ: 4秒後 (4000ms、maxDelayMsで制限)
   *
   * @param operation - 実行する操作
   * @param context - エラーコンテキスト
   * @returns リトライ結果
   *
   * @see Requirement 11.1: WHEN a worker fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
   * @see Requirement 13.1: WHEN AI connection fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
   *
   * @example
   * ```typescript
   * const result = await errorHandler.withRetry(
   *   () => aiAdapter.chat(options),
   *   { category: 'ai_connection', runId: 'run-001', agentId: 'worker-001' }
   * );
   *
   * if (result.success) {
   *   console.log('成功:', result.result);
   * } else {
   *   console.error('失敗:', result.error);
   * }
   * ```
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context: {
      category: ErrorCategory;
      runId: RunId;
      agentId: AgentId;
      customRetryConfig?: Partial<RetryConfig>;
    }
  ): Promise<RetryResult<T>> {
    // 設定をマージ（後方互換性のためmaxRetriesもサポート）
    const mergedConfig = {
      ...this.retryConfig,
      ...context.customRetryConfig,
    };

    // maxRetriesが指定されている場合はmaxAttemptsに変換（後方互換性）
    const maxAttempts =
      mergedConfig.maxRetries !== undefined
        ? mergedConfig.maxRetries + 1
        : mergedConfig.maxAttempts;

    const config = {
      ...mergedConfig,
      maxAttempts,
    };

    const errorHistory: Error[] = [];
    let lastError: Error | undefined;

    // maxAttempts回試行（初回 + リトライ）
    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
      try {
        // 操作を実行
        const result = await operation();

        return {
          success: true,
          result,
          attempts: attempt + 1,
          errorHistory,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        errorHistory.push(lastError);

        // エラー情報を作成
        const errorInfo = this.createErrorInfo(lastError, context.category, true);

        // エラーをログに記録
        await this.logError(context.runId, errorInfo);

        console.warn(
          `[ErrorHandler] 試行 ${attempt + 1}/${config.maxAttempts} 失敗:`,
          lastError.message
        );

        // 最後の試行でなければ待機（指数バックオフ）
        if (attempt < config.maxAttempts - 1) {
          const delay = this.calculateBackoffDelay(attempt, config);
          console.log(
            `[ErrorHandler] ${delay}ms 後にリトライします... (指数バックオフ: ${delay / 1000}秒)`
          );
          await this.sleep(delay);
        }
      }
    }

    // 全てのリトライが失敗した場合
    const finalError = lastError ?? new Error('Unknown error');

    // エスカレーション
    await this.escalate({
      runId: context.runId,
      agentId: context.agentId,
      category: context.category,
      error: this.createErrorInfo(finalError, context.category, false),
      attempts: config.maxAttempts,
      reason: `${config.maxAttempts}回の試行後も失敗（指数バックオフ: 1s, 2s, 4s）`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      error: finalError,
      attempts: config.maxAttempts,
      errorHistory,
    };
  }

  /**
   * バックオフ遅延時間を計算
   *
   * 指数バックオフ計算式: initialDelay * (multiplier ^ attempt)
   *
   * デフォルト設定での遅延パターン:
   * - attempt=0: 1000 * 2^0 = 1000ms (1秒)
   * - attempt=1: 1000 * 2^1 = 2000ms (2秒)
   * - attempt=2: 1000 * 2^2 = 4000ms (4秒、maxDelayMsで制限)
   *
   * @param attempt - 試行回数（0から開始、リトライ回数を表す）
   * @param config - リトライ設定
   * @returns 遅延時間（ミリ秒）
   *
   * @see Requirement 11.1: exponential backoff (1s, 2s, 4s)
   *
   * @example
   * ```typescript
   * // デフォルト設定での遅延計算
   * const delay0 = errorHandler.calculateBackoffDelay(0); // 1000ms (1秒)
   * const delay1 = errorHandler.calculateBackoffDelay(1); // 2000ms (2秒)
   * const delay2 = errorHandler.calculateBackoffDelay(2); // 4000ms (4秒)
   * ```
   */
  calculateBackoffDelay(attempt: number, config: RetryConfig = this.retryConfig): number {
    // 指数バックオフ: initialDelay * (multiplier ^ attempt)
    const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);

    // 最大遅延時間を超えないように制限
    return Math.min(delay, config.maxDelayMs);
  }

  // ===========================================================================
  // ワーカー失敗時のリトライ機能
  // ===========================================================================

  /**
   * ワーカー失敗時の指数バックオフ付きリトライを実行
   *
   * 要件11.1に特化したリトライメソッド。
   * ワーカーが失敗した場合、指数バックオフ（1s, 2s, 4s）で最大3回リトライする。
   *
   * @param operation - 実行するワーカー操作
   * @param context - ワーカーコンテキスト
   * @returns リトライ結果
   *
   * @see Requirement 11.1: WHEN a worker fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
   *
   * @example
   * ```typescript
   * const result = await errorHandler.withWorkerRetry(
   *   () => worker.executeTask(task),
   *   {
   *     runId: 'run-001',
   *     workerId: 'worker-001',
   *     ticketId: 'ticket-001'
   *   }
   * );
   *
   * if (!result.success) {
   *   // 全リトライ失敗 - チケットを失敗状態に更新
   *   await ticketManager.updateStatus(ticketId, 'failed');
   * }
   * ```
   */
  async withWorkerRetry<T>(
    operation: () => Promise<T>,
    context: {
      runId: RunId;
      workerId: AgentId;
      ticketId?: string;
      onRetry?: (attempt: number, delay: number, error: Error) => void;
    }
  ): Promise<RetryResult<T>> {
    // ワーカー用のリトライ設定（要件11.1に準拠）
    const workerRetryConfig: RetryConfig = {
      maxAttempts: 3, // 最大3回試行
      initialDelayMs: 1000, // 1秒
      backoffMultiplier: 2, // 2倍ずつ増加
      maxDelayMs: 4000, // 最大4秒
    };

    const errorHistory: Error[] = [];
    let lastError: Error | undefined;

    // 3回試行（初回 + 2回リトライ）
    for (let attempt = 0; attempt < workerRetryConfig.maxAttempts; attempt++) {
      try {
        // ワーカー操作を実行
        const result = await operation();

        // 成功した場合
        if (attempt > 0) {
          console.log(
            `[ErrorHandler] ワーカー ${context.workerId} が ${attempt + 1}回目の試行で成功`
          );
        }

        return {
          success: true,
          result,
          attempts: attempt + 1,
          errorHistory,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        errorHistory.push(lastError);

        // エラー情報を作成
        const errorInfo = this.createErrorInfo(lastError, 'unknown', true);

        // エラーをログに記録
        await this.logError(context.runId, errorInfo);

        console.warn(
          `[ErrorHandler] ワーカー ${context.workerId} 試行 ${attempt + 1}/${workerRetryConfig.maxAttempts} 失敗:`,
          lastError.message
        );

        // 最後の試行でなければ待機（指数バックオフ: 1s, 2s, 4s）
        if (attempt < workerRetryConfig.maxAttempts - 1) {
          const delay = this.calculateBackoffDelay(attempt, workerRetryConfig);

          console.log(
            `[ErrorHandler] ワーカー ${context.workerId}: ${delay}ms (${delay / 1000}秒) 後にリトライします...`
          );

          // リトライコールバックを呼び出し
          if (context.onRetry) {
            context.onRetry(attempt + 1, delay, lastError);
          }

          await this.sleep(delay);
        }
      }
    }

    // 全てのリトライが失敗した場合
    const finalError = lastError ?? new Error('Unknown worker error');

    console.error(
      `[ErrorHandler] ワーカー ${context.workerId} が ${workerRetryConfig.maxAttempts}回の試行後も失敗` +
        (context.ticketId ? ` (チケット: ${context.ticketId})` : '')
    );

    // エスカレーション（Manager Agentへの通知用）
    await this.escalate({
      runId: context.runId,
      agentId: context.workerId,
      category: this.categorizeError(finalError),
      error: this.createErrorInfo(finalError, 'unknown', false),
      attempts: workerRetryConfig.maxAttempts,
      reason: `ワーカー ${context.workerId} が指数バックオフ（1s, 2s, 4s）で${workerRetryConfig.maxAttempts}回試行後も失敗`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      error: finalError,
      attempts: workerRetryConfig.maxAttempts,
      errorHistory,
    };
  }

  /**
   * 指数バックオフの遅延シーケンスを取得
   *
   * デフォルト設定での遅延シーケンス: [1000, 2000, 4000] (1s, 2s, 4s)
   *
   * @param config - リトライ設定（省略時はデフォルト設定を使用）
   * @returns 遅延時間の配列（ミリ秒）
   *
   * @see Requirement 11.1: exponential backoff (1s, 2s, 4s)
   *
   * @example
   * ```typescript
   * const delays = errorHandler.getBackoffDelaySequence();
   * // [1000, 2000, 4000] (1秒, 2秒, 4秒)
   * ```
   */
  getBackoffDelaySequence(config: RetryConfig = this.retryConfig): number[] {
    const delays: number[] = [];

    // maxAttempts - 1 回のリトライ遅延を計算
    for (let i = 0; i < config.maxAttempts - 1; i++) {
      delays.push(this.calculateBackoffDelay(i, config));
    }

    return delays;
  }

  // ===========================================================================
  // 失敗時の処理（チケットステータス更新 + Manager Agent通知）
  // ===========================================================================

  /**
   * ワーカー失敗時の完全な処理を実行
   *
   * 要件11.2に準拠した失敗時処理を実行する：
   * 1. 指数バックオフ（1s, 2s, 4s）で最大3回リトライ
   * 2. 全リトライ失敗時にチケットステータスを'failed'に更新
   * 3. Manager Agentに失敗を通知
   *
   * @param operation - 実行するワーカー操作
   * @param context - 失敗時処理コンテキスト
   * @returns 失敗時処理結果
   *
   * @see Requirement 11.1: WHEN a worker fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
   * @see Requirement 11.2: IF all retries fail, THE System SHALL mark Grandchild_Ticket as failed and notify Manager_Agent
   *
   * @example
   * ```typescript
   * const result = await errorHandler.handleWorkerFailure(
   *   () => worker.executeTask(task),
   *   {
   *     runId: 'run-001',
   *     workerId: 'worker-001',
   *     ticketId: 'proj-001-0001-01-001',
   *     managerAgentId: 'manager-001',
   *     onTicketStatusUpdate: async (ticketId, status) => {
   *       await ticketManager.updateTicketStatus(ticketId, status);
   *     },
   *     onManagerNotification: async (notification) => {
   *       await agentBus.send(createTaskFailedMessage(notification));
   *     },
   *   }
   * );
   *
   * if (!result.success) {
   *   console.log('チケット更新:', result.ticketStatusUpdated);
   *   console.log('Manager通知:', result.managerNotified);
   * }
   * ```
   */
  async handleWorkerFailure<T>(
    operation: () => Promise<T>,
    context: FailureHandlingContext
  ): Promise<FailureHandlingResult<T>> {
    // ワーカー用のリトライ設定（要件11.1に準拠）
    const workerRetryConfig: RetryConfig = {
      maxAttempts: 3, // 最大3回試行
      initialDelayMs: 1000, // 1秒
      backoffMultiplier: 2, // 2倍ずつ増加
      maxDelayMs: 4000, // 最大4秒
    };

    const errorHistory: Error[] = [];
    let lastError: Error | undefined;

    // 3回試行（初回 + 2回リトライ）
    for (let attempt = 0; attempt < workerRetryConfig.maxAttempts; attempt++) {
      try {
        // ワーカー操作を実行
        const result = await operation();

        // 成功した場合
        if (attempt > 0) {
          console.log(
            `[ErrorHandler] ワーカー ${context.workerId} が ${attempt + 1}回目の試行で成功`
          );
        }

        return {
          success: true,
          result,
          attempts: attempt + 1,
          errorHistory,
          ticketStatusUpdated: false,
          managerNotified: false,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        errorHistory.push(lastError);

        // エラー情報を作成
        const errorInfo = this.createErrorInfo(lastError, 'unknown', true);

        // エラーをログに記録
        await this.logError(context.runId, errorInfo);

        console.warn(
          `[ErrorHandler] ワーカー ${context.workerId} 試行 ${attempt + 1}/${workerRetryConfig.maxAttempts} 失敗:`,
          lastError.message
        );

        // 最後の試行でなければ待機（指数バックオフ: 1s, 2s, 4s）
        if (attempt < workerRetryConfig.maxAttempts - 1) {
          const delay = this.calculateBackoffDelay(attempt, workerRetryConfig);

          console.log(
            `[ErrorHandler] ワーカー ${context.workerId}: ${delay}ms (${delay / 1000}秒) 後にリトライします...`
          );

          // リトライコールバックを呼び出し
          if (context.onRetry) {
            context.onRetry(attempt + 1, delay, lastError);
          }

          await this.sleep(delay);
        }
      }
    }

    // 全てのリトライが失敗した場合 - 要件11.2の処理を実行
    const finalError = lastError ?? new Error('Unknown worker error');
    const failedAt = new Date().toISOString();

    console.error(
      `[ErrorHandler] ワーカー ${context.workerId} が ${workerRetryConfig.maxAttempts}回の試行後も失敗 (チケット: ${context.ticketId})`
    );

    // 失敗通知情報を作成
    const failureNotification = this.createFailureNotification(
      context,
      finalError,
      workerRetryConfig.maxAttempts,
      failedAt
    );

    // 1. チケットステータスを'failed'に更新
    let ticketStatusUpdated = false;
    if (context.onTicketStatusUpdate) {
      try {
        await context.onTicketStatusUpdate(context.ticketId, 'failed');
        ticketStatusUpdated = true;
        console.log(
          `[ErrorHandler] チケット ${context.ticketId} のステータスを 'failed' に更新しました`
        );
      } catch (updateError) {
        console.error(
          `[ErrorHandler] チケットステータス更新に失敗:`,
          updateError instanceof Error ? updateError.message : String(updateError)
        );
        // ステータス更新失敗もログに記録
        await this.logError(
          context.runId,
          this.createErrorInfo(
            updateError instanceof Error ? updateError : new Error(String(updateError)),
            'unknown',
            false
          )
        );
      }
    }

    // 2. Manager Agentに通知
    let managerNotified = false;
    if (context.onManagerNotification) {
      try {
        await context.onManagerNotification(failureNotification);
        managerNotified = true;
        console.log(`[ErrorHandler] Manager Agent ${context.managerAgentId} に失敗を通知しました`);
      } catch (notifyError) {
        console.error(
          `[ErrorHandler] Manager Agent通知に失敗:`,
          notifyError instanceof Error ? notifyError.message : String(notifyError)
        );
        // 通知失敗もログに記録
        await this.logError(
          context.runId,
          this.createErrorInfo(
            notifyError instanceof Error ? notifyError : new Error(String(notifyError)),
            'unknown',
            false
          )
        );
      }
    }

    // エスカレーション（既存のエスカレーション機構も呼び出し）
    await this.escalate({
      runId: context.runId,
      agentId: context.workerId,
      category: this.categorizeError(finalError),
      error: this.createErrorInfo(finalError, 'unknown', false),
      attempts: workerRetryConfig.maxAttempts,
      reason: `ワーカー ${context.workerId} が指数バックオフ（1s, 2s, 4s）で${workerRetryConfig.maxAttempts}回試行後も失敗。チケット: ${context.ticketId}`,
      timestamp: failedAt,
    });

    return {
      success: false,
      error: finalError,
      attempts: workerRetryConfig.maxAttempts,
      errorHistory,
      ticketStatusUpdated,
      managerNotified,
      failureNotification,
    };
  }

  /**
   * 失敗通知情報を作成
   *
   * @param context - 失敗時処理コンテキスト
   * @param error - 発生したエラー
   * @param attempts - 試行回数
   * @param failedAt - 失敗日時
   * @returns 失敗通知情報
   *
   * @see Requirement 11.2
   */
  createFailureNotification(
    context: FailureHandlingContext,
    error: Error,
    attempts: number,
    failedAt: string
  ): WorkerFailureNotification {
    const errorInfo = this.createErrorInfo(error, this.categorizeError(error), false);

    // 推奨アクションを決定
    const recommendedAction = this.determineRecommendedAction(error, attempts);

    return {
      ticketId: context.ticketId,
      workerId: context.workerId,
      runId: context.runId,
      error: errorInfo,
      attempts,
      failedAt,
      recommendedAction,
    };
  }

  /**
   * 推奨アクションを決定
   *
   * エラーの種類と試行回数に基づいて、Manager Agentへの推奨アクションを決定する。
   *
   * @param error - 発生したエラー
   * @param attempts - 試行回数
   * @returns 推奨アクション
   */
  private determineRecommendedAction(
    error: Error,
    attempts: number
  ): 'reassign' | 'escalate' | 'manual_review' {
    const category = this.categorizeError(error);

    // 一時的なエラー（接続エラー、タイムアウト）は再割り当てを推奨
    if (category === 'ai_connection' || category === 'timeout') {
      return 'reassign';
    }

    // Gitエラーやコンテナエラーは手動レビューを推奨
    if (category === 'git' || category === 'container') {
      return 'manual_review';
    }

    // バリデーションエラーはエスカレーションを推奨
    if (category === 'validation') {
      return 'escalate';
    }

    // 3回以上試行して失敗した場合はエスカレーション
    if (attempts >= 3) {
      return 'escalate';
    }

    // デフォルトは再割り当て
    return 'reassign';
  }

  // ===========================================================================
  // ツール呼び出しエラー処理
  // ===========================================================================

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
    // エラー情報を作成
    const errorInfo = this.createErrorInfo(error, 'tool_call', true);

    // エラーをログに記録
    await this.logError(runId, errorInfo);

    // AIに報告するメッセージを生成
    const errorMessage = this.formatToolCallErrorForAI(error, toolName);

    console.log(`[ErrorHandler] ツール呼び出しエラー (${toolName}):`, error.message);

    return errorMessage;
  }

  /**
   * ツール呼び出しエラーをAI向けにフォーマット
   *
   * @param error - エラー
   * @param toolName - ツール名
   * @returns フォーマットされたエラーメッセージ
   */
  private formatToolCallErrorForAI(error: Error, toolName: string): string {
    return (
      `ツール「${toolName}」の実行中にエラーが発生しました。\n` +
      `エラー: ${error.message}\n` +
      `別のアプローチを試すか、問題を回避する方法を検討してください。`
    );
  }

  // ===========================================================================
  // エスカレーション
  // ===========================================================================

  /**
   * エラーをエスカレーション
   *
   * 回復不能なエラーをマネージャーに通知する。
   *
   * @param info - エスカレーション情報
   */
  async escalate(info: EscalationInfo): Promise<void> {
    console.error(`[ErrorHandler] エスカレーション: ${info.category} - ${info.error.message}`);

    // エラーをログに記録
    await this.logError(info.runId, info.error);

    // エスカレーションコールバックを呼び出し
    if (this.onEscalation) {
      try {
        await this.onEscalation(info);
      } catch (callbackError) {
        console.error('[ErrorHandler] エスカレーションコールバックエラー:', callbackError);
      }
    }
  }

  // ===========================================================================
  // エラーログ出力
  // ===========================================================================

  /**
   * エラーをログファイルに出力
   *
   * @param runId - 実行ID
   * @param error - エラー情報
   *
   * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
   */
  async logError(runId: RunId, error: ErrorInfo): Promise<void> {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // ログディレクトリを作成
        const logDir = path.join(this.runtimeBasePath, runId);
        await fs.mkdir(logDir, { recursive: true });

        // ログファイルパス
        const logPath = path.join(logDir, ERROR_LOG_FILENAME);

        // ログエントリを作成
        const logEntry = this.formatLogEntry(error);

        // ログファイルに追記
        await fs.appendFile(logPath, logEntry + '\n', 'utf-8');
        return; // 成功したら終了
      } catch (logError) {
        // ENOENT等の一時的エラーはリトライ
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
          continue;
        }
        // 最終リトライでも失敗した場合はコンソールに出力
        console.error('[ErrorHandler] エラーログ出力失敗:', logError);
      }
    }
  }

  /**
   * エラーログエントリをフォーマット
   *
   * @param error - エラー情報
   * @returns フォーマットされたログエントリ
   */
  private formatLogEntry(error: ErrorInfo): string {
    const timestamp = error.timestamp;
    const recoverable = error.recoverable ? 'RECOVERABLE' : 'FATAL';
    const stack = error.stack ? `\n  Stack: ${error.stack}` : '';

    return `[${timestamp}] [${error.code}] [${recoverable}] ${error.message}${stack}`;
  }

  /**
   * エラーログを読み込み
   *
   * @param runId - 実行ID
   * @returns エラーログの内容（存在しない場合は空文字列）
   */
  async readErrorLog(runId: RunId): Promise<string> {
    try {
      const logPath = path.join(this.runtimeBasePath, runId, ERROR_LOG_FILENAME);
      return await fs.readFile(logPath, 'utf-8');
    } catch {
      return '';
    }
  }

  // ===========================================================================
  // エラー情報作成
  // ===========================================================================

  /**
   * ErrorInfoオブジェクトを作成
   *
   * @param error - エラー
   * @param category - エラーカテゴリ
   * @param recoverable - 回復可能フラグ
   * @returns ErrorInfoオブジェクト
   */
  createErrorInfo(error: Error, category: ErrorCategory, recoverable: boolean): ErrorInfo {
    return {
      code: this.getErrorCode(error, category),
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      recoverable,
    };
  }

  /**
   * エラーコードを取得
   *
   * @param error - エラー
   * @param category - エラーカテゴリ
   * @returns エラーコード
   */
  private getErrorCode(error: Error, category: ErrorCategory): string {
    // エラーにコードが含まれている場合はそれを使用
    if ('code' in error && typeof (error as { code?: string }).code === 'string') {
      return (error as { code: string }).code;
    }

    // カテゴリに基づいてコードを生成
    const categoryPrefix = category.toUpperCase().replace(/_/g, '_');
    return `${categoryPrefix}_ERROR`;
  }

  // ===========================================================================
  // フォールバック機能
  // ===========================================================================

  /**
   * フォールバック付きで操作を実行
   *
   * プライマリ操作が失敗した場合、フォールバック操作を実行する。
   *
   * @param primary - プライマリ操作
   * @param fallback - フォールバック操作
   * @param context - エラーコンテキスト
   * @returns 操作結果
   */
  async withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    context: {
      runId: RunId;
      agentId: AgentId;
    }
  ): Promise<{ result: T; usedFallback: boolean }> {
    try {
      // プライマリ操作を試行
      const result = await primary();
      return { result, usedFallback: false };
    } catch (primaryError) {
      console.warn('[ErrorHandler] プライマリ操作失敗、フォールバックを試行');

      // エラーをログに記録
      const errorInfo = this.createErrorInfo(
        primaryError instanceof Error ? primaryError : new Error(String(primaryError)),
        'unknown',
        true
      );
      await this.logError(context.runId, errorInfo);

      try {
        // フォールバック操作を試行
        const result = await fallback();
        return { result, usedFallback: true };
      } catch (fallbackError) {
        // フォールバックも失敗した場合
        const fallbackErrorInfo = this.createErrorInfo(
          fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
          'unknown',
          false
        );
        await this.logError(context.runId, fallbackErrorInfo);

        throw fallbackError;
      }
    }
  }

  // ===========================================================================
  // エラー統計・レポート・Graceful Degradation
  // @see Requirements: 1.5, 6.1, 6.3, 6.5
  // ===========================================================================

  /**
   * エラー統計情報を取得
   *
   * errors.logを解析し、カテゴリ別のエラー統計情報を返す。
   *
   * @param runId - 実行ID
   * @returns エラー統計情報
   *
   * @see Requirement 6.1: エラーログの詳細統計
   *
   * @example
   * ```typescript
   * const stats = await errorHandler.getErrorStatistics('run-001');
   * console.log(`総エラー数: ${stats.totalErrors}`);
   * console.log(`復旧可能: ${stats.recoverableErrors}`);
   * ```
   */
  async getErrorStatistics(runId: RunId): Promise<ErrorStatistics> {
    const logContent = await this.readErrorLog(runId);

    const stats: ErrorStatistics = {
      runId,
      byCategory: {},
      totalErrors: 0,
      recoverableErrors: 0,
      unrecoverableErrors: 0,
    };

    // ログが空の場合は初期値を返す
    if (!logContent.trim()) {
      return stats;
    }

    // ログエントリを行ごとに解析（スタックトレース行はスキップ）
    const lines = logContent.split('\n').filter((line) => line.startsWith('['));

    for (const line of lines) {
      stats.totalErrors++;

      // タイムスタンプを抽出: [2024-01-01T00:00:00.000Z]
      const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/);
      const timestamp = timestampMatch ? timestampMatch[1] : undefined;

      // 最初と最後のエラー日時を追跡
      if (timestamp) {
        if (!stats.firstErrorAt || timestamp < stats.firstErrorAt) {
          stats.firstErrorAt = timestamp;
        }
        if (!stats.lastErrorAt || timestamp > stats.lastErrorAt) {
          stats.lastErrorAt = timestamp;
        }
      }

      // エラーコード（カテゴリ）を抽出: [AI_CONNECTION_ERROR]
      const codeMatch = line.match(/\]\s*\[([A-Z_]+)\]/);
      if (codeMatch) {
        const category = codeMatch[1];
        stats.byCategory[category] = (stats.byCategory[category] ?? 0) + 1;
      }

      // 復旧可能性を判定: [RECOVERABLE] or [FATAL]
      if (line.includes('[RECOVERABLE]')) {
        stats.recoverableErrors++;
      } else if (line.includes('[FATAL]')) {
        stats.unrecoverableErrors++;
      }
    }

    return stats;
  }

  /**
   * 失敗レポートを生成
   *
   * 永続的失敗時にMarkdown形式のレポートを生成し、
   * `runtime/runs/<run-id>/failure-report.md` に保存する。
   *
   * @param runId - 実行ID
   * @param taskDescription - タスク説明
   * @param errors - エラー一覧
   *
   * @see Requirement 6.5: 永続的失敗時のレポート生成
   *
   * @example
   * ```typescript
   * await errorHandler.generateFailureReport(
   *   'run-001',
   *   'ユーザー認証機能の実装',
   *   [errorInfo1, errorInfo2]
   * );
   * ```
   */
  async generateFailureReport(
    runId: RunId,
    taskDescription: string,
    errors: ErrorInfo[]
  ): Promise<void> {
    const failedAt = new Date().toISOString();

    // 推奨アクションを生成
    const recommendedActions = this.generateRecommendedActions(errors);

    // リカバリー手順を生成
    const recoverySteps = this.generateRecoverySteps(errors);

    // レポートデータを構築
    const reportData: FailureReportData = {
      runId,
      taskDescription,
      errors,
      failedAt,
      recommendedActions,
      recoverySteps,
    };

    // Markdownレポートを生成
    const markdown = this.formatFailureReportMarkdown(reportData);

    // ファイルに保存
    try {
      const reportDir = path.join(this.runtimeBasePath, runId);
      await fs.mkdir(reportDir, { recursive: true });

      const reportPath = path.join(reportDir, FAILURE_REPORT_FILENAME);
      await fs.writeFile(reportPath, markdown, 'utf-8');

      console.warn(
        `[ErrorHandler] 失敗レポートを生成しました: ${reportPath}`
      );
    } catch (writeError) {
      console.error(
        '[ErrorHandler] 失敗レポート書き込みエラー:',
        writeError instanceof Error ? writeError.message : String(writeError)
      );
    }
  }

  /**
   * AI利用不可時のGraceful Degradation
   *
   * AI利用不可時に実行を一時停止し、現在の状態を保存する。
   * ユーザーへの通知情報を含む PausedState を返す。
   *
   * @param runId - 実行ID
   * @param context - 一時停止コンテキスト
   * @returns 一時停止状態
   *
   * @see Requirement 1.5: AI利用不可時のGraceful Degradation
   * @see Requirement 6.3: 一時停止と状態保存
   *
   * @example
   * ```typescript
   * const pausedState = await errorHandler.handleAIUnavailable('run-001', {
   *   taskStatus: 'executing',
   *   completedSubTasks: 2,
   *   totalSubTasks: 5,
   *   lastProcessedSubTaskId: 'subtask-002',
   * });
   * console.log(`一時停止理由: ${pausedState.reason}`);
   * ```
   */
  async handleAIUnavailable(
    runId: RunId,
    context: {
      taskStatus: TaskStatus;
      completedSubTasks: number;
      totalSubTasks: number;
      lastProcessedSubTaskId?: string;
    }
  ): Promise<PausedState> {
    const pausedAt = new Date().toISOString();

    // リカバリー手順を構築
    const recoveryInstructions = [
      '1. Ollamaサービスが起動しているか確認: `ollama serve`',
      '2. 必要なモデルがインストールされているか確認: `ollama list`',
      '3. ネットワーク接続を確認',
      `4. 実行を再開: \`agentcompany resume ${runId}\``,
    ].join('\n');

    // 一時停止状態を構築
    const pausedState: PausedState = {
      runId,
      reason: 'AI service unavailable - execution paused to prevent data loss',
      pausedAt,
      taskStatus: context.taskStatus,
      progress: {
        completedSubTasks: context.completedSubTasks,
        totalSubTasks: context.totalSubTasks,
        lastProcessedSubTaskId: context.lastProcessedSubTaskId,
      },
      recoveryInstructions,
    };

    // 状態をファイルに保存（リトライ付き）
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const stateDir = path.join(this.runtimeBasePath, runId);
        await fs.mkdir(stateDir, { recursive: true });

        const statePath = path.join(stateDir, PAUSED_STATE_FILENAME);
        await fs.writeFile(statePath, JSON.stringify(pausedState, null, 2), 'utf-8');

        console.warn(
          `[ErrorHandler] AI利用不可 - 実行を一時停止しました (runId: ${runId})`
        );
        break;
      } catch (writeError) {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
          continue;
        }
        console.error(
          '[ErrorHandler] 一時停止状態の保存に失敗:',
          writeError instanceof Error ? writeError.message : String(writeError)
        );
      }
    }

    // エラーログにも記録
    const errorInfo = this.createErrorInfo(
      new Error('AI service unavailable'),
      'ai_connection',
      true
    );
    await this.logError(runId, errorInfo);

    return pausedState;
  }

  // ===========================================================================
  // 失敗レポート用ヘルパーメソッド
  // ===========================================================================

  /**
   * エラー一覧から推奨アクションを生成
   *
   * @param errors - エラー一覧
   * @returns 推奨アクション一覧
   */
  private generateRecommendedActions(errors: ErrorInfo[]): string[] {
    const actions: string[] = [];
    const seenActions = new Set<string>();

    for (const error of errors) {
      const message = error.message.toLowerCase();
      let action: string | undefined;

      if (message.includes('connection') || message.includes('econnrefused')) {
        action = 'ネットワーク接続とサービスの稼働状況を確認してください';
      } else if (message.includes('timeout')) {
        action = 'タイムアウト設定を見直すか、処理を分割してください';
      } else if (message.includes('validation') || message.includes('invalid')) {
        action = '入力データのバリデーションルールを確認してください';
      } else if (message.includes('git') || message.includes('merge')) {
        action = 'Gitリポジトリの状態を確認し、コンフリクトを解決してください';
      } else if (message.includes('container') || message.includes('docker')) {
        action = 'Dockerサービスの稼働状況とリソース制限を確認してください';
      }

      if (action && !seenActions.has(action)) {
        seenActions.add(action);
        actions.push(action);
      }
    }

    // デフォルトアクション
    if (actions.length === 0) {
      actions.push('エラーログを確認し、根本原因を特定してください');
    }

    actions.push('問題が解決しない場合は、Quality Authorityにエスカレーションしてください');

    return actions;
  }

  /**
   * エラー一覧からリカバリー手順を生成
   *
   * @param errors - エラー一覧
   * @returns リカバリー手順一覧
   */
  private generateRecoverySteps(errors: ErrorInfo[]): string[] {
    const steps: string[] = [
      'エラーログ（errors.log）を確認して根本原因を特定',
      '問題の原因を修正',
    ];

    // 復旧可能エラーがある場合
    const hasRecoverable = errors.some((e) => e.recoverable);
    if (hasRecoverable) {
      steps.push('`agentcompany resume <run-id>` で実行を再開');
    } else {
      steps.push('`agentcompany run <ticket-path>` でタスクを再実行');
    }

    steps.push('品質ゲート（make ci）を実行して結果を確認');

    return steps;
  }

  /**
   * 失敗レポートをMarkdown形式にフォーマット
   *
   * @param data - 失敗レポートデータ
   * @returns Markdown形式のレポート文字列
   */
  private formatFailureReportMarkdown(data: FailureReportData): string {
    const lines: string[] = [];

    // ヘッダー
    lines.push('# 失敗レポート');
    lines.push('');
    lines.push(`- **実行ID**: ${data.runId}`);
    lines.push(`- **失敗日時**: ${data.failedAt}`);
    lines.push('');

    // タスク説明
    lines.push('## タスク説明');
    lines.push('');
    lines.push(data.taskDescription);
    lines.push('');

    // エラー一覧
    lines.push('## エラー一覧');
    lines.push('');
    if (data.errors.length === 0) {
      lines.push('エラーなし');
    } else {
      lines.push('| # | コード | メッセージ | 復旧可能 | タイムスタンプ |');
      lines.push('|---|--------|-----------|---------|--------------|');
      for (let i = 0; i < data.errors.length; i++) {
        const err = data.errors[i];
        const recoverable = err.recoverable ? '✅' : '❌';
        lines.push(
          `| ${i + 1} | ${err.code} | ${err.message} | ${recoverable} | ${err.timestamp} |`
        );
      }
    }
    lines.push('');

    // 推奨アクション
    lines.push('## 推奨アクション');
    lines.push('');
    for (const action of data.recommendedActions) {
      lines.push(`- ${action}`);
    }
    lines.push('');

    // リカバリー手順
    lines.push('## リカバリー手順');
    lines.push('');
    for (let i = 0; i < data.recoverySteps.length; i++) {
      lines.push(`${i + 1}. ${data.recoverySteps[i]}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  // ===========================================================================
  // ユーティリティメソッド
  // ===========================================================================

  /**
   * スリープ
   * @param ms - ミリ秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * エラーカテゴリを判定
   *
   * @param error - エラー
   * @returns エラーカテゴリ
   */
  categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Gitエラー（AI接続エラーより先に判定）
    if (
      message.includes('git') ||
      message.includes('clone') ||
      message.includes('push') ||
      message.includes('merge') ||
      message.includes('conflict')
    ) {
      return 'git';
    }

    // コンテナエラー（AI接続エラーより先に判定）
    if (message.includes('container') || message.includes('docker') || message.includes('image')) {
      return 'container';
    }

    // AI接続エラー
    if (
      message.includes('connection') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('ai') ||
      message.includes('adapter')
    ) {
      return 'ai_connection';
    }

    // タイムアウトエラー
    if (message.includes('timeout') || name.includes('timeout')) {
      return 'timeout';
    }

    // バリデーションエラー
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      name.includes('validation')
    ) {
      return 'validation';
    }

    return 'unknown';
  }

  /**
   * リトライ設定を取得
   * @returns 現在のリトライ設定
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  /**
   * ランタイムベースパスを取得
   * @returns ランタイムベースパス
   */
  getRuntimeBasePath(): string {
    return this.runtimeBasePath;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * ErrorHandlerを作成
 *
 * @param options - エラーハンドラーオプション
 * @returns ErrorHandlerインスタンス
 *
 * @example
 * ```typescript
 * const errorHandler = createErrorHandler({
 *   runtimeBasePath: 'runtime/runs',
 *   retryConfig: { maxRetries: 5 },
 * });
 * ```
 */
export function createErrorHandler(options?: ErrorHandlerOptions): ErrorHandler {
  return new ErrorHandler(options);
}

// =============================================================================
// デフォルトインスタンス
// =============================================================================

/**
 * デフォルトのErrorHandlerインスタンス
 */
export const errorHandler = new ErrorHandler();

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default ErrorHandler;
