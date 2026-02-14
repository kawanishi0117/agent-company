/**
 * 社員ステータストラッカーのユニットテスト
 *
 * @module tests/execution/employee-status-tracker
 * @see Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { EmployeeStatusTracker } from '../../tools/cli/lib/execution/employee-status-tracker.js';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/** テスト用一時ディレクトリ */
const TEST_DIR = 'runtime/state/employee-status-test-' + Date.now();

// =============================================================================
// テスト本体
// =============================================================================

describe('EmployeeStatusTracker', () => {
  let tracker: EmployeeStatusTracker;

  beforeEach(() => {
    tracker = new EmployeeStatusTracker(TEST_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 無視
    }
  });

  // ===========================================================================
  // updateStatus
  // ===========================================================================

  describe('updateStatus', () => {
    it('ステータスを更新し永続化できる', async () => {
      await tracker.updateStatus('coo_pm', 'working', {
        id: 'wf-001',
        title: 'テストタスク',
      });

      const status = await tracker.getStatus('coo_pm');
      expect(status).not.toBeNull();
      expect(status!.agentId).toBe('coo_pm');
      expect(status!.status).toBe('working');
      expect(status!.currentTask).toEqual({
        id: 'wf-001',
        title: 'テストタスク',
      });
    });

    it('タスク情報なしでステータスを更新できる', async () => {
      await tracker.updateStatus('reviewer', 'idle');

      const status = await tracker.getStatus('reviewer');
      expect(status).not.toBeNull();
      expect(status!.status).toBe('idle');
      expect(status!.currentTask).toBeUndefined();
    });

    it('ステータスを連続更新できる', async () => {
      await tracker.updateStatus('worker-001', 'idle');
      await tracker.updateStatus('worker-001', 'working');
      await tracker.updateStatus('worker-001', 'reviewing');

      const status = await tracker.getStatus('worker-001');
      expect(status!.status).toBe('reviewing');
    });
  });

  // ===========================================================================
  // getStatus
  // ===========================================================================

  describe('getStatus', () => {
    it('存在しないエージェントはnullを返す', async () => {
      const status = await tracker.getStatus('nonexistent');
      expect(status).toBeNull();
    });

    it('lastChangedが設定される', async () => {
      const before = new Date().toISOString();
      await tracker.updateStatus('coo_pm', 'in_meeting');
      const after = new Date().toISOString();

      const status = await tracker.getStatus('coo_pm');
      expect(status!.lastChanged).toBeDefined();
      expect(status!.lastChanged >= before).toBe(true);
      expect(status!.lastChanged <= after).toBe(true);
    });
  });

  // ===========================================================================
  // getAllStatuses
  // ===========================================================================

  describe('getAllStatuses', () => {
    it('データがない場合は空配列を返す', async () => {
      const statuses = await tracker.getAllStatuses();
      expect(statuses).toEqual([]);
    });

    it('全社員のステータスを返す', async () => {
      await tracker.updateStatus('coo_pm', 'working');
      await tracker.updateStatus('reviewer', 'reviewing');
      await tracker.updateStatus('worker-001', 'idle');

      const statuses = await tracker.getAllStatuses();
      expect(statuses).toHaveLength(3);

      const ids = statuses.map((s) => s.agentId);
      expect(ids).toContain('coo_pm');
      expect(ids).toContain('reviewer');
      expect(ids).toContain('worker-001');
    });
  });

  // ===========================================================================
  // getTimeline
  // ===========================================================================

  describe('getTimeline', () => {
    it('ステータス変化のタイムラインを取得できる', async () => {
      await tracker.updateStatus('coo_pm', 'idle');
      await tracker.updateStatus('coo_pm', 'in_meeting');
      await tracker.updateStatus('coo_pm', 'working');

      const today = new Date().toISOString().slice(0, 10);
      const timeline = await tracker.getTimeline('coo_pm', today);

      expect(timeline.agentId).toBe('coo_pm');
      expect(timeline.date).toBe(today);
      expect(timeline.entries).toHaveLength(3);
      expect(timeline.entries[0].status).toBe('idle');
      expect(timeline.entries[1].status).toBe('in_meeting');
      expect(timeline.entries[2].status).toBe('working');
    });

    it('指定日のエントリのみフィルタされる', async () => {
      await tracker.updateStatus('coo_pm', 'working');

      // 存在しない日付を指定
      const timeline = await tracker.getTimeline('coo_pm', '2020-01-01');
      expect(timeline.entries).toHaveLength(0);
    });

    it('存在しないエージェントは空タイムラインを返す', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const timeline = await tracker.getTimeline('nonexistent', today);

      expect(timeline.agentId).toBe('nonexistent');
      expect(timeline.entries).toHaveLength(0);
    });

    it('タイムラインエントリにdurationが記録される', async () => {
      await tracker.updateStatus('coo_pm', 'idle');
      // 少し待ってから次のステータスに更新
      await tracker.updateStatus('coo_pm', 'working');

      const today = new Date().toISOString().slice(0, 10);
      const timeline = await tracker.getTimeline('coo_pm', today);

      // 最初のエントリにはdurationが設定されているはず
      expect(timeline.entries[0].duration).toBeDefined();
      expect(typeof timeline.entries[0].duration).toBe('number');
      expect(timeline.entries[0].duration!).toBeGreaterThanOrEqual(0);
    });
  });
});
