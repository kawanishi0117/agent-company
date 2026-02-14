/**
 * @file Market Research API Route
 * @description 市場調査レポートの一覧取得・調査リクエストAPI
 * @see Requirements: 12.7
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

/** プロジェクトルートパス */
const PROJECT_ROOT = path.join(process.cwd(), '..', '..');

/** 市場調査データディレクトリ */
const MARKET_RESEARCH_DIR = path.join(
  PROJECT_ROOT,
  'runtime',
  'state',
  'market-research'
);

/**
 * GET /api/market-research
 * 市場調査レポート一覧を取得する
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    let reports: unknown[] = [];

    try {
      const entries = await fs.readdir(MARKET_RESEARCH_DIR);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const filePath = path.join(MARKET_RESEARCH_DIR, entry);
          const content = await fs.readFile(filePath, 'utf-8');
          reports.push(JSON.parse(content));
        }
      }
    } catch {
      // ディレクトリがない場合は空配列
    }

    // 新しい順にソート
    interface ReportLike {
      createdAt: string;
    }
    reports = (reports as ReportLike[]).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ data: reports });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/market-research
 * 市場調査リクエストを送信する
 * body: { topic: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { topic } = body;

    if (!topic) {
      return NextResponse.json(
        { error: 'topic は必須です' },
        { status: 400 }
      );
    }

    // OrchestratorServerに委譲
    const orchestratorUrl = process.env.ORCHESTRATOR_API_URL ?? 'http://localhost:3001';
    const res = await fetch(`${orchestratorUrl}/api/market-research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });

    if (!res.ok) {
      // フォールバック: ローカルでプレースホルダーを生成
      const id = `mr-${Date.now()}`;
      const report = {
        id,
        topic,
        overview: `${topic}に関する市場調査リクエストを受け付けました`,
        competitors: [],
        trends: [],
        recommendations: [],
        sources: [],
        createdAt: new Date().toISOString(),
      };

      await fs.mkdir(MARKET_RESEARCH_DIR, { recursive: true });
      await fs.writeFile(
        path.join(MARKET_RESEARCH_DIR, `${id}.json`),
        JSON.stringify(report, null, 2),
        'utf-8'
      );

      return NextResponse.json({ data: report });
    }

    const data = await res.json();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
