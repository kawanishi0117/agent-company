/**
 * @file Mood Alerts API Route
 * @description GET /api/mood-alerts - ムードアラート（低ムード社員）取得
 * @see Requirements: 13.4
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const MOOD_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'employee-mood');

/** ムードアラート閾値 */
const MOOD_ALERT_THRESHOLD = 40;

/** ムードデータ */
interface MoodData {
  agentId: string;
  currentMood: number;
  history: Array<{
    score: number;
    timestamp: string;
  }>;
}

/** アラート情報 */
interface MoodAlert {
  agentId: string;
  currentMood: number;
  trend: 'declining' | 'stable' | 'improving';
}

export async function GET(): Promise<NextResponse> {
  try {
    const alerts: MoodAlert[] = [];

    let files: string[] = [];
    try {
      files = await fs.readdir(MOOD_DIR);
    } catch {
      // ディレクトリなしの場合は空
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(MOOD_DIR, file), 'utf-8');
        const data = JSON.parse(content) as MoodData;

        if (data.currentMood < MOOD_ALERT_THRESHOLD) {
          // トレンド判定（直近3件）
          const recent = data.history.slice(-3);
          let trend: MoodAlert['trend'] = 'stable';
          if (recent.length >= 2) {
            const diff = recent[recent.length - 1].score - recent[0].score;
            if (diff > 5) trend = 'improving';
            else if (diff < -5) trend = 'declining';
          }

          alerts.push({
            agentId: data.agentId,
            currentMood: data.currentMood,
            trend,
          });
        }
      } catch {
        // パース失敗は無視
      }
    }

    // ムードが低い順にソート
    alerts.sort((a, b) => a.currentMood - b.currentMood);

    return NextResponse.json({ data: alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
