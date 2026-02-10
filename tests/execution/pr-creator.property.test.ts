/**
 * PR Creator プロパティテスト
 *
 * Property 17: PR Creation Trigger
 * - 全ての孫チケットが完了した場合、PRが作成される
 *
 * Property 18: PR Content Completeness
 * - PRタイトルは `[AgentCompany] <summary>` 形式
 * - PR本文には overview, changes, test results, related tickets が含まれる
 *
 * Property 19: PR Status Update
 * - PR作成成功時、親チケットステータスが 'pr_created' に更新される
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.5**
 *
 * @module tests/execution/pr-creator.property.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PRCreator, PRBodyOptions } from '../../tools/cli/lib/execution/pr-creator';
import { ProcessMonitor } from '../../tools/cli/lib/execution/process-monitor';
import type {
  CommandResult,
  ParentTicket,
  ChildTicket,
  GrandchildTicket,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_RUNS_DIR = 'runtime/runs/test-pr-creator-property';

/**
 * テスト用の実行ID
 */
const TEST_RUN_ID = 'pr-creator-test-run';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * 成功するコマンド結果を生成
 */
function successResult(stdout: string = ''): CommandResult {
  return {
    exitCode: 0,
    stdout,
    stderr: '',
    timedOut: false,
  };
}

/**
 * 失敗するコマンド結果を生成
 */
function failureResult(stderr: string = 'error'): CommandResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr,
    timedOut: false,
  };
}

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * サマリーを生成するArbitrary
 */
const summaryArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.'.split('')
  ),
  { minLength: 1, maxLength: 100 }
);

/**
 * 概要を生成するArbitrary
 */
const overviewArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.,!?\n'.split('')
  ),
  { minLength: 1, maxLength: 500 }
);

/**
 * 変更一覧を生成するArbitrary
 */
const changesArb: fc.Arbitrary<string[]> = fc.array(
  fc.stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.'.split('')
    ),
    { minLength: 1, maxLength: 100 }
  ),
  { minLength: 0, maxLength: 20 }
);

/**
 * チケットID一覧を生成するArbitrary
 */
const ticketsArb: fc.Arbitrary<string[]> = fc.array(
  fc
    .tuple(
      fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
        minLength: 1,
        maxLength: 5,
      }),
      fc.integer({ min: 1, max: 9999 })
    )
    .map(([prefix, num]) => `${prefix}-${num}`),
  { minLength: 0, maxLength: 10 }
);

/**
 * テスト結果を生成するArbitrary
 */
const testResultsArb: fc.Arbitrary<PRBodyOptions['testResults']> = fc.option(
  fc.record({
    passed: fc.integer({ min: 0, max: 1000 }),
    failed: fc.integer({ min: 0, max: 100 }),
    skipped: fc.integer({ min: 0, max: 100 }),
  }),
  { nil: undefined }
);

/**
 * ブランチ名を生成するArbitrary（将来の拡張用）
 * @description 現在は未使用だが、将来のPR作成テスト拡張時に使用予定
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _branchNameArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/'.split('')),
  { minLength: 1, maxLength: 50 }
);

/**
 * ワーカータイプを生成するArbitrary
 */
const workerTypeArb = fc.constantFrom(
  'research' as const,
  'design' as const,
  'designer' as const,
  'developer' as const,
  'test' as const,
  'reviewer' as const
);

/**
 * チケットステータスを生成するArbitrary
 */
const ticketStatusArb = fc.constantFrom(
  'pending' as const,
  'decomposing' as const,
  'in_progress' as const,
  'review_requested' as const,
  'revision_required' as const,
  'completed' as const,
  'failed' as const,
  'pr_created' as const
);

/**
 * 孫チケットを生成するArbitrary
 */
const grandchildTicketArb: fc.Arbitrary<GrandchildTicket> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  parentId: fc.string({ minLength: 1, maxLength: 20 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  acceptanceCriteria: fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
    minLength: 0,
    maxLength: 5,
  }),
  status: ticketStatusArb,
  assignee: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  gitBranch: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  artifacts: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
  reviewResult: fc.constant(undefined),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
});

/**
 * 子チケットを生成するArbitrary
 */
const childTicketArb: fc.Arbitrary<ChildTicket> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  parentId: fc.string({ minLength: 1, maxLength: 15 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  status: ticketStatusArb,
  workerType: workerTypeArb,
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
  grandchildTickets: fc.array(grandchildTicketArb, { minLength: 0, maxLength: 3 }),
});

/**
 * 親チケットを生成するArbitrary
 */
const parentTicketArb: fc.Arbitrary<ParentTicket> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 15 }),
  projectId: fc.string({ minLength: 1, maxLength: 10 }),
  instruction: fc.string({ minLength: 1, maxLength: 500 }),
  status: ticketStatusArb,
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
  childTickets: fc.array(childTicketArb, { minLength: 0, maxLength: 3 }),
  metadata: fc.record({
    priority: fc.constantFrom('low' as const, 'medium' as const, 'high' as const),
    deadline: fc.option(fc.constant(new Date().toISOString()), { nil: undefined }),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  }),
});

// =============================================================================
// Property 17: PR Creation Trigger テスト
// =============================================================================

describe('Property 17: PR Creation Trigger', () => {
  let prCreator: PRCreator;
  let mockProcessMonitor: ProcessMonitor;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(TEST_RUNS_DIR, `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    mockProcessMonitor = new ProcessMonitor(tempDir);
    vi.spyOn(mockProcessMonitor, 'execute');

    prCreator = new PRCreator(mockProcessMonitor, tempDir);
    prCreator.setRunId(TEST_RUN_ID);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
    vi.restoreAllMocks();
  });

  /**
   * Property 17.1: GitHub CLI利用可能時のPR作成
   * GitHub CLIが利用可能な場合、gh pr createコマンドでPRが作成される
   *
   * **Validates: Requirement 10.1, 10.4**
   */
  it('Property 17.1: GitHub CLI利用可能時はgh pr createでPRが作成される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult('gh version 2.0.0')) // gh --version
      .mockResolvedValueOnce(successResult('https://github.com/user/repo/pull/123')); // gh pr create

    const result = await prCreator.createPullRequest({
      projectId: 'test-project',
      sourceBranch: 'agent/main',
      targetBranch: 'main',
      title: '[AgentCompany] Test PR',
      body: 'Test body',
      tickets: ['T-1'],
    });

    expect(result.success).toBe(true);
    expect(result.prUrl).toBe('https://github.com/user/repo/pull/123');
    expect(result.prId).toBe('123');
  });

  /**
   * Property 17.2: GitHub CLI利用不可時の手動PR作成
   * GitHub CLIが利用できない場合、ブランチをプッシュして手動作成を促す
   *
   * **Validates: Requirement 10.4**
   */
  it('Property 17.2: GitHub CLI利用不可時はブランチをプッシュして手動作成を促す', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(failureResult('gh not found')) // gh --version
      .mockResolvedValueOnce(successResult()); // git push

    const result = await prCreator.createPullRequest({
      projectId: 'test-project',
      sourceBranch: 'agent/main',
      targetBranch: 'main',
      title: '[AgentCompany] Test PR',
      body: 'Test body',
      tickets: ['T-1'],
    });

    expect(result.success).toBe(true);
    expect(result.prId).toBeUndefined();
    expect(result.error).toContain('manually');
  });

  /**
   * Property 17.3: PR作成失敗時のエラーハンドリング
   * PR作成が失敗した場合、エラー情報が返される
   *
   * **Validates: Requirement 10.6**
   */
  it('Property 17.3: PR作成失敗時はエラー情報が返される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult('gh version 2.0.0')) // gh --version
      .mockResolvedValueOnce(failureResult('PR creation failed')); // gh pr create

    const result = await prCreator.createPullRequest({
      projectId: 'test-project',
      sourceBranch: 'agent/main',
      targetBranch: 'main',
      title: '[AgentCompany] Test PR',
      body: 'Test body',
      tickets: ['T-1'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('PR creation failed');
  });
});

// =============================================================================
// Property 18: PR Content Completeness テスト
// =============================================================================

describe('Property 18: PR Content Completeness', () => {
  let prCreator: PRCreator;

  beforeEach(() => {
    prCreator = new PRCreator();
  });

  /**
   * Property 18.1: PRタイトルの形式
   * PRタイトルは `[AgentCompany] <summary>` 形式である
   *
   * **Validates: Requirement 10.2**
   */
  it('Property 18.1: PRタイトルは [AgentCompany] <summary> 形式である', async () => {
    await fc.assert(
      fc.asyncProperty(summaryArb, async (summary) => {
        const title = prCreator.generatePRTitle(summary);

        // [AgentCompany] プレフィックスで始まること
        expect(title).toMatch(/^\[AgentCompany\]/);

        // サマリーが含まれること
        expect(title).toContain(summary);

        // 形式: [AgentCompany] <summary>
        expect(title).toBe(`[AgentCompany] ${summary}`);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.2: PR本文に概要が含まれる
   * PR本文には overview セクションが含まれる
   *
   * **Validates: Requirement 10.3**
   */
  it('Property 18.2: PR本文には概要セクションが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(overviewArb, changesArb, ticketsArb, async (overview, changes, tickets) => {
        const body = prCreator.generatePRBody({
          overview,
          changes,
          tickets,
        });

        // Overview セクションが含まれること
        expect(body).toContain('## Overview');
        expect(body).toContain(overview);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.3: PR本文に変更一覧が含まれる
   * PR本文には changes セクションが含まれる
   *
   * **Validates: Requirement 10.3**
   */
  it('Property 18.3: PR本文には変更一覧セクションが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(overviewArb, changesArb, ticketsArb, async (overview, changes, tickets) => {
        const body = prCreator.generatePRBody({
          overview,
          changes,
          tickets,
        });

        // Changes セクションが含まれること
        expect(body).toContain('## Changes');

        // 変更がある場合は各変更が含まれること
        for (const change of changes) {
          expect(body).toContain(change);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.4: PR本文にテスト結果が含まれる
   * テスト結果が指定された場合、PR本文に含まれる
   *
   * **Validates: Requirement 10.3**
   */
  it('Property 18.4: テスト結果が指定された場合はPR本文に含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        overviewArb,
        changesArb,
        ticketsArb,
        testResultsArb,
        async (overview, changes, tickets, testResults) => {
          const body = prCreator.generatePRBody({
            overview,
            changes,
            tickets,
            testResults,
          });

          if (testResults) {
            // Test Results セクションが含まれること
            expect(body).toContain('## Test Results');
            expect(body).toContain(`Passed: ${testResults.passed}`);
            expect(body).toContain(`Failed: ${testResults.failed}`);
            expect(body).toContain(`Skipped: ${testResults.skipped}`);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.5: PR本文に関連チケットが含まれる
   * PR本文には related tickets セクションが含まれる
   *
   * **Validates: Requirement 10.3**
   */
  it('Property 18.5: PR本文には関連チケットセクションが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(overviewArb, changesArb, ticketsArb, async (overview, changes, tickets) => {
        const body = prCreator.generatePRBody({
          overview,
          changes,
          tickets,
        });

        // Related Tickets セクションが含まれること
        expect(body).toContain('## Related Tickets');

        // チケットがある場合は各チケットが含まれること
        for (const ticket of tickets) {
          expect(body).toContain(ticket);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.6: PR本文にAgentCompanyフッターが含まれる
   * PR本文にはAgentCompanyによる自動生成であることを示すフッターが含まれる
   *
   * **Validates: Requirement 10.3**
   */
  it('Property 18.6: PR本文にはAgentCompanyフッターが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(overviewArb, changesArb, ticketsArb, async (overview, changes, tickets) => {
        const body = prCreator.generatePRBody({
          overview,
          changes,
          tickets,
        });

        // フッターが含まれること
        expect(body).toContain('AgentCompany');
        expect(body).toContain('automatically created');
      }),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// Property 19: PR Status Update テスト
// =============================================================================

describe('Property 19: PR Status Update', () => {
  let prCreator: PRCreator;
  let mockProcessMonitor: ProcessMonitor;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(TEST_RUNS_DIR, `test-status-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    mockProcessMonitor = new ProcessMonitor(tempDir);
    vi.spyOn(mockProcessMonitor, 'execute');

    prCreator = new PRCreator(mockProcessMonitor, tempDir);
    prCreator.setRunId(TEST_RUN_ID);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
    vi.restoreAllMocks();
  });

  /**
   * Property 19.1: PRステータス取得（open）
   * オープン状態のPRのステータスが正しく取得される
   *
   * **Validates: Requirement 10.5**
   */
  it('Property 19.1: オープン状態のPRステータスが正しく取得される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult('gh version 2.0.0')) // gh --version
      .mockResolvedValueOnce(successResult('OPEN')); // gh pr view

    const status = await prCreator.getPRStatus('123');

    expect(status).toBe('open');
  });

  /**
   * Property 19.2: PRステータス取得（merged）
   * マージ済みのPRのステータスが正しく取得される
   *
   * **Validates: Requirement 10.5**
   */
  it('Property 19.2: マージ済みのPRステータスが正しく取得される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult('gh version 2.0.0')) // gh --version
      .mockResolvedValueOnce(successResult('MERGED')); // gh pr view

    const status = await prCreator.getPRStatus('123');

    expect(status).toBe('merged');
  });

  /**
   * Property 19.3: PRステータス取得（closed）
   * クローズ済みのPRのステータスが正しく取得される
   *
   * **Validates: Requirement 10.5**
   */
  it('Property 19.3: クローズ済みのPRステータスが正しく取得される', async () => {
    vi.mocked(mockProcessMonitor.execute)
      .mockResolvedValueOnce(successResult('gh version 2.0.0')) // gh --version
      .mockResolvedValueOnce(successResult('CLOSED')); // gh pr view

    const status = await prCreator.getPRStatus('123');

    expect(status).toBe('closed');
  });

  /**
   * Property 19.4: GitHub CLI利用不可時のステータス
   * GitHub CLIが利用できない場合、unknownが返される
   *
   * **Validates: Requirement 10.5**
   */
  it('Property 19.4: GitHub CLI利用不可時はunknownが返される', async () => {
    vi.mocked(mockProcessMonitor.execute).mockResolvedValueOnce(failureResult('gh not found')); // gh --version

    const status = await prCreator.getPRStatus('123');

    expect(status).toBe('unknown');
  });
});

// =============================================================================
// 親チケットからのPR本文生成テスト
// =============================================================================

describe('PR Body Generation from Parent Ticket', () => {
  let prCreator: PRCreator;

  beforeEach(() => {
    prCreator = new PRCreator();
  });

  /**
   * 親チケットからPR本文が正しく生成される
   */
  it('親チケットからPR本文が正しく生成される', async () => {
    await fc.assert(
      fc.asyncProperty(parentTicketArb, testResultsArb, async (parentTicket, testResults) => {
        const body = prCreator.generatePRBodyFromTicket(parentTicket, testResults);

        // 概要セクションに指示が含まれること
        expect(body).toContain('## Overview');
        expect(body).toContain(parentTicket.instruction);

        // 関連チケットセクションに親チケットIDが含まれること
        expect(body).toContain('## Related Tickets');
        expect(body).toContain(parentTicket.id);

        // 子チケットがある場合は変更一覧に含まれること
        if (parentTicket.childTickets.length > 0) {
          expect(body).toContain('## Changes');
          for (const child of parentTicket.childTickets) {
            expect(body).toContain(child.title);
          }
        }
      }),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// エッジケーステスト
// =============================================================================

describe('PR Creator Edge Cases', () => {
  let prCreator: PRCreator;

  beforeEach(() => {
    prCreator = new PRCreator();
  });

  /**
   * 空のサマリーでもPRタイトルが生成される
   */
  it('空のサマリーでもPRタイトルが生成される', () => {
    const title = prCreator.generatePRTitle('');
    expect(title).toBe('[AgentCompany] ');
  });

  /**
   * 空の変更一覧でもPR本文が生成される
   */
  it('空の変更一覧でもPR本文が生成される', () => {
    const body = prCreator.generatePRBody({
      overview: 'Test overview',
      changes: [],
      tickets: [],
    });

    expect(body).toContain('## Changes');
    expect(body).toContain('No changes recorded');
  });

  /**
   * 空のチケット一覧でもPR本文が生成される
   */
  it('空のチケット一覧でもPR本文が生成される', () => {
    const body = prCreator.generatePRBody({
      overview: 'Test overview',
      changes: ['Change 1'],
      tickets: [],
    });

    expect(body).toContain('## Related Tickets');
    expect(body).toContain('No related tickets');
  });

  /**
   * 特殊文字を含むサマリーでもPRタイトルが生成される
   */
  it('特殊文字を含むサマリーでもPRタイトルが生成される', () => {
    const specialSummaries = [
      'Fix bug: memory leak!',
      'Add feature (experimental)',
      'Update "quoted" string',
      "Fix 'single' quotes",
    ];

    for (const summary of specialSummaries) {
      const title = prCreator.generatePRTitle(summary);
      expect(title).toBe(`[AgentCompany] ${summary}`);
    }
  });

  /**
   * 追加情報が指定された場合はPR本文に含まれる
   */
  it('追加情報が指定された場合はPR本文に含まれる', () => {
    const body = prCreator.generatePRBody({
      overview: 'Test overview',
      changes: [],
      tickets: [],
      additionalInfo: 'This is additional information.',
    });

    expect(body).toContain('## Additional Information');
    expect(body).toContain('This is additional information.');
  });
});
