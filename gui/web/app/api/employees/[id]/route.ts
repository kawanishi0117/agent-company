/**
 * @file Employee Detail API Route
 * @description GET /api/employees/[id] - 社員詳細の取得
 * プロフィール + パフォーマンス履歴 + タイムライン + 強み/弱み
 * @see Requirements: 1.4, 1.5, 2.4
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'yaml';

// =============================================================================
// 型定義
// =============================================================================

/** レジストリYAMLから読み取るエージェント定義 */
interface AgentRegistryEntry {
  id: string;
  title: string;
  responsibilities?: string[];
  capabilities?: string[];
  persona?: string;
  budget?: { tokens?: number; time_minutes?: number };
  escalation?: { to?: string; conditions?: string[] };
  deliverables?: string[];
  quality_gates?: string[];
}

/** パフォーマンスレコード */
interface PerformanceRecord {
  taskId: string;
  taskCategory: string;
  success: boolean;
  qualityScore: number;
  durationMs: number;
  timestamp: string;
}

/** ステータス永続化データ */
interface StatusPersistence {
  agentId: string;
  status: string;
  currentTask?: { id: string; title: string };
  lastChanged: string;
  timeline: Array<{
    status: string;
    timestamp: string;
    duration?: number;
  }>;
}

// =============================================================================
// 定数
// =============================================================================

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const REGISTRY_DIR = path.join(ROOT_DIR, 'agents', 'registry');
const PERFORMANCE_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'performance');
const STATUS_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'employee-status');

// =============================================================================
// ユーティリティ関数
// =============================================================================

/** JSONファイルを安全に読み込む */
async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** レジストリYAMLからエージェント定義を検索 */
async function findRegistryEntry(agentId: string): Promise<AgentRegistryEntry | null> {
  try {
    const files = await fs.readdir(REGISTRY_DIR);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      try {
        const content = await fs.readFile(path.join(REGISTRY_DIR, file), 'utf-8');
        const parsed = yaml.parse(content) as AgentRegistryEntry;
        if (parsed?.id === agentId) return parsed;
      } catch {
        // パース失敗は無視
      }
    }
  } catch {
    // ディレクトリ読み取り失敗
  }
  return null;
}

// =============================================================================
// GET /api/employees/[id]
// =============================================================================

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const agentId = params.id;

    // 1. レジストリからプロフィール取得
    const registry = await findRegistryEntry(agentId);
    if (!registry) {
      return NextResponse.json(
        { error: `社員が見つかりません: ${agentId}` },
        { status: 404 }
      );
    }

    // 2. パフォーマンスデータ取得
    const perfData = await safeReadJson<{ records?: PerformanceRecord[] }>(
      path.join(PERFORMANCE_DIR, `${agentId}.json`)
    );
    const records = perfData?.records ?? [];

    // パフォーマンスサマリー計算
    const totalTasks = records.length;
    const successes = records.filter((r) => r.success).length;
    const successRate = totalTasks > 0 ? successes / totalTasks : 0;
    const avgQuality =
      totalTasks > 0
        ? records.reduce((sum, r) => sum + (r.qualityScore ?? 0), 0) / totalTasks
        : 0;

    // カテゴリ別成功率
    const categoryMap = new Map<string, { success: number; total: number }>();
    for (const r of records) {
      const cat = r.taskCategory ?? 'unknown';
      const entry = categoryMap.get(cat) ?? { success: 0, total: 0 };
      entry.total++;
      if (r.success) entry.success++;
      categoryMap.set(cat, entry);
    }

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    for (const [cat, stats] of categoryMap) {
      if (stats.total < 3) continue;
      const rate = stats.success / stats.total;
      if (rate >= 0.8) strengths.push(cat);
      if (rate < 0.5) weaknesses.push(cat);
    }

    // 直近のパフォーマンス履歴（最新20件）
    const recentRecords = records.slice(-20).map((r) => ({
      taskId: r.taskId,
      taskCategory: r.taskCategory,
      success: r.success,
      qualityScore: r.qualityScore,
      timestamp: r.timestamp,
    }));

    // 3. ステータス・タイムラインデータ取得
    const statusData = await safeReadJson<StatusPersistence>(
      path.join(STATUS_DIR, `${agentId}.json`)
    );

    const today = new Date().toISOString().slice(0, 10);
    const todayTimeline = (statusData?.timeline ?? []).filter(
      (entry) => entry.timestamp.slice(0, 10) === today
    );

    // 4. レスポンス構築
    return NextResponse.json({
      data: {
        profile: {
          id: registry.id,
          title: registry.title,
          responsibilities: registry.responsibilities ?? [],
          capabilities: registry.capabilities ?? [],
          deliverables: registry.deliverables ?? [],
          qualityGates: registry.quality_gates ?? [],
          persona: registry.persona ?? '',
          budget: registry.budget,
          escalation: registry.escalation,
        },
        status: {
          current: statusData?.status ?? 'offline',
          currentTask: statusData?.currentTask,
          lastChanged: statusData?.lastChanged,
        },
        performance: {
          totalTasks,
          successRate,
          averageQuality: avgQuality,
          strengths,
          weaknesses,
          recentRecords,
        },
        timeline: {
          date: today,
          entries: todayTimeline,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
