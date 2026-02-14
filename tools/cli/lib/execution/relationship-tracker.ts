/**
 * 関係性トラッカー
 *
 * 社員間のインタラクションを記録し、関係性マップを生成する。
 * 会議、レビュー、ハンドオフなどのインタラクションを追跡し、
 * コラボレーションの強度を可視化する。
 *
 * @module execution/relationship-tracker
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** インタラクション種別 */
export type InteractionType = 'meeting' | 'review' | 'handoff' | 'chat';

/** インタラクション記録 */
export interface InteractionRecord {
  /** エージェントA */
  agentA: string;
  /** エージェントB */
  agentB: string;
  /** インタラクション種別 */
  type: InteractionType;
  /** 記録日時 */
  timestamp: string;
  /** 関連ワークフローID */
  workflowId?: string;
}

/** 関係性ペア */
export interface RelationshipPair {
  /** エージェントA */
  agentA: string;
  /** エージェントB */
  agentB: string;
  /** インタラクション回数 */
  interactionCount: number;
  /** 種別別カウント */
  typeCounts: Record<InteractionType, number>;
  /** 関係性スコア（0-100） */
  score: number;
}

/** 関係性マップ */
export interface RelationshipMap {
  /** 全ペアの関係性 */
  pairs: RelationshipPair[];
  /** 全エージェントID */
  agents: string[];
  /** 生成日時 */
  generatedAt: string;
}

/** コラボレーター情報 */
export interface CollaboratorInfo {
  /** エージェントID */
  agentId: string;
  /** 関係性スコア */
  score: number;
  /** インタラクション回数 */
  interactionCount: number;
}

// =============================================================================
// 定数
// =============================================================================

/** データ保存ディレクトリ */
const RELATIONSHIPS_DIR = 'runtime/state/relationships';

/** インタラクションファイル名 */
const INTERACTIONS_FILE = 'interactions.json';

// =============================================================================
// RelationshipTracker
// =============================================================================

/**
 * 関係性トラッカー
 *
 * 社員間のインタラクションを記録し、関係性マップを生成する。
 */
export class RelationshipTracker {
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス
   */
  constructor(basePath: string = RELATIONSHIPS_DIR) {
    this.basePath = basePath;
  }

  /**
   * インタラクションを記録する
   *
   * @param record - インタラクション記録
   */
  async recordInteraction(record: InteractionRecord): Promise<void> {
    const records = await this.loadRecords();
    records.push({
      ...record,
      timestamp: record.timestamp || new Date().toISOString(),
    });
    await this.saveRecords(records);
  }

  /**
   * 全社員の関係性マップを生成する
   *
   * @returns 関係性マップ
   */
  async getMap(): Promise<RelationshipMap> {
    const records = await this.loadRecords();
    const agentSet = new Set<string>();
    const pairMap = new Map<string, { counts: Record<InteractionType, number>; total: number }>();

    for (const record of records) {
      agentSet.add(record.agentA);
      agentSet.add(record.agentB);

      // ペアキーを正規化（アルファベット順）
      const key = [record.agentA, record.agentB].sort().join('::');
      const existing = pairMap.get(key) ?? {
        counts: { meeting: 0, review: 0, handoff: 0, chat: 0 },
        total: 0,
      };
      existing.counts[record.type]++;
      existing.total++;
      pairMap.set(key, existing);
    }

    // 最大インタラクション数を取得（スコア正規化用）
    const maxCount = Math.max(1, ...Array.from(pairMap.values()).map((v) => v.total));

    const pairs: RelationshipPair[] = [];
    for (const [key, data] of pairMap) {
      const [agentA, agentB] = key.split('::');
      pairs.push({
        agentA,
        agentB,
        interactionCount: data.total,
        typeCounts: data.counts,
        score: Math.round((data.total / maxCount) * 100),
      });
    }

    // スコア降順にソート
    pairs.sort((a, b) => b.score - a.score);

    return {
      pairs,
      agents: Array.from(agentSet).sort(),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 特定社員のトップコラボレーターを取得する
   *
   * @param agentId - エージェントID
   * @param limit - 取得件数（デフォルト: 5）
   * @returns コラボレーター情報配列
   */
  async getCollaborators(
    agentId: string,
    limit: number = 5
  ): Promise<CollaboratorInfo[]> {
    const map = await this.getMap();
    const collaborators: CollaboratorInfo[] = [];

    for (const pair of map.pairs) {
      if (pair.agentA === agentId) {
        collaborators.push({
          agentId: pair.agentB,
          score: pair.score,
          interactionCount: pair.interactionCount,
        });
      } else if (pair.agentB === agentId) {
        collaborators.push({
          agentId: pair.agentA,
          score: pair.score,
          interactionCount: pair.interactionCount,
        });
      }
    }

    // スコア降順でソートし、上位N件を返す
    collaborators.sort((a, b) => b.score - a.score);
    return collaborators.slice(0, limit);
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  private async loadRecords(): Promise<InteractionRecord[]> {
    try {
      const filePath = path.join(this.basePath, INTERACTIONS_FILE);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as InteractionRecord[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async saveRecords(records: InteractionRecord[]): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, INTERACTIONS_FILE);
    await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
