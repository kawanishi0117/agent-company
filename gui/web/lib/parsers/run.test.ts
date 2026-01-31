/**
 * @file Runパーサーのユニットテスト
 * @description run.tsの各関数をテストする
 */

import { describe, it, expect } from 'vitest';
import { parseResultJson, parseJudgmentJson, filterRunsByStatus, paginateRuns } from './run';
import type { Run, RunStatus } from '../types';

// =============================================================================
// parseResultJson のテスト
// =============================================================================

describe('parseResultJson', () => {
  describe('正常系', () => {
    it('有効なresult.jsonからRun情報を抽出できる', () => {
      const resultJson = {
        runId: '2026-01-27-151426-q3me',
        ticketId: '0001',
        status: 'success',
        startTime: '2026-01-27T15:14:26.394Z',
        endTime: '2026-01-27T15:14:26.396Z',
        logs: ['log1', 'log2'],
        artifacts: ['artifact1.txt'],
      };

      const result = parseResultJson(resultJson);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.runId).toBe('2026-01-27-151426-q3me');
        expect(result.data.ticketId).toBe('0001');
        expect(result.data.status).toBe('success');
        expect(result.data.startTime).toBe('2026-01-27T15:14:26.394Z');
        expect(result.data.endTime).toBe('2026-01-27T15:14:26.396Z');
        expect(result.data.logs).toEqual(['log1', 'log2']);
        expect(result.data.artifacts).toEqual(['artifact1.txt']);
      }
    });

    it('全てのステータス値を正しく処理できる', () => {
      const statuses: RunStatus[] = ['success', 'failure', 'running'];

      for (const status of statuses) {
        const resultJson = {
          runId: 'test-run',
          ticketId: '0001',
          status,
          startTime: '2026-01-27T00:00:00.000Z',
        };

        const result = parseResultJson(resultJson);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(status);
        }
      }
    });

    it('endTimeがない場合はundefinedになる', () => {
      const resultJson = {
        runId: 'test-run',
        ticketId: '0001',
        status: 'running',
        startTime: '2026-01-27T00:00:00.000Z',
      };

      const result = parseResultJson(resultJson);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.endTime).toBeUndefined();
      }
    });
  });

  describe('フォールバック処理', () => {
    it('runIdがない場合、ディレクトリ名から取得する', () => {
      const resultJson = {
        ticketId: '0001',
        status: 'success',
        startTime: '2026-01-27T00:00:00.000Z',
      };

      const result = parseResultJson(resultJson, '2026-01-27-test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.runId).toBe('2026-01-27-test');
      }
    });

    it('無効なステータスの場合、runningにフォールバックする', () => {
      const resultJson = {
        runId: 'test-run',
        ticketId: '0001',
        status: 'invalid_status',
        startTime: '2026-01-27T00:00:00.000Z',
      };

      const result = parseResultJson(resultJson);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('running');
      }
    });

    it('logsがない場合は空配列になる', () => {
      const resultJson = {
        runId: 'test-run',
        ticketId: '0001',
        status: 'success',
        startTime: '2026-01-27T00:00:00.000Z',
      };

      const result = parseResultJson(resultJson);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logs).toEqual([]);
      }
    });
  });

  describe('エラー処理', () => {
    it('runIdが取得できない場合はエラーを返す', () => {
      const resultJson = {
        ticketId: '0001',
        status: 'success',
      };

      const result = parseResultJson(resultJson);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Run ID');
      }
    });
  });
});

// =============================================================================
// parseJudgmentJson のテスト
// =============================================================================

describe('parseJudgmentJson', () => {
  describe('正常系', () => {
    it('有効なjudgment.jsonからJudgment情報を抽出できる', () => {
      const judgmentJson = {
        status: 'PASS',
        timestamp: '2026-01-28T15:28:12.217Z',
        run_id: '2026-01-27-151426-q3me',
        checks: {
          lint: { passed: true },
          test: { passed: true },
          e2e: { passed: true },
          format: { passed: true },
        },
        reasons: [],
      };

      const result = parseJudgmentJson(judgmentJson);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('PASS');
        expect(result.data.run_id).toBe('2026-01-27-151426-q3me');
        expect(result.data.checks.lint.passed).toBe(true);
        expect(result.data.checks.test.passed).toBe(true);
        expect(result.data.checks.e2e.passed).toBe(true);
        expect(result.data.checks.format.passed).toBe(true);
      }
    });

    it('FAIL判定を正しく処理できる', () => {
      const judgmentJson = {
        status: 'FAIL',
        timestamp: '2026-01-28T15:28:12.217Z',
        run_id: 'test-run',
        checks: {
          lint: { passed: false, details: 'ESLint errors found' },
          test: { passed: true },
          e2e: { passed: true },
          format: { passed: true },
        },
        reasons: ['lint check failed'],
      };

      const result = parseJudgmentJson(judgmentJson);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('FAIL');
        expect(result.data.checks.lint.passed).toBe(false);
        expect(result.data.checks.lint.details).toBe('ESLint errors found');
        expect(result.data.reasons).toContain('lint check failed');
      }
    });

    it('WAIVER判定を正しく処理できる', () => {
      const judgmentJson = {
        status: 'WAIVER',
        timestamp: '2026-01-28T15:28:12.217Z',
        run_id: 'test-run',
        checks: {
          lint: { passed: false },
          test: { passed: true },
          e2e: { passed: true },
          format: { passed: true },
        },
        reasons: ['waiver approved'],
        waiver_id: 'WAIVER-001',
      };

      const result = parseJudgmentJson(judgmentJson);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('WAIVER');
        expect(result.data.waiver_id).toBe('WAIVER-001');
      }
    });
  });

  describe('エラー処理', () => {
    it('statusがない場合はエラーを返す', () => {
      const judgmentJson = {
        run_id: 'test-run',
        checks: {},
      };

      const result = parseJudgmentJson(judgmentJson);

      expect(result.success).toBe(false);
    });

    it('run_idがない場合はエラーを返す', () => {
      const judgmentJson = {
        status: 'PASS',
        checks: {},
      };

      const result = parseJudgmentJson(judgmentJson);

      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// filterRunsByStatus のテスト
// =============================================================================

describe('filterRunsByStatus', () => {
  const createRun = (runId: string, status: RunStatus): Run => ({
    runId,
    ticketId: '0001',
    status,
    startTime: '2026-01-27T00:00:00.000Z',
    logs: [],
    artifacts: [],
  });

  it('指定したステータスのRunのみをフィルタリングする', () => {
    const runs: Run[] = [
      createRun('run1', 'success'),
      createRun('run2', 'failure'),
      createRun('run3', 'success'),
      createRun('run4', 'running'),
    ];

    const filtered = filterRunsByStatus(runs, 'success');

    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.status === 'success')).toBe(true);
  });

  it('該当するRunがない場合は空配列を返す', () => {
    const runs: Run[] = [createRun('run1', 'success'), createRun('run2', 'success')];

    const filtered = filterRunsByStatus(runs, 'failure');

    expect(filtered).toHaveLength(0);
  });
});

// =============================================================================
// paginateRuns のテスト
// =============================================================================

describe('paginateRuns', () => {
  const createRun = (runId: string): Run => ({
    runId,
    ticketId: '0001',
    status: 'success',
    startTime: '2026-01-27T00:00:00.000Z',
    logs: [],
    artifacts: [],
  });

  it('正しくページネーションする', () => {
    const runs = Array.from({ length: 25 }, (_, i) => createRun(`run${i + 1}`));

    const page1 = paginateRuns(runs, 1, 10);
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBe(25);
    expect(page1.hasMore).toBe(true);

    const page2 = paginateRuns(runs, 2, 10);
    expect(page2.items).toHaveLength(10);
    expect(page2.hasMore).toBe(true);

    const page3 = paginateRuns(runs, 3, 10);
    expect(page3.items).toHaveLength(5);
    expect(page3.hasMore).toBe(false);
  });

  it('空の配列を正しく処理する', () => {
    const result = paginateRuns([], 1, 10);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('ページサイズより少ない場合も正しく処理する', () => {
    const runs = Array.from({ length: 5 }, (_, i) => createRun(`run${i + 1}`));

    const result = paginateRuns(runs, 1, 10);

    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(false);
  });
});
