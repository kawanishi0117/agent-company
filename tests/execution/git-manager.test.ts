/**
 * Git Manager ユニットテスト
 *
 * GitManagerクラスの基本機能をテストする。
 * ProcessMonitorをモック化してGitコマンドの実行をシミュレートする。
 *
 * @see Requirements: 3.3, 3.4, 3.9
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitManager } from '../../tools/cli/lib/execution/git-manager';
import { ProcessMonitor } from '../../tools/cli/lib/execution/process-monitor';
import type { CommandResult } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * 成功するコマンド結果を生成
 */
function successResult(stdout: string = ''): CommandResult {
  return {
    exitCode: 0,
    stdout,
    stderr: '',
    timedOut: false,
  };
}

/**
 * 失敗するコマンド結果を生成
 */
function failureResult(stderr: string = 'error'): CommandResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr,
    timedOut: false,
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('GitManager', () => {
  let gitManager: GitManager;
  let mockProcessMonitor: ProcessMonitor;
  let tempDir: string;

  beforeEach(async () => {
    // 一時ディレクトリを作成
    tempDir = path.join('runtime', 'test-runs', `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // ProcessMonitorのモックを作成
    mockProcessMonitor = new ProcessMonitor(tempDir);
    vi.spyOn(mockProcessMonitor, 'execute');

    // GitManagerを作成
    gitManager = new GitManager(mockProcessMonitor, tempDir);
    gitManager.setRunId('test-run-id');
  });

  afterEach(async () => {
    // 一時ディレクトリを削除
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
    vi.restoreAllMocks();
  });


  // ===========================================================================
  // ブランチ名・コミットメッセージ生成テスト
  // ===========================================================================

  describe('generateBranchName', () => {
    /**
     * ブランチ名生成テスト
     * @see Requirement 3.4: THE Git_Manager SHALL create feature branch named `agent/<ticket-id>-<description>`
     * @see Property 6: Git Naming Conventions
     */

    it('チケットIDと説明からブランチ名を生成する', () => {
      const branchName = GitManager.generateBranchName('TICKET-123', 'Add new feature');
      expect(branchName).toBe('agent/TICKET-123-add-new-feature');
    });

    it('ブランチ名は agent/ プレフィックスで始まる', () => {
      const branchName = GitManager.generateBranchName('T-1', 'test');
      expect(branchName).toMatch(/^agent\//);
    });

    it('ブランチ名にチケットIDが含まれる', () => {
      const ticketId = 'PROJ-456';
      const branchName = GitManager.generateBranchName(ticketId, 'some description');
      expect(branchName).toContain(ticketId);
    });

    it('特殊文字をハイフンに変換する', () => {
      const branchName = GitManager.generateBranchName('T-1', 'Fix bug: memory leak!');
      expect(branchName).toBe('agent/T-1-fix-bug-memory-leak');
    });

    it('連続するハイフンを単一のハイフンに変換する', () => {
      const branchName = GitManager.generateBranchName('T-1', 'Fix   multiple   spaces');
      expect(branchName).not.toMatch(/--+/);
    });

    it('先頭と末尾のハイフンを除去する', () => {
      const branchName = GitManager.generateBranchName('T-1', '---test---');
      // 説明部分の先頭・末尾ハイフンが除去される
      expect(branchName).toBe('agent/T-1-test');
    });

    it('長い説明を切り詰める', () => {
      const longDescription = 'a'.repeat(100);
      const branchName = GitManager.generateBranchName('T-1', longDescription);
      // agent/T-1- の後に50文字まで
      expect(branchName.length).toBeLessThanOrEqual(60);
    });

    it('日本語を含む説明を処理する', () => {
      const branchName = GitManager.generateBranchName('T-1', '新機能追加');
      // 日本語は除去される
      expect(branchName).toBe('agent/T-1-');
    });

    it('空の説明を処理する', () => {
      const branchName = GitManager.generateBranchName('T-1', '');
      expect(branchName).toBe('agent/T-1-');
    });

    it('数字のみの説明を処理する', () => {
      const branchName = GitManager.generateBranchName('T-1', '12345');
      expect(branchName).toBe('agent/T-1-12345');
    });

    it('大文字を小文字に変換する', () => {
      const branchName = GitManager.generateBranchName('T-1', 'ADD NEW FEATURE');
      expect(branchName).toBe('agent/T-1-add-new-feature');
    });
  });

  describe('generateCommitMessage', () => {
    /**
     * コミットメッセージ生成テスト
     * @see Requirement 3.6: THE commit message SHALL follow format: `[<ticket-id>] <description>`
     * @see Property 6: Git Naming Conventions
     */

    it('チケットIDと説明からコミットメッセージを生成する', () => {
      const message = GitManager.generateCommitMessage('TICKET-123', 'Add new feature');
      expect(message).toBe('[TICKET-123] Add new feature');
    });

    it('コミットメッセージは [ticket-id] 形式で始まる', () => {
      const message = GitManager.generateCommitMessage('T-1', 'test');
      expect(message).toMatch(/^\[T-1\]/);
    });

    it('コミットメッセージにチケットIDが角括弧で囲まれている', () => {
      const ticketId = 'PROJ-456';
      const message = GitManager.generateCommitMessage(ticketId, 'some description');
      expect(message).toContain(`[${ticketId}]`);
    });

    it('特殊文字を含む説明を処理する', () => {
      const message = GitManager.generateCommitMessage('T-1', 'Fix "bug" in code');
      expect(message).toBe('[T-1] Fix "bug" in code');
    });

    it('空の説明を処理する', () => {
      const message = GitManager.generateCommitMessage('T-1', '');
      expect(message).toBe('[T-1] ');
    });

    it('日本語の説明を処理する', () => {
      const message = GitManager.generateCommitMessage('T-1', '新機能を追加');
      expect(message).toBe('[T-1] 新機能を追加');
    });

    it('改行を含む説明を処理する', () => {
      const message = GitManager.generateCommitMessage('T-1', 'Line1\nLine2');
      expect(message).toBe('[T-1] Line1\nLine2');
    });

    it('長い説明をそのまま保持する', () => {
      const longDescription = 'a'.repeat(200);
      const message = GitManager.generateCommitMessage('T-1', longDescription);
      expect(message).toBe(`[T-1] ${longDescription}`);
    });
  });

  // ===========================================================================
  // 認証設定テスト
  // ===========================================================================

  describe('setCredentialProvider', () => {
    it('トークン認証を設定できる', () => {
      expect(() => {
        gitManager.setCredentialProvider({
          type: 'token',
          token: 'ghp_xxxxxxxxxxxxxxxxxxxx',
          tokenType: 'github_pat',
        });
      }).not.toThrow();
    });

    it('無効なトークンでエラーを投げる', () => {
      expect(() => {
        gitManager.setCredentialProvider({
          type: 'token',
          token: '', // 空のトークン
          tokenType: 'github_pat',
        });
      }).toThrow('Git認証設定が無効です');
    });

    it('SSH agent forwardingは明示的許可が必要', () => {
      expect(() => {
        gitManager.setCredentialProvider({
          type: 'ssh_agent',
        }, false); // 許可なし
      }).toThrow('Git認証設定が無効です');
    });

    it('SSH agent forwardingを許可すると設定できる', () => {
      // SSH_AUTH_SOCKが設定されている場合のみ成功
      const originalEnv = process.env.SSH_AUTH_SOCK;
      process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';

      expect(() => {
        gitManager.setCredentialProvider({
          type: 'ssh_agent',
        }, true); // 許可あり
      }).not.toThrow();

      process.env.SSH_AUTH_SOCK = originalEnv;
    });
  });

  // ===========================================================================
  // clone テスト
  // ===========================================================================

  describe('clone', () => {
    it('HTTPS URLでリポジトリをクローンする', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.clone('https://github.com/user/repo.git', '/workspace/repo');

      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.objectContaining({ timeout: 300 })
      );
    });

    it('トークン認証でクローンする', async () => {
      gitManager.setCredentialProvider({
        type: 'token',
        token: 'ghp_test_token',
        tokenType: 'github_pat',
      });

      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.clone('https://github.com/user/repo.git', '/workspace/repo');

      // 認証情報付きURLが使用される
      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        expect.stringContaining('x-access-token:ghp_test_token'),
        expect.any(Object)
      );
    });

    it('クローン失敗時にエラーを投げる', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(
        failureResult('fatal: repository not found')
      );

      await expect(
        gitManager.clone('https://github.com/user/repo.git', '/workspace/repo')
      ).rejects.toThrow('git clone failed');
    });
  });

  // ===========================================================================
  // createBranch テスト
  // ===========================================================================

  describe('createBranch', () => {
    it('新しいブランチを作成する', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.createBranch('agent/T-1-new-feature', { cwd: '/workspace/repo' });

      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'git checkout -b "agent/T-1-new-feature"',
        expect.objectContaining({ cwd: '/workspace/repo' })
      );
    });

    it('ブランチ作成失敗時にエラーを投げる', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(
        failureResult('fatal: A branch named \'agent/T-1-new-feature\' already exists')
      );

      await expect(
        gitManager.createBranch('agent/T-1-new-feature')
      ).rejects.toThrow('git checkout -b failed');
    });
  });

  // ===========================================================================
  // checkout テスト
  // ===========================================================================

  describe('checkout', () => {
    it('ブランチをチェックアウトする', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.checkout('main', { cwd: '/workspace/repo' });

      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'git checkout "main"',
        expect.objectContaining({ cwd: '/workspace/repo' })
      );
    });

    it('チェックアウト失敗時にエラーを投げる', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(
        failureResult('error: pathspec \'nonexistent\' did not match any file(s)')
      );

      await expect(
        gitManager.checkout('nonexistent')
      ).rejects.toThrow('git checkout failed');
    });
  });

  // ===========================================================================
  // stage テスト
  // ===========================================================================

  describe('stage', () => {
    it('ファイルをステージングする', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.stage(['file1.ts', 'file2.ts'], { cwd: '/workspace/repo' });

      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'git add "file1.ts" "file2.ts"',
        expect.objectContaining({ cwd: '/workspace/repo' })
      );
    });

    it('全ファイルをステージングする', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.stage(['.'], { cwd: '/workspace/repo' });

      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'git add "."',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // commit テスト
  // ===========================================================================

  describe('commit', () => {
    it('コミットを作成してハッシュを返す', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult()) // git commit
        .mockResolvedValueOnce(successResult('abc123def456')); // git rev-parse HEAD

      const hash = await gitManager.commit('[T-1] Add new feature', { cwd: '/workspace/repo' });

      expect(hash).toBe('abc123def456');
      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'git commit -m "[T-1] Add new feature"',
        expect.any(Object)
      );
    });

    it('ダブルクォートをエスケープする', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult())
        .mockResolvedValueOnce(successResult('abc123'));

      await gitManager.commit('[T-1] Fix "bug"', { cwd: '/workspace/repo' });

      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'git commit -m "[T-1] Fix \\"bug\\""',
        expect.any(Object)
      );
    });

    it('コミット失敗時にエラーを投げる', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(
        failureResult('nothing to commit')
      );

      await expect(
        gitManager.commit('[T-1] Empty commit')
      ).rejects.toThrow('git commit failed');
    });
  });

  // ===========================================================================
  // push テスト
  // ===========================================================================

  describe('push', () => {
    it('ブランチをプッシュする', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.push('agent/T-1-new-feature', { cwd: '/workspace/repo' });

      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'git push -u origin "agent/T-1-new-feature"',
        expect.objectContaining({ timeout: 120 })
      );
    });

    it('プッシュ失敗時にエラーを投げる', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(
        failureResult('error: failed to push some refs')
      );

      await expect(
        gitManager.push('agent/T-1-new-feature')
      ).rejects.toThrow('git push failed');
    });
  });

  // ===========================================================================
  // getStatus テスト
  // ===========================================================================

  describe('getStatus', () => {
    it('リポジトリの状態を取得する', async () => {
      // git status --porcelain の形式:
      // XY filename
      // X = index status, Y = work tree status
      // ' M' = modified in work tree (not staged)
      // 'M ' = modified and staged
      // 'A ' = added (staged)
      // '??' = untracked
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('main')) // git branch --show-current
        .mockResolvedValueOnce(successResult(' M modified.ts\n?? untracked.ts\nA  staged.ts')); // git status --porcelain

      const status = await gitManager.getStatus({ cwd: '/workspace/repo' });

      expect(status.branch).toBe('main');
      expect(status.modified).toContain('modified.ts');
      expect(status.untracked).toContain('untracked.ts');
      expect(status.staged).toContain('staged.ts');
    });

    it('コンフリクトを検出する', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU conflict.ts'));

      const status = await gitManager.getStatus({ cwd: '/workspace/repo' });

      expect(status.conflicts).toContain('conflict.ts');
    });

    it('クリーンな状態を返す', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('main'))
        .mockResolvedValueOnce(successResult(''));

      const status = await gitManager.getStatus({ cwd: '/workspace/repo' });

      expect(status.branch).toBe('main');
      expect(status.staged).toHaveLength(0);
      expect(status.modified).toHaveLength(0);
      expect(status.untracked).toHaveLength(0);
      expect(status.conflicts).toHaveLength(0);
    });
  });

  // ===========================================================================
  // hasConflicts / getConflicts テスト
  // ===========================================================================

  describe('hasConflicts', () => {
    it('コンフリクトがある場合はtrueを返す', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU conflict.ts'));

      const hasConflicts = await gitManager.hasConflicts({ cwd: '/workspace/repo' });

      expect(hasConflicts).toBe(true);
    });

    it('コンフリクトがない場合はfalseを返す', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('main'))
        .mockResolvedValueOnce(successResult(''));

      const hasConflicts = await gitManager.hasConflicts({ cwd: '/workspace/repo' });

      expect(hasConflicts).toBe(false);
    });
  });

  describe('getConflicts', () => {
    /**
     * コンフリクト情報取得テスト
     * @see Requirement 4.1: WHEN Git conflict occurs, THE Git_Manager SHALL first attempt automatic resolution
     */

    it('コンフリクト情報を取得する', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature')) // git branch
        .mockResolvedValueOnce(successResult('UU conflict.ts')) // git status
        .mockResolvedValueOnce(successResult('base content')) // git show :1:
        .mockResolvedValueOnce(successResult('our content')) // git show :2:
        .mockResolvedValueOnce(successResult('their content')); // git show :3:

      const conflicts = await gitManager.getConflicts({ cwd: '/workspace/repo' });

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].file).toBe('conflict.ts');
      expect(conflicts[0].base).toBe('base content');
      expect(conflicts[0].ours).toBe('our content');
      expect(conflicts[0].theirs).toBe('their content');
    });

    it('複数のコンフリクトを取得する', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU file1.ts\nUU file2.ts'))
        // file1.ts
        .mockResolvedValueOnce(successResult('base1'))
        .mockResolvedValueOnce(successResult('ours1'))
        .mockResolvedValueOnce(successResult('theirs1'))
        // file2.ts
        .mockResolvedValueOnce(successResult('base2'))
        .mockResolvedValueOnce(successResult('ours2'))
        .mockResolvedValueOnce(successResult('theirs2'));

      const conflicts = await gitManager.getConflicts({ cwd: '/workspace/repo' });

      expect(conflicts).toHaveLength(2);
      expect(conflicts[0].file).toBe('file1.ts');
      expect(conflicts[1].file).toBe('file2.ts');
    });

    it('コンフリクトがない場合は空配列を返す', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('main'))
        .mockResolvedValueOnce(successResult(''));

      const conflicts = await gitManager.getConflicts({ cwd: '/workspace/repo' });

      expect(conflicts).toHaveLength(0);
    });

    it('詳細取得に失敗した場合は基本情報のみ返す', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU conflict.ts'))
        .mockResolvedValueOnce(failureResult('error')) // git show :1: 失敗
        .mockResolvedValueOnce(failureResult('error')) // git show :2: 失敗
        .mockResolvedValueOnce(failureResult('error')); // git show :3: 失敗

      const conflicts = await gitManager.getConflicts({ cwd: '/workspace/repo' });

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].file).toBe('conflict.ts');
      expect(conflicts[0].base).toBe('');
      expect(conflicts[0].ours).toBe('');
      expect(conflicts[0].theirs).toBe('');
    });
  });

  // ===========================================================================
  // attemptAutoResolve テスト
  // ===========================================================================

  describe('attemptAutoResolve', () => {
    /**
     * 自動コンフリクト解決テスト
     * @see Requirement 4.1: WHEN Git conflict occurs, THE Git_Manager SHALL first attempt automatic resolution
     * @see Requirement 4.2: IF automatic resolution fails, THE Git_Manager SHALL escalate to Reviewer_Agent
     */

    it('コンフリクトがない場合は成功を返す', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('main'))
        .mockResolvedValueOnce(successResult(''));

      const result = await gitManager.attemptAutoResolve({ cwd: '/workspace/repo' });

      expect(result.success).toBe(true);
      expect(result.needsEscalation).toBe(false);
      expect(result.resolvedFiles).toHaveLength(0);
      expect(result.unresolvedFiles).toHaveLength(0);
    });

    it('両方が同じ内容の場合は自動解決する', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature')) // git branch
        .mockResolvedValueOnce(successResult('UU conflict.ts')) // git status
        .mockResolvedValueOnce(successResult('base')) // git show :1:
        .mockResolvedValueOnce(successResult('same content')) // git show :2:
        .mockResolvedValueOnce(successResult('same content')) // git show :3:
        .mockResolvedValueOnce(successResult('')); // git add

      const result = await gitManager.attemptAutoResolve({ cwd: tempDir });

      expect(result.success).toBe(true);
      expect(result.needsEscalation).toBe(false);
      expect(result.resolvedFiles).toContain('conflict.ts');
    });

    it('一方がbaseと同じ場合は変更された側を採用する', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU conflict.ts'))
        .mockResolvedValueOnce(successResult('base content')) // base
        .mockResolvedValueOnce(successResult('base content')) // ours = base
        .mockResolvedValueOnce(successResult('new content')) // theirs = changed
        .mockResolvedValueOnce(successResult('')); // git add

      const result = await gitManager.attemptAutoResolve({ cwd: tempDir });

      expect(result.success).toBe(true);
      expect(result.needsEscalation).toBe(false);
      expect(result.resolvedFiles).toContain('conflict.ts');
    });

    it('両方が変更されている場合はエスカレーションが必要', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU conflict.ts'))
        .mockResolvedValueOnce(successResult('base content'))
        .mockResolvedValueOnce(successResult('our changes'))
        .mockResolvedValueOnce(successResult('their changes'));

      const result = await gitManager.attemptAutoResolve({ cwd: '/workspace/repo' });

      expect(result.success).toBe(false);
      expect(result.needsEscalation).toBe(true);
      expect(result.unresolvedFiles).toContain('conflict.ts');
    });

    it('一部のファイルのみ自動解決できる場合', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU file1.ts\nUU file2.ts'))
        // file1.ts - 自動解決可能（両方同じ）
        .mockResolvedValueOnce(successResult('base'))
        .mockResolvedValueOnce(successResult('same'))
        .mockResolvedValueOnce(successResult('same'))
        .mockResolvedValueOnce(successResult('')) // git add
        // file2.ts - 自動解決不可（両方変更）
        .mockResolvedValueOnce(successResult('base'))
        .mockResolvedValueOnce(successResult('ours'))
        .mockResolvedValueOnce(successResult('theirs'));

      const result = await gitManager.attemptAutoResolve({ cwd: tempDir });

      expect(result.success).toBe(false);
      expect(result.needsEscalation).toBe(true);
      expect(result.resolvedFiles).toContain('file1.ts');
      expect(result.unresolvedFiles).toContain('file2.ts');
    });
  });

  // ===========================================================================
  // generateConflictReport テスト
  // ===========================================================================

  describe('generateConflictReport', () => {
    /**
     * コンフリクトレポート生成テスト
     * @see Requirement 4.1, 4.2
     */

    it('コンフリクトレポートを生成する', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU conflict.ts'))
        .mockResolvedValueOnce(successResult('base'))
        .mockResolvedValueOnce(successResult('ours'))
        .mockResolvedValueOnce(successResult('theirs'))
        // getStatus for report
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU conflict.ts'));

      const report = await gitManager.generateConflictReport({ cwd: '/workspace/repo' });

      expect(report.branch).toBe('feature');
      expect(report.totalConflicts).toBe(1);
      expect(report.files).toHaveLength(1);
      expect(report.files[0].path).toBe('conflict.ts');
      expect(report.summary).toContain('1 件');
    });

    it('コンフリクトがない場合のレポート', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('main'))
        .mockResolvedValueOnce(successResult(''))
        .mockResolvedValueOnce(successResult('main'))
        .mockResolvedValueOnce(successResult(''));

      const report = await gitManager.generateConflictReport({ cwd: '/workspace/repo' });

      expect(report.totalConflicts).toBe(0);
      expect(report.files).toHaveLength(0);
      expect(report.summary).toContain('コンフリクトはありません');
    });

    it('自動解決可能なファイルを識別する', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU file1.ts\nUU file2.ts'))
        // file1.ts - 自動解決可能
        .mockResolvedValueOnce(successResult('base'))
        .mockResolvedValueOnce(successResult('same'))
        .mockResolvedValueOnce(successResult('same'))
        // file2.ts - 自動解決不可
        .mockResolvedValueOnce(successResult('base'))
        .mockResolvedValueOnce(successResult('ours'))
        .mockResolvedValueOnce(successResult('theirs'))
        // getStatus
        .mockResolvedValueOnce(successResult('feature'))
        .mockResolvedValueOnce(successResult('UU file1.ts\nUU file2.ts'));

      const report = await gitManager.generateConflictReport({ cwd: '/workspace/repo' });

      expect(report.files[0].autoResolvable).toBe(true);
      expect(report.files[1].autoResolvable).toBe(false);
      expect(report.summary).toContain('自動解決可能');
      expect(report.summary).toContain('手動解決が必要');
    });
  });

  // ===========================================================================
  // validateKnownHosts テスト
  // ===========================================================================

  describe('validateKnownHosts', () => {
    it('既知のGitホスト（github.com）を検証する', async () => {
      const knownHostsPath = path.join(tempDir, 'known_hosts');
      gitManager.setKnownHostsPath(knownHostsPath);

      const isValid = await gitManager.validateKnownHosts('github.com');

      expect(isValid).toBe(true);

      // known_hostsファイルが作成されていることを確認
      const content = await fs.readFile(knownHostsPath, 'utf-8');
      expect(content).toContain('ssh-ed25519');
    });

    it('既知のGitホスト（gitlab.com）を検証する', async () => {
      const knownHostsPath = path.join(tempDir, 'known_hosts');
      gitManager.setKnownHostsPath(knownHostsPath);

      const isValid = await gitManager.validateKnownHosts('gitlab.com');

      expect(isValid).toBe(true);
    });

    it('未知のホストはssh-keyscanで検証する', async () => {
      const knownHostsPath = path.join(tempDir, 'known_hosts');
      gitManager.setKnownHostsPath(knownHostsPath);

      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(
        successResult('unknown.example.com ssh-ed25519 AAAAC3...')
      );

      const isValid = await gitManager.validateKnownHosts('unknown.example.com');

      expect(isValid).toBe(true);
      expect(mockProcessMonitor.execute).toHaveBeenCalledWith(
        'ssh-keyscan -H "unknown.example.com"',
        expect.any(Object)
      );
    });

    it('ssh-keyscan失敗時はfalseを返す', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(failureResult());

      const isValid = await gitManager.validateKnownHosts('invalid.example.com');

      expect(isValid).toBe(false);
    });
  });

  // ===========================================================================
  // ログ出力テスト
  // ===========================================================================

  describe('logging', () => {
    /**
     * Git操作ログ出力テスト
     * @see Requirement 3.8: THE Git operations SHALL be logged to `runtime/runs/<run-id>/git.log`
     * @see Property 7: Git Operation Logging
     */

    it('Git操作がログファイルに記録される', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.createBranch('test-branch');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('[createBranch]');
      expect(logContent).toContain('branchName=test-branch');
      expect(logContent).toContain('[SUCCESS]');
    });

    it('失敗した操作もログに記録される', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(
        failureResult('error message')
      );

      await expect(gitManager.createBranch('test-branch')).rejects.toThrow();

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('[createBranch]');
      expect(logContent).toContain('[FAILED:');
    });

    it('複数のGit操作が順番にログに記録される', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult()) // createBranch
        .mockResolvedValueOnce(successResult()) // stage
        .mockResolvedValueOnce(successResult()) // commit
        .mockResolvedValueOnce(successResult('abc123')); // rev-parse HEAD

      await gitManager.createBranch('feature-branch');
      await gitManager.stage(['file.ts']);
      await gitManager.commit('[T-1] Add feature');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      const logLines = logContent.trim().split('\n');

      // 3つの操作がログに記録されている
      expect(logLines.length).toBe(3);
      expect(logLines[0]).toContain('[createBranch]');
      expect(logLines[1]).toContain('[stage]');
      expect(logLines[2]).toContain('[commit]');
    });

    it('ログにタイムスタンプが含まれる', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.createBranch('test-branch');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // ISO8601形式のタイムスタンプが含まれる
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('ログに実行時間が含まれる', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.createBranch('test-branch');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // 実行時間（ミリ秒）が含まれる
      expect(logContent).toMatch(/\[\d+ms\]/);
    });

    it('runIdが設定されていない場合はログを記録しない', async () => {
      // runIdを設定しないGitManagerを作成
      const gitManagerNoRunId = new GitManager(mockProcessMonitor, tempDir);
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManagerNoRunId.createBranch('test-branch');

      // ログディレクトリが作成されていないことを確認
      const logDir = path.join(tempDir, 'undefined');
      await expect(fs.access(logDir)).rejects.toThrow();
    });

    it('clone操作がログに記録される', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.clone('https://github.com/user/repo.git', '/workspace/repo');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('[clone]');
      expect(logContent).toContain('url=https://github.com/user/repo.git');
      expect(logContent).toContain('targetDir=/workspace/repo');
      expect(logContent).toContain('[SUCCESS]');
    });

    it('checkout操作がログに記録される', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.checkout('main');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('[checkout]');
      expect(logContent).toContain('branchName=main');
      expect(logContent).toContain('[SUCCESS]');
    });

    it('push操作がログに記録される', async () => {
      vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

      await gitManager.push('feature-branch');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('[push]');
      expect(logContent).toContain('branchName=feature-branch');
      expect(logContent).toContain('[SUCCESS]');
    });

    it('getStatus操作がログに記録される', async () => {
      vi.mocked(mockProcessMonitor.execute)
        .mockResolvedValueOnce(successResult('main'))
        .mockResolvedValueOnce(successResult(''));

      await gitManager.getStatus();

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('[getStatus]');
      expect(logContent).toContain('branch=main');
      expect(logContent).toContain('[SUCCESS]');
    });

    it('validateKnownHosts操作がログに記録される', async () => {
      const knownHostsPath = path.join(tempDir, 'known_hosts');
      gitManager.setKnownHostsPath(knownHostsPath);

      await gitManager.validateKnownHosts('github.com');

      // ログファイルを確認
      const logPath = path.join(tempDir, 'test-run-id', 'git.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('[validateKnownHosts]');
      expect(logContent).toContain('host=github.com');
      expect(logContent).toContain('[SUCCESS]');
    });
  });
});
