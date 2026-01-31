/**
 * hireコマンド
 * 採用システム（Hiring System）のCLIコマンド
 *
 * サブコマンド:
 * - jd <role>: JD（Job Description）を生成
 * - interview <jd-path>: 面接課題を生成
 * - trial <candidate-path> <task-path>: 試用実行
 * - score <run-id>: スコアを計算・表示
 * - register <candidate-path>: エージェントをRegistryに登録
 * - full <role> <candidate-path>: 完全な採用フローを実行
 *
 * @module commands/hire
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateJD,
  formatJDAsMarkdown,
  validateJD,
  generateInterviewTask,
  formatInterviewTaskAsMarkdown,
  runTrial,
  calculateScore,
  formatScoreAsJSON,
  formatScoreAsReadable,
  registerAgent,
  isDuplicateAgent,
  removeAgent,
  logHiringActivity,
  formatHiringLogAsMarkdown,
  notifyRegistration,
  PASSING_THRESHOLD,
} from '../lib/hiring/index.js';
import YAML from 'yaml';

// =============================================================================
// 定数
// =============================================================================

/** 実行ログのベースディレクトリ */
const RUNTIME_RUNS_DIR = 'runtime/runs';

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 新しいrun-idを生成
 * @returns 生成されたrun-id（例: 2026-01-30-123456-abcd）
 */
function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `${date}-${time}-${random}`;
}

/**
 * 出力ディレクトリを作成
 * @param runId Run ID
 * @returns 作成されたディレクトリパス
 */
function ensureRunDir(runId: string): string {
  const runDir = path.join(RUNTIME_RUNS_DIR, runId);
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }
  return runDir;
}

/**
 * ファイルの存在を確認
 * @param filePath ファイルパス
 * @param description ファイルの説明（エラーメッセージ用）
 */
function ensureFileExists(filePath: string, description: string): void {
  if (!fs.existsSync(filePath)) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${description}が見つかりません: ${filePath}`);
    process.exit(1);
  }
}

// =============================================================================
// ヘルプ表示関数
// =============================================================================

/**
 * hireコマンドのメインヘルプを表示
 */
export function showHireHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
採用コマンド（Hiring System）

使用方法:
  hire <subcommand> [options]

サブコマンド:
  jd <role>                           JD（Job Description）を生成
  interview <jd-path>                 JDから面接課題を生成
  trial <candidate-path> <task-path>  候補エージェントで試用実行
  score <run-id>                      試用実行結果のスコアを計算
  register <candidate-path>           エージェントをRegistryに登録
  full <role> <candidate-path>        完全な採用フローを実行
  help                                このヘルプを表示

オプション:
  --help, -h    各サブコマンドのヘルプを表示

例:
  hire jd developer
  hire interview runtime/runs/2026-01-30-123456-abcd/jd.md
  hire trial agents/candidates/new-agent.yaml runtime/runs/.../interview_task.md
  hire score 2026-01-30-123456-abcd
  hire register agents/candidates/new-agent.yaml
  hire full developer agents/candidates/new-agent.yaml
`);
}

/**
 * jdサブコマンドのヘルプを表示
 */
function showJdHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
JD生成コマンド

使用方法:
  hire jd <role> [options]

引数:
  role    採用する役割名（例: developer, qa-engineer, data-analyst）

オプション:
  --output, -o <dir>  出力ディレクトリを指定（デフォルト: 自動生成）
  --help, -h          このヘルプを表示

説明:
  指定された役割に基づいてJob Description（JD）を生成します。
  JDには役割、責務、必要スキル、成果物、品質ゲート、予算が含まれます。

例:
  hire jd developer
  hire jd qa-engineer --output runtime/runs/my-run
`);
}

/**
 * interviewサブコマンドのヘルプを表示
 */
function showInterviewHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
面接課題生成コマンド

使用方法:
  hire interview <jd-path> [options]

引数:
  jd-path    JDファイルのパス

オプション:
  --output, -o <dir>  出力ディレクトリを指定（デフォルト: JDと同じディレクトリ）
  --help, -h          このヘルプを表示

説明:
  JDに基づいて面接課題（Interview Task）を生成します。
  課題には説明、期待される成果物、評価基準、制限時間が含まれます。

例:
  hire interview runtime/runs/2026-01-30-123456-abcd/jd.md
  hire interview runtime/runs/2026-01-30-123456-abcd/jd.md --output ./output
`);
}

/**
 * trialサブコマンドのヘルプを表示
 */
function showTrialHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
試用実行コマンド

使用方法:
  hire trial <candidate-path> <task-path> [options]

引数:
  candidate-path    候補エージェント定義ファイルのパス（YAML）
  task-path         面接課題ファイルのパス

オプション:
  --timeout <min>   タイムアウト時間（分）（デフォルト: 30）
  --output, -o <dir>  出力ディレクトリを指定
  --help, -h        このヘルプを表示

説明:
  候補エージェントに面接課題を実行させ、結果を記録します。
  実行はDocker隔離環境で行われ、出力・ログ・成果物がキャプチャされます。

例:
  hire trial agents/candidates/new-agent.yaml runtime/runs/.../interview_task.md
  hire trial agents/candidates/new-agent.yaml ./task.md --timeout 60
`);
}

/**
 * scoreサブコマンドのヘルプを表示
 */
function showScoreHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
スコア計算コマンド

使用方法:
  hire score <run-id> [options]

引数:
  run-id    試用実行のRun ID

オプション:
  --json    JSON形式で出力
  --help, -h  このヘルプを表示

説明:
  試用実行の結果をスコア化します。
  スコアは以下の3つの観点で評価されます:
  - タスク完了度: 0-40点
  - 品質ゲート準拠: 0-30点
  - 効率性: 0-30点
  合計60点以上で合格となります。

例:
  hire score 2026-01-30-123456-abcd
  hire score 2026-01-30-123456-abcd --json
`);
}

/**
 * registerサブコマンドのヘルプを表示
 */
function showRegisterHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
Registry登録コマンド

使用方法:
  hire register <candidate-path> [options]

引数:
  candidate-path    候補エージェント定義ファイルのパス（YAML）

オプション:
  --force, -f     重複チェックをスキップ（上書き）
  --help, -h      このヘルプを表示

説明:
  候補エージェントをRegistryに登録します。
  登録前にエージェント定義のバリデーションが行われます。
  同じIDのエージェントが既に存在する場合はエラーになります。

例:
  hire register agents/candidates/new-agent.yaml
  hire register agents/candidates/new-agent.yaml --force
`);
}

/**
 * fullサブコマンドのヘルプを表示
 */
function showFullHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
完全採用フローコマンド

使用方法:
  hire full <role> <candidate-path> [options]

引数:
  role              採用する役割名
  candidate-path    候補エージェント定義ファイルのパス（YAML）

オプション:
  --timeout <min>   試用実行のタイムアウト時間（分）（デフォルト: 30）
  --help, -h        このヘルプを表示

説明:
  完全な採用フローを一括で実行します:
  1. JD生成
  2. 面接課題生成
  3. 試用実行
  4. スコア計算
  5. 合格時: Registry登録

例:
  hire full developer agents/candidates/new-agent.yaml
  hire full qa-engineer agents/candidates/qa-agent.yaml --timeout 60
`);
}

// =============================================================================
// サブコマンド実装
// =============================================================================

/**
 * jdサブコマンドを実行
 * JD（Job Description）を生成する
 * @param args コマンドライン引数
 */
async function executeJdCommand(args: string[]): Promise<void> {
  // ヘルプチェック
  if (args.includes('--help') || args.includes('-h')) {
    showJdHelp();
    return;
  }

  // 役割名の取得
  const role = args[0];
  if (!role || role.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: 役割名を指定してください。');
    showJdHelp();
    process.exit(1);
  }

  // 出力ディレクトリの取得
  let outputDir: string;
  const outputIndex = args.findIndex((a) => a === '--output' || a === '-o');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputDir = args[outputIndex + 1];
  } else {
    // 自動生成
    const runId = generateRunId();
    outputDir = ensureRunDir(runId);
  }

  // ディレクトリ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // JD生成
    // eslint-disable-next-line no-console
    console.log(`JDを生成中... 役割: ${role}`);

    const jd = generateJD({
      role,
      outputDir,
    });

    // バリデーション
    const validation = validateJD(jd);
    if (!validation.valid) {
      // eslint-disable-next-line no-console
      console.error('エラー: JDのバリデーションに失敗しました:');
      for (const error of validation.errors) {
        // eslint-disable-next-line no-console
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    // Markdown形式で保存
    const markdown = formatJDAsMarkdown(jd);
    fs.writeFileSync(jd.filePath, markdown, 'utf-8');

    // 採用ログに記録
    const runId = path.basename(outputDir);
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'jd_generated',
      details: { role, filePath: jd.filePath },
      actor: 'hiring_manager',
    });

    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('✅ JDを生成しました');
    // eslint-disable-next-line no-console
    console.log(`   ファイル: ${jd.filePath}`);
    // eslint-disable-next-line no-console
    console.log(`   役割: ${jd.title}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * interviewサブコマンドを実行
 * JDから面接課題を生成する
 * @param args コマンドライン引数
 */
async function executeInterviewCommand(args: string[]): Promise<void> {
  // ヘルプチェック
  if (args.includes('--help') || args.includes('-h')) {
    showInterviewHelp();
    return;
  }

  // JDパスの取得
  const jdPath = args[0];
  if (!jdPath || jdPath.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: JDファイルのパスを指定してください。');
    showInterviewHelp();
    process.exit(1);
  }

  // ファイル存在確認
  ensureFileExists(jdPath, 'JDファイル');

  // 出力ディレクトリの取得
  let outputDir: string;
  const outputIndex = args.findIndex((a) => a === '--output' || a === '-o');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputDir = args[outputIndex + 1];
  } else {
    // JDと同じディレクトリ
    outputDir = path.dirname(jdPath);
  }

  try {
    // 面接課題生成
    // eslint-disable-next-line no-console
    console.log(`面接課題を生成中... JD: ${jdPath}`);

    const task = generateInterviewTask(jdPath, outputDir);

    // Markdown形式で保存
    const markdown = formatInterviewTaskAsMarkdown(task);
    const taskPath = path.join(outputDir, 'interview_task.md');
    fs.writeFileSync(taskPath, markdown, 'utf-8');

    // 採用ログに記録
    const runId = path.basename(outputDir);
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'interview_task_generated',
      details: { jdPath, taskPath, taskId: task.id },
      actor: 'hiring_manager',
    });

    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('✅ 面接課題を生成しました');
    // eslint-disable-next-line no-console
    console.log(`   ファイル: ${taskPath}`);
    // eslint-disable-next-line no-console
    console.log(`   課題ID: ${task.id}`);
    // eslint-disable-next-line no-console
    console.log(`   難易度: ${task.difficulty}`);
    // eslint-disable-next-line no-console
    console.log(`   制限時間: ${task.timeLimit}分`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * trialサブコマンドを実行
 * 候補エージェントで試用実行を行う
 * @param args コマンドライン引数
 */
async function executeTrialCommand(args: string[]): Promise<void> {
  // ヘルプチェック
  if (args.includes('--help') || args.includes('-h')) {
    showTrialHelp();
    return;
  }

  // 引数の取得
  const candidatePath = args[0];
  const taskPath = args[1];

  if (!candidatePath || candidatePath.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: 候補エージェント定義のパスを指定してください。');
    showTrialHelp();
    process.exit(1);
  }

  if (!taskPath || taskPath.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: 面接課題のパスを指定してください。');
    showTrialHelp();
    process.exit(1);
  }

  // ファイル存在確認
  ensureFileExists(candidatePath, '候補エージェント定義');
  ensureFileExists(taskPath, '面接課題');

  // タイムアウトの取得
  let timeout = 30; // デフォルト30分
  const timeoutIndex = args.indexOf('--timeout');
  if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
    timeout = parseInt(args[timeoutIndex + 1], 10);
    if (isNaN(timeout) || timeout <= 0) {
      // eslint-disable-next-line no-console
      console.error('エラー: タイムアウトは正の整数で指定してください。');
      process.exit(1);
    }
  }

  // 出力ディレクトリの取得
  let outputDir: string;
  const outputIndex = args.findIndex((a) => a === '--output' || a === '-o');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputDir = args[outputIndex + 1];
  } else {
    // 自動生成
    const runId = generateRunId();
    outputDir = ensureRunDir(runId);
  }

  try {
    // 試用実行
    // eslint-disable-next-line no-console
    console.log('試用実行を開始します...');
    // eslint-disable-next-line no-console
    console.log(`  候補: ${candidatePath}`);
    // eslint-disable-next-line no-console
    console.log(`  課題: ${taskPath}`);
    // eslint-disable-next-line no-console
    console.log(`  タイムアウト: ${timeout}分`);
    // eslint-disable-next-line no-console
    console.log('');

    const result = await runTrial({
      candidatePath,
      taskPath,
      outputDir,
      timeout,
    });

    // 採用ログに記録
    logHiringActivity(result.runId, {
      timestamp: new Date().toISOString(),
      action: result.status === 'completed' ? 'trial_completed' : 'trial_failed',
      details: {
        candidateId: result.candidateId,
        taskId: result.taskId,
        status: result.status,
        durationMinutes: result.durationMinutes,
      },
      actor: 'hiring_manager',
    });

    // 結果表示
    // eslint-disable-next-line no-console
    console.log('');
    if (result.status === 'completed') {
      // eslint-disable-next-line no-console
      console.log('✅ 試用実行が完了しました');
    } else if (result.status === 'timeout') {
      // eslint-disable-next-line no-console
      console.log('⚠️ 試用実行がタイムアウトしました');
    } else {
      // eslint-disable-next-line no-console
      console.log('❌ 試用実行が失敗しました');
    }
    // eslint-disable-next-line no-console
    console.log(`   Run ID: ${result.runId}`);
    // eslint-disable-next-line no-console
    console.log(`   実行時間: ${result.durationMinutes}分`);
    // eslint-disable-next-line no-console
    console.log(`   出力: ${outputDir}`);

    // 失敗時は終了コード1
    if (result.status !== 'completed') {
      process.exit(1);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * scoreサブコマンドを実行
 * 試用実行結果のスコアを計算する
 * @param args コマンドライン引数
 */
async function executeScoreCommand(args: string[]): Promise<void> {
  // ヘルプチェック
  if (args.includes('--help') || args.includes('-h')) {
    showScoreHelp();
    return;
  }

  // Run IDの取得
  const runId = args[0];
  if (!runId || runId.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: Run IDを指定してください。');
    showScoreHelp();
    process.exit(1);
  }

  // Run ディレクトリの存在確認
  const runDir = path.join(RUNTIME_RUNS_DIR, runId);
  if (!fs.existsSync(runDir)) {
    // eslint-disable-next-line no-console
    console.error(`エラー: Run が見つかりません: ${runId}`);
    // eslint-disable-next-line no-console
    console.error(`パス: ${runDir}`);
    process.exit(1);
  }

  // JSON出力フラグ
  const jsonOutput = args.includes('--json');

  try {
    // スコア計算
    // eslint-disable-next-line no-console
    console.log(`スコアを計算中... Run ID: ${runId}`);

    const result = calculateScore(runId);

    // 結果を保存
    const scorePath = path.join(runDir, 'score.json');
    fs.writeFileSync(scorePath, formatScoreAsJSON(result), 'utf-8');

    // 採用ログに記録
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'score_calculated',
      details: {
        totalScore: result.totalScore,
        passed: result.passed,
        breakdown: result.breakdown,
      },
      actor: 'hiring_manager',
    });

    // 結果表示
    // eslint-disable-next-line no-console
    console.log('');
    if (jsonOutput) {
      // eslint-disable-next-line no-console
      console.log(formatScoreAsJSON(result));
    } else {
      // eslint-disable-next-line no-console
      console.log(formatScoreAsReadable(result));
    }

    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`スコア結果を保存しました: ${scorePath}`);

    // 不合格時は終了コード1
    if (!result.passed) {
      process.exit(1);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * registerサブコマンドを実行
 * エージェントをRegistryに登録する
 * @param args コマンドライン引数
 */
async function executeRegisterCommand(args: string[]): Promise<void> {
  // ヘルプチェック
  if (args.includes('--help') || args.includes('-h')) {
    showRegisterHelp();
    return;
  }

  // 候補パスの取得
  const candidatePath = args[0];
  if (!candidatePath || candidatePath.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: 候補エージェント定義のパスを指定してください。');
    showRegisterHelp();
    process.exit(1);
  }

  // ファイル存在確認
  ensureFileExists(candidatePath, '候補エージェント定義');

  // 強制フラグ
  const force = args.includes('--force') || args.includes('-f');

  try {
    // 登録実行
    // eslint-disable-next-line no-console
    console.log(`エージェントを登録中... ${candidatePath}`);

    // 候補エージェントのIDを取得して重複チェック
    const candidateContent = fs.readFileSync(candidatePath, 'utf-8');
    const candidateData = YAML.parse(candidateContent) as { id?: string };
    const candidateId = candidateData.id;

    if (candidateId && isDuplicateAgent(candidateId)) {
      if (force) {
        // 強制フラグがある場合は既存のエージェントを削除
        // eslint-disable-next-line no-console
        console.log(`既存のエージェント '${candidateId}' を上書きします...`);
        removeAgent(candidateId);
      } else {
        // eslint-disable-next-line no-console
        console.error('');
        // eslint-disable-next-line no-console
        console.error(`❌ エージェントID '${candidateId}' は既に登録されています。`);
        // eslint-disable-next-line no-console
        console.error('   上書きする場合は --force オプションを使用してください。');
        process.exit(1);
      }
    }

    const result = registerAgent(candidatePath);

    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error('');
      // eslint-disable-next-line no-console
      console.error('❌ 登録に失敗しました:');
      for (const error of result.errors || []) {
        // eslint-disable-next-line no-console
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    // 採用ログに記録（run-idがある場合）
    const runId = generateRunId();
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'registration_approved',
      details: {
        agentId: result.agentId,
        registryPath: result.registryPath,
      },
      actor: 'hiring_manager',
    });

    // 通知を送信
    notifyRegistration(result);

    // 結果表示
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('✅ エージェントを登録しました');
    // eslint-disable-next-line no-console
    console.log(`   エージェントID: ${result.agentId}`);
    // eslint-disable-next-line no-console
    console.log(`   登録先: ${result.registryPath}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * fullサブコマンドを実行
 * 完全な採用フローを一括で実行する
 * @param args コマンドライン引数
 */
async function executeFullCommand(args: string[]): Promise<void> {
  // ヘルプチェック
  if (args.includes('--help') || args.includes('-h')) {
    showFullHelp();
    return;
  }

  // 引数の取得
  const role = args[0];
  const candidatePath = args[1];

  if (!role || role.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: 役割名を指定してください。');
    showFullHelp();
    process.exit(1);
  }

  if (!candidatePath || candidatePath.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: 候補エージェント定義のパスを指定してください。');
    showFullHelp();
    process.exit(1);
  }

  // ファイル存在確認
  ensureFileExists(candidatePath, '候補エージェント定義');

  // タイムアウトの取得
  let timeout = 30;
  const timeoutIndex = args.indexOf('--timeout');
  if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
    timeout = parseInt(args[timeoutIndex + 1], 10);
    if (isNaN(timeout) || timeout <= 0) {
      // eslint-disable-next-line no-console
      console.error('エラー: タイムアウトは正の整数で指定してください。');
      process.exit(1);
    }
  }

  // Run IDを生成
  const runId = generateRunId();
  const outputDir = ensureRunDir(runId);

  // eslint-disable-next-line no-console
  console.log('========================================');
  // eslint-disable-next-line no-console
  console.log('完全採用フローを開始します');
  // eslint-disable-next-line no-console
  console.log('========================================');
  // eslint-disable-next-line no-console
  console.log(`Run ID: ${runId}`);
  // eslint-disable-next-line no-console
  console.log(`役割: ${role}`);
  // eslint-disable-next-line no-console
  console.log(`候補: ${candidatePath}`);
  // eslint-disable-next-line no-console
  console.log('');

  try {
    // ステップ1: JD生成
    // eslint-disable-next-line no-console
    console.log('[1/5] JD生成...');
    const jd = generateJD({ role, outputDir });
    const jdMarkdown = formatJDAsMarkdown(jd);
    fs.writeFileSync(jd.filePath, jdMarkdown, 'utf-8');
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'jd_generated',
      details: { role, filePath: jd.filePath },
      actor: 'hiring_manager',
    });
    // eslint-disable-next-line no-console
    console.log(`   ✅ JD生成完了: ${jd.filePath}`);

    // ステップ2: 面接課題生成
    // eslint-disable-next-line no-console
    console.log('[2/5] 面接課題生成...');
    const task = generateInterviewTask(jd.filePath, outputDir);
    const taskMarkdown = formatInterviewTaskAsMarkdown(task);
    const taskPath = path.join(outputDir, 'interview_task.md');
    fs.writeFileSync(taskPath, taskMarkdown, 'utf-8');
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'interview_task_generated',
      details: { jdPath: jd.filePath, taskPath, taskId: task.id },
      actor: 'hiring_manager',
    });
    // eslint-disable-next-line no-console
    console.log(`   ✅ 面接課題生成完了: ${taskPath}`);

    // ステップ3: 試用実行
    // eslint-disable-next-line no-console
    console.log('[3/5] 試用実行...');
    const trialResult = await runTrial({
      candidatePath,
      taskPath,
      outputDir,
      timeout,
    });
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: trialResult.status === 'completed' ? 'trial_completed' : 'trial_failed',
      details: {
        candidateId: trialResult.candidateId,
        status: trialResult.status,
        durationMinutes: trialResult.durationMinutes,
      },
      actor: 'hiring_manager',
    });

    if (trialResult.status !== 'completed') {
      // eslint-disable-next-line no-console
      console.log(`   ❌ 試用実行失敗: ${trialResult.status}`);
      // eslint-disable-next-line no-console
      console.log('');
      // eslint-disable-next-line no-console
      console.log('採用フローを中断しました。');
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(`   ✅ 試用実行完了: ${trialResult.durationMinutes}分`);

    // ステップ4: スコア計算
    // eslint-disable-next-line no-console
    console.log('[4/5] スコア計算...');
    const scoreResult = calculateScore(runId);
    const scorePath = path.join(outputDir, 'score.json');
    fs.writeFileSync(scorePath, formatScoreAsJSON(scoreResult), 'utf-8');
    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'score_calculated',
      details: {
        totalScore: scoreResult.totalScore,
        passed: scoreResult.passed,
      },
      actor: 'hiring_manager',
    });
    // eslint-disable-next-line no-console
    console.log(`   スコア: ${scoreResult.totalScore}/100 (合格ライン: ${PASSING_THRESHOLD})`);

    if (!scoreResult.passed) {
      // eslint-disable-next-line no-console
      console.log(`   ❌ 不合格`);
      logHiringActivity(runId, {
        timestamp: new Date().toISOString(),
        action: 'registration_rejected',
        details: { reason: 'スコア不足', totalScore: scoreResult.totalScore },
        actor: 'hiring_manager',
      });
      // eslint-disable-next-line no-console
      console.log('');
      // eslint-disable-next-line no-console
      console.log('採用フローを中断しました（スコア不足）。');
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(`   ✅ 合格`);

    // ステップ5: Registry登録
    // eslint-disable-next-line no-console
    console.log('[5/5] Registry登録...');
    const regResult = registerAgent(candidatePath);

    if (!regResult.success) {
      // eslint-disable-next-line no-console
      console.log(`   ❌ 登録失敗`);
      for (const error of regResult.errors || []) {
        // eslint-disable-next-line no-console
        console.log(`      - ${error}`);
      }
      process.exit(1);
    }

    logHiringActivity(runId, {
      timestamp: new Date().toISOString(),
      action: 'registration_approved',
      details: {
        agentId: regResult.agentId,
        registryPath: regResult.registryPath,
      },
      actor: 'hiring_manager',
    });

    // 通知を送信
    notifyRegistration(regResult);

    // eslint-disable-next-line no-console
    console.log(`   ✅ 登録完了: ${regResult.registryPath}`);

    // 採用ログをMarkdown形式で保存
    const hiringLogMarkdown = formatHiringLogAsMarkdown(runId);
    const hiringLogPath = path.join(outputDir, 'hiring_log.md');
    fs.writeFileSync(hiringLogPath, hiringLogMarkdown, 'utf-8');

    // 完了メッセージ
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('========================================');
    // eslint-disable-next-line no-console
    console.log('✅ 採用フロー完了');
    // eslint-disable-next-line no-console
    console.log('========================================');
    // eslint-disable-next-line no-console
    console.log(`エージェントID: ${regResult.agentId}`);
    // eslint-disable-next-line no-console
    console.log(`スコア: ${scoreResult.totalScore}/100`);
    // eslint-disable-next-line no-console
    console.log(`登録先: ${regResult.registryPath}`);
    // eslint-disable-next-line no-console
    console.log(`採用ログ: ${hiringLogPath}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// =============================================================================
// エントリポイント
// =============================================================================

/**
 * hireコマンドのエントリポイント
 * @param args コマンドライン引数
 */
export async function executeHireCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'jd':
      await executeJdCommand(args.slice(1));
      break;

    case 'interview':
      await executeInterviewCommand(args.slice(1));
      break;

    case 'trial':
      await executeTrialCommand(args.slice(1));
      break;

    case 'score':
      await executeScoreCommand(args.slice(1));
      break;

    case 'register':
      await executeRegisterCommand(args.slice(1));
      break;

    case 'full':
      await executeFullCommand(args.slice(1));
      break;

    case 'help':
    case '--help':
    case '-h':
      showHireHelp();
      break;

    default:
      if (subcommand) {
        // eslint-disable-next-line no-console
        console.error(`不明なサブコマンド: ${subcommand}`);
      }
      showHireHelp();
      process.exit(subcommand ? 1 : 0);
  }
}
