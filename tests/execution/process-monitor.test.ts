/**
 * Process Monitor ユニットテスト
 *
 * コマンド実行、タイムアウト、バックグラウンドプロセス管理の機能をテストする。
 *
 * **Validates: Requirements 6.1, 6.2, 6.6, 6.7**
 *
 * @module tests/execution/process-monitor.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ProcessMonitor } from '../../tools/cli/lib/execution/process-monitor';

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
const TEST_RUNS_DIR = 'runtime/runs/test-process-monitor';

/**
 * テスト用の実行ID
 */
const TEST_RUN_ID = 'test-run-001';

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * ログファイルが作成されるまで待機
 */
async function waitForLogFile(logPath: string, maxWaitMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      await fs.access(logPath);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
}

// =============================================================================
// テストセットアップ
// =============================================================================

describe('ProcessMonitor', () => {
  let processMonitor: ProcessMonitor;

  beforeEach(async () => {
    // テスト用のProcessMonitorインスタンスを作成
    processMonitor = new ProcessMonitor(TEST_RUNS_DIR);
    processMonitor.setRunId(TEST_RUN_ID);

    // テスト用ディレクトリを作成
    await fs.mkdir(path.join(TEST_RUNS_DIR, TEST_RUN_ID), { recursive: true });
  });

  afterEach(async () => {
    // バックグラウンドプロセスをすべて終了
    await processMonitor.killAll();

    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_RUNS_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // コマンド実行テスト
  // ===========================================================================

  describe('execute', () => {
    /**
     * 正常なコマンド実行
     * @see Requirement 6.1: THE Process_Monitor SHALL enforce configurable timeout
     */
    it('正常なコマンドを実行して結果を返す', async () => {
      // Windows: cmd /c echo, Linux/Mac: echo
      const command = isWindows ? 'cmd /c echo Hello' : 'echo Hello';
      const result = await processMonitor.execute(command);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toContain('Hello');
      expect(result.timedOut).toBe(false);
    });

    /**
     * 終了コードが0以外のコマンド
     */
    it('終了コードが0以外のコマンドを正しく処理する', async () => {
      const command = isWindows ? 'cmd /c exit 42' : 'exit 42';
      const result = await processMonitor.execute(command, { timeout: 5 });

      expect(result.exitCode).toBe(42);
      expect(result.timedOut).toBe(false);
    });

    /**
     * 標準エラー出力を含むコマンド
     */
    it('標準エラー出力を正しく収集する', async () => {
      const command = isWindows ? 'cmd /c echo error message 1>&2' : 'echo "error message" >&2';
      const result = await processMonitor.execute(command, { timeout: 5 });

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toContain('error message');
    });

    /**
     * タイムアウト処理
     * @see Requirement 6.2: WHEN command exceeds timeout, THE Process_Monitor SHALL terminate
     */
    it('タイムアウトを超過したコマンドを終了する', async () => {
      // 1秒のタイムアウトで長時間スリープするコマンドを実行
      const command = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';
      const result = await processMonitor.execute(command, { timeout: 1 });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124); // タイムアウト時の終了コード
    }, 15000);

    /**
     * 作業ディレクトリの指定
     */
    it('作業ディレクトリを指定してコマンドを実行する', async () => {
      const tempDir = os.tmpdir();
      const command = isWindows ? 'cmd /c cd' : 'pwd';
      const result = await processMonitor.execute(command, {
        cwd: tempDir,
        timeout: 5,
      });

      expect(result.exitCode).toBe(0);
      // パスの正規化（Windowsでは大文字小文字が異なる場合がある）
      expect(result.stdout.trim().toLowerCase()).toContain(
        tempDir.toLowerCase().replace(/\\/g, '/').split('/').pop() || ''
      );
    });

    /**
     * 環境変数の指定
     */
    it('環境変数を指定してコマンドを実行する', async () => {
      const command = isWindows ? 'cmd /c echo %TEST_VAR%' : 'echo $TEST_VAR';
      const result = await processMonitor.execute(command, {
        env: { TEST_VAR: 'test_value' },
        timeout: 5,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toContain('test_value');
    });

    /**
     * デフォルトタイムアウトの使用
     * @see Requirement 6.1: default: 300 seconds
     */
    it('タイムアウト未指定時はデフォルト値（300秒）を使用する', async () => {
      // 短いコマンドで確認（実際に300秒待つわけではない）
      const command = isWindows ? 'cmd /c echo quick' : 'echo quick';
      const result = await processMonitor.execute(command);

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });
  });

  // ===========================================================================
  // バックグラウンド実行テスト
  // ===========================================================================

  describe('executeBackground', () => {
    /**
     * バックグラウンドプロセスの開始
     * @see Requirement 6.5: WHEN background process starts, THE Process_Monitor SHALL return process_id
     */
    it('バックグラウンドでコマンドを実行してプロセスIDを返す', async () => {
      const command = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';
      const processId = await processMonitor.executeBackground(command);

      expect(processId).toBeDefined();
      expect(typeof processId).toBe('string');
      expect(processId.length).toBeGreaterThan(0);

      // プロセスが実行中であることを確認
      const status = await processMonitor.getProcessStatus(processId);
      expect(status).toBe('running');
    });

    /**
     * バックグラウンドプロセスの出力収集
     */
    it('バックグラウンドプロセスの出力を収集する', async () => {
      const command = isWindows
        ? 'cmd /c echo background_output'
        : 'echo background_output && sleep 1';
      const processId = await processMonitor.executeBackground(command);

      // 出力が収集されるまで少し待つ
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const output = processMonitor.getProcessOutput(processId);
      expect(output.stdout).toContain('background_output');
    });

    /**
     * バックグラウンドプロセス一覧の取得
     */
    it('バックグラウンドプロセス一覧を取得する', async () => {
      const command = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';
      const processId1 = await processMonitor.executeBackground(command);
      const processId2 = await processMonitor.executeBackground(command);

      const processes = processMonitor.listBackgroundProcesses();

      expect(processes).toContain(processId1);
      expect(processes).toContain(processId2);
      expect(processes.length).toBe(2);
    });
  });

  // ===========================================================================
  // プロセス制御テスト
  // ===========================================================================

  describe('kill', () => {
    /**
     * バックグラウンドプロセスの終了
     * @see Requirement 6.6: THE Process_Monitor SHALL support `kill <process_id>`
     */
    it('バックグラウンドプロセスを終了する', async () => {
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
     * 存在しないプロセスIDでエラー
     */
    it('存在しないプロセスIDでエラーをスローする', async () => {
      await expect(processMonitor.kill('non-existent-process-id')).rejects.toThrow(
        'Process not found'
      );
    });
  });

  describe('getProcessStatus', () => {
    /**
     * 実行中プロセスのステータス
     */
    it('実行中プロセスのステータスを返す', async () => {
      const command = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';
      const processId = await processMonitor.executeBackground(command);

      const status = await processMonitor.getProcessStatus(processId);
      expect(status).toBe('running');
    });

    /**
     * 終了したプロセスのステータス
     */
    it('終了したプロセスのステータスを返す', async () => {
      const command = isWindows ? 'cmd /c echo done' : 'echo done';
      const processId = await processMonitor.executeBackground(command);

      // プロセスが終了するまで待つ
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const status = await processMonitor.getProcessStatus(processId);
      expect(status).toBe('exited');
    });

    /**
     * 存在しないプロセスIDでエラー
     */
    it('存在しないプロセスIDでエラーをスローする', async () => {
      await expect(processMonitor.getProcessStatus('non-existent-process-id')).rejects.toThrow(
        'Process not found'
      );
    });
  });

  describe('killAll', () => {
    /**
     * すべてのバックグラウンドプロセスを終了
     */
    it('すべてのバックグラウンドプロセスを終了する', async () => {
      const command = isWindows ? 'ping -n 60 127.0.0.1' : 'sleep 60';
      await processMonitor.executeBackground(command);
      await processMonitor.executeBackground(command);
      await processMonitor.executeBackground(command);

      expect(processMonitor.listBackgroundProcesses().length).toBe(3);

      await processMonitor.killAll();

      // 終了を待つ
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // すべてのプロセスが終了していることを確認
      const processes = processMonitor.listBackgroundProcesses();
      for (const processId of processes) {
        const status = await processMonitor.getProcessStatus(processId);
        expect(['stopped', 'exited']).toContain(status);
      }
    }, 10000);
  });

  // ===========================================================================
  // コマンド検証テスト
  // ===========================================================================

  describe('isInteractiveCommand', () => {
    /**
     * インタラクティブコマンドの検出
     * @see Requirement 6.3: THE Process_Monitor SHALL detect and reject interactive commands
     */
    it('vim をインタラクティブコマンドとして検出する', () => {
      expect(processMonitor.isInteractiveCommand('vim')).toBe(true);
      expect(processMonitor.isInteractiveCommand('vim file.txt')).toBe(true);
      expect(processMonitor.isInteractiveCommand('/usr/bin/vim')).toBe(true);
    });

    it('nano をインタラクティブコマンドとして検出する', () => {
      expect(processMonitor.isInteractiveCommand('nano')).toBe(true);
      expect(processMonitor.isInteractiveCommand('nano file.txt')).toBe(true);
    });

    it('less をインタラクティブコマンドとして検出する', () => {
      expect(processMonitor.isInteractiveCommand('less')).toBe(true);
      expect(processMonitor.isInteractiveCommand('less file.txt')).toBe(true);
    });

    it('top をインタラクティブコマンドとして検出する', () => {
      expect(processMonitor.isInteractiveCommand('top')).toBe(true);
      expect(processMonitor.isInteractiveCommand('htop')).toBe(true);
    });

    it('ssh をインタラクティブコマンドとして検出する', () => {
      expect(processMonitor.isInteractiveCommand('ssh')).toBe(true);
      expect(processMonitor.isInteractiveCommand('ssh user@host')).toBe(true);
    });

    it('python（引数なし）をインタラクティブコマンドとして検出する', () => {
      expect(processMonitor.isInteractiveCommand('python')).toBe(true);
      expect(processMonitor.isInteractiveCommand('node')).toBe(true);
    });

    it('python（ファイル指定）はインタラクティブではない', () => {
      expect(processMonitor.isInteractiveCommand('python script.py')).toBe(false);
      expect(processMonitor.isInteractiveCommand('node app.js')).toBe(false);
    });

    it('python -c はインタラクティブではない', () => {
      expect(processMonitor.isInteractiveCommand('python -c "print(1)"')).toBe(false);
      expect(processMonitor.isInteractiveCommand('node -e "console.log(1)"')).toBe(false);
    });

    it('通常のコマンドはインタラクティブではない', () => {
      expect(processMonitor.isInteractiveCommand('echo "hello"')).toBe(false);
      expect(processMonitor.isInteractiveCommand('ls -la')).toBe(false);
      expect(processMonitor.isInteractiveCommand('cat file.txt')).toBe(false);
      expect(processMonitor.isInteractiveCommand('npm install')).toBe(false);
    });
  });

  describe('isServerCommand', () => {
    /**
     * サーバーコマンドの検出
     * @see Requirement 6.4: THE Process_Monitor SHALL detect server commands
     */
    it('npm run dev をサーバーコマンドとして検出する', () => {
      expect(processMonitor.isServerCommand('npm run dev')).toBe(true);
      expect(processMonitor.isServerCommand('npm run start')).toBe(true);
      expect(processMonitor.isServerCommand('npm run serve')).toBe(true);
    });

    it('yarn dev をサーバーコマンドとして検出する', () => {
      expect(processMonitor.isServerCommand('yarn dev')).toBe(true);
      expect(processMonitor.isServerCommand('yarn start')).toBe(true);
      expect(processMonitor.isServerCommand('yarn serve')).toBe(true);
    });

    it('pnpm dev をサーバーコマンドとして検出する', () => {
      expect(processMonitor.isServerCommand('pnpm dev')).toBe(true);
      expect(processMonitor.isServerCommand('pnpm start')).toBe(true);
    });

    it('npx vite をサーバーコマンドとして検出する', () => {
      expect(processMonitor.isServerCommand('npx vite')).toBe(true);
      expect(processMonitor.isServerCommand('npx next')).toBe(true);
      expect(processMonitor.isServerCommand('npx nuxt')).toBe(true);
    });

    it('Python サーバーコマンドを検出する', () => {
      expect(processMonitor.isServerCommand('python manage.py runserver')).toBe(true);
      expect(processMonitor.isServerCommand('flask run')).toBe(true);
      expect(processMonitor.isServerCommand('uvicorn main:app')).toBe(true);
      expect(processMonitor.isServerCommand('gunicorn app:app')).toBe(true);
    });

    it('Rails サーバーコマンドを検出する', () => {
      expect(processMonitor.isServerCommand('rails server')).toBe(true);
      expect(processMonitor.isServerCommand('rails s')).toBe(true);
    });

    it('Docker Compose をサーバーコマンドとして検出する', () => {
      expect(processMonitor.isServerCommand('docker compose up')).toBe(true);
      expect(processMonitor.isServerCommand('docker-compose up')).toBe(true);
    });

    it('通常のコマンドはサーバーコマンドではない', () => {
      expect(processMonitor.isServerCommand('npm install')).toBe(false);
      expect(processMonitor.isServerCommand('npm run build')).toBe(false);
      expect(processMonitor.isServerCommand('npm run test')).toBe(false);
      expect(processMonitor.isServerCommand('echo "hello"')).toBe(false);
      expect(processMonitor.isServerCommand('ls -la')).toBe(false);
    });
  });

  // ===========================================================================
  // ログ出力テスト
  // ===========================================================================

  describe('command logging', () => {
    /**
     * コマンドログの出力
     * @see Requirement 6.7: THE Process_Monitor SHALL log all command executions
     */
    it('コマンド実行をログに記録する', { timeout: 15000 }, async () => {
      const command = isWindows ? 'cmd /c echo test_log' : 'echo test_log';
      await processMonitor.execute(command, { timeout: 5 });

      // ログファイルが作成されるまで待機
      const logPath = path.join(TEST_RUNS_DIR, TEST_RUN_ID, 'commands.log');
      const exists = await waitForLogFile(logPath);

      expect(exists).toBe(true);
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain('echo');
      expect(logContent).toContain('[exit: 0]');
    });

    it('タイムアウトをログに記録する', async () => {
      const command = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';
      await processMonitor.execute(command, { timeout: 1 });

      const logPath = path.join(TEST_RUNS_DIR, TEST_RUN_ID, 'commands.log');
      const exists = await waitForLogFile(logPath);

      expect(exists).toBe(true);
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain('[TIMEOUT]');
    }, 15000);

    it('バックグラウンド実行をログに記録する', { timeout: 15000 }, async () => {
      const command = isWindows ? 'cmd /c echo bg_test' : 'echo bg_test';
      const processId = await processMonitor.executeBackground(command);

      // ログファイルが作成されるまで待機
      const logPath = path.join(TEST_RUNS_DIR, TEST_RUN_ID, 'commands.log');
      const exists = await waitForLogFile(logPath);

      expect(exists).toBe(true);
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain('[background:');
      expect(logContent).toContain(processId);
    });

    it('実行IDが未設定の場合はログを記録しない', async () => {
      // 新しいProcessMonitorを作成（実行ID未設定）
      const noLogMonitor = new ProcessMonitor(TEST_RUNS_DIR);
      const command = isWindows ? 'cmd /c echo no_log' : 'echo no_log';

      await noLogMonitor.execute(command, { timeout: 5 });

      // ログファイルが存在しないことを確認
      const logPath = path.join(TEST_RUNS_DIR, 'undefined', 'commands.log');
      await expect(fs.access(logPath)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 実行ID管理テスト
  // ===========================================================================

  describe('runId management', () => {
    it('実行IDを設定・取得できる', () => {
      const newMonitor = new ProcessMonitor(TEST_RUNS_DIR);

      expect(newMonitor.getRunId()).toBeUndefined();

      newMonitor.setRunId('new-run-id');
      expect(newMonitor.getRunId()).toBe('new-run-id');
    });
  });

  // ===========================================================================
  // インタラクティブコマンド拒否テスト
  // ===========================================================================

  describe('interactive command rejection', () => {
    /**
     * インタラクティブコマンドの拒否
     * @see Requirement 6.3: THE Process_Monitor SHALL detect and reject interactive commands
     */
    it('vim コマンドを拒否する', async () => {
      const result = await processMonitor.execute('vim');

      expect(result.exitCode).toBe(1);
      expect(result.rejected).toBe(true);
      expect(result.rejectionReason).toBe('interactive_command');
      expect(result.stderr).toContain('Interactive command rejected');
      expect(result.timedOut).toBe(false);
    });

    it('nano コマンドを拒否する', async () => {
      const result = await processMonitor.execute('nano file.txt');

      expect(result.exitCode).toBe(1);
      expect(result.rejected).toBe(true);
      expect(result.rejectionReason).toBe('interactive_command');
      expect(result.stderr).toContain('Interactive command rejected');
    });

    it('less コマンドを拒否する', async () => {
      const result = await processMonitor.execute('less /etc/passwd');

      expect(result.exitCode).toBe(1);
      expect(result.rejected).toBe(true);
      expect(result.rejectionReason).toBe('interactive_command');
    });

    it('python（引数なし）を拒否する', async () => {
      const result = await processMonitor.execute('python');

      expect(result.exitCode).toBe(1);
      expect(result.rejected).toBe(true);
      expect(result.rejectionReason).toBe('interactive_command');
    });

    it('node（引数なし）を拒否する', async () => {
      const result = await processMonitor.execute('node');

      expect(result.exitCode).toBe(1);
      expect(result.rejected).toBe(true);
      expect(result.rejectionReason).toBe('interactive_command');
    });

    it('拒否されたコマンドをログに記録する', async () => {
      await processMonitor.execute('vim');

      const logPath = path.join(TEST_RUNS_DIR, TEST_RUN_ID, 'commands.log');
      const exists = await waitForLogFile(logPath);

      expect(exists).toBe(true);
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain('vim');
      expect(logContent).toContain('[REJECTED: interactive_command]');
    });

    it('通常のコマンドは拒否されない', async () => {
      const command = isWindows ? 'cmd /c echo hello' : 'echo hello';
      const result = await processMonitor.execute(command, { timeout: 5 });

      expect(result.exitCode).toBe(0);
      expect(result.rejected).toBeUndefined();
      expect(result.rejectionReason).toBeUndefined();
    });
  });

  // ===========================================================================
  // サーバーコマンド自動バックグラウンド実行テスト
  // ===========================================================================

  describe('server command background execution', () => {
    /**
     * サーバーコマンドの自動バックグラウンド実行
     * @see Requirement 6.4: THE Process_Monitor SHALL detect server commands and run in background
     * @see Requirement 6.5: WHEN background process starts, THE Process_Monitor SHALL return process_id
     */
    it('npm run dev を自動的にバックグラウンドで実行する', async () => {
      // 実際にnpm run devを実行するとエラーになるので、検出のみテスト
      // 実際のサーバーコマンドはモックが必要
      const command = 'npm run dev';

      // サーバーコマンドとして検出されることを確認
      expect(processMonitor.isServerCommand(command)).toBe(true);

      // execute を呼び出すとバックグラウンドで実行される
      const result = await processMonitor.execute(command);

      // バックグラウンドプロセスIDが返される
      expect(result.backgroundProcessId).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Server command detected');
      expect(result.stdout).toContain('Running in background');

      // プロセスをクリーンアップ
      if (result.backgroundProcessId) {
        try {
          await processMonitor.kill(result.backgroundProcessId);
        } catch {
          // プロセスが既に終了している場合は無視
        }
      }
    });

    it('yarn start を自動的にバックグラウンドで実行する', async () => {
      const command = 'yarn start';

      expect(processMonitor.isServerCommand(command)).toBe(true);

      const result = await processMonitor.execute(command);

      expect(result.backgroundProcessId).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Server command detected');

      // プロセスをクリーンアップ
      if (result.backgroundProcessId) {
        try {
          await processMonitor.kill(result.backgroundProcessId);
        } catch {
          // プロセスが既に終了している場合は無視
        }
      }
    });

    it('docker compose up を自動的にバックグラウンドで実行する', async () => {
      const command = 'docker compose up';

      expect(processMonitor.isServerCommand(command)).toBe(true);

      const result = await processMonitor.execute(command);

      expect(result.backgroundProcessId).toBeDefined();
      expect(result.exitCode).toBe(0);

      // プロセスをクリーンアップ
      if (result.backgroundProcessId) {
        try {
          await processMonitor.kill(result.backgroundProcessId);
        } catch {
          // プロセスが既に終了している場合は無視
        }
      }
    });

    it('バックグラウンドプロセスIDでステータスを取得できる', async () => {
      // 長時間実行するコマンドをサーバーコマンドとして実行
      const command = isWindows ? 'ping -n 60 127.0.0.1' : 'sleep 60';

      // 直接バックグラウンドで実行
      const processId = await processMonitor.executeBackground(command);

      // ステータスを取得
      const status = await processMonitor.getProcessStatus(processId);
      expect(status).toBe('running');

      // クリーンアップ
      await processMonitor.kill(processId);
    });

    it('通常のコマンドはバックグラウンドで実行されない', async () => {
      const command = isWindows ? 'cmd /c echo hello' : 'echo hello';
      const result = await processMonitor.execute(command, { timeout: 5 });

      expect(result.backgroundProcessId).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toContain('hello');
    });

    it('npm install はバックグラウンドで実行されない', async () => {
      // npm install はサーバーコマンドではない
      expect(processMonitor.isServerCommand('npm install')).toBe(false);
    });

    it('npm run build はバックグラウンドで実行されない', async () => {
      // npm run build はサーバーコマンドではない
      expect(processMonitor.isServerCommand('npm run build')).toBe(false);
    });
  });
});
