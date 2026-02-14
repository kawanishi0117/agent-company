/**
 * MVP選出エンジン
 *
 * タスク完了数、品質、コラボレーション、ナレッジ貢献からスコアを算出し、
 * 月間MVPの候補を選出・表彰する。
 *
 * @module execution/mvp-selector
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** MVP候補 */
export interface MVPCandidate {
  /** エージェントID */
  agentId: string;
  /** 総合スコア */
  totalScore: number;
  /** スコア内訳 */
  breakdown: {
    /** タスク完了スコア */
    taskCompletion: number;
    /** 品質スコア */
    quality: number;
    /** コラボレーションスコア */
    collaboration: number;
    /** ナレッジ貢献スコア */
    knowledgeContribution: number;
  };
}

/** MVP表彰 */
export interface MVPAward {
  /** 対象月（YYYY-MM） */
  month: string;
  /** 受賞者エージェントID */
  agentId: string;
  /** 総合スコア */
  score: number;
  /** 表彰理由 */
  reason: string;
  /** 表彰日時 */
  awardedAt: string;
}

/** スコア計算用の入力データ */
export interface MVPScoreInput {
  /** エージェントID */
  agentId: string;
  /** タスク完了数 */
  tasksCompleted: number;
  /** 平均品質スコア（0-100） */
  avgQuality: number;
  /** コラボレーション回数 */
  collaborationCount: number;
  /** ナレッジ貢献数 */
  knowledgeContributions: number;
}

// =============================================================================
// 定数
// =============================================================================

/** MVP履歴保存ファイル */
const AWARDS_DIR = 'runtime/state/awards';
const MVP_HISTORY_FILE = 'mvp-history.json';

/** スコア計算の重み */
const WEIGHT_TASK = 0.35;
const WEIGHT_QUALITY = 0.30;
const WEIGHT_COLLAB = 0.20;
const WEIGHT_KNOWLEDGE = 0.15;

// =============================================================================
// MVPSelector
// =============================================================================

/**
 * MVP選出エンジン
 *
 * エージェントの貢献度を多角的に評価し、MVPを選出する。
 */
export class MVPSelector {
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス
   */
  constructor(basePath: string = AWARDS_DIR) {
    this.basePath = basePath;
  }

  /**
   * 全候補のスコアを計算する
   *
   * @param inputs - 各エージェントのスコア入力データ
   * @returns MVP候補配列（スコア降順）
   */
  calculateScores(inputs: MVPScoreInput[]): MVPCandidate[] {
    if (inputs.length === 0) return [];

    // 各指標の最大値を取得（正規化用）
    const maxTasks = Math.max(1, ...inputs.map((i) => i.tasksCompleted));
    const maxCollab = Math.max(1, ...inputs.map((i) => i.collaborationCount));
    const maxKnowledge = Math.max(1, ...inputs.map((i) => i.knowledgeContributions));

    const candidates: MVPCandidate[] = inputs.map((input) => {
      const taskScore = (input.tasksCompleted / maxTasks) * 100;
      const qualityScore = input.avgQuality;
      const collabScore = (input.collaborationCount / maxCollab) * 100;
      const knowledgeScore = (input.knowledgeContributions / maxKnowledge) * 100;

      const totalScore = Math.round(
        taskScore * WEIGHT_TASK +
        qualityScore * WEIGHT_QUALITY +
        collabScore * WEIGHT_COLLAB +
        knowledgeScore * WEIGHT_KNOWLEDGE
      );

      return {
        agentId: input.agentId,
        totalScore,
        breakdown: {
          taskCompletion: Math.round(taskScore),
          quality: Math.round(qualityScore),
          collaboration: Math.round(collabScore),
          knowledgeContribution: Math.round(knowledgeScore),
        },
      };
    });

    // スコア降順にソート
    candidates.sort((a, b) => b.totalScore - a.totalScore);
    return candidates;
  }

  /**
   * 上位N名の候補を選出する
   *
   * @param inputs - 各エージェントのスコア入力データ
   * @param topN - 選出人数（デフォルト: 3）
   * @returns 上位候補配列
   */
  selectCandidates(inputs: MVPScoreInput[], topN: number = 3): MVPCandidate[] {
    const all = this.calculateScores(inputs);
    return all.slice(0, topN);
  }

  /**
   * MVPを表彰する
   *
   * @param month - 対象月（YYYY-MM）
   * @param agentId - 受賞者エージェントID
   * @param score - 総合スコア
   * @param reason - 表彰理由
   * @returns MVP表彰データ
   */
  async award(
    month: string,
    agentId: string,
    score: number,
    reason: string = ''
  ): Promise<MVPAward> {
    const award: MVPAward = {
      month,
      agentId,
      score,
      reason: reason || `${month}の月間MVP`,
      awardedAt: new Date().toISOString(),
    };

    const history = await this.loadHistory();
    // 同月の既存表彰を上書き
    const existingIdx = history.findIndex((a) => a.month === month);
    if (existingIdx >= 0) {
      history[existingIdx] = award;
    } else {
      history.push(award);
    }
    // 月順にソート
    history.sort((a, b) => b.month.localeCompare(a.month));
    await this.saveHistory(history);

    return award;
  }

  /**
   * 過去のMVP履歴を取得する
   *
   * @returns MVP表彰配列（新しい順）
   */
  async getHistory(): Promise<MVPAward[]> {
    return this.loadHistory();
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  private async loadHistory(): Promise<MVPAward[]> {
    try {
      const filePath = path.join(this.basePath, MVP_HISTORY_FILE);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as MVPAward[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async saveHistory(history: MVPAward[]): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, MVP_HISTORY_FILE);
    await fs.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8');
  }

  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
