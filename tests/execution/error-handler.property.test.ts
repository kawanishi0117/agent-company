/**
 * Error Handler プロパティテスト
 *
 * Property 20: Exponential Backoff Retry
 * - 任意のワーカー失敗に対して、システムは1s, 2s, 4sの遅延でリトライする
 * - 最大3回試行後に失敗としてマークする
 *
 * Property 21: Error Audit Logging
 * - 任意のエラーに対して、エラー詳細が `runtime/runs/<run-id>/errors.log` に記録される
 *
 * Property 26: Retry with Exponential Backoff (Legacy)
 * - 任意のAI接続失敗に対して、システムは1s, 2s, 4sの遅延でリトライする
 * - 全てのリトライが失敗した場合、エスカレーションが発生する
 *
 * **Validates: Requirements 11.1, 11.2, 11.5, 13.1**
 *
 * @module tests/execution/error-handler.property.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import {
  ErrorHandler,
  createErrorHandler,
  RetryConfig,
  EscalationInfo,
  ErrorCategory,
  FailureHandlingContext,
} from '../../tools/cli/lib/execution/error-handler';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_RUNTIME_BASE = 'runtime/test-error-handler-property';

// =============================================================================
// モック設定
// =============================================================================

// fsモジュールの部分モック
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
  };
});

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * リトライ設定を生成するArbitrary
 */
const retryConfigArb: fc.Arbitrary<RetryConfig> = fc.record({
  maxAttempts: fc.integer({ min: 1, max: 10 }),
  initialDelayMs: fc.integer({ min: 100, max: 5000 }),
  backoffMultiplier: fc.double({ min: 1.1, max: 4.0, noNaN: true }),
  maxDelayMs: fc.integer({ min: 1000, max: 30000 }),
});

/**
 * 実行ID（RunId）を生成するArbitrary
 */
const runIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
      minLength: 8,
      maxLength: 16,
    }),
    fc.integer({ min: 1, max: 9999 })
  )
  .map(([prefix, suffix]) => `run-${prefix}-${suffix.toString().padStart(4, '0')}`);

/**
 * エージェントID（AgentId）を生成するArbitrary
 */
const agentIdArb: fc.Arbitrary<string> = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
    minLength: 6,
    maxLength: 12,
  })
  .map((id) => `worker-${id}`);

/**
 * エラーカテゴリを生成するArbitrary
 */
const errorCategoryArb: fc.Arbitrary<ErrorCategory> = fc.constantFrom(
  'ai_connection',
  'tool_call',
  'git',
  'container',
  'timeout',
  'validation',
  'unknown'
);

/**
 * チケットIDを生成するArbitrary
 */
const ticketIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), {
      minLength: 3,
      maxLength: 8,
    }),
    fc.integer({ min: 1, max: 999 }),
    fc.integer({ min: 1, max: 99 }),
    fc.integer({ min: 1, max: 999 })
  )
  .map(
    ([proj, parent, child, grandchild]) =>
      `${proj}-${parent.toString().padStart(3, '0')}-${child.toString().padStart(2, '0')}-${grandchild.toString().padStart(3, '0')}`
  );

/**
 * 試行番号を生成するArbitrary（バックオフ計算用）
 */
const attemptNumberArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 10 });

// =============================================================================
// テストヘルパー関数
// =============================================================================

/**
 * 指定回数失敗してから成功する関数を作成
 *
 * @param failCount - 失敗回数
 * @param successValue - 成功時の戻り値
 * @returns 操作関数
 */
function createFailingOperation<T>(
  failCount: number,
  successValue: T
): { operation: () => Promise<T>; getAttempts: () => number } {
  let attempts = 0;
  return {
    operation: async () => {
      attempts++;
      if (attempts <= failCount) {
        throw new Error(`Test error (attempt ${attempts})`);
      }
      return successValue;
    },
    getAttempts: () => attempts,
  };
}

/**
 * 常に失敗する関数を作成
 *
 * @returns 操作関数
 */
function createAlwaysFailingOperation(): {
  operation: () => Promise<never>;
  getAttempts: () => number;
} {
  let attempts = 0;
  return {
    operation: async () => {
      attempts++;
      throw new Error(`Always fails (attempt ${attempts})`);
    },
    getAttempts: () => attempts,
  };
}

// =============================================================================
// Property 26: Retry with Exponential Backoff テスト
// =============================================================================

describe('Property 26: Retry with Exponential Backoff', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    errorHandler = createErrorHandler({
      runtimeBasePath: TEST_RUNTIME_BASE,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 26.1: 指数バックオフの遅延計算
   * 任意のリトライ設定と試行番号に対して、遅延時間は指数関数的に増加する
   *
   * **Validates: Requirements 13.1**
   * - exponential backoff (1s, 2s, 4s)
   */
  it('Property 26.1: 指数バックオフの遅延時間が正しく計算される', () => {
    fc.assert(
      fc.property(retryConfigArb, attemptNumberArb, (config, attempt) => {
        const delay = errorHandler.calculateBackoffDelay(attempt, config);

        // 遅延時間は正の数
        expect(delay).toBeGreaterThan(0);

        // 遅延時間は最大値を超えない
        expect(delay).toBeLessThanOrEqual(config.maxDelayMs);

        // 期待される遅延時間を計算
        const expectedDelay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs
        );

        // 計算結果が一致
        expect(delay).toBeCloseTo(expectedDelay, 5);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.2: デフォルト設定での1s, 2s, 4sバックオフ
   * デフォルト設定では、遅延時間は1000ms, 2000ms, 4000msとなる
   *
   * **Validates: Requirements 13.1**
   * - exponential backoff (1s, 2s, 4s)
   */
  it('Property 26.2: デフォルト設定で1s, 2s, 4sのバックオフが適用される', () => {
    // デフォルト設定を使用
    const handler = createErrorHandler();

    // 1回目のリトライ前: 1000ms
    expect(handler.calculateBackoffDelay(0)).toBe(1000);

    // 2回目のリトライ前: 2000ms
    expect(handler.calculateBackoffDelay(1)).toBe(2000);

    // 3回目のリトライ前: 4000ms
    expect(handler.calculateBackoffDelay(2)).toBe(4000);

    // 4回目以降も最大値（4000ms）で制限
    expect(handler.calculateBackoffDelay(3)).toBe(4000);
    expect(handler.calculateBackoffDelay(10)).toBe(4000);
  });

  /**
   * Property 26.3: 遅延時間の単調増加性
   * 任意のリトライ設定に対して、遅延時間は試行回数に応じて単調増加する（最大値まで）
   *
   * **Validates: Requirements 13.1**
   */
  it('Property 26.3: 遅延時間は試行回数に応じて単調増加する', () => {
    fc.assert(
      fc.property(retryConfigArb, (config) => {
        let previousDelay = 0;

        for (let attempt = 0; attempt <= 10; attempt++) {
          const delay = errorHandler.calculateBackoffDelay(attempt, config);

          // 遅延時間は前回以上（単調増加）
          expect(delay).toBeGreaterThanOrEqual(previousDelay);

          previousDelay = delay;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.4: リトライ回数の遵守
   * 任意のリトライ設定に対して、試行回数は maxRetries + 1 を超えない
   *
   * **Validates: Requirements 13.1**
   * - up to 3 times
   */
  it('Property 26.4: リトライ回数が設定値を超えない', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        agentIdArb,
        fc.integer({ min: 0, max: 5 }),
        async (runId, agentId, maxRetries) => {
          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries, initialDelayMs: 1 }, // テスト高速化
          });

          const { operation, getAttempts } = createAlwaysFailingOperation();

          const result = await handler.withRetry(operation, {
            category: 'ai_connection',
            runId,
            agentId,
          });

          // 試行回数は maxRetries + 1（初回 + リトライ回数）
          expect(result.attempts).toBe(maxRetries + 1);
          expect(getAttempts()).toBe(maxRetries + 1);

          // 結果は失敗
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 26.5: 成功時のリトライ停止
   * 任意の失敗回数に対して、成功した時点でリトライが停止する
   *
   * **Validates: Requirements 13.1**
   */
  it('Property 26.5: 成功時にリトライが停止する', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        agentIdArb,
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 10 }),
        async (runId, agentId, failCount, maxRetries) => {
          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries, initialDelayMs: 1 },
          });

          const { operation, getAttempts } = createFailingOperation(failCount, 'success');

          const result = await handler.withRetry(operation, {
            category: 'ai_connection',
            runId,
            agentId,
          });

          if (failCount <= maxRetries) {
            // 成功する場合
            expect(result.success).toBe(true);
            expect(result.result).toBe('success');
            expect(result.attempts).toBe(failCount + 1);
            expect(getAttempts()).toBe(failCount + 1);
          } else {
            // 失敗する場合（リトライ回数を超える）
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(maxRetries + 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26.6: エラー履歴の記録
   * 任意の失敗シナリオに対して、エラー履歴が正しく記録される
   *
   * **Validates: Requirements 13.1**
   */
  it('Property 26.6: エラー履歴が正しく記録される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        agentIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (runId, agentId, maxRetries) => {
          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries, initialDelayMs: 1 },
          });

          const { operation } = createAlwaysFailingOperation();

          const result = await handler.withRetry(operation, {
            category: 'ai_connection',
            runId,
            agentId,
          });

          // エラー履歴の長さは試行回数と一致
          expect(result.errorHistory.length).toBe(result.attempts);

          // 各エラーはErrorオブジェクト
          for (const error of result.errorHistory) {
            expect(error).toBeInstanceOf(Error);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 26.7: エスカレーションの発生
   * 全てのリトライが失敗した場合、エスカレーションが発生する
   *
   * **Validates: Requirements 13.1**
   */
  it('Property 26.7: 全リトライ失敗時にエスカレーションが発生する', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        agentIdArb,
        errorCategoryArb,
        fc.integer({ min: 0, max: 3 }),
        async (runId, agentId, category, maxRetries) => {
          let escalationCalled = false;
          let capturedInfo: EscalationInfo | undefined;

          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries, initialDelayMs: 1 },
            onEscalation: async (info) => {
              escalationCalled = true;
              capturedInfo = info;
            },
          });

          const { operation } = createAlwaysFailingOperation();

          await handler.withRetry(operation, {
            category,
            runId,
            agentId,
          });

          // エスカレーションが呼び出された
          expect(escalationCalled).toBe(true);

          // エスカレーション情報が正しい
          expect(capturedInfo).toBeDefined();
          expect(capturedInfo!.runId).toBe(runId);
          expect(capturedInfo!.agentId).toBe(agentId);
          expect(capturedInfo!.category).toBe(category);
          expect(capturedInfo!.attempts).toBe(maxRetries + 1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 26.8: 成功時はエスカレーションなし
   * 操作が成功した場合、エスカレーションは発生しない
   *
   * **Validates: Requirements 13.1**
   */
  it('Property 26.8: 成功時はエスカレーションが発生しない', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        agentIdArb,
        fc.integer({ min: 0, max: 3 }),
        async (runId, agentId, failCount) => {
          let escalationCalled = false;

          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries: 5, initialDelayMs: 1 },
            onEscalation: async () => {
              escalationCalled = true;
            },
          });

          const { operation } = createFailingOperation(failCount, 'success');

          const result = await handler.withRetry(operation, {
            category: 'ai_connection',
            runId,
            agentId,
          });

          // 成功した場合
          if (result.success) {
            // エスカレーションは呼び出されない
            expect(escalationCalled).toBe(false);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// 追加のプロパティテスト（エッジケース）
// =============================================================================

describe('Retry Edge Cases (Property-Based)', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    errorHandler = createErrorHandler({
      runtimeBasePath: TEST_RUNTIME_BASE,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 最大遅延時間の制限
   * 任意の試行回数に対して、遅延時間は最大値を超えない
   */
  it('遅延時間は最大値を超えない', () => {
    fc.assert(
      fc.property(retryConfigArb, fc.integer({ min: 0, max: 100 }), (config, attempt) => {
        const delay = errorHandler.calculateBackoffDelay(attempt, config);
        expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 初期遅延時間の保証
   * 最初の試行（attempt=0）では、遅延時間は初期値と一致する
   */
  it('最初の試行では初期遅延時間が使用される', () => {
    fc.assert(
      fc.property(retryConfigArb, (config) => {
        const delay = errorHandler.calculateBackoffDelay(0, config);
        expect(delay).toBe(Math.min(config.initialDelayMs, config.maxDelayMs));
      }),
      { numRuns: 100 }
    );
  });

  /**
   * リトライ設定の独立性
   * 異なるリトライ設定は互いに影響しない
   */
  it('リトライ設定は独立している', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        agentIdArb,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async (runId, agentId, maxRetries1, maxRetries2) => {
          const handler1 = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries: maxRetries1, initialDelayMs: 1 },
          });

          const handler2 = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries: maxRetries2, initialDelayMs: 1 },
          });

          const { operation: op1, getAttempts: getAttempts1 } = createAlwaysFailingOperation();
          const { operation: op2, getAttempts: getAttempts2 } = createAlwaysFailingOperation();

          await handler1.withRetry(op1, { category: 'ai_connection', runId, agentId });
          await handler2.withRetry(op2, { category: 'ai_connection', runId, agentId });

          // 各ハンドラーは独立した設定を使用
          expect(getAttempts1()).toBe(maxRetries1 + 1);
          expect(getAttempts2()).toBe(maxRetries2 + 1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * カスタムリトライ設定のオーバーライド
   * withRetryに渡されたカスタム設定がデフォルト設定をオーバーライドする
   */
  it('カスタムリトライ設定がデフォルトをオーバーライドする', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        agentIdArb,
        fc.integer({ min: 0, max: 3 }),
        async (runId, agentId, customMaxRetries) => {
          // デフォルトは3回リトライ
          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
            retryConfig: { maxRetries: 10, initialDelayMs: 1 },
          });

          const { operation, getAttempts } = createAlwaysFailingOperation();

          // カスタム設定でオーバーライド
          await handler.withRetry(operation, {
            category: 'ai_connection',
            runId,
            agentId,
            customRetryConfig: { maxRetries: customMaxRetries },
          });

          // カスタム設定が適用される
          expect(getAttempts()).toBe(customMaxRetries + 1);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// Property 20: Exponential Backoff Retry (簡略化版)
// =============================================================================

describe('Property 20: Exponential Backoff Retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 20.1: ワーカー失敗時の指数バックオフ遅延シーケンス
   * デフォルト設定では、遅延時間は[1000, 2000]ms（1s, 2s）となる
   *
   * **Validates: Requirements 11.1**
   */
  it('Property 20.1: ワーカー失敗時の遅延シーケンスが1s, 2sである', () => {
    const handler = createErrorHandler();
    const delays = handler.getBackoffDelaySequence();

    // デフォルト設定での遅延シーケンス（maxAttempts=3なので2回のリトライ遅延）
    expect(delays).toEqual([1000, 2000]);
  });

  /**
   * Property 20.2: 指数バックオフの計算が正しい
   * 任意の試行回数に対して、遅延時間は指数関数的に増加する
   *
   * **Validates: Requirements 11.1**
   */
  it('Property 20.2: 指数バックオフの計算が正しい', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (attempt) => {
        const handler = createErrorHandler();
        const delay = handler.calculateBackoffDelay(attempt);

        // 期待される遅延時間を計算
        const expectedDelay = Math.min(1000 * Math.pow(2, attempt), 4000);

        expect(delay).toBe(expectedDelay);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.3: 失敗通知情報の作成
   * 任意のコンテキストに対して、失敗通知情報が正しく作成される
   *
   * **Validates: Requirements 11.2**
   */
  it('Property 20.3: 失敗通知情報が正しく作成される', () => {
    fc.assert(
      fc.property(
        runIdArb,
        agentIdArb,
        ticketIdArb,
        agentIdArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        (runId, workerId, ticketId, managerAgentId, errorMessage) => {
          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
          });

          const context: FailureHandlingContext = {
            runId,
            workerId,
            ticketId,
            managerAgentId,
          };

          const notification = handler.createFailureNotification(
            context,
            new Error(errorMessage),
            3,
            new Date().toISOString()
          );

          // 通知情報が正しい
          expect(notification.ticketId).toBe(ticketId);
          expect(notification.workerId).toBe(workerId);
          expect(notification.runId).toBe(runId);
          expect(notification.attempts).toBe(3);
          expect(notification.error.message).toBe(errorMessage);
          expect(['reassign', 'escalate', 'manual_review']).toContain(
            notification.recommendedAction
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// Property 21: Error Audit Logging
// =============================================================================

describe('Property 21: Error Audit Logging', () => {
  let mockAppendFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAppendFile = vi.mocked(fs.appendFile);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 21.1: エラー発生時のログ記録
   * 任意のエラーに対して、エラー詳細が `runtime/runs/<run-id>/errors.log` に記録される
   *
   * **Validates: Requirements 11.5**
   */
  it('Property 21.1: エラー発生時にerrors.logに記録される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (runId, errorMessage) => {
          mockAppendFile.mockClear();

          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
          });

          const errorInfo = handler.createErrorInfo(new Error(errorMessage), 'unknown', true);

          await handler.logError(runId, errorInfo);

          // appendFileが呼び出された
          expect(mockAppendFile).toHaveBeenCalled();

          // errors.logに書き込まれた
          const callArgs = mockAppendFile.mock.calls[0];
          const logPath = callArgs[0] as string;
          expect(logPath).toContain('errors.log');

          // エラーメッセージが含まれている
          expect(callArgs[1]).toContain(errorMessage);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 21.2: エラーログのフォーマット
   * 任意のエラーに対して、ログエントリにはタイムスタンプ、コード、メッセージが含まれる
   *
   * **Validates: Requirements 11.5**
   */
  it('Property 21.2: エラーログに必要な情報が含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        errorCategoryArb,
        async (runId, errorMessage, category) => {
          mockAppendFile.mockClear();

          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
          });

          const errorInfo = handler.createErrorInfo(new Error(errorMessage), category, true);

          await handler.logError(runId, errorInfo);

          // ログエントリの内容を確認
          const logEntry = mockAppendFile.mock.calls[0][1] as string;

          // タイムスタンプが含まれる（ISO8601形式）
          expect(logEntry).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

          // エラーコードが含まれる
          expect(logEntry).toMatch(/\[.*_ERROR\]/);

          // 回復可能性が含まれる
          expect(logEntry).toMatch(/\[(RECOVERABLE|FATAL)\]/);

          // エラーメッセージが含まれる
          expect(logEntry).toContain(errorMessage);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 21.3: エラー情報の作成
   * 任意のエラーに対して、ErrorInfoオブジェクトが正しく作成される
   *
   * **Validates: Requirements 11.5**
   */
  it('Property 21.3: エラー情報が正しく作成される', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        errorCategoryArb,
        fc.boolean(),
        (errorMessage, category, recoverable) => {
          const handler = createErrorHandler({
            runtimeBasePath: TEST_RUNTIME_BASE,
          });

          const errorInfo = handler.createErrorInfo(new Error(errorMessage), category, recoverable);

          // ErrorInfoが正しく作成される
          expect(errorInfo.message).toBe(errorMessage);
          expect(errorInfo.recoverable).toBe(recoverable);
          expect(errorInfo.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          expect(errorInfo.code).toContain('ERROR');
        }
      ),
      { numRuns: 50 }
    );
  });
});
