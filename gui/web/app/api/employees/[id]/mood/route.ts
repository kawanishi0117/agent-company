/**
 * @file Employee Mood API Route
 * @description GET /api/employees/[id]/mood - 社員のムード履歴取得
 * @see Requirements: 13.3, 13.5
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const MOOD_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'employee-mood');

/** ムードエントリ */
interface MoodEntry {
  score: number;
  factors: {
    successRate: number;
    workload: number;
    escalationFrequency: number;
    consecutiveFailures: number;
  };
  timestamp: string;
}

/** ムードデータファイル */
interface MoodData {
  agentId: string;
  currentMood: number;
  history: MoodEntry[];
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const agentId = params.id;
    const filePath = path.join(MOOD_DIR, `${agentId}.json`);

    let data: MoodData;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(content) as MoodData;
    } catch {
      // データなしの場合はデフォルト値
      data = { agentId, currentMood: 70, history: [] };
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
