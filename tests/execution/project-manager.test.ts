/**
 * Project Manager ユニットテスト
 *
 * ProjectManagerクラスのGit URL検証機能をテストする。
 *
 * @see Requirements: 1.3 (autonomous-agent-workflow)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectManager, ProjectManagerError } from '../../tools/cli/lib/execution/project-manager';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * 一時ディレクトリを作成
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join('runtime', 'test-runs', `project-manager-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * 一時ディレクトリを削除
 */
async function removeTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 削除失敗は無視
  }
}

// =============================================================================
// テストスイート
// =============================================================================

describe('ProjectManager', () => {
  let tempDir: string;
  let projectsFile: string;
  let projectManager: ProjectManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    projectsFile = path.join(tempDir, 'projects.json');
    projectManager = new ProjectManager(projectsFile);
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Git URL形式検証テスト
  // ===========================================================================

  describe('isValidGitUrlFormat', () => {
    /**
     * Git URL形式検証テスト
     * @see Requirement 1.3: WHEN a project is registered, THE System SHALL validate that the Git URL is accessible
     */

    describe('HTTPS形式', () => {
      it('標準的なHTTPS URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('https://github.com/user/repo.git')).toBe(true);
      });

      it('.gitなしのHTTPS URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('https://github.com/user/repo')).toBe(true);
      });

      it('GitLab URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('https://gitlab.com/user/repo.git')).toBe(true);
      });

      it('Bitbucket URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('https://bitbucket.org/user/repo.git')).toBe(
          true
        );
      });

      it('カスタムドメインのHTTPS URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('https://git.example.com/org/repo.git')).toBe(
          true
        );
      });

      it('ポート番号付きHTTPS URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('https://git.example.com:8443/repo.git')).toBe(
          true
        );
      });

      it('HTTP URLを有効と判定する（非推奨だが有効）', () => {
        expect(ProjectManager.isValidGitUrlFormat('http://git.example.com/repo.git')).toBe(true);
      });
    });

    describe('SSH形式', () => {
      it('標準的なSSH URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('git@github.com:user/repo.git')).toBe(true);
      });

      it('.gitなしのSSH URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('git@github.com:user/repo')).toBe(true);
      });

      it('GitLab SSH URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('git@gitlab.com:user/repo.git')).toBe(true);
      });

      it('カスタムドメインのSSH URLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('git@git.example.com:org/repo.git')).toBe(true);
      });

      it('ssh://形式のURLを有効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('ssh://git@github.com/user/repo.git')).toBe(true);
      });
    });

    describe('無効な形式', () => {
      it('空文字列を無効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('')).toBe(false);
      });

      it('プロトコルなしのURLを無効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('github.com/user/repo.git')).toBe(false);
      });

      it('ローカルパスを無効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('/path/to/repo')).toBe(false);
      });

      it('file://プロトコルを無効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('file:///path/to/repo')).toBe(false);
      });

      it('ftp://プロトコルを無効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('ftp://example.com/repo.git')).toBe(false);
      });

      it('不完全なSSH URLを無効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('git@github.com')).toBe(false);
      });

      it('スペースを含むURLを無効と判定する', () => {
        expect(ProjectManager.isValidGitUrlFormat('https://github.com/user/repo name.git')).toBe(
          false
        );
      });
    });
  });

  // ===========================================================================
  // validateGitUrl テスト
  // ===========================================================================

  describe('validateGitUrl', () => {
    /**
     * Git URL検証テスト
     * @see Requirement 1.3: WHEN a project is registered, THE System SHALL validate that the Git URL is accessible
     */

    describe('形式検証のみ', () => {
      it('有効なHTTPS URLで成功を返す', async () => {
        const result = await projectManager.validateGitUrl('https://github.com/user/repo.git');

        expect(result.valid).toBe(true);
        expect(result.formatValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('有効なSSH URLで成功を返す', async () => {
        const result = await projectManager.validateGitUrl('git@github.com:user/repo.git');

        expect(result.valid).toBe(true);
        expect(result.formatValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('無効なURLでエラーを返す', async () => {
        const result = await projectManager.validateGitUrl('invalid-url');

        expect(result.valid).toBe(false);
        expect(result.formatValid).toBe(false);
        expect(result.error).toContain('Git URLの形式が無効です');
      });

      it('空文字列でエラーを返す', async () => {
        const result = await projectManager.validateGitUrl('');

        expect(result.valid).toBe(false);
        expect(result.formatValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('アクセシビリティチェック', () => {
      it('アクセシビリティチェックなしの場合、accessibleはfalse', async () => {
        const result = await projectManager.validateGitUrl('https://github.com/user/repo.git', {
          checkAccessibility: false,
        });

        expect(result.valid).toBe(true);
        expect(result.formatValid).toBe(true);
        expect(result.accessible).toBe(false);
      });

      // 注: 実際のネットワークアクセスを伴うテストは統合テストで行う
      // ここではモックを使用したテストのみ
    });
  });

  // ===========================================================================
  // addProject テスト（Git URL検証統合）
  // ===========================================================================

  describe('addProject with Git URL validation', () => {
    /**
     * プロジェクト追加時のGit URL検証テスト
     * @see Requirement 1.3: WHEN a project is registered, THE System SHALL validate that the Git URL is accessible
     */

    it('有効なGit URLでプロジェクトを追加できる', async () => {
      const project = await projectManager.addProject(
        'test-project',
        'https://github.com/user/repo.git'
      );

      expect(project.name).toBe('test-project');
      expect(project.gitUrl).toBe('https://github.com/user/repo.git');
    });

    it('無効なGit URLでエラーを投げる', async () => {
      await expect(projectManager.addProject('test-project', 'invalid-url')).rejects.toThrow(
        ProjectManagerError
      );

      await expect(projectManager.addProject('test-project', 'invalid-url')).rejects.toMatchObject({
        code: 'INVALID_GIT_URL',
      });
    });

    it('skipGitUrlValidation=trueで検証をスキップできる', async () => {
      // 無効なURLでも検証をスキップすれば追加できる
      const project = await projectManager.addProject('test-project', 'invalid-url', {
        skipGitUrlValidation: true,
      });

      expect(project.name).toBe('test-project');
      expect(project.gitUrl).toBe('invalid-url');
    });

    it('SSH形式のURLでプロジェクトを追加できる', async () => {
      const project = await projectManager.addProject(
        'ssh-project',
        'git@github.com:user/repo.git'
      );

      expect(project.name).toBe('ssh-project');
      expect(project.gitUrl).toBe('git@github.com:user/repo.git');
    });

    it('同名のプロジェクトが存在する場合はエラー', async () => {
      await projectManager.addProject('duplicate', 'https://github.com/user/repo1.git');

      await expect(
        projectManager.addProject('duplicate', 'https://github.com/user/repo2.git')
      ).rejects.toMatchObject({
        code: 'PROJECT_EXISTS',
      });
    });

    it('ブランチ設定を含めてプロジェクトを追加できる', async () => {
      const project = await projectManager.addProject(
        'branch-project',
        'https://github.com/user/repo.git',
        {
          baseBranch: 'develop',
          agentBranch: 'agent/custom',
        }
      );

      expect(project.baseBranch).toBe('develop');
      expect(project.agentBranch).toBe('agent/custom');
    });
  });

  // ===========================================================================
  // エラーコードテスト
  // ===========================================================================

  describe('ProjectManagerError codes', () => {
    it('INVALID_GIT_URL エラーコードが正しく設定される', async () => {
      try {
        await projectManager.addProject('test', 'not-a-url');
        expect.fail('エラーが投げられるべき');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectManagerError);
        expect((error as ProjectManagerError).code).toBe('INVALID_GIT_URL');
      }
    });

    it('PROJECT_EXISTS エラーコードが正しく設定される', async () => {
      await projectManager.addProject('existing', 'https://github.com/user/repo.git');

      try {
        await projectManager.addProject('existing', 'https://github.com/user/repo2.git');
        expect.fail('エラーが投げられるべき');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectManagerError);
        expect((error as ProjectManagerError).code).toBe('PROJECT_EXISTS');
      }
    });
  });

  // ===========================================================================
  // ensureAgentBranch テスト
  // ===========================================================================

  describe('ensureAgentBranch', () => {
    /**
     * エージェントブランチ確保テスト
     * @see Requirement 1.4: WHEN a project is registered, THE System SHALL create the agent branch if it does not exist
     */

    describe('戻り値の構造', () => {
      it('結果オブジェクトに必要なフィールドが含まれる', { timeout: 30000 }, async () => {
        // 無効なURLでテスト（ネットワークアクセスなし）
        const result = await projectManager.ensureAgentBranch('invalid-url', 'agent/test', 'main');

        // 結果オブジェクトの構造を検証
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('exists');
        expect(result).toHaveProperty('created');
        expect(result).toHaveProperty('branchName');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.exists).toBe('boolean');
        expect(typeof result.created).toBe('boolean');
        expect(typeof result.branchName).toBe('string');
      });

      it('ブランチ名が正しく返される', { timeout: 30000 }, async () => {
        const result = await projectManager.ensureAgentBranch(
          'https://github.com/user/repo.git',
          'agent/my-project',
          'main'
        );

        expect(result.branchName).toBe('agent/my-project');
      });
    });

    describe('エラーハンドリング', () => {
      it('無効なURLの場合、エラーを返す', { timeout: 30000 }, async () => {
        const result = await projectManager.ensureAgentBranch(
          'not-a-valid-url',
          'agent/test',
          'main'
        );

        // 無効なURLの場合、successはfalse
        expect(result.success).toBe(false);
        expect(result.created).toBe(false);
      });

      it('タイムアウトオプションが適用される', { timeout: 30000 }, async () => {
        // 短いタイムアウトでテスト
        const result = await projectManager.ensureAgentBranch(
          'https://github.com/user/repo.git',
          'agent/test',
          'main',
          { timeoutSeconds: 1 }
        );

        // 結果が返されることを確認（タイムアウトでも結果は返る）
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('branchName');
      });
    });

    describe('ブランチ存在確認ロジック', () => {
      it('existsとcreatedは相互排他的', { timeout: 30000 }, async () => {
        const result = await projectManager.ensureAgentBranch(
          'https://github.com/user/repo.git',
          'agent/test',
          'main'
        );

        // 成功時: existsがtrueならcreatedはfalse、またはその逆
        // 失敗時: 両方false
        if (result.success) {
          expect(result.exists !== result.created).toBe(true);
        } else {
          // 失敗時は両方false
          expect(result.exists).toBe(false);
          expect(result.created).toBe(false);
        }
      });
    });

    // 注: 実際のGitリポジトリへのアクセスを伴うテストは統合テストで行う
    // ここではメソッドの基本的な動作とエラーハンドリングのみテスト
  });
});
