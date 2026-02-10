# AI Adapters 仕様書

## 概要

AI Adaptersは、AgentCompanyが複数のAIプロバイダー（Ollama、Gemini、OpenAI等）と通信するための抽象化レイヤーです。
統一されたインターフェースを提供し、アダプタの追加・切り替えを容易にします。

## 機能

### 1. 基本機能

- **テキスト生成** (`generate`): 単発のプロンプトからテキストを生成
- **チャット** (`chat`): 会話履歴を含むチャット形式での生成
- **ツール呼び出し** (`chatWithTools`): AIにツールを提供し、ツール呼び出しを含むレスポンスを取得
- **可用性チェック** (`isAvailable`): アダプタが利用可能かチェック

### 2. フォールバック機能

プライマリアダプタが失敗した場合、自動的にフォールバックアダプタを使用します。

- 指数バックオフによるリトライ（1s, 2s, 4s）
- 設定可能なリトライ回数
- プライマリとフォールバック両方が失敗した場合のエラー報告

### 3. アダプタ登録機構

新しいアダプタを1行追加で対応可能にする設計です。

```typescript
// tools/adapters/index.ts
const ADAPTER_FACTORIES: Record<string, AdapterFactory> = {
  ollama: () => createOllamaAdapter(),
  // 新しいアダプタを追加する場合はここに1行追加
  // gemini: () => createGeminiAdapter(),
};
```

## 使用方法

### 基本的な使用

```typescript
import { getAdapter, getDefaultAdapter } from './tools/adapters/index';

// デフォルトアダプタを取得
const adapter = getDefaultAdapter();

// 名前でアダプタを取得
const ollamaAdapter = getAdapter('ollama');

// テキスト生成
const result = await adapter.generate({
  model: 'llama3',
  prompt: 'Hello, world!',
});

// チャット
const chatResult = await adapter.chat({
  model: 'llama3',
  messages: [{ role: 'user', content: 'What is 2+2?' }],
});
```

### ツール呼び出し

```typescript
import { getAdapter, ToolDefinition } from './tools/adapters/index';

const adapter = getAdapter('ollama');

// ツール定義
const tools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file from the filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
  },
];

// ツール付きチャット
const result = await adapter.chatWithTools({
  model: 'llama3.1',
  messages: [{ role: 'user', content: 'Read the file /test/file.txt' }],
  tools,
});

// ツール呼び出しがある場合
if (result.toolCalls && result.toolCalls.length > 0) {
  for (const toolCall of result.toolCalls) {
    console.log(`Tool: ${toolCall.name}`);
    console.log(`Arguments: ${JSON.stringify(toolCall.arguments)}`);
  }
}
```

### フォールバック設定

```typescript
import { createAdapterFromConfig, AdapterRegistry } from './tools/adapters/index';

const registry = new AdapterRegistry();

// フォールバック付きアダプタを作成
const adapter = createAdapterFromConfig(
  {
    primary: 'ollama',
    fallback: {
      fallbackAdapter: 'gemini',
      maxRetries: 3,
      retryDelayMs: 1000,
    },
  },
  registry
);
```

## 対応アダプタ

| アダプタ名 | 説明                | ツール呼び出し |
| ---------- | ------------------- | -------------- |
| `ollama`   | ローカルLLM実行環境 | ✅ (0.3.0以降) |

### 将来対応予定

- `gemini`: Google Gemini API
- `openai`: OpenAI API
- `anthropic`: Anthropic Claude API
- `kiro`: Kiro CLI

## インターフェース

### BaseAdapter

```typescript
interface BaseAdapter {
  readonly name: string;
  generate(options: GenerateOptions): Promise<AdapterResponse>;
  chat(options: ChatOptions): Promise<AdapterResponse>;
  isAvailable(): Promise<boolean>;
}
```

### ExtendedAdapter

```typescript
interface ExtendedAdapter extends BaseAdapter {
  chatWithTools(options: ChatWithToolsOptions): Promise<ToolCallResponse>;
  getModelInfo(): Promise<ModelInfo>;
  supportsTools(): boolean;
}
```

### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

## エラーハンドリング

| エラークラス             | 説明                     |
| ------------------------ | ------------------------ |
| `AdapterError`           | 基本エラークラス         |
| `AdapterConnectionError` | 接続エラー               |
| `AdapterTimeoutError`    | タイムアウトエラー       |
| `AdapterFallbackError`   | フォールバック失敗エラー |

## ファイル構成

```
tools/adapters/
├── base.ts      # 基本インターフェースと型定義
├── ollama.ts    # Ollamaアダプタ実装
└── index.ts     # アダプタ登録機構とエクスポート
```

## テスト

```bash
# ユニットテスト
npx vitest run tests/ollama-adapter.test.ts

# プロパティテスト
npx vitest run tests/adapters/adapter-fallback.property.test.ts
```

## 関連要件

- Requirements 7.1: 複数のAI_Adaptersをサポート
- Requirements 7.2: AI_Adapterインターフェースを定義
- Requirements 7.3: Ollamaアダプタの実装
- Requirements 7.5: フォールバック機能
- Requirements 7.7: 新アダプタを1行追加で対応可能
