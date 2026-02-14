/**
 * MVPSelector ユニットテスト
 * @module tests/execution/mvp-selector
 * @see Requirements: 16.1, 16.2, 16.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MVPSelector } from '../../tools/cli/lib/execution/mvp-selector.js';
import type { MVPScoreInput } from '../../tools/cli/lib/execution/mvp-selector.js';

describe('MVPSelector', () => {
  let selector: MVPSelector;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-mvp-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    selector = new MVPSelector(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // calculateScores()
  // ===========================================================================

  describe('calculateScores()', () => {
    it('空配列を渡すと空配列を返す', () => {
      const result = selector.calculateScores([]);
      expect(result).toEqual([]);
    });

    it('スコアを正しく計算しスコア降順でソートする', () => {
      const inputs: MVPScoreInput[] = [
        { agentId: 'low', tasksCompleted: 2, avgQuality: 40, collaborationCount: 1, knowledgeContributions: 0 },
        { agentId: 'high', tasksCompleted: 10, avgQuality: 90, collaborationCount: 8, knowledgeContributions: 5 },
        { agentId: 'mid', tasksCompleted: 5, avgQuality: 70, collaborationCount: 4, knowledgeContributions: 2 },
      ];

      const result = selector.calculateScores(inputs);

      expect(result.length).toBe(3);
      // highが最上位
      expect(result[0].agentId).toBe('high');
      // スコア降順
      expect(result[0].totalScore).toBeGreaterThanOrEqual(result[1].totalScore);
      expect(result[1].totalScore).toBeGreaterThanOrEqual(result[2].totalScore);
    });

    it('各スコア内訳が0-100の範囲内', () => {
      const inputs: MVPScoreInput[] = [
        { agentId: 'a', tasksCompleted: 5, avgQuality: 80, collaborationCount: 3, knowledgeContributions: 2 },
      ];

      const result = selector.calculateScores(inputs);
      const bd = result[0].breakdown;

      expect(bd.taskCompletion).toBeGreaterThanOrEqual(0);
      expect(bd.taskCompletion).toBeLessThanOrEqual(100);
      expect(bd.quality).toBeGreaterThanOrEqual(0);
      expect(bd.quality).toBeLessThanOrEqual(100);
      expect(bd.collaboration).toBeGreaterThanOrEqual(0);
      expect(bd.collaboration).toBeLessThanOrEqual(100);
      expect(bd.knowledgeContribution).toBeGreaterThanOrEqual(0);
      expect(bd.knowledgeContribution).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // selectCandidates()
  // ===========================================================================

  describe('selectCandidates()', () => {
    it('上位N名を返す', () => {
      const inputs: MVPScoreInput[] = [
        { agentId: 'a', tasksCompleted: 10, avgQuality: 90, collaborationCount: 5, knowledgeContributions: 3 },
        { agentId: 'b', tasksCompleted: 8, avgQuality: 85, collaborationCount: 4, knowledgeContributions: 2 },
        { agentId: 'c', tasksCompleted: 3, avgQuality: 60, collaborationCount: 1, knowledgeContributions: 0 },
        { agentId: 'd', tasksCompleted: 6, avgQuality: 70, collaborationCount: 3, knowledgeContributions: 1 },
      ];

      const top2 = selector.selectCandidates(inputs, 2);
      expect(top2.length).toBe(2);
      expect(top2[0].totalScore).toBeGreaterThanOrEqual(top2[1].totalScore);
    });

    it('デフォルトで上位3名を返す', () => {
      const inputs: MVPScoreInput[] = Array.from({ length: 5 }, (_, i) => ({
        agentId: `agent-${i}`,
        tasksCompleted: (i + 1) * 2,
        avgQuality: 50 + i * 10,
        collaborationCount: i + 1,
        knowledgeContributions: i,
      }));

      const result = selector.selectCandidates(inputs);
      expect(result.length).toBe(3);
    });
  });

  // ===========================================================================
  // award()
  // ===========================================================================

  describe('award()', () => {
    it('MVPを表彰し履歴に保存する', async () => {
      const award = await selector.award('2026-01', 'agent-star', 95, '素晴らしい貢献');

      expect(award.month).toBe('2026-01');
      expect(award.agentId).toBe('agent-star');
      expect(award.score).toBe(95);
      expect(award.reason).toBe('素晴らしい貢献');
      expect(award.awardedAt).toBeTruthy();

      const history = await selector.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].agentId).toBe('agent-star');
    });

    it('同月の表彰は上書きされる', async () => {
      await selector.award('2026-02', 'first-winner', 80);
      await selector.award('2026-02', 'second-winner', 90);

      const history = await selector.getHistory();
      const feb = history.find((a) => a.month === '2026-02');
      expect(feb?.agentId).toBe('second-winner');
    });

    it('理由省略時はデフォルト理由が設定される', async () => {
      const award = await selector.award('2026-03', 'agent-x', 75);
      expect(award.reason).toContain('2026-03');
    });
  });

  // ===========================================================================
  // getHistory()
  // ===========================================================================

  describe('getHistory()', () => {
    it('履歴がない場合は空配列を返す', async () => {
      const history = await selector.getHistory();
      expect(history).toEqual([]);
    });

    it('複数月の履歴を新しい順で返す', async () => {
      await selector.award('2026-01', 'a', 80);
      await selector.award('2026-03', 'c', 90);
      await selector.award('2026-02', 'b', 85);

      const history = await selector.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].month).toBe('2026-03');
      expect(history[1].month).toBe('2026-02');
      expect(history[2].month).toBe('2026-01');
    });
  });
});
