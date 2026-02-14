/**
 * @file Executive Meeting API Route
 * @description 経営会議トリガーAPI
 * @see Requirements: 10.6
 */

import { NextResponse } from 'next/server';

/**
 * POST /api/meetings/executive
 * 経営会議をトリガーする
 * OrchestratorServerに委譲
 */
export async function POST(): Promise<NextResponse> {
  try {
    const orchestratorUrl = process.env.ORCHESTRATOR_API_URL ?? 'http://localhost:3001';
    const res = await fetch(`${orchestratorUrl}/api/meetings/executive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: '経営会議の開始に失敗しました' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
