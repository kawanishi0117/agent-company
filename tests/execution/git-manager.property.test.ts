/**
 * Git Manager プロパティテスト
 *
 * Property 6: Git Naming Conventions
 * - 任意のチケットIDと説明に対して、ブランチ名は `agent/<ticket-id>-<description>` 形式
 * - 任意のチケットIDと説明に対して、コミットメッセージは `[<ticket-id>] <description>` 形式
 * - ブランチ名は小文字とハイフンのみを含む（チケットID部分を除く）
 *
 * Property 7: Git Operation Logging
 * - 任意のGit操作に対して、ログファイルに記録される
 * - ログにはタイムスタンプ、操作種別、成功/失敗が含まれる
 * - 失敗した操作もログに記録される
 *
 * Property 27: Git Credential Isolation
 * - ~/.ssh/ ディレクトリへのアクセスは常に禁止される
 * - 任意のパスに対して、isForbiddenPath() は一貫した結果を返す
 *
 * **Validates: Requirements 3.2, 3.4, 3.6, 3.8**
 *
 * @module tests/execution/git-manager.property.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { GitManager } from '../../tools/cli/lib/execution/git-manager';
import { ProcessMonitor } from '../../tools/cli/lib/execution/process-monitor';
import { isForbiddenPath } from '../../tools/cli/lib/execution/git-credentials';
import type { CommandResult } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_RUNS_DIR = 'runtime/runs/test-git-manager-property';

/**
 * テスト用の実行ID
 */
const TEST_RUN_ID = 'property-test-run';

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
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * チケットIDを生成するArbitrary
 * 形式: プロジェクトプレフィックス + ハイフン + 数字
 * 例: PROJ-123, T-1, TICKET-9999
 */
const ticketIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
      minLength: 1,
      maxLength: 10,
    }),
    fc.integer({ min: 1, max: 99999 })
  )
  .map(([prefix, num]) => `${prefix}-${num}`);

/**
 * 説明文を生成するArbitrary
 * 英数字、スペース、一般的な記号を含む
 */
const descriptionArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.:!?'.split('')
  ),
  { minLength: 0, maxLength: 100 }
);

/**
 * 日本語を含む説明文を生成するArbitrary
 */
const japaneseDescriptionArb: fc.Arbitrary<string> = fc.constantFrom(
  '新機能追加',
  'バグ修正',
  'リファクタリング',
  'テスト追加',
  'ドキュメント更新',
  '機能改善',
  'パフォーマンス最適化',
  'セキュリティ修正'
);

/**
 * 特殊文字を含む説明文を生成するArbitrary
 */
const specialCharDescriptionArb: fc.Arbitrary<string> = fc.constantFrom(
  'Fix bug: memory leak!',
  'Add feature (experimental)',
  'Update README.md',
  'Fix "quoted" string',
  "Fix 'single' quotes",
  'Add @decorator support',
  'Fix #123 issue',
  'Update $variable handling',
  'Fix 100% coverage',
  'Add & operator'
);

/**
 * 禁止されたパス（~/.ssh/）を生成するArbitrary
 */
const forbiddenPathArb: fc.Arbitrary<string> = fc.constantFrom(
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.ssh', 'id_rsa'),
  path.join(os.homedir(), '.ssh', 'id_ed25519'),
  path.join(os.homedir(), '.ssh', 'known_hosts'),
  path.join(os.homedir(), '.ssh', 'config'),
  path.join(os.homedir(), '.ssh', 'authorized_keys'),
  '~/.ssh',
  '~/.ssh/id_rsa',
  '$HOME/.ssh',
  '${HOME}/.ssh'
);

/**
 * 許可されたパスを生成するArbitrary
 */
const allowedPathArb: fc.Arbitrary<string> = fc.constantFrom(
  '/etc/agent-company/keys/deploy_key',
  '/var/lib/agent-company/keys/deploy_key',
  '/tmp/git-keys/deploy_key',
  '/workspace/keys/deploy_key',
  path.join(os.homedir(), 'keys', 'deploy_key'),
  path.join(os.homedir(), '.config', 'git', 'credentials'),
  '/home/user/project/.git/config'
);

/**
 * Git操作種別を生成するArbitrary（将来の拡張用）
 * @description 現在は未使用だが、将来のGit操作テスト拡張時に使用予定
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _gitOperationArb: fc.Arbitrary<string> = fc.constantFrom(
  'clone',
  'createBranch',
  'checkout',
  'stage',
  'commit',
  'push',
  'getStatus',
  'validateKnownHosts',
  'resolveConflict',
  'attemptAutoResolve'
);

// =============================================================================
// Property 6: Git Naming Conventions テスト
// =============================================================================

describe('Property 6: Git Naming Conventions', () => {
  /**
   * Property 6.1: ブランチ名の形式
   * 任意のチケットIDと説明に対して、ブランチ名は `agent/<ticket-id>-<description>` 形式
   *
   * **Validates: Requirement 3.4**
   * - THE Git_Manager SHALL create feature branch named `agent/<ticket-id>-<description>`
   */
  it('Property 6.1: ブランチ名は agent/<ticket-id>-<description> 形式である', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        const branchName = GitManager.generateBranchName(ticketId, description);

        // agent/ プレフィックスで始まること
        expect(branchName).toMatch(/^agent\//);

        // チケットIDが含まれること
        expect(branchName).toContain(ticketId);

        // 形式: agent/<ticket-id>-<description>
        expect(branchName).toMatch(new RegExp(`^agent/${ticketId}-`));
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.2: ブランチ名の説明部分は小文字とハイフンのみ
   * チケットID部分を除く説明部分は、小文字とハイフンと数字のみを含む
   *
   * **Validates: Requirement 3.4**
   */
  it('Property 6.2: ブランチ名の説明部分は小文字・ハイフン・数字のみ', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        const branchName = GitManager.generateBranchName(ticketId, description);

        // agent/<ticket-id>- の後の部分を取得
        const prefix = `agent/${ticketId}-`;
        const descriptionPart = branchName.substring(prefix.length);

        // 説明部分は小文字、ハイフン、数字のみを含む
        // 空の場合も許可
        expect(descriptionPart).toMatch(/^[a-z0-9-]*$/);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.3: ブランチ名に連続するハイフンがない
   * 生成されたブランチ名には連続するハイフンが含まれない
   *
   * **Validates: Requirement 3.4**
   */
  it('Property 6.3: ブランチ名に連続するハイフンがない', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        const branchName = GitManager.generateBranchName(ticketId, description);

        // 連続するハイフンがないこと
        expect(branchName).not.toMatch(/--+/);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.4: コミットメッセージの形式
   * 任意のチケットIDと説明に対して、コミットメッセージは `[<ticket-id>] <description>` 形式
   *
   * **Validates: Requirement 3.6**
   * - THE commit message SHALL follow format: `[<ticket-id>] <description>`
   */
  it('Property 6.4: コミットメッセージは [<ticket-id>] <description> 形式である', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        const message = GitManager.generateCommitMessage(ticketId, description);

        // [ticket-id] 形式で始まること
        expect(message).toMatch(/^\[.+\]/);

        // チケットIDが角括弧で囲まれていること
        expect(message).toContain(`[${ticketId}]`);

        // 形式: [<ticket-id>] <description>
        expect(message).toBe(`[${ticketId}] ${description}`);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.5: 日本語を含む説明の処理
   * 日本語を含む説明でもブランチ名が正しく生成される
   *
   * **Validates: Requirement 3.4**
   */
  it('Property 6.5: 日本語を含む説明でもブランチ名が生成される', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, japaneseDescriptionArb, async (ticketId, description) => {
        const branchName = GitManager.generateBranchName(ticketId, description);

        // agent/ プレフィックスで始まること
        expect(branchName).toMatch(/^agent\//);

        // チケットIDが含まれること
        expect(branchName).toContain(ticketId);

        // 説明部分は小文字、ハイフン、数字のみ（日本語は除去される）
        const prefix = `agent/${ticketId}-`;
        const descriptionPart = branchName.substring(prefix.length);
        expect(descriptionPart).toMatch(/^[a-z0-9-]*$/);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.6: 特殊文字を含む説明の処理
   * 特殊文字を含む説明でもブランチ名が正しく生成される
   *
   * **Validates: Requirement 3.4**
   */
  it('Property 6.6: 特殊文字を含む説明でもブランチ名が生成される', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, specialCharDescriptionArb, async (ticketId, description) => {
        const branchName = GitManager.generateBranchName(ticketId, description);

        // agent/ プレフィックスで始まること
        expect(branchName).toMatch(/^agent\//);

        // チケットIDが含まれること
        expect(branchName).toContain(ticketId);

        // 説明部分は小文字、ハイフン、数字のみ
        const prefix = `agent/${ticketId}-`;
        const descriptionPart = branchName.substring(prefix.length);
        expect(descriptionPart).toMatch(/^[a-z0-9-]*$/);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.7: ブランチ名生成の一貫性
   * 同じ入力に対して、常に同じブランチ名が生成される
   *
   * **Validates: Requirement 3.4**
   */
  it('Property 6.7: ブランチ名生成は一貫している', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        // 複数回生成
        const branchName1 = GitManager.generateBranchName(ticketId, description);
        const branchName2 = GitManager.generateBranchName(ticketId, description);
        const branchName3 = GitManager.generateBranchName(ticketId, description);

        // すべて同じ結果であること
        expect(branchName1).toBe(branchName2);
        expect(branchName2).toBe(branchName3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.8: コミットメッセージ生成の一貫性
   * 同じ入力に対して、常に同じコミットメッセージが生成される
   *
   * **Validates: Requirement 3.6**
   */
  it('Property 6.8: コミットメッセージ生成は一貫している', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        // 複数回生成
        const message1 = GitManager.generateCommitMessage(ticketId, description);
        const message2 = GitManager.generateCommitMessage(ticketId, description);
        const message3 = GitManager.generateCommitMessage(ticketId, description);

        // すべて同じ結果であること
        expect(message1).toBe(message2);
        expect(message2).toBe(message3);
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 7: Git Operation Logging テスト
// =============================================================================

describe('Property 7: Git Operation Logging', () => {
  let gitManager: GitManager;
  let mockProcessMonitor: ProcessMonitor;
  let tempDir: string;

  beforeEach(async () => {
    // 一時ディレクトリを作成
    tempDir = path.join(TEST_RUNS_DIR, `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // ProcessMonitorのモックを作成
    mockProcessMonitor = new ProcessMonitor(tempDir);
    vi.spyOn(mockProcessMonitor, 'execute');

    // GitManagerを作成
    gitManager = new GitManager(mockProcessMonitor, tempDir);
    gitManager.setRunId(TEST_RUN_ID);
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

  /**
   * Property 7.1: 成功した操作のログ記録
   * 任意のGit操作が成功した場合、ログファイルに記録される
   *
   * **Validates: Requirement 3.8**
   * - THE Git operations SHALL be logged to `runtime/runs/<run-id>/git.log`
   */
  it('Property 7.1: 成功した操作はログに記録される', async () => {
    vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

    // ブランチ作成操作を実行
    await gitManager.createBranch('test-branch');

    // ログファイルを確認
    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');

    // ログに操作種別が含まれること
    expect(logContent).toContain('[createBranch]');

    // ログに成功フラグが含まれること
    expect(logContent).toContain('[SUCCESS]');
  });

  /**
   * Property 7.2: 失敗した操作のログ記録
   * 任意のGit操作が失敗した場合も、ログファイルに記録される
   *
   * **Validates: Requirement 3.8**
   */
  it('Property 7.2: 失敗した操作もログに記録される', async () => {
    vi.mocked(mockProcessMonitor.execute).mockResolvedValue(failureResult('error message'));

    // ブランチ作成操作を実行（失敗する）
    await expect(gitManager.createBranch('test-branch')).rejects.toThrow();

    // ログファイルを確認
    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');

    // ログに操作種別が含まれること
    expect(logContent).toContain('[createBranch]');

    // ログに失敗フラグが含まれること
    expect(logContent).toContain('[FAILED:');
  });

  /**
   * Property 7.3: ログにタイムスタンプが含まれる
   * 任意のGit操作のログにはISO8601形式のタイムスタンプが含まれる
   *
   * **Validates: Requirement 3.8**
   */
  it('Property 7.3: ログにタイムスタンプが含まれる', async () => {
    vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

    await gitManager.createBranch('test-branch');

    // ログファイルを確認
    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');

    // ISO8601形式のタイムスタンプが含まれること
    expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  /**
   * Property 7.4: ログに実行時間が含まれる
   * 任意のGit操作のログには実行時間（ミリ秒）が含まれる
   *
   * **Validates: Requirement 3.8**
   */
  it('Property 7.4: ログに実行時間が含まれる', async () => {
    vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

    await gitManager.createBranch('test-branch');

    // ログファイルを確認
    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');

    // 実行時間（ミリ秒）が含まれること
    expect(logContent).toMatch(/\[\d+ms\]/);
  });

  /**
   * Property 7.5: 複数操作の順序保持
   * 複数のGit操作を実行した場合、ログは実行順序で記録される
   *
   * **Validates: Requirement 3.8**
   */
  it('Property 7.5: 複数操作は実行順序でログに記録される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult()) // createBranch
      .mockResolvedValueOnce(successResult()) // stage
      .mockResolvedValueOnce(successResult()) // commit
      .mockResolvedValueOnce(successResult('abc123')); // rev-parse HEAD

    await gitManager.createBranch('feature-branch');
    await gitManager.stage(['file.ts']);
    await gitManager.commit('[T-1] Add feature');

    // ログファイルを確認
    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');
    const logLines = logContent.trim().split('\n');

    // 3つの操作がログに記録されていること
    expect(logLines.length).toBe(3);

    // 順序が正しいこと
    expect(logLines[0]).toContain('[createBranch]');
    expect(logLines[1]).toContain('[stage]');
    expect(logLines[2]).toContain('[commit]');
  });

  /**
   * Property 7.6: clone操作のログ記録
   * clone操作はURLとターゲットディレクトリを含めてログに記録される
   *
   * **Validates: Requirement 3.8**
   */
  it('Property 7.6: clone操作はURLとターゲットディレクトリを含めてログに記録される', async () => {
    vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

    await gitManager.clone('https://github.com/user/repo.git', '/workspace/repo');

    // ログファイルを確認
    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');

    // 操作種別が含まれること
    expect(logContent).toContain('[clone]');

    // URLが含まれること
    expect(logContent).toContain('url=https://github.com/user/repo.git');

    // ターゲットディレクトリが含まれること
    expect(logContent).toContain('targetDir=/workspace/repo');
  });

  /**
   * Property 7.7: push操作のログ記録
   * push操作はブランチ名を含めてログに記録される
   *
   * **Validates: Requirement 3.8**
   */
  it('Property 7.7: push操作はブランチ名を含めてログに記録される', async () => {
    vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

    await gitManager.push('feature-branch');

    // ログファイルを確認
    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');

    // 操作種別が含まれること
    expect(logContent).toContain('[push]');

    // ブランチ名が含まれること
    expect(logContent).toContain('branchName=feature-branch');
  });

  /**
   * Property 7.8: runIdが設定されていない場合はログを記録しない
   * runIdが設定されていない場合、ログファイルは作成されない
   *
   * **Validates: Requirement 3.8**
   */
  it('Property 7.8: runIdが設定されていない場合はログを記録しない', async () => {
    // runIdを設定しないGitManagerを作成
    const gitManagerNoRunId = new GitManager(mockProcessMonitor, tempDir);
    vi.mocked(mockProcessMonitor.execute).mockResolvedValue(successResult());

    await gitManagerNoRunId.createBranch('test-branch');

    // ログディレクトリが作成されていないことを確認
    const logDir = path.join(tempDir, 'undefined');
    await expect(fs.access(logDir)).rejects.toThrow();
  });
});

// =============================================================================
// Property 27: Git Credential Isolation テスト
// =============================================================================

describe('Property 27: Git Credential Isolation', () => {
  /**
   * Property 27.1: ~/.ssh/ ディレクトリへのアクセス禁止
   * ~/.ssh/ ディレクトリへのアクセスは常に禁止される
   *
   * **Validates: Requirement 3.2**
   * - THE Git_Manager SHALL NOT directly mount ~/.ssh/ into Worker_Container
   */
  it('Property 27.1: ~/.ssh/ ディレクトリへのアクセスは禁止される', async () => {
    await fc.assert(
      fc.asyncProperty(forbiddenPathArb, async (forbiddenPath) => {
        const isForbidden = isForbiddenPath(forbiddenPath);

        // 禁止されたパスとして検出されること
        expect(isForbidden).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 27.2: 許可されたパスへのアクセス許可
   * ~/.ssh/ 以外のパスへのアクセスは許可される
   *
   * **Validates: Requirement 3.2**
   */
  it('Property 27.2: 許可されたパスへのアクセスは許可される', async () => {
    await fc.assert(
      fc.asyncProperty(allowedPathArb, async (allowedPath) => {
        const isForbidden = isForbiddenPath(allowedPath);

        // 許可されたパスとして検出されること
        expect(isForbidden).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 27.3: isForbiddenPath() の一貫性
   * 任意のパスに対して、isForbiddenPath() は一貫した結果を返す
   *
   * **Validates: Requirement 3.2**
   */
  it('Property 27.3: isForbiddenPath() は一貫した結果を返す', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(forbiddenPathArb, allowedPathArb), async (testPath) => {
        // 複数回検出を実行
        const result1 = isForbiddenPath(testPath);
        const result2 = isForbiddenPath(testPath);
        const result3 = isForbiddenPath(testPath);

        // すべて同じ結果であること
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 27.4: ~/.ssh/ のサブディレクトリも禁止
   * ~/.ssh/ のサブディレクトリへのアクセスも禁止される
   *
   * **Validates: Requirement 3.2**
   */
  it('Property 27.4: ~/.ssh/ のサブディレクトリも禁止される', async () => {
    const sshSubdirs = [
      path.join(os.homedir(), '.ssh', 'keys'),
      path.join(os.homedir(), '.ssh', 'backup'),
      path.join(os.homedir(), '.ssh', 'old'),
      path.join(os.homedir(), '.ssh', 'test'),
    ];

    for (const subdir of sshSubdirs) {
      const isForbidden = isForbiddenPath(subdir);
      expect(isForbidden).toBe(true);
    }
  });

  /**
   * Property 27.5: Deploy key認証設定の検証
   * ~/.ssh/ 内のDeploy keyは拒否される
   *
   * **Validates: Requirement 3.2**
   */
  it('Property 27.5: ~/.ssh/ 内のDeploy keyは拒否される', async () => {
    const forbiddenKeyPaths = [
      path.join(os.homedir(), '.ssh', 'id_rsa'),
      path.join(os.homedir(), '.ssh', 'id_ed25519'),
      path.join(os.homedir(), '.ssh', 'deploy_key'),
      path.join(os.homedir(), '.ssh', 'github_key'),
    ];

    for (const keyPath of forbiddenKeyPaths) {
      const isForbidden = isForbiddenPath(keyPath);
      expect(isForbidden).toBe(true);
    }
  });

  /**
   * Property 27.6: 推奨ディレクトリ内のDeploy keyは許可
   * 推奨ディレクトリ内のDeploy keyは許可される
   *
   * **Validates: Requirement 3.2**
   */
  it('Property 27.6: 推奨ディレクトリ内のDeploy keyは許可される', async () => {
    const allowedKeyPaths = [
      '/etc/agent-company/keys/deploy_key',
      '/var/lib/agent-company/keys/deploy_key',
      '/tmp/git-keys/deploy_key',
    ];

    for (const keyPath of allowedKeyPaths) {
      const isForbidden = isForbiddenPath(keyPath);
      expect(isForbidden).toBe(false);
    }
  });

  /**
   * Property 27.7: チルダ展開前のパスも禁止
   * ~/.ssh/ のチルダ展開前の表記も禁止される
   *
   * **Validates: Requirement 3.2**
   */
  it('Property 27.7: チルダ展開前のパスも禁止される', async () => {
    const tildeNotations = ['~/.ssh', '~/.ssh/id_rsa', '~/.ssh/config'];

    for (const notation of tildeNotations) {
      const isForbidden = isForbiddenPath(notation);
      expect(isForbidden).toBe(true);
    }
  });

  /**
   * Property 27.8: 環境変数展開前のパスも禁止
   * $HOME/.ssh/ の環境変数展開前の表記も禁止される
   *
   * **Validates: Requirement 3.2**
   */
  it('Property 27.8: 環境変数展開前のパスも禁止される', async () => {
    const envNotations = ['$HOME/.ssh', '${HOME}/.ssh'];

    for (const notation of envNotations) {
      const isForbidden = isForbiddenPath(notation);
      expect(isForbidden).toBe(true);
    }
  });
});

// =============================================================================
// Property 28: Merge Flow Integrity テスト
// =============================================================================

describe('Property 28: Merge Flow Integrity', () => {
  let gitManager: GitManager;
  let mockProcessMonitor: ProcessMonitor;
  let tempDir: string;

  beforeEach(async () => {
    // 一時ディレクトリを作成
    tempDir = path.join(TEST_RUNS_DIR, `test-merge-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // ProcessMonitorのモックを作成
    mockProcessMonitor = new ProcessMonitor(tempDir);
    vi.spyOn(mockProcessMonitor, 'execute');

    // GitManagerを作成
    gitManager = new GitManager(mockProcessMonitor, tempDir);
    gitManager.setRunId(TEST_RUN_ID);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
    vi.restoreAllMocks();
  });

  /**
   * Property 28.1: マージ成功時の結果
   * マージが成功した場合、success: true が返される
   *
   * **Validates: Requirement 4.4**
   */
  it('Property 28.1: マージ成功時は success: true が返される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult()) // checkout
      .mockResolvedValueOnce(successResult()); // merge

    const result = await gitManager.mergeToAgentBranch('task-branch', 'agent-branch');

    expect(result.success).toBe(true);
    expect(result.conflictReport).toBeUndefined();
  });

  /**
   * Property 28.2: コンフリクト発生時の自動解決試行
   * コンフリクトが発生した場合、自動解決が試行される
   *
   * **Validates: Requirement 4.5**
   */
  it('Property 28.2: コンフリクト発生時は自動解決が試行される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult()) // checkout
      .mockResolvedValueOnce(failureResult('CONFLICT')) // merge fails
      .mockResolvedValueOnce(successResult('main')) // branch --show-current
      .mockResolvedValueOnce(successResult('UU file.ts')) // status --porcelain (conflict)
      .mockResolvedValueOnce(successResult('main')) // branch --show-current (for getConflicts)
      .mockResolvedValueOnce(successResult('UU file.ts')) // status --porcelain (for getConflicts)
      .mockResolvedValueOnce(successResult('base content')) // git show :1:file
      .mockResolvedValueOnce(successResult('ours content')) // git show :2:file
      .mockResolvedValueOnce(successResult('ours content')) // git show :3:file (same as ours = auto-resolvable)
      .mockResolvedValueOnce(successResult()) // stage
      .mockResolvedValueOnce(successResult()) // commit
      .mockResolvedValueOnce(successResult('abc123')); // rev-parse HEAD

    const result = await gitManager.mergeToAgentBranch('task-branch', 'agent-branch');

    expect(result.success).toBe(true);
    expect(result.autoResolved).toBe(true);
  });

  /**
   * Property 28.3: 自動解決失敗時のコンフリクトレポート
   * 自動解決が失敗した場合、コンフリクトレポートが返される
   *
   * **Validates: Requirement 4.5, 4.6**
   */
  it('Property 28.3: 自動解決失敗時はコンフリクトレポートが返される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult()) // checkout
      .mockResolvedValueOnce(failureResult('CONFLICT')) // merge fails
      .mockResolvedValueOnce(successResult('main')) // branch --show-current
      .mockResolvedValueOnce(successResult('UU file.ts')) // status --porcelain (conflict)
      .mockResolvedValueOnce(successResult('main')) // branch --show-current (for getConflicts)
      .mockResolvedValueOnce(successResult('UU file.ts')) // status --porcelain (for getConflicts)
      .mockResolvedValueOnce(successResult('base content')) // git show :1:file
      .mockResolvedValueOnce(successResult('ours content')) // git show :2:file
      .mockResolvedValueOnce(successResult('theirs content')) // git show :3:file (different = not auto-resolvable)
      .mockResolvedValueOnce(successResult('main')) // branch --show-current (for generateConflictReport)
      .mockResolvedValueOnce(successResult('UU file.ts')) // status --porcelain (for generateConflictReport)
      .mockResolvedValueOnce(successResult('base content')) // git show :1:file
      .mockResolvedValueOnce(successResult('ours content')) // git show :2:file
      .mockResolvedValueOnce(successResult('theirs content')); // git show :3:file

    const result = await gitManager.mergeToAgentBranch('task-branch', 'agent-branch');

    expect(result.success).toBe(false);
    expect(result.conflictReport).toBeDefined();
    expect(result.conflictReport!.totalConflicts).toBeGreaterThan(0);
  });
});

// =============================================================================
// Property 29: Conflict Escalation テスト
// =============================================================================

describe('Property 29: Conflict Escalation', () => {
  /**
   * Property 29.1: エスカレーションメッセージの形式
   * エスカレーションメッセージには必要な情報が含まれる
   *
   * **Validates: Requirement 4.6**
   */
  it('Property 29.1: エスカレーションメッセージには必要な情報が含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, async (ticketId) => {
        const gitManager = new GitManager();
        const conflictReport: ConflictReport = {
          timestamp: new Date().toISOString(),
          branch: 'agent/test-branch',
          totalConflicts: 2,
          files: [
            {
              path: 'file1.ts',
              hasBase: true,
              hasOurs: true,
              hasTheirs: true,
              autoResolvable: false,
            },
            {
              path: 'file2.ts',
              hasBase: true,
              hasOurs: true,
              hasTheirs: true,
              autoResolvable: false,
            },
          ],
          summary: 'テストサマリー',
        };

        const escalation = gitManager.escalateConflict(conflictReport, ticketId);

        // 必要なフィールドが含まれること
        expect(escalation.type).toBe('conflict_escalation');
        expect(escalation.ticketId).toBe(ticketId);
        expect(escalation.branch).toBe('agent/test-branch');
        expect(escalation.totalConflicts).toBe(2);
        expect(escalation.files).toHaveLength(2);
        expect(escalation.summary).toBe('テストサマリー');
        expect(escalation.timestamp).toBeDefined();
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 29.2: エスカレーションメッセージのタイムスタンプ
   * エスカレーションメッセージには現在時刻のタイムスタンプが含まれる
   *
   * **Validates: Requirement 4.6**
   */
  it('Property 29.2: エスカレーションメッセージには現在時刻のタイムスタンプが含まれる', () => {
    const gitManager = new GitManager();
    const conflictReport: ConflictReport = {
      timestamp: '2024-01-01T00:00:00.000Z', // 古いタイムスタンプ
      branch: 'agent/test-branch',
      totalConflicts: 1,
      files: [],
      summary: 'テスト',
    };

    const before = new Date();
    const escalation = gitManager.escalateConflict(conflictReport, 'T-1');
    const after = new Date();

    // エスカレーションのタイムスタンプは現在時刻
    const escalationTime = new Date(escalation.timestamp);
    expect(escalationTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(escalationTime.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  /**
   * Property 29.3: エスカレーションメッセージのファイル情報
   * エスカレーションメッセージにはコンフリクトファイルの情報が含まれる
   *
   * **Validates: Requirement 4.6**
   */
  it('Property 29.3: エスカレーションメッセージにはファイル情報が含まれる', async () => {
    const fileCountArb = fc.integer({ min: 0, max: 10 });

    await fc.assert(
      fc.asyncProperty(fileCountArb, async (fileCount) => {
        const gitManager = new GitManager();
        const files: ConflictFileInfo[] = Array.from({ length: fileCount }, (_, i) => ({
          path: `file${i}.ts`,
          hasBase: true,
          hasOurs: true,
          hasTheirs: true,
          autoResolvable: false,
        }));

        const conflictReport: ConflictReport = {
          timestamp: new Date().toISOString(),
          branch: 'agent/test-branch',
          totalConflicts: fileCount,
          files,
          summary: `${fileCount}件のコンフリクト`,
        };

        const escalation = gitManager.escalateConflict(conflictReport, 'T-1');

        // ファイル数が一致すること
        expect(escalation.files).toHaveLength(fileCount);
        expect(escalation.totalConflicts).toBe(fileCount);
      }),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// Property 30: Task Branch Creation テスト
// =============================================================================

describe('Property 30: Task Branch Creation', () => {
  let gitManager: GitManager;
  let mockProcessMonitor: ProcessMonitor;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(TEST_RUNS_DIR, `test-task-branch-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    mockProcessMonitor = new ProcessMonitor(tempDir);
    vi.spyOn(mockProcessMonitor, 'execute');

    gitManager = new GitManager(mockProcessMonitor, tempDir);
    gitManager.setRunId(TEST_RUN_ID);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
    vi.restoreAllMocks();
  });

  /**
   * Property 30.1: タスクブランチ名の形式
   * タスクブランチ名は agent/<ticket-id>-<description> 形式
   *
   * **Validates: Requirement 4.1**
   */
  it('Property 30.1: タスクブランチ名は正しい形式で生成される', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        vi.mocked(mockProcessMonitor.execute)
          .mockResolvedValueOnce(successResult()) // checkout
          .mockResolvedValueOnce(successResult()) // pull
          .mockResolvedValueOnce(successResult()); // checkout -b

        const branchName = await gitManager.createTaskBranch(ticketId, description, 'agent/main');

        // agent/ プレフィックスで始まること
        expect(branchName).toMatch(/^agent\//);

        // チケットIDが含まれること
        expect(branchName).toContain(ticketId);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 30.2: タスクブランチ作成のログ記録
   * タスクブランチ作成はログに記録される
   *
   * **Validates: Requirement 4.1**
   */
  it('Property 30.2: タスクブランチ作成はログに記録される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult()) // checkout
      .mockResolvedValueOnce(successResult()) // pull
      .mockResolvedValueOnce(successResult()); // checkout -b

    await gitManager.createTaskBranch('T-1', 'test-feature', 'agent/main');

    const logPath = path.join(tempDir, TEST_RUN_ID, 'git.log');
    const logContent = await fs.readFile(logPath, 'utf-8');

    expect(logContent).toContain('[createTaskBranch]');
    expect(logContent).toContain('ticketId=T-1');
    expect(logContent).toContain('[SUCCESS]');
  });

  /**
   * Property 30.3: commitWithTicketIdの形式
   * commitWithTicketIdは正しい形式のコミットメッセージを生成する
   *
   * **Validates: Requirement 4.2**
   */
  it('Property 30.3: commitWithTicketIdは正しい形式のコミットメッセージを生成する', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, descriptionArb, async (ticketId, description) => {
        // 各イテレーションでモックをリセット
        vi.mocked(mockProcessMonitor.execute).mockReset();
        vi.mocked(mockProcessMonitor.execute)
          .mockResolvedValueOnce(successResult()) // commit
          .mockResolvedValueOnce(successResult('abc123')); // rev-parse HEAD

        const hash = await gitManager.commitWithTicketId(ticketId, description);

        // コミットハッシュが返されること
        expect(hash).toBe('abc123');

        // コミットコマンドが正しい形式で呼ばれたこと
        const commitCall = vi.mocked(mockProcessMonitor.execute).mock.calls[0];
        expect(commitCall[0]).toContain(`[${ticketId}]`);
        expect(commitCall[0]).toContain(description);
      }),
      { numRuns: 20 }
    );
  });
});

// =============================================================================
// ConflictReport型のインポート用
// =============================================================================

import type { ConflictReport, ConflictFileInfo } from '../../tools/cli/lib/execution/git-manager';

// =============================================================================
// エッジケーステスト
// =============================================================================

describe('Git Manager Edge Cases', () => {
  /**
   * 空のチケットIDの処理
   */
  it('空のチケットIDでもブランチ名が生成される', () => {
    const branchName = GitManager.generateBranchName('', 'description');
    expect(branchName).toMatch(/^agent\/-/);
  });

  /**
   * 空の説明の処理
   */
  it('空の説明でもブランチ名が生成される', () => {
    const branchName = GitManager.generateBranchName('T-1', '');
    expect(branchName).toBe('agent/T-1-');
  });

  /**
   * 両方空の処理
   * 注意: 空のチケットIDと空の説明の場合、末尾のハイフンは除去される
   */
  it('両方空でもブランチ名が生成される', () => {
    const branchName = GitManager.generateBranchName('', '');
    // 実装では末尾のハイフンが除去されるため 'agent/-' となる
    expect(branchName).toBe('agent/-');
  });

  /**
   * 非常に長い説明の処理
   */
  it('非常に長い説明は切り詰められる', () => {
    const longDescription = 'a'.repeat(200);
    const branchName = GitManager.generateBranchName('T-1', longDescription);

    // ブランチ名の長さが制限されていること
    // agent/T-1- (10文字) + 説明部分 (最大50文字) = 最大60文字
    expect(branchName.length).toBeLessThanOrEqual(60);
  });

  /**
   * 数字のみの説明の処理
   */
  it('数字のみの説明でもブランチ名が生成される', () => {
    const branchName = GitManager.generateBranchName('T-1', '12345');
    expect(branchName).toBe('agent/T-1-12345');
  });

  /**
   * 大文字のみの説明の処理
   */
  it('大文字のみの説明は小文字に変換される', () => {
    const branchName = GitManager.generateBranchName('T-1', 'UPPERCASE');
    expect(branchName).toBe('agent/T-1-uppercase');
  });

  /**
   * 空のパスの処理
   */
  it('空のパスは禁止されない', () => {
    const isForbidden = isForbiddenPath('');
    expect(isForbidden).toBe(false);
  });

  /**
   * 相対パスの処理
   */
  it('相対パスは禁止されない', () => {
    const relativePaths = ['.ssh', './ssh', '../.ssh', 'keys/deploy_key'];

    for (const relativePath of relativePaths) {
      const isForbidden = isForbiddenPath(relativePath);
      expect(isForbidden).toBe(false);
    }
  });

  /**
   * 類似パスの処理
   */
  it('.ssh に似たパスは禁止されない', () => {
    const similarPaths = [
      path.join(os.homedir(), '.ssh2'),
      path.join(os.homedir(), '.sshconfig'),
      path.join(os.homedir(), 'ssh'),
      path.join(os.homedir(), '.ssh_backup'),
    ];

    for (const similarPath of similarPaths) {
      const isForbidden = isForbiddenPath(similarPath);
      expect(isForbidden).toBe(false);
    }
  });
});
