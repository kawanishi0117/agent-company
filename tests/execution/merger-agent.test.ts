/**
 * Merger Agent テスト
 *
 * ブランチマージ・PR作成エージェントのテスト
 *
 * @see Requirements: 4.5, 4.6, 4.7, 4.8, 4.9
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';

// =============================================================================
// モック設定
// =============================================================================

// モック用のGit Manager
const mockGitManager = {
  setRunId: vi.fn(),
  checkout: vi.fn().mockResolvedValue(undefined),
  merge: vi.fn().mockResolvedValue('abc123'),
  getStatus: vi.fn().mockResolvedValue({
    modified: ['src/test.ts'],
    added: ['src/new.ts'],
    deleted: [],
    untracked: [],
  }),
};

// モック用のAIアダプタ
const mockAdapter = {
  chat: vi.fn().mockResolvedValue({
    content: 'PR説明文を自動生成しました。',
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
  MergerAgentConfig,
  MergeRequest,
  MergeResult,
  PullRequestInfo,
  CreatePullRequestRequest,
} from '../../tools/cli/lib/execution/agents/merger';

// =============================================================================
// テストスイート
// =============================================================================

describe('MergerAgent', () => {
  let merger: MergerAgent;
  const testRunId = 'test-run-001';

  beforeEach(() => {
    vi.clearAllMocks();

    // モックをリセット
    mockGitManager.setRunId.mockClear();
    mockGitManager.checkout.mockResolvedValue(undefined);
    mockGitManager.merge.mockResolvedValue('abc123');
    mockGitManager.getStatus.mockResolvedValue({
      modified: ['src/test.ts'],
      added: ['src/new.ts'],
      deleted: [],
      untracked: [],
    });

    mockAdapter.chat.mockResolvedValue({
      content: 'PR説明文を自動生成しました。',
    });

    // Merger Agentを作成
    merger = createMergerAgent({
      agentId: 'merger-test-001',
      adapterName: 'ollama',
      modelName: 'llama3',
      workspacePath: '/test/workspace',
      integrationBranch: 'develop',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 基本機能テスト
  // ===========================================================================

  describe('基本機能', () => {
    it('createMergerAgentファクトリ関数が動作する', () => {
      const config: MergerAgentConfig = {
        agentId: 'merger-factory-001',
      };
      const factoryMerger = createMergerAgent(config);
      expect(factoryMerger).toBeInstanceOf(MergerAgent);
      expect(factoryMerger.agentId).toBe('merger-factory-001');
    });

    it('デフォルト設定でMergerAgentを作成できる', () => {
      const config: MergerAgentConfig = {
        agentId: 'merger-default-001',
      };
      const defaultMerger = createMergerAgent(config);
      expect(defaultMerger).toBeInstanceOf(MergerAgent);
      expect(defaultMerger.getIntegrationBranch()).toBe('develop');
    });

    it('agentIdが正しく設定される', () => {
      expect(merger.agentId).toBe('merger-test-001');
    });

    it('Git Managerを取得できる', () => {
      const gitManager = merger.getGitManager();
      expect(gitManager).toBeDefined();
    });

    it('統合ブランチ名を取得できる', () => {
      expect(merger.getIntegrationBranch()).toBe('develop');
    });

    it('カスタム統合ブランチを設定できる', () => {
      const customMerger = createMergerAgent({
        agentId: 'merger-custom-001',
        integrationBranch: 'staging',
      });
      expect(customMerger.getIntegrationBranch()).toBe('staging');
    });
  });

  // ===========================================================================
  // マージ操作テスト
  // ===========================================================================

  describe('マージ操作', () => {
    it('統合ブランチにマージできる', async () => {
      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'develop',
        ticketId: 'TICKET-001',
      };

      const result = await merger.merge(request);

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123');
      expect(result.sourceBranch).toBe('feature/test');
      expect(result.targetBranch).toBe('develop');
    });

    it('mainブランチへの直接マージは拒否される', async () => {
      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'main',
        ticketId: 'TICKET-001',
      };

      const result = await merger.merge(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('直接マージ禁止');
    });

    it('masterブランチへの直接マージは拒否される', async () => {
      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'master',
        ticketId: 'TICKET-001',
      };

      const result = await merger.merge(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('直接マージ禁止');
    });

    it('ターゲットブランチ省略時は統合ブランチにマージされる', async () => {
      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        ticketId: 'TICKET-001',
      };

      const result = await merger.merge(request);

      expect(result.success).toBe(true);
      expect(result.targetBranch).toBe('develop');
    });

    it('mergeToIntegrationで統合ブランチにマージできる', async () => {
      const result = await merger.mergeToIntegration(testRunId, 'feature/test', 'TICKET-001');

      expect(result.success).toBe(true);
      expect(result.targetBranch).toBe('develop');
    });

    it('マージ時にログが記録される', async () => {
      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'develop',
        ticketId: 'TICKET-001',
      };

      await merger.merge(request);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.appendFile).toHaveBeenCalled();
    });

    it('マージ失敗時にエラーが返される', async () => {
      mockGitManager.merge.mockRejectedValueOnce(new Error('Merge conflict'));

      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'develop',
        ticketId: 'TICKET-001',
      };

      const result = await merger.merge(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Merge conflict');
    });

    it('コンフリクト検出時にhadConflictsがtrueになる', async () => {
      mockGitManager.merge.mockRejectedValueOnce(new Error('CONFLICT in file.ts'));

      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'develop',
        ticketId: 'TICKET-001',
      };

      const result = await merger.merge(request);

      expect(result.success).toBe(false);
      expect(result.hadConflicts).toBe(true);
    });

    it('カスタムマージメッセージを指定できる', async () => {
      const request: MergeRequest = {
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'develop',
        ticketId: 'TICKET-001',
        message: 'Custom merge message',
      };

      await merger.merge(request);

      expect(mockGitManager.merge).toHaveBeenCalledWith('feature/test', 'Custom merge message');
    });
  });

  // ===========================================================================
  // Pull Request操作テスト
  // ===========================================================================

  describe('Pull Request操作', () => {
    it('Pull Requestを作成できる', async () => {
      const request: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        targetBranch: 'main',
        ticketId: 'TICKET-001',
        title: 'Feature: Add new functionality',
      };

      const pr = await merger.createPullRequest(request);

      expect(pr).toBeDefined();
      expect(pr.id).toBeDefined();
      expect(pr.title).toBe('Feature: Add new functionality');
      expect(pr.sourceBranch).toBe('develop');
      expect(pr.targetBranch).toBe('main');
      expect(pr.status).toBe('open');
    });

    it('PR作成時にファイルが保存される', async () => {
      const request: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
      };

      await merger.createPullRequest(request);

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('PR作成時にログが記録される', async () => {
      const request: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
      };

      await merger.createPullRequest(request);

      expect(fs.appendFile).toHaveBeenCalled();
    });

    it('ターゲットブランチ省略時はmainになる', async () => {
      const request: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
      };

      const pr = await merger.createPullRequest(request);

      expect(pr.targetBranch).toBe('main');
    });

    it('PR説明を自動生成できる', async () => {
      const request: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
      };

      const pr = await merger.createPullRequest(request);

      expect(pr.description).toBeDefined();
    });

    it('カスタムPR説明を指定できる', async () => {
      const request: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
        description: 'Custom description',
      };

      const pr = await merger.createPullRequest(request);

      expect(pr.description).toBe('Custom description');
    });

    it('PRを承認できる', async () => {
      // PRを作成
      const createRequest: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
      };
      const pr = await merger.createPullRequest(createRequest);

      // PRを承認
      const approvedPr = await merger.approvePullRequest(pr.id, testRunId);

      expect(approvedPr).toBeDefined();
      expect(approvedPr?.status).toBe('approved');
    });

    it('存在しないPRの承認はnullを返す', async () => {
      const result = await merger.approvePullRequest('nonexistent', testRunId);
      expect(result).toBeNull();
    });

    it('承認済みPRをマージできる', async () => {
      // PRを作成して承認
      const createRequest: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
      };
      const pr = await merger.createPullRequest(createRequest);
      await merger.approvePullRequest(pr.id, testRunId);

      // PRをマージ
      const result = await merger.mergePullRequest(pr.id, testRunId);

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123');
    });

    it('未承認PRのマージは拒否される', async () => {
      // PRを作成（承認しない）
      const createRequest: CreatePullRequestRequest = {
        runId: testRunId,
        sourceBranch: 'develop',
        ticketId: 'TICKET-001',
        title: 'Test PR',
      };
      const pr = await merger.createPullRequest(createRequest);

      // PRをマージ試行
      const result = await merger.mergePullRequest(pr.id, testRunId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('承認されていません');
    });

    it('存在しないPRのマージはエラーを返す', async () => {
      const result = await merger.mergePullRequest('nonexistent', testRunId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PR not found');
    });

    it('PR一覧を取得できる', async () => {
      // 複数のPRを作成
      await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'feature/a',
        ticketId: 'TICKET-001',
        title: 'PR A',
      });
      await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'feature/b',
        ticketId: 'TICKET-002',
        title: 'PR B',
      });

      const prs = merger.getPullRequests();

      expect(prs).toHaveLength(2);
    });

    it('ステータスでPRをフィルタできる', async () => {
      // PRを作成
      const pr1 = await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'feature/a',
        ticketId: 'TICKET-001',
        title: 'PR A',
      });
      await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'feature/b',
        ticketId: 'TICKET-002',
        title: 'PR B',
      });

      // 1つを承認
      await merger.approvePullRequest(pr1.id, testRunId);

      const openPrs = merger.getPullRequests('open');
      const approvedPrs = merger.getPullRequests('approved');

      expect(openPrs).toHaveLength(1);
      expect(approvedPrs).toHaveLength(1);
    });

    it('IDでPRを取得できる', async () => {
      const created = await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'feature/a',
        ticketId: 'TICKET-001',
        title: 'PR A',
      });

      const pr = merger.getPullRequest(created.id);

      expect(pr).toBeDefined();
      expect(pr?.id).toBe(created.id);
    });

    it('存在しないIDはundefinedを返す', () => {
      const pr = merger.getPullRequest('nonexistent');
      expect(pr).toBeUndefined();
    });
  });

  // ===========================================================================
  // Property 8: Merge Branch Restriction テスト
  // ===========================================================================

  describe('Property 8: Merge Branch Restriction', () => {
    it('mainへの直接マージは常に拒否される', async () => {
      const result = await merger.merge({
        runId: testRunId,
        sourceBranch: 'any-branch',
        targetBranch: 'main',
        ticketId: 'TICKET-001',
      });

      expect(result.success).toBe(false);
    });

    it('masterへの直接マージは常に拒否される', async () => {
      const result = await merger.merge({
        runId: testRunId,
        sourceBranch: 'any-branch',
        targetBranch: 'master',
        ticketId: 'TICKET-001',
      });

      expect(result.success).toBe(false);
    });

    it('統合ブランチへのマージは許可される', async () => {
      const result = await merger.merge({
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'develop',
        ticketId: 'TICKET-001',
      });

      expect(result.success).toBe(true);
    });

    it('stagingブランチへのマージは許可される', async () => {
      const result = await merger.merge({
        runId: testRunId,
        sourceBranch: 'feature/test',
        targetBranch: 'staging',
        ticketId: 'TICKET-001',
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Property 9: Pull Request Creation on Completion テスト
  // ===========================================================================

  describe('Property 9: Pull Request Creation on Completion', () => {
    it('PRはmainブランチをターゲットにできる', async () => {
      const pr = await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'develop',
        targetBranch: 'main',
        ticketId: 'TICKET-001',
        title: 'Release PR',
      });

      expect(pr.targetBranch).toBe('main');
    });

    it('PRは承認後にのみマージ可能', async () => {
      const pr = await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'develop',
        targetBranch: 'main',
        ticketId: 'TICKET-001',
        title: 'Release PR',
      });

      // 未承認でマージ試行
      const result1 = await merger.mergePullRequest(pr.id, testRunId);
      expect(result1.success).toBe(false);

      // 承認後にマージ
      await merger.approvePullRequest(pr.id, testRunId);
      const result2 = await merger.mergePullRequest(pr.id, testRunId);
      expect(result2.success).toBe(true);
    });

    it('PRマージ後はステータスがmergedになる', async () => {
      const pr = await merger.createPullRequest({
        runId: testRunId,
        sourceBranch: 'develop',
        targetBranch: 'main',
        ticketId: 'TICKET-001',
        title: 'Release PR',
      });

      await merger.approvePullRequest(pr.id, testRunId);
      await merger.mergePullRequest(pr.id, testRunId);

      const updatedPr = merger.getPullRequest(pr.id);
      expect(updatedPr?.status).toBe('merged');
    });
  });
});

// =============================================================================
// 型エクスポートテスト
// =============================================================================

describe('型エクスポート', () => {
  it('MergerAgentConfigがエクスポートされている', () => {
    const config: MergerAgentConfig = {
      agentId: 'test',
    };
    expect(config).toBeDefined();
  });

  it('MergeRequestがエクスポートされている', () => {
    const request: MergeRequest = {
      runId: 'test',
      sourceBranch: 'feature',
      ticketId: 'TICKET-001',
    };
    expect(request).toBeDefined();
  });

  it('MergeResultがエクスポートされている', () => {
    const result: MergeResult = {
      success: true,
      sourceBranch: 'feature',
      targetBranch: 'develop',
      mergeMethod: 'merge-commit',
      hadConflicts: false,
    };
    expect(result).toBeDefined();
  });

  it('PullRequestInfoがエクスポートされている', () => {
    const pr: PullRequestInfo = {
      id: 'pr-001',
      title: 'Test PR',
      description: 'Description',
      sourceBranch: 'develop',
      targetBranch: 'main',
      ticketId: 'TICKET-001',
      createdAt: new Date().toISOString(),
      status: 'open',
      changedFiles: [],
      commitCount: 1,
    };
    expect(pr).toBeDefined();
  });

  it('CreatePullRequestRequestがエクスポートされている', () => {
    const request: CreatePullRequestRequest = {
      runId: 'test',
      sourceBranch: 'develop',
      ticketId: 'TICKET-001',
      title: 'Test PR',
    };
    expect(request).toBeDefined();
  });
});
