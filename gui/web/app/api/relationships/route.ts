/**
 * @file Relationships API Route
 * @description GET /api/relationships - 社員間の関係性マップ取得
 * @see Requirements: 14.2, 14.3
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const RELATIONSHIPS_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'relationships');

/** インタラクション記録 */
interface Interaction {
  from: string;
  to: string;
  type: string;
  count: number;
  lastInteraction: string;
}

/** 関係性データ */
interface RelationshipData {
  interactions: Interaction[];
  lastUpdated: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const filePath = path.join(RELATIONSHIPS_DIR, 'interactions.json');

    let data: RelationshipData;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(content) as RelationshipData;
    } catch {
      data = { interactions: [], lastUpdated: new Date().toISOString() };
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
