/**
 * @file Service Detection API Route
 * @description GET /api/settings/service-detection - 環境で利用可能なAIサービスを検出
 * @module api/settings/service-detection
 */

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// =============================================================================
// 型定義
// =============================================================================

/** サービス検出結果 */
interface ServiceDetectionResult {
  name: string;
  displayName: string;
  available: boolean;
  version: string | null;
  checkedAt: string;
}

/** 検出対象サービス定義 */
interface ServiceDefinition {
  name: string;
  displayName: string;
  command: string;
  versionFlag: string;
}

// =============================================================================
// 定数
// =============================================================================

/** 検出対象のAIサービス一覧 */
const SERVICES: ServiceDefinition[] = [
  {
    name: 'opencode',
    displayName: 'OpenCode',
    command: 'opencode',
    versionFlag: '--version',
  },
  {
    name: 'claude-code',
    displayName: 'Claude Code',
    command: 'claude',
    versionFlag: '--version',
  },
  {
    name: 'kiro-cli',
    displayName: 'Kiro CLI',
    command: 'kiro',
    versionFlag: '--version',
  },
];

/** コマンド実行タイムアウト（ミリ秒） */
const COMMAND_TIMEOUT_MS = 5000;

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * コマンドの存在とバージョンを検出する
 * @param service - 検出対象サービス
 * @returns 検出結果
 */
async function detectService(service: ServiceDefinition): Promise<ServiceDetectionResult> {
  const checkedAt = new Date().toISOString();

  try {
    // Windows: where, Unix: which でコマンド存在確認
    const checkCmd = process.platform === 'win32' ? 'where' : 'which';
    await execAsync(`${checkCmd} ${service.command}`, { timeout: COMMAND_TIMEOUT_MS });

    // バージョン取得を試みる
    let version: string | null = null;
    try {
      const { stdout } = await execAsync(
        `${service.command} ${service.versionFlag}`,
        { timeout: COMMAND_TIMEOUT_MS }
      );
      version = stdout.trim().split('\n')[0] || null;
    } catch {
      // バージョン取得失敗でもコマンド自体は存在する
    }

    return {
      name: service.name,
      displayName: service.displayName,
      available: true,
      version,
      checkedAt,
    };
  } catch {
    return {
      name: service.name,
      displayName: service.displayName,
      available: false,
      version: null,
      checkedAt,
    };
  }
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/settings/service-detection
 * 環境で利用可能なAIサービスを検出して返す
 */
export async function GET(): Promise<NextResponse> {
  try {
    // 全サービスを並列で検出
    const results = await Promise.all(SERVICES.map(detectService));

    return NextResponse.json({
      data: {
        services: results,
        availableCount: results.filter((r) => r.available).length,
        totalCount: results.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `サービス検出に失敗しました: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
