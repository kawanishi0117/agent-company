/**
 * スキルギャップ検出器のユニットテスト
 *
 * @module tests/execution/skill-gap-detector
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  SkillGapDetector,
  AgentRegistryEntry,
} from '../../tools/cli/lib/execution/skill-gap-detector.js';
import {
  AgentPerformanceTracker,
  PerformanceRecord,
} from '../../tools/cli/lib/execution/agent-performance-tracker.js';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

const TEST_PERF_DIR = 'runtime/state/perf-test-sgd-' + Date.now();
const TEST_REGISTRY_DIR = 'runtime/state/registry-test-sgd-' + Date.now();
const TEST_PROPOSALS_DIR = 'runtime/state/proposals-test-sgd-' + Date.now();

/** テスト用レコードを生成する */
function createRecord(
  agentId: string,
  category: PerformanceRecord['taskCategory'],
  success: boolean,
  qualityScore: number
): PerformanceRecord {
  return {
    agentId,
    taskId: `task-${Date.now()}-${Math.random()}`,
    taskCategory: category,
    success,
    qualityScore,
    durationMs: 5000,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// テスト本体
// =============================================================================

describe('SkillGapDetector', () => {
  let tracker: AgentPerformanceTracker;
  let detector: SkillGapDetector;

  beforeEach(() => {
    tracker = new AgentPerformanceTracker(TEST_PERF_DIR);
    detector = new SkillGapDetector(tracker, TEST_REGISTRY_DIR, TEST_PROPOSALS_DIR);
  });

  afterEach(async () => {
    for (const dir of [TEST_PERF_DIR, TEST_REGISTRY_DIR, TEST_PROPOSALS_DIR]) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // 無視
      }
    }
  });

  // ===========================================================================
  // detectGaps
  // ===========================================================================

  describe('detectGaps', () => {
    it('プロファイルもレジストリもない場合、全カテゴリがギャップになる', () => {
      const gaps = detector.detectGaps([], []);
      // カバレッジ0 → 全カテゴリがギャップ
      expect(gaps.length).toBe(4);
      expect(gaps.map((g) => g.requiredSkill)).toContain('coding');
      expect(gaps.map((g) => g.requiredSkill)).toContain('review');
      expect(gaps.map((g) => g.requiredSkill)).toContain('test');
      expect(gaps.map((g) => g.requiredSkill)).toContain('documentation');
    });

    it('得意カテゴリがあるエージェントがいればギャップが減る', () => {
      const profiles = [
        {
          agentId: 'agent-a',
          totalTasks: 10,
          successRate: 0.9,
          averageQuality: 85,
          strengths: ['coding' as const],
          weaknesses: [],
          recentTrend: 'stable' as const,
          lastUpdated: new Date().toISOString(),
        },
      ];

      const gaps = detector.detectGaps(profiles, []);
      // coding は1/1 = 100% カバレッジ → ギャップなし
      const codingGap = gaps.find((g) => g.requiredSkill === 'coding');
      expect(codingGap).toBeUndefined();
    });

    it('レジストリエージェントの能力もカバレッジに反映される', () => {
      const registryAgents: AgentRegistryEntry[] = [
        {
          id: 'reviewer-001',
          title: 'Code Reviewer',
          capabilities: ['コードレビュー', '品質基準適用'],
        },
      ];

      const gaps = detector.detectGaps([], registryAgents);
      // review は 1/1 = 100% → ギャップなし
      const reviewGap = gaps.find((g) => g.requiredSkill === 'review');
      expect(reviewGap).toBeUndefined();
    });

    it('深刻度が正しく設定される', () => {
      const gaps = detector.detectGaps([], []);
      // カバレッジ0 → critical
      for (const gap of gaps) {
        expect(gap.severity).toBe('critical');
      }
    });

    it('suggestedRoleが正しくマッピングされる', () => {
      const gaps = detector.detectGaps([], []);
      const codingGap = gaps.find((g) => g.requiredSkill === 'coding');
      expect(codingGap?.suggestedRole).toBe('developer');

      const testGap = gaps.find((g) => g.requiredSkill === 'test');
      expect(testGap?.suggestedRole).toBe('test-engineer');
    });
  });

  // ===========================================================================
  // analyze
  // ===========================================================================

  describe('analyze', () => {
    it('空の状態で分析を実行できる', async () => {
      const result = await detector.analyze();
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.analyzedAt).toBeDefined();
      expect(result.agentCount).toBe(0);
    });

    it('パフォーマンスデータがある場合に分析できる', async () => {
      // coding が得意なエージェントを登録
      for (let i = 0; i < 5; i++) {
        await tracker.recordPerformance(
          createRecord('agent-coder', 'coding', true, 90)
        );
      }

      const result = await detector.analyze();
      expect(result.agentCount).toBeGreaterThanOrEqual(1);
    });

    it('採用提案がカバレッジ不足時に生成される', async () => {
      // エージェントなし → 全カテゴリがギャップ → 提案生成
      const result = await detector.analyze();
      expect(result.proposals.length).toBeGreaterThan(0);
    });

    it('提案にsuggestedCapabilitiesが含まれる', async () => {
      const result = await detector.analyze();
      for (const proposal of result.proposals) {
        expect(proposal.suggestedCapabilities.length).toBeGreaterThan(0);
      }
    });
  });
});
