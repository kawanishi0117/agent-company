/**
 * @file Backlog API Route
 * @description GET /api/backlog - チケット一覧を取得
 * @requirements 6.2 - workflows/backlog/からチケット一覧を返す
 */

import { NextResponse } from 'next/server';
import { getAllTicketSummaries } from '@/lib/parsers/ticket';
import type { ApiResponse, TicketSummary } from '@/lib/types';

/**
 * GET /api/backlog
 * チケット一覧を取得する
 * @returns チケットサマリーの配列
 */
export async function GET(): Promise<NextResponse<ApiResponse<TicketSummary[]>>> {
  try {
    const result = getAllTicketSummaries();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `チケット一覧の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
