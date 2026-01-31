/**
 * 試用実行（Trial Runner）モジュール
 *
 * 採用システムにおける試用実行機能を提供
 * - 候補エージェントで試用実行
 * - 出力・ログ・成果物のキャプチャ
 * - 実行時間・リソース使用量の記録
 * - 予算超過時のタイムアウト処理
 *
 * @module hiring/trial-runner
 *
 * Validates: Requirements 4.1, 4.3, 4.4, 4.5
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TrialRunOptions, TrialRunResult } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのタイムアウト（分）
 * @description 試用実行のデフォルト制限時間
 */
const DEFAULT_TIMEOUT_MINUTES = 30;

/**
 * デフォルトのトークン予算
 * @description 試用実行のデフォルトトークン上限
 */
const DEFAULT_TOKEN_BUDGET = 30000;

/**
 * 試用実行ディレクトリ名
 * @description 成果物を保存するサブディレクトリ名
 */
const TRIAL_DIR_NAME = 'trial';

/**
 * ログファイル名
 * @description 試用実行ログのファイル名
 */
const LOG_FILE_NAME = 'trial.log';

/**
 * 結果ファイル名
 * @description 試用実行結果のJSONファイル名
 */
const RESULT_FILE_NAME = 'trial_result.json';

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 一意の実行IDを生成する
 * @returns 生成された実行ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `trial-${timestamp}-${random}`;
}

/**
 * ISO8601形式の現在時刻を取得する
 * @returns ISO8601形式の時刻文字列
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 2つの時刻間の経過時間（分）を計算する
 * @param startTime - 開始時刻（ISO8601形式）
 * @param endTime - 終了時刻（ISO8601形式）
 * @returns 経過時間（分）
 */
function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return (end - start) / (1000 * 60);
}

/**
 * 候補エージェント定義からIDを抽出する
 * @param candidatePath - 候補エージェント定義ファイルパス
 * @returns エージェントID
 */
function extractCandidateId(candidatePath: string): string {
  // ファイル名から拡張子を除いた部分をIDとして使用
  const fileName = path.basename(candidatePath);
  const id = fileName.replace(/\.(yaml|yml|json)$/i, '');
  return id || 'unknown-candidate';
}

/**
 * 面接課題からIDを抽出する
 * @param taskPath - 面接課題ファイルパス
 * @returns 課題ID
 */
function extractTaskId(taskPath: string): string {
  // ファイルを読み込んでIDを抽出
  try {
    if (fs.existsSync(taskPath)) {
      const content = fs.readFileSync(taskPath, 'utf-8');
      // Task ID: xxx 形式を探す
      const match = content.match(/Task ID:\s*([^\s\n]+)/);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // エラー時はファイル名ベースのIDを使用
  }

  // ファイル名から生成
  const fileName = path.basename(taskPath);
  return fileName.replace(/\.(md|json)$/i, '') || 'unknown-task';
}

/**
 * 面接課題から予算情報を抽出する
 * @param taskPath - 面接課題ファイルパス
 * @returns 予算情報（制限時間）
 */
function extractTaskBudget(taskPath: string): { timeLimit: number } {
  try {
    if (fs.existsSync(taskPath)) {
      const content = fs.readFileSync(taskPath, 'utf-8');
      // 制限時間: xx分 形式を探す
      const match = content.match(/制限時間:\s*(\d+)/);
      if (match) {
        return { timeLimit: parseInt(match[1], 10) };
      }
    }
  } catch {
    // エラー時はデフォルト値を使用
  }

  return { timeLimit: DEFAULT_TIMEOUT_MINUTES };
}

/**
 * ディレクトリを再帰的に作成する
 * @param dirPath - 作成するディレクトリパス
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * ログエントリを追加する
 * @param logPath - ログファイルパス
 * @param message - ログメッセージ
 * @param level - ログレベル
 */
function appendLog(
  logPath: string,
  message: string,
  level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'
): void {
  const timestamp = getCurrentTimestamp();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;

  fs.appendFileSync(logPath, logEntry, 'utf-8');
}

/**
 * 試用実行結果をJSONファイルに保存する
 * @param result - 試用実行結果
 * @param outputPath - 出力ファイルパス
 */
function saveTrialResult(result: TrialRunResult, outputPath: string): void {
  const jsonContent = JSON.stringify(result, null, 2);
  fs.writeFileSync(outputPath, jsonContent, 'utf-8');
}

// =============================================================================
// 試用実行シミュレーション
// =============================================================================

/**
 * 試用実行をシミュレートする（MVP版）
 *
 * 実際のDocker実行は後で追加予定。
 * 現在はシミュレーションとして、成果物の生成とリソース使用量の記録を行う。
 *
 * @param candidatePath - 候補エージェント定義パス
 * @param taskPath - 面接課題パス
 * @param trialDir - 試用実行ディレクトリ
 * @param logPath - ログファイルパス
 * @param timeout - タイムアウト（分）
 * @returns シミュレーション結果
 */
async function simulateTrialExecution(
  candidatePath: string,
  taskPath: string,
  trialDir: string,
  logPath: string,
  timeout: number
): Promise<{
  status: TrialRunResult['status'];
  outputs: string[];
  tokensUsed: number;
  timeUsed: number;
  failureReason?: string;
}> {
  // ログ開始
  appendLog(logPath, `試用実行を開始します`);
  appendLog(logPath, `候補エージェント: ${candidatePath}`);
  appendLog(logPath, `面接課題: ${taskPath}`);
  appendLog(logPath, `タイムアウト: ${timeout}分`);

  // 候補エージェント定義の存在チェック
  if (!fs.existsSync(candidatePath)) {
    appendLog(logPath, `候補エージェント定義が見つかりません: ${candidatePath}`, 'ERROR');
    return {
      status: 'failed',
      outputs: [],
      tokensUsed: 0,
      timeUsed: 0,
      failureReason: `CandidateNotFound: 候補エージェント定義が存在しません: ${candidatePath}`,
    };
  }

  // 面接課題の存在チェック
  if (!fs.existsSync(taskPath)) {
    appendLog(logPath, `面接課題が見つかりません: ${taskPath}`, 'ERROR');
    return {
      status: 'failed',
      outputs: [],
      tokensUsed: 0,
      timeUsed: 0,
      failureReason: `TaskNotFound: 面接課題が存在しません: ${taskPath}`,
    };
  }

  // 候補エージェント定義を読み込み
  appendLog(logPath, `候補エージェント定義を読み込み中...`);
  const candidateContent = fs.readFileSync(candidatePath, 'utf-8');

  // 面接課題を読み込み
  appendLog(logPath, `面接課題を読み込み中...`);
  const taskContent = fs.readFileSync(taskPath, 'utf-8');

  // シミュレーション: 実行時間とトークン使用量を計算
  // 実際のDocker実行では、ここで実際の値が計測される
  const simulatedTimeUsed = Math.min(
    Math.random() * timeout * 0.8 + timeout * 0.1, // 10%〜90%の時間を使用
    timeout
  );
  const simulatedTokensUsed = Math.floor(
    Math.random() * DEFAULT_TOKEN_BUDGET * 0.7 + DEFAULT_TOKEN_BUDGET * 0.1
  );

  // 予算超過チェック
  if (simulatedTimeUsed >= timeout) {
    appendLog(logPath, `タイムアウト: 制限時間 ${timeout}分 を超過しました`, 'WARN');
    return {
      status: 'timeout',
      outputs: [],
      tokensUsed: simulatedTokensUsed,
      timeUsed: timeout,
      failureReason: `BudgetExceeded: 制限時間 ${timeout}分 を超過しました`,
    };
  }

  // シミュレーション: 成果物を生成
  appendLog(logPath, `成果物を生成中...`);
  const outputs: string[] = [];

  // 実行サマリーを生成
  const summaryPath = path.join(trialDir, 'execution_summary.md');
  const summaryContent = generateExecutionSummary(
    candidatePath,
    taskPath,
    simulatedTimeUsed,
    simulatedTokensUsed
  );
  fs.writeFileSync(summaryPath, summaryContent, 'utf-8');
  outputs.push(summaryPath);
  appendLog(logPath, `実行サマリーを生成: ${summaryPath}`);

  // 候補エージェント定義のコピー
  const candidateCopyPath = path.join(trialDir, 'candidate_definition.yaml');
  fs.writeFileSync(candidateCopyPath, candidateContent, 'utf-8');
  outputs.push(candidateCopyPath);
  appendLog(logPath, `候補エージェント定義をコピー: ${candidateCopyPath}`);

  // 面接課題のコピー
  const taskCopyPath = path.join(trialDir, 'interview_task.md');
  fs.writeFileSync(taskCopyPath, taskContent, 'utf-8');
  outputs.push(taskCopyPath);
  appendLog(logPath, `面接課題をコピー: ${taskCopyPath}`);

  // 完了ログ
  appendLog(logPath, `試用実行が完了しました`);
  appendLog(logPath, `使用時間: ${simulatedTimeUsed.toFixed(2)}分`);
  appendLog(logPath, `使用トークン: ${simulatedTokensUsed}`);

  return {
    status: 'completed',
    outputs,
    tokensUsed: simulatedTokensUsed,
    timeUsed: simulatedTimeUsed,
  };
}

/**
 * 実行サマリーを生成する
 * @param candidatePath - 候補エージェント定義パス
 * @param taskPath - 面接課題パス
 * @param timeUsed - 使用時間（分）
 * @param tokensUsed - 使用トークン数
 * @returns サマリーのMarkdown文字列
 */
function generateExecutionSummary(
  candidatePath: string,
  taskPath: string,
  timeUsed: number,
  tokensUsed: number
): string {
  const lines: string[] = [];

  lines.push('# 試用実行サマリー');
  lines.push('');
  lines.push(`> 生成日時: ${getCurrentTimestamp()}`);
  lines.push('');

  lines.push('## 実行情報');
  lines.push('');
  lines.push(`| 項目 | 値 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 候補エージェント | ${path.basename(candidatePath)} |`);
  lines.push(`| 面接課題 | ${path.basename(taskPath)} |`);
  lines.push(`| 使用時間 | ${timeUsed.toFixed(2)}分 |`);
  lines.push(`| 使用トークン | ${tokensUsed.toLocaleString()} |`);
  lines.push('');

  lines.push('## 実行ステータス');
  lines.push('');
  lines.push('試用実行は正常に完了しました。');
  lines.push('');

  lines.push('## 注意事項');
  lines.push('');
  lines.push('- このサマリーはMVP版のシミュレーション結果です');
  lines.push('- 実際のDocker実行は後続バージョンで実装予定です');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*このサマリーはTrial Runnerによって自動生成されました。*');

  return lines.join('\n');
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * 試用実行を行う
 *
 * 候補エージェントに面接課題を実行させ、その結果を記録する。
 * 出力・ログ・成果物は `runtime/runs/<run-id>/trial/` に保存される。
 *
 * @param options - 試用実行オプション
 * @returns 試用実行結果
 * @throws Error - 候補エージェント定義または面接課題が存在しない場合
 *
 * @example
 * ```typescript
 * const result = await runTrial({
 *   candidatePath: 'agents/candidates/new_developer.yaml',
 *   taskPath: 'runtime/runs/run-001/interview_task.md',
 *   outputDir: 'runtime/runs/run-001',
 *   timeout: 30,
 * });
 * ```
 *
 * Validates: Requirements 4.1, 4.3, 4.4, 4.5
 */
export async function runTrial(options: TrialRunOptions): Promise<TrialRunResult> {
  const { candidatePath, taskPath, outputDir, timeout } = options;

  // 実行IDを生成
  const runId = generateRunId();

  // 候補エージェントIDを抽出
  const candidateId = extractCandidateId(candidatePath);

  // 課題IDを抽出
  const taskId = extractTaskId(taskPath);

  // タイムアウトを決定（オプション > 課題の制限時間 > デフォルト）
  const taskBudget = extractTaskBudget(taskPath);
  const effectiveTimeout = timeout ?? taskBudget.timeLimit ?? DEFAULT_TIMEOUT_MINUTES;

  // 試用実行ディレクトリを作成
  const trialDir = path.join(outputDir, TRIAL_DIR_NAME);
  ensureDirectoryExists(trialDir);

  // ログファイルパスを設定
  const logPath = path.join(trialDir, LOG_FILE_NAME);

  // ログファイルを初期化
  const logHeader = [
    '# 試用実行ログ',
    '',
    `Run ID: ${runId}`,
    `Candidate ID: ${candidateId}`,
    `Task ID: ${taskId}`,
    '',
    '---',
    '',
  ].join('\n');
  fs.writeFileSync(logPath, logHeader, 'utf-8');

  // 開始時刻を記録
  const startTime = getCurrentTimestamp();
  appendLog(logPath, `試用実行を開始: Run ID = ${runId}`);

  // 試用実行をシミュレート
  const simulationResult = await simulateTrialExecution(
    candidatePath,
    taskPath,
    trialDir,
    logPath,
    effectiveTimeout
  );

  // 終了時刻を記録
  const endTime = getCurrentTimestamp();

  // 実行時間を計算
  const durationMinutes = calculateDurationMinutes(startTime, endTime);

  // 試用実行結果を構築
  const result: TrialRunResult = {
    runId,
    candidateId,
    taskId,
    status: simulationResult.status,
    startTime,
    endTime,
    durationMinutes,
    outputs: simulationResult.outputs,
    logs: logPath,
    resourceUsage: {
      tokensUsed: simulationResult.tokensUsed,
      timeUsed: simulationResult.timeUsed,
    },
  };

  // 失敗理由がある場合はログに記録
  if (simulationResult.failureReason) {
    appendLog(logPath, `失敗理由: ${simulationResult.failureReason}`, 'ERROR');
  }

  // 結果をJSONファイルに保存
  const resultPath = path.join(trialDir, RESULT_FILE_NAME);
  saveTrialResult(result, resultPath);
  appendLog(logPath, `試用実行結果を保存: ${resultPath}`);

  // 最終ログ
  appendLog(logPath, `試用実行を終了: ステータス = ${result.status}`);

  return result;
}

/**
 * 試用実行結果を人間可読形式でフォーマットする
 *
 * @param result - 試用実行結果
 * @returns フォーマットされた文字列
 */
export function formatTrialResultAsReadable(result: TrialRunResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('試用実行結果');
  lines.push('='.repeat(60));
  lines.push('');

  lines.push(`Run ID:        ${result.runId}`);
  lines.push(`Candidate ID:  ${result.candidateId}`);
  lines.push(`Task ID:       ${result.taskId}`);
  lines.push(`Status:        ${formatStatus(result.status)}`);
  lines.push('');

  lines.push('-'.repeat(60));
  lines.push('実行時間');
  lines.push('-'.repeat(60));
  lines.push(`開始時刻:      ${result.startTime}`);
  lines.push(`終了時刻:      ${result.endTime}`);
  lines.push(`実行時間:      ${result.durationMinutes.toFixed(2)}分`);
  lines.push('');

  lines.push('-'.repeat(60));
  lines.push('リソース使用量');
  lines.push('-'.repeat(60));
  lines.push(`使用トークン:  ${result.resourceUsage.tokensUsed.toLocaleString()}`);
  lines.push(`使用時間:      ${result.resourceUsage.timeUsed.toFixed(2)}分`);
  lines.push('');

  lines.push('-'.repeat(60));
  lines.push('出力ファイル');
  lines.push('-'.repeat(60));
  for (const output of result.outputs) {
    lines.push(`  - ${output}`);
  }
  lines.push('');

  lines.push(`ログファイル:  ${result.logs}`);
  lines.push('');

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * ステータスを日本語表記に変換する
 * @param status - ステータス
 * @returns 日本語表記
 */
function formatStatus(status: TrialRunResult['status']): string {
  const labels: Record<TrialRunResult['status'], string> = {
    completed: '完了（Completed）',
    failed: '失敗（Failed）',
    timeout: 'タイムアウト（Timeout）',
  };
  return labels[status];
}
