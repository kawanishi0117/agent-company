/**
 * AI Adapter Base Interface
 * AI CLIとの通信を抽象化するインターフェース
 *
 * Requirements:
 * - 7.1: 複数のAI_Adaptersをサポート
 * - 7.2: AI_Adapterインターフェースを定義
 * - 7.5: フォールバック機能をサポート
 */

/**
 * 生成オプション
 */
export interface GenerateOptions {
  /** 使用するモデル名 */
  model: string;
  /** プロンプト */
  prompt: string;
  /** システムプロンプト（オプション） */
  system?: string;
  /** 温度パラメータ（0-1） */
  temperature?: number;
  /** 最大トークン数 */
  maxTokens?: number;
}

/**
 * チャットメッセージ
 */
export interface ChatMessage {
  /** メッセージの役割 */
  role: 'system' | 'user' | 'assistant';
  /** メッセージ内容 */
  content: string;
}

/**
 * チャットオプション
 */
export interface ChatOptions {
  /** 使用するモデル名 */
  model: string;
  /** メッセージ履歴 */
  messages: ChatMessage[];
  /** 温度パラメータ（0-1） */
  temperature?: number;
  /** 最大トークン数 */
  maxTokens?: number;
}

/**
 * アダプタレスポンス
 */
export interface AdapterResponse {
  /** 生成されたコンテンツ */
  content: string;
  /** 使用したモデル名 */
  model: string;
  /** 使用トークン数（オプション） */
  tokensUsed?: number;
  /** 終了理由（オプション） */
  finishReason?: string;
}

/**
 * アダプタエラー
 */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

/**
 * 接続エラー
 */
export class AdapterConnectionError extends AdapterError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'AdapterConnectionError';
  }
}

/**
 * タイムアウトエラー
 */
export class AdapterTimeoutError extends AdapterError {
  constructor(message: string, cause?: Error) {
    super(message, 'TIMEOUT_ERROR', cause);
    this.name = 'AdapterTimeoutError';
  }
}

/**
 * Base Adapter Interface
 * 全てのAIアダプタが実装すべきインターフェース
 */
export interface BaseAdapter {
  /** アダプタ名 */
  readonly name: string;

  /**
   * 単発テキスト生成
   * @param options 生成オプション
   * @returns 生成結果
   */
  generate(options: GenerateOptions): Promise<AdapterResponse>;

  /**
   * チャット形式での生成
   * @param options チャットオプション
   * @returns 生成結果
   */
  chat(options: ChatOptions): Promise<AdapterResponse>;

  /**
   * アダプタが利用可能かチェック
   * @returns 利用可能な場合true
   */
  isAvailable(): Promise<boolean>;
}

/**
 * デフォルト設定
 */
export const DEFAULT_CONFIG = {
  temperature: 0.7,
  maxTokens: 2048,
  timeoutMs: 30000,
} as const;

// ============================================================
// ツール呼び出し関連の型定義
// Requirements: 7.1, 7.2
// ============================================================

/**
 * ツール定義
 * AIに提供するツールの仕様を定義
 */
export interface ToolDefinition {
  /** ツール名 */
  name: string;
  /** ツールの説明 */
  description: string;
  /** パラメータスキーマ（JSON Schema形式） */
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

/**
 * ツールパラメータのプロパティ定義
 */
export interface ToolParameterProperty {
  /** パラメータの型 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** パラメータの説明 */
  description?: string;
  /** 列挙値（オプション） */
  enum?: string[];
  /** 配列の場合のアイテム定義 */
  items?: ToolParameterProperty;
}

/**
 * ツール呼び出し
 * AIからのツール呼び出しリクエスト
 */
export interface ToolCall {
  /** ツール呼び出しID */
  id: string;
  /** ツール名 */
  name: string;
  /** 引数 */
  arguments: Record<string, unknown>;
}

/**
 * ツール呼び出し結果
 */
export interface ToolCallResult {
  /** ツール呼び出しID */
  toolCallId: string;
  /** 実行結果 */
  result: unknown;
  /** エラーが発生した場合 */
  error?: string;
}

/**
 * ツール付きチャットオプション
 * Requirements: 7.2
 */
export interface ChatWithToolsOptions extends ChatOptions {
  /** 利用可能なツール定義 */
  tools: ToolDefinition[];
  /** ツール呼び出し結果（継続会話用） */
  toolResults?: ToolCallResult[];
}

/**
 * ツール呼び出しレスポンス
 * Requirements: 7.2
 */
export interface ToolCallResponse extends AdapterResponse {
  /** AIからのツール呼び出しリクエスト（存在する場合） */
  toolCalls?: ToolCall[];
  /** ツール呼び出しが完了したかどうか */
  isComplete: boolean;
}

/**
 * モデル情報
 */
export interface ModelInfo {
  /** モデル名 */
  name: string;
  /** モデルの説明 */
  description?: string;
  /** ツール呼び出しをサポートするか */
  supportsTools: boolean;
  /** コンテキストウィンドウサイズ */
  contextWindow?: number;
}

// ============================================================
// 拡張アダプタインターフェース
// Requirements: 7.1, 7.2
// ============================================================

/**
 * Extended Adapter Interface
 * ツール呼び出し機能を含む拡張インターフェース
 */
export interface ExtendedAdapter extends BaseAdapter {
  /**
   * ツール付きチャット
   * AIにツールを提供し、ツール呼び出しを含むレスポンスを取得
   * @param options ツール付きチャットオプション
   * @returns ツール呼び出しレスポンス
   */
  chatWithTools(options: ChatWithToolsOptions): Promise<ToolCallResponse>;

  /**
   * モデル情報を取得
   * @returns モデル情報
   */
  getModelInfo(): Promise<ModelInfo>;

  /**
   * ツール呼び出しをサポートするかチェック
   * @returns サポートする場合true
   */
  supportsTools(): boolean;
}

// ============================================================
// フォールバック関連
// Requirements: 7.5
// ============================================================

/**
 * フォールバック設定
 */
export interface FallbackConfig {
  /** フォールバックアダプタ名 */
  fallbackAdapter: string;
  /** リトライ回数 */
  maxRetries: number;
  /** リトライ間隔（ミリ秒） */
  retryDelayMs: number;
}

/**
 * アダプタ設定
 */
export interface AdapterConfig {
  /** プライマリアダプタ名 */
  primary: string;
  /** フォールバック設定（オプション） */
  fallback?: FallbackConfig;
}

/**
 * フォールバックエラー
 * プライマリとフォールバック両方が失敗した場合
 */
export class AdapterFallbackError extends AdapterError {
  constructor(
    message: string,
    public readonly primaryError: Error,
    public readonly fallbackError?: Error
  ) {
    super(message, 'FALLBACK_ERROR', primaryError);
    this.name = 'AdapterFallbackError';
  }
}
