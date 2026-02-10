/**
 * Ollama Adapter
 * Ollama REST APIとの通信を実装
 *
 * Requirements:
 * - 7.3: Ollamaアダプタの実装
 * - 7.2: ツール呼び出し対応
 */

import {
  ExtendedAdapter,
  GenerateOptions,
  ChatOptions,
  ChatWithToolsOptions,
  AdapterResponse,
  ToolCallResponse,
  ToolCall,
  ToolDefinition,
  ModelInfo,
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
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/**
 * Ollama ツール呼び出し形式
 */
interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Ollama ツール定義形式
 */
interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Ollama Adapter
 * ローカルで動作するOllamaとの通信を担当
 * Requirements: 7.3
 */
export class OllamaAdapter implements ExtendedAdapter {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private cachedModelInfo: ModelInfo | null = null;

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
   * ツール付きチャット
   * AIにツールを提供し、ツール呼び出しを含むレスポンスを取得
   * Requirements: 7.2
   */
  async chatWithTools(options: ChatWithToolsOptions): Promise<ToolCallResponse> {
    const url = `${this.baseUrl}/api/chat`;

    // メッセージを構築（ツール結果がある場合は追加）
    const messages = this.buildMessagesWithToolResults(options);

    // Ollama形式のツール定義に変換
    const tools = this.convertToOllamaTools(options.tools);

    const body = {
      model: options.model,
      messages,
      tools,
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

      // ツール呼び出しを変換
      const toolCalls = this.extractToolCalls(data);

      return {
        content: data.message.content || '',
        model: data.model,
        tokensUsed: data.eval_count,
        finishReason: data.done ? 'stop' : 'unknown',
        toolCalls,
        isComplete: toolCalls.length === 0,
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
   * モデル情報を取得
   */
  async getModelInfo(): Promise<ModelInfo> {
    if (this.cachedModelInfo) {
      return this.cachedModelInfo;
    }

    const models = await this.listModels();
    const defaultModel = models[0] || 'unknown';

    // Ollamaの多くのモデルはツール呼び出しをサポート
    // llama3.1以降、mistral、qwen2などがサポート
    const toolSupportedModels = [
      'llama3.1',
      'llama3.2',
      'mistral',
      'qwen2',
      'qwen2.5',
      'command-r',
      'firefunction',
    ];

    const supportsTools = toolSupportedModels.some((m) =>
      defaultModel.toLowerCase().includes(m.toLowerCase())
    );

    this.cachedModelInfo = {
      name: defaultModel,
      description: `Ollama model: ${defaultModel}`,
      supportsTools,
      contextWindow: 4096, // デフォルト値
    };

    return this.cachedModelInfo;
  }

  /**
   * ツール呼び出しをサポートするかチェック
   */
  supportsTools(): boolean {
    // Ollamaは0.3.0以降でツール呼び出しをサポート
    return true;
  }

  /**
   * ツール定義をOllama形式に変換
   */
  private convertToOllamaTools(tools: ToolDefinition[]): OllamaToolDefinition[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * ツール結果を含むメッセージを構築
   */
  private buildMessagesWithToolResults(
    options: ChatWithToolsOptions
  ): Array<{ role: string; content: string; tool_call_id?: string }> {
    const messages: Array<{ role: string; content: string; tool_call_id?: string }> =
      options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // ツール結果がある場合は追加
    if (options.toolResults && options.toolResults.length > 0) {
      for (const result of options.toolResults) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(result.result),
          tool_call_id: result.toolCallId,
        });
      }
    }

    return messages;
  }

  /**
   * レスポンスからツール呼び出しを抽出
   */
  private extractToolCalls(data: OllamaChatResponse): ToolCall[] {
    if (!data.message.tool_calls || data.message.tool_calls.length === 0) {
      return [];
    }

    return data.message.tool_calls.map((tc, index) => ({
      id: `call_${Date.now()}_${index}`,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
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
