/**
 * OrchestratorServer 統合テスト
 *
 * OrchestratorServerの全APIエンドポイント統合と
 * 一貫したエラーハンドリングを検証する。
 *
 * テスト対象:
 * - 全APIエンドポイントの統合動作
 * - エラーハンドリングの一貫性（HTTPステータスコード、エラーコード）
 * - AIHealthChecker統合（ヘルスチェック、タスク送信時の可用性チェック）
 * - Settings API（バリデーション、ホットリロード）
 * - Runs API（レポート、成果物、品質ゲート結果）
 * - Dashboard API（AI可用性情報統合）
 *
 * @module tests/execution/orchestrator-server-integration
 * @see Requirements: 1.3, 2.1-2.5, 5.5, 7.1-7.3, 8.1-8.5
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  OrchestratorServer,
  createOrchestratorServer,
} from '../../tools/cli/lib/execution/orchestrator-server';
import { createOrchestrator } from '../../tools/cli/lib/execution/orchestrator';
import { StateManager } from '../../tools/cli/lib/execution/state-manager';
import { createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { createWorkerPool } from '../../tools/cli/lib/execution/worker-pool';
import { AIHealthChecker } from '../../tools/cli/lib/execution/ai-health-checker';
import { RunDirectoryManager } from '../../tools/cli/lib/execution/run-directory-manager';
import { createQualityGateIntegration } from '../../tools/cli/lib/execution/quality-gate-integration';
import { CodingAgentRegistry } from '../../tools/coding-agents/index';

// =============================================================================
// テスト用定数
// =============================================================================

/** テスト用の到達不可能なOllama URL */
const UNREACHABLE_OLLAMA_URL = 'http://localhost:59999';

/** AIHealthCheckerのタイムアウト（テスト用に短縮） */
const TEST_TIMEOUT_MS = 500;

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * テスト用の一時ディレクトリを作成
 * @returns 一時ディレクトリのパス
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(
    'runtime',
    'test-server-integration',
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * テスト用の一時ディレクトリを削除
 * @param tempDir - 削除対象のディレクトリパス
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

/**
 * HTTPリクエストを送信するヘルパー
 *
 * @param port - サーバーポート
 * @param method - HTTPメソッド
 * @param urlPath - リクエストパス
 * @param body - リクエストボディ（オプション）
 * @returns レスポンスのステータスコードとボディ
 */
async function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `http://localhost:${port}${urlPath}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseBody = (await response.json()) as Record<string, unknown>;

  return {
    status: response.status,
    body: responseBody,
  };
}

/**
 * 利用不可なAIHealthCheckerを作成
 * @returns 到達不可能なURLを持つAIHealthChecker
 */
function createUnavailableHealthChecker(): AIHealthChecker {
  return new AIHealthChecker({
    ollamaBaseUrl: UNREACHABLE_OLLAMA_URL,
    timeoutMs: TEST_TIMEOUT_MS,
  });
}

/**
 * テスト用のOrchestratorServerを作成・起動
 *
 * @param tempDir - 一時ディレクトリ
 * @param aiHealthChecker - AIHealthCheckerインスタンス
 * @returns サーバーインスタンスとポート番号
 */
async function createAndStartServer(
  tempDir: string,
  aiHealthChecker: AIHealthChecker
): Promise<{ server: OrchestratorServer; port: number }> {
  const port = 30000 + Math.floor(Math.random() * 10000);

  const stateManager = new StateManager(tempDir);
  const agentBus = createAgentBus({
    messageQueueConfig: {
      type: 'file',
      basePath: path.join(tempDir, 'bus'),
    },
    runtimeBasePath: path.join(tempDir, 'runs'),
  });
  const workerPool = createWorkerPool({
    maxWorkers: 1,
    useContainers: false,
  });

  // RunDirectoryManagerをテスト用ディレクトリに設定
  const runDirectoryManager = new RunDirectoryManager(
    path.join(tempDir, 'runs')
  );

  // QualityGateIntegrationをテスト用ディレクトリに設定
  const qualityGateIntegration = createQualityGateIntegration({
    runsBasePath: path.join(tempDir, 'runs'),
  });

  const orchestrator = createOrchestrator({
    stateManager,
    agentBus,
    workerPool,
    runDirectoryManager,
    qualityGateIntegration,
  });

  // AI利用不可テスト用: 空のCodingAgentRegistryを注入
  // グローバルレジストリはローカルCLIツールを検出してしまうため
  const emptyCodingAgentRegistry = new CodingAgentRegistry();
  emptyCodingAgentRegistry.clearAdapters();

  const server = createOrchestratorServer({
    port,
    orchestrator,
    aiHealthChecker,
    codingAgentRegistry: emptyCodingAgentRegistry,
  });

  await server.start();

  return { server, port };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('OrchestratorServer 統合テスト', () => {
  let tempDir: string;
  let server: OrchestratorServer;
  let port: number;

  afterEach(async () => {
    if (server?.isRunning()) {
      await server.stop();
    }
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  // ===========================================================================
  // エラーハンドリングの一貫性テスト
  // ===========================================================================

  describe('エラーハンドリングの一貫性', () => {
    /**
     * 404レスポンスにエラーコードが含まれることを検証
     */
    it('存在しないエンドポイント: 404 + NOT_FOUND コードを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.error).toBeDefined();
    });

    /**
     * バリデーションエラーにエラーコードが含まれることを検証
     */
    it('バリデーションエラー: 400 + VALIDATION_ERROR コードを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // instructionなしでタスク送信
      const response = await httpRequest(port, 'POST', '/api/tasks', {
        projectId: 'test-project',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    /**
     * AI利用不可時のエラーにエラーコードが含まれることを検証
     */
    it('AI利用不可: 503 + AI_UNAVAILABLE コードを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'POST', '/api/tasks', {
        instruction: 'テストタスク',
        projectId: 'test-project',
      });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AI_UNAVAILABLE');
    });

    /**
     * CORSプリフライトが正常に処理されることを検証
     */
    it('OPTIONS: 204 を返す（CORSプリフライト）', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const url = `http://localhost:${port}/api/health`;
      const response = await fetch(url, { method: 'OPTIONS' });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    /**
     * 不正なJSONボディが400エラーを返すことを検証
     */
    it('不正なJSON: 400 + エラーメッセージを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const url = `http://localhost:${port}/api/tasks`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  // ===========================================================================
  // Settings API テスト
  // ===========================================================================

  describe('Settings API（バリデーション統合）', () => {
    /**
     * GET /api/config: 設定取得が正常に動作することを検証
     * @see Requirement 8.1, 8.2, 8.3
     */
    it('GET /api/config: 現在の設定を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/config');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      // SystemConfigの主要フィールドが存在すること
      expect(data).toHaveProperty('maxConcurrentWorkers');
      expect(data).toHaveProperty('defaultAiAdapter');
      expect(data).toHaveProperty('defaultModel');
      expect(data).toHaveProperty('containerRuntime');
    });

    /**
     * PUT /api/config: 有効な設定更新が成功することを検証
     * @see Requirement 8.4, 8.5
     */
    it('PUT /api/config: 有効な設定で更新成功', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'PUT', '/api/config', {
        defaultModel: 'codellama',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      const config = data.config as Record<string, unknown>;
      expect(config.defaultModel).toBe('codellama');
    });

    /**
     * PUT /api/config: 無効なAIアダプタで422エラーを返すことを検証
     * @see Requirement 8.4
     */
    it('PUT /api/config: 無効なAIアダプタで422を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'PUT', '/api/config', {
        defaultAiAdapter: 'invalid-adapter',
      });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');

      const data = response.body.data as Record<string, unknown>;
      expect(data.errors).toBeDefined();
      expect(Array.isArray(data.errors)).toBe(true);
      expect((data.errors as string[]).length).toBeGreaterThan(0);
    });

    /**
     * PUT /api/config: 空のAIアダプタで422エラーを返すことを検証
     * @see Requirement 8.4
     */
    it('PUT /api/config: 空のAIアダプタで422を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'PUT', '/api/config', {
        defaultAiAdapter: '',
      });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });

    /**
     * POST /api/config/validate: バリデーションのドライランが動作することを検証
     * @see Requirement 8.4
     */
    it('POST /api/config/validate: 有効な設定でvalid=trueを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'POST', '/api/config/validate', {
        defaultAiAdapter: 'ollama',
        defaultModel: 'llama3',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.valid).toBe(true);
      expect(data.errors).toEqual([]);
    });

    /**
     * POST /api/config/validate: 無効な設定でvalid=falseを返すことを検証
     * @see Requirement 8.4
     */
    it('POST /api/config/validate: 無効な設定でvalid=falseを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'POST', '/api/config/validate', {
        defaultAiAdapter: 'nonexistent',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.valid).toBe(false);
      expect((data.errors as string[]).length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Runs API テスト
  // ===========================================================================

  describe('Runs API（成果物・レポート取得）', () => {
    /**
     * GET /api/runs/:runId/report: 存在しないRunで404を返すことを検証
     * @see Requirement 5.5
     */
    it('GET /api/runs/:runId/report: 存在しないRunで404を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(
        port,
        'GET',
        '/api/runs/nonexistent-run/report'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('RUN_NOT_FOUND');
    });

    /**
     * GET /api/runs/:runId/artifacts: 存在しないRunで404を返すことを検証
     * @see Requirement 5.5
     */
    it('GET /api/runs/:runId/artifacts: 存在しないRunで404を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(
        port,
        'GET',
        '/api/runs/nonexistent-run/artifacts'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('RUN_NOT_FOUND');
    });

    /**
     * GET /api/runs/:runId/report: 存在するRunでレポートを返すことを検証
     * @see Requirement 5.5
     */
    it('GET /api/runs/:runId/report: 存在するRunでレポートを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // テスト用のRunディレクトリとメタデータを作成
      const runId = 'test-run-report';
      const runsDir = path.join(tempDir, 'runs', runId);
      await fs.mkdir(path.join(runsDir, 'artifacts'), { recursive: true });
      await fs.writeFile(
        path.join(runsDir, 'task.json'),
        JSON.stringify({
          taskId: 'task-001',
          runId,
          projectId: 'test-project',
          instruction: 'テスト指示',
          status: 'completed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          aiAdapter: 'ollama',
          model: 'llama3',
        })
      );

      const response = await httpRequest(
        port,
        'GET',
        `/api/runs/${runId}/report`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.runId).toBe(runId);
      expect(data.metadata).toBeDefined();

      const metadata = data.metadata as Record<string, unknown>;
      expect(metadata.taskId).toBe('task-001');
      expect(metadata.instruction).toBe('テスト指示');
    });

    /**
     * GET /api/runs/:runId/artifacts: 存在するRunで成果物一覧を返すことを検証
     * @see Requirement 5.5
     */
    it('GET /api/runs/:runId/artifacts: 存在するRunで成果物一覧を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // テスト用のRunディレクトリと成果物を作成
      const runId = 'test-run-artifacts';
      const artifactsDir = path.join(tempDir, 'runs', runId, 'artifacts');
      await fs.mkdir(artifactsDir, { recursive: true });
      await fs.writeFile(path.join(artifactsDir, 'file1.ts'), '// test');
      await fs.writeFile(path.join(artifactsDir, 'file2.ts'), '// test');

      const response = await httpRequest(
        port,
        'GET',
        `/api/runs/${runId}/artifacts`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.runId).toBe(runId);
      expect(data.artifacts).toBeDefined();
      expect(Array.isArray(data.artifacts)).toBe(true);
      expect((data.artifacts as string[]).length).toBe(2);
      expect(data.artifacts).toContain('file1.ts');
      expect(data.artifacts).toContain('file2.ts');
    });

    /**
     * GET /api/runs/:runId/quality: 品質ゲート結果が存在しない場合404を返すことを検証
     * @see Requirement 4.3
     */
    it('GET /api/runs/:runId/quality: 結果なしで404を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(
        port,
        'GET',
        '/api/runs/nonexistent-run/quality'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('QUALITY_RESULTS_NOT_FOUND');
    });
  });

  // ===========================================================================
  // Dashboard API テスト
  // ===========================================================================

  describe('Dashboard API（AI可用性情報統合）', () => {
    /**
     * GET /api/dashboard/status: AI可用性情報が含まれることを検証
     * @see Requirements: 7.1, 7.2, 7.3
     */
    it('GET /api/dashboard/status: AI可用性情報を含む統合ステータスを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/dashboard/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;

      // 基本フィールドの存在確認
      expect(data).toHaveProperty('workers');
      expect(data).toHaveProperty('managers');
      expect(data).toHaveProperty('tasks');
      expect(data).toHaveProperty('recentTasks');
      expect(data).toHaveProperty('systemStatus');
      expect(data).toHaveProperty('lastUpdated');

      // AI可用性情報の確認
      expect(data).toHaveProperty('aiStatus');
      const aiStatus = data.aiStatus as Record<string, unknown>;
      expect(aiStatus).toHaveProperty('available');
      expect(aiStatus).toHaveProperty('ollamaRunning');
      expect(aiStatus).toHaveProperty('modelsInstalled');
    });

    /**
     * GET /api/dashboard/status: タスクサマリーに成功率が含まれることを検証
     * @see Requirement 7.3
     */
    it('GET /api/dashboard/status: タスクサマリーにsuccessRateが含まれる', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/dashboard/status');

      expect(response.status).toBe(200);

      const data = response.body.data as Record<string, unknown>;
      const tasks = data.tasks as Record<string, unknown>;
      expect(tasks).toHaveProperty('successRate');
      expect(typeof tasks.successRate).toBe('number');
    });

    /**
     * GET /api/dashboard/status: 設定情報にAI設定が含まれることを検証
     * @see Requirements: 8.1, 8.2, 8.3
     */
    it('GET /api/dashboard/status: 設定情報にAI設定が含まれる', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/dashboard/status');

      expect(response.status).toBe(200);

      const data = response.body.data as Record<string, unknown>;
      const config = data.config as Record<string, unknown>;
      expect(config).toHaveProperty('defaultAiAdapter');
      expect(config).toHaveProperty('defaultModel');
    });
  });

  // ===========================================================================
  // 既存エンドポイントの動作確認テスト
  // ===========================================================================

  describe('既存エンドポイントの動作確認', () => {
    /**
     * GET /api/health: 基本ヘルスチェックが正常に動作することを検証
     */
    it('GET /api/health: 正常なヘルスチェックレスポンスを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.status).toBe('healthy');
      expect(data).toHaveProperty('initialized');
      expect(data).toHaveProperty('paused');
      expect(data).toHaveProperty('emergencyStopped');
      expect(data).toHaveProperty('timestamp');
    });

    /**
     * GET /api/health/ai: AIヘルスチェックが正常に動作することを検証
     * @see Requirement 1.3
     */
    it('GET /api/health/ai: AIヘルスチェックレスポンスを返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/health/ai');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data).toHaveProperty('available');
      expect(data).toHaveProperty('ollamaRunning');
      expect(data).toHaveProperty('modelsInstalled');
      expect(data).toHaveProperty('recommendedModels');
    });

    /**
     * GET /api/agents: エージェント一覧が取得できることを検証
     */
    it('GET /api/agents: エージェント一覧を返す', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'GET', '/api/agents');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    /**
     * POST /api/agents/pause: 一時停止が正常に動作することを検証
     */
    it('POST /api/agents/pause: 一時停止が成功する', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(port, 'POST', '/api/agents/pause');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.paused).toBe(true);
    });

    /**
     * POST /api/agents/resume: 再開が正常に動作することを検証
     */
    it('POST /api/agents/resume: 再開が成功する', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // まず一時停止
      await httpRequest(port, 'POST', '/api/agents/pause');

      const response = await httpRequest(port, 'POST', '/api/agents/resume');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.resumed).toBe(true);
    });

    /**
     * POST /api/agents/emergency-stop: 緊急停止が正常に動作することを検証
     */
    it('POST /api/agents/emergency-stop: 緊急停止が成功する', async () => {
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      const response = await httpRequest(
        port,
        'POST',
        '/api/agents/emergency-stop'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.emergencyStopped).toBe(true);
    });
  });
});
