/**
 * @file Workflow Quality API Route
 * @description GET /api/workflows/:id/quality - 品質結果取得
 * @see Requirements: 15.11
 */

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

/**
 * GET /api/workflows/:id/quality
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/workflows/${params.id}/quality`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { success: false, error: `品質結果の取得に失敗: ${message}` },
      { status: 500 }
    );
  }
}
