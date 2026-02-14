/**
 * TechDebtTracker ユニットテスト
 *
 * @module tests/execution/tech-debt-tracker
 * @see Requirements: 9.1, 9.2, 9.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TechDebtTracker } from '../../tools/cli/lib/execution/tech-debt-tracker.js';

describe('TechDebtTracker', () => {
  let tracker: TechDebtTracker;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-tech-debt-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    tracker = new TechDebtTracker(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('recordSnapshot()', () => {
    it('スナップショットを記録できる', async () => {
      await tracker.recordSnapshot({
        date: '2026-02-14',
        projectId: 'proj-1',
        metrics: {
          lintErrors: 5,
          lintWarnings: 10,
          testCoverage: 85,
          testPassRate: 98,
          totalTests: 100,
        },
      });

      const latest = await tracker.getLatest('proj-1');
      expect(latest).not.toBeNull();
      expect(latest?.metrics.lintErrors).toBe(5);
      expect(latest?.metrics.testCoverage).toBe(85);
    });

    it('同日・同ワークフローのスナップショットは上書きされる', async () => {
      const base = {
        date: '2026-02-14',
        projectId: 'proj-2',
        workflowId: 'wf-1',
      };

      await tracker.recordSnapshot({
        ...base,
        metrics: { lintErrors: 10, lintWarnings: 5, testCoverage: 80, testPassRate: 90, totalTests: 50 },
      });

      await tracker.recordSnapshot({
        ...base,
        metrics: { lintErrors: 3, lintWarnings: 2, testCoverage: 90, testPassRate: 95, totalTests: 60 },
      });

      const trend = await tracker.getTrend('proj-2', 30);
      expect(trend.length).toBe(1);
      expect(trend[0].metrics.lintErrors).toBe(3);
    });
  });

  describe('getTrend()', () => {
    it('指定期間のスナップショットを取得できる', async () => {
      const today = new Date();
      for (let i = 0; i < 5; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        await tracker.recordSnapshot({
          date: date.toISOString().split('T')[0],
          projectId: 'proj-3',
          metrics: {
            lintErrors: i,
            lintWarnings: i * 2,
            testCoverage: 90 - i,
            testPassRate: 100 - i,
            totalTests: 100,
          },
        });
      }

      const trend = await tracker.getTrend('proj-3', 3);
      expect(trend.length).toBeGreaterThanOrEqual(3);
    });

    it('データがない場合は空配列を返す', async () => {
      const trend = await tracker.getTrend('nonexistent', 30);
      expect(trend).toEqual([]);
    });
  });

  describe('checkAlerts()', () => {
    it('カバレッジ低下時にアラートを生成する', async () => {
      await tracker.recordSnapshot({
        date: '2026-02-13',
        projectId: 'proj-4',
        metrics: { lintErrors: 0, lintWarnings: 0, testCoverage: 90, testPassRate: 100, totalTests: 100 },
      });
      await tracker.recordSnapshot({
        date: '2026-02-14',
        projectId: 'proj-4',
        metrics: { lintErrors: 0, lintWarnings: 0, testCoverage: 78, testPassRate: 100, totalTests: 100 },
      });

      const alerts = await tracker.checkAlerts('proj-4');
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toBe('coverage_drop');
      expect(alerts[0].severity).toBe('critical');
    });

    it('lintエラー増加時にアラートを生成する', async () => {
      await tracker.recordSnapshot({
        date: '2026-02-13',
        projectId: 'proj-5',
        metrics: { lintErrors: 2, lintWarnings: 0, testCoverage: 90, testPassRate: 100, totalTests: 100 },
      });
      await tracker.recordSnapshot({
        date: '2026-02-14',
        projectId: 'proj-5',
        metrics: { lintErrors: 25, lintWarnings: 0, testCoverage: 90, testPassRate: 100, totalTests: 100 },
      });

      const alerts = await tracker.checkAlerts('proj-5');
      const lintAlert = alerts.find((a) => a.type === 'lint_increase');
      expect(lintAlert).toBeDefined();
      expect(lintAlert?.severity).toBe('critical');
    });

    it('テスト通過率低下時にアラートを生成する', async () => {
      await tracker.recordSnapshot({
        date: '2026-02-13',
        projectId: 'proj-6',
        metrics: { lintErrors: 0, lintWarnings: 0, testCoverage: 90, testPassRate: 98, totalTests: 100 },
      });
      await tracker.recordSnapshot({
        date: '2026-02-14',
        projectId: 'proj-6',
        metrics: { lintErrors: 0, lintWarnings: 0, testCoverage: 90, testPassRate: 85, totalTests: 100 },
      });

      const alerts = await tracker.checkAlerts('proj-6');
      const passAlert = alerts.find((a) => a.type === 'test_failure_increase');
      expect(passAlert).toBeDefined();
    });

    it('変化がない場合はアラートなし', async () => {
      await tracker.recordSnapshot({
        date: '2026-02-13',
        projectId: 'proj-7',
        metrics: { lintErrors: 5, lintWarnings: 3, testCoverage: 85, testPassRate: 95, totalTests: 100 },
      });
      await tracker.recordSnapshot({
        date: '2026-02-14',
        projectId: 'proj-7',
        metrics: { lintErrors: 5, lintWarnings: 3, testCoverage: 85, testPassRate: 95, totalTests: 100 },
      });

      const alerts = await tracker.checkAlerts('proj-7');
      expect(alerts).toEqual([]);
    });

    it('データが1件以下の場合はアラートなし', async () => {
      const alerts = await tracker.checkAlerts('proj-empty');
      expect(alerts).toEqual([]);
    });
  });

  describe('getLatest()', () => {
    it('最新のスナップショットを取得できる', async () => {
      await tracker.recordSnapshot({
        date: '2026-02-13',
        projectId: 'proj-8',
        metrics: { lintErrors: 10, lintWarnings: 5, testCoverage: 80, testPassRate: 90, totalTests: 50 },
      });
      await tracker.recordSnapshot({
        date: '2026-02-14',
        projectId: 'proj-8',
        metrics: { lintErrors: 3, lintWarnings: 2, testCoverage: 90, testPassRate: 98, totalTests: 60 },
      });

      const latest = await tracker.getLatest('proj-8');
      expect(latest?.date).toBe('2026-02-14');
      expect(latest?.metrics.lintErrors).toBe(3);
    });

    it('データがない場合はnullを返す', async () => {
      const latest = await tracker.getLatest('nonexistent');
      expect(latest).toBeNull();
    });
  });
});
