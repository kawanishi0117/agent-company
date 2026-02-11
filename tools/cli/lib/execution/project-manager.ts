/**
 * Project Manager - プロジェクト管理
 *
 * 複数のプロジェクトを管理し、リポジトリ情報を提供する。
 *
 * @module execution/project-manager
 * @see Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6
 * @see Requirements: 1.1, 1.2, 1.5 (autonomous-agent-workflow)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ExtendedProject,
  ExtendedAddProjectOptions,
  GitUrlValidationResult,
  DEFAULT_BRANCH_CONFIG,
  generateAgentBranchName,
  EnsureAgentBranchResult,
} from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * プロジェクト設定ファイルのパス
 * @see Requirement 22.1: THE System SHALL manage projects in `workspaces/projects.json`
 */
const PROJECTS_FILE = 'workspaces/projects.json';

// =============================================================================
// 型定義
// =============================================================================

/**
 * プロジェクト一覧
 * @description ExtendedProjectを使用してブランチ設定を含む
 * @see Requirements: 1.1, 1.2, 1.5
 */
interface ProjectsData {
  /** プロジェクト一覧（ExtendedProject形式） */
  projects: ExtendedProject[];
  /** 最終更新日時 */
  lastUpdated: string;
}

// =============================================================================
// ProjectManager クラス
// =============================================================================

/**
 * ProjectManager - プロジェクト管理マネージャー
 *
 * 複数のプロジェクトを管理し、リポジトリ情報を提供する。
 *
 * @see Requirement 22.1: THE System SHALL manage projects in `workspaces/projects.json`
 * @see Requirement 22.3: THE project config SHALL include: id, name, git_url, default_branch, work_dir
 */
export class ProjectManager {
  /**
   * プロジェクト設定ファイルのパス
   */
  private readonly projectsFile: string;

  /**
   * キャッシュされたプロジェクトデータ
   */
  private cachedData: ProjectsData | null = null;

  /**
   * コンストラクタ
   * @param projectsFile - プロジェクト設定ファイルのパス（デフォルト: 'workspaces/projects.json'）
   */
  constructor(projectsFile: string = PROJECTS_FILE) {
    this.projectsFile = projectsFile;
  }

  // ===========================================================================
  // ファイル操作
  // ===========================================================================

  /**
   * プロジェクトデータを読み込み
   * @returns プロジェクトデータ
   */
  private async loadData(): Promise<ProjectsData> {
    // キャッシュがあれば返す
    if (this.cachedData) {
      return this.cachedData;
    }

    try {
      // ディレクトリが存在することを確認
      const dir = path.dirname(this.projectsFile);
      await fs.mkdir(dir, { recursive: true });

      // ファイルを読み込み
      const content = await fs.readFile(this.projectsFile, 'utf-8');
      this.cachedData = JSON.parse(content) as ProjectsData;
      return this.cachedData;
    } catch (error) {
      // ファイルが存在しない場合は空のデータを返す
      if (this.isFileNotFoundError(error)) {
        const emptyData: ProjectsData = {
          projects: [],
          lastUpdated: new Date().toISOString(),
        };
        this.cachedData = emptyData;
        return emptyData;
      }
      throw error;
    }
  }

  /**
   * プロジェクトデータを保存
   * @param data - 保存するデータ
   */
  private async saveData(data: ProjectsData): Promise<void> {
    // ディレクトリが存在することを確認
    const dir = path.dirname(this.projectsFile);
    await fs.mkdir(dir, { recursive: true });

    // データを更新
    data.lastUpdated = new Date().toISOString();

    // アトミック書き込み: 一時ファイルに書き込んでからリネーム
    const tmpFile = `${this.projectsFile}.tmp.${Date.now()}`;
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpFile, this.projectsFile);

    // キャッシュを更新
    this.cachedData = data;
  }

  /**
   * ファイルが存在しないエラーかどうかを判定
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }

  // ===========================================================================
  // プロジェクト管理
  // ===========================================================================

  /**
   * プロジェクト一覧を取得
   *
   * @returns プロジェクト一覧（ExtendedProject形式）
   *
   * @see Requirement 22.5: `npx tsx tools/cli/agentcompany.ts project list` SHALL show all projects
   * @see Requirements: 1.1, 1.2 (autonomous-agent-workflow)
   */
  async listProjects(): Promise<ExtendedProject[]> {
    const data = await this.loadData();
    return data.projects;
  }

  /**
   * プロジェクトを取得
   *
   * @param projectId - プロジェクトID
   * @returns プロジェクト（存在しない場合はnull）
   * @see Requirements: 1.1, 1.2 (autonomous-agent-workflow)
   */
  async getProject(projectId: string): Promise<ExtendedProject | null> {
    const data = await this.loadData();
    return data.projects.find((p) => p.id === projectId) ?? null;
  }

  // ===========================================================================
  // Git URL検証
  // ===========================================================================

  /**
   * Git URLの形式を検証
   *
   * @param url - 検証するGit URL
   * @returns 有効な形式の場合はtrue
   *
   * @description
   * 以下の形式をサポート:
   * - HTTPS: https://github.com/user/repo.git
   * - SSH: git@github.com:user/repo.git
   */
  static isValidGitUrlFormat(url: string): boolean {
    // HTTPS形式: https://hostname/path または http://hostname/path
    const httpsPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

    // SSH形式: git@hostname:path または ssh://git@hostname/path
    const sshPattern = /^(git@[^\s:]+:[^\s]+|ssh:\/\/git@[^\s/]+\/[^\s]+)$/i;

    return httpsPattern.test(url) || sshPattern.test(url);
  }

  /**
   * Git URLを検証
   *
   * URL形式の検証と、オプションでリモートリポジトリへのアクセシビリティチェックを行う。
   *
   * @param url - 検証するGit URL
   * @param options - 検証オプション
   * @param options.checkAccessibility - アクセシビリティチェックを行うか（デフォルト: false）
   * @param options.timeoutSeconds - アクセシビリティチェックのタイムアウト秒数（デフォルト: 30）
   * @returns 検証結果
   *
   * @see Requirement 1.3: WHEN a project is registered, THE System SHALL validate that the Git URL is accessible
   *
   * @example
   * ```typescript
   * // 形式のみ検証
   * const result = await projectManager.validateGitUrl('https://github.com/user/repo.git');
   *
   * // アクセシビリティも検証
   * const result = await projectManager.validateGitUrl('https://github.com/user/repo.git', {
   *   checkAccessibility: true
   * });
   * ```
   */
  async validateGitUrl(
    url: string,
    options?: {
      checkAccessibility?: boolean;
      timeoutSeconds?: number;
    }
  ): Promise<GitUrlValidationResult> {
    const { checkAccessibility = false, timeoutSeconds = 30 } = options ?? {};

    // 1. URL形式の検証
    if (!ProjectManager.isValidGitUrlFormat(url)) {
      return {
        valid: false,
        formatValid: false,
        accessible: false,
        error: 'Git URLの形式が無効です。https:// または git@ で始まるURLを指定してください。',
      };
    }

    // 形式は有効
    const result: GitUrlValidationResult = {
      valid: true,
      formatValid: true,
      accessible: false,
    };

    // 2. アクセシビリティチェック（オプション）
    if (checkAccessibility) {
      try {
        const accessResult = await this.checkGitUrlAccessibility(url, timeoutSeconds);
        result.accessible = accessResult.accessible;
        if (!accessResult.accessible) {
          result.valid = false;
          result.error = accessResult.error;
        }
      } catch (error) {
        // ネットワークエラーなどの場合
        result.accessible = false;
        result.valid = false;
        result.error =
          error instanceof Error
            ? `アクセシビリティチェックに失敗しました: ${error.message}`
            : 'アクセシビリティチェックに失敗しました';
      }
    }

    return result;
  }

  /**
   * Git URLへのアクセシビリティをチェック
   *
   * git ls-remote コマンドを使用してリモートリポジトリにアクセスできるか確認する。
   *
   * @param url - チェックするGit URL
   * @param timeoutSeconds - タイムアウト秒数
   * @returns アクセシビリティチェック結果
   *
   * @private
   */
  private async checkGitUrlAccessibility(
    url: string,
    timeoutSeconds: number
  ): Promise<{ accessible: boolean; error?: string }> {
    const { spawn } = await import('child_process');

    return new Promise((resolve) => {
      // git ls-remote --exit-code を使用してリポジトリの存在確認
      // --exit-code: リモートrefが見つからない場合は非ゼロで終了
      const process = spawn('git', ['ls-remote', '--exit-code', '--heads', url], {
        timeout: timeoutSeconds * 1000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ accessible: true });
        } else {
          // エラーメッセージを解析して適切なエラーを返す
          const errorMessage = this.parseGitLsRemoteError(stderr, code);
          resolve({ accessible: false, error: errorMessage });
        }
      });

      process.on('error', (error) => {
        resolve({
          accessible: false,
          error: `gitコマンドの実行に失敗しました: ${error.message}`,
        });
      });
    });
  }

  /**
   * git ls-remote のエラーメッセージを解析
   *
   * @param stderr - 標準エラー出力
   * @param exitCode - 終了コード
   * @returns ユーザーフレンドリーなエラーメッセージ
   *
   * @private
   */
  private parseGitLsRemoteError(stderr: string, exitCode: number | null): string {
    const lowerStderr = stderr.toLowerCase();

    // 認証エラー
    if (
      lowerStderr.includes('authentication failed') ||
      lowerStderr.includes('could not read username') ||
      lowerStderr.includes('permission denied')
    ) {
      return 'リポジトリへのアクセス権限がありません。認証情報を確認してください。';
    }

    // リポジトリが見つからない
    if (
      lowerStderr.includes('repository not found') ||
      lowerStderr.includes('not found') ||
      lowerStderr.includes('does not exist')
    ) {
      return 'リポジトリが見つかりません。URLが正しいか確認してください。';
    }

    // ホスト解決エラー
    if (
      lowerStderr.includes('could not resolve host') ||
      lowerStderr.includes('name or service not known')
    ) {
      return 'ホスト名を解決できません。ネットワーク接続とURLを確認してください。';
    }

    // 接続タイムアウト
    if (lowerStderr.includes('connection timed out') || lowerStderr.includes('timeout')) {
      return '接続がタイムアウトしました。ネットワーク接続を確認してください。';
    }

    // 接続拒否
    if (lowerStderr.includes('connection refused')) {
      return '接続が拒否されました。サーバーが利用可能か確認してください。';
    }

    // その他のエラー
    if (stderr.trim()) {
      return `リポジトリにアクセスできません: ${stderr.trim()}`;
    }

    return `リポジトリにアクセスできません（終了コード: ${exitCode}）`;
  }

  /**
   * プロジェクトを追加
   *
   * @param name - プロジェクト名
   * @param gitUrl - GitリポジトリURL
   * @param options - 追加オプション（baseBranch, agentBranch含む）
   * @returns 追加されたプロジェクト（ExtendedProject形式）
   *
   * @throws {ProjectManagerError} Git URLの形式が無効な場合（コード: INVALID_GIT_URL）
   * @throws {ProjectManagerError} Git URLにアクセスできない場合（コード: GIT_URL_NOT_ACCESSIBLE）
   * @throws {ProjectManagerError} 同名のプロジェクトが存在する場合（コード: PROJECT_EXISTS）
   *
   * @see Requirement 22.6: `npx tsx tools/cli/agentcompany.ts project add <name> <git-url>` SHALL register project
   * @see Requirement 1.1: THE Project SHALL include `baseBranch` field for PR target branch (default: 'main')
   * @see Requirement 1.2: THE Project SHALL include `agentBranch` field for agent work integration branch (default: 'agent/<project-id>')
   * @see Requirement 1.3: WHEN a project is registered, THE System SHALL validate that the Git URL is accessible
   * @see Requirement 1.5: THE Project config SHALL be stored in `workspaces/projects.json`
   */
  async addProject(
    name: string,
    gitUrl: string,
    options?: ExtendedAddProjectOptions
  ): Promise<ExtendedProject> {
    // Git URL検証
    // @see Requirement 1.3: WHEN a project is registered, THE System SHALL validate that the Git URL is accessible
    const skipValidation = options?.skipGitUrlValidation ?? false;
    const checkAccessibility = options?.validateAccessibility ?? false;

    if (!skipValidation) {
      const validationResult = await this.validateGitUrl(gitUrl, {
        checkAccessibility,
        timeoutSeconds: options?.validationTimeoutSeconds,
      });

      if (!validationResult.formatValid) {
        throw new ProjectManagerError(
          validationResult.error ?? 'Git URLの形式が無効です',
          'INVALID_GIT_URL'
        );
      }

      if (checkAccessibility && !validationResult.accessible) {
        throw new ProjectManagerError(
          validationResult.error ?? 'Git URLにアクセスできません',
          'GIT_URL_NOT_ACCESSIBLE'
        );
      }
    }

    const data = await this.loadData();

    // 同名のプロジェクトが存在するかチェック
    const existing = data.projects.find((p) => p.name === name);
    if (existing) {
      throw new ProjectManagerError(`プロジェクト "${name}" は既に存在します`, 'PROJECT_EXISTS');
    }

    // プロジェクトIDを生成
    const id = this.generateProjectId(name);

    // 作業ディレクトリを決定
    const workDir = options?.workDir ?? path.join('workspaces', id);

    // ブランチ設定のデフォルト値を適用
    // @see Requirement 1.1: baseBranch default is 'main'
    const baseBranch = options?.baseBranch ?? DEFAULT_BRANCH_CONFIG.baseBranch;
    // @see Requirement 1.2: agentBranch default is 'agent/<project-id>'
    const agentBranch = options?.agentBranch ?? generateAgentBranchName(id);

    // エージェントブランチの確保（validateAccessibilityがtrueの場合）
    // @see Requirement 1.4: WHEN a project is registered, THE System SHALL create the agent branch if it does not exist
    if (checkAccessibility) {
      const branchResult = await this.ensureAgentBranch(gitUrl, agentBranch, baseBranch, {
        timeoutSeconds: options?.validationTimeoutSeconds,
      });

      if (!branchResult.success) {
        throw new ProjectManagerError(
          branchResult.error ?? 'エージェントブランチの確保に失敗しました',
          'AGENT_BRANCH_CREATION_FAILED'
        );
      }
    }

    // プロジェクトを作成（ExtendedProject形式）
    const now = new Date().toISOString();
    const project: ExtendedProject = {
      id,
      name,
      gitUrl,
      defaultBranch: options?.defaultBranch ?? 'main',
      integrationBranch: options?.integrationBranch ?? 'develop',
      workDir,
      createdAt: now,
      lastUsed: now,
      // 新規フィールド: ブランチ設定
      baseBranch,
      agentBranch,
    };

    // プロジェクトを追加
    data.projects.push(project);

    // 保存
    // @see Requirement 1.5: THE Project config SHALL be stored in `workspaces/projects.json`
    await this.saveData(data);

    return project;
  }

  /**
   * プロジェクトを削除
   *
   * @param projectId - プロジェクトID
   * @returns 削除に成功した場合はtrue
   */
  async removeProject(projectId: string): Promise<boolean> {
    const data = await this.loadData();

    const index = data.projects.findIndex((p) => p.id === projectId);
    if (index === -1) {
      return false;
    }

    // プロジェクトを削除
    data.projects.splice(index, 1);

    // 保存
    await this.saveData(data);

    return true;
  }

  /**
   * プロジェクトを更新
   *
   * @param projectId - プロジェクトID
   * @param updates - 更新内容（baseBranch, agentBranch含む）
   * @returns 更新されたプロジェクト（存在しない場合はnull）
   * @see Requirements: 1.1, 1.2 (autonomous-agent-workflow)
   */
  async updateProject(
    projectId: string,
    updates: Partial<Omit<ExtendedProject, 'id' | 'createdAt'>>
  ): Promise<ExtendedProject | null> {
    const data = await this.loadData();

    const project = data.projects.find((p) => p.id === projectId);
    if (!project) {
      return null;
    }

    // プロジェクトを更新
    Object.assign(project, updates);

    // 保存
    await this.saveData(data);

    return project;
  }

  /**
   * プロジェクトの最終使用日時を更新
   *
   * @param projectId - プロジェクトID
   */
  async touchProject(projectId: string): Promise<void> {
    await this.updateProject(projectId, {
      lastUsed: new Date().toISOString(),
    });
  }

  /**
   * プロジェクトが存在するかチェック
   *
   * @param projectId - プロジェクトID
   * @returns 存在する場合はtrue
   */
  async exists(projectId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    return project !== null;
  }

  // ===========================================================================
  // エージェントブランチ管理
  // ===========================================================================

  /**
   * エージェントブランチが存在することを確認し、存在しなければ作成する
   *
   * リモートリポジトリにエージェントブランチが存在するか確認し、
   * 存在しない場合はベースブランチから新しいブランチを作成してプッシュする。
   *
   * @param gitUrl - GitリポジトリURL
   * @param agentBranch - エージェントブランチ名
   * @param baseBranch - ベースブランチ名（デフォルト: 'main'）
   * @param options - オプション
   * @param options.timeoutSeconds - タイムアウト秒数（デフォルト: 60）
   * @returns ブランチ確保の結果
   *
   * @see Requirement 1.4: WHEN a project is registered, THE System SHALL create the agent branch if it does not exist
   *
   * @example
   * ```typescript
   * // エージェントブランチを確保
   * const result = await projectManager.ensureAgentBranch(
   *   'https://github.com/user/repo.git',
   *   'agent/my-project',
   *   'main'
   * );
   *
   * if (result.created) {
   *   console.log('新しいブランチを作成しました');
   * } else if (result.exists) {
   *   console.log('ブランチは既に存在します');
   * }
   * ```
   */
  async ensureAgentBranch(
    gitUrl: string,
    agentBranch: string,
    baseBranch: string = 'main',
    options?: {
      timeoutSeconds?: number;
    }
  ): Promise<EnsureAgentBranchResult> {
    const timeoutSeconds = options?.timeoutSeconds ?? 60;

    try {
      // 1. リモートブランチの存在確認
      const branchExists = await this.checkRemoteBranchExists(gitUrl, agentBranch, timeoutSeconds);

      if (branchExists) {
        // ブランチが既に存在する場合
        return {
          success: true,
          exists: true,
          created: false,
          branchName: agentBranch,
        };
      }

      // 2. ベースブランチの存在確認
      const baseExists = await this.checkRemoteBranchExists(gitUrl, baseBranch, timeoutSeconds);

      if (!baseExists) {
        return {
          success: false,
          exists: false,
          created: false,
          branchName: agentBranch,
          error: `ベースブランチ '${baseBranch}' がリモートリポジトリに存在しません`,
        };
      }

      // 3. エージェントブランチを作成
      const createResult = await this.createRemoteBranch(
        gitUrl,
        agentBranch,
        baseBranch,
        timeoutSeconds
      );

      if (!createResult.success) {
        return {
          success: false,
          exists: false,
          created: false,
          branchName: agentBranch,
          error: createResult.error,
        };
      }

      return {
        success: true,
        exists: false,
        created: true,
        branchName: agentBranch,
      };
    } catch (error) {
      return {
        success: false,
        exists: false,
        created: false,
        branchName: agentBranch,
        error: error instanceof Error ? error.message : 'エージェントブランチの確保に失敗しました',
      };
    }
  }

  /**
   * リモートブランチが存在するか確認
   *
   * @param gitUrl - GitリポジトリURL
   * @param branchName - ブランチ名
   * @param timeoutSeconds - タイムアウト秒数
   * @returns ブランチが存在する場合はtrue
   *
   * @private
   */
  private async checkRemoteBranchExists(
    gitUrl: string,
    branchName: string,
    timeoutSeconds: number
  ): Promise<boolean> {
    const { spawn } = await import('child_process');

    return new Promise((resolve) => {
      // git ls-remote --heads でリモートブランチを確認
      const process = spawn('git', ['ls-remote', '--heads', gitUrl, branchName], {
        timeout: timeoutSeconds * 1000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';

      process.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          // ブランチが見つかった場合、出力にブランチ名が含まれる
          resolve(stdout.includes(`refs/heads/${branchName}`));
        } else {
          resolve(false);
        }
      });

      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * リモートブランチを作成
   *
   * ベースブランチから新しいブランチを作成し、リモートにプッシュする。
   * 一時ディレクトリにリポジトリをクローンして操作を行う。
   *
   * @param gitUrl - GitリポジトリURL
   * @param newBranch - 作成するブランチ名
   * @param baseBranch - ベースブランチ名
   * @param timeoutSeconds - タイムアウト秒数
   * @returns 作成結果
   *
   * @private
   */
  private async createRemoteBranch(
    gitUrl: string,
    newBranch: string,
    baseBranch: string,
    timeoutSeconds: number
  ): Promise<{ success: boolean; error?: string }> {
    const os = await import('os');

    // 一時ディレクトリを作成
    const tempDir = path.join(os.tmpdir(), `agentcompany-branch-${Date.now()}`);

    try {
      // 一時ディレクトリを作成
      await fs.mkdir(tempDir, { recursive: true });

      // 1. リポジトリをシャロークローン（ベースブランチのみ）
      const cloneResult = await this.executeGitCommand(
        ['clone', '--depth', '1', '--branch', baseBranch, gitUrl, tempDir],
        { timeout: timeoutSeconds * 1000 }
      );

      if (!cloneResult.success) {
        return {
          success: false,
          error: `リポジトリのクローンに失敗しました: ${cloneResult.error}`,
        };
      }

      // 2. 新しいブランチを作成
      const checkoutResult = await this.executeGitCommand(['checkout', '-b', newBranch], {
        cwd: tempDir,
        timeout: timeoutSeconds * 1000,
      });

      if (!checkoutResult.success) {
        return {
          success: false,
          error: `ブランチの作成に失敗しました: ${checkoutResult.error}`,
        };
      }

      // 3. リモートにプッシュ
      const pushResult = await this.executeGitCommand(['push', '-u', 'origin', newBranch], {
        cwd: tempDir,
        timeout: timeoutSeconds * 1000,
      });

      if (!pushResult.success) {
        return {
          success: false,
          error: `ブランチのプッシュに失敗しました: ${pushResult.error}`,
        };
      }

      return { success: true };
    } finally {
      // 一時ディレクトリを削除
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // 削除に失敗しても無視
      }
    }
  }

  /**
   * Gitコマンドを実行
   *
   * @param args - gitコマンドの引数
   * @param options - 実行オプション
   * @returns 実行結果
   *
   * @private
   */
  private async executeGitCommand(
    args: string[],
    options?: {
      cwd?: string;
      timeout?: number;
    }
  ): Promise<{ success: boolean; stdout?: string; error?: string }> {
    const { spawn } = await import('child_process');

    return new Promise((resolve) => {
      const process = spawn('git', args, {
        cwd: options?.cwd,
        timeout: options?.timeout ?? 60000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, stdout });
        } else {
          resolve({ success: false, error: stderr || `終了コード: ${code}` });
        }
      });

      process.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cachedData = null;
  }

  // ===========================================================================
  // ユーティリティ
  // ===========================================================================

  /**
   * プロジェクトIDを生成
   *
   * @param name - プロジェクト名
   * @returns プロジェクトID
   */
  private generateProjectId(name: string): string {
    // 名前をスラッグ化
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // ランダムなサフィックスを追加
    const suffix = crypto.randomUUID().substring(0, 8);

    return `${slug}-${suffix}`;
  }
}

// =============================================================================
// エラークラス
// =============================================================================

/**
 * ProjectManagerエラー
 */
export class ProjectManagerError extends Error {
  /** エラーコード */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ProjectManagerError';
    this.code = code;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * ProjectManagerを作成
 *
 * @param projectsFile - プロジェクト設定ファイルのパス
 * @returns ProjectManagerインスタンス
 */
export function createProjectManager(projectsFile?: string): ProjectManager {
  return new ProjectManager(projectsFile);
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのProjectManagerインスタンス
 */
export const projectManager = new ProjectManager();
