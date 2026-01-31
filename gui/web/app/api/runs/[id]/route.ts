/**
 * @file Run Detail API Route
 * @description GET /api/runs/[id] - 指定IDのRun詳細を取得
 * @requirements 6.5 - 指定IDのRun詳細を返す
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRunById } from '@/lib/parsers/run';
import type { ApiResponse, Run } from '@/lib/types';

/**
 * GET /api/runs/[id]
 * 指定IDのRun詳細を取得する
 * @param request - リクエスト
 * @param params - パスパラメータ
 * @returns Run詳細
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<Run>>> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Run IDが指定されていません' }, { status: 400 });
    }

    const result = getRunById(id);

    if (!result.success) {
      // Runが見つからない場合は404
      if (result.error.includes('見つかりません')) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `Runの取得に失敗しました: ${message}` }, { status: 500 });
  }
}
