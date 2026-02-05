/**
 * Merger Agent - ブランチマージ・PR作成エージェント
 *
 * 統合ブランチへのマージとPull Request作成を担当する。
 * master/mainへの直接マージは禁止し、必ずPRを経由する。
 *
 * @module execution/agents/merger
 * @see Requirements: 4.5, 4.6, 4.7, 4.8, 4.9
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AgentId,
  RunId,
  ExecutionResult,
  ExecutionStatus,
  ErrorInfo,
} from '../types';
import { GitManager, createGitManager } from '../git-manager';
import { BaseAdapter, ChatMessage } from '../../../../adapters/base';
import { getAdapter } from '../../../../adapters/index';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 実行ログのベースディレクトリ
 */
const RUNS_BASE_DIR = 'runtime/runs';

/**
 * マージログファイル名
 */
const MERGE_LOG_FILE = 'merge.log';

/**
 * 保護されたブランチ（直接マージ禁止）
 */
const PROTECTED_BRANCHES = ['main', 'master'];

/**
 * デフォルトの統合ブランチ
 */
const DEFAULT_INTEGRATION_BRANCH = 'develop';

// =============================================================================
// 型定義
// =============================================================================

/**
 * Merger Agent設定
 */
export interface MergerAgentConfig {
  /** エージェントID */
  agentId: AgentId;
  /** 使用するAIアダプタ名 */
  adapterName?: string;
  /** 使用するモデル名 */
  modelName?: string;
  /** ワークスペースパス */
  workspacePath?: string;
  /** 統合ブランチ名 */
  integrationBranch?: string;
}

/**
 * マージリクエスト
 */
export interface MergeRequest {
  /** 実行ID */
  runId: RunId;
  /** ソースブランチ */
  sourceBranch: string;
  /** ターゲットブランチ（省略時は統合ブランチ） */
  targetBranch?: string;
  /** チケットID */
  ticketId: string;
  /** マージコミットメッセージ */
  message?: string;
  /** 強制マージフラグ（コンフリクト時） */
  force?: boolean;
}

/**
 * マージ結果
 */
export interface MergeResult {
  /** 成功フラグ */
  success: boolean;
  /** マージコミットハッシュ */
  commitHash?: string;
  /** ソースブランチ */
  sourceBranch: string;
  /** ターゲットブランチ */
  targetBranch: string;
  /** マージ方法 */
  mergeMethod: 'fast-forward' | 'merge-commit' | 'squash';
  /** エラー（失敗時） */
  error?: string;
  /** コンフリクトがあったか */
  hadConflicts: boolean;
}

/**
 * Pull Request情報
 */
export interface PullRequestInfo {
  /** PR ID（ローカル管理用） */
  id: string;
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** ソースブランチ */
  sourceBranch: string;
  /** ターゲットブランチ */
  targetBranch: string;
  /** チケットID */
  ticketId: string;
  /** 作成日時 */
  createdAt: string;
  /** ステータス */
  status: 'open' | 'approved' | 'merged' | 'closed';
  /** 変更ファイル一覧 */
  changedFiles: string[];
  /** コミット数 */
  commitCount: number;
}

/**
 * PR作成リクエスト
 */
export interface CreatePullRequestRequest {
  /** 実行ID */
  runId: RunId;
  /** ソースブランチ */
  sourceBranch: string;
  /** ターゲットブランチ（デフォルト: main） */
  targetBranch?: string;
  /** チケットID */
  ticketId: string;
  /** PRタイトル */
  title: string;
  /** PR説明 */
  description?: string;
}

// =============================================================================
// MergerAgent クラス
// =============================================================================

/**
 * MergerAgent - ブランチマージ・PR作成エージェント
 *
 * 統合ブランチへのマージとPull Request作成を担当する。
 *
 * @see Requirement 4.5: WHEN branch is ready for merge, THE Merger_Agent SHALL merge to integration branch
 * @see Requirement 4.6: THE Merger_Agent SHALL NOT merge directly to master/main branch
 * @see Requirement 4.7: WHEN all tasks for a ticket complete, THE System SHALL create Pull Request
 */
export class MergerAgent {
  /** エージェントID */
  readonly agentId: AgentId;

  /** AIアダプタ */
  private adapter: BaseAdapter;

  /** Git Manager */
  private gitManager: GitManager;

  /** モデル名 */
  private modelName: string;

  /** ワークスペースパス */
  private workspacePath: string;

  /** 統合ブランチ名 */
  private integrationBranch: string;

  /** 現在の実行ID */
  private currentRunId?: RunId;

  /** 作成されたPR一覧 */
  private pullRequests: Map<string, PullRequestInfo> = new Map();

  /**
   * コンストラクタ
   * @param config - Merger Agent設定
   */
  constructor(config: MergerAgentConfig) {
    this.agentId = config.agentId;
    this.modelName = config.modelName ?? 'llama3';
    this.workspacePath = config.workspacePath ?? process.cwd();
    this.integrationBranch = config.integrationBranch ?? DEFAULT_INTEGRATION_BRANCH;

    // AIアダプタを取得
    const adapterName = config.adapterName ?? 'ollama';
    this.adapter = getAdapter(adapterName);

    // Git Managerを作成
    this.gitManager = createGitManager({
      workDir: this.workspacePath,
    });
  }

  // ===========================================================================
  // マージ操作
  // ===========================================================================

  /**
   * ブランチをマージ
   *
   * ソースブランチをターゲットブランチにマージする。
   * ターゲットがmaster/mainの場合はエラーを返す。
   *
   * @param request - マージリクエスト
   * @returns マージ結果
   *
   * @see Requirement 4.5: THE Merger_Agent SHALL merge to integration branch
   * @see Requirement 4.6: THE Merger_Agent SHALL NOT merge directly to master/main
   */
  async merge(request: MergeRequest): Promise<MergeResult> {
    this.currentRunId = request.runId;
    this.gitManager.setRunId(request.runId);

    const targetBranch = request.targetBranch ?? this.integrationBranch;

    // 保護されたブランチへの直接マージを禁止
    if (this.isProtectedBranch(targetBranch)) {
      const error = `直接マージ禁止: ${targetBranch}はPull Request経由でのみマージ可能です`;
      await this.logMergeAction(request.runId, 'merge_rejected', {
        sourceBranch: request.sourceBranch,
        targetBranch,
        reason: 'protected_branch',
      });

      return {
        success: false,
        sourceBranch: request.sourceBranch,
        targetBranch,
        mergeMethod: 'merge-commit',
        error,
        hadConflicts: false,
      };
    }

    try {
      // ターゲットブランチにチェックアウト
      await this.gitManager.checkout(targetBranch);

      // マージを実行
      const mergeMessage = request.message ??
        `[${request.ticketId}] Merge ${request.sourceBranch} into ${targetBranch}`;

      const commitHash = await this.gitManager.merge(
        request.sourceBranch,
        mergeMessage
      );

      // ログに記録
      await this.logMergeAction(request.runId, 'merge_success', {
        sourceBranch: request.sourceBranch,
        targetBranch,
        commitHash,
        ticketId: request.ticketId,
      });

      return {
        success: true,
        commitHash,
        sourceBranch: request.sourceBranch,
        targetBranch,
        mergeMethod: 'merge-commit',
        hadConflicts: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const hadConflicts = errorMessage.includes('conflict') ||
                          errorMessage.includes('CONFLICT');

      // ログに記録
      await this.logMergeAction(request.runId, 'merge_failed', {
        sourceBranch: request.sourceBranch,
        targetBranch,
        error: errorMessage,
        hadConflicts,
      });

      return {
        success: false,
        sourceBranch: request.sourceBranch,
        targetBranch,
        mergeMethod: 'merge-commit',
        error: errorMessage,
        hadConflicts,
      };
    }
  }

  /**
   * 統合ブランチにマージ
   *
   * ソースブランチを統合ブランチ（develop/staging）にマージする。
   *
   * @param runId - 実行ID
   * @param sourceBranch - ソースブランチ
   * @param ticketId - チケットID
   * @returns マージ結果
   *
   * @see Requirement 4.5: THE Merger_Agent SHALL merge to integration branch
   */
  async mergeToIntegration(
    runId: RunId,
    sourceBranch: string,
    ticketId: string
  ): Promise<MergeResult> {
    return this.merge({
      runId,
      sourceBranch,
      targetBranch: this.integrationBranch,
      ticketId,
    });
  }

  // ===========================================================================
  // Pull Request操作
  // ===========================================================================

  /**
   * Pull Requestを作成
   *
   * master/mainブランチへのマージ用PRを作成する。
   * 実際のGitホスティングサービス（GitHub等）との連携は別途実装が必要。
   * ここではローカルでPR情報を管理する。
   *
   * @param request - PR作成リクエスト
   * @returns 作成されたPR情報
   *
   * @see Requirement 4.7: THE System SHALL create Pull Request to master/main
   * @see Requirement 4.8: THE Pull Request SHALL require President approval
   */
  async createPullRequest(request: CreatePullRequestRequest): Promise<PullRequestInfo> {
    this.currentRunId = request.runId;
    this.gitManager.setRunId(request.runId);

    const targetBranch = request.targetBranch ?? 'main';

    // 変更ファイル一覧を取得
    const changedFiles = await this.getChangedFiles(
      request.sourceBranch,
      targetBranch
    );

    // コミット数を取得
    const commitCount = await this.getCommitCount(
      request.sourceBranch,
      targetBranch
    );

    // PR情報を作成
    const prId = `pr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const pr: PullRequestInfo = {
      id: prId,
      title: request.title,
      description: request.description ?? await this.generatePRDescription(request),
      sourceBranch: request.sourceBranch,
      targetBranch,
      ticketId: request.ticketId,
      createdAt: new Date().toISOString(),
      status: 'open',
      changedFiles,
      commitCount,
    };

    // PRを保存
    this.pullRequests.set(prId, pr);

    // PRファイルを作成
    await this.savePullRequest(request.runId, pr);

    // ログに記録
    await this.logMergeAction(request.runId, 'pr_created', {
      prId,
      title: pr.title,
      sourceBranch: pr.sourceBranch,
      targetBranch: pr.targetBranch,
      ticketId: pr.ticketId,
    });

    return pr;
  }

  /**
   * Pull Requestを承認
   *
   * @param prId - PR ID
   * @param runId - 実行ID
   * @returns 更新されたPR情報
   *
   * @see Requirement 4.8: THE Pull Request SHALL require President approval
   */
  async approvePullRequest(prId: string, runId: RunId): Promise<PullRequestInfo | null> {
    const pr = this.pullRequests.get(prId);
    if (!pr) {
      return null;
    }

    pr.status = 'approved';

    // ログに記録
    await this.logMergeAction(runId, 'pr_approved', {
      prId,
      title: pr.title,
    });

    return pr;
  }

  /**
   * Pull Requestをマージ
   *
   * 承認済みのPRをマージする。
   *
   * @param prId - PR ID
   * @param runId - 実行ID
   * @returns マージ結果
   *
   * @see Requirement 4.9: THE merge approval SHALL be logged
   */
  async mergePullRequest(prId: string, runId: RunId): Promise<MergeResult> {
    const pr = this.pullRequests.get(prId);
    if (!pr) {
      return {
        success: false,
        sourceBranch: '',
        targetBranch: '',
        mergeMethod: 'merge-commit',
        error: `PR not found: ${prId}`,
        hadConflicts: false,
      };
    }

    if (pr.status !== 'approved') {
      return {
        success: false,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        mergeMethod: 'merge-commit',
        error: 'PRは承認されていません。社長（ユーザー）の承認が必要です。',
        hadConflicts: false,
      };
    }

    this.currentRunId = runId;
    this.gitManager.setRunId(runId);

    try {
      // ターゲットブランチにチェックアウト
      await this.gitManager.checkout(pr.targetBranch);

      // マージを実行
      const mergeMessage = `[${pr.ticketId}] ${pr.title}`;
      const commitHash = await this.gitManager.merge(pr.sourceBranch, mergeMessage);

      // PRステータスを更新
      pr.status = 'merged';

      // ログに記録
      await this.logMergeAction(runId, 'pr_merged', {
        prId,
        title: pr.title,
        commitHash,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
      });

      return {
        success: true,
        commitHash,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        mergeMethod: 'merge-commit',
        hadConflicts: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logMergeAction(runId, 'pr_merge_failed', {
        prId,
        error: errorMessage,
      });

      return {
        success: false,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        mergeMethod: 'merge-commit',
        error: errorMessage,
        hadConflicts: errorMessage.includes('conflict'),
      };
    }
  }

  /**
   * Pull Request一覧を取得
   *
   * @param status - フィルタするステータス（省略時は全て）
   * @returns PR一覧
   */
  getPullRequests(status?: PullRequestInfo['status']): PullRequestInfo[] {
    const prs = Array.from(this.pullRequests.values());
    if (status) {
      return prs.filter((pr) => pr.status === status);
    }
    return prs;
  }

  /**
   * Pull Requestを取得
   *
   * @param prId - PR ID
   * @returns PR情報
   */
  getPullRequest(prId: string): PullRequestInfo | undefined {
    return this.pullRequests.get(prId);
  }

  // ===========================================================================
  // ヘルパーメソッド
  // ===========================================================================

  /**
   * 保護されたブランチかどうかを判定
   *
   * @param branchName - ブランチ名
   * @returns 保護されたブランチの場合true
   */
  private isProtectedBranch(branchName: string): boolean {
    return PROTECTED_BRANCHES.includes(branchName.toLowerCase());
  }

  /**
   * 変更ファイル一覧を取得
   *
   * @param sourceBranch - ソースブランチ
   * @param targetBranch - ターゲットブランチ
   * @returns 変更ファイル一覧
   */
  private async getChangedFiles(
    sourceBranch: string,
    targetBranch: string
  ): Promise<string[]> {
    try {
      const status = await this.gitManager.getStatus();
      return status.modified.concat(status.added);
    } catch {
      return [];
    }
  }

  /**
   * コミット数を取得
   *
   * @param sourceBranch - ソースブランチ
   * @param targetBranch - ターゲットブランチ
   * @returns コミット数
   */
  private async getCommitCount(
    sourceBranch: string,
    targetBranch: string
  ): Promise<number> {
    // 実際の実装ではgit rev-list --count等を使用
    return 1;
  }

  /**
   * PR説明を自動生成
   *
   * @param request - PR作成リクエスト
   * @returns 生成された説明
   */
  private async generatePRDescription(
    request: CreatePullRequestRequest
  ): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `あなたはPull Requestの説明文を作成するアシスタントです。
簡潔で分かりやすい説明文を日本語で作成してください。`,
      },
      {
        role: 'user',
        content: `以下のPull Requestの説明文を作成してください：
- タイトル: ${request.title}
- チケットID: ${request.ticketId}
- ソースブランチ: ${request.sourceBranch}
- ターゲットブランチ: ${request.targetBranch ?? 'main'}`,
      },
    ];

    try {
      const response = await this.adapter.chat({
        model: this.modelName,
        messages,
      });
      return response.content;
    } catch {
      return `チケット ${request.ticketId} の変更をマージします。`;
    }
  }

  /**
   * PRをファイルに保存
   *
   * @param runId - 実行ID
   * @param pr - PR情報
   */
  private async savePullRequest(runId: RunId, pr: PullRequestInfo): Promise<void> {
    const runDir = path.join(RUNS_BASE_DIR, runId);
    await fs.mkdir(runDir, { recursive: true });

    const prPath = path.join(runDir, `pr-${pr.id}.json`);
    await fs.writeFile(prPath, JSON.stringify(pr, null, 2), 'utf-8');
  }

  // ===========================================================================
  // ログ記録
  // ===========================================================================

  /**
   * マージアクションをログに記録
   *
   * @param runId - 実行ID
   * @param action - アクション名
   * @param details - 詳細情報
   *
   * @see Requirement 4.9: THE merge approval SHALL be logged
   */
  private async logMergeAction(
    runId: RunId,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const runDir = path.join(RUNS_BASE_DIR, runId);
    await fs.mkdir(runDir, { recursive: true });

    const logPath = path.join(runDir, MERGE_LOG_FILE);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${action}] ${JSON.stringify(details)}\n`;

    await fs.appendFile(logPath, logEntry, 'utf-8');
  }

  // ===========================================================================
  // ゲッター
  // ===========================================================================

  /**
   * Git Managerを取得
   * @returns Git Manager
   */
  getGitManager(): GitManager {
    return this.gitManager;
  }

  /**
   * 統合ブランチ名を取得
   * @returns 統合ブランチ名
   */
  getIntegrationBranch(): string {
    return this.integrationBranch;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * MergerAgentを作成するファクトリ関数
 *
 * @param config - Merger Agent設定
 * @returns MergerAgentインスタンス
 *
 * @example
 * ```typescript
 * const merger = createMergerAgent({
 *   agentId: 'merger-001',
 *   integrationBranch: 'develop',
 * });
 * ```
 */
export function createMergerAgent(config: MergerAgentConfig): MergerAgent {
  return new MergerAgent(config);
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default MergerAgent;
