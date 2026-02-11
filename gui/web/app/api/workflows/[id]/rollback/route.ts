/**
 * @file Workflow Rollback API Route
 * @description POST /api/workflows/:id/rollback - フェーズロールバック
 * @see Requirements: 15.9
 */

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

/**
 * POST /api/workflows/:id/rollback
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/workflows/${params.id}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { success: false, error: `ロールバックに失敗: ${message}` },
      { status: 500 }
    );
  }
}
