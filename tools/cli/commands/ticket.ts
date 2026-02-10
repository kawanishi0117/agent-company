/**
 * ticketコマンド
 * チケット管理（作成、一覧表示、ステータス確認、一時停止、再開）
 *
 * @module commands/ticket
 * @see Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { TicketManagerError, createTicketManager } from '../lib/execution/ticket-manager.js';
import type {
  ParentTicket,
  ChildTicket,
  GrandchildTicket,
  TicketStatus,
} from '../lib/execution/types.js';

// =============================================================================
// ヘルプ表示
// =============================================================================

/**
 * ticketコマンドのヘルプを表示
 */
export function showTicketHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
チケット管理コマンド

使用方法:
  ticket create <project-id> <instruction>  親チケットを作成
  ticket list <project-id>                  チケット一覧を表示
  ticket status <ticket-id>                 チケット詳細を表示
  ticket pause <ticket-id>                  チケット実行を一時停止
  ticket resume <ticket-id>                 チケット実行を再開

オプション:
  --json                JSON形式で出力
  --help, -h            このヘルプを表示

例:
  ticket create my-project "新機能を実装してください"
  ticket list my-project
  ticket list my-project --json
  ticket status my-project-0001
  ticket pause my-project-0001
  ticket resume my-project-0001
`);
}

// =============================================================================
// オプション解析
// =============================================================================

/**
 * listコマンドのオプション
 */
interface ListOptions {
  /** JSON形式で出力 */
  json: boolean;
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
// ステータス表示用ユーティリティ
// =============================================================================

/**
 * ステータスに対応する絵文字を取得
 */
function getStatusEmoji(status: TicketStatus): string {
  const emojiMap: Record<TicketStatus, string> = {
    pending: '⏳',
    decomposing: '🔄',
    in_progress: '🔵',
    review_requested: '🟡',
    revision_required: '🟠',
    completed: '✅',
    failed: '❌',
    pr_created: '🎉',
  };
  return emojiMap[status] || '❓';
}

/**
 * チケット階層をツリー形式で表示
 */
function printTicketTree(ticket: ParentTicket, indent: string = ''): void {
  // eslint-disable-next-line no-console
  console.log(
    `${indent}${getStatusEmoji(ticket.status)} [${ticket.id}] ${ticket.instruction.substring(0, 50)}${ticket.instruction.length > 50 ? '...' : ''}`
  );

  for (const child of ticket.childTickets) {
    // eslint-disable-next-line no-console
    console.log(
      `${indent}  ${getStatusEmoji(child.status)} [${child.id}] ${child.title} (${child.workerType})`
    );

    for (const grandchild of child.grandchildTickets) {
      // eslint-disable-next-line no-console
      console.log(
        `${indent}    ${getStatusEmoji(grandchild.status)} [${grandchild.id}] ${grandchild.title}`
      );
      if (grandchild.assignee) {
        // eslint-disable-next-line no-console
        console.log(`${indent}      👤 ${grandchild.assignee}`);
      }
      if (grandchild.gitBranch) {
        // eslint-disable-next-line no-console
        console.log(`${indent}      🌿 ${grandchild.gitBranch}`);
      }
    }
  }
}

// =============================================================================
// createサブコマンド
// =============================================================================

/**
 * 親チケットを作成
 *
 * @param projectId - プロジェクトID
 * @param instruction - 指示内容
 *
 * @see Requirement 12.1: THE CLI SHALL support `agentcompany ticket create <project-id> <instruction>`
 */
async function createTicket(projectId: string, instruction: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n➕ チケットを作成: ${projectId}`);
  // eslint-disable-next-line no-console
  console.log(`   指示: ${instruction.substring(0, 100)}${instruction.length > 100 ? '...' : ''}`);

  try {
    const manager = createTicketManager();

    // 既存のチケットを読み込み
    await manager.loadTickets(projectId);

    // チケットを作成
    const ticket = await manager.createParentTicket(projectId, instruction);

    // 保存
    await manager.saveTickets(projectId);

    // eslint-disable-next-line no-console
    console.log(`\n✅ チケットを作成しました`);
    // eslint-disable-next-line no-console
    console.log(`   ID: ${ticket.id}`);
    // eslint-disable-next-line no-console
    console.log(`   ステータス: ${ticket.status}`);
    // eslint-disable-next-line no-console
    console.log(`   作成日時: ${ticket.createdAt}`);
  } catch (error) {
    if (error instanceof TicketManagerError) {
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
// listサブコマンド
// =============================================================================

/**
 * チケット一覧を表示
 *
 * @param projectId - プロジェクトID
 * @param options - 表示オプション
 *
 * @see Requirement 12.2: THE CLI SHALL support `agentcompany ticket list <project-id>`
 */
async function listTickets(projectId: string, options: ListOptions): Promise<void> {
  try {
    const manager = createTicketManager();

    // チケットを読み込み
    await manager.loadTickets(projectId);

    const tickets = await manager.listParentTickets(projectId);

    if (options.json) {
      // JSON形式で出力
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(tickets, null, 2));
      return;
    }

    // テキスト形式で出力
    // eslint-disable-next-line no-console
    console.log(`\n🎫 チケット一覧: ${projectId}`);
    // eslint-disable-next-line no-console
    console.log('═'.repeat(60));

    if (tickets.length === 0) {
      // eslint-disable-next-line no-console
      console.log('\n   チケットはありません');
      // eslint-disable-next-line no-console
      console.log(
        `   作成: npx tsx tools/cli/agentcompany.ts ticket create ${projectId} "指示内容"`
      );
    } else {
      // eslint-disable-next-line no-console
      console.log('');
      for (const ticket of tickets) {
        printTicketTree(ticket);
        // eslint-disable-next-line no-console
        console.log('');
      }
    }

    // eslint-disable-next-line no-console
    console.log('═'.repeat(60));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// statusサブコマンド
// =============================================================================

/**
 * チケット詳細を表示
 *
 * @param ticketId - チケットID
 *
 * @see Requirement 12.3: THE CLI SHALL support `agentcompany ticket status <ticket-id>`
 */
async function showTicketStatus(ticketId: string): Promise<void> {
  try {
    const manager = createTicketManager();

    // チケットIDからプロジェクトIDを抽出
    const projectId = extractProjectIdFromTicketId(ticketId);
    if (!projectId) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ 無効なチケットID形式: ${ticketId}`);
      process.exit(1);
    }

    // チケットを読み込み
    await manager.loadTickets(projectId);

    // チケットを取得（階層を判定）
    let ticket: ParentTicket | ChildTicket | GrandchildTicket | null = null;
    let ticketType: 'parent' | 'child' | 'grandchild' = 'parent';

    // 親チケットを試す
    ticket = await manager.getParentTicket(ticketId);
    if (!ticket) {
      // 子チケットを試す
      ticket = await manager.getChildTicket(ticketId);
      ticketType = 'child';
    }
    if (!ticket) {
      // 孫チケットを試す
      ticket = await manager.getGrandchildTicket(ticketId);
      ticketType = 'grandchild';
    }

    if (!ticket) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ チケットが見つかりません: ${ticketId}`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log('\n🎫 チケット詳細');
    // eslint-disable-next-line no-console
    console.log('═'.repeat(50));
    // eslint-disable-next-line no-console
    console.log(`\n   ID: ${ticket.id}`);
    // eslint-disable-next-line no-console
    console.log(`   タイプ: ${ticketType}`);
    // eslint-disable-next-line no-console
    console.log(`   ステータス: ${getStatusEmoji(ticket.status)} ${ticket.status}`);

    if (ticketType === 'parent') {
      const parentTicket = ticket as ParentTicket;
      // eslint-disable-next-line no-console
      console.log(`   プロジェクト: ${parentTicket.projectId}`);
      // eslint-disable-next-line no-console
      console.log(`   指示: ${parentTicket.instruction}`);
      // eslint-disable-next-line no-console
      console.log(`   子チケット数: ${parentTicket.childTickets.length}`);
      // eslint-disable-next-line no-console
      console.log(`   優先度: ${parentTicket.metadata.priority}`);
    } else if (ticketType === 'child') {
      const childTicket = ticket as ChildTicket;
      // eslint-disable-next-line no-console
      console.log(`   タイトル: ${childTicket.title}`);
      // eslint-disable-next-line no-console
      console.log(`   説明: ${childTicket.description}`);
      // eslint-disable-next-line no-console
      console.log(`   ワーカータイプ: ${childTicket.workerType}`);
      // eslint-disable-next-line no-console
      console.log(`   孫チケット数: ${childTicket.grandchildTickets.length}`);
    } else {
      const grandchildTicket = ticket as GrandchildTicket;
      // eslint-disable-next-line no-console
      console.log(`   タイトル: ${grandchildTicket.title}`);
      // eslint-disable-next-line no-console
      console.log(`   説明: ${grandchildTicket.description}`);
      if (grandchildTicket.assignee) {
        // eslint-disable-next-line no-console
        console.log(`   担当者: ${grandchildTicket.assignee}`);
      }
      if (grandchildTicket.gitBranch) {
        // eslint-disable-next-line no-console
        console.log(`   Gitブランチ: ${grandchildTicket.gitBranch}`);
      }
      if (grandchildTicket.acceptanceCriteria.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`   受け入れ基準:`);
        for (const criteria of grandchildTicket.acceptanceCriteria) {
          // eslint-disable-next-line no-console
          console.log(`     - ${criteria}`);
        }
      }
      if (grandchildTicket.artifacts.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`   成果物:`);
        for (const artifact of grandchildTicket.artifacts) {
          // eslint-disable-next-line no-console
          console.log(`     - ${artifact}`);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(`   作成日時: ${ticket.createdAt}`);
    // eslint-disable-next-line no-console
    console.log(`   更新日時: ${ticket.updatedAt}`);

    // 関連する実行状態を確認
    const executionData = await manager.getExecutionDataForTicket(ticketId);
    if (executionData) {
      // eslint-disable-next-line no-console
      console.log(`\n   📊 実行状態:`);
      // eslint-disable-next-line no-console
      console.log(`      実行ID: ${executionData.runId}`);
      // eslint-disable-next-line no-console
      console.log(`      実行ステータス: ${executionData.status}`);
      // eslint-disable-next-line no-console
      console.log(`      ワーカー数: ${Object.keys(executionData.workerStates).length}`);
      // eslint-disable-next-line no-console
      console.log(`      会話履歴数: ${Object.keys(executionData.conversationHistories).length}`);
    }

    // eslint-disable-next-line no-console
    console.log('\n' + '═'.repeat(50));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// pauseサブコマンド
// =============================================================================

/**
 * チケット実行を一時停止
 *
 * @param ticketId - チケットID
 *
 * @see Requirement 12.4: THE CLI SHALL support `agentcompany ticket pause <ticket-id>`
 */
async function pauseTicket(ticketId: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n⏸️ チケット実行を一時停止: ${ticketId}`);

  try {
    const manager = createTicketManager();

    // チケットIDからプロジェクトIDを抽出
    const projectId = extractProjectIdFromTicketId(ticketId);
    if (!projectId) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ 無効なチケットID形式: ${ticketId}`);
      process.exit(1);
    }

    // チケットを読み込み
    await manager.loadTickets(projectId);

    // 一時停止
    const result = await manager.pauseTicket(ticketId);

    if (result.success) {
      // eslint-disable-next-line no-console
      console.log(`\n✅ ${result.message}`);
      if (result.runId) {
        // eslint-disable-next-line no-console
        console.log(`   実行ID: ${result.runId}`);
      }
      if (result.savedWorkerStates && result.savedWorkerStates.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`   保存されたワーカー状態: ${result.savedWorkerStates.join(', ')}`);
      }
      if (result.savedConversationHistories && result.savedConversationHistories.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`   保存された会話履歴: ${result.savedConversationHistories.join(', ')}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n❌ ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// resumeサブコマンド
// =============================================================================

/**
 * チケット実行を再開
 *
 * @param ticketId - チケットID
 *
 * @see Requirement 12.5: THE CLI SHALL support `agentcompany ticket resume <ticket-id>`
 */
async function resumeTicket(ticketId: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n▶️ チケット実行を再開: ${ticketId}`);

  try {
    const manager = createTicketManager();

    // チケットIDからプロジェクトIDを抽出
    const projectId = extractProjectIdFromTicketId(ticketId);
    if (!projectId) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ 無効なチケットID形式: ${ticketId}`);
      process.exit(1);
    }

    // チケットを読み込み
    await manager.loadTickets(projectId);

    // 再開
    const result = await manager.resumeTicket(ticketId);

    if (result.success) {
      // eslint-disable-next-line no-console
      console.log(`\n✅ ${result.message}`);
      if (result.runId) {
        // eslint-disable-next-line no-console
        console.log(`   実行ID: ${result.runId}`);
      }
      if (result.restoredWorkerStates && result.restoredWorkerStates.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`   復元されたワーカー状態: ${result.restoredWorkerStates.join(', ')}`);
      }
      if (result.restoredConversationHistories && result.restoredConversationHistories.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`   復元された会話履歴: ${result.restoredConversationHistories.join(', ')}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n❌ ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// ユーティリティ
// =============================================================================

/**
 * チケットIDからプロジェクトIDを抽出
 *
 * @param ticketId - チケットID
 * @returns プロジェクトID（抽出できない場合はnull）
 */
function extractProjectIdFromTicketId(ticketId: string): string | null {
  // 形式: <project-id>-<sequence>[-<sequence>[-<sequence>]]
  // 最初の4桁シーケンスの前までがプロジェクトID
  const match = ticketId.match(/^(.+)-\d{4}/);
  return match ? match[1] : null;
}

// =============================================================================
// エントリポイント
// =============================================================================

/**
 * ticketコマンドのエントリポイント
 *
 * @param args - コマンドライン引数
 */
export async function handleTicketCommand(args: string[]): Promise<void> {
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showTicketHelp();
    return;
  }

  // サブコマンドの判定
  const subCommand = args[0];

  switch (subCommand) {
    case 'create': {
      const projectId = args[1];
      const instruction = args.slice(2).join(' ');

      if (!projectId || projectId.startsWith('--')) {
        // eslint-disable-next-line no-console
        console.error('エラー: プロジェクトIDを指定してください。');
        showTicketHelp();
        process.exit(1);
      }
      if (!instruction) {
        // eslint-disable-next-line no-console
        console.error('エラー: 指示内容を指定してください。');
        showTicketHelp();
        process.exit(1);
      }

      await createTicket(projectId, instruction);
      break;
    }

    case 'list': {
      const projectId = args[1];

      if (!projectId || projectId.startsWith('--')) {
        // eslint-disable-next-line no-console
        console.error('エラー: プロジェクトIDを指定してください。');
        showTicketHelp();
        process.exit(1);
      }

      const options = parseListOptions(args.slice(2));
      await listTickets(projectId, options);
      break;
    }

    case 'status': {
      const ticketId = args[1];

      if (!ticketId || ticketId.startsWith('--')) {
        // eslint-disable-next-line no-console
        console.error('エラー: チケットIDを指定してください。');
        showTicketHelp();
        process.exit(1);
      }

      await showTicketStatus(ticketId);
      break;
    }

    case 'pause': {
      const ticketId = args[1];

      if (!ticketId || ticketId.startsWith('--')) {
        // eslint-disable-next-line no-console
        console.error('エラー: チケットIDを指定してください。');
        showTicketHelp();
        process.exit(1);
      }

      await pauseTicket(ticketId);
      break;
    }

    case 'resume': {
      const ticketId = args[1];

      if (!ticketId || ticketId.startsWith('--')) {
        // eslint-disable-next-line no-console
        console.error('エラー: チケットIDを指定してください。');
        showTicketHelp();
        process.exit(1);
      }

      await resumeTicket(ticketId);
      break;
    }

    default:
      // eslint-disable-next-line no-console
      console.error(`不明なサブコマンド: ${subCommand}`);
      showTicketHelp();
      process.exit(1);
  }
}
