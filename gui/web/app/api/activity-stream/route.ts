/**
 * @file Activity Stream API Route
 * @description GET /api/activity-stream - アクティビティストリーム取得
 * @see Requirements: 5.6
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

interface ChatLogEntry {
  id: string;
  timestamp: string;
  sender: string;
  recipient: string;
  type: string;
  content: string;
  workflowId?: string;
}

interface ActivityStreamItem {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  agentIds: string[];
  workflowId?: string;
}

// =============================================================================
// 定数
// =============================================================================

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const CHAT_LOGS_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'chat-logs');

/** タイプ別ラベル */
const TYPE_LABELS: Record<string, string> = {
  task_assignment: 'タスク割り当て',
  review_feedback: 'レビューフィードバック',
  meeting_discussion: '会議発言',
  escalation: 'エスカレーション',
  general: 'メッセージ',
};

// =============================================================================
// ユーティリティ
// =============================================================================

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** ChatLogEntryをActivityStreamItemに変換 */
function toActivityItem(entry: ChatLogEntry): ActivityStreamItem {
  const label = TYPE_LABELS[entry.type] ?? 'メッセージ';
  const truncated =
    entry.content.length > 80
      ? entry.content.slice(0, 80) + '...'
      : entry.content;

  return {
    id: entry.id,
    timestamp: entry.timestamp,
    type: entry.type,
    description: `[${label}] ${entry.sender} → ${entry.recipient}: ${truncated}`,
    agentIds: [entry.sender, entry.recipient].filter(Boolean),
    workflowId: entry.workflowId,
  };
}

// =============================================================================
// GET /api/activity-stream
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    // 新しい日付から順にログを読み込み
    const files = await safeReadDir(CHAT_LOGS_DIR);
    const jsonFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();

    const allEntries: ChatLogEntry[] = [];
    for (const file of jsonFiles) {
      const entries = await safeReadJson<ChatLogEntry[]>(
        path.join(CHAT_LOGS_DIR, file)
      );
      if (entries) allEntries.push(...entries);
      if (allEntries.length >= limit) break;
    }

    // タイムスタンプ降順でソート
    allEntries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // ActivityStreamItemに変換してlimit件に制限
    const stream = allEntries.slice(0, limit).map(toActivityItem);

    return NextResponse.json({ data: { stream } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
