/**
 * @file Task Detail API Route
 * @description GET /api/tasks/[id] - タスク詳細取得、POST - 介入操作
 * @requirements 18.8
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/**
 * タスクステータス
 */
type TaskStatus = 'pending' | 'executing' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * 会話メッセージ
 */
interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
    result?: string;
  };
}

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
 * タスク詳細
 */
interface TaskDetail {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedWorker?: string;
  projectId: string;
  projectName: string;
  gitBranch?: string;
  startedAt?: string;
  completedAt?: string;
  conversation: ConversationMessage[];
  fileChanges: FileChange[];
  logs: string[];
  qualityGates?: {
    lint: { passed: boolean; details?: string };
    test: { passed: boolean; details?: string };
  };
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
const STATE_DIR = path.join(process.cwd(), '..', '..', 'runtime', 'state');

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
 * チケットファイルをパース
 */
async function parseTicketFile(ticketId: string): Promise<{
  title: string;
  description: string;
  status: string;
  assignee: string;
  project?: string;
} | null> {
  try {
    // チケットファイルを探す
    const files = await fs.readdir(BACKLOG_DIR);
    const ticketFile = files.find((f) => f.startsWith(ticketId) && f.endsWith('.md'));

    if (!ticketFile) return null;

    const content = await fs.readFile(path.join(BACKLOG_DIR, ticketFile), 'utf-8');

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
    const title = titleMatch ? titleMatch[1] : ticketId;

    // 説明を抽出
    const descriptionMatch = content.match(/## 指示内容\n\n([\s\S]*?)(?=\n##|$)/);
    const description = descriptionMatch
      ? descriptionMatch[1].trim()
      : content.replace(/^---[\s\S]*?---/, '').trim();

    return {
      title,
      description,
      status: frontMatter.status || 'todo',
      assignee: frontMatter.assignee || 'unassigned',
      project: frontMatter.project,
    };
  } catch {
    return null;
  }
}

/**
 * 実行情報を取得
 */
async function getRunInfo(ticketId: string): Promise<{
  runId: string;
  conversation: ConversationMessage[];
  fileChanges: FileChange[];
  logs: string[];
  gitBranch?: string;
  startedAt?: string;
  completedAt?: string;
  status: TaskStatus;
  qualityGates?: TaskDetail['qualityGates'];
} | null> {
  try {
    // 実行ディレクトリを探す
    const runs = await fs.readdir(RUNS_DIR);

    // チケットIDに関連する実行を探す
    for (const runId of runs.reverse()) {
      if (runId === '.gitkeep') continue;

      const runPath = path.join(RUNS_DIR, runId);
      const stat = await fs.stat(runPath);
      if (!stat.isDirectory()) continue;

      // result.jsonを確認
      const resultPath = path.join(runPath, 'result.json');
      if (await fileExists(resultPath)) {
        const resultContent = await fs.readFile(resultPath, 'utf-8');
        const result = JSON.parse(resultContent);

        if (result.ticketId === ticketId || result.ticket_id === ticketId) {
          // 会話履歴を読み込み
          const conversation: ConversationMessage[] = [];
          const conversationPath = path.join(runPath, 'conversation.json');
          if (await fileExists(conversationPath)) {
            const convContent = await fs.readFile(conversationPath, 'utf-8');
            const convData = JSON.parse(convContent);
            if (Array.isArray(convData)) {
              conversation.push(...convData);
            } else if (convData.messages) {
              conversation.push(...convData.messages);
            }
          }

          // ログを読み込み
          const logs: string[] = [];
          const logsPath = path.join(runPath, 'logs.txt');
          if (await fileExists(logsPath)) {
            const logsContent = await fs.readFile(logsPath, 'utf-8');
            logs.push(...logsContent.split('\n').filter(Boolean));
          }

          // ファイル変更を取得
          const fileChanges: FileChange[] = [];
          if (result.artifacts) {
            for (const artifact of result.artifacts) {
              fileChanges.push({
                path: artifact.path || artifact,
                type: artifact.type || 'modified',
                diff: artifact.diff,
                linesAdded: artifact.linesAdded,
                linesRemoved: artifact.linesRemoved,
              });
            }
          }

          // ステータスを判定
          let status: TaskStatus = 'pending';
          if (result.status === 'completed' || result.status === 'success') {
            status = 'completed';
          } else if (result.status === 'failed' || result.status === 'error') {
            status = 'failed';
          } else if (result.status === 'executing' || result.status === 'running') {
            status = 'executing';
          } else if (result.status === 'paused') {
            status = 'paused';
          }

          return {
            runId,
            conversation,
            fileChanges,
            logs,
            gitBranch: result.gitBranch || result.git_branch,
            startedAt: result.startTime || result.start_time,
            completedAt: result.endTime || result.end_time,
            status,
            qualityGates: result.qualityGates || result.quality_gates,
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * タスク状態を保存
 */
async function saveTaskState(
  taskId: string,
  state: { status: TaskStatus; additionalInstruction?: string }
): Promise<void> {
  const stateFile = path.join(STATE_DIR, 'tasks', `${taskId}.json`);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });

  let existingState = {};
  if (await fileExists(stateFile)) {
    const content = await fs.readFile(stateFile, 'utf-8');
    existingState = JSON.parse(content);
  }

  await fs.writeFile(
    stateFile,
    JSON.stringify(
      {
        ...existingState,
        ...state,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/tasks/[id]
 * タスク詳細を取得
 * @see Requirement 18.1, 18.2
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<TaskDetail>>> {
  try {
    const { id: taskId } = await params;

    // チケット情報を取得
    const ticket = await parseTicketFile(taskId);
    if (!ticket) {
      return NextResponse.json({ error: `タスク ${taskId} が見つかりません` }, { status: 404 });
    }

    // 実行情報を取得
    const runInfo = await getRunInfo(taskId);

    // タスク詳細を構築
    const taskDetail: TaskDetail = {
      id: taskId,
      ticketId: taskId,
      title: ticket.title,
      description: ticket.description,
      status: runInfo?.status || (ticket.status === 'done' ? 'completed' : 'pending'),
      assignedWorker: ticket.assignee,
      projectId: ticket.project || 'default',
      projectName: ticket.project || 'デフォルト',
      gitBranch: runInfo?.gitBranch,
      startedAt: runInfo?.startedAt,
      completedAt: runInfo?.completedAt,
      conversation: runInfo?.conversation || [],
      fileChanges: runInfo?.fileChanges || [],
      logs: runInfo?.logs || [],
      qualityGates: runInfo?.qualityGates,
    };

    return NextResponse.json({ data: taskDetail });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `タスク詳細の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]
 * タスクへの介入操作
 * @see Requirement 18.3, 18.4, 18.5
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<{ success: boolean; message: string }>>> {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    const { action, instruction } = body;

    // チケットが存在するか確認
    const ticket = await parseTicketFile(taskId);
    if (!ticket) {
      return NextResponse.json({ error: `タスク ${taskId} が見つかりません` }, { status: 404 });
    }

    let message = '';

    switch (action) {
      case 'pause':
        await saveTaskState(taskId, { status: 'paused' });
        message = 'タスクを一時停止しました';
        break;

      case 'resume':
        await saveTaskState(taskId, { status: 'executing' });
        message = 'タスクを再開しました';
        break;

      case 'cancel':
        await saveTaskState(taskId, { status: 'cancelled' });
        message = 'タスクをキャンセルしました';
        break;

      case 'instruct':
        if (!instruction || typeof instruction !== 'string') {
          return NextResponse.json({ error: '追加指示は必須です' }, { status: 400 });
        }
        await saveTaskState(taskId, {
          status: 'executing',
          additionalInstruction: instruction,
        });
        message = '追加指示を送信しました';
        break;

      default:
        return NextResponse.json({ error: `不明なアクション: ${action}` }, { status: 400 });
    }

    return NextResponse.json({
      data: { success: true, message },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `操作に失敗しました: ${message}` }, { status: 500 });
  }
}
