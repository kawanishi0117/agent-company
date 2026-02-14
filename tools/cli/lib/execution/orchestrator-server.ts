/**
 * Orchestrator HTTP API Server
 *
 * OrchestratorをHTTP APIとして公開し、GUIからの制御を可能にする。
 * 常駐プロセスとして起動し、タスク送信・状態取得・制御を提供。
 *
 * 統合コンポーネント:
 * - AIHealthChecker: AI実行基盤の可用性確認
 * - ExecutionReporter: 成果物・レポートの取得
 * - QualityGateIntegration: 品質ゲート結果の取得
 * - RunDirectoryManager: 実行ディレクトリ管理
 * - SettingsManager: 設定バリデーション・ホットリロード
 *
 * @module execution/orchestrator-server
 * @see Requirements: 1.3, 2.1-2.5, 5.5, 7.1-7.3, 8.1-8.5
 */

import * as http from 'http';
import * as url from 'url';
import { Orchestrator, createOrchestrator, OrchestratorError } from './orchestrator.js';
import { TicketManager, createTicketManager } from './ticket-manager.js';
import { AIHealthChecker, createAIHealthChecker } from './ai-health-checker.js';
import {
  SettingsManager,
  SettingsValidationError,
  validateAISettings,
  createSettingsManager,
} from './settings-manager.js';
import type { SystemConfig } from './types.js';
import {
  WorkflowEngine,
  WorkflowEngineError,
  createWorkflowEngine,
} from './workflow-engine.js';
import { MeetingCoordinator, createMeetingCoordinator } from './meeting-coordinator.js';
import { ApprovalGate, createApprovalGate } from './approval-gate.js';
import { createAgentBus } from './agent-bus.js';
import {
  CodingAgentRegistry,
  globalCodingAgentRegistry,
} from '../../../coding-agents/index.js';
import { createWorkspaceManager } from './workspace-manager.js';
import type {
  ApprovalDecision,
  EscalationDecision,
  WorkflowPhase,
  PhaseServiceConfig,
  AgentServiceOverride,
} from './types.js';

// =============================================================================
// 定数
// =============================================================================

/** デフォルトポート */
const DEFAULT_PORT = 3001;

/** リクエストボディの最大サイズ（バイト） */
const MAX_BODY_SIZE = 1_048_576; // 1MB

/** CORSヘッダー */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// =============================================================================
// 型定義
// =============================================================================

/**
 * APIレスポンス
 * @description 全エンドポイント共通のレスポンス形式
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** エラーコード（エラー時のみ） */
  code?: string;
}

/**
 * タスク送信リクエスト
 * @description POST /api/tasks のリクエストボディ
 */
interface SubmitTaskRequest {
  instruction: string;
  projectId: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  deadline?: string;
}

/**
 * サーバー設定
 * @description OrchestratorServerの初期化オプション
 */
export interface OrchestratorServerConfig {
  /** サーバーポート（デフォルト: 3001） */
  port?: number;
  /** Orchestratorインスタンス（DI用） */
  orchestrator?: Orchestrator;
  /** TicketManagerインスタンス（DI用） */
  ticketManager?: TicketManager;
  /** AIヘルスチェッカー（DI用、省略時は自動生成） */
  aiHealthChecker?: AIHealthChecker;
  /** SettingsManager（DI用、省略時は自動生成） */
  settingsManager?: SettingsManager;
  /** WorkflowEngine（DI用、省略時は自動生成） */
  workflowEngine?: WorkflowEngine;
  /** ApprovalGate（DI用、省略時は自動生成） */
  approvalGate?: ApprovalGate;
  /** MeetingCoordinator（DI用、省略時は自動生成） */
  meetingCoordinator?: MeetingCoordinator;
  /** CodingAgentRegistry（DI用、省略時はグローバルレジストリを使用） */
  codingAgentRegistry?: CodingAgentRegistry;
}

// =============================================================================
// OrchestratorServer クラス
// =============================================================================

/**
 * Orchestrator HTTP API Server
 *
 * 全APIエンドポイントを統合し、一貫したエラーハンドリングを提供する。
 * AIHealthChecker、ExecutionReporter、QualityGateIntegration、
 * RunDirectoryManager、SettingsManagerと連携して完全なAPI層を構成する。
 *
 * @see Requirements: 1.3, 2.1-2.5, 5.5, 7.1-7.3, 8.1-8.5
 *
 * @example
 * ```typescript
 * const server = new OrchestratorServer({ port: 3001 });
 * await server.start();
 * // http://localhost:3001/api/tasks にPOSTでタスク送信
 * ```
 */
export class OrchestratorServer {
  private server: http.Server | null = null;
  private orchestrator: Orchestrator;
  private ticketManager: TicketManager;
  /** AI可用性チェッカー @see Requirements: 1.3 */
  private aiHealthChecker: AIHealthChecker;
  /** 設定マネージャー @see Requirements: 8.1-8.5 */
  private settingsManager: SettingsManager;
  /** ワークフローエンジン @see Requirements: 15.1-15.11 */
  private workflowEngine: WorkflowEngine;
  /** 承認ゲート @see Requirements: 15.4 */
  private approvalGate: ApprovalGate;
  /** コーディングエージェントレジストリ @see REQ-2.1 */
  private codingAgentRegistry: CodingAgentRegistry;
  private port: number;
  private running: boolean = false;

  constructor(config?: OrchestratorServerConfig) {
    this.port = config?.port ?? DEFAULT_PORT;
    this.orchestrator = config?.orchestrator ?? createOrchestrator();
    this.ticketManager = config?.ticketManager ?? createTicketManager();
    this.aiHealthChecker = config?.aiHealthChecker ?? createAIHealthChecker();
    this.settingsManager = config?.settingsManager ?? createSettingsManager();

    // CodingAgentRegistry（DI or グローバルシングルトン）
    this.codingAgentRegistry = config?.codingAgentRegistry ?? globalCodingAgentRegistry;

    // ワークフロー関連コンポーネント初期化
    const agentBus = createAgentBus({
      messageQueueConfig: { type: 'file', basePath: 'runtime/state/bus' },
      runtimeBasePath: 'runtime/runs',
    });
    const meetingCoordinator = config?.meetingCoordinator
      ?? createMeetingCoordinator(agentBus, 'runtime/runs');
    this.approvalGate = config?.approvalGate ?? createApprovalGate('runtime/runs');

    // WorkflowEngine に CodingAgentRegistry を接続
    // @see REQ-2.1: OrchestratorServer で WorkflowEngine に CodingAgentRegistry を渡す
    // config.json からフェーズ別・エージェント別のAIサービス設定を読み込む
    const codingAgentConfig = this.loadCodingAgentConfigSync();
    this.workflowEngine = config?.workflowEngine
      ?? createWorkflowEngine(meetingCoordinator, this.approvalGate, 'runtime/runs', {
        codingAgentRegistry: this.codingAgentRegistry,
        workspaceManager: createWorkspaceManager(),
        preferredCodingAgent: codingAgentConfig.preferredAgent,
        phaseServices: codingAgentConfig.phaseServices,
        agentOverrides: codingAgentConfig.agentOverrides,
      });
  }

  /**
   * config.json からコーディングエージェント設定を同期的に読み込む
   * @returns フェーズ別・エージェント別設定を含むオブジェクト
   */
  private loadCodingAgentConfigSync(): {
    preferredAgent?: string;
    phaseServices?: PhaseServiceConfig;
    agentOverrides?: AgentServiceOverride[];
  } {
    try {
      const fs = require('fs');
      const configPath = 'runtime/state/config.json';
      const configJson = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(configJson) as Record<string, unknown>;
      const codingAgent = parsed.codingAgent as Record<string, unknown> | undefined;
      if (!codingAgent) {
        return {};
      }
      return {
        preferredAgent: codingAgent.preferredAgent as string | undefined,
        phaseServices: codingAgent.phaseServices as PhaseServiceConfig | undefined,
        agentOverrides: codingAgent.agentOverrides as AgentServiceOverride[] | undefined,
      };
    } catch {
      // config.json が存在しない場合はデフォルト
      return {};
    }
  }

  /**
   * サーバーを起動
   *
   * @throws サーバー起動エラー（ポート競合等）
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[OrchestratorServer] Already running');
      return;
    }

    // Orchestratorを初期化
    await this.orchestrator.initialize();

    // HTTPサーバーを作成
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        console.error('[OrchestratorServer] Unhandled request error:', error);
        this.sendErrorResponse(res, 500, 'Internal server error', 'INTERNAL_ERROR');
      });
    });

    // サーバーを起動
    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, () => {
        this.running = true;
        console.warn(`[OrchestratorServer] Started on port ${this.port}`);
        resolve();
      });

      this.server!.on('error', (error) => {
        console.error('[OrchestratorServer] Server error:', error);
        reject(error);
      });
    });
  }

  /**
   * サーバーを停止
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        console.warn('[OrchestratorServer] Stopped');
        resolve();
      });
    });
  }

  // ===========================================================================
  // リクエストルーティング
  // ===========================================================================

  /**
   * リクエストを処理（メインルーター）
   *
   * 全エンドポイントのルーティングと一貫したエラーハンドリングを提供する。
   * OrchestratorErrorは400、SettingsValidationErrorは422、
   * その他のエラーは500として処理する。
   *
   * @param req - HTTPリクエスト
   * @param res - HTTPレスポンス
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';
    const method = req.method || 'GET';

    // CORSプリフライト
    if (method === 'OPTIONS') {
      this.sendResponse(res, 204, null);
      return;
    }

    try {
      const handled = await this.routeRequest(pathname, method, req, res);
      if (!handled) {
        this.sendErrorResponse(res, 404, `Endpoint not found: ${method} ${pathname}`, 'NOT_FOUND');
      }
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * ルーティングテーブル
   *
   * @param pathname - リクエストパス
   * @param method - HTTPメソッド
   * @param req - HTTPリクエスト
   * @param res - HTTPレスポンス
   * @returns ルーティングが成功した場合true
   */
  private async routeRequest(
    pathname: string,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean> {
    // --- ヘルスチェック ---
    if (pathname === '/api/health' && method === 'GET') {
      await this.handleHealth(res);
      return true;
    }

    // AIヘルスチェック
    // @see Requirement 1.3: health check endpoint `/api/health/ai`
    if (pathname === '/api/health/ai' && method === 'GET') {
      await this.handleAIHealth(res);
      return true;
    }

    // --- タスク関連 ---
    if (pathname === '/api/tasks' && method === 'POST') {
      await this.handleSubmitTask(req, res);
      return true;
    }

    if (pathname.startsWith('/api/tasks/') && method === 'GET') {
      const taskId = pathname.replace('/api/tasks/', '');
      await this.handleGetTaskStatus(taskId, res);
      return true;
    }

    if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
      const taskId = pathname.replace('/api/tasks/', '');
      await this.handleCancelTask(taskId, res);
      return true;
    }

    // --- エージェント関連 ---
    if (pathname === '/api/agents' && method === 'GET') {
      await this.handleGetAgents(res);
      return true;
    }

    if (pathname === '/api/agents/pause' && method === 'POST') {
      await this.handlePauseAgents(res);
      return true;
    }

    if (pathname === '/api/agents/resume' && method === 'POST') {
      await this.handleResumeAgents(res);
      return true;
    }

    if (pathname === '/api/agents/emergency-stop' && method === 'POST') {
      await this.handleEmergencyStop(res);
      return true;
    }

    // --- チケット関連 ---
    if (pathname === '/api/tickets' && method === 'POST') {
      await this.handleCreateTicket(req, res);
      return true;
    }

    if (pathname.startsWith('/api/tickets/') && pathname.endsWith('/execute') && method === 'POST') {
      const ticketId = pathname.replace('/api/tickets/', '').replace('/execute', '');
      await this.handleExecuteTicket(ticketId, res);
      return true;
    }

    // --- 設定関連（バリデーション統合） ---
    // @see Requirements: 8.1-8.5
    if (pathname === '/api/config' && method === 'GET') {
      await this.handleGetConfig(res);
      return true;
    }

    if (pathname === '/api/config' && method === 'PUT') {
      await this.handleUpdateConfig(req, res);
      return true;
    }

    // AI設定バリデーション専用エンドポイント
    // @see Requirement 8.4: THE System SHALL validate settings before saving
    if (pathname === '/api/config/validate' && method === 'POST') {
      await this.handleValidateConfig(req, res);
      return true;
    }

    // --- Runs関連（成果物・レポート取得） ---
    // @see Requirement 5.5: THE GUI SHALL display artifacts and report on Runs detail page
    if (pathname.startsWith('/api/runs/') && pathname.endsWith('/report') && method === 'GET') {
      const runId = pathname.replace('/api/runs/', '').replace('/report', '');
      await this.handleGetRunReport(runId, res);
      return true;
    }

    if (pathname.startsWith('/api/runs/') && pathname.endsWith('/artifacts') && method === 'GET') {
      const runId = pathname.replace('/api/runs/', '').replace('/artifacts', '');
      await this.handleGetRunArtifacts(runId, res);
      return true;
    }

    if (pathname.startsWith('/api/runs/') && pathname.endsWith('/quality') && method === 'GET') {
      const runId = pathname.replace('/api/runs/', '').replace('/quality', '');
      await this.handleGetRunQuality(runId, res);
      return true;
    }

    // --- ダッシュボード用統合エンドポイント ---
    // @see Requirements: 7.1-7.3
    if (pathname === '/api/dashboard/status' && method === 'GET') {
      await this.handleDashboardStatus(res);
      return true;
    }

    // --- ワークフロー関連 ---
    // @see Requirements: 15.1-15.11

    // POST /api/workflows: ワークフロー開始
    if (pathname === '/api/workflows' && method === 'POST') {
      await this.handleStartWorkflow(req, res);
      return true;
    }

    // GET /api/workflows: ワークフロー一覧
    if (pathname === '/api/workflows' && method === 'GET') {
      const parsedUrl = url.parse(req.url ?? '', true);
      const status = parsedUrl.query.status as string | undefined;
      await this.handleListWorkflows(status, res);
      return true;
    }

    // ワークフロー個別エンドポイント（サブリソース優先でマッチ）
    if (pathname.startsWith('/api/workflows/')) {
      const matched = await this.routeWorkflowSubResource(pathname, method, req, res);
      if (matched) return true;
    }

    return false;
  }

  // ===========================================================================
  // ヘルスチェック ハンドラー
  // ===========================================================================

  /**
   * システムヘルスチェック
   *
   * @param res - HTTPレスポンス
   */
  private async handleHealth(res: http.ServerResponse): Promise<void> {
    this.sendResponse(res, 200, {
      success: true,
      data: {
        status: 'healthy',
        initialized: this.orchestrator.isInitialized(),
        paused: this.orchestrator.isPaused(),
        emergencyStopped: this.orchestrator.isEmergencyStopped(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * AIヘルスチェック
   *
   * AI実行基盤（Ollama + CodingAgent）の可用性を確認し、ステータスを返す。
   *
   * @param res - HTTPレスポンス
   * @see Requirement 1.3: THE System SHALL provide a health check endpoint `/api/health/ai`
   * @see REQ-3.3: CodingAgentAdapter の可用性情報も返す
   */
  private async handleAIHealth(res: http.ServerResponse): Promise<void> {
    const [status, availableCodingAgents] = await Promise.all([
      this.aiHealthChecker.getHealthStatus(),
      this.codingAgentRegistry.getAvailableAgents(),
    ]);

    this.sendResponse(res, 200, {
      success: true,
      data: {
        available: status.available || availableCodingAgents.length > 0,
        ollamaRunning: status.ollamaRunning,
        modelsInstalled: status.modelsInstalled,
        recommendedModels: status.recommendedModels,
        setupInstructions: status.setupInstructions,
        codingAgents: {
          available: availableCodingAgents.length > 0,
          agents: availableCodingAgents.map((a) => a.name),
          registeredAgents: this.codingAgentRegistry.getRegisteredNames(),
        },
      },
    });
  }

  // ===========================================================================
  // タスク ハンドラー
  // ===========================================================================

  /**
   * タスク送信
   *
   * タスク送信前にAI可用性を確認し、利用不可の場合は503エラーを返す。
   * バリデーションエラーは400、AI利用不可は503として処理する。
   *
   * @param req - HTTPリクエスト
   * @param res - HTTPレスポンス
   *
   * @see Requirement 1.1: THE Orchestrator SHALL check AI adapter availability
   * @see Requirement 1.2: IF Ollama is not available, display error message with setup instructions
   * @see Requirement 2.2: THE Orchestrator Server SHALL validate the task and return a run ID immediately
   */
  private async handleSubmitTask(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<SubmitTaskRequest>(req);

    // 入力バリデーション（AI可用性チェックより先に実行）
    if (!body.instruction || !body.projectId) {
      this.sendErrorResponse(
        res,
        400,
        'instruction and projectId are required',
        'VALIDATION_ERROR'
      );
      return;
    }

    // AI可用性チェック（Ollama OR CodingAgent で許可）
    // @see REQ-3.1: Ollama だけでなく CodingAgentRegistry の可用性も考慮
    // @see REQ-3.2: Ollama 利用不可でも CodingAgent 利用可能ならタスク送信許可
    const aiStatus = await this.aiHealthChecker.checkOllamaAvailability();
    const availableCodingAgents = await this.codingAgentRegistry.getAvailableAgents();
    const hasCodingAgent = availableCodingAgents.length > 0;

    if (!aiStatus.available && !hasCodingAgent) {
      // 両方利用不可 → 503 エラー
      this.sendResponse(res, 503, {
        success: false,
        error: 'AI execution platform is not available',
        code: 'AI_UNAVAILABLE',
        data: {
          ollamaRunning: aiStatus.ollamaRunning,
          codingAgentsAvailable: false,
          setupInstructions: aiStatus.setupInstructions,
          recommendedModels: aiStatus.recommendedModels,
        },
      });
      return;
    }

    const taskId = await this.orchestrator.submitTask(body.instruction, body.projectId, {
      priority: body.priority,
      tags: body.tags,
      deadline: body.deadline,
    });

    this.sendResponse(res, 201, {
      success: true,
      data: { taskId },
    });
  }

  /**
   * タスクステータス取得
   *
   * @param taskId - タスクID
   * @param res - HTTPレスポンス
   */
  private async handleGetTaskStatus(
    taskId: string,
    res: http.ServerResponse
  ): Promise<void> {
    const status = await this.orchestrator.getTaskStatus(taskId);
    this.sendResponse(res, 200, { success: true, data: status });
  }

  /**
   * タスクキャンセル
   *
   * @param taskId - タスクID
   * @param res - HTTPレスポンス
   */
  private async handleCancelTask(
    taskId: string,
    res: http.ServerResponse
  ): Promise<void> {
    await this.orchestrator.cancelTask(taskId);
    this.sendResponse(res, 200, { success: true, data: { taskId, cancelled: true } });
  }

  // ===========================================================================
  // エージェント ハンドラー
  // ===========================================================================

  /**
   * アクティブエージェント取得
   *
   * @param res - HTTPレスポンス
   */
  private async handleGetAgents(res: http.ServerResponse): Promise<void> {
    const agents = await this.orchestrator.getActiveAgents();
    this.sendResponse(res, 200, { success: true, data: agents });
  }

  /**
   * 全エージェント一時停止
   *
   * @param res - HTTPレスポンス
   */
  private async handlePauseAgents(res: http.ServerResponse): Promise<void> {
    await this.orchestrator.pauseAllAgents();
    this.sendResponse(res, 200, { success: true, data: { paused: true } });
  }

  /**
   * 全エージェント再開
   *
   * @param res - HTTPレスポンス
   */
  private async handleResumeAgents(res: http.ServerResponse): Promise<void> {
    await this.orchestrator.resumeAllAgents();
    this.sendResponse(res, 200, { success: true, data: { resumed: true } });
  }

  /**
   * 緊急停止
   *
   * @param res - HTTPレスポンス
   */
  private async handleEmergencyStop(res: http.ServerResponse): Promise<void> {
    await this.orchestrator.emergencyStop();
    this.sendResponse(res, 200, { success: true, data: { emergencyStopped: true } });
  }

  // ===========================================================================
  // チケット ハンドラー
  // ===========================================================================

  /**
   * チケット作成してタスク実行
   *
   * @param req - HTTPリクエスト
   * @param res - HTTPレスポンス
   */
  private async handleCreateTicket(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<{
      projectId: string;
      instruction: string;
      priority?: 'low' | 'medium' | 'high';
      deadline?: string;
      tags?: string[];
      autoExecute?: boolean;
    }>(req);

    if (!body.projectId || !body.instruction) {
      this.sendErrorResponse(
        res,
        400,
        'projectId and instruction are required',
        'VALIDATION_ERROR'
      );
      return;
    }

    // チケット作成
    const ticket = await this.ticketManager.createParentTicket(
      body.projectId,
      body.instruction,
      {
        priority: body.priority ?? 'medium',
        deadline: body.deadline,
        tags: body.tags ?? [],
      }
    );

    // 自動実行が有効な場合はタスクを送信
    if (body.autoExecute !== false) {
      await this.orchestrator.submitTask(body.instruction, body.projectId, {
        priority: body.priority,
        tags: body.tags,
        deadline: body.deadline,
      });
    }

    this.sendResponse(res, 201, {
      success: true,
      data: { ticketId: ticket.id, autoExecuted: body.autoExecute !== false },
    });
  }

  /**
   * チケットワークフロー実行
   *
   * @param ticketId - チケットID
   * @param res - HTTPレスポンス
   */
  private async handleExecuteTicket(
    ticketId: string,
    res: http.ServerResponse
  ): Promise<void> {
    const runId = await this.orchestrator.executeTicketWorkflow(ticketId);
    this.sendResponse(res, 200, { success: true, data: { ticketId, runId } });
  }

  // ===========================================================================
  // 設定 ハンドラー（バリデーション統合）
  // ===========================================================================

  /**
   * 設定取得
   *
   * @param res - HTTPレスポンス
   *
   * @see Requirement 8.1: THE Settings page SHALL allow selection of AI adapter
   * @see Requirement 8.2: THE Settings page SHALL allow configuration of Ollama host URL
   * @see Requirement 8.3: THE Settings page SHALL allow selection of AI model
   */
  private async handleGetConfig(res: http.ServerResponse): Promise<void> {
    const config = await this.orchestrator.getConfig();
    this.sendResponse(res, 200, { success: true, data: config });
  }

  /**
   * 設定更新（バリデーション付き）
   *
   * 設定を更新する前にバリデーションを実行し、無効な設定は422エラーで拒否する。
   * バリデーション通過後、Orchestratorに設定を適用する（再起動不要）。
   *
   * @param req - HTTPリクエスト
   * @param res - HTTPレスポンス
   *
   * @see Requirement 8.4: THE System SHALL validate settings before saving
   * @see Requirement 8.5: WHEN settings are changed, THE System SHALL apply them without restart
   */
  private async handleUpdateConfig(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<Partial<SystemConfig>>(req);

    // AI設定のバリデーション
    // @see Requirement 8.4: THE System SHALL validate settings before saving
    const validationResult = validateAISettings(body);
    if (!validationResult.valid) {
      this.sendResponse(res, 422, {
        success: false,
        error: `設定のバリデーションに失敗しました: ${validationResult.errors.join('; ')}`,
        code: 'VALIDATION_ERROR',
        data: {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        },
      });
      return;
    }

    // Orchestratorに設定を適用（再起動不要のホットリロード）
    // @see Requirement 8.5: THE System SHALL apply them without restart
    await this.orchestrator.updateConfig(body);
    const config = await this.orchestrator.getConfig();

    this.sendResponse(res, 200, {
      success: true,
      data: {
        config,
        warnings: validationResult.warnings,
      },
    });
  }

  /**
   * 設定バリデーション（ドライラン）
   *
   * 設定を保存せずにバリデーションのみ実行する。
   * GUIのリアルタイムバリデーションに使用。
   *
   * @param req - HTTPリクエスト
   * @param res - HTTPレスポンス
   *
   * @see Requirement 8.4: THE System SHALL validate settings before saving
   */
  private async handleValidateConfig(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<Partial<SystemConfig>>(req);

    const validationResult = validateAISettings(body);

    this.sendResponse(res, 200, {
      success: true,
      data: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      },
    });
  }

  // ===========================================================================
  // Runs ハンドラー（成果物・レポート取得）
  // ===========================================================================

  /**
   * 実行レポート取得
   *
   * ExecutionReporterが生成したレポートデータを返す。
   * レポートが存在しない場合は404エラーを返す。
   *
   * @param runId - 実行ID
   * @param res - HTTPレスポンス
   *
   * @see Requirement 5.5: THE GUI SHALL display artifacts and report on Runs detail page
   */
  private async handleGetRunReport(
    runId: string,
    res: http.ServerResponse
  ): Promise<void> {
    // RunDirectoryManagerで実行ディレクトリの存在を確認
    const runDirManager = this.orchestrator.getRunDirectoryManager();
    const exists = await runDirManager.exists(runId);

    if (!exists) {
      this.sendErrorResponse(res, 404, `Run not found: ${runId}`, 'RUN_NOT_FOUND');
      return;
    }

    // タスクメタデータを取得
    const metadata = await runDirManager.loadTaskMetadata(runId);

    this.sendResponse(res, 200, {
      success: true,
      data: {
        runId,
        metadata,
      },
    });
  }

  /**
   * 実行成果物一覧取得
   *
   * 実行ディレクトリ内の成果物一覧を返す。
   * 実行ディレクトリが存在しない場合は404エラーを返す。
   *
   * @param runId - 実行ID
   * @param res - HTTPレスポンス
   *
   * @see Requirement 5.5: THE GUI SHALL display artifacts and report on Runs detail page
   */
  private async handleGetRunArtifacts(
    runId: string,
    res: http.ServerResponse
  ): Promise<void> {
    const runDirManager = this.orchestrator.getRunDirectoryManager();
    const exists = await runDirManager.exists(runId);

    if (!exists) {
      this.sendErrorResponse(res, 404, `Run not found: ${runId}`, 'RUN_NOT_FOUND');
      return;
    }

    // 成果物ディレクトリの内容を取得
    const runDir = runDirManager.getRunDirectory(runId);
    let artifacts: string[] = [];
    try {
      const { readdir } = await import('fs/promises');
      const artifactsDir = `${runDir}/artifacts`;
      const files = await readdir(artifactsDir);
      artifacts = files;
    } catch {
      // 成果物ディレクトリが存在しない場合は空配列
      artifacts = [];
    }

    this.sendResponse(res, 200, {
      success: true,
      data: {
        runId,
        artifacts,
      },
    });
  }

  /**
   * 品質ゲート結果取得
   *
   * QualityGateIntegrationが保存した品質ゲート結果を返す。
   * 結果が存在しない場合は404エラーを返す。
   *
   * @param runId - 実行ID
   * @param res - HTTPレスポンス
   *
   * @see Requirement 4.3: THE System SHALL record quality gate results to quality.json
   */
  private async handleGetRunQuality(
    runId: string,
    res: http.ServerResponse
  ): Promise<void> {
    const qualityGate = this.orchestrator.getQualityGateIntegration();
    const results = await qualityGate.loadResults(runId);

    if (!results) {
      this.sendErrorResponse(
        res,
        404,
        `Quality gate results not found for run: ${runId}`,
        'QUALITY_RESULTS_NOT_FOUND'
      );
      return;
    }

    this.sendResponse(res, 200, {
      success: true,
      data: results,
    });
  }

  // ===========================================================================
  // ダッシュボード ハンドラー
  // ===========================================================================

  /**
   * ダッシュボード用統合ステータス
   *
   * AI可用性ステータスを含む統合情報を返す。
   * 各コンポーネントの取得エラーは個別にハンドリングし、
   * 部分的なデータでもレスポンスを返す。
   *
   * @param res - HTTPレスポンス
   *
   * @see Requirement 7.1: THE Dashboard SHALL show active workers count and their current tasks
   * @see Requirement 7.2: THE Dashboard SHALL show pending tasks queue length
   * @see Requirement 7.3: THE Dashboard SHALL show completed tasks count and success rate
   */
  private async handleDashboardStatus(res: http.ServerResponse): Promise<void> {
    // 並列で各データを取得（個別エラーハンドリング付き）
    const [agents, config, tasks, aiHealth, availableCodingAgents] = await Promise.all([
      this.orchestrator.getActiveAgents().catch(() => []),
      this.orchestrator.getConfig().catch(() => null),
      Promise.resolve(this.orchestrator.getAllTasks()),
      this.aiHealthChecker.getHealthStatus().catch(() => null),
      this.codingAgentRegistry.getAvailableAgents().catch(() => []),
    ]);

    // タスクサマリーを計算
    const taskSummary = {
      pending: tasks.filter((t) => t.status === 'pending').length,
      decomposing: tasks.filter((t) => t.status === 'decomposing').length,
      executing: tasks.filter((t) => t.status === 'executing').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };

    // 成功率を計算
    const totalFinished = taskSummary.completed + taskSummary.failed;
    const successRate = totalFinished > 0
      ? Math.round((taskSummary.completed / totalFinished) * 100)
      : 0;

    this.sendResponse(res, 200, {
      success: true,
      data: {
        workers: agents.filter((a) => a.type === 'worker'),
        managers: agents.filter((a) => a.type === 'manager'),
        tasks: {
          ...taskSummary,
          successRate,
        },
        recentTasks: tasks.slice(0, 10),
        systemStatus: {
          paused: this.orchestrator.isPaused(),
          emergencyStopped: this.orchestrator.isEmergencyStopped(),
          initialized: this.orchestrator.isInitialized(),
        },
        // AI可用性ステータスを統合
        // @see REQ-3.4: CodingAgentAdapter の状態を含める
        aiStatus: aiHealth ? {
          available: aiHealth.available || availableCodingAgents.length > 0,
          ollamaRunning: aiHealth.ollamaRunning,
          modelsInstalled: aiHealth.modelsInstalled,
          codingAgentsAvailable: availableCodingAgents.length > 0,
          codingAgentNames: availableCodingAgents.map((a) => a.name),
        } : null,
        config: config ? {
          maxConcurrentWorkers: config.maxConcurrentWorkers,
          containerRuntime: config.containerRuntime,
          defaultAiAdapter: config.defaultAiAdapter,
          defaultModel: config.defaultModel,
        } : null,
        lastUpdated: new Date().toISOString(),
      },
    });
  }

  // ===========================================================================
  // エラーハンドリング
  // ===========================================================================

  /**
   * ルーティングエラーを処理
   *
   * エラーの種類に応じて適切なHTTPステータスコードとエラーメッセージを返す。
   * - OrchestratorError: 400 Bad Request
   * - SettingsValidationError: 422 Unprocessable Entity
   * - SyntaxError (JSON parse): 400 Bad Request
   * - その他: 500 Internal Server Error
   *
   * @param res - HTTPレスポンス
   * @param error - 発生したエラー
   */
  private handleRouteError(res: http.ServerResponse, error: unknown): void {
    // OrchestratorError: ビジネスロジックエラー
    if (error instanceof OrchestratorError) {
      this.sendResponse(res, 400, {
        success: false,
        error: error.message,
        code: error.code,
      });
      return;
    }

    // SettingsValidationError: 設定バリデーションエラー
    if (error instanceof SettingsValidationError) {
      this.sendResponse(res, 422, {
        success: false,
        error: error.message,
        code: 'SETTINGS_VALIDATION_ERROR',
        data: {
          errors: error.validationResult.errors,
          warnings: error.validationResult.warnings,
        },
      });
      return;
    }

    // JSONパースエラー
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      this.sendErrorResponse(res, 400, 'Invalid JSON body', 'INVALID_JSON');
      return;
    }

    // その他のエラー
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OrchestratorServer] Unexpected error:', error);
    this.sendErrorResponse(res, 500, message, 'INTERNAL_ERROR');
  }

  // ===========================================================================
  // ユーティリティ
  // ===========================================================================

  /**
   * リクエストボディをパース
   *
   * ボディサイズの上限チェックを行い、不正なJSONは例外をスローする。
   *
   * @param req - HTTPリクエスト
   * @returns パースされたボディ
   * @throws SyntaxError - JSONパースエラー
   * @throws Error - ボディサイズ超過
   */
  private parseBody<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        // ボディサイズの上限チェック
        if (size > MAX_BODY_SIZE) {
          req.destroy();
          reject(new OrchestratorError(
            'Request body too large',
            'BODY_TOO_LARGE'
          ));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : ({} as T));
        } catch (error) {
          reject(new SyntaxError('Invalid JSON body'));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * 成功レスポンスを送信
   *
   * @param res - HTTPレスポンス
   * @param statusCode - HTTPステータスコード
   * @param data - レスポンスデータ
   */
  private sendResponse<T>(
    res: http.ServerResponse,
    statusCode: number,
    data: ApiResponse<T> | null
  ): void {
    res.writeHead(statusCode, CORS_HEADERS);
    if (data !== null) {
      res.end(JSON.stringify(data));
    } else {
      res.end();
    }
  }

  /**
   * エラーレスポンスを送信（ヘルパー）
   *
   * @param res - HTTPレスポンス
   * @param statusCode - HTTPステータスコード
   * @param message - エラーメッセージ
   * @param code - エラーコード
   */
  private sendErrorResponse(
    res: http.ServerResponse,
    statusCode: number,
    message: string,
    code: string
  ): void {
    this.sendResponse(res, statusCode, {
      success: false,
      error: message,
      code,
    });
  }

  // ===========================================================================
  // パブリックアクセサ
  // ===========================================================================

  /**
   * 実行中かどうか
   *
   * @returns サーバーが実行中の場合true
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * ポート番号を取得
   *
   * @returns サーバーのポート番号
   */
  getPort(): number {
    return this.port;
  }

  // ===========================================================================
  // ワークフローAPI ハンドラー
  // @see Requirements: 15.1-15.11
  // ===========================================================================

  /**
   * ワークフローサブリソースのルーティング
   * @param pathname - リクエストパス
   * @param method - HTTPメソッド
   * @param req - リクエスト
   * @param res - レスポンス
   * @returns マッチした場合true
   */
  private async routeWorkflowSubResource(
    pathname: string,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean> {
    // /api/workflows/:id/approve
    if (pathname.endsWith('/approve') && method === 'POST') {
      const workflowId = this.extractWorkflowId(pathname, '/approve');
      await this.handleWorkflowApprove(workflowId, req, res);
      return true;
    }

    // /api/workflows/:id/escalation
    if (pathname.endsWith('/escalation') && method === 'POST') {
      const workflowId = this.extractWorkflowId(pathname, '/escalation');
      await this.handleWorkflowEscalation(workflowId, req, res);
      return true;
    }

    // /api/workflows/:id/rollback
    if (pathname.endsWith('/rollback') && method === 'POST') {
      const workflowId = this.extractWorkflowId(pathname, '/rollback');
      await this.handleWorkflowRollback(workflowId, req, res);
      return true;
    }

    // /api/workflows/:id/proposal
    if (pathname.endsWith('/proposal') && method === 'GET') {
      const workflowId = this.extractWorkflowId(pathname, '/proposal');
      await this.handleGetWorkflowProposal(workflowId, res);
      return true;
    }

    // /api/workflows/:id/deliverable
    if (pathname.endsWith('/deliverable') && method === 'GET') {
      const workflowId = this.extractWorkflowId(pathname, '/deliverable');
      await this.handleGetWorkflowDeliverable(workflowId, res);
      return true;
    }

    // /api/workflows/:id/meetings
    if (pathname.endsWith('/meetings') && method === 'GET') {
      const workflowId = this.extractWorkflowId(pathname, '/meetings');
      await this.handleGetWorkflowMeetings(workflowId, res);
      return true;
    }

    // /api/workflows/:id/progress
    if (pathname.endsWith('/progress') && method === 'GET') {
      const workflowId = this.extractWorkflowId(pathname, '/progress');
      await this.handleGetWorkflowProgress(workflowId, res);
      return true;
    }

    // /api/workflows/:id/quality
    if (pathname.endsWith('/quality') && method === 'GET') {
      const workflowId = this.extractWorkflowId(pathname, '/quality');
      await this.handleGetWorkflowQuality(workflowId, res);
      return true;
    }

    // GET /api/workflows/:id（サブリソースなし = 詳細取得）
    if (method === 'GET') {
      const workflowId = pathname.replace('/api/workflows/', '');
      if (workflowId && !workflowId.includes('/')) {
        await this.handleGetWorkflowState(workflowId, res);
        return true;
      }
    }

    return false;
  }

  /**
   * パスからワークフローIDを抽出
   */
  private extractWorkflowId(pathname: string, suffix: string): string {
    return pathname.replace('/api/workflows/', '').replace(suffix, '');
  }

  /**
   * POST /api/workflows - ワークフロー開始
   * @see Requirement 15.1
   */
  private async handleStartWorkflow(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<{ instruction: string; projectId: string }>(req);

    if (!body.instruction || !body.projectId) {
      this.sendErrorResponse(res, 400, 'instruction と projectId は必須です', 'VALIDATION_ERROR');
      return;
    }

    const workflowId = await this.workflowEngine.startWorkflow(
      body.instruction,
      body.projectId
    );
    this.sendResponse(res, 201, { success: true, data: { workflowId } });
  }

  /**
   * GET /api/workflows - ワークフロー一覧
   * @see Requirement 15.2
   */
  private async handleListWorkflows(
    status: string | undefined,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const filter = status ? { status: status as import('./types.js').WorkflowStatus } : undefined;
      const workflows = await this.workflowEngine.listWorkflows(filter);
      this.sendResponse(res, 200, { success: true, data: { workflows } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * GET /api/workflows/:id - ワークフロー状態取得
   * @see Requirement 15.3
   */
  private async handleGetWorkflowState(
    workflowId: string,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const state = await this.workflowEngine.getWorkflowState(workflowId);
      if (!state) {
        this.sendErrorResponse(res, 404, `ワークフローが見つかりません: ${workflowId}`, 'WORKFLOW_NOT_FOUND');
        return;
      }
      this.sendResponse(res, 200, { success: true, data: { workflow: state } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * POST /api/workflows/:id/approve - CEO承認決定送信
   * @see Requirement 15.4
   */
  private async handleWorkflowApprove(
    workflowId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<{
      action: 'approve' | 'request_revision' | 'reject';
      feedback?: string;
    }>(req);

    if (!body.action) {
      this.sendErrorResponse(res, 400, 'action は必須です', 'VALIDATION_ERROR');
      return;
    }

    try {
      const state = await this.workflowEngine.getWorkflowState(workflowId);
      if (!state) {
        this.sendErrorResponse(res, 404, `ワークフローが見つかりません: ${workflowId}`, 'WORKFLOW_NOT_FOUND');
        return;
      }

      if (state.status !== 'waiting_approval') {
        this.sendErrorResponse(res, 400, `ワークフロー ${workflowId} は承認待ちではありません`, 'INVALID_STATE');
        return;
      }

      const decision: ApprovalDecision = {
        workflowId,
        phase: state.currentPhase,
        action: body.action,
        feedback: body.feedback,
        decidedAt: new Date().toISOString(),
      };

      // ApprovalGateに送信（resolverの有無を返す）
      const hadResolver = await this.approvalGate.submitDecision(workflowId, decision);

      if (!hadResolver) {
        // サーバー再起動後: resolverがないのでWorkflowEngine経由で直接処理
        await this.workflowEngine.submitApprovalDirectly(workflowId, decision);
      }

      this.sendResponse(res, 200, { success: true, data: { message: '承認決定を送信しました' } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * GET /api/workflows/:id/proposal - 提案書取得
   * @see Requirement 15.5
   */
  private async handleGetWorkflowProposal(
    workflowId: string,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const state = await this.workflowEngine.getWorkflowState(workflowId);
      if (!state) {
        this.sendErrorResponse(res, 404, `ワークフローが見つかりません: ${workflowId}`, 'WORKFLOW_NOT_FOUND');
        return;
      }
      this.sendResponse(res, 200, { success: true, data: { proposal: state.proposal ?? null } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * GET /api/workflows/:id/deliverable - 納品物取得
   * @see Requirement 15.6
   */
  private async handleGetWorkflowDeliverable(
    workflowId: string,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const state = await this.workflowEngine.getWorkflowState(workflowId);
      if (!state) {
        this.sendErrorResponse(res, 404, `ワークフローが見つかりません: ${workflowId}`, 'WORKFLOW_NOT_FOUND');
        return;
      }
      this.sendResponse(res, 200, { success: true, data: { deliverable: state.deliverable ?? null } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * GET /api/workflows/:id/meetings - 会議録一覧取得
   * @see Requirement 15.7
   */
  private async handleGetWorkflowMeetings(
    workflowId: string,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const state = await this.workflowEngine.getWorkflowState(workflowId);
      if (!state) {
        this.sendErrorResponse(res, 404, `ワークフローが見つかりません: ${workflowId}`, 'WORKFLOW_NOT_FOUND');
        return;
      }
      this.sendResponse(res, 200, {
        success: true,
        data: { meetingMinutesIds: state.meetingMinutesIds },
      });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * POST /api/workflows/:id/escalation - エスカレーション決定送信
   * @see Requirement 15.8
   */
  private async handleWorkflowEscalation(
    workflowId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<{
      action: 'retry' | 'skip' | 'abort';
      reason?: string;
    }>(req);

    if (!body.action) {
      this.sendErrorResponse(res, 400, 'action は必須です', 'VALIDATION_ERROR');
      return;
    }

    try {
      const decision: EscalationDecision = {
        action: body.action as EscalationDecision['action'],
        reason: body.reason ?? '',
        decidedAt: new Date().toISOString(),
      };

      await this.workflowEngine.handleEscalation(workflowId, decision);
      this.sendResponse(res, 200, { success: true, data: { message: 'エスカレーション決定を処理しました' } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * POST /api/workflows/:id/rollback - フェーズロールバック
   * @see Requirement 15.9
   */
  private async handleWorkflowRollback(
    workflowId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = await this.parseBody<{ targetPhase: string }>(req);

    if (!body.targetPhase) {
      this.sendErrorResponse(res, 400, 'targetPhase は必須です', 'VALIDATION_ERROR');
      return;
    }

    try {
      await this.workflowEngine.rollbackToPhase(
        workflowId,
        body.targetPhase as WorkflowPhase
      );
      this.sendResponse(res, 200, { success: true, data: { message: 'ロールバックを実行しました' } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * GET /api/workflows/:id/progress - 開発進捗取得
   * @see Requirement 15.10
   */
  private async handleGetWorkflowProgress(
    workflowId: string,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const progress = await this.workflowEngine.getProgress(workflowId);
      this.sendResponse(res, 200, { success: true, data: { progress } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * GET /api/workflows/:id/quality - 品質結果取得
   * @see Requirement 15.11
   */
  private async handleGetWorkflowQuality(
    workflowId: string,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const quality = await this.workflowEngine.getQualityResults(workflowId);
      this.sendResponse(res, 200, { success: true, data: { quality } });
    } catch (error) {
      this.handleRouteError(res, error);
    }
  }

  /**
   * WorkflowEngineインスタンスを取得（テスト・統合用）
   */
  getWorkflowEngine(): WorkflowEngine {
    return this.workflowEngine;
  }

  /**
   * ApprovalGateインスタンスを取得（テスト・統合用）
   */
  getApprovalGate(): ApprovalGate {
    return this.approvalGate;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * OrchestratorServerを作成
 *
 * @param config - サーバー設定
 * @returns OrchestratorServerインスタンス
 */
export function createOrchestratorServer(
  config?: OrchestratorServerConfig
): OrchestratorServer {
  return new OrchestratorServer(config);
}

// =============================================================================
// CLI起動用
// =============================================================================

/**
 * サーバーをCLIから起動
 *
 * @param port - サーバーポート（オプション）
 * @returns 起動済みのOrchestratorServerインスタンス
 */
export async function startServer(port?: number): Promise<OrchestratorServer> {
  const server = createOrchestratorServer({ port });
  await server.start();
  return server;
}

export default OrchestratorServer;
