/**
 * レポートジェネレーターのユニットテスト
 *
 * @module tests/execution/report-generator
 * @see Requirements: 4.1, 4.2, 4.3, 4.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import type { PerformanceRecord, PerformanceProfile } from '../../tools/cli/lib/execution/agent-performance-tracker.js';
import { ReportGenerator } from '../../tools/cli/lib/execution/report-generator.js';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

const TEST_DIR = 'runtime/state/reports-test-' + Date.now();

function createMockRecord(
  agentId: string,
  overrides: Partial<PerformanceRecord> = {}
): PerformanceRecord {
  return {
    agentId,
    taskId: `task-${Date.now()}-${Math.random()}`,
    taskCategory: 'coding',
    success: true,
    qualityScore: 80,
    durationMs: 5000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockProfile(
  agentId: string
): PerformanceProfile {
  return {
    agentId,
    totalTasks: 10,
    successRate: 0.8,
    averageQuality: 75,
    strengths: ['coding'],
    weaknesses: [],
    recentTrend: 'stable',
    lastUpdated: new Date().toISOString(),
  };
}

function createMockPerformanceTracker(
  profiles: PerformanceProfile[] = [],
  recordsMap: Map<string, PerformanceRecord[]> = new Map()
): Record<string, unknown> {
  return {
    getAllProfiles: vi.fn().mockResolvedValue(profiles),
    getRecords: vi.fn().mockImplementation(
      (agentId: string) => Promise.resolve(recordsMap.get(agentId) ?? [])
    ),
    getProfile: vi.fn().mockResolvedValue(null),
    recordPerformance: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// テスト本体
// =============================================================================

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  let mockTracker: ReturnType<typeof createMockPerformanceTracker>;

  beforeEach(() => {
    mockTracker = createMockPerformanceTracker();
    generator = new ReportGenerator({
      performanceTracker: mockTracker as never,
      basePath: TEST_DIR,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 無視
    }
  });

  // ===========================================================================
  // generateDailyReport
  // ===========================================================================

  describe('generateDailyReport', () => {
    it('活動がない日は空の日報を生成する', async () => {
      const report = await generator.generateDailyReport('2026-02-14');

      expect(report.date).toBe('2026-02-14');
      expect(report.employees).toEqual([]);
      expect(report.summary.tasksCompleted).toBe(0);
    });

    it('社員の活動を正しく集計する', async () => {
      const today = '2026-02-14';
      const profiles = [createMockProfile('worker-001')];
      const recordsMap = new Map<string, PerformanceRecord[]>();
      recordsMap.set('worker-001', [
        createMockRecord('worker-001', {
          success: true,
          qualityScore: 90,
          taskCategory: 'coding',
          timestamp: `${today}T10:00:00.000Z`,
        }),
        createMockRecord('worker-001', {
          success: false,
          qualityScore: 40,
          taskCategory: 'review',
          timestamp: `${today}T14:00:00.000Z`,
        }),
      ]);

      mockTracker = createMockPerformanceTracker(profiles, recordsMap);
      generator = new ReportGenerator({
        performanceTracker: mockTracker as never,
        basePath: TEST_DIR,
      });

      const report = await generator.generateDailyReport(today);

      expect(report.employees).toHaveLength(1);
      expect(report.employees[0].agentId).toBe('worker-001');
      expect(report.employees[0].tasksCompleted).toBe(1);
      expect(report.employees[0].tasksFailed).toBe(1);
      expect(report.employees[0].categories).toEqual({ coding: 1, review: 1 });
      expect(report.summary.tasksCompleted).toBe(1);
    });

    it('品質低下の課題を検出する', async () => {
      const today = '2026-02-14';
      const profiles = [createMockProfile('worker-001')];
      const recordsMap = new Map<string, PerformanceRecord[]>();
      recordsMap.set('worker-001', [
        createMockRecord('worker-001', {
          success: false,
          qualityScore: 30,
          timestamp: `${today}T10:00:00.000Z`,
        }),
        createMockRecord('worker-001', {
          success: false,
          qualityScore: 20,
          timestamp: `${today}T14:00:00.000Z`,
        }),
      ]);

      mockTracker = createMockPerformanceTracker(profiles, recordsMap);
      generator = new ReportGenerator({
        performanceTracker: mockTracker as never,
        basePath: TEST_DIR,
      });

      const report = await generator.generateDailyReport(today);

      expect(report.summary.issues.length).toBeGreaterThan(0);
      expect(report.summary.issues.some((i) => i.includes('品質スコアが低い'))).toBe(true);
    });

    it('日報がファイルに永続化される', async () => {
      const today = '2026-02-14';
      await generator.generateDailyReport(today);

      const saved = await generator.getDailyReport(today);
      expect(saved).not.toBeNull();
      expect(saved!.date).toBe(today);
    });
  });

  // ===========================================================================
  // generateWeeklyReport
  // ===========================================================================

  describe('generateWeeklyReport', () => {
    it('活動がない週は空の週報を生成する', async () => {
      const report = await generator.generateWeeklyReport('2026-02-09');

      expect(report.weekStart).toBe('2026-02-09');
      expect(report.weekEnd).toBe('2026-02-15');
      expect(report.summary.totalTasks).toBe(0);
      expect(report.topPerformers).toEqual([]);
    });

    it('前週比較を含む週報を生成する', async () => {
      const profiles = [createMockProfile('worker-001')];
      const recordsMap = new Map<string, PerformanceRecord[]>();
      recordsMap.set('worker-001', [
        // 前週のレコード
        createMockRecord('worker-001', {
          success: true,
          qualityScore: 70,
          timestamp: '2026-02-03T10:00:00.000Z',
        }),
        // 今週のレコード
        createMockRecord('worker-001', {
          success: true,
          qualityScore: 90,
          timestamp: '2026-02-10T10:00:00.000Z',
        }),
        createMockRecord('worker-001', {
          success: true,
          qualityScore: 85,
          timestamp: '2026-02-11T10:00:00.000Z',
        }),
      ]);

      mockTracker = createMockPerformanceTracker(profiles, recordsMap);
      generator = new ReportGenerator({
        performanceTracker: mockTracker as never,
        basePath: TEST_DIR,
      });

      const report = await generator.generateWeeklyReport('2026-02-09');

      expect(report.summary.totalTasks).toBe(2);
      expect(report.comparison.length).toBeGreaterThan(0);
      // タスク数が前週(1)→今週(2)で増加
      const taskComparison = report.comparison.find((c) => c.metric === 'タスク総数');
      expect(taskComparison).toBeDefined();
      expect(taskComparison!.current).toBe(2);
      expect(taskComparison!.previous).toBe(1);
      expect(taskComparison!.trend).toBe('up');
    });

    it('トップパフォーマーを算出する', async () => {
      const profiles = [
        createMockProfile('worker-001'),
        createMockProfile('worker-002'),
      ];
      const recordsMap = new Map<string, PerformanceRecord[]>();
      recordsMap.set('worker-001', [
        createMockRecord('worker-001', {
          success: true,
          qualityScore: 95,
          timestamp: '2026-02-10T10:00:00.000Z',
        }),
      ]);
      recordsMap.set('worker-002', [
        createMockRecord('worker-002', {
          success: false,
          qualityScore: 40,
          timestamp: '2026-02-10T10:00:00.000Z',
        }),
      ]);

      mockTracker = createMockPerformanceTracker(profiles, recordsMap);
      generator = new ReportGenerator({
        performanceTracker: mockTracker as never,
        basePath: TEST_DIR,
      });

      const report = await generator.generateWeeklyReport('2026-02-09');

      expect(report.topPerformers).toHaveLength(2);
      expect(report.topPerformers[0].agentId).toBe('worker-001');
    });

    it('繰り返し課題を検出する', async () => {
      const profiles = [createMockProfile('worker-001')];
      const recordsMap = new Map<string, PerformanceRecord[]>();
      recordsMap.set('worker-001', [
        createMockRecord('worker-001', {
          success: false,
          errorPatterns: ['timeout'],
          timestamp: '2026-02-10T10:00:00.000Z',
        }),
        createMockRecord('worker-001', {
          success: false,
          errorPatterns: ['timeout', 'memory_leak'],
          timestamp: '2026-02-11T10:00:00.000Z',
        }),
      ]);

      mockTracker = createMockPerformanceTracker(profiles, recordsMap);
      generator = new ReportGenerator({
        performanceTracker: mockTracker as never,
        basePath: TEST_DIR,
      });

      const report = await generator.generateWeeklyReport('2026-02-09');

      expect(report.recurringIssues.length).toBeGreaterThan(0);
      expect(report.recurringIssues.some((i) => i.includes('timeout'))).toBe(true);
    });

    it('週報がファイルに永続化される', async () => {
      await generator.generateWeeklyReport('2026-02-09');

      const saved = await generator.getWeeklyReport('2026-02-09');
      expect(saved).not.toBeNull();
      expect(saved!.weekStart).toBe('2026-02-09');
    });
  });

  // ===========================================================================
  // listReports
  // ===========================================================================

  describe('listDailyReports / listWeeklyReports', () => {
    it('データがない場合は空配列を返す', async () => {
      const daily = await generator.listDailyReports();
      const weekly = await generator.listWeeklyReports();
      expect(daily).toEqual([]);
      expect(weekly).toEqual([]);
    });
  });
});
