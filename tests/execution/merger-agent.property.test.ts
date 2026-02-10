/**
 * Merger Agent プロパティテスト
 *
 * Property 8: Merge Branch Restriction
 * Property 9: Pull Request Creation on Completion
 *
 * @see Requirements: 4.5, 4.6, 4.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// =============================================================================
// モック設定
// =============================================================================

// モック用のGit Manager
const mockGitManager = {
  setRunId: vi.fn(),
  checkout: vi.fn().mockResolvedValue(undefined),
  merge: vi.fn().mockResolvedValue('abc123'),
  getStatus: vi.fn().mockResolvedValue({
    modified: [],
    added: [],
    deleted: [],
    untracked: [],
  }),
};

// モック用のAIアダプタ
const mockAdapter = {
  chat: vi.fn().mockResolvedValue({
    content: 'Auto-generated description',
  }),
};

// fs/promisesをモック
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
}));

// AIアダプタをモック
vi.mock('../../tools/adapters/index', () => ({
  getAdapter: vi.fn(() => mockAdapter),
}));

// Git Managerをモック
vi.mock('../../tools/cli/lib/execution/git-manager', () => ({
  createGitManager: vi.fn(() => mockGitManager),
  GitManager: vi.fn(),
}));

// インポート（モック設定後）
import {
  MergerAgent,
  createMergerAgent,
  MergeRequest,
} from '../../tools/cli/lib/execution/agents/merger';

// =============================================================================
// Arbitrary定義
// =============================================================================

/**
 * 有効なブランチ名を生成
 */
const validBranchNameArb = fc
  .stringOf(
    fc.constantFrom(
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
      'o',
      'p',
      'q',
      'r',
      's',
      't',
      'u',
      'v',
      'w',
      'x',
      'y',
      'z',
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '-',
      '_',
      '/'
    ),
    { minLength: 3, maxLength: 50 }
  )
  .filter((s) => {
    // 保護されたブランチ名を除外
    const lower = s.toLowerCase();
    return lower !== 'main' && lower !== 'master' && !s.startsWith('/') && !s.endsWith('/');
  });

/**
 * 保護されたブランチ名を生成
 */
const protectedBranchArb = fc.constantFrom('main', 'master', 'Main', 'Master', 'MAIN', 'MASTER');

/**
 * 非保護ブランチ名を生成
 */
const nonProtectedBranchArb = fc.constantFrom(
  'develop',
  'staging',
  'release',
  'feature/test',
  'hotfix/fix',
  'dev',
  'qa',
  'uat',
  'integration'
);

/**
 * チケットIDを生成
 */
const ticketIdArb = fc
  .tuple(
    fc.constantFrom('TICKET', 'ISSUE', 'BUG', 'FEAT', 'TASK'),
    fc.integer({ min: 1, max: 9999 })
  )
  .map(([prefix, num]) => `${prefix}-${num.toString().padStart(4, '0')}`);

/**
 * 実行IDを生成
 */
const runIdArb = fc
  .tuple(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
    fc.hexaString({ minLength: 4, maxLength: 4 })
  )
  .map(([date, suffix]) => {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '-');
    return `${dateStr}-${suffix}`;
  });

// =============================================================================
// Property 8: Merge Branch Restriction
// =============================================================================

describe('Property 8: Merge Branch Restriction', () => {
  let merger: MergerAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitManager.merge.mockResolvedValue('abc123');
    merger = createMergerAgent({
      agentId: 'merger-property-001',
      integrationBranch: 'develop',
    });
  });

  it('保護されたブランチへの直接マージは常に拒否される', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        protectedBranchArb,
        ticketIdArb,
        runIdArb,
        async (sourceBranch, targetBranch, ticketId, runId) => {
          const request: MergeRequest = {
            runId,
            sourceBranch,
            targetBranch,
            ticketId,
          };

          const result = await merger.merge(request);

          // 保護されたブランチへのマージは常に失敗する
          expect(result.success).toBe(false);
          expect(result.error).toContain('直接マージ禁止');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('非保護ブランチへのマージは許可される', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        nonProtectedBranchArb,
        ticketIdArb,
        runIdArb,
        async (sourceBranch, targetBranch, ticketId, runId) => {
          const request: MergeRequest = {
            runId,
            sourceBranch,
            targetBranch,
            ticketId,
          };

          const result = await merger.merge(request);

          // 非保護ブランチへのマージは成功する
          expect(result.success).toBe(true);
          expect(result.targetBranch).toBe(targetBranch);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ターゲットブランチ省略時は統合ブランチにマージされる', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        ticketIdArb,
        runIdArb,
        async (sourceBranch, ticketId, runId) => {
          const request: MergeRequest = {
            runId,
            sourceBranch,
            ticketId,
            // targetBranchを省略
          };

          const result = await merger.merge(request);

          // 統合ブランチ（develop）にマージされる
          expect(result.success).toBe(true);
          expect(result.targetBranch).toBe('develop');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('マージ結果には必ずソースとターゲットブランチが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        fc.oneof(protectedBranchArb, nonProtectedBranchArb),
        ticketIdArb,
        runIdArb,
        async (sourceBranch, targetBranch, ticketId, runId) => {
          const request: MergeRequest = {
            runId,
            sourceBranch,
            targetBranch,
            ticketId,
          };

          const result = await merger.merge(request);

          // 成功・失敗に関わらずブランチ情報が含まれる
          expect(result.sourceBranch).toBe(sourceBranch);
          expect(result.targetBranch).toBe(targetBranch);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 9: Pull Request Creation on Completion
// =============================================================================

describe('Property 9: Pull Request Creation on Completion', () => {
  let merger: MergerAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitManager.merge.mockResolvedValue('abc123');
    merger = createMergerAgent({
      agentId: 'merger-property-002',
      integrationBranch: 'develop',
    });
  });

  it('PRは任意のターゲットブランチに作成できる', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        fc.oneof(protectedBranchArb, nonProtectedBranchArb),
        ticketIdArb,
        runIdArb,
        fc.string({ minLength: 5, maxLength: 100 }),
        async (sourceBranch, targetBranch, ticketId, runId, title) => {
          const pr = await merger.createPullRequest({
            runId,
            sourceBranch,
            targetBranch,
            ticketId,
            title,
          });

          // PRは作成される（直接マージとは異なり、PRは保護ブランチにも作成可能）
          expect(pr).toBeDefined();
          expect(pr.id).toBeDefined();
          expect(pr.sourceBranch).toBe(sourceBranch);
          expect(pr.targetBranch).toBe(targetBranch);
          expect(pr.status).toBe('open');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PRは承認前にマージできない', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        ticketIdArb,
        runIdArb,
        fc.string({ minLength: 5, maxLength: 100 }),
        async (sourceBranch, ticketId, runId, title) => {
          // PRを作成（承認しない）
          const pr = await merger.createPullRequest({
            runId,
            sourceBranch,
            targetBranch: 'main',
            ticketId,
            title,
          });

          // 未承認でマージ試行
          const result = await merger.mergePullRequest(pr.id, runId);

          // マージは失敗する
          expect(result.success).toBe(false);
          expect(result.error).toContain('承認されていません');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PRは承認後にマージできる', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        ticketIdArb,
        runIdArb,
        fc.string({ minLength: 5, maxLength: 100 }),
        async (sourceBranch, ticketId, runId, title) => {
          // PRを作成
          const pr = await merger.createPullRequest({
            runId,
            sourceBranch,
            targetBranch: 'main',
            ticketId,
            title,
          });

          // PRを承認
          await merger.approvePullRequest(pr.id, runId);

          // マージ試行
          const result = await merger.mergePullRequest(pr.id, runId);

          // マージは成功する
          expect(result.success).toBe(true);
          expect(result.commitHash).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PRマージ後はステータスがmergedになる', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        ticketIdArb,
        runIdArb,
        fc.string({ minLength: 5, maxLength: 100 }),
        async (sourceBranch, ticketId, runId, title) => {
          // PRを作成して承認
          const pr = await merger.createPullRequest({
            runId,
            sourceBranch,
            targetBranch: 'main',
            ticketId,
            title,
          });
          await merger.approvePullRequest(pr.id, runId);

          // マージ
          await merger.mergePullRequest(pr.id, runId);

          // ステータスを確認
          const updatedPr = merger.getPullRequest(pr.id);
          expect(updatedPr?.status).toBe('merged');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PRには必須フィールドが全て含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        ticketIdArb,
        runIdArb,
        fc.string({ minLength: 5, maxLength: 100 }),
        async (sourceBranch, ticketId, runId, title) => {
          const pr = await merger.createPullRequest({
            runId,
            sourceBranch,
            ticketId,
            title,
          });

          // 必須フィールドの存在確認
          expect(pr.id).toBeDefined();
          expect(pr.title).toBe(title);
          expect(pr.sourceBranch).toBe(sourceBranch);
          expect(pr.targetBranch).toBeDefined();
          expect(pr.ticketId).toBe(ticketId);
          expect(pr.createdAt).toBeDefined();
          expect(pr.status).toBeDefined();
          expect(pr.changedFiles).toBeDefined();
          expect(pr.commitCount).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PR IDは一意である', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(validBranchNameArb, ticketIdArb, fc.string({ minLength: 5, maxLength: 50 })),
          { minLength: 2, maxLength: 10 }
        ),
        runIdArb,
        async (prInputs, runId) => {
          const prIds = new Set<string>();

          for (const [sourceBranch, ticketId, title] of prInputs) {
            const pr = await merger.createPullRequest({
              runId,
              sourceBranch,
              ticketId,
              title,
            });

            // IDが重複していないことを確認
            expect(prIds.has(pr.id)).toBe(false);
            prIds.add(pr.id);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// 追加のプロパティテスト
// =============================================================================

describe('追加のマージプロパティ', () => {
  let merger: MergerAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitManager.merge.mockResolvedValue('abc123');
    merger = createMergerAgent({
      agentId: 'merger-property-003',
      integrationBranch: 'develop',
    });
  });

  it('マージ結果のmergeMethodは有効な値のみ', async () => {
    const validMethods = ['fast-forward', 'merge-commit', 'squash'];

    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        nonProtectedBranchArb,
        ticketIdArb,
        runIdArb,
        async (sourceBranch, targetBranch, ticketId, runId) => {
          const result = await merger.merge({
            runId,
            sourceBranch,
            targetBranch,
            ticketId,
          });

          expect(validMethods).toContain(result.mergeMethod);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('hadConflictsはboolean型である', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        nonProtectedBranchArb,
        ticketIdArb,
        runIdArb,
        async (sourceBranch, targetBranch, ticketId, runId) => {
          const result = await merger.merge({
            runId,
            sourceBranch,
            targetBranch,
            ticketId,
          });

          expect(typeof result.hadConflicts).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('成功時はcommitHashが存在し、失敗時はerrorが存在する', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBranchNameArb,
        fc.oneof(protectedBranchArb, nonProtectedBranchArb),
        ticketIdArb,
        runIdArb,
        async (sourceBranch, targetBranch, ticketId, runId) => {
          const result = await merger.merge({
            runId,
            sourceBranch,
            targetBranch,
            ticketId,
          });

          if (result.success) {
            expect(result.commitHash).toBeDefined();
          } else {
            expect(result.error).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
