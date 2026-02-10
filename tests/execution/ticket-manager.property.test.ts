/**
 * TicketManagerのプロパティテスト
 *
 * Property 3: Hierarchical Ticket ID Generation
 * Property 5: Status Propagation
 * Property 15: State Persistence Round-Trip
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.8, 9.1**
 *
 * @module tests/execution/ticket-manager.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TicketManager,
  TicketManagerError,
  ChildTicketData,
  GrandchildTicketData,
} from '../../tools/cli/lib/execution/ticket-manager.js';
import {
  TicketStatus,
  WorkerType,
  VALID_TICKET_STATUSES,
  VALID_WORKER_TYPES,
} from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * テスト用の一時ディレクトリを作成
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `ticket-manager-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * ディレクトリを再帰的に削除
 */
async function removeTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 有効なプロジェクトIDを生成するArbitrary
 */
const projectIdArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{2,19}$/)
  .filter((s) => s.length >= 3 && s.length <= 20 && !s.endsWith('-'));

/**
 * 非空文字列を生成するArbitrary
 */
const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/**
 * 指示文字列を生成するArbitrary
 */
const instructionArb = fc
  .string({ minLength: 1, maxLength: 500 })
  .filter((s) => s.trim().length > 0);

/**
 * 有効なWorkerTypeを生成するArbitrary
 */
const workerTypeArb: fc.Arbitrary<WorkerType> = fc.constantFrom(...VALID_WORKER_TYPES);

/**
 * 有効なTicketStatusを生成するArbitrary（将来の拡張用）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ticketStatusArb: fc.Arbitrary<TicketStatus> = fc.constantFrom(...VALID_TICKET_STATUSES);

/**
 * ChildTicketDataを生成するArbitrary
 */
const childTicketDataArb: fc.Arbitrary<ChildTicketData> = fc.record({
  title: nonEmptyStringArb,
  description: nonEmptyStringArb,
  workerType: workerTypeArb,
});

/**
 * GrandchildTicketDataを生成するArbitrary
 */
const grandchildTicketDataArb: fc.Arbitrary<GrandchildTicketData> = fc.record({
  title: nonEmptyStringArb,
  description: nonEmptyStringArb,
  acceptanceCriteria: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 }),
});

// =============================================================================
// プロパティテスト
// =============================================================================

describe('Feature: autonomous-agent-workflow, Property 3: Hierarchical Ticket ID Generation', () => {
  let tempDir: string;
  let manager: TicketManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    manager = new TicketManager(tempDir);
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  /**
   * Property 3.1: Parent Ticket ID Format
   * 親チケットIDは <project-id>-<sequence> 形式であること
   *
   * **Validates: Requirement 2.2**
   */
  it('Property 3.1: 親チケットIDは <project-id>-<sequence> 形式である', async () => {
    await fc.assert(
      fc.asyncProperty(projectIdArb, instructionArb, async (projectId, instruction) => {
        const ticket = await manager.createParentTicket(projectId, instruction);

        // ID形式の検証: <project-id>-<4桁の数字>
        const expectedPattern = new RegExp(`^${projectId}-\\d{4}$`);
        expect(ticket.id).toMatch(expectedPattern);

        // IDがプロジェクトIDで始まることを確認
        expect(ticket.id.startsWith(projectId + '-')).toBe(true);

        // キャッシュをクリアして次のテストに備える
        manager.clearCache();
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 3.2: Child Ticket ID Format
   * 子チケットIDは <parent-id>-<sequence> 形式であること
   *
   * **Validates: Requirement 2.3**
   */
  it('Property 3.2: 子チケットIDは <parent-id>-<sequence> 形式である', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        instructionArb,
        childTicketDataArb,
        async (projectId, instruction, childData) => {
          const parentTicket = await manager.createParentTicket(projectId, instruction);
          const childTicket = await manager.createChildTicket(parentTicket.id, childData);

          // ID形式の検証: <parent-id>-<2桁の数字>
          const expectedPattern = new RegExp(`^${parentTicket.id}-\\d{2}$`);
          expect(childTicket.id).toMatch(expectedPattern);

          // IDが親チケットIDで始まることを確認
          expect(childTicket.id.startsWith(parentTicket.id + '-')).toBe(true);

          // parentIdが正しいことを確認
          expect(childTicket.parentId).toBe(parentTicket.id);

          manager.clearCache();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 3.3: Grandchild Ticket ID Format
   * 孫チケットIDは <child-id>-<sequence> 形式であること
   *
   * **Validates: Requirement 2.4**
   */
  it('Property 3.3: 孫チケットIDは <child-id>-<sequence> 形式である', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        instructionArb,
        childTicketDataArb,
        grandchildTicketDataArb,
        async (projectId, instruction, childData, grandchildData) => {
          const parentTicket = await manager.createParentTicket(projectId, instruction);
          const childTicket = await manager.createChildTicket(parentTicket.id, childData);
          const grandchildTicket = await manager.createGrandchildTicket(
            childTicket.id,
            grandchildData
          );

          // ID形式の検証: <child-id>-<3桁の数字>
          const expectedPattern = new RegExp(`^${childTicket.id}-\\d{3}$`);
          expect(grandchildTicket.id).toMatch(expectedPattern);

          // IDが子チケットIDで始まることを確認
          expect(grandchildTicket.id.startsWith(childTicket.id + '-')).toBe(true);

          // parentIdが正しいことを確認
          expect(grandchildTicket.parentId).toBe(childTicket.id);

          manager.clearCache();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 3.4: Unique ID Generation
   * 同一プロジェクト内で生成されるIDは一意であること
   *
   * **Validates: Requirements 2.2, 2.3, 2.4**
   */
  it('Property 3.4: 同一プロジェクト内で生成されるIDは一意である', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        fc.array(instructionArb, { minLength: 2, maxLength: 5 }),
        async (projectId, instructions) => {
          const ids = new Set<string>();

          for (const instruction of instructions) {
            const ticket = await manager.createParentTicket(projectId, instruction);
            expect(ids.has(ticket.id)).toBe(false);
            ids.add(ticket.id);
          }

          manager.clearCache();
        }
      ),
      { numRuns: 30 }
    );
  });
});

describe('Feature: autonomous-agent-workflow, Property 5: Status Propagation', () => {
  let tempDir: string;
  let manager: TicketManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    manager = new TicketManager(tempDir);
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  /**
   * Property 5.1: All Children Completed → Parent Completed
   * 全ての子チケットが完了すると、親チケットも完了になること
   *
   * **Validates: Requirement 2.8**
   */
  it('Property 5.1: 全ての子チケットが完了すると親チケットも完了になる', async () => {
    const projectId = 'test-proj';
    const parentTicket = await manager.createParentTicket(projectId, 'Test instruction');

    // 複数の子チケットを作成
    const child1 = await manager.createChildTicket(parentTicket.id, {
      title: 'Child 1',
      description: 'Description 1',
      workerType: 'developer',
    });
    const child2 = await manager.createChildTicket(parentTicket.id, {
      title: 'Child 2',
      description: 'Description 2',
      workerType: 'test',
    });

    // 全ての子チケットを完了に
    await manager.updateTicketStatus(child1.id, 'completed');
    await manager.updateTicketStatus(child2.id, 'completed');

    // 親チケットのステータスを確認
    const updatedParent = await manager.getParentTicket(parentTicket.id);
    expect(updatedParent?.status).toBe('completed');
  });

  /**
   * Property 5.2: Any Child Failed → Parent Failed
   * いずれかの子チケットが失敗すると、親チケットも失敗になること
   *
   * **Validates: Requirement 2.8**
   */
  it('Property 5.2: いずれかの子チケットが失敗すると親チケットも失敗になる', async () => {
    const projectId = 'test-proj';
    const parentTicket = await manager.createParentTicket(projectId, 'Test instruction');

    const child1 = await manager.createChildTicket(parentTicket.id, {
      title: 'Child 1',
      description: 'Description 1',
      workerType: 'developer',
    });
    const child2 = await manager.createChildTicket(parentTicket.id, {
      title: 'Child 2',
      description: 'Description 2',
      workerType: 'test',
    });

    // 1つを完了、1つを失敗に
    await manager.updateTicketStatus(child1.id, 'completed');
    await manager.updateTicketStatus(child2.id, 'failed');

    // 親チケットのステータスを確認
    const updatedParent = await manager.getParentTicket(parentTicket.id);
    expect(updatedParent?.status).toBe('failed');
  });

  /**
   * Property 5.3: Grandchild Status Propagates to Child
   * 孫チケットのステータス変更が子チケットに伝播すること
   *
   * **Validates: Requirement 2.8**
   */
  it('Property 5.3: 孫チケットのステータス変更が子チケットに伝播する', async () => {
    const projectId = 'test-proj';
    const parentTicket = await manager.createParentTicket(projectId, 'Test instruction');
    const childTicket = await manager.createChildTicket(parentTicket.id, {
      title: 'Child',
      description: 'Description',
      workerType: 'developer',
    });

    // 複数の孫チケットを作成
    const grandchild1 = await manager.createGrandchildTicket(childTicket.id, {
      title: 'Grandchild 1',
      description: 'Description 1',
      acceptanceCriteria: ['Criteria 1'],
    });
    const grandchild2 = await manager.createGrandchildTicket(childTicket.id, {
      title: 'Grandchild 2',
      description: 'Description 2',
      acceptanceCriteria: ['Criteria 2'],
    });

    // 全ての孫チケットを完了に
    await manager.updateTicketStatus(grandchild1.id, 'completed');
    await manager.updateTicketStatus(grandchild2.id, 'completed');

    // 子チケットのステータスを確認
    const updatedChild = await manager.getChildTicket(childTicket.id);
    expect(updatedChild?.status).toBe('completed');

    // 親チケットのステータスも確認
    const updatedParent = await manager.getParentTicket(parentTicket.id);
    expect(updatedParent?.status).toBe('completed');
  });

  /**
   * Property 5.4: In Progress Status Propagation
   * 実行中のチケットがあると親も実行中になること
   *
   * **Validates: Requirement 2.8**
   */
  it('Property 5.4: 実行中のチケットがあると親も実行中になる', async () => {
    const projectId = 'test-proj';
    const parentTicket = await manager.createParentTicket(projectId, 'Test instruction');

    const child1 = await manager.createChildTicket(parentTicket.id, {
      title: 'Child 1',
      description: 'Description 1',
      workerType: 'developer',
    });
    await manager.createChildTicket(parentTicket.id, {
      title: 'Child 2',
      description: 'Description 2',
      workerType: 'test',
    });

    // 1つを実行中に
    await manager.updateTicketStatus(child1.id, 'in_progress');

    // 親チケットのステータスを確認
    const updatedParent = await manager.getParentTicket(parentTicket.id);
    expect(updatedParent?.status).toBe('in_progress');
  });
});

describe('Feature: autonomous-agent-workflow, Property 15: State Persistence Round-Trip', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  /**
   * Property 15.1: Save and Load Preserves Data
   * 保存と読み込みでデータが保持されること
   *
   * **Validates: Requirement 9.1**
   */
  it('Property 15.1: 保存と読み込みでデータが保持される', async () => {
    await fc.assert(
      fc.asyncProperty(projectIdArb, instructionArb, async (projectId, instruction) => {
        // 新しいマネージャーでチケットを作成
        const manager1 = new TicketManager(tempDir);
        const originalTicket = await manager1.createParentTicket(projectId, instruction);

        // 保存
        await manager1.saveTickets(projectId);

        // 新しいマネージャーで読み込み
        const manager2 = new TicketManager(tempDir);
        await manager2.loadTickets(projectId);

        // 読み込んだチケットを取得
        const loadedTicket = await manager2.getParentTicket(originalTicket.id);

        // データが保持されていることを確認
        expect(loadedTicket).not.toBeNull();
        expect(loadedTicket?.id).toBe(originalTicket.id);
        expect(loadedTicket?.projectId).toBe(originalTicket.projectId);
        expect(loadedTicket?.instruction).toBe(originalTicket.instruction);
        expect(loadedTicket?.status).toBe(originalTicket.status);
      }),
      { numRuns: 30 }
    );
  });

  /**
   * Property 15.2: Hierarchical Data Preserved
   * 階層構造が保存・読み込みで保持されること
   *
   * **Validates: Requirement 9.1**
   */
  it('Property 15.2: 階層構造が保存・読み込みで保持される', async () => {
    const projectId = 'test-proj';
    const manager1 = new TicketManager(tempDir);

    // 階層構造を作成
    const parentTicket = await manager1.createParentTicket(projectId, 'Test instruction');
    const childTicket = await manager1.createChildTicket(parentTicket.id, {
      title: 'Child',
      description: 'Description',
      workerType: 'developer',
    });
    const grandchildTicket = await manager1.createGrandchildTicket(childTicket.id, {
      title: 'Grandchild',
      description: 'Description',
      acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
    });

    // 保存
    await manager1.saveTickets(projectId);

    // 新しいマネージャーで読み込み
    const manager2 = new TicketManager(tempDir);
    await manager2.loadTickets(projectId);

    // 階層構造が保持されていることを確認
    const loadedParent = await manager2.getParentTicket(parentTicket.id);
    expect(loadedParent).not.toBeNull();
    expect(loadedParent?.childTickets.length).toBe(1);

    const loadedChild = loadedParent?.childTickets[0];
    expect(loadedChild?.id).toBe(childTicket.id);
    expect(loadedChild?.grandchildTickets.length).toBe(1);

    const loadedGrandchild = loadedChild?.grandchildTickets[0];
    expect(loadedGrandchild?.id).toBe(grandchildTicket.id);
    expect(loadedGrandchild?.acceptanceCriteria).toEqual(['Criteria 1', 'Criteria 2']);
  });

  /**
   * Property 15.3: Sequence Number Preserved
   * シーケンス番号が保存・読み込みで保持されること
   *
   * **Validates: Requirement 9.1**
   */
  it('Property 15.3: シーケンス番号が保存・読み込みで保持される', async () => {
    const projectId = 'test-proj';
    const manager1 = new TicketManager(tempDir);

    // 複数のチケットを作成
    await manager1.createParentTicket(projectId, 'Instruction 1');
    await manager1.createParentTicket(projectId, 'Instruction 2');
    await manager1.createParentTicket(projectId, 'Instruction 3');

    // 保存
    await manager1.saveTickets(projectId);

    // 新しいマネージャーで読み込み
    const manager2 = new TicketManager(tempDir);
    await manager2.loadTickets(projectId);

    // 新しいチケットを作成
    const newTicket = await manager2.createParentTicket(projectId, 'Instruction 4');

    // シーケンス番号が継続していることを確認
    expect(newTicket.id).toBe(`${projectId}-0004`);
  });
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('TicketManager Unit Tests', () => {
  let tempDir: string;
  let manager: TicketManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    manager = new TicketManager(tempDir);
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  /**
   * 空の指示でエラーが発生することを確認
   */
  it('空の指示でエラーが発生する', async () => {
    await expect(manager.createParentTicket('proj-001', '')).rejects.toThrow(TicketManagerError);
    await expect(manager.createParentTicket('proj-001', '   ')).rejects.toThrow(TicketManagerError);
  });

  /**
   * 空のプロジェクトIDでエラーが発生することを確認
   */
  it('空のプロジェクトIDでエラーが発生する', async () => {
    await expect(manager.createParentTicket('', 'Test instruction')).rejects.toThrow(
      TicketManagerError
    );
  });

  /**
   * 存在しない親チケットへの子チケット作成でエラーが発生することを確認
   */
  it('存在しない親チケットへの子チケット作成でエラーが発生する', async () => {
    await expect(
      manager.createChildTicket('nonexistent-0001', {
        title: 'Child',
        description: 'Description',
        workerType: 'developer',
      })
    ).rejects.toThrow(TicketManagerError);
  });

  /**
   * 無効なワーカータイプでエラーが発生することを確認
   */
  it('無効なワーカータイプでエラーが発生する', async () => {
    const parentTicket = await manager.createParentTicket('proj-001', 'Test instruction');

    await expect(
      manager.createChildTicket(parentTicket.id, {
        title: 'Child',
        description: 'Description',
        workerType: 'invalid' as WorkerType,
      })
    ).rejects.toThrow(TicketManagerError);
  });

  /**
   * 無効なステータスでエラーが発生することを確認
   */
  it('無効なステータスでエラーが発生する', async () => {
    const parentTicket = await manager.createParentTicket('proj-001', 'Test instruction');

    await expect(
      manager.updateTicketStatus(parentTicket.id, 'invalid' as TicketStatus)
    ).rejects.toThrow(TicketManagerError);
  });

  /**
   * 存在しないチケットのステータス更新でエラーが発生することを確認
   */
  it('存在しないチケットのステータス更新でエラーが発生する', async () => {
    await expect(manager.updateTicketStatus('nonexistent-0001', 'completed')).rejects.toThrow(
      TicketManagerError
    );
  });

  /**
   * 存在しないプロジェクトの読み込みで空のデータが返ることを確認
   */
  it('存在しないプロジェクトの読み込みで空のデータが返る', async () => {
    await manager.loadTickets('nonexistent-project');
    const tickets = await manager.listParentTickets('nonexistent-project');
    expect(tickets).toEqual([]);
  });

  /**
   * チケット取得のテスト
   */
  it('チケットを正しく取得できる', async () => {
    const parentTicket = await manager.createParentTicket('proj-001', 'Test instruction');
    const childTicket = await manager.createChildTicket(parentTicket.id, {
      title: 'Child',
      description: 'Description',
      workerType: 'developer',
    });
    const grandchildTicket = await manager.createGrandchildTicket(childTicket.id, {
      title: 'Grandchild',
      description: 'Description',
      acceptanceCriteria: ['Criteria'],
    });

    // 各レベルのチケットを取得
    const retrievedParent = await manager.getParentTicket(parentTicket.id);
    const retrievedChild = await manager.getChildTicket(childTicket.id);
    const retrievedGrandchild = await manager.getGrandchildTicket(grandchildTicket.id);

    expect(retrievedParent?.id).toBe(parentTicket.id);
    expect(retrievedChild?.id).toBe(childTicket.id);
    expect(retrievedGrandchild?.id).toBe(grandchildTicket.id);
  });

  /**
   * 存在しないチケットの取得でnullが返ることを確認
   */
  it('存在しないチケットの取得でnullが返る', async () => {
    expect(await manager.getParentTicket('nonexistent-0001')).toBeNull();
    expect(await manager.getChildTicket('nonexistent-0001-01')).toBeNull();
    expect(await manager.getGrandchildTicket('nonexistent-0001-01-001')).toBeNull();
  });
});
