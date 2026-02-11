/**
 * コーディングエージェント基底インターフェースとエラークラス
 *
 * 外部コーディングエージェントCLI（opencode、Claude Code、Kiro CLI）を
 * 統一的に扱うための基底定義。CLIサブプロセスラッパーパターンで実装。
 *
 * @module coding-agents/base
 * @see Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { CodingTaskOptions, CodingTaskResult } from '../tools/cli/lib/execution/types.js';

// =============================================================================
// 定数
// =============================================================================

/** デフォルトタイムアウト秒数 */
const DEFAULT_TIMEOUT_SECONDS = 600;

/** プロセス終了待機時間（ミリ秒） */
const PROCESS_KILL_GRACE_MS = 5000;

// =============================================================================
// エラークラス
// =============================================================================

/**
 * コーディングエージェントエラー
 * @description コーディングエージェント実行時の基底エラー
 */
export class CodingAgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly agentName: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CodingAgentError';
  }
}

/**
 * コーディングエージェントタイムアウトエラー
 * @description サブプロセスがタイムアウトした場合のエラー
 * @see Requirement 1.4: THE isAvailable() method SHALL check if the CLI tool is installed
 */
export class CodingAgentTimeoutError extends CodingAgentError {
  constructor(agentName: string, timeoutSeconds: number) {
    super(
      `コーディングエージェント '${agentName}' がタイムアウトしました（${timeoutSeconds}秒）`,
      'TIMEOUT',
      agentName
    );
    this.name = 'CodingAgentTimeoutError';
  }
}

/**
 * コーディングエージェント未インストールエラー
 * @description CLIツールが見つからない場合のエラー
 */
export class CodingAgentNotFoundError extends CodingAgentError {
  constructor(agentName: string, command: string) {
    super(
      `コーディングエージェント '${agentName}' が見つかりません。'${command}' がインストールされているか確認してください。`,
      'NOT_FOUND',
      agentName
    );
    this.name = 'CodingAgentNotFoundError';
  }
}

// =============================================================================
// インターフェース
// =============================================================================

/**
 * コーディングエージェントアダプタ
 * @description 外部コーディングエージェントCLIとの通信を抽象化するインターフェース
 * @see Requirement 1.1: THE CodingAgentAdapter interface SHALL define name, execute(), isAvailable()
 */
export interface CodingAgentAdapter {
  /** アダプタ名（一意識別子） */
  readonly name: string;

  /** 表示名（UI用） */
  readonly displayName: string;

  /**
   * コーディングタスクを実行
   * @param options - タスクオプション
   * @returns タスク実行結果
   * @throws {CodingAgentError} 実行エラー
   * @throws {CodingAgentTimeoutError} タイムアウト
   * @see Requirement 1.2: THE execute() method SHALL accept workingDirectory, prompt, etc.
   * @see Requirement 1.3: THE execute() method SHALL return success, output, exitCode, etc.
   */
  execute(options: CodingTaskOptions): Promise<CodingTaskResult>;

  /**
   * CLIが利用可能かチェック
   * @returns 利用可能な場合true
   * @see Requirement 1.4: THE isAvailable() method SHALL check if the CLI tool is installed
   */
  isAvailable(): Promise<boolean>;

  /**
   * バージョン情報を取得
   * @returns バージョン文字列、取得不可の場合null
   */
  getVersion(): Promise<string | null>;
}

// =============================================================================
// サブプロセス実行ヘルパー
// =============================================================================

/**
 * サブプロセス実行オプション
 */
export interface SubprocessOptions {
  /** 実行コマンド */
  command: string;
  /** コマンド引数 */
  args: string[];
  /** 作業ディレクトリ */
  cwd: string;
  /** タイムアウト秒数 */
  timeoutSeconds: number;
  /** 環境変数（オプション） */
  env?: Record<string, string>;
  /** エージェント名（エラーメッセージ用） */
  agentName: string;
}

/**
 * サブプロセス実行結果
 */
export interface SubprocessResult {
  /** 標準出力 */
  stdout: string;
  /** 標準エラー出力 */
  stderr: string;
  /** 終了コード */
  exitCode: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** タイムアウトしたか */
  timedOut: boolean;
}

/**
 * サブプロセスを実行し結果を返す
 *
 * タイムアウト管理、プロセス終了処理を含む共通ヘルパー。
 * 各アダプタはこの関数を使ってCLIコマンドを実行する。
 *
 * @param options - サブプロセス実行オプション
 * @returns サブプロセス実行結果
 * @throws {CodingAgentTimeoutError} タイムアウト時
 * @throws {CodingAgentError} その他の実行エラー
 * @see Requirements: 1.2, 1.3
 */
export function executeSubprocess(options: SubprocessOptions): Promise<SubprocessResult> {
  const {
    command,
    args,
    cwd,
    timeoutSeconds,
    env,
    agentName,
  } = options;

  return new Promise<SubprocessResult>((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    // サブプロセスを起動
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
        // Windows対応: shellを使用
        shell: process.platform === 'win32',
      });
    } catch (error) {
      reject(
        new CodingAgentError(
          `コーディングエージェント '${agentName}' の起動に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
          'SPAWN_ERROR',
          agentName,
          error instanceof Error ? error : undefined
        )
      );
      return;
    }

    // 標準出力を収集
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    // 標準エラー出力を収集
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // タイムアウトタイマー
    const timeoutMs = timeoutSeconds * 1000;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcess(child);
    }, timeoutMs);

    // プロセス終了ハンドラ
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      const durationMs = Date.now() - startTime;

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        durationMs,
        timedOut,
      });
    });

    // エラーハンドラ
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      // ENOENT: コマンドが見つからない
      if ('code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new CodingAgentNotFoundError(agentName, command));
        return;
      }

      reject(
        new CodingAgentError(
          `コーディングエージェント '${agentName}' の実行中にエラーが発生しました: ${error.message}`,
          'EXECUTION_ERROR',
          agentName,
          error
        )
      );
    });
  });
}

/**
 * プロセスを安全に終了させる
 *
 * まずSIGTERMを送信し、猶予時間後にSIGKILLで強制終了する。
 *
 * @param child - 終了させるプロセス
 */
function killProcess(child: ChildProcess): void {
  // まずSIGTERMで終了を要求
  child.kill('SIGTERM');

  // 猶予時間後にSIGKILLで強制終了
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, PROCESS_KILL_GRACE_MS);
}

/**
 * CLIコマンドの存在確認
 *
 * `which`（Unix）または `where`（Windows）を使ってコマンドの存在を確認する。
 *
 * @param command - 確認するコマンド名
 * @returns コマンドが存在する場合true
 */
export function checkCommandExists(command: string): Promise<boolean> {
  const checkCmd = process.platform === 'win32' ? 'where' : 'which';

  return new Promise<boolean>((resolve) => {
    const child = spawn(checkCmd, [command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    child.on('close', (code: number | null) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * CLIコマンドのバージョンを取得
 *
 * `<command> --version` を実行してバージョン文字列を取得する。
 *
 * @param command - コマンド名
 * @returns バージョン文字列、取得不可の場合null
 */
export function getCommandVersion(command: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const child = spawn(command, ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim().split('\n')[0]);
      } else {
        resolve(null);
      }
    });

    child.on('error', () => {
      resolve(null);
    });

    // 5秒でタイムアウト
    setTimeout(() => {
      child.kill();
      resolve(null);
    }, 5000);
  });
}

/**
 * デフォルトタイムアウト秒数を取得
 * @returns デフォルトタイムアウト秒数
 */
export function getDefaultTimeoutSeconds(): number {
  return DEFAULT_TIMEOUT_SECONDS;
}

/**
 * git diffで変更ファイル一覧を取得
 *
 * コーディングエージェント実行前後のgit diffから変更ファイルを検出する。
 *
 * @param cwd - 作業ディレクトリ
 * @returns 変更されたファイルパス一覧
 */
export function detectChangedFiles(cwd: string): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const child = spawn('git', ['diff', '--name-only', 'HEAD'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        const files = stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);
        resolve(files);
      } else {
        // git diffが失敗した場合（gitリポジトリでない等）は空配列
        resolve([]);
      }
    });

    child.on('error', () => {
      resolve([]);
    });
  });
}
