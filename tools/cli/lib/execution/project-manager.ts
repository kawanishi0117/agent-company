/**
 * Project Manager - プロジェクト管理
 *
 * 複数のプロジェクトを管理し、リポジトリ情報を提供する。
 *
 * @module execution/project-manager
 * @see Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Project } from './types';

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
 */
interface ProjectsData {
  /** プロジェクト一覧 */
  projects: Project[];
  /** 最終更新日時 */
  lastUpdated: string;
}

/**
 * プロジェクト追加オプション
 */
export interface AddProjectOptions {
  /** デフォルトブランチ（デフォルト: 'main'） */
  defaultBranch?: string;
  /** 統合ブランチ（デフォルト: 'develop'） */
  integrationBranch?: string;
  /** 作業ディレクトリ */
  workDir?: string;
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

    // ファイルに保存
    await fs.writeFile(this.projectsFile, JSON.stringify(data, null, 2), 'utf-8');

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
   * @returns プロジェクト一覧
   *
   * @see Requirement 22.5: `npx tsx tools/cli/agentcompany.ts project list` SHALL show all projects
   */
  async listProjects(): Promise<Project[]> {
    const data = await this.loadData();
    return data.projects;
  }

  /**
   * プロジェクトを取得
   *
   * @param projectId - プロジェクトID
   * @returns プロジェクト（存在しない場合はnull）
   */
  async getProject(projectId: string): Promise<Project | null> {
    const data = await this.loadData();
    return data.projects.find((p) => p.id === projectId) ?? null;
  }

  /**
   * プロジェクトを追加
   *
   * @param name - プロジェクト名
   * @param gitUrl - GitリポジトリURL
   * @param options - 追加オプション
   * @returns 追加されたプロジェクト
   *
   * @see Requirement 22.6: `npx tsx tools/cli/agentcompany.ts project add <name> <git-url>` SHALL register project
   */
  async addProject(
    name: string,
    gitUrl: string,
    options?: AddProjectOptions
  ): Promise<Project> {
    const data = await this.loadData();

    // 同名のプロジェクトが存在するかチェック
    const existing = data.projects.find((p) => p.name === name);
    if (existing) {
      throw new ProjectManagerError(
        `プロジェクト "${name}" は既に存在します`,
        'PROJECT_EXISTS'
      );
    }

    // プロジェクトIDを生成
    const id = this.generateProjectId(name);

    // 作業ディレクトリを決定
    const workDir = options?.workDir ?? path.join('workspaces', id);

    // プロジェクトを作成
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name,
      gitUrl,
      defaultBranch: options?.defaultBranch ?? 'main',
      integrationBranch: options?.integrationBranch ?? 'develop',
      workDir,
      createdAt: now,
      lastUsed: now,
    };

    // プロジェクトを追加
    data.projects.push(project);

    // 保存
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
   * @param updates - 更新内容
   * @returns 更新されたプロジェクト（存在しない場合はnull）
   */
  async updateProject(
    projectId: string,
    updates: Partial<Omit<Project, 'id' | 'createdAt'>>
  ): Promise<Project | null> {
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
