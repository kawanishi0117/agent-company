/**
 * Installer Core Logic
 * allowlistに基づいてパッケージインストールを検証し、ログを出力する
 */

import {
  PackageType,
  isPackageAllowed,
  isValidPackageName,
  loadAllowlist,
} from './allowlist-parser';
import { writeInstallLog, InstallResult } from './log-writer';

// インストール検証結果
export interface InstallValidation {
  allowed: boolean;
  packageName: string;
  packageType: PackageType;
  reason?: string;
}

// インストールリクエスト
export interface InstallRequest {
  type: PackageType;
  package: string;
}

// 終了コード
export const EXIT_CODES = {
  SUCCESS: 0,
  REJECTED: 1,
  FAILED: 2,
  ALLOWLIST_NOT_FOUND: 3,
  INVALID_TYPE: 4,
  INVALID_PACKAGE_NAME: 5,
} as const;

/**
 * パッケージタイプが有効かチェック
 */
export function isValidPackageType(type: string): type is PackageType {
  return ['apt', 'pip', 'npm'].includes(type);
}

/**
 * パッケージインストールを検証
 * - パッケージ名の形式チェック
 * - allowlistチェック
 */
export function validateInstall(
  request: InstallRequest,
  allowlistDir?: string
): InstallValidation {
  const { type, package: packageName } = request;

  // パッケージ名の形式チェック
  if (!isValidPackageName(packageName)) {
    return {
      allowed: false,
      packageName,
      packageType: type,
      reason: `Invalid package name: ${packageName}`,
    };
  }

  // allowlistチェック
  try {
    const allowed = isPackageAllowed(type, packageName, allowlistDir);
    return {
      allowed,
      packageName,
      packageType: type,
      reason: allowed ? undefined : `Package not in ${type} allowlist: ${packageName}`,
    };
  } catch (error) {
    return {
      allowed: false,
      packageName,
      packageType: type,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * インストール検証を実行し、結果をログに記録
 */
export async function processInstallRequest(
  request: InstallRequest,
  options: {
    allowlistDir?: string;
    logDir?: string;
    dryRun?: boolean;
  } = {}
): Promise<{
  validation: InstallValidation;
  exitCode: number;
  logResult?: InstallResult;
}> {
  const { allowlistDir, logDir, dryRun = false } = options;
  const startTime = Date.now();

  // 検証実行
  const validation = validateInstall(request, allowlistDir);
  const duration = Date.now() - startTime;

  // ログ記録
  let logResult: InstallResult | undefined;
  if (!dryRun && logDir) {
    logResult = await writeInstallLog(
      {
        type: request.type,
        package: request.package,
        status: validation.allowed ? 'success' : 'rejected',
        duration_ms: duration,
        error: validation.reason,
      },
      logDir
    );
  }

  // 終了コード決定
  const exitCode = validation.allowed ? EXIT_CODES.SUCCESS : EXIT_CODES.REJECTED;

  return { validation, exitCode, logResult };
}

/**
 * CLIからの呼び出し用エントリポイント
 */
export async function main(args: string[]): Promise<number> {
  if (args.length < 2) {
    console.error('Usage: installer <type> <package>');
    console.error('Types: apt, pip, npm');
    return EXIT_CODES.INVALID_TYPE;
  }

  const [typeArg, packageName] = args;

  // タイプ検証
  if (!isValidPackageType(typeArg)) {
    console.error(`Invalid package type: ${typeArg}`);
    console.error('Valid types: apt, pip, npm');
    return EXIT_CODES.INVALID_TYPE;
  }

  const request: InstallRequest = {
    type: typeArg,
    package: packageName,
  };

  const { validation, exitCode } = await processInstallRequest(request, {
    logDir: process.env.INSTALL_LOG_DIR,
  });

  if (validation.allowed) {
    console.log(`ALLOWED: ${validation.packageType}/${validation.packageName}`);
  } else {
    console.error(`REJECTED: ${validation.packageType}/${validation.packageName}`);
    if (validation.reason) {
      console.error(`Reason: ${validation.reason}`);
    }
  }

  return exitCode;
}

// 直接実行時
if (require.main === module) {
  main(process.argv.slice(2)).then(code => {
    process.exit(code);
  });
}
