/**
 * CodingAgentRegistry ユニットテスト
 *
 * レジストリのアダプタ登録・取得・選択・キャッシュ機能をテスト。
 *
 * @module tests/coding-agents/registry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodingAgentRegistry } from '../../tools/coding-agents/index.js';
import type { CodingAgentAdapter } from '../../tools/coding-agents/base.js';
import { CodingAgentError } from '../../tools/coding-agents/base.js';
import type { CodingTaskOptions, CodingTaskResult } from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// モックアダプタ生成ヘルパー
// =============================================================================

/**
 * テスト用モックアダプタを生成
 */
function createMockAdapter(
  name: string,
  displayName: string,
  available: boolean
): CodingAgentAdapter {
  return {
    name,
    displayName,
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: 'mock output',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
      filesChanged: [],
    } satisfies CodingTaskResult),
    isAvailable: vi.fn().mockResolvedValue(available),
    getVersion: vi.fn().mockResolvedValue(`${name} v1.0.0`),
  };
}

// =============================================================================
// テスト
// =============================================================================

describe('CodingAgentRegistry', () => {
  let registry: CodingAgentRegistry;

  beforeEach(() => {
    // デフォルトアダプタなしでテスト（キャッシュTTL短め）
    registry = new CodingAgentRegistry(100);
    registry.clearAdapters();
  });

  // ---------------------------------------------------------------------------
  // registerAdapter / getAdapter
  // ---------------------------------------------------------------------------

  describe('registerAdapter / getAdapter', () => {
    it('アダプタを登録して取得できること', () => {
      const adapter = createMockAdapter('test-agent', 'Test Agent', true);
      registry.registerAdapter(adapter);

      const result = registry.getAdapter('test-agent');
      expect(result).toBe(adapter);
    });

    it('未登録のアダプタ取得時に CodingAgentError をスローすること', () => {
      expect(() => registry.getAdapter('nonexistent')).toThrow(CodingAgentError);
    });

    it('同名アダプタの再登録で上書きされること', () => {
      const adapter1 = createMockAdapter('agent', 'Agent 1', true);
      const adapter2 = createMockAdapter('agent', 'Agent 2', true);

      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);

      const result = registry.getAdapter('agent');
      expect(result.displayName).toBe('Agent 2');
    });
  });

  // ---------------------------------------------------------------------------
  // getRegisteredNames
  // ---------------------------------------------------------------------------

  describe('getRegisteredNames', () => {
    it('登録済みアダプタ名一覧を返すこと', () => {
      registry.registerAdapter(createMockAdapter('a', 'A', true));
      registry.registerAdapter(createMockAdapter('b', 'B', false));

      const names = registry.getRegisteredNames();
      expect(names).toContain('a');
      expect(names).toContain('b');
      expect(names).toHaveLength(2);
    });

    it('空のレジストリでは空配列を返すこと', () => {
      expect(registry.getRegisteredNames()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getAvailableAgents
  // ---------------------------------------------------------------------------

  describe('getAvailableAgents', () => {
    it('利用可能なアダプタのみ返すこと', async () => {
      registry.registerAdapter(createMockAdapter('available', 'Available', true));
      registry.registerAdapter(createMockAdapter('unavailable', 'Unavailable', false));

      const agents = await registry.getAvailableAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('available');
    });

    it('全て利用不可の場合は空配列を返すこと', async () => {
      registry.registerAdapter(createMockAdapter('a', 'A', false));
      registry.registerAdapter(createMockAdapter('b', 'B', false));

      const agents = await registry.getAvailableAgents();
      expect(agents).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // selectAdapter
  // ---------------------------------------------------------------------------

  describe('selectAdapter', () => {
    it('preferred が利用可能な場合はそれを返すこと', async () => {
      registry.registerAdapter(createMockAdapter('first', 'First', true));
      registry.registerAdapter(createMockAdapter('second', 'Second', true));
      registry.setPriority(['first', 'second']);

      const selected = await registry.selectAdapter('second');
      expect(selected.name).toBe('second');
    });

    it('preferred が利用不可の場合は優先度順にフォールバックすること', async () => {
      registry.registerAdapter(createMockAdapter('preferred', 'Preferred', false));
      registry.registerAdapter(createMockAdapter('fallback', 'Fallback', true));
      registry.setPriority(['preferred', 'fallback']);

      const selected = await registry.selectAdapter('preferred');
      expect(selected.name).toBe('fallback');
    });

    it('preferred 未指定時は優先度順で最初の利用可能アダプタを返すこと', async () => {
      registry.registerAdapter(createMockAdapter('low', 'Low', true));
      registry.registerAdapter(createMockAdapter('high', 'High', true));
      registry.setPriority(['high', 'low']);

      const selected = await registry.selectAdapter();
      expect(selected.name).toBe('high');
    });

    it('全て利用不可の場合は CodingAgentError をスローすること', async () => {
      registry.registerAdapter(createMockAdapter('a', 'A', false));
      registry.registerAdapter(createMockAdapter('b', 'B', false));
      registry.setPriority(['a', 'b']);

      await expect(registry.selectAdapter()).rejects.toThrow(CodingAgentError);
    });
  });

  // ---------------------------------------------------------------------------
  // キャッシュ
  // ---------------------------------------------------------------------------

  describe('可用性キャッシュ', () => {
    it('キャッシュ有効期間内は isAvailable を再呼び出ししないこと', async () => {
      const adapter = createMockAdapter('cached', 'Cached', true);
      registry.registerAdapter(adapter);

      // 1回目: isAvailable が呼ばれる
      await registry.getAvailableAgents();
      expect(adapter.isAvailable).toHaveBeenCalledTimes(1);

      // 2回目: キャッシュから取得（isAvailable は呼ばれない）
      await registry.getAvailableAgents();
      expect(adapter.isAvailable).toHaveBeenCalledTimes(1);
    });

    it('clearCache 後は isAvailable が再呼び出しされること', async () => {
      const adapter = createMockAdapter('cached', 'Cached', true);
      registry.registerAdapter(adapter);

      await registry.getAvailableAgents();
      registry.clearCache();
      await registry.getAvailableAgents();

      expect(adapter.isAvailable).toHaveBeenCalledTimes(2);
    });

    it('キャッシュTTL経過後は isAvailable が再呼び出しされること', async () => {
      // TTL 50ms のレジストリ
      const shortTtlRegistry = new CodingAgentRegistry(50);
      shortTtlRegistry.clearAdapters();

      const adapter = createMockAdapter('ttl-test', 'TTL Test', true);
      shortTtlRegistry.registerAdapter(adapter);
      shortTtlRegistry.setPriority(['ttl-test']);

      await shortTtlRegistry.getAvailableAgents();
      expect(adapter.isAvailable).toHaveBeenCalledTimes(1);

      // TTL経過を待つ
      await new Promise((resolve) => setTimeout(resolve, 60));

      await shortTtlRegistry.getAvailableAgents();
      expect(adapter.isAvailable).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // setPriority
  // ---------------------------------------------------------------------------

  describe('setPriority', () => {
    it('優先度順を変更できること', async () => {
      registry.registerAdapter(createMockAdapter('a', 'A', true));
      registry.registerAdapter(createMockAdapter('b', 'B', true));

      registry.setPriority(['b', 'a']);
      const selected = await registry.selectAdapter();
      expect(selected.name).toBe('b');

      registry.clearCache();
      registry.setPriority(['a', 'b']);
      const selected2 = await registry.selectAdapter();
      expect(selected2.name).toBe('a');
    });
  });
});
