/**
 * キャリアマネージャー
 *
 * エージェントの昇進/降格を管理し、キャリア履歴を追跡する。
 * パフォーマンスに基づいて昇進候補を自動検出する。
 *
 * @module execution/career-manager
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** キャリアレベル */
export type CareerLevel = 'junior' | 'mid' | 'senior' | 'lead' | 'principal';

/** キャリアイベント */
export interface CareerEvent {
  /** イベント種別 */
  type: 'promotion' | 'demotion' | 'initial';
  /** 変更前レベル */
  fromLevel: CareerLevel;
  /** 変更後レベル */
  toLevel: CareerLevel;
  /** 理由 */
  reason: string;
  /** 日時 */
  timestamp: string;
}

/** キャリア履歴 */
export interface CareerHistory {
  /** エージェントID */
  agentId: string;
  /** 現在のレベル */
  currentLevel: CareerLevel;
  /** イベント履歴 */
  events: CareerEvent[];
  /** 最終更新日時 */
  lastUpdated: string;
}

/** 昇進提案 */
export interface PromotionSuggestion {
  /** エージェントID */
  agentId: string;
  /** 現在のレベル */
  currentLevel: CareerLevel;
  /** 提案レベル */
  suggestedLevel: CareerLevel;
  /** 理由 */
  reason: string;
  /** 根拠データ */
  evidence: {
    successRate: number;
    avgQuality: number;
    totalTasks: number;
  };
}

// =============================================================================
// 定数
// =============================================================================

/** キャリアデータ保存ディレクトリ */
const CAREER_DIR = 'runtime/state/career';

/** レベル順序（昇順） */
const LEVEL_ORDER: CareerLevel[] = ['junior', 'mid', 'senior', 'lead', 'principal'];

/** 昇進条件 */
const PROMOTION_CRITERIA: Record<CareerLevel, { minSuccessRate: number; minQuality: number; minTasks: number }> = {
  junior: { minSuccessRate: 0, minQuality: 0, minTasks: 0 },
  mid: { minSuccessRate: 0.7, minQuality: 60, minTasks: 10 },
  senior: { minSuccessRate: 0.8, minQuality: 70, minTasks: 25 },
  lead: { minSuccessRate: 0.85, minQuality: 80, minTasks: 50 },
  principal: { minSuccessRate: 0.9, minQuality: 85, minTasks: 100 },
};

/** 降格条件 */
const DEMOTION_SUCCESS_RATE_THRESHOLD = 0.4;
const DEMOTION_QUALITY_THRESHOLD = 40;

// =============================================================================
// CareerManager
// =============================================================================

/**
 * キャリアマネージャー
 *
 * エージェントのキャリアレベルを管理し、昇進/降格を実行する。
 */
export class CareerManager {
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス
   */
  constructor(basePath: string = CAREER_DIR) {
    this.basePath = basePath;
  }

  /**
   * 昇進/降格の候補を自動検出する
   *
   * @param agentId - エージェントID
   * @param performance - パフォーマンスデータ
   * @returns 昇進提案（該当なしの場合はnull）
   */
  async checkPromotionEligibility(
    agentId: string,
    performance: { successRate: number; avgQuality: number; totalTasks: number }
  ): Promise<PromotionSuggestion | null> {
    const currentLevel = await this.getCurrentLevel(agentId);
    const currentIdx = LEVEL_ORDER.indexOf(currentLevel);

    // 昇進チェック
    if (currentIdx < LEVEL_ORDER.length - 1) {
      const nextLevel = LEVEL_ORDER[currentIdx + 1];
      const criteria = PROMOTION_CRITERIA[nextLevel];

      if (
        performance.successRate >= criteria.minSuccessRate &&
        performance.avgQuality >= criteria.minQuality &&
        performance.totalTasks >= criteria.minTasks
      ) {
        return {
          agentId,
          currentLevel,
          suggestedLevel: nextLevel,
          reason: `成功率${(performance.successRate * 100).toFixed(0)}%、品質${performance.avgQuality}、タスク${performance.totalTasks}件で${nextLevel}の基準を満たしています`,
          evidence: performance,
        };
      }
    }

    // 降格チェック
    if (currentIdx > 0) {
      if (
        performance.successRate < DEMOTION_SUCCESS_RATE_THRESHOLD &&
        performance.avgQuality < DEMOTION_QUALITY_THRESHOLD &&
        performance.totalTasks >= 5
      ) {
        const prevLevel = LEVEL_ORDER[currentIdx - 1];
        return {
          agentId,
          currentLevel,
          suggestedLevel: prevLevel,
          reason: `成功率${(performance.successRate * 100).toFixed(0)}%、品質${performance.avgQuality}で基準を下回っています`,
          evidence: performance,
        };
      }
    }

    return null;
  }

  /**
   * 昇進を実行する
   *
   * @param agentId - エージェントID
   * @param newLevel - 新しいレベル
   * @param reason - 理由
   */
  async promote(agentId: string, newLevel: CareerLevel, reason: string = ''): Promise<void> {
    const history = await this.loadHistory(agentId);
    const fromLevel = history.currentLevel;

    history.events.push({
      type: 'promotion',
      fromLevel,
      toLevel: newLevel,
      reason: reason || `${fromLevel} → ${newLevel} に昇進`,
      timestamp: new Date().toISOString(),
    });
    history.currentLevel = newLevel;
    history.lastUpdated = new Date().toISOString();

    await this.saveHistory(agentId, history);
  }

  /**
   * 降格を実行する
   *
   * @param agentId - エージェントID
   * @param newLevel - 新しいレベル
   * @param reason - 理由
   */
  async demote(agentId: string, newLevel: CareerLevel, reason: string = ''): Promise<void> {
    const history = await this.loadHistory(agentId);
    const fromLevel = history.currentLevel;

    history.events.push({
      type: 'demotion',
      fromLevel,
      toLevel: newLevel,
      reason: reason || `${fromLevel} → ${newLevel} に降格`,
      timestamp: new Date().toISOString(),
    });
    history.currentLevel = newLevel;
    history.lastUpdated = new Date().toISOString();

    await this.saveHistory(agentId, history);
  }

  /**
   * キャリア履歴を取得する
   *
   * @param agentId - エージェントID
   * @returns キャリア履歴
   */
  async getHistory(agentId: string): Promise<CareerHistory> {
    return this.loadHistory(agentId);
  }

  /**
   * 現在のレベルを取得する
   *
   * @param agentId - エージェントID
   * @returns 現在のキャリアレベル
   */
  async getCurrentLevel(agentId: string): Promise<CareerLevel> {
    const history = await this.loadHistory(agentId);
    return history.currentLevel;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  private async loadHistory(agentId: string): Promise<CareerHistory> {
    try {
      const filePath = path.join(this.basePath, `${agentId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as CareerHistory;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return {
          agentId,
          currentLevel: 'mid', // デフォルトレベル
          events: [{
            type: 'initial',
            fromLevel: 'mid',
            toLevel: 'mid',
            reason: '初期レベル設定',
            timestamp: new Date().toISOString(),
          }],
          lastUpdated: new Date().toISOString(),
        };
      }
      throw error;
    }
  }

  private async saveHistory(agentId: string, history: CareerHistory): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${agentId}.json`);
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
