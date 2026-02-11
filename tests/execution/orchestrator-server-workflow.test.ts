/**
 * OrchestratorServer ワークフローAPI ユニットテスト
 *
 * ワークフロー関連のHTTPエンドポイントをテストする。
 * WorkflowEngine/ApprovalGateの実インスタンスを使用し、
 * HTTPリクエスト/レスポンスをシミュレートする。
 *
 * @module tests/execution/orchestrator-server-workflow.test
 * @see Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs/promises';
import {
  OrchestratorServer,
  createOrchestratorServer,
} from '../../tools/cli/lib/execution/orchestrator-server';
import {
  WorkflowEngine,
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
import { createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { createOrchestrator } from '../../tools/cli/lib/execution/orchestrator';
import { createTicketManager } from '../../tools/cli/lib/execution/ticket-manager';
import { createAIHealthChecker } from '../../tools/cli/lib/execution/ai-health-checker';
import { createSettingsManager } from '../../tools/cli/lib/execution/settings-manager';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_BUS_PATH = 'runtime/test-server-wf-bus';
const TEST_RUNS_PATH = 'runtime/test-server-wf-runs';

/** テスト用ポート（テスト間で競合しないよう大きめの値） */
const TEST_PORT = 19876;

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
 * HTTPリクエストを送信するヘルパー
 * @param port - サーバーポート
 * @param method - HTTPメソッド
 * @param urlPath - リクエストパス
 * @param body - リクエストボディ（オプション）
 * @returns レスポンスのステータスコードとボディ
 */
function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode ?? 500, body: parsed });
        } catch {
          resolve({ status: res.statusCode ?? 500, body: {} });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * ワークフローが指定フェーズに到達するまでポーリング
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
 * ApprovalGateのpendingResolverが登録されるまで待機
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
    const pending = gate.getPendingApprovals();
    const hasPending = pending.some((p) => p.workflowId === workflowId);
    if (state?.status === 'waiting_approval' && hasPending) return;
    await delay(50);
  }
}

// =============================================================================
// テストスイート
// =============================================================================

describe('OrchestratorServer ワークフローAPI', () => {
  let server: OrchestratorServer;
  let engine: WorkflowEngine;
  let gate: ApprovalGate;
  let port: number;

  beforeEach(async () => {
    // テスト用ディレクトリ作成
    await fs.mkdir(TEST_BUS_PATH, { recursive: true });
    await fs.mkdir(TEST_RUNS_PATH, { recursive: true });

    // コンポーネント初期化
    const agentBus = createAgentBus({
      messageQueueConfig: { type: 'file', basePath: TEST_BUS_PATH },
      runtimeBasePath: TEST_RUNS_PATH,
    });
    const coordinator = createMeetingCoordinator(agentBus, TEST_RUNS_PATH);
    gate = createApprovalGate(TEST_RUNS_PATH);
    engine = createWorkflowEngine(coordinator, gate, TEST_RUNS_PATH);

    port = TEST_PORT;

    // サーバー起動
    server = createOrchestratorServer({
      port,
      orchestrator: createOrchestrator(),
      ticketManager: createTicketManager(),
      aiHealthChecker: createAIHealthChecker(),
      settingsManager: createSettingsManager(),
      workflowEngine: engine,
      approvalGate: gate,
      meetingCoordinator: coordinator,
    });

    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    // サーバー停止を待つ
    await delay(100);
    await cleanupDirectory(TEST_BUS_PATH);
    await cleanupDirectory(TEST_RUNS_PATH);
  });

  // ===========================================================================
  // POST /api/workflows - ワークフロー開始
  // @see Requirement 15.1
  // ===========================================================================

  describe('POST /api/workflows', () => {
    it('正常にワークフローを開始できる', async () => {
      const res = await httpRequest(port, 'POST', '/api/workflows', {
        instruction: 'テスト機能を実装してください',
        projectId: 'project-test-001',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect((res.body.data as Record<string, unknown>).workflowId).toBeDefined();
      expect(typeof (res.body.data as Record<string, unknown>).workflowId).toBe('string');
    });

    it('instruction が未指定の場合400エラー', async () => {
      const res = await httpRequest(port, 'POST', '/api/workflows', {
        projectId: 'project-test-001',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('projectId が未指定の場合400エラー', async () => {
      const res = await httpRequest(port, 'POST', '/api/workflows', {
        instruction: 'テスト機能を実装してください',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // GET /api/workflows - ワークフロー一覧
  // @see Requirement 15.2
  // ===========================================================================

  describe('GET /api/workflows', () => {
    it('空の一覧を取得できる', async () => {
      const res = await httpRequest(port, 'GET', '/api/workflows');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(Array.isArray(data.workflows)).toBe(true);
      expect((data.workflows as unknown[]).length).toBe(0);
    });

    it('ワークフロー開始後に一覧に含まれる', async () => {
      // ワークフロー開始
      await engine.startWorkflow('テスト指示', 'project-001');

      const res = await httpRequest(port, 'GET', '/api/workflows');

      expect(res.status).toBe(200);
      const data = res.body.data as Record<string, unknown>;
      expect((data.workflows as unknown[]).length).toBe(1);
    });

    it('statusフィルタで絞り込みできる', async () => {
      // ワークフロー開始（running状態になる）
      await engine.startWorkflow('テスト指示', 'project-001');

      // completedフィルタ → 0件
      const res = await httpRequest(port, 'GET', '/api/workflows?status=completed');

      expect(res.status).toBe(200);
      const data = res.body.data as Record<string, unknown>;
      expect((data.workflows as unknown[]).length).toBe(0);
    });
  });

  // ===========================================================================
  // GET /api/workflows/:id - ワークフロー状態取得
  // @see Requirement 15.3
  // ===========================================================================

  describe('GET /api/workflows/:id', () => {
    it('存在するワークフローの状態を取得できる', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      // 承認待ちまで待機（proposalフェーズ完了を確実に待つ）
      await waitForApprovalWaiting(engine, workflowId, gate);

      const res = await httpRequest(port, 'GET', `/api/workflows/${workflowId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.workflow).toBeDefined();
      const workflow = data.workflow as Record<string, unknown>;
      expect(workflow.workflowId).toBe(workflowId);
      expect(workflow.projectId).toBe('project-001');
    });

    it('存在しないワークフローは404', async () => {
      const res = await httpRequest(port, 'GET', '/api/workflows/nonexistent-id');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  // ===========================================================================
  // POST /api/workflows/:id/approve - CEO承認決定送信
  // @see Requirement 15.4
  // ===========================================================================

  describe('POST /api/workflows/:id/approve', () => {
    it('承認待ちワークフローを承認できる', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      // 承認待ちまで待機
      await waitForApprovalWaiting(engine, workflowId, gate);

      const res = await httpRequest(port, 'POST', `/api/workflows/${workflowId}/approve`, {
        action: 'approve',
        feedback: '承認します',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('action が未指定の場合400エラー', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      await waitForApprovalWaiting(engine, workflowId, gate);

      const res = await httpRequest(port, 'POST', `/api/workflows/${workflowId}/approve`, {
        feedback: 'フィードバックのみ',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('存在しないワークフローは404', async () => {
      const res = await httpRequest(port, 'POST', '/api/workflows/nonexistent/approve', {
        action: 'approve',
      });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // GET /api/workflows/:id/proposal - 提案書取得
  // @see Requirement 15.5
  // ===========================================================================

  describe('GET /api/workflows/:id/proposal', () => {
    it('提案書を取得できる', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      // 承認フェーズまで待機（提案書が生成される）
      await waitForApprovalWaiting(engine, workflowId, gate);

      const res = await httpRequest(port, 'GET', `/api/workflows/${workflowId}/proposal`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      // 提案書が存在する
      expect(data.proposal).toBeDefined();
    });

    it('存在しないワークフローは404', async () => {
      const res = await httpRequest(port, 'GET', '/api/workflows/nonexistent/proposal');

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // GET /api/workflows/:id/deliverable - 納品物取得
  // @see Requirement 15.6
  // ===========================================================================

  describe('GET /api/workflows/:id/deliverable', () => {
    it('納品物がない場合はnullを返す', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      await waitForPhase(engine, workflowId, 'approval');

      const res = await httpRequest(port, 'GET', `/api/workflows/${workflowId}/deliverable`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.deliverable).toBeNull();
    });

    it('存在しないワークフローは404', async () => {
      const res = await httpRequest(port, 'GET', '/api/workflows/nonexistent/deliverable');

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // GET /api/workflows/:id/meetings - 会議録一覧取得
  // @see Requirement 15.7
  // ===========================================================================

  describe('GET /api/workflows/:id/meetings', () => {
    it('会議録ID一覧を取得できる', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      await waitForApprovalWaiting(engine, workflowId, gate);

      const res = await httpRequest(port, 'GET', `/api/workflows/${workflowId}/meetings`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(Array.isArray(data.meetingMinutesIds)).toBe(true);
    });

    it('存在しないワークフローは404', async () => {
      const res = await httpRequest(port, 'GET', '/api/workflows/nonexistent/meetings');

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // POST /api/workflows/:id/escalation - エスカレーション決定送信
  // @see Requirement 15.8
  // ===========================================================================

  describe('POST /api/workflows/:id/escalation', () => {
    it('action が未指定の場合400エラー', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      await waitForPhase(engine, workflowId, 'approval');

      const res = await httpRequest(port, 'POST', `/api/workflows/${workflowId}/escalation`, {
        reason: '理由のみ',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // POST /api/workflows/:id/rollback - フェーズロールバック
  // @see Requirement 15.9
  // ===========================================================================

  describe('POST /api/workflows/:id/rollback', () => {
    it('targetPhase が未指定の場合400エラー', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      await waitForPhase(engine, workflowId, 'approval');

      const res = await httpRequest(port, 'POST', `/api/workflows/${workflowId}/rollback`, {});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // GET /api/workflows/:id/progress - 開発進捗取得
  // @see Requirement 15.10
  // ===========================================================================

  describe('GET /api/workflows/:id/progress', () => {
    it('進捗情報を取得できる', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      await waitForPhase(engine, workflowId, 'approval');

      const res = await httpRequest(port, 'GET', `/api/workflows/${workflowId}/progress`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.progress).toBeDefined();
    });
  });

  // ===========================================================================
  // GET /api/workflows/:id/quality - 品質結果取得
  // @see Requirement 15.11
  // ===========================================================================

  describe('GET /api/workflows/:id/quality', () => {
    it('品質結果を取得できる', async () => {
      const workflowId = await engine.startWorkflow('テスト指示', 'project-001');
      await waitForPhase(engine, workflowId, 'approval');

      const res = await httpRequest(port, 'GET', `/api/workflows/${workflowId}/quality`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.quality).toBeDefined();
    });
  });

  // ===========================================================================
  // アクセサメソッド
  // ===========================================================================

  describe('アクセサメソッド', () => {
    it('getWorkflowEngine でエンジンを取得できる', () => {
      const serverEngine = server.getWorkflowEngine();
      expect(serverEngine).toBe(engine);
    });

    it('getApprovalGate でゲートを取得できる', () => {
      const serverGate = server.getApprovalGate();
      expect(serverGate).toBe(gate);
    });
  });

  // ===========================================================================
  // 404 ルーティング
  // ===========================================================================

  describe('不明なエンドポイント', () => {
    it('存在しないパスは404', async () => {
      const res = await httpRequest(port, 'GET', '/api/unknown');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});
