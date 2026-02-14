/**
 * @file Knowledge API Route
 * @description ナレッジベースの検索・追加API
 * @see Requirements: 7.8
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

/** プロジェクトルートパス */
const PROJECT_ROOT = path.join(process.cwd(), '..', '..');

/** ナレッジベースディレクトリ */
const KB_DIR = path.join(PROJECT_ROOT, 'runtime', 'state', 'knowledge-base');
const INDEX_FILE = path.join(KB_DIR, 'index.json');
const ENTRIES_DIR = path.join(KB_DIR, 'entries');

/**
 * GET /api/knowledge
 * ナレッジエントリの検索・一覧取得
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') ?? '';
    const category = searchParams.get('category') ?? '';
    const tag = searchParams.get('tag') ?? '';

    // インデックスを読み込み
    let entries: Record<string, unknown>[] = [];
    try {
      const content = await fs.readFile(INDEX_FILE, 'utf-8');
      entries = JSON.parse(content);
    } catch {
      // ファイルなし → 空配列
    }

    // フィルタ適用
    let filtered = entries;

    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          String(e.title ?? '').toLowerCase().includes(lowerQuery) ||
          String(e.content ?? '').toLowerCase().includes(lowerQuery) ||
          (Array.isArray(e.tags) &&
            e.tags.some((t: string) => t.toLowerCase().includes(lowerQuery)))
      );
    }

    if (category) {
      filtered = filtered.filter((e) => e.category === category);
    }

    if (tag) {
      filtered = filtered.filter(
        (e) => Array.isArray(e.tags) && e.tags.includes(tag)
      );
    }

    // 新しい順にソート
    filtered.sort(
      (a, b) =>
        new Date(String(b.createdAt ?? '')).getTime() -
        new Date(String(a.createdAt ?? '')).getTime()
    );

    return NextResponse.json({ data: filtered });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/knowledge
 * ナレッジエントリの追加
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { title, category, content, tags, relatedWorkflows, authorAgentId } =
      body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'title と content は必須です' },
        { status: 400 }
      );
    }

    const entry = {
      id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      category: category ?? 'technical_note',
      content,
      tags: tags ?? [],
      relatedWorkflows: relatedWorkflows ?? [],
      authorAgentId: authorAgentId ?? 'ceo',
      createdAt: new Date().toISOString(),
    };

    // エントリファイルを保存
    await fs.mkdir(ENTRIES_DIR, { recursive: true });
    await fs.writeFile(
      path.join(ENTRIES_DIR, `${entry.id}.json`),
      JSON.stringify(entry, null, 2),
      'utf-8'
    );

    // インデックスを更新
    let index: Record<string, unknown>[] = [];
    try {
      const content = await fs.readFile(INDEX_FILE, 'utf-8');
      index = JSON.parse(content);
    } catch {
      // 新規作成
    }
    index.push(entry);
    await fs.mkdir(KB_DIR, { recursive: true });
    await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
