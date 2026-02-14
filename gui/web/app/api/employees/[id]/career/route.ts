/**
 * @file Employee Career API Route
 * @description GET /api/employees/[id]/career - 社員のキャリア履歴取得
 * @see Requirements: 15.4, 15.5
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const CAREER_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'career');

/** キャリアイベント */
interface CareerEvent {
  type: 'initial' | 'promotion' | 'demotion';
  fromLevel?: string;
  toLevel: string;
  reason: string;
  timestamp: string;
}

/** キャリアデータ */
interface CareerData {
  agentId: string;
  currentLevel: string;
  events: CareerEvent[];
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const agentId = params.id;
    const filePath = path.join(CAREER_DIR, `${agentId}.json`);

    let data: CareerData;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(content) as CareerData;
    } catch {
      data = { agentId, currentLevel: 'mid', events: [] };
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
