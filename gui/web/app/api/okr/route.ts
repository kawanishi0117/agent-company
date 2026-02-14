/**
 * @file OKR API Route
 * @description OKRデータの取得・更新API
 * @see Requirements: 11.6
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

/** プロジェクトルートパス */
const PROJECT_ROOT = path.join(process.cwd(), '..', '..');

/** OKRデータファイルパス */
const OKR_FILE = path.join(PROJECT_ROOT, 'runtime', 'state', 'okr', 'current.json');

/** デフォルトOKRデータ */
const DEFAULT_OKR = {
  quarter: 'Q1 2026',
  objectives: [
    {
      id: 'obj-1',
      title: '品質の向上',
      keyResults: [
        { id: 'kr-1', title: 'テストカバレッジ80%以上', target: 80, current: 0 },
        { id: 'kr-2', title: 'lintエラー0件', target: 0, current: 0 },
      ],
    },
    {
      id: 'obj-2',
      title: '生産性の向上',
      keyResults: [
        { id: 'kr-3', title: 'タスク成功率90%以上', target: 90, current: 0 },
      ],
    },
  ],
  updatedAt: new Date().toISOString(),
};

/** OKRデータを読み込む */
async function loadOkr(): Promise<typeof DEFAULT_OKR> {
  try {
    const content = await fs.readFile(OKR_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { ...DEFAULT_OKR };
  }
}

/**
 * GET /api/okr
 * OKRデータを取得する
 */
export async function GET(): Promise<NextResponse> {
  try {
    const okr = await loadOkr();
    return NextResponse.json({ data: okr });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/okr
 * OKRデータを更新する
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const dir = path.dirname(OKR_FILE);
    await fs.mkdir(dir, { recursive: true });

    const updated = { ...body, updatedAt: new Date().toISOString() };
    await fs.writeFile(OKR_FILE, JSON.stringify(updated, null, 2), 'utf-8');

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
