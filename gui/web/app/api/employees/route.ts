/**
 * @file Employee API Route
 * @description GET /api/employees - 全社員一覧の取得
 * registry YAML + performance + status データを統合して返す
 * @see Requirements: 1.1, 1.2, 2.5, 2.6
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
}

/** パフォーマンスプロファイル */
interface PerformanceProfile {
  agentId: string;
  totalTasks: number;
  successRate: number;
  averageQuality: number;
  strengths: string[];
  weaknesses: string[];
  recentTrend: 'improving' | 'declining' | 'stable';
}

/** 社員ステータス永続化データ */
interface EmployeeStatusData {
  agentId: string;
  status: string;
  currentTask?: { id: string; title: string };
  lastChanged: string;
}

/** API レスポンスの社員データ */
interface EmployeeResponse {
  id: string;
  title: string;
  responsibilities: string[];
  capabilities: string[];
  status: string;
  currentTask?: { id: string; title: string };
  lastChanged?: string;
  performance?: {
    totalTasks: number;
    successRate: number;
    averageQuality: number;
    strengths: string[];
    weaknesses: string[];
    recentTrend: string;
  };
}

/** ステータス別カウント */
interface StatusCounts {
  idle: number;
  working: number;
  in_meeting: number;
  reviewing: number;
  on_break: number;
  offline: number;
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

/**
 * ディレクトリ内のファイル一覧を安全に取得
 */
async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * JSONファイルを安全に読み込む
 */
async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * レジストリYAMLファイルからエージェント定義を読み込む
 */
async function loadRegistryEntries(): Promise<AgentRegistryEntry[]> {
  const files = await safeReadDir(REGISTRY_DIR);
  const entries: AgentRegistryEntry[] = [];

  for (const file of files) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
    try {
      const content = await fs.readFile(path.join(REGISTRY_DIR, file), 'utf-8');
      const parsed = yaml.parse(content) as AgentRegistryEntry;
      if (parsed?.id) {
        entries.push(parsed);
      }
    } catch {
      // パース失敗は無視
    }
  }

  return entries;
}

/**
 * パフォーマンスプロファイルを読み込む
 */
async function loadPerformanceProfile(agentId: string): Promise<PerformanceProfile | null> {
  // パフォーマンスデータはレコード配列として保存されている
  const filePath = path.join(PERFORMANCE_DIR, `${agentId}.json`);
  const data = await safeReadJson<{ records?: Array<{ success: boolean; qualityScore: number; taskCategory?: string }> }>(filePath);
  if (!data?.records || data.records.length === 0) return null;

  const records = data.records;
  const total = records.length;
  const successes = records.filter((r) => r.success).length;
  const avgQuality = records.reduce((sum, r) => sum + (r.qualityScore ?? 0), 0) / total;

  // カテゴリ別成功率で得意/苦手を判定
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

  return {
    agentId,
    totalTasks: total,
    successRate: successes / total,
    averageQuality: avgQuality,
    strengths,
    weaknesses,
    recentTrend: 'stable',
  };
}

/**
 * 社員ステータスを読み込む
 */
async function loadEmployeeStatus(agentId: string): Promise<EmployeeStatusData | null> {
  const filePath = path.join(STATUS_DIR, `${agentId}.json`);
  return safeReadJson<EmployeeStatusData>(filePath);
}

// =============================================================================
// GET /api/employees
// =============================================================================

export async function GET(): Promise<NextResponse> {
  try {
    // 1. レジストリからエージェント定義を読み込み
    const registryEntries = await loadRegistryEntries();

    // 2. 各エージェントのデータを統合
    const employees: EmployeeResponse[] = [];
    const statusCounts: StatusCounts = {
      idle: 0,
      working: 0,
      in_meeting: 0,
      reviewing: 0,
      on_break: 0,
      offline: 0,
    };

    for (const entry of registryEntries) {
      // パフォーマンスデータ
      const performance = await loadPerformanceProfile(entry.id);

      // ステータスデータ
      const statusData = await loadEmployeeStatus(entry.id);
      const currentStatus = statusData?.status ?? 'offline';

      // ステータスカウント
      if (currentStatus in statusCounts) {
        statusCounts[currentStatus as keyof StatusCounts]++;
      } else {
        statusCounts.offline++;
      }

      employees.push({
        id: entry.id,
        title: entry.title,
        responsibilities: entry.responsibilities ?? [],
        capabilities: entry.capabilities ?? [],
        status: currentStatus,
        currentTask: statusData?.currentTask,
        lastChanged: statusData?.lastChanged,
        performance: performance
          ? {
              totalTasks: performance.totalTasks,
              successRate: performance.successRate,
              averageQuality: performance.averageQuality,
              strengths: performance.strengths,
              weaknesses: performance.weaknesses,
              recentTrend: performance.recentTrend,
            }
          : undefined,
      });
    }

    return NextResponse.json({
      data: {
        employees,
        statusCounts,
        totalEmployees: employees.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
