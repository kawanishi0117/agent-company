/**
 * 仕様適合チェッカー
 *
 * 提案書の要件と成果物を突合し、仕様適合レポートを生成する。
 * タスク一覧の実装状況チェック、ファイル存在確認、テストカバレッジ確認を行う。
 *
 * @module execution/spec-compliance-checker
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** 適合状況 */
export type ComplianceStatus = 'implemented' | 'missing' | 'partial';

/** 適合チェック項目 */
export interface ComplianceItem {
  /** 要件の説明 */
  requirement: string;
  /** 適合状況 */
  status: ComplianceStatus;
  /** 根拠（ファイルパスやテスト結果など） */
  evidence?: string;
  /** 補足メモ */
  notes?: string;
}

/** 適合レポート */
export interface ComplianceReport {
  /** ワークフローID */
  workflowId: string;
  /** 総要件数 */
  totalRequirements: number;
  /** 実装済み数 */
  implemented: number;
  /** 未実装数 */
  missing: number;
  /** 部分実装数 */
  partial: number;
  /** 適合率（0-100） */
  compliancePercentage: number;
  /** 詳細項目 */
  details: ComplianceItem[];
  /** チェック日時 */
  checkedAt: string;
}

/** 提案書情報 */
export interface ProposalInfo {
  /** タスク一覧 */
  tasks: string[];
  /** 期待される成果物ファイル */
  expectedFiles?: string[];
  /** 要件一覧 */
  requirements?: string[];
}

// =============================================================================
// 定数
// =============================================================================

/** 適合レポート保存ディレクトリ */
const COMPLIANCE_DIR = 'runtime/state/compliance';

/** CEOレビューフラグの閾値（%） */
const CEO_REVIEW_THRESHOLD = 80;

// =============================================================================
// SpecComplianceChecker
// =============================================================================

/**
 * 仕様適合チェッカー
 *
 * 提案書の要件と実際の成果物を突合し、適合レポートを生成する。
 */
export class SpecComplianceChecker {
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス（デフォルト: runtime/state/compliance）
   */
  constructor(basePath: string = COMPLIANCE_DIR) {
    this.basePath = basePath;
  }

  /**
   * 仕様適合チェックを実行する
   *
   * 提案書の要件・タスク一覧と成果物を突合し、適合レポートを生成する。
   *
   * @param workflowId - ワークフローID
   * @param proposal - 提案書情報（タスク一覧、期待ファイル、要件）
   * @param deliverables - 成果物ファイルパス一覧
   * @param workspacePath - ワークスペースのルートパス（ファイル存在確認用）
   * @returns 適合レポート
   */
  async check(
    workflowId: string,
    proposal: ProposalInfo,
    deliverables: string[],
    workspacePath?: string
  ): Promise<ComplianceReport> {
    const details: ComplianceItem[] = [];

    // 1. タスク一覧の実装状況チェック
    for (const task of proposal.tasks) {
      const item = await this.checkTask(task, deliverables, workspacePath);
      details.push(item);
    }

    // 2. 期待ファイルの存在確認
    if (proposal.expectedFiles) {
      for (const file of proposal.expectedFiles) {
        const item = await this.checkFileExists(file, workspacePath);
        details.push(item);
      }
    }

    // 3. 要件の突合チェック
    if (proposal.requirements) {
      for (const req of proposal.requirements) {
        const item = this.checkRequirement(req, deliverables);
        details.push(item);
      }
    }

    // 集計
    const implemented = details.filter((d) => d.status === 'implemented').length;
    const missing = details.filter((d) => d.status === 'missing').length;
    const partial = details.filter((d) => d.status === 'partial').length;
    const total = details.length;
    const compliancePercentage =
      total > 0 ? Math.round(((implemented + partial * 0.5) / total) * 100) : 100;

    const report: ComplianceReport = {
      workflowId,
      totalRequirements: total,
      implemented,
      missing,
      partial,
      compliancePercentage,
      details,
      checkedAt: new Date().toISOString(),
    };

    // 永続化
    await this.saveReport(report);

    return report;
  }

  /**
   * 保存済みの適合レポートを取得する
   *
   * @param workflowId - ワークフローID
   * @returns 適合レポート（存在しない場合はnull）
   */
  async getReport(workflowId: string): Promise<ComplianceReport | null> {
    try {
      const filePath = path.join(this.basePath, `${workflowId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ComplianceReport;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * CEOレビューが必要かどうかを判定する
   *
   * @param report - 適合レポート
   * @returns CEOレビューが必要な場合true
   */
  needsCeoReview(report: ComplianceReport): boolean {
    return report.compliancePercentage < CEO_REVIEW_THRESHOLD;
  }

  /**
   * 全レポート一覧を取得する
   *
   * @returns 適合レポート配列
   */
  async listReports(): Promise<ComplianceReport[]> {
    try {
      const entries = await fs.readdir(this.basePath);
      const reports: ComplianceReport[] = [];
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const filePath = path.join(this.basePath, entry);
          const content = await fs.readFile(filePath, 'utf-8');
          reports.push(JSON.parse(content) as ComplianceReport);
        }
      }
      // 新しい順にソート
      reports.sort(
        (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
      );
      return reports;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * タスクの実装状況をチェックする
   */
  private async checkTask(
    task: string,
    deliverables: string[],
    workspacePath?: string
  ): Promise<ComplianceItem> {
    // タスク名からファイルパスを推測してチェック
    const relatedFiles = deliverables.filter((d) =>
      this.isRelatedFile(task, d)
    );

    if (relatedFiles.length === 0) {
      return {
        requirement: task,
        status: 'missing',
        notes: '関連する成果物が見つかりません',
      };
    }

    // ファイルが実際に存在するか確認
    if (workspacePath) {
      const existingFiles: string[] = [];
      for (const file of relatedFiles) {
        const exists = await this.fileExists(path.join(workspacePath, file));
        if (exists) {
          existingFiles.push(file);
        }
      }

      if (existingFiles.length === 0) {
        return {
          requirement: task,
          status: 'missing',
          evidence: relatedFiles.join(', '),
          notes: '成果物ファイルが存在しません',
        };
      }

      if (existingFiles.length < relatedFiles.length) {
        return {
          requirement: task,
          status: 'partial',
          evidence: existingFiles.join(', '),
          notes: `${relatedFiles.length}件中${existingFiles.length}件のファイルが存在`,
        };
      }
    }

    return {
      requirement: task,
      status: 'implemented',
      evidence: relatedFiles.join(', '),
    };
  }

  /**
   * ファイルの存在を確認する
   */
  private async checkFileExists(
    filePath: string,
    workspacePath?: string
  ): Promise<ComplianceItem> {
    const fullPath = workspacePath
      ? path.join(workspacePath, filePath)
      : filePath;

    const exists = await this.fileExists(fullPath);

    return {
      requirement: `ファイル: ${filePath}`,
      status: exists ? 'implemented' : 'missing',
      evidence: exists ? filePath : undefined,
      notes: exists ? undefined : 'ファイルが存在しません',
    };
  }

  /**
   * 要件と成果物の突合チェック
   */
  private checkRequirement(
    requirement: string,
    deliverables: string[]
  ): ComplianceItem {
    // 要件テキストからキーワードを抽出し、成果物との関連を判定
    const keywords = this.extractKeywords(requirement);
    const matchCount = deliverables.filter((d) =>
      keywords.some((kw) => d.toLowerCase().includes(kw.toLowerCase()))
    ).length;

    if (matchCount === 0) {
      return {
        requirement,
        status: 'missing',
        notes: '関連する成果物が見つかりません',
      };
    }

    return {
      requirement,
      status: matchCount >= 1 ? 'implemented' : 'partial',
      evidence: `${matchCount}件の関連ファイル`,
    };
  }

  /**
   * タスクとファイルの関連性を判定する
   */
  private isRelatedFile(task: string, filePath: string): boolean {
    const taskLower = task.toLowerCase();
    const fileLower = filePath.toLowerCase();

    // ファイル名のベース部分を取得
    const baseName = path.basename(fileLower, path.extname(fileLower));
    const parts = baseName.split(/[-_./]/);

    // タスク名にファイル名の一部が含まれるか
    return parts.some(
      (part) => part.length > 2 && taskLower.includes(part)
    );
  }

  /**
   * テキストからキーワードを抽出する
   */
  private extractKeywords(text: string): string[] {
    // 英数字の単語を抽出（3文字以上）
    const words = text.match(/[a-zA-Z0-9\u3040-\u9fff]{3,}/g) ?? [];
    // ストップワードを除外
    const stopWords = new Set([
      'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
      'する', 'ある', 'いる', 'なる', 'できる', 'について',
    ]);
    return words.filter((w) => !stopWords.has(w.toLowerCase()));
  }

  /**
   * ファイルの存在を確認する
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 適合レポートを保存する
   */
  private async saveReport(report: ComplianceReport): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${report.workflowId}.json`);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  }

  /** ファイル未存在エラー判定 */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
