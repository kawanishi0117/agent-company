/**
 * ClaudeCodeAdapter ユニットテスト
 *
 * ClaudeCodeAdapterのコマンド構築、フラグ対応、エラーハンドリングをテスト。
 *
 * @module tests/coding-agents/claude-code
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeAdapter, createClaudeCodeAdapter } from '../../tools/coding-agents/claude-code.js';
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

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 基本プロパティ
  // ---------------------------------------------------------------------------

  describe('基本プロパティ', () => {
    it('name が "claude-code" であること', () => {
      expect(adapter.name).toBe('claude-code');
    });

    it('displayName が "Claude Code" であること', () => {
      expect(adapter.displayName).toBe('Claude Code');
    });
  });

  // ---------------------------------------------------------------------------
  // isAvailable
  // ---------------------------------------------------------------------------

  describe('isAvailable', () => {
    it('claude コマンドが存在する場合 true を返すこと', async () => {
      vi.mocked(base.checkCommandExists).mockResolvedValue(true);

      const result = await adapter.isAvailable();

      expect(result).toBe(true);
      expect(base.checkCommandExists).toHaveBeenCalledWith('claude');
    });

    it('claude コマンドが存在しない場合 false を返すこと', async () => {
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
      vi.mocked(base.getCommandVersion).mockResolvedValue('claude 1.0.0');

      const result = await adapter.getVersion();

      expect(result).toBe('claude 1.0.0');
    });
  });

  // ---------------------------------------------------------------------------
  // execute
  // ---------------------------------------------------------------------------

  describe('execute', () => {
    const baseOptions: CodingTaskOptions = {
      workingDirectory: '/workspace/project',
      prompt: 'テスト機能を実装してください',
    };

    it('正常実行時に成功結果を返すこと', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '{"result": "done"}',
        stderr: '',
        exitCode: 0,
        durationMs: 3000,
        timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue(['src/test.ts']);

      const result = await adapter.execute(baseOptions);

      expect(result.success).toBe(true);
      expect(result.filesChanged).toEqual(['src/test.ts']);
    });

    it('-p フラグでプロンプトが渡されること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('-p');
      expect(callArgs.args).toContain('テスト機能を実装してください');
    });

    it('--output-format json フラグが含まれること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('--output-format');
      expect(callArgs.args).toContain('json');
    });

    it('--add-dir フラグに作業ディレクトリが含まれること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('--add-dir');
      expect(callArgs.args).toContain('/workspace/project');
    });

    it('--dangerously-skip-permissions フラグがデフォルトで含まれること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('--dangerously-skip-permissions');
    });

    it('skipPermissions=false の場合 --dangerously-skip-permissions が含まれないこと', async () => {
      const noSkipAdapter = new ClaudeCodeAdapter(false);
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await noSkipAdapter.execute(baseOptions);

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).not.toContain('--dangerously-skip-permissions');
    });

    it('allowedTools 指定時に --allowedTools フラグが含まれること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute({
        ...baseOptions,
        allowedTools: ['Read', 'Write', 'Bash'],
      });

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('--allowedTools');
      expect(callArgs.args).toContain('Read,Write,Bash');
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

    it('systemPrompt 指定時に --system-prompt フラグが含まれること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      });
      vi.mocked(base.detectChangedFiles).mockResolvedValue([]);

      await adapter.execute({ ...baseOptions, systemPrompt: 'あなたはシニアエンジニアです' });

      const callArgs = vi.mocked(base.executeSubprocess).mock.calls[0][0];
      expect(callArgs.args).toContain('--system-prompt');
      expect(callArgs.args).toContain('あなたはシニアエンジニアです');
    });

    it('タイムアウト時に CodingAgentTimeoutError をスローすること', async () => {
      vi.mocked(base.executeSubprocess).mockResolvedValue({
        stdout: '', stderr: '', exitCode: 1, durationMs: 600000, timedOut: true,
      });

      await expect(adapter.execute(baseOptions)).rejects.toThrow(
        base.CodingAgentTimeoutError
      );
    });
  });

  // ---------------------------------------------------------------------------
  // ファクトリ関数
  // ---------------------------------------------------------------------------

  describe('createClaudeCodeAdapter', () => {
    it('ClaudeCodeAdapter インスタンスを返すこと', () => {
      const instance = createClaudeCodeAdapter();
      expect(instance).toBeInstanceOf(ClaudeCodeAdapter);
    });

    it('skipPermissions パラメータを受け取れること', () => {
      const instance = createClaudeCodeAdapter(false);
      expect(instance).toBeInstanceOf(ClaudeCodeAdapter);
    });
  });
});
