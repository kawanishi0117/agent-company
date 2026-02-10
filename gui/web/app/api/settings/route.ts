/**
 * @file Settings API Route
 * @description GET/PUT /api/settings - システム設定の取得・更新（AI関連設定強化）
 * @requirements 15.1, 15.2, 15.3, 15.4, 15.7, 8.1, 8.2, 8.3
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義（tools/cli/lib/execution/types.tsと同期）
// =============================================================================

/**
 * コンテナランタイム種別
 */
type ContainerRuntimeType = 'dod' | 'rootless' | 'dind';

/**
 * メッセージキュー種別
 */
type MessageQueueType = 'file' | 'sqlite' | 'redis';

/**
 * Git認証種別
 */
type GitCredentialType = 'deploy_key' | 'token' | 'ssh_agent';

/**
 * システム設定
 * @see Requirement 15.2: THE Settings page SHALL allow configuring: max concurrent workers, worker memory limit, command timeout, AI adapter selection
 * @see Requirements 8.1, 8.2, 8.3: AI関連設定
 */
interface SystemConfig {
  // ワーカー設定
  maxConcurrentWorkers: number;
  defaultTimeout: number;
  workerMemoryLimit: string;
  workerCpuLimit: string;

  // AI設定
  defaultAiAdapter: string;
  defaultModel: string;
  /** Ollama接続先URL（例: http://localhost:11434） */
  ollamaHost: string;

  // コンテナランタイム設定
  containerRuntime: ContainerRuntimeType;
  dockerSocketPath?: string;
  allowedDockerCommands: string[];

  // メッセージキュー設定
  messageQueueType: MessageQueueType;
  messageQueuePath?: string;

  // Git認証設定
  gitCredentialType: GitCredentialType;
  gitSshAgentEnabled: boolean;

  // その他
  stateRetentionDays: number;
  integrationBranch: string;
  autoRefreshInterval: number;
}

/**
 * デフォルトシステム設定
 */
const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  maxConcurrentWorkers: 3,
  defaultTimeout: 300,
  workerMemoryLimit: '4g',
  workerCpuLimit: '2',
  defaultAiAdapter: 'ollama',
  defaultModel: 'llama3.2:1b',
  ollamaHost: 'http://localhost:11434',
  containerRuntime: 'dod',
  allowedDockerCommands: ['run', 'stop', 'rm', 'logs', 'inspect'],
  messageQueueType: 'file',
  gitCredentialType: 'token',
  gitSshAgentEnabled: false,
  stateRetentionDays: 7,
  integrationBranch: 'develop',
  autoRefreshInterval: 5000,
};

/**
 * API レスポンス型
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// =============================================================================
// 定数
// =============================================================================

/**
 * 設定ファイルパス
 * @see Requirement 15.3: THE settings SHALL be saved to `runtime/state/config.json`
 */
// GUIは gui/web/ から実行されるため、ルートへは2階層上がる必要がある
const CONFIG_FILE_PATH = path.join(process.cwd(), '..', '..', 'runtime', 'state', 'config.json');

/**
 * 有効なコンテナランタイム種別
 */
const VALID_CONTAINER_RUNTIMES: ContainerRuntimeType[] = ['dod', 'rootless', 'dind'];

/**
 * 有効なメッセージキュー種別
 */
const VALID_MESSAGE_QUEUE_TYPES: MessageQueueType[] = ['file', 'sqlite', 'redis'];

/**
 * 有効なGit認証種別
 */
const VALID_GIT_CREDENTIAL_TYPES: GitCredentialType[] = ['deploy_key', 'token', 'ssh_agent'];

/**
 * 利用可能なAIアダプタ一覧（ローカルフォールバック）
 * @see Requirement 8.1: AIアダプタ選択
 */
const AVAILABLE_AI_ADAPTERS = ['ollama', 'gemini', 'kiro', 'opencode', 'claude'];

/**
 * Orchestrator APIサーバーのURL
 */
const ORCHESTRATOR_API_URL = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

/**
 * Ollama host URLの正規表現パターン
 * http(s)://hostname:port 形式を許可
 */
const OLLAMA_HOST_URL_PATTERN = /^https?:\/\/[a-zA-Z0-9._-]+(:\d{1,5})?$/;

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 設定ファイルを読み込む
 * @returns システム設定
 */
async function loadConfig(): Promise<SystemConfig> {
  try {
    const configJson = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const config = JSON.parse(configJson) as Partial<SystemConfig>;
    // デフォルト値とマージ
    return { ...DEFAULT_SYSTEM_CONFIG, ...config };
  } catch (error) {
    // ファイルが存在しない場合はデフォルト値を返す
    if (isFileNotFoundError(error)) {
      return { ...DEFAULT_SYSTEM_CONFIG };
    }
    throw error;
  }
}

/**
 * 設定ファイルを保存する
 * @param config - 保存する設定
 */
async function saveConfig(config: SystemConfig): Promise<void> {
  // ディレクトリが存在することを確認
  const configDir = path.dirname(CONFIG_FILE_PATH);
  await fs.mkdir(configDir, { recursive: true });

  // 設定をJSON形式で保存
  const configJson = JSON.stringify(config, null, 2);
  await fs.writeFile(CONFIG_FILE_PATH, configJson, 'utf-8');
}

/**
 * ファイルが存在しないエラーかどうかを判定
 */
function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/**
 * Orchestrator APIから設定を取得する
 * @returns Orchestratorの設定（取得失敗時はnull）
 * @see Requirement 8.3: Orchestrator APIとの連携
 */
async function getOrchestratorConfig(): Promise<Partial<SystemConfig> | null> {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_URL}/api/config`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3秒タイムアウト
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    if (result.success && result.data) {
      return result.data as Partial<SystemConfig>;
    }

    return null;
  } catch {
    // Orchestrator APIが利用不可の場合はnullを返す
    return null;
  }
}

/**
 * Orchestrator APIから利用可能なAIアダプタ一覧を取得する
 * @returns アダプタ名の配列（取得失敗時はローカルフォールバック）
 * @see Requirement 8.1: AIアダプタ選択
 */
async function getAvailableAdapters(): Promise<string[]> {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_URL}/api/config`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return AVAILABLE_AI_ADAPTERS;
    }

    const result = await response.json();

    if (result.success && result.data?.availableAdapters) {
      const adapters = result.data.availableAdapters as string[];
      return adapters.length > 0 ? adapters : AVAILABLE_AI_ADAPTERS;
    }

    return AVAILABLE_AI_ADAPTERS;
  } catch {
    // Orchestrator APIが利用不可の場合はローカルフォールバックを返す
    return AVAILABLE_AI_ADAPTERS;
  }
}

/**
 * Orchestrator APIに設定変更を通知する
 * @param config - 通知する設定
 * @returns 通知成功時はtrue
 * @see Requirement 8.3: Orchestrator APIとの連携
 */
async function notifyOrchestratorConfigChange(config: SystemConfig): Promise<boolean> {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_URL}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(3000),
    });

    return response.ok;
  } catch {
    // Orchestrator APIが利用不可の場合は通知失敗（ローカル保存は成功扱い）
    return false;
  }
}

/**
 * 設定のバリデーション
 * @param config - バリデーション対象の設定
 * @returns エラーメッセージの配列（空の場合は有効）
 */
function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (config === null || config === undefined || typeof config !== 'object') {
    return ['設定はオブジェクトである必要があります'];
  }

  const cfg = config as Record<string, unknown>;

  // ワーカー設定のバリデーション
  if (cfg.maxConcurrentWorkers !== undefined) {
    if (
      typeof cfg.maxConcurrentWorkers !== 'number' ||
      cfg.maxConcurrentWorkers < 1 ||
      cfg.maxConcurrentWorkers > 10
    ) {
      errors.push('maxConcurrentWorkersは1〜10の数値である必要があります');
    }
  }

  if (cfg.defaultTimeout !== undefined) {
    if (
      typeof cfg.defaultTimeout !== 'number' ||
      cfg.defaultTimeout < 30 ||
      cfg.defaultTimeout > 3600
    ) {
      errors.push('defaultTimeoutは30〜3600秒の数値である必要があります');
    }
  }

  if (cfg.workerMemoryLimit !== undefined) {
    if (typeof cfg.workerMemoryLimit !== 'string' || !/^\d+[gmGM]$/.test(cfg.workerMemoryLimit)) {
      errors.push('workerMemoryLimitは "4g" のような形式である必要があります');
    }
  }

  if (cfg.workerCpuLimit !== undefined) {
    if (typeof cfg.workerCpuLimit !== 'string' || !/^\d+(\.\d+)?$/.test(cfg.workerCpuLimit)) {
      errors.push('workerCpuLimitは "2" や "1.5" のような形式である必要があります');
    }
  }

  // AI設定のバリデーション
  if (cfg.defaultAiAdapter !== undefined) {
    if (
      typeof cfg.defaultAiAdapter !== 'string' ||
      !AVAILABLE_AI_ADAPTERS.includes(cfg.defaultAiAdapter)
    ) {
      errors.push(
        `defaultAiAdapterは ${AVAILABLE_AI_ADAPTERS.join(', ')} のいずれかである必要があります`
      );
    }
  }

  if (cfg.defaultModel !== undefined) {
    if (typeof cfg.defaultModel !== 'string' || cfg.defaultModel.length === 0) {
      errors.push('defaultModelは空でない文字列である必要があります');
    }
  }

  // Ollama host URLのバリデーション
  // @see Requirement 8.2: Ollama接続先設定
  if (cfg.ollamaHost !== undefined) {
    if (typeof cfg.ollamaHost !== 'string') {
      errors.push('ollamaHostは文字列である必要があります');
    } else if (!OLLAMA_HOST_URL_PATTERN.test(cfg.ollamaHost)) {
      errors.push('ollamaHostは "http://hostname:port" 形式のURLである必要があります（例: http://localhost:11434）');
    }
  }

  // コンテナランタイム設定のバリデーション
  if (cfg.containerRuntime !== undefined) {
    if (!VALID_CONTAINER_RUNTIMES.includes(cfg.containerRuntime as ContainerRuntimeType)) {
      errors.push(
        `containerRuntimeは ${VALID_CONTAINER_RUNTIMES.join(', ')} のいずれかである必要があります`
      );
    }
  }

  // メッセージキュー設定のバリデーション
  if (cfg.messageQueueType !== undefined) {
    if (!VALID_MESSAGE_QUEUE_TYPES.includes(cfg.messageQueueType as MessageQueueType)) {
      errors.push(
        `messageQueueTypeは ${VALID_MESSAGE_QUEUE_TYPES.join(', ')} のいずれかである必要があります`
      );
    }
  }

  // Git認証設定のバリデーション
  if (cfg.gitCredentialType !== undefined) {
    if (!VALID_GIT_CREDENTIAL_TYPES.includes(cfg.gitCredentialType as GitCredentialType)) {
      errors.push(
        `gitCredentialTypeは ${VALID_GIT_CREDENTIAL_TYPES.join(', ')} のいずれかである必要があります`
      );
    }
  }

  // その他の設定のバリデーション
  if (cfg.stateRetentionDays !== undefined) {
    if (
      typeof cfg.stateRetentionDays !== 'number' ||
      cfg.stateRetentionDays < 1 ||
      cfg.stateRetentionDays > 365
    ) {
      errors.push('stateRetentionDaysは1〜365の数値である必要があります');
    }
  }

  if (cfg.autoRefreshInterval !== undefined) {
    if (
      typeof cfg.autoRefreshInterval !== 'number' ||
      cfg.autoRefreshInterval < 1000 ||
      cfg.autoRefreshInterval > 60000
    ) {
      errors.push('autoRefreshIntervalは1000〜60000ミリ秒の数値である必要があります');
    }
  }

  return errors;
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/settings
 * システム設定を取得する
 * Orchestrator APIが利用可能な場合はリモート設定とマージする
 * @returns システム設定（利用可能なAIアダプタ一覧を含む）
 * @see Requirement 15.1: THE GUI SHALL provide Settings page at `/settings`
 * @see Requirement 8.1: AIアダプタ選択
 * @see Requirement 8.3: Orchestrator APIとの連携
 */
export async function GET(): Promise<NextResponse<ApiResponse<SystemConfig & { availableAiAdapters: string[]; orchestratorSynced: boolean }>>> {
  try {
    // ローカル設定とOrchestrator設定を並列取得
    const [localConfig, orchestratorConfig, availableAdapters] = await Promise.all([
      loadConfig(),
      getOrchestratorConfig(),
      getAvailableAdapters(),
    ]);

    // Orchestratorの設定が取得できた場合はマージ（ローカル設定を優先）
    const mergedConfig: SystemConfig = orchestratorConfig
      ? { ...DEFAULT_SYSTEM_CONFIG, ...orchestratorConfig, ...localConfig }
      : localConfig;

    // 利用可能なAIアダプタ一覧と同期状態を付加して返す
    const responseData = {
      ...mergedConfig,
      availableAiAdapters: availableAdapters,
      orchestratorSynced: orchestratorConfig !== null,
    };

    return NextResponse.json({ data: responseData });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `設定の取得に失敗しました: ${message}` }, { status: 500 });
  }
}

/**
 * PUT /api/settings
 * システム設定を更新する
 * ローカル保存後、Orchestrator APIにも設定変更を通知する
 * @param request - リクエスト
 * @returns 更新後のシステム設定（Orchestrator同期状態を含む）
 * @see Requirement 15.3: THE settings SHALL be saved to `runtime/state/config.json`
 * @see Requirement 15.4: THE settings changes SHALL take effect immediately for new tasks
 * @see Requirement 8.3: Orchestrator APIとの連携
 */
export async function PUT(request: NextRequest): Promise<NextResponse<ApiResponse<SystemConfig & { orchestratorNotified: boolean }>>> {
  try {
    // リクエストボディをパース
    const body = await request.json();

    // バリデーション
    const validationErrors = validateConfig(body);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: `設定が無効です: ${validationErrors.join(', ')}` },
        { status: 400 }
      );
    }

    // 現在の設定を読み込み
    const currentConfig = await loadConfig();

    // 新しい設定とマージ
    const newConfig: SystemConfig = {
      ...currentConfig,
      ...body,
    };

    // ローカルに設定を保存
    await saveConfig(newConfig);

    // Orchestrator APIに設定変更を通知（非同期、失敗してもローカル保存は成功扱い）
    const orchestratorNotified = await notifyOrchestratorConfigChange(newConfig);

    return NextResponse.json({
      data: {
        ...newConfig,
        orchestratorNotified,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `設定の更新に失敗しました: ${message}` }, { status: 500 });
  }
}
