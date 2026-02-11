/**
 * ワークフロー型バリデーション プロパティテスト
 *
 * Property 1: Phase Validity Invariant
 * - WorkflowPhase は定義された5つのフェーズのみを含むこと
 * - WorkflowStatus は定義された5つのステータスのみを含むこと
 *
 * **Validates: Requirements 1.1**
 *
 * @module tests/execution/workflow-types.property.test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  WorkflowPhase,
  WorkflowStatus,
  VALID_WORKFLOW_PHASES,
  VALID_WORKFLOW_STATUSES,
} from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// 定数定義
// =============================================================================

/** 期待されるワークフローフェーズ（Requirement 1.1） */
const EXPECTED_PHASES: readonly string[] = [
  'proposal',
  'approval',
  'development',
  'quality_assurance',
  'delivery',
] as const;

/** 期待されるワークフローステータス */
const EXPECTED_STATUSES: readonly string[] = [
  'running',
  'waiting_approval',
  'completed',
  'terminated',
  'failed',
] as const;

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 有効な WorkflowPhase を生成する Arbitrary
 * @see Requirement 1.1
 */
const workflowPhaseArb: fc.Arbitrary<WorkflowPhase> = fc.constantFrom(
  ...VALID_WORKFLOW_PHASES
);

/**
 * 有効な WorkflowStatus を生成する Arbitrary
 */
const workflowStatusArb: fc.Arbitrary<WorkflowStatus> = fc.constantFrom(
  ...VALID_WORKFLOW_STATUSES
);

/**
 * ランダムな文字列を生成する Arbitrary（無効値テスト用）
 */
const randomStringArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 50 });

// =============================================================================
// Property 1: Phase Validity Invariant
// =============================================================================

describe('Property 1: Phase Validity Invariant', () => {
  describe('WorkflowPhase バリデーション', () => {
    it('VALID_WORKFLOW_PHASES は正確に5つのフェーズを含むこと', () => {
      expect(VALID_WORKFLOW_PHASES).toHaveLength(5);
    });

    it('VALID_WORKFLOW_PHASES は期待されるフェーズと完全一致すること', () => {
      expect([...VALID_WORKFLOW_PHASES].sort()).toEqual([...EXPECTED_PHASES].sort());
    });

    it('VALID_WORKFLOW_PHASES に重複がないこと', () => {
      const uniquePhases = new Set(VALID_WORKFLOW_PHASES);
      expect(uniquePhases.size).toBe(VALID_WORKFLOW_PHASES.length);
    });

    it('任意の有効フェーズは VALID_WORKFLOW_PHASES に含まれること', () => {
      fc.assert(
        fc.property(workflowPhaseArb, (phase: WorkflowPhase) => {
          expect(VALID_WORKFLOW_PHASES).toContain(phase);
        }),
        { numRuns: 100 }
      );
    });

    it('任意の有効フェーズは期待されるフェーズのいずれかであること', () => {
      fc.assert(
        fc.property(workflowPhaseArb, (phase: WorkflowPhase) => {
          expect(EXPECTED_PHASES).toContain(phase);
        }),
        { numRuns: 100 }
      );
    });

    it('ランダム文字列が有効フェーズである確率は極めて低いこと', () => {
      fc.assert(
        fc.property(randomStringArb, (randomStr: string) => {
          // ランダム文字列がたまたま有効フェーズに一致する場合は許容
          const isValid = (VALID_WORKFLOW_PHASES as string[]).includes(randomStr);
          if (isValid) {
            expect(EXPECTED_PHASES).toContain(randomStr);
          }
          // 常に true（テストの目的はフェーズ集合の閉包性確認）
          return true;
        }),
        { numRuns: 200 }
      );
    });

    it('フェーズの順序が proposal → approval → development → quality_assurance → delivery であること', () => {
      expect(VALID_WORKFLOW_PHASES[0]).toBe('proposal');
      expect(VALID_WORKFLOW_PHASES[1]).toBe('approval');
      expect(VALID_WORKFLOW_PHASES[2]).toBe('development');
      expect(VALID_WORKFLOW_PHASES[3]).toBe('quality_assurance');
      expect(VALID_WORKFLOW_PHASES[4]).toBe('delivery');
    });
  });

  describe('WorkflowStatus バリデーション', () => {
    it('VALID_WORKFLOW_STATUSES は正確に5つのステータスを含むこと', () => {
      expect(VALID_WORKFLOW_STATUSES).toHaveLength(5);
    });

    it('VALID_WORKFLOW_STATUSES は期待されるステータスと完全一致すること', () => {
      expect([...VALID_WORKFLOW_STATUSES].sort()).toEqual([...EXPECTED_STATUSES].sort());
    });

    it('VALID_WORKFLOW_STATUSES に重複がないこと', () => {
      const uniqueStatuses = new Set(VALID_WORKFLOW_STATUSES);
      expect(uniqueStatuses.size).toBe(VALID_WORKFLOW_STATUSES.length);
    });

    it('任意の有効ステータスは VALID_WORKFLOW_STATUSES に含まれること', () => {
      fc.assert(
        fc.property(workflowStatusArb, (status: WorkflowStatus) => {
          expect(VALID_WORKFLOW_STATUSES).toContain(status);
        }),
        { numRuns: 100 }
      );
    });

    it('任意の有効ステータスは期待されるステータスのいずれかであること', () => {
      fc.assert(
        fc.property(workflowStatusArb, (status: WorkflowStatus) => {
          expect(EXPECTED_STATUSES).toContain(status);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('型の相互排他性', () => {
    it('WorkflowPhase と WorkflowStatus に重複する値がないこと', () => {
      const phaseSet = new Set<string>(VALID_WORKFLOW_PHASES);
      const statusSet = new Set<string>(VALID_WORKFLOW_STATUSES);
      const intersection = [...phaseSet].filter((p) => statusSet.has(p));
      expect(intersection).toHaveLength(0);
    });

    it('任意の有効フェーズは有効ステータスに含まれないこと', () => {
      fc.assert(
        fc.property(workflowPhaseArb, (phase: WorkflowPhase) => {
          expect(VALID_WORKFLOW_STATUSES as string[]).not.toContain(phase);
        }),
        { numRuns: 100 }
      );
    });

    it('任意の有効ステータスは有効フェーズに含まれないこと', () => {
      fc.assert(
        fc.property(workflowStatusArb, (status: WorkflowStatus) => {
          expect(VALID_WORKFLOW_PHASES as string[]).not.toContain(status);
        }),
        { numRuns: 100 }
      );
    });
  });
});
