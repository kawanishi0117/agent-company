/**
 * projectコマンド
 * プロジェクト管理（一覧表示、追加、削除）
 *
 * @module commands/project
 * @see Requirements: 22.5, 22.6
 */

import { createProjectManager, ProjectManagerError } from '../lib/execution/project-manager.js';

// =============================================================================
// ヘルプ表示
// =============================================================================

/**
 * projectコマンドのヘルプを表示
 */
export function showProjectHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
プロジェクト管理コマンド

使用方法:
  project list                      プロジェクト一覧を表示
  project add <name> <git-url>      プロジェクトを追加
  project remove <project-id>       プロジェクトを削除
  project show <project-id>         プロジェクト詳細を表示

オプション:
  --branch <name>       デフォルトブランチ（デフォルト: main）
  --integration <name>  統合ブランチ（デフォルト: develop）
  --base-branch <name>  PRの作成先ブランチ（デフォルト: main）
  --agent-branch <name> エージェント作業用ブランチ（デフォルト: agent/<project-id>）
  --workdir <path>      作業ディレクトリ
  --json                JSON形式で出力
  --help, -h            このヘルプを表示

例:
  project list
  project list --json
  project add my-app https://github.com/user/my-app.git
  project add my-app https://github.com/user/my-app.git --branch main --integration develop
  project add my-app https://github.com/user/my-app.git --base-branch main --agent-branch agent/my-app
  project remove my-app-abc12345
  project show my-app-abc12345
`);
}

// =============================================================================
// オプション解析
// =============================================================================

/**
 * addコマンドのオプション
 */
interface AddOptions {
  /** デフォルトブランチ */
  defaultBranch?: string;
  /** 統合ブランチ */
  integrationBranch?: string;
  /** 作業ディレクトリ */
  workDir?: string;
  /** PRの作成先ブランチ（デフォルト: 'main'） */
  baseBranch?: string;
  /** エージェント作業用ブランチ（デフォルト: 'agent/<project-id>'） */
  agentBranch?: string;
}

/**
 * listコマンドのオプション
 */
interface ListOptions {
  /** JSON形式で出力 */
  json: boolean;
}

/**
 * addコマンドのオプションを解析
 *
 * @param args - コマンドライン引数
 * @returns 解析されたオプション
 */
function parseAddOptions(args: string[]): AddOptions {
  const options: AddOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--branch') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--branch オプションにはブランチ名が必要です');
      }
      options.defaultBranch = value;
    } else if (arg === '--integration') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--integration オプションにはブランチ名が必要です');
      }
      options.integrationBranch = value;
    } else if (arg === '--workdir') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--workdir オプションにはパスが必要です');
      }
      options.workDir = value;
    } else if (arg === '--base-branch') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--base-branch オプションにはブランチ名が必要です');
      }
      options.baseBranch = value;
    } else if (arg === '--agent-branch') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('--agent-branch オプションにはブランチ名が必要です');
      }
      options.agentBranch = value;
    }
  }

  return options;
}

/**
 * listコマンドのオプションを解析
 *
 * @param args - コマンドライン引数
 * @returns 解析されたオプション
 */
function parseListOptions(args: string[]): ListOptions {
  return {
    json: args.includes('--json'),
  };
}

// =============================================================================
// listサブコマンド
// =============================================================================

/**
 * プロジェクト一覧を表示
 *
 * @param options - 表示オプション
 *
 * @see Requirement 22.5: `npx tsx tools/cli/agentcompany.ts project list` SHALL show all projects
 */
async function listProjects(options: ListOptions): Promise<void> {
  try {
    const manager = createProjectManager();
    const projects = await manager.listProjects();

    if (options.json) {
      // JSON形式で出力
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(projects, null, 2));
      return;
    }

    // テキスト形式で出力
    // eslint-disable-next-line no-console
    console.log('\n📁 プロジェクト一覧');
    // eslint-disable-next-line no-console
    console.log('═'.repeat(60));

    if (projects.length === 0) {
      // eslint-disable-next-line no-console
      console.log('\n   プロジェクトはありません');
      // eslint-disable-next-line no-console
      console.log('   追加: npx tsx tools/cli/agentcompany.ts project add <name> <git-url>');
    } else {
      for (const project of projects) {
        // eslint-disable-next-line no-console
        console.log(`\n   📦 ${project.name}`);
        // eslint-disable-next-line no-console
        console.log(`      ID: ${project.id}`);
        // eslint-disable-next-line no-console
        console.log(`      Git: ${project.gitUrl}`);
        // eslint-disable-next-line no-console
        console.log(`      ブランチ: ${project.defaultBranch} / ${project.integrationBranch}`);
        // eslint-disable-next-line no-console
        console.log(`      作業ディレクトリ: ${project.workDir}`);
      }
    }

    // eslint-disable-next-line no-console
    console.log('\n' + '═'.repeat(60));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// addサブコマンド
// =============================================================================

/**
 * プロジェクトを追加
 *
 * @param name - プロジェクト名
 * @param gitUrl - GitリポジトリURL
 * @param options - 追加オプション
 *
 * @see Requirement 22.6: `npx tsx tools/cli/agentcompany.ts project add <name> <git-url>` SHALL register project
 */
async function addProject(name: string, gitUrl: string, options: AddOptions): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n➕ プロジェクトを追加: ${name}`);
  // eslint-disable-next-line no-console
  console.log(`   Git URL: ${gitUrl}`);

  try {
    const manager = createProjectManager();
    const project = await manager.addProject(name, gitUrl, options);

    // eslint-disable-next-line no-console
    console.log(`\n✅ プロジェクトを追加しました`);
    // eslint-disable-next-line no-console
    console.log(`   ID: ${project.id}`);
    // eslint-disable-next-line no-console
    console.log(`   名前: ${project.name}`);
    // eslint-disable-next-line no-console
    console.log(`   Git URL: ${project.gitUrl}`);
    // eslint-disable-next-line no-console
    console.log(`   デフォルトブランチ: ${project.defaultBranch}`);
    // eslint-disable-next-line no-console
    console.log(`   統合ブランチ: ${project.integrationBranch}`);
    // eslint-disable-next-line no-console
    console.log(`   作業ディレクトリ: ${project.workDir}`);
  } catch (error) {
    if (error instanceof ProjectManagerError) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ エラー: ${error.message}`);
      // eslint-disable-next-line no-console
      console.error(`   コード: ${error.code}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    }
    process.exit(1);
  }
}

// =============================================================================
// removeサブコマンド
// =============================================================================

/**
 * プロジェクトを削除
 *
 * @param projectId - プロジェクトID
 */
async function removeProject(projectId: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n🗑️ プロジェクトを削除: ${projectId}`);

  try {
    const manager = createProjectManager();
    const removed = await manager.removeProject(projectId);

    if (removed) {
      // eslint-disable-next-line no-console
      console.log(`\n✅ プロジェクトを削除しました`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n❌ プロジェクトが見つかりません: ${projectId}`);
      process.exit(1);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// showサブコマンド
// =============================================================================

/**
 * プロジェクト詳細を表示
 *
 * @param projectId - プロジェクトID
 */
async function showProject(projectId: string): Promise<void> {
  try {
    const manager = createProjectManager();
    const project = await manager.getProject(projectId);

    if (!project) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ プロジェクトが見つかりません: ${projectId}`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log('\n📦 プロジェクト詳細');
    // eslint-disable-next-line no-console
    console.log('═'.repeat(50));
    // eslint-disable-next-line no-console
    console.log(`\n   ID: ${project.id}`);
    // eslint-disable-next-line no-console
    console.log(`   名前: ${project.name}`);
    // eslint-disable-next-line no-console
    console.log(`   Git URL: ${project.gitUrl}`);
    // eslint-disable-next-line no-console
    console.log(`   デフォルトブランチ: ${project.defaultBranch}`);
    // eslint-disable-next-line no-console
    console.log(`   統合ブランチ: ${project.integrationBranch}`);
    // eslint-disable-next-line no-console
    console.log(`   作業ディレクトリ: ${project.workDir}`);
    // eslint-disable-next-line no-console
    console.log(`   作成日時: ${project.createdAt}`);
    // eslint-disable-next-line no-console
    console.log(`   最終使用: ${project.lastUsed}`);
    // eslint-disable-next-line no-console
    console.log('\n' + '═'.repeat(50));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// エントリポイント
// =============================================================================

/**
 * projectコマンドのエントリポイント
 *
 * @param args - コマンドライン引数
 */
export async function handleProjectCommand(args: string[]): Promise<void> {
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showProjectHelp();
    return;
  }

  // サブコマンドの判定
  const subCommand = args[0];

  switch (subCommand) {
    case 'list': {
      const options = parseListOptions(args.slice(1));
      await listProjects(options);
      break;
    }

    case 'add': {
      // 引数を取得（--で始まらない引数）
      const positionalArgs: string[] = [];
      for (let i = 1; i < args.length; i++) {
        if (!args[i].startsWith('--')) {
          positionalArgs.push(args[i]);
        } else {
          // オプションの値をスキップ
          if (
            ['--branch', '--integration', '--workdir', '--base-branch', '--agent-branch'].includes(
              args[i]
            )
          ) {
            i++;
          }
        }
      }

      if (positionalArgs.length < 2) {
        // eslint-disable-next-line no-console
        console.error('エラー: プロジェクト名とGit URLを指定してください。');
        showProjectHelp();
        process.exit(1);
      }

      const [name, gitUrl] = positionalArgs;
      const options = parseAddOptions(args.slice(1));
      await addProject(name, gitUrl, options);
      break;
    }

    case 'remove': {
      const projectId = args[1];
      if (!projectId || projectId.startsWith('--')) {
        // eslint-disable-next-line no-console
        console.error('エラー: プロジェクトIDを指定してください。');
        showProjectHelp();
        process.exit(1);
      }
      await removeProject(projectId);
      break;
    }

    case 'show': {
      const projectId = args[1];
      if (!projectId || projectId.startsWith('--')) {
        // eslint-disable-next-line no-console
        console.error('エラー: プロジェクトIDを指定してください。');
        showProjectHelp();
        process.exit(1);
      }
      await showProject(projectId);
      break;
    }

    default:
      // eslint-disable-next-line no-console
      console.error(`不明なサブコマンド: ${subCommand}`);
      showProjectHelp();
      process.exit(1);
  }
}
