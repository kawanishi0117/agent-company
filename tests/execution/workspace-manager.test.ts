/**
 * WorkspaceManager ユニットテスト
 *
 * ワークスペース管理のブランチ命名、メタデータ保存、エラーハンドリングをテスト。
 *
 * @module tests/execution/workspace-manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WorkspaceManager,
  WorkspaceManagerError,
  createWorkspaceManager,
} from '../../tools/cli/lib/execution/workspace-manager.js';
import * as fsPromises from 'node:fs/promises';
import * as childProcess from 'node:child_process';

// fs と spawn をモック化
vi.mock('node:fs/promises');
vi.mock('node:child_process');

// =============================================================================
// spawn モックヘルパー
// =============================================================================

/**
 * spawn の成功モックを設定
 */
function mockSpawnSuccess(stdout = ''): void {
  const mockChild = {
    stdout: { on: vi.fn((event: string, cb: (data: Buffer) => void) => {
      if (event === 'data') cb(Buffer.from(stdout));
    }) },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (code: number | null) => void) => {
      if (event === 'close') cb(0);
    }),
  };
  vi.mocked(childProcess.spawn).mockReturnValue(mockChild as never);
}

/**
 * spawn の失敗モックを設定
 */
function mockSpawnFailure(stderr = 'error', exitCode = 1): void {
  const mockChild = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn((event: string, cb: (data: Buffer) => void) => {
      if (event === 'data') cb(Buffer.from(stderr));
    }) },
    on: vi.fn((event: string, cb: (code: number | null) => void) => {
      if (event === 'close') cb(exitCode);
    }),
  };
  vi.mocked(childProcess.spawn).mockReturnValue(mockChild as never);
}

// =============================================================================
// テスト
// =============================================================================

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;

  beforeEach(() => {
    manager = new WorkspaceManager('test-workspaces');
    vi.clearAllMocks();

    // デフォルトの fs モック
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fsPromises.rm).mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // getProjectDir
  // ---------------------------------------------------------------------------

  describe('getProjectDir', () => {
    it('ワークスペースルート配下にプロジェクトIDのパスを返すこと', () => {
      const dir = manager.getProjectDir('my-project');
      expect(dir).toContain('test-workspaces');
      expect(dir).toContain('my-project');
    });
  });

  // ---------------------------------------------------------------------------
  // createTaskBranch
  // ---------------------------------------------------------------------------

  describe('createTaskBranch', () => {
    it('agent/<ticket-id>-<description> 形式のブランチ名を生成すること', async () => {
      mockSpawnSuccess();

      const branchName = await manager.createTaskBranch(
        '/workspace/repo',
        '0001',
        'implement login feature'
      );

      expect(branchName).toBe('agent/0001-implement-login-feature');
    });

    it('特殊文字をサニタイズすること', async () => {
      mockSpawnSuccess();

      const branchName = await manager.createTaskBranch(
        '/workspace/repo',
        '0002',
        'Fix Bug #123 (urgent!)'
      );

      expect(branchName).toBe('agent/0002-fix-bug-123-urgent');
      expect(branchName).not.toContain('#');
      expect(branchName).not.toContain('(');
      expect(branchName).not.toContain('!');
    });

    it('50文字を超える説明は切り詰められること', async () => {
      mockSpawnSuccess();

      const longDescription = 'a'.repeat(100);
      const branchName = await manager.createTaskBranch(
        '/workspace/repo',
        '0003',
        longDescription
      );

      // agent/0003- のプレフィックス + 最大50文字の説明
      const descriptionPart = branchName.replace('agent/0003-', '');
      expect(descriptionPart.length).toBeLessThanOrEqual(50);
    });

    it('git checkout -b が呼ばれること', async () => {
      mockSpawnSuccess();

      await manager.createTaskBranch('/workspace/repo', '0001', 'test');

      expect(childProcess.spawn).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['checkout', '-b']),
        expect.objectContaining({ cwd: '/workspace/repo' })
      );
    });

    it('git コマンド失敗時に WorkspaceManagerError をスローすること', async () => {
      mockSpawnFailure('branch already exists');

      await expect(
        manager.createTaskBranch('/workspace/repo', '0001', 'test')
      ).rejects.toThrow(WorkspaceManagerError);
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup
  // ---------------------------------------------------------------------------

  describe('cleanup', () => {
    it('ディレクトリを再帰的に削除すること', async () => {
      await manager.cleanup('/workspace/old-project');

      expect(fsPromises.rm).toHaveBeenCalledWith(
        '/workspace/old-project',
        { recursive: true, force: true }
      );
    });

    it('削除失敗時に WorkspaceManagerError をスローすること', async () => {
      vi.mocked(fsPromises.rm).mockRejectedValue(new Error('permission denied'));

      await expect(manager.cleanup('/workspace/locked')).rejects.toThrow(
        WorkspaceManagerError
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getWorkspaceInfo
  // ---------------------------------------------------------------------------

  describe('getWorkspaceInfo', () => {
    it('メタデータファイルが存在する場合は情報を返すこと', async () => {
      const mockInfo = {
        projectId: 'test-project',
        path: '/workspace/test-project/repo',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockInfo));

      const info = await manager.getWorkspaceInfo('test-project');

      expect(info).toEqual(mockInfo);
    });

    it('メタデータファイルが存在しない場合は null を返すこと', async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      const info = await manager.getWorkspaceInfo('nonexistent');

      expect(info).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // ファクトリ関数
  // ---------------------------------------------------------------------------

  describe('createWorkspaceManager', () => {
    it('WorkspaceManager インスタンスを返すこと', () => {
      const instance = createWorkspaceManager();
      expect(instance).toBeInstanceOf(WorkspaceManager);
    });

    it('カスタムルートパスを受け取れること', () => {
      const instance = createWorkspaceManager('custom/path');
      expect(instance.getProjectDir('test')).toContain('custom');
    });
  });
});
