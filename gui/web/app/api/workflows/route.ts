/**
 * @file Workflows API Route
 * @description GET/POST /api/workflows - ワークフロー一覧取得・新規作成
 * @see Requirements: 15.1, 15.2
 */

import { NextRequest, NextResponse } from 'next/server';

/** Orchestrator Server のベースURL */
const API_BASE = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

/**
 * GET /api/workflows
 * ワークフロー一覧を取得（Orchestrator Server へプロキシ）
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const status = request.nextUrl.searchParams.get('status');
    const params = status ? `?status=${status}` : '';
    const res = await fetch(`${API_BASE}/api/workflows${params}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { success: false, error: `ワークフロー一覧の取得に失敗: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workflows
 * ワークフローを開始（Orchestrator Server へプロキシ）
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { success: false, error: `ワークフロー開始に失敗: ${message}` },
      { status: 500 }
    );
  }
}
