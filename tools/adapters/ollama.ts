/**
 * Ollama Adapter
 * Ollama REST APIとの通信を実装
 */

import {
  BaseAdapter,
  GenerateOptions,
  ChatOptions,
  AdapterResponse,
  AdapterConnectionError,
  AdapterTimeoutError,
  DEFAULT_CONFIG,
} from './base.js';

/**
 * Ollama API レスポンス（generate）
 */
interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/**
 * Ollama API レスポンス（chat）
 */
interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/**
 * Ollama Adapter
 * ローカルで動作するOllamaとの通信を担当
 */
export class OllamaAdapter implements BaseAdapter {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  /**
   * コンストラクタ
   * @param baseUrl OllamaのベースURL（デフォルト: http://localhost:11434）
   * @param timeoutMs タイムアウト時間（ミリ秒）
   */
  constructor(baseUrl = 'http://localhost:11434', timeoutMs = DEFAULT_CONFIG.timeoutMs) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * 単発テキスト生成
   */
  async generate(options: GenerateOptions): Promise<AdapterResponse> {
    const url = `${this.baseUrl}/api/generate`;

    const body = {
      model: options.model,
      prompt: options.prompt,
      system: options.system,
      stream: false,
      options: {
        temperature: options.temperature ?? DEFAULT_CONFIG.temperature,
        num_predict: options.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      },
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new AdapterConnectionError(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as OllamaGenerateResponse;

      return {
        content: data.response,
        model: data.model,
        tokensUsed: data.eval_count,
        finishReason: data.done ? 'stop' : 'unknown',
      };
    } catch (error) {
      if (error instanceof AdapterConnectionError || error instanceof AdapterTimeoutError) {
        throw error;
      }
      throw new AdapterConnectionError(
        `Ollamaに接続できません。Ollamaが起動しているか確認してください。`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * チャット形式での生成
   */
  async chat(options: ChatOptions): Promise<AdapterResponse> {
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model: options.model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: options.temperature ?? DEFAULT_CONFIG.temperature,
        num_predict: options.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      },
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new AdapterConnectionError(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as OllamaChatResponse;

      return {
        content: data.message.content,
        model: data.model,
        tokensUsed: data.eval_count,
        finishReason: data.done ? 'stop' : 'unknown',
      };
    } catch (error) {
      if (error instanceof AdapterConnectionError || error instanceof AdapterTimeoutError) {
        throw error;
      }
      throw new AdapterConnectionError(
        `Ollamaに接続できません。Ollamaが起動しているか確認してください。`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Ollamaが利用可能かチェック
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 利用可能なモデル一覧を取得
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * タイムアウト付きfetch
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
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AdapterTimeoutError(
          `Ollamaへのリクエストがタイムアウトしました（${this.timeoutMs}ms）`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 環境変数からOllamaホストを取得
 * Docker環境では OLLAMA_HOST が設定される
 */
function getDefaultOllamaHost(): string {
  return process.env.OLLAMA_HOST || 'http://localhost:11434';
}

/**
 * デフォルトのOllamaアダプタインスタンスを作成
 * 環境変数 OLLAMA_HOST が設定されていればそれを使用
 */
export function createOllamaAdapter(baseUrl?: string, timeoutMs?: number): OllamaAdapter {
  return new OllamaAdapter(baseUrl || getDefaultOllamaHost(), timeoutMs);
}
