/**
 * executeコマンド
 * エージェント実行エンジンを使用してタスクを実行する
 *
 * @module commands/execute
 * @see Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7
 */

import {
  createOrchestrator,
  OrchestratorError,
} from '../lib/execution/orchestrator.js';
import { StateManager } from '../lib/execution/state-manager.js';
import { DEFAULT_SYSTEM_CONFIG, Project } from '../lib/execution/types.js';
import { getAdapter } from '../../adapters/index.js';

// =============================================================================
// 型定義
// =============================================================================

/**
 * executeコマンドのオプション
 */
interface ExecuteOptions {
  /** タスク分解のみ実行 */
  decompose: boolean;
  /** 使用するAIアダプタ */
  adapter: string;
  /** 並列ワーカー数 */
  workers: number;
  /** プロジェクトID */
  project?: string;
}

/**
 * statusコマンドのオプション
 */
interface StatusOptions {
  /** 詳細表示 */
  verbose: boolean;
  /** JSON形式で出力 */
  json: boolean;
}

// =============================================================================
// ヘルプ表示
// =============================================================================

/**
 * executeコマンドのヘルプを表示
 */
export function showExecuteHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
エージェント実行コマンド

使用方法:
  execute <ticket-id> [options]     タスクを実行
  execute --decompose <ticket-id>   タスクを分解のみ（実行しない）
  status [options]                  実行状況を表示
  stop <run-id>                     実行を停止
  resume <run-id>                   実行を再開

オプション:
  --decompose           タスクを分解のみ実行（サブタスクを生成）
  --adapter <name>      使用するAIアダプタ（デフォルト: ollama）
  --workers <count>     並列ワーカー数（デフォルト: 3）
  --project <id>        プロジェクトID
  --verbose, -v         詳細表示
  --json                JSON形式で出力
  --help, -h            このヘルプを表示

例:
  execute 0001-sample
  execute --decompose 0001-sample
  execute 0001-sample --adapter gemini --workers 5
  execute 0001-sample --project my-project
  status
  status --verbose
  stop run-abc123
  resume run-abc123
`);
}

// =============================================================================
// オプション解析
// =============================================================================

/**
 * コマンドライン引数からオプションを解析
 *
 * @param args - コマンドライン引数
 * @returns 解析されたオプション
 */
function parseExecuteOptions(args: string[]): ExecuteOptions {
  const options: ExecuteOptions = {
    decompose: false,
    adapter: DEFAULT_SYSTEM_CONFIG.defaultAiAdapter,
    workers: DEFAULT_SYSTEM_CONFIG.maxConcurrentWorkers,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--decompose') {
      options.decompose = true;
    } else if (arg === '--adapter') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--adapter オプションにはアダプタ名が必要です');
      }
      options.adapter = value;
    } else if (arg === '--workers') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--workers オプションにはワーカー数が必要です');
      }
      const workers = parseInt(value, 10);
      if (isNaN(workers) || workers < 1) {
        throw new Error('--workers オプションには1以上の数値が必要です');
      }
      options.workers = workers;
    } else if (arg === '--project') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--project オプションにはプロジェクトIDが必要です');
      }
      options.project = value;
    }
  }

  return options;
}

/**
 * statusコマンドのオプションを解析
 *
 * @param args - コマンドライン引数
 * @returns 解析されたオプション
 */
function parseStatusOptions(args: string[]): StatusOptions {
  const options: StatusOptions = {
    verbose: false,
    json: false,
  };

  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

// =============================================================================
// executeコマンド実装
// =============================================================================

/**
 * タスクを実行
 *
 * @param ticketId - チケットID
 * @param options - 実行オプション
 *
 * @see Requirement 21.1: `npx tsx tools/cli/agentcompany.ts execute <ticket-id>` SHALL start task execution
 * @see Requirement 21.6: THE commands SHALL support `--adapter <adapter-name>` option
 * @see Requirement 21.7: THE commands SHALL support `--workers <count>` option
 */
async function executeTask(ticketId: string, options: ExecuteOptions): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n🚀 タスク実行を開始: ${ticketId}`);
  // eslint-disable-next-line no-console
  console.log(`   アダプタ: ${options.adapter}`);
  // eslint-disable-next-line no-console
  console.log(`   ワーカー数: ${options.workers}`);

  if (options.project) {
    // eslint-disable-next-line no-console
    console.log(`   プロジェクト: ${options.project}`);
  }

  try {
    // Orchestratorを作成・初期化
    const orchestrator = createOrchestrator({
      systemConfig: {
        defaultAiAdapter: options.adapter,
        maxConcurrentWorkers: options.workers,
      },
    });

    await orchestrator.initialize();

    // プロジェクトIDを決定（指定がなければデフォルト）
    const projectId = options.project ?? 'default';

    // タスクを送信
    const taskId = await orchestrator.submitTask(
      `チケット ${ticketId} を実行`,
      projectId,
      {
        autoDecompose: !options.decompose,
      }
    );

    // eslint-disable-next-line no-console
    console.log(`\n✅ タスクを送信しました`);
    // eslint-disable-next-line no-console
    console.log(`   タスクID: ${taskId}`);
    // eslint-disable-next-line no-console
    console.log(`\n📊 ステータス確認: npx tsx tools/cli/agentcompany.ts status`);
  } catch (error) {
    if (error instanceof OrchestratorError) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ エラー: ${error.message}`);
      // eslint-disable-next-line no-console
      console.error(`   コード: ${error.code}`);
    } else {
      throw error;
    }
    process.exit(1);
  }
}

/**
 * タスクを分解のみ実行
 *
 * @param ticketId - チケットID
 * @param options - 実行オプション
 *
 * @see Requirement 21.2: `npx tsx tools/cli/agentcompany.ts execute --decompose <ticket-id>` SHALL decompose into sub-tickets
 */
async function decomposeTask(ticketId: string, options: ExecuteOptions): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n🔍 タスク分解を開始: ${ticketId}`);
  // eslint-disable-next-line no-console
  console.log(`   アダプタ: ${options.adapter}`);

  try {
    // AIアダプタを取得
    const adapter = getAdapter(options.adapter);
    if (!adapter) {
      throw new Error(`アダプタが見つかりません: ${options.adapter}`);
    }

    // TaskDecomposerをインポートして作成
    const { TaskDecomposer } = await import('../lib/execution/decomposer.js');
    const decomposer = new TaskDecomposer(adapter, DEFAULT_SYSTEM_CONFIG.defaultModel);

    // プロジェクト情報を作成
    const now = new Date().toISOString();
    const project: Project = {
      id: options.project ?? 'default',
      name: options.project ?? 'Default Project',
      gitUrl: '',
      defaultBranch: 'main',
      integrationBranch: 'develop',
      workDir: process.cwd(),
      createdAt: now,
      lastUsed: now,
    };

    // プロジェクトコンテキストを作成
    const projectContext = {
      project,
    };

    // タスクを分解
    const result = await decomposer.decompose(
      `チケット ${ticketId} を実行`,
      projectContext
    );

    // eslint-disable-next-line no-console
    console.log(`\n✅ タスク分解完了`);
    // eslint-disable-next-line no-console
    console.log(`   サブタスク数: ${result.subTasks.length}`);
    // eslint-disable-next-line no-console
    console.log(`\n📋 サブタスク一覧:`);

    for (const subTask of result.subTasks) {
      // eslint-disable-next-line no-console
      console.log(`\n   [${subTask.id}] ${subTask.title}`);
      // eslint-disable-next-line no-console
      console.log(`   ${subTask.description.substring(0, 100)}...`);
    }

    // eslint-disable-next-line no-console
    console.log(`\n📁 サブタスクは workflows/backlog/ に保存されました`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ タスク分解エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// statusコマンド実装
// =============================================================================

/**
 * 実行状況を表示
 *
 * @param options - 表示オプション
 *
 * @see Requirement 21.3: `npx tsx tools/cli/agentcompany.ts status` SHALL show current execution status
 */
async function showStatus(options: StatusOptions): Promise<void> {
  try {
    // Orchestratorを作成・初期化
    const orchestrator = createOrchestrator();
    await orchestrator.initialize();

    // アクティブなエージェントを取得
    const agents = await orchestrator.getActiveAgents();

    // 全タスクを取得
    const tasks = orchestrator.getAllTasks();

    // 設定を取得
    const config = await orchestrator.getConfig();

    if (options.json) {
      // JSON形式で出力
      const output = {
        agents,
        tasks: tasks.map((t) => ({
          id: t.id,
          status: t.status,
          instruction: t.instruction.substring(0, 100),
          subTaskCount: t.subTasks.length,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
        config: {
          maxConcurrentWorkers: config.maxConcurrentWorkers,
          defaultAiAdapter: config.defaultAiAdapter,
          containerRuntime: config.containerRuntime,
        },
        paused: orchestrator.isPaused(),
        emergencyStopped: orchestrator.isEmergencyStopped(),
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // テキスト形式で出力
    // eslint-disable-next-line no-console
    console.log('\n📊 AgentCompany 実行状況');
    // eslint-disable-next-line no-console
    console.log('═'.repeat(50));

    // システム状態
    // eslint-disable-next-line no-console
    console.log('\n🔧 システム状態:');
    // eslint-disable-next-line no-console
    console.log(`   一時停止: ${orchestrator.isPaused() ? '⏸️ はい' : '▶️ いいえ'}`);
    // eslint-disable-next-line no-console
    console.log(`   緊急停止: ${orchestrator.isEmergencyStopped() ? '🛑 はい' : '✅ いいえ'}`);

    // 設定
    // eslint-disable-next-line no-console
    console.log('\n⚙️ 設定:');
    // eslint-disable-next-line no-console
    console.log(`   最大ワーカー数: ${config.maxConcurrentWorkers}`);
    // eslint-disable-next-line no-console
    console.log(`   AIアダプタ: ${config.defaultAiAdapter}`);
    // eslint-disable-next-line no-console
    console.log(`   コンテナランタイム: ${config.containerRuntime}`);

    // エージェント
    // eslint-disable-next-line no-console
    console.log('\n👥 エージェント:');
    if (agents.length === 0) {
      // eslint-disable-next-line no-console
      console.log('   エージェントはありません');
    } else {
      for (const agent of agents) {
        const statusIcon = getStatusIcon(agent.status);
        // eslint-disable-next-line no-console
        console.log(`   ${statusIcon} [${agent.type}] ${agent.id} - ${agent.status}`);
        if (options.verbose && agent.currentTask) {
          // eslint-disable-next-line no-console
          console.log(`      現在のタスク: ${agent.currentTask.title}`);
        }
      }
    }

    // タスク
    // eslint-disable-next-line no-console
    console.log('\n📋 タスク:');
    if (tasks.length === 0) {
      // eslint-disable-next-line no-console
      console.log('   タスクはありません');
    } else {
      for (const task of tasks) {
        const statusIcon = getTaskStatusIcon(task.status);
        // eslint-disable-next-line no-console
        console.log(`   ${statusIcon} [${task.id}] ${task.status}`);
        // eslint-disable-next-line no-console
        console.log(`      ${task.instruction.substring(0, 60)}...`);
        if (options.verbose) {
          // eslint-disable-next-line no-console
          console.log(`      サブタスク: ${task.subTasks.length}件`);
          // eslint-disable-next-line no-console
          console.log(`      作成: ${task.createdAt}`);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log('\n' + '═'.repeat(50));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ ステータス取得エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * エージェントステータスのアイコンを取得
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'idle':
      return '💤';
    case 'working':
      return '🔄';
    case 'paused':
      return '⏸️';
    case 'error':
      return '❌';
    case 'terminated':
      return '🛑';
    default:
      return '❓';
  }
}

/**
 * タスクステータスのアイコンを取得
 */
function getTaskStatusIcon(status: string): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'decomposing':
      return '🔍';
    case 'executing':
      return '🔄';
    case 'reviewing':
      return '👀';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '❓';
  }
}

// =============================================================================
// stop/resumeコマンド実装
// =============================================================================

/**
 * 実行を停止
 *
 * @param runId - 実行ID
 *
 * @see Requirement 21.4: `npx tsx tools/cli/agentcompany.ts stop <run-id>` SHALL gracefully stop execution
 */
async function stopExecution(runId: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n⏹️ 実行を停止: ${runId}`);

  try {
    // State Managerで実行状態を確認
    const stateManager = new StateManager();
    const state = await stateManager.loadState(runId);

    if (!state) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ 実行状態が見つかりません: ${runId}`);
      process.exit(1);
    }

    if (state.status === 'completed' || state.status === 'failed') {
      // eslint-disable-next-line no-console
      console.error(`\n❌ 実行は既に${state.status === 'completed' ? '完了' : '失敗'}しています`);
      process.exit(1);
    }

    // 状態を更新
    state.status = 'paused';
    state.lastUpdated = new Date().toISOString();
    await stateManager.saveState(runId, state);

    // eslint-disable-next-line no-console
    console.log(`\n✅ 実行を停止しました`);
    // eslint-disable-next-line no-console
    console.log(`   再開: npx tsx tools/cli/agentcompany.ts resume ${runId}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ 停止エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * 実行を再開
 *
 * @param runId - 実行ID
 *
 * @see Requirement 21.5: `npx tsx tools/cli/agentcompany.ts resume <run-id>` SHALL resume from saved state
 */
async function resumeExecution(runId: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n▶️ 実行を再開: ${runId}`);

  try {
    // Orchestratorを作成・初期化
    const orchestrator = createOrchestrator();
    await orchestrator.initialize();

    // タスクを再開
    await orchestrator.resumeTask(runId);

    // eslint-disable-next-line no-console
    console.log(`\n✅ 実行を再開しました`);
    // eslint-disable-next-line no-console
    console.log(`   ステータス確認: npx tsx tools/cli/agentcompany.ts status`);
  } catch (error) {
    if (error instanceof OrchestratorError) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ 再開エラー: ${error.message}`);
      // eslint-disable-next-line no-console
      console.error(`   コード: ${error.code}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n❌ 再開エラー: ${error instanceof Error ? error.message : error}`);
    }
    process.exit(1);
  }
}

// =============================================================================
// エントリポイント
// =============================================================================

/**
 * executeコマンドのエントリポイント
 *
 * @param args - コマンドライン引数
 */
export async function handleExecuteCommand(args: string[]): Promise<void> {
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showExecuteHelp();
    return;
  }

  // サブコマンドの判定
  const subCommand = args[0];

  // statusサブコマンド
  if (subCommand === 'status') {
    const options = parseStatusOptions(args.slice(1));
    await showStatus(options);
    return;
  }

  // stopサブコマンド
  if (subCommand === 'stop') {
    const runId = args[1];
    if (!runId || runId.startsWith('--')) {
      // eslint-disable-next-line no-console
      console.error('エラー: run-id を指定してください。');
      showExecuteHelp();
      process.exit(1);
    }
    await stopExecution(runId);
    return;
  }

  // resumeサブコマンド
  if (subCommand === 'resume') {
    const runId = args[1];
    if (!runId || runId.startsWith('--')) {
      // eslint-disable-next-line no-console
      console.error('エラー: run-id を指定してください。');
      showExecuteHelp();
      process.exit(1);
    }
    await resumeExecution(runId);
    return;
  }

  // executeコマンド（デフォルト）
  try {
    const options = parseExecuteOptions(args);

    // ticket-idを取得（--で始まらない最初の引数）
    let ticketId: string | undefined;
    for (const arg of args) {
      if (!arg.startsWith('--')) {
        ticketId = arg;
        break;
      }
    }

    if (!ticketId) {
      // eslint-disable-next-line no-console
      console.error('エラー: ticket-id を指定してください。');
      showExecuteHelp();
      process.exit(1);
    }

    // 分解のみか実行か
    if (options.decompose) {
      await decomposeTask(ticketId, options);
    } else {
      await executeTask(ticketId, options);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * statusコマンドのエントリポイント
 *
 * @param args - コマンドライン引数
 */
export async function handleStatusCommand(args: string[]): Promise<void> {
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h')) {
    showExecuteHelp();
    return;
  }

  const options = parseStatusOptions(args);
  await showStatus(options);
}

/**
 * stopコマンドのエントリポイント
 *
 * @param args - コマンドライン引数
 */
export async function handleStopCommand(args: string[]): Promise<void> {
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h')) {
    showExecuteHelp();
    return;
  }

  const runId = args[0];
  if (!runId || runId.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: run-id を指定してください。');
    showExecuteHelp();
    process.exit(1);
  }

  await stopExecution(runId);
}

/**
 * resumeコマンドのエントリポイント
 *
 * @param args - コマンドライン引数
 */
export async function handleResumeCommand(args: string[]): Promise<void> {
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h')) {
    showExecuteHelp();
    return;
  }

  const runId = args[0];
  if (!runId || runId.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: run-id を指定してください。');
    showExecuteHelp();
    process.exit(1);
  }

  await resumeExecution(runId);
}
