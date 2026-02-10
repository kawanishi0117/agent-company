/**
 * AI Health Checker - AI実行基盤の可用性確認
 *
 * Ollamaの起動状態、インストール済みモデルの確認、
 * セットアップ手順の提供を担当するモジュール。
 *
 * @module execution/ai-health-checker
 * @see Requirements: 1.1, 1.2, 1.4, 1.5
 */

// =============================================================================
// 型定義
// =============================================================================

/**
 * AI可用性ステータス
 * @description AI実行基盤の可用性を表す構造体
 * @see Requirements: 1.1, 1.2, 1.4
 */
export interface AIHealthStatus {
  /** AI実行基盤が利用可能か */
  available: boolean;
  /** Ollamaが起動しているか */
  ollamaRunning: boolean;
  /** インストール済みモデル一覧 */
  modelsInstalled: string[];
  /** 推奨モデル一覧 */
  recommendedModels: string[];
  /** セットアップ手順（利用不可時に提供） */
  setupInstructions?: string;
  /** 最終チェック日時（ISO8601形式） */
  lastChecked: string;
}

/**
 * AIHealthCheckerオプション
 * @description AIHealthCheckerの初期化オプション
 */
export interface AIHealthCheckerOptions {
  /** OllamaのベースURL（デフォルト: 環境変数 OLLAMA_HOST または http://localhost:11434） */
  ollamaBaseUrl?: string;
  /** ヘルスチェックのタイムアウト時間（ミリ秒、デフォルト: 5000） */
  timeoutMs?: number;
}

// =============================================================================
// 定数定義
// =============================================================================

/** デフォルトのOllamaベースURL */
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/** ヘルスチェックのデフォルトタイムアウト（ミリ秒） */
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * 推奨モデル一覧
 * @description Ollamaで利用可能な推奨モデル
 * @see Requirement 1.4
 */
const RECOMMENDED_MODELS: string[] = [
  'llama3.2:1b',
  'codellama',
  'qwen2.5-coder',
];

/**
 * エラーメッセージテンプレート
 * @description Ollama未起動時・モデル未インストール時のメッセージ
 * @see Requirements: 1.2, 1.4
 */
export const ERROR_MESSAGES = {
  /**
   * Ollama未起動時のエラーメッセージとセットアップ手順
   * @see Requirement 1.2
   */
  ollamaNotRunning: `Ollamaが起動していません。

セットアップ手順:
1. Ollamaをインストール: https://ollama.ai/download
2. Ollamaを起動: ollama serve
3. モデルをインストール: ollama pull llama3.2:1b`,

  /**
   * モデル未インストール時のエラーメッセージと推奨コマンド
   * @see Requirement 1.4
   */
  noModelsInstalled: `Ollamaにモデルがインストールされていません。

推奨モデル:
- ollama pull llama3.2:1b (軽量、高速)
- ollama pull codellama (コード生成向け)
- ollama pull qwen2.5-coder (コード生成向け)`,
} as const;

// =============================================================================
// AIHealthChecker クラス
// =============================================================================

/**
 * AIHealthChecker - AI実行基盤の可用性チェッカー
 *
 * Ollamaの起動状態確認、インストール済みモデルの取得、
 * セットアップ手順の提供を行う。
 *
 * @see Requirement 1.1: WHEN the system starts, THE Orchestrator SHALL check AI adapter availability
 * @see Requirement 1.2: IF Ollama is not available, THEN THE System SHALL display a clear error message with setup instructions
 * @see Requirement 1.4: WHEN Ollama is available but no model is installed, THE System SHALL suggest model installation commands
 * @see Requirement 1.5: THE System SHALL support graceful degradation when AI is temporarily unavailable
 *
 * @example
 * ```typescript
 * const checker = new AIHealthChecker({ ollamaBaseUrl: 'http://localhost:11434' });
 *
 * const status = await checker.getHealthStatus();
 * if (!status.available) {
 *   console.error(status.setupInstructions);
 * }
 * ```
 */
export class AIHealthChecker {
  /** OllamaのベースURL */
  private readonly ollamaBaseUrl: string;

  /** ヘルスチェックのタイムアウト時間（ミリ秒） */
  private readonly timeoutMs: number;

  /**
   * コンストラクタ
   * @param options - AIHealthCheckerオプション
   */
  constructor(options?: AIHealthCheckerOptions) {
    this.ollamaBaseUrl = options?.ollamaBaseUrl ?? getDefaultOllamaHost();
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
  }

  // ===========================================================================
  // 公開メソッド
  // ===========================================================================

  /**
   * Ollamaの可用性をチェック
   *
   * Ollamaサーバーに接続を試み、起動状態とインストール済みモデルを確認する。
   * 利用不可の場合はセットアップ手順を含むステータスを返す。
   *
   * @returns AI可用性ステータス
   *
   * @see Requirement 1.1: THE Orchestrator SHALL check AI adapter availability
   * @see Requirement 1.2: IF Ollama is not available, display error message with setup instructions
   */
  async checkOllamaAvailability(): Promise<AIHealthStatus> {
    const lastChecked = new Date().toISOString();

    // Ollamaサーバーへの接続を試行
    const ollamaRunning = await this.pingOllama();

    // Ollamaが起動していない場合
    if (!ollamaRunning) {
      return {
        available: false,
        ollamaRunning: false,
        modelsInstalled: [],
        recommendedModels: RECOMMENDED_MODELS,
        setupInstructions: ERROR_MESSAGES.ollamaNotRunning,
        lastChecked,
      };
    }

    // インストール済みモデルを取得
    const modelsInstalled = await this.getInstalledModels();

    // モデルが未インストールの場合
    if (modelsInstalled.length === 0) {
      return {
        available: false,
        ollamaRunning: true,
        modelsInstalled: [],
        recommendedModels: RECOMMENDED_MODELS,
        setupInstructions: ERROR_MESSAGES.noModelsInstalled,
        lastChecked,
      };
    }

    // 全て正常
    return {
      available: true,
      ollamaRunning: true,
      modelsInstalled,
      recommendedModels: RECOMMENDED_MODELS,
      lastChecked,
    };
  }

  /**
   * インストール済みモデル一覧を取得
   *
   * Ollama APIの `/api/tags` エンドポイントからモデル一覧を取得する。
   * 接続エラーの場合は空配列を返す。
   *
   * @returns インストール済みモデル名の配列
   *
   * @see Requirement 1.4: suggest model installation commands
   */
  async getInstalledModels(): Promise<string[]> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.ollamaBaseUrl}/api/tags`,
        { method: 'GET' }
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as OllamaTagsResponse;
      return data.models?.map((m) => m.name) ?? [];
    } catch {
      // 接続エラー時は空配列を返す（graceful degradation）
      return [];
    }
  }

  /**
   * 推奨モデルのインストールコマンドを取得
   *
   * @returns インストールコマンドの配列
   *
   * @see Requirement 1.4: THE System SHALL suggest model installation commands
   */
  getModelInstallCommands(): string[] {
    return RECOMMENDED_MODELS.map((model) => `ollama pull ${model}`);
  }

  /**
   * ヘルスステータスを取得
   *
   * checkOllamaAvailability のエイリアス。
   * 統一的なインターフェースとして提供する。
   *
   * @returns AI可用性ステータス
   *
   * @see Requirements: 1.1, 1.2, 1.4
   */
  async getHealthStatus(): Promise<AIHealthStatus> {
    return this.checkOllamaAvailability();
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * Ollamaサーバーへの疎通確認
   *
   * `/api/tags` エンドポイントにGETリクエストを送信し、
   * レスポンスが正常かどうかで起動状態を判定する。
   *
   * @returns Ollamaが起動している場合true
   */
  private async pingOllama(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.ollamaBaseUrl}/api/tags`,
        { method: 'GET' }
      );
      return response.ok;
    } catch {
      // 接続エラー = Ollamaが起動していない
      return false;
    }
  }

  /**
   * タイムアウト付きfetch
   *
   * @param url - リクエストURL
   * @param options - fetchオプション
   * @returns レスポンス
   * @throws タイムアウト時にAbortError
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// =============================================================================
// 内部型定義（Ollama APIレスポンス）
// =============================================================================

/**
 * Ollama /api/tags レスポンス
 * @description Ollamaのモデル一覧APIのレスポンス形式
 */
interface OllamaTagsResponse {
  models: Array<{
    name: string;
    modified_at?: string;
    size?: number;
  }>;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 環境変数からOllamaホストを取得
 *
 * Docker環境では OLLAMA_HOST が設定される。
 * 未設定の場合はデフォルト値を返す。
 *
 * @returns OllamaのベースURL
 */
function getDefaultOllamaHost(): string {
  return process.env.OLLAMA_HOST || DEFAULT_OLLAMA_BASE_URL;
}

/**
 * デフォルトのAIHealthCheckerインスタンスを作成
 *
 * 環境変数 OLLAMA_HOST が設定されていればそれを使用する。
 *
 * @param options - AIHealthCheckerオプション（オプション）
 * @returns AIHealthCheckerインスタンス
 */
export function createAIHealthChecker(options?: AIHealthCheckerOptions): AIHealthChecker {
  return new AIHealthChecker(options);
}
