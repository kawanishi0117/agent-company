/**
 * Tool Call ユニットテスト
 *
 * AIからのツール呼び出しインターフェースの機能をテストする。
 * ファイル操作、コマンド実行、Git操作をカバー。
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
 *
 * @module tests/execution/tools.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ToolExecutor, FileEdit, applyEditsToContent } from '../../tools/cli/lib/execution/tools';
import { ProcessMonitor } from '../../tools/cli/lib/execution/process-monitor';
import { GitManager } from '../../tools/cli/lib/execution/git-manager';

// =============================================================================
// プラットフォーム判定
// =============================================================================

/**
 * Windows環境かどうか
 */
const isWindows = os.platform() === 'win32';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
let TEST_WORKSPACE_DIR: string;

/**
 * テスト用の実行ID
 */
const TEST_RUN_ID = 'test-tools-001';

// =============================================================================
// テストセットアップ
// =============================================================================

describe('ToolExecutor', () => {
  let toolExecutor: ToolExecutor;
  let processMonitor: ProcessMonitor;
  let gitManager: GitManager;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    TEST_WORKSPACE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-test-'));

    // テスト用のインスタンスを作成
    processMonitor = new ProcessMonitor('runtime/runs');
    gitManager = new GitManager(processMonitor, 'runtime/runs');
    toolExecutor = new ToolExecutor(processMonitor, gitManager, TEST_WORKSPACE_DIR);
    toolExecutor.setRunId(TEST_RUN_ID);
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_WORKSPACE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // コンテキスト管理テスト
  // ===========================================================================

  describe('context management', () => {
    it('ワークスペースパスを設定・取得できる', () => {
      const newPath = '/new/workspace';
      toolExecutor.setWorkspacePath(newPath);

      const context = toolExecutor.getContext();
      expect(context.workspacePath).toBe(newPath);
    });

    it('実行IDを設定できる', () => {
      toolExecutor.setRunId('new-run-id');

      const context = toolExecutor.getContext();
      expect(context.runId).toBe('new-run-id');
    });

    it('コマンドタイムアウトを設定できる', () => {
      toolExecutor.setCommandTimeout(60);

      const context = toolExecutor.getContext();
      expect(context.commandTimeout).toBe(60);
    });
  });

  // ===========================================================================
  // ファイル読み取りテスト
  // ===========================================================================

  describe('readFile', () => {
    /**
     * ファイル読み取り
     * @see Requirement 8.2: WHEN AI requests `read_file`, THE System SHALL return file content
     */
    it('ファイルの内容を読み取る', async () => {
      // テストファイルを作成
      const testContent = 'Hello, World!\nThis is a test file.';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'test.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      // ファイルを読み取り
      const result = await toolExecutor.readFile('test.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBe(testContent);
    });

    it('存在しないファイルでエラーを返す', async () => {
      const result = await toolExecutor.readFile('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('ディレクトリを読み取ろうとするとエラーを返す', async () => {
      // テストディレクトリを作成
      const testDir = path.join(TEST_WORKSPACE_DIR, 'testdir');
      await fs.mkdir(testDir, { recursive: true });

      const result = await toolExecutor.readFile('testdir');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot read directory as file');
    });

    it('ワークスペース外のファイルへのアクセスを拒否する', async () => {
      const result = await toolExecutor.readFile('/etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('相対パスでファイルを読み取る', async () => {
      // サブディレクトリにファイルを作成
      const subDir = path.join(TEST_WORKSPACE_DIR, 'subdir');
      await fs.mkdir(subDir, { recursive: true });
      const testContent = 'Nested file content';
      await fs.writeFile(path.join(subDir, 'nested.txt'), testContent, 'utf-8');

      const result = await toolExecutor.readFile('subdir/nested.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBe(testContent);
    });

    it('パストラバーサル攻撃を防ぐ', async () => {
      const result = await toolExecutor.readFile('../../../etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });
  });

  // ===========================================================================
  // ファイル書き込みテスト
  // ===========================================================================

  describe('writeFile', () => {
    /**
     * ファイル書き込み
     * @see Requirement 8.3: WHEN AI requests `write_file`, THE System SHALL create or overwrite file
     */
    it('新しいファイルを作成する', async () => {
      const testContent = 'New file content';

      const result = await toolExecutor.writeFile('newfile.txt', testContent);

      expect(result.success).toBe(true);

      // ファイルが作成されたことを確認
      const content = await fs.readFile(path.join(TEST_WORKSPACE_DIR, 'newfile.txt'), 'utf-8');
      expect(content).toBe(testContent);
    });

    it('既存のファイルを上書きする', async () => {
      // 既存ファイルを作成
      const testFile = path.join(TEST_WORKSPACE_DIR, 'existing.txt');
      await fs.writeFile(testFile, 'Old content', 'utf-8');

      // ファイルを上書き
      const newContent = 'New content';
      const result = await toolExecutor.writeFile('existing.txt', newContent);

      expect(result.success).toBe(true);

      // 内容が更新されたことを確認
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe(newContent);
    });

    it('親ディレクトリが存在しない場合は自動作成する', async () => {
      const testContent = 'Deep nested content';

      const result = await toolExecutor.writeFile('deep/nested/dir/file.txt', testContent);

      expect(result.success).toBe(true);

      // ファイルが作成されたことを確認
      const content = await fs.readFile(
        path.join(TEST_WORKSPACE_DIR, 'deep/nested/dir/file.txt'),
        'utf-8'
      );
      expect(content).toBe(testContent);
    });

    it('ワークスペース外への書き込みを拒否する', async () => {
      const result = await toolExecutor.writeFile('/tmp/outside.txt', 'content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('空のファイルを作成できる', async () => {
      const result = await toolExecutor.writeFile('empty.txt', '');

      expect(result.success).toBe(true);

      const content = await fs.readFile(path.join(TEST_WORKSPACE_DIR, 'empty.txt'), 'utf-8');
      expect(content).toBe('');
    });

    it('日本語を含むファイルを作成できる', async () => {
      const testContent = 'こんにちは、世界！\n日本語テスト';

      const result = await toolExecutor.writeFile('japanese.txt', testContent);

      expect(result.success).toBe(true);

      const content = await fs.readFile(path.join(TEST_WORKSPACE_DIR, 'japanese.txt'), 'utf-8');
      expect(content).toBe(testContent);
    });
  });

  // ===========================================================================
  // ファイル編集テスト
  // ===========================================================================

  describe('editFile', () => {
    /**
     * ファイル編集
     * @see Requirement 8.4: WHEN AI requests `edit_file`, THE System SHALL apply diff-based changes
     */
    it('行を置換する', async () => {
      // テストファイルを作成
      const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'edit.txt');
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // 2行目を置換
      const edits: FileEdit[] = [
        { type: 'replace', startLine: 2, endLine: 2, content: 'Modified Line 2' },
      ];

      const result = await toolExecutor.editFile('edit.txt', edits);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Line 1\nModified Line 2\nLine 3\nLine 4');

      // ファイルが更新されたことを確認
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Line 1\nModified Line 2\nLine 3\nLine 4');
    });

    it('複数行を置換する', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'edit.txt');
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // 2-3行目を置換
      const edits: FileEdit[] = [
        { type: 'replace', startLine: 2, endLine: 3, content: 'New Line 2\nNew Line 3' },
      ];

      const result = await toolExecutor.editFile('edit.txt', edits);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Line 1\nNew Line 2\nNew Line 3\nLine 4');
    });

    it('行を挿入する', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'edit.txt');
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // 2行目の前に挿入
      const edits: FileEdit[] = [{ type: 'insert', startLine: 2, content: 'Inserted Line' }];

      const result = await toolExecutor.editFile('edit.txt', edits);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Line 1\nInserted Line\nLine 2\nLine 3');
    });

    it('行を削除する', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'edit.txt');
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // 2行目を削除
      const edits: FileEdit[] = [{ type: 'delete', startLine: 2, endLine: 2 }];

      const result = await toolExecutor.editFile('edit.txt', edits);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Line 1\nLine 3\nLine 4');
    });

    it('複数の編集を適用する', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'edit.txt');
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // 複数の編集（後ろから適用される）
      const edits: FileEdit[] = [
        { type: 'replace', startLine: 2, endLine: 2, content: 'Modified 2' },
        { type: 'delete', startLine: 4, endLine: 4 },
      ];

      const result = await toolExecutor.editFile('edit.txt', edits);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Line 1\nModified 2\nLine 3\nLine 5');
    });

    it('存在しないファイルでエラーを返す', async () => {
      const edits: FileEdit[] = [
        { type: 'replace', startLine: 1, endLine: 1, content: 'New content' },
      ];

      const result = await toolExecutor.editFile('nonexistent.txt', edits);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('無効な行番号でエラーを返す', async () => {
      const originalContent = 'Line 1\nLine 2';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'edit.txt');
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // 存在しない行を編集
      const edits: FileEdit[] = [
        { type: 'replace', startLine: 10, endLine: 10, content: 'New content' },
      ];

      const result = await toolExecutor.editFile('edit.txt', edits);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds file length');
    });

    it('行番号0でエラーを返す', async () => {
      const originalContent = 'Line 1\nLine 2';
      const testFile = path.join(TEST_WORKSPACE_DIR, 'edit.txt');
      await fs.writeFile(testFile, originalContent, 'utf-8');

      const edits: FileEdit[] = [
        { type: 'replace', startLine: 0, endLine: 1, content: 'New content' },
      ];

      const result = await toolExecutor.editFile('edit.txt', edits);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid start line');
    });
  });

  // ===========================================================================
  // ディレクトリ一覧テスト
  // ===========================================================================

  describe('listDirectory', () => {
    it('ディレクトリの内容を一覧表示する', async () => {
      // テストファイルとディレクトリを作成
      await fs.writeFile(path.join(TEST_WORKSPACE_DIR, 'file1.txt'), 'content1', 'utf-8');
      await fs.writeFile(path.join(TEST_WORKSPACE_DIR, 'file2.txt'), 'content2', 'utf-8');
      await fs.mkdir(path.join(TEST_WORKSPACE_DIR, 'subdir'), { recursive: true });

      const result = await toolExecutor.listDirectory('.');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.length).toBe(3);

      // ファイルとディレクトリが含まれていることを確認
      const names = result.data!.map((e) => e.name);
      expect(names).toContain('file1.txt');
      expect(names).toContain('file2.txt');
      expect(names).toContain('subdir');

      // タイプが正しいことを確認
      const file1 = result.data!.find((e) => e.name === 'file1.txt');
      expect(file1?.type).toBe('file');
      expect(file1?.size).toBeDefined();

      const subdir = result.data!.find((e) => e.name === 'subdir');
      expect(subdir?.type).toBe('directory');
    });

    it('存在しないディレクトリでエラーを返す', async () => {
      const result = await toolExecutor.listDirectory('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Directory not found');
    });

    it('ファイルを指定するとエラーを返す', async () => {
      await fs.writeFile(path.join(TEST_WORKSPACE_DIR, 'file.txt'), 'content', 'utf-8');

      const result = await toolExecutor.listDirectory('file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a directory');
    });

    it('ワークスペース外のディレクトリへのアクセスを拒否する', async () => {
      const result = await toolExecutor.listDirectory('/etc');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('空のディレクトリを一覧表示する', async () => {
      await fs.mkdir(path.join(TEST_WORKSPACE_DIR, 'empty'), { recursive: true });

      const result = await toolExecutor.listDirectory('empty');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('エントリが名前でソートされている', async () => {
      await fs.writeFile(path.join(TEST_WORKSPACE_DIR, 'zebra.txt'), '', 'utf-8');
      await fs.writeFile(path.join(TEST_WORKSPACE_DIR, 'apple.txt'), '', 'utf-8');
      await fs.writeFile(path.join(TEST_WORKSPACE_DIR, 'mango.txt'), '', 'utf-8');

      const result = await toolExecutor.listDirectory('.');

      expect(result.success).toBe(true);
      const names = result.data!.map((e) => e.name);
      expect(names).toEqual(['apple.txt', 'mango.txt', 'zebra.txt']);
    });
  });

  // ===========================================================================
  // コマンド実行テスト
  // ===========================================================================

  describe('runCommand', () => {
    /**
     * コマンド実行
     * @see Requirement 8.5: WHEN AI requests `run_command`, THE System SHALL execute via Process_Monitor
     */
    it('コマンドを実行して結果を返す', async () => {
      const command = isWindows ? 'cmd /c echo Hello' : 'echo Hello';

      const result = await toolExecutor.runCommand(command);

      expect(result.success).toBe(true);
      expect(result.data?.stdout.trim()).toContain('Hello');
      expect(result.data?.exitCode).toBe(0);
    });

    it('失敗したコマンドでエラーを返す', async () => {
      const command = isWindows ? 'cmd /c exit 1' : 'exit 1';

      const result = await toolExecutor.runCommand(command, 5);

      expect(result.success).toBe(false);
      expect(result.data?.exitCode).toBe(1);
      expect(result.error).toContain('Command failed');
    });

    it('ワークスペースディレクトリでコマンドを実行する', async () => {
      // テストファイルを作成
      await fs.writeFile(path.join(TEST_WORKSPACE_DIR, 'testfile.txt'), 'content', 'utf-8');

      const command = isWindows ? 'cmd /c dir' : 'ls';
      const result = await toolExecutor.runCommand(command);

      expect(result.success).toBe(true);
      expect(result.data?.stdout).toContain('testfile.txt');
    });

    it('インタラクティブコマンドを拒否する', async () => {
      const result = await toolExecutor.runCommand('vim');

      expect(result.success).toBe(false);
      expect(result.data?.rejected).toBe(true);
    });

    it('タイムアウトを指定できる', async () => {
      const command = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';

      const result = await toolExecutor.runCommand(command, 1);

      expect(result.success).toBe(false);
      expect(result.data?.timedOut).toBe(true);
    }, 15000);
  });

  // ===========================================================================
  // Git操作テスト（モック不要の基本テスト）
  // ===========================================================================

  describe('gitStatus', () => {
    it('Gitリポジトリでない場合はエラーを返す', async () => {
      const result = await toolExecutor.gitStatus();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('gitCommit', () => {
    it('Gitリポジトリでない場合はエラーを返す', async () => {
      const result = await toolExecutor.gitCommit('test commit');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

// =============================================================================
// applyEditsToContent ユーティリティ関数テスト
// =============================================================================

describe('applyEditsToContent', () => {
  it('replace操作を正しく適用する', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const edits: FileEdit[] = [{ type: 'replace', startLine: 2, endLine: 2, content: 'Modified' }];

    const result = applyEditsToContent(content, edits);

    expect(result.success).toBe(true);
    expect(result.data).toBe('Line 1\nModified\nLine 3');
  });

  it('insert操作を正しく適用する', () => {
    const content = 'Line 1\nLine 2';
    const edits: FileEdit[] = [{ type: 'insert', startLine: 2, content: 'Inserted' }];

    const result = applyEditsToContent(content, edits);

    expect(result.success).toBe(true);
    expect(result.data).toBe('Line 1\nInserted\nLine 2');
  });

  it('delete操作を正しく適用する', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const edits: FileEdit[] = [{ type: 'delete', startLine: 2, endLine: 2 }];

    const result = applyEditsToContent(content, edits);

    expect(result.success).toBe(true);
    expect(result.data).toBe('Line 1\nLine 3');
  });

  it('複数の編集を正しい順序で適用する', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4';
    const edits: FileEdit[] = [
      { type: 'replace', startLine: 1, endLine: 1, content: 'First' },
      { type: 'delete', startLine: 3, endLine: 3 },
    ];

    const result = applyEditsToContent(content, edits);

    expect(result.success).toBe(true);
    expect(result.data).toBe('First\nLine 2\nLine 4');
  });

  it('空のファイルに挿入できる', () => {
    const content = '';
    const edits: FileEdit[] = [{ type: 'insert', startLine: 1, content: 'New content' }];

    const result = applyEditsToContent(content, edits);

    expect(result.success).toBe(true);
    expect(result.data).toBe('New content\n');
  });

  it('複数行の内容を挿入できる', () => {
    const content = 'Line 1\nLine 3';
    const edits: FileEdit[] = [{ type: 'insert', startLine: 2, content: 'Line 2a\nLine 2b' }];

    const result = applyEditsToContent(content, edits);

    expect(result.success).toBe(true);
    expect(result.data).toBe('Line 1\nLine 2a\nLine 2b\nLine 3');
  });

  it('endLineがstartLineより小さい場合はエラー', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const edits: FileEdit[] = [{ type: 'replace', startLine: 3, endLine: 1, content: 'Invalid' }];

    const result = applyEditsToContent(content, edits);

    expect(result.success).toBe(false);
    expect(result.error).toContain('End line must be >= start line');
  });
});
