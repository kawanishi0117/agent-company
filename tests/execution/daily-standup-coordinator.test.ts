/**
 * DailyStandupCoordinator ユニットテスト
 * @module tests/execution/daily-standup-coordinator
 * @see Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DailyStandupCoordinator,
  type StandupResult,
} from '../../tools/cli/lib/execution/daily-standup-coordinator.js';
import type { IMeetingCoordinator } from '../../tools/cli/lib/execution/meeting-coordinator.js';
import type { MeetingMinutes } from '../../tools/cli/lib/execution/types.js';
import {
  AgentPerformanceTracker,
  type PerformanceRecord,
} from '../../tools/cli/lib/execution/agent-performance-tracker.js';

// =============================================================================
// モック
// =============================================================================

/** MeetingCoordinator のモック */
function createMockMeetingCoordinator(): IMeetingCoordinator {
  return {
    conveneMeeting: vi.fn().mockResolvedValue({
      meetingId: 'mtg-standup-test',
      workflowId: 'standup-test',
      agenda: [],
      participants: [],
      statements: [],
      decisions: [],
      actionItems: [],
      facilitator: 'coo_pm',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    } as MeetingMinutes),
    addParticipant: vi.fn(),
    addAgendaItem: vi.fn(),
    getMeetingMinutes: vi.fn().mockReturnValue(null),
    getMeetingMinutesForWorkflow: vi.fn().mockReturnValue([]),
    saveMeetingMinutes: vi.fn().mockResolvedValue(undefined),
    restoreMeetingsForWorkflow: vi.fn().mockResolvedValue(0),
  };
}

// =============================================================================
// テスト
// =============================================================================

describe('DailyStandupCoordinator', () => {
  let coordinator: DailyStandupCoordinator;
  let mockMeetingCoordinator: IMeetingCoordinator;
  let performanceTracker: AgentPerformanceTracker;
  let testDir: string;
  let perfDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-standup-' + Date.now());
    perfDir = path.join('runtime', 'test-standup-perf-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(perfDir, { recursive: true });

    mockMeetingCoordinator = createMockMeetingCoordinator();
    performanceTracker = new AgentPerformanceTracker(perfDir);

    coordinator = new DailyStandupCoordinator({
      meetingCoordinator: mockMeetingCoordinator,
      performanceTracker,
      basePath: testDir,
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(perfDir, { recursive: true, force: true });
  });

  describe('conductStandup()', () => {
    it('パフォーマンスデータなしでも朝会を実施できる', async () => {
      const result = await coordinator.conductStandup();

      expect(result).toBeDefined();
      expect(result.date).toBe(new Date().toISOString().slice(0, 10));
      expect(result.entries).toEqual([]);
      expect(result.meetingMinutes).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(mockMeetingCoordinator.conveneMeeting).toHaveBeenCalledOnce();
    });

    it('パフォーマンスデータがある場合、エントリを生成する', async () => {
      // パフォーマンスデータを事前に登録
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString();

      await performanceTracker.recordPerformance({
        agentId: 'developer-1',
        taskId: 'task-1',
        taskCategory: 'coding',
        success: true,
        qualityScore: 85,
        durationMs: 60000,
        timestamp: yesterdayStr,
      });

      const result = await coordinator.conductStandup();

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].agentId).toBe('developer-1');
      expect(result.entries[0].accomplished.length).toBeGreaterThan(0);
      expect(result.entries[0].planned.length).toBeGreaterThan(0);
    });

    it('結果がファイルに永続化される', async () => {
      const result = await coordinator.conductStandup();
      const today = new Date().toISOString().slice(0, 10);
      const filePath = path.join(testDir, `${today}.json`);

      const content = await fs.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content) as StandupResult;

      expect(saved.date).toBe(result.date);
      expect(saved.summary).toBe(result.summary);
    });

    it('複数エージェントのエントリを生成する', async () => {
      const ts = new Date().toISOString();
      await performanceTracker.recordPerformance({
        agentId: 'agent-a',
        taskId: 't1',
        taskCategory: 'coding',
        success: true,
        qualityScore: 90,
        durationMs: 5000,
        timestamp: ts,
      });
      await performanceTracker.recordPerformance({
        agentId: 'agent-b',
        taskId: 't2',
        taskCategory: 'review',
        success: false,
        qualityScore: 40,
        durationMs: 3000,
        timestamp: ts,
      });

      const result = await coordinator.conductStandup();

      expect(result.entries.length).toBe(2);
      const ids = result.entries.map((e) => e.agentId).sort();
      expect(ids).toEqual(['agent-a', 'agent-b']);
    });
  });

  describe('getStandup()', () => {
    it('存在するスタンドアップ結果を取得できる', async () => {
      await coordinator.conductStandup();
      const today = new Date().toISOString().slice(0, 10);

      const result = await coordinator.getStandup(today);
      expect(result).not.toBeNull();
      expect(result!.date).toBe(today);
    });

    it('存在しない日付はnullを返す', async () => {
      const result = await coordinator.getStandup('2020-01-01');
      expect(result).toBeNull();
    });
  });

  describe('listStandups()', () => {
    it('スタンドアップ一覧を日付降順で取得できる', async () => {
      // 手動で2件のスタンドアップデータを作成
      const data1: StandupResult = {
        date: '2026-01-01',
        entries: [],
        meetingMinutes: {} as MeetingMinutes,
        summary: 'day1',
      };
      const data2: StandupResult = {
        date: '2026-01-02',
        entries: [],
        meetingMinutes: {} as MeetingMinutes,
        summary: 'day2',
      };
      await fs.writeFile(
        path.join(testDir, '2026-01-01.json'),
        JSON.stringify(data1),
        'utf-8'
      );
      await fs.writeFile(
        path.join(testDir, '2026-01-02.json'),
        JSON.stringify(data2),
        'utf-8'
      );

      const list = await coordinator.listStandups();
      expect(list.length).toBe(2);
      // 降順: 新しい日付が先
      expect(list[0].date).toBe('2026-01-02');
      expect(list[1].date).toBe('2026-01-01');
    });

    it('ディレクトリが空の場合は空配列を返す', async () => {
      // testDirの中身をクリア
      const files = await fs.readdir(testDir);
      for (const f of files) {
        await fs.rm(path.join(testDir, f));
      }
      const list = await coordinator.listStandups();
      expect(list).toEqual([]);
    });
  });
});
