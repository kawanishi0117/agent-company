/**
 * Reviewer Agent - コンフリクト解決・コードレビューエージェント
 *
 * Gitコンフリクトの分析と解決提案、コードレビューを担当する。
 * Git Managerと連携してコンフリクトを検出し、解決策を提案する。
 *
 * @module execution/agents/reviewer
 * @see Requirements: 4.1, 4.2, 4.3, 4.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AgentId,
  RunId,
  ConflictInfo,
  GitStatus,
  ExecutionResult,
  ExecutionStatus,
  ArtifactInfo,
  ErrorInfo,
  QualityGateResult,
} from '../types';
import { GitManager, createGitManager, ConflictReport } from '../git-manager';
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
 * レビューログファイル名
 */
const REVIEW_LOG_FILE = 'review.log';

/**
 * コンフリクト解決の最大試行回数
 */
const MAX_RESOLUTION_ATTEMPTS = 3;

// =============================================================================
// 型定義
// =============================================================================

/**
 * Reviewer Agent設定
 */
export interface ReviewerAgentConfig {
  /** エージェントID */
  agentId: AgentId;
  /** 使用するAIアダプタ名 */
  adapterName?: string;
  /** 使用するモデル名 */
  modelName?: string;
  /** ワークスペースパス */
  workspacePath?: string;
}

/**
 * コンフリクト解決結果
 */
export interface ConflictResolutionResult {
  /** 成功フラグ */
  success: boolean;
  /** 解決されたファイル一覧 */
  resolvedFiles: string[];
  /** 解決できなかったファイル一覧 */
  unresolvedFiles: string[];
  /** 解決方法の説明 */
  resolutionSummary: string;
  /** エラー（失敗時） */
  error?: string;
}

/**
 * コードレビュー結果
 */
export interface CodeReviewResult {
  /** 承認フラグ */
  approved: boolean;
  /** レビューコメント */
  comments: ReviewComment[];
  /** 全体的なフィードバック */
  summary: string;
  /** 推奨アクション */
  recommendedAction: 'approve' | 'request_changes' | 'reject';
}

/**
 * レビューコメント
 */
export interface ReviewComment {
  /** ファイルパス */
  file: string;
  /** 行番号（オプション） */
  line?: number;
  /** コメント内容 */
  comment: string;
  /** 重要度 */
  severity: 'info' | 'warning' | 'error';
}

/**
 * レビューリクエスト
 */
export interface ReviewRequest {
  /** 実行ID */
  runId: RunId;
  /** ブランチ名 */
  branchName: string;
  /** 変更されたファイル一覧 */
  changedFiles: string[];
  /** コミット一覧 */
  commits: string[];
  /** レビュー基準（オプション） */
  reviewCriteria?: string[];
}

// =============================================================================
// ReviewerAgent クラス
// =============================================================================

/**
 * ReviewerAgent - コンフリクト解決・コードレビューエージェント
 *
 * Gitコンフリクトの分析と解決提案、コードレビューを担当する。
 *
 * @see Requirement 4.2: IF automatic resolution fails, THE Git_Manager SHALL escalate to Reviewer_Agent
 * @see Requirement 4.3: THE Reviewer_Agent SHALL analyze conflicts and propose resolution
 * @see Requirement 4.4: WHEN Reviewer_Agent resolves conflict, THE resolution SHALL be committed
 */
export class ReviewerAgent {
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

  /** 現在の実行ID */
  private currentRunId?: RunId;

  /**
   * コンストラクタ
   * @param config - Reviewer Agent設定
   */
  constructor(config: ReviewerAgentConfig) {
    this.agentId = config.agentId;
    this.modelName = config.modelName ?? 'llama3';
    this.workspacePath = config.workspacePath ?? process.cwd();

    // AIアダプタを取得
    const adapterName = config.adapterName ?? 'ollama';
    this.adapter = getAdapter(adapterName);

    // Git Managerを作成
    this.gitManager = createGitManager({
      workDir: this.workspacePath,
    });
  }

  // ===========================================================================
  // コンフリクト解決
  // ===========================================================================

  /**
   * コンフリクトを分析
   *
   * 現在のリポジトリのコンフリクト状態を分析し、レポートを生成する。
   *
   * @param runId - 実行ID
   * @returns コンフリクトレポート
   *
   * @see Requirement 4.3: THE Reviewer_Agent SHALL analyze conflicts and propose resolution
   */
  async analyzeConflicts(runId: RunId): Promise<ConflictReport> {
    this.currentRunId = runId;
    this.gitManager.setRunId(runId);

    // コンフリクトレポートを生成
    const report = await this.gitManager.generateConflictReport();

    // ログに記録
    await this.logReviewAction(runId, 'analyze_conflicts', {
      hasConflicts: report.hasConflicts,
      conflictCount: report.conflicts.length,
    });

    return report;
  }

  /**
   * コンフリクトを解決
   *
   * AIを使用してコンフリクトの解決策を提案し、適用する。
   *
   * @param runId - 実行ID
   * @param conflicts - コンフリクト情報の配列
   * @returns 解決結果
   *
   * @see Requirement 4.3: THE Reviewer_Agent SHALL analyze conflicts and propose resolution
   * @see Requirement 4.4: WHEN Reviewer_Agent resolves conflict, THE resolution SHALL be committed
   */
  async resolveConflicts(
    runId: RunId,
    conflicts: ConflictInfo[]
  ): Promise<ConflictResolutionResult> {
    this.currentRunId = runId;
    this.gitManager.setRunId(runId);

    const resolvedFiles: string[] = [];
    const unresolvedFiles: string[] = [];
    const resolutionDetails: string[] = [];

    for (const conflict of conflicts) {
      let resolved = false;

      // 最大試行回数まで解決を試みる
      for (let attempt = 0; attempt < MAX_RESOLUTION_ATTEMPTS && !resolved; attempt++) {
        try {
          // AIに解決策を提案させる
          const resolution = await this.proposeResolution(conflict);

          if (resolution) {
            // 解決策を適用
            await this.gitManager.resolveConflict(conflict.file, resolution);
            resolvedFiles.push(conflict.file);
            resolutionDetails.push(`${conflict.file}: 解決済み`);
            resolved = true;
          }
        } catch (error) {
          // 最後の試行でも失敗した場合のみログ
          if (attempt === MAX_RESOLUTION_ATTEMPTS - 1) {
            unresolvedFiles.push(conflict.file);
            resolutionDetails.push(
              `${conflict.file}: 解決失敗 - ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      if (!resolved) {
        unresolvedFiles.push(conflict.file);
      }
    }

    const result: ConflictResolutionResult = {
      success: unresolvedFiles.length === 0,
      resolvedFiles,
      unresolvedFiles,
      resolutionSummary: resolutionDetails.join('\n'),
    };

    // ログに記録
    await this.logReviewAction(runId, 'resolve_conflicts', result);

    // 解決されたファイルがある場合はコミット
    if (resolvedFiles.length > 0) {
      await this.gitManager.stage(resolvedFiles);
      await this.gitManager.commit(`[reviewer] コンフリクト解決: ${resolvedFiles.join(', ')}`);
    }

    return result;
  }

  /**
   * コンフリクトの解決策を提案
   *
   * @param conflict - コンフリクト情報
   * @returns 解決されたコンテンツ（解決できない場合はnull）
   */
  private async proposeResolution(conflict: ConflictInfo): Promise<string | null> {
    const prompt = this.buildResolutionPrompt(conflict);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `あなたはGitコンフリクト解決の専門家です。
与えられたコンフリクト情報を分析し、最適な解決策を提案してください。
解決策は、両方の変更を適切にマージした完全なコードを返してください。
コンフリクトマーカー（<<<<<<<, =======, >>>>>>>）は含めないでください。`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    try {
      const response = await this.adapter.chat({
        model: this.modelName,
        messages,
      });

      // レスポンスから解決されたコードを抽出
      const resolvedContent = this.extractResolvedContent(response.content);
      return resolvedContent;
    } catch (error) {
      console.error('AI解決策提案に失敗:', error);
      return null;
    }
  }

  /**
   * 解決プロンプトを構築
   *
   * @param conflict - コンフリクト情報
   * @returns プロンプト文字列
   */
  private buildResolutionPrompt(conflict: ConflictInfo): string {
    return `## コンフリクト解決リクエスト

### ファイル: ${conflict.file}

### ベースバージョン（共通の祖先）:
\`\`\`
${conflict.base}
\`\`\`

### 自分の変更（ours）:
\`\`\`
${conflict.ours}
\`\`\`

### 相手の変更（theirs）:
\`\`\`
${conflict.theirs}
\`\`\`

### 指示
上記のコンフリクトを解決し、両方の変更を適切にマージした完全なコードを返してください。
コードブロック（\`\`\`）で囲んで返してください。`;
  }

  /**
   * AIレスポンスから解決されたコンテンツを抽出
   *
   * @param response - AIレスポンス
   * @returns 解決されたコンテンツ
   */
  private extractResolvedContent(response: string): string | null {
    // コードブロックを抽出
    const codeBlockMatch = response.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // コードブロックがない場合はレスポンス全体を使用
    // ただし、明らかに説明文の場合はnullを返す
    if (response.includes('解決できません') || response.includes('手動で解決')) {
      return null;
    }

    return response.trim();
  }

  // ===========================================================================
  // コードレビュー
  // ===========================================================================

  /**
   * コードレビューを実行
   *
   * 変更されたファイルをレビューし、フィードバックを提供する。
   *
   * @param request - レビューリクエスト
   * @returns レビュー結果
   */
  async reviewCode(request: ReviewRequest): Promise<CodeReviewResult> {
    this.currentRunId = request.runId;
    this.gitManager.setRunId(request.runId);

    const comments: ReviewComment[] = [];
    let overallApproved = true;

    // 各ファイルをレビュー
    for (const file of request.changedFiles) {
      try {
        const fileComments = await this.reviewFile(file, request.reviewCriteria);
        comments.push(...fileComments);

        // エラーレベルのコメントがあれば承認しない
        if (fileComments.some((c) => c.severity === 'error')) {
          overallApproved = false;
        }
      } catch (error) {
        comments.push({
          file,
          comment: `レビュー中にエラーが発生: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'warning',
        });
      }
    }

    // 全体的なサマリーを生成
    const summary = await this.generateReviewSummary(comments, request);

    const result: CodeReviewResult = {
      approved: overallApproved && comments.filter((c) => c.severity === 'error').length === 0,
      comments,
      summary,
      recommendedAction: this.determineRecommendedAction(comments),
    };

    // ログに記録
    await this.logReviewAction(request.runId, 'code_review', {
      approved: result.approved,
      commentCount: comments.length,
      recommendedAction: result.recommendedAction,
    });

    return result;
  }

  /**
   * 単一ファイルをレビュー
   *
   * @param filePath - ファイルパス
   * @param criteria - レビュー基準
   * @returns レビューコメントの配列
   */
  private async reviewFile(
    filePath: string,
    criteria?: string[]
  ): Promise<ReviewComment[]> {
    // ファイル内容を読み取り
    const fullPath = path.join(this.workspacePath, filePath);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      return [{
        file: filePath,
        comment: 'ファイルを読み取れませんでした',
        severity: 'warning',
      }];
    }

    // AIにレビューを依頼
    const prompt = this.buildReviewPrompt(filePath, content, criteria);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `あなたはコードレビューの専門家です。
与えられたコードをレビューし、問題点や改善提案をJSON形式で返してください。
フォーマット:
[
  {"line": 10, "comment": "コメント内容", "severity": "info|warning|error"},
  ...
]`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    try {
      const response = await this.adapter.chat({
        model: this.modelName,
        messages,
      });

      return this.parseReviewComments(filePath, response.content);
    } catch (error) {
      return [{
        file: filePath,
        comment: `レビュー生成に失敗: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
      }];
    }
  }

  /**
   * レビュープロンプトを構築
   *
   * @param filePath - ファイルパス
   * @param content - ファイル内容
   * @param criteria - レビュー基準
   * @returns プロンプト文字列
   */
  private buildReviewPrompt(
    filePath: string,
    content: string,
    criteria?: string[]
  ): string {
    let prompt = `## コードレビューリクエスト

### ファイル: ${filePath}

### コード:
\`\`\`
${content}
\`\`\`
`;

    if (criteria && criteria.length > 0) {
      prompt += `
### レビュー基準:
${criteria.map((c) => `- ${c}`).join('\n')}
`;
    }

    prompt += `
### 指示
上記のコードをレビューし、問題点や改善提案をJSON配列形式で返してください。
問題がない場合は空の配列 [] を返してください。`;

    return prompt;
  }

  /**
   * レビューコメントをパース
   *
   * @param filePath - ファイルパス
   * @param response - AIレスポンス
   * @returns レビューコメントの配列
   */
  private parseReviewComments(filePath: string, response: string): ReviewComment[] {
    try {
      // JSONを抽出
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        line?: number;
        comment: string;
        severity?: string;
      }>;

      return parsed.map((item) => ({
        file: filePath,
        line: item.line,
        comment: item.comment,
        severity: (item.severity as ReviewComment['severity']) || 'info',
      }));
    } catch {
      // パースに失敗した場合は空配列を返す
      return [];
    }
  }

  /**
   * レビューサマリーを生成
   *
   * @param comments - レビューコメント
   * @param request - レビューリクエスト
   * @returns サマリー文字列
   */
  private async generateReviewSummary(
    comments: ReviewComment[],
    request: ReviewRequest
  ): Promise<string> {
    const errorCount = comments.filter((c) => c.severity === 'error').length;
    const warningCount = comments.filter((c) => c.severity === 'warning').length;
    const infoCount = comments.filter((c) => c.severity === 'info').length;

    let summary = `## レビューサマリー

### 対象
- ブランチ: ${request.branchName}
- ファイル数: ${request.changedFiles.length}
- コミット数: ${request.commits.length}

### 結果
- エラー: ${errorCount}件
- 警告: ${warningCount}件
- 情報: ${infoCount}件
`;

    if (errorCount > 0) {
      summary += '\n### 要修正事項\n';
      comments
        .filter((c) => c.severity === 'error')
        .forEach((c) => {
          summary += `- ${c.file}${c.line ? `:${c.line}` : ''}: ${c.comment}\n`;
        });
    }

    return summary;
  }

  /**
   * 推奨アクションを決定
   *
   * @param comments - レビューコメント
   * @returns 推奨アクション
   */
  private determineRecommendedAction(
    comments: ReviewComment[]
  ): CodeReviewResult['recommendedAction'] {
    const errorCount = comments.filter((c) => c.severity === 'error').length;
    const warningCount = comments.filter((c) => c.severity === 'warning').length;

    if (errorCount > 0) {
      return 'reject';
    }
    if (warningCount > 2) {
      return 'request_changes';
    }
    return 'approve';
  }

  // ===========================================================================
  // ログ記録
  // ===========================================================================

  /**
   * レビューアクションをログに記録
   *
   * @param runId - 実行ID
   * @param action - アクション名
   * @param details - 詳細情報
   */
  private async logReviewAction(
    runId: RunId,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const runDir = path.join(RUNS_BASE_DIR, runId);
    await fs.mkdir(runDir, { recursive: true });

    const logPath = path.join(runDir, REVIEW_LOG_FILE);
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
}


// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * ReviewerAgentを作成するファクトリ関数
 *
 * @param config - Reviewer Agent設定
 * @returns ReviewerAgentインスタンス
 *
 * @example
 * ```typescript
 * const reviewer = createReviewerAgent({
 *   agentId: 'reviewer-001',
 *   adapterName: 'ollama',
 *   modelName: 'llama3',
 * });
 * ```
 */
export function createReviewerAgent(config: ReviewerAgentConfig): ReviewerAgent {
  return new ReviewerAgent(config);
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default ReviewerAgent;
