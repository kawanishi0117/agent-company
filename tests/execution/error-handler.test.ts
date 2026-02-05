/**
 * Error Handler テスト
 *
 * ErrorHandlerの基本機能をテストする。
 * - リトライ（指数バックオフ）
 * - ツール呼び出しエラー処理
 * - エスカレーション
 * - エラーログ出力
 *
 * @see Requirements: 13.1, 13.2, 13.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ErrorHandler,
  createErrorHandler,
  DEFAULT_RETRY_CONFIG,
  RetryConfig,
  RetryResult,
  EscalationInfo,
  ErrorCategory,
} from '../../tools/cli/lib/execution/error-handler';
import { ErrorInfo } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * テスト用の一時ディレクトリを作成
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join('runtime', 'test-error-handler', `test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * テスト用の一時ディレクトリを削除
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

/**
 * 指定回数失敗してから成功する関数を作成
 */
function createFailingOperation<T>(
  failCount: number,
  successValue: T,
  errorMessage: string = 'Test error'
): () => Promise<T> {
  let attempts = 0;
  return async () => {
    attempts++;
    if (attempts <= failCount) {
      throw new Error(`${errorMessage} (attempt ${attempts})`);
    }
    return successValue;
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('ErrorHandler', () => {
  let tempDir: string;
  let errorHandler: ErrorHandler;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = await createTempDir();

    // ErrorHandlerを作成
    errorHandler = createErrorHandler({
      runtimeBasePath: tempDir,
    });
  });

  afterEach(async () => {
    // クリーンアップ
    await cleanupTempDir(tempDir);
  });

  // ===========================================================================
  // 初期化テスト
  // ===========================================================================

  describe('初期化', () => {
    it('createErrorHandlerファクトリ関数が動作する', () => {
      const handler = createErrorHandler();
      expect(handler).toBeInstanceOf(ErrorHandler);
    });

    it('デフォルトのリトライ設定が適用される', () => {
      const handler = createErrorHandler();
      const config = handler.getRetryConfig();

      expect(config.maxRetries).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
      expect(config.initialDelayMs).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);
      expect(config.backoffMultiplier).toBe(DEFAULT_RETRY_CONFIG.backoffMultiplier);
      expect(config.maxDelayMs).toBe(DEFAULT_RETRY_CONFIG.maxDelayMs);
    });

    it('カスタムリトライ設定が適用される', () => {
      const handler = createErrorHandler({
        retryConfig: {
          maxRetries: 5,
          initialDelayMs: 500,
        },
      });
      const config = handler.getRetryConfig();

      expect(config.maxRetries).toBe(5);
      expect(config.initialDelayMs).toBe(500);
      // デフォルト値が維持される
      expect(config.backoffMultiplier).toBe(DEFAULT_RETRY_CONFIG.backoffMultiplier);
    });

    it('カスタムランタイムベースパスが適用される', () => {
      const customPath = 'custom/runtime/path';
      const handler = createErrorHandler({
        runtimeBasePath: customPath,
      });

      expect(handler.getRuntimeBasePath()).toBe(customPath);
    });
  });

  // ===========================================================================
  // リトライテスト
  // ===========================================================================

  describe('リトライ（指数バックオフ）', () => {
    /**
     * @see Requirement 13.1: WHEN AI connection fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
     */
    it('成功時はリトライなしで結果を返す', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await errorHandler.withRetry(operation, {
        category: 'ai_connection',
        runId: 'run-001',
        agentId: 'worker-001',
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.errorHistory).toHaveLength(0);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('1回失敗後に成功する場合、2回試行する', async () => {
      const operation = createFailingOperation(1, 'success');

      const result = await errorHandler.withRetry(operation, {
        category: 'ai_connection',
        runId: 'run-001',
        agentId: 'worker-001',
        customRetryConfig: { initialDelayMs: 10 }, // テスト高速化
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
      expect(result.errorHistory).toHaveLength(1);
    });

    it('最大リトライ回数まで試行する', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      const result = await errorHandler.withRetry(operation, {
        category: 'ai_connection',
        runId: 'run-001',
        agentId: 'worker-001',
        customRetryConfig: { maxRetries: 3, initialDelayMs: 10 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(4); // 初回 + 3回リトライ
      expect(result.errorHistory).toHaveLength(4);
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('指数バックオフの遅延時間が正しく計算される', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 4000,
      };

      // 1回目: 1000ms
      expect(errorHandler.calculateBackoffDelay(0, config)).toBe(1000);
      // 2回目: 2000ms
      expect(errorHandler.calculateBackoffDelay(1, config)).toBe(2000);
      // 3回目: 4000ms
      expect(errorHandler.calculateBackoffDelay(2, config)).toBe(4000);
      // 4回目: 4000ms（最大値で制限）
      expect(errorHandler.calculateBackoffDelay(3, config)).toBe(4000);
    });

    it('デフォルト設定で1s, 2s, 4sのバックオフが適用される', () => {
      // Requirement 13.1: exponential backoff (1s, 2s, 4s)
      expect(errorHandler.calculateBackoffDelay(0)).toBe(1000);
      expect(errorHandler.calculateBackoffDelay(1)).toBe(2000);
      expect(errorHandler.calculateBackoffDelay(2)).toBe(4000);
    });
  });

  // ===========================================================================
  // ツール呼び出しエラー処理テスト
  // ===========================================================================

  describe('ツール呼び出しエラー処理', () => {
    /**
     * @see Requirement 13.2: WHEN Tool_Call fails, THE System SHALL report error to AI and continue conversation
     */
    it('ツール呼び出しエラーをAI向けメッセージに変換する', async () => {
      const error = new Error('File not found');
      const runId = 'run-001';

      const message = await errorHandler.handleToolCallError(error, 'read_file', runId);

      expect(message).toContain('read_file');
      expect(message).toContain('File not found');
      expect(message).toContain('別のアプローチ');
    });

    it('ツール呼び出しエラーがログに記録される', async () => {
      const error = new Error('Permission denied');
      const runId = 'run-002';

      await errorHandler.handleToolCallError(error, 'write_file', runId);

      // エラーログを確認
      const logContent = await errorHandler.readErrorLog(runId);
      expect(logContent).toContain('Permission denied');
      expect(logContent).toContain('TOOL_CALL_ERROR');
    });
  });

  // ===========================================================================
  // エスカレーションテスト
  // ===========================================================================

  describe('エスカレーション', () => {
    it('エスカレーションコールバックが呼び出される', async () => {
      const escalationCallback = vi.fn();
      const handler = createErrorHandler({
        runtimeBasePath: tempDir,
        onEscalation: escalationCallback,
      });

      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      await handler.withRetry(operation, {
        category: 'ai_connection',
        runId: 'run-001',
        agentId: 'worker-001',
        customRetryConfig: { maxRetries: 0, initialDelayMs: 10 },
      });

      expect(escalationCallback).toHaveBeenCalledTimes(1);
      expect(escalationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-001',
          agentId: 'worker-001',
          category: 'ai_connection',
        })
      );
    });

    it('エスカレーション情報に必要なフィールドが含まれる', async () => {
      let capturedInfo: EscalationInfo | undefined;
      const handler = createErrorHandler({
        runtimeBasePath: tempDir,
        onEscalation: async (info) => {
          capturedInfo = info;
        },
      });

      const operation = vi.fn().mockRejectedValue(new Error('Test error'));

      await handler.withRetry(operation, {
        category: 'git',
        runId: 'run-003',
        agentId: 'worker-003',
        customRetryConfig: { maxRetries: 0, initialDelayMs: 10 },
      });

      expect(capturedInfo).toBeDefined();
      expect(capturedInfo!.runId).toBe('run-003');
      expect(capturedInfo!.agentId).toBe('worker-003');
      expect(capturedInfo!.category).toBe('git');
      expect(capturedInfo!.error).toBeDefined();
      expect(capturedInfo!.attempts).toBe(1);
      expect(capturedInfo!.reason).toBeDefined();
      expect(capturedInfo!.timestamp).toBeDefined();
    });
  });

  // ===========================================================================
  // エラーログ出力テスト
  // ===========================================================================

  describe('エラーログ出力', () => {
    /**
     * @see Requirement 13.5: THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
     */
    it('エラーがログファイルに出力される', async () => {
      const runId = 'run-log-001';
      const errorInfo: ErrorInfo = {
        code: 'TEST_ERROR',
        message: 'Test error message',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };

      await errorHandler.logError(runId, errorInfo);

      // ログファイルを確認
      const logPath = path.join(tempDir, runId, 'errors.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('TEST_ERROR');
      expect(logContent).toContain('Test error message');
      expect(logContent).toContain('RECOVERABLE');
    });

    it('複数のエラーが追記される', async () => {
      const runId = 'run-log-002';

      await errorHandler.logError(runId, {
        code: 'ERROR_1',
        message: 'First error',
        timestamp: new Date().toISOString(),
        recoverable: true,
      });

      await errorHandler.logError(runId, {
        code: 'ERROR_2',
        message: 'Second error',
        timestamp: new Date().toISOString(),
        recoverable: false,
      });

      const logContent = await errorHandler.readErrorLog(runId);

      expect(logContent).toContain('ERROR_1');
      expect(logContent).toContain('First error');
      expect(logContent).toContain('ERROR_2');
      expect(logContent).toContain('Second error');
      expect(logContent).toContain('FATAL');
    });

    it('スタックトレースがログに含まれる', async () => {
      const runId = 'run-log-003';
      const errorInfo: ErrorInfo = {
        code: 'STACK_ERROR',
        message: 'Error with stack',
        stack: 'Error: Error with stack\n    at test.ts:10:5',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };

      await errorHandler.logError(runId, errorInfo);

      const logContent = await errorHandler.readErrorLog(runId);
      expect(logContent).toContain('Stack:');
      expect(logContent).toContain('at test.ts:10:5');
    });

    it('存在しないログファイルを読み込むと空文字列を返す', async () => {
      const logContent = await errorHandler.readErrorLog('non-existent-run');
      expect(logContent).toBe('');
    });
  });

  // ===========================================================================
  // フォールバックテスト
  // ===========================================================================

  describe('フォールバック', () => {
    it('プライマリ操作が成功した場合はフォールバックを使用しない', async () => {
      const primary = vi.fn().mockResolvedValue('primary-result');
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      const result = await errorHandler.withFallback(primary, fallback, {
        runId: 'run-001',
        agentId: 'worker-001',
      });

      expect(result.result).toBe('primary-result');
      expect(result.usedFallback).toBe(false);
      expect(primary).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('プライマリ操作が失敗した場合はフォールバックを使用する', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      const result = await errorHandler.withFallback(primary, fallback, {
        runId: 'run-001',
        agentId: 'worker-001',
      });

      expect(result.result).toBe('fallback-result');
      expect(result.usedFallback).toBe(true);
      expect(primary).toHaveBeenCalledTimes(1);
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('両方失敗した場合はエラーをスローする', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(
        errorHandler.withFallback(primary, fallback, {
          runId: 'run-001',
          agentId: 'worker-001',
        })
      ).rejects.toThrow('Fallback failed');
    });
  });

  // ===========================================================================
  // エラーカテゴリ判定テスト
  // ===========================================================================

  describe('エラーカテゴリ判定', () => {
    it('AI接続エラーを正しく判定する', () => {
      expect(errorHandler.categorizeError(new Error('Connection refused'))).toBe('ai_connection');
      expect(errorHandler.categorizeError(new Error('Network timeout'))).toBe('ai_connection');
      expect(errorHandler.categorizeError(new Error('ECONNREFUSED'))).toBe('ai_connection');
    });

    it('Gitエラーを正しく判定する', () => {
      expect(errorHandler.categorizeError(new Error('git clone failed'))).toBe('git');
      expect(errorHandler.categorizeError(new Error('push rejected'))).toBe('git');
      expect(errorHandler.categorizeError(new Error('merge conflict'))).toBe('git');
    });

    it('コンテナエラーを正しく判定する', () => {
      expect(errorHandler.categorizeError(new Error('container not found'))).toBe('container');
      expect(errorHandler.categorizeError(new Error('docker daemon error'))).toBe('container');
    });

    it('不明なエラーはunknownを返す', () => {
      expect(errorHandler.categorizeError(new Error('Some random error'))).toBe('unknown');
    });
  });

  // ===========================================================================
  // ErrorInfo作成テスト
  // ===========================================================================

  describe('ErrorInfo作成', () => {
    it('ErrorInfoオブジェクトが正しく作成される', () => {
      const error = new Error('Test error');
      const errorInfo = errorHandler.createErrorInfo(error, 'ai_connection', true);

      expect(errorInfo.code).toBe('AI_CONNECTION_ERROR');
      expect(errorInfo.message).toBe('Test error');
      expect(errorInfo.recoverable).toBe(true);
      expect(errorInfo.timestamp).toBeDefined();
    });

    it('エラーにコードが含まれている場合はそれを使用する', () => {
      const error = new Error('Test error') as Error & { code: string };
      error.code = 'CUSTOM_CODE';

      const errorInfo = errorHandler.createErrorInfo(error, 'unknown', false);

      expect(errorInfo.code).toBe('CUSTOM_CODE');
    });

    it('スタックトレースが含まれる', () => {
      const error = new Error('Test error');
      const errorInfo = errorHandler.createErrorInfo(error, 'unknown', true);

      expect(errorInfo.stack).toBeDefined();
      expect(errorInfo.stack).toContain('Error: Test error');
    });
  });
});
