/**
 * RetrospectiveEngine ユニットテスト
 *
 * @module tests/execution/retrospective-engine
 * @see Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  RetrospectiveEngine,
  type IMeetingCoordinatorLike,
  type RetrospectiveResult,
} from '../../tools/cli/lib/execution/retrospective-engine.js';
import type { MeetingMinutes } from '../../tools/cli/lib/execution/types.js';

// =============================================================================
// テストヘルパー
// =============================================================================

let testDir: string;

/** テスト用MeetingCoordinatorモック */
function createMockMeetingCoordinator(
  overrides?: Partial<MeetingMinutes>
): IMeetingCoordinatorLike {
  return {
    conveneMeeting: async (
      workflowId: string,
      _instruction: string,
      _facilitatorId: string
    ): Promise<MeetingMinutes> => ({
      meetingId: `mock-meeting-${workflowId}`,
      workflowId,
      facilitator: 'quality_authority',
      participants: [
        { agentId: 'coo_pm', role: 'participant', opinion: 'プロセスは順調だった' },
        { agentId: 'reviewer', role: 'participant', opinion: 'コード品質は良好' },
      ],
      agenda: [
        {
          id: 'agenda-1',
          topic: 'レトロスペクティブ',
          description: 'ワークフロー振り返り',
          discussion: [],
          decisions: [],
        },
      ],
      summary: 'ワークフローは正常に完了。品質も良好。',
      actionItems: [],
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      ...overrides,
    }),
  };
}

beforeEach(async () => {
  testDir = path.join(os.tmpdir(), `retro-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

// =============================================================================
// テスト
// =============================================================================

describe('RetrospectiveEngine', () => {
  it('MeetingCoordinatorなしでレトロスペクティブを実施できる', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    const result = await engine.conductRetrospective('wf-001', {
      instruction: 'ログイン機能の実装',
      participants: ['coo_pm', 'worker_1'],
      outcome: 'success',
    });

    expect(result.workflowId).toBe('wf-001');
    expect(result.meetingMinutes).toBeDefined();
    expect(result.goodPoints.length).toBeGreaterThan(0);
    expect(result.conductedAt).toBeDefined();
  });

  it('MeetingCoordinatorを使用してレトロスペクティブを実施できる', async () => {
    const mockCoordinator = createMockMeetingCoordinator();
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
      meetingCoordinator: mockCoordinator,
    });

    const result = await engine.conductRetrospective('wf-002', {
      instruction: 'API設計',
      participants: ['coo_pm', 'reviewer'],
      outcome: 'success',
    });

    expect(result.meetingMinutes.meetingId).toBe('mock-meeting-wf-002');
    expect(result.meetingMinutes.participants).toHaveLength(2);
  });

  it('失敗ワークフローの場合、改善点とアクションアイテムが生成される', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    const result = await engine.conductRetrospective('wf-003', {
      instruction: 'デプロイ自動化',
      participants: ['coo_pm', 'worker_1'],
      outcome: 'failure',
      issues: ['テストが不十分', 'コードレビューが遅延'],
    });

    expect(result.improvementPoints.length).toBeGreaterThan(0);
    expect(result.improvementPoints).toContain(
      'ワークフローが失敗した - 根本原因の調査が必要'
    );
    expect(result.actionItems.length).toBeGreaterThan(0);
    // 失敗を含むアクションは高優先度
    const highPriority = result.actionItems.filter(
      (a) => a.priority === 'high'
    );
    expect(highPriority.length).toBeGreaterThan(0);
  });

  it('改善点からルール提案が生成される', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    const result = await engine.conductRetrospective('wf-004', {
      instruction: 'テスト改善',
      participants: ['coo_pm'],
      outcome: 'partial',
      issues: ['テストカバレッジが低い', '品質基準を満たしていない'],
    });

    expect(result.proposedRules.length).toBeGreaterThan(0);
    expect(result.proposedRules[0].status).toBe('proposed');
    expect(result.proposedRules[0].source.workflowId).toBe('wf-004');
  });

  it('結果が永続化され、取得できる', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    await engine.conductRetrospective('wf-005', {
      instruction: 'テスト',
      participants: ['coo_pm'],
      outcome: 'success',
    });

    const loaded = await engine.getResult('wf-005');
    expect(loaded).not.toBeNull();
    expect(loaded!.workflowId).toBe('wf-005');
  });

  it('存在しないワークフローIDでnullを返す', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    const result = await engine.getResult('nonexistent');
    expect(result).toBeNull();
  });

  it('全結果を一覧取得できる', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    await engine.conductRetrospective('wf-a', {
      instruction: 'タスクA',
      participants: ['coo_pm'],
      outcome: 'success',
    });
    await engine.conductRetrospective('wf-b', {
      instruction: 'タスクB',
      participants: ['coo_pm'],
      outcome: 'failure',
      issues: ['問題あり'],
    });

    const results = await engine.listResults();
    expect(results).toHaveLength(2);
    // 新しい順
    expect(
      new Date(results[0].conductedAt).getTime()
    ).toBeGreaterThanOrEqual(
      new Date(results[1].conductedAt).getTime()
    );
  });

  it('ルールを承認できる', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    // ルール提案を生成
    const result = await engine.conductRetrospective('wf-rule', {
      instruction: 'ルールテスト',
      participants: ['coo_pm'],
      outcome: 'failure',
      issues: ['テスト不足'],
    });

    expect(result.proposedRules.length).toBeGreaterThan(0);
    const ruleId = result.proposedRules[0].id;

    // 承認
    const approved = await engine.approveRule(ruleId);
    expect(approved).not.toBeNull();
    expect(approved!.status).toBe('approved');
    expect(approved!.approvedAt).toBeDefined();

    // 永続化確認
    const rules = await engine.getRules();
    const found = rules.find((r) => r.id === ruleId);
    expect(found!.status).toBe('approved');
  });

  it('ルールを却下できる', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    const result = await engine.conductRetrospective('wf-reject', {
      instruction: 'テスト',
      participants: ['coo_pm'],
      outcome: 'failure',
      issues: ['問題'],
    });

    const ruleId = result.proposedRules[0].id;
    const rejected = await engine.rejectRule(ruleId);
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe('rejected');
  });

  it('成功ワークフローではルール提案が生成されない', async () => {
    const engine = new RetrospectiveEngine({
      basePath: path.join(testDir, 'retros'),
      rulesPath: path.join(testDir, 'rules', 'rules.json'),
    });

    const result = await engine.conductRetrospective('wf-ok', {
      instruction: '完璧なタスク',
      participants: ['coo_pm'],
      outcome: 'success',
    });

    expect(result.proposedRules).toHaveLength(0);
  });
});
