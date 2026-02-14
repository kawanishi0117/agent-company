/**
 * @file Tech Debt API Route
 * @description 技術的負債トレンド取得API
 * @see Requirements: 9.5
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

/** プロジェクトルートパス */
const PROJECT_ROOT = path.join(process.cwd(), '..', '..');

/** 技術的負債データディレクトリ */
const TECH_DEBT_DIR = path.join(PROJECT_ROOT, 'runtime', 'state', 'tech-debt');

/**
 * GET /api/tech-debt
 * 技術的負債トレンドを取得する
 * クエリパラメータ: projectId（必須）, days（デフォルト: 30）
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId は必須です' },
        { status: 400 }
      );
    }

    // スナップショットを読み込み
    const filePath = path.join(TECH_DEBT_DIR, `${projectId}.json`);
    let snapshots: unknown[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      snapshots = JSON.parse(content);
    } catch {
      // ファイルがない場合は空配列
    }

    // 期間フィルタ
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    interface SnapshotLike {
      date: string;
    }

    const filtered = (snapshots as SnapshotLike[]).filter(
      (s) => s.date >= cutoffStr
    );

    return NextResponse.json({ data: filtered });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
