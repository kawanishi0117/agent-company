/**
 * @file Command Center API Route
 * @description POST /api/command - 指示送信、GET /api/command - 履歴取得
 * @requirements 17.8, 23.2 - GUIからの指示でManager Agentが自動処理開始
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/**
 * プロジェクト情報
 */
interface Project {
  id: string;
  name: string;
  git_url: string;
  default_branch: string;
  work_dir: string;
}

/**
 * コマンド履歴項目
 */
interface CommandHistoryItem {
  id: string;
  instruction: string;
  projectId: string;
  projectName: string;
  status: 'pending' | 'decomposing' | 'executing' | 'completed' | 'failed';
  ticketId?: string;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
  subTasks?: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

/**
 * タスク分解プレビュー
 */
interface DecompositionPreview {
  estimatedTasks: number;
  suggestedTasks: Array<{
    title: string;
    description: string;
    estimatedTime: string;
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
const PROJECTS_FILE = path.join(process.cwd(), '..', '..', 'workspaces', 'projects.json');
const COMMAND_HISTORY_FILE = path.join(process.cwd(), '..', '..', 'runtime', 'state', 'command_history.json');
const BACKLOG_DIR = path.join(process.cwd(), '..', '..', 'workflows', 'backlog');

// Orchestrator APIサーバーのURL
const ORCHESTRATOR_API_URL = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * プロジェクト一覧を取得
 * projects.jsonのフィールド名をAPI用に変換
 */
async function getProjects(): Promise<Project[]> {
  try {
    const content = await fs.readFile(PROJECTS_FILE, 'utf-8');
    const data = JSON.parse(content);
    // projects.jsonのcamelCaseをsnake_caseに変換
    return (data.projects || []).map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      git_url: p.gitUrl || p.git_url,
      default_branch: p.defaultBranch || p.default_branch || 'main',
      work_dir: p.workDir || p.work_dir || '',
    }));
  } catch {
    return [];
  }
}

/**
 * コマンド履歴を取得
 */
async function getCommandHistory(): Promise<CommandHistoryItem[]> {
  try {
    const content = await fs.readFile(COMMAND_HISTORY_FILE, 'utf-8');
    const data = JSON.parse(content);
    return data.history || [];
  } catch {
    return [];
  }
}

/**
 * コマンド履歴を保存
 */
async function saveCommandHistory(history: CommandHistoryItem[]): Promise<void> {
  const dir = path.dirname(COMMAND_HISTORY_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    COMMAND_HISTORY_FILE,
    JSON.stringify({ history, lastUpdated: new Date().toISOString() }, null, 2)
  );
}

/**
 * チケットIDを生成
 */
function generateTicketId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `${dateStr}-${random}`;
}

/**
 * チケットファイルを作成
 */
async function createTicketFile(
  ticketId: string,
  instruction: string,
  projectId: string
): Promise<void> {
  const content = `---
id: ${ticketId}
status: todo
assignee: manager
created: ${new Date().toISOString()}
updated: ${new Date().toISOString()}
project: ${projectId}
---

# ${instruction.slice(0, 50)}${instruction.length > 50 ? '...' : ''}

## 指示内容

${instruction}

## 備考

- 自動生成されたチケット
- Command Centerから作成
`;

  await fs.mkdir(BACKLOG_DIR, { recursive: true });
  await fs.writeFile(path.join(BACKLOG_DIR, `${ticketId}.md`), content);
}

/**
 * Orchestrator APIにタスクを送信
 * @see Requirement 23.2: GUIからの指示でManager Agentが自動処理開始
 */
async function submitTaskToOrchestrator(
  instruction: string,
  projectId: string,
  priority?: 'low' | 'medium' | 'high'
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        projectId,
        priority: priority || 'medium',
      }),
    });

    const result = await response.json();

    if (result.success) {
      return { success: true, taskId: result.data.taskId };
    } else {
      return { success: false, error: result.error || 'Unknown error' };
    }
  } catch (error) {
    // Orchestrator APIが起動していない場合はフォールバック
    console.warn('[Command API] Orchestrator API not available:', error);
    return { success: false, error: 'Orchestrator API not available. Run "agentcompany server" first.' };
  }
}

/**
 * Orchestrator APIの状態を確認
 */
async function checkOrchestratorHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000), // 2秒タイムアウト
    });
    const result = await response.json();
    return result.success && result.data?.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * タスク分解のプレビューを生成（簡易版）
 * 実際の実装ではAIを使用してより正確な分解を行う
 */
function generateDecompositionPreview(instruction: string): DecompositionPreview {
  // 簡易的なタスク提案を生成
  const suggestedTasks = [];

  // キーワードに基づいてタスクを提案
  if (instruction.includes('API') || instruction.includes('エンドポイント')) {
    suggestedTasks.push({
      title: 'API設計・実装',
      description: 'APIエンドポイントの設計と実装',
      estimatedTime: '30分',
    });
  }

  if (
    instruction.includes('UI') ||
    instruction.includes('画面') ||
    instruction.includes('コンポーネント')
  ) {
    suggestedTasks.push({
      title: 'UI実装',
      description: 'ユーザーインターフェースの実装',
      estimatedTime: '45分',
    });
  }

  if (instruction.includes('テスト') || instruction.includes('test')) {
    suggestedTasks.push({
      title: 'テスト作成',
      description: 'ユニットテストの作成',
      estimatedTime: '20分',
    });
  }

  // デフォルトタスクを追加
  if (suggestedTasks.length === 0) {
    suggestedTasks.push({
      title: '実装タスク',
      description: instruction.slice(0, 100),
      estimatedTime: '30分',
    });
  }

  return {
    estimatedTasks: suggestedTasks.length,
    suggestedTasks,
  };
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/command
 * コマンド履歴とプロジェクト一覧を取得
 * @see Requirement 17.4, 17.5
 */
export async function GET(): Promise<
  NextResponse<
    ApiResponse<{
      history: CommandHistoryItem[];
      projects: Project[];
    }>
  >
> {
  try {
    const [history, projects] = await Promise.all([getCommandHistory(), getProjects()]);

    // 履歴を新しい順にソート
    const sortedHistory = history.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      data: {
        history: sortedHistory.slice(0, 50), // 最新50件
        projects,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `データの取得に失敗しました: ${message}` }, { status: 500 });
  }
}

/**
 * POST /api/command
 * 新しい指示を送信し、Orchestratorでタスク実行を開始
 * @see Requirement 17.1, 17.2, 17.3, 17.6, 23.2
 */
export async function POST(request: NextRequest): Promise<
  NextResponse<
    ApiResponse<{
      command: CommandHistoryItem;
      preview?: DecompositionPreview;
      orchestratorStatus?: {
        connected: boolean;
        taskId?: string;
        error?: string;
      };
    }>
  >
> {
  try {
    const body = await request.json();
    const { instruction, projectId, previewOnly, autoExecute = true } = body;

    // バリデーション
    if (!instruction || typeof instruction !== 'string') {
      return NextResponse.json({ error: '指示内容は必須です' }, { status: 400 });
    }

    if (instruction.trim().length < 5) {
      return NextResponse.json({ error: '指示内容は5文字以上で入力してください' }, { status: 400 });
    }

    // プロジェクト情報を取得
    const projects = await getProjects();
    const project = projectId ? projects.find((p) => p.id === projectId) : projects[0];

    // プレビューのみの場合
    if (previewOnly) {
      const preview = generateDecompositionPreview(instruction);
      const orchestratorHealthy = await checkOrchestratorHealth();
      return NextResponse.json({
        data: {
          command: {
            id: 'preview',
            instruction,
            projectId: project?.id || 'default',
            projectName: project?.name || 'デフォルト',
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          preview,
          orchestratorStatus: {
            connected: orchestratorHealthy,
          },
        },
      });
    }

    // チケットを作成
    const ticketId = generateTicketId();
    await createTicketFile(ticketId, instruction, project?.id || 'default');

    // コマンド履歴に追加（初期状態）
    const history = await getCommandHistory();
    const newCommand: CommandHistoryItem = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      instruction,
      projectId: project?.id || 'default',
      projectName: project?.name || 'デフォルト',
      status: 'pending',
      ticketId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Orchestratorにタスクを送信（autoExecuteが有効な場合）
    let orchestratorResult: { success: boolean; taskId?: string; error?: string } = {
      success: false,
      error: 'Auto-execute disabled',
    };

    if (autoExecute) {
      orchestratorResult = await submitTaskToOrchestrator(
        instruction,
        project?.id || 'default',
        body.priority
      );

      // Orchestratorからの応答に基づいてステータスを更新
      if (orchestratorResult.success && orchestratorResult.taskId) {
        newCommand.taskId = orchestratorResult.taskId;
        newCommand.status = 'decomposing'; // タスク分解中
      } else {
        // Orchestratorが利用不可でもチケットは作成済み
        // 後でCLIから実行可能
        console.warn('[Command API] Orchestrator not available, ticket created for manual execution');
      }
    }

    history.unshift(newCommand);
    await saveCommandHistory(history);

    // 分解プレビューを生成
    const preview = generateDecompositionPreview(instruction);

    return NextResponse.json({
      data: {
        command: newCommand,
        preview,
        orchestratorStatus: {
          connected: orchestratorResult.success,
          taskId: orchestratorResult.taskId,
          error: orchestratorResult.error,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `指示の送信に失敗しました: ${message}` }, { status: 500 });
  }
}
