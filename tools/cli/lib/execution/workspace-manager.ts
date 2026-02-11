/**
 * ワークスペースマネージャー
 *
 * コーディングエージェントの作業ディレクトリを管理する。
 * リポジトリのclone、ブランチ作成、新規プロジェクト作成、クリーンアップを担当。
 *
 * @module execution/workspace-manager
 * @see Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { constants } from 'node:fs';

// =============================================================================
// 型定義
// =============================================================================

/**
 * ワークスペース情報
 * @description 作業ディレクトリのメタデータ
 */
export interface WorkspaceInfo {
  /** プロジェクトID */
  projectId: string;
  /** ワークスペースパス */
  path: string;
  /** GitリポジトリURL（clone元） */
  gitUrl?: string;
  /** 現在のブランチ名 */
  currentBranch?: string;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
}

/**
 * 新規ワークスペースオプション
 * @description 新規プロジェクト作成時のオプション
 */
export interface NewWorkspaceOptions {
  /** GitHubリポジトリを自動作成するか */
  createGithubRepo?: boolean;
  /** GitHubリポジトリの公開設定 */
  isPrivate?: boolean;
  /** 初期ブランチ名 */
  initialBranch?: string;
}

/**
 * ワークスペースマネージャーエラー
 */
export class WorkspaceManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'WorkspaceManagerError';
  }
}

// =============================================================================
// 定数
// =============================================================================

/** デフォルトのワークスペースルート */
const DEFAULT_WORKSPACE_ROOT = 'runtime/workspaces';

/** タスクブランチプレフィックス */
const TASK_BRANCH_PREFIX = 'agent/';

/** ワークスペースメタデータファイル名 */
const WORKSPACE_META_FILE = 'workspace.json';

// =============================================================================
// WorkspaceManager
// =============================================================================

/**
 * ワークスペースマネージャー
 *
 * コーディングエージェントの作業ディレクトリを管理する。
 *
 * @see Requirement 6.1: THE WorkspaceManager SHALL clone repositories to isolated working directories
 * @see Requirement 6.6: THE WorkspaceManager SHALL manage working directories under `runtime/workspaces/<project-id>/`
 */
export class WorkspaceManager {
  /** ワークスペースルートディレクトリ */
  private readonly workspaceRoot: string;

  /**
   * コンストラクタ
   * @param workspaceRoot - ワークスペースルートディレクトリ
   */
  constructor(workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * リポジトリをcloneして作業ディレクトリを準備
   *
   * @param projectId - プロジェクトID
   * @param gitUrl - GitリポジトリURL
   * @param branch - チェックアウトするブランチ（オプション）
   * @returns ワークスペースパス（repoディレクトリ）
   * @throws {WorkspaceManagerError} clone失敗時
   * @see Requirement 6.1: THE WorkspaceManager SHALL clone repositories
   */
  async prepareWorkspace(
    projectId: string,
    gitUrl: string,
    branch?: string
  ): Promise<string> {
    const projectDir = this.getProjectDir(projectId);
    const repoDir = join(projectDir, 'repo');

    // プロジェクトディレクトリを作成
    await mkdir(projectDir, { recursive: true });

    // 既にclone済みかチェック
    const alreadyCloned = await this.directoryExists(join(repoDir, '.git'));

    if (alreadyCloned) {
      // 既存リポジトリをpull
      await this.execGit(['fetch', '--all'], repoDir);
      if (branch) {
        await this.execGit(['checkout', branch], repoDir);
        await this.execGit(['pull', 'origin', branch], repoDir);
      }
    } else {
      // 新規clone
      const cloneArgs = ['clone', gitUrl, 'repo'];
      if (branch) {
        cloneArgs.push('--branch', branch);
      }
      await this.execGit(cloneArgs, projectDir);
    }

    // メタデータを保存
    await this.saveWorkspaceInfo({
      projectId,
      path: repoDir,
      gitUrl,
      currentBranch: branch,
      createdAt: new Date().toISOString(),
    });

    return resolve(repoDir);
  }

  /**
   * 新規プロジェクト用のワークスペースを作成
   *
   * git initで新規リポジトリを作成し、オプションでGitHubリポジトリも作成する。
   *
   * @param projectId - プロジェクトID
   * @param options - 新規ワークスペースオプション
   * @returns ワークスペースパス
   * @throws {WorkspaceManagerError} 作成失敗時
   * @see Requirement 6.3: THE WorkspaceManager SHALL support new projects (git init)
   * @see Requirement 6.4: FOR new projects, THE WorkspaceManager SHALL optionally create GitHub repository
   */
  async createNewWorkspace(
    projectId: string,
    options: NewWorkspaceOptions = {}
  ): Promise<string> {
    const projectDir = this.getProjectDir(projectId);
    const repoDir = join(projectDir, 'repo');

    // ディレクトリを作成
    await mkdir(repoDir, { recursive: true });

    // git init
    const initialBranch = options.initialBranch ?? 'main';
    await this.execGit(['init', '--initial-branch', initialBranch], repoDir);

    // 初期コミット
    await writeFile(join(repoDir, 'README.md'), `# ${projectId}\n`);
    await this.execGit(['add', '.'], repoDir);
    await this.execGit(['commit', '-m', 'Initial commit'], repoDir);

    // GitHubリポジトリを作成（オプション）
    if (options.createGithubRepo) {
      await this.createGithubRepo(projectId, repoDir, options.isPrivate ?? true);
    }

    // メタデータを保存
    await this.saveWorkspaceInfo({
      projectId,
      path: repoDir,
      currentBranch: initialBranch,
      createdAt: new Date().toISOString(),
    });

    return resolve(repoDir);
  }

  /**
   * タスクブランチを作成
   *
   * @param workspacePath - ワークスペースパス
   * @param ticketId - チケットID
   * @param description - ブランチ説明
   * @returns 作成されたブランチ名
   * @throws {WorkspaceManagerError} ブランチ作成失敗時
   * @see Requirement 6.2: THE WorkspaceManager SHALL create task branches following `agent/<ticket-id>-<description>` format
   */
  async createTaskBranch(
    workspacePath: string,
    ticketId: string,
    description: string
  ): Promise<string> {
    // ブランチ名を生成（特殊文字をサニタイズ）
    const sanitized = description
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    const branchName = `${TASK_BRANCH_PREFIX}${ticketId}-${sanitized}`;

    // ブランチを作成してチェックアウト
    await this.execGit(['checkout', '-b', branchName], workspacePath);

    return branchName;
  }

  /**
   * 作業ディレクトリをクリーンアップ
   *
   * @param workspacePath - クリーンアップ対象のパス
   * @throws {WorkspaceManagerError} クリーンアップ失敗時
   * @see Requirement 6.5: THE WorkspaceManager SHALL clean up working directories
   */
  async cleanup(workspacePath: string): Promise<void> {
    try {
      await rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      throw new WorkspaceManagerError(
        `ワークスペースのクリーンアップに失敗しました: ${workspacePath}`,
        'CLEANUP_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * ワークスペース情報を取得
   *
   * @param projectId - プロジェクトID
   * @returns ワークスペース情報、存在しない場合null
   */
  async getWorkspaceInfo(projectId: string): Promise<WorkspaceInfo | null> {
    const metaPath = join(this.getProjectDir(projectId), WORKSPACE_META_FILE);
    try {
      const content = await readFile(metaPath, 'utf-8');
      return JSON.parse(content) as WorkspaceInfo;
    } catch {
      return null;
    }
  }

  /**
   * プロジェクトディレクトリのパスを取得
   * @param projectId - プロジェクトID
   * @returns プロジェクトディレクトリパス
   */
  getProjectDir(projectId: string): string {
    return join(this.workspaceRoot, projectId);
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * ワークスペース情報を保存
   * @param info - ワークスペース情報
   */
  private async saveWorkspaceInfo(info: WorkspaceInfo): Promise<void> {
    const metaPath = join(this.getProjectDir(info.projectId), WORKSPACE_META_FILE);
    await writeFile(metaPath, JSON.stringify(info, null, 2));
  }

  /**
   * ディレクトリが存在するかチェック
   * @param dirPath - チェック対象のパス
   * @returns 存在する場合true
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      await access(dirPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gitコマンドを実行
   *
   * @param args - gitコマンド引数
   * @param cwd - 作業ディレクトリ
   * @returns 標準出力
   * @throws {WorkspaceManagerError} コマンド失敗時
   */
  private execGit(args: string[], cwd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(
            new WorkspaceManagerError(
              `git ${args.join(' ')} が失敗しました (exit code: ${code}): ${stderr}`,
              'GIT_ERROR'
            )
          );
        }
      });

      child.on('error', (error: Error) => {
        reject(
          new WorkspaceManagerError(
            `gitコマンドの実行に失敗しました: ${error.message}`,
            'GIT_SPAWN_ERROR',
            error
          )
        );
      });
    });
  }

  /**
   * GitHub CLIでリポジトリを作成
   *
   * @param projectId - プロジェクトID
   * @param repoDir - リポジトリディレクトリ
   * @param isPrivate - プライベートリポジトリにするか
   * @throws {WorkspaceManagerError} 作成失敗時
   * @see Requirement 6.4: FOR new projects, THE WorkspaceManager SHALL optionally create GitHub repository
   */
  private createGithubRepo(
    projectId: string,
    repoDir: string,
    isPrivate: boolean
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const visibility = isPrivate ? '--private' : '--public';
      const child = spawn(
        'gh',
        ['repo', 'create', projectId, visibility, '--source', repoDir, '--push'],
        {
          cwd: repoDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        }
      );

      let stderr = '';

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new WorkspaceManagerError(
              `GitHubリポジトリの作成に失敗しました: ${stderr}`,
              'GITHUB_CREATE_ERROR'
            )
          );
        }
      });

      child.on('error', (error: Error) => {
        reject(
          new WorkspaceManagerError(
            `gh CLIの実行に失敗しました。gh CLIがインストールされているか確認してください: ${error.message}`,
            'GH_CLI_ERROR',
            error
          )
        );
      });
    });
  }
}

/**
 * デフォルトのWorkspaceManagerインスタンスを作成
 * @param workspaceRoot - ワークスペースルートディレクトリ
 * @returns WorkspaceManagerインスタンス
 */
export function createWorkspaceManager(workspaceRoot?: string): WorkspaceManager {
  return new WorkspaceManager(workspaceRoot);
}
