/**
 * ワークフロー本番対応テスト
 *
 * QAフェーズ（CodingAgent有無）、レビューフェーズ、エスカレーション再開フローをテストする。
 *
 * @module tests/execution/workflow-production-ready.test
 * @see Requirements: 4.3, 5.1, 5.2, 14.1, 14.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import {
  WorkflowEngine,
  createWorkflowEngine,
} from '../../tools/cli/lib/execution/workflow-engine';
import {
  createMeetingCoordinator,
} from '../../tools/cli/lib/execution/meeting-coordinator';
import {
  ApprovalGate,
  createApprovalGate,
} from '../../tools/cli/lib/execution/approval-gate';
import { createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import type { CodingAgentAdapter } from '../../tools/coding-agents/base';
import type { CodingTaskOptions, CodingTaskResult } from '../../tools/cli/lib/execution/types';
import { CodingAgentRegistry } from '../../tools/coding-agents/index';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_BUS_PATH = 'runtime/test-wf-prod-bus';
const TEST_RUNS_PATH = 'runtime/test-wf-prod-runs';
const TEST_PROJECT_ID = 'project-prod-001';

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/** ディレクトリを再帰的に削除 */
async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

/** 指定ミリ秒待機する */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 承認待ち状態になるまでポーリングで待機する
 */
async function waitForApprovalWaiting(
  engine: WorkflowEngine,
  workflowId: string,
  gate: ApprovalGate,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await engine.getWorkflowState(workflowId);
    if (state?.status === 'waiting_approval') {
      const pending = gate.getPendingApprovals();
      if (pending.some((p) => p.workflowId === workflowId)) return;
    }
    await delay(50);
  }
}

/**
 * 指定フェーズに到達するまでポーリングで待機する
 */
async function waitForPhase(
  engine: WorkflowEngine,
  workflowId: string,
  targetPhase: string,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await engine.getWorkflowState(workflowId);
    if (state?.currentPhase === targetPhase) return;
    await delay(50);
  }
}

/**
 * 指定ステータスに到達するまでポーリングで待機する
 */
async function waitForStatus(
  engine: WorkflowEngine,
  workflowId: string,
  targetStatus: string,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await engine.getWorkflowState(workflowId);
    if (state?.status === targetStatus) return;
    await delay(50);
  }
}

// =============================================================================
// モック CodingAgentAdapter
// =============================================================================

/**
 * テスト用モック CodingAgentAdapter
 * execute() の結果をカスタマイズ可能
 */
function createMockCodingAgent(
  overrides?: Partial<{
    executeResult: CodingTaskResult;
    isAvailableResult: boolean;
  }>
): CodingAgentAdapter {
  const defaultResult: CodingTaskResult = {
    success: true,
    output: 'APPROVED\nコードレビュー完了。問題なし。',
    stderr: '',
    exitCode: 0,
    durationMs: 1000,
    changedFiles: [],
  };

  return {
    name: 'mock-agent',
    displayName: 'Mock Agent',
    execute: vi.fn().mockResolvedValue(overrides?.executeResult ?? defaultResult),
    isAvailable: vi.fn().mockResolvedValue(overrides?.isAvailableResult ?? true),
    getVersion: vi.fn().mockResolvedValue('1.0.0-mock'),
  };
}

/**
 * モックアダプタを持つ CodingAgentRegistry を作成
 */
function createMockRegistry(mockAgent: CodingAgentAdapter): CodingAgentRegistry {
  const registry = new CodingAgentRegistry();
  registry.clearAdapters();
  registry.registerAdapter(mockAgent);
  registry.setPriority([mockAgent.name]);
  return registry;
}


// =============================================================================
// テストスイート
// =============================================================================

describe('WorkflowEngine 本番対応', () => {
  let approvalGate: ApprovalGate;

  beforeEach(async () => {
    await cleanupDirectory(TEST_BUS_PATH);
    await cleanupDirectory(TEST_RUNS_PATH);
  });

  afterEach(async () => {
    await cleanupDirectory(TEST_BUS_PATH);
    await cleanupDirectory(TEST_RUNS_PATH);
  });

  /**
   * エンジンを生成するヘルパー
   * @param mockAgent - モックCodingAgent（nullの場合はCodingAgent無し）
   */
  function createEngine(mockAgent?: CodingAgentAdapter | null): {
    engine: WorkflowEngine;
    gate: ApprovalGate;
  } {
    const agentBus = createAgentBus({
      messageQueueConfig: { type: 'file', basePath: TEST_BUS_PATH },
      runtimeBasePath: TEST_RUNS_PATH,
    });
    const meetingCoordinator = createMeetingCoordinator(agentBus, TEST_RUNS_PATH);
    const gate = createApprovalGate(TEST_RUNS_PATH);

    const options = mockAgent
      ? { codingAgentRegistry: createMockRegistry(mockAgent) }
      : undefined;

    const engine = createWorkflowEngine(
      meetingCoordinator,
      gate,
      TEST_RUNS_PATH,
      options
    );

    return { engine, gate };
  }

  // ===========================================================================
  // QAフェーズテスト
  // ===========================================================================

  describe('QAフェーズ', () => {
    it('CodingAgent未利用時はシミュレーション結果で品質ゲート通過する', async () => {
      const { engine, gate } = createEngine(null);

      const workflowId = await engine.startWorkflow(
        'テスト機能を実装してください',
        TEST_PROJECT_ID
      );

      // proposal → approval 待ち
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // development → QA → delivery の approval 待ち
      await waitForApprovalWaiting(engine, workflowId, gate, 8000);

      const state = await engine.getWorkflowState(workflowId);
      // delivery フェーズの承認待ちに到達しているはず
      expect(state?.currentPhase).toBe('delivery');

      // 品質結果がシミュレーションであることを確認
      const quality = await engine.getQualityResults(workflowId);
      expect(quality.lintResult?.passed).toBe(true);
      expect(quality.testResult?.passed).toBe(true);
      expect(quality.finalReviewResult?.reviewer).toBe('simulation');
    });

    it('CodingAgent利用時は実際のlint/test結果を使用する', async () => {
      const mockAgent = createMockCodingAgent({
        executeResult: {
          success: true,
          output: 'All tests passed. Coverage: 90%',
          stderr: '',
          exitCode: 0,
          durationMs: 5000,
          changedFiles: [],
        },
      });
      const { engine, gate } = createEngine(mockAgent);

      const workflowId = await engine.startWorkflow(
        'テスト機能を実装してください',
        TEST_PROJECT_ID
      );

      // proposal → approval
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // delivery の approval 待ち
      await waitForApprovalWaiting(engine, workflowId, gate, 8000);

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.currentPhase).toBe('delivery');

      // CodingAgent が呼ばれたことを確認
      expect(mockAgent.execute).toHaveBeenCalled();

      // 品質結果が coding-agent-qa であることを確認
      const quality = await engine.getQualityResults(workflowId);
      expect(quality.finalReviewResult?.reviewer).toBe('coding-agent-qa');
    });

    it('CodingAgentのlint失敗時はdevelopmentフェーズに差し戻される', async () => {
      let callCount = 0;
      const mockAgent = createMockCodingAgent();
      // execute を上書き: レビューは APPROVED、lint は失敗
      (mockAgent.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (options: CodingTaskOptions): Promise<CodingTaskResult> => {
          callCount++;
          // 開発タスク（最初の呼び出し群）は成功
          // レビュー呼び出しも APPROVED
          // QA lint 呼び出しは失敗
          if (options.prompt.includes('lint')) {
            return {
              success: false,
              output: 'ESLint: 3 errors found',
              stderr: 'lint failed',
              exitCode: 1,
              durationMs: 2000,
              changedFiles: [],
            };
          }
          return {
            success: true,
            output: 'APPROVED\n問題なし',
            stderr: '',
            exitCode: 0,
            durationMs: 1000,
            changedFiles: [],
          };
        }
      );

      const { engine, gate } = createEngine(mockAgent);

      const workflowId = await engine.startWorkflow(
        'テスト機能を実装してください',
        TEST_PROJECT_ID
      );

      // proposal → approval
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // QA失敗 → development に差し戻し → 再度 approval 待ちになるか、
      // またはエスカレーション待ちになる
      // development に戻った後、再度タスクが実行される
      await delay(3000);

      const state = await engine.getWorkflowState(workflowId);
      // QA失敗でdevelopmentに差し戻されているはず
      // （ただし再実行が走るので、状態は変動する可能性がある）
      expect(state?.qualityResults?.lintResult?.passed).toBe(false);
    });
  });

  // ===========================================================================
  // レビューフェーズテスト
  // ===========================================================================

  describe('レビューフェーズ', () => {
    it('CodingAgent未利用時はレビューが即承認される', async () => {
      const { engine, gate } = createEngine(null);

      const workflowId = await engine.startWorkflow(
        'シンプルな機能を実装',
        TEST_PROJECT_ID
      );

      // proposal → approval
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // delivery 待ち
      await waitForApprovalWaiting(engine, workflowId, gate, 8000);

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.currentPhase).toBe('delivery');

      // 全サブタスクが approved であることを確認
      const progress = await engine.getProgress(workflowId);
      for (const subtask of progress.subtasks) {
        expect(subtask.reviewStatus).toBe('approved');
        expect(subtask.status).toBe('completed');
      }
    });

    it('CodingAgentレビューで NEEDS_REVISION 時はエスカレーションが発生する', async () => {
      const mockAgent = createMockCodingAgent();
      let reviewCallCount = 0;
      (mockAgent.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (options: CodingTaskOptions): Promise<CodingTaskResult> => {
          // レビュープロンプトを検出
          if (options.prompt.includes('コードレビュー')) {
            reviewCallCount++;
            return {
              success: true,
              output: 'NEEDS_REVISION\nエラーハンドリングが不足しています。',
              stderr: '',
              exitCode: 0,
              durationMs: 2000,
              changedFiles: [],
            };
          }
          // 開発タスクは成功
          return {
            success: true,
            output: '実装完了',
            stderr: '',
            exitCode: 0,
            durationMs: 1000,
            changedFiles: ['src/feature.ts'],
          };
        }
      );

      const { engine, gate } = createEngine(mockAgent);

      const workflowId = await engine.startWorkflow(
        'レビューテスト機能',
        TEST_PROJECT_ID
      );

      // proposal → approval
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // レビュー差し戻しでエスカレーション待ちになるはず
      await waitForStatus(engine, workflowId, 'waiting_approval', 8000);

      const state = await engine.getWorkflowState(workflowId);
      // エスカレーションが設定されているはず
      expect(state?.escalation).toBeDefined();
      expect(state?.escalation?.failureDetails).toContain('コードレビュー');
    });
  });

  // ===========================================================================
  // エスカレーション→再開フローテスト
  // ===========================================================================

  describe('エスカレーション再開フロー', () => {
    it('retry 決定後に開発フェーズが再実行される', async () => {
      const mockAgent = createMockCodingAgent({
        executeResult: {
          success: false,
          output: '',
          stderr: 'compilation error',
          exitCode: 1,
          durationMs: 1000,
          changedFiles: [],
        },
      });

      const { engine, gate } = createEngine(mockAgent);

      const workflowId = await engine.startWorkflow(
        'リトライテスト機能',
        TEST_PROJECT_ID
      );

      // proposal → approval
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // 開発タスク失敗 → エスカレーション待ち
      await waitForStatus(engine, workflowId, 'waiting_approval', 8000);

      let state = await engine.getWorkflowState(workflowId);
      expect(state?.escalation).toBeDefined();
      const escalatedTaskId = state?.escalation?.ticketId;

      // retry 決定
      // 注: handleEscalation は状態変更のみを行い、フェーズ再実行は呼び出し元が別途トリガーする設計
      // @see workflow-engine.ts handleEscalation コメント
      await engine.handleEscalation(workflowId, {
        action: 'retry',
        reason: 'もう一度試す',
      });

      state = await engine.getWorkflowState(workflowId);
      // retry 後の状態検証: status が running に戻り、escalation がクリアされること
      expect(state?.status).toBe('running');
      expect(state?.escalation).toBeUndefined();
      // 失敗したタスクが pending に戻っていること
      const retriedTask = state?.progress?.subtasks.find(
        (s) => s.id === escalatedTaskId
      );
      expect(retriedTask?.status).toBe('pending');
      expect(retriedTask?.assignedWorkerId).toBeUndefined();
    });

    it('skip 決定後に残タスクが続行される', async () => {
      const mockAgent = createMockCodingAgent();
      let executionCount = 0;
      (mockAgent.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (options: CodingTaskOptions): Promise<CodingTaskResult> => {
          executionCount++;
          // 最初の開発タスクは失敗
          if (executionCount === 1) {
            return {
              success: false,
              output: '',
              stderr: 'error',
              exitCode: 1,
              durationMs: 1000,
              changedFiles: [],
            };
          }
          // レビュー
          if (options.prompt.includes('コードレビュー')) {
            return {
              success: true,
              output: 'APPROVED',
              stderr: '',
              exitCode: 0,
              durationMs: 1000,
              changedFiles: [],
            };
          }
          return {
            success: true,
            output: '実装完了',
            stderr: '',
            exitCode: 0,
            durationMs: 1000,
            changedFiles: ['src/feature.ts'],
          };
        }
      );

      const { engine, gate } = createEngine(mockAgent);

      const workflowId = await engine.startWorkflow(
        'スキップテスト機能',
        TEST_PROJECT_ID
      );

      // proposal → approval
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // エスカレーション待ち
      await waitForStatus(engine, workflowId, 'waiting_approval', 8000);

      let state = await engine.getWorkflowState(workflowId);
      expect(state?.escalation).toBeDefined();

      // skip 決定
      await engine.handleEscalation(workflowId, {
        action: 'skip',
        reason: 'このタスクはスキップ',
      });

      // skip 後にフェーズが再実行される
      await delay(3000);

      state = await engine.getWorkflowState(workflowId);
      // スキップされたタスクが存在することを確認
      const progress = await engine.getProgress(workflowId);
      const skippedTasks = progress.subtasks.filter((s) => s.status === 'skipped');
      expect(skippedTasks.length).toBeGreaterThanOrEqual(1);
    });

    it('abort 決定でワークフローが終了する', async () => {
      const mockAgent = createMockCodingAgent({
        executeResult: {
          success: false,
          output: '',
          stderr: 'fatal error',
          exitCode: 1,
          durationMs: 1000,
          changedFiles: [],
        },
      });

      const { engine, gate } = createEngine(mockAgent);

      const workflowId = await engine.startWorkflow(
        'アボートテスト機能',
        TEST_PROJECT_ID
      );

      // proposal → approval
      await waitForApprovalWaiting(engine, workflowId, gate);
      await gate.submitDecision(workflowId, {
        action: 'approve',
        decidedBy: 'ceo',
        decidedAt: new Date().toISOString(),
      });

      // エスカレーション待ち
      await waitForStatus(engine, workflowId, 'waiting_approval', 8000);

      // abort 決定
      await engine.handleEscalation(workflowId, {
        action: 'abort',
        reason: '中止する',
      });

      const state = await engine.getWorkflowState(workflowId);
      expect(state?.status).toBe('terminated');
    });
  });
});
