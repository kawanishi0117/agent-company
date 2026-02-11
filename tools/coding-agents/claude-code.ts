/**
 * Claude Code Adapter
 *
 * `claude -p "<prompt>"` コマンドをサブプロセスとして実行するアダプタ。
 * --output-format json, --allowedTools, --add-dir フラグに対応。
 *
 * @module coding-agents/claude-code
 * @see Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
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

/** Claude Codeコマンド名 */
const CLAUDE_COMMAND = 'claude';

/**
 * Claude Code Adapter
 *
 * Claude Code CLIをサブプロセスとして実行し、コーディングタスクを委譲する。
 *
 * @see Requirement 3.1: THE ClaudeCodeAdapter SHALL execute `claude -p "<prompt>"`
 */
export class ClaudeCodeAdapter implements CodingAgentAdapter {
  readonly name = 'claude-code';
  readonly displayName = 'Claude Code';

  /** パーミッションスキップフラグ（設定で制御） */
  private skipPermissions: boolean;

  /**
   * コンストラクタ
   * @param skipPermissions - パーミッションチェックをスキップするか
   * @see Requirement 3.5: THE ClaudeCodeAdapter SHALL handle `--dangerously-skip-permissions`
   */
  constructor(skipPermissions = true) {
    this.skipPermissions = skipPermissions;
  }

  /**
   * コーディングタスクを実行
   *
   * @param options - タスクオプション
   * @returns タスク実行結果
   * @throws {CodingAgentError} 実行エラー
   * @throws {CodingAgentTimeoutError} タイムアウト
   * @see Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  async execute(options: CodingTaskOptions): Promise<CodingTaskResult> {
    const timeoutSeconds = options.timeout ?? getDefaultTimeoutSeconds();

    // コマンド引数を構築
    const args = this.buildArgs(options);

    try {
      const result = await executeSubprocess({
        command: CLAUDE_COMMAND,
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
        `Claude Code実行中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
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
    return checkCommandExists(CLAUDE_COMMAND);
  }

  /**
   * バージョン情報を取得
   * @returns バージョン文字列、取得不可の場合null
   */
  async getVersion(): Promise<string | null> {
    return getCommandVersion(CLAUDE_COMMAND);
  }

  /**
   * コマンド引数を構築
   *
   * @param options - タスクオプション
   * @returns コマンド引数配列
   * @see Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  private buildArgs(options: CodingTaskOptions): string[] {
    const args: string[] = [];

    // プロンプトモード
    // @see Requirement 3.1: `claude -p "<prompt>"`
    args.push('-p', options.prompt);

    // JSON出力フォーマット
    // @see Requirement 3.2: `--output-format json`
    args.push('--output-format', 'json');

    // 許可ツール指定
    // @see Requirement 3.3: `--allowedTools`
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    // 作業ディレクトリ指定
    // @see Requirement 3.4: `--add-dir`
    args.push('--add-dir', options.workingDirectory);

    // モデル指定
    if (options.model) {
      args.push('--model', options.model);
    }

    // システムプロンプト
    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    // パーミッションスキップ
    // @see Requirement 3.5: `--dangerously-skip-permissions`
    if (this.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    return args;
  }
}

/**
 * ClaudeCodeAdapterインスタンスを作成
 * @param skipPermissions - パーミッションチェックをスキップするか
 * @returns ClaudeCodeAdapterインスタンス
 */
export function createClaudeCodeAdapter(skipPermissions = true): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter(skipPermissions);
}
