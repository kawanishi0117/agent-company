/**
 * ProjectManager拡張 プロパティテスト
 *
 * Property 1: Project Structure Completeness
 * - 任意のプロジェクトが作成またはロードされた場合、baseBranchとagentBranchフィールドが
 *   有効な文字列値で存在すること
 *
 * Property 2: Project Persistence Round-Trip
 * - 任意の有効なプロジェクト設定を保存後、読み込むと同等のプロジェクトオブジェクトが得られること
 *
 * **Validates: Requirements 1.1, 1.2, 1.5**
 *
 * @module tests/execution/project-manager.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectManager } from '../../tools/cli/lib/execution/project-manager';
import {
  ExtendedProject,
  DEFAULT_BRANCH_CONFIG,
  generateAgentBranchName,
  EXTENDED_PROJECT_REQUIRED_FIELDS,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_PROJECTS_DIR = 'runtime/test-runs/project-manager-property';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 有効なプロジェクト名を生成するArbitrary
 * - 1〜50文字の英数字とハイフン、アンダースコア
 * - 先頭は英字
 */
const projectNameArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
      minLength: 1,
      maxLength: 1,
    }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
      minLength: 0,
      maxLength: 49,
    })
  )
  .map(([first, rest]) => first + rest);

/**
 * 有効なGit URLを生成するArbitrary
 * - HTTPS形式のみ（テスト用に簡略化）
 */
const gitUrlArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('github.com', 'gitlab.com', 'bitbucket.org', 'git.example.com'),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
      minLength: 1,
      maxLength: 20,
    }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
      minLength: 1,
      maxLength: 20,
    })
  )
  .map(([host, user, repo]) => `https://${host}/${user}/${repo}.git`);

/**
 * 有効なブランチ名を生成するArbitrary
 * - 1〜50文字の英数字、ハイフン、スラッシュ、アンダースコア
 * - 先頭は英字
 */
const branchNameArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
      minLength: 1,
      maxLength: 1,
    }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-/_'.split('')), {
      minLength: 0,
      maxLength: 49,
    })
  )
  .map(([first, rest]) => first + rest);

/**
 * エージェントブランチ名を生成するArbitrary
 * - 'agent/'プレフィックス付き
 */
const agentBranchNameArb: fc.Arbitrary<string> = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
    minLength: 1,
    maxLength: 30,
  })
  .map((suffix) => `agent/${suffix}`);

/**
 * プロジェクト追加オプションを生成するArbitrary
 */
const addProjectOptionsArb = fc.record({
  baseBranch: fc.option(branchNameArb, { nil: undefined }),
  agentBranch: fc.option(agentBranchNameArb, { nil: undefined }),
  defaultBranch: fc.option(branchNameArb, { nil: undefined }),
  integrationBranch: fc.option(branchNameArb, { nil: undefined }),
  skipGitUrlValidation: fc.constant(true), // テスト用に常にスキップ
});

/**
 * ISO8601形式の日時文字列を生成するArbitrary
 */
const iso8601DateArb: fc.Arbitrary<string> = fc.date().map((d) => d.toISOString());

/**
 * 完全なExtendedProjectを生成するArbitrary（将来の拡張用）
 * @description 現在は未使用だが、将来のプロジェクト管理テスト拡張時に使用予定
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _extendedProjectArb: fc.Arbitrary<ExtendedProject> = fc
  .tuple(
    fc.uuid(),
    projectNameArb,
    gitUrlArb,
    branchNameArb,
    branchNameArb,
    branchNameArb,
    agentBranchNameArb,
    iso8601DateArb,
    iso8601DateArb
  )
  .map(
    ([
      id,
      name,
      gitUrl,
      defaultBranch,
      integrationBranch,
      baseBranch,
      agentBranch,
      createdAt,
      lastUsed,
    ]) => ({
      id,
      name,
      gitUrl,
      defaultBranch,
      integrationBranch,
      workDir: `workspaces/${id}`,
      createdAt,
      lastUsed,
      baseBranch,
      agentBranch,
    })
  );

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * テスト用の一時ディレクトリを作成
 */
async function createTestDir(suffix: string): Promise<string> {
  const testDir = path.join(TEST_PROJECTS_DIR, `test-${suffix}-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * テスト用の一時ディレクトリを削除
 */
async function removeTestDir(testDir: string): Promise<void> {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // 削除失敗は無視
  }
}

// =============================================================================
// Property 1: Project Structure Completeness
// =============================================================================

describe('Property 1: Project Structure Completeness', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * 任意のプロジェクトが作成またはロードされた場合、
   * baseBranchとagentBranchフィールドが有効な文字列値で存在すること
   */

  let testDir: string;
  let projectsFile: string;
  let projectManager: ProjectManager;

  beforeEach(async () => {
    testDir = await createTestDir('structure');
    projectsFile = path.join(testDir, 'projects.json');
    projectManager = new ProjectManager(projectsFile);
  });

  afterEach(async () => {
    await removeTestDir(testDir);
  });

  /**
   * Property 1.1: 作成されたプロジェクトにbaseBranchとagentBranchが存在する
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('Property 1.1: 作成されたプロジェクトにbaseBranchとagentBranchが存在する', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        gitUrlArb,
        addProjectOptionsArb,
        async (name, gitUrl, options) => {
          // ユニークな名前を生成（重複を避ける）
          const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          // プロジェクトを作成
          const project = await projectManager.addProject(uniqueName, gitUrl, options);

          // baseBranchフィールドが存在し、有効な文字列であること
          // @see Requirement 1.1: THE Project SHALL include `baseBranch` field
          expect(project).toHaveProperty('baseBranch');
          expect(typeof project.baseBranch).toBe('string');
          expect(project.baseBranch.length).toBeGreaterThan(0);

          // agentBranchフィールドが存在し、有効な文字列であること
          // @see Requirement 1.2: THE Project SHALL include `agentBranch` field
          expect(project).toHaveProperty('agentBranch');
          expect(typeof project.agentBranch).toBe('string');
          expect(project.agentBranch.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 1.2: デフォルト値が正しく適用される
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('Property 1.2: オプション未指定時にデフォルト値が正しく適用される', async () => {
    await fc.assert(
      fc.asyncProperty(projectNameArb, gitUrlArb, async (name, gitUrl) => {
        const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        // オプションなしでプロジェクトを作成
        const project = await projectManager.addProject(uniqueName, gitUrl, {
          skipGitUrlValidation: true,
        });

        // baseBranchのデフォルト値が'main'であること
        // @see Requirement 1.1: baseBranch default is 'main'
        expect(project.baseBranch).toBe(DEFAULT_BRANCH_CONFIG.baseBranch);

        // agentBranchのデフォルト値が'agent/<project-id>'形式であること
        // @see Requirement 1.2: agentBranch default is 'agent/<project-id>'
        expect(project.agentBranch).toBe(generateAgentBranchName(project.id));
        expect(project.agentBranch.startsWith(DEFAULT_BRANCH_CONFIG.agentBranchPrefix)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 1.3: カスタムブランチ設定が正しく適用される
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('Property 1.3: カスタムブランチ設定が正しく適用される', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        gitUrlArb,
        branchNameArb,
        agentBranchNameArb,
        async (name, gitUrl, customBaseBranch, customAgentBranch) => {
          const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          // カスタムブランチ設定でプロジェクトを作成
          const project = await projectManager.addProject(uniqueName, gitUrl, {
            baseBranch: customBaseBranch,
            agentBranch: customAgentBranch,
            skipGitUrlValidation: true,
          });

          // カスタムbaseBranchが適用されていること
          expect(project.baseBranch).toBe(customBaseBranch);

          // カスタムagentBranchが適用されていること
          expect(project.agentBranch).toBe(customAgentBranch);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 1.4: ロードされたプロジェクトにもbaseBranchとagentBranchが存在する
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('Property 1.4: ロードされたプロジェクトにもbaseBranchとagentBranchが存在する', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        gitUrlArb,
        addProjectOptionsArb,
        async (name, gitUrl, options) => {
          const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          // プロジェクトを作成
          const createdProject = await projectManager.addProject(uniqueName, gitUrl, options);

          // キャッシュをクリアして再読み込み
          projectManager.clearCache();

          // プロジェクトをロード
          const loadedProject = await projectManager.getProject(createdProject.id);

          // ロードされたプロジェクトが存在すること
          expect(loadedProject).not.toBeNull();

          // baseBranchフィールドが存在し、有効な文字列であること
          expect(loadedProject).toHaveProperty('baseBranch');
          expect(typeof loadedProject!.baseBranch).toBe('string');
          expect(loadedProject!.baseBranch.length).toBeGreaterThan(0);

          // agentBranchフィールドが存在し、有効な文字列であること
          expect(loadedProject).toHaveProperty('agentBranch');
          expect(typeof loadedProject!.agentBranch).toBe('string');
          expect(loadedProject!.agentBranch.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 1.5: 全ての必須フィールドが存在する
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('Property 1.5: 全ての必須フィールドが存在する', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        gitUrlArb,
        addProjectOptionsArb,
        async (name, gitUrl, options) => {
          const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          const project = await projectManager.addProject(uniqueName, gitUrl, options);

          // 全ての必須フィールドが存在することを確認
          for (const field of EXTENDED_PROJECT_REQUIRED_FIELDS) {
            expect(project).toHaveProperty(field);
            expect(project[field]).not.toBeUndefined();
            expect(project[field]).not.toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// Property 2: Project Persistence Round-Trip
// =============================================================================

describe('Property 2: Project Persistence Round-Trip', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * 任意の有効なプロジェクト設定を保存後、読み込むと同等のプロジェクトオブジェクトが得られること
   */

  let testDir: string;
  let projectsFile: string;
  let projectManager: ProjectManager;

  beforeEach(async () => {
    testDir = await createTestDir('persistence');
    projectsFile = path.join(testDir, 'projects.json');
    projectManager = new ProjectManager(projectsFile);
  });

  afterEach(async () => {
    await removeTestDir(testDir);
  });

  /**
   * Property 2.1: プロジェクトの保存と読み込みでデータが保持される
   *
   * **Validates: Requirement 1.5**
   */
  it('Property 2.1: プロジェクトの保存と読み込みでデータが保持される', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        gitUrlArb,
        addProjectOptionsArb,
        async (name, gitUrl, options) => {
          const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          // プロジェクトを作成（保存される）
          const createdProject = await projectManager.addProject(uniqueName, gitUrl, options);

          // キャッシュをクリアして再読み込み
          projectManager.clearCache();

          // プロジェクトをロード
          const loadedProject = await projectManager.getProject(createdProject.id);

          // ロードされたプロジェクトが元のプロジェクトと同等であること
          // @see Requirement 1.5: THE Project config SHALL be stored in `workspaces/projects.json`
          expect(loadedProject).not.toBeNull();
          expect(loadedProject).toEqual(createdProject);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2.2: 複数プロジェクトの保存と読み込みで独立性が保たれる
   *
   * **Validates: Requirement 1.5**
   */
  it('Property 2.2: 複数プロジェクトの保存と読み込みで独立性が保たれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(projectNameArb, gitUrlArb, addProjectOptionsArb), {
          minLength: 2,
          maxLength: 5,
        }),
        async (projectConfigs) => {
          // 各イテレーションで新しいProjectManagerを作成（独立性を保証）
          const iterTestDir = await createTestDir(`persistence-multi-${Date.now()}`);
          const iterProjectsFile = path.join(iterTestDir, 'projects.json');
          const iterProjectManager = new ProjectManager(iterProjectsFile);

          try {
            const createdProjects: ExtendedProject[] = [];

            // 複数のプロジェクトを作成
            for (let i = 0; i < projectConfigs.length; i++) {
              const [name, gitUrl, options] = projectConfigs[i];
              const uniqueName = `${name}-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`;

              const project = await iterProjectManager.addProject(uniqueName, gitUrl, options);
              createdProjects.push(project);
            }

            // キャッシュをクリアして再読み込み
            iterProjectManager.clearCache();

            // 各プロジェクトが正しくロードされることを確認
            for (const createdProject of createdProjects) {
              const loadedProject = await iterProjectManager.getProject(createdProject.id);
              expect(loadedProject).not.toBeNull();
              expect(loadedProject).toEqual(createdProject);
            }

            // プロジェクト一覧が正しいことを確認
            const allProjects = await iterProjectManager.listProjects();
            expect(allProjects.length).toBe(createdProjects.length);
          } finally {
            await removeTestDir(iterTestDir);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2.3: ブランチ設定が永続化される
   *
   * **Validates: Requirements 1.1, 1.2, 1.5**
   */
  it('Property 2.3: ブランチ設定が永続化される', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        gitUrlArb,
        branchNameArb,
        agentBranchNameArb,
        async (name, gitUrl, baseBranch, agentBranch) => {
          const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          // カスタムブランチ設定でプロジェクトを作成
          const createdProject = await projectManager.addProject(uniqueName, gitUrl, {
            baseBranch,
            agentBranch,
            skipGitUrlValidation: true,
          });

          // キャッシュをクリアして再読み込み
          projectManager.clearCache();

          // プロジェクトをロード
          const loadedProject = await projectManager.getProject(createdProject.id);

          // ブランチ設定が保持されていることを確認
          expect(loadedProject).not.toBeNull();
          expect(loadedProject!.baseBranch).toBe(baseBranch);
          expect(loadedProject!.agentBranch).toBe(agentBranch);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2.4: プロジェクト更新後も永続化される
   *
   * **Validates: Requirement 1.5**
   */
  it('Property 2.4: プロジェクト更新後も永続化される', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectNameArb,
        gitUrlArb,
        branchNameArb,
        branchNameArb,
        async (name, gitUrl, newBaseBranch, newAgentBranch) => {
          const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          // プロジェクトを作成
          const createdProject = await projectManager.addProject(uniqueName, gitUrl, {
            skipGitUrlValidation: true,
          });

          // プロジェクトを更新
          const updatedProject = await projectManager.updateProject(createdProject.id, {
            baseBranch: newBaseBranch,
            agentBranch: `agent/${newAgentBranch}`,
          });

          expect(updatedProject).not.toBeNull();

          // キャッシュをクリアして再読み込み
          projectManager.clearCache();

          // プロジェクトをロード
          const loadedProject = await projectManager.getProject(createdProject.id);

          // 更新された値が保持されていることを確認
          expect(loadedProject).not.toBeNull();
          expect(loadedProject!.baseBranch).toBe(newBaseBranch);
          expect(loadedProject!.agentBranch).toBe(`agent/${newAgentBranch}`);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2.5: プロジェクト削除後は読み込めない
   *
   * **Validates: Requirement 1.5**
   */
  it('Property 2.5: プロジェクト削除後は読み込めない', async () => {
    await fc.assert(
      fc.asyncProperty(projectNameArb, gitUrlArb, async (name, gitUrl) => {
        const uniqueName = `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        // プロジェクトを作成
        const createdProject = await projectManager.addProject(uniqueName, gitUrl, {
          skipGitUrlValidation: true,
        });

        // プロジェクトを削除
        const deleted = await projectManager.removeProject(createdProject.id);
        expect(deleted).toBe(true);

        // キャッシュをクリアして再読み込み
        projectManager.clearCache();

        // プロジェクトがロードできないことを確認
        const loadedProject = await projectManager.getProject(createdProject.id);
        expect(loadedProject).toBeNull();
      }),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('ProjectManager Extended - Unit Tests', () => {
  let testDir: string;
  let projectsFile: string;
  let projectManager: ProjectManager;

  beforeEach(async () => {
    testDir = await createTestDir('unit');
    projectsFile = path.join(testDir, 'projects.json');
    projectManager = new ProjectManager(projectsFile);
  });

  afterEach(async () => {
    await removeTestDir(testDir);
  });

  /**
   * 空のプロジェクト一覧が正しく処理される
   */
  it('空のプロジェクト一覧が正しく処理される', async () => {
    const projects = await projectManager.listProjects();
    expect(projects).toEqual([]);
  });

  /**
   * 存在しないプロジェクトIDでnullを返す
   */
  it('存在しないプロジェクトIDでnullを返す', async () => {
    const project = await projectManager.getProject('non-existent-id');
    expect(project).toBeNull();
  });

  /**
   * 日本語を含むプロジェクト名が正しく処理される
   */
  it('日本語を含むプロジェクト名が正しく処理される', async () => {
    const project = await projectManager.addProject(
      'テストプロジェクト',
      'https://github.com/user/repo.git',
      { skipGitUrlValidation: true }
    );

    expect(project.name).toBe('テストプロジェクト');
    expect(project.baseBranch).toBe('main');
    expect(project.agentBranch).toMatch(/^agent\//);

    // 永続化の確認
    projectManager.clearCache();
    const loadedProject = await projectManager.getProject(project.id);
    expect(loadedProject).not.toBeNull();
    expect(loadedProject!.name).toBe('テストプロジェクト');
  });

  /**
   * 特殊文字を含むブランチ名が正しく処理される
   */
  it('特殊文字を含むブランチ名が正しく処理される', async () => {
    const project = await projectManager.addProject(
      'special-branch-test',
      'https://github.com/user/repo.git',
      {
        baseBranch: 'feature/test-branch',
        agentBranch: 'agent/feature_test-123',
        skipGitUrlValidation: true,
      }
    );

    expect(project.baseBranch).toBe('feature/test-branch');
    expect(project.agentBranch).toBe('agent/feature_test-123');

    // 永続化の確認
    projectManager.clearCache();
    const loadedProject = await projectManager.getProject(project.id);
    expect(loadedProject!.baseBranch).toBe('feature/test-branch');
    expect(loadedProject!.agentBranch).toBe('agent/feature_test-123');
  });

  /**
   * generateAgentBranchName関数が正しく動作する
   */
  it('generateAgentBranchName関数が正しく動作する', () => {
    const projectId = 'my-project-123';
    const branchName = generateAgentBranchName(projectId);

    expect(branchName).toBe('agent/my-project-123');
    expect(branchName.startsWith(DEFAULT_BRANCH_CONFIG.agentBranchPrefix)).toBe(true);
  });

  /**
   * DEFAULT_BRANCH_CONFIGの値が正しい
   */
  it('DEFAULT_BRANCH_CONFIGの値が正しい', () => {
    expect(DEFAULT_BRANCH_CONFIG.baseBranch).toBe('main');
    expect(DEFAULT_BRANCH_CONFIG.agentBranchPrefix).toBe('agent/');
  });

  /**
   * プロジェクトのlastUsedが更新される
   */
  it('touchProjectでlastUsedが更新される', async () => {
    const project = await projectManager.addProject(
      'touch-test',
      'https://github.com/user/repo.git',
      { skipGitUrlValidation: true }
    );

    const originalLastUsed = project.lastUsed;

    // 少し待ってからtouchProject
    await new Promise((resolve) => setTimeout(resolve, 10));
    await projectManager.touchProject(project.id);

    // キャッシュをクリアして再読み込み
    projectManager.clearCache();
    const updatedProject = await projectManager.getProject(project.id);

    expect(updatedProject).not.toBeNull();
    expect(new Date(updatedProject!.lastUsed).getTime()).toBeGreaterThanOrEqual(
      new Date(originalLastUsed).getTime()
    );
  });

  /**
   * existsメソッドが正しく動作する
   */
  it('existsメソッドが正しく動作する', async () => {
    // 存在しないプロジェクト
    expect(await projectManager.exists('non-existent')).toBe(false);

    // プロジェクトを作成
    const project = await projectManager.addProject(
      'exists-test',
      'https://github.com/user/repo.git',
      { skipGitUrlValidation: true }
    );

    // 存在するプロジェクト
    expect(await projectManager.exists(project.id)).toBe(true);

    // 削除後
    await projectManager.removeProject(project.id);
    expect(await projectManager.exists(project.id)).toBe(false);
  });
});
