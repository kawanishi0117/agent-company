/**
 * @file Reports API Route
 * @description GET /api/reports - レポート一覧を取得
 * @requirements 6.6 - workflows/reports/からレポート一覧を返す
 */

import { NextResponse } from 'next/server';
import { getAllReports } from '@/lib/parsers/report';
import type { ApiResponse, GroupedReports } from '@/lib/types';

/**
 * GET /api/reports
 * レポート一覧を取得する（daily/weeklyでグループ化）
 * @returns グループ化されたレポート一覧
 */
export async function GET(): Promise<NextResponse<ApiResponse<GroupedReports>>> {
  try {
    const result = getAllReports();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `レポート一覧の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
