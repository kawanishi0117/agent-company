/**
 * Ollama Adapter のテスト
 * 接続テスト、エラーハンドリングテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaAdapter, createOllamaAdapter } from '../tools/adapters/ollama';
import { AdapterConnectionError } from '../tools/adapters/base';

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
});
