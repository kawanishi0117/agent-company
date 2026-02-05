/**
 * Ollama Adapter のテスト
 * 接続テスト、エラーハンドリングテスト、ツール呼び出しテスト
 *
 * Requirements:
 * - 7.3: Ollamaアダプタの実装
 * - 7.2: ツール呼び出し対応
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaAdapter, createOllamaAdapter } from '../tools/adapters/ollama';
import { AdapterConnectionError, ToolDefinition } from '../tools/adapters/base';

// グローバルfetchをモック
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;

  beforeEach(() => {
    adapter = new OllamaAdapter('http://localhost:11434', 5000);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('Ollamaが起動している場合trueを返す', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const result = await adapter.isAvailable();
      expect(result).toBe(true);
    });

    it('Ollamaが停止している場合falseを返す', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });

    it('APIがエラーを返す場合falseを返す', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('generate', () => {
    it('正常にテキストを生成できる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          response: 'Hello, World!',
          done: true,
          eval_count: 10,
        }),
      });

      const result = await adapter.generate({
        model: 'llama3',
        prompt: 'Say hello',
      });

      expect(result.content).toBe('Hello, World!');
      expect(result.model).toBe('llama3');
      expect(result.tokensUsed).toBe(10);
      expect(result.finishReason).toBe('stop');
    });

    it('接続エラー時にAdapterConnectionErrorを投げる', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        adapter.generate({
          model: 'llama3',
          prompt: 'Say hello',
        })
      ).rejects.toThrow(AdapterConnectionError);
    });

    it('APIエラー時にAdapterConnectionErrorを投げる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        adapter.generate({
          model: 'llama3',
          prompt: 'Say hello',
        })
      ).rejects.toThrow(AdapterConnectionError);
    });
  });

  describe('chat', () => {
    it('正常にチャットレスポンスを生成できる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          message: {
            role: 'assistant',
            content: 'I am an AI assistant.',
          },
          done: true,
          eval_count: 15,
        }),
      });

      const result = await adapter.chat({
        model: 'llama3',
        messages: [{ role: 'user', content: 'Who are you?' }],
      });

      expect(result.content).toBe('I am an AI assistant.');
      expect(result.model).toBe('llama3');
    });

    it('システムメッセージを含むチャットが動作する', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          message: {
            role: 'assistant',
            content: 'Bonjour!',
          },
          done: true,
        }),
      });

      const result = await adapter.chat({
        model: 'llama3',
        messages: [
          { role: 'system', content: 'You are a French assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(result.content).toBe('Bonjour!');
    });
  });

  describe('listModels', () => {
    it('利用可能なモデル一覧を取得できる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3' }, { name: 'codellama' }, { name: 'mistral' }],
        }),
      });

      const models = await adapter.listModels();
      expect(models).toEqual(['llama3', 'codellama', 'mistral']);
    });

    it('エラー時は空配列を返す', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const models = await adapter.listModels();
      expect(models).toEqual([]);
    });
  });

  describe('createOllamaAdapter', () => {
    it('デフォルト設定でアダプタを作成できる', () => {
      const adapter = createOllamaAdapter();
      expect(adapter.name).toBe('ollama');
    });

    it('カスタム設定でアダプタを作成できる', () => {
      const adapter = createOllamaAdapter('http://custom:8080', 10000);
      expect(adapter.name).toBe('ollama');
    });
  });

  // ============================================================
  // ツール呼び出し機能のテスト
  // Requirements: 7.2
  // ============================================================

  describe('chatWithTools', () => {
    it('ツール付きチャットが正常に動作する', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3.1',
          message: {
            role: 'assistant',
            content: 'I will use the tool to help you.',
            tool_calls: [
              {
                function: {
                  name: 'read_file',
                  arguments: { path: '/test/file.txt' },
                },
              },
            ],
          },
          done: true,
          eval_count: 25,
        }),
      });

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

      const result = await adapter.chatWithTools({
        model: 'llama3.1',
        messages: [{ role: 'user', content: 'Read the file /test/file.txt' }],
        tools,
      });

      expect(result.content).toBe('I will use the tool to help you.');
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls!.length).toBe(1);
      expect(result.toolCalls![0].name).toBe('read_file');
      expect(result.toolCalls![0].arguments).toEqual({ path: '/test/file.txt' });
      expect(result.isComplete).toBe(false); // ツール呼び出しがあるので未完了
    });

    it('ツール呼び出しなしの場合isCompleteがtrueになる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3.1',
          message: {
            role: 'assistant',
            content: 'Here is the answer without using tools.',
          },
          done: true,
          eval_count: 15,
        }),
      });

      const tools: ToolDefinition[] = [
        {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
          },
        },
      ];

      const result = await adapter.chatWithTools({
        model: 'llama3.1',
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        tools,
      });

      expect(result.content).toBe('Here is the answer without using tools.');
      expect(result.toolCalls).toEqual([]);
      expect(result.isComplete).toBe(true);
    });

    it('複数のツール呼び出しを処理できる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3.1',
          message: {
            role: 'assistant',
            content: 'I will read both files.',
            tool_calls: [
              {
                function: {
                  name: 'read_file',
                  arguments: { path: '/file1.txt' },
                },
              },
              {
                function: {
                  name: 'read_file',
                  arguments: { path: '/file2.txt' },
                },
              },
            ],
          },
          done: true,
        }),
      });

      const tools: ToolDefinition[] = [
        {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
          },
        },
      ];

      const result = await adapter.chatWithTools({
        model: 'llama3.1',
        messages: [{ role: 'user', content: 'Read file1.txt and file2.txt' }],
        tools,
      });

      expect(result.toolCalls!.length).toBe(2);
      expect(result.toolCalls![0].arguments).toEqual({ path: '/file1.txt' });
      expect(result.toolCalls![1].arguments).toEqual({ path: '/file2.txt' });
    });

    it('接続エラー時にAdapterConnectionErrorを投げる', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const tools: ToolDefinition[] = [
        {
          name: 'test_tool',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      ];

      await expect(
        adapter.chatWithTools({
          model: 'llama3.1',
          messages: [{ role: 'user', content: 'Test' }],
          tools,
        })
      ).rejects.toThrow(AdapterConnectionError);
    });
  });

  describe('getModelInfo', () => {
    it('モデル情報を取得できる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1' }],
        }),
      });

      const info = await adapter.getModelInfo();
      expect(info.name).toBe('llama3.1');
      expect(info.supportsTools).toBe(true);
    });

    it('ツールサポートモデルを正しく判定する', async () => {
      // llama3.1はツールサポート
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1:latest' }],
        }),
      });

      const info1 = await adapter.getModelInfo();
      expect(info1.supportsTools).toBe(true);
    });
  });

  describe('supportsTools', () => {
    it('Ollamaはツール呼び出しをサポートする', () => {
      expect(adapter.supportsTools()).toBe(true);
    });
  });
});
