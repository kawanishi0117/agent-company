/**
 * スコアリングエンジン（Scoring Engine）モジュール
 *
 * 採用システムにおけるスコア化機能を提供
 * - 試用実行結果からスコアを計算
 * - タスク完了度（0-40点）、品質ゲート準拠（0-30点）、効率性（0-30点）の算出
 * - 合格判定ロジック（60点以上で合格）
 * - JSON形式および人間可読形式での出力
 *
 * @module hiring/scoring-engine
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ScoringResult,
  ScoreComponent,
  TrialRunResult,
  ScoringResultSchema,
} from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 合格閾値（60点以上で合格）
 * @description Requirements 5.5: 最小合格閾値
 */
export const PASSING_THRESHOLD = 60;

/**
 * タスク完了度の最大スコア
 * @description Requirements 5.2: タスク完了度は0-40点
 */
export const MAX_TASK_COMPLETION_SCORE = 40;

/**
 * 品質ゲート準拠の最大スコア
 * @description Requirements 5.2: 品質ゲート準拠は0-30点
 */
export const MAX_QUALITY_COMPLIANCE_SCORE = 30;

/**
 * 効率性の最大スコア
 * @description Requirements 5.2: 効率性は0-30点
 */
export const MAX_EFFICIENCY_SCORE = 30;

/**
 * 試用実行結果ファイル名
 */
const TRIAL_RESULT_FILE = 'trial/trial_result.json';

/**
 * スコア結果ファイル名
 * @description Requirements 5.4: score.json として保存
 */
const SCORE_FILE_NAME = 'score.json';

/**
 * デフォルトのトークン予算
 */
const DEFAULT_TOKEN_BUDGET = 30000;

/**
 * デフォルトの時間予算（分）
 */
const DEFAULT_TIME_BUDGET = 30;

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * ISO8601形式の現在時刻を取得する
 * @returns ISO8601形式の時刻文字列
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 試用実行結果を読み込む
 * @param runId - 実行ID
 * @returns 試用実行結果
 * @throws Error - 実行結果が見つからない場合
 */
function loadTrialResult(runId: string): TrialRunResult {
  // runtime/runs/<run-id>/trial/trial_result.json を探す
  const resultPath = path.join('runtime', 'runs', runId, TRIAL_RESULT_FILE);

  if (!fs.existsSync(resultPath)) {
    throw new Error(
      `RunNotFound: 指定された実行ID "${runId}" の試用実行結果が見つかりません: ${resultPath}`
    );
  }

  try {
    const content = fs.readFileSync(resultPath, 'utf-8');
    return JSON.parse(content) as TrialRunResult;
  } catch (error) {
    throw new Error(`InvalidTrialResult: 試用実行結果の読み込みに失敗しました: ${error}`);
  }
}

/**
 * スコアを指定範囲内に制限する
 * @param score - スコア
 * @param min - 最小値
 * @param max - 最大値
 * @returns 制限されたスコア
 */
function clampScore(score: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(score)));
}

// =============================================================================
// スコア計算関数
// =============================================================================

/**
 * タスク完了度スコアを計算する
 *
 * 評価基準:
 * - 試用実行が完了したか（基本点: 20点）
 * - 成果物が生成されたか（各成果物: 5点、最大20点）
 *
 * @param trialResult - 試用実行結果
 * @returns タスク完了度スコアコンポーネント
 *
 * Validates: Requirements 5.2 (タスク完了度 0-40点)
 */
function calculateTaskCompletionScore(trialResult: TrialRunResult): ScoreComponent {
  let score = 0;
  const justifications: string[] = [];

  // 基本点: 試用実行が完了したか
  if (trialResult.status === 'completed') {
    score += 20;
    justifications.push('試用実行が正常に完了しました（+20点）');
  } else if (trialResult.status === 'timeout') {
    score += 5;
    justifications.push('試用実行がタイムアウトしました（+5点）');
  } else {
    justifications.push('試用実行が失敗しました（+0点）');
  }

  // 成果物の生成数に応じた加点（各5点、最大20点）
  const outputCount = trialResult.outputs.length;
  const outputScore = Math.min(outputCount * 5, 20);
  score += outputScore;

  if (outputCount > 0) {
    justifications.push(`${outputCount}個の成果物を生成しました（+${outputScore}点）`);
  } else {
    justifications.push('成果物が生成されませんでした（+0点）');
  }

  return {
    score: clampScore(score, 0, MAX_TASK_COMPLETION_SCORE),
    maxScore: MAX_TASK_COMPLETION_SCORE,
    justification: justifications.join('。'),
  };
}

/**
 * 品質ゲート準拠スコアを計算する
 *
 * 評価基準:
 * - ログファイルが存在するか（10点）
 * - エラーなく完了したか（10点）
 * - 成果物の品質（10点）
 *
 * @param trialResult - 試用実行結果
 * @returns 品質ゲート準拠スコアコンポーネント
 *
 * Validates: Requirements 5.2 (品質ゲート準拠 0-30点)
 */
function calculateQualityComplianceScore(trialResult: TrialRunResult): ScoreComponent {
  let score = 0;
  const justifications: string[] = [];

  // ログファイルの存在チェック
  if (trialResult.logs && fs.existsSync(trialResult.logs)) {
    score += 10;
    justifications.push('ログファイルが正常に生成されました（+10点）');
  } else {
    justifications.push('ログファイルが見つかりません（+0点）');
  }

  // エラーなく完了したか
  if (trialResult.status === 'completed') {
    score += 10;
    justifications.push('エラーなく完了しました（+10点）');
  } else if (trialResult.status === 'timeout') {
    score += 5;
    justifications.push('タイムアウトで終了しました（+5点）');
  } else {
    justifications.push('エラーが発生しました（+0点）');
  }

  // 成果物の品質チェック（存在確認）
  const validOutputs = trialResult.outputs.filter((output) => fs.existsSync(output));
  if (validOutputs.length === trialResult.outputs.length && trialResult.outputs.length > 0) {
    score += 10;
    justifications.push('全ての成果物が正常に保存されています（+10点）');
  } else if (validOutputs.length > 0) {
    const partialScore = Math.round((validOutputs.length / trialResult.outputs.length) * 10);
    score += partialScore;
    justifications.push(`一部の成果物が保存されています（+${partialScore}点）`);
  } else {
    justifications.push('成果物の検証ができませんでした（+0点）');
  }

  return {
    score: clampScore(score, 0, MAX_QUALITY_COMPLIANCE_SCORE),
    maxScore: MAX_QUALITY_COMPLIANCE_SCORE,
    justification: justifications.join('。'),
  };
}

/**
 * 効率性スコアを計算する
 *
 * 評価基準:
 * - トークン使用効率（0-15点）: 予算の50%以下で満点
 * - 時間使用効率（0-15点）: 予算の50%以下で満点
 *
 * @param trialResult - 試用実行結果
 * @returns 効率性スコアコンポーネント
 *
 * Validates: Requirements 5.2 (効率性 0-30点)
 */
function calculateEfficiencyScore(trialResult: TrialRunResult): ScoreComponent {
  let score = 0;
  const justifications: string[] = [];

  const { tokensUsed, timeUsed } = trialResult.resourceUsage;

  // トークン使用効率（0-15点）
  // 予算の50%以下: 15点、50-80%: 10点、80-100%: 5点、超過: 0点
  const tokenRatio = tokensUsed / DEFAULT_TOKEN_BUDGET;
  let tokenScore = 0;
  if (tokenRatio <= 0.5) {
    tokenScore = 15;
    justifications.push(`トークン使用率 ${(tokenRatio * 100).toFixed(1)}%（優秀: +15点）`);
  } else if (tokenRatio <= 0.8) {
    tokenScore = 10;
    justifications.push(`トークン使用率 ${(tokenRatio * 100).toFixed(1)}%（良好: +10点）`);
  } else if (tokenRatio <= 1.0) {
    tokenScore = 5;
    justifications.push(`トークン使用率 ${(tokenRatio * 100).toFixed(1)}%（許容範囲: +5点）`);
  } else {
    justifications.push(`トークン使用率 ${(tokenRatio * 100).toFixed(1)}%（予算超過: +0点）`);
  }
  score += tokenScore;

  // 時間使用効率（0-15点）
  // 予算の50%以下: 15点、50-80%: 10点、80-100%: 5点、超過: 0点
  const timeRatio = timeUsed / DEFAULT_TIME_BUDGET;
  let timeScore = 0;
  if (timeRatio <= 0.5) {
    timeScore = 15;
    justifications.push(`時間使用率 ${(timeRatio * 100).toFixed(1)}%（優秀: +15点）`);
  } else if (timeRatio <= 0.8) {
    timeScore = 10;
    justifications.push(`時間使用率 ${(timeRatio * 100).toFixed(1)}%（良好: +10点）`);
  } else if (timeRatio <= 1.0) {
    timeScore = 5;
    justifications.push(`時間使用率 ${(timeRatio * 100).toFixed(1)}%（許容範囲: +5点）`);
  } else {
    justifications.push(`時間使用率 ${(timeRatio * 100).toFixed(1)}%（予算超過: +0点）`);
  }
  score += timeScore;

  return {
    score: clampScore(score, 0, MAX_EFFICIENCY_SCORE),
    maxScore: MAX_EFFICIENCY_SCORE,
    justification: justifications.join('。'),
  };
}

/**
 * フィードバックを生成する
 *
 * @param totalScore - 総合スコア
 * @param passed - 合格フラグ
 * @param breakdown - スコア内訳
 * @returns フィードバック一覧
 *
 * Validates: Requirements 5.3, 5.6
 */
function generateFeedback(
  totalScore: number,
  passed: boolean,
  breakdown: ScoringResult['breakdown']
): string[] {
  const feedback: string[] = [];

  // 総合評価
  if (passed) {
    feedback.push(
      `総合スコア ${totalScore}点で合格基準（${PASSING_THRESHOLD}点）を満たしています。`
    );
  } else {
    feedback.push(
      `総合スコア ${totalScore}点で合格基準（${PASSING_THRESHOLD}点）に達していません。`
    );
  }

  // 各カテゴリの評価
  const { taskCompletion, qualityCompliance, efficiency } = breakdown;

  // タスク完了度の評価
  const taskCompletionRatio = taskCompletion.score / taskCompletion.maxScore;
  if (taskCompletionRatio >= 0.8) {
    feedback.push('タスク完了度: 優秀な成果を達成しています。');
  } else if (taskCompletionRatio >= 0.6) {
    feedback.push('タスク完了度: 良好な成果を達成しています。');
  } else if (taskCompletionRatio >= 0.4) {
    feedback.push('タスク完了度: 改善の余地があります。成果物の品質向上を検討してください。');
  } else {
    feedback.push('タスク完了度: 大幅な改善が必要です。タスクの完了を優先してください。');
  }

  // 品質ゲート準拠の評価
  const qualityRatio = qualityCompliance.score / qualityCompliance.maxScore;
  if (qualityRatio >= 0.8) {
    feedback.push('品質ゲート準拠: 高い品質基準を満たしています。');
  } else if (qualityRatio >= 0.6) {
    feedback.push('品質ゲート準拠: 品質基準を概ね満たしています。');
  } else if (qualityRatio >= 0.4) {
    feedback.push('品質ゲート準拠: 品質改善が必要です。ログ出力と成果物の検証を強化してください。');
  } else {
    feedback.push(
      '品質ゲート準拠: 品質基準を満たしていません。品質ゲートの遵守を徹底してください。'
    );
  }

  // 効率性の評価
  const efficiencyRatio = efficiency.score / efficiency.maxScore;
  if (efficiencyRatio >= 0.8) {
    feedback.push('効率性: リソースを効率的に使用しています。');
  } else if (efficiencyRatio >= 0.6) {
    feedback.push('効率性: リソース使用は許容範囲内です。');
  } else if (efficiencyRatio >= 0.4) {
    feedback.push('効率性: リソース使用の最適化を検討してください。');
  } else {
    feedback.push('効率性: リソース使用が非効率です。処理の最適化が必要です。');
  }

  return feedback;
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * 試用実行結果をスコア化する
 *
 * 試用実行結果を読み込み、以下の基準でスコアを計算する:
 * - タスク完了度（0-40点）
 * - 品質ゲート準拠（0-30点）
 * - 効率性（0-30点）
 *
 * 合計60点以上で合格となる。
 *
 * @param runId - 実行ID
 * @returns スコアリング結果
 * @throws Error - 実行結果が見つからない場合
 *
 * @example
 * ```typescript
 * const result = calculateScore('trial-abc123');
 * console.log(`Total Score: ${result.totalScore}`);
 * console.log(`Passed: ${result.passed}`);
 * ```
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5
 */
export function calculateScore(runId: string): ScoringResult {
  // 試用実行結果を読み込む
  const trialResult = loadTrialResult(runId);

  // 試用実行が完了していない場合のチェック
  if (!trialResult.endTime) {
    throw new Error(`IncompleteRun: 試用実行が完了していません: ${runId}`);
  }

  // 各カテゴリのスコアを計算
  const taskCompletion = calculateTaskCompletionScore(trialResult);
  const qualityCompliance = calculateQualityComplianceScore(trialResult);
  const efficiency = calculateEfficiencyScore(trialResult);

  // 総合スコアを計算
  const totalScore = taskCompletion.score + qualityCompliance.score + efficiency.score;

  // 合格判定（60点以上で合格）
  const passed = totalScore >= PASSING_THRESHOLD;

  // スコア内訳を構築
  const breakdown: ScoringResult['breakdown'] = {
    taskCompletion,
    qualityCompliance,
    efficiency,
  };

  // フィードバックを生成
  const feedback = generateFeedback(totalScore, passed, breakdown);

  // スコアリング結果を構築
  const result: ScoringResult = {
    runId,
    candidateId: trialResult.candidateId,
    totalScore,
    breakdown,
    passed,
    feedback,
    timestamp: getCurrentTimestamp(),
  };

  // スコア結果をファイルに保存
  saveScoreResult(runId, result);

  return result;
}

/**
 * スコア結果をファイルに保存する
 *
 * @param runId - 実行ID
 * @param result - スコアリング結果
 *
 * Validates: Requirements 5.4
 */
function saveScoreResult(runId: string, result: ScoringResult): void {
  const outputDir = path.join('runtime', 'runs', runId);

  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, SCORE_FILE_NAME);
  const jsonContent = formatScoreAsJSON(result);
  fs.writeFileSync(outputPath, jsonContent, 'utf-8');
}

/**
 * スコアリング結果をJSON形式で出力する
 *
 * ScoringResultSchemaに準拠したJSON形式で出力する。
 *
 * @param result - スコアリング結果
 * @returns JSON文字列
 *
 * @example
 * ```typescript
 * const json = formatScoreAsJSON(result);
 * fs.writeFileSync('score.json', json);
 * ```
 *
 * Validates: Requirements 5.4
 */
export function formatScoreAsJSON(result: ScoringResult): string {
  // ScoringResultSchemaに変換
  const schema: ScoringResultSchema = {
    version: '1.0',
    metadata: {
      scoredAt: result.timestamp,
      runId: result.runId,
      candidateId: result.candidateId,
    },
    scores: {
      total: result.totalScore,
      passingThreshold: PASSING_THRESHOLD,
      passed: result.passed,
      breakdown: {
        taskCompletion: {
          score: result.breakdown.taskCompletion.score,
          maxScore: 40,
          justification: result.breakdown.taskCompletion.justification,
        },
        qualityCompliance: {
          score: result.breakdown.qualityCompliance.score,
          maxScore: 30,
          justification: result.breakdown.qualityCompliance.justification,
        },
        efficiency: {
          score: result.breakdown.efficiency.score,
          maxScore: 30,
          justification: result.breakdown.efficiency.justification,
        },
      },
    },
    feedback: result.feedback,
  };

  return JSON.stringify(schema, null, 2);
}

/**
 * スコアリング結果を人間可読形式で出力する
 *
 * コンソール出力やレポート用に、読みやすい形式でスコアを表示する。
 *
 * @param result - スコアリング結果
 * @returns フォーマット済み文字列
 *
 * @example
 * ```typescript
 * const readable = formatScoreAsReadable(result);
 * console.log(readable);
 * ```
 *
 * Validates: Requirements 5.6
 */
export function formatScoreAsReadable(result: ScoringResult): string {
  const lines: string[] = [];
  const { breakdown } = result;

  // ヘッダー
  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║                    スコアリング結果                        ║');
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push('');

  // 基本情報
  lines.push(`  実行ID:        ${result.runId}`);
  lines.push(`  候補ID:        ${result.candidateId}`);
  lines.push(`  評価日時:      ${result.timestamp}`);
  lines.push('');

  // 総合スコア
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push('║                      総合スコア                            ║');
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push('');

  const passedLabel = result.passed ? '✓ 合格' : '✗ 不合格';
  const passedColor = result.passed ? '🟢' : '🔴';
  lines.push(`  ${passedColor} ${result.totalScore} / 100 点  ${passedLabel}`);
  lines.push(`     （合格基準: ${PASSING_THRESHOLD}点以上）`);
  lines.push('');

  // スコアバー
  const barLength = 40;
  const filledLength = Math.round((result.totalScore / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  lines.push(`  [${bar}]`);
  lines.push('');

  // スコア内訳
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push('║                      スコア内訳                            ║');
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push('');

  // タスク完了度
  lines.push('  📋 タスク完了度');
  lines.push(
    `     スコア: ${breakdown.taskCompletion.score} / ${breakdown.taskCompletion.maxScore} 点`
  );
  lines.push(`     根拠: ${breakdown.taskCompletion.justification}`);
  lines.push('');

  // 品質ゲート準拠
  lines.push('  ✅ 品質ゲート準拠');
  lines.push(
    `     スコア: ${breakdown.qualityCompliance.score} / ${breakdown.qualityCompliance.maxScore} 点`
  );
  lines.push(`     根拠: ${breakdown.qualityCompliance.justification}`);
  lines.push('');

  // 効率性
  lines.push('  ⚡ 効率性');
  lines.push(`     スコア: ${breakdown.efficiency.score} / ${breakdown.efficiency.maxScore} 点`);
  lines.push(`     根拠: ${breakdown.efficiency.justification}`);
  lines.push('');

  // フィードバック
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push('║                      フィードバック                        ║');
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push('');

  for (const fb of result.feedback) {
    lines.push(`  • ${fb}`);
  }
  lines.push('');

  // フッター
  lines.push('╚════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

/**
 * 直接スコアを計算する（試用実行結果オブジェクトから）
 *
 * ファイルを読み込まずに、直接TrialRunResultオブジェクトからスコアを計算する。
 * テストやプログラム内での使用に便利。
 *
 * @param trialResult - 試用実行結果
 * @returns スコアリング結果
 *
 * @example
 * ```typescript
 * const trialResult = await runTrial(options);
 * const score = calculateScoreFromResult(trialResult);
 * ```
 */
export function calculateScoreFromResult(trialResult: TrialRunResult): ScoringResult {
  // 各カテゴリのスコアを計算
  const taskCompletion = calculateTaskCompletionScore(trialResult);
  const qualityCompliance = calculateQualityComplianceScore(trialResult);
  const efficiency = calculateEfficiencyScore(trialResult);

  // 総合スコアを計算
  const totalScore = taskCompletion.score + qualityCompliance.score + efficiency.score;

  // 合格判定（60点以上で合格）
  const passed = totalScore >= PASSING_THRESHOLD;

  // スコア内訳を構築
  const breakdown: ScoringResult['breakdown'] = {
    taskCompletion,
    qualityCompliance,
    efficiency,
  };

  // フィードバックを生成
  const feedback = generateFeedback(totalScore, passed, breakdown);

  // スコアリング結果を構築
  return {
    runId: trialResult.runId,
    candidateId: trialResult.candidateId,
    totalScore,
    breakdown,
    passed,
    feedback,
    timestamp: getCurrentTimestamp(),
  };
}
