/**
 * Git Manager - Gitリポジトリ操作管理モジュール
 *
 * Gitリポジトリのclone、ブランチ作成、checkout、stage、commit、push操作を管理する。
 * ProcessMonitorを使用してGitコマンドを実行し、known_hosts検証を行う。
 *
 * @module execution/git-manager
 * @see Requirements: 3.3, 3.4, 3.9
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessMonitor, processMonitor } from './process-monitor';
import {
  GitCredentialProvider,
  validateCredentialProvider,
  extractHostFromGitUrl,
  createAuthenticatedUrl,
  TokenCredential,
} from './git-credentials';
import type { GitStatus, ConflictInfo, RunId } from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * Gitログのベースディレクトリ
 * @see Requirement 3.8: THE Git operations SHALL be logged to `runtime/runs/<run-id>/git.log`
 */
const RUNS_BASE_DIR = 'runtime/runs';

/**
 * known_hostsファイルのデフォルトパス
 */
const DEFAULT_KNOWN_HOSTS_PATH = '/tmp/known_hosts';

/**
 * 既知のGitホストとそのSSH公開鍵
 * @description known_hosts検証に使用
 */
const KNOWN_GIT_HOSTS: Record<string, string[]> = {
  'github.com': [
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl',
  ],
  'gitlab.com': [
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAfuCHKVTjquxvt6CM6tdG4SLp1Btn/nOeHHE5UOzRdf',
  ],
  'bitbucket.org': [
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIazEu89wgQZ4bqs3d63QSMzYVa0MuJ2e2gKTKqu+UUO',
  ],
};

// =============================================================================
// 型定義
// =============================================================================

/**
 * Gitログエントリ
 * @description Git操作のログエントリ
 */
interface GitLogEntry {
  /** タイムスタンプ（ISO8601形式） */
  timestamp: string;
  /** 操作種別 */
  operation: string;
  /** 詳細情報 */
  details?: string;
  /** 成功フラグ */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
}

/**
 * Git操作オプション
 * @description Git操作時の共通オプション
 */
export interface GitOperationOptions {
  /** 作業ディレクトリ */
  cwd?: string;
  /** タイムアウト秒数 */
  timeout?: number;
  /** 環境変数 */
  env?: Record<string, string>;
}

/**
 * 自動解決結果
 * @description コンフリクト自動解決の結果
 * @see Requirement 4.1: WHEN Git conflict occurs, THE Git_Manager SHALL first attempt automatic resolution
 * @see Requirement 4.2: IF automatic resolution fails, THE Git_Manager SHALL escalate to Reviewer_Agent
 */
export interface AutoResolveResult {
  /** 全てのコンフリクトが解決されたか */
  success: boolean;
  /** 解決されたファイル一覧 */
  resolvedFiles: string[];
  /** 未解決のファイル一覧 */
  unresolvedFiles: string[];
  /** Reviewer_Agentへのエスカレーションが必要か */
  needsEscalation: boolean;
  /** エラーメッセージ（エラー発生時） */
  error?: string;
}

/**
 * コンフリクトファイル情報
 * @description コンフリクトレポート内のファイル情報
 */
export interface ConflictFileInfo {
  /** ファイルパス */
  path: string;
  /** ベースバージョンが存在するか */
  hasBase: boolean;
  /** 自分の変更が存在するか */
  hasOurs: boolean;
  /** 相手の変更が存在するか */
  hasTheirs: boolean;
  /** 自動解決可能か */
  autoResolvable: boolean;
}

/**
 * コンフリクトレポート
 * @description コンフリクトの詳細レポート
 */
export interface ConflictReport {
  /** レポート生成日時（ISO8601形式） */
  timestamp: string;
  /** 現在のブランチ名 */
  branch: string;
  /** コンフリクト総数 */
  totalConflicts: number;
  /** コンフリクトファイル情報一覧 */
  files: ConflictFileInfo[];
  /** サマリー */
  summary: string;
}

// =============================================================================
// GitManager クラス
// =============================================================================

/**
 * GitManager - Gitリポジトリ操作管理クラス
 *
 * Gitリポジトリのclone、ブランチ作成、checkout、stage、commit、push操作を管理する。
 *
 * @see Requirement 3.3: WHEN Worker_Agent starts, THE Git_Manager SHALL clone the target repository
 * @see Requirement 3.4: THE Git_Manager SHALL create feature branch named `agent/<ticket-id>-<description>`
 * @see Requirement 3.9: THE Git_Manager SHALL validate `known_hosts` before connecting to remote
 */
export class GitManager {
  /**
   * Git認証プロバイダー
   */
  private credentialProvider?: GitCredentialProvider;

  /**
   * ProcessMonitorインスタンス
   */
  private processMonitor: ProcessMonitor;

  /**
   * 現在の実行ID
   */
  private currentRunId?: RunId;

  /**
   * ベースディレクトリパス
   */
  private readonly baseDir: string;

  /**
   * known_hostsファイルパス
   */
  private knownHostsPath: string;

  /**
   * コンストラクタ
   * @param pm - ProcessMonitorインスタンス（デフォルト: グローバルインスタンス）
   * @param baseDir - ベースディレクトリパス（デフォルト: 'runtime/runs'）
   */
  constructor(pm: ProcessMonitor = processMonitor, baseDir: string = RUNS_BASE_DIR) {
    this.processMonitor = pm;
    this.baseDir = baseDir;
    this.knownHostsPath = DEFAULT_KNOWN_HOSTS_PATH;
  }

  // ===========================================================================
  // 設定メソッド
  // ===========================================================================

  /**
   * Git認証プロバイダーを設定
   * @param provider - Git認証プロバイダー設定
   * @param allowSshAgent - SSH agent forwardingを許可するか
   * @throws 認証設定が無効な場合
   * @see Requirement 3.1: 複数の認証方式をサポート
   */
  setCredentialProvider(provider: GitCredentialProvider, allowSshAgent: boolean = false): void {
    // 認証設定を検証
    const validation = validateCredentialProvider(provider, allowSshAgent);
    if (!validation.valid) {
      throw new Error(`Git認証設定が無効です: ${validation.errors.join(', ')}`);
    }

    // 警告があればログ出力
    if (validation.warnings.length > 0) {
      console.warn('Git認証設定の警告:', validation.warnings.join(', '));
    }

    this.credentialProvider = provider;
  }

  /**
   * 現在の実行IDを設定
   * @param runId - 実行ID
   */
  setRunId(runId: RunId): void {
    this.currentRunId = runId;
    this.processMonitor.setRunId(runId);
  }

  /**
   * known_hostsファイルパスを設定
   * @param path - known_hostsファイルパス
   */
  setKnownHostsPath(knownHostsPath: string): void {
    this.knownHostsPath = knownHostsPath;
  }

  // ===========================================================================
  // リポジトリ操作
  // ===========================================================================

  /**
   * リポジトリをクローン
   *
   * 指定されたURLからリポジトリをコンテナローカルストレージにクローンする。
   *
   * @param url - GitリポジトリURL
   * @param targetDir - クローン先ディレクトリ
   * @param options - 操作オプション
   * @throws クローンに失敗した場合
   *
   * @see Requirement 3.3: WHEN Worker_Agent starts, THE Git_Manager SHALL clone the target repository into container-local storage
   */
  async clone(url: string, targetDir: string, options: GitOperationOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      // known_hosts検証（SSH URLの場合）
      if (url.startsWith('git@')) {
        const host = extractHostFromGitUrl(url);
        const isValid = await this.validateKnownHosts(host);
        if (!isValid) {
          throw new Error(`known_hosts検証に失敗しました: ${host}`);
        }
      }

      // 認証情報付きURLを生成（トークン認証の場合）
      let cloneUrl = url;
      if (this.credentialProvider?.type === 'token') {
        cloneUrl = createAuthenticatedUrl(url, this.credentialProvider as TokenCredential);
      }

      // 環境変数を設定
      const env = this.buildGitEnv(options.env);

      // git cloneコマンドを実行
      const command = `git clone "${cloneUrl}" "${targetDir}"`;
      const result = await this.processMonitor.execute(command, {
        timeout: options.timeout ?? 300,
        cwd: options.cwd,
        env,
      });

      if (result.exitCode !== 0) {
        throw new Error(`git clone failed: ${result.stderr}`);
      }

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'clone',
        details: `url=${url}, targetDir=${targetDir}`,
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      // エラーログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'clone',
        details: `url=${url}, targetDir=${targetDir}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 新しいブランチを作成
   *
   * @param branchName - ブランチ名
   * @param options - 操作オプション
   * @throws ブランチ作成に失敗した場合
   *
   * @see Requirement 3.4: THE Git_Manager SHALL create feature branch named `agent/<ticket-id>-<description>`
   */
  async createBranch(branchName: string, options: GitOperationOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      const command = `git checkout -b "${branchName}"`;
      const result = await this.processMonitor.execute(command, {
        timeout: options.timeout ?? 60,
        cwd: options.cwd,
        env: options.env,
      });

      if (result.exitCode !== 0) {
        throw new Error(`git checkout -b failed: ${result.stderr}`);
      }

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createBranch',
        details: `branchName=${branchName}`,
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createBranch',
        details: `branchName=${branchName}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * ブランチをチェックアウト
   *
   * @param branchName - ブランチ名
   * @param options - 操作オプション
   * @throws チェックアウトに失敗した場合
   */
  async checkout(branchName: string, options: GitOperationOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      const command = `git checkout "${branchName}"`;
      const result = await this.processMonitor.execute(command, {
        timeout: options.timeout ?? 60,
        cwd: options.cwd,
        env: options.env,
      });

      if (result.exitCode !== 0) {
        throw new Error(`git checkout failed: ${result.stderr}`);
      }

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'checkout',
        details: `branchName=${branchName}`,
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'checkout',
        details: `branchName=${branchName}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * ファイルをステージング
   *
   * @param files - ステージングするファイルパス（'.'で全ファイル）
   * @param options - 操作オプション
   * @throws ステージングに失敗した場合
   */
  async stage(files: string[], options: GitOperationOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      // ファイルリストをスペース区切りで結合
      const fileList = files.map((f) => `"${f}"`).join(' ');
      const command = `git add ${fileList}`;
      const result = await this.processMonitor.execute(command, {
        timeout: options.timeout ?? 60,
        cwd: options.cwd,
        env: options.env,
      });

      if (result.exitCode !== 0) {
        throw new Error(`git add failed: ${result.stderr}`);
      }

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'stage',
        details: `files=${files.join(', ')}`,
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'stage',
        details: `files=${files.join(', ')}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * コミットを作成
   *
   * @param message - コミットメッセージ
   * @param options - 操作オプション
   * @returns コミットハッシュ
   * @throws コミットに失敗した場合
   *
   * @see Requirement 3.6: THE commit message SHALL follow format: `[<ticket-id>] <description>`
   */
  async commit(message: string, options: GitOperationOptions = {}): Promise<string> {
    const startTime = Date.now();

    try {
      // コミットメッセージをエスケープ
      const escapedMessage = message.replace(/"/g, '\\"');
      const command = `git commit -m "${escapedMessage}"`;
      const result = await this.processMonitor.execute(command, {
        timeout: options.timeout ?? 60,
        cwd: options.cwd,
        env: options.env,
      });

      if (result.exitCode !== 0) {
        throw new Error(`git commit failed: ${result.stderr}`);
      }

      // コミットハッシュを取得
      const hashResult = await this.processMonitor.execute('git rev-parse HEAD', {
        timeout: 30,
        cwd: options.cwd,
        env: options.env,
      });

      const commitHash = hashResult.stdout.trim();

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'commit',
        details: `message="${message}", hash=${commitHash}`,
        success: true,
        durationMs: Date.now() - startTime,
      });

      return commitHash;
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'commit',
        details: `message="${message}"`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * タスクブランチを作成
   *
   * エージェントブランチから新しいタスクブランチを作成する。
   * ブランチ名形式: `agent/<ticket-id>-<description>`
   *
   * @param ticketId - チケットID
   * @param description - タスクの説明
   * @param agentBranch - ベースとなるエージェントブランチ名
   * @param options - 操作オプション
   * @returns 作成されたブランチ名
   * @throws ブランチ作成に失敗した場合
   *
   * @see Requirement 4.1: THE Git_Manager SHALL create task branch from agent branch
   */
  async createTaskBranch(
    ticketId: string,
    description: string,
    agentBranch: string,
    options: GitOperationOptions = {}
  ): Promise<string> {
    const startTime = Date.now();
    const branchName = GitManager.generateBranchName(ticketId, description);

    try {
      // まずエージェントブランチにチェックアウト
      await this.checkout(agentBranch, options);

      // 最新の状態を取得
      const pullResult = await this.processMonitor.execute(`git pull origin "${agentBranch}"`, {
        timeout: options.timeout ?? 120,
        cwd: options.cwd,
        env: this.buildGitEnv(options.env),
      });

      // pullが失敗してもブランチが存在しない場合は続行
      if (pullResult.exitCode !== 0 && !pullResult.stderr.includes("Couldn't find remote ref")) {
        // リモートにブランチがない場合は無視
        console.warn(`Warning: Could not pull from ${agentBranch}: ${pullResult.stderr}`);
      }

      // タスクブランチを作成
      await this.createBranch(branchName, options);

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createTaskBranch',
        details: `ticketId=${ticketId}, branchName=${branchName}, baseBranch=${agentBranch}`,
        success: true,
        durationMs: Date.now() - startTime,
      });

      return branchName;
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createTaskBranch',
        details: `ticketId=${ticketId}, branchName=${branchName}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * チケットIDを含むコミットを作成
   *
   * コミットメッセージ形式: `[<ticket-id>] <description>`
   *
   * @param ticketId - チケットID
   * @param description - コミットの説明
   * @param options - 操作オプション
   * @returns コミットハッシュ
   * @throws コミットに失敗した場合
   *
   * @see Requirement 4.2: THE commit message SHALL follow format: `[<ticket-id>] <description>`
   */
  async commitWithTicketId(
    ticketId: string,
    description: string,
    options: GitOperationOptions = {}
  ): Promise<string> {
    const message = GitManager.generateCommitMessage(ticketId, description);
    return this.commit(message, options);
  }

  /**
   * タスクブランチをエージェントブランチにマージ
   *
   * コンフリクトが発生した場合は自動解決を試み、
   * 失敗した場合はエスカレーションが必要であることを示す。
   *
   * @param taskBranch - マージするタスクブランチ名
   * @param agentBranch - マージ先のエージェントブランチ名
   * @param options - 操作オプション
   * @returns マージ結果（成功/コンフリクト情報）
   *
   * @see Requirement 4.4: WHEN task completes, THE Git_Manager SHALL merge task branch to agent branch
   * @see Requirement 4.5: IF merge conflict occurs, THE Git_Manager SHALL attempt auto-resolution
   */
  async mergeToAgentBranch(
    taskBranch: string,
    agentBranch: string,
    options: GitOperationOptions = {}
  ): Promise<{ success: boolean; conflictReport?: ConflictReport; autoResolved?: boolean }> {
    const startTime = Date.now();

    try {
      // エージェントブランチにチェックアウト
      await this.checkout(agentBranch, options);

      // マージを実行
      const mergeResult = await this.processMonitor.execute(`git merge "${taskBranch}"`, {
        timeout: options.timeout ?? 120,
        cwd: options.cwd,
        env: options.env,
      });

      if (mergeResult.exitCode === 0) {
        // マージ成功
        await this.logOperation({
          timestamp: new Date().toISOString(),
          operation: 'mergeToAgentBranch',
          details: `taskBranch=${taskBranch}, agentBranch=${agentBranch}`,
          success: true,
          durationMs: Date.now() - startTime,
        });

        return { success: true };
      }

      // コンフリクトが発生した場合
      const hasConflicts = await this.hasConflicts(options);
      if (hasConflicts) {
        // 自動解決を試行
        const autoResolveResult = await this.attemptAutoResolve(options);

        if (autoResolveResult.success) {
          // 自動解決成功、コミットを作成
          await this.commit(`Merge ${taskBranch} into ${agentBranch} (auto-resolved)`, options);

          await this.logOperation({
            timestamp: new Date().toISOString(),
            operation: 'mergeToAgentBranch',
            details: `taskBranch=${taskBranch}, agentBranch=${agentBranch}, autoResolved=true`,
            success: true,
            durationMs: Date.now() - startTime,
          });

          return { success: true, autoResolved: true };
        }

        // 自動解決失敗、コンフリクトレポートを生成
        const conflictReport = await this.generateConflictReport(options);

        await this.logOperation({
          timestamp: new Date().toISOString(),
          operation: 'mergeToAgentBranch',
          details: `taskBranch=${taskBranch}, agentBranch=${agentBranch}, conflicts=${conflictReport.totalConflicts}`,
          success: false,
          error: 'Merge conflicts require manual resolution',
          durationMs: Date.now() - startTime,
        });

        return { success: false, conflictReport };
      }

      // その他のマージエラー
      throw new Error(`git merge failed: ${mergeResult.stderr}`);
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'mergeToAgentBranch',
        details: `taskBranch=${taskBranch}, agentBranch=${agentBranch}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * コンフリクトをReviewer Agentにエスカレーション
   *
   * コンフリクトの詳細情報を含むエスカレーションメッセージを生成する。
   *
   * @param conflictReport - コンフリクトレポート
   * @param ticketId - 関連するチケットID
   * @returns エスカレーションメッセージ
   *
   * @see Requirement 4.6: IF auto-resolution fails, THE Git_Manager SHALL escalate to Reviewer_Agent with conflict details
   */
  escalateConflict(
    conflictReport: ConflictReport,
    ticketId: string
  ): {
    type: 'conflict_escalation';
    ticketId: string;
    branch: string;
    totalConflicts: number;
    files: ConflictFileInfo[];
    summary: string;
    timestamp: string;
  } {
    return {
      type: 'conflict_escalation',
      ticketId,
      branch: conflictReport.branch,
      totalConflicts: conflictReport.totalConflicts,
      files: conflictReport.files,
      summary: conflictReport.summary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * リモートにプッシュ
   *
   * @param branchName - プッシュするブランチ名
   * @param options - 操作オプション
   * @throws プッシュに失敗した場合
   *
   * @see Requirement 3.7: WHEN task completes, THE Git_Manager SHALL push the branch to remote
   */
  async push(branchName: string, options: GitOperationOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      // 環境変数を設定
      const env = this.buildGitEnv(options.env);

      const command = `git push -u origin "${branchName}"`;
      const result = await this.processMonitor.execute(command, {
        timeout: options.timeout ?? 120,
        cwd: options.cwd,
        env,
      });

      if (result.exitCode !== 0) {
        throw new Error(`git push failed: ${result.stderr}`);
      }

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'push',
        details: `branchName=${branchName}`,
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'push',
        details: `branchName=${branchName}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  // ===========================================================================
  // ステータス取得
  // ===========================================================================

  /**
   * リポジトリの状態を取得
   *
   * @param options - 操作オプション
   * @returns Gitステータス
   * @throws ステータス取得に失敗した場合
   */
  async getStatus(options: GitOperationOptions = {}): Promise<GitStatus> {
    const startTime = Date.now();

    try {
      // 現在のブランチを取得
      const branchResult = await this.processMonitor.execute('git branch --show-current', {
        timeout: 30,
        cwd: options.cwd,
        env: options.env,
      });

      if (branchResult.exitCode !== 0) {
        throw new Error(`git branch failed: ${branchResult.stderr}`);
      }

      const branch = branchResult.stdout.trim();

      // git status --porcelain でステータスを取得
      const statusResult = await this.processMonitor.execute('git status --porcelain', {
        timeout: 30,
        cwd: options.cwd,
        env: options.env,
      });

      if (statusResult.exitCode !== 0) {
        throw new Error(`git status failed: ${statusResult.stderr}`);
      }

      // ステータスをパース
      const status = this.parseGitStatus(statusResult.stdout, branch);

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'getStatus',
        details: `branch=${branch}`,
        success: true,
        durationMs: Date.now() - startTime,
      });

      return status;
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'getStatus',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  // ===========================================================================
  // コンフリクト検出
  // ===========================================================================

  /**
   * コンフリクトがあるかチェック
   *
   * @param options - 操作オプション
   * @returns コンフリクトがある場合はtrue
   */
  async hasConflicts(options: GitOperationOptions = {}): Promise<boolean> {
    const status = await this.getStatus(options);
    return status.conflicts.length > 0;
  }

  /**
   * コンフリクト情報を取得
   *
   * @param options - 操作オプション
   * @returns コンフリクト情報の配列
   */
  async getConflicts(options: GitOperationOptions = {}): Promise<ConflictInfo[]> {
    const status = await this.getStatus(options);
    const conflicts: ConflictInfo[] = [];

    for (const file of status.conflicts) {
      try {
        // コンフリクトの詳細を取得
        const conflict = await this.getConflictDetails(file, options);
        conflicts.push(conflict);
      } catch {
        // 詳細取得に失敗した場合は基本情報のみ
        conflicts.push({
          file,
          base: '',
          ours: '',
          theirs: '',
        });
      }
    }

    return conflicts;
  }

  /**
   * コンフリクトを解決
   *
   * @param file - ファイルパス
   * @param resolution - 解決後の内容
   * @param options - 操作オプション
   * @throws 解決に失敗した場合
   */
  async resolveConflict(
    file: string,
    resolution: string,
    options: GitOperationOptions = {}
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // ファイルに解決内容を書き込み
      const filePath = options.cwd ? path.join(options.cwd, file) : file;
      await fs.writeFile(filePath, resolution, 'utf-8');

      // ファイルをステージング
      await this.stage([file], options);

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'resolveConflict',
        details: `file=${file}`,
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'resolveConflict',
        details: `file=${file}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  // ===========================================================================
  // 自動コンフリクト解決
  // ===========================================================================

  /**
   * コンフリクトの自動解決を試行
   *
   * Gitの自動マージ戦略を使用してコンフリクトの解決を試みる。
   * 自動解決に失敗した場合は、エスカレーションが必要であることを示す結果を返す。
   *
   * @param options - 操作オプション
   * @returns 自動解決の結果
   *
   * @see Requirement 4.1: WHEN Git conflict occurs, THE Git_Manager SHALL first attempt automatic resolution
   * @see Requirement 4.2: IF automatic resolution fails, THE Git_Manager SHALL escalate to Reviewer_Agent
   */
  async attemptAutoResolve(options: GitOperationOptions = {}): Promise<AutoResolveResult> {
    const startTime = Date.now();
    const resolvedFiles: string[] = [];
    const unresolvedFiles: string[] = [];

    try {
      // コンフリクトがあるか確認
      const conflicts = await this.getConflicts(options);

      if (conflicts.length === 0) {
        // コンフリクトなし
        await this.logOperation({
          timestamp: new Date().toISOString(),
          operation: 'attemptAutoResolve',
          details: 'No conflicts to resolve',
          success: true,
          durationMs: Date.now() - startTime,
        });

        return {
          success: true,
          resolvedFiles: [],
          unresolvedFiles: [],
          needsEscalation: false,
        };
      }

      // 各コンフリクトファイルに対して自動解決を試行
      for (const conflict of conflicts) {
        const resolved = await this.tryAutoResolveFile(conflict, options);
        if (resolved) {
          resolvedFiles.push(conflict.file);
        } else {
          unresolvedFiles.push(conflict.file);
        }
      }

      const success = unresolvedFiles.length === 0;
      const needsEscalation = unresolvedFiles.length > 0;

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'attemptAutoResolve',
        details: `resolved=${resolvedFiles.length}, unresolved=${unresolvedFiles.length}`,
        success,
        durationMs: Date.now() - startTime,
      });

      return {
        success,
        resolvedFiles,
        unresolvedFiles,
        needsEscalation,
      };
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'attemptAutoResolve',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        resolvedFiles,
        unresolvedFiles,
        needsEscalation: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 単一ファイルの自動解決を試行
   *
   * @param conflict - コンフリクト情報
   * @param options - 操作オプション
   * @returns 解決に成功した場合はtrue
   */
  private async tryAutoResolveFile(
    conflict: ConflictInfo,
    options: GitOperationOptions
  ): Promise<boolean> {
    // 自動解決戦略:
    // 1. 一方が空の場合は、もう一方を採用
    // 2. 両方が同じ場合は、そのまま採用
    // 3. それ以外は自動解決不可

    const { base, ours, theirs, file } = conflict;

    // 両方が同じ場合
    if (ours === theirs) {
      await this.resolveConflict(file, ours, options);
      return true;
    }

    // oursが空でtheirsに内容がある場合（削除 vs 変更）
    if (ours === '' && theirs !== '') {
      // 変更を優先（theirsを採用）
      await this.resolveConflict(file, theirs, options);
      return true;
    }

    // theirsが空でoursに内容がある場合（変更 vs 削除）
    if (theirs === '' && ours !== '') {
      // 変更を優先（oursを採用）
      await this.resolveConflict(file, ours, options);
      return true;
    }

    // baseと同じ側を無視して、変更された側を採用
    if (ours === base && theirs !== base) {
      await this.resolveConflict(file, theirs, options);
      return true;
    }

    if (theirs === base && ours !== base) {
      await this.resolveConflict(file, ours, options);
      return true;
    }

    // 両方が変更されている場合は自動解決不可
    return false;
  }

  /**
   * コンフリクトレポートを生成
   *
   * コンフリクトの詳細情報を人間が読みやすい形式でレポートする。
   *
   * @param options - 操作オプション
   * @returns コンフリクトレポート
   */
  async generateConflictReport(options: GitOperationOptions = {}): Promise<ConflictReport> {
    const conflicts = await this.getConflicts(options);
    const status = await this.getStatus(options);

    const report: ConflictReport = {
      timestamp: new Date().toISOString(),
      branch: status.branch,
      totalConflicts: conflicts.length,
      files: conflicts.map((c) => ({
        path: c.file,
        hasBase: c.base !== '',
        hasOurs: c.ours !== '',
        hasTheirs: c.theirs !== '',
        autoResolvable: this.isAutoResolvable(c),
      })),
      summary: this.generateConflictSummary(conflicts),
    };

    // ログを記録
    await this.logOperation({
      timestamp: new Date().toISOString(),
      operation: 'generateConflictReport',
      details: `totalConflicts=${conflicts.length}`,
      success: true,
    });

    return report;
  }

  /**
   * コンフリクトが自動解決可能かどうかを判定
   *
   * @param conflict - コンフリクト情報
   * @returns 自動解決可能な場合はtrue
   */
  private isAutoResolvable(conflict: ConflictInfo): boolean {
    const { base, ours, theirs } = conflict;

    // 両方が同じ
    if (ours === theirs) return true;

    // 一方が空
    if (ours === '' || theirs === '') return true;

    // 一方がbaseと同じ
    if (ours === base || theirs === base) return true;

    return false;
  }

  /**
   * コンフリクトサマリーを生成
   *
   * @param conflicts - コンフリクト情報の配列
   * @returns サマリー文字列
   */
  private generateConflictSummary(conflicts: ConflictInfo[]): string {
    if (conflicts.length === 0) {
      return 'コンフリクトはありません。';
    }

    const autoResolvable = conflicts.filter((c) => this.isAutoResolvable(c)).length;
    const needsManual = conflicts.length - autoResolvable;

    const parts: string[] = [`合計 ${conflicts.length} 件のコンフリクトが検出されました。`];

    if (autoResolvable > 0) {
      parts.push(`${autoResolvable} 件は自動解決可能です。`);
    }

    if (needsManual > 0) {
      parts.push(`${needsManual} 件は手動解決が必要です。`);
    }

    return parts.join(' ');
  }

  // ===========================================================================
  // known_hosts検証
  // ===========================================================================

  /**
   * known_hostsを検証
   *
   * 指定されたホストがknown_hostsに登録されているか、
   * または既知のGitホストとして認識されているかを検証する。
   *
   * @param host - 検証するホスト名
   * @returns 検証に成功した場合はtrue
   *
   * @see Requirement 3.9: THE Git_Manager SHALL validate `known_hosts` before connecting to remote
   */
  async validateKnownHosts(host: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      // 既知のGitホストかチェック
      if (KNOWN_GIT_HOSTS[host]) {
        // known_hostsファイルに追加
        await this.addToKnownHosts(host, KNOWN_GIT_HOSTS[host]);

        await this.logOperation({
          timestamp: new Date().toISOString(),
          operation: 'validateKnownHosts',
          details: `host=${host}, source=builtin`,
          success: true,
          durationMs: Date.now() - startTime,
        });

        return true;
      }

      // ssh-keyscanでホストキーを取得
      const result = await this.processMonitor.execute(`ssh-keyscan -H "${host}"`, {
        timeout: 30,
      });

      if (result.exitCode !== 0 || !result.stdout.trim()) {
        await this.logOperation({
          timestamp: new Date().toISOString(),
          operation: 'validateKnownHosts',
          details: `host=${host}`,
          success: false,
          error: 'Failed to get host key',
          durationMs: Date.now() - startTime,
        });
        return false;
      }

      // known_hostsファイルに追加
      await this.addToKnownHosts(host, [result.stdout.trim()]);

      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'validateKnownHosts',
        details: `host=${host}, source=ssh-keyscan`,
        success: true,
        durationMs: Date.now() - startTime,
      });

      return true;
    } catch (error) {
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'validateKnownHosts',
        details: `host=${host}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      return false;
    }
  }

  // ===========================================================================
  // ユーティリティメソッド
  // ===========================================================================

  /**
   * ブランチ名を生成
   *
   * チケットIDと説明からブランチ名を生成する。
   *
   * @param ticketId - チケットID
   * @param description - 説明
   * @returns ブランチ名
   *
   * @see Requirement 3.4: THE Git_Manager SHALL create feature branch named `agent/<ticket-id>-<description>`
   */
  static generateBranchName(ticketId: string, description: string): string {
    // 説明をケバブケースに変換
    const kebabDescription = description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50); // 長すぎる場合は切り詰め

    return `agent/${ticketId}-${kebabDescription}`;
  }

  /**
   * コミットメッセージを生成
   *
   * チケットIDと説明からコミットメッセージを生成する。
   *
   * @param ticketId - チケットID
   * @param description - 説明
   * @returns コミットメッセージ
   *
   * @see Requirement 3.6: THE commit message SHALL follow format: `[<ticket-id>] <description>`
   */
  static generateCommitMessage(ticketId: string, description: string): string {
    return `[${ticketId}] ${description}`;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * Git用の環境変数を構築
   * @param additionalEnv - 追加の環境変数
   * @returns 環境変数オブジェクト
   */
  private buildGitEnv(additionalEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...additionalEnv };

    // SSH接続時のknown_hostsファイルを指定
    if (
      this.credentialProvider?.type === 'deploy_key' ||
      this.credentialProvider?.type === 'ssh_agent'
    ) {
      env.GIT_SSH_COMMAND = `ssh -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=${this.knownHostsPath}`;
    }

    // トークン認証の場合
    if (this.credentialProvider?.type === 'token') {
      const tokenCred = this.credentialProvider as TokenCredential;
      const username = tokenCred.username || 'x-access-token';
      env.GIT_ASKPASS = 'echo';
      env.GIT_USERNAME = username;
      env.GIT_PASSWORD = tokenCred.token;
    }

    return env;
  }

  /**
   * git status --porcelain の出力をパース
   * @param output - git statusの出力
   * @param branch - 現在のブランチ名
   * @returns GitStatus
   */
  private parseGitStatus(output: string, branch: string): GitStatus {
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    const conflicts: string[] = [];

    const lines = output.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePath = line.substring(3).trim();

      // コンフリクト（UU, AA, DD など）
      if (
        indexStatus === 'U' ||
        workTreeStatus === 'U' ||
        (indexStatus === 'A' && workTreeStatus === 'A') ||
        (indexStatus === 'D' && workTreeStatus === 'D')
      ) {
        conflicts.push(filePath);
        continue;
      }

      // ステージング済み
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push(filePath);
      }

      // 変更あり（ワークツリー）
      if (workTreeStatus === 'M' || workTreeStatus === 'D') {
        modified.push(filePath);
      }

      // 追跡されていない
      if (indexStatus === '?' && workTreeStatus === '?') {
        untracked.push(filePath);
      }
    }

    return {
      branch,
      staged,
      modified,
      untracked,
      conflicts,
    };
  }

  /**
   * コンフリクトの詳細を取得
   * @param file - ファイルパス
   * @param options - 操作オプション
   * @returns コンフリクト情報
   */
  private async getConflictDetails(
    file: string,
    options: GitOperationOptions
  ): Promise<ConflictInfo> {
    // git show :1:file (base), :2:file (ours), :3:file (theirs)
    const baseResult = await this.processMonitor.execute(`git show ":1:${file}"`, {
      timeout: 30,
      cwd: options.cwd,
    });

    const oursResult = await this.processMonitor.execute(`git show ":2:${file}"`, {
      timeout: 30,
      cwd: options.cwd,
    });

    const theirsResult = await this.processMonitor.execute(`git show ":3:${file}"`, {
      timeout: 30,
      cwd: options.cwd,
    });

    return {
      file,
      base: baseResult.exitCode === 0 ? baseResult.stdout : '',
      ours: oursResult.exitCode === 0 ? oursResult.stdout : '',
      theirs: theirsResult.exitCode === 0 ? theirsResult.stdout : '',
    };
  }

  /**
   * known_hostsファイルにホストキーを追加
   * @param host - ホスト名
   * @param keys - 公開鍵の配列
   */
  private async addToKnownHosts(host: string, keys: string[]): Promise<void> {
    try {
      // ディレクトリを作成
      const dir = path.dirname(this.knownHostsPath);
      await fs.mkdir(dir, { recursive: true });

      // 既存の内容を読み込み
      let existingContent = '';
      try {
        existingContent = await fs.readFile(this.knownHostsPath, 'utf-8');
      } catch {
        // ファイルが存在しない場合は空
      }

      // 新しいキーを追加
      const newKeys = keys.filter((key) => !existingContent.includes(key));
      if (newKeys.length > 0) {
        const content = existingContent + '\n' + newKeys.join('\n') + '\n';
        await fs.writeFile(this.knownHostsPath, content.trim() + '\n', 'utf-8');
      }
    } catch (error) {
      console.error('Failed to add to known_hosts:', error);
    }
  }

  /**
   * Git操作ログを記録
   * @param entry - ログエントリ
   * @see Requirement 3.8: THE Git operations SHALL be logged to `runtime/runs/<run-id>/git.log`
   */
  private async logOperation(entry: GitLogEntry): Promise<void> {
    // 実行IDが設定されていない場合はログを記録しない
    if (!this.currentRunId) {
      return;
    }

    try {
      // ログディレクトリを作成
      const logDir = path.join(this.baseDir, this.currentRunId);
      await fs.mkdir(logDir, { recursive: true });

      // ログファイルパス
      const logFile = path.join(logDir, 'git.log');

      // ログエントリをフォーマット
      const logLine = this.formatLogEntry(entry);

      // ログファイルに追記
      await fs.appendFile(logFile, logLine + '\n', 'utf-8');
    } catch (error) {
      // ログ記録の失敗は無視
      console.error('Failed to log git operation:', error);
    }
  }

  /**
   * ログエントリをフォーマット
   * @param entry - ログエントリ
   * @returns フォーマットされたログ行
   */
  private formatLogEntry(entry: GitLogEntry): string {
    const parts: string[] = [`[${entry.timestamp}]`, `[${entry.operation}]`];

    if (entry.details) {
      parts.push(entry.details);
    }

    if (entry.success) {
      parts.push('[SUCCESS]');
    } else {
      parts.push(`[FAILED: ${entry.error}]`);
    }

    if (entry.durationMs !== undefined) {
      parts.push(`[${entry.durationMs}ms]`);
    }

    return parts.join(' ');
  }
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのGitManagerインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const gitManager = new GitManager();
