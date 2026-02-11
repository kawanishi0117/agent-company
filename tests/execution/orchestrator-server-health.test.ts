/**
 * OrchestratorServer ヘルスチェック ユニットテスト
 *
 * OrchestratorServerのAIヘルスチェックエンドポイントと
 * タスク送信時のAI可用性チェックを検証する。
 *
 * テスト戦略:
 * - 実際のHTTPサーバーを起動してリクエストを送信
 * - AIHealthCheckerはDIで注入し、到達不可能なURLを使用して「利用不可」状態をテスト
 * - Orchestratorは実際のインスタンスを使用
 *
 * **Validates: Requirements 1.3**
 *
 * @module tests/execution/orchestrator-server-health
 * @see Requirements: 1.1, 1.2, 1.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { CodingAgentRegistry } from '../../tools/coding-agents/index';

// =============================================================================
// テスト用定数
// =============================================================================

/** テスト用の到達不可能なOllama URL */
const UNREACHABLE_OLLAMA_URL = 'http://localhost:59999';

/** AIHealthCheckerのタイムアウト（テスト用に短縮） */
const TEST_HEALTH_CHECK_TIMEOUT_MS = 500;

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
    'test-server-health',
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
    timeoutMs: TEST_HEALTH_CHECK_TIMEOUT_MS,
  });
}

/**
 * 空のCodingAgentRegistryを作成（全エージェント利用不可）
 * @returns アダプタが登録されていないCodingAgentRegistry
 */
function createEmptyCodingAgentRegistry(): CodingAgentRegistry {
  const registry = new CodingAgentRegistry();
  registry.clearAdapters();
  return registry;
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
  // ランダムなポートを使用（テスト並列実行時の衝突回避）
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

  const orchestrator = createOrchestrator({
    stateManager,
    agentBus,
    workerPool,
  });

  const server = createOrchestratorServer({
    port,
    orchestrator,
    aiHealthChecker,
    codingAgentRegistry: createEmptyCodingAgentRegistry(),
  });

  await server.start();

  return { server, port };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('OrchestratorServer - AIヘルスチェック', () => {
  let tempDir: string;
  let server: OrchestratorServer;
  let port: number;

  afterEach(async () => {
    // サーバー停止
    if (server?.isRunning()) {
      await server.stop();
    }
    // 一時ディレクトリ削除
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  // ===========================================================================
  // GET /api/health/ai エンドポイントテスト
  // ===========================================================================

  describe('GET /api/health/ai', () => {
    /**
     * AI利用不可時のヘルスチェックレスポンス構造を検証
     * @see Requirement 1.3: health check endpoint `/api/health/ai` that returns adapter status
     */
    it('AI利用不可時: success=true, available=false のレスポンスを返す', async () => {
      // Arrange: 到達不可能なAIHealthCheckerでサーバーを起動
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act: ヘルスチェックエンドポイントにリクエスト
      const response = await httpRequest(port, 'GET', '/api/health/ai');

      // Assert: レスポンス構造を検証
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data as Record<string, unknown>;
      expect(data.available).toBe(false);
      expect(data.ollamaRunning).toBe(false);
    });

    /**
     * レスポンスにセットアップ手順が含まれることを検証
     * @see Requirement 1.2: display a clear error message with setup instructions
     */
    it('AI利用不可時: setupInstructionsが含まれる', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'GET', '/api/health/ai');

      // Assert
      const data = response.body.data as Record<string, unknown>;
      expect(data.setupInstructions).toBeDefined();
      expect(typeof data.setupInstructions).toBe('string');
      expect((data.setupInstructions as string).length).toBeGreaterThan(0);
      // セットアップ手順にOllamaのインストールURLが含まれること
      expect(data.setupInstructions).toContain('https://ollama.ai/download');
    });

    /**
     * レスポンスに推奨モデル一覧が含まれることを検証
     * @see Requirement 1.3: health check endpoint returns adapter status
     */
    it('AI利用不可時: recommendedModelsが含まれる', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'GET', '/api/health/ai');

      // Assert
      const data = response.body.data as Record<string, unknown>;
      expect(data.recommendedModels).toBeDefined();
      expect(Array.isArray(data.recommendedModels)).toBe(true);
      expect((data.recommendedModels as string[]).length).toBeGreaterThan(0);
    });

    /**
     * レスポンスにmodelsInstalledフィールドが含まれることを検証
     * @see Requirement 1.3: health check endpoint returns adapter status
     */
    it('AI利用不可時: modelsInstalledが空配列で返される', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'GET', '/api/health/ai');

      // Assert
      const data = response.body.data as Record<string, unknown>;
      expect(data.modelsInstalled).toBeDefined();
      expect(Array.isArray(data.modelsInstalled)).toBe(true);
      expect((data.modelsInstalled as string[]).length).toBe(0);
    });

    /**
     * レスポンスの全フィールドが設計インターフェースに準拠していることを検証
     * @see Requirement 1.3: health check endpoint
     */
    it('レスポンスがAIHealthResponse設計インターフェースに準拠している', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'GET', '/api/health/ai');

      // Assert: 設計インターフェースの全フィールドが存在すること
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      const data = response.body.data as Record<string, unknown>;
      expect(data).toHaveProperty('available');
      expect(data).toHaveProperty('ollamaRunning');
      expect(data).toHaveProperty('modelsInstalled');
      expect(data).toHaveProperty('recommendedModels');
      // setupInstructionsは利用不可時のみ存在（オプショナル）
    });
  });

  // ===========================================================================
  // POST /api/tasks - AI可用性チェック統合テスト
  // ===========================================================================

  describe('POST /api/tasks - AI可用性チェック', () => {
    /**
     * AI利用不可時にタスク送信が503エラーを返すことを検証
     * @see Requirement 1.1: THE Orchestrator SHALL check AI adapter availability
     * @see Requirement 1.2: IF Ollama is not available, display error message
     */
    it('AI利用不可時: 503 Service Unavailable を返す', async () => {
      // Arrange: 到達不可能なAIHealthCheckerでサーバーを起動
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act: タスク送信
      const response = await httpRequest(port, 'POST', '/api/tasks', {
        instruction: 'テストタスク',
        projectId: 'test-project',
      });

      // Assert: 503エラーが返ること
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });

    /**
     * AI利用不可時のエラーレスポンスにセットアップ手順が含まれることを検証
     * @see Requirement 1.2: display a clear error message with setup instructions
     */
    it('AI利用不可時: エラーレスポンスにsetupInstructionsが含まれる', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'POST', '/api/tasks', {
        instruction: 'テストタスク',
        projectId: 'test-project',
      });

      // Assert
      expect(response.status).toBe(503);
      const data = response.body.data as Record<string, unknown>;
      expect(data).toBeDefined();
      expect(data.setupInstructions).toBeDefined();
      expect(typeof data.setupInstructions).toBe('string');
    });

    /**
     * AI利用不可時のエラーレスポンスにollamaRunningフラグが含まれることを検証
     * @see Requirement 1.1: check AI adapter availability
     */
    it('AI利用不可時: エラーレスポンスにollamaRunning=falseが含まれる', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'POST', '/api/tasks', {
        instruction: 'テストタスク',
        projectId: 'test-project',
      });

      // Assert
      expect(response.status).toBe(503);
      const data = response.body.data as Record<string, unknown>;
      expect(data.ollamaRunning).toBe(false);
    });

    /**
     * バリデーションエラーはAI可用性チェックより先に処理されることを検証
     * （instructionが空の場合は400エラー）
     */
    it('バリデーションエラー: instructionが空の場合は400を返す', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act: instructionなしでタスク送信
      const response = await httpRequest(port, 'POST', '/api/tasks', {
        projectId: 'test-project',
      });

      // Assert: バリデーションエラー（400）が返ること
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('instruction');
    });
  });

  // ===========================================================================
  // 既存エンドポイントとの共存テスト
  // ===========================================================================

  describe('既存エンドポイントとの共存', () => {
    /**
     * 既存の /api/health エンドポイントが引き続き動作することを検証
     */
    it('GET /api/health: 既存のヘルスチェックが正常に動作する', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'GET', '/api/health');

      // Assert: 既存のヘルスチェックが正常に動作
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const data = response.body.data as Record<string, unknown>;
      expect(data.status).toBe('healthy');
    });

    /**
     * 存在しないエンドポイントが404を返すことを検証
     */
    it('存在しないエンドポイント: 404を返す', async () => {
      // Arrange
      tempDir = await createTempDir();
      const checker = createUnavailableHealthChecker();
      ({ server, port } = await createAndStartServer(tempDir, checker));

      // Act
      const response = await httpRequest(port, 'GET', '/api/health/nonexistent');

      // Assert
      expect(response.status).toBe(404);
    });
  });
});
