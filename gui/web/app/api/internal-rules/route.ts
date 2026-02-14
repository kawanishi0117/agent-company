/**
 * @file Internal Rules API Route
 * @description 社内ルールの一覧取得・承認/却下API
 * @see Requirements: 6.8
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

/** プロジェクトルートパス */
const PROJECT_ROOT = path.join(process.cwd(), '..', '..');

/** 社内ルールファイルパス */
const RULES_FILE = path.join(
  PROJECT_ROOT,
  'runtime',
  'state',
  'internal-rules',
  'rules.json'
);

/** ルール型 */
interface InternalRule {
  id: string;
  title: string;
  description: string;
  category: string;
  source: { type: string; workflowId: string };
  status: 'proposed' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
}

/** 承認済みルール追記先ファイルパス */
const AUTO_GENERATED_RULES_FILE = path.join(
  PROJECT_ROOT,
  'docs',
  'company',
  'auto-generated-rules.md'
);

/**
 * 承認済みルールをドキュメントに追記する
 * @param rule - 承認されたルール
 */
async function appendApprovedRuleToDoc(rule: InternalRule): Promise<void> {
  const dir = path.dirname(AUTO_GENERATED_RULES_FILE);
  await fs.mkdir(dir, { recursive: true });

  // ファイルが存在しない場合はヘッダーを作成
  let content = '';
  try {
    content = await fs.readFile(AUTO_GENERATED_RULES_FILE, 'utf-8');
  } catch {
    content = '# 自動生成ルール\n\nレトロスペクティブから自動生成され、CEOに承認されたルール一覧。\n\n';
  }

  // ルールエントリを追記
  const entry = [
    `## ${rule.title}`,
    ``,
    `- カテゴリ: ${rule.category}`,
    `- 承認日: ${rule.approvedAt ?? new Date().toISOString()}`,
    `- ソース: ${rule.source.type} (${rule.source.workflowId})`,
    ``,
    rule.description,
    ``,
    `---`,
    ``,
  ].join('\n');

  content += entry;
  await fs.writeFile(AUTO_GENERATED_RULES_FILE, content, 'utf-8');
}

/** ルールファイルを読み込む */
async function loadRules(): Promise<InternalRule[]> {
  try {
    const content = await fs.readFile(RULES_FILE, 'utf-8');
    return JSON.parse(content) as InternalRule[];
  } catch {
    return [];
  }
}

/** ルールファイルを保存する */
async function saveRules(rules: InternalRule[]): Promise<void> {
  const dir = path.dirname(RULES_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8');
}

/**
 * GET /api/internal-rules
 * 社内ルール一覧取得（statusフィルタ対応）
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let rules = await loadRules();

    if (status) {
      rules = rules.filter((r) => r.status === status);
    }

    // 新しい順にソート
    rules.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ data: rules });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/internal-rules
 * ルールの承認/却下
 * body: { ruleId: string, action: 'approve' | 'reject' }
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { ruleId, action } = body;

    if (!ruleId || !action) {
      return NextResponse.json(
        { error: 'ruleId と action は必須です' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'action は approve または reject のみ' },
        { status: 400 }
      );
    }

    const rules = await loadRules();
    const rule = rules.find((r) => r.id === ruleId);

    if (!rule) {
      return NextResponse.json(
        { error: 'ルールが見つかりません' },
        { status: 404 }
      );
    }

    if (rule.status !== 'proposed') {
      return NextResponse.json(
        { error: 'このルールは既に処理済みです' },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      rule.status = 'approved';
      rule.approvedAt = new Date().toISOString();
      // 承認済みルールをドキュメントに追記
      await appendApprovedRuleToDoc(rule);
    } else {
      rule.status = 'rejected';
    }

    await saveRules(rules);

    return NextResponse.json({ data: rule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
