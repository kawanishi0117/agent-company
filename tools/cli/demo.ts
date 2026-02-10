#!/usr/bin/env node
/**
 * AgentCompany Demo Script
 * Ollamaを使ってMVPの機能をデモンストレーション
 */

import { createOllamaAdapter } from '../adapters/ollama.js';

// カラー出力用
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color = colors.reset): void {
  // eslint-disable-next-line no-console
  console.log(`${color}${message}${colors.reset}`);
}

function header(title: string): void {
  log('\n' + '='.repeat(60), colors.cyan);
  log(`  ${title}`, colors.bright + colors.cyan);
  log('='.repeat(60), colors.cyan);
}

/**
 * Ollamaの接続確認
 */
async function checkOllamaConnection(): Promise<boolean> {
  header('1. Ollama接続確認');

  const adapter = createOllamaAdapter();
  const available = await adapter.isAvailable();

  if (available) {
    log('✅ Ollamaに接続できました', colors.green);

    const models = await adapter.listModels();
    if (models.length > 0) {
      log(`\n利用可能なモデル:`, colors.yellow);
      models.forEach((m) => log(`  - ${m}`));
    } else {
      log('\n⚠️  モデルがインストールされていません', colors.yellow);
      log('以下のコマンドでモデルをインストールしてください:', colors.yellow);
      log('  docker exec agentcompany-ollama ollama pull llama3.2:1b', colors.cyan);
    }
    return true;
  } else {
    log('❌ Ollamaに接続できません', colors.red);
    log('\n以下を確認してください:', colors.yellow);
    log('  1. docker compose up -d でコンテナを起動', colors.reset);
    log('  2. docker logs agentcompany-ollama でログを確認', colors.reset);
    return false;
  }
}

/**
 * 簡単なテキスト生成デモ
 */
async function demoGenerate(model: string): Promise<void> {
  header('2. テキスト生成デモ');

  const adapter = createOllamaAdapter();

  log(`モデル: ${model}`, colors.yellow);
  log('プロンプト: "Hello, I am AgentCompany. Please introduce yourself briefly."', colors.yellow);
  log('\n生成中...', colors.cyan);

  try {
    const response = await adapter.generate({
      model,
      prompt: 'Hello, I am AgentCompany. Please introduce yourself briefly.',
      system: 'You are a helpful AI assistant working for AgentCompany.',
      temperature: 0.7,
      maxTokens: 200,
    });

    log('\n--- 生成結果 ---', colors.green);
    log(response.content);
    log(`\n使用トークン: ${response.tokensUsed || 'N/A'}`, colors.cyan);
  } catch (error) {
    log(`❌ エラー: ${error instanceof Error ? error.message : error}`, colors.red);
  }
}

/**
 * チャット形式のデモ
 */
async function demoChat(model: string): Promise<void> {
  header('3. チャット形式デモ');

  const adapter = createOllamaAdapter();

  log(`モデル: ${model}`, colors.yellow);
  log('\n会話履歴:', colors.yellow);
  log('  User: What is AgentCompany?', colors.reset);
  log('  Assistant: AgentCompany is a framework for running AI agents...', colors.reset);
  log('  User: How can I use it?', colors.reset);
  log('\n生成中...', colors.cyan);

  try {
    const response = await adapter.chat({
      model,
      messages: [
        { role: 'user', content: 'What is AgentCompany?' },
        {
          role: 'assistant',
          content:
            'AgentCompany is a framework for running AI agents as a company organization with governance and quality gates.',
        },
        { role: 'user', content: 'How can I use it?' },
      ],
      temperature: 0.7,
      maxTokens: 300,
    });

    log('\n--- 応答 ---', colors.green);
    log(response.content);
    log(`\n使用トークン: ${response.tokensUsed || 'N/A'}`, colors.cyan);
  } catch (error) {
    log(`❌ エラー: ${error instanceof Error ? error.message : error}`, colors.red);
  }
}

/**
 * コードレビューのデモ
 */
async function demoCodeReview(model: string): Promise<void> {
  header('4. コードレビューデモ（Quality Authority風）');

  const adapter = createOllamaAdapter();

  const sampleCode = `
function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}
`;

  log(`モデル: ${model}`, colors.yellow);
  log('\nレビュー対象コード:', colors.yellow);
  log(sampleCode, colors.reset);
  log('レビュー中...', colors.cyan);

  try {
    const response = await adapter.generate({
      model,
      prompt: `Review this JavaScript code and provide feedback:\n\n${sampleCode}\n\nProvide a brief code review with suggestions for improvement.`,
      system:
        'You are a Quality Authority at AgentCompany. Review code for quality, readability, and best practices. Be concise.',
      temperature: 0.3,
      maxTokens: 400,
    });

    log('\n--- レビュー結果 ---', colors.green);
    log(response.content);
  } catch (error) {
    log(`❌ エラー: ${error instanceof Error ? error.message : error}`, colors.red);
  }
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  log('\n🏢 AgentCompany MVP Demo', colors.bright + colors.blue);
  log('Ollamaを使ったAIエージェント機能のデモンストレーション\n', colors.blue);

  // 接続確認
  const connected = await checkOllamaConnection();
  if (!connected) {
    process.exit(1);
  }

  // モデル取得
  const adapter = createOllamaAdapter();
  const models = await adapter.listModels();

  if (models.length === 0) {
    log('\n⚠️  モデルをインストールしてから再実行してください', colors.yellow);
    log('\n推奨モデル（軽量）:', colors.cyan);
    log('  docker exec agentcompany-ollama ollama pull llama3.2:1b', colors.reset);
    log('  docker exec agentcompany-ollama ollama pull qwen2.5-coder:1.5b', colors.reset);
    log('\n推奨モデル（高性能）:', colors.cyan);
    log('  docker exec agentcompany-ollama ollama pull llama3.2:3b', colors.reset);
    log('  docker exec agentcompany-ollama ollama pull codellama:7b', colors.reset);
    process.exit(0);
  }

  // 最初のモデルを使用
  const model = models[0];
  log(`\n使用モデル: ${model}`, colors.bright + colors.green);

  // デモ実行
  await demoGenerate(model);
  await demoChat(model);
  await demoCodeReview(model);

  header('デモ完了');
  log('✅ すべてのデモが完了しました！', colors.green);
  log('\n次のステップ:', colors.yellow);
  log('  1. GUIを起動: cd gui/web && npm run dev', colors.reset);
  log(
    '  2. チケット実行: npx tsx tools/cli/agentcompany.ts run workflows/backlog/0001-sample.md',
    colors.reset
  );
  log('  3. 採用プロセス: npx tsx tools/cli/agentcompany.ts hire jd "Developer"', colors.reset);
}

// 実行
main().catch((error) => {
  log(`\n❌ 予期しないエラー: ${error}`, colors.red);
  process.exit(1);
});
