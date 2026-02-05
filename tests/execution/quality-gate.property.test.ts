/**
 * Quality Gate プロパティテスト
 *
 * Property 25: Quality Gate Execution Order
 * - 任意の完了タスクに対して、品質ゲートはlint → testの順序で実行される
 * - Lintが失敗した場合、テストはスキップされる
 * - Lintが成功した場合のみ、テストが実行される
 *
 * **Validates: Requirements 12.1, 12.2**
 *
 * @module tests/execution/quality-gate.property.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  QualityGate,
  createQualityGate,
  QualityGateConfig,
  QualityGateExecutionResult,
  GateResult,
} from '../../tools/cli/lib/execution/quality-gate';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_WORKSPACE = 'test-workspace-quality-gate-property';

/**
 * 実行ログのベースディレクトリ
 */
const RUNS_BASE_DIR = 'runtime/runs';

// =============================================================================
// モック設定
// =============================================================================

// Process Monitorのモック
vi.mock('../../tools/cli/lib/execution/process-monitor', () => ({
  createProcessMonitor: vi.fn(() => ({
    execute: vi.fn(),
    executeBackground: vi.fn(),
    terminateProcess: vi.fn(),
    getProcessStatus: vi.fn(),
    listBackgroundProcesses: vi.fn(),
  })),
  ProcessMonitor: vi.fn(),
}));

// fsモジュールの部分モック
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
  };
});

// =============================================================================
// 型定義
// =============================================================================

/**
 * 品質ゲート設定の生成パラメータ
 */
interface QualityGateConfigParams {
  /** Lintをスキップするか */
  skipLint: boolean;
  /** テストをスキップするか */
  skipTest: boolean;
  /** タイムアウト（ミリ秒） */
  timeout: number;
}

/**
 * コマンド実行結果のシミュレーションパラメータ
 */
interface CommandResultParams {
  /** Lint成功フラグ */
  lintPasses: boolean;
  /** テスト成功フラグ */
  testPasses: boolean;
  /** テストファイルが存在するか */
  testFilesExist: boolean;
}

/**
 * 実行順序を追跡するためのトラッカー
 */
interface ExecutionTracker {
  /** 実行されたコマンドの順序 */
  executionOrder: string[];
  /** Lintが実行されたか */
  lintExecuted: boolean;
  /** テストが実行されたか */
  testExecuted: boolean;
}

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 品質ゲート設定を生成するArbitrary
 */
const qualityGateConfigArb: fc.Arbitrary<QualityGateConfigParams> = fc.record({
  skipLint: fc.boolean(),
  skipTest: fc.boolean(),
  timeout: fc.integer({ min: 1000, max: 600000 }), // 1秒〜10分
});

/**
 * コマンド実行結果を生成するArbitrary
 */
const commandResultArb: fc.Arbitrary<CommandResultParams> = fc.record({
  lintPasses: fc.boolean(),
  testPasses: fc.boolean(),
  testFilesExist: fc.boolean(),
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
 * ワークスペースパスを生成するArbitrary
 */
const workspacePathArb: fc.Arbitrary<string> = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_'), {
    minLength: 3,
    maxLength: 20,
  })
  .map((name) => `/workspace/${name}`);

/**
 * カスタムコマンドを生成するArbitrary
 */
const customCommandArb: fc.Arbitrary<string> = fc.constantFrom(
  'make lint',
  'npm run lint',
  'yarn lint',
  'pnpm lint',
  'eslint .',
  'make test',
  'npm test',
  'yarn test',
  'pnpm test',
  'vitest run',
  'jest'
);

// =============================================================================
// テストヘルパー関数
// =============================================================================

/**
 * モックされたProcess Monitorの実行関数を設定
 *
 * @param mockExecute - モック関数
 * @param params - コマンド実行結果パラメータ
 * @param tracker - 実行順序トラッカー
 */
function setupMockExecute(
  mockExecute: ReturnType<typeof vi.fn>,
  params: CommandResultParams,
  tracker: ExecutionTracker
): void {
  mockExecute.mockImplementation(async (command: string) => {
    // コマンドの種類を判定して実行順序を記録
    if (command.includes('lint')) {
      tracker.executionOrder.push('lint');
      tracker.lintExecuted = true;
      return {
        exitCode: params.lintPasses ? 0 : 1,
        stdout: params.lintPasses ? 'Lint passed' : '',
        stderr: params.lintPasses ? '' : 'Lint error: unused variable',
        timedOut: false,
      };
    } else if (command.includes('test')) {
      tracker.executionOrder.push('test');
      tracker.testExecuted = true;
      return {
        exitCode: params.testPasses ? 0 : 1,
        stdout: params.testPasses ? 'All tests passed' : '',
        stderr: params.testPasses ? '' : 'Test failed: assertion error',
        timedOut: false,
      };
    }

    // 未知のコマンド
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
    };
  });
}

/**
 * 実行順序トラッカーを初期化
 *
 * @returns 初期化されたトラッカー
 */
function createExecutionTracker(): ExecutionTracker {
  return {
    executionOrder: [],
    lintExecuted: false,
    testExecuted: false,
  };
}

// =============================================================================
// Property 25: Quality Gate Execution Order テスト
// =============================================================================

describe('Property 25: Quality Gate Execution Order', () => {
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Process Monitorのモックを設定
    const { createProcessMonitor } = await import(
      '../../tools/cli/lib/execution/process-monitor'
    );
    mockExecute = vi.fn();
    (createProcessMonitor as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: mockExecute,
      executeBackground: vi.fn(),
      terminateProcess: vi.fn(),
      getProcessStatus: vi.fn(),
      listBackgroundProcesses: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 25.1: Lint → Test の実行順序
   * 任意の完了タスクに対して、品質ゲートはlint → testの順序で実行される
   *
   * **Validates: Requirements 12.1, 12.2**
   * - WHEN Worker_Agent completes, THE System SHALL run `make lint` in Worker_Container
   * - WHEN lint passes, THE System SHALL run `make test` if test files exist
   */
  it('Property 25.1: 品質ゲートはlint → testの順序で実行される', async () => {
    await fc.assert(
      fc.asyncProperty(runIdArb, async (runId) => {
        const tracker = createExecutionTracker();

        // テストファイルが存在するようにモック
        (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Lint成功、テスト成功のシナリオ
        setupMockExecute(mockExecute, {
          lintPasses: true,
          testPasses: true,
          testFilesExist: true,
        }, tracker);

        const qualityGate = createQualityGate({
          workspacePath: TEST_WORKSPACE,
        });

        await qualityGate.execute(runId);

        // 実行順序を検証
        // Lintが最初に実行されること
        expect(tracker.executionOrder[0]).toBe('lint');

        // テストが2番目に実行されること（Lint成功時）
        if (tracker.executionOrder.length > 1) {
          expect(tracker.executionOrder[1]).toBe('test');
        }

        // Lintは必ず実行されること
        expect(tracker.lintExecuted).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.2: Lint失敗時のテストスキップ
   * Lintが失敗した場合、テストはスキップされる
   *
   * **Validates: Requirements 12.1, 12.2**
   * - WHEN lint passes, THE System SHALL run `make test`
   * - （逆説的に）Lintが失敗した場合、テストは実行されない
   */
  it('Property 25.2: Lint失敗時はテストがスキップされる', async () => {
    await fc.assert(
      fc.asyncProperty(runIdArb, async (runId) => {
        const tracker = createExecutionTracker();

        // テストファイルが存在するようにモック
        (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Lint失敗のシナリオ
        setupMockExecute(mockExecute, {
          lintPasses: false,
          testPasses: true,
          testFilesExist: true,
        }, tracker);

        const qualityGate = createQualityGate({
          workspacePath: TEST_WORKSPACE,
        });

        const result = await qualityGate.execute(runId);

        // Lintは実行されること
        expect(tracker.lintExecuted).toBe(true);

        // テストは実行されないこと
        expect(tracker.testExecuted).toBe(false);

        // テスト結果がスキップされていること
        expect(result.test.executed).toBe(false);
        expect(result.test.skipReason).toBe('Lintが失敗したためスキップ');

        // 全体の結果が失敗であること
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.3: Lint成功時のテスト実行
   * Lintが成功した場合のみ、テストが実行される
   *
   * **Validates: Requirements 12.1, 12.2**
   * - WHEN lint passes, THE System SHALL run `make test` if test files exist
   */
  it('Property 25.3: Lint成功時はテストが実行される', async () => {
    await fc.assert(
      fc.asyncProperty(runIdArb, async (runId) => {
        const tracker = createExecutionTracker();

        // テストファイルが存在するようにモック
        (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        // Lint成功のシナリオ
        setupMockExecute(mockExecute, {
          lintPasses: true,
          testPasses: true,
          testFilesExist: true,
        }, tracker);

        const qualityGate = createQualityGate({
          workspacePath: TEST_WORKSPACE,
        });

        const result = await qualityGate.execute(runId);

        // Lintは実行されること
        expect(tracker.lintExecuted).toBe(true);

        // テストも実行されること
        expect(tracker.testExecuted).toBe(true);

        // テスト結果が実行済みであること
        expect(result.test.executed).toBe(true);

        // 全体の結果が成功であること
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.4: テストファイル不在時のスキップ
   * テストファイルが存在しない場合、テストはスキップされる（Lint成功時でも）
   *
   * **Validates: Requirements 12.2**
   * - THE System SHALL run `make test` if test files exist
   */
  it('Property 25.4: テストファイル不在時はテストがスキップされる', async () => {
    await fc.assert(
      fc.asyncProperty(runIdArb, async (runId) => {
        const tracker = createExecutionTracker();

        // テストファイルが存在しないようにモック
        (fs.access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

        // Lint成功のシナリオ
        setupMockExecute(mockExecute, {
          lintPasses: true,
          testPasses: true,
          testFilesExist: false,
        }, tracker);

        const qualityGate = createQualityGate({
          workspacePath: TEST_WORKSPACE,
        });

        const result = await qualityGate.execute(runId);

        // Lintは実行されること
        expect(tracker.lintExecuted).toBe(true);

        // テストは実行されないこと（ファイル不在のため）
        expect(tracker.testExecuted).toBe(false);

        // テスト結果がスキップされていること
        expect(result.test.executed).toBe(false);
        expect(result.test.skipReason).toBe('テストファイルが存在しません');

        // Lintが成功しているので全体は成功
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.5: 実行順序の一貫性
   * 同じ設定で複数回実行しても、実行順序は常にlint → testである
   *
   * **Validates: Requirements 12.1, 12.2**
   */
  it('Property 25.5: 実行順序は常に一貫している', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        fc.integer({ min: 2, max: 5 }),
        async (runId, iterations) => {
          const executionOrders: string[][] = [];

          // テストファイルが存在するようにモック
          (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          for (let i = 0; i < iterations; i++) {
            const tracker = createExecutionTracker();

            // Lint成功、テスト成功のシナリオ
            setupMockExecute(mockExecute, {
              lintPasses: true,
              testPasses: true,
              testFilesExist: true,
            }, tracker);

            const qualityGate = createQualityGate({
              workspacePath: TEST_WORKSPACE,
            });

            await qualityGate.execute(`${runId}-${i}`);
            executionOrders.push([...tracker.executionOrder]);
          }

          // すべての実行順序が同じであること
          for (let i = 1; i < executionOrders.length; i++) {
            expect(executionOrders[i]).toEqual(executionOrders[0]);
          }

          // 順序がlint → testであること
          expect(executionOrders[0][0]).toBe('lint');
          expect(executionOrders[0][1]).toBe('test');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 25.6: スキップ設定の尊重
   * skipLint/skipTest設定が正しく尊重される
   *
   * **Validates: Requirements 12.1, 12.2**
   */
  it('Property 25.6: スキップ設定が正しく尊重される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        qualityGateConfigArb,
        async (runId, config) => {
          const tracker = createExecutionTracker();

          // テストファイルが存在するようにモック
          (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          // Lint成功、テスト成功のシナリオ
          setupMockExecute(mockExecute, {
            lintPasses: true,
            testPasses: true,
            testFilesExist: true,
          }, tracker);

          const qualityGate = createQualityGate({
            workspacePath: TEST_WORKSPACE,
            skipLint: config.skipLint,
            skipTest: config.skipTest,
            timeout: config.timeout,
          });

          const result = await qualityGate.execute(runId);

          // skipLint設定の検証
          if (config.skipLint) {
            expect(result.lint.executed).toBe(false);
            expect(result.lint.skipReason).toBe('設定によりスキップ');
          }

          // skipTest設定の検証
          if (config.skipTest) {
            expect(result.test.executed).toBe(false);
            expect(result.test.skipReason).toBe('設定によりスキップ');
          }

          // 両方スキップの場合は成功
          if (config.skipLint && config.skipTest) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25.7: 結果の整合性
   * 品質ゲート結果の各フィールドは整合性を持つ
   *
   * **Validates: Requirements 12.1, 12.2**
   */
  it('Property 25.7: 結果の整合性が保たれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        commandResultArb,
        async (runId, params) => {
          const tracker = createExecutionTracker();

          // テストファイルの存在をパラメータに基づいて設定
          if (params.testFilesExist) {
            (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
          } else {
            (fs.access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));
          }

          setupMockExecute(mockExecute, params, tracker);

          const qualityGate = createQualityGate({
            workspacePath: TEST_WORKSPACE,
          });

          const result = await qualityGate.execute(runId);

          // 整合性チェック1: successはlint.passedとtest.passedの論理積
          const expectedSuccess = result.lint.passed && result.test.passed;
          expect(result.success).toBe(expectedSuccess);

          // 整合性チェック2: Lint失敗時はテストは実行されない
          if (result.lint.executed && !result.lint.passed) {
            expect(result.test.executed).toBe(false);
          }

          // 整合性チェック3: 実行時間は非負
          expect(result.durationMs).toBeGreaterThanOrEqual(0);
          expect(result.lint.durationMs).toBeGreaterThanOrEqual(0);
          expect(result.test.durationMs).toBeGreaterThanOrEqual(0);

          // 整合性チェック4: エラー情報の整合性
          if (!result.lint.passed && result.lint.executed) {
            expect(result.errors.some(e => e.code === 'LINT_FAILED')).toBe(true);
          }
          if (!result.test.passed && result.test.executed) {
            expect(result.errors.some(e => e.code === 'TEST_FAILED')).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// 追加のプロパティテスト（エッジケース）
// =============================================================================

describe('Quality Gate Edge Cases (Property-Based)', () => {
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { createProcessMonitor } = await import(
      '../../tools/cli/lib/execution/process-monitor'
    );
    mockExecute = vi.fn();
    (createProcessMonitor as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: mockExecute,
      executeBackground: vi.fn(),
      terminateProcess: vi.fn(),
      getProcessStatus: vi.fn(),
      listBackgroundProcesses: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * カスタムコマンドでも実行順序が保たれる
   *
   * **Validates: Requirements 12.1, 12.2**
   *
   * 注意: lintコマンドとtestコマンドが異なる場合のみテスト
   * （同じコマンドの場合は区別できないため）
   */
  it('カスタムコマンドでも実行順序が保たれる', async () => {
    // lintコマンドとtestコマンドのペア（異なるコマンドのみ）
    const lintCommands = ['make lint', 'npm run lint', 'yarn lint', 'eslint .'];
    const testCommands = ['make test', 'npm test', 'yarn test', 'vitest run', 'jest'];

    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        fc.constantFrom(...lintCommands),
        fc.constantFrom(...testCommands),
        async (runId, lintCmd, testCmd) => {
          const tracker = createExecutionTracker();

          // テストファイルが存在するようにモック
          (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          // カスタムコマンドに対応したモック
          mockExecute.mockImplementation(async (command: string) => {
            if (command === lintCmd) {
              tracker.executionOrder.push('lint');
              tracker.lintExecuted = true;
              return { exitCode: 0, stdout: 'OK', stderr: '', timedOut: false };
            } else if (command === testCmd) {
              tracker.executionOrder.push('test');
              tracker.testExecuted = true;
              return { exitCode: 0, stdout: 'OK', stderr: '', timedOut: false };
            }
            return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
          });

          const qualityGate = createQualityGate({
            workspacePath: TEST_WORKSPACE,
            lintCommand: lintCmd,
            testCommand: testCmd,
          });

          await qualityGate.execute(runId);

          // 実行順序がlint → testであること
          if (tracker.executionOrder.length >= 2) {
            expect(tracker.executionOrder[0]).toBe('lint');
            expect(tracker.executionOrder[1]).toBe('test');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * 任意のワークスペースパスで動作する
   *
   * **Validates: Requirements 12.1, 12.2**
   */
  it('任意のワークスペースパスで動作する', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        workspacePathArb,
        async (runId, workspacePath) => {
          const tracker = createExecutionTracker();

          // テストファイルが存在するようにモック
          (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

          setupMockExecute(mockExecute, {
            lintPasses: true,
            testPasses: true,
            testFilesExist: true,
          }, tracker);

          const qualityGate = createQualityGate({
            workspacePath,
          });

          const result = await qualityGate.execute(runId);

          // 正常に実行されること
          expect(result).toBeDefined();
          expect(result.lint).toBeDefined();
          expect(result.test).toBeDefined();

          // 実行順序が正しいこと
          expect(tracker.executionOrder[0]).toBe('lint');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 結果変換の冪等性
   * toQualityGateResultは同じ入力に対して常に同じ出力を返す
   *
   * **Validates: Requirements 12.1, 12.2**
   */
  it('結果変換は冪等である', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.string(),
        fc.string(),
        (lintPassed, testPassed, testExecuted, lintOutput, testOutput) => {
          const executionResult: QualityGateExecutionResult = {
            success: lintPassed && (testExecuted ? testPassed : true),
            lint: {
              executed: true,
              passed: lintPassed,
              output: lintOutput,
              durationMs: 1000,
            },
            test: {
              executed: testExecuted,
              passed: testPassed,
              output: testOutput,
              durationMs: 2000,
            },
            durationMs: 3000,
            errors: [],
          };

          // 複数回変換
          const result1 = QualityGate.toQualityGateResult(executionResult);
          const result2 = QualityGate.toQualityGateResult(executionResult);
          const result3 = QualityGate.toQualityGateResult(executionResult);

          // すべて同じ結果であること
          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);

          // 構造が正しいこと
          expect(result1).toHaveProperty('lint');
          expect(result1).toHaveProperty('test');
          expect(result1).toHaveProperty('overall');
        }
      ),
      { numRuns: 100 }
    );
  });
});
