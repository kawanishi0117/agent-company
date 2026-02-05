/**
 * Tool Call インターフェース - AIからのツール呼び出し
 *
 * AIエージェントがファイル操作、コマンド実行、Git操作を行うためのツールインターフェース。
 * Worker Container内の/workspaceで操作を行い、Process MonitorとGit Managerを経由して実行する。
 *
 * @module execution/tools
 * @see Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessMonitor, processMonitor } from './process-monitor';
import { GitManager, gitManager, GitOperationOptions } from './git-manager';
import type { CommandResult, GitStatus, RunId } from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのワークスペースパス
 * @description Worker Container内の作業ディレクトリ
 */
const DEFAULT_WORKSPACE_PATH = '/workspace';

/**
 * ファイル読み取りの最大サイズ（バイト）
 * @description 大きすぎるファイルの読み取りを防止
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// =============================================================================
// 型定義
// =============================================================================

/**
 * ファイル編集操作
 * @description edit_fileツールで使用する編集操作
 */
export interface FileEdit {
  /** 編集タイプ */
  type: 'replace' | 'insert' | 'delete';
  /** 開始行（1-indexed） */
  startLine: number;
  /** 終了行（1-indexed、replaceとdeleteで使用） */
  endLine?: number;
  /** 新しい内容（replaceとinsertで使用） */
  content?: string;
}

/**
 * ディレクトリエントリ
 * @description list_directoryツールの結果エントリ
 */
export interface DirectoryEntry {
  /** エントリ名 */
  name: string;
  /** エントリタイプ */
  type: 'file' | 'directory' | 'symlink' | 'other';
  /** ファイルサイズ（バイト、ファイルの場合のみ） */
  size?: number;
  /** 最終更新日時（ISO8601形式） */
  modifiedAt: string;
}

/**
 * ツール実行結果
 * @description 各ツールの実行結果を表す共通型
 */
export interface ToolResult<T = unknown> {
  /** 成功フラグ */
  success: boolean;
  /** 結果データ */
  data?: T;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * ツールコンテキスト
 * @description ツール実行時のコンテキスト情報
 */
export interface ToolContext {
  /** ワークスペースパス */
  workspacePath: string;
  /** 実行ID */
  runId?: RunId;
  /** コマンドタイムアウト（秒） */
  commandTimeout?: number;
}

// =============================================================================
// ToolExecutor クラス
// =============================================================================

/**
 * ToolExecutor - ツール実行クラス
 *
 * AIエージェントからのツール呼び出しを実行する。
 * ファイル操作、コマンド実行、Git操作をサポート。
 *
 * @see Requirement 8.1: THE Execution_Engine SHALL support Tool_Calls
 */
export class ToolExecutor {
  /**
   * ProcessMonitorインスタンス
   */
  private processMonitor: ProcessMonitor;

  /**
   * GitManagerインスタンス
   */
  private gitManager: GitManager;

  /**
   * ツールコンテキスト
   */
  private context: ToolContext;

  /**
   * コンストラクタ
   * @param pm - ProcessMonitorインスタンス（デフォルト: グローバルインスタンス）
   * @param gm - GitManagerインスタンス（デフォルト: グローバルインスタンス）
   * @param workspacePath - ワークスペースパス（デフォルト: '/workspace'）
   */
  constructor(
    pm: ProcessMonitor = processMonitor,
    gm: GitManager = gitManager,
    workspacePath: string = DEFAULT_WORKSPACE_PATH
  ) {
    this.processMonitor = pm;
    this.gitManager = gm;
    this.context = {
      workspacePath,
    };
  }

  // ===========================================================================
  // コンテキスト設定
  // ===========================================================================

  /**
   * 実行IDを設定
   * @param runId - 実行ID
   */
  setRunId(runId: RunId): void {
    this.context.runId = runId;
    this.processMonitor.setRunId(runId);
    this.gitManager.setRunId(runId);
  }

  /**
   * ワークスペースパスを設定
   * @param workspacePath - ワークスペースパス
   */
  setWorkspacePath(workspacePath: string): void {
    this.context.workspacePath = workspacePath;
  }

  /**
   * コマンドタイムアウトを設定
   * @param timeout - タイムアウト秒数
   */
  setCommandTimeout(timeout: number): void {
    this.context.commandTimeout = timeout;
  }

  /**
   * コンテキストを取得
   * @returns 現在のコンテキスト
   */
  getContext(): ToolContext {
    return { ...this.context };
  }

  // ===========================================================================
  // ファイル操作ツール
  // ===========================================================================

  /**
   * ファイルを読み取る
   *
   * 指定されたパスのファイル内容を返す。
   * パスはワークスペース相対パスとして解釈される。
   *
   * @param filePath - ファイルパス（ワークスペース相対）
   * @returns ファイル内容
   *
   * @see Requirement 8.2: WHEN AI requests `read_file`, THE System SHALL return file content from Worker_Container
   */
  async readFile(filePath: string): Promise<ToolResult<string>> {
    try {
      // パスを正規化
      const absolutePath = this.resolvePath(filePath);

      // パスがワークスペース内かチェック
      if (!this.isWithinWorkspace(absolutePath)) {
        return {
          success: false,
          error: `Access denied: Path is outside workspace: ${filePath}`,
        };
      }

      // ファイルの存在確認
      const stats = await fs.stat(absolutePath);

      // ディレクトリの場合はエラー
      if (stats.isDirectory()) {
        return {
          success: false,
          error: `Cannot read directory as file: ${filePath}`,
        };
      }

      // ファイルサイズチェック
      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File too large (${stats.size} bytes). Maximum size is ${MAX_FILE_SIZE} bytes.`,
        };
      }

      // ファイルを読み取り
      const content = await fs.readFile(absolutePath, 'utf-8');

      return {
        success: true,
        data: content,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * ファイルを書き込む
   *
   * 指定されたパスにファイルを作成または上書きする。
   * 親ディレクトリが存在しない場合は自動的に作成される。
   *
   * @param filePath - ファイルパス（ワークスペース相対）
   * @param content - ファイル内容
   * @returns 書き込み結果
   *
   * @see Requirement 8.3: WHEN AI requests `write_file`, THE System SHALL create or overwrite file in Worker_Container
   */
  async writeFile(filePath: string, content: string): Promise<ToolResult<void>> {
    try {
      // パスを正規化
      const absolutePath = this.resolvePath(filePath);

      // パスがワークスペース内かチェック
      if (!this.isWithinWorkspace(absolutePath)) {
        return {
          success: false,
          error: `Access denied: Path is outside workspace: ${filePath}`,
        };
      }

      // 親ディレクトリを作成
      const parentDir = path.dirname(absolutePath);
      await fs.mkdir(parentDir, { recursive: true });

      // ファイルを書き込み
      await fs.writeFile(absolutePath, content, 'utf-8');

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * ファイルを編集する
   *
   * 指定されたパスのファイルに対してdiff-based編集を適用する。
   * 複数の編集操作を一度に適用できる。
   *
   * @param filePath - ファイルパス（ワークスペース相対）
   * @param edits - 編集操作の配列
   * @returns 編集結果
   *
   * @see Requirement 8.4: WHEN AI requests `edit_file`, THE System SHALL apply diff-based changes
   */
  async editFile(filePath: string, edits: FileEdit[]): Promise<ToolResult<string>> {
    try {
      // パスを正規化
      const absolutePath = this.resolvePath(filePath);

      // パスがワークスペース内かチェック
      if (!this.isWithinWorkspace(absolutePath)) {
        return {
          success: false,
          error: `Access denied: Path is outside workspace: ${filePath}`,
        };
      }

      // ファイルを読み取り
      let content: string;
      try {
        content = await fs.readFile(absolutePath, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            success: false,
            error: `File not found: ${filePath}`,
          };
        }
        throw error;
      }

      // 編集を適用
      const result = this.applyEdits(content, edits);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // ファイルを書き込み
      await fs.writeFile(absolutePath, result.data!, 'utf-8');

      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * ディレクトリの内容を一覧表示する
   *
   * 指定されたパスのディレクトリ内容を返す。
   *
   * @param dirPath - ディレクトリパス（ワークスペース相対）
   * @returns ディレクトリエントリの配列
   */
  async listDirectory(dirPath: string): Promise<ToolResult<DirectoryEntry[]>> {
    try {
      // パスを正規化
      const absolutePath = this.resolvePath(dirPath);

      // パスがワークスペース内かチェック
      if (!this.isWithinWorkspace(absolutePath)) {
        return {
          success: false,
          error: `Access denied: Path is outside workspace: ${dirPath}`,
        };
      }

      // ディレクトリの存在確認
      const stats = await fs.stat(absolutePath);

      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Not a directory: ${dirPath}`,
        };
      }

      // ディレクトリ内容を読み取り
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      // エントリ情報を収集
      const result: DirectoryEntry[] = [];

      for (const entry of entries) {
        const entryPath = path.join(absolutePath, entry.name);
        let entryStats;

        try {
          entryStats = await fs.stat(entryPath);
        } catch {
          // statに失敗した場合はスキップ
          continue;
        }

        const dirEntry: DirectoryEntry = {
          name: entry.name,
          type: this.getEntryType(entry),
          modifiedAt: entryStats.mtime.toISOString(),
        };

        if (entry.isFile()) {
          dirEntry.size = entryStats.size;
        }

        result.push(dirEntry);
      }

      // 名前でソート
      result.sort((a, b) => a.name.localeCompare(b.name));

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          error: `Directory not found: ${dirPath}`,
        };
      }
      return {
        success: false,
        error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ===========================================================================
  // コマンド実行ツール
  // ===========================================================================

  /**
   * コマンドを実行する
   *
   * Process Monitor経由でコマンドを実行する。
   * タイムアウト制御、インタラクティブコマンド拒否、サーバーコマンドのバックグラウンド実行をサポート。
   *
   * @param command - 実行するコマンド
   * @param timeout - タイムアウト秒数（オプション）
   * @returns コマンド実行結果
   *
   * @see Requirement 8.5: WHEN AI requests `run_command`, THE System SHALL execute via Process_Monitor
   */
  async runCommand(command: string, timeout?: number): Promise<ToolResult<CommandResult>> {
    try {
      const result = await this.processMonitor.execute(command, {
        cwd: this.context.workspacePath,
        timeout: timeout ?? this.context.commandTimeout,
      });

      return {
        success: result.exitCode === 0 && !result.rejected,
        data: result,
        error: result.rejected
          ? result.stderr
          : result.exitCode !== 0
            ? `Command failed with exit code ${result.exitCode}: ${result.stderr}`
            : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to run command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ===========================================================================
  // Git操作ツール
  // ===========================================================================

  /**
   * Gitコミットを作成する
   *
   * Git Manager経由でステージングとコミットを行う。
   *
   * @param message - コミットメッセージ
   * @param files - ステージングするファイル（省略時は全ファイル）
   * @returns コミットハッシュ
   *
   * @see Requirement 8.6: WHEN AI requests `git_commit`, THE System SHALL stage and commit via Git_Manager
   */
  async gitCommit(message: string, files?: string[]): Promise<ToolResult<string>> {
    try {
      const options: GitOperationOptions = {
        cwd: this.context.workspacePath,
      };

      // ファイルをステージング
      const filesToStage = files ?? ['.'];
      await this.gitManager.stage(filesToStage, options);

      // コミット
      const commitHash = await this.gitManager.commit(message, options);

      return {
        success: true,
        data: commitHash,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to commit: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Gitステータスを取得する
   *
   * Git Manager経由でリポジトリの状態を取得する。
   *
   * @returns Gitステータス
   */
  async gitStatus(): Promise<ToolResult<GitStatus>> {
    try {
      const options: GitOperationOptions = {
        cwd: this.context.workspacePath,
      };

      const status = await this.gitManager.getStatus(options);

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get git status: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * パスを絶対パスに解決
   * @param filePath - ファイルパス
   * @returns 絶対パス
   */
  private resolvePath(filePath: string): string {
    // 既に絶対パスの場合はそのまま返す
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }
    // 相対パスの場合はワークスペースからの相対パスとして解決
    return path.normalize(path.join(this.context.workspacePath, filePath));
  }

  /**
   * パスがワークスペース内かチェック
   * @param absolutePath - 絶対パス
   * @returns ワークスペース内の場合はtrue
   */
  private isWithinWorkspace(absolutePath: string): boolean {
    const normalizedWorkspace = path.normalize(this.context.workspacePath);
    const normalizedPath = path.normalize(absolutePath);
    return normalizedPath.startsWith(normalizedWorkspace);
  }

  /**
   * ディレクトリエントリのタイプを取得
   * @param entry - ディレクトリエントリ
   * @returns エントリタイプ
   */
  private getEntryType(entry: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): DirectoryEntry['type'] {
    if (entry.isFile()) return 'file';
    if (entry.isDirectory()) return 'directory';
    if (entry.isSymbolicLink()) return 'symlink';
    return 'other';
  }

  /**
   * 編集操作を適用
   * @param content - 元のファイル内容
   * @param edits - 編集操作の配列
   * @returns 編集後の内容
   */
  private applyEdits(content: string, edits: FileEdit[]): ToolResult<string> {
    // 行に分割
    const lines = content.split('\n');

    // 編集を行番号の降順でソート（後ろから適用するため）
    const sortedEdits = [...edits].sort((a, b) => b.startLine - a.startLine);

    // 各編集を適用
    for (const edit of sortedEdits) {
      // 行番号のバリデーション
      if (edit.startLine < 1) {
        return {
          success: false,
          error: `Invalid start line: ${edit.startLine}. Line numbers are 1-indexed.`,
        };
      }

      const startIndex = edit.startLine - 1; // 0-indexed

      switch (edit.type) {
        case 'replace': {
          // 終了行のバリデーション
          const endLine = edit.endLine ?? edit.startLine;
          if (endLine < edit.startLine) {
            return {
              success: false,
              error: `Invalid end line: ${endLine}. End line must be >= start line.`,
            };
          }
          if (endLine > lines.length) {
            return {
              success: false,
              error: `End line ${endLine} exceeds file length (${lines.length} lines).`,
            };
          }

          const endIndex = endLine; // 0-indexed exclusive
          const newLines = edit.content?.split('\n') ?? [];
          lines.splice(startIndex, endIndex - startIndex, ...newLines);
          break;
        }

        case 'insert': {
          // 挿入位置のバリデーション
          if (startIndex > lines.length) {
            return {
              success: false,
              error: `Insert position ${edit.startLine} exceeds file length (${lines.length} lines).`,
            };
          }

          const newLines = edit.content?.split('\n') ?? [];
          lines.splice(startIndex, 0, ...newLines);
          break;
        }

        case 'delete': {
          // 終了行のバリデーション
          const endLine = edit.endLine ?? edit.startLine;
          if (endLine < edit.startLine) {
            return {
              success: false,
              error: `Invalid end line: ${endLine}. End line must be >= start line.`,
            };
          }
          if (endLine > lines.length) {
            return {
              success: false,
              error: `End line ${endLine} exceeds file length (${lines.length} lines).`,
            };
          }

          const endIndex = endLine; // 0-indexed exclusive
          lines.splice(startIndex, endIndex - startIndex);
          break;
        }

        default:
          return {
            success: false,
            error: `Unknown edit type: ${(edit as FileEdit).type}`,
          };
      }
    }

    return {
      success: true,
      data: lines.join('\n'),
    };
  }
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 編集操作を適用した結果を計算（純粋関数）
 *
 * テスト用に公開されるユーティリティ関数。
 * ファイルI/Oを行わずに編集結果を計算する。
 *
 * @param content - 元のファイル内容
 * @param edits - 編集操作の配列
 * @returns 編集後の内容
 */
export function applyEditsToContent(content: string, edits: FileEdit[]): ToolResult<string> {
  const executor = new ToolExecutor();
  // プライベートメソッドにアクセスするためのワークアラウンド
  return (executor as unknown as { applyEdits(content: string, edits: FileEdit[]): ToolResult<string> }).applyEdits(content, edits);
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのToolExecutorインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const toolExecutor = new ToolExecutor();
