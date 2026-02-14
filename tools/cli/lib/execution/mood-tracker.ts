/**
 * モチベーショントラッカー
 *
 * エージェントのモチベーション（ムード）を算出・追跡する。
 * 成功率、負荷、エスカレーション頻度、連続失敗から総合スコアを計算し、
 * 低下時にアラートを生成する。
 *
 * @module execution/mood-tracker
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** ムード履歴エントリ */
export interface MoodEntry {
  /** スコア（0-100） */
  score: number;
  /** 記録日時 */
  timestamp: string;
  /** スコア変動要因 */
  reason?: string;
}

/** ムード履歴 */
export interface MoodHistory {
  /** エージェントID */
  agentId: string;
  /** 現在のスコア */
  currentScore: number;
  /** 履歴エントリ */
  entries: MoodEntry[];
  /** 最終更新日時 */
  lastUpdated: string;
}

/** ムードアラート */
export interface MoodAlert {
  /** エージェントID */
  agentId: string;
  /** 現在のスコア */
  score: number;
  /** アラートレベル */
  level: 'warning' | 'critical';
  /** メッセージ */
  message: string;
}

/** ムード計算用の入力データ */
export interface MoodInput {
  /** 直近の成功率（0-1） */
  recentSuccessRate: number;
  /** 負荷率（0-1、1が最大負荷） */
  workloadRatio: number;
  /** エスカレーション頻度（0-1） */
  escalationFrequency: number;
  /** 連続失敗率（0-1） */
  consecutiveFailureRatio: number;
}

// =============================================================================
// 定数
// =============================================================================

/** ムードデータ保存ディレクトリ */
const MOOD_DIR = 'runtime/state/employee-mood';

/** ムード計算の重み */
const WEIGHT_SUCCESS = 0.4;
const WEIGHT_WORKLOAD = 0.3;
const WEIGHT_ESCALATION = 0.2;
const WEIGHT_CONSECUTIVE = 0.1;

/** アラート閾値 */
const ALERT_WARNING_THRESHOLD = 50;
const ALERT_CRITICAL_THRESHOLD = 30;

/** 履歴保持上限 */
const MAX_HISTORY_ENTRIES = 100;

// =============================================================================
// MoodTracker
// =============================================================================

/**
 * モチベーショントラッカー
 *
 * エージェントのモチベーションスコアを算出・追跡し、
 * 低下時にアラートを生成する。
 */
export class MoodTracker {
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス（デフォルト: runtime/state/employee-mood）
   */
  constructor(basePath: string = MOOD_DIR) {
    this.basePath = basePath;
  }

  /**
   * ムードスコアを計算する
   *
   * 計算式:
   *   recentSuccessRate * 0.4
   * + (1 - workloadRatio) * 0.3
   * + (1 - escalationFrequency) * 0.2
   * + (1 - consecutiveFailureRatio) * 0.1
   * → 0-100 のスコア
   *
   * @param input - ムード計算用入力データ
   * @returns ムードスコア（0-100）
   */
  calculateMood(input: MoodInput): number {
    const raw =
      input.recentSuccessRate * WEIGHT_SUCCESS +
      (1 - input.workloadRatio) * WEIGHT_WORKLOAD +
      (1 - input.escalationFrequency) * WEIGHT_ESCALATION +
      (1 - input.consecutiveFailureRatio) * WEIGHT_CONSECUTIVE;

    return Math.round(Math.max(0, Math.min(100, raw * 100)));
  }

  /**
   * タスク完了/失敗後にムードを更新する
   *
   * @param agentId - エージェントID
   * @param input - ムード計算用入力データ
   * @param reason - スコア変動要因
   */
  async updateAfterTask(
    agentId: string,
    input: MoodInput,
    reason?: string
  ): Promise<void> {
    const score = this.calculateMood(input);
    const history = await this.loadHistory(agentId);

    history.currentScore = score;
    history.entries.push({
      score,
      timestamp: new Date().toISOString(),
      reason,
    });

    // 履歴上限を超えたら古いものを削除
    if (history.entries.length > MAX_HISTORY_ENTRIES) {
      history.entries = history.entries.slice(-MAX_HISTORY_ENTRIES);
    }

    history.lastUpdated = new Date().toISOString();
    await this.saveHistory(agentId, history);
  }

  /**
   * ムード推移履歴を取得する
   *
   * @param agentId - エージェントID
   * @returns ムード履歴
   */
  async getHistory(agentId: string): Promise<MoodHistory> {
    return this.loadHistory(agentId);
  }

  /**
   * 全エージェントのムードアラートをチェックする
   *
   * @returns アラート配列
   */
  async checkAlerts(): Promise<MoodAlert[]> {
    const alerts: MoodAlert[] = [];

    try {
      const entries = await fs.readdir(this.basePath);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const agentId = entry.replace('.json', '');
          const history = await this.loadHistory(agentId);

          if (history.currentScore < ALERT_CRITICAL_THRESHOLD) {
            alerts.push({
              agentId,
              score: history.currentScore,
              level: 'critical',
              message: `${agentId}のモチベーションが危険水準です（${history.currentScore}/100）`,
            });
          } else if (history.currentScore < ALERT_WARNING_THRESHOLD) {
            alerts.push({
              agentId,
              score: history.currentScore,
              level: 'warning',
              message: `${agentId}のモチベーションが低下しています（${history.currentScore}/100）`,
            });
          }
        }
      }
    } catch (error) {
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
    }

    // スコアの低い順にソート
    alerts.sort((a, b) => a.score - b.score);
    return alerts;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  private async loadHistory(agentId: string): Promise<MoodHistory> {
    try {
      const filePath = path.join(this.basePath, `${agentId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as MoodHistory;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return {
          agentId,
          currentScore: 70, // デフォルトスコア
          entries: [],
          lastUpdated: new Date().toISOString(),
        };
      }
      throw error;
    }
  }

  private async saveHistory(agentId: string, history: MoodHistory): Promise<void> {
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
