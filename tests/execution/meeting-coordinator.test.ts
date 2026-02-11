/**
 * Meeting Coordinator ユニットテスト
 *
 * エージェント間会議調整の機能をテストする。
 *
 * @module tests/execution/meeting-coordinator.test
 * @see Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 12.1, 12.2, 12.3, 12.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MeetingCoordinator,
  MeetingCoordinatorError,
  createMeetingCoordinator,
} from '../../tools/cli/lib/execution/meeting-coordinator';
import { createAgentBus, AgentBus } from '../../tools/cli/lib/execution/agent-bus';
import type { MeetingParticipant, AgendaItem } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_BUS_PATH = 'runtime/test-meeting-bus';
const TEST_RUNS_PATH = 'runtime/test-meeting-runs';
const TEST_WORKFLOW_ID = 'wf-test-001';
const TEST_FACILITATOR_ID = 'coo_pm';

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * ディレクトリを再帰的に削除
 */
async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

// =============================================================================
// テストスイート
// =============================================================================

describe('MeetingCoordinator', () => {
  let agentBus: AgentBus;
  let coordinator: MeetingCoordinator;

  beforeEach(async () => {
    await cleanupDirectory(TEST_BUS_PATH);
    await cleanupDirectory(TEST_RUNS_PATH);

    agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: TEST_BUS_PATH,
      },
      runtimeBasePath: TEST_RUNS_PATH,
    });

    coordinator = createMeetingCoordinator(agentBus, TEST_RUNS_PATH);
  });

  afterEach(async () => {
    await cleanupDirectory(TEST_BUS_PATH);
    await cleanupDirectory(TEST_RUNS_PATH);
  });

  // ===========================================================================
  // conveneMeeting テスト
  // ===========================================================================

  describe('conveneMeeting', () => {
    it('指示内容から会議を開催し、会議録を返す', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        'ユーザー認証機能を実装してください',
        TEST_FACILITATOR_ID
      );

      expect(minutes).toBeDefined();
      expect(minutes.meetingId).toMatch(/^mtg-/);
      expect(minutes.workflowId).toBe(TEST_WORKFLOW_ID);
      expect(minutes.facilitator).toBe(TEST_FACILITATOR_ID);
    });

    it('会議録に必須フィールドがすべて含まれる (Req 2.8)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '決済システムの設計と実装',
        TEST_FACILITATOR_ID
      );

      // Req 2.8: meetingId, agenda, participants, statements, decisions, actionItems
      expect(minutes.meetingId).toBeTruthy();
      expect(minutes.workflowId).toBeTruthy();
      expect(minutes.agenda.length).toBeGreaterThan(0);
      expect(minutes.participants.length).toBeGreaterThan(0);
      expect(minutes.statements.length).toBeGreaterThan(0);
      expect(minutes.decisions.length).toBeGreaterThan(0);
      expect(minutes.actionItems).toBeDefined();
      expect(minutes.facilitator).toBeTruthy();
      expect(minutes.startedAt).toBeTruthy();
      expect(minutes.endedAt).toBeTruthy();
    });

    it('COO/PMがファシリテーターとして参加する (Req 2.2)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        'APIの実装',
        TEST_FACILITATOR_ID
      );

      const facilitator = minutes.participants.find(
        (p) => p.agentId === TEST_FACILITATOR_ID
      );
      expect(facilitator).toBeDefined();
      expect(facilitator?.role).toContain('ファシリテーター');
    });

    it('指示内容に基づいて適切な専門家が参加する (Req 2.3-2.5)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        'UI画面のデザインと技術調査を行い、実装してください',
        TEST_FACILITATOR_ID
      );

      // ファシリテーター以外に少なくとも1人の専門家が参加
      const specialists = minutes.participants.filter(
        (p) => p.agentId !== TEST_FACILITATOR_ID
      );
      expect(specialists.length).toBeGreaterThanOrEqual(1);
    });

    it('各議題について全参加者から意見を収集する (Req 12.1, 12.2)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '機能を実装してテストしてください',
        TEST_FACILITATOR_ID
      );

      // 各議題に対して、ファシリテーター以外の全参加者が発言している
      const specialists = minutes.participants.filter(
        (p) => p.agentId !== TEST_FACILITATOR_ID
      );

      for (const agendaItem of minutes.agenda) {
        for (const specialist of specialists) {
          const hasStatement = minutes.statements.some(
            (s) =>
              s.agendaItemId === agendaItem.id &&
              s.participantId === specialist.agentId
          );
          expect(hasStatement).toBe(true);
        }
      }
    });

    it('各発言にrole, content, timestampが記録される (Req 12.2)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '開発タスク',
        TEST_FACILITATOR_ID
      );

      for (const statement of minutes.statements) {
        expect(statement.participantId).toBeTruthy();
        expect(statement.participantRole).toBeTruthy();
        expect(statement.content).toBeTruthy();
        expect(statement.agendaItemId).toBeTruthy();
        expect(statement.timestamp).toBeTruthy();
      }
    });

    it('ファシリテーターが各議題のまとめを記録する (Req 12.3)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '開発と設計',
        TEST_FACILITATOR_ID
      );

      // 各議題にファシリテーターのまとめ発言がある
      for (const agendaItem of minutes.agenda) {
        expect(agendaItem.status).toBe('concluded');
        expect(agendaItem.summary).toBeTruthy();
      }
    });

    it('最終的な決定事項とアクションアイテムが生成される (Req 12.4)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '実装とテスト',
        TEST_FACILITATOR_ID
      );

      expect(minutes.decisions.length).toBeGreaterThan(0);
      for (const decision of minutes.decisions) {
        expect(decision.agendaItemId).toBeTruthy();
        expect(decision.decision).toBeTruthy();
        expect(decision.rationale).toBeTruthy();
      }

      expect(minutes.actionItems).toBeDefined();
      for (const item of minutes.actionItems) {
        expect(item.description).toBeTruthy();
        expect(item.assignee).toBeTruthy();
        expect(item.workerType).toBeTruthy();
        expect(['low', 'medium', 'high']).toContain(item.priority);
      }
    });

    it('キーワードマッチしない場合でもdeveloperが参加する', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        'あいまいな指示',
        TEST_FACILITATOR_ID
      );

      const specialists = minutes.participants.filter(
        (p) => p.agentId !== TEST_FACILITATOR_ID
      );
      expect(specialists.length).toBeGreaterThanOrEqual(1);
    });

    it('空のworkflowIdでエラーをスローする', async () => {
      await expect(
        coordinator.conveneMeeting('', '指示', TEST_FACILITATOR_ID)
      ).rejects.toThrow(MeetingCoordinatorError);
    });

    it('空のinstructionでエラーをスローする', async () => {
      await expect(
        coordinator.conveneMeeting(TEST_WORKFLOW_ID, '', TEST_FACILITATOR_ID)
      ).rejects.toThrow(MeetingCoordinatorError);
    });

    it('空のfacilitatorIdでエラーをスローする', async () => {
      await expect(
        coordinator.conveneMeeting(TEST_WORKFLOW_ID, '指示', '')
      ).rejects.toThrow(MeetingCoordinatorError);
    });
  });

  // ===========================================================================
  // addParticipant / addAgendaItem テスト
  // ===========================================================================

  describe('addParticipant', () => {
    it('既存の会議に参加者を追加できる', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '開発タスク',
        TEST_FACILITATOR_ID
      );

      const newParticipant: MeetingParticipant = {
        agentId: 'test-agent-new',
        role: 'テスター',
        workerType: 'test',
        expertise: ['テスト'],
      };

      const beforeCount = minutes.participants.length;
      coordinator.addParticipant(minutes.meetingId, newParticipant);

      const updated = coordinator.getMeetingMinutes(minutes.meetingId);
      expect(updated?.participants.length).toBe(beforeCount + 1);
    });

    it('重複する参加者は追加されない', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '開発タスク',
        TEST_FACILITATOR_ID
      );

      const existingParticipant = minutes.participants[0];
      const beforeCount = minutes.participants.length;
      coordinator.addParticipant(minutes.meetingId, existingParticipant);

      const updated = coordinator.getMeetingMinutes(minutes.meetingId);
      expect(updated?.participants.length).toBe(beforeCount);
    });

    it('存在しない会議IDでエラーをスローする', () => {
      const participant: MeetingParticipant = {
        agentId: 'test',
        role: 'テスト',
        workerType: 'test',
        expertise: [],
      };
      expect(() =>
        coordinator.addParticipant('nonexistent', participant)
      ).toThrow(MeetingCoordinatorError);
    });
  });

  describe('addAgendaItem', () => {
    it('既存の会議に議題を追加できる', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '開発タスク',
        TEST_FACILITATOR_ID
      );

      const newItem: AgendaItem = {
        id: 'agenda-new',
        topic: '追加議題',
        description: '追加の議論事項',
        status: 'pending',
      };

      const beforeCount = minutes.agenda.length;
      coordinator.addAgendaItem(minutes.meetingId, newItem);

      const updated = coordinator.getMeetingMinutes(minutes.meetingId);
      expect(updated?.agenda.length).toBe(beforeCount + 1);
    });

    it('存在しない会議IDでエラーをスローする', () => {
      const item: AgendaItem = {
        id: 'agenda-test',
        topic: 'テスト',
        description: 'テスト',
        status: 'pending',
      };
      expect(() =>
        coordinator.addAgendaItem('nonexistent', item)
      ).toThrow(MeetingCoordinatorError);
    });
  });

  // ===========================================================================
  // getMeetingMinutes / getMeetingMinutesForWorkflow テスト
  // ===========================================================================

  describe('getMeetingMinutes', () => {
    it('存在する会議録を取得できる', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '開発タスク',
        TEST_FACILITATOR_ID
      );

      const retrieved = coordinator.getMeetingMinutes(minutes.meetingId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.meetingId).toBe(minutes.meetingId);
    });

    it('存在しない会議IDでnullを返す', () => {
      const result = coordinator.getMeetingMinutes('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getMeetingMinutesForWorkflow', () => {
    it('ワークフローの全会議録を取得できる', async () => {
      // 同じワークフローで2回会議を開催
      await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '初回会議: 開発タスク',
        TEST_FACILITATOR_ID
      );
      await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '修正後の再会議: 設計変更',
        TEST_FACILITATOR_ID
      );

      const allMinutes = coordinator.getMeetingMinutesForWorkflow(TEST_WORKFLOW_ID);
      expect(allMinutes.length).toBe(2);
    });

    it('存在しないワークフローIDで空配列を返す', () => {
      const result = coordinator.getMeetingMinutesForWorkflow('nonexistent');
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // saveMeetingMinutes / loadMeetingMinutes テスト
  // ===========================================================================

  describe('saveMeetingMinutes / loadMeetingMinutes', () => {
    it('会議録をファイルに保存して読み込める (Req 2.7)', async () => {
      const minutes = await coordinator.conveneMeeting(
        TEST_WORKFLOW_ID,
        '永続化テスト',
        TEST_FACILITATOR_ID
      );

      // ファイルが存在することを確認
      const filePath = path.join(
        TEST_RUNS_PATH,
        TEST_WORKFLOW_ID,
        'meeting-minutes',
        `${minutes.meetingId}.json`
      );
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // 読み込んで内容を検証
      const loaded = await coordinator.loadMeetingMinutes(
        TEST_WORKFLOW_ID,
        minutes.meetingId
      );
      expect(loaded).toBeDefined();
      expect(loaded?.meetingId).toBe(minutes.meetingId);
      expect(loaded?.workflowId).toBe(minutes.workflowId);
      expect(loaded?.agenda.length).toBe(minutes.agenda.length);
      expect(loaded?.participants.length).toBe(minutes.participants.length);
      expect(loaded?.statements.length).toBe(minutes.statements.length);
    });

    it('存在しない会議録の読み込みでnullを返す', async () => {
      const result = await coordinator.loadMeetingMinutes(
        TEST_WORKFLOW_ID,
        'nonexistent'
      );
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // createMeetingCoordinator ファクトリ関数テスト
  // ===========================================================================

  describe('createMeetingCoordinator', () => {
    it('MeetingCoordinatorインスタンスを生成できる', () => {
      const instance = createMeetingCoordinator(agentBus);
      expect(instance).toBeInstanceOf(MeetingCoordinator);
    });

    it('カスタムbasePathで生成できる', () => {
      const instance = createMeetingCoordinator(agentBus, '/custom/path');
      expect(instance).toBeInstanceOf(MeetingCoordinator);
    });
  });
});
