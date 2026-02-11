/**
 * CodingAgentRegistry プロパティテスト
 *
 * Property 2: Availability Detection Accuracy
 * Property 6: Registry Fallback Selection
 *
 * @module tests/coding-agents/registry.property
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { CodingAgentRegistry } from '../../tools/coding-agents/index.js';
import type { CodingAgentAdapter } from '../../tools/coding-agents/base.js';
import { CodingAgentError } from '../../tools/coding-agents/base.js';
import type { CodingTaskResult } from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// ヘルパー
// =============================================================================

/** テスト用モックアダプタを生成 */
function createMockAdapter(name: string, available: boolean): CodingAgentAdapter {
  return {
    name,
    displayName: `Mock ${name}`,
    execute: vi.fn().mockResolvedValue({
      success: true, output: '', stderr: '',
      exitCode: 0, durationMs: 0, filesChanged: [],
    } satisfies CodingTaskResult),
    isAvailable: vi.fn().mockResolvedValue(available),
    getVersion: vi.fn().mockResolvedValue(null),
  };
}

// =============================================================================
// Property 2: Availability Detection Accuracy
// =============================================================================

describe('Property 2: Availability Detection Accuracy', () => {
  it('isAvailable=true のアダプタのみが getAvailableAgents に含まれること', () => {
    /**
     * 任意の available/unavailable アダプタ組み合わせに対して、
     * getAvailableAgents は available=true のもののみ返す。
     */
    const adapterConfigArb = fc.array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/\s/g, '-')),
        available: fc.boolean(),
      }),
      { minLength: 1, maxLength: 5 }
    );

    fc.assert(
      fc.asyncProperty(adapterConfigArb, async (configs) => {
        // 名前の重複を排除
        const uniqueConfigs = configs.filter(
          (c, i, arr) => arr.findIndex((x) => x.name === c.name) === i
        );
        if (uniqueConfigs.length === 0) return;

        const registry = new CodingAgentRegistry(0); // キャッシュ無効
        registry.clearAdapters();

        for (const config of uniqueConfigs) {
          registry.registerAdapter(createMockAdapter(config.name, config.available));
        }

        const available = await registry.getAvailableAgents();
        const availableNames = available.map((a) => a.name);

        // available=true のアダプタは全て含まれる
        for (const config of uniqueConfigs) {
          if (config.available) {
            expect(availableNames).toContain(config.name);
          } else {
            expect(availableNames).not.toContain(config.name);
          }
        }
      }),
      { numRuns: 10 }
    );
  });
});

// =============================================================================
// Property 6: Registry Fallback Selection
// =============================================================================

describe('Property 6: Registry Fallback Selection', () => {
  it('preferred が利用不可の場合、優先度順で最初の利用可能アダプタが選択されること', () => {
    /**
     * 優先度リスト内で preferred が unavailable の場合、
     * 次に available なアダプタが選択される。
     */
    const priorityArb = fc.array(
      fc.record({
        name: fc.constantFrom('agent-a', 'agent-b', 'agent-c', 'agent-d'),
        available: fc.boolean(),
      }),
      { minLength: 2, maxLength: 4 }
    ).map((arr) => arr.filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i));

    fc.assert(
      fc.asyncProperty(priorityArb, async (configs) => {
        if (configs.length < 2) return;

        const registry = new CodingAgentRegistry(0);
        registry.clearAdapters();

        const priorityOrder = configs.map((c) => c.name);
        registry.setPriority(priorityOrder);

        for (const config of configs) {
          registry.registerAdapter(createMockAdapter(config.name, config.available));
        }

        const hasAvailable = configs.some((c) => c.available);

        if (!hasAvailable) {
          // 全て利用不可 → エラー
          await expect(registry.selectAdapter()).rejects.toThrow(CodingAgentError);
        } else {
          const selected = await registry.selectAdapter();
          // 選択されたアダプタは利用可能
          const selectedConfig = configs.find((c) => c.name === selected.name);
          expect(selectedConfig?.available).toBe(true);

          // 選択されたアダプタより優先度が高い利用可能アダプタは存在しない
          const selectedIndex = priorityOrder.indexOf(selected.name);
          for (let i = 0; i < selectedIndex; i++) {
            const higherConfig = configs.find((c) => c.name === priorityOrder[i]);
            if (higherConfig) {
              expect(higherConfig.available).toBe(false);
            }
          }
        }
      }),
      { numRuns: 10 }
    );
  });
});
