/**
 * ExecutiveMeetingCoordinator ユニットテスト
 *
 * @module tests/execution/executive-meeting-coordinator
 * @see Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecutiveMeetingCoordinator } from '../../tools/cli/lib/execution/executive-meeting-coordinator.js';

describe('ExecutiveMeetingCoordinator', () => {
  let coordinator: ExecutiveMeetingCoordinator;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-exec-meeting-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('conductMeeting()', () => {
    it('データソースなしでもデフォルト議題で会議を開催できる', async () => {
      coordinator = new ExecutiveMeetingCoordinator({ basePath: testDir });

      const result = await coordinator.conductMeeting();

      expect(result.meetingId).toMatch(/^exec-/);
      expect(result.participants).toContain('coo_pm');
      expect(result.participants).toContain('quality_authority');
      expect(result.participants).toContain('cfo');
      expect(result.agenda.length).toBeGreaterThan(0);
      expect(result.minutes).toBeTruthy();
    });

    it('データソースから議題を自動生成できる', async () => {
      coordinator = new ExecutiveMeetingCoordinator({
        basePath: testDir,
        dataSources: {
          getPerformanceSummary: async () => '成功率: 85%, 品質スコア: 78',
          getHiringProposals: async () => 'フロントエンド開発者の採用を提案',
          getEscalationSummary: async () => 'テスト失敗パターンが3件検出',
          getTechDebtSummary: async () => 'lintエラー: 15件, カバレッジ: 72%',
        },
      });

      const result = await coordinator.conductMeeting();

      expect(result.agenda.length).toBe(4);
      const categories = result.agenda.map((a) => a.category);
      expect(categories).toContain('kpi');
      expect(categories).toContain('hiring');
      expect(categories).toContain('escalation');
      expect(categories).toContain('tech_debt');
    });

    it('MeetingCoordinatorを使用して議論を実施できる', async () => {
      const mockMeeting = {
        conveneMeeting: async () => ({
          summary: 'AI生成の議事録',
          decisions: ['採用を承認', 'テスト改善を優先'],
        }),
      };

      coordinator = new ExecutiveMeetingCoordinator({
        basePath: testDir,
        meetingCoordinator: mockMeeting,
        dataSources: {
          getPerformanceSummary: async () => 'KPIデータ',
        },
      });

      const result = await coordinator.conductMeeting();

      expect(result.minutes).toBe('AI生成の議事録');
      expect(result.decisions).toContain('採用を承認');
    });

    it('MeetingCoordinator失敗時はフォールバック議事録を生成する', async () => {
      const mockMeeting = {
        conveneMeeting: async () => {
          throw new Error('AI unavailable');
        },
      };

      coordinator = new ExecutiveMeetingCoordinator({
        basePath: testDir,
        meetingCoordinator: mockMeeting,
        dataSources: {
          getPerformanceSummary: async () => 'KPIデータ',
        },
      });

      const result = await coordinator.conductMeeting();

      expect(result.minutes).toContain('経営会議');
      expect(result.minutes).toContain('議事録');
    });

    it('結果が永続化される', async () => {
      coordinator = new ExecutiveMeetingCoordinator({ basePath: testDir });

      const result = await coordinator.conductMeeting();
      const saved = await coordinator.getResult(result.meetingId);

      expect(saved).not.toBeNull();
      expect(saved?.meetingId).toBe(result.meetingId);
    });
  });

  describe('prepareAgenda()', () => {
    it('データソースエラー時はスキップして続行する', async () => {
      coordinator = new ExecutiveMeetingCoordinator({
        basePath: testDir,
        dataSources: {
          getPerformanceSummary: async () => { throw new Error('fail'); },
          getTechDebtSummary: async () => '負債データ',
        },
      });

      const agenda = await coordinator.prepareAgenda();

      // エラーのKPIはスキップされ、tech_debtのみ
      expect(agenda.some((a) => a.category === 'tech_debt')).toBe(true);
      expect(agenda.some((a) => a.category === 'kpi')).toBe(false);
    });

    it('議題は優先度順にソートされる', async () => {
      coordinator = new ExecutiveMeetingCoordinator({
        basePath: testDir,
        dataSources: {
          getHiringProposals: async () => '採用提案',
          getEscalationSummary: async () => 'エスカレーション',
        },
      });

      const agenda = await coordinator.prepareAgenda();

      // escalation(high) が hiring(medium) より前
      const escIdx = agenda.findIndex((a) => a.category === 'escalation');
      const hireIdx = agenda.findIndex((a) => a.category === 'hiring');
      expect(escIdx).toBeLessThan(hireIdx);
    });
  });

  describe('listResults()', () => {
    it('全会議結果を新しい順に取得できる', async () => {
      coordinator = new ExecutiveMeetingCoordinator({ basePath: testDir });

      await coordinator.conductMeeting();
      // 少し待ってからもう1件
      await new Promise((r) => setTimeout(r, 10));
      await coordinator.conductMeeting();

      const results = await coordinator.listResults();
      expect(results.length).toBe(2);
      // 新しい順
      expect(new Date(results[0].date).getTime()).toBeGreaterThanOrEqual(
        new Date(results[1].date).getTime()
      );
    });

    it('データがない場合は空配列を返す', async () => {
      coordinator = new ExecutiveMeetingCoordinator({ basePath: testDir });
      const results = await coordinator.listResults();
      expect(results).toEqual([]);
    });
  });
});
