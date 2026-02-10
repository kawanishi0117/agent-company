/**
 * @file Run Report API Route
 * @description GET /api/runs/[id]/report - 指定RunIDのレポートを取得
 * @requirements 5.5 - 成果物・レポートの取得エンドポイント
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * レポートレスポンス
 * @description Markdownレポートの内容を返す
 */
interface ReportResponse {
  /** Run ID */
  runId: string;
  /** Markdownテキスト */
  content: string;
  /** レポート生成日時（ISO 8601形式） */
  generatedAt: string;
}

// =============================================================================
// 定数
// =============================================================================

/** プロジェクトルートからのrunsディレクトリパス */
const RUNS_DIR = path.join(process.cwd(), '..', '..', 'runtime', 'runs');

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ディレクトリが存在するか確認する
 * @param dirPath - 確認するディレクトリパス
 * @returns ディレクトリが存在すればtrue
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * ファイルが存在するか確認する
 * @param filePath - 確認するファイルパス
 * @returns ファイルが存在すればtrue
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/runs/[id]/report
 * 指定RunIDのレポート（report.md）を取得する
 * @param _request - リクエスト（未使用）
 * @param params - パスパラメータ（id: Run ID）
 * @returns レポート内容（Markdown）
 * @see Requirement 5.5: レポートの取得エンドポイント
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ReportResponse>>> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Run IDが指定されていません' },
        { status: 400 }
      );
    }

    // Runディレクトリの存在確認
    const runDir = path.join(RUNS_DIR, id);
    if (!(await directoryExists(runDir))) {
      return NextResponse.json(
        { error: `Runが見つかりません: ${id}` },
        { status: 404 }
      );
    }

    // report.mdの存在確認
    const reportPath = path.join(runDir, 'report.md');
    if (!(await fileExists(reportPath))) {
      return NextResponse.json(
        { error: `レポートが見つかりません: ${id}/report.md` },
        { status: 404 }
      );
    }

    // レポートファイルの読み込み
    const content = await fs.readFile(reportPath, 'utf-8');
    const stat = await fs.stat(reportPath);

    const reportResponse: ReportResponse = {
      runId: id,
      content,
      generatedAt: stat.mtime.toISOString(),
    };

    return NextResponse.json({ data: reportResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `レポートの取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
