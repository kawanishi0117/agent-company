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
import { ErrorInfo, RunId, AgentId } from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのリトライ設定
 * @see Requirement 13.1: retry with exponential backoff (1s, 2s, 4s) up to 3 times
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 4000,
};

/**
 * エラーログファイル名
 * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
 */
const ERROR_LOG_FILENAME = 'errors.log';

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
 */
export interface RetryConfig {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries: number;
  /** 初期遅延時間（ミリ秒、デフォルト: 1000） */
  initialDelayMs: number;
  /** バックオフ乗数（デフォルト: 2） */
  backoffMultiplier: number;
  /** 最大遅延時間（ミリ秒、デフォルト: 4000） */
  maxDelayMs: number;
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
  | 'ai_connection'    // AI接続エラー
  | 'tool_call'        // ツール呼び出しエラー
  | 'git'              // Gitエラー
  | 'container'        // コンテナエラー
  | 'timeout'          // タイムアウトエラー
  | 'validation'       // バリデーションエラー
  | 'unknown';         // 不明なエラー

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
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...options?.retryConfig,
    };
    this.onEscalation = options?.onEscalation;
  }

  // ===========================================================================
  // リトライ機能
  // ===========================================================================

  /**
   * 指数バックオフ付きリトライを実行
   *
   * @param operation - 実行する操作
   * @param context - エラーコンテキスト
   * @returns リトライ結果
   *
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
    const config = {
      ...this.retryConfig,
      ...context.customRetryConfig,
    };

    const errorHistory: Error[] = [];
    let lastError: Error | undefined;

    // 初回 + リトライ回数分の試行
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
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

        // エラーをログに記録
        const errorInfo = this.createErrorInfo(lastError, context.category, true);
        await this.logError(context.runId, errorInfo);

        console.warn(
          `[ErrorHandler] 試行 ${attempt + 1}/${config.maxRetries + 1} 失敗:`,
          lastError.message
        );

        // 最後の試行でなければ待機
        if (attempt < config.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt, config);
          console.log(`[ErrorHandler] ${delay}ms 後にリトライします...`);
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
      attempts: config.maxRetries + 1,
      reason: `${config.maxRetries + 1}回の試行後も失敗`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      error: finalError,
      attempts: config.maxRetries + 1,
      errorHistory,
    };
  }

  /**
   * バックオフ遅延時間を計算
   *
   * @param attempt - 試行回数（0から開始）
   * @param config - リトライ設定
   * @returns 遅延時間（ミリ秒）
   *
   * @see Requirement 13.1: exponential backoff (1s, 2s, 4s)
   */
  calculateBackoffDelay(attempt: number, config: RetryConfig = this.retryConfig): number {
    // 指数バックオフ: initialDelay * (multiplier ^ attempt)
    const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);

    // 最大遅延時間を超えないように制限
    return Math.min(delay, config.maxDelayMs);
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
  async handleToolCallError(
    error: Error,
    toolName: string,
    runId: RunId
  ): Promise<string> {
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
    return `ツール「${toolName}」の実行中にエラーが発生しました。\n` +
      `エラー: ${error.message}\n` +
      `別のアプローチを試すか、問題を回避する方法を検討してください。`;
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
    console.error(
      `[ErrorHandler] エスカレーション: ${info.category} - ${info.error.message}`
    );

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
    } catch (logError) {
      // ログ出力自体のエラーはコンソールに出力
      console.error('[ErrorHandler] エラーログ出力失敗:', logError);
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
  createErrorInfo(
    error: Error,
    category: ErrorCategory,
    recoverable: boolean
  ): ErrorInfo {
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
    if (
      message.includes('container') ||
      message.includes('docker') ||
      message.includes('image')
    ) {
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
