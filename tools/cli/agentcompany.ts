#!/usr/bin/env node
/**
 * AgentCompany CLI
 * メインエントリポイント
 */

import { parseTicket, loadAllTickets, formatTicket } from './ticket.js';
import { MinimalWorkflow } from './workflow.js';
import { validateAgentFile } from './validator.js';
import { validateDeliverableFile, formatValidationResult } from './deliverable-validator.js';

// コマンドライン引数
const args = process.argv.slice(2);
const command = args[0];

/**
 * ヘルプを表示
 */
function showHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
AgentCompany CLI

使用方法:
  agentcompany <command> [options]

コマンド:
  run <ticket-path>       チケットのワークフローを実行
  list                    バックログのチケット一覧を表示
  validate-agent <path>   エージェント定義を検証
  validate-deliverable <path>  成果物を検証
  help                    このヘルプを表示

例:
  agentcompany run workflows/backlog/0001-sample.md
  agentcompany list
  agentcompany validate-agent agents/registry/coo_pm.yaml
`);
}

/**
 * チケットのワークフローを実行
 */
async function runWorkflow(ticketPath: string): Promise<void> {
  try {
    const ticket = parseTicket(ticketPath);
    // eslint-disable-next-line no-console
    console.log(`チケットを読み込みました: ${formatTicket(ticket)}`);

    const workflow = new MinimalWorkflow();
    const report = await workflow.execute(ticket);

    // eslint-disable-next-line no-console
    console.log('\n--- レポート ---');
    // eslint-disable-next-line no-console
    console.log(report.details);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('エラー:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * チケット一覧を表示
 */
function listTickets(): void {
  try {
    const tickets = loadAllTickets('workflows/backlog');
    
    if (tickets.length === 0) {
      // eslint-disable-next-line no-console
      console.log('チケットがありません。');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('バックログ:');
    // eslint-disable-next-line no-console
    console.log('---');
    
    const statusOrder = ['todo', 'doing', 'review', 'done'];
    for (const status of statusOrder) {
      const filtered = tickets.filter((t) => t.status === status);
      if (filtered.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`\n[${status.toUpperCase()}]`);
        for (const ticket of filtered) {
          // eslint-disable-next-line no-console
          console.log(`  ${formatTicket(ticket)}`);
        }
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('エラー:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * エージェント定義を検証
 */
function validateAgent(filePath: string): void {
  const result = validateAgentFile(filePath);
  
  if (result.valid) {
    // eslint-disable-next-line no-console
    console.log('✅ エージェント定義は有効です。');
  } else {
    // eslint-disable-next-line no-console
    console.log('❌ エージェント定義にエラーがあります:');
    for (const error of result.errors) {
      // eslint-disable-next-line no-console
      console.log(`  - ${error}`);
    }
    process.exit(1);
  }
}

/**
 * 成果物を検証
 */
function validateDeliverable(filePath: string): void {
  const result = validateDeliverableFile(filePath);
  // eslint-disable-next-line no-console
  console.log(formatValidationResult(result));
  
  if (result.judgment === 'FAIL') {
    process.exit(1);
  }
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  switch (command) {
    case 'run':
      if (!args[1]) {
        // eslint-disable-next-line no-console
        console.error('エラー: チケットパスを指定してください。');
        process.exit(1);
      }
      await runWorkflow(args[1]);
      break;

    case 'list':
      listTickets();
      break;

    case 'validate-agent':
      if (!args[1]) {
        // eslint-disable-next-line no-console
        console.error('エラー: ファイルパスを指定してください。');
        process.exit(1);
      }
      validateAgent(args[1]);
      break;

    case 'validate-deliverable':
      if (!args[1]) {
        // eslint-disable-next-line no-console
        console.error('エラー: ファイルパスを指定してください。');
        process.exit(1);
      }
      validateDeliverable(args[1]);
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      if (command) {
        // eslint-disable-next-line no-console
        console.error(`不明なコマンド: ${command}`);
      }
      showHelp();
      process.exit(command ? 1 : 0);
  }
}

// 実行
main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('予期しないエラー:', error);
  process.exit(1);
});
