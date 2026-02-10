/**
 * PR Creator - Pull Request作成モジュール
 *
 * エージェントブランチからベースブランチへのPull Requestを作成する。
 * GitHub CLI (gh) または git コマンドを使用してPRを作成する。
 *
 * @module execution/pr-creator
 * @see Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessMonitor, processMonitor } from './process-monitor.js';
import type { RunId, ParentTicket } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 実行ログのベースディレクトリ
 */
const RUNS_BASE_DIR = 'runtime/runs';

/**
 * PRタイトルのプレフィックス
 * @see Requirement 10.2: THE PR title SHALL follow format: `[AgentCompany] <summary>`
 */
const PR_TITLE_PREFIX = '[AgentCompany]';

// =============================================================================
// 型定義
// =============================================================================

/**
 * PR作成オプション
 * @see Requirement 10.1: WHEN all grandchild tickets are completed, THE PR_Creator SHALL create a Pull Request
 */
export interface CreatePROptions {
  /** プロジェクトID */
  projectId: string;
  /** ソースブランチ（エージェントブランチ） */
  sourceBranch: string;
  /** ターゲットブランチ（ベースブランチ） */
  targetBranch: string;
  /** PRタイトル */
  title: string;
  /** PR本文 */
  body: string;
  /** 関連チケットID一覧 */
  tickets: string[];
  /** 作業ディレクトリ */
  workDir?: string;
}

/**
 * PR作成結果
 */
export interface PRResult {
  /** 成功フラグ */
  success: boolean;
  /** PR ID（成功時） */
  prId?: string;
  /** PR URL（成功時） */
  prUrl?: string;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * PRステータス
 */
export type PRStatus = 'open' | 'closed' | 'merged' | 'unknown';

/**
 * PR本文生成オプション
 * @see Requirement 10.3: THE PR body SHALL include: overview, list of changes, test results, related tickets
 */
export interface PRBodyOptions {
  /** 概要 */
  overview: string;
  /** 変更一覧 */
  changes: string[];
  /** テスト結果 */
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
  };
  /** 関連チケット一覧 */
  tickets: string[];
  /** 追加情報 */
  additionalInfo?: string;
}

/**
 * PRログエントリ
 */
interface PRLogEntry {
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
}

// =============================================================================
// PRCreator クラス
// =============================================================================

/**
 * PRCreator - Pull Request作成クラス
 *
 * エージェントブランチからベースブランチへのPull Requestを作成する。
 *
 * @see Requirement 10.1: WHEN all grandchild tickets are completed, THE PR_Creator SHALL create a Pull Request
 * @see Requirement 10.4: THE PR_Creator SHALL use GitHub CLI (gh) or git command to create PR
 */
export class PRCreator {
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
   * コンストラクタ
   * @param pm - ProcessMonitorインスタンス（デフォルト: グローバルインスタンス）
   * @param baseDir - ベースディレクトリパス（デフォルト: 'runtime/runs'）
   */
  constructor(pm: ProcessMonitor = processMonitor, baseDir: string = RUNS_BASE_DIR) {
    this.processMonitor = pm;
    this.baseDir = baseDir;
  }

  // ===========================================================================
  // 設定メソッド
  // ===========================================================================

  /**
   * 現在の実行IDを設定
   * @param runId - 実行ID
   */
  setRunId(runId: RunId): void {
    this.currentRunId = runId;
  }

  // ===========================================================================
  // PR作成メソッド
  // ===========================================================================

  /**
   * Pull Requestを作成
   *
   * GitHub CLI (gh) を使用してPRを作成する。
   * gh が利用できない場合は、git push後にユーザーに手動作成を促す。
   *
   * @param options - PR作成オプション
   * @returns PR作成結果
   *
   * @see Requirement 10.1: WHEN all grandchild tickets are completed, THE PR_Creator SHALL create a Pull Request
   * @see Requirement 10.4: THE PR_Creator SHALL use GitHub CLI (gh) or git command to create PR
   */
  async createPullRequest(options: CreatePROptions): Promise<PRResult> {
    // startTimeは将来のパフォーマンス計測用に保持
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _startTime = Date.now();

    try {
      // GitHub CLIが利用可能か確認
      const ghAvailable = await this.isGitHubCLIAvailable();

      if (ghAvailable) {
        // GitHub CLIを使用してPR作成
        return await this.createPRWithGitHubCLI(options);
      } else {
        // GitHub CLIが利用できない場合は、ブランチをプッシュして手動作成を促す
        return await this.createPRManually(options);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createPullRequest',
        details: `sourceBranch=${options.sourceBranch}, targetBranch=${options.targetBranch}`,
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * PRステータスを取得
   *
   * @param prId - PR ID
   * @param workDir - 作業ディレクトリ
   * @returns PRステータス
   */
  async getPRStatus(prId: string, workDir?: string): Promise<PRStatus> {
    try {
      const ghAvailable = await this.isGitHubCLIAvailable();

      if (!ghAvailable) {
        return 'unknown';
      }

      const result = await this.processMonitor.execute(
        `gh pr view ${prId} --json state --jq ".state"`,
        {
          timeout: 30,
          cwd: workDir,
        }
      );

      if (result.exitCode !== 0) {
        return 'unknown';
      }

      const state = result.stdout.trim().toLowerCase();
      switch (state) {
        case 'open':
          return 'open';
        case 'closed':
          return 'closed';
        case 'merged':
          return 'merged';
        default:
          return 'unknown';
      }
    } catch {
      return 'unknown';
    }
  }

  // ===========================================================================
  // PR内容生成メソッド
  // ===========================================================================

  /**
   * PRタイトルを生成
   *
   * @param summary - サマリー
   * @returns PRタイトル
   *
   * @see Requirement 10.2: THE PR title SHALL follow format: `[AgentCompany] <summary>`
   */
  generatePRTitle(summary: string): string {
    return `${PR_TITLE_PREFIX} ${summary}`;
  }

  /**
   * PR本文を生成
   *
   * @param options - PR本文生成オプション
   * @returns PR本文
   *
   * @see Requirement 10.3: THE PR body SHALL include: overview, list of changes, test results, related tickets
   */
  generatePRBody(options: PRBodyOptions): string {
    const sections: string[] = [];

    // 概要セクション
    sections.push('## Overview');
    sections.push('');
    sections.push(options.overview);
    sections.push('');

    // 変更一覧セクション
    sections.push('## Changes');
    sections.push('');
    if (options.changes.length > 0) {
      for (const change of options.changes) {
        sections.push(`- ${change}`);
      }
    } else {
      sections.push('No changes recorded.');
    }
    sections.push('');

    // テスト結果セクション
    if (options.testResults) {
      sections.push('## Test Results');
      sections.push('');
      sections.push(`- ✅ Passed: ${options.testResults.passed}`);
      sections.push(`- ❌ Failed: ${options.testResults.failed}`);
      sections.push(`- ⏭️ Skipped: ${options.testResults.skipped}`);
      sections.push('');
    }

    // 関連チケットセクション
    sections.push('## Related Tickets');
    sections.push('');
    if (options.tickets.length > 0) {
      for (const ticket of options.tickets) {
        sections.push(`- ${ticket}`);
      }
    } else {
      sections.push('No related tickets.');
    }
    sections.push('');

    // 追加情報セクション
    if (options.additionalInfo) {
      sections.push('## Additional Information');
      sections.push('');
      sections.push(options.additionalInfo);
      sections.push('');
    }

    // フッター
    sections.push('---');
    sections.push('');
    sections.push('*This PR was automatically created by AgentCompany.*');

    return sections.join('\n');
  }

  /**
   * 親チケットからPR本文を生成
   *
   * @param parentTicket - 親チケット
   * @param testResults - テスト結果（オプション）
   * @returns PR本文
   */
  generatePRBodyFromTicket(
    parentTicket: ParentTicket,
    testResults?: PRBodyOptions['testResults']
  ): string {
    // 変更一覧を子チケットから収集
    const changes: string[] = [];
    const tickets: string[] = [parentTicket.id];

    for (const child of parentTicket.childTickets) {
      tickets.push(child.id);
      changes.push(`[${child.workerType}] ${child.title}`);

      for (const grandchild of child.grandchildTickets) {
        tickets.push(grandchild.id);
        if (grandchild.artifacts.length > 0) {
          changes.push(`  - ${grandchild.title} (${grandchild.artifacts.length} artifacts)`);
        }
      }
    }

    return this.generatePRBody({
      overview: parentTicket.instruction,
      changes,
      testResults,
      tickets,
    });
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * GitHub CLIが利用可能か確認
   * @returns 利用可能な場合はtrue
   */
  private async isGitHubCLIAvailable(): Promise<boolean> {
    try {
      const result = await this.processMonitor.execute('gh --version', {
        timeout: 10,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * GitHub CLIを使用してPRを作成
   * @param options - PR作成オプション
   * @returns PR作成結果
   */
  private async createPRWithGitHubCLI(options: CreatePROptions): Promise<PRResult> {
    // startTimeは将来のパフォーマンス計測用に保持
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _startTime = Date.now();

    try {
      // タイトルと本文をエスケープ
      const escapedTitle = options.title.replace(/"/g, '\\"');
      const escapedBody = options.body.replace(/"/g, '\\"');

      // gh pr create コマンドを実行
      const command = `gh pr create --base "${options.targetBranch}" --head "${options.sourceBranch}" --title "${escapedTitle}" --body "${escapedBody}"`;

      const result = await this.processMonitor.execute(command, {
        timeout: 60,
        cwd: options.workDir,
      });

      if (result.exitCode !== 0) {
        throw new Error(`gh pr create failed: ${result.stderr}`);
      }

      // PR URLを抽出
      const prUrl = result.stdout.trim();
      const prIdMatch = prUrl.match(/\/pull\/(\d+)/);
      const prId = prIdMatch ? prIdMatch[1] : undefined;

      // ログを記録
      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createPullRequest',
        details: `prId=${prId}, prUrl=${prUrl}`,
        success: true,
      });

      return {
        success: true,
        prId,
        prUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createPullRequest',
        details: `sourceBranch=${options.sourceBranch}, targetBranch=${options.targetBranch}`,
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 手動PR作成（GitHub CLIが利用できない場合）
   * @param options - PR作成オプション
   * @returns PR作成結果
   */
  private async createPRManually(options: CreatePROptions): Promise<PRResult> {
    try {
      // ブランチをプッシュ
      const pushResult = await this.processMonitor.execute(
        `git push -u origin "${options.sourceBranch}"`,
        {
          timeout: 120,
          cwd: options.workDir,
        }
      );

      if (pushResult.exitCode !== 0) {
        throw new Error(`git push failed: ${pushResult.stderr}`);
      }

      // PR作成用のURLを生成（GitHub形式）
      // 注: 実際のURLはリポジトリのリモートURLから生成する必要がある
      const message = `Branch '${options.sourceBranch}' has been pushed. Please create a Pull Request manually.`;

      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createPullRequest',
        details: `manual=true, sourceBranch=${options.sourceBranch}`,
        success: true,
      });

      return {
        success: true,
        prId: undefined,
        prUrl: undefined,
        error: message,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logOperation({
        timestamp: new Date().toISOString(),
        operation: 'createPullRequest',
        details: `manual=true, sourceBranch=${options.sourceBranch}`,
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * PR操作ログを記録
   * @param entry - ログエントリ
   */
  private async logOperation(entry: PRLogEntry): Promise<void> {
    // 実行IDが設定されていない場合はログを記録しない
    if (!this.currentRunId) {
      return;
    }

    try {
      // ログディレクトリを作成
      const logDir = path.join(this.baseDir, this.currentRunId);
      await fs.mkdir(logDir, { recursive: true });

      // ログファイルパス
      const logFile = path.join(logDir, 'pr.log');

      // ログエントリをフォーマット
      const logLine = this.formatLogEntry(entry);

      // ログファイルに追記
      await fs.appendFile(logFile, logLine + '\n', 'utf-8');
    } catch (error) {
      // ログ記録の失敗は無視
      console.error('Failed to log PR operation:', error);
    }
  }

  /**
   * ログエントリをフォーマット
   * @param entry - ログエントリ
   * @returns フォーマットされたログ行
   */
  private formatLogEntry(entry: PRLogEntry): string {
    const parts: string[] = [`[${entry.timestamp}]`, `[${entry.operation}]`];

    if (entry.details) {
      parts.push(entry.details);
    }

    if (entry.success) {
      parts.push('[SUCCESS]');
    } else {
      parts.push(`[FAILED: ${entry.error}]`);
    }

    return parts.join(' ');
  }
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのPRCreatorインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const prCreator = new PRCreator();

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * PRCreatorインスタンスを作成
 * @returns PRCreatorインスタンス
 */
export function createPRCreator(): PRCreator {
  return new PRCreator();
}
