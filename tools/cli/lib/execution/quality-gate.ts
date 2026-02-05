/**
 * Quality Gate - 品質ゲート実行モジュール
 *
 * ワーカーの成果物に対して自動的に品質ゲート（lint/test）を実行する。
 * 結果はExecutionResultに含まれ、失敗時はManager Agentに通知される。
 *
 * @module execution/quality-gate
 * @see Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { RunId, QualityGateResult, ErrorInfo } from './types';
import { ProcessMonitor, createProcessMonitor } from './process-monitor';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 実行ログのベースディレクトリ
 */
const RUNS_BASE_DIR = 'runtime/runs';

/**
 * 品質ゲートログファイル名
 */
const QUALITY_GATE_LOG_FILE = 'quality_gates.log';

/**
 * デフォルトのタイムアウト（ミリ秒）
 */
const DEFAULT_TIMEOUT = 300000; // 5分

/**
 * Lintコマンド
 */
const LINT_COMMAND = 'make lint';

/**
 * テストコマンド
 */
const TEST_COMMAND = 'make test';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 品質ゲート設定
 */
export interface QualityGateConfig {
  /** ワークスペースパス */
  workspacePath: string;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** Lintをスキップするか */
  skipLint?: boolean;
  /** テストをスキップするか */
  skipTest?: boolean;
  /** カスタムLintコマンド */
  lintCommand?: string;
  /** カスタムテストコマンド */
  testCommand?: string;
}

/**
 * 品質ゲート実行結果
 */
export interface QualityGateExecutionResult {
  /** 全体の成功フラグ */
  success: boolean;
  /** Lint結果 */
  lint: GateResult;
  /** テスト結果 */
  test: GateResult;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** エラー情報（失敗時） */
  errors: ErrorInfo[];
}

/**
 * 個別ゲート結果
 */
export interface GateResult {
  /** 実行されたか */
  executed: boolean;
  /** 成功フラグ */
  passed: boolean;
  /** 出力 */
  output: string;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** スキップされた理由（スキップ時） */
  skipReason?: string;
}

/**
 * 品質ゲートイベントハンドラ
 */
export interface QualityGateEventHandlers {
  /** Lint開始時 */
  onLintStart?: () => void;
  /** Lint完了時 */
  onLintComplete?: (result: GateResult) => void;
  /** テスト開始時 */
  onTestStart?: () => void;
  /** テスト完了時 */
  onTestComplete?: (result: GateResult) => void;
  /** エラー発生時 */
  onError?: (error: ErrorInfo) => void;
}

// =============================================================================
// QualityGate クラス
// =============================================================================

/**
 * QualityGate - 品質ゲート実行クラス
 *
 * ワーカーの成果物に対して自動的に品質ゲートを実行する。
 *
 * @see Requirement 12.1: WHEN Worker_Agent completes, THE System SHALL run `make lint`
 * @see Requirement 12.2: WHEN lint passes, THE System SHALL run `make test`
 */
export class QualityGate {
  /** 設定 */
  private config: Required<QualityGateConfig>;

  /** Process Monitor */
  private processMonitor: ProcessMonitor;

  /** 現在の実行ID（将来の拡張用） */
  private _currentRunId?: RunId;

  /** イベントハンドラ */
  private eventHandlers: QualityGateEventHandlers = {};

  /**
   * コンストラクタ
   * @param config - 品質ゲート設定
   */
  constructor(config: QualityGateConfig) {
    this.config = {
      workspacePath: config.workspacePath,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      skipLint: config.skipLint ?? false,
      skipTest: config.skipTest ?? false,
      lintCommand: config.lintCommand ?? LINT_COMMAND,
      testCommand: config.testCommand ?? TEST_COMMAND,
    };

    this.processMonitor = createProcessMonitor({
      workDir: this.config.workspacePath,
      timeout: this.config.timeout,
    });
  }

  // ===========================================================================
  // 品質ゲート実行
  // ===========================================================================

  /**
   * 品質ゲートを実行
   *
   * Lint → Test の順序で実行する。Lintが失敗した場合はTestはスキップされる。
   *
   * @param runId - 実行ID
   * @returns 品質ゲート実行結果
   *
   * @see Requirement 12.1: THE System SHALL run `make lint`
   * @see Requirement 12.2: WHEN lint passes, THE System SHALL run `make test`
   */
  async execute(runId: RunId): Promise<QualityGateExecutionResult> {
    this._currentRunId = runId;
    const startTime = Date.now();
    const errors: ErrorInfo[] = [];

    // ログ開始
    await this.logGateAction(runId, 'quality_gate_start', {
      workspacePath: this.config.workspacePath,
    });

    // Lint実行
    const lintResult = await this.runLint(runId);
    if (!lintResult.passed && lintResult.executed) {
      errors.push({
        code: 'LINT_FAILED',
        message: 'Lintチェックに失敗しました',
        timestamp: new Date().toISOString(),
        recoverable: true,
      });
    }

    // テスト実行（Lintが成功した場合のみ）
    let testResult: GateResult;
    if (lintResult.passed || !lintResult.executed) {
      testResult = await this.runTest(runId);
      if (!testResult.passed && testResult.executed) {
        errors.push({
          code: 'TEST_FAILED',
          message: 'テストに失敗しました',
          timestamp: new Date().toISOString(),
          recoverable: true,
        });
      }
    } else {
      testResult = {
        executed: false,
        passed: false,
        output: '',
        durationMs: 0,
        skipReason: 'Lintが失敗したためスキップ',
      };
    }

    const durationMs = Date.now() - startTime;
    const success = lintResult.passed && testResult.passed;

    // ログ完了
    await this.logGateAction(runId, 'quality_gate_complete', {
      success,
      lintPassed: lintResult.passed,
      testPassed: testResult.passed,
      durationMs,
    });

    return {
      success,
      lint: lintResult,
      test: testResult,
      durationMs,
      errors,
    };
  }

  /**
   * Lintを実行
   *
   * @param runId - 実行ID
   * @returns Lint結果
   *
   * @see Requirement 12.1: THE System SHALL run `make lint`
   */
  async runLint(runId: RunId): Promise<GateResult> {
    if (this.config.skipLint) {
      return {
        executed: false,
        passed: true,
        output: '',
        durationMs: 0,
        skipReason: '設定によりスキップ',
      };
    }

    this.eventHandlers.onLintStart?.();
    await this.logGateAction(runId, 'lint_start', {});

    const startTime = Date.now();

    try {
      const result = await this.processMonitor.execute(this.config.lintCommand);
      const durationMs = Date.now() - startTime;

      const gateResult: GateResult = {
        executed: true,
        passed: result.exitCode === 0,
        output: result.stdout + (result.stderr ? `\n${result.stderr}` : ''),
        durationMs,
      };

      await this.logGateAction(runId, 'lint_complete', {
        passed: gateResult.passed,
        exitCode: result.exitCode,
        durationMs,
      });

      this.eventHandlers.onLintComplete?.(gateResult);
      return gateResult;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const gateResult: GateResult = {
        executed: true,
        passed: false,
        output: `Lint実行エラー: ${errorMessage}`,
        durationMs,
      };

      const errorInfo: ErrorInfo = {
        code: 'LINT_EXECUTION_ERROR',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        recoverable: true,
      };

      this.eventHandlers.onError?.(errorInfo);
      await this.logGateAction(runId, 'lint_error', { error: errorMessage });

      return gateResult;
    }
  }

  /**
   * テストを実行
   *
   * @param runId - 実行ID
   * @returns テスト結果
   *
   * @see Requirement 12.2: THE System SHALL run `make test`
   */
  async runTest(runId: RunId): Promise<GateResult> {
    if (this.config.skipTest) {
      return {
        executed: false,
        passed: true,
        output: '',
        durationMs: 0,
        skipReason: '設定によりスキップ',
      };
    }

    // テストファイルの存在確認
    const hasTestFiles = await this.checkTestFilesExist();
    if (!hasTestFiles) {
      return {
        executed: false,
        passed: true,
        output: '',
        durationMs: 0,
        skipReason: 'テストファイルが存在しません',
      };
    }

    this.eventHandlers.onTestStart?.();
    await this.logGateAction(runId, 'test_start', {});

    const startTime = Date.now();

    try {
      const result = await this.processMonitor.execute(this.config.testCommand);
      const durationMs = Date.now() - startTime;

      const gateResult: GateResult = {
        executed: true,
        passed: result.exitCode === 0,
        output: result.stdout + (result.stderr ? `\n${result.stderr}` : ''),
        durationMs,
      };

      await this.logGateAction(runId, 'test_complete', {
        passed: gateResult.passed,
        exitCode: result.exitCode,
        durationMs,
      });

      this.eventHandlers.onTestComplete?.(gateResult);
      return gateResult;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const gateResult: GateResult = {
        executed: true,
        passed: false,
        output: `テスト実行エラー: ${errorMessage}`,
        durationMs,
      };

      const errorInfo: ErrorInfo = {
        code: 'TEST_EXECUTION_ERROR',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        recoverable: true,
      };

      this.eventHandlers.onError?.(errorInfo);
      await this.logGateAction(runId, 'test_error', { error: errorMessage });

      return gateResult;
    }
  }

  // ===========================================================================
  // ヘルパーメソッド
  // ===========================================================================

  /**
   * テストファイルの存在を確認
   *
   * @returns テストファイルが存在する場合true
   */
  private async checkTestFilesExist(): Promise<boolean> {
    const testPatterns = [
      'tests',
      'test',
      '__tests__',
      '*.test.ts',
      '*.spec.ts',
      '*.test.js',
      '*.spec.js',
    ];

    for (const pattern of testPatterns) {
      const testPath = path.join(this.config.workspacePath, pattern);
      try {
        await fs.access(testPath);
        return true;
      } catch {
        // ファイルが存在しない場合は次のパターンを試す
      }
    }

    return false;
  }

  /**
   * 品質ゲートアクションをログに記録
   *
   * @param runId - 実行ID
   * @param action - アクション名
   * @param details - 詳細情報
   *
   * @see Requirement 12.6: THE quality gate logs SHALL be saved
   */
  private async logGateAction(
    runId: RunId,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const runDir = path.join(RUNS_BASE_DIR, runId);
    await fs.mkdir(runDir, { recursive: true });

    const logPath = path.join(runDir, QUALITY_GATE_LOG_FILE);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${action}] ${JSON.stringify(details)}\n`;

    await fs.appendFile(logPath, logEntry, 'utf-8');
  }

  // ===========================================================================
  // イベントハンドラ設定
  // ===========================================================================

  /**
   * イベントハンドラを設定
   *
   * @param handlers - イベントハンドラ
   */
  setEventHandlers(handlers: QualityGateEventHandlers): void {
    this.eventHandlers = handlers;
  }

  // ===========================================================================
  // 結果変換
  // ===========================================================================

  /**
   * 実行結果をQualityGateResult型に変換
   *
   * @param result - 品質ゲート実行結果
   * @returns QualityGateResult
   *
   * @see Requirement 12.3: THE quality gate results SHALL be included in Execution_Result
   */
  static toQualityGateResult(result: QualityGateExecutionResult): QualityGateResult {
    return {
      lint: {
        passed: result.lint.passed,
        output: result.lint.output,
      },
      test: {
        passed: result.test.passed,
        output: result.test.output,
      },
      overall: result.success,
    };
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * QualityGateを作成するファクトリ関数
 *
 * @param config - 品質ゲート設定
 * @returns QualityGateインスタンス
 *
 * @example
 * ```typescript
 * const gate = createQualityGate({
 *   workspacePath: '/path/to/workspace',
 *   timeout: 300000,
 * });
 * const result = await gate.execute('run-001');
 * ```
 */
export function createQualityGate(config: QualityGateConfig): QualityGate {
  return new QualityGate(config);
}

// =============================================================================
// 結果報告機能
// =============================================================================

/**
 * 品質ゲート失敗通知ペイロード
 * @description Manager Agentに送信する品質ゲート失敗情報
 * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
 */
export interface QualityGateFailurePayload {
  /** サブタスクID */
  subTaskId: string;
  /** 実行ID */
  runId: RunId;
  /** 品質ゲート結果 */
  qualityGateResult: QualityGateResult;
  /** 失敗したゲート一覧 */
  failedGates: ('lint' | 'test')[];
  /** エラー情報 */
  errors: ErrorInfo[];
  /** タイムスタンプ */
  timestamp: string;
}

/**
 * Manager Agentの決定種別
 * @description 品質ゲート失敗時のManager Agentの決定
 * @see Requirement 12.5: THE Manager_Agent SHALL decide whether to retry, reassign, or escalate
 */
export type QualityGateDecision = 'retry' | 'reassign' | 'escalate';

/**
 * Manager Agentの決定結果
 * @description 品質ゲート失敗に対するManager Agentの決定内容
 */
export interface QualityGateDecisionResult {
  /** 決定種別 */
  decision: QualityGateDecision;
  /** 理由 */
  reason: string;
  /** 再割り当て先ワーカーID（reassignの場合） */
  reassignTo?: string;
  /** 追加指示（retryの場合） */
  additionalInstructions?: string;
  /** エスカレーション先（escalateの場合） */
  escalateTo?: string;
}

/**
 * 品質ゲート結果レポーター
 *
 * 品質ゲート結果をExecutionResultに統合し、
 * 失敗時にはManager Agentに通知する機能を提供する。
 *
 * @see Requirement 12.3: THE quality gate results SHALL be included in Execution_Result
 * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
 */
export class QualityGateReporter {
  /** 実行ID */
  private runId: RunId;

  /** ログディレクトリ */
  private logDir: string;

  /**
   * コンストラクタ
   * @param runId - 実行ID
   */
  constructor(runId: RunId) {
    this.runId = runId;
    this.logDir = path.join(RUNS_BASE_DIR, runId);
  }

  /**
   * 品質ゲート結果をExecutionResultに統合
   *
   * @param executionResult - 元の実行結果
   * @param gateResult - 品質ゲート実行結果
   * @returns 品質ゲート結果が統合された実行結果
   *
   * @see Requirement 12.3: THE quality gate results SHALL be included in Execution_Result
   */
  integrateQualityGateResult(
    executionResult: ExecutionResultType,
    gateResult: QualityGateExecutionResult
  ): ExecutionResultType {
    // 品質ゲート結果を変換
    const qualityGates = QualityGate.toQualityGateResult(gateResult);

    // ステータスを更新（品質ゲート失敗時）
    let status = executionResult.status;
    if (!gateResult.success && status === 'success') {
      status = 'quality_failed';
    }

    // エラー情報をマージ
    const errors = [...executionResult.errors, ...gateResult.errors];

    return {
      ...executionResult,
      status,
      qualityGates,
      errors,
    };
  }

  /**
   * 品質ゲート失敗をManager Agentに通知するためのペイロードを作成
   *
   * @param subTaskId - サブタスクID
   * @param gateResult - 品質ゲート実行結果
   * @returns 失敗通知ペイロード
   *
   * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
   */
  createFailurePayload(
    subTaskId: string,
    gateResult: QualityGateExecutionResult
  ): QualityGateFailurePayload {
    // 失敗したゲートを特定
    const failedGates: ('lint' | 'test')[] = [];
    if (gateResult.lint.executed && !gateResult.lint.passed) {
      failedGates.push('lint');
    }
    if (gateResult.test.executed && !gateResult.test.passed) {
      failedGates.push('test');
    }

    return {
      subTaskId,
      runId: this.runId,
      qualityGateResult: QualityGate.toQualityGateResult(gateResult),
      failedGates,
      errors: gateResult.errors,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 品質ゲート失敗をログに記録
   *
   * @param payload - 失敗通知ペイロード
   *
   * @see Requirement 12.6: THE quality gate logs SHALL be saved
   */
  async logFailure(payload: QualityGateFailurePayload): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });

    const logPath = path.join(this.logDir, QUALITY_GATE_LOG_FILE);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [QUALITY_GATE_FAILURE] ${JSON.stringify({
      subTaskId: payload.subTaskId,
      failedGates: payload.failedGates,
      errors: payload.errors.map((e) => e.message),
    })}\n`;

    await fs.appendFile(logPath, logEntry, 'utf-8');
  }

  /**
   * Manager Agentへの通知が必要かどうかを判定
   *
   * @param gateResult - 品質ゲート実行結果
   * @returns 通知が必要な場合はtrue
   *
   * @see Requirement 12.4: IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent
   */
  shouldNotifyManager(gateResult: QualityGateExecutionResult): boolean {
    return !gateResult.success;
  }

  /**
   * 品質ゲート失敗に対する推奨決定を生成
   *
   * 失敗パターンを分析し、リトライ、再割り当て、エスカレーションのいずれかを推奨する。
   *
   * @param payload - 失敗通知ペイロード
   * @param failureCount - 連続失敗回数
   * @returns 推奨決定結果
   *
   * @see Requirement 12.5: THE Manager_Agent SHALL decide whether to retry, reassign, or escalate
   */
  generateDecisionRecommendation(
    payload: QualityGateFailurePayload,
    failureCount: number
  ): QualityGateDecisionResult {
    // 連続失敗回数に基づいて決定
    if (failureCount >= 3) {
      // 3回以上失敗した場合はエスカレーション
      return {
        decision: 'escalate',
        reason: `品質ゲートが${failureCount}回連続で失敗しました。人間の介入が必要です。`,
        escalateTo: 'quality_authority',
      };
    } else if (failureCount >= 2) {
      // 2回失敗した場合は再割り当て
      return {
        decision: 'reassign',
        reason: `品質ゲートが${failureCount}回失敗しました。別のワーカーに再割り当てを推奨します。`,
      };
    } else {
      // 初回失敗はリトライ
      const additionalInstructions = this.generateRetryInstructions(payload);
      return {
        decision: 'retry',
        reason: '品質ゲートが失敗しました。エラーを修正してリトライしてください。',
        additionalInstructions,
      };
    }
  }

  /**
   * リトライ用の追加指示を生成
   *
   * @param payload - 失敗通知ペイロード
   * @returns 追加指示
   */
  private generateRetryInstructions(payload: QualityGateFailurePayload): string {
    const instructions: string[] = [];

    if (payload.failedGates.includes('lint')) {
      instructions.push('- Lintエラーを修正してください');
      instructions.push('- `make lint` を実行して確認してください');
    }

    if (payload.failedGates.includes('test')) {
      instructions.push('- テストの失敗を修正してください');
      instructions.push('- `make test` を実行して確認してください');
    }

    if (payload.errors.length > 0) {
      instructions.push('- 以下のエラーを確認してください:');
      for (const error of payload.errors) {
        instructions.push(`  - ${error.message}`);
      }
    }

    return instructions.join('\n');
  }
}

/**
 * 品質ゲート結果レポーターを作成
 *
 * @param runId - 実行ID
 * @returns QualityGateReporterインスタンス
 */
export function createQualityGateReporter(runId: RunId): QualityGateReporter {
  return new QualityGateReporter(runId);
}

// =============================================================================
// ExecutionResult型のインポート（循環参照回避）
// =============================================================================

/**
 * ExecutionResult型（循環参照回避のため再定義）
 */
interface ExecutionResultType {
  runId: string;
  ticketId: string;
  agentId: string;
  status: 'success' | 'partial' | 'quality_failed' | 'error';
  startTime: string;
  endTime: string;
  artifacts: Array<{ path: string; action: 'created' | 'modified' | 'deleted'; diff?: string }>;
  gitBranch: string;
  commits: Array<{ hash: string; message: string; author: string; timestamp: string }>;
  qualityGates: QualityGateResult;
  errors: ErrorInfo[];
  conversationTurns: number;
  tokensUsed: number;
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default QualityGate;
