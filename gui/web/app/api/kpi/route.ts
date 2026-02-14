/**
 * @file KPI API Route
 * @description KPIデータ集計・取得API
 * @see Requirements: 11.6
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

/** プロジェクトルートパス */
const PROJECT_ROOT = path.join(process.cwd(), '..', '..');

/**
 * GET /api/kpi
 * KPIデータを集計して返す
 */
export async function GET(): Promise<NextResponse> {
  try {
    // パフォーマンスデータから集計
    const performanceDir = path.join(PROJECT_ROOT, 'runtime', 'state', 'performance');
    const techDebtDir = path.join(PROJECT_ROOT, 'runtime', 'state', 'tech-debt');

    // パフォーマンス集計
    let totalTasks = 0;
    let totalSuccesses = 0;
    let totalQuality = 0;
    let agentCount = 0;

    try {
      const entries = await fs.readdir(performanceDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const content = await fs.readFile(
            path.join(performanceDir, entry),
            'utf-8'
          );
          const records = JSON.parse(content) as {
            success: boolean;
            qualityScore: number;
          }[];
          totalTasks += records.length;
          totalSuccesses += records.filter((r) => r.success).length;
          totalQuality += records.reduce((s, r) => s + r.qualityScore, 0);
          agentCount++;
        }
      }
    } catch {
      // ディレクトリがない場合はデフォルト値
    }

    // 技術的負債の最新データ
    let latestTechDebt = null;
    try {
      const entries = await fs.readdir(techDebtDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const content = await fs.readFile(
            path.join(techDebtDir, entry),
            'utf-8'
          );
          const snapshots = JSON.parse(content) as { date: string }[];
          if (snapshots.length > 0) {
            latestTechDebt = snapshots[snapshots.length - 1];
          }
        }
      }
    } catch {
      // デフォルト
    }

    const kpi = {
      productivity: {
        totalTasks,
        successRate: totalTasks > 0 ? Math.round((totalSuccesses / totalTasks) * 100) : 0,
        avgQuality: totalTasks > 0 ? Math.round((totalQuality / totalTasks) * 10) / 10 : 0,
        activeAgents: agentCount,
      },
      techDebt: latestTechDebt,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ data: kpi });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
