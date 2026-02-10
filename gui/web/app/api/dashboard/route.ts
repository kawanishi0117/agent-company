/**
 * @file Dashboard API Route
 * @description GET /api/dashboard - ダッシュボードデータの取得（AI可用性ステータス含む）
 * @requirements 16.8, 7.1, 7.2, 7.3
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/**
 * ワーカーステータス
 */
interface WorkerStatus {
  id: string;
  status: 'idle' | 'working' | 'paused' | 'error' | 'terminated';
  currentTask?: {
    id: string;
    title: string;
  };
  startedAt?: string;
}

/**
 * タスクサマリー
 */
interface TaskSummary {
  pending: number;
  executing: number;
  completed: number;
  failed: number;
}

/**
 * アクティビティ項目
 */
interface ActivityItem {
  id: string;
  type:
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'worker_started'
    | 'worker_stopped'
    | 'error';
  message: string;
  timestamp: string;
}

/**
 * AI可用性ステータス
 * @see Requirements 7.1, 7.2, 7.3
 */
interface AIStatus {
  /** AI実行基盤が利用可能かどうか */
  available: boolean;
  /** Ollamaサーバーが起動しているか */
  ollamaRunning: boolean;
  /** インストール済みモデル一覧 */
  modelsInstalled: string[];
  /** 推奨モデル一覧 */
  recommendedModels: string[];
  /** セットアップ手順（利用不可時のみ） */
  setupInstructions?: string;
  /** 最終チェック日時（ISO 8601形式） */
  lastChecked: string;
}

/**
 * ダッシュボードデータ
 */
interface DashboardData {
  workers: WorkerStatus[];
  tasks: TaskSummary;
  activities: ActivityItem[];
  systemStatus: {
    paused: boolean;
    emergencyStopped: boolean;
  };
  /** AI可用性ステータス */
  aiStatus: AIStatus;
  lastUpdated: string;
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
const STATE_DIR = path.join(process.cwd(), '..', '..', 'runtime', 'state');
const BUS_HISTORY_DIR = path.join(STATE_DIR, 'bus', 'history');

// Orchestrator APIサーバーのURL
const ORCHESTRATOR_API_URL = process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001';

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ディレクトリが存在するか確認
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Orchestrator APIの `/api/health/ai` からAI可用性情報を取得する
 * @returns AI可用性ステータス（取得失敗時はフォールバック値を返す）
 * @see Requirements 7.1: AIステータスの表示
 * @see Requirements 7.2: Ollama接続状態の確認
 * @see Requirements 7.3: モデル情報の取得
 */
async function getAIHealthStatus(): Promise<AIStatus> {
  // フォールバック値（AI利用不可）
  const fallback: AIStatus = {
    available: false,
    ollamaRunning: false,
    modelsInstalled: [],
    recommendedModels: ['llama3.2:1b', 'codellama', 'deepseek-coder'],
    setupInstructions: 'Ollamaをインストールして起動してください: https://ollama.ai',
    lastChecked: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${ORCHESTRATOR_API_URL}/api/health/ai`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5秒タイムアウト
    });

    if (!response.ok) {
      return fallback;
    }

    const result = await response.json();

    if (result.success && result.data) {
      const data = result.data as {
        available?: boolean;
        ollamaRunning?: boolean;
        modelsInstalled?: string[];
        recommendedModels?: string[];
        setupInstructions?: string;
      };

      return {
        available: data.available ?? false,
        ollamaRunning: data.ollamaRunning ?? false,
        modelsInstalled: Array.isArray(data.modelsInstalled) ? data.modelsInstalled : [],
        recommendedModels: Array.isArray(data.recommendedModels)
          ? data.recommendedModels
          : fallback.recommendedModels,
        setupInstructions: data.available ? undefined : (data.setupInstructions ?? fallback.setupInstructions),
        lastChecked: new Date().toISOString(),
      };
    }

    return fallback;
  } catch {
    // Orchestrator APIが利用不可の場合はフォールバック値を返す
    return fallback;
  }
}

/**
 * Orchestrator APIからダッシュボードステータスを取得
 * @see Requirement 16.8: リアルタイムステータスAPI
 */
async function getOrchestratorStatus(): Promise<{
  connected: boolean;
  workers: WorkerStatus[];
  tasks?: TaskSummary;
  systemStatus?: {
    paused: boolean;
    emergencyStopped: boolean;
    initialized: boolean;
  };
}> {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_URL}/api/dashboard/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3秒タイムアウト
    });

    if (!response.ok) {
      return { connected: false, workers: [] };
    }

    const result = await response.json();

    if (result.success && result.data) {
      // Orchestratorからのワーカー情報をDashboard形式に変換
      const workers: WorkerStatus[] = (result.data.workers || []).map(
        (w: { id: string; status: string; currentTask?: { id: string; title: string }; startedAt?: string }) => ({
          id: w.id,
          status: w.status as WorkerStatus['status'],
          currentTask: w.currentTask,
          startedAt: w.startedAt,
        })
      );

      return {
        connected: true,
        workers,
        tasks: result.data.tasks,
        systemStatus: result.data.systemStatus,
      };
    }

    return { connected: false, workers: [] };
  } catch {
    // Orchestrator APIが利用不可
    return { connected: false, workers: [] };
  }
}

/**
 * 最近のアクティビティを取得
 */
async function getRecentActivities(limit: number = 10): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];

  try {
    if (!(await directoryExists(BUS_HISTORY_DIR))) {
      return activities;
    }

    // 実行ディレクトリを取得
    const runDirs = await fs.readdir(BUS_HISTORY_DIR);

    // 各実行ディレクトリからメッセージを読み込み
    for (const runDir of runDirs.slice(-5)) {
      const runPath = path.join(BUS_HISTORY_DIR, runDir);
      const stat = await fs.stat(runPath);

      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(runPath);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await fs.readFile(path.join(runPath, file), 'utf-8');
          const message = JSON.parse(content);

          // メッセージタイプに応じてアクティビティを生成
          let activityType: ActivityItem['type'] = 'task_started';
          let activityMessage = '';

          // タスクIDを取得（複数の場所を確認）
          const taskId =
            message.payload?.subTask?.id ||
            message.payload?.subTask?.title ||
            message.payload?.taskId ||
            message.payload?.task?.id ||
            message.payload?.task?.title ||
            runDir; // フォールバックとしてrunIdを使用

          switch (message.type) {
            case 'task_assign':
              activityType = 'task_started';
              activityMessage = `\u30BF\u30B9\u30AF "${taskId}" \u3092\u958B\u59CB`;
              break;
            case 'task_complete':
              activityType = 'task_completed';
              activityMessage = `\u30BF\u30B9\u30AF "${taskId}" \u304C\u5B8C\u4E86`;
              break;
            case 'task_failed':
              activityType = 'task_failed';
              activityMessage = `\u30BF\u30B9\u30AF "${taskId}" \u304C\u5931\u6557`;
              break;
            case 'escalate':
              activityType = 'error';
              activityMessage = `\u30A8\u30B9\u30AB\u30EC\u30FC\u30B7\u30E7\u30F3: ${message.payload?.reason || 'unknown'}`;
              break;
            default:
              continue;
          }

          activities.push({
            id: message.id || file.replace('.json', ''),
            type: activityType,
            message: activityMessage,
            timestamp: message.timestamp || new Date().toISOString(),
          });
        } catch {
          // ファイル読み込みエラーは無視
        }
      }
    }

    // タイムスタンプでソートして最新のものを返す
    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  } catch {
    return activities;
  }
}

/**
 * タスクサマリーを取得
 */
async function getTaskSummary(): Promise<TaskSummary> {
  const summary: TaskSummary = {
    pending: 0,
    executing: 0,
    completed: 0,
    failed: 0,
  };

  try {
    // GUIは gui/web/ から実行されるため、ルートへは2階層上がる必要がある
    const runsDir = path.join(process.cwd(), '..', '..', 'runtime', 'runs');
    if (!(await directoryExists(runsDir))) {
      return summary;
    }

    const runs = await fs.readdir(runsDir);

    for (const run of runs) {
      if (run === '.gitkeep') continue;

      const runPath = path.join(runsDir, run);
      const stat = await fs.stat(runPath);

      if (!stat.isDirectory()) continue;

      // result.jsonがあれば完了/失敗を判定
      try {
        const resultPath = path.join(runPath, 'result.json');
        const resultContent = await fs.readFile(resultPath, 'utf-8');
        const result = JSON.parse(resultContent);

        if (result.status === 'completed' || result.status === 'success') {
          summary.completed++;
        } else if (result.status === 'failed' || result.status === 'error') {
          summary.failed++;
        } else {
          summary.executing++;
        }
      } catch {
        // result.jsonがない場合は実行中とみなす
        summary.pending++;
      }
    }
  } catch {
    // エラーは無視
  }

  return summary;
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/dashboard
 * ダッシュボードデータを取得する
 * Orchestrator APIが利用可能な場合はリアルタイム情報を取得
 * @returns ダッシュボードデータ（AI可用性ステータス含む）
 * @see Requirement 16.8: THE Dashboard SHALL provide real-time status API
 * @see Requirements 7.1, 7.2, 7.3: AI可用性ステータスの表示
 */
export async function GET(): Promise<NextResponse<ApiResponse<DashboardData & { orchestratorConnected: boolean }>>> {
  try {
    // Orchestratorからステータスを取得（並列実行でAIヘルスチェックも同時に行う）
    const [orchestratorStatus, localTasks, activities, aiStatus] = await Promise.all([
      getOrchestratorStatus(),
      getTaskSummary(),
      getRecentActivities(10),
      getAIHealthStatus(),
    ]);

    // タスクサマリー: Orchestratorが接続されていればそちらを優先
    const tasks = orchestratorStatus.connected && orchestratorStatus.tasks
      ? orchestratorStatus.tasks
      : localTasks;

    // システムステータス: Orchestratorが接続されていればそちらを優先
    const systemStatus = orchestratorStatus.connected && orchestratorStatus.systemStatus
      ? {
          paused: orchestratorStatus.systemStatus.paused,
          emergencyStopped: orchestratorStatus.systemStatus.emergencyStopped,
        }
      : {
          paused: false,
          emergencyStopped: false,
        };

    // ダッシュボードデータを構築
    const dashboardData: DashboardData & { orchestratorConnected: boolean } = {
      workers: orchestratorStatus.workers, // Orchestratorから取得したワーカー情報
      tasks,
      activities,
      systemStatus,
      aiStatus,
      lastUpdated: new Date().toISOString(),
      orchestratorConnected: orchestratorStatus.connected,
    };

    return NextResponse.json({ data: dashboardData });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `ダッシュボードデータの取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
