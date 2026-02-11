/**
 * @file Workflow Meetings API Route
 * @description GET /api/workflows/:id/meetings - 会議録一覧取得
 * @see Requirements: 15.7
 */

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

/**
 * GET /api/workflows/:id/meetings
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/workflows/${params.id}/meetings`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { success: false, error: `会議録の取得に失敗: ${message}` },
      { status: 500 }
    );
  }
}
