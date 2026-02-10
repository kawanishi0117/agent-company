/**
 * Error Handler 強化版プロパティテスト
 *
 * Property 2: Graceful Degradation on AI Unavailability
 * - AI利用不可時に状態が保存され、データ損失がないことを検証
 *
 * Property 13: Error Logging and Failure Reporting
 * - エラーがerrors.logに記録され、永続的失敗時にレポートが生成されることを検証
 *
 * **Validates: Requirements 1.5, 6.1, 6.3, 6.5**
 *
 * @module tests/execution/error-handler-enhanced.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  ErrorHandler,
  createErrorHandler,
} from '../../tools/cli/lib/execution/error-handler';
import type { TaskStatus, ErrorInfo } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/** エラーログファイル名 */
const ERROR_LOG_FILENAME = 'errors.log';

/** 失敗レポートファイル名 */
const FAILURE_REPORT_FILENAME = 'failure-report.md';

/** 一時停止状態ファイル名 */
const PAUSED_STATE_FILENAME = 'paused-state.json';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 実行ID（RunId）を生成するArbitrary
 */
const runIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
      minLength: 6,
      maxLength: 12,
    }),
    fc.integer({ min: 1, max: 9999 })
  )
  .map(([prefix, suffix]) => `run-${prefix}-${suffix.toString().padStart(4, '0')}`);

/**
 * タスクステータスを生成するArbitrary
 */
const taskStatusArb: fc.Arbitrary<TaskStatus> = fc.constantFrom(
  'pending',
  'decomposing',
  'executing',
  'reviewing',
  'completed',
  'failed'
);

/**
 * タスク説明を生成するArbitrary
 */
const taskDescriptionArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789 .-_あいうえおかきくけこ'
  ),
  { minLength: 5, maxLength: 100 }
);

/**
 * エラーメッセージを生成するArbitrary
 * （パイプ文字 | と改行を除外してMarkdownテーブルの破壊を防ぐ）
 */
const errorMessageArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789 .-_:ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  ),
  { minLength: 3, maxLength: 80 }
);

/**
 * ErrorInfoを生成するArbitrary
 */
const errorInfoArb: fc.Arbitrary<ErrorInfo> = fc
  .tuple(
    errorMessageArb,
    fc.constantFrom(
      'AI_CONNECTION_ERROR',
      'TIMEOUT_ERROR',
      'VALIDATION_ERROR',
      'GIT_ERROR',
      'CONTAINER_ERROR',
      'UNKNOWN_ERROR'
    ),
    fc.boolean()
  )
  .map(([message, code, recoverable]) => ({
    code,
    message,
    timestamp: new Date().toISOString(),
    recoverable,
  }));

/**
 * ErrorInfo配列を生成するArbitrary（1〜5件）
 */
const errorInfoArrayArb: fc.Arbitrary<ErrorInfo[]> = fc.array(errorInfoArb, {
  minLength: 1,
  maxLength: 5,
});

/**
 * サブタスク進捗を生成するArbitrary
 */
const progressArb: fc.Arbitrary<{
  completedSubTasks: number;
  totalSubTasks: number;
  lastProcessedSubTaskId?: string;
}> = fc
  .tuple(
    fc.integer({ min: 0, max: 20 }),
    fc.integer({ min: 1, max: 20 }),
    fc.option(
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
        minLength: 4,
        maxLength: 10,
      }),
      { nil: undefined }
    )
  )
  .map(([completed, total, lastId]) => ({
    completedSubTasks: Math.min(completed, total),
    totalSubTasks: total,
    lastProcessedSubTaskId: lastId,
  }));

// =============================================================================
// テストヘルパー関数
// =============================================================================

/**
 * テスト用の一時ディレクトリを作成
 *
 * @returns 一時ディレクトリのパス
 */
async function createTestTmpDir(): Promise<string> {
  const tmpBase = path.join(
    os.tmpdir(),
    `error-handler-enhanced-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  await fs.mkdir(tmpBase, { recursive: true });
  return tmpBase;
}

/**
 * ディレクトリを再帰的に削除（クリーンアップ用）
 *
 * @param dirPath - 削除対象ディレクトリ
 */
async function cleanupDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // クリーンアップ失敗は無視
  }
}

// =============================================================================
// Property 2: Graceful Degradation on AI Unavailability
// @see Requirements: 1.5, 6.3
// =============================================================================

describe('Feature: ai-execution-integration, Property 2: Graceful Degradation on AI Unavailability', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTestTmpDir();
  });

  afterEach(async () => {
    await cleanupDir(tmpDir);
  });

  /**
   * Property 2.1: AI利用不可時に一時停止状態が保存される
   *
   * 任意のrunId、タスクステータス、進捗情報に対して、
   * handleAIUnavailableが呼ばれると paused-state.json が作成される。
   *
   * @see Requirement 1.5: AI利用不可時のGraceful Degradation
   * @see Requirement 6.3: 一時停止と状態保存
   */
  it('Property 2.1: AI利用不可時にpaused-state.jsonが作成される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        taskStatusArb,
        progressArb,
        async (runId, taskStatus, progress) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          const pausedState = await handler.handleAIUnavailable(runId, {
            taskStatus,
            completedSubTasks: progress.completedSubTasks,
            totalSubTasks: progress.totalSubTasks,
            lastProcessedSubTaskId: progress.lastProcessedSubTaskId,
          });

          // paused-state.json が作成されている
          const statePath = path.join(tmpDir, runId, PAUSED_STATE_FILENAME);
          const fileContent = await fs.readFile(statePath, 'utf-8');
          const savedState = JSON.parse(fileContent);

          // 保存された状態が返却値と一致
          expect(savedState.runId).toBe(pausedState.runId);
          expect(savedState.pausedAt).toBe(pausedState.pausedAt);
          expect(savedState.taskStatus).toBe(pausedState.taskStatus);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.2: 一時停止状態にデータ損失がない
   *
   * 任意の入力に対して、返却されるPausedStateには
   * 全ての進捗情報が正確に保持されている。
   *
   * @see Requirement 1.5: データ損失なしの一時停止
   */
  it('Property 2.2: 一時停止状態に全ての進捗情報が保持される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        taskStatusArb,
        progressArb,
        async (runId, taskStatus, progress) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          const pausedState = await handler.handleAIUnavailable(runId, {
            taskStatus,
            completedSubTasks: progress.completedSubTasks,
            totalSubTasks: progress.totalSubTasks,
            lastProcessedSubTaskId: progress.lastProcessedSubTaskId,
          });

          // runIdが正しい
          expect(pausedState.runId).toBe(runId);

          // タスクステータスが保持されている
          expect(pausedState.taskStatus).toBe(taskStatus);

          // 進捗情報が正確に保持されている
          expect(pausedState.progress.completedSubTasks).toBe(
            progress.completedSubTasks
          );
          expect(pausedState.progress.totalSubTasks).toBe(
            progress.totalSubTasks
          );
          expect(pausedState.progress.lastProcessedSubTaskId).toBe(
            progress.lastProcessedSubTaskId
          );

          // 一時停止日時がISO8601形式
          expect(pausedState.pausedAt).toMatch(
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
          );

          // リカバリー手順が存在する
          expect(pausedState.recoveryInstructions).toBeTruthy();
          expect(pausedState.recoveryInstructions.length).toBeGreaterThan(0);

          // 理由が存在する
          expect(pausedState.reason).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.3: 一時停止時にエラーログにも記録される
   *
   * handleAIUnavailable呼び出し後、errors.logにもエントリが追加される。
   *
   * @see Requirement 6.3: エラーログへの記録
   */
  it('Property 2.3: 一時停止時にerrors.logにも記録される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        taskStatusArb,
        progressArb,
        async (runId, taskStatus, progress) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          await handler.handleAIUnavailable(runId, {
            taskStatus,
            completedSubTasks: progress.completedSubTasks,
            totalSubTasks: progress.totalSubTasks,
            lastProcessedSubTaskId: progress.lastProcessedSubTaskId,
          });

          // errors.log が作成されている
          const logPath = path.join(tmpDir, runId, ERROR_LOG_FILENAME);
          const logContent = await fs.readFile(logPath, 'utf-8');

          // AI unavailableのエラーが記録されている
          expect(logContent).toContain('AI service unavailable');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.4: 保存された状態がJSONとして正しくラウンドトリップする
   *
   * paused-state.jsonに保存された内容をパースすると、
   * 元のPausedStateと同じ構造が復元される。
   *
   * @see Requirement 6.3: 状態の永続化
   */
  it('Property 2.4: 保存された状態がJSONラウンドトリップで一致する', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        taskStatusArb,
        progressArb,
        async (runId, taskStatus, progress) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          const pausedState = await handler.handleAIUnavailable(runId, {
            taskStatus,
            completedSubTasks: progress.completedSubTasks,
            totalSubTasks: progress.totalSubTasks,
            lastProcessedSubTaskId: progress.lastProcessedSubTaskId,
          });

          // ファイルから読み込み
          const statePath = path.join(tmpDir, runId, PAUSED_STATE_FILENAME);
          const fileContent = await fs.readFile(statePath, 'utf-8');
          const restored = JSON.parse(fileContent);

          // 全フィールドが一致
          expect(restored).toEqual(pausedState);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 13: Error Logging and Failure Reporting
// @see Requirements: 6.1, 6.5
// =============================================================================

describe('Feature: ai-execution-integration, Property 13: Error Logging and Failure Reporting', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTestTmpDir();
  });

  afterEach(async () => {
    await cleanupDir(tmpDir);
  });

  /**
   * Property 13.1: エラーがerrors.logに記録される
   *
   * 任意のエラー情報に対して、logErrorを呼ぶとerrors.logに追記される。
   *
   * @see Requirement 6.1: エラーログの記録
   */
  it('Property 13.1: 任意のエラーがerrors.logに記録される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        errorInfoArb,
        async (runId, errorInfo) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          await handler.logError(runId, errorInfo);

          // errors.log が作成されている
          const logPath = path.join(tmpDir, runId, ERROR_LOG_FILENAME);
          const logContent = await fs.readFile(logPath, 'utf-8');

          // エラーメッセージが含まれている
          expect(logContent).toContain(errorInfo.message);

          // エラーコードが含まれている
          expect(logContent).toContain(errorInfo.code);

          // 復旧可能性が含まれている
          const expectedLabel = errorInfo.recoverable ? 'RECOVERABLE' : 'FATAL';
          expect(logContent).toContain(expectedLabel);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: 複数エラーが全てログに記録される
   *
   * 複数のエラーをlogErrorで記録した場合、全てのエラーがerrors.logに含まれる。
   *
   * @see Requirement 6.1: エラーログの完全性
   */
  it('Property 13.2: 複数エラーが全てerrors.logに記録される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        errorInfoArrayArb,
        async (runId, errors) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          // 全エラーを記録
          for (const error of errors) {
            await handler.logError(runId, error);
          }

          // errors.log の内容を確認
          const logPath = path.join(tmpDir, runId, ERROR_LOG_FILENAME);
          const logContent = await fs.readFile(logPath, 'utf-8');

          // 全エラーメッセージが含まれている
          for (const error of errors) {
            expect(logContent).toContain(error.message);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.3: エラー統計が正しく集計される
   *
   * 記録されたエラーに対して、getErrorStatisticsが正しい統計を返す。
   *
   * @see Requirement 6.1: エラー統計情報
   */
  it('Property 13.3: エラー統計が正しく集計される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        errorInfoArrayArb,
        async (runId, errors) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          // 全エラーを記録
          for (const error of errors) {
            await handler.logError(runId, error);
          }

          // 統計を取得
          const stats = await handler.getErrorStatistics(runId);

          // 総エラー数が一致
          expect(stats.totalErrors).toBe(errors.length);

          // runIdが一致
          expect(stats.runId).toBe(runId);

          // 復旧可能 + 復旧不可能 = 総エラー数
          expect(
            stats.recoverableErrors + stats.unrecoverableErrors
          ).toBe(stats.totalErrors);

          // 復旧可能エラー数が正しい
          const expectedRecoverable = errors.filter((e) => e.recoverable).length;
          expect(stats.recoverableErrors).toBe(expectedRecoverable);

          // 復旧不可能エラー数が正しい
          const expectedUnrecoverable = errors.filter((e) => !e.recoverable).length;
          expect(stats.unrecoverableErrors).toBe(expectedUnrecoverable);

          // エラーがある場合、最初と最後のエラー日時が存在
          if (errors.length > 0) {
            expect(stats.firstErrorAt).toBeDefined();
            expect(stats.lastErrorAt).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.4: 空のログに対する統計が初期値を返す
   *
   * エラーが記録されていない場合、統計は全てゼロ。
   *
   * @see Requirement 6.1: エラー統計の初期状態
   */
  it('Property 13.4: 空のログに対する統計が初期値を返す', async () => {
    await fc.assert(
      fc.asyncProperty(runIdArb, async (runId) => {
        const handler = createErrorHandler({
          runtimeBasePath: tmpDir,
        });

        const stats = await handler.getErrorStatistics(runId);

        expect(stats.runId).toBe(runId);
        expect(stats.totalErrors).toBe(0);
        expect(stats.recoverableErrors).toBe(0);
        expect(stats.unrecoverableErrors).toBe(0);
        expect(stats.firstErrorAt).toBeUndefined();
        expect(stats.lastErrorAt).toBeUndefined();
        expect(Object.keys(stats.byCategory).length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.5: 失敗レポートが生成される
   *
   * 任意のタスク説明とエラー一覧に対して、
   * generateFailureReportがfailure-report.mdを生成する。
   *
   * @see Requirement 6.5: 永続的失敗時のレポート生成
   */
  it('Property 13.5: 失敗レポートがMarkdownファイルとして生成される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        taskDescriptionArb,
        errorInfoArrayArb,
        async (runId, taskDescription, errors) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          await handler.generateFailureReport(runId, taskDescription, errors);

          // failure-report.md が作成されている
          const reportPath = path.join(tmpDir, runId, FAILURE_REPORT_FILENAME);
          const reportContent = await fs.readFile(reportPath, 'utf-8');

          // Markdownヘッダーが含まれている
          expect(reportContent).toContain('# 失敗レポート');

          // 実行IDが含まれている
          expect(reportContent).toContain(runId);

          // タスク説明が含まれている
          expect(reportContent).toContain(taskDescription);

          // エラー一覧セクションが含まれている
          expect(reportContent).toContain('## エラー一覧');

          // 推奨アクションセクションが含まれている
          expect(reportContent).toContain('## 推奨アクション');

          // リカバリー手順セクションが含まれている
          expect(reportContent).toContain('## リカバリー手順');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.6: 失敗レポートに全エラーが含まれる
   *
   * 渡された全てのエラーのメッセージがレポートに含まれる。
   *
   * @see Requirement 6.5: レポートの完全性
   */
  it('Property 13.6: 失敗レポートに全エラーのメッセージが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        taskDescriptionArb,
        errorInfoArrayArb,
        async (runId, taskDescription, errors) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          await handler.generateFailureReport(runId, taskDescription, errors);

          const reportPath = path.join(tmpDir, runId, FAILURE_REPORT_FILENAME);
          const reportContent = await fs.readFile(reportPath, 'utf-8');

          // 全エラーメッセージがレポートに含まれている
          for (const error of errors) {
            expect(reportContent).toContain(error.message);
          }

          // 全エラーコードがレポートに含まれている
          for (const error of errors) {
            expect(reportContent).toContain(error.code);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.7: エラーログと失敗レポートの整合性
   *
   * エラーをログに記録した後に失敗レポートを生成すると、
   * 両方のファイルが存在し、エラー情報が一貫している。
   *
   * @see Requirements: 6.1, 6.5
   */
  it('Property 13.7: エラーログと失敗レポートが共存し整合性がある', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        taskDescriptionArb,
        errorInfoArrayArb,
        async (runId, taskDescription, errors) => {
          const handler = createErrorHandler({
            runtimeBasePath: tmpDir,
          });

          // エラーをログに記録
          for (const error of errors) {
            await handler.logError(runId, error);
          }

          // 失敗レポートを生成
          await handler.generateFailureReport(runId, taskDescription, errors);

          // 両方のファイルが存在
          const logPath = path.join(tmpDir, runId, ERROR_LOG_FILENAME);
          const reportPath = path.join(tmpDir, runId, FAILURE_REPORT_FILENAME);

          const logStat = await fs.stat(logPath);
          const reportStat = await fs.stat(reportPath);

          expect(logStat.isFile()).toBe(true);
          expect(reportStat.isFile()).toBe(true);

          // 統計情報も正しい
          const stats = await handler.getErrorStatistics(runId);
          expect(stats.totalErrors).toBe(errors.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
