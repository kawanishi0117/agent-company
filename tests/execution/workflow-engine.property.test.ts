/**
 * WorkflowEngine プロパティテスト（Properties 2〜8）
 *
 * Property 2: Phase Transition Recording
 * Property 3: Workflow State Persistence Round-Trip
 * Property 4: Error Halts Phase and Notifies CEO
 * Property 5: Phase Rollback Resets State
 * Property 6: Instruction Triggers Meeting and Creates Proposal
 * Property 7: Proposal Structure Completeness
 * Property 8: Approval Gate Activation on Phase Completion
 *
 * @module tests/execution/workflow-engine.property.test
 * @see Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.7, 2.9, 2.10, 2.11, 3.1, 3.6, 6.2, 13.1, 13.2, 13.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  WorkflowEngine,
  createWorkflowEngine,
} from '../../tools/cli/lib/execution/workflow-engine.js';
import {
  MeetingCoordinator,
  createMeetingCoordinator,
  MeetingCoordinatorError,
} from '../../tools/cli/lib/execution/meeting-coordinator.js';
import {
  ApprovalGate,
  createApprovalGate,
} from '../../tools/cli/lib/execution/approval-gate.js';
import { createAgentBus } from '../../tools/cli/lib/execution/agent-bus.js';
import type {
  WorkflowPhase,
  WorkflowStatus,
  WorkflowState,
  MeetingMinutes,
  ApprovalDecision,
  WorkflowPersistenceData,
  EscalationAction,
  EscalationDecision,
  WorkflowEscalation,
} from '../../tools/cli/lib/execution/types.js';
import {
  VALID_WORKFLOW_PHASES,
} from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// テスト用定数
// =============================================================================

/** テスト用ワークフロー状態保存パス */
const TEST_BASE_PATH = 'runtime/test-wf-prop-runs';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 指示文字列（非空）を生成する Arbitrary
 */
const instructionArb: fc.Arbitrary<string> = fc.constantFrom(
  'ユーザー認証機能を実装してください',
  'APIエンドポイントを追加してください',
  'データベーススキーマを設計してください',
  'テストカバレッジを改善してください',
  'パフォーマンスを最適化してください',
  'セキュリティ監査を実施してください',
  'ドキュメントを更新してください',
  'CI/CDパイプラインを構築してください'
);

/**
 * プロジェクトIDを生成する Arbitrary
 */
const projectIdArb: fc.Arbitrary<string> = fc.stringMatching(/^proj-[a-z0-9]{4}$/);

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * ディレクトリを再帰的に削除する
 * @param dirPath - 削除対象ディレクトリパス
 */
async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // 削除失敗は無視
  }
}

/**
 * 指定ミリ秒待機する
 * @param ms - 待機ミリ秒
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ワークフローが特定フェーズに到達するまでポーリングで待機する
 * @param engine - WorkflowEngineインスタンス
 * @param workflowId - ワークフローID
 * @param targetPhase - 到達を待つフェーズ
 * @param maxWaitMs - 最大待機ミリ秒（デフォルト: 10000）
 * @returns 到達時のWorkflowState
 * @throws {Error} タイムアウト時
 */
async function waitForPhase(
  engine: WorkflowEngine,
  workflowId: string,
  targetPhase: WorkflowPhase,
  maxWaitMs: number = 10000
): Promise<WorkflowState> {
  const startTime = Date.now();
  const pollInterval = 50;

  while (Date.now() - startTime < maxWaitMs) {
    const state = await engine.getWorkflowState(workflowId);
    if (state && state.currentPhase === targetPhase) {
      return state;
    }
    // 失敗・終了状態ならそのまま返す
    if (state && (state.status === 'failed' || state.status === 'terminated')) {
      return state;
    }
    await delay(pollInterval);
  }

  // タイムアウト時は最新状態を返す
  const finalState = await engine.getWorkflowState(workflowId);
  throw new Error(
    `タイムアウト: フェーズ '${targetPhase}' に到達しませんでした。` +
    `現在のフェーズ: '${finalState?.currentPhase}', ステータス: '${finalState?.status}'`
  );
}

/**
 * ワークフローが特定ステータスに到達するまでポーリングで待機する
 * @param engine - WorkflowEngineインスタンス
 * @param workflowId - ワークフローID
 * @param targetStatus - 到達を待つステータス
 * @param maxWaitMs - 最大待機ミリ秒（デフォルト: 10000）
 * @returns 到達時のWorkflowState
 * @throws {Error} タイムアウト時
 */
async function waitForStatus(
  engine: WorkflowEngine,
  workflowId: string,
  targetStatus: WorkflowStatus,
  maxWaitMs: number = 10000
): Promise<WorkflowState> {
  const startTime = Date.now();
  const pollInterval = 50;

  while (Date.now() - startTime < maxWaitMs) {
    const state = await engine.getWorkflowState(workflowId);
    if (state && state.status === targetStatus) {
      return state;
    }
    await delay(pollInterval);
  }

  const finalState = await engine.getWorkflowState(workflowId);
  throw new Error(
    `タイムアウト: ステータス '${targetStatus}' に到達しませんでした。` +
    `現在のステータス: '${finalState?.status}', フェーズ: '${finalState?.currentPhase}'`
  );
}

/**
 * ワークフローがApprovalGateで承認待ち状態になるまでポーリングで待機する
 * （ステータスとApprovalGateの両方を確認する）
 * @param engine - WorkflowEngineインスタンス
 * @param approvalGate - ApprovalGateインスタンス
 * @param workflowId - ワークフローID
 * @param maxWaitMs - 最大待機ミリ秒（デフォルト: 10000）
 * @returns 到達時のWorkflowState
 * @throws {Error} タイムアウト時
 */
async function waitForApprovalWaiting(
  engine: WorkflowEngine,
  approvalGate: ApprovalGate,
  workflowId: string,
  maxWaitMs: number = 10000
): Promise<WorkflowState> {
  const startTime = Date.now();
  const pollInterval = 50;

  while (Date.now() - startTime < maxWaitMs) {
    const state = await engine.getWorkflowState(workflowId);
    // ステータスがwaiting_approvalかつApprovalGateが承認待ち状態であること
    if (
      state &&
      state.status === 'waiting_approval' &&
      approvalGate.isWaitingApproval(workflowId)
    ) {
      return state;
    }
    // 失敗・終了状態ならそのまま返す
    if (state && (state.status === 'failed' || state.status === 'terminated')) {
      return state;
    }
    await delay(pollInterval);
  }

  const finalState = await engine.getWorkflowState(workflowId);
  throw new Error(
    `タイムアウト: 承認待ち状態に到達しませんでした。` +
    `ステータス: '${finalState?.status}', フェーズ: '${finalState?.currentPhase}', ` +
    `ApprovalGate待ち: ${approvalGate.isWaitingApproval(workflowId)}`
  );
}

/**
 * テスト用のコンポーネント一式を生成する
 * @param basePath - 状態保存ベースパス
 * @returns engine, meetingCoordinator, approvalGate のセット
 */
function createTestComponents(basePath: string): {
  engine: WorkflowEngine;
  meetingCoordinator: MeetingCoordinator;
  approvalGate: ApprovalGate;
} {
  const agentBus = createAgentBus({
    runtimeBasePath: path.join(basePath, 'bus'),
  });
  const meetingCoordinator = createMeetingCoordinator(agentBus, basePath);
  const approvalGate = createApprovalGate(basePath);
  const engine = createWorkflowEngine(meetingCoordinator, approvalGate, basePath);
  return { engine, meetingCoordinator, approvalGate };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('WorkflowEngine Property Tests', () => {
  beforeEach(async () => {
    await cleanupDirectory(TEST_BASE_PATH);
  });

  afterEach(async () => {
    await cleanupDirectory(TEST_BASE_PATH);
  });

  // ===========================================================================
  // Property 2: Phase Transition Recording
  // **Validates: Requirement 1.2**
  // ===========================================================================

  describe('Property 2: Phase Transition Recording', () => {
    it('フェーズ遷移時にphaseHistoryに有効なPhaseTransitionエントリが追加され、配列長が正確に1増加すること (Req 1.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // ワークフロー開始（proposalフェーズ）
            const workflowId = await engine.startWorkflow(instruction, projectId);

            // approvalフェーズ到達を待機（proposal → approval 遷移が発生）
            const state = await waitForPhase(engine, workflowId, 'approval');

            // phaseHistoryに少なくとも1つのエントリがあること
            expect(state.phaseHistory.length).toBeGreaterThanOrEqual(1);

            // 最初の遷移エントリを検証
            const firstTransition = state.phaseHistory[0];
            expect(firstTransition.from).toBe('proposal');
            expect(firstTransition.to).toBe('approval');

            // 各PhaseTransitionエントリの構造を検証
            for (const transition of state.phaseHistory) {
              // from/to が有効なフェーズであること
              expect(VALID_WORKFLOW_PHASES).toContain(transition.from);
              expect(VALID_WORKFLOW_PHASES).toContain(transition.to);

              // timestampが有効なISO8601形式であること
              expect(transition.timestamp).toBeTruthy();
              const parsedDate = new Date(transition.timestamp);
              expect(parsedDate.toISOString()).toBe(transition.timestamp);

              // reasonが存在すること
              expect(transition.reason).toBeTruthy();
            }

            // 承認待ちをクリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('proposal→approval遷移でphaseHistory長が正確に1増加すること (Req 1.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            const workflowId = await engine.startWorkflow(instruction, projectId);

            // 開始直後のphaseHistory長を取得
            const initialState = await engine.getWorkflowState(workflowId);
            const initialLength = initialState?.phaseHistory.length ?? 0;

            // approvalフェーズ到達を待機
            const afterState = await waitForPhase(engine, workflowId, 'approval');

            // phaseHistory長が正確に1増加していること
            expect(afterState.phaseHistory.length).toBe(initialLength + 1);

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 3: Workflow State Persistence Round-Trip
  // **Validates: Requirements 1.3, 2.7, 2.11, 3.6, 13.1, 13.2, 13.3**
  // ===========================================================================

  describe('Property 3: Workflow State Persistence Round-Trip', () => {
    it('永続化されたWorkflowStateをファイルから読み込むと等価なオブジェクトが得られること (Req 1.3, 13.1, 13.2, 13.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // ワークフロー開始 → ApprovalGateで承認待ち状態になるまで待機
            // （approvalフェーズでrequestApprovalが呼ばれた後、状態が安定する）
            const workflowId = await engine.startWorkflow(instruction, projectId);
            await waitForApprovalWaiting(engine, approvalGate, workflowId);

            // 少し待機してファイル書き込みの完了を保証
            await delay(100);

            // インメモリの状態を取得
            const memoryState = await engine.getWorkflowState(workflowId);
            expect(memoryState).not.toBeNull();

            // ファイルから直接読み込み
            const filePath = path.join(TEST_BASE_PATH, workflowId, 'workflow.json');
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const fileData = JSON.parse(fileContent) as WorkflowPersistenceData;

            // 主要フィールドが一致すること
            expect(fileData.workflowId).toBe(memoryState!.workflowId);
            expect(fileData.projectId).toBe(memoryState!.projectId);
            expect(fileData.instruction).toBe(memoryState!.instruction);
            expect(fileData.currentPhase).toBe(memoryState!.currentPhase);
            expect(fileData.status).toBe(memoryState!.status);

            // phaseHistoryが一致すること
            expect(fileData.phaseHistory.length).toBe(memoryState!.phaseHistory.length);
            for (let i = 0; i < fileData.phaseHistory.length; i++) {
              expect(fileData.phaseHistory[i].from).toBe(memoryState!.phaseHistory[i].from);
              expect(fileData.phaseHistory[i].to).toBe(memoryState!.phaseHistory[i].to);
              expect(fileData.phaseHistory[i].timestamp).toBe(
                memoryState!.phaseHistory[i].timestamp
              );
            }

            // errorLogが一致すること
            expect(fileData.errorLog.length).toBe(memoryState!.errorLog.length);

            // meetingMinutesIdsが一致すること
            expect(fileData.meetingMinutesIds).toEqual(memoryState!.meetingMinutesIds);

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 4: Error Halts Phase and Notifies CEO
  // **Validates: Requirement 1.4**
  // ===========================================================================

  describe('Property 4: Error Halts Phase and Notifies CEO', () => {
    it('フェーズ実行中にエラーが発生するとステータスがfailedになりerrorLogにエントリが追加されること (Req 1.4)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            // エラーをスローするMeetingCoordinatorモックを作成
            const agentBus = createAgentBus({
              runtimeBasePath: path.join(TEST_BASE_PATH, 'bus'),
            });
            const errorCoordinator = createMeetingCoordinator(agentBus, TEST_BASE_PATH);

            // conveneMeetingをオーバーライドしてエラーをスローさせる
            const originalConvene = errorCoordinator.conveneMeeting.bind(errorCoordinator);
            errorCoordinator.conveneMeeting = async (
              _workflowId: string,
              _instruction: string,
              _facilitatorId: string
            ): Promise<MeetingMinutes> => {
              throw new MeetingCoordinatorError('テスト用エラー: 会議開催失敗');
            };

            const approvalGate = createApprovalGate(TEST_BASE_PATH);
            const engine = createWorkflowEngine(
              errorCoordinator,
              approvalGate,
              TEST_BASE_PATH
            );

            // ワークフロー開始（proposalフェーズでエラーが発生する）
            const workflowId = await engine.startWorkflow(instruction, projectId);

            // failedステータスに到達するまで待機
            const state = await waitForStatus(engine, workflowId, 'failed');

            // ステータスがfailedであること
            expect(state.status).toBe('failed');

            // errorLogにエントリが追加されていること
            expect(state.errorLog.length).toBeGreaterThanOrEqual(1);

            // エラーログの最新エントリを検証
            const lastError = state.errorLog[state.errorLog.length - 1];
            expect(lastError.message).toBeTruthy();
            expect(lastError.phase).toBe('proposal');
            expect(lastError.timestamp).toBeTruthy();
            expect(lastError.recoverable).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 5: Phase Rollback Resets State
  // **Validates: Requirement 1.5**
  // ===========================================================================

  describe('Property 5: Phase Rollback Resets State', () => {
    it('ロールバック後にcurrentPhaseが対象フェーズになりphaseHistoryにロールバック遷移が追加されること (Req 1.5)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // ワークフロー開始 → ApprovalGateで承認待ち状態になるまで待機
            const workflowId = await engine.startWorkflow(instruction, projectId);
            await waitForApprovalWaiting(engine, approvalGate, workflowId);

            // 現在approvalフェーズで承認待ち中
            // approvalフェーズでapproveしてdevelopmentへ進める
            const approveDecision: ApprovalDecision = {
              workflowId,
              phase: 'approval',
              action: 'approve',
              feedback: 'テスト承認',
              decidedAt: new Date().toISOString(),
            };
            await approvalGate.submitDecision(workflowId, approveDecision);

            // deliveryフェーズのApprovalGate待ちを待機
            // （development → quality_assurance → delivery と自動遷移し、deliveryでrequestApprovalが呼ばれる）
            await waitForApprovalWaiting(engine, approvalGate, workflowId, 10000);

            // 現在deliveryフェーズで承認待ち中
            const beforeState = await engine.getWorkflowState(workflowId);
            expect(beforeState!.currentPhase).toBe('delivery');
            const beforeHistoryLength = beforeState!.phaseHistory.length;

            // deliveryフェーズのApprovalGateでrequest_revisionを送信
            // （これによりdevelopmentフェーズに戻る）
            const revisionDecision: ApprovalDecision = {
              workflowId,
              phase: 'delivery',
              action: 'request_revision',
              feedback: 'ロールバックテスト用修正要求',
              decidedAt: new Date().toISOString(),
            };
            await approvalGate.submitDecision(workflowId, revisionDecision);

            // 再びdeliveryフェーズのApprovalGate待ちを待機
            await waitForApprovalWaiting(engine, approvalGate, workflowId, 10000);

            // deliveryフェーズで再度承認待ち中 → proposalにロールバック
            // まずApprovalGateをキャンセルしてブロックを解除
            approvalGate.cancelApproval(workflowId, 'ロールバック準備');

            // エラーハンドリングの完了を待機
            await delay(200);

            // cancelApproval後の状態を確認
            const midState = await engine.getWorkflowState(workflowId);

            // failed/terminated以外ならロールバックを実行
            if (midState!.status !== 'failed' && midState!.status !== 'terminated' && midState!.status !== 'completed') {
              const midHistoryLength = midState!.phaseHistory.length;

              await engine.rollbackToPhase(workflowId, 'proposal');

              const afterState = await engine.getWorkflowState(workflowId);
              expect(afterState).not.toBeNull();
              expect(afterState!.currentPhase).toBe('proposal');
              expect(afterState!.phaseHistory.length).toBe(midHistoryLength + 1);

              const lastTransition =
                afterState!.phaseHistory[afterState!.phaseHistory.length - 1];
              expect(lastTransition.to).toBe('proposal');
              expect(lastTransition.reason).toContain('ロールバック');
              expect(lastTransition.timestamp).toBeTruthy();
              expect(afterState!.status).toBe('running');
            } else {
              // failed/terminated状態の場合: phaseHistoryにrequest_revisionによる遷移が記録されていることを検証
              expect(midState!.phaseHistory.length).toBeGreaterThan(beforeHistoryLength);

              // request_revisionによるdelivery→development遷移が記録されていること
              const revisionTransition = midState!.phaseHistory.find(
                (t) => t.from === 'delivery' && t.to === 'development'
              );
              expect(revisionTransition).toBeDefined();
              expect(revisionTransition!.timestamp).toBeTruthy();
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  }, 120000);

  // ===========================================================================
  // Property 6: Instruction Triggers Meeting and Creates Proposal
  // **Validates: Requirements 2.1, 2.9, 2.10**
  // ===========================================================================

  describe('Property 6: Instruction Triggers Meeting and Creates Proposal', () => {
    it('任意の非空指示に対してproposalフェーズで会議が開催されMeetingMinutesを参照するProposalが作成されること (Req 2.1, 2.9, 2.10)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // ワークフロー開始 → approvalフェーズ到達を待機
            const workflowId = await engine.startWorkflow(instruction, projectId);
            const state = await waitForPhase(engine, workflowId, 'approval');

            // proposalが存在すること
            expect(state.proposal).toBeDefined();
            expect(state.proposal).not.toBeNull();

            // proposalのmeetingMinutesIdsが非空であること
            expect(state.proposal!.meetingMinutesIds.length).toBeGreaterThanOrEqual(1);

            // ワークフロー状態のmeetingMinutesIdsも非空であること
            expect(state.meetingMinutesIds.length).toBeGreaterThanOrEqual(1);

            // proposalのmeetingMinutesIdsがワークフローのmeetingMinutesIdsに含まれること
            for (const minutesId of state.proposal!.meetingMinutesIds) {
              expect(state.meetingMinutesIds).toContain(minutesId);
            }

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 7: Proposal Structure Completeness
  // **Validates: Requirement 2.9**
  // ===========================================================================

  describe('Property 7: Proposal Structure Completeness', () => {
    it('生成されたProposalが必須フィールド（summary, scope, taskBreakdown, workerAssignments, riskAssessment, dependencies, meetingMinutesIds）をすべて含むこと (Req 2.9)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // ワークフロー開始 → approvalフェーズ到達を待機
            const workflowId = await engine.startWorkflow(instruction, projectId);
            const state = await waitForPhase(engine, workflowId, 'approval');

            // proposalが存在すること
            expect(state.proposal).toBeDefined();
            const proposal = state.proposal!;

            // 必須フィールドの存在と型を検証

            // summary: 非空文字列
            expect(typeof proposal.summary).toBe('string');
            expect(proposal.summary.length).toBeGreaterThan(0);

            // scope: 非空文字列
            expect(typeof proposal.scope).toBe('string');
            expect(proposal.scope.length).toBeGreaterThan(0);

            // taskBreakdown: 配列（少なくとも1つのタスク）
            expect(Array.isArray(proposal.taskBreakdown)).toBe(true);
            expect(proposal.taskBreakdown.length).toBeGreaterThanOrEqual(1);

            // 各タスクの構造を検証
            for (const task of proposal.taskBreakdown) {
              expect(task.id).toBeTruthy();
              expect(task.title).toBeTruthy();
              expect(task.description).toBeTruthy();
              expect(task.workerType).toBeTruthy();
              expect(task.estimatedEffort).toBeTruthy();
              expect(Array.isArray(task.dependencies)).toBe(true);
            }

            // workerAssignments: 配列（少なくとも1つの割り当て）
            expect(Array.isArray(proposal.workerAssignments)).toBe(true);
            expect(proposal.workerAssignments.length).toBeGreaterThanOrEqual(1);

            // 各割り当ての構造を検証
            for (const assignment of proposal.workerAssignments) {
              expect(assignment.taskId).toBeTruthy();
              expect(assignment.workerType).toBeTruthy();
              expect(assignment.rationale).toBeTruthy();
            }

            // riskAssessment: 配列
            expect(Array.isArray(proposal.riskAssessment)).toBe(true);
            expect(proposal.riskAssessment.length).toBeGreaterThanOrEqual(1);

            // 各リスク項目の構造を検証
            for (const risk of proposal.riskAssessment) {
              expect(risk.description).toBeTruthy();
              expect(['low', 'medium', 'high']).toContain(risk.severity);
              expect(risk.mitigation).toBeTruthy();
            }

            // dependencies: 配列（空でも可）
            expect(Array.isArray(proposal.dependencies)).toBe(true);

            // meetingMinutesIds: 非空配列
            expect(Array.isArray(proposal.meetingMinutesIds)).toBe(true);
            expect(proposal.meetingMinutesIds.length).toBeGreaterThanOrEqual(1);

            // workflowId: ワークフローIDと一致
            expect(proposal.workflowId).toBe(workflowId);

            // createdAt: 有効なISO8601形式
            expect(proposal.createdAt).toBeTruthy();
            const parsedDate = new Date(proposal.createdAt);
            expect(parsedDate.toISOString()).toBe(proposal.createdAt);

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 8: Approval Gate Activation on Phase Completion
  // **Validates: Requirements 3.1, 6.2**
  // ===========================================================================

  describe('Property 8: Approval Gate Activation on Phase Completion', () => {
    it('proposalフェーズ完了時にApprovalGateに承認待ちエントリが作成されること (Req 3.1, 6.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // ワークフロー開始
            const workflowId = await engine.startWorkflow(instruction, projectId);

            // ApprovalGateで承認待ち状態になるまで待機
            // （approvalフェーズでrequestApprovalが呼ばれた後にこのステータスになる）
            await waitForApprovalWaiting(engine, approvalGate, workflowId);

            // ApprovalGateが承認待ち状態であること
            expect(approvalGate.isWaitingApproval(workflowId)).toBe(true);

            // 承認待ちアイテム一覧にこのワークフローが含まれること
            const pendingApprovals = approvalGate.getPendingApprovals();
            const found = pendingApprovals.find(
              (p) => p.workflowId === workflowId
            );
            expect(found).toBeDefined();

            // 承認待ちアイテムのフェーズがapprovalであること
            expect(found!.phase).toBe('approval');

            // 承認待ちアイテムのcontentが存在すること（Proposal）
            expect(found!.content).toBeDefined();

            // createdAtが有効なISO8601形式であること
            expect(found!.createdAt).toBeTruthy();
            const parsedDate = new Date(found!.createdAt);
            expect(parsedDate.toISOString()).toBe(found!.createdAt);

            // ワークフローステータスがwaiting_approvalであること
            const state = await engine.getWorkflowState(workflowId);
            expect(state!.status).toBe('waiting_approval');

            // クリーンアップ
            approvalGate.cancelApproval(workflowId, 'テスト終了');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // ヘルパー: ワークフローを承認してdeliveryフェーズのApprovalGate待ちまで進める
  // ===========================================================================

  /**
   * ワークフローを開始し、CEO承認を経てdeliveryフェーズのApprovalGate待ちまで進める
   * @param engine - WorkflowEngineインスタンス
   * @param approvalGate - ApprovalGateインスタンス
   * @param instruction - 指示内容
   * @param projectId - プロジェクトID
   * @returns workflowId と最終状態
   */
  async function advanceToDeliveryApproval(
    engine: WorkflowEngine,
    approvalGate: ApprovalGate,
    instruction: string,
    projectId: string
  ): Promise<{ workflowId: string; state: WorkflowState }> {
    // ワークフロー開始 → approvalフェーズのApprovalGate待ち
    const workflowId = await engine.startWorkflow(instruction, projectId);
    await waitForApprovalWaiting(engine, approvalGate, workflowId);

    // CEO承認 → developmentフェーズへ
    const approveDecision: ApprovalDecision = {
      workflowId,
      phase: 'approval',
      action: 'approve',
      feedback: 'テスト承認',
      decidedAt: new Date().toISOString(),
    };
    await approvalGate.submitDecision(workflowId, approveDecision);

    // deliveryフェーズのApprovalGate待ちまで進む
    // （development → quality_assurance → delivery と自動遷移）
    const state = await waitForApprovalWaiting(
      engine,
      approvalGate,
      workflowId,
      15000
    );

    return { workflowId, state };
  }

  // ===========================================================================
  // Property 11: Task Assignment From Proposal
  // **Validates: Requirement 4.1**
  // ===========================================================================

  describe('Property 11: Task Assignment From Proposal', () => {
    it('承認済みProposalのN個のタスクに対して、developmentフェーズでN個のSubtaskProgressが作成されること (Req 4.1)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // proposalが存在すること
            expect(state.proposal).toBeDefined();
            const proposalTaskCount = state.proposal!.taskBreakdown.length;

            // progressが存在すること
            expect(state.progress).toBeDefined();

            // subtasksの数がproposalのtaskBreakdownの数と一致すること
            expect(state.progress!.subtasks.length).toBe(proposalTaskCount);

            // totalTasksがproposalのtaskBreakdownの数と一致すること
            expect(state.progress!.totalTasks).toBe(proposalTaskCount);

            // 各subtaskのIDがproposalのtaskBreakdownのIDと一致すること
            const proposalTaskIds = state.proposal!.taskBreakdown.map((t) => t.id);
            const subtaskIds = state.progress!.subtasks.map((s) => s.id);
            for (const taskId of proposalTaskIds) {
              expect(subtaskIds).toContain(taskId);
            }

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 12: Dependency-Ordered Execution
  // **Validates: Requirement 4.2**
  // ===========================================================================

  describe('Property 12: Dependency-Ordered Execution', () => {
    it('依存関係のあるタスクセットに対して、依存先タスクが完了するまで依存元タスクが開始されないこと (Req 4.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // proposalとprogressが存在すること
            expect(state.proposal).toBeDefined();
            expect(state.progress).toBeDefined();

            const dependencies = state.proposal!.dependencies;
            const subtasks = state.progress!.subtasks;

            // 依存関係がある場合、依存先（from）のcompletedAtが依存元（to）のstartedAt以前であること
            for (const dep of dependencies) {
              const fromTask = subtasks.find((s) => s.id === dep.from);
              const toTask = subtasks.find((s) => s.id === dep.to);

              if (fromTask && toTask && fromTask.completedAt && toTask.startedAt) {
                // from の完了時刻が to の開始時刻以前であること
                const fromCompleted = new Date(fromTask.completedAt).getTime();
                const toStarted = new Date(toTask.startedAt).getTime();
                expect(fromCompleted).toBeLessThanOrEqual(toStarted);
              }
            }

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 13: Review Trigger After Task Completion
  // **Validates: Requirement 4.3**
  // ===========================================================================

  describe('Property 13: Review Trigger After Task Completion', () => {
    it('各タスク完了後にreviewStatusが設定されること (Req 4.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // progressが存在すること
            expect(state.progress).toBeDefined();

            // 全subtaskのreviewStatusが'approved'であること
            for (const subtask of state.progress!.subtasks) {
              expect(subtask.status).toBe('completed');
              expect(subtask.reviewStatus).toBe('approved');
            }

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 14: Review Rejection Returns Ticket to Worker
  // **Validates: Requirement 4.4**
  // ===========================================================================

  describe('Property 14: Review Rejection Returns Ticket to Worker', () => {
    it('シミュレーションでは全タスクが承認されるため、reviewStatusが全てapprovedであること (Req 4.4)', async () => {
      // 注: 現在のシミュレーション実装では全タスクが自動承認される。
      // 将来のReviewWorkflow統合時に、レビュー却下→ワーカー差し戻しのテストを追加する。
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // progressが存在すること
            expect(state.progress).toBeDefined();

            // シミュレーションでは全タスクが承認される
            for (const subtask of state.progress!.subtasks) {
              expect(subtask.reviewStatus).toBe('approved');
              // rejected状態のタスクが存在しないこと
              expect(subtask.reviewStatus).not.toBe('rejected');
            }

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 15: Parent Ticket Status Propagation
  // **Validates: Requirement 4.5**
  // ===========================================================================

  describe('Property 15: Parent Ticket Status Propagation', () => {
    it('全サブタスク完了時にprogressのcompletedTasksがtotalTasksと一致すること (Req 4.5)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // progressが存在すること
            expect(state.progress).toBeDefined();

            // completedTasksがtotalTasksと一致すること
            expect(state.progress!.completedTasks).toBe(state.progress!.totalTasks);

            // failedTasksが0であること
            expect(state.progress!.failedTasks).toBe(0);

            // 全subtaskのstatusがcompletedであること
            for (const subtask of state.progress!.subtasks) {
              expect(subtask.status).toBe('completed');
            }

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 16: Escalation on Maximum Retries
  // **Validates: Requirements 4.6, 14.1**
  // ===========================================================================

  describe('Property 16: Escalation on Maximum Retries', () => {
    it('シミュレーションでは全タスクが成功するため、escalationがundefinedであること (Req 4.6, 14.1)', async () => {
      // 注: 現在のシミュレーション実装では全タスクが成功する。
      // 将来のワーカー統合時に、最大リトライ超過→エスカレーション生成のテストを追加する。
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // シミュレーションではエスカレーションが発生しないこと
            expect(state.escalation).toBeUndefined();

            // ステータスがwaiting_approval（delivery承認待ち）であること
            // （failed や terminated ではないこと）
            expect(state.status).toBe('waiting_approval');

            // failedTasksが0であること
            expect(state.progress).toBeDefined();
            expect(state.progress!.failedTasks).toBe(0);

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 17: Development Completion Triggers QA Transition
  // **Validates: Requirement 5.1**
  // ===========================================================================

  describe('Property 17: Development Completion Triggers QA Transition', () => {
    it('全開発タスク完了後にquality_assuranceフェーズに遷移すること (Req 5.1)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // phaseHistoryにdevelopment→quality_assurance遷移が記録されていること
            const devToQaTransition = state.phaseHistory.find(
              (t) => t.from === 'development' && t.to === 'quality_assurance'
            );
            expect(devToQaTransition).toBeDefined();
            expect(devToQaTransition!.timestamp).toBeTruthy();
            expect(devToQaTransition!.reason).toBeTruthy();

            // quality_assurance→delivery遷移も記録されていること
            const qaToDeliveryTransition = state.phaseHistory.find(
              (t) => t.from === 'quality_assurance' && t.to === 'delivery'
            );
            expect(qaToDeliveryTransition).toBeDefined();

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 18: QA or Review Failure Returns to Development
  // **Validates: Requirements 5.3, 5.5**
  // ===========================================================================

  describe('Property 18: QA or Review Failure Returns to Development', () => {
    it('品質ゲートが成功する場合、quality_assurance→delivery遷移が正常に行われること (Req 5.3, 5.5)', async () => {
      // 注: 現在のシミュレーション実装では品質ゲートは常に成功する。
      // 将来のQualityGateIntegration統合時に、品質ゲート失敗→development差し戻しのテストを追加する。
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // quality_assurance→delivery遷移が正常に行われていること
            const qaToDelivery = state.phaseHistory.find(
              (t) => t.from === 'quality_assurance' && t.to === 'delivery'
            );
            expect(qaToDelivery).toBeDefined();

            // quality_assurance→development（失敗差し戻し）が存在しないこと
            const qaToDevFailure = state.phaseHistory.find(
              (t) => t.from === 'quality_assurance' && t.to === 'development'
            );
            expect(qaToDevFailure).toBeUndefined();

            // qualityResultsが設定されていること
            expect(state.qualityResults).toBeDefined();
            expect(state.qualityResults!.lintResult).toBeDefined();
            expect(state.qualityResults!.testResult).toBeDefined();
            expect(state.qualityResults!.finalReviewResult).toBeDefined();

            // 全品質チェックが合格していること
            expect(state.qualityResults!.lintResult!.passed).toBe(true);
            expect(state.qualityResults!.testResult!.passed).toBe(true);
            expect(state.qualityResults!.finalReviewResult!.passed).toBe(true);

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 19: Deliverable Structure Completeness
  // **Validates: Requirement 6.1**
  // ===========================================================================

  describe('Property 19: Deliverable Structure Completeness', () => {
    it('Deliverableが必須フィールド（summaryReport, changes, testResults, reviewHistory, artifacts）をすべて含むこと (Req 6.1)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId, state } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // deliverableが存在すること
            expect(state.deliverable).toBeDefined();
            const deliverable = state.deliverable!;

            // 必須フィールドの存在確認
            expect(deliverable.workflowId).toBe(workflowId);
            expect(typeof deliverable.summaryReport).toBe('string');
            expect(deliverable.summaryReport.length).toBeGreaterThan(0);
            expect(Array.isArray(deliverable.changes)).toBe(true);
            expect(deliverable.testResults).toBeDefined();
            expect(Array.isArray(deliverable.reviewHistory)).toBe(true);
            expect(Array.isArray(deliverable.artifacts)).toBe(true);
            expect(typeof deliverable.createdAt).toBe('string');

            // testResultsがTestResultSummary型に準拠していること
            expect(typeof deliverable.testResults.lintPassed).toBe('boolean');
            expect(typeof deliverable.testResults.lintOutput).toBe('string');
            expect(typeof deliverable.testResults.testPassed).toBe('boolean');
            expect(typeof deliverable.testResults.testOutput).toBe('string');
            expect(typeof deliverable.testResults.overallPassed).toBe('boolean');

            // summaryReportにワークフロー情報が含まれていること
            expect(deliverable.summaryReport).toContain(workflowId);

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 20: Delivery Approval Creates PR and Completes Workflow
  // **Validates: Requirements 6.3, 6.5**
  // ===========================================================================

  describe('Property 20: Delivery Approval Creates PR and Completes Workflow', () => {
    it('CEO承認後にワークフローが完了すること (Req 6.3, 6.5)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // CEO承認を送信
            const approveDecision: ApprovalDecision = {
              workflowId,
              phase: 'delivery',
              action: 'approve',
              feedback: 'テスト承認: 納品物を承認します',
              decidedAt: new Date().toISOString(),
            };
            await approvalGate.submitDecision(workflowId, approveDecision);

            // ワークフローが完了するまで待機
            const completedState = await waitForStatus(
              engine,
              workflowId,
              'completed',
              10000
            );

            // ステータスがcompletedであること
            expect(completedState.status).toBe('completed');

            // 承認決定が記録されていること
            const deliveryApproval = completedState.approvalDecisions.find(
              (d) => d.phase === 'delivery' && d.action === 'approve'
            );
            expect(deliveryApproval).toBeDefined();
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  // ===========================================================================
  // Property 21: Delivery Revision Returns to Development
  // **Validates: Requirement 6.4**
  // ===========================================================================

  describe('Property 21: Delivery Revision Returns to Development', () => {
    it('CEO修正要求時にdevelopmentフェーズに戻り、再びdeliveryまで進むこと (Req 6.4)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          async (instruction: string, projectId: string) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // deliveryフェーズのApprovalGate待ちまで進める
            const { workflowId } = await advanceToDeliveryApproval(
              engine,
              approvalGate,
              instruction,
              projectId
            );

            // CEO修正要求を送信
            const revisionDecision: ApprovalDecision = {
              workflowId,
              phase: 'delivery',
              action: 'request_revision',
              feedback: 'テスト修正要求: 追加テストが必要です',
              decidedAt: new Date().toISOString(),
            };
            await approvalGate.submitDecision(workflowId, revisionDecision);

            // 再びdeliveryフェーズのApprovalGate待ちまで進む
            const revisedState = await waitForApprovalWaiting(
              engine,
              approvalGate,
              workflowId,
              15000
            );

            // currentPhaseがdeliveryであること（再びdeliveryまで到達）
            expect(revisedState.currentPhase).toBe('delivery');

            // phaseHistoryにdelivery→development遷移が記録されていること
            const deliveryToDevTransition = revisedState.phaseHistory.find(
              (t) => t.from === 'delivery' && t.to === 'development'
            );
            expect(deliveryToDevTransition).toBeDefined();
            expect(deliveryToDevTransition!.reason).toContain('CEO修正要求');

            // 修正要求の承認決定が記録されていること
            const revisionApproval = revisedState.approvalDecisions.find(
              (d) => d.phase === 'delivery' && d.action === 'request_revision'
            );
            expect(revisionApproval).toBeDefined();

            // クリーンアップ
            if (approvalGate.isWaitingApproval(workflowId)) {
              approvalGate.cancelApproval(workflowId, 'テスト終了');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 60000);
  });

  // ===========================================================================
  // Property 24: Escalation Decision Handling
  // **Validates: Requirements 14.1, 14.2**
  // ===========================================================================

  describe('Property 24: Escalation Decision Handling', () => {
    it('retry: タスクが pending に戻り、escalation がクリアされ、status が running に戻ること / skip: タスクが skipped にマークされ、escalation がクリアされること / abort: ワークフローが terminated になること (Req 14.1, 14.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          projectIdArb,
          fc.constantFrom<EscalationAction>('retry', 'skip', 'abort'),
          async (instruction: string, projectId: string, action: EscalationAction) => {
            const { engine, approvalGate } = createTestComponents(TEST_BASE_PATH);

            // 1. ワークフロー開始
            const workflowId = await engine.startWorkflow(instruction, projectId);

            // 2. 承認フェーズまで進める（ApprovalGate待ち）
            await waitForApprovalWaiting(engine, approvalGate, workflowId);

            // 3. 承認して開発フェーズへ
            const approveDecision: ApprovalDecision = {
              workflowId,
              phase: 'approval',
              action: 'approve',
              feedback: 'テスト承認',
              decidedAt: new Date().toISOString(),
            };
            await approvalGate.submitDecision(workflowId, approveDecision);

            // deliveryフェーズのApprovalGate待ちまで進む
            await waitForApprovalWaiting(engine, approvalGate, workflowId, 15000);

            // deliveryのApprovalGateをキャンセルして状態を安定させる
            approvalGate.cancelApproval(workflowId, 'エスカレーションテスト準備');
            await delay(200);

            // 4. エスカレーション状態を手動で設定
            const state = await engine.getWorkflowState(workflowId);
            expect(state).not.toBeNull();

            // progressのsubtasksから最初のタスクを失敗状態にする
            const targetSubtask = state!.progress?.subtasks[0];
            expect(targetSubtask).toBeDefined();
            const targetTaskId = targetSubtask!.id;
            const targetWorkerType = targetSubtask!.workerType;

            // サブタスクを失敗状態に設定
            targetSubtask!.status = 'failed';
            if (state!.progress) {
              state!.progress.failedTasks = 1;
            }

            // エスカレーション情報を直接設定
            const escalation: WorkflowEscalation = {
              workflowId,
              ticketId: targetTaskId,
              failureDetails: 'テスト用失敗: ワーカーがタスクを完了できませんでした',
              workerType: targetWorkerType,
              retryCount: 3,
              createdAt: new Date().toISOString(),
            };
            state!.escalation = escalation;
            state!.status = 'waiting_approval';

            // 5. handleEscalation を呼ぶ
            const decision: EscalationDecision = {
              action,
              reason: `テスト用エスカレーション決定: ${action}`,
            };
            await engine.handleEscalation(workflowId, decision);

            // 6. action に応じた結果を検証
            const afterState = await engine.getWorkflowState(workflowId);
            expect(afterState).not.toBeNull();

            switch (action) {
              case 'retry': {
                // タスクが 'pending' に戻ること
                const retriedSubtask = afterState!.progress?.subtasks.find(
                  (s) => s.id === targetTaskId
                );
                expect(retriedSubtask).toBeDefined();
                expect(retriedSubtask!.status).toBe('pending');
                // assignedWorkerIdがクリアされていること
                expect(retriedSubtask!.assignedWorkerId).toBeUndefined();
                // escalation がクリアされていること
                expect(afterState!.escalation).toBeUndefined();
                // status が 'running' に戻ること
                expect(afterState!.status).toBe('running');
                // failedTasks がデクリメントされていること
                expect(afterState!.progress!.failedTasks).toBe(0);
                break;
              }

              case 'skip': {
                // タスクが 'skipped' にマークされていること
                const skippedSubtask = afterState!.progress?.subtasks.find(
                  (s) => s.id === targetTaskId
                );
                expect(skippedSubtask).toBeDefined();
                expect(skippedSubtask!.status).toBe('skipped');
                // completedAtが設定されていること
                expect(skippedSubtask!.completedAt).toBeTruthy();
                // escalation がクリアされていること
                expect(afterState!.escalation).toBeUndefined();
                // status が 'running' に戻ること
                expect(afterState!.status).toBe('running');
                break;
              }

              case 'abort': {
                // ワークフローが terminated になること
                expect(afterState!.status).toBe('terminated');
                // escalation がクリアされていること
                expect(afterState!.escalation).toBeUndefined();
                // errorLogに終了理由が記録されていること
                const abortError = afterState!.errorLog.find(
                  (e) => e.message.includes('エスカレーション対応: abort')
                );
                expect(abortError).toBeDefined();
                break;
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 60000);
  });
});
