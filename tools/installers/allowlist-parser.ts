/**
 * Allowlist Parser
 * allowlistファイルを読み込み、パッケージ名のリストを返す
 */

import * as fs from 'fs';
import * as path from 'path';

// パッケージタイプ
export type PackageType = 'apt' | 'pip' | 'npm';

// Allowlist設定
export interface AllowlistConfig {
  apt: string[];
  pip: string[];
  npm: string[];
}

// allowlistディレクトリのデフォルトパス
const DEFAULT_ALLOWLIST_DIR = path.join(__dirname, 'allowlist');

/**
 * allowlistファイルをパースしてパッケージ名のリストを返す
 * - 空行を無視
 * - #で始まるコメント行を無視
 * - 各行の前後の空白をトリム
 */
export function parseAllowlistFile(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * 指定されたタイプのallowlistファイルを読み込む
 */
export function loadAllowlist(
  type: PackageType,
  allowlistDir: string = DEFAULT_ALLOWLIST_DIR
): string[] {
  const filePath = path.join(allowlistDir, `${type}.txt`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Allowlist file not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseAllowlistFile(content);
}

/**
 * すべてのallowlistを読み込む
 */
export function loadAllAllowlists(
  allowlistDir: string = DEFAULT_ALLOWLIST_DIR
): AllowlistConfig {
  return {
    apt: loadAllowlist('apt', allowlistDir),
    pip: loadAllowlist('pip', allowlistDir),
    npm: loadAllowlist('npm', allowlistDir),
  };
}

/**
 * パッケージがallowlistに含まれているかチェック
 */
export function isPackageAllowed(
  type: PackageType,
  packageName: string,
  allowlistDir: string = DEFAULT_ALLOWLIST_DIR
): boolean {
  const allowlist = loadAllowlist(type, allowlistDir);
  return allowlist.includes(packageName);
}

/**
 * パッケージ名が有効な形式かチェック
 * - 空文字列でない
 * - 空白のみでない
 * - 基本的な文字のみ（英数字、ハイフン、アンダースコア、ドット、@、/）
 */
export function isValidPackageName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }
  // npm scoped packages (@scope/name) も許可
  const validPattern = /^[@a-zA-Z0-9][\w\-\.\/]*$/;
  return validPattern.test(name.trim());
}
