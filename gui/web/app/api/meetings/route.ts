/**
 * @file Meetings API Route
 * @description GET /api/meetings - 会議一覧の取得
 * POST /api/meetings - 朝会トリガー
 * @see Requirements: 3.5, 3.7
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** 会議サマリー（一覧表示用） */
interface MeetingSummary {
  meetingId: string;
  workflowId: string;
  type: 'standup' | 'retrospective' | 'executive' | 'project';
  date: string;
  participantCount: number;
  summary: string;
}

/** スタンドアップ結果 */
interface StandupData {
  date: string;
  entries: Array<{
    agentId: string;
    accomplished: string[];
    planned: string[];
    blockers: string[];
  }>;
  meetingMinutes: {
    meetingId: string;
    workflowId: string;
    participants: Array<{ agentId: string }>;
    startedAt: string;
  };
  summary: string;
}

/** 会議議事録 */
interface MeetingMinutesData {
  meetingId: string;
  workflowId: string;
  participants: Array<{ agentId: string }>;
  statements: Array<{ content: string }>;
  decisions: Array<{ decision: string }>;
  actionItems: Array<{ description: string }>;
  facilitator: string;
  startedAt: string;
  endedAt: string;
}

// =============================================================================
// 定数
// =============================================================================

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const STANDUPS_DIR = path.join(ROOT_DIR, 'runtime', 'state', 'standups');
const RUNS_DIR = path.join(ROOT_DIR, 'runtime', 'runs');

// =============================================================================
// ユーティリティ
// =============================================================================

/** ディレクトリ内のファイル一覧を安全に取得 */
async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

/** JSONファイルを安全に読み込む */
async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * スタンドアップデータから会議サマリーを生成
 */
function standupToSummary(data: StandupData): MeetingSummary {
  return {
    meetingId: data.meetingMinutes?.meetingId ?? `standup-${data.date}`,
    workflowId: data.meetingMinutes?.workflowId ?? `standup-${data.date}`,
    type: 'standup',
    date: data.date,
    participantCount: data.entries?.length ?? 0,
    summary: data.summary ?? '',
  };
}

/**
 * ワークフロー会議録から会議サマリーを生成
 */
function minutesToSummary(
  minutes: MeetingMinutesData,
  type: MeetingSummary['type']
): MeetingSummary {
  return {
    meetingId: minutes.meetingId,
    workflowId: minutes.workflowId,
    type,
    date: minutes.startedAt?.slice(0, 10) ?? '',
    participantCount: minutes.participants?.length ?? 0,
    summary: minutes.decisions?.[0]?.decision ?? '議事録あり',
  };
}

/**
 * ワークフロー実行ディレクトリから会議録を収集
 */
async function collectWorkflowMeetings(): Promise<MeetingSummary[]> {
  const meetings: MeetingSummary[] = [];
  const runDirs = await safeReadDir(RUNS_DIR);

  for (const runDir of runDirs.slice(-20)) {
    // 直近20件のみ
    const meetingsDir = path.join(RUNS_DIR, runDir, 'meetings');
    const meetingFiles = await safeReadDir(meetingsDir);

    for (const file of meetingFiles) {
      if (!file.endsWith('.json')) continue;
      const data = await safeReadJson<MeetingMinutesData>(
        path.join(meetingsDir, file)
      );
      if (data?.meetingId) {
        meetings.push(minutesToSummary(data, 'project'));
      }
    }
  }

  return meetings;
}

// =============================================================================
// GET /api/meetings
// =============================================================================

export async function GET(): Promise<NextResponse> {
  try {
    const meetings: MeetingSummary[] = [];

    // 1. スタンドアップデータを収集
    const standupFiles = await safeReadDir(STANDUPS_DIR);
    for (const file of standupFiles) {
      if (!file.endsWith('.json')) continue;
      const data = await safeReadJson<StandupData>(
        path.join(STANDUPS_DIR, file)
      );
      if (data?.date) {
        meetings.push(standupToSummary(data));
      }
    }

    // 2. ワークフロー会議録を収集
    const workflowMeetings = await collectWorkflowMeetings();
    meetings.push(...workflowMeetings);

    // 日付降順でソート
    meetings.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ data: { meetings } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// POST /api/meetings（朝会トリガー）
// =============================================================================

export async function POST(): Promise<NextResponse> {
  try {
    // OrchestratorServerに朝会トリガーを送信
    const orchestratorUrl =
      process.env.ORCHESTRATOR_API_URL ?? 'http://localhost:3001';

    const response = await fetch(`${orchestratorUrl}/api/meetings/standup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: '朝会のトリガーに失敗しました' },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({ data: result });
  } catch (error) {
    // Orchestratorが起動していない場合のフォールバック
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `Orchestratorへの接続に失敗: ${message}` },
      { status: 503 }
    );
  }
}
