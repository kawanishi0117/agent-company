/**
 * Workflow Engine
 * チケットの Plan → Run → Report ワークフローを実行
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Ticket, updateTicketStatus } from './ticket.js';
import { OllamaAdapter, createOllamaAdapter } from '../adapters/ollama.js';

/**
 * 実行計画
 */
export interface Plan {
  ticketId: string;
  steps: PlanStep[];
  createdAt: string;
}

/**
 * 計画ステップ
 */
export interface PlanStep {
  order: number;
  description: string;
  assignee: string;
}

/**
 * 実行結果
 */
export interface RunResult {
  runId: string;
  ticketId: string;
  startTime: string;
  endTime: string;
  status: 'success' | 'failure' | 'partial';
  logs: string[];
  artifacts: string[];
}

/**
 * レポート
 */
export interface Report {
  ticketId: string;
  runId: string;
  summary: string;
  details: string;
  createdAt: string;
}

/**
 * ランIDを生成
 */
function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toISOString().split('T')[1].replace(/[:.]/g, '').slice(0, 6);
  const random = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${random}`;
}

/**
 * 最小ワークフローエンジン
 */
export class MinimalWorkflow {
  private adapter: OllamaAdapter;
  private runsDir: string;
  private useAI: boolean;

  constructor(runsDir = 'runtime/runs', useAI = false) {
    this.adapter = createOllamaAdapter();
    this.runsDir = runsDir;
    this.useAI = useAI;
  }

  /**
   * チケットから実行計画を生成
   */
  async plan(ticket: Ticket): Promise<Plan> {
    const steps: PlanStep[] = [];

    // DoDから計画ステップを生成
    ticket.dod.forEach((item, index) => {
      steps.push({
        order: index + 1,
        description: item,
        assignee: ticket.assignee || 'coo_pm',
      });
    });

    // AIを使う場合は追加の計画を生成
    if (this.useAI && (await this.adapter.isAvailable())) {
      try {
        const response = await this.adapter.generate({
          model: 'llama3.2:1b',
          prompt: `以下のチケットの実行計画を立ててください。

タイトル: ${ticket.title}
目的: ${ticket.purpose}
DoD: ${ticket.dod.join(', ')}

簡潔に3-5ステップで計画を出力してください。`,
          system: 'あなたはプロジェクトマネージャーです。簡潔に計画を立ててください。',
        });

        // AIの出力をログに追加（計画には反映しない）
        // eslint-disable-next-line no-console
        console.log('AI Plan Suggestion:', response.content);
      } catch {
        // AIが使えない場合は無視
      }
    }

    const plan: Plan = {
      ticketId: ticket.id,
      steps,
      createdAt: new Date().toISOString(),
    };

    return plan;
  }

  /**
   * 計画を実行
   */
  async run(ticket: Ticket, plan: Plan): Promise<RunResult> {
    const runId = generateRunId();
    const startTime = new Date().toISOString();
    const logs: string[] = [];
    const artifacts: string[] = [];

    // ステータスを doing に更新
    updateTicketStatus(ticket, 'doing');
    logs.push(`[${new Date().toISOString()}] チケット ${ticket.id} の実行を開始`);

    // 各ステップを実行（シミュレーション）
    for (const step of plan.steps) {
      logs.push(`[${new Date().toISOString()}] Step ${step.order}: ${step.description}`);

      // 実際の実行はここで行う（MVPでは空実装）
      logs.push(`[${new Date().toISOString()}] Step ${step.order} 完了`);
    }

    const endTime = new Date().toISOString();

    // 実行結果を保存
    const runDir = join(this.runsDir, runId);
    if (!existsSync(runDir)) {
      mkdirSync(runDir, { recursive: true });
    }

    const logsPath = join(runDir, 'logs.txt');
    writeFileSync(logsPath, logs.join('\n'), 'utf-8');
    artifacts.push(logsPath);

    // ステータスを review に更新
    updateTicketStatus(ticket, 'review');

    const result: RunResult = {
      runId,
      ticketId: ticket.id,
      startTime,
      endTime,
      status: 'success',
      logs,
      artifacts,
    };

    // 結果をJSONで保存
    const resultPath = join(runDir, 'result.json');
    writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');
    artifacts.push(resultPath);

    return result;
  }

  /**
   * 実行結果からレポートを生成
   */
  async report(ticket: Ticket, result: RunResult): Promise<Report> {
    const summary = `チケット ${ticket.id} (${ticket.title}) の実行が完了しました。`;

    const details = `
# 実行レポート

## 概要
- チケットID: ${ticket.id}
- タイトル: ${ticket.title}
- 実行ID: ${result.runId}
- ステータス: ${result.status}

## 実行時間
- 開始: ${result.startTime}
- 終了: ${result.endTime}

## ログ
${result.logs.map((l) => `- ${l}`).join('\n')}

## 成果物
${result.artifacts.map((a) => `- ${a}`).join('\n')}
`.trim();

    const report: Report = {
      ticketId: ticket.id,
      runId: result.runId,
      summary,
      details,
      createdAt: new Date().toISOString(),
    };

    // レポートを保存
    const runDir = join(this.runsDir, result.runId);
    const reportPath = join(runDir, 'report.md');
    writeFileSync(reportPath, details, 'utf-8');

    // ステータスを done に更新
    updateTicketStatus(ticket, 'done');

    return report;
  }

  /**
   * ワークフロー全体を実行
   */
  async execute(ticket: Ticket): Promise<Report> {
    // eslint-disable-next-line no-console
    console.log(`\n=== ワークフロー開始: ${ticket.id} ===\n`);

    // Plan
    // eslint-disable-next-line no-console
    console.log('📋 Plan フェーズ...');
    const plan = await this.plan(ticket);
    // eslint-disable-next-line no-console
    console.log(`  ${plan.steps.length} ステップの計画を生成`);

    // Run
    // eslint-disable-next-line no-console
    console.log('\n🚀 Run フェーズ...');
    const result = await this.run(ticket, plan);
    // eslint-disable-next-line no-console
    console.log(`  実行ID: ${result.runId}`);
    // eslint-disable-next-line no-console
    console.log(`  ステータス: ${result.status}`);

    // Report
    // eslint-disable-next-line no-console
    console.log('\n📝 Report フェーズ...');
    const report = await this.report(ticket, result);
    // eslint-disable-next-line no-console
    console.log(`  レポート生成完了`);

    // eslint-disable-next-line no-console
    console.log(`\n=== ワークフロー完了: ${ticket.id} ===\n`);

    return report;
  }
}
