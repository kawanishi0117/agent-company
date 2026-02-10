/**
 * QualityGateIntegration - 品質ゲート統合モジュール
 *
 * 既存のQualityGateクラスをラップし、より高レベルなインターフェースを提供する。
 * lint → test の順序実行、結果の永続化、WorkerAgentへのフィードバック生成を担当する。
 *
 * @module execution/quality-gate-integration
 * @see Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { QualityGate } from './quality-gate.js';
import type { RunId } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 実行ディレクトリのベースパス
 */
const DEFAULT_RUNS_BASE_DIR = 'runtime/runs';

/**
 * 品質ゲート結果ファイル名
 * @see Requirement 4.3
 */
const QUALITY_RESULT_FILENAME = 'quality.json';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 品質チェック結果
 * @description 個別の品質チェック（lint/test）の結果
 * @see Requirements: 4.1, 4.2
 */
export interface QualityCheckResult {
  /** 合格フラグ */
  passed: boolean;
  /** 出力ログ */
  output: string;
  /** エラー一覧 */
  errors: string[];
  /** 警告一覧 */
  warnings: string[];
  /** 実行時間（ミリ秒） */
  duration: number;
}

/**
 * 品質ゲート全体結果
 * @description lint + test の統合結果
 * @see Requirements: 4.1, 4.2, 4.3
 */
export interface QualityGateResult {
  /** lint結果 */
  lint: QualityCheckResult;
  /** test結果（lintが失敗した場合はスキップ） */
  test: QualityCheckResult;
  /** 全体の合格フラグ */
  overall: boolean;
  /** 実行タイムスタンプ（ISO8601形式） */
  timestamp: string;
}

/**
 * 品質ゲート結果の永続化データ
 * @description quality.json に保存されるデータ構造
 * @see Requirement 4.3
 */
export interface QualityGateResultData {
  /** 実行ID */
  runId: string;
  /** タイムスタンプ（ISO8601形式） */
  timestamp: string;
  /** lint結果 */
  lint: {
    passed: boolean;
    output: string;
    errorCount: number;
    warningCount: number;
  };
  /** test結果 */
  test: {
    passed: boolean;
    output: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    coverage?: number;
  };
  /** 全体の合格フラグ */
  overall: boolean;
}

/**
 * 品質ゲートフィードバック
 * @description WorkerAgentに送信する品質ゲート失敗時のフィードバック
 * @see Requirements: 4.4, 4.5
 */
export interface QualityGateFeedback {
  /** 全体の合格フラグ */
  passed: boolean;
  /** フィードバックメッセージ */
  message: string;
  /** 失敗したゲート一覧 */
  failedGates: ('lint' | 'test')[];
  /** 修正のための具体的な指示 */
  fixInstructions: string[];
}

/**
 * QualityGateIntegration設定
 */
export interface QualityGateIntegrationConfig {
  /** 実行ディレクトリのベースパス */
  runsBaseDir?: string;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** カスタムLintコマンド */
  lintCommand?: string;
  /** カスタムテストコマンド */
  testCommand?: string;
}

// =============================================================================
// QualityGateIntegration クラス
// =============================================================================

/**
 * QualityGateIntegration - 品質ゲート統合クラス
 *
 * 既存のQualityGateクラスをラップし、以下の機能を提供する：
 * - lint → test の順序実行（lintが失敗した場合testはスキップ）
 * - 結果の永続化（quality.json）
 * - WorkerAgentへのフィードバック生成
 *
 * @see Requirement 4.1: WHEN a Worker_Agent completes code changes, THE System SHALL run lint automatically
 * @see Requirement 4.2: WHEN lint passes, THE System SHALL run tests automatically
 * @see Requirement 4.3: THE System SHALL record quality gate results to quality.json
 * @see Requirement 4.4: IF quality gate fails, THE System SHALL notify Worker_Agent with failure details
 * @see Requirement 4.5: THE Worker_Agent SHALL attempt to fix issues based on quality gate feedback
 */
export class QualityGateIntegration {
  /** 実行ディレクトリのベースパス */
  private readonly runsBaseDir: string;

  /** タイムアウト（ミリ秒） */
  private readonly timeout: number;

  /** カスタムLintコマンド */
  private readonly lintCommand?: string;

  /** カスタムテストコマンド */
  private readonly testCommand?: string;

  /**
   * コンストラクタ
   * @param config - 品質ゲート統合設定
   */
  constructor(config: QualityGateIntegrationConfig = {}) {
    this.runsBaseDir = config.runsBaseDir ?? DEFAULT_RUNS_BASE_DIR;
    this.timeout = config.timeout ?? 300000;
    this.lintCommand = config.lintCommand;
    this.testCommand = config.testCommand;
  }

  // ===========================================================================
  // 品質チェック実行
  // ===========================================================================

  /**
   * Lintを実行
   *
   * 指定されたワークスペースパスでlintチェックを実行し、
   * QualityCheckResult形式で結果を返す。
   *
   * @param workspacePath - ワークスペースのパス
   * @returns lint実行結果
   *
   * @see Requirement 4.1: WHEN a Worker_Agent completes code changes, THE System SHALL run lint automatically
   */
  async runLint(workspacePath: string): Promise<QualityCheckResult> {
    const gate = this.createQualityGate(workspacePath);
    // ダミーのrunIdを使用（個別実行時はログ不要）
    const dummyRunId = `lint-${Date.now()}`;

    const startTime = Date.now();

    try {
      const result = await gate.runLint(dummyRunId);
      const duration = Date.now() - startTime;

      return this.convertGateResult(result, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        passed: false,
        output: `Lint実行エラー: ${errorMessage}`,
        errors: [errorMessage],
        warnings: [],
        duration,
      };
    }
  }

  /**
   * テストを実行
   *
   * 指定されたワークスペースパスでテストを実行し、
   * QualityCheckResult形式で結果を返す。
   *
   * @param workspacePath - ワークスペースのパス
   * @returns テスト実行結果
   *
   * @see Requirement 4.2: WHEN lint passes, THE System SHALL run tests automatically
   */
  async runTests(workspacePath: string): Promise<QualityCheckResult> {
    const gate = this.createQualityGate(workspacePath);
    const dummyRunId = `test-${Date.now()}`;

    const startTime = Date.now();

    try {
      const result = await gate.runTest(dummyRunId);
      const duration = Date.now() - startTime;

      return this.convertGateResult(result, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        passed: false,
        output: `テスト実行エラー: ${errorMessage}`,
        errors: [errorMessage],
        warnings: [],
        duration,
      };
    }
  }

  /**
   * 全品質チェックを実行
   *
   * lint → test の順序で実行する。
   * lintが失敗した場合、testはスキップされる（passed: false, output: 'スキップ'）。
   *
   * @param workspacePath - ワークスペースのパス
   * @returns 品質ゲート全体結果
   *
   * @see Requirement 4.1: THE System SHALL run lint automatically
   * @see Requirement 4.2: WHEN lint passes, THE System SHALL run tests automatically
   */
  async runAllChecks(workspacePath: string): Promise<QualityGateResult> {
    const timestamp = new Date().toISOString();

    // Step 1: Lint実行
    const lintResult = await this.runLint(workspacePath);

    // Step 2: Lintが失敗した場合、テストはスキップ
    let testResult: QualityCheckResult;
    if (!lintResult.passed) {
      testResult = {
        passed: false,
        output: 'Lintが失敗したためスキップされました',
        errors: [],
        warnings: [],
        duration: 0,
      };
    } else {
      testResult = await this.runTests(workspacePath);
    }

    // 全体の合格判定
    const overall = lintResult.passed && testResult.passed;

    return {
      lint: lintResult,
      test: testResult,
      overall,
      timestamp,
    };
  }

  // ===========================================================================
  // 結果の永続化
  // ===========================================================================

  /**
   * 品質ゲート結果を永続化
   *
   * `runtime/runs/<run-id>/quality.json` に結果を保存する。
   *
   * @param runId - 実行ID
   * @param results - 品質ゲート全体結果
   *
   * @see Requirement 4.3: THE System SHALL record quality gate results to quality.json
   */
  async saveResults(runId: RunId, results: QualityGateResult): Promise<void> {
    const runDir = path.join(this.runsBaseDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const resultData = this.toResultData(runId, results);
    const filePath = path.join(runDir, QUALITY_RESULT_FILENAME);
    const json = JSON.stringify(resultData, null, 2);

    await fs.writeFile(filePath, json, 'utf-8');
  }

  /**
   * 品質ゲート結果を読み込み
   *
   * @param runId - 実行ID
   * @returns 品質ゲート結果データ（存在しない場合はnull）
   */
  async loadResults(runId: RunId): Promise<QualityGateResultData | null> {
    const filePath = path.join(this.runsBaseDir, runId, QUALITY_RESULT_FILENAME);

    try {
      const json = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(json) as QualityGateResultData;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // フィードバック生成
  // ===========================================================================

  /**
   * 品質ゲート失敗時のフィードバックを生成
   *
   * WorkerAgentに送信するための失敗詳細とフィックス指示を生成する。
   *
   * @param results - 品質ゲート全体結果
   * @returns 品質ゲートフィードバック
   *
   * @see Requirement 4.4: IF quality gate fails, THE System SHALL notify Worker_Agent with failure details
   * @see Requirement 4.5: THE Worker_Agent SHALL attempt to fix issues based on quality gate feedback
   */
  generateFeedback(results: QualityGateResult): QualityGateFeedback {
    if (results.overall) {
      return {
        passed: true,
        message: '品質ゲートに合格しました。',
        failedGates: [],
        fixInstructions: [],
      };
    }

    const failedGates: ('lint' | 'test')[] = [];
    const fixInstructions: string[] = [];
    const messageParts: string[] = ['品質ゲートに失敗しました。以下の問題を修正してください：'];

    // Lint失敗の場合
    if (!results.lint.passed) {
      failedGates.push('lint');
      messageParts.push(`\n【Lint失敗】`);

      if (results.lint.errors.length > 0) {
        messageParts.push(`エラー数: ${results.lint.errors.length}`);
        // 最大5件のエラーを表示
        const displayErrors = results.lint.errors.slice(0, 5);
        for (const err of displayErrors) {
          messageParts.push(`  - ${err}`);
        }
        if (results.lint.errors.length > 5) {
          messageParts.push(`  ... 他 ${results.lint.errors.length - 5} 件`);
        }
      }

      fixInstructions.push('Lintエラーを修正してください。`make lint` で確認できます。');
      fixInstructions.push('ESLintのルールに従ってコードを修正してください。');
    }

    // Test失敗の場合
    if (!results.test.passed && results.lint.passed) {
      failedGates.push('test');
      messageParts.push(`\n【テスト失敗】`);

      if (results.test.errors.length > 0) {
        messageParts.push(`失敗テスト数: ${results.test.errors.length}`);
        const displayErrors = results.test.errors.slice(0, 5);
        for (const err of displayErrors) {
          messageParts.push(`  - ${err}`);
        }
        if (results.test.errors.length > 5) {
          messageParts.push(`  ... 他 ${results.test.errors.length - 5} 件`);
        }
      }

      fixInstructions.push('テストの失敗を修正してください。`make test` で確認できます。');
      fixInstructions.push('テストが期待する動作に合わせてコードを修正してください。');
    }

    return {
      passed: false,
      message: messageParts.join('\n'),
      failedGates,
      fixInstructions,
    };
  }

  // ===========================================================================
  // ヘルパーメソッド
  // ===========================================================================

  /**
   * QualityGateインスタンスを作成
   *
   * @param workspacePath - ワークスペースのパス
   * @returns QualityGateインスタンス
   */
  private createQualityGate(workspacePath: string): QualityGate {
    return new QualityGate({
      workspacePath,
      timeout: this.timeout,
      lintCommand: this.lintCommand,
      testCommand: this.testCommand,
    });
  }

  /**
   * GateResultをQualityCheckResultに変換
   *
   * @param gateResult - 既存のGateResult
   * @param duration - 実行時間（ミリ秒）
   * @returns QualityCheckResult
   */
  private convertGateResult(
    gateResult: { executed: boolean; passed: boolean; output: string; durationMs: number },
    duration: number
  ): QualityCheckResult {
    // 出力からエラーと警告を抽出
    const { errors, warnings } = this.parseOutput(gateResult.output);

    return {
      passed: gateResult.passed,
      output: gateResult.output,
      errors,
      warnings,
      duration: gateResult.durationMs || duration,
    };
  }

  /**
   * 出力テキストからエラーと警告を抽出
   *
   * @param output - コマンド出力テキスト
   * @returns エラーと警告の配列
   */
  private parseOutput(output: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // ESLint形式のエラー/警告を検出
      if (trimmed.includes('error') || trimmed.includes('Error')) {
        errors.push(trimmed);
      } else if (trimmed.includes('warning') || trimmed.includes('Warning')) {
        warnings.push(trimmed);
      }
    }

    return { errors, warnings };
  }

  /**
   * QualityGateResultをQualityGateResultDataに変換
   *
   * @param runId - 実行ID
   * @param results - 品質ゲート全体結果
   * @returns 永続化用データ
   */
  private toResultData(runId: string, results: QualityGateResult): QualityGateResultData {
    return {
      runId,
      timestamp: results.timestamp,
      lint: {
        passed: results.lint.passed,
        output: results.lint.output,
        errorCount: results.lint.errors.length,
        warningCount: results.lint.warnings.length,
      },
      test: {
        passed: results.test.passed,
        output: results.test.output,
        totalTests: 0, // 出力パースで取得可能だが、現時点では0
        passedTests: 0,
        failedTests: results.test.errors.length,
      },
      overall: results.overall,
    };
  }

  /**
   * ファイルが存在しないエラーかどうかを判定
   *
   * @param error - エラーオブジェクト
   * @returns ファイルが存在しないエラーの場合はtrue
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * QualityGateIntegrationを作成するファクトリ関数
 *
 * @param config - 品質ゲート統合設定
 * @returns QualityGateIntegrationインスタンス
 *
 * @example
 * ```typescript
 * const integration = createQualityGateIntegration({
 *   runsBaseDir: 'runtime/runs',
 *   timeout: 300000,
 * });
 * const result = await integration.runAllChecks('/path/to/workspace');
 * ```
 */
export function createQualityGateIntegration(
  config: QualityGateIntegrationConfig = {}
): QualityGateIntegration {
  return new QualityGateIntegration(config);
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default QualityGateIntegration;
