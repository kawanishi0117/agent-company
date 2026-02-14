/**
 * ナレッジベースマネージャー
 *
 * レトロスペクティブやエスカレーション解決から得られた知見を
 * 構造化して蓄積・検索可能にする。
 *
 * @module execution/knowledge-base-manager
 * @see Requirements: 7.1, 7.2, 7.5, 7.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { RetrospectiveResult } from './retrospective-engine.js';

// =============================================================================
// 型定義
// =============================================================================

/** ナレッジエントリのカテゴリ */
export type KnowledgeCategory =
  | 'best_practice'
  | 'failure_case'
  | 'technical_note'
  | 'process_improvement';

/** ナレッジエントリ */
export interface KnowledgeEntry {
  /** エントリID */
  id: string;
  /** タイトル */
  title: string;
  /** カテゴリ */
  category: KnowledgeCategory;
  /** 内容 */
  content: string;
  /** タグ */
  tags: string[];
  /** 関連ワークフローID */
  relatedWorkflows: string[];
  /** 作成者エージェントID */
  authorAgentId: string;
  /** 作成日時 */
  createdAt: string;
}

/** ナレッジエントリ作成用の入力型 */
export type KnowledgeEntryInput = Omit<KnowledgeEntry, 'id' | 'createdAt'>;

/** 検索フィルタ */
export interface KnowledgeSearchFilters {
  /** カテゴリフィルタ */
  category?: KnowledgeCategory;
  /** タグフィルタ */
  tags?: string[];
}

// =============================================================================
// 定数
// =============================================================================

/** ナレッジベース保存ディレクトリ */
const KNOWLEDGE_BASE_DIR = 'runtime/state/knowledge-base';

/** インデックスファイル名 */
const INDEX_FILE = 'index.json';

/** エントリ保存サブディレクトリ */
const ENTRIES_DIR = 'entries';

// =============================================================================
// KnowledgeBaseManager
// =============================================================================

/**
 * ナレッジベースマネージャー
 *
 * 組織の知見を蓄積・検索・活用するためのマネージャー。
 *
 * @see Requirements: 7.1, 7.2, 7.5, 7.6
 */
export class KnowledgeBaseManager {
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス
   */
  constructor(basePath: string = KNOWLEDGE_BASE_DIR) {
    this.basePath = basePath;
  }

  /**
   * ナレッジエントリを追加する
   *
   * @param input - エントリ入力データ
   * @returns 作成されたエントリ
   * @see Requirements: 7.1
   */
  async addEntry(input: KnowledgeEntryInput): Promise<KnowledgeEntry> {
    const entry: KnowledgeEntry = {
      ...input,
      id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    // エントリファイルを保存
    const entriesDir = path.join(this.basePath, ENTRIES_DIR);
    await fs.mkdir(entriesDir, { recursive: true });
    const entryPath = path.join(entriesDir, `${entry.id}.json`);
    await fs.writeFile(entryPath, JSON.stringify(entry, null, 2), 'utf-8');

    // インデックスを更新
    await this.addToIndex(entry);

    return entry;
  }

  /**
   * キーワード検索
   *
   * @param query - 検索クエリ
   * @param filters - フィルタ条件
   * @returns マッチしたエントリ配列
   * @see Requirements: 7.2
   */
  async search(
    query: string,
    filters?: KnowledgeSearchFilters
  ): Promise<KnowledgeEntry[]> {
    const index = await this.loadIndex();
    const lowerQuery = query.toLowerCase();

    return index.filter((entry) => {
      // キーワードマッチ
      const matchesQuery =
        !query ||
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.content.toLowerCase().includes(lowerQuery) ||
        entry.tags.some((t) => t.toLowerCase().includes(lowerQuery));

      // カテゴリフィルタ
      const matchesCategory =
        !filters?.category || entry.category === filters.category;

      // タグフィルタ
      const matchesTags =
        !filters?.tags ||
        filters.tags.length === 0 ||
        filters.tags.some((ft) => entry.tags.includes(ft));

      return matchesQuery && matchesCategory && matchesTags;
    });
  }

  /**
   * エントリを取得する
   *
   * @param id - エントリID
   * @returns エントリ（存在しない場合はnull）
   */
  async getEntry(id: string): Promise<KnowledgeEntry | null> {
    try {
      const entryPath = path.join(this.basePath, ENTRIES_DIR, `${id}.json`);
      const content = await fs.readFile(entryPath, 'utf-8');
      return JSON.parse(content) as KnowledgeEntry;
    } catch (error) {
      if (this.isFileNotFoundError(error)) return null;
      throw error;
    }
  }

  /**
   * 全エントリを取得する
   *
   * @returns エントリ配列（新しい順）
   */
  async listEntries(): Promise<KnowledgeEntry[]> {
    const index = await this.loadIndex();
    return index.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * レトロスペクティブ結果からナレッジエントリを自動生成する
   *
   * @param result - レトロスペクティブ結果
   * @returns 生成されたエントリ配列
   * @see Requirements: 7.5
   */
  async autoGenerateFromRetrospective(
    result: RetrospectiveResult
  ): Promise<KnowledgeEntry[]> {
    const entries: KnowledgeEntry[] = [];

    // 良かった点からベストプラクティスを生成
    for (const point of result.goodPoints) {
      if (point === '特記事項なし') continue;
      const entry = await this.addEntry({
        title: `ベストプラクティス: ${point.slice(0, 50)}`,
        category: 'best_practice',
        content: point,
        tags: ['retrospective', 'auto-generated'],
        relatedWorkflows: [result.workflowId],
        authorAgentId: 'quality_authority',
      });
      entries.push(entry);
    }

    // 改善点から失敗事例を生成
    for (const point of result.improvementPoints) {
      if (point === '特記事項なし') continue;
      const entry = await this.addEntry({
        title: `改善事例: ${point.slice(0, 50)}`,
        category: 'failure_case',
        content: point,
        tags: ['retrospective', 'auto-generated', 'improvement'],
        relatedWorkflows: [result.workflowId],
        authorAgentId: 'quality_authority',
      });
      entries.push(entry);
    }

    return entries;
  }

  /**
   * エスカレーション解決からナレッジエントリを自動生成する
   *
   * @param escalation - エスカレーション情報
   * @returns 生成されたエントリ（生成不要の場合はnull）
   * @see Requirements: 7.6
   */
  async autoGenerateFromEscalation(escalation: {
    pattern: string;
    resolution: string;
    agentId: string;
    workflowId?: string;
  }): Promise<KnowledgeEntry | null> {
    if (!escalation.resolution) return null;

    return this.addEntry({
      title: `エスカレーション解決: ${escalation.pattern.slice(0, 50)}`,
      category: 'process_improvement',
      content: `問題: ${escalation.pattern}\n解決策: ${escalation.resolution}`,
      tags: ['escalation', 'auto-generated', 'resolution'],
      relatedWorkflows: escalation.workflowId
        ? [escalation.workflowId]
        : [],
      authorAgentId: escalation.agentId,
    });
  }

  /**
   * ワークフロー指示に関連するエントリを検索する
   *
   * @param instruction - ワークフロー指示文
   * @returns 関連エントリ配列
   * @see Requirements: 7.7
   */
  async getRelevantForWorkflow(
    instruction: string
  ): Promise<KnowledgeEntry[]> {
    // 指示文からキーワードを抽出して検索
    const keywords = instruction
      .split(/[\s、。,.\-_/]+/)
      .filter((w) => w.length >= 2)
      .slice(0, 5);

    const allResults = new Map<string, KnowledgeEntry>();

    for (const keyword of keywords) {
      const results = await this.search(keyword);
      for (const entry of results) {
        allResults.set(entry.id, entry);
      }
    }

    return Array.from(allResults.values()).slice(0, 10);
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /** インデックスを読み込む */
  private async loadIndex(): Promise<KnowledgeEntry[]> {
    try {
      const indexPath = path.join(this.basePath, INDEX_FILE);
      const content = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(content) as KnowledgeEntry[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) return [];
      throw error;
    }
  }

  /** インデックスにエントリを追加 */
  private async addToIndex(entry: KnowledgeEntry): Promise<void> {
    const index = await this.loadIndex();
    index.push(entry);
    await fs.mkdir(this.basePath, { recursive: true });
    const indexPath = path.join(this.basePath, INDEX_FILE);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
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
