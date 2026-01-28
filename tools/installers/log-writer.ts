/**
 * Install Log Writer
 * インストール操作のログをJSON形式で出力する
 */

import * as fs from 'fs';
import * as path from 'path';
import { PackageType } from './allowlist-parser';

// インストールステータス
export type InstallStatus = 'success' | 'rejected' | 'failed';

// インストール結果
export interface InstallResult {
  timestamp: string;
  type: PackageType;
  package: string;
  status: InstallStatus;
  duration_ms?: number;
  error?: string;
}

// ログ入力（タイムスタンプなし）
export interface InstallLogInput {
  type: PackageType;
  package: string;
  status: InstallStatus;
  duration_ms?: number;
  error?: string;
}

// デフォルトログディレクトリ
const DEFAULT_LOG_DIR = path.join(process.cwd(), 'runtime', 'logs', 'install');

/**
 * 現在のタイムスタンプをISO 8601形式で取得
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 今日の日付をYYYYMMDD形式で取得
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * ログファイルパスを取得
 */
export function getLogFilePath(logDir: string = DEFAULT_LOG_DIR): string {
  return path.join(logDir, `install-${getTodayDateString()}.jsonl`);
}

/**
 * ログディレクトリを作成
 */
export function ensureLogDir(logDir: string = DEFAULT_LOG_DIR): void {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * インストールログを書き込む
 */
export async function writeInstallLog(
  input: InstallLogInput,
  logDir: string = DEFAULT_LOG_DIR
): Promise<InstallResult> {
  // タイムスタンプを追加
  const result: InstallResult = {
    timestamp: getCurrentTimestamp(),
    type: input.type,
    package: input.package,
    status: input.status,
    ...(input.duration_ms !== undefined && { duration_ms: input.duration_ms }),
    ...(input.error && { error: input.error }),
  };

  // ログディレクトリ作成
  ensureLogDir(logDir);

  // ログファイルに追記
  const logFilePath = getLogFilePath(logDir);
  const logLine = JSON.stringify(result) + '\n';

  try {
    fs.appendFileSync(logFilePath, logLine, 'utf-8');
  } catch (error) {
    // ログ書き込み失敗は警告のみ（インストール自体は続行）
    console.error(`Warning: Failed to write install log: ${error}`);
  }

  return result;
}

/**
 * ログファイルを読み込む
 */
export function readInstallLogs(logFilePath: string): InstallResult[] {
  if (!fs.existsSync(logFilePath)) {
    return [];
  }

  const content = fs.readFileSync(logFilePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  return lines.map((line) => JSON.parse(line) as InstallResult);
}

/**
 * 今日のログを読み込む
 */
export function readTodayLogs(logDir: string = DEFAULT_LOG_DIR): InstallResult[] {
  const logFilePath = getLogFilePath(logDir);
  return readInstallLogs(logFilePath);
}

/**
 * ログ結果を検証（必須フィールドが含まれているか）
 */
export function validateLogResult(result: InstallResult): boolean {
  return (
    typeof result.timestamp === 'string' &&
    result.timestamp.length > 0 &&
    ['apt', 'pip', 'npm'].includes(result.type) &&
    typeof result.package === 'string' &&
    result.package.length > 0 &&
    ['success', 'rejected', 'failed'].includes(result.status)
  );
}
