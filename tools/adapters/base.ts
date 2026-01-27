/**
 * AI Adapter Base Interface
 * AI CLIとの通信を抽象化するインターフェース
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
