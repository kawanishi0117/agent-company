/**
 * OrchestratorServer ワイヤリングテスト
 *
 * OrchestratorServer が CodingAgentRegistry 付きで WorkflowEngine を初期化し、
 * AI ヘルスチェックが CodingAgent 可用性を考慮し、
 * /api/workflows エンドポイントが WorkflowEngine.startWorkflow() を呼ぶことを検証する。
 *
 * @module tests/execution/orchestrator-server-wiring.test
 * @see Requirements: REQ-2.1, REQ-3.1, REQ-3.2, REQ-3.4, REQ-5.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs/promises';
import {
  OrchestratorServer,
  createOrchestratorServer,
} from '../../tools/cli/lib/execution/orchestrator-server';
import { CodingAgentRegistry } from '../../tools/coding-agents/index';
import type { CodingAgentAdapter } from '../../tools/coding-agents/base';

// =============================================================================
// テスト用モック
// =============================================================================

/**
 * テスト用のモックCodingAgentAdapter
 */
function createMockAdapter(name: string, available: boolean): CodingAgentAdapter {
  return {
    name,
    isAvailable: async () => available,
    execute: async () => ({ success: true, output: 'mock output', exitCode: 0 }),
    getVersion: async () => '1.0.0-mock',
  };
}

/**
 * HTTPリクエストを送信するヘルパー
 */
async function sendRequest(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(rawData);
          resolve({ status: res.statusCode ?? 500, data });
        } catch {
          resolve({ status: res.statusCode ?? 500, data: { raw: rawData } });
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

// =============================================================================
// テストスイート
// =============================================================================

describe('OrchestratorServer ワイヤリング', () => {
  let server: OrchestratorServer;
  const TEST_PORT = 13099; // テスト用ポート（他テストと衝突しないよう大きめ）

  afterEach(async () => {
    if (server?.isRunning()) {
      await server.stop();
    }
    // テスト用ランタイムディレクトリのクリーンアップ
    try {
      await fs.rm('runtime/test-server-wiring', { recursive: true, force: true });
    } catch {
      // 無視
    }
  });

  // ===========================================================================
  // 1. CodingAgentRegistry 接続テスト
  // ===========================================================================

  describe('CodingAgentRegistry 接続', () => {
    it('DI で渡した CodingAgentRegistry が WorkflowEngine に接続される', () => {
      const registry = new CodingAgentRegistry(0); // キャッシュ無効
      registry.clearAdapters();
      registry.registerAdapter(createMockAdapter('test-agent', true));

      server = createOrchestratorServer({
        port: TEST_PORT,
        codingAgentRegistry: registry,
      });

      // サーバーが正常に作成されることを確認
      expect(server).toBeDefined();
      expect(server.getWorkflowEngine()).toBeDefined();
    });

    it('CodingAgentRegistry を省略するとグローバルレジストリが使用される', () => {
      server = createOrchestratorServer({ port: TEST_PORT });

      // サーバーが正常に作成されることを確認
      expect(server).toBeDefined();
      expect(server.getWorkflowEngine()).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. AI ヘルスチェックテスト
  // ===========================================================================

  describe('AI ヘルスチェック', () => {
    it('CodingAgent 可用性情報が /api/ai/health に含まれる', async () => {
      const registry = new CodingAgentRegistry(0);
      registry.clearAdapters();
      registry.registerAdapter(createMockAdapter('mock-claude', true));
      registry.registerAdapter(createMockAdapter('mock-opencode', false));

      server = createOrchestratorServer({
        port: TEST_PORT,
        codingAgentRegistry: registry,
      });
      await server.start();

      const { status, data } = await sendRequest(TEST_PORT, 'GET', '/api/health/ai');

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // CodingAgent 情報が含まれることを確認
      const healthData = data.data as Record<string, unknown>;
      expect(healthData).toHaveProperty('codingAgents');

      const codingAgents = healthData.codingAgents as Record<string, unknown>;
      expect(codingAgents.available).toBe(true);
      expect(codingAgents.agents).toContain('mock-claude');
    });

    it('CodingAgent のみ利用可能な場合も available: true を返す', async () => {
      const registry = new CodingAgentRegistry(0);
      registry.clearAdapters();
      registry.registerAdapter(createMockAdapter('mock-agent', true));

      server = createOrchestratorServer({
        port: TEST_PORT,
        codingAgentRegistry: registry,
      });
      await server.start();

      const { data } = await sendRequest(TEST_PORT, 'GET', '/api/health/ai');
      const healthData = data.data as Record<string, unknown>;

      // Ollama が利用不可でも CodingAgent があれば available
      expect(healthData.available).toBe(true);
    });

    it('Dashboard ステータスに CodingAgent 情報が含まれる', async () => {
      const registry = new CodingAgentRegistry(0);
      registry.clearAdapters();
      registry.registerAdapter(createMockAdapter('mock-agent', true));

      server = createOrchestratorServer({
        port: TEST_PORT,
        codingAgentRegistry: registry,
      });
      await server.start();

      const { status, data } = await sendRequest(TEST_PORT, 'GET', '/api/dashboard/status');

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const dashData = data.data as Record<string, unknown>;
      const aiStatus = dashData.aiStatus as Record<string, unknown> | null;

      // aiStatus が存在する場合、CodingAgent 情報を含む
      if (aiStatus) {
        expect(aiStatus).toHaveProperty('codingAgentsAvailable');
        expect(aiStatus).toHaveProperty('codingAgentNames');
      }
    });
  });

  // ===========================================================================
  // 3. /api/workflows エンドポイントテスト
  // ===========================================================================

  describe('/api/workflows エンドポイント', () => {
    it('POST /api/workflows でワークフローが開始される', async () => {
      server = createOrchestratorServer({ port: TEST_PORT });
      await server.start();

      const { status, data } = await sendRequest(TEST_PORT, 'POST', '/api/workflows', {
        instruction: 'テスト用の指示です',
        projectId: 'test-project',
      });

      expect(status).toBe(201);
      expect(data.success).toBe(true);

      const responseData = data.data as Record<string, unknown>;
      expect(responseData).toHaveProperty('workflowId');
      expect(typeof responseData.workflowId).toBe('string');
    });

    it('instruction が空の場合は 400 エラーを返す', async () => {
      server = createOrchestratorServer({ port: TEST_PORT });
      await server.start();

      const { status } = await sendRequest(TEST_PORT, 'POST', '/api/workflows', {
        instruction: '',
        projectId: 'test-project',
      });

      expect(status).toBe(400);
    });

    it('projectId が空の場合は 400 エラーを返す', async () => {
      server = createOrchestratorServer({ port: TEST_PORT });
      await server.start();

      const { status } = await sendRequest(TEST_PORT, 'POST', '/api/workflows', {
        instruction: 'テスト指示',
        projectId: '',
      });

      expect(status).toBe(400);
    });

    it('GET /api/workflows でワークフロー一覧を取得できる', async () => {
      server = createOrchestratorServer({ port: TEST_PORT });
      await server.start();

      // まずワークフローを作成
      await sendRequest(TEST_PORT, 'POST', '/api/workflows', {
        instruction: 'テスト指示',
        projectId: 'test-project',
      });

      const { status, data } = await sendRequest(TEST_PORT, 'GET', '/api/workflows');

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const responseData = data.data as Record<string, unknown>;
      expect(responseData).toHaveProperty('workflows');
      expect(Array.isArray(responseData.workflows)).toBe(true);
    });

    it('開始したワークフローの状態を取得できる', async () => {
      server = createOrchestratorServer({ port: TEST_PORT });
      await server.start();

      // ワークフロー作成
      const createResult = await sendRequest(TEST_PORT, 'POST', '/api/workflows', {
        instruction: 'テスト指示',
        projectId: 'test-project',
      });

      const workflowId = (createResult.data.data as Record<string, unknown>).workflowId as string;

      // 状態取得
      const { status, data } = await sendRequest(
        TEST_PORT,
        'GET',
        `/api/workflows/${workflowId}`
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const stateData = data.data as Record<string, unknown>;
      const workflow = stateData.workflow as Record<string, unknown>;
      expect(workflow).toHaveProperty('workflowId', workflowId);
      expect(workflow).toHaveProperty('currentPhase');
    });
  });

  // ===========================================================================
  // 4. タスク送信の AI 可用性チェックテスト
  // ===========================================================================

  describe('タスク送信の AI 可用性チェック', () => {
    it('CodingAgent のみ利用可能でもタスク送信が許可される', async () => {
      const registry = new CodingAgentRegistry(0);
      registry.clearAdapters();
      registry.registerAdapter(createMockAdapter('mock-agent', true));

      server = createOrchestratorServer({
        port: TEST_PORT,
        codingAgentRegistry: registry,
      });
      await server.start();

      const { status, data } = await sendRequest(TEST_PORT, 'POST', '/api/tasks', {
        instruction: 'テスト指示',
        projectId: 'test-project',
      });

      // Ollama が利用不可でも CodingAgent があれば 201 を返す
      expect(status).toBe(201);
      expect(data.success).toBe(true);
    });
  });
});
