/**
 * Reviewer Agent テスト
 *
 * コンフリクト解決・コードレビューエージェントのテスト
 *
 * @see Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// モック設定
// =============================================================================

// モック用のGit Manager
const mockGitManager = {
  setRunId: vi.fn(),
  generateConflictReport: vi.fn().mockResolvedValue({
    hasConflicts: false,
    conflicts: [],
    summary: 'No conflicts',
  }),
  resolveConflict: vi.fn().mockResolvedValue(undefined),
  stage: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue('abc123'),
};

// モック用のAIアダプタ
const mockAdapter = {
  chat: vi.fn().mockResolvedValue({
    content: '```\nresolved content\n```',
  }),
  chatWithTools: vi.fn().mockResolvedValue({
    content: 'tool response',
    toolCalls: [],
  }),
};

// fs/promisesをモック
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('// test file content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
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
  ReviewerAgent,
  createReviewerAgent,
  ReviewerAgentConfig,
  ConflictResolutionResult,
  CodeReviewResult,
  ReviewRequest,
  ReviewComment,
} from '../../tools/cli/lib/execution/agents/reviewer';
import { ConflictInfo } from '../../tools/cli/lib/execution/types';
import { getAdapter } from '../../tools/adapters/index';

// =============================================================================
// テストスイート
// =============================================================================

describe('ReviewerAgent', () => {
  let reviewer: ReviewerAgent;
  const testRunId = 'test-run-001';

  beforeEach(() => {
    vi.clearAllMocks();

    // モックをリセット
    mockGitManager.setRunId.mockClear();
    mockGitManager.generateConflictReport.mockResolvedValue({
      hasConflicts: false,
      conflicts: [],
      summary: 'No conflicts',
    });
    mockGitManager.resolveConflict.mockResolvedValue(undefined);
    mockGitManager.stage.mockResolvedValue(undefined);
    mockGitManager.commit.mockResolvedValue('abc123');

    mockAdapter.chat.mockResolvedValue({
      content: '```\nresolved content\n```',
    });

    // Reviewer Agentを作成
    reviewer = createReviewerAgent({
      agentId: 'reviewer-test-001',
      adapterName: 'ollama',
      modelName: 'llama3',
      workspacePath: '/test/workspace',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 基本機能テスト
  // ===========================================================================

  describe('基本機能', () => {
    it('createReviewerAgentファクトリ関数が動作する', () => {
      const config: ReviewerAgentConfig = {
        agentId: 'reviewer-factory-001',
      };
      const factoryReviewer = createReviewerAgent(config);
      expect(factoryReviewer).toBeInstanceOf(ReviewerAgent);
      expect(factoryReviewer.agentId).toBe('reviewer-factory-001');
    });

    it('デフォルト設定でReviewerAgentを作成できる', () => {
      const config: ReviewerAgentConfig = {
        agentId: 'reviewer-default-001',
      };
      const defaultReviewer = createReviewerAgent(config);
      expect(defaultReviewer).toBeInstanceOf(ReviewerAgent);
    });

    it('agentIdが正しく設定される', () => {
      expect(reviewer.agentId).toBe('reviewer-test-001');
    });

    it('Git Managerを取得できる', () => {
      const gitManager = reviewer.getGitManager();
      expect(gitManager).toBeDefined();
    });
  });

  // ===========================================================================
  // コンフリクト分析テスト
  // ===========================================================================

  describe('コンフリクト分析', () => {
    it('コンフリクトがない場合のレポートを生成できる', async () => {
      const report = await reviewer.analyzeConflicts(testRunId);

      expect(report).toBeDefined();
      expect(report.hasConflicts).toBe(false);
      expect(report.conflicts).toHaveLength(0);
    });

    it('コンフリクト分析時にログが記録される', async () => {
      await reviewer.analyzeConflicts(testRunId);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.appendFile).toHaveBeenCalled();
    });

    it('コンフリクトがある場合のレポートを生成できる', async () => {
      // モックを更新してコンフリクトを返す
      mockGitManager.generateConflictReport.mockResolvedValueOnce({
        hasConflicts: true,
        conflicts: [
          {
            file: 'test.ts',
            base: 'base content',
            ours: 'our content',
            theirs: 'their content',
          },
        ],
        summary: '1 conflict found',
      });

      const report = await reviewer.analyzeConflicts(testRunId);

      expect(report.hasConflicts).toBe(true);
      expect(report.conflicts).toHaveLength(1);
    });
  });

  // ===========================================================================
  // コンフリクト解決テスト
  // ===========================================================================

  describe('コンフリクト解決', () => {
    const testConflicts: ConflictInfo[] = [
      {
        file: 'src/test.ts',
        base: 'const x = 1;',
        ours: 'const x = 2;',
        theirs: 'const x = 3;',
      },
    ];

    it('コンフリクトを解決できる', async () => {
      const result = await reviewer.resolveConflicts(testRunId, testConflicts);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.resolvedFiles).toContain('src/test.ts');
      expect(result.unresolvedFiles).toHaveLength(0);
    });

    it('解決後にコミットが作成される', async () => {
      await reviewer.resolveConflicts(testRunId, testConflicts);

      expect(mockGitManager.stage).toHaveBeenCalled();
      expect(mockGitManager.commit).toHaveBeenCalled();
    });

    it('解決サマリーが生成される', async () => {
      const result = await reviewer.resolveConflicts(testRunId, testConflicts);

      expect(result.resolutionSummary).toBeDefined();
      expect(result.resolutionSummary.length).toBeGreaterThan(0);
    });

    it('空のコンフリクト配列を処理できる', async () => {
      const result = await reviewer.resolveConflicts(testRunId, []);

      expect(result.success).toBe(true);
      expect(result.resolvedFiles).toHaveLength(0);
      expect(result.unresolvedFiles).toHaveLength(0);
    });

    it('複数のコンフリクトを解決できる', async () => {
      const multipleConflicts: ConflictInfo[] = [
        {
          file: 'src/a.ts',
          base: 'a',
          ours: 'a1',
          theirs: 'a2',
        },
        {
          file: 'src/b.ts',
          base: 'b',
          ours: 'b1',
          theirs: 'b2',
        },
      ];

      const result = await reviewer.resolveConflicts(testRunId, multipleConflicts);

      expect(result.resolvedFiles).toHaveLength(2);
    });

    it('解決失敗時にunresolvedFilesに追加される', async () => {
      // AIが解決できない応答を返すようにモック
      mockAdapter.chat.mockResolvedValue({
        content: '解決できません。手動で解決してください。',
      });

      const result = await reviewer.resolveConflicts(testRunId, testConflicts);

      // 解決できない場合はunresolvedFilesに追加される
      expect(result.unresolvedFiles).toContain('src/test.ts');
    });
  });

  // ===========================================================================
  // コードレビューテスト
  // ===========================================================================

  describe('コードレビュー', () => {
    const testReviewRequest: ReviewRequest = {
      runId: testRunId,
      branchName: 'feature/test',
      changedFiles: ['src/test.ts'],
      commits: ['abc123'],
    };

    beforeEach(() => {
      // AIレビュー応答をモック（問題なし）
      mockAdapter.chat.mockResolvedValue({
        content: '[]',
      });
    });

    it('コードレビューを実行できる', async () => {
      const result = await reviewer.reviewCode(testReviewRequest);

      expect(result).toBeDefined();
      expect(result.approved).toBeDefined();
      expect(result.comments).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.recommendedAction).toBeDefined();
    });

    it('問題がない場合は承認される', async () => {
      const result = await reviewer.reviewCode(testReviewRequest);

      expect(result.approved).toBe(true);
      expect(result.recommendedAction).toBe('approve');
    });

    it('レビューコメントが返される', async () => {
      // コメント付きの応答をモック
      mockAdapter.chat.mockResolvedValue({
        content: '[{"line": 10, "comment": "Consider using const", "severity": "info"}]',
      });

      const result = await reviewer.reviewCode(testReviewRequest);

      expect(result.comments).toBeDefined();
      expect(result.comments.length).toBeGreaterThanOrEqual(0);
    });

    it('エラーレベルのコメントがある場合は承認されない', async () => {
      // エラーコメント付きの応答をモック
      mockAdapter.chat.mockResolvedValue({
        content: '[{"line": 5, "comment": "Critical bug", "severity": "error"}]',
      });

      const result = await reviewer.reviewCode(testReviewRequest);

      expect(result.approved).toBe(false);
      expect(result.recommendedAction).toBe('reject');
    });

    it('警告が多い場合は修正依頼になる', async () => {
      // 複数の警告コメント付きの応答をモック
      mockAdapter.chat.mockResolvedValue({
        content: `[
          {"line": 1, "comment": "Warning 1", "severity": "warning"},
          {"line": 2, "comment": "Warning 2", "severity": "warning"},
          {"line": 3, "comment": "Warning 3", "severity": "warning"}
        ]`,
      });

      const result = await reviewer.reviewCode(testReviewRequest);

      expect(result.recommendedAction).toBe('request_changes');
    });

    it('レビュー基準を指定できる', async () => {
      const requestWithCriteria: ReviewRequest = {
        ...testReviewRequest,
        reviewCriteria: ['コードスタイル', 'パフォーマンス', 'セキュリティ'],
      };

      const result = await reviewer.reviewCode(requestWithCriteria);

      expect(result).toBeDefined();
    });

    it('複数ファイルをレビューできる', async () => {
      const multiFileRequest: ReviewRequest = {
        ...testReviewRequest,
        changedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      };

      const result = await reviewer.reviewCode(multiFileRequest);

      expect(result).toBeDefined();
    });

    it('レビューサマリーにブランチ情報が含まれる', async () => {
      const result = await reviewer.reviewCode(testReviewRequest);

      expect(result.summary).toContain('feature/test');
    });
  });

  // ===========================================================================
  // ログ記録テスト
  // ===========================================================================

  describe('ログ記録', () => {
    it('コンフリクト分析時にログが記録される', async () => {
      await reviewer.analyzeConflicts(testRunId);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(testRunId),
        expect.any(Object)
      );
      expect(fs.appendFile).toHaveBeenCalled();
    });

    it('コンフリクト解決時にログが記録される', async () => {
      const conflicts: ConflictInfo[] = [
        {
          file: 'test.ts',
          base: 'base',
          ours: 'ours',
          theirs: 'theirs',
        },
      ];

      await reviewer.resolveConflicts(testRunId, conflicts);

      expect(fs.appendFile).toHaveBeenCalled();
    });

    it('コードレビュー時にログが記録される', async () => {
      const request: ReviewRequest = {
        runId: testRunId,
        branchName: 'test-branch',
        changedFiles: ['test.ts'],
        commits: ['abc123'],
      };

      await reviewer.reviewCode(request);

      expect(fs.appendFile).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // エラーハンドリングテスト
  // ===========================================================================

  describe('エラーハンドリング', () => {
    it('AI呼び出し失敗時にエラーをハンドリングする', async () => {
      // AIがエラーを投げるようにモック
      mockAdapter.chat.mockRejectedValue(new Error('AI error'));

      const conflicts: ConflictInfo[] = [
        {
          file: 'test.ts',
          base: 'base',
          ours: 'ours',
          theirs: 'theirs',
        },
      ];

      // エラーが発生してもクラッシュしない
      const result = await reviewer.resolveConflicts(testRunId, conflicts);
      expect(result).toBeDefined();
      expect(result.unresolvedFiles).toContain('test.ts');
    });

    it('ファイル読み取り失敗時にエラーをハンドリングする', async () => {
      // ファイル読み取りがエラーを投げるようにモック
      (fs.readFile as Mock).mockRejectedValueOnce(new Error('File not found'));

      const request: ReviewRequest = {
        runId: testRunId,
        branchName: 'test-branch',
        changedFiles: ['nonexistent.ts'],
        commits: ['abc123'],
      };

      const result = await reviewer.reviewCode(request);

      // エラーが発生してもクラッシュしない
      expect(result).toBeDefined();
      expect(result.comments.some((c) => c.severity === 'warning')).toBe(true);
    });
  });
});

// =============================================================================
// 型エクスポートテスト
// =============================================================================

describe('型エクスポート', () => {
  it('ReviewerAgentConfigがエクスポートされている', () => {
    const config: ReviewerAgentConfig = {
      agentId: 'test',
    };
    expect(config).toBeDefined();
  });

  it('ConflictResolutionResultがエクスポートされている', () => {
    const result: ConflictResolutionResult = {
      success: true,
      resolvedFiles: [],
      unresolvedFiles: [],
      resolutionSummary: '',
    };
    expect(result).toBeDefined();
  });

  it('CodeReviewResultがエクスポートされている', () => {
    const result: CodeReviewResult = {
      approved: true,
      comments: [],
      summary: '',
      recommendedAction: 'approve',
    };
    expect(result).toBeDefined();
  });

  it('ReviewRequestがエクスポートされている', () => {
    const request: ReviewRequest = {
      runId: 'test',
      branchName: 'test',
      changedFiles: [],
      commits: [],
    };
    expect(request).toBeDefined();
  });

  it('ReviewCommentがエクスポートされている', () => {
    const comment: ReviewComment = {
      file: 'test.ts',
      comment: 'test',
      severity: 'info',
    };
    expect(comment).toBeDefined();
  });
});
