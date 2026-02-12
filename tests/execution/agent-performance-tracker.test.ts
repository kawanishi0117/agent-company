/**
 * エージェントパフォーマンストラッカーのユニットテスト
 *
 * @module tests/execution/agent-performance-tracker
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AgentPerformanceTracker,
  PerformanceRecord,
  TaskCategory,
} from '../../tools/cli/lib/execution/agent-performance-tracker.js';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/** テスト用一時ディレクトリ */
const TEST_DIR = 'runtime/state/performance-test-' + Date.now();

/** テスト用レコードを生成する */
function createRecord(overrides: Partial<PerformanceRecord> = {}): PerformanceRecord {
  return {
    agentId: 'worker-001',
    taskId: 'task-001',
    taskCategory: 'coding',
    success: true,
    qualityScore: 80,
    durationMs: 5000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// テスト本体
// =============================================================================

describe('AgentPerformanceTracker', () => {
  let tracker: AgentPerformanceTracker;

  beforeEach(() => {
    tracker = new AgentPerformanceTracker(TEST_DIR);
  });

  afterEach(async () => {
    // テスト用ディレクトリを削除
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 無視
    }
  });

  // ===========================================================================
  // recordPerformance
  // ===========================================================================

  describe('recordPerformance', () => {
    it('レコードを保存できる', async () => {
      const record = createRecord();
      await tracker.recordPerformance(record);

      const records = await tracker.getRecords('worker-001');
      expect(records).toHaveLength(1);
      expect(records[0].agentId).toBe('worker-001');
    });

    it('複数レコードを蓄積できる', async () => {
      await tracker.recordPerformance(createRecord({ taskId: 'task-001' }));
      await tracker.recordPerformance(createRecord({ taskId: 'task-002' }));
      await tracker.recordPerformance(createRecord({ taskId: 'task-003' }));

      const records = await tracker.getRecords('worker-001');
      expect(records).toHaveLength(3);
    });

    it('異なるエージェントのレコードを分離して保存する', async () => {
      await tracker.recordPerformance(createRecord({ agentId: 'agent-a' }));
      await tracker.recordPerformance(createRecord({ agentId: 'agent-b' }));

      const recordsA = await tracker.getRecords('agent-a');
      const recordsB = await tracker.getRecords('agent-b');
      expect(recordsA).toHaveLength(1);
      expect(recordsB).toHaveLength(1);
    });
  });

  // ===========================================================================
  // getRecords
  // ===========================================================================

  describe('getRecords', () => {
    it('存在しないエージェントは空配列を返す', async () => {
      const records = await tracker.getRecords('nonexistent');
      expect(records).toEqual([]);
    });
  });

  // ===========================================================================
  // getProfile
  // ===========================================================================

  describe('getProfile', () => {
    it('レコードがない場合はnullを返す', async () => {
      const profile = await tracker.getProfile('nonexistent');
      expect(profile).toBeNull();
    });

    it('基本的なプロファイルを生成する', async () => {
      await tracker.recordPerformance(createRecord({ success: true, qualityScore: 90 }));
      await tracker.recordPerformance(createRecord({ success: true, qualityScore: 80 }));
      await tracker.recordPerformance(createRecord({ success: false, qualityScore: 40 }));

      const profile = await tracker.getProfile('worker-001');
      expect(profile).not.toBeNull();
      expect(profile!.totalTasks).toBe(3);
      expect(profile!.successRate).toBeCloseTo(2 / 3, 2);
      expect(profile!.averageQuality).toBeCloseTo(70, 0);
    });

    it('得意カテゴリを検出する', async () => {
      // coding: 4/4 成功 → 得意
      for (let i = 0; i < 4; i++) {
        await tracker.recordPerformance(
          createRecord({ taskCategory: 'coding', success: true, qualityScore: 90 })
        );
      }

      const profile = await tracker.getProfile('worker-001');
      expect(profile!.strengths).toContain('coding');
    });

    it('苦手カテゴリを検出する', async () => {
      // review: 1/4 成功 → 苦手
      for (let i = 0; i < 4; i++) {
        await tracker.recordPerformance(
          createRecord({
            taskCategory: 'review',
            success: i === 0,
            qualityScore: i === 0 ? 80 : 30,
          })
        );
      }

      const profile = await tracker.getProfile('worker-001');
      expect(profile!.weaknesses).toContain('review');
    });

    it('レコード数が少ないカテゴリは得意/苦手に含めない', async () => {
      // 2件だけ → MIN_RECORDS_FOR_CATEGORY(3) 未満
      await tracker.recordPerformance(createRecord({ taskCategory: 'test', success: true }));
      await tracker.recordPerformance(createRecord({ taskCategory: 'test', success: false }));

      const profile = await tracker.getProfile('worker-001');
      expect(profile!.strengths).not.toContain('test');
      expect(profile!.weaknesses).not.toContain('test');
    });

    it('トレンドがstableになる（レコード不足時）', async () => {
      for (let i = 0; i < 5; i++) {
        await tracker.recordPerformance(createRecord({ qualityScore: 80 }));
      }

      const profile = await tracker.getProfile('worker-001');
      expect(profile!.recentTrend).toBe('stable');
    });

    it('トレンドがimprovingになる', async () => {
      // 前半10件: 低スコア、後半10件: 高スコア
      for (let i = 0; i < 10; i++) {
        await tracker.recordPerformance(createRecord({ qualityScore: 50 }));
      }
      for (let i = 0; i < 10; i++) {
        await tracker.recordPerformance(createRecord({ qualityScore: 90 }));
      }

      const profile = await tracker.getProfile('worker-001');
      expect(profile!.recentTrend).toBe('improving');
    });

    it('トレンドがdecliningになる', async () => {
      // 前半10件: 高スコア、後半10件: 低スコア
      for (let i = 0; i < 10; i++) {
        await tracker.recordPerformance(createRecord({ qualityScore: 90 }));
      }
      for (let i = 0; i < 10; i++) {
        await tracker.recordPerformance(createRecord({ qualityScore: 40 }));
      }

      const profile = await tracker.getProfile('worker-001');
      expect(profile!.recentTrend).toBe('declining');
    });
  });

  // ===========================================================================
  // getAllProfiles
  // ===========================================================================

  describe('getAllProfiles', () => {
    it('空の場合は空配列を返す', async () => {
      const profiles = await tracker.getAllProfiles();
      expect(profiles).toEqual([]);
    });

    it('全エージェントのプロファイルを返す', async () => {
      await tracker.recordPerformance(createRecord({ agentId: 'agent-a' }));
      await tracker.recordPerformance(createRecord({ agentId: 'agent-b' }));
      await tracker.recordPerformance(createRecord({ agentId: 'agent-c' }));

      const profiles = await tracker.getAllProfiles();
      expect(profiles).toHaveLength(3);

      const ids = profiles.map((p) => p.agentId);
      expect(ids).toContain('agent-a');
      expect(ids).toContain('agent-b');
      expect(ids).toContain('agent-c');
    });
  });
});
