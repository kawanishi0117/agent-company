/**
 * Ticket Manager ユニットテスト
 *
 * チケット階層構造の管理機能をテストする。
 * - 親チケット、子チケット、孫チケットの作成
 * - 階層的ID生成
 * - ステータス管理と伝播
 * - 永続化
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 9.1**
 *
 * @module tests/execution/ticket-manager.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  TicketManager,
  ChildTicketData,
  GrandchildTicketData,
} from '../../tools/cli/lib/execution/ticket-manager';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_TICKETS_DIR = 'runtime/state/test-tickets';

// =============================================================================
// テストセットアップ
// =============================================================================

describe('TicketManager', () => {
  let ticketManager: TicketManager;

  beforeEach(async () => {
    // テスト用のTicketManagerインスタンスを作成
    ticketManager = new TicketManager(TEST_TICKETS_DIR);

    // テスト用ディレクトリを作成
    await fs.mkdir(TEST_TICKETS_DIR, { recursive: true });
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_TICKETS_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // 親チケット作成テスト
  // ===========================================================================

  describe('createParentTicket', () => {
    /**
     * 親チケットが正しく作成されることを確認
     * @see Requirement 2.2: Parent ticket ID format: `<project-id>-<sequence>`
     * @see Requirement 2.5: THE Parent_Ticket SHALL contain required fields
     */
    it('親チケットが正しく作成される', async () => {
      const projectId = 'proj-001';
      const instruction = 'ユーザー認証機能を実装してください';

      const ticket = await ticketManager.createParentTicket(projectId, instruction);

      // 必須フィールドの確認
      expect(ticket.id).toBe('proj-001-0001');
      expect(ticket.projectId).toBe(projectId);
      expect(ticket.instruction).toBe(instruction);
      expect(ticket.status).toBe('pending');
      expect(ticket.createdAt).toBeDefined();
      expect(ticket.updatedAt).toBeDefined();
      expect(ticket.childTickets).toEqual([]);
      expect(ticket.metadata).toBeDefined();
      expect(ticket.metadata.priority).toBe('medium');
      expect(ticket.metadata.tags).toEqual([]);
    });

    /**
     * 連続して作成するとシーケンス番号が増加することを確認
     * @see Requirement 2.2: unique ticket ID with format `<project-id>-<sequence>`
     */
    it('連続して作成するとシーケンス番号が増加する', async () => {
      const projectId = 'proj-001';

      const ticket1 = await ticketManager.createParentTicket(projectId, '指示1');
      const ticket2 = await ticketManager.createParentTicket(projectId, '指示2');
      const ticket3 = await ticketManager.createParentTicket(projectId, '指示3');

      expect(ticket1.id).toBe('proj-001-0001');
      expect(ticket2.id).toBe('proj-001-0002');
      expect(ticket3.id).toBe('proj-001-0003');
    });

    /**
     * 異なるプロジェクトでは独立したシーケンス番号を持つことを確認
     */
    it('異なるプロジェクトでは独立したシーケンス番号を持つ', async () => {
      const ticket1 = await ticketManager.createParentTicket('proj-001', '指示1');
      const ticket2 = await ticketManager.createParentTicket('proj-002', '指示2');
      const ticket3 = await ticketManager.createParentTicket('proj-001', '指示3');

      expect(ticket1.id).toBe('proj-001-0001');
      expect(ticket2.id).toBe('proj-002-0001');
      expect(ticket3.id).toBe('proj-001-0002');
    });

    /**
     * 空のプロジェクトIDでエラーが発生することを確認
     */
    it('空のプロジェクトIDでエラーが発生する', async () => {
      await expect(ticketManager.createParentTicket('', '指示')).rejects.toThrow(
        'プロジェクトIDは必須です'
      );
    });

    /**
     * 空の指示でエラーが発生することを確認
     */
    it('空の指示でエラーが発生する', async () => {
      await expect(ticketManager.createParentTicket('proj-001', '')).rejects.toThrow(
        '指示は必須です'
      );
    });

    /**
     * 空白のみの指示でエラーが発生することを確認
     */
    it('空白のみの指示でエラーが発生する', async () => {
      await expect(ticketManager.createParentTicket('proj-001', '   ')).rejects.toThrow(
        '指示は必須です'
      );
    });
  });

  // ===========================================================================
  // 親チケット取得テスト
  // ===========================================================================

  describe('getParentTicket', () => {
    /**
     * 存在する親チケットを取得できることを確認
     */
    it('存在する親チケットを取得できる', async () => {
      const created = await ticketManager.createParentTicket('proj-001', '指示');
      const retrieved = await ticketManager.getParentTicket(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.instruction).toBe('指示');
    });

    /**
     * 存在しない親チケットはnullを返すことを確認
     */
    it('存在しない親チケットはnullを返す', async () => {
      const result = await ticketManager.getParentTicket('non-existent-id');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // 親チケット一覧テスト
  // ===========================================================================

  describe('listParentTickets', () => {
    /**
     * プロジェクトの親チケット一覧を取得できることを確認
     */
    it('プロジェクトの親チケット一覧を取得できる', async () => {
      await ticketManager.createParentTicket('proj-001', '指示1');
      await ticketManager.createParentTicket('proj-001', '指示2');
      await ticketManager.createParentTicket('proj-002', '指示3');

      const proj001Tickets = await ticketManager.listParentTickets('proj-001');
      const proj002Tickets = await ticketManager.listParentTickets('proj-002');

      expect(proj001Tickets).toHaveLength(2);
      expect(proj002Tickets).toHaveLength(1);
    });

    /**
     * 存在しないプロジェクトは空配列を返すことを確認
     */
    it('存在しないプロジェクトは空配列を返す', async () => {
      const result = await ticketManager.listParentTickets('non-existent-project');
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // 子チケット作成テスト
  // ===========================================================================

  describe('createChildTicket', () => {
    /**
     * 子チケットが正しく作成されることを確認
     * @see Requirement 2.3: Child ticket ID format: `<parent-id>-<sequence>`
     * @see Requirement 2.6: THE Child_Ticket SHALL contain required fields
     */
    it('子チケットが正しく作成される', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const childData: ChildTicketData = {
        title: '設計タスク',
        description: 'アーキテクチャ設計を行う',
        workerType: 'design',
      };

      const child = await ticketManager.createChildTicket(parent.id, childData);

      // 必須フィールドの確認
      expect(child.id).toBe('proj-001-0001-01');
      expect(child.parentId).toBe(parent.id);
      expect(child.title).toBe('設計タスク');
      expect(child.description).toBe('アーキテクチャ設計を行う');
      expect(child.status).toBe('pending');
      expect(child.workerType).toBe('design');
      expect(child.grandchildTickets).toEqual([]);
    });

    /**
     * 連続して作成するとシーケンス番号が増加することを確認
     * @see Requirement 2.3: Child ticket ID format: `<parent-id>-<sequence>`
     */
    it('連続して作成するとシーケンス番号が増加する', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');

      const child1 = await ticketManager.createChildTicket(parent.id, {
        title: 'タスク1',
        description: '',
        workerType: 'developer',
      });
      const child2 = await ticketManager.createChildTicket(parent.id, {
        title: 'タスク2',
        description: '',
        workerType: 'test',
      });

      expect(child1.id).toBe('proj-001-0001-01');
      expect(child2.id).toBe('proj-001-0001-02');
    });

    /**
     * 親チケットのchildTicketsに追加されることを確認
     */
    it('親チケットのchildTicketsに追加される', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      await ticketManager.createChildTicket(parent.id, {
        title: 'タスク1',
        description: '',
        workerType: 'developer',
      });

      const updatedParent = await ticketManager.getParentTicket(parent.id);
      expect(updatedParent!.childTickets).toHaveLength(1);
      expect(updatedParent!.childTickets[0].title).toBe('タスク1');
    });

    /**
     * 存在しない親チケットでエラーが発生することを確認
     */
    it('存在しない親チケットでエラーが発生する', async () => {
      await expect(
        ticketManager.createChildTicket('non-existent', {
          title: 'タスク',
          description: '',
          workerType: 'developer',
        })
      ).rejects.toThrow('存在しません');
    });

    /**
     * 空のタイトルでエラーが発生することを確認
     */
    it('空のタイトルでエラーが発生する', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      await expect(
        ticketManager.createChildTicket(parent.id, {
          title: '',
          description: '',
          workerType: 'developer',
        })
      ).rejects.toThrow('タイトルは必須です');
    });

    /**
     * 無効なワーカータイプでエラーが発生することを確認
     */
    it('無効なワーカータイプでエラーが発生する', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      await expect(
        ticketManager.createChildTicket(parent.id, {
          title: 'タスク',
          description: '',
          workerType: 'invalid' as unknown as 'developer',
        })
      ).rejects.toThrow('無効なワーカータイプ');
    });

    /**
     * 全てのワーカータイプが有効であることを確認
     */
    it('全てのワーカータイプが有効である', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const workerTypes = [
        'research',
        'design',
        'designer',
        'developer',
        'test',
        'reviewer',
      ] as const;

      for (const workerType of workerTypes) {
        const child = await ticketManager.createChildTicket(parent.id, {
          title: `${workerType}タスク`,
          description: '',
          workerType,
        });
        expect(child.workerType).toBe(workerType);
      }
    });
  });

  // ===========================================================================
  // 子チケット取得テスト
  // ===========================================================================

  describe('getChildTicket', () => {
    /**
     * 存在する子チケットを取得できることを確認
     */
    it('存在する子チケットを取得できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const created = await ticketManager.createChildTicket(parent.id, {
        title: 'タスク',
        description: '説明',
        workerType: 'developer',
      });

      const retrieved = await ticketManager.getChildTicket(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe('タスク');
    });

    /**
     * 存在しない子チケットはnullを返すことを確認
     */
    it('存在しない子チケットはnullを返す', async () => {
      const result = await ticketManager.getChildTicket('non-existent-id');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // 孫チケット作成テスト
  // ===========================================================================

  describe('createGrandchildTicket', () => {
    /**
     * 孫チケットが正しく作成されることを確認
     * @see Requirement 2.4: Grandchild ticket ID format: `<child-id>-<sequence>`
     * @see Requirement 2.7: THE Grandchild_Ticket SHALL contain required fields
     */
    it('孫チケットが正しく作成される', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });
      const grandchildData: GrandchildTicketData = {
        title: '実装タスク',
        description: 'ログイン機能を実装する',
        acceptanceCriteria: [
          'ユーザー名とパスワードで認証できる',
          'エラー時にメッセージを表示する',
        ],
      };

      const grandchild = await ticketManager.createGrandchildTicket(child.id, grandchildData);

      // 必須フィールドの確認
      expect(grandchild.id).toBe('proj-001-0001-01-001');
      expect(grandchild.parentId).toBe(child.id);
      expect(grandchild.title).toBe('実装タスク');
      expect(grandchild.description).toBe('ログイン機能を実装する');
      expect(grandchild.acceptanceCriteria).toHaveLength(2);
      expect(grandchild.status).toBe('pending');
      expect(grandchild.artifacts).toEqual([]);
    });

    /**
     * 連続して作成するとシーケンス番号が増加することを確認
     * @see Requirement 2.4: Grandchild ticket ID format: `<child-id>-<sequence>`
     */
    it('連続して作成するとシーケンス番号が増加する', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });

      const grandchild1 = await ticketManager.createGrandchildTicket(child.id, {
        title: 'タスク1',
        description: '',
        acceptanceCriteria: [],
      });
      const grandchild2 = await ticketManager.createGrandchildTicket(child.id, {
        title: 'タスク2',
        description: '',
        acceptanceCriteria: [],
      });

      expect(grandchild1.id).toBe('proj-001-0001-01-001');
      expect(grandchild2.id).toBe('proj-001-0001-01-002');
    });

    /**
     * 子チケットのgrandchildTicketsに追加されることを確認
     */
    it('子チケットのgrandchildTicketsに追加される', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });
      await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク',
        description: '',
        acceptanceCriteria: [],
      });

      const updatedChild = await ticketManager.getChildTicket(child.id);
      expect(updatedChild!.grandchildTickets).toHaveLength(1);
      expect(updatedChild!.grandchildTickets[0].title).toBe('孫タスク');
    });

    /**
     * 存在しない子チケットでエラーが発生することを確認
     */
    it('存在しない子チケットでエラーが発生する', async () => {
      await expect(
        ticketManager.createGrandchildTicket('non-existent', {
          title: 'タスク',
          description: '',
          acceptanceCriteria: [],
        })
      ).rejects.toThrow('存在しません');
    });

    /**
     * 空のタイトルでエラーが発生することを確認
     */
    it('空のタイトルでエラーが発生する', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });

      await expect(
        ticketManager.createGrandchildTicket(child.id, {
          title: '',
          description: '',
          acceptanceCriteria: [],
        })
      ).rejects.toThrow('タイトルは必須です');
    });
  });

  // ===========================================================================
  // 孫チケット取得テスト
  // ===========================================================================

  describe('getGrandchildTicket', () => {
    /**
     * 存在する孫チケットを取得できることを確認
     */
    it('存在する孫チケットを取得できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });
      const created = await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク',
        description: '説明',
        acceptanceCriteria: ['基準1'],
      });

      const retrieved = await ticketManager.getGrandchildTicket(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe('孫タスク');
    });

    /**
     * 存在しない孫チケットはnullを返すことを確認
     */
    it('存在しない孫チケットはnullを返す', async () => {
      const result = await ticketManager.getGrandchildTicket('non-existent-id');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // ステータス更新テスト
  // ===========================================================================

  describe('updateTicketStatus', () => {
    /**
     * 親チケットのステータスを更新できることを確認
     */
    it('親チケットのステータスを更新できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      await ticketManager.updateTicketStatus(parent.id, 'in_progress');

      const updated = await ticketManager.getParentTicket(parent.id);
      expect(updated!.status).toBe('in_progress');
    });

    /**
     * 子チケットのステータスを更新できることを確認
     */
    it('子チケットのステータスを更新できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });

      await ticketManager.updateTicketStatus(child.id, 'in_progress');

      const updated = await ticketManager.getChildTicket(child.id);
      expect(updated!.status).toBe('in_progress');
    });

    /**
     * 孫チケットのステータスを更新できることを確認
     */
    it('孫チケットのステータスを更新できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });
      const grandchild = await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク',
        description: '',
        acceptanceCriteria: [],
      });

      await ticketManager.updateTicketStatus(grandchild.id, 'completed');

      const updated = await ticketManager.getGrandchildTicket(grandchild.id);
      expect(updated!.status).toBe('completed');
    });

    /**
     * 存在しないチケットでエラーが発生することを確認
     */
    it('存在しないチケットでエラーが発生する', async () => {
      await expect(ticketManager.updateTicketStatus('non-existent', 'completed')).rejects.toThrow(
        '不正'
      );
    });
  });

  // ===========================================================================
  // ステータス伝播テスト
  // ===========================================================================

  describe('propagateStatusToParent', () => {
    /**
     * 全ての孫チケットが完了すると子チケットが完了になることを確認
     * @see Requirement 2.8: WHEN a ticket status changes, THE Ticket_Manager SHALL propagate status updates
     */
    it('全ての孫チケットが完了すると子チケットが完了になる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });
      const grandchild1 = await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク1',
        description: '',
        acceptanceCriteria: [],
      });
      const grandchild2 = await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク2',
        description: '',
        acceptanceCriteria: [],
      });

      // 孫チケットを完了にする
      await ticketManager.updateTicketStatus(grandchild1.id, 'completed');
      await ticketManager.updateTicketStatus(grandchild2.id, 'completed');

      // ステータスを伝播
      await ticketManager.propagateStatusToParent(grandchild2.id);

      const updatedChild = await ticketManager.getChildTicket(child.id);
      expect(updatedChild!.status).toBe('completed');
    });

    /**
     * 全ての子チケットが完了すると親チケットが完了になることを確認
     * @see Requirement 2.8: WHEN a ticket status changes, THE Ticket_Manager SHALL propagate status updates
     */
    it('全ての子チケットが完了すると親チケットが完了になる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child1 = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク1',
        description: '',
        workerType: 'developer',
      });
      const child2 = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク2',
        description: '',
        workerType: 'test',
      });

      // 子チケットを完了にする
      await ticketManager.updateTicketStatus(child1.id, 'completed');
      await ticketManager.updateTicketStatus(child2.id, 'completed');

      // ステータスを伝播
      await ticketManager.propagateStatusToParent(child2.id);

      const updatedParent = await ticketManager.getParentTicket(parent.id);
      expect(updatedParent!.status).toBe('completed');
    });

    /**
     * いずれかの孫チケットが失敗すると子チケットが失敗になることを確認
     */
    it('いずれかの孫チケットが失敗すると子チケットが失敗になる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });
      const grandchild1 = await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク1',
        description: '',
        acceptanceCriteria: [],
      });
      await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク2',
        description: '',
        acceptanceCriteria: [],
      });

      // 1つの孫チケットを失敗にする
      await ticketManager.updateTicketStatus(grandchild1.id, 'failed');

      // ステータスを伝播
      await ticketManager.propagateStatusToParent(grandchild1.id);

      const updatedChild = await ticketManager.getChildTicket(child.id);
      expect(updatedChild!.status).toBe('failed');
    });

    /**
     * いずれかの孫チケットが進行中だと子チケットが進行中になることを確認
     */
    it('いずれかの孫チケットが進行中だと子チケットが進行中になる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '',
        workerType: 'developer',
      });
      const grandchild1 = await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク1',
        description: '',
        acceptanceCriteria: [],
      });
      await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク2',
        description: '',
        acceptanceCriteria: [],
      });

      // 1つの孫チケットを進行中にする
      await ticketManager.updateTicketStatus(grandchild1.id, 'in_progress');

      // ステータスを伝播
      await ticketManager.propagateStatusToParent(grandchild1.id);

      const updatedChild = await ticketManager.getChildTicket(child.id);
      expect(updatedChild!.status).toBe('in_progress');
    });
  });

  // ===========================================================================
  // 永続化テスト
  // ===========================================================================

  describe('saveTickets / loadTickets', () => {
    /**
     * チケットを保存して読み込めることを確認
     * @see Requirement 9.1: THE System SHALL persist ticket hierarchy to `runtime/state/tickets/<project-id>.json`
     */
    it('チケットを保存して読み込める', async () => {
      const projectId = 'proj-001';

      // チケット階層を作成
      const parent = await ticketManager.createParentTicket(projectId, '親指示');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: '子タスク',
        description: '説明',
        workerType: 'developer',
      });
      await ticketManager.createGrandchildTicket(child.id, {
        title: '孫タスク',
        description: '詳細',
        acceptanceCriteria: ['基準1', '基準2'],
      });

      // 保存
      await ticketManager.saveTickets(projectId);

      // 新しいインスタンスで読み込み
      const newManager = new TicketManager(TEST_TICKETS_DIR);
      await newManager.loadTickets(projectId);

      // 検証
      const loadedParent = await newManager.getParentTicket(parent.id);
      expect(loadedParent).not.toBeNull();
      expect(loadedParent!.instruction).toBe('親指示');
      expect(loadedParent!.childTickets).toHaveLength(1);
      expect(loadedParent!.childTickets[0].grandchildTickets).toHaveLength(1);
    });

    /**
     * 存在しないプロジェクトを読み込むと空の状態になることを確認
     */
    it('存在しないプロジェクトを読み込むと空の状態になる', async () => {
      const newManager = new TicketManager(TEST_TICKETS_DIR);
      await newManager.loadTickets('non-existent-project');

      const tickets = await newManager.listParentTickets('non-existent-project');
      expect(tickets).toEqual([]);
    });

    /**
     * シーケンス番号が正しく復元されることを確認
     */
    it('シーケンス番号が正しく復元される', async () => {
      const projectId = 'proj-001';

      // チケットを作成
      await ticketManager.createParentTicket(projectId, '指示1');
      await ticketManager.createParentTicket(projectId, '指示2');

      // 保存
      await ticketManager.saveTickets(projectId);

      // 新しいインスタンスで読み込み
      const newManager = new TicketManager(TEST_TICKETS_DIR);
      await newManager.loadTickets(projectId);

      // 新しいチケットを作成（シーケンス番号が継続されることを確認）
      const newTicket = await newManager.createParentTicket(projectId, '指示3');
      expect(newTicket.id).toBe('proj-001-0003');
    });
  });

  // ===========================================================================
  // ユーティリティテスト
  // ===========================================================================

  describe('getTicketType', () => {
    /**
     * 親チケットIDを正しく判定できることを確認
     */
    it('親チケットIDを正しく判定できる', () => {
      expect(ticketManager.getTicketType('proj-0001')).toBe('parent');
      expect(ticketManager.getTicketType('my-project-0001')).toBe('parent');
    });

    /**
     * 子チケットIDを正しく判定できることを確認
     */
    it('子チケットIDを正しく判定できる', () => {
      expect(ticketManager.getTicketType('proj-0001-01')).toBe('child');
      expect(ticketManager.getTicketType('my-project-0001-99')).toBe('child');
    });

    /**
     * 孫チケットIDを正しく判定できることを確認
     */
    it('孫チケットIDを正しく判定できる', () => {
      expect(ticketManager.getTicketType('proj-0001-01-001')).toBe('grandchild');
      expect(ticketManager.getTicketType('my-project-0001-01-999')).toBe('grandchild');
    });

    /**
     * 無効なIDはunknownを返すことを確認
     */
    it('無効なIDはunknownを返す', () => {
      expect(ticketManager.getTicketType('invalid')).toBe('unknown');
      expect(ticketManager.getTicketType('')).toBe('unknown');
    });
  });

  describe('clear', () => {
    /**
     * clearで全チケットがクリアされることを確認
     */
    it('clearで全チケットがクリアされる', async () => {
      await ticketManager.createParentTicket('proj-001', '指示1');
      await ticketManager.createParentTicket('proj-002', '指示2');

      ticketManager.clear();

      const proj001Tickets = await ticketManager.listParentTickets('proj-001');
      const proj002Tickets = await ticketManager.listParentTickets('proj-002');

      expect(proj001Tickets).toEqual([]);
      expect(proj002Tickets).toEqual([]);
    });

    /**
     * clear後に新しいチケットを作成するとシーケンスが1から始まることを確認
     */
    it('clear後に新しいチケットを作成するとシーケンスが1から始まる', async () => {
      await ticketManager.createParentTicket('proj-001', '指示1');
      await ticketManager.createParentTicket('proj-001', '指示2');

      ticketManager.clear();

      const newTicket = await ticketManager.createParentTicket('proj-001', '新しい指示');
      expect(newTicket.id).toBe('proj-001-0001');
    });
  });

  // ===========================================================================
  // 複雑なシナリオテスト
  // ===========================================================================

  describe('複雑なシナリオ', () => {
    /**
     * 完全な3階層構造を作成できることを確認
     */
    it('完全な3階層構造を作成できる', async () => {
      // 親チケット作成
      const parent = await ticketManager.createParentTicket('proj-001', '新機能を実装する');

      // 子チケット作成（複数）
      const child1 = await ticketManager.createChildTicket(parent.id, {
        title: '設計',
        description: 'アーキテクチャ設計',
        workerType: 'design',
      });
      const child2 = await ticketManager.createChildTicket(parent.id, {
        title: '実装',
        description: 'コード実装',
        workerType: 'developer',
      });
      const child3 = await ticketManager.createChildTicket(parent.id, {
        title: 'テスト',
        description: 'テスト作成',
        workerType: 'test',
      });

      // 孫チケット作成（各子チケットに複数）
      await ticketManager.createGrandchildTicket(child1.id, {
        title: 'API設計',
        description: '',
        acceptanceCriteria: ['RESTful API設計'],
      });
      await ticketManager.createGrandchildTicket(child1.id, {
        title: 'DB設計',
        description: '',
        acceptanceCriteria: ['ER図作成'],
      });

      await ticketManager.createGrandchildTicket(child2.id, {
        title: 'ログイン機能',
        description: '',
        acceptanceCriteria: ['認証処理'],
      });
      await ticketManager.createGrandchildTicket(child2.id, {
        title: 'ダッシュボード',
        description: '',
        acceptanceCriteria: ['画面表示'],
      });

      await ticketManager.createGrandchildTicket(child3.id, {
        title: 'ユニットテスト',
        description: '',
        acceptanceCriteria: ['カバレッジ80%'],
      });

      // 検証
      const retrievedParent = await ticketManager.getParentTicket(parent.id);
      expect(retrievedParent!.childTickets).toHaveLength(3);
      expect(retrievedParent!.childTickets[0].grandchildTickets).toHaveLength(2);
      expect(retrievedParent!.childTickets[1].grandchildTickets).toHaveLength(2);
      expect(retrievedParent!.childTickets[2].grandchildTickets).toHaveLength(1);

      // ID形式の検証
      expect(child1.id).toBe('proj-001-0001-01');
      expect(child2.id).toBe('proj-001-0001-02');
      expect(child3.id).toBe('proj-001-0001-03');
    });

    /**
     * 日本語を含むチケットが正しく処理されることを確認
     */
    it('日本語を含むチケットが正しく処理される', async () => {
      const parent = await ticketManager.createParentTicket(
        'proj-001',
        'ユーザー認証機能を実装してください。セキュリティに注意すること。'
      );
      const child = await ticketManager.createChildTicket(parent.id, {
        title: 'ログイン画面の実装',
        description: 'メールアドレスとパスワードによる認証',
        workerType: 'developer',
      });
      const grandchild = await ticketManager.createGrandchildTicket(child.id, {
        title: 'フォームバリデーション',
        description: '入力値の検証処理',
        acceptanceCriteria: [
          'メールアドレス形式チェック',
          'パスワード強度チェック',
          'エラーメッセージの日本語表示',
        ],
      });

      // 保存と読み込み
      await ticketManager.saveTickets('proj-001');
      const newManager = new TicketManager(TEST_TICKETS_DIR);
      await newManager.loadTickets('proj-001');

      // 検証
      const loadedGrandchild = await newManager.getGrandchildTicket(grandchild.id);
      expect(loadedGrandchild!.acceptanceCriteria).toContain('エラーメッセージの日本語表示');
    });
  });
});

// =============================================================================
// pauseTicket / resumeTicket テスト（Task 12.2）
// @see Requirements: 9.4, 9.5
// =============================================================================

describe('TicketManager - pauseTicket / resumeTicket', () => {
  let ticketManager: TicketManager;
  const TEST_TICKETS_DIR_PAUSE = 'runtime/test-tickets-pause';
  const TEST_RUNS_DIR_PAUSE = 'runtime/test-runs-pause';

  beforeEach(async () => {
    ticketManager = new TicketManager(TEST_TICKETS_DIR_PAUSE, TEST_RUNS_DIR_PAUSE);
    await fs.mkdir(TEST_TICKETS_DIR_PAUSE, { recursive: true });
    await fs.mkdir(TEST_RUNS_DIR_PAUSE, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_TICKETS_DIR_PAUSE, { recursive: true, force: true });
      await fs.rm(TEST_RUNS_DIR_PAUSE, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('pauseTicket', () => {
    /**
     * 親チケットを一時停止できることを確認
     * @see Requirement 9.4
     */
    it('親チケットを一時停止できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', 'テスト指示');
      await ticketManager.updateTicketStatus(parent.id, 'in_progress');

      const result = await ticketManager.pauseTicket(parent.id);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe(parent.id);
      expect(result.message).toContain('一時停止');
    });

    /**
     * ワーカー状態と会話履歴が保存されることを確認
     * @see Requirement 9.5
     */
    it('ワーカー状態と会話履歴が保存される', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', 'テスト指示');
      await ticketManager.updateTicketStatus(parent.id, 'in_progress');

      const workerStates = {
        'worker-001': {
          workerId: 'worker-001',
          workerType: 'developer' as const,
          status: 'working' as const,
          assignedTicketId: parent.id,
          lastActivity: new Date().toISOString(),
        },
      };

      const conversationHistories = {
        'agent-001': {
          runId: 'run-001',
          agentId: 'agent-001',
          messages: [
            {
              role: 'system' as const,
              content: 'You are a developer.',
              timestamp: new Date().toISOString(),
            },
          ],
          toolCalls: [],
          totalTokens: 100,
        },
      };

      const result = await ticketManager.pauseTicket(
        parent.id,
        'run-001',
        workerStates,
        conversationHistories
      );

      expect(result.success).toBe(true);
      expect(result.savedWorkerStates).toContain('worker-001');
      expect(result.savedConversationHistories).toContain('agent-001');
    });

    /**
     * 完了したチケットは一時停止できないことを確認
     * @see Requirement 9.4
     */
    it('完了したチケットは一時停止できない', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', 'テスト指示');
      await ticketManager.updateTicketStatus(parent.id, 'completed');

      const result = await ticketManager.pauseTicket(parent.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('completed');
    });

    /**
     * 失敗したチケットは一時停止できないことを確認
     * @see Requirement 9.4
     */
    it('失敗したチケットは一時停止できない', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', 'テスト指示');
      await ticketManager.updateTicketStatus(parent.id, 'failed');

      const result = await ticketManager.pauseTicket(parent.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });

    /**
     * 存在しないチケットでエラーが返されることを確認
     */
    it('存在しないチケットでエラーが返される', async () => {
      const result = await ticketManager.pauseTicket('proj-001-9999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('存在しません');
    });
  });

  describe('resumeTicket', () => {
    /**
     * 一時停止したチケットを再開できることを確認
     * @see Requirement 9.4
     */
    it('チケットを再開できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', 'テスト指示');
      await ticketManager.updateTicketStatus(parent.id, 'in_progress');

      // 一時停止
      await ticketManager.pauseTicket(parent.id, 'run-001', {}, {});

      // 再開
      const result = await ticketManager.resumeTicket(parent.id);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe(parent.id);
      expect(result.message).toContain('再開');
    });

    /**
     * 完了したチケットは再開できないことを確認
     * @see Requirement 9.4
     */
    it('完了したチケットは再開できない', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', 'テスト指示');
      await ticketManager.updateTicketStatus(parent.id, 'completed');

      const result = await ticketManager.resumeTicket(parent.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('completed');
    });

    /**
     * 存在しないチケットでエラーが返されることを確認
     */
    it('存在しないチケットでエラーが返される', async () => {
      const result = await ticketManager.resumeTicket('proj-001-9999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('存在しません');
    });
  });

  describe('getExecutionDataForTicket', () => {
    /**
     * チケットに関連する実行データを取得できることを確認
     */
    it('チケットに関連する実行データを取得できる', async () => {
      const parent = await ticketManager.createParentTicket('proj-001', 'テスト指示');
      await ticketManager.updateTicketStatus(parent.id, 'in_progress');

      // 一時停止して実行データを保存
      await ticketManager.pauseTicket(
        parent.id,
        'run-001',
        {
          'worker-001': {
            workerId: 'worker-001',
            workerType: 'developer' as const,
            status: 'working' as const,
            lastActivity: new Date().toISOString(),
          },
        },
        {}
      );

      // 実行データを取得
      const data = await ticketManager.getExecutionDataForTicket(parent.id);

      expect(data).not.toBeNull();
      expect(data!.ticketId).toBe(parent.id);
      expect(data!.runId).toBe('run-001');
      expect(data!.workerStates['worker-001']).toBeDefined();
    });

    /**
     * 実行データがない場合はnullを返すことを確認
     */
    it('実行データがない場合はnullを返す', async () => {
      const data = await ticketManager.getExecutionDataForTicket('non-existent-ticket');

      expect(data).toBeNull();
    });
  });
});
