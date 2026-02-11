/**
 * コーディングエージェントレジストリ
 *
 * 利用可能なコーディングエージェントの登録・検出・選択を一元管理する。
 * 優先度ベースのフォールバック選択、可用性キャッシュを提供。
 *
 * @module coding-agents/index
 * @see Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import type { CodingAgentAdapter } from './base.js';
import { CodingAgentError } from './base.js';
import { createOpenCodeAdapter } from './opencode.js';
import { createClaudeCodeAdapter } from './claude-code.js';
import { createKiroCliAdapter } from './kiro-cli.js';

// =============================================================================
// 定数
// =============================================================================

/** 可用性キャッシュのデフォルトTTL（ミリ秒） */
const DEFAULT_CACHE_TTL_MS = 60_000;

// =============================================================================
// キャッシュ型
// =============================================================================

/**
 * 可用性キャッシュエントリ
 */
interface AvailabilityCacheEntry {
  /** 利用可能フラグ */
  available: boolean;
  /** キャッシュ日時 */
  cachedAt: number;
}

// =============================================================================
// デフォルトアダプタ優先度
// =============================================================================

/**
 * デフォルトのアダプタ優先度順
 * @description 上から順に優先度が高い
 */
const DEFAULT_PRIORITY: string[] = [
  'claude-code',
  'opencode',
  'kiro-cli',
];

// =============================================================================
// レジストリ
// =============================================================================

/**
 * コーディングエージェントレジストリ
 *
 * アダプタの登録、取得、自動検出、優先度ベースのフォールバック選択を管理する。
 *
 * @see Requirement 5.1: THE CodingAgentRegistry SHALL detect installed coding agents
 * @see Requirement 5.2: THE CodingAgentRegistry SHALL provide getAvailableAgents()
 * @see Requirement 5.3: THE CodingAgentRegistry SHALL provide getAdapter(name)
 * @see Requirement 5.4: THE CodingAgentRegistry SHALL support priority-based selection
 * @see Requirement 5.5: THE CodingAgentRegistry SHALL cache availability results
 */
export class CodingAgentRegistry {
  /** 登録済みアダプタ */
  private adapters: Map<string, CodingAgentAdapter> = new Map();

  /** 可用性キャッシュ */
  private availabilityCache: Map<string, AvailabilityCacheEntry> = new Map();

  /** キャッシュTTL（ミリ秒） */
  private cacheTtlMs: number;

  /** アダプタ優先度順 */
  private priority: string[];

  /**
   * コンストラクタ
   * @param cacheTtlMs - キャッシュTTL（ミリ秒、デフォルト: 60秒）
   * @param priority - アダプタ優先度順（オプション）
   */
  constructor(cacheTtlMs = DEFAULT_CACHE_TTL_MS, priority?: string[]) {
    this.cacheTtlMs = cacheTtlMs;
    this.priority = priority ?? [...DEFAULT_PRIORITY];

    // デフォルトアダプタを登録
    this.registerDefaults();
  }

  /**
   * デフォルトアダプタを登録
   */
  private registerDefaults(): void {
    this.registerAdapter(createClaudeCodeAdapter());
    this.registerAdapter(createOpenCodeAdapter());
    this.registerAdapter(createKiroCliAdapter());
  }

  /**
   * アダプタを登録
   * @param adapter - 登録するアダプタ
   */
  registerAdapter(adapter: CodingAgentAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * 名前でアダプタを取得
   *
   * @param name - アダプタ名
   * @returns アダプタインスタンス
   * @throws {CodingAgentError} アダプタが見つからない場合
   * @see Requirement 5.3: THE CodingAgentRegistry SHALL provide getAdapter(name)
   */
  getAdapter(name: string): CodingAgentAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      const available = Array.from(this.adapters.keys()).join(', ');
      throw new CodingAgentError(
        `コーディングエージェント '${name}' は登録されていません。利用可能: ${available}`,
        'ADAPTER_NOT_FOUND',
        name
      );
    }
    return adapter;
  }

  /**
   * 登録済みアダプタ名一覧を取得
   * @returns アダプタ名の配列
   */
  getRegisteredNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 利用可能なアダプタ一覧を取得
   *
   * 各アダプタのisAvailable()を呼び出し、利用可能なものだけを返す。
   * キャッシュが有効な場合はキャッシュ結果を使用する。
   *
   * @returns 利用可能なアダプタの配列
   * @see Requirement 5.1: THE CodingAgentRegistry SHALL detect installed coding agents
   * @see Requirement 5.2: THE CodingAgentRegistry SHALL provide getAvailableAgents()
   */
  async getAvailableAgents(): Promise<CodingAgentAdapter[]> {
    const results: CodingAgentAdapter[] = [];

    for (const adapter of this.adapters.values()) {
      const available = await this.checkAvailability(adapter);
      if (available) {
        results.push(adapter);
      }
    }

    return results;
  }

  /**
   * 優先度に基づいてアダプタを選択
   *
   * preferredが指定されていればそれを優先。利用不可の場合は
   * 優先度順にフォールバックする。
   *
   * @param preferred - 優先アダプタ名（オプション）
   * @returns 選択されたアダプタ
   * @throws {CodingAgentError} 利用可能なアダプタがない場合
   * @see Requirement 5.4: THE CodingAgentRegistry SHALL support priority-based selection
   */
  async selectAdapter(preferred?: string): Promise<CodingAgentAdapter> {
    // 優先アダプタが指定されている場合、まずそれを試す
    if (preferred) {
      const adapter = this.adapters.get(preferred);
      if (adapter) {
        const available = await this.checkAvailability(adapter);
        if (available) {
          return adapter;
        }
      }
    }

    // 優先度順にフォールバック
    for (const name of this.priority) {
      const adapter = this.adapters.get(name);
      if (adapter) {
        const available = await this.checkAvailability(adapter);
        if (available) {
          return adapter;
        }
      }
    }

    // 登録済みだが優先度リストにないアダプタも試す
    for (const adapter of this.adapters.values()) {
      if (!this.priority.includes(adapter.name)) {
        const available = await this.checkAvailability(adapter);
        if (available) {
          return adapter;
        }
      }
    }

    throw new CodingAgentError(
      '利用可能なコーディングエージェントがありません。opencode, claude, kiro のいずれかをインストールしてください。',
      'NO_AVAILABLE_AGENT',
      'registry'
    );
  }

  /**
   * アダプタの可用性をチェック（キャッシュ付き）
   *
   * @param adapter - チェック対象のアダプタ
   * @returns 利用可能な場合true
   * @see Requirement 5.5: THE CodingAgentRegistry SHALL cache availability results
   */
  private async checkAvailability(adapter: CodingAgentAdapter): Promise<boolean> {
    const cached = this.availabilityCache.get(adapter.name);
    const now = Date.now();

    // キャッシュが有効な場合はキャッシュ結果を返す
    if (cached && (now - cached.cachedAt) < this.cacheTtlMs) {
      return cached.available;
    }

    // 実際にチェック
    const available = await adapter.isAvailable();

    // キャッシュに保存
    this.availabilityCache.set(adapter.name, {
      available,
      cachedAt: now,
    });

    return available;
  }

  /**
   * 可用性キャッシュをクリア
   */
  clearCache(): void {
    this.availabilityCache.clear();
  }

  /**
   * 全アダプタをクリア（テスト用）
   */
  clearAdapters(): void {
    this.adapters.clear();
    this.availabilityCache.clear();
  }

  /**
   * 優先度順を設定
   * @param priority - アダプタ名の優先度順配列
   */
  setPriority(priority: string[]): void {
    this.priority = [...priority];
  }
}

// =============================================================================
// シングルトンレジストリ
// =============================================================================

/** グローバルコーディングエージェントレジストリ */
export const globalCodingAgentRegistry = new CodingAgentRegistry();

/**
 * デフォルトレジストリから利用可能なエージェントを取得（便利関数）
 * @returns 利用可能なアダプタの配列
 */
export function getAvailableCodingAgents(): Promise<CodingAgentAdapter[]> {
  return globalCodingAgentRegistry.getAvailableAgents();
}

/**
 * デフォルトレジストリからアダプタを選択（便利関数）
 * @param preferred - 優先アダプタ名（オプション）
 * @returns 選択されたアダプタ
 */
export function selectCodingAgent(preferred?: string): Promise<CodingAgentAdapter> {
  return globalCodingAgentRegistry.selectAdapter(preferred);
}

// Re-export
export type { CodingAgentAdapter } from './base.js';
export {
  CodingAgentError,
  CodingAgentTimeoutError,
  CodingAgentNotFoundError,
} from './base.js';
export { OpenCodeAdapter, createOpenCodeAdapter } from './opencode.js';
export { ClaudeCodeAdapter, createClaudeCodeAdapter } from './claude-code.js';
export { KiroCliAdapter, createKiroCliAdapter } from './kiro-cli.js';
