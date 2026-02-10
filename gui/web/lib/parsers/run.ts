/**
 * @file Runパーサー
 * @description runtime/runs/ のディレクトリからRun情報を抽出する
 * @requirements 4.3 - result.jsonからrunId, ticketId, status, startTime, endTime, logs, artifactsを抽出
 * @requirements 4.5 - judgment.jsonが存在すれば読み込み
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Run, RunStatus, Judgment, RunSummary } from '../types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * Runディレクトリが格納されているパス（プロジェクトルートからの相対パス）
 */
const RUNS_DIR = 'runtime/runs';

/**
 * 有効なRunステータスの一覧
 */
const VALID_STATUSES: RunStatus[] = ['success', 'failure', 'running'];

// =============================================================================
// 型定義（内部使用）
// =============================================================================

/**
 * result.jsonの生データ型
 */
interface ResultJson {
  runId?: string;
  ticketId?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  logs?: string[];
  artifacts?: string[];
}

/**
 * パース結果の型
 */
type ParseResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * プロジェクトルートディレクトリを取得する
 * @returns プロジェクトルートの絶対パス
 */
function getProjectRoot(): string {
  // GUIは gui/web/ から実行されるため、ルートへは2階層上がる必要がある
  return path.resolve(process.cwd(), '..', '..');
}

/**
 * runsディレクトリの絶対パスを取得する
 * @returns runsディレクトリの絶対パス
 */
function getRunsPath(): string {
  return path.join(getProjectRoot(), RUNS_DIR);
}

/**
 * ステータス文字列を検証し、有効なRunStatusに変換する
 * @param status - 検証するステータス文字列
 * @returns 有効なRunStatus、無効な場合は'running'をデフォルトとして返す
 */
function validateStatus(status: string | undefined): RunStatus {
  if (status && VALID_STATUSES.includes(status as RunStatus)) {
    return status as RunStatus;
  }
  return 'running';
}

/**
 * 日付文字列をISO 8601形式に正規化する
 * @param dateStr - 日付文字列
 * @returns ISO 8601形式の日付文字列、無効な場合は現在時刻
 */
function normalizeDate(dateStr: string | undefined): string {
  if (!dateStr) {
    return new Date().toISOString();
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date().toISOString();
    }
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * result.jsonの内容をパースしてRun情報を抽出する
 * @param resultJson - result.jsonの内容（オブジェクト）
 * @param runDirName - Runディレクトリ名（IDのフォールバック用）
 * @returns パース結果（成功時はRun、失敗時はエラーメッセージ）
 */
export function parseResultJson(
  resultJson: ResultJson,
  runDirName: string = ''
): ParseResult<Omit<Run, 'judgment'>> {
  try {
    // Run IDの取得
    const runId = resultJson.runId || runDirName;
    if (!runId) {
      return {
        success: false,
        error: 'Run IDが見つかりません',
      };
    }

    // Runオブジェクトを構築
    const run: Omit<Run, 'judgment'> = {
      runId,
      ticketId: resultJson.ticketId || '',
      status: validateStatus(resultJson.status),
      startTime: normalizeDate(resultJson.startTime),
      endTime: resultJson.endTime ? normalizeDate(resultJson.endTime) : undefined,
      logs: resultJson.logs || [],
      artifacts: resultJson.artifacts || [],
    };

    return {
      success: true,
      data: run,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `result.jsonのパースに失敗しました: ${message}`,
    };
  }
}

/**
 * judgment.jsonの内容をパースしてJudgment情報を抽出する
 * @param judgmentJson - judgment.jsonの内容（オブジェクト）
 * @returns パース結果（成功時はJudgment、失敗時はエラーメッセージ）
 */
export function parseJudgmentJson(judgmentJson: unknown): ParseResult<Judgment> {
  try {
    const json = judgmentJson as Record<string, unknown>;

    // 必須フィールドの検証
    if (!json.status || !json.run_id) {
      return {
        success: false,
        error: 'judgment.jsonに必須フィールドがありません',
      };
    }

    // checksの検証とデフォルト値設定
    const checks = (json.checks as Record<string, { passed?: boolean; details?: string }>) || {};

    const judgment: Judgment = {
      status: json.status as 'PASS' | 'FAIL' | 'WAIVER',
      timestamp: normalizeDate(json.timestamp as string),
      run_id: json.run_id as string,
      checks: {
        lint: { passed: checks.lint?.passed ?? false, details: checks.lint?.details },
        test: { passed: checks.test?.passed ?? false, details: checks.test?.details },
        e2e: { passed: checks.e2e?.passed ?? false, details: checks.e2e?.details },
        format: { passed: checks.format?.passed ?? false, details: checks.format?.details },
      },
      reasons: Array.isArray(json.reasons) ? (json.reasons as string[]) : [],
      waiver_id: json.waiver_id as string | undefined,
    };

    return {
      success: true,
      data: judgment,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `judgment.jsonのパースに失敗しました: ${message}`,
    };
  }
}

/**
 * 指定されたRunディレクトリからRun情報を読み込む
 * @param runDirPath - Runディレクトリの絶対パス
 * @returns パース結果（成功時はRun、失敗時はエラーメッセージ）
 */
export function parseRunDirectory(runDirPath: string): ParseResult<Run> {
  try {
    const runDirName = path.basename(runDirPath);

    // result.jsonの読み込み
    const resultPath = path.join(runDirPath, 'result.json');
    if (!fs.existsSync(resultPath)) {
      return {
        success: false,
        error: `result.jsonが見つかりません: ${resultPath}`,
      };
    }

    const resultContent = fs.readFileSync(resultPath, 'utf-8');
    const resultJson = JSON.parse(resultContent) as ResultJson;

    const runResult = parseResultJson(resultJson, runDirName);
    if (!runResult.success) {
      return runResult;
    }

    // judgment.jsonの読み込み（オプション）
    const judgmentPath = path.join(runDirPath, 'judgment.json');
    let judgment: Judgment | undefined;

    if (fs.existsSync(judgmentPath)) {
      const judgmentContent = fs.readFileSync(judgmentPath, 'utf-8');
      const judgmentJson = JSON.parse(judgmentContent);
      const judgmentResult = parseJudgmentJson(judgmentJson);

      if (judgmentResult.success) {
        judgment = judgmentResult.data;
      } else {
        // judgment.jsonのパースエラーはログ出力してスキップ
        console.warn(`judgment.jsonのパースをスキップ: ${runDirName} - ${judgmentResult.error}`);
      }
    }

    // Runオブジェクトを構築
    const run: Run = {
      ...runResult.data,
      judgment,
    };

    return {
      success: true,
      data: run,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `Runディレクトリの読み込みに失敗しました: ${message}`,
    };
  }
}

/**
 * 指定されたIDのRunを取得する
 * @param runId - Run ID
 * @returns パース結果（成功時はRun、失敗時はエラーメッセージ）
 */
export function getRunById(runId: string): ParseResult<Run> {
  try {
    const runsPath = getRunsPath();
    const runDirPath = path.join(runsPath, runId);

    if (!fs.existsSync(runDirPath)) {
      return {
        success: false,
        error: `Runが見つかりません: ${runId}`,
      };
    }

    return parseRunDirectory(runDirPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `Runの取得に失敗しました: ${message}`,
    };
  }
}

/**
 * runsディレクトリから全てのRunを取得する
 * @returns パース結果（成功時はRun配列、失敗時はエラーメッセージ）
 */
export function getAllRuns(): ParseResult<Run[]> {
  try {
    const runsPath = getRunsPath();

    // ディレクトリの存在確認
    if (!fs.existsSync(runsPath)) {
      return {
        success: true,
        data: [],
      };
    }

    // ディレクトリ内のサブディレクトリを取得
    const entries = fs.readdirSync(runsPath, { withFileTypes: true });
    const runs: Run[] = [];

    for (const entry of entries) {
      // ディレクトリのみ対象
      if (!entry.isDirectory()) continue;
      // .gitkeepなどは除外
      if (entry.name.startsWith('.')) continue;

      const runDirPath = path.join(runsPath, entry.name);
      const result = parseRunDirectory(runDirPath);

      if (result.success) {
        runs.push(result.data);
      } else {
        // パースエラーはログ出力してスキップ
        console.warn(`Runのパースをスキップ: ${entry.name} - ${result.error}`);
      }
    }

    // 開始日時の降順でソート（新しい順）
    runs.sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });

    return {
      success: true,
      data: runs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `Run一覧の取得に失敗しました: ${message}`,
    };
  }
}

/**
 * Run一覧をサマリー形式で取得する（logsを除く）
 * @returns パース結果（成功時はRunSummary配列、失敗時はエラーメッセージ）
 */
export function getAllRunSummaries(): ParseResult<RunSummary[]> {
  const result = getAllRuns();

  if (!result.success) {
    return result;
  }

  // logsを除いたサマリー形式に変換
  const summaries: RunSummary[] = result.data.map((run) => ({
    runId: run.runId,
    ticketId: run.ticketId,
    status: run.status,
    startTime: run.startTime,
    endTime: run.endTime,
    artifacts: run.artifacts,
    judgment: run.judgment,
  }));

  return {
    success: true,
    data: summaries,
  };
}

/**
 * ステータスでRunをフィルタリングする
 * @param runs - Runの配列
 * @param status - フィルタするステータス
 * @returns フィルタされたRunの配列
 */
export function filterRunsByStatus(runs: Run[], status: RunStatus): Run[] {
  return runs.filter((run) => run.status === status);
}

/**
 * Runをページネーションする
 * @param runs - Runの配列
 * @param page - ページ番号（1始まり）
 * @param pageSize - 1ページあたりのアイテム数
 * @returns ページネーションされたRunの配列と総数
 */
export function paginateRuns(
  runs: Run[],
  page: number,
  pageSize: number
): { items: Run[]; total: number; hasMore: boolean } {
  const total = runs.length;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const items = runs.slice(startIndex, endIndex);
  const hasMore = endIndex < total;

  return { items, total, hasMore };
}
