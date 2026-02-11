/**
 * WorkflowEngine ユニットテスト
 *
 * ワークフローフェーズ管理と状態遷移制御の機能をテストする。
 * MeetingCoordinatorとApprovalGateの実インスタンスを使用。
 *
 * @module tests/execution/workflow-engine.test
 * @see Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.9, 3.3, 3.4, 3.5, 13.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  WorkflowEngine,
  WorkflowEngineError,
  createWorkflowEngine,
} from '../../tools/cli/lib/execution/workflow-engine';
import {
  MeetingCoordinator,
  createMeetingCoordinator,
} from '../../tools/cli/lib/execution/meeting-coordinator';
import {
  ApprovalGate,
  createApprovalGate,
} from '../../tools/cli/lib/execution/approval-gate';
import { AgentBus, createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import type { ApprovalDecision } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_BUS_PATH = 'runtime/test-wf-engine-bus';
const TEST_RUNS_PATH = 'runtime/test-wf-engine-runs';
const TEST_PROJECT_ID = 'project-test-001';

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
 * 指定ミリ秒待機する
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指定フェーズに到達するまでポーリングで待機する
 * @param engine - WorkflowEngine インスタンス
 * @param workflowId - ワークフローID
 * @param targetPhase - 待機対象フェーズ
 * @param timeoutMs - タイムアウト（ミリ秒）
 */
async function waitForPhase(
  engine: WorkflowEngine,
  workflowId: string,
  targetPhase: string,
  timeoutMs = 3000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await engine.getWorkflowState(workflowId);
    if (state?.currentPhase === targetPhase) return;
    await delay(50);
  }
}

/**
 * 承認待ち状態（waiting_approval）になるまでポーリングで待機する
 * ApprovalGateのpendingResolverが登録されるまで待つ
 */
async function waitForApprovalWaiting(
  engine: WorkflowEngine,
  workflowId: string,
  gate: ApprovalGate,
  timeoutMs = 3000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await engine.getWorkflowState(workflowId);
    // フェーズがapprovalかつ、ApprovalGateにpending登録済みであることを確認
    if (state?.currentPhase === 'approval' && state?.status === 'waiting_approval') {
      const pending = gate.getPendingApprovals();
      if (pending.some((p) => p.workflowId === workflowId)) return;
    }
    await delay(50);
  }
}

/**
 * proposalフェーズが完了するまでポーリングで待機する
 * （approvalフェーズに遷移 or proposal以外のフェーズになるまで待つ）
 */
async function waitForProposalComplete(
  engine: WorkflowEngine,
  workflowId: string,
  timeoutMs = 3000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await engine.getWorkflowState(workflowId);
    if (state && state.currentPhase !== 'proposal') return;
    // proposalが完了していればmeetingMinutesIdsが設定されている
    if (state && state.meetingMinutesIds.length > 0 && state.proposal) return;
    await delay(50);
  }
}

// =============================================================================
// テストスイート
// =============================================================================

describe('WorkflowEngine', () => {
  let agentBus: AgentBus;
  let meetingCoordinator: MeetingCoordinator;
  let approvalGate: ApprovalGate;
  let engine: WorkflowEngine;

  beforeEach(async () => {
    await cleanupDirectory(TEST_BUS_PATH);
    await cleanupDirectory(TEST_RUNS_PATH);

    agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: TEST_BUS_PATH,
      },
      runtimeBasePath: TEST_RUNS_PATH,
    });

    meetingCoordinator = createMeetingCoordinator(agentBus, TEST_RUNS_PATH);
    approvalGate = createApprovalGate(TEST_RUNS_PATH);
    engine = createWorkflowEngine(meetingCoordinator, approvalGate, TEST_RUNS_PATH);
  });

  afterEach(async () => {
    await cleanupDirectory(TEST_BUS_PATH);
    await cleanupDirectory(TEST_RUNS_PATH);
  });

  // ===========================================================================
  // 1. ファクトリ関数テスト
  // ===========================================================================

  describe('createWorkflowEngine', () => {
    it('WorkflowEngineインスタンスを生成できる', () => {
      const instance = createWorkflowEngine(meetingCoordinator, approvalGate);
      expect(instance).toBeInstanceOf(WorkflowEngine);
    });

    it('カスタムbasePathで生成できる', () => {
      const instance = createWorkflowEngine(
        meetingCoordinator,
        approvalGate,
        '/custom/path'
      );
      expect(instance).toBeInstanceOf(WorkflowEngine);
    });
  });

  // ===========================================================================
  // 2-3. startWorkflow テスト
  // ===========================================================================

  describe('startWorkflow', () => {
    it('ワークフローを開始し、proposalフェーズで開始される', async () => {
      const workflowId = await engine.startWorkflow(
        '認証機能を実装してください',
        TEST_PROJECT_ID
      );

      // proposalフェーズの完了をポーリングで待つ
      await waitForProposalComplete(engine, workflowId);

      const state = await engine.getWorkflowState(workflowId);
      expect(state).toBeDefined();
      // proposalフェーズが完了してapprovalに遷移しているはず
      // （MeetingCoordinatorが同期的に完了するため）
      expect(['proposal', 'approval']).toContain(state?.currentPhase);
    });

    it('ワークフローIDが返される', async () => {
      const workflowId = await engine.startWorkflow(
        'テスト指示',
        TEST_PROJECT_ID
      );

      expect(workflowId).toBeDefined();
      expect(workflowId).toMatch(/^wf-[a-f0-9]{8}$/);
    });

    it('空の指示内容でエラーをスローする', async () => {
      await expect(
        engine.startWorkflow('', TEST_PROJECT_ID)
      ).rejects.toThrow(WorkflowEngineError);
    });

    it('空のプロジェクトIDでエラーをスローする', async () => {
      await expect(
        engine.startWorkflow('指示', '')
      ).rejects.toThrow(WorkflowEngineError);
    });
  });

  // ===========================================================================
  // 4-5. getWorkflowState テスト
  // ===========================================================================

  describe('getWorkflowState', () => {
    it('存在するワークフローの状態を取得できる', async () => {
      const workflowId = await engine.startWorkflow(
        '機能実装',
        TEST_PROJECT_ID
      );

      const state = await engine.getWorkflowState(workflowId);
      expect(state).toBeDefined();
      expect(state?.workflowId).toBe(workflowId);
      expect(state?.projectId).toBe(TEST_PROJECT_ID);
      expect(state?.instruction).toBe('機能実装');
    });

    it('存在しないワークフローでnullを返す', async () => {
      const state = await engine.getWorkflowState('wf-nonexistent');
      expect(state).toBeNull();
    });
  });

  // ===========================================================================
  // 6-7. listWorkflows テスト
  // ===========================================================================

  describe('listWorkflows', () => {
    it('全ワークフロー一覧を取得できる', async () => {
      await engine.startWorkflow('指示1', TEST_PROJECT_ID);
      await engine.startWorkflow('指示2', TEST_PROJECT_ID);

      const workflows = await engine.listWorkflows();
      expect(workflows.length).toBe(2);
    });

    it('statusフィルタで絞り込める', async () => {
      const wfId1 = await engine.startWorkflow('指示1', TEST_PROJECT_ID);
      await engine.startWorkflow('指示2', TEST_PROJECT_ID);

      // wfId1を終了させる
      await engine.terminateWorkflow(wfId1, 'テスト終了');

      const terminated = await engine.listWorkflows({ status: 'terminated' });
      expect(terminated.length).toBe(1);
      expect(terminated[0].workflowId).toBe(wfId1);
    });
  });

  // ===========================================================================
  // 8-10. proposalフェーズテスト
  // ===========================================================================

  describe('proposalフェーズ', () => {
    it('MeetingCoordinatorで会議が開催される', async () => {
      const workflowId = await engine.startWorkflow(
        '開発タスクを実行してください',
        TEST_PROJECT_ID
      );

      // proposalフェーズの完了をポーリングで待つ
      await waitForProposalComplete(engine, workflowId);

      const state = await engine.getWorkflowState(workflowId);
      expect(state).toBeDefined();
      // 会議録IDが記録されている
      expect(state?.meetingMinutesIds.length).toBeGreaterThanOrEqual(1);
    });

    it('Proposalが生成される', async () => {
      const workflowId = await engine.startWorkflow(
        '設計と実装を行ってください',
        TEST_PROJECT_ID
      );

      // proposalフェーズの完了をポーリングで待つ
      await waitForProposalComplete(engine, workflowId);

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.proposal).toBeDefined();
      expect(state?.proposal?.workflowId).toBe(workflowId);
      expect(state?.proposal?.summary).toBeTruthy();
      expect(state?.proposal?.taskBreakdown).toBeDefined();
      expect(state?.proposal?.workerAssignments).toBeDefined();
      expect(state?.proposal?.meetingMinutesIds.length).toBeGreaterThanOrEqual(1);
    });

    it('approvalフェーズへ遷移する', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      // 承認待ち状態になるまでポーリングで待つ
      await waitForApprovalWaiting(engine, workflowId, approvalGate);

      const state = await engine.getWorkflowState(workflowId);
      // proposalが完了してapprovalに遷移し、waiting_approvalになっている
      expect(state?.currentPhase).toBe('approval');
      expect(state?.status).toBe('waiting_approval');
    });
  });

  // ===========================================================================
  // 11-13. approvalフェーズテスト
  // ===========================================================================

  describe('approvalフェーズ', () => {
    it('approve → developmentへ遷移する (Req 3.3)', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      // 承認待ち状態になるまでポーリングで待つ（pendingResolver登録完了を保証）
      await waitForApprovalWaiting(engine, workflowId, approvalGate);

      // CEO承認を送信
      const decision: ApprovalDecision = {
        workflowId,
        phase: 'approval',
        action: 'approve',
        feedback: '問題なし',
        decidedAt: new Date().toISOString(),
      };
      await approvalGate.submitDecision(workflowId, decision);

      // developmentフェーズへの遷移をポーリングで待つ
      await waitForPhase(engine, workflowId, 'development');

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.approvalDecisions.length).toBeGreaterThanOrEqual(1);
      // developmentフェーズ以降に遷移しているはず（スタブなので先に進む）
      const phaseAfterApproval = state?.phaseHistory.find(
        (t) => t.from === 'approval' && t.to === 'development'
      );
      expect(phaseAfterApproval).toBeDefined();
    });

    it('request_revision → proposalへ戻る (Req 3.4)', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      // 承認待ち状態になるまでポーリングで待つ（pendingResolver登録完了を保証）
      await waitForApprovalWaiting(engine, workflowId, approvalGate);

      // CEO修正要求を送信
      const decision: ApprovalDecision = {
        workflowId,
        phase: 'approval',
        action: 'request_revision',
        feedback: 'スコープを見直してください',
        decidedAt: new Date().toISOString(),
      };
      await approvalGate.submitDecision(workflowId, decision);

      // proposalフェーズへの遷移をポーリングで待つ
      await waitForPhase(engine, workflowId, 'proposal');

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.approvalDecisions.length).toBeGreaterThanOrEqual(1);
      // proposalへ戻る遷移が記録されている
      const revisionTransition = state?.phaseHistory.find(
        (t) => t.from === 'approval' && t.to === 'proposal'
      );
      expect(revisionTransition).toBeDefined();
    });

    it('reject → terminated (Req 3.5)', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      // 承認待ち状態になるまでポーリングで待つ（pendingResolver登録完了を保証）
      await waitForApprovalWaiting(engine, workflowId, approvalGate);

      // CEO却下を送信
      const decision: ApprovalDecision = {
        workflowId,
        phase: 'approval',
        action: 'reject',
        feedback: '提案を却下します',
        decidedAt: new Date().toISOString(),
      };
      await approvalGate.submitDecision(workflowId, decision);

      // terminated状態への遷移をポーリングで待つ
      const start = Date.now();
      while (Date.now() - start < 3000) {
        const s = await engine.getWorkflowState(workflowId);
        if (s?.status === 'terminated') break;
        await delay(50);
      }

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.status).toBe('terminated');
    });
  });

  // ===========================================================================
  // 14-15. rollbackToPhase テスト
  // ===========================================================================

  describe('rollbackToPhase', () => {
    it('前のフェーズにロールバックできる', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      // approvalフェーズに到達するまでポーリングで待つ
      await waitForPhase(engine, workflowId, 'approval');

      // approvalからproposalにロールバック
      await engine.rollbackToPhase(workflowId, 'proposal');

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.currentPhase).toBe('proposal');
      expect(state?.status).toBe('running');

      // ロールバック遷移が記録されている
      const rollbackTransition = state?.phaseHistory.find(
        (t) => t.reason.includes('ロールバック')
      );
      expect(rollbackTransition).toBeDefined();
    });

    it('不正なフェーズ（同じまたは後のフェーズ）でエラーをスローする', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      // approvalフェーズに到達するまでポーリングで待つ
      await waitForPhase(engine, workflowId, 'approval');

      // approvalからdevelopment（後のフェーズ）へのロールバックはエラー
      await expect(
        engine.rollbackToPhase(workflowId, 'development')
      ).rejects.toThrow(WorkflowEngineError);

      // 同じフェーズへのロールバックもエラー
      await expect(
        engine.rollbackToPhase(workflowId, 'approval')
      ).rejects.toThrow(WorkflowEngineError);
    });

    it('存在しないワークフローでエラーをスローする', async () => {
      await expect(
        engine.rollbackToPhase('wf-nonexistent', 'proposal')
      ).rejects.toThrow(WorkflowEngineError);
    });

    it('終了済みワークフローでエラーをスローする', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      await engine.terminateWorkflow(workflowId, 'テスト終了');

      await expect(
        engine.rollbackToPhase(workflowId, 'proposal')
      ).rejects.toThrow(WorkflowEngineError);
    });
  });

  // ===========================================================================
  // 16. terminateWorkflow テスト
  // ===========================================================================

  describe('terminateWorkflow', () => {
    it('ワークフローを終了できる', async () => {
      const workflowId = await engine.startWorkflow(
        '機能を実装してください',
        TEST_PROJECT_ID
      );

      await engine.terminateWorkflow(workflowId, 'テスト終了');

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.status).toBe('terminated');
      expect(state?.errorLog.length).toBeGreaterThanOrEqual(1);
      expect(state?.errorLog[0].message).toContain('テスト終了');
    });

    it('存在しないワークフローでエラーをスローする', async () => {
      await expect(
        engine.terminateWorkflow('wf-nonexistent', '理由')
      ).rejects.toThrow(WorkflowEngineError);
    });
  });

  // ===========================================================================
  // 17-18. 永続化テスト
  // ===========================================================================

  describe('永続化', () => {
    it('workflow.jsonが作成される', async () => {
      const workflowId = await engine.startWorkflow(
        '永続化テスト',
        TEST_PROJECT_ID
      );

      // ファイルが存在することを確認
      const filePath = path.join(TEST_RUNS_PATH, workflowId, 'workflow.json');
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // 内容を検証
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.workflowId).toBe(workflowId);
      expect(data.projectId).toBe(TEST_PROJECT_ID);
      expect(data.instruction).toBe('永続化テスト');
    });

    it('proposal.jsonが作成される', async () => {
      const workflowId = await engine.startWorkflow(
        '提案書永続化テスト',
        TEST_PROJECT_ID
      );

      // proposalフェーズの完了をポーリングで待つ
      await waitForProposalComplete(engine, workflowId);

      // proposal.jsonが存在することを確認
      const filePath = path.join(TEST_RUNS_PATH, workflowId, 'proposal.json');
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // 内容を検証
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.workflowId).toBe(workflowId);
      expect(data.version).toBe(1);
      expect(data.taskBreakdown).toBeDefined();
    });
  });

  // ===========================================================================
  // 19. 復元テスト
  // ===========================================================================

  describe('復元', () => {
    it('loadWorkflowStateで状態を復元できる', async () => {
      const workflowId = await engine.startWorkflow(
        '復元テスト',
        TEST_PROJECT_ID
      );

      // 新しいエンジンインスタンスで復元
      const newEngine = createWorkflowEngine(
        meetingCoordinator,
        approvalGate,
        TEST_RUNS_PATH
      );

      const state = await newEngine.getWorkflowState(workflowId);
      expect(state).toBeDefined();
      expect(state?.workflowId).toBe(workflowId);
      expect(state?.instruction).toBe('復元テスト');
    });

    it('restoreWorkflowsで全ワークフローを復元できる', async () => {
      // 専用のパスを使用して他テストの影響を排除
      const restorePath = 'runtime/test-wf-restore-runs';
      await cleanupDirectory(restorePath);

      const restoreEngine = createWorkflowEngine(
        meetingCoordinator,
        approvalGate,
        restorePath
      );

      await restoreEngine.startWorkflow('復元テスト1', TEST_PROJECT_ID);
      await restoreEngine.startWorkflow('復元テスト2', TEST_PROJECT_ID);

      // 新しいエンジンインスタンスで復元
      const newEngine = createWorkflowEngine(
        meetingCoordinator,
        approvalGate,
        restorePath
      );

      const restoredCount = await newEngine.restoreWorkflows();
      expect(restoredCount).toBe(2);

      const workflows = await newEngine.listWorkflows();
      expect(workflows.length).toBe(2);

      await cleanupDirectory(restorePath);
    });
  });

  // ===========================================================================
  // 20. フェーズ遷移記録テスト
  // ===========================================================================

  describe('フェーズ遷移', () => {
    it('PhaseTransitionが記録される', async () => {
      const workflowId = await engine.startWorkflow(
        '遷移テスト',
        TEST_PROJECT_ID
      );

      // proposalフェーズの完了をポーリングで待つ（proposal → approval）
      await waitForPhase(engine, workflowId, 'approval');

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.phaseHistory.length).toBeGreaterThanOrEqual(1);

      // proposal → approval の遷移が記録されている
      const transition = state?.phaseHistory.find(
        (t) => t.from === 'proposal' && t.to === 'approval'
      );
      expect(transition).toBeDefined();
      expect(transition?.timestamp).toBeTruthy();
      expect(transition?.reason).toBeTruthy();
    });
  });

  // ===========================================================================
  // getProgress / getQualityResults テスト
  // ===========================================================================

  describe('getProgress', () => {
    it('デフォルトの進捗情報を返す', async () => {
      const workflowId = await engine.startWorkflow(
        'テスト',
        TEST_PROJECT_ID
      );

      const progress = await engine.getProgress(workflowId);
      expect(progress).toBeDefined();
      expect(progress.totalTasks).toBe(0);
      expect(progress.completedTasks).toBe(0);
      expect(progress.subtasks).toEqual([]);
    });

    it('存在しないワークフローでエラーをスローする', async () => {
      await expect(
        engine.getProgress('wf-nonexistent')
      ).rejects.toThrow(WorkflowEngineError);
    });
  });

  describe('getQualityResults', () => {
    it('デフォルトの品質結果を返す', async () => {
      const workflowId = await engine.startWorkflow(
        'テスト',
        TEST_PROJECT_ID
      );

      const results = await engine.getQualityResults(workflowId);
      expect(results).toBeDefined();
    });

    it('存在しないワークフローでエラーをスローする', async () => {
      await expect(
        engine.getQualityResults('wf-nonexistent')
      ).rejects.toThrow(WorkflowEngineError);
    });
  });
});
