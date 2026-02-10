/**
 * @file Tickets API Route
 * @description チケット一覧取得・作成API
 * @requirements 7.1 - チケット階層表示
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * チケットステータス
 */
type TicketStatus =
  | 'pending'
  | 'decomposing'
  | 'in_progress'
  | 'review_requested'
  | 'revision_required'
  | 'completed'
  | 'failed'
  | 'pr_created';

/**
 * ワーカータイプ
 */
type WorkerType = 'research' | 'design' | 'designer' | 'developer' | 'test' | 'reviewer';

/**
 * 孫チケット
 */
interface GrandchildTicket {
  id: string;
  parentId: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: TicketStatus;
  assignee?: string;
  gitBranch?: string;
  artifacts: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 子チケット
 */
interface ChildTicket {
  id: string;
  parentId: string;
  title: string;
  description: string;
  status: TicketStatus;
  workerType: WorkerType;
  createdAt: string;
  updatedAt: string;
  grandchildTickets: GrandchildTicket[];
}

/**
 * 親チケット
 */
interface ParentTicket {
  id: string;
  projectId: string;
  instruction: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  childTickets: ChildTicket[];
  metadata: {
    priority: 'low' | 'medium' | 'high';
    deadline?: string;
    tags: string[];
  };
}

/**
 * チケット永続化データ
 */
interface TicketPersistenceData {
  projectId: string;
  parentTickets: ParentTicket[];
  lastUpdated: string;
}

/**
 * チケット作成リクエスト
 */
interface CreateTicketRequest {
  projectId: string;
  instruction: string;
  priority?: 'low' | 'medium' | 'high';
  deadline?: string;
  tags?: string[];
}

// =============================================================================
// 定数
// =============================================================================

/** チケットディレクトリのパス */
// GUIは gui/web/ から実行されるため、ルートへは2階層上がる必要がある
const TICKETS_DIR = path.join(process.cwd(), '..', '..', 'runtime', 'state', 'tickets');

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * チケットディレクトリを確保
 */
async function ensureTicketsDir(): Promise<void> {
  try {
    await fs.mkdir(TICKETS_DIR, { recursive: true });
  } catch {
    // ディレクトリが既に存在する場合は無視
  }
}

/**
 * プロジェクトのチケットを読み込む
 * プロジェクトIDまたはプロジェクト名でマッチする
 */
async function loadProjectTickets(projectId: string): Promise<ParentTicket[]> {
  await ensureTicketsDir();

  try {
    // まず完全一致で探す
    const exactPath = path.join(TICKETS_DIR, `${projectId}.json`);
    try {
      const content = await fs.readFile(exactPath, 'utf-8');
      const data: TicketPersistenceData = JSON.parse(content);
      return data.parentTickets || [];
    } catch {
      // 完全一致がない場合、プロジェクト名の部分一致を試す
    }

    // プロジェクトIDからプロジェクト名を抽出（例: my-app-44254079 -> my-app）
    // ハイフン+数字で終わる部分を除去
    const projectName = projectId.replace(/-\d+$/, '');
    if (projectName !== projectId) {
      const namePath = path.join(TICKETS_DIR, `${projectName}.json`);
      try {
        const content = await fs.readFile(namePath, 'utf-8');
        const data: TicketPersistenceData = JSON.parse(content);
        return data.parentTickets || [];
      } catch {
        // プロジェクト名でも見つからない
      }
    }

    // ディレクトリ内のすべてのファイルを確認して、projectIdが一致するものを探す
    const files = await fs.readdir(TICKETS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const filePath = path.join(TICKETS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data: TicketPersistenceData = JSON.parse(content);
        // ファイル内のprojectIdがリクエストのprojectIdと一致するか確認
        if (data.projectId === projectId || data.projectId === projectName) {
          return data.parentTickets || [];
        }
      } catch {
        // 個別ファイルのエラーは無視
      }
    }

    return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * 全プロジェクトのチケットを読み込む
 */
async function loadAllTickets(): Promise<ParentTicket[]> {
  await ensureTicketsDir();

  try {
    const files = await fs.readdir(TICKETS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const allTickets: ParentTicket[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(TICKETS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data: TicketPersistenceData = JSON.parse(content);
        allTickets.push(...(data.parentTickets || []));
      } catch {
        // 個別ファイルのエラーは無視
      }
    }

    return allTickets;
  } catch {
    return [];
  }
}

/**
 * プロジェクトのチケットを保存する
 */
async function saveProjectTickets(projectId: string, tickets: ParentTicket[]): Promise<void> {
  await ensureTicketsDir();

  const data: TicketPersistenceData = {
    projectId,
    parentTickets: tickets,
    lastUpdated: new Date().toISOString(),
  };

  const filePath = path.join(TICKETS_DIR, `${projectId}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * チケットIDを生成する
 */
function generateTicketId(projectId: string, sequence: number): string {
  return `${projectId}-${String(sequence).padStart(4, '0')}`;
}

// =============================================================================
// APIハンドラ
// =============================================================================

/**
 * GET /api/tickets
 * チケット一覧を取得する
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ParentTicket[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    let tickets: ParentTicket[];

    if (projectId) {
      tickets = await loadProjectTickets(projectId);
    } else {
      tickets = await loadAllTickets();
    }

    // 作成日時の降順でソート
    tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ data: tickets });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `チケット一覧の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickets
 * 新規親チケットを作成する
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
    const body: CreateTicketRequest = await request.json();

    // バリデーション
    if (!body.projectId) {
      return NextResponse.json({ error: 'プロジェクトIDは必須です' }, { status: 400 });
    }

    if (!body.instruction || body.instruction.trim().length < 10) {
      return NextResponse.json(
        { error: '指示内容は10文字以上で入力してください' },
        { status: 400 }
      );
    }

    // 既存チケットを読み込む
    const tickets = await loadProjectTickets(body.projectId);

    // 新しいシーケンス番号を計算
    const maxSequence = tickets.reduce((max, t) => {
      const match = t.id.match(/-(\d+)$/);
      if (match) {
        return Math.max(max, parseInt(match[1], 10));
      }
      return max;
    }, 0);

    const now = new Date().toISOString();
    const ticketId = generateTicketId(body.projectId, maxSequence + 1);

    const newTicket: ParentTicket = {
      id: ticketId,
      projectId: body.projectId,
      instruction: body.instruction.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      childTickets: [],
      metadata: {
        priority: body.priority || 'medium',
        deadline: body.deadline,
        tags: body.tags || [],
      },
    };

    // 保存
    tickets.push(newTicket);
    await saveProjectTickets(body.projectId, tickets);

    return NextResponse.json({ data: { id: ticketId } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `チケットの作成に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
