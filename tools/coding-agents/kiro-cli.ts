/**
 * Kiro CLI Adapter
 *
 * `kiro chat -p "<prompt>"` コマンドをサブプロセスとして実行するアダプタ。
 * カスタムエージェント設定、MCP・steering統合に対応。
 *
 * @module coding-agents/kiro-cli
 * @see Requirements: 4.1, 4.2, 4.3, 4.4
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

/** Kiro CLIコマンド名 */
const KIRO_COMMAND = 'kiro';

/**
 * Kiro CLI Adapter
 *
 * Kiro CLIをサブプロセスとして実行し、コーディングタスクを委譲する。
 *
 * @see Requirement 4.1: THE KiroCliAdapter SHALL execute `kiro chat -p "<prompt>"`
 */
export class KiroCliAdapter implements CodingAgentAdapter {
  readonly name = 'kiro-cli';
  readonly displayName = 'Kiro CLI';

  /**
   * コーディングタスクを実行
   *
   * @param options - タスクオプション
   * @returns タスク実行結果
   * @throws {CodingAgentError} 実行エラー
   * @throws {CodingAgentTimeoutError} タイムアウト
   * @see Requirements: 4.1, 4.2, 4.3, 4.4
   */
  async execute(options: CodingTaskOptions): Promise<CodingTaskResult> {
    const timeoutSeconds = options.timeout ?? getDefaultTimeoutSeconds();

    // コマンド引数を構築
    const args = this.buildArgs(options);

    try {
      const result = await executeSubprocess({
        command: KIRO_COMMAND,
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
      if (error instanceof CodingAgentError) {
        throw error;
      }

      throw new CodingAgentError(
        `Kiro CLI実行中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
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
    return checkCommandExists(KIRO_COMMAND);
  }

  /**
   * バージョン情報を取得
   * @returns バージョン文字列、取得不可の場合null
   */
  async getVersion(): Promise<string | null> {
    return getCommandVersion(KIRO_COMMAND);
  }

  /**
   * コマンド引数を構築
   *
   * @param options - タスクオプション
   * @returns コマンド引数配列
   * @see Requirements: 4.1, 4.2, 4.3
   */
  private buildArgs(options: CodingTaskOptions): string[] {
    const args: string[] = [];

    // チャットモード + プロンプト
    // @see Requirement 4.1: `kiro chat -p "<prompt>"`
    args.push('chat', '-p', options.prompt);

    return args;
  }
}

/**
 * KiroCliAdapterインスタンスを作成
 * @returns KiroCliAdapterインスタンス
 */
export function createKiroCliAdapter(): KiroCliAdapter {
  return new KiroCliAdapter();
}
