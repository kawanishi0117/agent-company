/**
 * ReviewWorkflow プロパティテスト
 *
 * Property 10: Review Decision Handling
 * - 承認時: マージがトリガーされる
 * - 却下時: ステータスが 'revision_required' に更新され、フィードバックが提供される
 *
 * Property 11: Review Logging
 * - 全てのレビュー決定が `runtime/runs/<run-id>/reviews.log` に記録される
 *
 * **Validates: Requirements 5.3, 5.4, 5.5, 5.6**
 *
 * @module tests/execution/review-workflow.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ReviewWorkflow,
  ReviewRequestOptions,
  createReviewDecision,
  isChecklistPassed,
  getStatusFromReviewResult,
} from '../../tools/cli/lib/execution/review-workflow';
import type {
  ReviewDecision,
  ReviewResult,
  TicketStatus,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

const TEST_RUNS_DIR = 'runtime/runs/test-review-workflow-property';
const TEST_RUN_ID = 'review-workflow-test-run';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/** チケットIDを生成 */
const ticketIdArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
  { minLength: 1, maxLength: 30 }
);

/** ワーカーIDを生成 */
const workerIdArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  { minLength: 1, maxLength: 20 }
);

/** レビュアーIDを生成 */
const reviewerIdArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  { minLength: 1, maxLength: 20 }
);

/** ブランチ名を生成 */
const branchNameArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/'.split('')),
  { minLength: 1, maxLength: 50 }
);

/** 成果物パスを生成 */
const artifactsArb: fc.Arbitrary<string[]> = fc.array(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/.'.split('')), {
    minLength: 1,
    maxLength: 50,
  }),
  { minLength: 0, maxLength: 10 }
);

/** フィードバックを生成 */
const feedbackArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.,!?\n'.split('')
  ),
  { minLength: 0, maxLength: 500 }
);

/** チェックリストを生成 */
const checklistArb: fc.Arbitrary<ReviewDecision['checklist']> = fc.record({
  codeQuality: fc.boolean(),
  testCoverage: fc.boolean(),
  acceptanceCriteria: fc.boolean(),
});

/** レビュー決定を生成 */
const reviewDecisionArb: fc.Arbitrary<ReviewDecision> = fc.record({
  approved: fc.boolean(),
  feedback: fc.option(feedbackArb, { nil: undefined }),
  checklist: checklistArb,
});

/** レビューリクエストオプションを生成 */
const reviewRequestOptionsArb: fc.Arbitrary<ReviewRequestOptions> = fc.record({
  ticketId: ticketIdArb,
  workerId: workerIdArb,
  branch: branchNameArb,
  artifacts: artifactsArb,
  context: fc.option(feedbackArb, { nil: undefined }),
});

// =============================================================================
// Property 10: Review Decision Handling テスト
// =============================================================================

describe('Property 10: Review Decision Handling', () => {
  let reviewWorkflow: ReviewWorkflow;
  let tempDir: string;
  let statusUpdates: Array<{ ticketId: string; status: TicketStatus }>;
  let mergeRequests: Array<{ ticketId: string; branch: string }>;

  beforeEach(async () => {
    tempDir = path.join(TEST_RUNS_DIR, `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    reviewWorkflow = new ReviewWorkflow(tempDir);
    reviewWorkflow.setRunId(TEST_RUN_ID);

    statusUpdates = [];
    mergeRequests = [];

    // ステータス更新コールバックを設定
    reviewWorkflow.setStatusUpdateCallback(async (ticketId, status) => {
      statusUpdates.push({ ticketId, status });
    });

    // マージコールバックを設定
    reviewWorkflow.setMergeCallback(async (ticketId, branch) => {
      mergeRequests.push({ ticketId, branch });
      return { success: true };
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
  });

  /**
   * Property 10.1: 承認時はマージがトリガーされる
   *
   * **Validates: Requirement 5.3**
   */
  it('Property 10.1: 承認時はマージがトリガーされる', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewRequestOptionsArb,
        reviewerIdArb,
        async (requestOptions, reviewerId) => {
          // リセット
          statusUpdates = [];
          mergeRequests = [];
          reviewWorkflow.clearRequests();

          // レビューリクエスト
          await reviewWorkflow.requestReview(requestOptions);

          // 承認レビューを送信
          const decision = createReviewDecision(true, {
            feedback: 'Looks good!',
            codeQuality: true,
            testCoverage: true,
            acceptanceCriteria: true,
          });

          const result = await reviewWorkflow.submitReview({
            ticketId: requestOptions.ticketId,
            reviewerId,
            decision,
          });

          // 検証
          expect(result.success).toBe(true);
          expect(result.status).toBe('approved');
          expect(result.shouldMerge).toBe(true);

          // マージがトリガーされたことを確認
          expect(mergeRequests.length).toBe(1);
          expect(mergeRequests[0].ticketId).toBe(requestOptions.ticketId);
          expect(mergeRequests[0].branch).toBe(requestOptions.branch);

          // ステータスが 'completed' に更新されたことを確認
          const completedUpdate = statusUpdates.find(
            (u) => u.ticketId === requestOptions.ticketId && u.status === 'completed'
          );
          expect(completedUpdate).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10.2: 却下時はステータスが 'revision_required' に更新される
   *
   * **Validates: Requirement 5.4**
   */
  it('Property 10.2: 却下時はステータスが revision_required に更新される', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewRequestOptionsArb,
        reviewerIdArb,
        feedbackArb,
        async (requestOptions, reviewerId, feedback) => {
          // リセット
          statusUpdates = [];
          mergeRequests = [];
          reviewWorkflow.clearRequests();

          // レビューリクエスト
          await reviewWorkflow.requestReview(requestOptions);

          // 却下レビューを送信
          const decision = createReviewDecision(false, {
            feedback,
            codeQuality: false,
            testCoverage: true,
            acceptanceCriteria: false,
          });

          const result = await reviewWorkflow.submitReview({
            ticketId: requestOptions.ticketId,
            reviewerId,
            decision,
          });

          // 検証
          expect(result.success).toBe(true);
          expect(result.status).toBe('rejected');
          expect(result.shouldMerge).toBe(false);
          expect(result.feedback).toBe(feedback);

          // マージがトリガーされていないことを確認
          expect(mergeRequests.length).toBe(0);

          // ステータスが 'revision_required' に更新されたことを確認
          const revisionUpdate = statusUpdates.find(
            (u) => u.ticketId === requestOptions.ticketId && u.status === 'revision_required'
          );
          expect(revisionUpdate).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10.3: レビューリクエストがない場合はエラーが返される
   */
  it('Property 10.3: レビューリクエストがない場合はエラーが返される', async () => {
    await fc.assert(
      fc.asyncProperty(ticketIdArb, reviewerIdArb, async (ticketId, reviewerId) => {
        reviewWorkflow.clearRequests();

        const decision = createReviewDecision(true);
        const result = await reviewWorkflow.submitReview({
          ticketId,
          reviewerId,
          decision,
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe('not_found');
        expect(result.error).toContain('not found');
      }),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// Property 11: Review Logging テスト
// =============================================================================

describe('Property 11: Review Logging', () => {
  let reviewWorkflow: ReviewWorkflow;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(TEST_RUNS_DIR, `test-log-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    reviewWorkflow = new ReviewWorkflow(tempDir);
    reviewWorkflow.setRunId(TEST_RUN_ID);

    // コールバックを設定（ログテストでは実際の処理は不要）
    reviewWorkflow.setStatusUpdateCallback(async () => {});
    reviewWorkflow.setMergeCallback(async () => ({ success: true }));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
  });

  /**
   * Property 11.1: レビューリクエストがログに記録される
   *
   * **Validates: Requirement 5.6**
   */
  it('Property 11.1: レビューリクエストがログに記録される', async () => {
    await fc.assert(
      fc.asyncProperty(reviewRequestOptionsArb, async (requestOptions) => {
        reviewWorkflow.clearRequests();

        // レビューリクエスト
        await reviewWorkflow.requestReview(requestOptions);

        // ログファイルを確認
        const logFile = path.join(tempDir, 'runs', TEST_RUN_ID, 'reviews.log');
        const logContent = await fs.readFile(logFile, 'utf-8');

        // ログにリクエスト情報が含まれることを確認
        expect(logContent).toContain('[REQUEST]');
        expect(logContent).toContain(`ticket=${requestOptions.ticketId}`);
        expect(logContent).toContain(`worker=${requestOptions.workerId}`);
      }),
      { numRuns: 30 }
    );
  });

  /**
   * Property 11.2: 承認レビューがログに記録される
   *
   * **Validates: Requirement 5.6**
   */
  it('Property 11.2: 承認レビューがログに記録される', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewRequestOptionsArb,
        reviewerIdArb,
        async (requestOptions, reviewerId) => {
          reviewWorkflow.clearRequests();

          // レビューリクエスト
          await reviewWorkflow.requestReview(requestOptions);

          // 承認レビューを送信
          const decision = createReviewDecision(true, {
            codeQuality: true,
            testCoverage: true,
            acceptanceCriteria: true,
          });

          await reviewWorkflow.submitReview({
            ticketId: requestOptions.ticketId,
            reviewerId,
            decision,
          });

          // ログファイルを確認
          const logFile = path.join(tempDir, 'runs', TEST_RUN_ID, 'reviews.log');
          const logContent = await fs.readFile(logFile, 'utf-8');

          // ログに承認情報が含まれることを確認
          expect(logContent).toContain('[APPROVE]');
          expect(logContent).toContain(`ticket=${requestOptions.ticketId}`);
          expect(logContent).toContain(`reviewer=${reviewerId}`);
          expect(logContent).toContain('checklist=');
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 11.3: 却下レビューがログに記録される
   *
   * **Validates: Requirement 5.6**
   */
  it('Property 11.3: 却下レビューがログに記録される', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewRequestOptionsArb,
        reviewerIdArb,
        feedbackArb,
        async (requestOptions, reviewerId, feedback) => {
          reviewWorkflow.clearRequests();

          // レビューリクエスト
          await reviewWorkflow.requestReview(requestOptions);

          // 却下レビューを送信
          const decision = createReviewDecision(false, {
            feedback,
            codeQuality: false,
            testCoverage: true,
            acceptanceCriteria: false,
          });

          await reviewWorkflow.submitReview({
            ticketId: requestOptions.ticketId,
            reviewerId,
            decision,
          });

          // ログファイルを確認
          const logFile = path.join(tempDir, 'runs', TEST_RUN_ID, 'reviews.log');
          const logContent = await fs.readFile(logFile, 'utf-8');

          // ログに却下情報が含まれることを確認
          expect(logContent).toContain('[REJECT]');
          expect(logContent).toContain(`ticket=${requestOptions.ticketId}`);
          expect(logContent).toContain(`reviewer=${reviewerId}`);

          // フィードバックがある場合は含まれることを確認
          if (feedback && feedback.length > 0) {
            expect(logContent).toContain('feedback=');
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// ヘルパー関数テスト
// =============================================================================

describe('Review Workflow Helper Functions', () => {
  /**
   * createReviewDecision が正しいオブジェクトを生成する
   */
  it('createReviewDecision が正しいオブジェクトを生成する', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(feedbackArb, { nil: undefined }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (approved, feedback, codeQuality, testCoverage, acceptanceCriteria) => {
          const decision = createReviewDecision(approved, {
            feedback,
            codeQuality,
            testCoverage,
            acceptanceCriteria,
          });

          expect(decision.approved).toBe(approved);
          expect(decision.feedback).toBe(feedback);
          expect(decision.checklist.codeQuality).toBe(codeQuality);
          expect(decision.checklist.testCoverage).toBe(testCoverage);
          expect(decision.checklist.acceptanceCriteria).toBe(acceptanceCriteria);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * isChecklistPassed が正しく判定する
   */
  it('isChecklistPassed が正しく判定する', () => {
    fc.assert(
      fc.property(checklistArb, (checklist) => {
        const result = isChecklistPassed(checklist);
        const expected =
          checklist.codeQuality && checklist.testCoverage && checklist.acceptanceCriteria;

        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * getStatusFromReviewResult が正しいステータスを返す
   */
  it('getStatusFromReviewResult が正しいステータスを返す', () => {
    fc.assert(
      fc.property(fc.boolean(), reviewerIdArb, checklistArb, (approved, reviewerId, checklist) => {
        const result: ReviewResult = {
          reviewerId,
          approved,
          checklist,
          reviewedAt: new Date().toISOString(),
        };

        const status = getStatusFromReviewResult(result);

        if (approved) {
          expect(status).toBe('completed');
        } else {
          expect(status).toBe('revision_required');
        }
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// レビューステータス取得テスト
// =============================================================================

describe('Review Status Retrieval', () => {
  let reviewWorkflow: ReviewWorkflow;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(TEST_RUNS_DIR, `test-status-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    reviewWorkflow = new ReviewWorkflow(tempDir);
    reviewWorkflow.setRunId(TEST_RUN_ID);
    reviewWorkflow.setStatusUpdateCallback(async () => {});
    reviewWorkflow.setMergeCallback(async () => ({ success: true }));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
  });

  /**
   * レビューステータスが正しく取得される
   */
  it('レビューステータスが正しく取得される', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewRequestOptionsArb,
        reviewerIdArb,
        fc.boolean(),
        async (requestOptions, reviewerId, approved) => {
          reviewWorkflow.clearRequests();

          // 初期状態: not_found
          let status = await reviewWorkflow.getReviewStatus(requestOptions.ticketId);
          expect(status).toBe('not_found');

          // リクエスト後: pending
          await reviewWorkflow.requestReview(requestOptions);
          status = await reviewWorkflow.getReviewStatus(requestOptions.ticketId);
          expect(status).toBe('pending');

          // レビュー送信後: approved または rejected
          const decision = createReviewDecision(approved);
          await reviewWorkflow.submitReview({
            ticketId: requestOptions.ticketId,
            reviewerId,
            decision,
          });

          status = await reviewWorkflow.getReviewStatus(requestOptions.ticketId);
          expect(status).toBe(approved ? 'approved' : 'rejected');
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * レビュー結果が正しく取得される
   */
  it('レビュー結果が正しく取得される', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewRequestOptionsArb,
        reviewerIdArb,
        reviewDecisionArb,
        async (requestOptions, reviewerId, decision) => {
          reviewWorkflow.clearRequests();

          // リクエスト前: undefined
          let result = reviewWorkflow.getReviewResult(requestOptions.ticketId);
          expect(result).toBeUndefined();

          // リクエスト後、レビュー前: undefined
          await reviewWorkflow.requestReview(requestOptions);
          result = reviewWorkflow.getReviewResult(requestOptions.ticketId);
          expect(result).toBeUndefined();

          // レビュー送信後: 結果が取得できる
          await reviewWorkflow.submitReview({
            ticketId: requestOptions.ticketId,
            reviewerId,
            decision,
          });

          result = reviewWorkflow.getReviewResult(requestOptions.ticketId);
          expect(result).toBeDefined();
          expect(result?.reviewerId).toBe(reviewerId);
          expect(result?.approved).toBe(decision.approved);
          expect(result?.checklist).toEqual(decision.checklist);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// エッジケーステスト
// =============================================================================

describe('Review Workflow Edge Cases', () => {
  let reviewWorkflow: ReviewWorkflow;

  beforeEach(() => {
    reviewWorkflow = new ReviewWorkflow();
    reviewWorkflow.setRunId(TEST_RUN_ID);
  });

  /**
   * 必須パラメータが欠けている場合はエラーが返される
   */
  it('必須パラメータが欠けている場合はエラーが返される', async () => {
    // ticketIdが空
    let result = await reviewWorkflow.requestReview({
      ticketId: '',
      workerId: 'worker-1',
      branch: 'feature/test',
      artifacts: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('required');

    // workerIdが空
    result = await reviewWorkflow.requestReview({
      ticketId: 'ticket-1',
      workerId: '',
      branch: 'feature/test',
      artifacts: [],
    });
    expect(result.success).toBe(false);

    // branchが空
    result = await reviewWorkflow.requestReview({
      ticketId: 'ticket-1',
      workerId: 'worker-1',
      branch: '',
      artifacts: [],
    });
    expect(result.success).toBe(false);
  });

  /**
   * 同じチケットに対する複数のリクエストは上書きされる
   */
  it('同じチケットに対する複数のリクエストは上書きされる', async () => {
    const ticketId = 'ticket-1';

    // 最初のリクエスト
    await reviewWorkflow.requestReview({
      ticketId,
      workerId: 'worker-1',
      branch: 'branch-1',
      artifacts: ['file1.ts'],
    });

    // 2回目のリクエスト（上書き）
    await reviewWorkflow.requestReview({
      ticketId,
      workerId: 'worker-2',
      branch: 'branch-2',
      artifacts: ['file2.ts'],
    });

    const request = reviewWorkflow.getReviewRequest(ticketId);
    expect(request?.workerId).toBe('worker-2');
    expect(request?.branch).toBe('branch-2');
  });

  /**
   * clearRequests が正しく動作する
   */
  it('clearRequests が正しく動作する', async () => {
    // 複数のリクエストを作成
    await reviewWorkflow.requestReview({
      ticketId: 'ticket-1',
      workerId: 'worker-1',
      branch: 'branch-1',
      artifacts: [],
    });
    await reviewWorkflow.requestReview({
      ticketId: 'ticket-2',
      workerId: 'worker-2',
      branch: 'branch-2',
      artifacts: [],
    });

    expect(reviewWorkflow.getAllRequests().length).toBe(2);

    // 特定のリクエストをクリア
    reviewWorkflow.clearRequests('ticket-1');
    expect(reviewWorkflow.getAllRequests().length).toBe(1);
    expect(reviewWorkflow.getReviewRequest('ticket-1')).toBeUndefined();
    expect(reviewWorkflow.getReviewRequest('ticket-2')).toBeDefined();

    // 全てクリア
    reviewWorkflow.clearRequests();
    expect(reviewWorkflow.getAllRequests().length).toBe(0);
  });

  /**
   * getPendingRequests が保留中のリクエストのみを返す
   */
  it('getPendingRequests が保留中のリクエストのみを返す', async () => {
    reviewWorkflow.setStatusUpdateCallback(async () => {});
    reviewWorkflow.setMergeCallback(async () => ({ success: true }));

    // 複数のリクエストを作成
    await reviewWorkflow.requestReview({
      ticketId: 'ticket-1',
      workerId: 'worker-1',
      branch: 'branch-1',
      artifacts: [],
    });
    await reviewWorkflow.requestReview({
      ticketId: 'ticket-2',
      workerId: 'worker-2',
      branch: 'branch-2',
      artifacts: [],
    });

    // 1つを承認
    await reviewWorkflow.submitReview({
      ticketId: 'ticket-1',
      reviewerId: 'reviewer-1',
      decision: createReviewDecision(true),
    });

    const pending = reviewWorkflow.getPendingRequests();
    expect(pending.length).toBe(1);
    expect(pending[0].ticketId).toBe('ticket-2');
  });
});
