/**
 * @file Dashboard API Route
 * @description GET /api/dashboard - ダッシュボードデータの取得
 * @requirements 16.8
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
  type: 'task_started' | 'task_completed' | 'task_failed' | 'worker_started' | 'worker_stopped' | 'error';
  message: string;
  timestamp: string;
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

const STATE_DIR = path.join(process.cwd(), 'runtime', 'state');
const BUS_HISTORY_DIR = path.join(STATE_DIR, 'bus', 'history');

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

          switch (message.type) {
            case 'task_assign':
              activityType = 'task_started';
              activityMessage = `タスク "${message.payload?.taskId || 'unknown'}" を開始`;
              break;
            case 'task_complete':
              activityType = 'task_completed';
              activityMessage = `タスク "${message.payload?.taskId || 'unknown'}" が完了`;
              break;
            case 'task_failed':
              activityType = 'task_failed';
              activityMessage = `タスク "${message.payload?.taskId || 'unknown'}" が失敗`;
              break;
            case 'escalate':
              activityType = 'error';
              activityMessage = `エスカレーション: ${message.payload?.reason || 'unknown'}`;
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
    const runsDir = path.join(process.cwd(), 'runtime', 'runs');
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
 * @see Requirement 16.8: THE Dashboard SHALL provide real-time status API
 */
export async function GET(): Promise<NextResponse<ApiResponse<DashboardData>>> {
  try {
    // タスクサマリーを取得
    const tasks = await getTaskSummary();

    // アクティビティを取得
    const activities = await getRecentActivities(10);

    // ダッシュボードデータを構築
    const dashboardData: DashboardData = {
      workers: [], // 実際のワーカー情報はOrchestratorから取得する必要がある
      tasks,
      activities,
      systemStatus: {
        paused: false,
        emergencyStopped: false,
      },
      lastUpdated: new Date().toISOString(),
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
