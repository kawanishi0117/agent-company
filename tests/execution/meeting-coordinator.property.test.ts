/**
 * MeetingCoordinator プロパティテスト
 *
 * Property 7a: Meeting Minutes Structure Completeness
 * Property 7b: Meeting Discussion Coverage
 * Property 7c: Meeting Minutes Persistence Round-Trip
 *
 * @module tests/execution/meeting-coordinator.property.test
 * @see Requirements: 2.7, 2.8, 12.1, 12.2, 12.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import {
  MeetingCoordinator,
  createMeetingCoordinator,
} from '../../tools/cli/lib/execution/meeting-coordinator.js';
import { createAgentBus, AgentBus } from '../../tools/cli/lib/execution/agent-bus.js';
import type { MeetingMinutes } from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_BUS_PATH = 'runtime/test-meeting-prop-bus';
const TEST_RUNS_PATH = 'runtime/test-meeting-prop-runs';
const TEST_FACILITATOR_ID = 'coo_pm';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 現実的な指示文字列を生成する Arbitrary
 * MeetingCoordinator は指示内容のキーワードから議題・参加者を選定するため、
 * 実際の業務指示に近い文字列を使用する
 */
const instructionArb: fc.Arbitrary<string> = fc.constantFrom(
  'ユーザー認証機能を実装してください',
  '決済システムのリファクタリング',
  'UI画面のデザインと技術調査を行い、実装してください',
  'APIのパフォーマンス改善とテスト追加',
  'データベース設計とマイグレーション実装',
  'セキュリティ監査と脆弱性修正',
  'CI/CDパイプラインの構築',
  'モバイル対応のレスポンシブデザイン実装',
  'ログ収集基盤の設計と実装',
  'マイクロサービスアーキテクチャへの移行計画',
  '検索機能の実装とインデックス最適化',
  'ユーザーダッシュボードの設計と開発',
  'バッチ処理システムの構築',
  'WebSocket通信の実装',
  'テスト自動化フレームワークの導入'
);

/**
 * ユニークなワークフローIDを生成する Arbitrary
 */
const workflowIdArb: fc.Arbitrary<string> = fc.stringMatching(/^wf-prop-[a-z0-9]{6}$/);

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

describe('MeetingCoordinator Property Tests', () => {
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
  // Property 7a: Meeting Minutes Structure Completeness
  // **Validates: Requirements 2.8**
  // ===========================================================================

  describe('Property 7a: Meeting Minutes Structure Completeness', () => {
    it('任意の指示に対して、会議録は必須フィールドをすべて含むこと', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          workflowIdArb,
          async (instruction: string, workflowId: string) => {
            const minutes = await coordinator.conveneMeeting(
              workflowId,
              instruction,
              TEST_FACILITATOR_ID
            );

            // meetingId: 非空文字列
            expect(minutes.meetingId).toBeTruthy();
            expect(typeof minutes.meetingId).toBe('string');

            // workflowId: 非空文字列（入力と一致）
            expect(minutes.workflowId).toBeTruthy();
            expect(minutes.workflowId).toBe(workflowId);

            // agenda: 非空配列
            expect(Array.isArray(minutes.agenda)).toBe(true);
            expect(minutes.agenda.length).toBeGreaterThan(0);

            // participants: ファシリテーターを含む配列
            expect(Array.isArray(minutes.participants)).toBe(true);
            expect(minutes.participants.length).toBeGreaterThanOrEqual(1);
            const hasFacilitator = minutes.participants.some(
              (p) => p.agentId === TEST_FACILITATOR_ID
            );
            expect(hasFacilitator).toBe(true);

            // statements: 非空配列
            expect(Array.isArray(minutes.statements)).toBe(true);
            expect(minutes.statements.length).toBeGreaterThan(0);

            // decisions: 配列（空でも可）
            expect(Array.isArray(minutes.decisions)).toBe(true);

            // actionItems: 配列（空でも可）
            expect(Array.isArray(minutes.actionItems)).toBe(true);

            // facilitator: 非空文字列
            expect(minutes.facilitator).toBeTruthy();
            expect(minutes.facilitator).toBe(TEST_FACILITATOR_ID);

            // startedAt: 非空文字列（ISO8601形式）
            expect(minutes.startedAt).toBeTruthy();
            expect(typeof minutes.startedAt).toBe('string');
            expect(new Date(minutes.startedAt).toISOString()).toBeTruthy();

            // endedAt: 非空文字列（ISO8601形式）
            expect(minutes.endedAt).toBeTruthy();
            expect(typeof minutes.endedAt).toBe('string');
            expect(new Date(minutes.endedAt).toISOString()).toBeTruthy();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('会議録のagenda各項目が必須フィールドを持つこと', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          workflowIdArb,
          async (instruction: string, workflowId: string) => {
            const minutes = await coordinator.conveneMeeting(
              workflowId,
              instruction,
              TEST_FACILITATOR_ID
            );

            for (const agendaItem of minutes.agenda) {
              expect(agendaItem.id).toBeTruthy();
              expect(agendaItem.topic).toBeTruthy();
              expect(agendaItem.description).toBeTruthy();
              expect(['pending', 'discussing', 'concluded']).toContain(agendaItem.status);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('会議録のparticipants各項目が必須フィールドを持つこと', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          workflowIdArb,
          async (instruction: string, workflowId: string) => {
            const minutes = await coordinator.conveneMeeting(
              workflowId,
              instruction,
              TEST_FACILITATOR_ID
            );

            for (const participant of minutes.participants) {
              expect(participant.agentId).toBeTruthy();
              expect(participant.role).toBeTruthy();
              expect(participant.workerType).toBeTruthy();
              expect(Array.isArray(participant.expertise)).toBe(true);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 7b: Meeting Discussion Coverage
  // **Validates: Requirements 12.1, 12.2, 12.3**
  // ===========================================================================

  describe('Property 7b: Meeting Discussion Coverage', () => {
    it('各議題について、ファシリテーター以外の全参加者が発言していること (Req 12.1)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          workflowIdArb,
          async (instruction: string, workflowId: string) => {
            const minutes = await coordinator.conveneMeeting(
              workflowId,
              instruction,
              TEST_FACILITATOR_ID
            );

            // ファシリテーター以外の参加者
            const nonFacilitators = minutes.participants.filter(
              (p) => p.agentId !== minutes.facilitator
            );

            // 各議題について、全非ファシリテーター参加者が発言していること
            for (const agendaItem of minutes.agenda) {
              for (const participant of nonFacilitators) {
                const hasStatement = minutes.statements.some(
                  (s) =>
                    s.agendaItemId === agendaItem.id &&
                    s.participantId === participant.agentId
                );
                expect(hasStatement).toBe(true);
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('各発言がparticipantId, participantRole, content, agendaItemId, timestampを持つこと (Req 12.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          workflowIdArb,
          async (instruction: string, workflowId: string) => {
            const minutes = await coordinator.conveneMeeting(
              workflowId,
              instruction,
              TEST_FACILITATOR_ID
            );

            for (const statement of minutes.statements) {
              // participantId: 非空文字列
              expect(statement.participantId).toBeTruthy();
              expect(typeof statement.participantId).toBe('string');

              // participantRole: 非空文字列
              expect(statement.participantRole).toBeTruthy();
              expect(typeof statement.participantRole).toBe('string');

              // content: 非空文字列
              expect(statement.content).toBeTruthy();
              expect(typeof statement.content).toBe('string');

              // agendaItemId: 非空文字列で、agenda内のIDと一致
              expect(statement.agendaItemId).toBeTruthy();
              const validAgendaIds = minutes.agenda.map((a) => a.id);
              expect(validAgendaIds).toContain(statement.agendaItemId);

              // timestamp: 非空文字列（ISO8601形式）
              expect(statement.timestamp).toBeTruthy();
              expect(typeof statement.timestamp).toBe('string');
              expect(new Date(statement.timestamp).toISOString()).toBeTruthy();
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('各議題にファシリテーターのまとめがあり、statusがconcludedでsummaryが存在すること (Req 12.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          workflowIdArb,
          async (instruction: string, workflowId: string) => {
            const minutes = await coordinator.conveneMeeting(
              workflowId,
              instruction,
              TEST_FACILITATOR_ID
            );

            for (const agendaItem of minutes.agenda) {
              // ステータスが 'concluded' であること
              expect(agendaItem.status).toBe('concluded');

              // summaryが存在し、truthy であること
              expect(agendaItem.summary).toBeTruthy();

              // ファシリテーターによるまとめ発言が存在すること
              const facilitatorSummary = minutes.statements.some(
                (s) =>
                  s.agendaItemId === agendaItem.id &&
                  s.participantId === minutes.facilitator &&
                  s.content === agendaItem.summary
              );
              expect(facilitatorSummary).toBe(true);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ===========================================================================
  // Property 7c: Meeting Minutes Persistence Round-Trip
  // **Validates: Requirements 2.7**
  // ===========================================================================

  describe('Property 7c: Meeting Minutes Persistence Round-Trip', () => {
    it('会議録を保存して読み込むと、全データが保持されること', async () => {
      await fc.assert(
        fc.asyncProperty(
          instructionArb,
          workflowIdArb,
          async (instruction: string, workflowId: string) => {
            // 会議を開催（conveneMeeting内でsaveMeetingMinutesも呼ばれる）
            const original = await coordinator.conveneMeeting(
              workflowId,
              instruction,
              TEST_FACILITATOR_ID
            );

            // ファイルから読み込み
            const loaded = await coordinator.loadMeetingMinutes(
              workflowId,
              original.meetingId
            );

            // null でないこと
            expect(loaded).not.toBeNull();
            const restored = loaded as MeetingMinutes;

            // トップレベルフィールドの一致
            expect(restored.meetingId).toBe(original.meetingId);
            expect(restored.workflowId).toBe(original.workflowId);
            expect(restored.facilitator).toBe(original.facilitator);
            expect(restored.startedAt).toBe(original.startedAt);
            expect(restored.endedAt).toBe(original.endedAt);

            // agenda の一致
            expect(restored.agenda.length).toBe(original.agenda.length);
            for (let i = 0; i < original.agenda.length; i++) {
              expect(restored.agenda[i].id).toBe(original.agenda[i].id);
              expect(restored.agenda[i].topic).toBe(original.agenda[i].topic);
              expect(restored.agenda[i].description).toBe(original.agenda[i].description);
              expect(restored.agenda[i].status).toBe(original.agenda[i].status);
              expect(restored.agenda[i].summary).toBe(original.agenda[i].summary);
            }

            // participants の一致
            expect(restored.participants.length).toBe(original.participants.length);
            for (let i = 0; i < original.participants.length; i++) {
              expect(restored.participants[i].agentId).toBe(original.participants[i].agentId);
              expect(restored.participants[i].role).toBe(original.participants[i].role);
              expect(restored.participants[i].workerType).toBe(original.participants[i].workerType);
              expect(restored.participants[i].expertise).toEqual(original.participants[i].expertise);
            }

            // statements の一致
            expect(restored.statements.length).toBe(original.statements.length);
            for (let i = 0; i < original.statements.length; i++) {
              expect(restored.statements[i].participantId).toBe(original.statements[i].participantId);
              expect(restored.statements[i].participantRole).toBe(original.statements[i].participantRole);
              expect(restored.statements[i].content).toBe(original.statements[i].content);
              expect(restored.statements[i].agendaItemId).toBe(original.statements[i].agendaItemId);
              expect(restored.statements[i].timestamp).toBe(original.statements[i].timestamp);
            }

            // decisions の一致
            expect(restored.decisions.length).toBe(original.decisions.length);
            for (let i = 0; i < original.decisions.length; i++) {
              expect(restored.decisions[i].agendaItemId).toBe(original.decisions[i].agendaItemId);
              expect(restored.decisions[i].decision).toBe(original.decisions[i].decision);
              expect(restored.decisions[i].rationale).toBe(original.decisions[i].rationale);
            }

            // actionItems の一致
            expect(restored.actionItems.length).toBe(original.actionItems.length);
            for (let i = 0; i < original.actionItems.length; i++) {
              expect(restored.actionItems[i].description).toBe(original.actionItems[i].description);
              expect(restored.actionItems[i].assignee).toBe(original.actionItems[i].assignee);
              expect(restored.actionItems[i].workerType).toBe(original.actionItems[i].workerType);
              expect(restored.actionItems[i].priority).toBe(original.actionItems[i].priority);
            }

            // 完全な深い等価性チェック
            expect(restored).toEqual(original);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
