/**
 * CareerManager ユニットテスト
 * @module tests/execution/career-manager
 * @see Requirements: 15.1, 15.2, 15.3, 15.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CareerManager } from '../../tools/cli/lib/execution/career-manager.js';

describe('CareerManager', () => {
  let manager: CareerManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-career-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    manager = new CareerManager(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('getCurrentLevel()', () => {
    it('新規エージェントはデフォルトでmidレベル', async () => {
      const level = await manager.getCurrentLevel('new-agent');
      expect(level).toBe('mid');
    });
  });

  describe('checkPromotionEligibility()', () => {
    it('基準を満たすエージェントに昇進を提案する', async () => {
      const suggestion = await manager.checkPromotionEligibility('agent-1', {
        successRate: 0.85,
        avgQuality: 80,
        totalTasks: 50,
      });

      expect(suggestion).not.toBeNull();
      expect(suggestion?.suggestedLevel).toBe('senior');
    });

    it('基準を満たさない場合はnullを返す', async () => {
      const suggestion = await manager.checkPromotionEligibility('agent-2', {
        successRate: 0.6,
        avgQuality: 55,
        totalTasks: 5,
      });

      expect(suggestion).toBeNull();
    });

    it('低パフォーマンスのエージェントに降格を提案する', async () => {
      // まずseniorに昇進
      await manager.promote('agent-3', 'senior', 'テスト用昇進');

      const suggestion = await manager.checkPromotionEligibility('agent-3', {
        successRate: 0.3,
        avgQuality: 30,
        totalTasks: 10,
      });

      expect(suggestion).not.toBeNull();
      expect(suggestion?.suggestedLevel).toBe('mid');
    });
  });

  describe('promote()', () => {
    it('昇進を実行しレベルが更新される', async () => {
      await manager.promote('agent-4', 'senior', '優秀な成績');

      const level = await manager.getCurrentLevel('agent-4');
      expect(level).toBe('senior');

      const history = await manager.getHistory('agent-4');
      const promotionEvent = history.events.find((e) => e.type === 'promotion');
      expect(promotionEvent).toBeDefined();
      expect(promotionEvent?.toLevel).toBe('senior');
    });
  });

  describe('demote()', () => {
    it('降格を実行しレベルが更新される', async () => {
      await manager.promote('agent-5', 'senior');
      await manager.demote('agent-5', 'mid', 'パフォーマンス低下');

      const level = await manager.getCurrentLevel('agent-5');
      expect(level).toBe('mid');

      const history = await manager.getHistory('agent-5');
      const demotionEvent = history.events.find((e) => e.type === 'demotion');
      expect(demotionEvent).toBeDefined();
    });
  });

  describe('getHistory()', () => {
    it('キャリア履歴を取得できる', async () => {
      await manager.promote('agent-6', 'senior');
      await manager.promote('agent-6', 'lead');

      const history = await manager.getHistory('agent-6');
      expect(history.currentLevel).toBe('lead');
      // initial + 2 promotions
      expect(history.events.length).toBe(3);
    });
  });
});
