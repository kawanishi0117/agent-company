/**
 * @file Backlog Detail API Route
 * @description GET /api/backlog/[id] - 指定IDのチケット詳細を取得
 * @requirements 6.3 - 指定IDのチケット詳細を返す
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTicketById } from '@/lib/parsers/ticket';
import type { ApiResponse, Ticket } from '@/lib/types';

/**
 * GET /api/backlog/[id]
 * 指定IDのチケット詳細を取得する
 * @param request - リクエスト
 * @param params - パスパラメータ
 * @returns チケット詳細
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<Ticket>>> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'チケットIDが指定されていません' }, { status: 400 });
    }

    const result = getTicketById(id);

    if (!result.success) {
      // チケットが見つからない場合は404
      if (result.error.includes('見つかりません')) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `チケットの取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
