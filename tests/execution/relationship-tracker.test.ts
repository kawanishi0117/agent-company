/**
 * RelationshipTracker ユニットテスト
 * @module tests/execution/relationship-tracker
 * @see Requirements: 14.1, 14.3, 14.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RelationshipTracker } from '../../tools/cli/lib/execution/relationship-tracker.js';

describe('RelationshipTracker', () => {
  let tracker: RelationshipTracker;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-relationships-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    tracker = new RelationshipTracker(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('recordInteraction()', () => {
    it('インタラクションを記録できる', async () => {
      await tracker.recordInteraction({
        agentA: 'coo_pm',
        agentB: 'reviewer',
        type: 'meeting',
        timestamp: new Date().toISOString(),
      });

      const map = await tracker.getMap();
      expect(map.pairs.length).toBe(1);
      expect(map.agents).toContain('coo_pm');
      expect(map.agents).toContain('reviewer');
    });
  });

  describe('getMap()', () => {
    it('関係性マップを生成できる', async () => {
      // 複数のインタラクションを記録
      await tracker.recordInteraction({ agentA: 'a', agentB: 'b', type: 'meeting', timestamp: '2026-01-01' });
      await tracker.recordInteraction({ agentA: 'a', agentB: 'b', type: 'review', timestamp: '2026-01-02' });
      await tracker.recordInteraction({ agentA: 'a', agentB: 'c', type: 'handoff', timestamp: '2026-01-03' });

      const map = await tracker.getMap();
      expect(map.agents.length).toBe(3);
      expect(map.pairs.length).toBe(2);

      // a-b ペアが最もスコアが高い
      expect(map.pairs[0].interactionCount).toBe(2);
      expect(map.pairs[0].score).toBe(100);
    });

    it('データがない場合は空マップを返す', async () => {
      const map = await tracker.getMap();
      expect(map.pairs).toEqual([]);
      expect(map.agents).toEqual([]);
    });
  });

  describe('getCollaborators()', () => {
    it('トップコラボレーターを取得できる', async () => {
      await tracker.recordInteraction({ agentA: 'x', agentB: 'y', type: 'meeting', timestamp: '2026-01-01' });
      await tracker.recordInteraction({ agentA: 'x', agentB: 'y', type: 'review', timestamp: '2026-01-02' });
      await tracker.recordInteraction({ agentA: 'x', agentB: 'z', type: 'chat', timestamp: '2026-01-03' });

      const collabs = await tracker.getCollaborators('x');
      expect(collabs.length).toBe(2);
      expect(collabs[0].agentId).toBe('y');
      expect(collabs[0].interactionCount).toBe(2);
    });

    it('インタラクションがないエージェントは空配列', async () => {
      const collabs = await tracker.getCollaborators('nobody');
      expect(collabs).toEqual([]);
    });
  });
});
