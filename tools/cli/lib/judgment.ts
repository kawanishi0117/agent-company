/**
 * 判定ロジック
 * Quality Authorityの判定（PASS/FAIL/WAIVER）を実装
 */

import * as fs from 'fs';
import * as path from 'path';
import { validateWaiverFile, isOverdue } from './waiver-validator.js';

/**
 * 判定ステータス
 */
export type JudgmentStatus = 'PASS' | 'FAIL' | 'WAIVER';

/**
 * 個別チェック結果の型定義
 */
export interface CheckResult {
  passed: boolean;
  details?: string;
}

/**
 * 判定結果の型定義
 */
export interface JudgmentResult {
  status: JudgmentStatus;
  timestamp: string;
  run_id: string;
  checks: {
    lint: CheckResult;
    test: CheckResult;
    e2e: CheckResult;
    format: CheckResult;
  };
  reasons: string[];
  waiver_id?: string;
}

/**
 * Run結果の型定義
 */
export interface RunResult {
  runId: string;
  ticketId: string;
  startTime: string;
  endTime: string;
  status: string;
  logs: string[];
  artifacts: string[];
  // 品質ゲート結果（オプション）
  qualityGates?: {
    lint?: { passed: boolean; details?: string };
    test?: { passed: boolean; details?: string };
    e2e?: { passed: boolean; details?: string };
    format?: { passed: boolean; details?: string };
  };
}

/**
 * Runディレクトリからresult.jsonを読み込む
 * @param runId Run ID
 * @returns Run結果
 */
export function loadRunResult(runId: string): RunResult | null {
  const runDir = path.join('runtime', 'runs', runId);
  const resultPath = path.join(runDir, 'result.json');

  if (!fs.existsSync(resultPath)) {
    return null;
  }

  const content = fs.readFileSync(resultPath, 'utf-8');
  return JSON.parse(content) as RunResult;
}

/**
 * Waiverファイルを読み込む
 * @param waiverId Waiver ID（ファイル名から拡張子を除いたもの）
 * @returns Waiverファイルのパス、存在しない場合はnull
 */
export function findWaiverFile(waiverId: string): string | null {
  const waiverDir = 'workflows/waivers';
  const waiverPath = path.join(waiverDir, `${waiverId}.md`);

  if (fs.existsSync(waiverPath)) {
    return waiverPath;
  }

  return null;
}

/**
 * 品質ゲートの結果を評価
 * @param runResult Run結果
 * @returns チェック結果
 */
export function evaluateQualityGates(runResult: RunResult): JudgmentResult['checks'] {
  // デフォルトはPASS（品質ゲート情報がない場合）
  const defaultCheck: CheckResult = { passed: true };

  // qualityGatesが存在する場合はその値を使用
  if (runResult.qualityGates) {
    return {
      lint: runResult.qualityGates.lint || defaultCheck,
      test: runResult.qualityGates.test || defaultCheck,
      e2e: runResult.qualityGates.e2e || defaultCheck,
      format: runResult.qualityGates.format || defaultCheck,
    };
  }

  // qualityGatesがない場合、statusから推測
  // status: 'success' → 全てPASS
  // status: 'failure' → 詳細不明のためFAIL
  if (runResult.status === 'success') {
    return {
      lint: { passed: true },
      test: { passed: true },
      e2e: { passed: true },
      format: { passed: true },
    };
  }

  // 失敗の場合、ログから詳細を抽出（簡易実装）
  return {
    lint: { passed: true },
    test: { passed: false, details: 'Run status indicates failure' },
    e2e: { passed: true },
    format: { passed: true },
  };
}

/**
 * 判定を実行
 * @param runId Run ID
 * @param waiverId 適用するWaiver ID（オプション）
 * @returns 判定結果
 */
export function executeJudgment(runId: string, waiverId?: string): JudgmentResult {
  // Run結果を読み込む
  const runResult = loadRunResult(runId);
  if (!runResult) {
    throw new Error(`Run not found: ${runId}`);
  }

  // 品質ゲートを評価
  const checks = evaluateQualityGates(runResult);

  // 失敗理由を収集
  const reasons: string[] = [];
  if (!checks.lint.passed) {
    reasons.push(`lint: ${checks.lint.details || 'failed'}`);
  }
  if (!checks.test.passed) {
    reasons.push(`test: ${checks.test.details || 'failed'}`);
  }
  if (!checks.e2e.passed) {
    reasons.push(`e2e: ${checks.e2e.details || 'failed'}`);
  }
  if (!checks.format.passed) {
    reasons.push(`format: ${checks.format.details || 'failed'}`);
  }

  // 判定ステータスを決定
  let status: JudgmentStatus;
  let appliedWaiverId: string | undefined;

  if (reasons.length === 0) {
    // 全チェックPASS
    status = 'PASS';
  } else if (waiverId) {
    // Waiverが指定されている場合
    const waiverPath = findWaiverFile(waiverId);
    if (!waiverPath) {
      throw new Error(`Waiver not found: ${waiverId}`);
    }

    // Waiverの有効性を確認
    const waiverValidation = validateWaiverFile(waiverPath);
    if (!waiverValidation.valid) {
      throw new Error(`Invalid waiver: ${waiverValidation.errors.join(', ')}`);
    }

    // 期限切れチェック
    if (waiverValidation.fields.期限 && isOverdue(waiverValidation.fields.期限)) {
      throw new Error(`Waiver is overdue: ${waiverValidation.fields.期限}`);
    }

    status = 'WAIVER';
    appliedWaiverId = waiverId;
  } else {
    // FAILかつWaiverなし
    status = 'FAIL';
  }

  const result: JudgmentResult = {
    status,
    timestamp: new Date().toISOString(),
    run_id: runId,
    checks,
    reasons,
  };

  if (appliedWaiverId) {
    result.waiver_id = appliedWaiverId;
  }

  return result;
}

/**
 * 判定結果をファイルに保存
 * @param runId Run ID
 * @param result 判定結果
 */
export function saveJudgmentResult(runId: string, result: JudgmentResult): void {
  const runDir = path.join('runtime', 'runs', runId);
  const judgmentPath = path.join(runDir, 'judgment.json');

  fs.writeFileSync(judgmentPath, JSON.stringify(result, null, 2), 'utf-8');
}

/**
 * 判定結果をフォーマットして出力
 * @param result 判定結果
 * @returns フォーマットされた文字列
 */
export function formatJudgmentResult(result: JudgmentResult): string {
  const lines: string[] = [];

  // ステータスに応じたアイコン
  const statusIcon = {
    PASS: '✅',
    FAIL: '❌',
    WAIVER: '⚠️',
  };

  lines.push(`${statusIcon[result.status]} Judgment: ${result.status}`);
  lines.push(`Run ID: ${result.run_id}`);
  lines.push(`Timestamp: ${result.timestamp}`);
  lines.push('');
  lines.push('Checks:');
  lines.push(
    `  lint:   ${result.checks.lint.passed ? '✓' : '✗'} ${result.checks.lint.details || ''}`
  );
  lines.push(
    `  test:   ${result.checks.test.passed ? '✓' : '✗'} ${result.checks.test.details || ''}`
  );
  lines.push(
    `  e2e:    ${result.checks.e2e.passed ? '✓' : '✗'} ${result.checks.e2e.details || ''}`
  );
  lines.push(
    `  format: ${result.checks.format.passed ? '✓' : '✗'} ${result.checks.format.details || ''}`
  );

  if (result.reasons.length > 0) {
    lines.push('');
    lines.push('Reasons:');
    for (const reason of result.reasons) {
      lines.push(`  - ${reason}`);
    }
  }

  if (result.waiver_id) {
    lines.push('');
    lines.push(`Waiver: ${result.waiver_id}`);
  }

  return lines.join('\n');
}
