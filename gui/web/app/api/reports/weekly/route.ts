/**
 * @file Weekly Reports API Route
 * @description GET /api/reports/weekly - 週報一覧の取得
 * @see Requirements: 4.4, 4.6
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 定数
// =============================================================================

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const WEEKLY_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'reports', 'weekly');

// =============================================================================
// ユーティリティ
// =============================================================================

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// GET /api/reports/weekly
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get('weekStart');
    const limit = parseInt(searchParams.get('limit') ?? '12', 10);

    // 特定週の週報を取得
    if (weekStart) {
      const report = await safeReadJson(
        path.join(WEEKLY_DIR, `${weekStart}.json`)
      );
      if (!report) {
        return NextResponse.json(
          { error: `${weekStart}週の週報が見つかりません` },
          { status: 404 }
        );
      }
      return NextResponse.json({ data: report });
    }

    // 週報一覧を取得（日付降順）
    const files = await safeReadDir(WEEKLY_DIR);
    const jsonFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const reports = [];
    for (const file of jsonFiles) {
      const report = await safeReadJson(path.join(WEEKLY_DIR, file));
      if (report) reports.push(report);
    }

    return NextResponse.json({ data: { reports } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
