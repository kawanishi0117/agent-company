/**
 * Process Monitor プロパティテスト
 *
 * Property 12: Command Timeout Enforcement
 * - 任意のタイムアウト値に対して、タイムアウトを超過するコマンドは必ず終了される
 * - タイムアウト時は `timedOut: true` が返される
 * - 終了コードは124（タイムアウトの慣例）
 *
 * Property 13: Interactive Command Rejection
 * - 任意のインタラクティブコマンドは必ず拒否される
 * - 拒否時は `rejected: true` と `rejectionReason: 'interactive_command'` が返される
 * - 実際にコマンドは実行されない
 *
 * Property 14: Server Command Background Execution
 * - 任意のサーバーコマンドは自動的にバックグラウンドで実行される
 * - `backgroundProcessId` が返される
 * - プロセスは `kill()` で終了可能
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 *
 * @module tests/execution/process-monitor.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ProcessMonitor } from '../../tools/cli/lib/execution/process-monitor';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_RUNS_DIR = 'runtime/runs/test-process-monitor-property';

/**
 * テスト用の実行ID
 */
const TEST_RUN_ID = 'property-test-run';

/**
 * Windows環境かどうか
 */
const isWindows = os.platform() === 'win32';

// =============================================================================
// インタラクティブコマンドのリスト
// =============================================================================

/**
 * インタラクティブコマンドのリスト
 * @description テスト用に使用するインタラクティブコマンド
 */
const INTERACTIVE_COMMANDS = [
  'vim',
  'vi',
  'nvim',
  'nano',
  'emacs',
  'less',
  'more',
  'top',
  'htop',
  'man',
  'ssh',
  'telnet',
  'ftp',
  'mysql',
  'psql',
  'mongo',
  'redis-cli',
  'irb',
  'pry',
];

/**
 * インタラクティブコマンドの引数パターン
 * @description コマンドに付加する引数のパターン
 */
const INTERACTIVE_COMMAND_ARGS = [
  '',
  ' file.txt',
  ' /path/to/file',
  ' -v',
  ' --help',
  ' user@host',
  ' -u root',
];

// =============================================================================
// サーバーコマンドのリスト
// =============================================================================

/**
 * サーバーコマンドのリスト
 * @description テスト用に使用するサーバーコマンド
 */
const SERVER_COMMANDS = [
  'npm run dev',
  'npm run start',
  'npm run serve',
  'yarn dev',
  'yarn start',
  'yarn serve',
  'pnpm dev',
  'pnpm start',
  'npx vite',
  'npx next',
  'npx nuxt',
  'npx remix',
  'python manage.py runserver',
  'flask run',
  'uvicorn main:app',
  'gunicorn app:app',
  'rails server',
  'rails s',
  'docker compose up',
  'docker-compose up',
];

// =============================================================================
// 非インタラクティブ・非サーバーコマンドのリスト
// =============================================================================

/**
 * 通常のコマンドのリスト
 * @description インタラクティブでもサーバーでもない通常のコマンド
 */
const NORMAL_COMMANDS = [
  'echo hello',
  'ls -la',
  'cat file.txt',
  'npm install',
  'npm run build',
  'npm run test',
  'npm run lint',
  'yarn install',
  'yarn build',
  'git status',
  'git log',
  'pwd',
  'whoami',
  'date',
  'mkdir test',
  'rm -rf temp',
  'cp file1 file2',
  'mv file1 file2',
  'grep pattern file',
  'find . -name "*.ts"',
  'python script.py',
  'node app.js',
  'python -c "print(1)"',
  'node -e "console.log(1)"',
];

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * タイムアウト値を生成するArbitrary（1-10秒）
 */
const timeoutArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10 });

/**
 * インタラクティブコマンドを生成するArbitrary
 */
const interactiveCommandArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...INTERACTIVE_COMMANDS),
    fc.constantFrom(...INTERACTIVE_COMMAND_ARGS)
  )
  .map(([cmd, args]) => cmd + args);

/**
 * サーバーコマンドを生成するArbitrary
 */
const serverCommandArb: fc.Arbitrary<string> = fc.constantFrom(...SERVER_COMMANDS);

/**
 * 通常のコマンドを生成するArbitrary
 */
const normalCommandArb: fc.Arbitrary<string> = fc.constantFrom(...NORMAL_COMMANDS);

/**
 * python/node（引数なし）を生成するArbitrary
 * @description REPLモードとして検出されるべきコマンド
 */
const replCommandArb: fc.Arbitrary<string> = fc.constantFrom('python', 'node');

/**
 * python/node（ファイル指定）を生成するArbitrary
 * @description REPLモードではないコマンド
 */
const scriptCommandArb: fc.Arbitrary<string> = fc.constantFrom(
  'python script.py',
  'python main.py',
  'python -c "print(1)"',
  'node app.js',
  'node server.js',
  'node -e "console.log(1)"'
);

// =============================================================================
// テストセットアップ
// =============================================================================

describe('Property 12: Command Timeout Enforcement', () => {
  let processMonitor: ProcessMonitor;

  beforeEach(async () => {
    processMonitor = new ProcessMonitor(TEST_RUNS_DIR);
    processMonitor.setRunId(TEST_RUN_ID);
    await fs.mkdir(`${TEST_RUNS_DIR}/${TEST_RUN_ID}`, { recursive: true });
  });

  afterEach(async () => {
    await processMonitor.killAll();
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * Property 12.1: タイムアウト超過時の終了
   * タイムアウトを超過するコマンドは必ず終了される
   *
   * **Validates: Requirement 6.1, 6.2**
   * - THE Process_Monitor SHALL enforce configurable timeout
   * - WHEN command exceeds timeout, THE Process_Monitor SHALL terminate
   *
   * 注意: このテストは既存のユニットテストと同じアプローチを使用します。
   */
  it('Property 12.1: タイムアウトを超過するコマンドは終了される', async () => {
    const timeout = 1; // 1秒タイムアウト

    // タイムアウトより長く実行されるコマンド
    // 既存のユニットテストと同じコマンドを使用
    const command = isWindows
      ? `ping -n 10 127.0.0.1`
      : `sleep 10`;

    const result = await processMonitor.execute(command, { timeout });

    // タイムアウトフラグがtrueであること
    expect(result.timedOut).toBe(true);

    // 終了コードが124（タイムアウトの慣例）であること
    expect(result.exitCode).toBe(124);
  }, 15000); // 15秒のタイムアウト

  /**
   * Property 12.1b: 異なるタイムアウト値でも正しく動作する
   * 任意のタイムアウト値に対して、タイムアウト機能が正しく設定される
   *
   * **Validates: Requirement 6.1**
   * - THE Process_Monitor SHALL enforce configurable timeout
   *
   * 注意: 実際のタイムアウト動作ではなく、タイムアウト設定の受け入れをテスト
   */
  it('Property 12.1b: 任意のタイムアウト値が設定可能である', async () => {
    await fc.assert(
      fc.asyncProperty(timeoutArb, async (timeout) => {
        // 即座に完了するコマンドでタイムアウト設定が受け入れられることを確認
        const command = isWindows ? 'cmd /c echo test' : 'echo test';

        const result = await processMonitor.execute(command, { timeout });

        // タイムアウトせずに正常終了すること
        expect(result.timedOut).toBe(false);
        expect(result.exitCode).toBe(0);
      }),
      { numRuns: 100 }
    );
  }, 60000); // 60秒のタイムアウト（100回のプロパティテスト用）

  /**
   * Property 12.2: タイムアウト内完了時の正常終了
   * タイムアウト内に完了するコマンドは正常に終了する
   *
   * **Validates: Requirement 6.1**
   */
  it('Property 12.2: タイムアウト内に完了するコマンドは正常終了する', async () => {
    await fc.assert(
      fc.asyncProperty(timeoutArb, async (timeout) => {
        // 即座に完了するコマンド
        const command = isWindows ? 'cmd /c echo quick' : 'echo quick';

        const result = await processMonitor.execute(command, { timeout });

        // タイムアウトフラグがfalseであること
        expect(result.timedOut).toBe(false);

        // 正常終了（終了コード0）であること
        expect(result.exitCode).toBe(0);

        // 出力が含まれていること
        expect(result.stdout).toContain('quick');
      }),
      { numRuns: 100 }
    );
  }, 60000); // 60秒のタイムアウト（100回のプロパティテスト用）

  /**
   * Property 12.3: タイムアウト時の出力収集
   * タイムアウト時も、それまでの出力は収集される
   *
   * **Validates: Requirement 6.2**
   */
  it('Property 12.3: タイムアウト時も出力は収集される', async () => {
    // 出力を生成してからスリープするコマンド
    const command = isWindows
      ? 'cmd /c echo output_before_timeout && ping -n 30 127.0.0.1'
      : 'echo output_before_timeout && sleep 30';

    const result = await processMonitor.execute(command, { timeout: 2 });

    // タイムアウトしていること
    expect(result.timedOut).toBe(true);

    // タイムアウト前の出力が収集されていること
    expect(result.stdout).toContain('output_before_timeout');
  }, 30000);
});

describe('Property 13: Interactive Command Rejection', () => {
  let processMonitor: ProcessMonitor;

  beforeEach(async () => {
    processMonitor = new ProcessMonitor(TEST_RUNS_DIR);
    processMonitor.setRunId(TEST_RUN_ID);
    await fs.mkdir(`${TEST_RUNS_DIR}/${TEST_RUN_ID}`, { recursive: true });
  });

  afterEach(async () => {
    await processMonitor.killAll();
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * Property 13.1: インタラクティブコマンドの拒否
   * 任意のインタラクティブコマンドは必ず拒否される
   *
   * **Validates: Requirement 6.3**
   * - THE Process_Monitor SHALL detect and reject interactive commands (vim, nano, less, etc.)
   */
  it('Property 13.1: 任意のインタラクティブコマンドは拒否される', async () => {
    await fc.assert(
      fc.asyncProperty(interactiveCommandArb, async (command) => {
        const result = await processMonitor.execute(command);

        // 拒否フラグがtrueであること
        expect(result.rejected).toBe(true);

        // 拒否理由が'interactive_command'であること
        expect(result.rejectionReason).toBe('interactive_command');

        // 終了コードが1であること
        expect(result.exitCode).toBe(1);

        // タイムアウトではないこと
        expect(result.timedOut).toBe(false);

        // エラーメッセージが含まれていること
        expect(result.stderr).toContain('Interactive command rejected');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: python/node（引数なし）の拒否
   * python/nodeを引数なしで実行するとREPLモードとして拒否される
   *
   * **Validates: Requirement 6.3**
   */
  it('Property 13.2: python/node（引数なし）はREPLとして拒否される', async () => {
    await fc.assert(
      fc.asyncProperty(replCommandArb, async (command) => {
        const result = await processMonitor.execute(command);

        // 拒否フラグがtrueであること
        expect(result.rejected).toBe(true);

        // 拒否理由が'interactive_command'であること
        expect(result.rejectionReason).toBe('interactive_command');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.3: python/node（ファイル指定）は拒否されない
   * python/nodeにファイルを指定した場合は拒否されない
   *
   * **Validates: Requirement 6.3**
   */
  it('Property 13.3: python/node（ファイル指定）は拒否されない', async () => {
    await fc.assert(
      fc.asyncProperty(scriptCommandArb, async (command) => {
        // isInteractiveCommandの判定のみテスト（実際の実行はファイルがないためエラーになる）
        const isInteractive = processMonitor.isInteractiveCommand(command);

        // インタラクティブではないこと
        expect(isInteractive).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.4: 通常のコマンドは拒否されない
   * インタラクティブでないコマンドは拒否されない
   *
   * **Validates: Requirement 6.3**
   */
  it('Property 13.4: 通常のコマンドは拒否されない', async () => {
    await fc.assert(
      fc.asyncProperty(normalCommandArb, async (command) => {
        // isInteractiveCommandの判定のみテスト
        const isInteractive = processMonitor.isInteractiveCommand(command);

        // インタラクティブではないこと
        expect(isInteractive).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.5: インタラクティブコマンド検出の一貫性
   * 同じコマンドに対して、検出結果は常に同じ
   *
   * **Validates: Requirement 6.3**
   */
  it('Property 13.5: インタラクティブコマンド検出は一貫している', async () => {
    await fc.assert(
      fc.asyncProperty(interactiveCommandArb, async (command) => {
        // 複数回検出を実行
        const result1 = processMonitor.isInteractiveCommand(command);
        const result2 = processMonitor.isInteractiveCommand(command);
        const result3 = processMonitor.isInteractiveCommand(command);

        // すべて同じ結果であること
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
        expect(result1).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 14: Server Command Background Execution', () => {
  let processMonitor: ProcessMonitor;

  beforeEach(async () => {
    processMonitor = new ProcessMonitor(TEST_RUNS_DIR);
    processMonitor.setRunId(TEST_RUN_ID);
    await fs.mkdir(`${TEST_RUNS_DIR}/${TEST_RUN_ID}`, { recursive: true });
  });

  afterEach(async () => {
    await processMonitor.killAll();
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * Property 14.1: サーバーコマンドの検出
   * 任意のサーバーコマンドは正しく検出される
   *
   * **Validates: Requirement 6.4**
   * - THE Process_Monitor SHALL detect server commands (npm run dev, etc.)
   */
  it('Property 14.1: 任意のサーバーコマンドは正しく検出される', async () => {
    await fc.assert(
      fc.asyncProperty(serverCommandArb, async (command) => {
        const isServer = processMonitor.isServerCommand(command);

        // サーバーコマンドとして検出されること
        expect(isServer).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.2: サーバーコマンドのバックグラウンド実行
   * サーバーコマンドを実行するとバックグラウンドプロセスIDが返される
   *
   * **Validates: Requirement 6.4, 6.5**
   * - THE Process_Monitor SHALL detect server commands and run in background
   * - WHEN background process starts, THE Process_Monitor SHALL return process_id
   */
  it('Property 14.2: サーバーコマンド実行時にバックグラウンドプロセスIDが返される', async () => {
    await fc.assert(
      fc.asyncProperty(serverCommandArb, async (command) => {
        const result = await processMonitor.execute(command);

        // バックグラウンドプロセスIDが返されること
        expect(result.backgroundProcessId).toBeDefined();
        expect(typeof result.backgroundProcessId).toBe('string');
        expect(result.backgroundProcessId!.length).toBeGreaterThan(0);

        // 終了コードが0であること
        expect(result.exitCode).toBe(0);

        // 出力にサーバーコマンド検出メッセージが含まれること
        expect(result.stdout).toContain('Server command detected');
        expect(result.stdout).toContain('Running in background');

        // クリーンアップ
        if (result.backgroundProcessId) {
          try {
            await processMonitor.kill(result.backgroundProcessId);
          } catch {
            // プロセスが既に終了している場合は無視
          }
        }
      }),
      { numRuns: 20 } // プロセス生成のため回数を制限
    );
  });

  /**
   * Property 14.3: バックグラウンドプロセスの終了可能性
   * バックグラウンドプロセスはkill()で終了できる
   *
   * **Validates: Requirement 6.5**
   * - プロセスは `kill()` で終了可能
   */
  it('Property 14.3: バックグラウンドプロセスはkill()で終了できる', async () => {
    // 長時間実行するコマンドをバックグラウンドで実行
    const command = isWindows ? 'ping -n 60 127.0.0.1' : 'sleep 60';
    const processId = await processMonitor.executeBackground(command);

    // プロセスが実行中であることを確認
    let status = await processMonitor.getProcessStatus(processId);
    expect(status).toBe('running');

    // プロセスを終了
    await processMonitor.kill(processId);

    // 終了を待つ
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // プロセスが終了していることを確認
    status = await processMonitor.getProcessStatus(processId);
    expect(['stopped', 'exited']).toContain(status);
  }, 10000);

  /**
   * Property 14.4: 通常のコマンドはバックグラウンドで実行されない
   * サーバーコマンドでないコマンドはバックグラウンドで実行されない
   *
   * **Validates: Requirement 6.4**
   */
  it('Property 14.4: 通常のコマンドはバックグラウンドで実行されない', async () => {
    await fc.assert(
      fc.asyncProperty(normalCommandArb, async (command) => {
        const isServer = processMonitor.isServerCommand(command);

        // サーバーコマンドではないこと
        expect(isServer).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.5: サーバーコマンド検出の一貫性
   * 同じコマンドに対して、検出結果は常に同じ
   *
   * **Validates: Requirement 6.4**
   */
  it('Property 14.5: サーバーコマンド検出は一貫している', async () => {
    await fc.assert(
      fc.asyncProperty(serverCommandArb, async (command) => {
        // 複数回検出を実行
        const result1 = processMonitor.isServerCommand(command);
        const result2 = processMonitor.isServerCommand(command);
        const result3 = processMonitor.isServerCommand(command);

        // すべて同じ結果であること
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
        expect(result1).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.6: バックグラウンドプロセスIDの一意性
   * 複数のバックグラウンドプロセスは異なるIDを持つ
   *
   * **Validates: Requirement 6.5**
   */
  it('Property 14.6: バックグラウンドプロセスIDは一意である', async () => {
    const processIds: string[] = [];

    // 複数のバックグラウンドプロセスを開始
    for (let i = 0; i < 5; i++) {
      const command = isWindows ? 'ping -n 60 127.0.0.1' : 'sleep 60';
      const processId = await processMonitor.executeBackground(command);
      processIds.push(processId);
    }

    // すべてのIDが一意であることを確認
    const uniqueIds = new Set(processIds);
    expect(uniqueIds.size).toBe(processIds.length);

    // クリーンアップ
    await processMonitor.killAll();
  }, 10000);
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('Process Monitor Edge Cases', () => {
  let processMonitor: ProcessMonitor;

  beforeEach(async () => {
    processMonitor = new ProcessMonitor(TEST_RUNS_DIR);
    processMonitor.setRunId(TEST_RUN_ID);
    await fs.mkdir(`${TEST_RUNS_DIR}/${TEST_RUN_ID}`, { recursive: true });
  });

  afterEach(async () => {
    await processMonitor.killAll();
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * 空のコマンドの処理
   */
  it('空のコマンドはインタラクティブでもサーバーでもない', () => {
    expect(processMonitor.isInteractiveCommand('')).toBe(false);
    expect(processMonitor.isServerCommand('')).toBe(false);
  });

  /**
   * 空白のみのコマンドの処理
   */
  it('空白のみのコマンドはインタラクティブでもサーバーでもない', () => {
    expect(processMonitor.isInteractiveCommand('   ')).toBe(false);
    expect(processMonitor.isServerCommand('   ')).toBe(false);
  });

  /**
   * パス付きインタラクティブコマンドの検出
   * 注意: path.basenameはプラットフォームに依存するため、
   * Windowsでは '/' 区切りのパスを正しく処理できない場合がある
   */
  it('パス付きインタラクティブコマンドも検出される', () => {
    // Unixスタイルのパス（Windowsでもpath.basenameは最後の/以降を取得）
    expect(processMonitor.isInteractiveCommand('/usr/bin/vim')).toBe(true);
    expect(processMonitor.isInteractiveCommand('/usr/local/bin/nano')).toBe(true);
    // 単純なコマンド名
    expect(processMonitor.isInteractiveCommand('vim')).toBe(true);
    expect(processMonitor.isInteractiveCommand('nano')).toBe(true);
    expect(processMonitor.isInteractiveCommand('less')).toBe(true);
  });

  /**
   * 大文字小文字の混在
   */
  it('大文字小文字が混在してもサーバーコマンドは検出される', () => {
    expect(processMonitor.isServerCommand('NPM RUN DEV')).toBe(true);
    expect(processMonitor.isServerCommand('Npm Run Dev')).toBe(true);
    expect(processMonitor.isServerCommand('YARN START')).toBe(true);
  });

  /**
   * 存在しないプロセスIDでのkill
   */
  it('存在しないプロセスIDでkillするとエラー', async () => {
    await expect(processMonitor.kill('non-existent-id')).rejects.toThrow('Process not found');
  });

  /**
   * 存在しないプロセスIDでのgetProcessStatus
   */
  it('存在しないプロセスIDでgetProcessStatusするとエラー', async () => {
    await expect(processMonitor.getProcessStatus('non-existent-id')).rejects.toThrow(
      'Process not found'
    );
  });

  /**
   * 存在しないプロセスIDでのgetProcessOutput
   */
  it('存在しないプロセスIDでgetProcessOutputするとエラー', () => {
    expect(() => processMonitor.getProcessOutput('non-existent-id')).toThrow('Process not found');
  });

  /**
   * killAllで空のプロセスリスト
   */
  it('プロセスがない状態でkillAllしてもエラーにならない', async () => {
    await expect(processMonitor.killAll()).resolves.not.toThrow();
  });

  /**
   * 複数回のkillAll
   */
  it('複数回killAllしてもエラーにならない', async () => {
    const command = isWindows ? 'ping -n 60 127.0.0.1' : 'sleep 60';
    await processMonitor.executeBackground(command);

    await processMonitor.killAll();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(processMonitor.killAll()).resolves.not.toThrow();
  });
});
