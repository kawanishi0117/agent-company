/**
 * 採用ログモジュール（Hiring Logger）
 *
 * 採用システムにおける全ての採用活動をログに記録する機能を提供
 * - 採用活動のログ記録
 * - ログのMarkdown形式出力
 * - タイムスタンプ、アクション、詳細、担当者の記録
 *
 * @module hiring/hiring-logger
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

import * as fs from 'fs';
import * as path from 'path';
import type { HiringLogEntry, HiringLogSchema, HiringAction } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 実行ディレクトリのベースパス
 * @description 採用ログファイルの格納先ベースディレクトリ
 */
const RUNTIME_RUNS_DIR = 'runtime/runs';

/**
 * 採用ログファイル名
 * @description 各実行IDディレクトリ内のログファイル名
 */
const HIRING_LOG_FILENAME = 'hiring_log.md';

/**
 * 採用ログJSONファイル名
 * @description 内部データ保存用のJSONファイル名
 */
const HIRING_LOG_JSON_FILENAME = 'hiring_log.json';

/**
 * デフォルトの実行者
 * @description 実行者が指定されない場合のデフォルト値
 */
const DEFAULT_ACTOR = 'hiring_manager';

/**
 * スキーマバージョン
 */
const SCHEMA_VERSION = '1.0' as const;

// =============================================================================
// アクション表示名マッピング
// =============================================================================

/**
 * アクション種別の日本語表示名
 * @description ログ出力時に使用するアクションの表示名
 */
const ACTION_DISPLAY_NAMES: Record<HiringAction, string> = {
  jd_generated: 'JD生成完了',
  interview_task_generated: '面接課題生成完了',
  trial_started: '試用実行開始',
  trial_completed: '試用実行完了',
  trial_failed: '試用実行失敗',
  score_calculated: 'スコア算出完了',
  registration_approved: '登録承認',
  registration_rejected: '登録却下',
};

/**
 * アクション種別のアイコン
 * @description Markdown出力時に使用するアイコン
 */
const ACTION_ICONS: Record<HiringAction, string> = {
  jd_generated: '📝',
  interview_task_generated: '📋',
  trial_started: '🚀',
  trial_completed: '✅',
  trial_failed: '❌',
  score_calculated: '📊',
  registration_approved: '🎉',
  registration_rejected: '🚫',
};

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
 * 実行IDからログディレクトリパスを取得する
 * @param runId - 実行ID
 * @returns ログディレクトリパス
 */
function getRunDir(runId: string): string {
  return path.join(RUNTIME_RUNS_DIR, runId);
}

/**
 * 実行IDからMarkdownログファイルパスを取得する
 * @param runId - 実行ID
 * @returns Markdownログファイルパス
 */
function getMarkdownLogPath(runId: string): string {
  return path.join(getRunDir(runId), HIRING_LOG_FILENAME);
}

/**
 * 実行IDからJSONログファイルパスを取得する
 * @param runId - 実行ID
 * @returns JSONログファイルパス
 */
function getJsonLogPath(runId: string): string {
  return path.join(getRunDir(runId), HIRING_LOG_JSON_FILENAME);
}

/**
 * ディレクトリが存在しない場合は作成する
 * @param dirPath - ディレクトリパス
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 既存のログスキーマを読み込む
 * @param runId - 実行ID
 * @returns 既存のログスキーマ（存在しない場合は新規作成）
 */
function loadLogSchema(runId: string): HiringLogSchema {
  const jsonPath = getJsonLogPath(runId);

  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(content) as HiringLogSchema;
    } catch (error) {
      // パースエラーの場合は新規作成
      console.warn(`ログファイルのパースに失敗しました: ${error}`);
    }
  }

  // 新規スキーマを作成
  return {
    version: SCHEMA_VERSION,
    runId,
    candidateId: '',
    startedAt: getCurrentTimestamp(),
    status: 'in_progress',
    entries: [],
  };
}

/**
 * ログスキーマをJSONファイルに保存する
 * @param runId - 実行ID
 * @param schema - ログスキーマ
 */
function saveLogSchema(runId: string, schema: HiringLogSchema): void {
  const runDir = getRunDir(runId);
  ensureDirectoryExists(runDir);

  const jsonPath = getJsonLogPath(runId);
  fs.writeFileSync(jsonPath, JSON.stringify(schema, null, 2), 'utf-8');
}

/**
 * タイムスタンプを人間可読形式にフォーマットする
 * @param timestamp - ISO8601形式のタイムスタンプ
 * @returns フォーマット済みの日時文字列
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 詳細情報をMarkdown形式にフォーマットする
 * @param details - 詳細情報オブジェクト
 * @returns Markdown形式の詳細文字列
 */
function formatDetails(details: Record<string, unknown>): string {
  if (Object.keys(details).length === 0) {
    return '（詳細なし）';
  }

  const lines: string[] = [];

  for (const [key, value] of Object.entries(details)) {
    // キーを日本語に変換（可能な場合）
    const displayKey = translateDetailKey(key);

    // 値をフォーマット
    let displayValue: string;
    if (typeof value === 'object' && value !== null) {
      displayValue = JSON.stringify(value, null, 2);
    } else {
      displayValue = String(value);
    }

    lines.push(`  - **${displayKey}**: ${displayValue}`);
  }

  return lines.join('\n');
}

/**
 * 詳細キーを日本語に変換する
 * @param key - 英語キー
 * @returns 日本語キー（変換できない場合は元のキー）
 */
function translateDetailKey(key: string): string {
  const translations: Record<string, string> = {
    role: '役割',
    filePath: 'ファイルパス',
    candidateId: '候補エージェントID',
    taskId: '課題ID',
    score: 'スコア',
    totalScore: '総合スコア',
    passed: '合格判定',
    reason: '理由',
    rationale: '根拠',
    evidence: '証拠',
    errors: 'エラー',
    duration: '実行時間',
    status: 'ステータス',
    agentId: 'エージェントID',
    registryPath: 'Registryパス',
  };

  return translations[key] || key;
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * 採用活動をログに記録する
 *
 * 指定された実行IDのログファイルに採用活動エントリを追加する。
 * ログは `runtime/runs/<run-id>/hiring_log.md` に保存される。
 *
 * @param runId - 実行ID
 * @param entry - ログエントリ
 *
 * @example
 * ```typescript
 * logHiringActivity('2024-01-15-001', {
 *   timestamp: new Date().toISOString(),
 *   action: 'jd_generated',
 *   details: { role: 'developer', filePath: 'runtime/runs/2024-01-15-001/jd.md' },
 *   actor: 'hiring_manager',
 * });
 * ```
 *
 * Validates: Requirements 8.1, 8.2, 8.3
 */
export function logHiringActivity(runId: string, entry: HiringLogEntry): void {
  // 入力バリデーション
  if (!runId || typeof runId !== 'string') {
    throw new Error('InvalidRunId: 実行IDが無効です');
  }

  if (!entry || typeof entry !== 'object') {
    throw new Error('InvalidEntry: ログエントリが無効です');
  }

  // 既存のログスキーマを読み込む
  const schema = loadLogSchema(runId);

  // エントリを追加
  schema.entries.push({
    timestamp: entry.timestamp || getCurrentTimestamp(),
    action: entry.action,
    details: entry.details,
    actor: entry.actor || DEFAULT_ACTOR,
  });

  // 候補エージェントIDを更新（詳細に含まれている場合）
  if (entry.details.candidateId && typeof entry.details.candidateId === 'string') {
    schema.candidateId = entry.details.candidateId;
  }

  // ステータスを更新（登録承認/却下の場合）
  if (entry.action === 'registration_approved') {
    schema.status = 'approved';
    schema.completedAt = entry.timestamp || getCurrentTimestamp();
  } else if (entry.action === 'registration_rejected') {
    schema.status = 'rejected';
    schema.completedAt = entry.timestamp || getCurrentTimestamp();
  }

  // JSONファイルに保存
  saveLogSchema(runId, schema);

  // Markdownファイルも更新
  const markdownContent = formatHiringLogAsMarkdown(runId);
  const markdownPath = getMarkdownLogPath(runId);
  fs.writeFileSync(markdownPath, markdownContent, 'utf-8');
}

/**
 * 採用ログをMarkdown形式で出力する
 *
 * 指定された実行IDのログをMarkdown形式に変換して返す。
 * 既存のレポートシステムと互換性のある形式で出力される。
 *
 * @param runId - 実行ID
 * @returns Markdown形式のログ文字列
 *
 * @example
 * ```typescript
 * const markdown = formatHiringLogAsMarkdown('2024-01-15-001');
 * console.log(markdown);
 * ```
 *
 * Validates: Requirements 8.4
 */
export function formatHiringLogAsMarkdown(runId: string): string {
  // 入力バリデーション
  if (!runId || typeof runId !== 'string') {
    throw new Error('InvalidRunId: 実行IDが無効です');
  }

  // ログスキーマを読み込む
  const schema = loadLogSchema(runId);

  // Markdownヘッダーを生成
  const lines: string[] = [
    '# 採用ログ（Hiring Log）',
    '',
    '## 概要',
    '',
    `| 項目 | 値 |`,
    `|------|-----|`,
    `| 実行ID | \`${schema.runId}\` |`,
    `| 候補エージェントID | ${schema.candidateId || '（未設定）'} |`,
    `| 開始日時 | ${formatTimestamp(schema.startedAt)} |`,
    `| 完了日時 | ${schema.completedAt ? formatTimestamp(schema.completedAt) : '（進行中）'} |`,
    `| ステータス | ${getStatusDisplayName(schema.status)} |`,
    '',
    '---',
    '',
    '## 活動履歴',
    '',
  ];

  // エントリがない場合
  if (schema.entries.length === 0) {
    lines.push('_まだ活動が記録されていません。_');
  } else {
    // 各エントリをMarkdown形式で出力
    for (let i = 0; i < schema.entries.length; i++) {
      const entry = schema.entries[i];
      const action = entry.action as HiringAction;
      const icon = ACTION_ICONS[action] || '📌';
      const displayName = ACTION_DISPLAY_NAMES[action] || entry.action;

      lines.push(`### ${i + 1}. ${icon} ${displayName}`);
      lines.push('');
      lines.push(`- **日時**: ${formatTimestamp(entry.timestamp)}`);
      lines.push(`- **担当者**: ${entry.actor}`);
      lines.push(`- **詳細**:`);
      lines.push(formatDetails(entry.details as Record<string, unknown>));
      lines.push('');
    }
  }

  // フッターを追加
  lines.push('---');
  lines.push('');
  lines.push(`_このログは ${formatTimestamp(getCurrentTimestamp())} に生成されました。_`);

  return lines.join('\n');
}

/**
 * ステータスの表示名を取得する
 * @param status - ステータス
 * @returns 表示名
 */
function getStatusDisplayName(status: HiringLogSchema['status']): string {
  const statusNames: Record<HiringLogSchema['status'], string> = {
    in_progress: '🔄 進行中',
    approved: '✅ 承認済み',
    rejected: '❌ 却下',
  };

  return statusNames[status] || status;
}

/**
 * 採用ログのJSONスキーマを取得する
 *
 * 指定された実行IDのログスキーマをそのまま返す。
 * プログラムからログデータにアクセスする際に使用。
 *
 * @param runId - 実行ID
 * @returns ログスキーマ
 *
 * @example
 * ```typescript
 * const schema = getHiringLogSchema('2024-01-15-001');
 * console.log(`エントリ数: ${schema.entries.length}`);
 * ```
 */
export function getHiringLogSchema(runId: string): HiringLogSchema {
  if (!runId || typeof runId !== 'string') {
    throw new Error('InvalidRunId: 実行IDが無効です');
  }

  return loadLogSchema(runId);
}

/**
 * 採用ログが存在するかチェックする
 *
 * @param runId - 実行ID
 * @returns ログが存在すればtrue
 */
export function hasHiringLog(runId: string): boolean {
  const jsonPath = getJsonLogPath(runId);
  return fs.existsSync(jsonPath);
}

/**
 * 採用ログをクリアする
 *
 * 指定された実行IDのログファイルを削除する。
 * 主にテスト用途で使用。
 *
 * @param runId - 実行ID
 * @returns 削除成功ならtrue
 */
export function clearHiringLog(runId: string): boolean {
  const jsonPath = getJsonLogPath(runId);
  const markdownPath = getMarkdownLogPath(runId);

  let success = true;

  if (fs.existsSync(jsonPath)) {
    try {
      fs.unlinkSync(jsonPath);
    } catch {
      success = false;
    }
  }

  if (fs.existsSync(markdownPath)) {
    try {
      fs.unlinkSync(markdownPath);
    } catch {
      success = false;
    }
  }

  return success;
}
