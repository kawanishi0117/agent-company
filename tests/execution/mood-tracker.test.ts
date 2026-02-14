/**
 * MoodTracker ユニットテスト
 * @module tests/execution/mood-tracker
 * @see Requirements: 13.1, 13.2, 13.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MoodTracker } from '../../tools/cli/lib/execution/mood-tracker.js';

describe('MoodTracker', () => {
  let tracker: MoodTracker;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-mood-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    tracker = new MoodTracker(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('calculateMood()', () => {
    it('全指標が良好な場合、高スコアを返す', () => {
      const score = tracker.calculateMood({
        recentSuccessRate: 1.0,
        workloadRatio: 0.3,
        escalationFrequency: 0.0,
        consecutiveFailureRatio: 0.0,
      });
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('全指標が悪い場合、低スコアを返す', () => {
      const score = tracker.calculateMood({
        recentSuccessRate: 0.1,
        workloadRatio: 1.0,
        escalationFrequency: 1.0,
        consecutiveFailureRatio: 1.0,
      });
      expect(score).toBeLessThanOrEqual(20);
    });

    it('スコアは0-100の範囲に収まる', () => {
      const score1 = tracker.calculateMood({
        recentSuccessRate: 0, workloadRatio: 1, escalationFrequency: 1, consecutiveFailureRatio: 1,
      });
      const score2 = tracker.calculateMood({
        recentSuccessRate: 1, workloadRatio: 0, escalationFrequency: 0, consecutiveFailureRatio: 0,
      });
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score2).toBeLessThanOrEqual(100);
    });
  });

  describe('updateAfterTask()', () => {
    it('タスク後にムードを更新・永続化できる', async () => {
      await tracker.updateAfterTask('agent-1', {
        recentSuccessRate: 0.8,
        workloadRatio: 0.5,
        escalationFrequency: 0.1,
        consecutiveFailureRatio: 0.0,
      }, 'タスク成功');

      const history = await tracker.getHistory('agent-1');
      expect(history.entries.length).toBe(1);
      expect(history.currentScore).toBeGreaterThan(0);
      expect(history.entries[0].reason).toBe('タスク成功');
    });
  });

  describe('checkAlerts()', () => {
    it('低スコアのエージェントにアラートを生成する', async () => {
      await tracker.updateAfterTask('low-agent', {
        recentSuccessRate: 0.1,
        workloadRatio: 0.9,
        escalationFrequency: 0.8,
        consecutiveFailureRatio: 0.9,
      });

      const alerts = await tracker.checkAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].agentId).toBe('low-agent');
    });

    it('高スコアのエージェントにはアラートなし', async () => {
      await tracker.updateAfterTask('good-agent', {
        recentSuccessRate: 0.9,
        workloadRatio: 0.3,
        escalationFrequency: 0.0,
        consecutiveFailureRatio: 0.0,
      });

      const alerts = await tracker.checkAlerts();
      expect(alerts.length).toBe(0);
    });
  });
});
