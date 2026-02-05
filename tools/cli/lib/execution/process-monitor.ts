/**
 * Process Monitor - コマンド実行の監視と制御
 *
 * 長時間実行コマンドの監視、タイムアウト制御、バックグラウンドプロセス管理を担当する。
 * インタラクティブコマンドの検出・拒否、サーバーコマンドのバックグラウンド実行をサポート。
 *
 * @module execution/process-monitor
 * @see Requirements: 6.1, 6.2, 6.6, 6.7
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ProcessId,
  ProcessStatus,
  ExecuteOptions,
  CommandResult,
  RunId,
  CommandRejectionReason,
} from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトタイムアウト（秒）
 * @see Requirement 6.1: THE Process_Monitor SHALL enforce configurable timeout (default: 300 seconds)
 */
const DEFAULT_TIMEOUT_SECONDS = 300;

/**
 * コマンドログのベースディレクトリ
 * @see Requirement 6.7: THE Process_Monitor SHALL log all command executions to `runtime/runs/<run-id>/commands.log`
 */
const RUNS_BASE_DIR = 'runtime/runs';

/**
 * インタラクティブコマンドのパターン
 * @description vim, nano, less などのインタラクティブなコマンドを検出するためのパターン
 */
const INTERACTIVE_COMMANDS = [
  'vim',
  'vi',
  'nvim',
  'nano',
  'emacs',
  'less',
  'more',
  'top',
  'htop',
  'man',
  'ssh',
  'telnet',
  'ftp',
  'mysql',
  'psql',
  'mongo',
  'redis-cli',
  'python', // 引数なしの場合はREPL
  'node',   // 引数なしの場合はREPL
  'irb',
  'pry',
];

/**
 * サーバーコマンドのパターン
 * @description npm run dev などのサーバーコマンドを検出するためのパターン
 */
const SERVER_COMMAND_PATTERNS = [
  /npm\s+run\s+(dev|start|serve)/i,
  /yarn\s+(dev|start|serve)/i,
  /pnpm\s+(dev|start|serve)/i,
  /npx\s+(vite|next|nuxt|remix)/i,
  /node\s+.*server/i,
  /python\s+.*manage\.py\s+runserver/i,
  /flask\s+run/i,
  /uvicorn/i,
  /gunicorn/i,
  /rails\s+server/i,
  /rails\s+s\b/i,
  /php\s+.*-S/i,
  /go\s+run\s+.*server/i,
  /cargo\s+run\s+.*server/i,
  /docker\s+compose\s+up/i,
  /docker-compose\s+up/i,
];

// =============================================================================
// 型定義
// =============================================================================

/**
 * バックグラウンドプロセス情報
 * @description バックグラウンドで実行中のプロセスの情報
 */
interface BackgroundProcess {
  /** プロセスID */
  processId: ProcessId;
  /** 子プロセス */
  childProcess: ChildProcess;
  /** コマンド */
  command: string;
  /** 開始日時（ISO8601形式） */
  startedAt: string;
  /** 標準出力バッファ */
  stdout: string;
  /** 標準エラー出力バッファ */
  stderr: string;
  /** 終了コード（終了した場合） */
  exitCode?: number;
}

/**
 * コマンドログエントリ
 * @description コマンド実行のログエントリ
 */
interface CommandLogEntry {
  /** タイムスタンプ（ISO8601形式） */
  timestamp: string;
  /** コマンド */
  command: string;
  /** 作業ディレクトリ */
  cwd?: string;
  /** 終了コード */
  exitCode?: number;
  /** タイムアウトフラグ */
  timedOut?: boolean;
  /** バックグラウンド実行フラグ */
  background?: boolean;
  /** プロセスID（バックグラウンドの場合） */
  processId?: ProcessId;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
  /** 拒否フラグ */
  rejected?: boolean;
  /** 拒否理由 */
  rejectionReason?: string;
}

// =============================================================================
// ProcessMonitor クラス
// =============================================================================

/**
 * ProcessMonitor - コマンド実行監視クラス
 *
 * コマンドの実行、タイムアウト制御、バックグラウンドプロセス管理を担当する。
 *
 * @see Requirement 6.1: THE Process_Monitor SHALL enforce configurable timeout (default: 300 seconds)
 * @see Requirement 6.2: WHEN command exceeds timeout, THE Process_Monitor SHALL terminate and report to Worker_Agent
 * @see Requirement 6.6: THE Process_Monitor SHALL support `kill <process_id>` to terminate background processes
 * @see Requirement 6.7: THE Process_Monitor SHALL log all command executions to `runtime/runs/<run-id>/commands.log`
 */
export class ProcessMonitor {
  /**
   * バックグラウンドプロセスのマップ
   * @description ProcessId -> BackgroundProcess のマッピング
   */
  private backgroundProcesses: Map<ProcessId, BackgroundProcess> = new Map();

  /**
   * 現在の実行ID
   * @description ログ出力先の決定に使用
   */
  private currentRunId?: RunId;

  /**
   * ベースディレクトリパス
   * @description テスト時にカスタムパスを指定可能
   */
  private readonly baseDir: string;

  /**
   * コンストラクタ
   * @param baseDir - ベースディレクトリパス（デフォルト: 'runtime/runs'）
   */
  constructor(baseDir: string = RUNS_BASE_DIR) {
    this.baseDir = baseDir;
  }

  // ===========================================================================
  // 実行ID管理
  // ===========================================================================

  /**
   * 現在の実行IDを設定
   * @param runId - 実行ID
   */
  setRunId(runId: RunId): void {
    this.currentRunId = runId;
  }

  /**
   * 現在の実行IDを取得
   * @returns 実行ID（未設定の場合はundefined）
   */
  getRunId(): RunId | undefined {
    return this.currentRunId;
  }

  // ===========================================================================
  // コマンド実行
  // ===========================================================================

  /**
   * コマンドを実行
   *
   * タイムアウト付きでコマンドを実行し、結果を返す。
   * タイムアウトを超過した場合はプロセスを終了し、timedOut: true を返す。
   * インタラクティブコマンドは拒否される。
   * サーバーコマンドは自動的にバックグラウンドで実行される。
   *
   * @param command - 実行するコマンド
   * @param options - 実行オプション
   * @returns コマンド実行結果（サーバーコマンドの場合はbackgroundProcessIdを含む）
   *
   * @see Requirement 6.1: THE Process_Monitor SHALL enforce configurable timeout (default: 300 seconds)
   * @see Requirement 6.2: WHEN command exceeds timeout, THE Process_Monitor SHALL terminate and report to Worker_Agent
   * @see Requirement 6.3: THE Process_Monitor SHALL detect and reject interactive commands
   * @see Requirement 6.4: THE Process_Monitor SHALL detect server commands and run in background
   */
  async execute(command: string, options: ExecuteOptions = {}): Promise<CommandResult> {
    // インタラクティブコマンドの検出と拒否
    // @see Requirement 6.3: THE Process_Monitor SHALL detect and reject interactive commands
    if (this.isInteractiveCommand(command)) {
      const result: CommandResult = {
        exitCode: 1,
        stdout: '',
        stderr: `Error: Interactive command rejected: "${command}". Interactive commands (vim, nano, less, etc.) are not supported.`,
        timedOut: false,
        rejected: true,
        rejectionReason: 'interactive_command',
      };

      // ログを記録
      this.logCommand({
        timestamp: new Date().toISOString(),
        command,
        cwd: options.cwd,
        exitCode: 1,
        rejected: true,
        rejectionReason: 'interactive_command',
      });

      return result;
    }

    // サーバーコマンドの検出とバックグラウンド実行
    // @see Requirement 6.4: THE Process_Monitor SHALL detect server commands and run in background
    if (this.isServerCommand(command)) {
      const processId = await this.executeBackground(command, options);
      const result: CommandResult = {
        exitCode: 0,
        stdout: `Server command detected. Running in background with process ID: ${processId}`,
        stderr: '',
        timedOut: false,
        backgroundProcessId: processId,
      };

      return result;
    }

    const startTime = Date.now();
    const timeout = (options.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000; // ミリ秒に変換

    return new Promise<CommandResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let resolved = false;

      // シェル経由でコマンドを実行
      const childProcess = spawn(command, [], {
        shell: true,
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
      });

      // タイムアウトタイマーを設定
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          timedOut = true;
          // プロセスを終了（SIGTERM -> SIGKILL）
          this.terminateProcess(childProcess);
        }
      }, timeout);

      // 標準出力を収集
      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // 標準エラー出力を収集
      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // プロセス終了時の処理
      childProcess.on('close', (code: number | null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

        const result: CommandResult = {
          exitCode: code ?? (timedOut ? 124 : 1), // タイムアウト時は124（timeoutコマンドの慣例）
          stdout,
          stderr,
          timedOut,
        };

        // ログを記録
        const durationMs = Date.now() - startTime;
        this.logCommand({
          timestamp: new Date().toISOString(),
          command,
          cwd: options.cwd,
          exitCode: result.exitCode,
          timedOut,
          durationMs,
        });

        resolve(result);
      });

      // エラー時の処理
      childProcess.on('error', (error: Error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

        const result: CommandResult = {
          exitCode: 1,
          stdout,
          stderr: stderr + '\n' + error.message,
          timedOut: false,
        };

        // ログを記録
        const durationMs = Date.now() - startTime;
        this.logCommand({
          timestamp: new Date().toISOString(),
          command,
          cwd: options.cwd,
          exitCode: result.exitCode,
          timedOut: false,
          durationMs,
        });

        resolve(result);
      });
    });
  }

  /**
   * コマンドをバックグラウンドで実行
   *
   * コマンドをバックグラウンドで実行し、プロセスIDを返す。
   * プロセスは kill() で終了できる。
   *
   * @param command - 実行するコマンド
   * @param options - 実行オプション（タイムアウトは無視される）
   * @returns プロセスID
   *
   * @see Requirement 6.5: WHEN background process starts, THE Process_Monitor SHALL return process_id for control
   */
  async executeBackground(command: string, options: ExecuteOptions = {}): Promise<ProcessId> {
    const processId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    // シェル経由でコマンドを実行
    const childProcess = spawn(command, [], {
      shell: true,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      detached: false, // 親プロセスと一緒に終了
    });

    // バックグラウンドプロセス情報を作成
    const bgProcess: BackgroundProcess = {
      processId,
      childProcess,
      command,
      startedAt,
      stdout: '',
      stderr: '',
    };

    // 標準出力を収集
    childProcess.stdout?.on('data', (data: Buffer) => {
      bgProcess.stdout += data.toString();
    });

    // 標準エラー出力を収集
    childProcess.stderr?.on('data', (data: Buffer) => {
      bgProcess.stderr += data.toString();
    });

    // プロセス終了時の処理
    childProcess.on('close', (code: number | null) => {
      bgProcess.exitCode = code ?? 1;
    });

    // マップに登録
    this.backgroundProcesses.set(processId, bgProcess);

    // ログを記録
    this.logCommand({
      timestamp: startedAt,
      command,
      cwd: options.cwd,
      background: true,
      processId,
    });

    return processId;
  }

  // ===========================================================================
  // プロセス制御
  // ===========================================================================

  /**
   * バックグラウンドプロセスを終了
   *
   * 指定されたプロセスIDのバックグラウンドプロセスを終了する。
   *
   * @param processId - プロセスID
   * @throws プロセスが見つからない場合
   *
   * @see Requirement 6.6: THE Process_Monitor SHALL support `kill <process_id>` to terminate background processes
   */
  async kill(processId: ProcessId): Promise<void> {
    const bgProcess = this.backgroundProcesses.get(processId);

    if (!bgProcess) {
      throw new Error(`Process not found: ${processId}`);
    }

    // プロセスを終了
    this.terminateProcess(bgProcess.childProcess);

    // ログを記録
    this.logCommand({
      timestamp: new Date().toISOString(),
      command: `kill ${processId}`,
      processId,
    });
  }

  /**
   * バックグラウンドプロセスのステータスを取得
   *
   * @param processId - プロセスID
   * @returns プロセスステータス
   * @throws プロセスが見つからない場合
   */
  async getProcessStatus(processId: ProcessId): Promise<ProcessStatus> {
    const bgProcess = this.backgroundProcesses.get(processId);

    if (!bgProcess) {
      throw new Error(`Process not found: ${processId}`);
    }

    // 終了コードが設定されている場合は終了済み
    if (bgProcess.exitCode !== undefined) {
      return 'exited';
    }

    // プロセスが生きているかチェック
    if (bgProcess.childProcess.killed) {
      return 'stopped';
    }

    return 'running';
  }

  /**
   * バックグラウンドプロセスの出力を取得
   *
   * @param processId - プロセスID
   * @returns 標準出力と標準エラー出力
   * @throws プロセスが見つからない場合
   */
  getProcessOutput(processId: ProcessId): { stdout: string; stderr: string } {
    const bgProcess = this.backgroundProcesses.get(processId);

    if (!bgProcess) {
      throw new Error(`Process not found: ${processId}`);
    }

    return {
      stdout: bgProcess.stdout,
      stderr: bgProcess.stderr,
    };
  }

  /**
   * 全てのバックグラウンドプロセスを終了
   *
   * @description クリーンアップ時に使用
   */
  async killAll(): Promise<void> {
    const processIds = Array.from(this.backgroundProcesses.keys());

    for (const processId of processIds) {
      try {
        await this.kill(processId);
      } catch {
        // 既に終了している場合は無視
      }
    }
  }

  /**
   * バックグラウンドプロセス一覧を取得
   *
   * @returns プロセスID一覧
   */
  listBackgroundProcesses(): ProcessId[] {
    return Array.from(this.backgroundProcesses.keys());
  }

  // ===========================================================================
  // コマンド検証
  // ===========================================================================

  /**
   * インタラクティブコマンドかどうかを判定
   *
   * vim, nano, less などのインタラクティブなコマンドを検出する。
   *
   * @param command - コマンド文字列
   * @returns インタラクティブコマンドの場合はtrue
   *
   * @see Requirement 6.3: THE Process_Monitor SHALL detect and reject interactive commands (vim, nano, less, etc.)
   */
  isInteractiveCommand(command: string): boolean {
    // コマンドの最初の単語を取得
    const trimmedCommand = command.trim();
    const firstWord = trimmedCommand.split(/\s+/)[0];

    // パスを除去してコマンド名のみを取得
    const commandName = path.basename(firstWord);

    // インタラクティブコマンドリストに含まれるかチェック
    if (INTERACTIVE_COMMANDS.includes(commandName.toLowerCase())) {
      // python, node は引数がある場合はインタラクティブではない
      if (['python', 'node'].includes(commandName.toLowerCase())) {
        const parts = trimmedCommand.split(/\s+/);
        // 引数がある場合（ファイル名など）はインタラクティブではない
        if (parts.length > 1 && !parts[1].startsWith('-')) {
          return false;
        }
        // -c オプションがある場合もインタラクティブではない
        if (parts.includes('-c') || parts.includes('-e')) {
          return false;
        }
        return true;
      }
      return true;
    }

    return false;
  }

  /**
   * サーバーコマンドかどうかを判定
   *
   * npm run dev などのサーバーコマンドを検出する。
   *
   * @param command - コマンド文字列
   * @returns サーバーコマンドの場合はtrue
   *
   * @see Requirement 6.4: THE Process_Monitor SHALL detect server commands (npm run dev, etc.) and run in background
   */
  isServerCommand(command: string): boolean {
    const trimmedCommand = command.trim();

    // サーバーコマンドパターンに一致するかチェック
    return SERVER_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmedCommand));
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * プロセスを終了
   *
   * SIGTERM を送信し、一定時間後に SIGKILL を送信する。
   *
   * @param childProcess - 子プロセス
   */
  private terminateProcess(childProcess: ChildProcess): void {
    // まず SIGTERM を送信
    childProcess.kill('SIGTERM');

    // 5秒後に SIGKILL を送信（まだ生きている場合）
    setTimeout(() => {
      if (!childProcess.killed) {
        childProcess.kill('SIGKILL');
      }
    }, 5000);
  }

  /**
   * コマンドログを記録
   *
   * @param entry - ログエントリ
   *
   * @see Requirement 6.7: THE Process_Monitor SHALL log all command executions to `runtime/runs/<run-id>/commands.log`
   */
  private async logCommand(entry: CommandLogEntry): Promise<void> {
    // 実行IDが設定されていない場合はログを記録しない
    if (!this.currentRunId) {
      return;
    }

    try {
      // ログディレクトリを作成
      const logDir = path.join(this.baseDir, this.currentRunId);
      await fs.mkdir(logDir, { recursive: true });

      // ログファイルパス
      const logFile = path.join(logDir, 'commands.log');

      // ログエントリをフォーマット
      const logLine = this.formatLogEntry(entry);

      // ログファイルに追記
      await fs.appendFile(logFile, logLine + '\n', 'utf-8');
    } catch (error) {
      // ログ記録の失敗は無視（コマンド実行自体には影響しない）
      console.error('Failed to log command:', error);
    }
  }

  /**
   * ログエントリをフォーマット
   *
   * @param entry - ログエントリ
   * @returns フォーマットされたログ行
   */
  private formatLogEntry(entry: CommandLogEntry): string {
    const parts: string[] = [
      `[${entry.timestamp}]`,
      entry.command,
    ];

    if (entry.cwd) {
      parts.push(`(cwd: ${entry.cwd})`);
    }

    if (entry.rejected) {
      parts.push(`[REJECTED: ${entry.rejectionReason}]`);
    } else if (entry.background) {
      parts.push(`[background: ${entry.processId}]`);
    } else {
      if (entry.exitCode !== undefined) {
        parts.push(`[exit: ${entry.exitCode}]`);
      }
      if (entry.timedOut) {
        parts.push('[TIMEOUT]');
      }
      if (entry.durationMs !== undefined) {
        parts.push(`[${entry.durationMs}ms]`);
      }
    }

    return parts.join(' ');
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * ProcessMonitor設定
 */
export interface ProcessMonitorConfig {
  /** 作業ディレクトリ */
  workDir?: string;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** ベースディレクトリ */
  baseDir?: string;
}

/**
 * ProcessMonitorを作成するファクトリ関数
 *
 * @param config - ProcessMonitor設定
 * @returns ProcessMonitorインスタンス
 *
 * @example
 * ```typescript
 * const monitor = createProcessMonitor({
 *   workDir: '/path/to/workspace',
 *   timeout: 300000,
 * });
 * const result = await monitor.execute('make lint');
 * ```
 */
export function createProcessMonitor(config?: ProcessMonitorConfig): ProcessMonitor {
  const baseDir = config?.baseDir ?? RUNS_BASE_DIR;
  return new ProcessMonitor(baseDir);
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのProcessMonitorインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const processMonitor = new ProcessMonitor();
