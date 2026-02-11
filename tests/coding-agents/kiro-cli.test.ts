/**
 * KiroCliAdapter ユニットテスト
 *
 * KiroCliAdapterのコマンド構築、実行結果、エラーハンドリングをテスト。
 *
 * @module tests/coding-agents/kiro-cli
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KiroCliAdapter, createKiroCliAdapter } from '../../tools/coding-agents/kiro-cli.js';
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

describe('KiroCliAdapter', () => {
  let adapter: KiroCliAdapter;

  beforeEach(() => {
    adapter = new KiroCliAdapter();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 基本プロパティ
  // ---------------------------------------------------------------------------

  describe('基本プロパティ', () => {
    it('name が "kiro-cli" であること', () => {
      expect(adapter.name).toBe('kiro-cli');
    });

    it('displayName が "Kiro CLI" であること', () => {
      expect(adapter.displayName).toBe('Kiro CLI');
    });
  });

  // ---------------------------------------------------------------------------
  // isAvailable
  // ---------------------------------------------------------------------------

  describe('isAvailable', () => {
    it('kiro コマンドが存在する場合 true を返すこと', async () => {
      vi.mocked(base.checkCommandExists).mockResolvedValue(true);

      const result = await adapter.isAvailable();

      expect(result).toBe(true);
      expect(base.checkCommandExists).toHaveBeenCalledWith('kiro');
    });

    it('kiro コマンドが存在しない場合 false を返すこと', async () => {
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
      vi.mocked(base.getCommandVersion).mockResolvedValue('kiro 0.1.0');

      const result = await adapter.getVersion();

      expect(result).toBe('kiro 0.1.0');
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
      prompt: 'バグを修正してください',
    };

    it('正常実行時に成功結果を返すこと', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: 'バグを修正しました',
        stderr: '',
        exitCode: 0,
        durationMs: 2000,
        timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue(['src/bug-fix.ts']);

      const result = await adapter.execute(baseOptions);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.filesChanged).toEqual(['src/bug-fix.ts']);
      expect(result.durationMs).toBe(2000);
    });

    it('chat -p フラグでプロンプトが渡されること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args[0]).toBe('chat');
      expect(callArgs.args[1]).toBe('-p');
      expect(callArgs.args[2]).toBe('バグを修正してください');
      expect(callArgs.command).toBe('kiro');
    });

    it('作業ディレクトリが cwd として渡されること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.cwd).toBe('/workspace/project');
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
        stdout: '', stderr: 'error', exitCode: 1, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      const result = await adapter.execute(baseOptions);

      expect(result.success).toBe(false);
      expect(result.stderr).toBe('error');
    });

    it('カスタムタイムアウトが渡されること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute({ ...baseOptions, timeout: 120 });

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.timeoutSeconds).toBe(120);
    });

    it('環境変数が渡されること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute({ ...baseOptions, env: { NODE_ENV: 'test' } });

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.env).toEqual({ NODE_ENV: 'test' });
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

  describe('createKiroCliAdapter', () => {
    it('KiroCliAdapter インスタンスを返すこと', () => {
      const instance = createKiroCliAdapter();
      expect(instance).toBeInstanceOf(KiroCliAdapter);
    });
  });
});
