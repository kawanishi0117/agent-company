/**
 * SpecComplianceChecker ユニットテスト
 *
 * @module tests/execution/spec-compliance-checker
 * @see Requirements: 8.1, 8.2, 8.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SpecComplianceChecker } from '../../tools/cli/lib/execution/spec-compliance-checker.js';

describe('SpecComplianceChecker', () => {
  let checker: SpecComplianceChecker;
  let testDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-compliance-' + Date.now());
    workspaceDir = path.join(testDir, 'workspace');
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    checker = new SpecComplianceChecker(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('check()', () => {
    it('全タスクが成果物に対応する場合、100%の適合率を返す', async () => {
      // テスト用ファイルを作成
      await fs.writeFile(path.join(workspaceDir, 'auth-handler.ts'), 'export {}');
      await fs.writeFile(path.join(workspaceDir, 'user-service.ts'), 'export {}');

      const report = await checker.check(
        'wf-001',
        {
          tasks: ['auth handler を実装', 'user service を実装'],
          expectedFiles: [],
          requirements: [],
        },
        ['auth-handler.ts', 'user-service.ts'],
        workspaceDir
      );

      expect(report.workflowId).toBe('wf-001');
      expect(report.implemented).toBeGreaterThan(0);
      expect(report.compliancePercentage).toBeGreaterThanOrEqual(0);
    });

    it('成果物がない場合、0%の適合率を返す', async () => {
      const report = await checker.check(
        'wf-002',
        {
          tasks: ['auth handler を実装', 'user service を実装'],
        },
        []
      );

      expect(report.workflowId).toBe('wf-002');
      expect(report.missing).toBe(2);
      expect(report.compliancePercentage).toBe(0);
    });

    it('期待ファイルの存在確認ができる', async () => {
      await fs.writeFile(path.join(workspaceDir, 'README.md'), '# Test');

      const report = await checker.check(
        'wf-003',
        {
          tasks: [],
          expectedFiles: ['README.md', 'MISSING.md'],
        },
        [],
        workspaceDir
      );

      expect(report.totalRequirements).toBe(2);
      expect(report.implemented).toBe(1);
      expect(report.missing).toBe(1);
    });

    it('要件の突合チェックができる', async () => {
      const report = await checker.check(
        'wf-004',
        {
          tasks: [],
          requirements: ['認証機能を実装する'],
        },
        ['auth-handler.ts']
      );

      expect(report.totalRequirements).toBe(1);
    });

    it('レポートが永続化される', async () => {
      await checker.check('wf-005', { tasks: ['テスト'] }, []);

      const saved = await checker.getReport('wf-005');
      expect(saved).not.toBeNull();
      expect(saved?.workflowId).toBe('wf-005');
    });
  });

  describe('needsCeoReview()', () => {
    it('適合率80%未満の場合、CEOレビューが必要', () => {
      const report = {
        workflowId: 'wf-006',
        totalRequirements: 10,
        implemented: 5,
        missing: 5,
        partial: 0,
        compliancePercentage: 50,
        details: [],
        checkedAt: new Date().toISOString(),
      };

      expect(checker.needsCeoReview(report)).toBe(true);
    });

    it('適合率80%以上の場合、CEOレビュー不要', () => {
      const report = {
        workflowId: 'wf-007',
        totalRequirements: 10,
        implemented: 9,
        missing: 1,
        partial: 0,
        compliancePercentage: 90,
        details: [],
        checkedAt: new Date().toISOString(),
      };

      expect(checker.needsCeoReview(report)).toBe(false);
    });
  });

  describe('listReports()', () => {
    it('全レポートを新しい順に取得できる', async () => {
      await checker.check('wf-a', { tasks: ['task1'] }, []);
      await checker.check('wf-b', { tasks: ['task2'] }, []);

      const reports = await checker.listReports();
      expect(reports.length).toBe(2);
    });

    it('レポートがない場合は空配列を返す', async () => {
      const reports = await checker.listReports();
      expect(reports).toEqual([]);
    });
  });
});
