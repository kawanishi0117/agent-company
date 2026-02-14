/**
 * @file MVP API Route
 * @description GET /api/mvp - MVP履歴・候補取得
 * @see Requirements: 16.2, 16.3, 16.4
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const AWARDS_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'awards');
const MVP_HISTORY_FILE = path.join(AWARDS_DIR, 'mvp-history.json');

/** MVP表彰 */
interface MVPAward {
  month: string;
  agentId: string;
  score: number;
  reason: string;
  awardedAt: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    let history: MVPAward[] = [];
    try {
      const content = await fs.readFile(MVP_HISTORY_FILE, 'utf-8');
      history = JSON.parse(content) as MVPAward[];
    } catch {
      // ファイルなしの場合は空配列
    }

    // 最新のMVP
    const latest = history.length > 0 ? history[0] : null;

    return NextResponse.json({
      data: {
        history,
        latest,
        totalAwards: history.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
