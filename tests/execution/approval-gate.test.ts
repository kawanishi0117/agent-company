/**
 * Approval Gate ユニットテスト
 *
 * 社長（CEO）承認ゲートの機能をテストする。
 * Promiseベースの承認待ち機構、永続化、承認履歴管理を検証する。
 *
 * @module tests/execution/approval-gate.test
 * @see Requirements: 3.1, 3.2, 3.6, 3.7, 6.2
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ApprovalGate,
  ApprovalGateError,
  createApprovalGate,
} from '../../tools/cli/lib/execution/approval-gate';
import type {
  ApprovalDecision,
  Proposal,
  Deliverable,
  ApprovalsPersistenceData,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_RUNS_PATH = 'runtime/test-approval-runs';
const TEST_WORKFLOW_ID = 'wf-approval-test-001';

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * ディレクトリを再帰的に削除
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
 */
function createTestProposal(workflowId: string = TEST_WORKFLOW_ID): Proposal {
  return {
    workflowId,
    summary: 'テスト提案書',
    scope: 'テストスコープ',
    taskBreakdown: [
      {
        id: 'task-1',
        title: 'タスク1',
        description: 'テストタスク',
        workerType: 'developer',
        estimatedEffort: '2h',
        dependencies: [],
      },
    ],
    workerAssignments: [
      {
        taskId: 'task-1',
        workerType: 'developer',
        rationale: 'テスト割り当て',
      },
    ],
    riskAssessment: [],
    dependencies: [],
    meetingMinutesIds: ['mtg-001'],
    createdAt: new Date().toISOString(),
  };
}

/**
 * テスト用Deliverableを生成する
 */
function createTestDeliverable(workflowId: string = TEST_WORKFLOW_ID): Deliverable {
  return {
    workflowId,
    summaryReport: 'テスト納品レポート',
    changes: [],
    testResults: {
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      coverage: 85.0,
    },
    reviewHistory: [],
    artifacts: ['src/index.ts'],
    createdAt: new Date().toISOString(),
  };
}

/**
 * テスト用ApprovalDecisionを生成する
 */
function createTestDecision(
  workflowId: string = TEST_WORKFLOW_ID,
  action: 'approve' | 'request_revision' | 'reject' = 'approve'
): ApprovalDecision {
  return {
    workflowId,
    phase: 'approval',
    action,
    feedback: action === 'approve' ? '問題なし' : '修正が必要です',
    decidedAt: new Date().toISOString(),
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('ApprovalGate', () => {
  let gate: ApprovalGate;

  beforeEach(async () => {
    await cleanupDirectory(TEST_RUNS_PATH);
    gate = createApprovalGate(TEST_RUNS_PATH);
  });

  afterEach(async () => {
    await cleanupDirectory(TEST_RUNS_PATH);
  });

  // ===========================================================================
  // ファクトリ関数テスト
  // ===========================================================================

  describe('createApprovalGate', () => {
    it('ApprovalGateインスタンスを生成する', () => {
      const instance = createApprovalGate(TEST_RUNS_PATH);
      expect(instance).toBeInstanceOf(ApprovalGate);
    });

    it('デフォルトパスでインスタンスを生成する', () => {
      const instance = createApprovalGate();
      expect(instance).toBeInstanceOf(ApprovalGate);
    });
  });

  // ===========================================================================
  // requestApproval + submitDecision テスト
  // ===========================================================================

  describe('requestApproval / submitDecision', () => {
    it('承認要求後にsubmitDecisionで決定を受け取る (Req 3.1, 3.2)', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision();

      // requestApprovalは非同期でsubmitDecisionを待つ
      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      // 承認待ち状態を確認
      expect(gate.isWaitingApproval(TEST_WORKFLOW_ID)).toBe(true);

      // CEO決定を送信
      await gate.submitDecision(TEST_WORKFLOW_ID, decision);

      // requestApprovalのPromiseが解決される
      const result = await approvalPromise;
      expect(result.action).toBe('approve');
      expect(result.workflowId).toBe(TEST_WORKFLOW_ID);
    });

    it('request_revision アクションを処理する (Req 3.2)', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision(TEST_WORKFLOW_ID, 'request_revision');

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);

      const result = await approvalPromise;
      expect(result.action).toBe('request_revision');
      expect(result.feedback).toBe('修正が必要です');
    });

    it('reject アクションを処理する (Req 3.2)', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision(TEST_WORKFLOW_ID, 'reject');

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);

      const result = await approvalPromise;
      expect(result.action).toBe('reject');
    });

    it('Deliverableの承認要求を処理する (Req 6.2)', async () => {
      const deliverable = createTestDeliverable();
      const decision = createTestDecision();
      decision.phase = 'delivery';

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'delivery',
        deliverable
      );

      expect(gate.isWaitingApproval(TEST_WORKFLOW_ID)).toBe(true);

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);

      const result = await approvalPromise;
      expect(result.action).toBe('approve');
    });

    it('既に承認待ちのワークフローに再度requestApprovalするとエラー', async () => {
      const proposal = createTestProposal();

      // 最初のrequestApproval（resolveしない）
      gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal);

      // 2回目はエラー
      await expect(
        gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal)
      ).rejects.toThrow(ApprovalGateError);
    });

    it('承認待ちでないワークフローにsubmitDecisionするとエラー', async () => {
      const decision = createTestDecision();

      await expect(
        gate.submitDecision('wf-nonexistent', decision)
      ).rejects.toThrow(ApprovalGateError);
    });

    it('submitDecision後は承認待ち状態が解除される (Req 3.7)', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision();

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      expect(gate.isWaitingApproval(TEST_WORKFLOW_ID)).toBe(true);

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);
      await approvalPromise;

      expect(gate.isWaitingApproval(TEST_WORKFLOW_ID)).toBe(false);
    });
  });

  // ===========================================================================
  // getPendingApprovals テスト
  // ===========================================================================

  describe('getPendingApprovals', () => {
    it('承認待ちアイテムがない場合は空配列を返す', () => {
      expect(gate.getPendingApprovals()).toEqual([]);
    });

    it('承認待ちアイテムを一覧で返す', () => {
      const proposal = createTestProposal();

      gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal);

      const pending = gate.getPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].workflowId).toBe(TEST_WORKFLOW_ID);
      expect(pending[0].phase).toBe('approval');
      expect(pending[0].content).toEqual(proposal);
      expect(pending[0].createdAt).toBeTruthy();
    });

    it('複数ワークフローの承認待ちを返す', () => {
      const proposal1 = createTestProposal('wf-001');
      const proposal2 = createTestProposal('wf-002');

      gate.requestApproval('wf-001', 'approval', proposal1);
      gate.requestApproval('wf-002', 'approval', proposal2);

      const pending = gate.getPendingApprovals();
      expect(pending).toHaveLength(2);
    });

    it('submitDecision後は承認待ちから除外される', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision();

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      expect(gate.getPendingApprovals()).toHaveLength(1);

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);
      await approvalPromise;

      expect(gate.getPendingApprovals()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // getApprovalHistory テスト
  // ===========================================================================

  describe('getApprovalHistory', () => {
    it('履歴がない場合は空配列を返す', () => {
      expect(gate.getApprovalHistory(TEST_WORKFLOW_ID)).toEqual([]);
    });

    it('承認決定が履歴に記録される (Req 3.6)', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision();

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);
      await approvalPromise;

      const history = gate.getApprovalHistory(TEST_WORKFLOW_ID);
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('approve');
      expect(history[0].workflowId).toBe(TEST_WORKFLOW_ID);
    });

    it('複数の承認決定が時系列で記録される', async () => {
      // 1回目: request_revision
      const proposal1 = createTestProposal();
      const decision1 = createTestDecision(TEST_WORKFLOW_ID, 'request_revision');

      const promise1 = gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal1);
      await gate.submitDecision(TEST_WORKFLOW_ID, decision1);
      await promise1;

      // 2回目: approve
      const proposal2 = createTestProposal();
      const decision2 = createTestDecision(TEST_WORKFLOW_ID, 'approve');

      const promise2 = gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal2);
      await gate.submitDecision(TEST_WORKFLOW_ID, decision2);
      await promise2;

      const history = gate.getApprovalHistory(TEST_WORKFLOW_ID);
      expect(history).toHaveLength(2);
      expect(history[0].action).toBe('request_revision');
      expect(history[1].action).toBe('approve');
    });
  });

  // ===========================================================================
  // isWaitingApproval テスト
  // ===========================================================================

  describe('isWaitingApproval', () => {
    it('承認待ちでない場合はfalseを返す', () => {
      expect(gate.isWaitingApproval(TEST_WORKFLOW_ID)).toBe(false);
    });

    it('承認待ち中はtrueを返す (Req 3.7)', () => {
      const proposal = createTestProposal();
      gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal);
      expect(gate.isWaitingApproval(TEST_WORKFLOW_ID)).toBe(true);
    });
  });

  // ===========================================================================
  // cancelApproval テスト
  // ===========================================================================

  describe('cancelApproval', () => {
    it('承認待ちをキャンセルするとPromiseがrejectされる', async () => {
      const proposal = createTestProposal();

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      gate.cancelApproval(TEST_WORKFLOW_ID, 'ワークフロー終了');

      await expect(approvalPromise).rejects.toThrow(ApprovalGateError);
      expect(gate.isWaitingApproval(TEST_WORKFLOW_ID)).toBe(false);
    });

    it('承認待ちでないワークフローのキャンセルは何もしない', () => {
      // エラーにならないことを確認
      gate.cancelApproval('wf-nonexistent', 'テスト');
      expect(gate.isWaitingApproval('wf-nonexistent')).toBe(false);
    });
  });

  // ===========================================================================
  // 永続化テスト
  // ===========================================================================

  describe('永続化', () => {
    it('submitDecision時にapprovals.jsonが作成される (Req 3.6)', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision();

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);
      await approvalPromise;

      // ファイルが作成されたことを確認
      const filePath = path.join(TEST_RUNS_PATH, TEST_WORKFLOW_ID, 'approvals.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as ApprovalsPersistenceData;

      expect(data.workflowId).toBe(TEST_WORKFLOW_ID);
      expect(data.decisions).toHaveLength(1);
      expect(data.decisions[0].action).toBe('approve');
    });

    it('loadApprovalsで永続化データを読み込める', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision();

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);
      await approvalPromise;

      // 新しいインスタンスで読み込み
      const newGate = createApprovalGate(TEST_RUNS_PATH);
      const loaded = await newGate.loadApprovals(TEST_WORKFLOW_ID);

      expect(loaded).not.toBeNull();
      expect(loaded!.workflowId).toBe(TEST_WORKFLOW_ID);
      expect(loaded!.decisions).toHaveLength(1);
      expect(loaded!.decisions[0].action).toBe('approve');
    });

    it('loadApprovals後にgetApprovalHistoryで履歴を取得できる', async () => {
      const proposal = createTestProposal();
      const decision = createTestDecision();

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      );

      await gate.submitDecision(TEST_WORKFLOW_ID, decision);
      await approvalPromise;

      // 新しいインスタンスで読み込み
      const newGate = createApprovalGate(TEST_RUNS_PATH);
      await newGate.loadApprovals(TEST_WORKFLOW_ID);

      const history = newGate.getApprovalHistory(TEST_WORKFLOW_ID);
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('approve');
    });

    it('存在しないワークフローのloadApprovalsはnullを返す', async () => {
      const result = await gate.loadApprovals('wf-nonexistent');
      expect(result).toBeNull();
    });

    it('複数回のsubmitDecisionで承認履歴が蓄積される', async () => {
      // 1回目
      const proposal1 = createTestProposal();
      const decision1 = createTestDecision(TEST_WORKFLOW_ID, 'request_revision');

      const promise1 = gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal1);
      await gate.submitDecision(TEST_WORKFLOW_ID, decision1);
      await promise1;

      // 2回目
      const proposal2 = createTestProposal();
      const decision2 = createTestDecision(TEST_WORKFLOW_ID, 'approve');

      const promise2 = gate.requestApproval(TEST_WORKFLOW_ID, 'approval', proposal2);
      await gate.submitDecision(TEST_WORKFLOW_ID, decision2);
      await promise2;

      // ファイルに2件記録されていることを確認
      const filePath = path.join(TEST_RUNS_PATH, TEST_WORKFLOW_ID, 'approvals.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as ApprovalsPersistenceData;

      expect(data.decisions).toHaveLength(2);
      expect(data.decisions[0].action).toBe('request_revision');
      expect(data.decisions[1].action).toBe('approve');
    });
  });

  // ===========================================================================
  // Promiseベース承認待ち機構テスト
  // ===========================================================================

  describe('Promiseベース承認待ち機構 (Req 3.7)', () => {
    it('requestApprovalはsubmitDecisionまでブロックする', async () => {
      const proposal = createTestProposal();
      let resolved = false;

      const approvalPromise = gate.requestApproval(
        TEST_WORKFLOW_ID,
        'approval',
        proposal
      ).then((decision) => {
        resolved = true;
        return decision;
      });

      // submitDecision前はまだ解決されていない
      // マイクロタスクを処理するために少し待つ
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(resolved).toBe(false);

      // submitDecisionで解決
      const decision = createTestDecision();
      await gate.submitDecision(TEST_WORKFLOW_ID, decision);
      await approvalPromise;

      expect(resolved).toBe(true);
    });
  });
});
