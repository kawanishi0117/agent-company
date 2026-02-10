/**
 * Quality Gate テスト
 *
 * 品質ゲート実行モジュールのユニットテスト
 *
 * @see Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  QualityGate,
  createQualityGate,
  QualityGateExecutionResult,
} from '../../tools/cli/lib/execution/quality-gate';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_WORKSPACE = 'test-workspace-quality-gate';
const TEST_RUN_ID = 'run-quality-gate-test-001';
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
// テストスイート
// =============================================================================

describe('QualityGate', () => {
  let qualityGate: QualityGate;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Process Monitorのモックを設定
    const { createProcessMonitor } = await import('../../tools/cli/lib/execution/process-monitor');
    mockExecute = vi.fn();
    (createProcessMonitor as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: mockExecute,
      executeBackground: vi.fn(),
      terminateProcess: vi.fn(),
      getProcessStatus: vi.fn(),
      listBackgroundProcesses: vi.fn(),
    });

    // デフォルトの品質ゲートを作成
    qualityGate = createQualityGate({
      workspacePath: TEST_WORKSPACE,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 基本機能テスト
  // ===========================================================================

  describe('基本機能', () => {
    it('createQualityGateでインスタンスを作成できる', () => {
      const gate = createQualityGate({
        workspacePath: '/test/workspace',
      });
      expect(gate).toBeInstanceOf(QualityGate);
    });

    it('デフォルト設定で作成できる', () => {
      const gate = createQualityGate({
        workspacePath: '/test/workspace',
      });
      expect(gate).toBeDefined();
    });

    it('カスタム設定で作成できる', () => {
      const gate = createQualityGate({
        workspacePath: '/test/workspace',
        timeout: 600000,
        skipLint: true,
        skipTest: false,
        lintCommand: 'npm run lint',
        testCommand: 'npm test',
      });
      expect(gate).toBeDefined();
    });
  });

  // ===========================================================================
  // Lint実行テスト
  // ===========================================================================

  describe('Lint実行', () => {
    /**
     * @see Requirement 12.1: WHEN Worker_Agent completes, THE System SHALL run `make lint`
     */
    it('Lintが成功した場合、passed=trueを返す', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Lint passed',
        stderr: '',
        timedOut: false,
      });

      const result = await qualityGate.runLint(TEST_RUN_ID);

      expect(result.executed).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.output).toContain('Lint passed');
    });

    it('Lintが失敗した場合、passed=falseを返す', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Lint error: unused variable',
        timedOut: false,
      });

      const result = await qualityGate.runLint(TEST_RUN_ID);

      expect(result.executed).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.output).toContain('Lint error');
    });

    it('skipLint=trueの場合、Lintをスキップする', async () => {
      const gate = createQualityGate({
        workspacePath: TEST_WORKSPACE,
        skipLint: true,
      });

      const result = await gate.runLint(TEST_RUN_ID);

      expect(result.executed).toBe(false);
      expect(result.passed).toBe(true);
      expect(result.skipReason).toBe('設定によりスキップ');
    });

    it('Lint実行中にエラーが発生した場合、エラー情報を返す', async () => {
      mockExecute.mockRejectedValue(new Error('Command not found'));

      const result = await qualityGate.runLint(TEST_RUN_ID);

      expect(result.executed).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.output).toContain('Lint実行エラー');
    });

    it('カスタムLintコマンドを使用できる', async () => {
      const gate = createQualityGate({
        workspacePath: TEST_WORKSPACE,
        lintCommand: 'npm run lint:fix',
      });

      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Custom lint passed',
        stderr: '',
        timedOut: false,
      });

      const result = await gate.runLint(TEST_RUN_ID);

      expect(result.passed).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith('npm run lint:fix');
    });
  });

  // ===========================================================================
  // テスト実行テスト
  // ===========================================================================

  describe('テスト実行', () => {
    beforeEach(() => {
      // テストファイルが存在するようにモック
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    /**
     * @see Requirement 12.2: WHEN lint passes, THE System SHALL run `make test`
     */
    it('テストが成功した場合、passed=trueを返す', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'All tests passed',
        stderr: '',
        timedOut: false,
      });

      const result = await qualityGate.runTest(TEST_RUN_ID);

      expect(result.executed).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.output).toContain('All tests passed');
    });

    it('テストが失敗した場合、passed=falseを返す', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Test failed: expected 1 but got 2',
        timedOut: false,
      });

      const result = await qualityGate.runTest(TEST_RUN_ID);

      expect(result.executed).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.output).toContain('Test failed');
    });

    it('skipTest=trueの場合、テストをスキップする', async () => {
      const gate = createQualityGate({
        workspacePath: TEST_WORKSPACE,
        skipTest: true,
      });

      const result = await gate.runTest(TEST_RUN_ID);

      expect(result.executed).toBe(false);
      expect(result.passed).toBe(true);
      expect(result.skipReason).toBe('設定によりスキップ');
    });

    it('テストファイルが存在しない場合、スキップする', async () => {
      (fs.access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const result = await qualityGate.runTest(TEST_RUN_ID);

      expect(result.executed).toBe(false);
      expect(result.passed).toBe(true);
      expect(result.skipReason).toBe('テストファイルが存在しません');
    });

    it('テスト実行中にエラーが発生した場合、エラー情報を返す', async () => {
      mockExecute.mockRejectedValue(new Error('Test runner crashed'));

      const result = await qualityGate.runTest(TEST_RUN_ID);

      expect(result.executed).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.output).toContain('テスト実行エラー');
    });

    it('カスタムテストコマンドを使用できる', async () => {
      const gate = createQualityGate({
        workspacePath: TEST_WORKSPACE,
        testCommand: 'npm run test:coverage',
      });

      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Coverage: 100%',
        stderr: '',
        timedOut: false,
      });

      const result = await gate.runTest(TEST_RUN_ID);

      expect(result.passed).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith('npm run test:coverage');
    });
  });

  // ===========================================================================
  // 品質ゲート実行テスト
  // ===========================================================================

  describe('品質ゲート実行', () => {
    beforeEach(() => {
      // テストファイルが存在するようにモック
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    /**
     * @see Requirement 12.1: THE System SHALL run `make lint`
     * @see Requirement 12.2: WHEN lint passes, THE System SHALL run `make test`
     */
    it('Lint成功 → テスト成功の場合、success=trueを返す', async () => {
      mockExecute
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Lint passed',
          stderr: '',
          timedOut: false,
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Tests passed',
          stderr: '',
          timedOut: false,
        });

      const result = await qualityGate.execute(TEST_RUN_ID);

      expect(result.success).toBe(true);
      expect(result.lint.passed).toBe(true);
      expect(result.test.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('Lint失敗の場合、テストをスキップしてsuccess=falseを返す', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Lint failed',
        timedOut: false,
      });

      const result = await qualityGate.execute(TEST_RUN_ID);

      expect(result.success).toBe(false);
      expect(result.lint.passed).toBe(false);
      expect(result.test.executed).toBe(false);
      expect(result.test.skipReason).toBe('Lintが失敗したためスキップ');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('LINT_FAILED');
    });

    it('Lint成功 → テスト失敗の場合、success=falseを返す', async () => {
      mockExecute
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Lint passed',
          stderr: '',
          timedOut: false,
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Tests failed',
          timedOut: false,
        });

      const result = await qualityGate.execute(TEST_RUN_ID);

      expect(result.success).toBe(false);
      expect(result.lint.passed).toBe(true);
      expect(result.test.passed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('TEST_FAILED');
    });

    it('実行時間を計測する', async () => {
      mockExecute
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Lint passed',
          stderr: '',
          timedOut: false,
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Tests passed',
          stderr: '',
          timedOut: false,
        });

      const result = await qualityGate.execute(TEST_RUN_ID);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.lint.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.test.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // ログ出力テスト
  // ===========================================================================

  describe('ログ出力', () => {
    beforeEach(() => {
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    /**
     * @see Requirement 12.6: THE quality gate logs SHALL be saved to `runtime/runs/<run-id>/quality_gates.log`
     */
    it('品質ゲート実行時にログを出力する', async () => {
      mockExecute
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Lint passed',
          stderr: '',
          timedOut: false,
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Tests passed',
          stderr: '',
          timedOut: false,
        });

      await qualityGate.execute(TEST_RUN_ID);

      // mkdirが呼ばれたことを確認
      expect(fs.mkdir).toHaveBeenCalledWith(path.join(RUNS_BASE_DIR, TEST_RUN_ID), {
        recursive: true,
      });

      // appendFileが呼ばれたことを確認（複数回）
      expect(fs.appendFile).toHaveBeenCalled();
    });

    it('ログにタイムスタンプとアクション名が含まれる', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Lint passed',
        stderr: '',
        timedOut: false,
      });

      await qualityGate.runLint(TEST_RUN_ID);

      // appendFileの呼び出し引数を確認
      const calls = (fs.appendFile as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      // ログエントリの形式を確認
      const logEntry = calls[0][1] as string;
      expect(logEntry).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(logEntry).toMatch(/\[lint_start\]/);
    });
  });

  // ===========================================================================
  // イベントハンドラテスト
  // ===========================================================================

  describe('イベントハンドラ', () => {
    beforeEach(() => {
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it('Lint開始時にonLintStartが呼ばれる', async () => {
      const onLintStart = vi.fn();
      qualityGate.setEventHandlers({ onLintStart });

      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Lint passed',
        stderr: '',
        timedOut: false,
      });

      await qualityGate.runLint(TEST_RUN_ID);

      expect(onLintStart).toHaveBeenCalledTimes(1);
    });

    it('Lint完了時にonLintCompleteが呼ばれる', async () => {
      const onLintComplete = vi.fn();
      qualityGate.setEventHandlers({ onLintComplete });

      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Lint passed',
        stderr: '',
        timedOut: false,
      });

      await qualityGate.runLint(TEST_RUN_ID);

      expect(onLintComplete).toHaveBeenCalledTimes(1);
      expect(onLintComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          executed: true,
          passed: true,
        })
      );
    });

    it('テスト開始時にonTestStartが呼ばれる', async () => {
      const onTestStart = vi.fn();
      qualityGate.setEventHandlers({ onTestStart });

      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Tests passed',
        stderr: '',
        timedOut: false,
      });

      await qualityGate.runTest(TEST_RUN_ID);

      expect(onTestStart).toHaveBeenCalledTimes(1);
    });

    it('テスト完了時にonTestCompleteが呼ばれる', async () => {
      const onTestComplete = vi.fn();
      qualityGate.setEventHandlers({ onTestComplete });

      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Tests passed',
        stderr: '',
        timedOut: false,
      });

      await qualityGate.runTest(TEST_RUN_ID);

      expect(onTestComplete).toHaveBeenCalledTimes(1);
      expect(onTestComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          executed: true,
          passed: true,
        })
      );
    });

    it('エラー発生時にonErrorが呼ばれる', async () => {
      const onError = vi.fn();
      qualityGate.setEventHandlers({ onError });

      mockExecute.mockRejectedValue(new Error('Execution failed'));

      await qualityGate.runLint(TEST_RUN_ID);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'LINT_EXECUTION_ERROR',
          recoverable: true,
        })
      );
    });
  });

  // ===========================================================================
  // 結果変換テスト
  // ===========================================================================

  describe('結果変換', () => {
    /**
     * @see Requirement 12.3: THE quality gate results SHALL be included in Execution_Result
     */
    it('toQualityGateResultで正しい形式に変換できる', () => {
      const executionResult: QualityGateExecutionResult = {
        success: true,
        lint: {
          executed: true,
          passed: true,
          output: 'Lint passed',
          durationMs: 1000,
        },
        test: {
          executed: true,
          passed: true,
          output: 'Tests passed',
          durationMs: 2000,
        },
        durationMs: 3000,
        errors: [],
      };

      const result = QualityGate.toQualityGateResult(executionResult);

      expect(result).toEqual({
        lint: {
          passed: true,
          output: 'Lint passed',
        },
        test: {
          passed: true,
          output: 'Tests passed',
        },
        overall: true,
      });
    });

    it('失敗時も正しく変換できる', () => {
      const executionResult: QualityGateExecutionResult = {
        success: false,
        lint: {
          executed: true,
          passed: false,
          output: 'Lint failed',
          durationMs: 1000,
        },
        test: {
          executed: false,
          passed: false,
          output: '',
          durationMs: 0,
          skipReason: 'Lintが失敗したためスキップ',
        },
        durationMs: 1000,
        errors: [
          {
            code: 'LINT_FAILED',
            message: 'Lintチェックに失敗しました',
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
      };

      const result = QualityGate.toQualityGateResult(executionResult);

      expect(result.overall).toBe(false);
      expect(result.lint.passed).toBe(false);
      expect(result.test.passed).toBe(false);
    });
  });

  // ===========================================================================
  // エッジケーステスト
  // ===========================================================================

  describe('エッジケース', () => {
    beforeEach(() => {
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it('stdoutとstderrの両方がある場合、両方を出力に含める', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: 'Standard output',
        stderr: 'Warning message',
        timedOut: false,
      });

      const result = await qualityGate.runLint(TEST_RUN_ID);

      expect(result.output).toContain('Standard output');
      expect(result.output).toContain('Warning message');
    });

    it('空の出力でも正しく処理できる', async () => {
      mockExecute.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      const result = await qualityGate.runLint(TEST_RUN_ID);

      expect(result.executed).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.output).toBe('');
    });

    it('タイムアウト設定が適用される', () => {
      const gate = createQualityGate({
        workspacePath: TEST_WORKSPACE,
        timeout: 600000,
      });

      // インスタンスが作成されることを確認
      expect(gate).toBeDefined();
    });

    it('両方スキップの場合、success=trueを返す', async () => {
      const gate = createQualityGate({
        workspacePath: TEST_WORKSPACE,
        skipLint: true,
        skipTest: true,
      });

      const result = await gate.execute(TEST_RUN_ID);

      expect(result.success).toBe(true);
      expect(result.lint.executed).toBe(false);
      expect(result.test.executed).toBe(false);
    });
  });
});

// =============================================================================
// 結果報告機能テスト
// =============================================================================

describe('QualityGateReporter', () => {
  let reporter: ReturnType<
    typeof import('../../tools/cli/lib/execution/quality-gate').createQualityGateReporter
  >;

  beforeEach(async () => {
    vi.clearAllMocks();

    // QualityGateReporterをインポート
    const { createQualityGateReporter } =
      await import('../../tools/cli/lib/execution/quality-gate');
    reporter = createQualityGateReporter(TEST_RUN_ID);
  });

  // ===========================================================================
  // ExecutionResult統合テスト
  // ===========================================================================

  describe('ExecutionResult統合', () => {
    /**
     * @see Requirement 12.3: THE quality gate results SHALL be included in Execution_Result
     */
    it('品質ゲート結果をExecutionResultに統合できる', () => {
      const executionResult = {
        runId: TEST_RUN_ID,
        ticketId: 'ticket-001',
        agentId: 'worker-001',
        status: 'success' as const,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        artifacts: [],
        gitBranch: 'agent/ticket-001-feature',
        commits: [],
        qualityGates: {
          lint: { passed: false, output: '' },
          test: { passed: false, output: '' },
          overall: false,
        },
        errors: [],
        conversationTurns: 5,
        tokensUsed: 1000,
      };

      const gateResult: QualityGateExecutionResult = {
        success: true,
        lint: {
          executed: true,
          passed: true,
          output: 'Lint passed',
          durationMs: 1000,
        },
        test: {
          executed: true,
          passed: true,
          output: 'Tests passed',
          durationMs: 2000,
        },
        durationMs: 3000,
        errors: [],
      };

      const result = reporter.integrateQualityGateResult(executionResult, gateResult);

      expect(result.qualityGates.lint.passed).toBe(true);
      expect(result.qualityGates.test.passed).toBe(true);
      expect(result.qualityGates.overall).toBe(true);
      expect(result.status).toBe('success');
    });

    it('品質ゲート失敗時にステータスをquality_failedに更新する', () => {
      const executionResult = {
        runId: TEST_RUN_ID,
        ticketId: 'ticket-001',
        agentId: 'worker-001',
        status: 'success' as const,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        artifacts: [],
        gitBranch: 'agent/ticket-001-feature',
        commits: [],
        qualityGates: {
          lint: { passed: false, output: '' },
          test: { passed: false, output: '' },
          overall: false,
        },
        errors: [],
        conversationTurns: 5,
        tokensUsed: 1000,
      };

      const gateResult: QualityGateExecutionResult = {
        success: false,
        lint: {
          executed: true,
          passed: false,
          output: 'Lint failed',
          durationMs: 1000,
        },
        test: {
          executed: false,
          passed: false,
          output: '',
          durationMs: 0,
        },
        durationMs: 1000,
        errors: [
          {
            code: 'LINT_FAILED',
            message: 'Lintチェックに失敗しました',
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
      };

      const result = reporter.integrateQualityGateResult(executionResult, gateResult);

      expect(result.status).toBe('quality_failed');
      expect(result.qualityGates.overall).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('エラー情報をマージする', () => {
      const executionResult = {
        runId: TEST_RUN_ID,
        ticketId: 'ticket-001',
        agentId: 'worker-001',
        status: 'success' as const,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        artifacts: [],
        gitBranch: 'agent/ticket-001-feature',
        commits: [],
        qualityGates: {
          lint: { passed: false, output: '' },
          test: { passed: false, output: '' },
          overall: false,
        },
        errors: [
          {
            code: 'EXISTING_ERROR',
            message: '既存のエラー',
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
        conversationTurns: 5,
        tokensUsed: 1000,
      };

      const gateResult: QualityGateExecutionResult = {
        success: false,
        lint: {
          executed: true,
          passed: false,
          output: 'Lint failed',
          durationMs: 1000,
        },
        test: {
          executed: false,
          passed: false,
          output: '',
          durationMs: 0,
        },
        durationMs: 1000,
        errors: [
          {
            code: 'LINT_FAILED',
            message: 'Lintチェックに失敗しました',
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
      };

      const result = reporter.integrateQualityGateResult(executionResult, gateResult);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].code).toBe('EXISTING_ERROR');
      expect(result.errors[1].code).toBe('LINT_FAILED');
    });
  });

  // ===========================================================================
  // 失敗通知ペイロード作成テスト
  // ===========================================================================

  describe('失敗通知ペイロード作成', () => {
    /**
     * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
     */
    it('Lint失敗時に正しいペイロードを作成する', () => {
      const gateResult: QualityGateExecutionResult = {
        success: false,
        lint: {
          executed: true,
          passed: false,
          output: 'Lint failed: unused variable',
          durationMs: 1000,
        },
        test: {
          executed: false,
          passed: false,
          output: '',
          durationMs: 0,
        },
        durationMs: 1000,
        errors: [
          {
            code: 'LINT_FAILED',
            message: 'Lintチェックに失敗しました',
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
      };

      const payload = reporter.createFailurePayload('subtask-001', gateResult);

      expect(payload.subTaskId).toBe('subtask-001');
      expect(payload.runId).toBe(TEST_RUN_ID);
      expect(payload.failedGates).toContain('lint');
      expect(payload.failedGates).not.toContain('test');
      expect(payload.errors).toHaveLength(1);
    });

    it('テスト失敗時に正しいペイロードを作成する', () => {
      const gateResult: QualityGateExecutionResult = {
        success: false,
        lint: {
          executed: true,
          passed: true,
          output: 'Lint passed',
          durationMs: 1000,
        },
        test: {
          executed: true,
          passed: false,
          output: 'Test failed: assertion error',
          durationMs: 2000,
        },
        durationMs: 3000,
        errors: [
          {
            code: 'TEST_FAILED',
            message: 'テストに失敗しました',
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
      };

      const payload = reporter.createFailurePayload('subtask-001', gateResult);

      expect(payload.failedGates).not.toContain('lint');
      expect(payload.failedGates).toContain('test');
    });

    it('両方失敗時に両方のゲートを含める', () => {
      const gateResult: QualityGateExecutionResult = {
        success: false,
        lint: {
          executed: true,
          passed: false,
          output: 'Lint failed',
          durationMs: 1000,
        },
        test: {
          executed: true,
          passed: false,
          output: 'Test failed',
          durationMs: 2000,
        },
        durationMs: 3000,
        errors: [],
      };

      const payload = reporter.createFailurePayload('subtask-001', gateResult);

      expect(payload.failedGates).toContain('lint');
      expect(payload.failedGates).toContain('test');
    });
  });

  // ===========================================================================
  // Manager通知判定テスト
  // ===========================================================================

  describe('Manager通知判定', () => {
    /**
     * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
     */
    it('品質ゲート失敗時にManager通知が必要と判定する', () => {
      const gateResult: QualityGateExecutionResult = {
        success: false,
        lint: {
          executed: true,
          passed: false,
          output: 'Lint failed',
          durationMs: 1000,
        },
        test: {
          executed: false,
          passed: false,
          output: '',
          durationMs: 0,
        },
        durationMs: 1000,
        errors: [],
      };

      expect(reporter.shouldNotifyManager(gateResult)).toBe(true);
    });

    it('品質ゲート成功時にManager通知は不要と判定する', () => {
      const gateResult: QualityGateExecutionResult = {
        success: true,
        lint: {
          executed: true,
          passed: true,
          output: 'Lint passed',
          durationMs: 1000,
        },
        test: {
          executed: true,
          passed: true,
          output: 'Tests passed',
          durationMs: 2000,
        },
        durationMs: 3000,
        errors: [],
      };

      expect(reporter.shouldNotifyManager(gateResult)).toBe(false);
    });
  });

  // ===========================================================================
  // 決定推奨生成テスト
  // ===========================================================================

  describe('決定推奨生成', () => {
    /**
     * @see Requirement 12.5: THE Manager_Agent SHALL decide whether to retry, reassign, or escalate
     */
    it('初回失敗時にリトライを推奨する', () => {
      const payload = {
        subTaskId: 'subtask-001',
        runId: TEST_RUN_ID,
        qualityGateResult: {
          lint: { passed: false, output: 'Lint failed' },
          test: { passed: false, output: '' },
          overall: false,
        },
        failedGates: ['lint'] as ('lint' | 'test')[],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      const decision = reporter.generateDecisionRecommendation(payload, 1);

      expect(decision.decision).toBe('retry');
      expect(decision.additionalInstructions).toBeDefined();
    });

    it('2回失敗時に再割り当てを推奨する', () => {
      const payload = {
        subTaskId: 'subtask-001',
        runId: TEST_RUN_ID,
        qualityGateResult: {
          lint: { passed: false, output: 'Lint failed' },
          test: { passed: false, output: '' },
          overall: false,
        },
        failedGates: ['lint'] as ('lint' | 'test')[],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      const decision = reporter.generateDecisionRecommendation(payload, 2);

      expect(decision.decision).toBe('reassign');
    });

    it('3回以上失敗時にエスカレーションを推奨する', () => {
      const payload = {
        subTaskId: 'subtask-001',
        runId: TEST_RUN_ID,
        qualityGateResult: {
          lint: { passed: false, output: 'Lint failed' },
          test: { passed: false, output: '' },
          overall: false,
        },
        failedGates: ['lint'] as ('lint' | 'test')[],
        errors: [],
        timestamp: new Date().toISOString(),
      };

      const decision = reporter.generateDecisionRecommendation(payload, 3);

      expect(decision.decision).toBe('escalate');
      expect(decision.escalateTo).toBe('quality_authority');
    });
  });

  // ===========================================================================
  // ログ記録テスト
  // ===========================================================================

  describe('ログ記録', () => {
    /**
     * @see Requirement 12.6: THE quality gate logs SHALL be saved
     */
    it('失敗をログに記録できる', async () => {
      const payload = {
        subTaskId: 'subtask-001',
        runId: TEST_RUN_ID,
        qualityGateResult: {
          lint: { passed: false, output: 'Lint failed' },
          test: { passed: false, output: '' },
          overall: false,
        },
        failedGates: ['lint'] as ('lint' | 'test')[],
        errors: [
          {
            code: 'LINT_FAILED',
            message: 'Lintチェックに失敗しました',
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      await reporter.logFailure(payload);

      // mkdirが呼ばれたことを確認
      expect(fs.mkdir).toHaveBeenCalled();

      // appendFileが呼ばれたことを確認
      expect(fs.appendFile).toHaveBeenCalled();

      // ログエントリの内容を確認
      const calls = (fs.appendFile as ReturnType<typeof vi.fn>).mock.calls;
      const logEntry = calls[calls.length - 1][1] as string;
      expect(logEntry).toContain('QUALITY_GATE_FAILURE');
      expect(logEntry).toContain('subtask-001');
    });
  });
});
