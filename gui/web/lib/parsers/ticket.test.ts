/**
 * @file チケットパーサーのユニットテスト
 * @description ticket.tsの各関数をテストする
 */

import { describe, it, expect } from 'vitest';
import { parseTicketContent, groupTicketsByStatus } from './ticket';
import type { Ticket, TicketStatus } from '../types';

// =============================================================================
// parseTicketContent のテスト
// =============================================================================

describe('parseTicketContent', () => {
  describe('正常系', () => {
    it('有効なfrontmatterとコンテンツからチケットを抽出できる', () => {
      const content = `---
id: '0001'
status: 'todo'
assignee: 'coo_pm'
created: '2026-01-27T00:00:00.000Z'
updated: '2026-01-27T15:14:26.436Z'
---

# サンプルチケット

## 目的
テスト用のチケットです。
`;

      const result = parseTicketContent(content, '0001-sample.md');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('0001');
        expect(result.data.status).toBe('todo');
        expect(result.data.assignee).toBe('coo_pm');
        expect(result.data.title).toBe('サンプルチケット');
        expect(result.data.created).toBe('2026-01-27T00:00:00.000Z');
        expect(result.data.updated).toBe('2026-01-27T15:14:26.436Z');
        expect(result.data.content).toContain('## 目的');
      }
    });

    it('全てのステータス値を正しく処理できる', () => {
      const statuses: TicketStatus[] = ['todo', 'doing', 'review', 'done'];

      for (const status of statuses) {
        const content = `---
id: '0001'
status: '${status}'
assignee: 'test'
created: '2026-01-27T00:00:00.000Z'
updated: '2026-01-27T00:00:00.000Z'
---

# テストチケット
`;

        const result = parseTicketContent(content);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(status);
        }
      }
    });

    it('クォートなしのfrontmatter値も処理できる', () => {
      const content = `---
id: '0002'
status: done
assignee: coo_pm
created: '2026-01-27T00:00:00.000Z'
updated: '2026-01-27T15:14:26.436Z'
---

# クォートなしテスト
`;

      const result = parseTicketContent(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('done');
        expect(result.data.assignee).toBe('coo_pm');
      }
    });

    it('assigneeが空の場合も処理できる', () => {
      const content = `---
id: '0003'
status: 'todo'
assignee: ''
created: '2026-01-27T00:00:00.000Z'
updated: '2026-01-27T00:00:00.000Z'
---

# 未アサインチケット
`;

      const result = parseTicketContent(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assignee).toBe('');
      }
    });
  });

  describe('フォールバック処理', () => {
    it('IDがfrontmatterにない場合、ファイル名から抽出する', () => {
      const content = `---
status: 'todo'
assignee: 'test'
created: '2026-01-27T00:00:00.000Z'
updated: '2026-01-27T00:00:00.000Z'
---

# ファイル名からID抽出
`;

      const result = parseTicketContent(content, '0005-test.md');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('0005');
      }
    });

    it('無効なステータスの場合、todoにフォールバックする', () => {
      const content = `---
id: '0006'
status: 'invalid_status'
assignee: 'test'
created: '2026-01-27T00:00:00.000Z'
updated: '2026-01-27T00:00:00.000Z'
---

# 無効ステータステスト
`;

      const result = parseTicketContent(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('todo');
      }
    });

    it('日付が無効な場合、現在時刻にフォールバックする', () => {
      const content = `---
id: '0007'
status: 'todo'
assignee: 'test'
created: 'invalid-date'
updated: ''
---

# 無効日付テスト
`;

      const result = parseTicketContent(content);

      expect(result.success).toBe(true);
      if (result.success) {
        // ISO 8601形式であることを確認
        expect(result.data.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(result.data.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });
  });

  describe('エラー処理', () => {
    it('IDが取得できない場合はエラーを返す', () => {
      const content = `---
status: 'todo'
assignee: 'test'
---

# IDなしチケット
`;

      const result = parseTicketContent(content, 'no-id.md');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('チケットID');
      }
    });

    it('H1見出しがない場合はエラーを返す', () => {
      const content = `---
id: '0008'
status: 'todo'
assignee: 'test'
---

## これはH2見出し

本文のみ
`;

      const result = parseTicketContent(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('タイトル');
      }
    });

    it('frontmatterがない場合もエラーを返す', () => {
      const content = `# タイトルのみ

本文
`;

      const result = parseTicketContent(content, 'no-frontmatter.md');

      expect(result.success).toBe(false);
    });
  });

  describe('タイトル抽出', () => {
    it('最初のH1見出しをタイトルとして抽出する', () => {
      const content = `---
id: '0009'
status: 'todo'
assignee: 'test'
---

# 最初のタイトル

## セクション1

# 2番目のH1（無視される）
`;

      const result = parseTicketContent(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('最初のタイトル');
      }
    });

    it('H1見出しの前後の空白を除去する', () => {
      const content = `---
id: '0010'
status: 'todo'
assignee: 'test'
---

#   空白付きタイトル   
`;

      const result = parseTicketContent(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('空白付きタイトル');
      }
    });
  });
});

// =============================================================================
// groupTicketsByStatus のテスト
// =============================================================================

describe('groupTicketsByStatus', () => {
  const createTicket = (id: string, status: TicketStatus): Ticket => ({
    id,
    status,
    assignee: 'test',
    title: `Ticket ${id}`,
    created: '2026-01-27T00:00:00.000Z',
    updated: '2026-01-27T00:00:00.000Z',
    content: '',
  });

  it('チケットをステータスごとにグループ化する', () => {
    const tickets: Ticket[] = [
      createTicket('001', 'todo'),
      createTicket('002', 'doing'),
      createTicket('003', 'review'),
      createTicket('004', 'done'),
      createTicket('005', 'todo'),
    ];

    const grouped = groupTicketsByStatus(tickets);

    expect(grouped.todo).toHaveLength(2);
    expect(grouped.doing).toHaveLength(1);
    expect(grouped.review).toHaveLength(1);
    expect(grouped.done).toHaveLength(1);
  });

  it('空の配列を渡すと全てのステータスが空配列になる', () => {
    const grouped = groupTicketsByStatus([]);

    expect(grouped.todo).toHaveLength(0);
    expect(grouped.doing).toHaveLength(0);
    expect(grouped.review).toHaveLength(0);
    expect(grouped.done).toHaveLength(0);
  });

  it('同じステータスのチケットが正しくグループ化される', () => {
    const tickets: Ticket[] = [
      createTicket('001', 'todo'),
      createTicket('002', 'todo'),
      createTicket('003', 'todo'),
    ];

    const grouped = groupTicketsByStatus(tickets);

    expect(grouped.todo).toHaveLength(3);
    expect(grouped.todo.map((t) => t.id)).toEqual(['001', '002', '003']);
  });
});
