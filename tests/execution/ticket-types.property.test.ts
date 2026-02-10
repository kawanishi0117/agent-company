/**
 * チケット階層構造のプロパティテスト
 *
 * Property 4: Ticket Structure Completeness
 * - 任意のチケット（Parent/Child/Grandchild）は必須フィールドをすべて含むこと
 * - 各レベルのチケットは適切な構造を持つこと
 *
 * **Validates: Requirements 2.5, 2.6, 2.7**
 *
 * @module tests/execution/ticket-types.property.test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ParentTicket,
  ChildTicket,
  GrandchildTicket,
  TicketStatus,
  WorkerType,
  ReviewResult,
  ReviewChecklist,
  ParentTicketMetadata,
  VALID_TICKET_STATUSES,
  VALID_WORKER_TYPES,
  PARENT_TICKET_REQUIRED_FIELDS,
  CHILD_TICKET_REQUIRED_FIELDS,
  GRANDCHILD_TICKET_REQUIRED_FIELDS,
} from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * ISO8601形式の日時文字列を生成するArbitrary
 */
const iso8601DateArb = fc.date().map((d) => d.toISOString());

/**
 * 有効なTicketStatusを生成するArbitrary
 */
const ticketStatusArb: fc.Arbitrary<TicketStatus> = fc.constantFrom(...VALID_TICKET_STATUSES);

/**
 * 有効なWorkerTypeを生成するArbitrary
 */
const workerTypeArb: fc.Arbitrary<WorkerType> = fc.constantFrom(...VALID_WORKER_TYPES);

/**
 * 非空文字列を生成するArbitrary
 */
const nonEmptyStringArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

/**
 * プロジェクトIDを生成するArbitrary
 */
const projectIdArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{2,19}$/)
  .filter((s) => s.length >= 3 && s.length <= 20);

/**
 * シーケンス番号を生成するArbitrary
 */
const sequenceArb = fc.integer({ min: 1, max: 9999 }).map((n) => n.toString().padStart(4, '0'));

/**
 * ReviewChecklistを生成するArbitrary
 */
const reviewChecklistArb: fc.Arbitrary<ReviewChecklist> = fc.record({
  codeQuality: fc.boolean(),
  testCoverage: fc.boolean(),
  acceptanceCriteria: fc.boolean(),
});

/**
 * ReviewResultを生成するArbitrary
 */
const reviewResultArb: fc.Arbitrary<ReviewResult> = fc.record({
  reviewerId: nonEmptyStringArb,
  approved: fc.boolean(),
  feedback: fc.option(fc.string(), { nil: undefined }),
  checklist: reviewChecklistArb,
  reviewedAt: iso8601DateArb,
});

/**
 * ParentTicketMetadataを生成するArbitrary
 */
const parentTicketMetadataArb: fc.Arbitrary<ParentTicketMetadata> = fc.record({
  priority: fc.constantFrom('low', 'medium', 'high'),
  deadline: fc.option(iso8601DateArb, { nil: undefined }),
  tags: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 }),
});

/**
 * GrandchildTicketを生成するArbitrary（再帰なし）
 */
const grandchildTicketArb: fc.Arbitrary<GrandchildTicket> = fc
  .tuple(projectIdArb, sequenceArb, sequenceArb, sequenceArb)
  .chain(([projId, seq1, seq2, seq3]) => {
    const parentId = `${projId}-${seq1}`;
    const childId = `${parentId}-${seq2}`;
    const grandchildId = `${childId}-${seq3}`;

    return fc.record({
      id: fc.constant(grandchildId),
      parentId: fc.constant(childId),
      title: nonEmptyStringArb,
      description: fc.string(),
      acceptanceCriteria: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 }),
      status: ticketStatusArb,
      assignee: fc.option(nonEmptyStringArb, { nil: undefined }),
      gitBranch: fc.option(nonEmptyStringArb, { nil: undefined }),
      artifacts: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 10 }),
      reviewResult: fc.option(reviewResultArb, { nil: undefined }),
      createdAt: iso8601DateArb,
      updatedAt: iso8601DateArb,
    });
  });

/**
 * ChildTicketを生成するArbitrary（孫チケットなし、将来の拡張用）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _childTicketWithoutGrandchildrenArb: fc.Arbitrary<ChildTicket> = fc
  .tuple(projectIdArb, sequenceArb, sequenceArb)
  .chain(([projId, seq1, seq2]) => {
    const parentId = `${projId}-${seq1}`;
    const childId = `${parentId}-${seq2}`;

    return fc.record({
      id: fc.constant(childId),
      parentId: fc.constant(parentId),
      title: nonEmptyStringArb,
      description: fc.string(),
      status: ticketStatusArb,
      workerType: workerTypeArb,
      createdAt: iso8601DateArb,
      updatedAt: iso8601DateArb,
      grandchildTickets: fc.constant([]),
    });
  });

/**
 * ChildTicketを生成するArbitrary（孫チケット含む）
 */
const childTicketArb: fc.Arbitrary<ChildTicket> = fc
  .tuple(projectIdArb, sequenceArb, sequenceArb)
  .chain(([projId, seq1, seq2]) => {
    const parentId = `${projId}-${seq1}`;
    const childId = `${parentId}-${seq2}`;

    // 孫チケットを生成（このchildIdを親として）
    const grandchildArb = fc
      .integer({ min: 1, max: 9999 })
      .map((n) => n.toString().padStart(4, '0'))
      .chain((seq3) => {
        const grandchildId = `${childId}-${seq3}`;
        return fc.record({
          id: fc.constant(grandchildId),
          parentId: fc.constant(childId),
          title: nonEmptyStringArb,
          description: fc.string(),
          acceptanceCriteria: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }),
          status: ticketStatusArb,
          assignee: fc.option(nonEmptyStringArb, { nil: undefined }),
          gitBranch: fc.option(nonEmptyStringArb, { nil: undefined }),
          artifacts: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 }),
          reviewResult: fc.option(reviewResultArb, { nil: undefined }),
          createdAt: iso8601DateArb,
          updatedAt: iso8601DateArb,
        });
      });

    return fc.record({
      id: fc.constant(childId),
      parentId: fc.constant(parentId),
      title: nonEmptyStringArb,
      description: fc.string(),
      status: ticketStatusArb,
      workerType: workerTypeArb,
      createdAt: iso8601DateArb,
      updatedAt: iso8601DateArb,
      grandchildTickets: fc.array(grandchildArb, { minLength: 0, maxLength: 3 }),
    });
  });

/**
 * ParentTicketを生成するArbitrary（子チケットなし、将来の拡張用）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _parentTicketWithoutChildrenArb: fc.Arbitrary<ParentTicket> = fc
  .tuple(projectIdArb, sequenceArb)
  .chain(([projId, seq]) => {
    const ticketId = `${projId}-${seq}`;

    return fc.record({
      id: fc.constant(ticketId),
      projectId: fc.constant(projId),
      instruction: nonEmptyStringArb,
      status: ticketStatusArb,
      createdAt: iso8601DateArb,
      updatedAt: iso8601DateArb,
      childTickets: fc.constant([]),
      metadata: parentTicketMetadataArb,
    });
  });

/**
 * ParentTicketを生成するArbitrary（子チケット含む）
 */
const parentTicketArb: fc.Arbitrary<ParentTicket> = fc
  .tuple(projectIdArb, sequenceArb)
  .chain(([projId, seq]) => {
    const ticketId = `${projId}-${seq}`;

    // 子チケットを生成（このticketIdを親として）
    const childArb = fc
      .integer({ min: 1, max: 9999 })
      .map((n) => n.toString().padStart(4, '0'))
      .chain((seq2) => {
        const childId = `${ticketId}-${seq2}`;
        return fc.record({
          id: fc.constant(childId),
          parentId: fc.constant(ticketId),
          title: nonEmptyStringArb,
          description: fc.string(),
          status: ticketStatusArb,
          workerType: workerTypeArb,
          createdAt: iso8601DateArb,
          updatedAt: iso8601DateArb,
          grandchildTickets: fc.constant([]),
        });
      });

    return fc.record({
      id: fc.constant(ticketId),
      projectId: fc.constant(projId),
      instruction: nonEmptyStringArb,
      status: ticketStatusArb,
      createdAt: iso8601DateArb,
      updatedAt: iso8601DateArb,
      childTickets: fc.array(childArb, { minLength: 0, maxLength: 3 }),
      metadata: parentTicketMetadataArb,
    });
  });

// =============================================================================
// プロパティテスト
// =============================================================================

describe('Feature: autonomous-agent-workflow, Property 4: Ticket Structure Completeness', () => {
  /**
   * Property 4.1: Parent Ticket Required Fields
   * 任意のParentTicketは必須フィールドをすべて含むこと
   *
   * **Validates: Requirement 2.5**
   * THE Parent_Ticket SHALL contain: id, projectId, instruction, status, createdAt, childTickets[]
   */
  it('Property 4.1: 任意のParentTicketは必須フィールドをすべて含む', () => {
    fc.assert(
      fc.property(parentTicketArb, (ticket) => {
        // 必須フィールドがすべて存在することを確認
        for (const field of PARENT_TICKET_REQUIRED_FIELDS) {
          expect(ticket).toHaveProperty(field);
          expect(ticket[field]).toBeDefined();
        }

        // 追加の構造検証
        expect(typeof ticket.id).toBe('string');
        expect(typeof ticket.projectId).toBe('string');
        expect(typeof ticket.instruction).toBe('string');
        expect(VALID_TICKET_STATUSES).toContain(ticket.status);
        expect(Array.isArray(ticket.childTickets)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.2: Child Ticket Required Fields
   * 任意のChildTicketは必須フィールドをすべて含むこと
   *
   * **Validates: Requirement 2.6**
   * THE Child_Ticket SHALL contain: id, parentId, title, description, status, workerType, grandchildTickets[]
   */
  it('Property 4.2: 任意のChildTicketは必須フィールドをすべて含む', () => {
    fc.assert(
      fc.property(childTicketArb, (ticket) => {
        // 必須フィールドがすべて存在することを確認
        for (const field of CHILD_TICKET_REQUIRED_FIELDS) {
          expect(ticket).toHaveProperty(field);
          expect(ticket[field]).toBeDefined();
        }

        // 追加の構造検証
        expect(typeof ticket.id).toBe('string');
        expect(typeof ticket.parentId).toBe('string');
        expect(typeof ticket.title).toBe('string');
        expect(typeof ticket.description).toBe('string');
        expect(VALID_TICKET_STATUSES).toContain(ticket.status);
        expect(VALID_WORKER_TYPES).toContain(ticket.workerType);
        expect(Array.isArray(ticket.grandchildTickets)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.3: Grandchild Ticket Required Fields
   * 任意のGrandchildTicketは必須フィールドをすべて含むこと
   *
   * **Validates: Requirement 2.7**
   * THE Grandchild_Ticket SHALL contain: id, parentId, title, description, acceptanceCriteria[], status, assignee, gitBranch, artifacts[]
   */
  it('Property 4.3: 任意のGrandchildTicketは必須フィールドをすべて含む', () => {
    fc.assert(
      fc.property(grandchildTicketArb, (ticket) => {
        // 必須フィールドがすべて存在することを確認
        for (const field of GRANDCHILD_TICKET_REQUIRED_FIELDS) {
          expect(ticket).toHaveProperty(field);
          expect(ticket[field]).toBeDefined();
        }

        // 追加の構造検証
        expect(typeof ticket.id).toBe('string');
        expect(typeof ticket.parentId).toBe('string');
        expect(typeof ticket.title).toBe('string');
        expect(typeof ticket.description).toBe('string');
        expect(Array.isArray(ticket.acceptanceCriteria)).toBe(true);
        expect(VALID_TICKET_STATUSES).toContain(ticket.status);
        expect(Array.isArray(ticket.artifacts)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.4: JSON Serialization Round-Trip
   * 任意のチケットはJSON変換後も構造が保持されること
   *
   * **Validates: Requirements 2.5, 2.6, 2.7**
   */
  it('Property 4.4: 任意のParentTicketはJSON変換後も構造が保持される', () => {
    fc.assert(
      fc.property(parentTicketArb, (ticket) => {
        // JSONにシリアライズしてパース
        const jsonString = JSON.stringify(ticket);
        const parsed = JSON.parse(jsonString) as ParentTicket;

        // 必須フィールドがすべて保持されていることを確認
        for (const field of PARENT_TICKET_REQUIRED_FIELDS) {
          expect(parsed).toHaveProperty(field);
        }

        // 値が同一であることを確認
        expect(parsed).toEqual(ticket);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.5: Ticket Status Validity
   * 任意のチケットのstatusは有効な値のいずれかであること
   *
   * **Validates: Requirements 2.5, 2.6, 2.7**
   */
  it('Property 4.5: 任意のチケットのstatusは有効な値のいずれかである', () => {
    fc.assert(
      fc.property(fc.oneof(parentTicketArb, childTicketArb, grandchildTicketArb), (ticket) => {
        expect(VALID_TICKET_STATUSES).toContain(ticket.status);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.6: Worker Type Validity
   * 任意のChildTicketのworkerTypeは有効な値のいずれかであること
   *
   * **Validates: Requirement 2.6**
   */
  it('Property 4.6: 任意のChildTicketのworkerTypeは有効な値のいずれかである', () => {
    fc.assert(
      fc.property(childTicketArb, (ticket) => {
        expect(VALID_WORKER_TYPES).toContain(ticket.workerType);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.7: Nested Structure Integrity
   * 親チケットの子チケット、子チケットの孫チケットも有効な構造を持つこと
   *
   * **Validates: Requirements 2.5, 2.6, 2.7**
   */
  it('Property 4.7: ネストされたチケット構造も有効である', () => {
    fc.assert(
      fc.property(parentTicketArb, (parentTicket) => {
        // 親チケットの検証
        expect(Array.isArray(parentTicket.childTickets)).toBe(true);

        // 各子チケットの検証
        for (const childTicket of parentTicket.childTickets) {
          for (const field of CHILD_TICKET_REQUIRED_FIELDS) {
            expect(childTicket).toHaveProperty(field);
          }
          expect(VALID_WORKER_TYPES).toContain(childTicket.workerType);
          expect(Array.isArray(childTicket.grandchildTickets)).toBe(true);

          // 各孫チケットの検証
          for (const grandchildTicket of childTicket.grandchildTickets) {
            for (const field of GRANDCHILD_TICKET_REQUIRED_FIELDS) {
              expect(grandchildTicket).toHaveProperty(field);
            }
            expect(Array.isArray(grandchildTicket.acceptanceCriteria)).toBe(true);
            expect(Array.isArray(grandchildTicket.artifacts)).toBe(true);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('Ticket Types Unit Tests', () => {
  /**
   * 空の子チケット配列を持つParentTicketが有効であることを確認
   */
  it('空の子チケット配列を持つParentTicketは有効', () => {
    const ticket: ParentTicket = {
      id: 'proj-001-0001',
      projectId: 'proj-001',
      instruction: 'テスト指示',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      childTickets: [],
      metadata: {
        priority: 'medium',
        tags: [],
      },
    };

    // 必須フィールドがすべて存在することを確認
    for (const field of PARENT_TICKET_REQUIRED_FIELDS) {
      expect(ticket).toHaveProperty(field);
    }
  });

  /**
   * 全てのステータス値が有効であることを確認
   */
  it('全てのTicketStatus値が有効である', () => {
    const expectedStatuses: TicketStatus[] = [
      'pending',
      'decomposing',
      'in_progress',
      'review_requested',
      'revision_required',
      'completed',
      'failed',
      'pr_created',
    ];

    expect(VALID_TICKET_STATUSES).toEqual(expectedStatuses);
  });

  /**
   * 全てのワーカータイプ値が有効であることを確認
   */
  it('全てのWorkerType値が有効である', () => {
    const expectedTypes: WorkerType[] = [
      'research',
      'design',
      'designer',
      'developer',
      'test',
      'reviewer',
    ];

    expect(VALID_WORKER_TYPES).toEqual(expectedTypes);
  });

  /**
   * 特殊文字を含むフィールドが正しく処理されることを確認
   */
  it('特殊文字を含むフィールドが正しく処理される', () => {
    const ticket: ParentTicket = {
      id: 'proj-001-0001',
      projectId: 'proj-001',
      instruction: '日本語の指示 with "quotes" and \\backslash',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      childTickets: [],
      metadata: {
        priority: 'high',
        tags: ['タグ1', 'tag-2', 'émoji-🚀'],
      },
    };

    // JSONシリアライズとパースが成功することを確認
    const jsonString = JSON.stringify(ticket);
    const parsed = JSON.parse(jsonString) as ParentTicket;

    expect(parsed.instruction).toBe('日本語の指示 with "quotes" and \\backslash');
    expect(parsed.metadata.tags).toContain('émoji-🚀');
  });

  /**
   * ReviewResultを持つGrandchildTicketが有効であることを確認
   */
  it('ReviewResultを持つGrandchildTicketは有効', () => {
    const ticket: GrandchildTicket = {
      id: 'proj-001-0001-01-001',
      parentId: 'proj-001-0001-01',
      title: 'テストタスク',
      description: 'テスト説明',
      acceptanceCriteria: ['基準1', '基準2'],
      status: 'completed',
      assignee: 'worker-001',
      gitBranch: 'agent/proj-001-0001-01-001-feature',
      artifacts: ['src/file.ts'],
      reviewResult: {
        reviewerId: 'reviewer-001',
        approved: true,
        feedback: 'LGTM',
        checklist: {
          codeQuality: true,
          testCoverage: true,
          acceptanceCriteria: true,
        },
        reviewedAt: '2024-01-01T01:00:00.000Z',
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T01:00:00.000Z',
    };

    // 必須フィールドがすべて存在することを確認
    for (const field of GRANDCHILD_TICKET_REQUIRED_FIELDS) {
      expect(ticket).toHaveProperty(field);
    }

    // ReviewResultの構造を確認
    expect(ticket.reviewResult).toBeDefined();
    expect(ticket.reviewResult?.approved).toBe(true);
    expect(ticket.reviewResult?.checklist.codeQuality).toBe(true);
  });
});
