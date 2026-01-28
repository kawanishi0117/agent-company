/**
 * 判定ロジックのテスト
 * Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 6.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateQualityGates,
  executeJudgment,
  formatJudgmentResult,
  JudgmentResult,
  RunResult,
} from '../tools/cli/lib/judgment';

// テスト用のディレクトリとファイル
const TEST_RUN_ID = 'test-run-001';
const TEST_RUN_DIR = path.join('runtime', 'runs', TEST_RUN_ID);
const TEST_WAIVER_ID = '2026-01-29-test-waiver';
const TEST_WAIVER_PATH = path.join('workflows', 'waivers', `${TEST_WAIVER_ID}.md`);

// 有効なWaiverコンテンツ
const validWaiverContent = `# Waiver: テスト例外

## 申請日

2026-01-29

## 申請者

Test Agent

## 対象

テストカバレッジ基準

## 理由

テスト用の一時的な例外

## 緊急性

テスト実行のため

## 代替策

手動確認済み

## 期限

2030-12-31

## フォロータスク

- [ ] テスト完了後に削除

## 承認者

Quality Authority

## ステータス

- [x] 承認
`;

describe('Judgment Logic', () => {
  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (!fs.existsSync(TEST_RUN_DIR)) {
      fs.mkdirSync(TEST_RUN_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // テスト用ファイルをクリーンアップ
    if (fs.existsSync(path.join(TEST_RUN_DIR, 'result.json'))) {
      fs.unlinkSync(path.join(TEST_RUN_DIR, 'result.json'));
    }
    if (fs.existsSync(path.join(TEST_RUN_DIR, 'judgment.json'))) {
      fs.unlinkSync(path.join(TEST_RUN_DIR, 'judgment.json'));
    }
    if (fs.existsSync(TEST_RUN_DIR)) {
      fs.rmdirSync(TEST_RUN_DIR);
    }
    if (fs.existsSync(TEST_WAIVER_PATH)) {
      fs.unlinkSync(TEST_WAIVER_PATH);
    }
  });

  describe('evaluateQualityGates', () => {
    it('qualityGatesが存在する場合はその値を使用する', () => {
      const runResult: RunResult = {
        runId: TEST_RUN_ID,
        ticketId: '001',
        startTime: '2026-01-29T00:00:00Z',
        endTime: '2026-01-29T00:01:00Z',
        status: 'success',
        logs: [],
        artifacts: [],
        qualityGates: {
          lint: { passed: true },
          test: { passed: false, details: 'coverage: 65%' },
          e2e: { passed: true },
          format: { passed: true },
        },
      };

      const checks = evaluateQualityGates(runResult);

      expect(checks.lint.passed).toBe(true);
      expect(checks.test.passed).toBe(false);
      expect(checks.test.details).toBe('coverage: 65%');
      expect(checks.e2e.passed).toBe(true);
      expect(checks.format.passed).toBe(true);
    });

    it('status: successの場合は全てPASSと判定する', () => {
      const runResult: RunResult = {
        runId: TEST_RUN_ID,
        ticketId: '001',
        startTime: '2026-01-29T00:00:00Z',
        endTime: '2026-01-29T00:01:00Z',
        status: 'success',
        logs: [],
        artifacts: [],
      };

      const checks = evaluateQualityGates(runResult);

      expect(checks.lint.passed).toBe(true);
      expect(checks.test.passed).toBe(true);
      expect(checks.e2e.passed).toBe(true);
      expect(checks.format.passed).toBe(true);
    });

    it('status: failureの場合はFAILと判定する', () => {
      const runResult: RunResult = {
        runId: TEST_RUN_ID,
        ticketId: '001',
        startTime: '2026-01-29T00:00:00Z',
        endTime: '2026-01-29T00:01:00Z',
        status: 'failure',
        logs: [],
        artifacts: [],
      };

      const checks = evaluateQualityGates(runResult);

      // 少なくとも1つはFAIL
      const hasFailed =
        !checks.lint.passed || !checks.test.passed || !checks.e2e.passed || !checks.format.passed;
      expect(hasFailed).toBe(true);
    });
  });

  describe('executeJudgment', () => {
    it('全チェックPASSの場合はPASS判定を返す', () => {
      // テスト用のresult.jsonを作成
      const runResult: RunResult = {
        runId: TEST_RUN_ID,
        ticketId: '001',
        startTime: '2026-01-29T00:00:00Z',
        endTime: '2026-01-29T00:01:00Z',
        status: 'success',
        logs: [],
        artifacts: [],
        qualityGates: {
          lint: { passed: true },
          test: { passed: true },
          e2e: { passed: true },
          format: { passed: true },
        },
      };
      fs.writeFileSync(path.join(TEST_RUN_DIR, 'result.json'), JSON.stringify(runResult));

      const result = executeJudgment(TEST_RUN_ID);

      expect(result.status).toBe('PASS');
      expect(result.run_id).toBe(TEST_RUN_ID);
      expect(result.reasons).toHaveLength(0);
    });

    it('いずれかFAILの場合はFAIL判定を返す', () => {
      const runResult: RunResult = {
        runId: TEST_RUN_ID,
        ticketId: '001',
        startTime: '2026-01-29T00:00:00Z',
        endTime: '2026-01-29T00:01:00Z',
        status: 'failure',
        logs: [],
        artifacts: [],
        qualityGates: {
          lint: { passed: false, details: '3 errors found' },
          test: { passed: true },
          e2e: { passed: false, details: '2/5 tests failed' },
          format: { passed: true },
        },
      };
      fs.writeFileSync(path.join(TEST_RUN_DIR, 'result.json'), JSON.stringify(runResult));

      const result = executeJudgment(TEST_RUN_ID);

      expect(result.status).toBe('FAIL');
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.some((r) => r.includes('lint'))).toBe(true);
      expect(result.reasons.some((r) => r.includes('e2e'))).toBe(true);
    });

    it('有効なWaiver適用時はWAIVER判定を返す', () => {
      // テスト用のresult.jsonを作成（FAIL状態）
      const runResult: RunResult = {
        runId: TEST_RUN_ID,
        ticketId: '001',
        startTime: '2026-01-29T00:00:00Z',
        endTime: '2026-01-29T00:01:00Z',
        status: 'failure',
        logs: [],
        artifacts: [],
        qualityGates: {
          lint: { passed: true },
          test: { passed: false, details: 'coverage: 65%' },
          e2e: { passed: true },
          format: { passed: true },
        },
      };
      fs.writeFileSync(path.join(TEST_RUN_DIR, 'result.json'), JSON.stringify(runResult));

      // テスト用のWaiverを作成
      fs.writeFileSync(TEST_WAIVER_PATH, validWaiverContent);

      const result = executeJudgment(TEST_RUN_ID, TEST_WAIVER_ID);

      expect(result.status).toBe('WAIVER');
      expect(result.waiver_id).toBe(TEST_WAIVER_ID);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('存在しないrun-idでエラーを返す', () => {
      expect(() => executeJudgment('non-existent-run')).toThrow('Run not found');
    });

    it('存在しないwaiver-idでエラーを返す', () => {
      const runResult: RunResult = {
        runId: TEST_RUN_ID,
        ticketId: '001',
        startTime: '2026-01-29T00:00:00Z',
        endTime: '2026-01-29T00:01:00Z',
        status: 'failure',
        logs: [],
        artifacts: [],
        qualityGates: {
          lint: { passed: true },
          test: { passed: false },
          e2e: { passed: true },
          format: { passed: true },
        },
      };
      fs.writeFileSync(path.join(TEST_RUN_DIR, 'result.json'), JSON.stringify(runResult));

      expect(() => executeJudgment(TEST_RUN_ID, 'non-existent-waiver')).toThrow('Waiver not found');
    });
  });

  describe('formatJudgmentResult', () => {
    it('PASS判定を正しくフォーマットする', () => {
      const result: JudgmentResult = {
        status: 'PASS',
        timestamp: '2026-01-29T00:00:00Z',
        run_id: TEST_RUN_ID,
        checks: {
          lint: { passed: true },
          test: { passed: true },
          e2e: { passed: true },
          format: { passed: true },
        },
        reasons: [],
      };

      const formatted = formatJudgmentResult(result);

      expect(formatted).toContain('✅');
      expect(formatted).toContain('PASS');
      expect(formatted).toContain(TEST_RUN_ID);
    });

    it('FAIL判定を正しくフォーマットする', () => {
      const result: JudgmentResult = {
        status: 'FAIL',
        timestamp: '2026-01-29T00:00:00Z',
        run_id: TEST_RUN_ID,
        checks: {
          lint: { passed: false, details: '3 errors' },
          test: { passed: true },
          e2e: { passed: true },
          format: { passed: true },
        },
        reasons: ['lint: 3 errors'],
      };

      const formatted = formatJudgmentResult(result);

      expect(formatted).toContain('❌');
      expect(formatted).toContain('FAIL');
      expect(formatted).toContain('Reasons');
      expect(formatted).toContain('lint');
    });

    it('WAIVER判定を正しくフォーマットする', () => {
      const result: JudgmentResult = {
        status: 'WAIVER',
        timestamp: '2026-01-29T00:00:00Z',
        run_id: TEST_RUN_ID,
        checks: {
          lint: { passed: true },
          test: { passed: false },
          e2e: { passed: true },
          format: { passed: true },
        },
        reasons: ['test: failed'],
        waiver_id: TEST_WAIVER_ID,
      };

      const formatted = formatJudgmentResult(result);

      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('WAIVER');
      expect(formatted).toContain(TEST_WAIVER_ID);
    });
  });
});
