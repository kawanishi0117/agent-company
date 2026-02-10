/**
 * Git認証方式管理モジュール
 *
 * Git操作に必要な認証情報を管理し、セキュアな方法で認証を提供する。
 * 以下の3つの認証方式をサポート:
 * - Deploy key: リポジトリ専用のSSHキー（読み取り専用推奨）
 * - Repository-scoped token: GitHub PAT、GitLabトークンなど
 * - SSH agent forwarding: SSH_AUTH_SOCK経由（開発環境のみ、明示的オプトイン）
 *
 * セキュリティ制約:
 * - ~/.ssh/ ディレクトリの直接マウントは禁止
 * - Deploy keyまたはリポジトリスコープトークンを推奨
 * - SSH agent forwardingは開発環境のみ、明示的オプトインで許可
 *
 * @module execution/git-credentials
 * @see Requirements: 3.1, 3.2
 */

import * as path from 'path';
import * as os from 'os';
import type { GitCredentialType } from './types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * Deploy key認証設定
 * @description リポジトリ専用のSSHキーを使用した認証
 */
export interface DeployKeyCredential {
  /** 認証種別 */
  type: 'deploy_key';
  /** Deploy keyファイルのパス（~/.ssh/以外の場所に配置） */
  keyPath: string;
  /** パスフレーズ（オプション） */
  passphrase?: string;
}

/**
 * トークン認証設定
 * @description GitHub PAT、GitLabトークンなどを使用した認証
 */
export interface TokenCredential {
  /** 認証種別 */
  type: 'token';
  /** アクセストークン */
  token: string;
  /** トークン種別 */
  tokenType: 'github_pat' | 'gitlab_token' | 'generic';
  /** ユーザー名（トークン認証で必要な場合） */
  username?: string;
}

/**
 * SSH agent forwarding認証設定
 * @description SSH_AUTH_SOCKを使用した認証（開発環境のみ）
 */
export interface SshAgentCredential {
  /** 認証種別 */
  type: 'ssh_agent';
  /** SSH_AUTH_SOCKのパス（環境変数から取得） */
  socketPath?: string;
}

/**
 * Git認証プロバイダー設定
 * @description 3つの認証方式のいずれかを表す共用体型
 */
export type GitCredentialProvider = DeployKeyCredential | TokenCredential | SshAgentCredential;

/**
 * Git認証検証結果
 * @description 認証設定の検証結果
 */
export interface CredentialValidationResult {
  /** 有効フラグ */
  valid: boolean;
  /** エラーメッセージ一覧 */
  errors: string[];
  /** 警告メッセージ一覧 */
  warnings: string[];
}

/**
 * コンテナ用Git認証設定
 * @description Dockerコンテナに渡すGit認証設定
 */
export interface ContainerGitCredentials {
  /** 認証種別 */
  type: GitCredentialType;
  /** 環境変数 */
  env: Record<string, string>;
  /** マウントするボリューム（パス -> コンテナ内パス） */
  volumes: Record<string, string>;
  /** Git設定コマンド（コンテナ内で実行） */
  gitConfigCommands: string[];
}

// =============================================================================
// 定数
// =============================================================================

/**
 * 禁止されたパスパターン
 * @description ~/.ssh/ ディレクトリへのアクセスを禁止するためのパターン
 * @see Requirement 3.2: THE Git_Manager SHALL NOT directly mount ~/.ssh/ into Worker_Container
 */
const FORBIDDEN_PATH_PATTERNS = [
  // ホームディレクトリの.sshフォルダ
  path.join(os.homedir(), '.ssh'),
  // 展開前のチルダ表記
  '~/.ssh',
  // 環境変数展開前
  '$HOME/.ssh',
  '${HOME}/.ssh',
];

/**
 * 許可されたDeploy keyの配置場所
 * @description Deploy keyは以下のディレクトリに配置することを推奨
 */
const ALLOWED_KEY_DIRECTORIES = [
  // プロジェクト固有のキー配置場所
  '/etc/agent-company/keys',
  '/var/lib/agent-company/keys',
  // 一時ディレクトリ（コンテナ内）
  '/tmp/git-keys',
];

// =============================================================================
// バリデーション関数
// =============================================================================

/**
 * パスが禁止されたディレクトリを含むかチェック
 * @param targetPath チェック対象のパス
 * @returns 禁止されたパスの場合true
 * @see Requirement 3.2: ~/.ssh/ 直接マウント禁止
 */
export function isForbiddenPath(targetPath: string): boolean {
  // パスを正規化
  const normalizedPath = path.normalize(targetPath);

  // 禁止パターンとの照合
  for (const forbidden of FORBIDDEN_PATH_PATTERNS) {
    const normalizedForbidden = path.normalize(forbidden);

    // 完全一致または親ディレクトリとして含まれる場合
    if (
      normalizedPath === normalizedForbidden ||
      normalizedPath.startsWith(normalizedForbidden + path.sep)
    ) {
      return true;
    }
  }

  // ホームディレクトリの.sshを含むパターンを追加チェック
  const homeDir = os.homedir();
  const sshDir = path.join(homeDir, '.ssh');
  if (normalizedPath === sshDir || normalizedPath.startsWith(sshDir + path.sep)) {
    return true;
  }

  return false;
}

/**
 * Deploy key認証設定を検証
 * @param credential Deploy key認証設定
 * @returns 検証結果
 */
export function validateDeployKeyCredential(
  credential: DeployKeyCredential
): CredentialValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // キーパスの検証
  if (!credential.keyPath) {
    errors.push('Deploy keyのパスが指定されていません');
  } else {
    // 禁止パスのチェック
    if (isForbiddenPath(credential.keyPath)) {
      errors.push(
        `Deploy keyのパス "${credential.keyPath}" は禁止されています。` +
          '~/.ssh/ ディレクトリ内のキーは使用できません。' +
          '専用のキーディレクトリを使用してください。'
      );
    }

    // 推奨ディレクトリのチェック
    const isInAllowedDir = ALLOWED_KEY_DIRECTORIES.some((dir) =>
      credential.keyPath.startsWith(dir)
    );
    if (!isInAllowedDir && !errors.length) {
      warnings.push(
        `Deploy keyは推奨ディレクトリ（${ALLOWED_KEY_DIRECTORIES.join(', ')}）` +
          'に配置することを推奨します。'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * トークン認証設定を検証
 * @param credential トークン認証設定
 * @returns 検証結果
 */
export function validateTokenCredential(credential: TokenCredential): CredentialValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // トークンの検証
  if (!credential.token) {
    errors.push('アクセストークンが指定されていません');
  } else if (credential.token.length < 10) {
    errors.push('アクセストークンが短すぎます（最低10文字）');
  }

  // トークン種別の検証
  const validTokenTypes = ['github_pat', 'gitlab_token', 'generic'];
  if (!validTokenTypes.includes(credential.tokenType)) {
    errors.push(
      `無効なトークン種別: ${credential.tokenType}。` + `有効な値: ${validTokenTypes.join(', ')}`
    );
  }

  // GitHub PATの場合、ghp_プレフィックスをチェック
  if (
    credential.tokenType === 'github_pat' &&
    credential.token &&
    !credential.token.startsWith('ghp_') &&
    !credential.token.startsWith('github_pat_')
  ) {
    warnings.push(
      'GitHub PATは通常 "ghp_" または "github_pat_" で始まります。' +
        'トークンが正しいか確認してください。'
    );
  }

  // GitLab tokenの場合、glpat-プレフィックスをチェック
  if (
    credential.tokenType === 'gitlab_token' &&
    credential.token &&
    !credential.token.startsWith('glpat-')
  ) {
    warnings.push(
      'GitLab Personal Access Tokenは通常 "glpat-" で始まります。' +
        'トークンが正しいか確認してください。'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * SSH agent forwarding認証設定を検証
 * @param credential SSH agent認証設定
 * @param allowSshAgent SSH agent forwardingが許可されているか
 * @returns 検証結果
 */
export function validateSshAgentCredential(
  credential: SshAgentCredential,
  allowSshAgent: boolean = false
): CredentialValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // SSH agent forwardingの許可チェック
  if (!allowSshAgent) {
    errors.push(
      'SSH agent forwardingは開発環境でのみ許可されています。' +
        'システム設定で gitSshAgentEnabled を true に設定してください。'
    );
  }

  // SSH_AUTH_SOCKの存在チェック
  const socketPath = credential.socketPath || process.env.SSH_AUTH_SOCK;
  if (!socketPath) {
    errors.push(
      'SSH_AUTH_SOCK環境変数が設定されていません。' +
        'SSH agentが起動していることを確認してください。'
    );
  }

  // 警告: SSH agent forwardingはセキュリティリスクがある
  if (allowSshAgent) {
    warnings.push(
      'SSH agent forwardingは開発環境でのみ使用してください。' +
        '本番環境ではDeploy keyまたはトークン認証を推奨します。'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Git認証プロバイダーを検証
 * @param provider Git認証プロバイダー設定
 * @param allowSshAgent SSH agent forwardingが許可されているか
 * @returns 検証結果
 * @see Requirement 3.1: 複数の認証方式をサポート
 * @see Requirement 3.2: ~/.ssh/ 直接マウント禁止
 */
export function validateCredentialProvider(
  provider: GitCredentialProvider,
  allowSshAgent: boolean = false
): CredentialValidationResult {
  switch (provider.type) {
    case 'deploy_key':
      return validateDeployKeyCredential(provider);
    case 'token':
      return validateTokenCredential(provider);
    case 'ssh_agent':
      return validateSshAgentCredential(provider, allowSshAgent);
    default:
      return {
        valid: false,
        errors: [`不明な認証種別: ${(provider as GitCredentialProvider).type}`],
        warnings: [],
      };
  }
}

// =============================================================================
// 認証設定生成関数
// =============================================================================

/**
 * Deploy key用のコンテナ認証設定を生成
 * @param credential Deploy key認証設定
 * @returns コンテナ用Git認証設定
 */
export function createDeployKeyContainerCredentials(
  credential: DeployKeyCredential
): ContainerGitCredentials {
  // コンテナ内のキー配置パス
  const containerKeyPath = '/tmp/git-keys/deploy_key';

  return {
    type: 'deploy_key',
    env: {
      // SSHコマンドでDeploy keyを使用するよう設定
      GIT_SSH_COMMAND: `ssh -i ${containerKeyPath} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/known_hosts`,
    },
    volumes: {
      // Deploy keyをコンテナにマウント（読み取り専用）
      [credential.keyPath]: `${containerKeyPath}:ro`,
    },
    gitConfigCommands: [
      // キーのパーミッションを設定
      `chmod 600 ${containerKeyPath}`,
    ],
  };
}

/**
 * トークン用のコンテナ認証設定を生成
 * @param credential トークン認証設定
 * @returns コンテナ用Git認証設定
 */
export function createTokenContainerCredentials(
  credential: TokenCredential
): ContainerGitCredentials {
  // ユーザー名の決定
  let username = credential.username;
  if (!username) {
    // トークン種別に応じたデフォルトユーザー名
    switch (credential.tokenType) {
      case 'github_pat':
        username = 'x-access-token';
        break;
      case 'gitlab_token':
        username = 'oauth2';
        break;
      default:
        username = 'git';
    }
  }

  return {
    type: 'token',
    env: {
      // Git credential helperで使用するトークン
      GIT_ASKPASS: '/bin/echo',
      GIT_USERNAME: username,
      GIT_PASSWORD: credential.token,
    },
    volumes: {},
    gitConfigCommands: [
      // credential helperを設定
      `git config --global credential.helper '!f() { echo "username=${username}"; echo "password=${credential.token}"; }; f'`,
    ],
  };
}

/**
 * SSH agent forwarding用のコンテナ認証設定を生成
 * @param credential SSH agent認証設定
 * @returns コンテナ用Git認証設定
 */
export function createSshAgentContainerCredentials(
  credential: SshAgentCredential
): ContainerGitCredentials {
  const socketPath = credential.socketPath || process.env.SSH_AUTH_SOCK || '';

  return {
    type: 'ssh_agent',
    env: {
      // SSH_AUTH_SOCKをコンテナに転送
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
    },
    volumes: {
      // SSH agentソケットをマウント
      [socketPath]: '/tmp/ssh-agent.sock',
    },
    gitConfigCommands: [
      // StrictHostKeyCheckingを設定
      'mkdir -p ~/.ssh',
      'echo "StrictHostKeyChecking accept-new" >> ~/.ssh/config',
    ],
  };
}

/**
 * Git認証プロバイダーからコンテナ用認証設定を生成
 * @param provider Git認証プロバイダー設定
 * @returns コンテナ用Git認証設定
 * @see Requirement 3.1: 複数の認証方式をサポート
 */
export function createContainerCredentials(
  provider: GitCredentialProvider
): ContainerGitCredentials {
  switch (provider.type) {
    case 'deploy_key':
      return createDeployKeyContainerCredentials(provider);
    case 'token':
      return createTokenContainerCredentials(provider);
    case 'ssh_agent':
      return createSshAgentContainerCredentials(provider);
    default:
      throw new Error(`不明な認証種別: ${(provider as GitCredentialProvider).type}`);
  }
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 環境変数からGit認証プロバイダーを作成
 * @description 環境変数から認証情報を読み取り、適切なプロバイダーを作成
 * @returns Git認証プロバイダー、または認証情報がない場合はnull
 */
export function createCredentialProviderFromEnv(): GitCredentialProvider | null {
  // GitHub PAT
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (githubToken) {
    return {
      type: 'token',
      token: githubToken,
      tokenType: 'github_pat',
    };
  }

  // GitLab token
  const gitlabToken = process.env.GITLAB_TOKEN || process.env.GL_TOKEN;
  if (gitlabToken) {
    return {
      type: 'token',
      token: gitlabToken,
      tokenType: 'gitlab_token',
    };
  }

  // Deploy key
  const deployKeyPath = process.env.GIT_DEPLOY_KEY_PATH;
  if (deployKeyPath) {
    return {
      type: 'deploy_key',
      keyPath: deployKeyPath,
      passphrase: process.env.GIT_DEPLOY_KEY_PASSPHRASE,
    };
  }

  // SSH agent
  const sshAuthSock = process.env.SSH_AUTH_SOCK;
  if (sshAuthSock) {
    return {
      type: 'ssh_agent',
      socketPath: sshAuthSock,
    };
  }

  return null;
}

/**
 * Git URLからホスト名を抽出
 * @param gitUrl Git URL（SSH形式またはHTTPS形式）
 * @returns ホスト名
 */
export function extractHostFromGitUrl(gitUrl: string): string {
  // SSH形式: git@github.com:user/repo.git
  const sshMatch = gitUrl.match(/^git@([^:]+):/);
  if (sshMatch) {
    return sshMatch[1];
  }

  // HTTPS形式: https://github.com/user/repo.git
  const httpsMatch = gitUrl.match(/^https?:\/\/([^/]+)/);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  throw new Error(`無効なGit URL形式: ${gitUrl}`);
}

/**
 * Git URLを認証情報付きURLに変換
 * @param gitUrl 元のGit URL
 * @param credential トークン認証設定
 * @returns 認証情報付きURL
 */
export function createAuthenticatedUrl(gitUrl: string, credential: TokenCredential): string {
  // SSH形式の場合はそのまま返す（トークン認証は使用しない）
  if (gitUrl.startsWith('git@')) {
    return gitUrl;
  }

  // HTTPS形式の場合、認証情報を埋め込む
  const url = new URL(gitUrl);
  url.username = credential.username || 'x-access-token';
  url.password = credential.token;

  return url.toString();
}

/**
 * 認証種別の表示名を取得
 * @param type 認証種別
 * @returns 表示名
 */
export function getCredentialTypeDisplayName(type: GitCredentialType): string {
  switch (type) {
    case 'deploy_key':
      return 'Deploy Key';
    case 'token':
      return 'アクセストークン';
    case 'ssh_agent':
      return 'SSH Agent Forwarding';
    default:
      return '不明';
  }
}

/**
 * 推奨される認証方式を取得
 * @param environment 実行環境（'production' | 'development' | 'ci'）
 * @returns 推奨される認証種別の配列（優先度順）
 */
export function getRecommendedCredentialTypes(
  environment: 'production' | 'development' | 'ci'
): GitCredentialType[] {
  switch (environment) {
    case 'production':
      // 本番環境: Deploy keyまたはトークンを推奨
      return ['deploy_key', 'token'];
    case 'ci':
      // CI環境: トークンまたはDeploy keyを推奨
      return ['token', 'deploy_key'];
    case 'development':
      // 開発環境: 全方式を許可（SSH agentも含む）
      return ['token', 'deploy_key', 'ssh_agent'];
    default:
      return ['token', 'deploy_key'];
  }
}
