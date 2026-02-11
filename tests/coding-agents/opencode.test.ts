/**
 * OpenCodeAdapter ユニットテスト
 *
 * OpenCodeAdapterのコマンド構築、実行結果パース、エラーハンドリングをテスト。
 *
 * @module tests/coding-agents/opencode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodeAdapter, createOpenCodeAdapter } from '../../tools/coding-agents/opencode.js';
import * as base from '../../tools/coding-agents/base.js';
import type { CodingTaskOptions } from '../../tools/cli/lib/execution/types.js';

// サブプロセス実行をモック化
vi.mock('../../tools/coding-agents/base.js', async () => {
  const actual = await vi.importActual<typeof base>('../../tools/coding-agents/base.js');
  return {
    ...actual,
    executeSubprocess: vi.fn(),
    checkCommandExists: vi.fn(),
    getCommandVersion: vi.fn(),
    detectChangedFiles: vi.fn(),
  };
});

// =============================================================================
// テスト
// =============================================================================

describe('OpenCodeAdapter', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 基本プロパティ
  // ---------------------------------------------------------------------------

  describe('基本プロパティ', () => {
    it('name が "opencode" であること', () => {
      expect(adapter.name).toBe('opencode');
    });

    it('displayName が "OpenCode" であること', () => {
      expect(adapter.displayName).toBe('OpenCode');
    });
  });

  // ---------------------------------------------------------------------------
  // isAvailable
  // ---------------------------------------------------------------------------

  describe('isAvailable', () => {
    it('opencode コマンドが存在する場合 true を返すこと', async () => {
      vi.mocked(base.checkCommandExists).mockResolvedValue(true);

      const result = await adapter.isAvailable();

      expect(result).toBe(true);
      expect(base.checkCommandExists).toHaveBeenCalledWith('opencode');
    });

    it('opencode コマンドが存在しない場合 false を返すこと', async () => {
      vi.mocked(base.checkCommandExists).mockResolvedValue(false);

      const result = await adapter.isAvailable();

      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getVersion
  // ---------------------------------------------------------------------------

  describe('getVersion', () => {
    it('バージョン文字列を返すこと', async () => {
      vi.mocked(base.getCommandVersion).mockResolvedValue('opencode v1.2.3');

      const result = await adapter.getVersion();

      expect(result).toBe('opencode v1.2.3');
      expect(base.getCommandVersion).toHaveBeenCalledWith('opencode');
    });

    it('取得不可の場合 null を返すこと', async () => {
      vi.mocked(base.getCommandVersion).mockResolvedValue(null);

      const result = await adapter.getVersion();

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // execute
  // ---------------------------------------------------------------------------

  describe('execute', () => {
    const baseOptions: CodingTaskOptions = {
      workingDirectory: '/workspace/project',
      prompt: 'ログイン機能を実装してください',
    };

    it('正常実行時に成功結果を返すこと', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '{"result": "success"}',
        stderr: '',
        exitCode: 0,
        durationMs: 5000,
        timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue(['src/login.ts']);

      const result = await adapter.execute(baseOptions);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.filesChanged).toEqual(['src/login.ts']);
      expect(result.output).toBe('{"result": "success"}');
    });

    it('--format json フラグが含まれること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('--format');
      expect(callArgs.args).toContain('json');
    });

    it('model 指定時に --model フラグが含まれること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute({ ...baseOptions, model: 'claude-sonnet-4-20250514' });

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('--model');
      expect(callArgs.args).toContain('claude-sonnet-4-20250514');
    });

    it('タイムアウト時に CodingAgentTimeoutError をスローすること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 1, durationMs: 600000, timedOut: true,
      });

      await expect(adapter.execute(baseOptions)).rejects.toThrow(
        base.CodingAgentTimeoutError
      );
    });

    it('exitCode が 0 以外の場合 success が false であること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: 'error occurred', exitCode: 1, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      const result = await adapter.execute(baseOptions);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('CodingAgentError 以外のエラーはラップされること', async () => {
      vi.mocked(base.executeSubprocess).mockRejectedValue(new Error('unexpected'));

      await expect(adapter.execute(baseOptions)).rejects.toThrow(
        base.CodingAgentError
      );
    });
  });

  // ---------------------------------------------------------------------------
  // ファクトリ関数
  // ---------------------------------------------------------------------------

  describe('createOpenCodeAdapter', () => {
    it('OpenCodeAdapter インスタンスを返すこと', () => {
      const instance = createOpenCodeAdapter();
      expect(instance).toBeInstanceOf(OpenCodeAdapter);
    });
  });
});
