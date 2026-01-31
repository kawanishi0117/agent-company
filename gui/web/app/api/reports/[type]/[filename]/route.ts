/**
 * @file Report Detail API Route
 * @description GET /api/reports/[type]/[filename] - 指定レポートの詳細を取得
 * @requirements 6.7 - 指定レポートの詳細を返す
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReportByFilename } from '@/lib/parsers/report';
import type { ApiResponse, Report, ReportType } from '@/lib/types';

/**
 * 有効なレポートタイプ
 */
const VALID_TYPES: ReportType[] = ['daily', 'weekly'];

/**
 * GET /api/reports/[type]/[filename]
 * 指定レポートの詳細を取得する
 * @param request - リクエスト
 * @param params - パスパラメータ
 * @returns レポート詳細
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; filename: string }> }
): Promise<NextResponse<ApiResponse<Report>>> {
  try {
    const { type, filename } = await params;

    // タイプの検証
    if (!type || !VALID_TYPES.includes(type as ReportType)) {
      return NextResponse.json(
        { error: '無効なレポートタイプです。daily または weekly を指定してください。' },
        { status: 400 }
      );
    }

    if (!filename) {
      return NextResponse.json({ error: 'ファイル名が指定されていません' }, { status: 400 });
    }

    const result = getReportByFilename(type as ReportType, filename);

    if (!result.success) {
      // レポートが見つからない場合は404
      if (result.error.includes('見つかりません')) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `レポートの取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
