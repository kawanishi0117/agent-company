/**
 * @file Review API Route
 * @description GET /api/review - 承認待ちタスク一覧、POST - 承認/却下操作
 * @requirements 19.8
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/**
 * ファイル変更
 */
interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  diff?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

/**
 * レビュー待ちタスク
 */
interface ReviewTask {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  assignedWorker: string;
  gitBranch: string;
  completedAt: string;
  fileChanges: FileChange[];
  qualityGates: {
    lint: { passed: boolean; details?: string };
    test: { passed: boolean; details?: string };
  };
  comments: Array<{
    id: string;
    filePath: string;
    line?: number;
    content: string;
    author: string;
    createdAt: string;
  }>;
}

/**
 * API レスポンス型
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// =============================================================================
// 定数
// =============================================================================

// GUIは gui/web/ から実行されるため、ルートへは2階層上がる必要がある
const BACKLOG_DIR = path.join(process.cwd(), '..', '..', 'workflows', 'backlog');
const RUNS_DIR = path.join(process.cwd(), '..', '..', 'runtime', 'runs');
const REVIEW_STATE_FILE = path.join(process.cwd(), '..', '..', 'runtime', 'state', 'reviews.json');

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ファイルが存在するか確認
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * レビュー状態を読み込み
 */
async function loadReviewState(): Promise<{
  reviews: Record<string, { status: string; comments: ReviewTask['comments'] }>;
}> {
  try {
    if (await fileExists(REVIEW_STATE_FILE)) {
      const content = await fs.readFile(REVIEW_STATE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // エラーは無視
  }
  return { reviews: {} };
}

/**
 * レビュー状態を保存
 */
async function saveReviewState(state: {
  reviews: Record<string, { status: string; comments: ReviewTask['comments'] }>;
}): Promise<void> {
  const dir = path.dirname(REVIEW_STATE_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(REVIEW_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * チケットファイルをパース
 */
async function parseTicketFile(ticketPath: string): Promise<{
  id: string;
  title: string;
  description: string;
  status: string;
  assignee: string;
} | null> {
  try {
    const content = await fs.readFile(ticketPath, 'utf-8');

    // フロントマターをパース
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontMatter: Record<string, string> = {};

    if (frontMatterMatch) {
      const lines = frontMatterMatch[1].split('\n');
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          frontMatter[key.trim()] = valueParts.join(':').trim();
        }
      }
    }

    // タイトルを抽出
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : frontMatter.id || 'Unknown';

    // 説明を抽出
    const descriptionMatch = content.match(/## 指示内容\n\n([\s\S]*?)(?=\n##|$)/);
    const description = descriptionMatch
      ? descriptionMatch[1].trim()
      : content
          .replace(/^---[\s\S]*?---/, '')
          .trim()
          .slice(0, 200);

    return {
      id: frontMatter.id || path.basename(ticketPath, '.md'),
      title,
      description,
      status: frontMatter.status || 'todo',
      assignee: frontMatter.assignee || 'unassigned',
    };
  } catch {
    return null;
  }
}

/**
 * レビュー待ちタスクを取得
 */
async function getReviewTasks(): Promise<ReviewTask[]> {
  const tasks: ReviewTask[] = [];
  const reviewState = await loadReviewState();

  try {
    // バックログからreviewステータスのチケットを探す
    const files = await fs.readdir(BACKLOG_DIR);

    for (const file of files) {
      if (!file.endsWith('.md') || file === 'TEMPLATE.md') continue;

      const ticketPath = path.join(BACKLOG_DIR, file);
      const ticket = await parseTicketFile(ticketPath);

      if (!ticket || ticket.status !== 'review') continue;

      // 実行情報を探す
      let runInfo: {
        gitBranch?: string;
        completedAt?: string;
        fileChanges: FileChange[];
        qualityGates?: ReviewTask['qualityGates'];
      } = {
        fileChanges: [],
      };

      try {
        const runs = await fs.readdir(RUNS_DIR);
        for (const runId of runs.reverse()) {
          if (runId === '.gitkeep') continue;

          const runPath = path.join(RUNS_DIR, runId);
          const stat = await fs.stat(runPath);
          if (!stat.isDirectory()) continue;

          const resultPath = path.join(runPath, 'result.json');
          if (await fileExists(resultPath)) {
            const resultContent = await fs.readFile(resultPath, 'utf-8');
            const result = JSON.parse(resultContent);

            if (result.ticketId === ticket.id || result.ticket_id === ticket.id) {
              runInfo = {
                gitBranch: result.gitBranch || result.git_branch || `agent/${ticket.id}`,
                completedAt: result.endTime || result.end_time || new Date().toISOString(),
                fileChanges: (result.artifacts || []).map(
                  (
                    a:
                      | {
                          path?: string;
                          type?: string;
                          diff?: string;
                          linesAdded?: number;
                          linesRemoved?: number;
                        }
                      | string
                  ) => ({
                    path: typeof a === 'string' ? a : a.path || 'unknown',
                    type: typeof a === 'string' ? 'modified' : a.type || 'modified',
                    diff: typeof a === 'string' ? undefined : a.diff,
                    linesAdded: typeof a === 'string' ? undefined : a.linesAdded,
                    linesRemoved: typeof a === 'string' ? undefined : a.linesRemoved,
                  })
                ),
                qualityGates: result.qualityGates ||
                  result.quality_gates || {
                    lint: { passed: true },
                    test: { passed: true },
                  },
              };
              break;
            }
          }
        }
      } catch {
        // エラーは無視
      }

      // レビュー状態からコメントを取得
      const reviewData = reviewState.reviews[ticket.id] || { status: 'pending', comments: [] };

      tasks.push({
        id: ticket.id,
        ticketId: ticket.id,
        title: ticket.title,
        description: ticket.description,
        assignedWorker: ticket.assignee,
        gitBranch: runInfo.gitBranch || `agent/${ticket.id}`,
        completedAt: runInfo.completedAt || new Date().toISOString(),
        fileChanges: runInfo.fileChanges,
        qualityGates: runInfo.qualityGates || {
          lint: { passed: true },
          test: { passed: true },
        },
        comments: reviewData.comments,
      });
    }
  } catch {
    // エラーは無視
  }

  return tasks;
}

/**
 * チケットステータスを更新
 */
async function updateTicketStatus(ticketId: string, newStatus: string): Promise<void> {
  const files = await fs.readdir(BACKLOG_DIR);
  const ticketFile = files.find((f) => f.startsWith(ticketId) && f.endsWith('.md'));

  if (!ticketFile) return;

  const ticketPath = path.join(BACKLOG_DIR, ticketFile);
  let content = await fs.readFile(ticketPath, 'utf-8');

  // ステータスを更新
  content = content.replace(/^(status:\s*).+$/m, `$1${newStatus}`);

  // 更新日時を更新
  content = content.replace(/^(updated:\s*).+$/m, `$1${new Date().toISOString()}`);

  await fs.writeFile(ticketPath, content);
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/review
 * 承認待ちタスク一覧を取得
 * @see Requirement 19.1, 19.2
 */
export async function GET(): Promise<NextResponse<ApiResponse<{ tasks: ReviewTask[] }>>> {
  try {
    const tasks = await getReviewTasks();

    return NextResponse.json({
      data: { tasks },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `レビュータスクの取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/review
 * 承認/却下/コメント操作
 * @see Requirement 19.4, 19.5, 19.6, 19.7
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ success: boolean; message: string }>>> {
  try {
    const body = await request.json();
    const { taskId, action, comment, filePath, line } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'タスクIDは必須です' }, { status: 400 });
    }

    const reviewState = await loadReviewState();
    let message = '';

    switch (action) {
      case 'approve':
        // チケットステータスをdoneに更新
        await updateTicketStatus(taskId, 'done');
        reviewState.reviews[taskId] = {
          ...reviewState.reviews[taskId],
          status: 'approved',
        };
        message = 'タスクを承認しました。マージを開始します。';
        break;

      case 'reject':
        // チケットステータスをdoingに戻す
        await updateTicketStatus(taskId, 'doing');
        reviewState.reviews[taskId] = {
          ...reviewState.reviews[taskId],
          status: 'rejected',
        };
        message = 'タスクを却下しました。';
        break;

      case 'request_changes':
        // チケットステータスをdoingに戻す
        await updateTicketStatus(taskId, 'doing');
        reviewState.reviews[taskId] = {
          ...reviewState.reviews[taskId],
          status: 'changes_requested',
        };
        message = '修正を依頼しました。';
        break;

      case 'comment':
        if (!comment || typeof comment !== 'string') {
          return NextResponse.json({ error: 'コメント内容は必須です' }, { status: 400 });
        }

        // コメントを追加
        if (!reviewState.reviews[taskId]) {
          reviewState.reviews[taskId] = { status: 'pending', comments: [] };
        }

        reviewState.reviews[taskId].comments.push({
          id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          filePath: filePath || '',
          line: line,
          content: comment,
          author: 'President',
          createdAt: new Date().toISOString(),
        });
        message = 'コメントを追加しました。';
        break;

      default:
        return NextResponse.json({ error: `不明なアクション: ${action}` }, { status: 400 });
    }

    await saveReviewState(reviewState);

    return NextResponse.json({
      data: { success: true, message },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `操作に失敗しました: ${message}` }, { status: 500 });
  }
}
