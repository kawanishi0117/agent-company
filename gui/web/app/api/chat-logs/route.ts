/**
 * @file Chat Logs API Route
 * @description GET /api/chat-logs - チャットログ取得（日付、社員フィルタ）
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

// =============================================================================
// 定数
// =============================================================================

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const CHAT_LOGS_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'chat-logs');

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

// =============================================================================
// GET /api/chat-logs
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const agentId = searchParams.get('agentId');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') ?? '100', 10);

    let allEntries: ChatLogEntry[] = [];

    if (date) {
      // 特定日のログを取得
      const entries = await safeReadJson<ChatLogEntry[]>(
        path.join(CHAT_LOGS_DIR, `${date}.json`)
      );
      if (entries) allEntries = entries;
    } else {
      // 全日付のログを取得（降順、limit件まで）
      const files = await safeReadDir(CHAT_LOGS_DIR);
      const jsonFiles = files
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();

      for (const file of jsonFiles) {
        const entries = await safeReadJson<ChatLogEntry[]>(
          path.join(CHAT_LOGS_DIR, file)
        );
        if (entries) allEntries.push(...entries);
        if (allEntries.length >= limit) break;
      }
    }

    // フィルタ適用
    let filtered = allEntries;
    if (agentId) {
      filtered = filtered.filter(
        (e) => e.sender === agentId || e.recipient === agentId
      );
    }
    if (type) {
      filtered = filtered.filter((e) => e.type === type);
    }

    // limit適用
    filtered = filtered.slice(0, limit);

    return NextResponse.json({ data: { logs: filtered } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
