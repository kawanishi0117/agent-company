/**
 * @file Ticket Detail API Route
 * @description チケット詳細取得・更新API
 * @requirements 7.6 - チケット詳細表示
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
 * レビュー結果
 */
interface ReviewResult {
  reviewerId: string;
  approved: boolean;
  feedback?: string;
  checklist: {
    codeQuality: boolean;
    testCoverage: boolean;
    acceptanceCriteria: boolean;
  };
  reviewedAt: string;
}

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
  reviewResult?: ReviewResult;
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
 * チケット詳細（統合型）
 */
interface TicketDetail {
  id: string;
  type: 'parent' | 'child' | 'grandchild';
  projectId?: string;
  parentId?: string;
  instruction?: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  status: TicketStatus;
  workerType?: WorkerType;
  assignee?: string;
  gitBranch?: string;
  artifacts?: string[];
  reviewResult?: ReviewResult;
  metadata?: {
    priority: 'low' | 'medium' | 'high';
    deadline?: string;
    tags: string[];
  };
  createdAt: string;
  updatedAt: string;
  childCount?: number;
  grandchildCount?: number;
}

/**
 * ルートパラメータ
 */
interface RouteParams {
  params: Promise<{ id: string }>;
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
 * 全プロジェクトのチケットを読み込む
 */
async function loadAllTickets(): Promise<ParentTicket[]> {
  try {
    await fs.mkdir(TICKETS_DIR, { recursive: true });
  } catch {
    // ディレクトリが既に存在する場合は無視
  }

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
 * チケットIDからチケット詳細を検索
 */
function findTicketById(tickets: ParentTicket[], ticketId: string): TicketDetail | null {
  for (const parent of tickets) {
    // 親チケットをチェック
    if (parent.id === ticketId) {
      return {
        id: parent.id,
        type: 'parent',
        projectId: parent.projectId,
        instruction: parent.instruction,
        status: parent.status,
        metadata: parent.metadata,
        createdAt: parent.createdAt,
        updatedAt: parent.updatedAt,
        childCount: parent.childTickets.length,
        grandchildCount: parent.childTickets.reduce(
          (sum, c) => sum + c.grandchildTickets.length,
          0
        ),
      };
    }

    // 子チケットをチェック
    for (const child of parent.childTickets) {
      if (child.id === ticketId) {
        return {
          id: child.id,
          type: 'child',
          projectId: parent.projectId,
          parentId: parent.id,
          title: child.title,
          description: child.description,
          status: child.status,
          workerType: child.workerType,
          createdAt: child.createdAt,
          updatedAt: child.updatedAt,
          grandchildCount: child.grandchildTickets.length,
        };
      }

      // 孫チケットをチェック
      for (const grandchild of child.grandchildTickets) {
        if (grandchild.id === ticketId) {
          return {
            id: grandchild.id,
            type: 'grandchild',
            projectId: parent.projectId,
            parentId: child.id,
            title: grandchild.title,
            description: grandchild.description,
            acceptanceCriteria: grandchild.acceptanceCriteria,
            status: grandchild.status,
            assignee: grandchild.assignee,
            gitBranch: grandchild.gitBranch,
            artifacts: grandchild.artifacts,
            reviewResult: grandchild.reviewResult,
            createdAt: grandchild.createdAt,
            updatedAt: grandchild.updatedAt,
          };
        }
      }
    }
  }

  return null;
}

// =============================================================================
// APIハンドラ
// =============================================================================

/**
 * GET /api/tickets/[id]
 * チケット詳細を取得する
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<TicketDetail>>> {
  try {
    const { id } = await params;
    const tickets = await loadAllTickets();
    const ticket = findTicketById(tickets, id);

    if (!ticket) {
      return NextResponse.json({ error: 'チケットが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ data: ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `チケットの取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tickets/[id]/status
 * チケットステータスを更新する
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body as { status: TicketStatus };

    // バリデーション
    const validStatuses: TicketStatus[] = [
      'pending',
      'decomposing',
      'in_progress',
      'review_requested',
      'revision_required',
      'completed',
      'failed',
      'pr_created',
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: '無効なステータスです' }, { status: 400 });
    }

    // チケットを検索して更新
    const files = await fs.readdir(TICKETS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = path.join(TICKETS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const data: TicketPersistenceData = JSON.parse(content);
      let updated = false;

      for (const parent of data.parentTickets) {
        if (parent.id === id) {
          parent.status = status;
          parent.updatedAt = new Date().toISOString();
          updated = true;
          break;
        }

        for (const child of parent.childTickets) {
          if (child.id === id) {
            child.status = status;
            child.updatedAt = new Date().toISOString();
            updated = true;
            break;
          }

          for (const grandchild of child.grandchildTickets) {
            if (grandchild.id === id) {
              grandchild.status = status;
              grandchild.updatedAt = new Date().toISOString();
              updated = true;
              break;
            }
          }
          if (updated) break;
        }
        if (updated) break;
      }

      if (updated) {
        data.lastUpdated = new Date().toISOString();
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return NextResponse.json({ data: { success: true } });
      }
    }

    return NextResponse.json({ error: 'チケットが見つかりません' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `ステータスの更新に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
