/**
 * AI Adapter Registry
 * アダプタの登録と取得を一元管理
 *
 * Requirements:
 * - 7.7: 新アダプタを1行追加で対応可能にする
 * - 7.5: フォールバック機能をサポート
 *
 * 新しいアダプタを追加する場合:
 * 1. `tools/adapters/<adapter-name>.ts` にアダプタを実装
 * 2. このファイルの ADAPTER_FACTORIES に1行追加
 */

import {
  BaseAdapter,
  ExtendedAdapter,
  AdapterConfig,
  FallbackConfig,
  AdapterError,
  AdapterFallbackError,
  AdapterConnectionError,
  ChatOptions,
  ChatWithToolsOptions,
  AdapterResponse,
  ToolCallResponse,
} from './base.js';
import { OllamaAdapter, createOllamaAdapter } from './ollama.js';

// ============================================================
// アダプタファクトリ登録
// 新しいアダプタを追加する場合はここに1行追加
// Requirements: 7.7
// ============================================================

/**
 * アダプタファクトリ関数の型
 */
type AdapterFactory = () => BaseAdapter | ExtendedAdapter;

/**
 * 登録済みアダプタファクトリ
 * 新しいアダプタを追加する場合はここに追加
 */
const ADAPTER_FACTORIES: Record<string, AdapterFactory> = {
  // Ollama: ローカルLLM実行環境
  ollama: () => createOllamaAdapter(),

  // 将来の拡張用プレースホルダー（実装時にコメント解除）
  // gemini: () => createGeminiAdapter(),
  // openai: () => createOpenAIAdapter(),
  // anthropic: () => createAnthropicAdapter(),
  // kiro: () => createKiroAdapter(),
};

// ============================================================
// アダプタレジストリ
// ============================================================

/**
 * アダプタレジストリ
 * アダプタの登録、取得、フォールバック処理を管理
 */
export class AdapterRegistry {
  private adapters: Map<string, BaseAdapter | ExtendedAdapter> = new Map();
  private defaultAdapterName: string = 'ollama';

  /**
   * 登録済みアダプタ名の一覧を取得
   */
  getRegisteredAdapterNames(): string[] {
    return Object.keys(ADAPTER_FACTORIES);
  }

  /**
   * アダプタを取得（遅延初期化）
   * @param name アダプタ名
   * @returns アダプタインスタンス
   */
  getAdapter(name: string): BaseAdapter | ExtendedAdapter {
    // キャッシュにあればそれを返す
    if (this.adapters.has(name)) {
      return this.adapters.get(name)!;
    }

    // ファクトリから作成
    const factory = ADAPTER_FACTORIES[name];
    if (!factory) {
      throw new AdapterError(
        `アダプタ '${name}' は登録されていません。利用可能: ${this.getRegisteredAdapterNames().join(', ')}`,
        'ADAPTER_NOT_FOUND'
      );
    }

    const adapter = factory();
    this.adapters.set(name, adapter);
    return adapter;
  }

  /**
   * デフォルトアダプタを取得
   */
  getDefaultAdapter(): BaseAdapter | ExtendedAdapter {
    return this.getAdapter(this.defaultAdapterName);
  }

  /**
   * デフォルトアダプタ名を設定
   * @param name アダプタ名
   */
  setDefaultAdapter(name: string): void {
    if (!ADAPTER_FACTORIES[name]) {
      throw new AdapterError(
        `アダプタ '${name}' は登録されていません`,
        'ADAPTER_NOT_FOUND'
      );
    }
    this.defaultAdapterName = name;
  }

  /**
   * アダプタがExtendedAdapterかチェック
   * @param adapter アダプタ
   */
  isExtendedAdapter(adapter: BaseAdapter | ExtendedAdapter): adapter is ExtendedAdapter {
    return 'chatWithTools' in adapter && typeof adapter.chatWithTools === 'function';
  }

  /**
   * カスタムアダプタを登録
   * テストやカスタム実装用
   * @param name アダプタ名
   * @param adapter アダプタインスタンス
   */
  registerAdapter(name: string, adapter: BaseAdapter | ExtendedAdapter): void {
    this.adapters.set(name, adapter);
  }

  /**
   * アダプタをクリア（テスト用）
   */
  clearAdapters(): void {
    this.adapters.clear();
  }
}

// ============================================================
// フォールバック付きアダプタ
// Requirements: 7.5
// ============================================================

/**
 * フォールバック付きアダプタ
 * プライマリアダプタが失敗した場合にフォールバックアダプタを使用
 */
export class FallbackAdapter implements ExtendedAdapter {
  readonly name: string;
  private readonly primary: BaseAdapter | ExtendedAdapter;
  private readonly fallback: BaseAdapter | ExtendedAdapter;
  private readonly config: FallbackConfig;

  constructor(
    primary: BaseAdapter | ExtendedAdapter,
    fallback: BaseAdapter | ExtendedAdapter,
    config: Partial<FallbackConfig> = {}
  ) {
    this.name = `${primary.name}+${fallback.name}`;
    this.primary = primary;
    this.fallback = fallback;
    this.config = {
      fallbackAdapter: fallback.name,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
    };
  }

  /**
   * 単発テキスト生成（フォールバック付き）
   */
  async generate(options: Parameters<BaseAdapter['generate']>[0]): Promise<AdapterResponse> {
    return this.executeWithFallback(
      () => this.primary.generate(options),
      () => this.fallback.generate(options)
    );
  }

  /**
   * チャット形式での生成（フォールバック付き）
   */
  async chat(options: ChatOptions): Promise<AdapterResponse> {
    return this.executeWithFallback(
      () => this.primary.chat(options),
      () => this.fallback.chat(options)
    );
  }

  /**
   * ツール付きチャット（フォールバック付き）
   * Requirements: 7.5
   */
  async chatWithTools(options: ChatWithToolsOptions): Promise<ToolCallResponse> {
    // プライマリがExtendedAdapterでない場合はフォールバックを試行
    const primarySupports = this.isExtendedAdapter(this.primary);
    const fallbackSupports = this.isExtendedAdapter(this.fallback);

    if (!primarySupports && !fallbackSupports) {
      throw new AdapterError(
        'プライマリとフォールバックの両方がツール呼び出しをサポートしていません',
        'TOOLS_NOT_SUPPORTED'
      );
    }

    if (!primarySupports) {
      // プライマリがサポートしていない場合は直接フォールバックを使用
      return (this.fallback as ExtendedAdapter).chatWithTools(options);
    }

    return this.executeWithFallback(
      () => (this.primary as ExtendedAdapter).chatWithTools(options),
      () => {
        if (!fallbackSupports) {
          throw new AdapterError(
            'フォールバックアダプタはツール呼び出しをサポートしていません',
            'TOOLS_NOT_SUPPORTED'
          );
        }
        return (this.fallback as ExtendedAdapter).chatWithTools(options);
      }
    );
  }

  /**
   * 利用可能かチェック
   */
  async isAvailable(): Promise<boolean> {
    const primaryAvailable = await this.primary.isAvailable();
    if (primaryAvailable) return true;
    return this.fallback.isAvailable();
  }

  /**
   * モデル情報を取得
   */
  async getModelInfo(): Promise<ReturnType<ExtendedAdapter['getModelInfo']>> {
    if (this.isExtendedAdapter(this.primary)) {
      try {
        return await this.primary.getModelInfo();
      } catch {
        // フォールバックを試行
      }
    }
    if (this.isExtendedAdapter(this.fallback)) {
      return this.fallback.getModelInfo();
    }
    return {
      name: this.name,
      supportsTools: false,
    };
  }

  /**
   * ツール呼び出しをサポートするか
   */
  supportsTools(): boolean {
    return (
      (this.isExtendedAdapter(this.primary) && this.primary.supportsTools()) ||
      (this.isExtendedAdapter(this.fallback) && this.fallback.supportsTools())
    );
  }

  /**
   * ExtendedAdapterかチェック
   */
  private isExtendedAdapter(adapter: BaseAdapter | ExtendedAdapter): adapter is ExtendedAdapter {
    return 'chatWithTools' in adapter && typeof adapter.chatWithTools === 'function';
  }

  /**
   * フォールバック付きで実行
   * Requirements: 7.5
   */
  private async executeWithFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    let primaryError: Error | undefined;

    // プライマリを試行（リトライ付き）
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await primaryFn();
      } catch (error) {
        primaryError = error instanceof Error ? error : new Error(String(error));

        // 最後の試行でなければ待機してリトライ
        if (attempt < this.config.maxRetries - 1) {
          // 指数バックオフ: 1s, 2s, 4s
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    // フォールバックを試行
    try {
      return await fallbackFn();
    } catch (fallbackError) {
      throw new AdapterFallbackError(
        `プライマリアダプタ(${this.primary.name})とフォールバックアダプタ(${this.fallback.name})の両方が失敗しました`,
        primaryError!,
        fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError))
      );
    }
  }

  /**
   * 指定時間待機
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// ファクトリ関数
// ============================================================

/**
 * アダプタ設定からアダプタを作成
 * @param config アダプタ設定
 * @param registry アダプタレジストリ（オプション）
 */
export function createAdapterFromConfig(
  config: AdapterConfig,
  registry: AdapterRegistry = new AdapterRegistry()
): BaseAdapter | ExtendedAdapter {
  const primary = registry.getAdapter(config.primary);

  if (!config.fallback) {
    return primary;
  }

  const fallback = registry.getAdapter(config.fallback.fallbackAdapter);
  return new FallbackAdapter(primary, fallback, config.fallback);
}

// ============================================================
// シングルトンレジストリ
// ============================================================

/**
 * グローバルアダプタレジストリ
 */
export const globalRegistry = new AdapterRegistry();

/**
 * デフォルトアダプタを取得（便利関数）
 */
export function getDefaultAdapter(): BaseAdapter | ExtendedAdapter {
  return globalRegistry.getDefaultAdapter();
}

/**
 * 名前でアダプタを取得（便利関数）
 */
export function getAdapter(name: string): BaseAdapter | ExtendedAdapter {
  return globalRegistry.getAdapter(name);
}

// Re-export for convenience
export { OllamaAdapter, createOllamaAdapter } from './ollama.js';
export * from './base.js';
