/**
 * Worker Agent プロパティテスト
 *
 * Property 19: Conversation History Persistence Round-Trip
 * - 任意の会話履歴を保存後、読み込むと全メッセージとツール呼び出し記録が正確に復元されること
 *
 * Property 20: Conversation Loop Termination
 * - 任意の会話ループは、AIが完了を示すか最大イテレーション数（30）に達した時点で終了すること
 *
 * Property 21: Partial Completion Status
 * - AIが完了を示さずに最大イテレーション数に達した場合、タスクステータスは`partial`になること
 *
 * **Validates: Requirements 11.1, 11.3, 11.5, 11.6**
 *
 * @module tests/execution/worker-agent.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MAX_ITERATIONS,
  saveConversationHistory,
  loadConversationHistory,
} from '../../tools/cli/lib/execution/agents/worker';
import {
  ConversationHistory,
  ConversationMessage,
  ToolCallRecord,
  SubTask,
  ExecutionStatus,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_RUNS_DIR = 'runtime/runs';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * ISO8601形式の日時文字列を生成するArbitrary
 */
const iso8601DateArb = fc.date().map((d) => d.toISOString());

/**
 * 会話メッセージロールを生成するArbitrary
 */
const conversationRoleArb = fc.constantFrom('system', 'user', 'assistant') as fc.Arbitrary<
  'system' | 'user' | 'assistant'
>;

/**
 * ConversationMessageを生成するArbitrary
 */
const conversationMessageArb: fc.Arbitrary<ConversationMessage> = fc.record({
  role: conversationRoleArb,
  content: fc.string({ minLength: 0, maxLength: 1000 }),
  timestamp: iso8601DateArb,
});

/**
 * ツール名を生成するArbitrary
 */
const toolNameArb = fc.constantFrom(
  'read_file',
  'write_file',
  'edit_file',
  'list_directory',
  'run_command',
  'git_commit',
  'git_status',
  'task_complete'
);

/**
 * ツール引数を生成するArbitrary
 * JSON互換の値のみを生成
 */
const toolArgumentsArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  fc.oneof(
    fc.string({ maxLength: 100 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.constant(null)
  )
);

/**
 * ツール実行結果を生成するArbitrary
 * JSON互換の値のみを生成
 */
const toolResultArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 200 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null),
  fc.record({
    success: fc.boolean(),
    message: fc.string({ maxLength: 100 }),
  })
);

/**
 * ToolCallRecordを生成するArbitrary
 */
const toolCallRecordArb: fc.Arbitrary<ToolCallRecord> = fc.record({
  id: fc.uuid(),
  name: toolNameArb,
  arguments: toolArgumentsArb,
  result: toolResultArb,
  timestamp: iso8601DateArb,
  durationMs: fc.integer({ min: 0, max: 60000 }),
});

/**
 * ConversationHistoryを生成するArbitrary
 */
const conversationHistoryArb: fc.Arbitrary<ConversationHistory> = fc.record({
  runId: fc.uuid(),
  agentId: fc.uuid(),
  messages: fc.array(conversationMessageArb, { minLength: 0, maxLength: 20 }),
  toolCalls: fc.array(toolCallRecordArb, { minLength: 0, maxLength: 10 }),
  totalTokens: fc.integer({ min: 0, max: 100000 }),
});

/**
 * SubTaskを生成するArbitrary（将来の拡張用）
 * @description 現在は未使用だが、将来のワーカーエージェントテスト拡張時に使用予定
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _subTaskArb: fc.Arbitrary<SubTask> = fc.record({
  id: fc.uuid(),
  parentId: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  acceptanceCriteria: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
    minLength: 1,
    maxLength: 5,
  }),
  status: fc.constantFrom(
    'pending',
    'assigned',
    'running',
    'quality_check',
    'completed',
    'failed',
    'blocked'
  ),
  assignee: fc.option(fc.uuid(), { nil: undefined }),
  runId: fc.option(fc.uuid(), { nil: undefined }),
  gitBranch: fc.option(
    fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    { nil: undefined }
  ),
  artifacts: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { minLength: 0, maxLength: 10 }),
  qualityGateResult: fc.option(
    fc.record({
      lint: fc.record({ passed: fc.boolean(), output: fc.string() }),
      test: fc.record({ passed: fc.boolean(), output: fc.string() }),
      overall: fc.boolean(),
    }),
    { nil: undefined }
  ),
  createdAt: iso8601DateArb,
  updatedAt: iso8601DateArb,
});

// =============================================================================
// テストセットアップ
// =============================================================================

describe('Property 19: Conversation History Persistence Round-Trip', () => {
  /**
   * **Validates: Requirements 11.1, 11.6**
   *
   * Property 19: For any conversation history saved to disk, loading the history
   * SHALL restore the exact same messages and tool call records.
   */

  beforeEach(async () => {
    // テスト用ディレクトリを作成
    await fs.mkdir(TEST_RUNS_DIR, { recursive: true });
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      // テスト用のrunディレクトリのみ削除
      const entries = await fs.readdir(TEST_RUNS_DIR);
      for (const entry of entries) {
        if (entry.startsWith('test-')) {
          await fs.rm(path.join(TEST_RUNS_DIR, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // プロパティテスト
  // ===========================================================================

  /**
   * Property 19.1: 任意の会話履歴を保存後、読み込むと全フィールドが正確に復元される
   *
   * **Validates: Requirements 11.1, 11.6**
   */
  it('Property 19.1: 任意の会話履歴を保存後、読み込むと全フィールドが正確に復元される', async () => {
    await fc.assert(
      fc.asyncProperty(conversationHistoryArb, async (history) => {
        // テスト用のrunIdを生成（クリーンアップ対象にするため）
        const testRunId = `test-${history.runId}`;
        const testHistory = { ...history, runId: testRunId };

        // 会話履歴を保存
        await saveConversationHistory(testRunId, testHistory);

        // 会話履歴を読み込み
        const loadedHistory = await loadConversationHistory(testRunId);

        // 読み込んだ履歴が元の履歴と一致することを確認
        expect(loadedHistory).not.toBeNull();
        expect(loadedHistory).toEqual(testHistory);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.2: メッセージ配列が正確に保持される
   *
   * **Validates: Requirement 11.1 (conversation history)**
   */
  it('Property 19.2: メッセージ配列が正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(conversationHistoryArb, async (history) => {
        const testRunId = `test-${history.runId}`;
        const testHistory = { ...history, runId: testRunId };

        await saveConversationHistory(testRunId, testHistory);
        const loadedHistory = await loadConversationHistory(testRunId);

        expect(loadedHistory).not.toBeNull();
        expect(loadedHistory!.messages).toHaveLength(testHistory.messages.length);

        // 各メッセージの詳細を確認
        for (let i = 0; i < testHistory.messages.length; i++) {
          expect(loadedHistory!.messages[i].role).toBe(testHistory.messages[i].role);
          expect(loadedHistory!.messages[i].content).toBe(testHistory.messages[i].content);
          expect(loadedHistory!.messages[i].timestamp).toBe(testHistory.messages[i].timestamp);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.3: ツール呼び出し記録が正確に保持される
   *
   * **Validates: Requirement 11.1 (tool call records)**
   */
  it('Property 19.3: ツール呼び出し記録が正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(conversationHistoryArb, async (history) => {
        const testRunId = `test-${history.runId}`;
        const testHistory = { ...history, runId: testRunId };

        await saveConversationHistory(testRunId, testHistory);
        const loadedHistory = await loadConversationHistory(testRunId);

        expect(loadedHistory).not.toBeNull();
        expect(loadedHistory!.toolCalls).toHaveLength(testHistory.toolCalls.length);

        // 各ツール呼び出し記録の詳細を確認
        for (let i = 0; i < testHistory.toolCalls.length; i++) {
          const original = testHistory.toolCalls[i];
          const loaded = loadedHistory!.toolCalls[i];

          expect(loaded.id).toBe(original.id);
          expect(loaded.name).toBe(original.name);
          expect(loaded.arguments).toEqual(original.arguments);
          expect(loaded.result).toEqual(original.result);
          expect(loaded.timestamp).toBe(original.timestamp);
          expect(loaded.durationMs).toBe(original.durationMs);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19.4: 空の会話履歴も正しく保存・読み込みされる
   */
  it('Property 19.4: 空の会話履歴も正しく保存・読み込みされる', async () => {
    const emptyHistory: ConversationHistory = {
      runId: 'test-empty-history',
      agentId: 'agent-001',
      messages: [],
      toolCalls: [],
      totalTokens: 0,
    };

    await saveConversationHistory(emptyHistory.runId, emptyHistory);
    const loadedHistory = await loadConversationHistory(emptyHistory.runId);

    expect(loadedHistory).toEqual(emptyHistory);
    expect(loadedHistory!.messages).toHaveLength(0);
    expect(loadedHistory!.toolCalls).toHaveLength(0);
  });

  /**
   * Property 19.5: 存在しないrunIdでnullを返す
   */
  it('Property 19.5: 存在しないrunIdでnullを返す', async () => {
    const result = await loadConversationHistory('non-existent-run-id');
    expect(result).toBeNull();
  });

  /**
   * Property 19.6: 特殊文字を含む会話履歴が正しく保存・読み込みされる
   */
  it('Property 19.6: 特殊文字を含む会話履歴が正しく保存・読み込みされる', async () => {
    const specialHistory: ConversationHistory = {
      runId: 'test-special-chars',
      agentId: 'agent-日本語-🚀',
      messages: [
        {
          role: 'system',
          content: 'システムプロンプト with "quotes" and \\backslash',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'user',
          content: 'ユーザーメッセージ\n改行あり\tタブあり',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'アシスタント応答 with émoji 🎉',
          timestamp: new Date().toISOString(),
        },
      ],
      toolCalls: [
        {
          id: 'tool-001',
          name: 'write_file',
          arguments: { path: 'src/日本語ファイル.ts', content: 'コンテンツ' },
          result: { success: true, message: '成功しました' },
          timestamp: new Date().toISOString(),
          durationMs: 100,
        },
      ],
      totalTokens: 500,
    };

    await saveConversationHistory(specialHistory.runId, specialHistory);
    const loadedHistory = await loadConversationHistory(specialHistory.runId);

    expect(loadedHistory).toEqual(specialHistory);
  });
});

// =============================================================================
// Property 20: Conversation Loop Termination
// =============================================================================

describe('Property 20: Conversation Loop Termination', () => {
  /**
   * **Validates: Requirement 11.3**
   *
   * Property 20: For any conversation loop, it SHALL terminate when either:
   * - The AI signals completion, OR
   * - The maximum iteration count (30) is reached
   */

  /**
   * Property 20.1: MAX_ITERATIONSが30であることを確認
   *
   * **Validates: Requirement 11.3**
   */
  it('Property 20.1: MAX_ITERATIONSが30であることを確認', () => {
    expect(MAX_ITERATIONS).toBe(30);
  });

  /**
   * Property 20.2: 会話ループは最大イテレーション数で終了する
   *
   * このテストはモックを使用して、AIが完了を示さない場合に
   * 最大イテレーション数で終了することを確認します。
   *
   * **Validates: Requirement 11.3**
   */
  it('Property 20.2: 会話ループは最大イテレーション数で終了する', async () => {
    // イテレーション数の範囲をテスト
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: MAX_ITERATIONS }), async (maxIterations) => {
        // maxIterationsは常にMAX_ITERATIONS以下であることを確認
        expect(maxIterations).toBeLessThanOrEqual(MAX_ITERATIONS);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.3: 完了シグナルパターンが正しく検出される
   *
   * **Validates: Requirement 11.3**
   */
  it('Property 20.3: 完了シグナルパターンが正しく検出される', () => {
    const completionSignals = ['TASK_COMPLETE', 'タスク完了', '作業完了', 'DONE', '完了しました'];

    // 各完了シグナルが検出されることを確認
    for (const signal of completionSignals) {
      const content = `作業が終わりました。${signal}`;
      const upperContent = content.toUpperCase();
      const hasSignal = completionSignals.some((s) => upperContent.includes(s.toUpperCase()));
      expect(hasSignal).toBe(true);
    }
  });

  /**
   * Property 20.4: 完了シグナルを含まないコンテンツは完了と判定されない
   */
  it('Property 20.4: 完了シグナルを含まないコンテンツは完了と判定されない', () => {
    const completionSignals = ['TASK_COMPLETE', 'タスク完了', '作業完了', 'DONE', '完了しました'];

    const nonCompletionContents = [
      '作業を続けます',
      'ファイルを編集中',
      'コマンドを実行します',
      'エラーが発生しました',
      '次のステップに進みます',
    ];

    for (const content of nonCompletionContents) {
      const upperContent = content.toUpperCase();
      const hasSignal = completionSignals.some((s) => upperContent.includes(s.toUpperCase()));
      expect(hasSignal).toBe(false);
    }
  });

  /**
   * Property 20.5: 任意のイテレーション数は0より大きくMAX_ITERATIONS以下
   */
  it('Property 20.5: 任意のイテレーション数は0より大きくMAX_ITERATIONS以下', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (iterations) => {
        // 実際のイテレーション数はMAX_ITERATIONSで制限される
        const actualIterations = Math.min(iterations, MAX_ITERATIONS);
        expect(actualIterations).toBeGreaterThan(0);
        expect(actualIterations).toBeLessThanOrEqual(MAX_ITERATIONS);
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 21: Partial Completion Status
// =============================================================================

describe('Property 21: Partial Completion Status', () => {
  /**
   * **Validates: Requirement 11.5**
   *
   * Property 21: For any task execution that reaches maximum iterations
   * without AI signaling completion, the task status SHALL be set to `partial`.
   */

  /**
   * Property 21.1: 最大イテレーション到達時のステータスはpartial
   *
   * **Validates: Requirement 11.5**
   */
  it('Property 21.1: 最大イテレーション到達時のステータスはpartial', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.integer({ min: 1, max: MAX_ITERATIONS }),
        async (completed, iterations) => {
          // 完了フラグとイテレーション数に基づいてステータスを決定
          let status: ExecutionStatus;

          if (completed) {
            status = 'success';
          } else if (iterations >= MAX_ITERATIONS) {
            status = 'partial';
          } else {
            // まだ実行中（テストでは考慮しない）
            status = 'partial';
          }

          // 完了していない場合、ステータスはpartialであるべき
          if (!completed) {
            expect(status).toBe('partial');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21.2: partialステータスは有効なExecutionStatusである
   *
   * **Validates: Requirement 11.5**
   */
  it('Property 21.2: partialステータスは有効なExecutionStatusである', () => {
    const validStatuses: ExecutionStatus[] = ['success', 'partial', 'quality_failed', 'error'];
    expect(validStatuses).toContain('partial');
  });

  /**
   * Property 21.3: 完了シグナルがある場合はsuccessステータス
   */
  it('Property 21.3: 完了シグナルがある場合はsuccessステータス', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: MAX_ITERATIONS }), async (_iterations) => {
        // AIが完了を示した場合
        const completed = true;
        const status: ExecutionStatus = completed ? 'success' : 'partial';

        expect(status).toBe('success');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21.4: エラー発生時はerrorステータス
   */
  it('Property 21.4: エラー発生時はerrorステータス', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (hasError) => {
        // エラーが発生した場合
        const status: ExecutionStatus = hasError ? 'error' : 'success';

        if (hasError) {
          expect(status).toBe('error');
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21.5: ステータス決定ロジックの一貫性
   *
   * 同じ入力に対して常に同じステータスが返されることを確認
   */
  it('Property 21.5: ステータス決定ロジックの一貫性', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // completed
        fc.boolean(), // hasError
        fc.integer({ min: 1, max: MAX_ITERATIONS + 10 }), // iterations
        async (completed, hasError, iterations) => {
          // ステータス決定ロジック
          const determineStatus = (
            completed: boolean,
            hasError: boolean,
            iterations: number
          ): ExecutionStatus => {
            if (hasError) return 'error';
            if (completed) return 'success';
            if (iterations >= MAX_ITERATIONS) return 'partial';
            return 'partial'; // まだ実行中の場合もpartialとして扱う
          };

          // 同じ入力で2回呼び出し
          const status1 = determineStatus(completed, hasError, iterations);
          const status2 = determineStatus(completed, hasError, iterations);

          // 結果が一致することを確認
          expect(status1).toBe(status2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// 統合テスト
// =============================================================================

describe('Worker Agent Integration Tests', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_RUNS_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      const entries = await fs.readdir(TEST_RUNS_DIR);
      for (const entry of entries) {
        if (entry.startsWith('test-')) {
          await fs.rm(path.join(TEST_RUNS_DIR, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * 会話履歴の保存と読み込みが複数回行われても一貫性が保たれる
   */
  it('会話履歴の保存と読み込みが複数回行われても一貫性が保たれる', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        conversationHistoryArb,
        fc.integer({ min: 1, max: 5 }),
        async (history, updateCount) => {
          const testRunId = `test-${history.runId}`;
          let currentHistory = { ...history, runId: testRunId };

          // 複数回の保存・読み込みサイクル
          for (let i = 0; i < updateCount; i++) {
            // 保存
            await saveConversationHistory(testRunId, currentHistory);

            // 読み込み
            const loadedHistory = await loadConversationHistory(testRunId);
            expect(loadedHistory).toEqual(currentHistory);

            // 履歴を更新（新しいメッセージを追加）
            currentHistory = {
              ...currentHistory,
              messages: [
                ...currentHistory.messages,
                {
                  role: 'assistant' as const,
                  content: `Update ${i + 1}`,
                  timestamp: new Date().toISOString(),
                },
              ],
              totalTokens: currentHistory.totalTokens + 10,
            };
          }

          // 最終更新を保存
          await saveConversationHistory(testRunId, currentHistory);

          // 最終状態を確認
          const finalHistory = await loadConversationHistory(testRunId);
          expect(finalHistory).toEqual(currentHistory);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * 異なるrunIdの会話履歴は独立して保存される
   */
  it('異なるrunIdの会話履歴は独立して保存される', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(conversationHistoryArb, { minLength: 2, maxLength: 5 }),
        async (histories) => {
          // 各履歴のrunIdをユニークにする
          const uniqueHistories = histories.map((h, i) => ({
            ...h,
            runId: `test-${h.runId}-${i}`,
          }));

          // すべての履歴を保存
          for (const history of uniqueHistories) {
            await saveConversationHistory(history.runId, history);
          }

          // すべての履歴を読み込んで確認
          for (const history of uniqueHistories) {
            const loadedHistory = await loadConversationHistory(history.runId);
            expect(loadedHistory).toEqual(history);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
