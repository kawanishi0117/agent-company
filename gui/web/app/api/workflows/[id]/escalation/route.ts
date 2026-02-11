/**
 * @file Workflow Escalation API Route
 * @description POST /api/workflows/:id/escalation - エスカレーション決定送信
 * @see Requirements: 15.8
 */

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

/**
 * POST /api/workflows/:id/escalation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/workflows/${params.id}/escalation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { success: false, error: `エスカレーション決定の送信に失敗: ${message}` },
      { status: 500 }
    );
  }
}
