/**
 * エスカレーション分析器のユニットテスト
 *
 * @module tests/execution/escalation-analyzer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  EscalationAnalyzer,
  EscalationRecord,
  EscalationCategory,
} from '../../tools/cli/lib/execution/escalation-analyzer.js';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

const TEST_DIR = 'runtime/state/escalation-test-' + Date.now();

/** テスト用エスカレーションレコードを生成する */
function createEscalation(
  overrides: Partial<EscalationRecord> = {}
): EscalationRecord {
  return {
    id: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    agentId: 'worker-001',
    taskId: 'task-001',
    category: 'quality_gate_failure',
    errorMessage: 'lint failed',
    escalatedTo: 'quality-authority',
    timestamp: new Date().toISOString(),
    resolved: false,
    ...overrides,
  };
}

// =============================================================================
// テスト本体
// =============================================================================

describe('EscalationAnalyzer', () => {
  let analyzer: EscalationAnalyzer;

  beforeEach(() => {
    analyzer = new EscalationAnalyzer(TEST_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 無視
    }
  });

  // ===========================================================================
  // recordEscalation
  // ===========================================================================

  describe('recordEscalation', () => {
    it('エスカレーションを記録できる', async () => {
      await analyzer.recordEscalation(createEscalation());
      const records = await analyzer.getAllRecords();
      expect(records).toHaveLength(1);
    });

    it('複数のエスカレーションを蓄積できる', async () => {
      await analyzer.recordEscalation(createEscalation({ id: 'esc-1' }));
      await analyzer.recordEscalation(createEscalation({ id: 'esc-2' }));
      await analyzer.recordEscalation(createEscalation({ id: 'esc-3' }));

      const records = await analyzer.getAllRecords();
      expect(records).toHaveLength(3);
    });
  });

  // ===========================================================================
  // resolveEscalation
  // ===========================================================================

  describe('resolveEscalation', () => {
    it('エスカレーションを解決済みにできる', async () => {
      await analyzer.recordEscalation(createEscalation({ id: 'esc-resolve' }));
      const result = await analyzer.resolveEscalation(
        'esc-resolve',
        'lint設定を修正'
      );
      expect(result).toBe(true);

      const records = await analyzer.getAllRecords();
      const resolved = records.find((r) => r.id === 'esc-resolve');
      expect(resolved?.resolved).toBe(true);
      expect(resolved?.resolution).toBe('lint設定を修正');
    });

    it('存在しないIDの場合はfalseを返す', async () => {
      const result = await analyzer.resolveEscalation(
        'nonexistent',
        'fix'
      );
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // getAgentEscalations
  // ===========================================================================

  describe('getAgentEscalations', () => {
    it('特定エージェントのエスカレーションのみ返す', async () => {
      await analyzer.recordEscalation(
        createEscalation({ agentId: 'agent-a' })
      );
      await analyzer.recordEscalation(
        createEscalation({ agentId: 'agent-b' })
      );
      await analyzer.recordEscalation(
        createEscalation({ agentId: 'agent-a' })
      );

      const records = await analyzer.getAgentEscalations('agent-a');
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.agentId === 'agent-a')).toBe(true);
    });

    it('存在しないエージェントは空配列を返す', async () => {
      const records = await analyzer.getAgentEscalations('nonexistent');
      expect(records).toEqual([]);
    });
  });

  // ===========================================================================
  // analyze
  // ===========================================================================

  describe('analyze', () => {
    it('空の状態で分析できる', async () => {
      const result = await analyzer.analyze();
      expect(result.totalEscalations).toBe(0);
      expect(result.unresolvedCount).toBe(0);
      expect(result.patterns).toEqual([]);
      expect(result.agentSummary).toEqual([]);
    });

    it('パターンを検出する（同一エージェント×同一カテゴリが3回以上）', async () => {
      // worker-001 の quality_gate_failure を4回記録
      for (let i = 0; i < 4; i++) {
        await analyzer.recordEscalation(
          createEscalation({
            id: `esc-pattern-${i}`,
            agentId: 'worker-001',
            category: 'quality_gate_failure',
          })
        );
      }

      const result = await analyzer.analyze();
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].agentId).toBe('worker-001');
      expect(result.patterns[0].category).toBe('quality_gate_failure');
      expect(result.patterns[0].occurrences).toBe(4);
    });

    it('パターンに根本原因推定が含まれる', async () => {
      for (let i = 0; i < 3; i++) {
        await analyzer.recordEscalation(
          createEscalation({
            id: `esc-root-${i}`,
            category: 'timeout',
          })
        );
      }

      const result = await analyzer.analyze();
      expect(result.patterns[0].rootCauseSuggestion).toContain(
        '処理能力'
      );
    });

    it('パターンに推奨アクションが含まれる', async () => {
      for (let i = 0; i < 3; i++) {
        await analyzer.recordEscalation(
          createEscalation({
            id: `esc-action-${i}`,
            category: 'review_rejection',
          })
        );
      }

      const result = await analyzer.analyze();
      expect(result.patterns[0].suggestedActions.length).toBeGreaterThan(0);
    });

    it('3回未満のパターンは検出しない', async () => {
      await analyzer.recordEscalation(
        createEscalation({ id: 'esc-few-1', category: 'runtime_error' })
      );
      await analyzer.recordEscalation(
        createEscalation({ id: 'esc-few-2', category: 'runtime_error' })
      );

      const result = await analyzer.analyze();
      const runtimePattern = result.patterns.find(
        (p) => p.category === 'runtime_error'
      );
      expect(runtimePattern).toBeUndefined();
    });

    it('エージェント別サマリーを生成する', async () => {
      await analyzer.recordEscalation(
        createEscalation({ agentId: 'agent-x', category: 'timeout' })
      );
      await analyzer.recordEscalation(
        createEscalation({
          agentId: 'agent-x',
          category: 'quality_gate_failure',
        })
      );
      await analyzer.recordEscalation(
        createEscalation({
          agentId: 'agent-x',
          category: 'timeout',
          resolved: true,
        })
      );

      const result = await analyzer.analyze();
      const summary = result.agentSummary.find(
        (s) => s.agentId === 'agent-x'
      );
      expect(summary).toBeDefined();
      expect(summary!.totalEscalations).toBe(3);
      expect(summary!.byCategory.timeout).toBe(2);
      expect(summary!.byCategory.quality_gate_failure).toBe(1);
      expect(summary!.resolutionRate).toBeCloseTo(1 / 3, 2);
    });

    it('未解決数を正しくカウントする', async () => {
      await analyzer.recordEscalation(
        createEscalation({ id: 'esc-u1', resolved: false })
      );
      await analyzer.recordEscalation(
        createEscalation({ id: 'esc-u2', resolved: true })
      );
      await analyzer.recordEscalation(
        createEscalation({ id: 'esc-u3', resolved: false })
      );

      const result = await analyzer.analyze();
      expect(result.unresolvedCount).toBe(2);
    });
  });
});
