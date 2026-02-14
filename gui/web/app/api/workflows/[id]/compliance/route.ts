/**
 * @file Compliance API Route
 * @description ワークフローの仕様適合レポート取得API
 * @see Requirements: 8.6
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

/** プロジェクトルートパス */
const PROJECT_ROOT = path.join(process.cwd(), '..', '..');

/** 適合レポート保存ディレクトリ */
const COMPLIANCE_DIR = path.join(PROJECT_ROOT, 'runtime', 'state', 'compliance');

/**
 * GET /api/workflows/[id]/compliance
 * 仕様適合レポートを取得する
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const workflowId = params.id;
    const filePath = path.join(COMPLIANCE_DIR, `${workflowId}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const report = JSON.parse(content);
      return NextResponse.json({ data: report });
    } catch {
      return NextResponse.json({ data: null, message: 'レポートが見つかりません' });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
