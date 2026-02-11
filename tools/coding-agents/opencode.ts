/**
 * OpenCode Adapter
 *
 * `opencode run "<prompt>"` コマンドをサブプロセスとして実行するアダプタ。
 * --format json, --model フラグに対応。
 *
 * @module coding-agents/opencode
 * @see Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { CodingTaskOptions, CodingTaskResult } from '../tools/cli/lib/execution/types.js';
import {
  type CodingAgentAdapter,
  CodingAgentError,
  CodingAgentTimeoutError,
  executeSubprocess,
  checkCommandExists,
  getCommandVersion,
  getDefaultTimeoutSeconds,
  detectChangedFiles,
} from './base.js';

/** OpenCodeコマンド名 */
const OPENCODE_COMMAND = 'opencode';

/**
 * OpenCode Adapter
 *
 * opencode CLIをサブプロセスとして実行し、コーディングタスクを委譲する。
 *
 * @see Requirement 2.1: THE OpenCodeAdapter SHALL execute `opencode run "<prompt>"`
 */
export class OpenCodeAdapter implements CodingAgentAdapter {
  readonly name = 'opencode';
  readonly displayName = 'OpenCode';

  /**
   * コーディングタスクを実行
   *
   * @param options - タスクオプション
   * @returns タスク実行結果
   * @throws {CodingAgentError} 実行エラー
   * @throws {CodingAgentTimeoutError} タイムアウト
   * @see Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
   */
  async execute(options: CodingTaskOptions): Promise<CodingTaskResult> {
    const timeoutSeconds = options.timeout ?? getDefaultTimeoutSeconds();

    // コマンド引数を構築
    const args = this.buildArgs(options);

    try {
      const result = await executeSubprocess({
        command: OPENCODE_COMMAND,
        args,
        cwd: options.workingDirectory,
        timeoutSeconds,
        env: options.env,
        agentName: this.name,
      });

      // タイムアウト時はエラーとして返す
      if (result.timedOut) {
        throw new CodingAgentTimeoutError(this.name, timeoutSeconds);
      }

      // 変更ファイルを検出
      const filesChanged = await detectChangedFiles(options.workingDirectory);

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        filesChanged,
      };
    } catch (error) {
      // 既知のエラーはそのまま再スロー
      if (error instanceof CodingAgentError) {
        throw error;
      }

      throw new CodingAgentError(
        `OpenCode実行中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        'EXECUTION_ERROR',
        this.name,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * CLIが利用可能かチェック
   * @returns 利用可能な場合true
   */
  async isAvailable(): Promise<boolean> {
    return checkCommandExists(OPENCODE_COMMAND);
  }

  /**
   * バージョン情報を取得
   * @returns バージョン文字列、取得不可の場合null
   */
  async getVersion(): Promise<string | null> {
    return getCommandVersion(OPENCODE_COMMAND);
  }

  /**
   * コマンド引数を構築
   *
   * @param options - タスクオプション
   * @returns コマンド引数配列
   * @see Requirements: 2.1, 2.2, 2.3
   */
  private buildArgs(options: CodingTaskOptions): string[] {
    const args: string[] = ['run', options.prompt];

    // JSON出力フォーマット
    // @see Requirement 2.2: THE OpenCodeAdapter SHALL support `--format json`
    args.push('--format', 'json');

    // モデル指定
    // @see Requirement 2.3: THE OpenCodeAdapter SHALL support `--model` flag
    if (options.model) {
      args.push('--model', options.model);
    }

    return args;
  }
}

/**
 * OpenCodeAdapterインスタンスを作成
 * @returns OpenCodeAdapterインスタンス
 */
export function createOpenCodeAdapter(): OpenCodeAdapter {
  return new OpenCodeAdapter();
}
