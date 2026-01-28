/**
 * judgeコマンド
 * Quality Authorityの判定（PASS/FAIL/WAIVER）を実行する
 */

import * as fs from 'fs';
import * as path from 'path';
import { executeJudgment, saveJudgmentResult, formatJudgmentResult } from '../lib/judgment.js';

/**
 * judgeコマンドのヘルプを表示
 */
export function showJudgeHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
判定コマンド

使用方法:
  judge <run-id> [options]

オプション:
  --waiver <waiver-id>  Waiverを適用して判定
  --help, -h            このヘルプを表示

説明:
  指定されたrun-idの実行結果を評価し、PASS/FAIL/WAIVERの判定を行います。
  判定結果は runtime/runs/<run-id>/judgment.json に保存されます。

例:
  judge 2026-01-27-151426-q3me
  judge 2026-01-27-151426-q3me --waiver 2026-01-29-coverage-exception
`);
}

/**
 * run-idの存在を確認
 * @param runId Run ID
 * @returns 存在する場合true
 */
function runExists(runId: string): boolean {
  const runDir = path.join('runtime', 'runs', runId);
  const resultPath = path.join(runDir, 'result.json');
  return fs.existsSync(resultPath);
}

/**
 * judgeコマンドを実行
 * @param runId Run ID
 * @param waiverId Waiver ID（オプション）
 */
export function executeJudgeCommand(runId: string, waiverId?: string): void {
  // run-idの存在確認
  if (!runExists(runId)) {
    // eslint-disable-next-line no-console
    console.error(`エラー: Run が見つかりません: ${runId}`);
    // eslint-disable-next-line no-console
    console.error(`パス: runtime/runs/${runId}/result.json`);
    process.exit(1);
  }

  try {
    // 判定を実行
    const result = executeJudgment(runId, waiverId);

    // 結果を保存
    saveJudgmentResult(runId, result);

    // 結果を表示
    // eslint-disable-next-line no-console
    console.log(formatJudgmentResult(result));
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`判定結果を保存しました: runtime/runs/${runId}/judgment.json`);

    // FAILの場合は終了コード1
    if (result.status === 'FAIL') {
      process.exit(1);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * judgeコマンドのエントリポイント
 * @param args コマンドライン引数
 */
export function handleJudgeCommand(args: string[]): void {
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h')) {
    showJudgeHelp();
    return;
  }

  // run-idの取得
  const runId = args[0];
  if (!runId || runId.startsWith('--')) {
    // eslint-disable-next-line no-console
    console.error('エラー: run-id を指定してください。');
    showJudgeHelp();
    process.exit(1);
  }

  // --waiver オプションの解析
  let waiverId: string | undefined;
  const waiverIndex = args.indexOf('--waiver');
  if (waiverIndex !== -1) {
    waiverId = args[waiverIndex + 1];
    if (!waiverId || waiverId.startsWith('--')) {
      // eslint-disable-next-line no-console
      console.error('エラー: --waiver オプションには waiver-id が必要です。');
      process.exit(1);
    }
  }

  // 判定を実行
  executeJudgeCommand(runId, waiverId);
}
