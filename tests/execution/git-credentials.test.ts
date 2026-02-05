/**
 * Git認証方式管理モジュールのユニットテスト
 *
 * @module tests/execution/git-credentials.test
 * @see Requirements: 3.1, 3.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import {
  isForbiddenPath,
  validateDeployKeyCredential,
  validateTokenCredential,
  validateSshAgentCredential,
  validateCredentialProvider,
  createDeployKeyContainerCredentials,
  createTokenContainerCredentials,
  createSshAgentContainerCredentials,
  createContainerCredentials,
  createCredentialProviderFromEnv,
  extractHostFromGitUrl,
  createAuthenticatedUrl,
  getCredentialTypeDisplayName,
  getRecommendedCredentialTypes,
  type DeployKeyCredential,
  type TokenCredential,
  type SshAgentCredential,
  type GitCredentialProvider,
} from '../../tools/cli/lib/execution/git-credentials';

describe('Git認証方式管理', () => {
  // ==========================================================================
  // isForbiddenPath テスト
  // ==========================================================================
  describe('isForbiddenPath', () => {
    it('~/.ssh/ ディレクトリは禁止される', () => {
      const homeDir = os.homedir();
      const sshDir = path.join(homeDir, '.ssh');

      expect(isForbiddenPath(sshDir)).toBe(true);
      expect(isForbiddenPath(path.join(sshDir, 'id_rsa'))).toBe(true);
      expect(isForbiddenPath(path.join(sshDir, 'config'))).toBe(true);
    });

    it('~/.ssh 表記も禁止される', () => {
      expect(isForbiddenPath('~/.ssh')).toBe(true);
      expect(isForbiddenPath('~/.ssh/id_rsa')).toBe(true);
    });

    it('$HOME/.ssh 表記も禁止される', () => {
      expect(isForbiddenPath('$HOME/.ssh')).toBe(true);
      expect(isForbiddenPath('${HOME}/.ssh')).toBe(true);
    });

    it('許可されたディレクトリは禁止されない', () => {
      expect(isForbiddenPath('/etc/agent-company/keys/deploy_key')).toBe(false);
      expect(isForbiddenPath('/var/lib/agent-company/keys/key')).toBe(false);
      expect(isForbiddenPath('/tmp/git-keys/deploy_key')).toBe(false);
    });

    it('一般的なパスは禁止されない', () => {
      expect(isForbiddenPath('/home/user/project')).toBe(false);
      expect(isForbiddenPath('/tmp/workspace')).toBe(false);
    });
  });

  // ==========================================================================
  // validateDeployKeyCredential テスト
  // ==========================================================================
  describe('validateDeployKeyCredential', () => {
    it('有効なDeploy key設定を検証できる', () => {
      const credential: DeployKeyCredential = {
        type: 'deploy_key',
        keyPath: '/etc/agent-company/keys/deploy_key',
      };

      const result = validateDeployKeyCredential(credential);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('キーパスが空の場合はエラー', () => {
      const credential: DeployKeyCredential = {
        type: 'deploy_key',
        keyPath: '',
      };

      const result = validateDeployKeyCredential(credential);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Deploy keyのパスが指定されていません');
    });

    it('~/.ssh/ 内のキーは禁止される', () => {
      const homeDir = os.homedir();
      const credential: DeployKeyCredential = {
        type: 'deploy_key',
        keyPath: path.join(homeDir, '.ssh', 'id_rsa'),
      };

      const result = validateDeployKeyCredential(credential);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('禁止されています');
    });

    it('推奨ディレクトリ外のキーは警告を出す', () => {
      const credential: DeployKeyCredential = {
        type: 'deploy_key',
        keyPath: '/home/user/my-keys/deploy_key',
      };

      const result = validateDeployKeyCredential(credential);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('推奨ディレクトリ');
    });
  });

  // ==========================================================================
  // validateTokenCredential テスト
  // ==========================================================================
  describe('validateTokenCredential', () => {
    it('有効なGitHub PAT設定を検証できる', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        tokenType: 'github_pat',
      };

      const result = validateTokenCredential(credential);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('有効なGitLab token設定を検証できる', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
        tokenType: 'gitlab_token',
      };

      const result = validateTokenCredential(credential);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('トークンが空の場合はエラー', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: '',
        tokenType: 'github_pat',
      };

      const result = validateTokenCredential(credential);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アクセストークンが指定されていません');
    });

    it('トークンが短すぎる場合はエラー', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'short',
        tokenType: 'github_pat',
      };

      const result = validateTokenCredential(credential);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('アクセストークンが短すぎます（最低10文字）');
    });

    it('GitHub PATのプレフィックスが異なる場合は警告', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'invalid_prefix_token_xxxxx',
        tokenType: 'github_pat',
      };

      const result = validateTokenCredential(credential);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('ghp_');
    });

    it('GitLab tokenのプレフィックスが異なる場合は警告', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'invalid_prefix_token_xxxxx',
        tokenType: 'gitlab_token',
      };

      const result = validateTokenCredential(credential);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('glpat-');
    });

    it('無効なトークン種別はエラー', () => {
      const credential = {
        type: 'token',
        token: 'valid_token_xxxxxxxxxx',
        tokenType: 'invalid_type',
      } as TokenCredential;

      const result = validateTokenCredential(credential);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('無効なトークン種別');
    });
  });

  // ==========================================================================
  // validateSshAgentCredential テスト
  // ==========================================================================
  describe('validateSshAgentCredential', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('SSH agent forwardingが許可されていない場合はエラー', () => {
      const credential: SshAgentCredential = {
        type: 'ssh_agent',
        socketPath: '/tmp/ssh-agent.sock',
      };

      const result = validateSshAgentCredential(credential, false);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('開発環境でのみ許可');
    });

    it('SSH agent forwardingが許可されている場合は有効', () => {
      process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';
      const credential: SshAgentCredential = {
        type: 'ssh_agent',
        socketPath: '/tmp/ssh-agent.sock',
      };

      const result = validateSshAgentCredential(credential, true);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('開発環境でのみ使用');
    });

    it('SSH_AUTH_SOCKが設定されていない場合はエラー', () => {
      delete process.env.SSH_AUTH_SOCK;
      const credential: SshAgentCredential = {
        type: 'ssh_agent',
      };

      const result = validateSshAgentCredential(credential, true);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('SSH_AUTH_SOCK');
    });
  });

  // ==========================================================================
  // validateCredentialProvider テスト
  // ==========================================================================
  describe('validateCredentialProvider', () => {
    it('Deploy key認証を検証できる', () => {
      const provider: GitCredentialProvider = {
        type: 'deploy_key',
        keyPath: '/etc/agent-company/keys/deploy_key',
      };

      const result = validateCredentialProvider(provider);

      expect(result.valid).toBe(true);
    });

    it('トークン認証を検証できる', () => {
      const provider: GitCredentialProvider = {
        type: 'token',
        token: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        tokenType: 'github_pat',
      };

      const result = validateCredentialProvider(provider);

      expect(result.valid).toBe(true);
    });

    it('SSH agent認証を検証できる（許可時）', () => {
      const originalEnv = process.env.SSH_AUTH_SOCK;
      process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';

      const provider: GitCredentialProvider = {
        type: 'ssh_agent',
        socketPath: '/tmp/ssh-agent.sock',
      };

      const result = validateCredentialProvider(provider, true);

      expect(result.valid).toBe(true);

      process.env.SSH_AUTH_SOCK = originalEnv;
    });
  });

  // ==========================================================================
  // createContainerCredentials テスト
  // ==========================================================================
  describe('createContainerCredentials', () => {
    it('Deploy key用のコンテナ認証設定を生成できる', () => {
      const credential: DeployKeyCredential = {
        type: 'deploy_key',
        keyPath: '/etc/agent-company/keys/deploy_key',
      };

      const result = createDeployKeyContainerCredentials(credential);

      expect(result.type).toBe('deploy_key');
      expect(result.env.GIT_SSH_COMMAND).toContain('/tmp/git-keys/deploy_key');
      expect(result.volumes[credential.keyPath]).toContain(':ro');
    });

    it('トークン用のコンテナ認証設定を生成できる', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        tokenType: 'github_pat',
      };

      const result = createTokenContainerCredentials(credential);

      expect(result.type).toBe('token');
      expect(result.env.GIT_USERNAME).toBe('x-access-token');
      expect(result.env.GIT_PASSWORD).toBe(credential.token);
    });

    it('GitLab token用のユーザー名が正しく設定される', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
        tokenType: 'gitlab_token',
      };

      const result = createTokenContainerCredentials(credential);

      expect(result.env.GIT_USERNAME).toBe('oauth2');
    });

    it('SSH agent用のコンテナ認証設定を生成できる', () => {
      const credential: SshAgentCredential = {
        type: 'ssh_agent',
        socketPath: '/tmp/ssh-agent.sock',
      };

      const result = createSshAgentContainerCredentials(credential);

      expect(result.type).toBe('ssh_agent');
      expect(result.env.SSH_AUTH_SOCK).toBe('/tmp/ssh-agent.sock');
      expect(result.volumes[credential.socketPath!]).toBe('/tmp/ssh-agent.sock');
    });

    it('createContainerCredentialsが正しいタイプを返す', () => {
      const deployKey: GitCredentialProvider = {
        type: 'deploy_key',
        keyPath: '/etc/agent-company/keys/deploy_key',
      };
      const token: GitCredentialProvider = {
        type: 'token',
        token: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        tokenType: 'github_pat',
      };
      const sshAgent: GitCredentialProvider = {
        type: 'ssh_agent',
        socketPath: '/tmp/ssh-agent.sock',
      };

      expect(createContainerCredentials(deployKey).type).toBe('deploy_key');
      expect(createContainerCredentials(token).type).toBe('token');
      expect(createContainerCredentials(sshAgent).type).toBe('ssh_agent');
    });
  });

  // ==========================================================================
  // createCredentialProviderFromEnv テスト
  // ==========================================================================
  describe('createCredentialProviderFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      // 全ての関連環境変数をクリア
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITLAB_TOKEN;
      delete process.env.GL_TOKEN;
      delete process.env.GIT_DEPLOY_KEY_PATH;
      delete process.env.GIT_DEPLOY_KEY_PASSPHRASE;
      delete process.env.SSH_AUTH_SOCK;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('GITHUB_TOKENからGitHub PAT認証を作成できる', () => {
      process.env.GITHUB_TOKEN = 'ghp_test_token_xxxxx';

      const result = createCredentialProviderFromEnv();

      expect(result).not.toBeNull();
      expect(result?.type).toBe('token');
      expect((result as TokenCredential).tokenType).toBe('github_pat');
    });

    it('GH_TOKENからGitHub PAT認証を作成できる', () => {
      process.env.GH_TOKEN = 'ghp_test_token_xxxxx';

      const result = createCredentialProviderFromEnv();

      expect(result).not.toBeNull();
      expect(result?.type).toBe('token');
    });

    it('GITLAB_TOKENからGitLab token認証を作成できる', () => {
      process.env.GITLAB_TOKEN = 'glpat-test_token_xxxxx';

      const result = createCredentialProviderFromEnv();

      expect(result).not.toBeNull();
      expect(result?.type).toBe('token');
      expect((result as TokenCredential).tokenType).toBe('gitlab_token');
    });

    it('GIT_DEPLOY_KEY_PATHからDeploy key認証を作成できる', () => {
      process.env.GIT_DEPLOY_KEY_PATH = '/etc/keys/deploy_key';

      const result = createCredentialProviderFromEnv();

      expect(result).not.toBeNull();
      expect(result?.type).toBe('deploy_key');
      expect((result as DeployKeyCredential).keyPath).toBe('/etc/keys/deploy_key');
    });

    it('SSH_AUTH_SOCKからSSH agent認証を作成できる', () => {
      process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';

      const result = createCredentialProviderFromEnv();

      expect(result).not.toBeNull();
      expect(result?.type).toBe('ssh_agent');
    });

    it('環境変数がない場合はnullを返す', () => {
      const result = createCredentialProviderFromEnv();

      expect(result).toBeNull();
    });

    it('優先順位: GitHub > GitLab > Deploy key > SSH agent', () => {
      process.env.GITHUB_TOKEN = 'ghp_test';
      process.env.GITLAB_TOKEN = 'glpat-test';
      process.env.GIT_DEPLOY_KEY_PATH = '/etc/keys/key';
      process.env.SSH_AUTH_SOCK = '/tmp/sock';

      const result = createCredentialProviderFromEnv();

      expect(result?.type).toBe('token');
      expect((result as TokenCredential).tokenType).toBe('github_pat');
    });
  });

  // ==========================================================================
  // extractHostFromGitUrl テスト
  // ==========================================================================
  describe('extractHostFromGitUrl', () => {
    it('SSH形式のURLからホスト名を抽出できる', () => {
      expect(extractHostFromGitUrl('git@github.com:user/repo.git')).toBe('github.com');
      expect(extractHostFromGitUrl('git@gitlab.com:user/repo.git')).toBe('gitlab.com');
      expect(extractHostFromGitUrl('git@bitbucket.org:user/repo.git')).toBe('bitbucket.org');
    });

    it('HTTPS形式のURLからホスト名を抽出できる', () => {
      expect(extractHostFromGitUrl('https://github.com/user/repo.git')).toBe('github.com');
      expect(extractHostFromGitUrl('https://gitlab.com/user/repo.git')).toBe('gitlab.com');
      expect(extractHostFromGitUrl('http://example.com/repo.git')).toBe('example.com');
    });

    it('無効なURLはエラーを投げる', () => {
      expect(() => extractHostFromGitUrl('invalid-url')).toThrow('無効なGit URL形式');
      expect(() => extractHostFromGitUrl('')).toThrow('無効なGit URL形式');
    });
  });

  // ==========================================================================
  // createAuthenticatedUrl テスト
  // ==========================================================================
  describe('createAuthenticatedUrl', () => {
    it('HTTPS URLに認証情報を埋め込める', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'test_token',
        tokenType: 'github_pat',
      };

      const result = createAuthenticatedUrl(
        'https://github.com/user/repo.git',
        credential
      );

      expect(result).toContain('x-access-token');
      expect(result).toContain('test_token');
      expect(result).toContain('github.com');
    });

    it('SSH URLはそのまま返す', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'test_token',
        tokenType: 'github_pat',
      };

      const result = createAuthenticatedUrl(
        'git@github.com:user/repo.git',
        credential
      );

      expect(result).toBe('git@github.com:user/repo.git');
    });

    it('カスタムユーザー名を使用できる', () => {
      const credential: TokenCredential = {
        type: 'token',
        token: 'test_token',
        tokenType: 'generic',
        username: 'custom_user',
      };

      const result = createAuthenticatedUrl(
        'https://example.com/repo.git',
        credential
      );

      expect(result).toContain('custom_user');
    });
  });

  // ==========================================================================
  // getCredentialTypeDisplayName テスト
  // ==========================================================================
  describe('getCredentialTypeDisplayName', () => {
    it('各認証種別の表示名を取得できる', () => {
      expect(getCredentialTypeDisplayName('deploy_key')).toBe('Deploy Key');
      expect(getCredentialTypeDisplayName('token')).toBe('アクセストークン');
      expect(getCredentialTypeDisplayName('ssh_agent')).toBe('SSH Agent Forwarding');
    });

    it('不明な種別は「不明」を返す', () => {
      expect(getCredentialTypeDisplayName('unknown' as any)).toBe('不明');
    });
  });

  // ==========================================================================
  // getRecommendedCredentialTypes テスト
  // ==========================================================================
  describe('getRecommendedCredentialTypes', () => {
    it('本番環境ではDeploy keyとトークンを推奨', () => {
      const result = getRecommendedCredentialTypes('production');

      expect(result).toContain('deploy_key');
      expect(result).toContain('token');
      expect(result).not.toContain('ssh_agent');
    });

    it('CI環境ではトークンとDeploy keyを推奨', () => {
      const result = getRecommendedCredentialTypes('ci');

      expect(result[0]).toBe('token');
      expect(result).toContain('deploy_key');
      expect(result).not.toContain('ssh_agent');
    });

    it('開発環境では全方式を許可', () => {
      const result = getRecommendedCredentialTypes('development');

      expect(result).toContain('token');
      expect(result).toContain('deploy_key');
      expect(result).toContain('ssh_agent');
    });
  });
});
