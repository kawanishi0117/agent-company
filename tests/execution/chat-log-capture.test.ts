/**
 * チャットログキャプチャのユニットテスト
 *
 * @module tests/execution/chat-log-capture
 * @see Requirements: 5.1, 5.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  ChatLogCapture,
  type ChatLogInput,
} from '../../tools/cli/lib/execution/chat-log-capture.js';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

const TEST_DIR = 'runtime/state/chat-logs-test-' + Date.now();

function createInput(overrides: Partial<ChatLogInput> = {}): ChatLogInput {
  return {
    sender: 'coo_pm',
    recipient: 'worker-001',
    type: 'task_assignment',
    content: 'テストタスクを割り当てます',
    ...overrides,
  };
}

// =============================================================================
// テスト本体
// =============================================================================

describe('ChatLogCapture', () => {
  let capture: ChatLogCapture;

  beforeEach(() => {
    capture = new ChatLogCapture(TEST_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 無視
    }
  });

  // ===========================================================================
  // capture
  // ===========================================================================

  describe('capture', () => {
    it('エントリをキャプチャしてIDとタイムスタンプを付与する', async () => {
      const entry = await capture.capture(createInput());

      expect(entry.id).toBeDefined();
      expect(entry.id).toMatch(/^chat-/);
      expect(entry.timestamp).toBeDefined();
      expect(entry.sender).toBe('coo_pm');
      expect(entry.recipient).toBe('worker-001');
      expect(entry.type).toBe('task_assignment');
    });

    it('複数エントリを同日に保存できる', async () => {
      await capture.capture(createInput({ content: 'メッセージ1' }));
      await capture.capture(createInput({ content: 'メッセージ2' }));
      await capture.capture(createInput({ content: 'メッセージ3' }));

      const results = await capture.query();
      expect(results).toHaveLength(3);
    });

    it('ワークフローIDを含むエントリを保存できる', async () => {
      const entry = await capture.capture(
        createInput({ workflowId: 'wf-001' })
      );

      expect(entry.workflowId).toBe('wf-001');
    });
  });

  // ===========================================================================
  // query
  // ===========================================================================

  describe('query', () => {
    it('フィルタなしで全エントリを返す', async () => {
      await capture.capture(createInput());
      await capture.capture(createInput({ type: 'review_feedback' }));

      const results = await capture.query();
      expect(results).toHaveLength(2);
    });

    it('エージェントIDでフィルタできる（送信者）', async () => {
      await capture.capture(createInput({ sender: 'coo_pm' }));
      await capture.capture(createInput({ sender: 'reviewer' }));

      const results = await capture.query({ agentId: 'coo_pm' });
      expect(results).toHaveLength(1);
      expect(results[0].sender).toBe('coo_pm');
    });

    it('エージェントIDでフィルタできる（受信者）', async () => {
      await capture.capture(createInput({ recipient: 'worker-001' }));
      await capture.capture(createInput({ recipient: 'worker-002' }));

      const results = await capture.query({ agentId: 'worker-002' });
      expect(results).toHaveLength(1);
      expect(results[0].recipient).toBe('worker-002');
    });

    it('メッセージタイプでフィルタできる', async () => {
      await capture.capture(createInput({ type: 'task_assignment' }));
      await capture.capture(createInput({ type: 'review_feedback' }));
      await capture.capture(createInput({ type: 'escalation' }));

      const results = await capture.query({ type: 'escalation' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('escalation');
    });

    it('ワークフローIDでフィルタできる', async () => {
      await capture.capture(createInput({ workflowId: 'wf-001' }));
      await capture.capture(createInput({ workflowId: 'wf-002' }));
      await capture.capture(createInput());

      const results = await capture.query({ workflowId: 'wf-001' });
      expect(results).toHaveLength(1);
      expect(results[0].workflowId).toBe('wf-001');
    });

    it('データがない場合は空配列を返す', async () => {
      const results = await capture.query();
      expect(results).toEqual([]);
    });
  });

  // ===========================================================================
  // getActivityStream
  // ===========================================================================

  describe('getActivityStream', () => {
    it('アクティビティストリームを新しい順で返す', async () => {
      await capture.capture(createInput({ content: '1番目' }));
      await capture.capture(createInput({ content: '2番目' }));
      await capture.capture(createInput({ content: '3番目' }));

      const stream = await capture.getActivityStream();

      expect(stream).toHaveLength(3);
      // 新しい順
      expect(
        new Date(stream[0].timestamp).getTime()
      ).toBeGreaterThanOrEqual(
        new Date(stream[1].timestamp).getTime()
      );
    });

    it('limit指定で件数を制限できる', async () => {
      for (let i = 0; i < 5; i++) {
        await capture.capture(createInput({ content: `メッセージ${i}` }));
      }

      const stream = await capture.getActivityStream(2);
      expect(stream).toHaveLength(2);
    });

    it('アクティビティアイテムに必要なフィールドが含まれる', async () => {
      await capture.capture(
        createInput({
          sender: 'coo_pm',
          recipient: 'worker-001',
          type: 'task_assignment',
          workflowId: 'wf-001',
        })
      );

      const stream = await capture.getActivityStream();
      const item = stream[0];

      expect(item.id).toBeDefined();
      expect(item.timestamp).toBeDefined();
      expect(item.type).toBe('task_assignment');
      expect(item.description).toContain('タスク割り当て');
      expect(item.description).toContain('coo_pm');
      expect(item.agentIds).toContain('coo_pm');
      expect(item.agentIds).toContain('worker-001');
      expect(item.workflowId).toBe('wf-001');
    });

    it('データがない場合は空配列を返す', async () => {
      const stream = await capture.getActivityStream();
      expect(stream).toEqual([]);
    });
  });
});
