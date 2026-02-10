/**
 * ticketコマンドのユニットテスト
 *
 * @module tests/cli/ticket-command
 * @see Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TicketManager } from '../../tools/cli/lib/execution/ticket-manager';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_BASE_DIR = 'runtime/test-ticket-command';
const TEST_TICKETS_DIR = path.join(TEST_BASE_DIR, 'tickets');
const TEST_RUNS_DIR = path.join(TEST_BASE_DIR, 'runs');

// =============================================================================
// テストセットアップ
// =============================================================================

describe('Ticket Command Tests', () => {
  let ticketManager: TicketManager;

  beforeEach(async () => {
    // テスト用ディレクトリを作成
    await fs.mkdir(TEST_TICKETS_DIR, { recursive: true });
    await fs.mkdir(TEST_RUNS_DIR, { recursive: true });

    // テスト用のTicketManagerインスタンスを作成
    ticketManager = new TicketManager(TEST_TICKETS_DIR, TEST_RUNS_DIR);
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // Requirement 12.1: ticket create
  // ===========================================================================

  describe('ticket create', () => {
    /**
     * @see Requirement 12.1: THE CLI SHALL support `agentcompany ticket create <project-id> <instruction>`
     */
    it('should create a parent ticket with valid project ID and instruction', async () => {
      const projectId = 'test-project';
      const instruction = 'Implement new feature X';

      const ticket = await ticketManager.createParentTicket(projectId, instruction);

      expect(ticket).toBeDefined();
      expect(ticket.id).toMatch(/^test-project-\d{4}$/);
      expect(ticket.projectId).toBe(projectId);
      expect(ticket.instruction).toBe(instruction);
      expect(ticket.status).toBe('pending');
      expect(ticket.childTickets).toEqual([]);
    });

    it('should throw error for empty project ID', async () => {
      await expect(ticketManager.createParentTicket('', 'Some instruction')).rejects.toThrow(
        'プロジェクトIDは必須です'
      );
    });

    it('should throw error for empty instruction', async () => {
      await expect(ticketManager.createParentTicket('test-project', '')).rejects.toThrow(
        '指示は必須です'
      );
    });

    it('should generate unique ticket IDs for multiple tickets', async () => {
      const projectId = 'test-project';

      const ticket1 = await ticketManager.createParentTicket(projectId, 'Instruction 1');
      const ticket2 = await ticketManager.createParentTicket(projectId, 'Instruction 2');
      const ticket3 = await ticketManager.createParentTicket(projectId, 'Instruction 3');

      expect(ticket1.id).not.toBe(ticket2.id);
      expect(ticket2.id).not.toBe(ticket3.id);
      expect(ticket1.id).not.toBe(ticket3.id);
    });
  });

  // ===========================================================================
  // Requirement 12.2: ticket list
  // ===========================================================================

  describe('ticket list', () => {
    /**
     * @see Requirement 12.2: THE CLI SHALL support `agentcompany ticket list <project-id>`
     */
    it('should list all tickets for a project', async () => {
      const projectId = 'test-project';

      await ticketManager.createParentTicket(projectId, 'Instruction 1');
      await ticketManager.createParentTicket(projectId, 'Instruction 2');

      const tickets = await ticketManager.listParentTickets(projectId);

      expect(tickets).toHaveLength(2);
    });

    it('should return empty array for project with no tickets', async () => {
      const tickets = await ticketManager.listParentTickets('empty-project');

      expect(tickets).toEqual([]);
    });

    it('should persist and load tickets correctly', async () => {
      const projectId = 'test-project';

      await ticketManager.createParentTicket(projectId, 'Instruction 1');
      await ticketManager.createParentTicket(projectId, 'Instruction 2');

      // 保存
      await ticketManager.saveTickets(projectId);

      // 新しいインスタンスで読み込み
      const newManager = new TicketManager(TEST_TICKETS_DIR, TEST_RUNS_DIR);
      await newManager.loadTickets(projectId);

      const tickets = await newManager.listParentTickets(projectId);

      expect(tickets).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Requirement 12.3: ticket status
  // ===========================================================================

  describe('ticket status', () => {
    /**
     * @see Requirement 12.3: THE CLI SHALL support `agentcompany ticket status <ticket-id>`
     */
    it('should get parent ticket by ID', async () => {
      const projectId = 'test-project';
      const created = await ticketManager.createParentTicket(projectId, 'Test instruction');

      const ticket = await ticketManager.getParentTicket(created.id);

      expect(ticket).toBeDefined();
      expect(ticket?.id).toBe(created.id);
      expect(ticket?.instruction).toBe('Test instruction');
    });

    it('should return null for non-existent ticket', async () => {
      const ticket = await ticketManager.getParentTicket('non-existent-0001');

      expect(ticket).toBeNull();
    });

    it('should get child ticket by ID', async () => {
      const projectId = 'test-project';
      const parent = await ticketManager.createParentTicket(projectId, 'Parent instruction');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: 'Child task',
        description: 'Child description',
        workerType: 'developer',
      });

      const retrieved = await ticketManager.getChildTicket(child.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(child.id);
      expect(retrieved?.title).toBe('Child task');
    });

    it('should get grandchild ticket by ID', async () => {
      const projectId = 'test-project';
      const parent = await ticketManager.createParentTicket(projectId, 'Parent instruction');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: 'Child task',
        description: 'Child description',
        workerType: 'developer',
      });
      const grandchild = await ticketManager.createGrandchildTicket(child.id, {
        title: 'Grandchild task',
        description: 'Grandchild description',
        acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
      });

      const retrieved = await ticketManager.getGrandchildTicket(grandchild.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(grandchild.id);
      expect(retrieved?.title).toBe('Grandchild task');
      expect(retrieved?.acceptanceCriteria).toEqual(['Criteria 1', 'Criteria 2']);
    });
  });

  // ===========================================================================
  // Requirement 12.4: ticket pause
  // ===========================================================================

  describe('ticket pause', () => {
    /**
     * @see Requirement 12.4: THE CLI SHALL support `agentcompany ticket pause <ticket-id>`
     */
    it('should pause a ticket in progress', async () => {
      const projectId = 'test-project';
      const ticket = await ticketManager.createParentTicket(projectId, 'Test instruction');

      // ステータスをin_progressに変更
      await ticketManager.updateTicketStatus(ticket.id, 'in_progress');

      const result = await ticketManager.pauseTicket(ticket.id);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe(ticket.id);
    });

    it('should not pause a completed ticket', async () => {
      const projectId = 'test-project';
      const ticket = await ticketManager.createParentTicket(projectId, 'Test instruction');

      // ステータスをcompletedに変更
      await ticketManager.updateTicketStatus(ticket.id, 'completed');

      const result = await ticketManager.pauseTicket(ticket.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('completed');
    });

    it('should return error for non-existent ticket', async () => {
      const result = await ticketManager.pauseTicket('non-existent-0001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('存在しません');
    });
  });

  // ===========================================================================
  // Requirement 12.5: ticket resume
  // ===========================================================================

  describe('ticket resume', () => {
    /**
     * @see Requirement 12.5: THE CLI SHALL support `agentcompany ticket resume <ticket-id>`
     */
    it('should resume a paused ticket', async () => {
      const projectId = 'test-project';
      const ticket = await ticketManager.createParentTicket(projectId, 'Test instruction');

      // ステータスをin_progressに変更
      await ticketManager.updateTicketStatus(ticket.id, 'in_progress');

      const result = await ticketManager.resumeTicket(ticket.id);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe(ticket.id);
    });

    it('should not resume a completed ticket', async () => {
      const projectId = 'test-project';
      const ticket = await ticketManager.createParentTicket(projectId, 'Test instruction');

      // ステータスをcompletedに変更
      await ticketManager.updateTicketStatus(ticket.id, 'completed');

      const result = await ticketManager.resumeTicket(ticket.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('completed');
    });

    it('should return error for non-existent ticket', async () => {
      const result = await ticketManager.resumeTicket('non-existent-0001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('存在しません');
    });
  });

  // ===========================================================================
  // Status Update Tests
  // ===========================================================================

  describe('status updates', () => {
    it('should update ticket status', async () => {
      const projectId = 'test-project';
      const ticket = await ticketManager.createParentTicket(projectId, 'Test instruction');

      await ticketManager.updateTicketStatus(ticket.id, 'in_progress');

      const updated = await ticketManager.getParentTicket(ticket.id);

      expect(updated?.status).toBe('in_progress');
    });

    it('should propagate status from grandchild to parent', async () => {
      const projectId = 'test-project';
      const parent = await ticketManager.createParentTicket(projectId, 'Parent instruction');
      const child = await ticketManager.createChildTicket(parent.id, {
        title: 'Child task',
        description: 'Child description',
        workerType: 'developer',
      });
      const grandchild = await ticketManager.createGrandchildTicket(child.id, {
        title: 'Grandchild task',
        description: 'Grandchild description',
        acceptanceCriteria: ['Criteria 1'],
      });

      // 孫チケットを完了
      await ticketManager.updateTicketStatus(grandchild.id, 'completed');

      // 子チケットと親チケットのステータスを確認
      const updatedChild = await ticketManager.getChildTicket(child.id);
      const updatedParent = await ticketManager.getParentTicket(parent.id);

      expect(updatedChild?.status).toBe('completed');
      expect(updatedParent?.status).toBe('completed');
    });

    it('should throw error for invalid status', async () => {
      const projectId = 'test-project';
      const ticket = await ticketManager.createParentTicket(projectId, 'Test instruction');

      await expect(
        ticketManager.updateTicketStatus(
          ticket.id,
          'invalid_status' as unknown as Parameters<typeof ticketManager.updateTicketStatus>[1]
        )
      ).rejects.toThrow('無効なステータス');
    });
  });
});
