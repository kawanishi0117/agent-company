/**
 * ApprovalGate プロパティテスト
 *
 * Property 9: Approval Decision Phase Transitions
 *   - 3つのCEOアクション（approve, request_revision, reject）の受付と永続化を検証
 *   - フィードバックの保持を検証
 *
 * Property 10: Worker Pause During Approval Wait
 *   - requestApprovalがsubmitDecisionまでPromiseをブロックすることを検証
 *   - 承認待ち中のワーカー実行一時停止を検証
 *
 * @module tests/execution/approval-gate.property.test
 * @see Requirements: 3.3, 3.4, 3.5, 3.7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import {
  ApprovalGate,
  createApprovalGate,
} from '../../tools/cli/lib/execution/approval-gate.js';
import type {
  ApprovalAction,
  ApprovalDecision,
  WorkflowPhase,
  Proposal,
  ProposalTask,
  ProposalWorkerAssignment,
} from '../../tools/cli/lib/execution/types.js';
import { VALID_APPROVAL_ACTIONS } from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// テスト用定数
// =============================================================================

/** テスト用承認データ保存パス */
const TEST_RUNS_PATH = 'runtime/test-approval-prop-runs';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * ユニークなワークフローIDを生成する Arbitrary
 */
const workflowIdArb: fc.Arbitrary<string> = fc.stringMatching(
  /^wf-prop-[a-z0-9]{6}$/
);

/**
 * 承認アクションを生成する Arbitrary
 */
const approvalActionArb: fc.Arbitrary<ApprovalAction> = fc.constantFrom(
  'approve',
  'request_revision',
  'reject'
);

/**
 * フィードバック文字列を生成する Arbitrary（空文字列を含まない）
 */
const feedbackArb: fc.Arbitrary<string> = fc.constantFrom(
  '問題なし、承認します',
  'スコープを縮小してください',
  'テストカバレッジが不足しています',
  'セキュリティ要件を再確認してください',
  'リスク評価が不十分です',
  'ワーカー割り当てを見直してください',
  '依存関係の整理が必要です',
  'パフォーマンス要件を追加してください',
  '却下：予算超過のため',
  '修正後に再提出してください'
);

/**
 * 承認対象フェーズを生成する Arbitrary
 * ApprovalGateが使用されるフェーズ: approval（提案承認）, delivery（納品承認）
 */
const approvalPhaseArb: fc.Arbitrary<WorkflowPhase> = fc.constantFrom(
  'approval' as WorkflowPhase,
  'delivery' as WorkflowPhase
);

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * ディレクトリを再帰的に削除
 * @param dirPath - 削除対象ディレクトリパス
 */
async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

/**
 * テスト用Proposalを生成する
 * @param workflowId - ワークフローID
 * @returns テスト用Proposal
 */
function createTestProposal(workflowId: string): Proposal {
  const task: ProposalTask = {
    id: `task-${workflowId}-001`,
    title: 'テストタスク',
    description: 'テスト用のタスク説明',
    workerType: 'developer',
    estimatedEffort: '2日',
    dependencies: [],
  };

  const assignment: ProposalWorkerAssignment = {
    taskId: task.id,
    workerType: 'developer',
    rationale: 'コード実装が必要なため',
  };

  return {
    workflowId,
    summary: `ワークフロー ${workflowId} の提案書`,
    scope: 'テスト用スコープ',
    taskBreakdown: [task],
    workerAssignments: [assignment],
    riskAssessment: [
      {
        description: 'テスト用リスク',
        severity: 'low',
        mitigation: 'テスト用対策',
      },
    ],
    dependencies: [],
    meetingMinutesIds: [`meeting-${workflowId}-001`],
    createdAt: new Date().toISOString(),
  };
}

/**
 * テスト用ApprovalDecisionを生成する
 * @param workflowId - ワークフローID
 * @param phase - 承認対象フェーズ
 * @param action - 承認アクション
 * @param feedback - フィードバック（オプション）
 * @returns テスト用ApprovalDecision
 */
function createTestDecision(
  workflowId: string,
  phase: WorkflowPhase,
  action: ApprovalAction,
  feedback?: string
): ApprovalDecision {
  return {
    workflowId,
    phase,
    action,
    feedback,
    decidedAt: new Date().toISOString(),
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('ApprovalGate Property Tests', () => {
  let approvalGate: ApprovalGate;

  beforeEach(async () => {
    await cleanupDirectory(TEST_RUNS_PATH);
    approvalGate = createApprovalGate(TEST_RUNS_PATH);
  });

  afterEach(async () => {
    await cleanupDirectory(TEST_RUNS_PATH);
  });

  // ===========================================================================
  // Property 9: Approval Decision Phase Transitions
  // **Validates: Requirements 3.3, 3.4, 3.5**
  // ===========================================================================

  describe('Property 9: Approval Decision Phase Transitions', () => {
    it('任意のapproveアクションに対して、決定が正しく受け付けられ永続化されること (Req 3.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowIdArb,
          approvalPhaseArb,
          feedbackArb,
          async (
            workflowId: string,
            phase: WorkflowPhase,
            feedback: string
          ) => {
            const gate = createApprovalGate(TEST_RUNS_PATH);
            const proposal = createTestProposal(workflowId);

            // 承認要求を開始（非同期でブロック）
            const approvalPromise = gate.requestApproval(
              workflowId,
              phase,
              proposal
            );

            // 承認待ち状態であることを確認
            expect(gate.isWaitingApproval(workflowId)).toBe(true);

            // approve決定を送信
            const decision = createTestDecision(
              workflowId,
              phase,
              'approve',
              feedback
            );
            await gate.submitDecision(workflowId, decision);

            // requestApprovalのPromiseが解決されること
            const result = await approvalPromise;

            // 決定内容の検証
            expect(result.action).toBe('approve');
            expect(result.workflowId).toBe(workflowId);
            expect(result.phase).toBe(phase);
            expect(result.feedback).toBe(feedback);

            // 承認待ち状態が解除されていること
            expect(gate.isWaitingApproval(workflowId)).toBe(false);

            // 承認履歴に記録されていること
            const history = gate.getApprovalHistory(workflowId);
            expect(history.length).toBe(1);
            expect(history[0].action).toBe('approve');

            // 永続化データを読み込んで検証
            const loaded = await gate.loadApprovals(workflowId);
            expect(loaded).not.toBeNull();
            expect(loaded!.decisions.length).toBe(1);
            expect(loaded!.decisions[0].action).toBe('approve');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('任意のrequest_revisionアクションに対して、フィードバックが保持されること (Req 3.4)', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowIdArb,
          approvalPhaseArb,
          feedbackArb,
          async (
            workflowId: string,
            phase: WorkflowPhase,
            feedback: string
          ) => {
            const gate = createApprovalGate(TEST_RUNS_PATH);
            const proposal = createTestProposal(workflowId);

            // 承認要求を開始
            const approvalPromise = gate.requestApproval(
              workflowId,
              phase,
              proposal
            );

            // request_revision決定を送信（フィードバック付き）
            const decision = createTestDecision(
              workflowId,
              phase,
              'request_revision',
              feedback
            );
            await gate.submitDecision(workflowId, decision);

            // requestApprovalのPromiseが解決されること
            const result = await approvalPromise;

            // 決定内容の検証
            expect(result.action).toBe('request_revision');
            expect(result.workflowId).toBe(workflowId);
            expect(result.phase).toBe(phase);

            // フィードバックが保持されていること（重要）
            expect(result.feedback).toBe(feedback);
            expect(result.feedback).toBeTruthy();

            // 承認履歴にフィードバックが記録されていること
            const history = gate.getApprovalHistory(workflowId);
            expect(history.length).toBe(1);
            expect(history[0].action).toBe('request_revision');
            expect(history[0].feedback).toBe(feedback);

            // 永続化データにもフィードバックが保持されていること
            const loaded = await gate.loadApprovals(workflowId);
            expect(loaded).not.toBeNull();
            expect(loaded!.decisions[0].feedback).toBe(feedback);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('任意のrejectアクションに対して、却下理由が記録されること (Req 3.5)', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowIdArb,
          approvalPhaseArb,
          feedbackArb,
          async (
            workflowId: string,
            phase: WorkflowPhase,
            feedback: string
          ) => {
            const gate = createApprovalGate(TEST_RUNS_PATH);
            const proposal = createTestProposal(workflowId);

            // 承認要求を開始
            const approvalPromise = gate.requestApproval(
              workflowId,
              phase,
              proposal
            );

            // reject決定を送信（却下理由付き）
            const decision = createTestDecision(
              workflowId,
              phase,
              'reject',
              feedback
            );
            await gate.submitDecision(workflowId, decision);

            // requestApprovalのPromiseが解決されること
            const result = await approvalPromise;

            // 決定内容の検証
            expect(result.action).toBe('reject');
            expect(result.workflowId).toBe(workflowId);
            expect(result.phase).toBe(phase);

            // 却下理由が記録されていること
            expect(result.feedback).toBe(feedback);

            // 承認履歴に却下が記録されていること
            const history = gate.getApprovalHistory(workflowId);
            expect(history.length).toBe(1);
            expect(history[0].action).toBe('reject');
            expect(history[0].feedback).toBe(feedback);

            // 永続化データにも却下理由が保持されていること
            const loaded = await gate.loadApprovals(workflowId);
            expect(loaded).not.toBeNull();
            expect(loaded!.decisions[0].action).toBe('reject');
            expect(loaded!.decisions[0].feedback).toBe(feedback);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('任意の承認アクションが3つの有効なアクションのいずれかであること', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowIdArb,
          approvalPhaseArb,
          approvalActionArb,
          feedbackArb,
          async (
            workflowId: string,
            phase: WorkflowPhase,
            action: ApprovalAction,
            feedback: string
          ) => {
            const gate = createApprovalGate(TEST_RUNS_PATH);
            const proposal = createTestProposal(workflowId);

            // 承認要求を開始
            const approvalPromise = gate.requestApproval(
              workflowId,
              phase,
              proposal
            );

            // 任意のアクションで決定を送信
            const decision = createTestDecision(
              workflowId,
              phase,
              action,
              feedback
            );
            await gate.submitDecision(workflowId, decision);

            const result = await approvalPromise;

            // アクションが有効な値であること
            expect(VALID_APPROVAL_ACTIONS).toContain(result.action);
            expect(result.action).toBe(action);

            // decidedAtがISO8601形式であること
            expect(result.decidedAt).toBeTruthy();
            expect(new Date(result.decidedAt).toISOString()).toBeTruthy();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 10: Worker Pause During Approval Wait
  // **Validates: Requirement 3.7**
  // ===========================================================================

  describe('Property 10: Worker Pause During Approval Wait', () => {
    it('承認待ち中はrequestApprovalのPromiseが未解決のままブロックされること (Req 3.7)', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowIdArb,
          approvalPhaseArb,
          async (workflowId: string, phase: WorkflowPhase) => {
            const gate = createApprovalGate(TEST_RUNS_PATH);
            const proposal = createTestProposal(workflowId);

            // ワーカー実行状態を追跡するフラグ
            let workerResumed = false;

            // 承認要求を開始（ワーカーの実行をシミュレート）
            // requestApprovalはsubmitDecisionまでブロックするため、
            // .then()内のコードはsubmitDecision後にのみ実行される
            const approvalPromise = gate
              .requestApproval(workflowId, phase, proposal)
              .then((decision) => {
                // submitDecision後にのみ到達する
                workerResumed = true;
                return decision;
              });

            // 承認待ち中: ワーカーはまだ再開していないこと
            expect(workerResumed).toBe(false);
            expect(gate.isWaitingApproval(workflowId)).toBe(true);

            // 承認待ちアイテムが存在すること
            const pending = gate.getPendingApprovals();
            expect(pending.length).toBeGreaterThanOrEqual(1);
            const found = pending.find((p) => p.workflowId === workflowId);
            expect(found).toBeDefined();
            expect(found!.phase).toBe(phase);

            // マイクロタスクを処理してもワーカーは再開しないこと
            await Promise.resolve();
            expect(workerResumed).toBe(false);

            // CEO決定を送信
            const decision = createTestDecision(
              workflowId,
              phase,
              'approve',
              '承認します'
            );
            await gate.submitDecision(workflowId, decision);

            // submitDecision後にPromiseが解決されるのを待つ
            await approvalPromise;

            // ワーカーが再開していること
            expect(workerResumed).toBe(true);

            // 承認待ち状態が解除されていること
            expect(gate.isWaitingApproval(workflowId)).toBe(false);
            expect(gate.getPendingApprovals().find(
              (p) => p.workflowId === workflowId
            )).toBeUndefined();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('複数ワークフローが同時に承認待ちの場合、各々が独立してブロックされること', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 2つの異なるワークフローIDを生成
          workflowIdArb,
          workflowIdArb,
          approvalPhaseArb,
          async (
            workflowId1: string,
            workflowId2: string,
            phase: WorkflowPhase
          ) => {
            // 同一IDの場合はスキップ
            if (workflowId1 === workflowId2) return;

            const gate = createApprovalGate(TEST_RUNS_PATH);
            const proposal1 = createTestProposal(workflowId1);
            const proposal2 = createTestProposal(workflowId2);

            let worker1Resumed = false;
            let worker2Resumed = false;

            // 2つのワークフローで承認要求を開始
            const promise1 = gate
              .requestApproval(workflowId1, phase, proposal1)
              .then((d) => {
                worker1Resumed = true;
                return d;
              });

            const promise2 = gate
              .requestApproval(workflowId2, phase, proposal2)
              .then((d) => {
                worker2Resumed = true;
                return d;
              });

            // 両方とも承認待ち中
            expect(gate.isWaitingApproval(workflowId1)).toBe(true);
            expect(gate.isWaitingApproval(workflowId2)).toBe(true);
            expect(worker1Resumed).toBe(false);
            expect(worker2Resumed).toBe(false);

            // ワークフロー1のみ承認
            const decision1 = createTestDecision(
              workflowId1,
              phase,
              'approve',
              '承認'
            );
            await gate.submitDecision(workflowId1, decision1);
            await promise1;

            // ワークフロー1のみ再開、ワークフロー2はまだブロック中
            expect(worker1Resumed).toBe(true);
            expect(worker2Resumed).toBe(false);
            expect(gate.isWaitingApproval(workflowId1)).toBe(false);
            expect(gate.isWaitingApproval(workflowId2)).toBe(true);

            // ワークフロー2も承認
            const decision2 = createTestDecision(
              workflowId2,
              phase,
              'approve',
              '承認'
            );
            await gate.submitDecision(workflowId2, decision2);
            await promise2;

            // 両方とも再開
            expect(worker2Resumed).toBe(true);
            expect(gate.isWaitingApproval(workflowId2)).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('承認待ちでないワークフローにsubmitDecisionするとエラーになること', async () => {
      await fc.assert(
        fc.asyncProperty(
          workflowIdArb,
          approvalPhaseArb,
          approvalActionArb,
          async (
            workflowId: string,
            phase: WorkflowPhase,
            action: ApprovalAction
          ) => {
            const gate = createApprovalGate(TEST_RUNS_PATH);

            // 承認待ちでないワークフローに決定を送信
            const decision = createTestDecision(workflowId, phase, action);

            await expect(
              gate.submitDecision(workflowId, decision)
            ).rejects.toThrow('承認待ちではありません');

            // 承認待ち状態でないことを確認
            expect(gate.isWaitingApproval(workflowId)).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
