/**
 * State Manager プロパティテスト
 *
 * Property 22: State Persistence Round-Trip
 * - 任意の実行状態を保存後、読み込むと全フィールドが正確に復元されること
 * - active tasks, worker assignments, conversation histories, git branches が保持されること
 *
 * **Validates: Requirements 14.1, 14.2, 14.3**
 *
 * @module tests/execution/state-manager.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StateManager, RunFilter, RunInfo } from '../../tools/cli/lib/execution/state-manager';
import {
  ExecutionState,
  ExecutionStateStatus,
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  SubTask,
  SubTaskStatus,
  ConversationHistory,
  ConversationMessage,
  ToolCallRecord,
  AgentId,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_STATE_DIR = 'runtime/state/test-state-manager';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * ISO8601形式の日時文字列を生成するArbitrary
 */
const iso8601DateArb = fc.date().map((d) => d.toISOString());

/**
 * 有効なExecutionStateStatusを生成するArbitrary
 */
const executionStateStatusArb: fc.Arbitrary<ExecutionStateStatus> = fc.constantFrom(
  'running',
  'paused',
  'completed',
  'failed'
);

/**
 * 有効なSubTaskStatusを生成するArbitrary
 */
const subTaskStatusArb: fc.Arbitrary<SubTaskStatus> = fc.constantFrom(
  'pending',
  'assigned',
  'running',
  'quality_check',
  'completed',
  'failed',
  'blocked'
);

/**
 * SubTaskを生成するArbitrary
 */
const subTaskArb: fc.Arbitrary<SubTask> = fc.record({
  id: fc.uuid(),
  parentId: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  acceptanceCriteria: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
    minLength: 0,
    maxLength: 5,
  }),
  status: subTaskStatusArb,
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

/**
 * ConversationMessageを生成するArbitrary
 */
const conversationMessageArb: fc.Arbitrary<ConversationMessage> = fc.record({
  role: fc.constantFrom('system', 'user', 'assistant'),
  content: fc.string({ minLength: 0, maxLength: 1000 }),
  timestamp: iso8601DateArb,
});

/**
 * ToolCallRecordを生成するArbitrary
 */
const toolCallRecordArb: fc.Arbitrary<ToolCallRecord> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  arguments: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    fc.oneof(fc.string(), fc.integer(), fc.boolean())
  ),
  result: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  timestamp: iso8601DateArb,
  durationMs: fc.integer({ min: 0, max: 60000 }),
});

/**
 * ConversationHistoryを生成するArbitrary
 */
const conversationHistoryArb: fc.Arbitrary<ConversationHistory> = fc.record({
  runId: fc.uuid(),
  agentId: fc.uuid(),
  messages: fc.array(conversationMessageArb, { minLength: 0, maxLength: 10 }),
  toolCalls: fc.array(toolCallRecordArb, { minLength: 0, maxLength: 5 }),
  totalTokens: fc.integer({ min: 0, max: 100000 }),
});

/**
 * AgentIdを生成するArbitrary
 */
const agentIdArb: fc.Arbitrary<AgentId> = fc.uuid();

/**
 * workerAssignments（Record<AgentId, SubTask>）を生成するArbitrary
 */
const workerAssignmentsArb: fc.Arbitrary<Record<AgentId, SubTask>> = fc
  .array(fc.tuple(agentIdArb, subTaskArb), { minLength: 0, maxLength: 3 })
  .map((pairs) => Object.fromEntries(pairs));

/**
 * conversationHistories（Record<AgentId, ConversationHistory>）を生成するArbitrary
 */
const conversationHistoriesArb: fc.Arbitrary<Record<AgentId, ConversationHistory>> = fc
  .array(fc.tuple(agentIdArb, conversationHistoryArb), { minLength: 0, maxLength: 3 })
  .map((pairs) => Object.fromEntries(pairs));

/**
 * gitBranches（Record<AgentId, string>）を生成するArbitrary
 */
const gitBranchesArb: fc.Arbitrary<Record<AgentId, string>> = fc
  .array(
    fc.tuple(
      agentIdArb,
      fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)
    ),
    { minLength: 0, maxLength: 3 }
  )
  .map((pairs) => Object.fromEntries(pairs));

/**
 * 有効なExecutionStateを生成するArbitrary
 */
const executionStateArb: fc.Arbitrary<ExecutionState> = fc.record({
  runId: fc.uuid(),
  taskId: fc.uuid(),
  status: executionStateStatusArb,
  workerAssignments: workerAssignmentsArb,
  conversationHistories: conversationHistoriesArb,
  gitBranches: gitBranchesArb,
  artifacts: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { minLength: 0, maxLength: 10 }),
  lastUpdated: iso8601DateArb,
});

/**
 * SystemConfigを生成するArbitrary
 */
const systemConfigArb: fc.Arbitrary<SystemConfig> = fc.record({
  maxConcurrentWorkers: fc.integer({ min: 1, max: 10 }),
  defaultTimeout: fc.integer({ min: 60, max: 600 }),
  workerMemoryLimit: fc.constantFrom('1g', '2g', '4g', '8g'),
  workerCpuLimit: fc.constantFrom('1', '2', '4'),
  defaultAiAdapter: fc.constantFrom('ollama', 'gemini', 'kiro'),
  defaultModel: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  containerRuntime: fc.constantFrom('dod', 'rootless', 'dind'),
  dockerSocketPath: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  allowedDockerCommands: fc.array(fc.constantFrom('run', 'stop', 'rm', 'logs', 'inspect'), {
    minLength: 1,
    maxLength: 5,
  }),
  messageQueueType: fc.constantFrom('file', 'sqlite', 'redis'),
  messageQueuePath: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  gitCredentialType: fc.constantFrom('deploy_key', 'token', 'ssh_agent'),
  gitSshAgentEnabled: fc.boolean(),
  stateRetentionDays: fc.integer({ min: 1, max: 30 }),
  integrationBranch: fc.constantFrom('develop', 'staging', 'main'),
  autoRefreshInterval: fc.integer({ min: 1000, max: 30000 }),
});

// =============================================================================
// テストセットアップ
// =============================================================================

describe('Property 22: State Persistence Round-Trip', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    // テスト用のStateManagerインスタンスを作成
    stateManager = new StateManager(TEST_STATE_DIR);

    // テスト用ディレクトリを作成
    await fs.mkdir(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_STATE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // プロパティテスト
  // ===========================================================================

  /**
   * Property 22.1: State Save/Load Round-Trip
   * 任意のExecutionStateを保存後、読み込むと全フィールドが正確に復元されること
   *
   * **Validates: Requirements 14.1, 14.2, 14.3**
   */
  it('Property 22.1: 任意のExecutionStateを保存後、読み込むと全フィールドが正確に復元される', async () => {
    await fc.assert(
      fc.asyncProperty(executionStateArb, async (state) => {
        // 状態を保存
        await stateManager.saveState(state.runId, state);

        // 状態を読み込み
        const loadedState = await stateManager.loadState(state.runId);

        // 読み込んだ状態が元の状態と一致することを確認
        expect(loadedState).not.toBeNull();
        expect(loadedState).toEqual(state);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 22.2: Worker Assignments Preservation
   * workerAssignmentsが正確に保持されること
   *
   * **Validates: Requirement 14.2 (worker assignments)**
   */
  it('Property 22.2: workerAssignmentsが正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(executionStateArb, async (state) => {
        // 状態を保存
        await stateManager.saveState(state.runId, state);

        // 状態を読み込み
        const loadedState = await stateManager.loadState(state.runId);

        // workerAssignmentsが正確に保持されていることを確認
        expect(loadedState).not.toBeNull();
        expect(loadedState!.workerAssignments).toEqual(state.workerAssignments);

        // 各ワーカー割り当ての詳細を確認
        for (const [agentId, subTask] of Object.entries(state.workerAssignments)) {
          expect(loadedState!.workerAssignments[agentId]).toEqual(subTask);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 22.3: Conversation Histories Preservation
   * conversationHistoriesが正確に保持されること
   *
   * **Validates: Requirement 14.2 (conversation histories)**
   */
  it('Property 22.3: conversationHistoriesが正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(executionStateArb, async (state) => {
        // 状態を保存
        await stateManager.saveState(state.runId, state);

        // 状態を読み込み
        const loadedState = await stateManager.loadState(state.runId);

        // conversationHistoriesが正確に保持されていることを確認
        expect(loadedState).not.toBeNull();
        expect(loadedState!.conversationHistories).toEqual(state.conversationHistories);

        // 各会話履歴の詳細を確認
        for (const [agentId, history] of Object.entries(state.conversationHistories)) {
          expect(loadedState!.conversationHistories[agentId]).toEqual(history);
          expect(loadedState!.conversationHistories[agentId].messages).toEqual(history.messages);
          expect(loadedState!.conversationHistories[agentId].toolCalls).toEqual(history.toolCalls);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 22.4: Git Branches Preservation
   * gitBranchesが正確に保持されること
   *
   * **Validates: Requirement 14.2 (git branches)**
   */
  it('Property 22.4: gitBranchesが正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(executionStateArb, async (state) => {
        // 状態を保存
        await stateManager.saveState(state.runId, state);

        // 状態を読み込み
        const loadedState = await stateManager.loadState(state.runId);

        // gitBranchesが正確に保持されていることを確認
        expect(loadedState).not.toBeNull();
        expect(loadedState!.gitBranches).toEqual(state.gitBranches);

        // 各ブランチの詳細を確認
        for (const [agentId, branch] of Object.entries(state.gitBranches)) {
          expect(loadedState!.gitBranches[agentId]).toBe(branch);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 22.5: Config Save/Load Round-Trip
   * 任意のSystemConfigを保存後、読み込むと全フィールドが正確に復元されること
   */
  it('Property 22.5: 任意のSystemConfigを保存後、読み込むと全フィールドが正確に復元される', async () => {
    await fc.assert(
      fc.asyncProperty(systemConfigArb, async (config) => {
        // 設定を保存
        await stateManager.saveConfig(config);

        // 設定を読み込み
        const loadedConfig = await stateManager.loadConfig();

        // 読み込んだ設定が元の設定と一致することを確認
        expect(loadedConfig).toEqual(config);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 22.6: Multiple States Independence
   * 複数の状態を保存しても、それぞれが独立して保持されること
   */
  it('Property 22.6: 複数の状態を保存しても、それぞれが独立して保持される', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(executionStateArb, { minLength: 2, maxLength: 5 }),
        async (states) => {
          // 各状態のrunIdをユニークにする
          const uniqueStates = states.map((state, index) => ({
            ...state,
            runId: `${state.runId}-${index}`,
          }));

          // すべての状態を保存
          for (const state of uniqueStates) {
            await stateManager.saveState(state.runId, state);
          }

          // すべての状態を読み込んで確認
          for (const state of uniqueStates) {
            const loadedState = await stateManager.loadState(state.runId);
            expect(loadedState).toEqual(state);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('StateManager Unit Tests', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    stateManager = new StateManager(TEST_STATE_DIR);
    await fs.mkdir(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_STATE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * 存在しないrunIdでnullを返すことを確認
   */
  it('存在しないrunIdでnullを返す', async () => {
    const result = await stateManager.loadState('non-existent-run-id');
    expect(result).toBeNull();
  });

  /**
   * 設定ファイルが存在しない場合はデフォルト値を返すことを確認
   */
  it('設定ファイルが存在しない場合はデフォルト値を返す', async () => {
    const config = await stateManager.loadConfig();
    expect(config).toEqual(DEFAULT_SYSTEM_CONFIG);
  });

  /**
   * 空のworkerAssignmentsを持つ状態が正しく保存・読み込みされることを確認
   */
  it('空のworkerAssignmentsを持つ状態が正しく保存・読み込みされる', async () => {
    const state: ExecutionState = {
      runId: 'empty-assignments-run',
      taskId: 'task-001',
      status: 'running',
      workerAssignments: {},
      conversationHistories: {},
      gitBranches: {},
      artifacts: [],
      lastUpdated: new Date().toISOString(),
    };

    await stateManager.saveState(state.runId, state);
    const loadedState = await stateManager.loadState(state.runId);

    expect(loadedState).toEqual(state);
    expect(Object.keys(loadedState!.workerAssignments)).toHaveLength(0);
  });

  /**
   * listRunsが正しく動作することを確認
   */
  it('listRunsが正しく動作する', async () => {
    // 複数の状態を保存
    const states: ExecutionState[] = [
      {
        runId: 'run-001',
        taskId: 'task-001',
        status: 'completed',
        workerAssignments: {},
        conversationHistories: {},
        gitBranches: {},
        artifacts: ['file1.ts'],
        lastUpdated: '2024-01-01T00:00:00.000Z',
      },
      {
        runId: 'run-002',
        taskId: 'task-002',
        status: 'running',
        workerAssignments: {},
        conversationHistories: {},
        gitBranches: {},
        artifacts: ['file2.ts', 'file3.ts'],
        lastUpdated: '2024-01-02T00:00:00.000Z',
      },
    ];

    for (const state of states) {
      await stateManager.saveState(state.runId, state);
    }

    // 全件取得
    const allRuns = await stateManager.listRuns();
    expect(allRuns).toHaveLength(2);

    // 最新順にソートされていることを確認
    expect(allRuns[0].runId).toBe('run-002');
    expect(allRuns[1].runId).toBe('run-001');
  });

  /**
   * listRunsのフィルター機能が正しく動作することを確認
   */
  it('listRunsのフィルター機能が正しく動作する', async () => {
    const states: ExecutionState[] = [
      {
        runId: 'run-completed',
        taskId: 'task-001',
        status: 'completed',
        workerAssignments: {},
        conversationHistories: {},
        gitBranches: {},
        artifacts: [],
        lastUpdated: '2024-01-01T00:00:00.000Z',
      },
      {
        runId: 'run-running',
        taskId: 'task-002',
        status: 'running',
        workerAssignments: {},
        conversationHistories: {},
        gitBranches: {},
        artifacts: [],
        lastUpdated: '2024-01-02T00:00:00.000Z',
      },
    ];

    for (const state of states) {
      await stateManager.saveState(state.runId, state);
    }

    // ステータスでフィルター
    const completedRuns = await stateManager.listRuns({ status: 'completed' });
    expect(completedRuns).toHaveLength(1);
    expect(completedRuns[0].runId).toBe('run-completed');

    // タスクIDでフィルター
    const task002Runs = await stateManager.listRuns({ taskId: 'task-002' });
    expect(task002Runs).toHaveLength(1);
    expect(task002Runs[0].runId).toBe('run-running');
  });

  /**
   * cleanupOldRunsが正しく動作することを確認
   */
  it('cleanupOldRunsが正しく動作する', async () => {
    const now = new Date();
    const oldDate = new Date(now);
    oldDate.setDate(oldDate.getDate() - 10); // 10日前

    const states: ExecutionState[] = [
      {
        runId: 'old-run',
        taskId: 'task-001',
        status: 'completed',
        workerAssignments: {},
        conversationHistories: {},
        gitBranches: {},
        artifacts: [],
        lastUpdated: oldDate.toISOString(),
      },
      {
        runId: 'new-run',
        taskId: 'task-002',
        status: 'completed',
        workerAssignments: {},
        conversationHistories: {},
        gitBranches: {},
        artifacts: [],
        lastUpdated: now.toISOString(),
      },
    ];

    for (const state of states) {
      await stateManager.saveState(state.runId, state);
    }

    // 7日より古い実行を削除
    const deletedIds = await stateManager.cleanupOldRuns(7);

    expect(deletedIds).toContain('old-run');
    expect(deletedIds).not.toContain('new-run');

    // 古い実行が削除されていることを確認
    const oldState = await stateManager.loadState('old-run');
    expect(oldState).toBeNull();

    // 新しい実行は残っていることを確認
    const newState = await stateManager.loadState('new-run');
    expect(newState).not.toBeNull();
  });

  /**
   * existsメソッドが正しく動作することを確認
   */
  it('existsメソッドが正しく動作する', async () => {
    const state: ExecutionState = {
      runId: 'exists-test-run',
      taskId: 'task-001',
      status: 'running',
      workerAssignments: {},
      conversationHistories: {},
      gitBranches: {},
      artifacts: [],
      lastUpdated: new Date().toISOString(),
    };

    // 保存前は存在しない
    expect(await stateManager.exists(state.runId)).toBe(false);

    // 保存後は存在する
    await stateManager.saveState(state.runId, state);
    expect(await stateManager.exists(state.runId)).toBe(true);
  });

  /**
   * deleteStateメソッドが正しく動作することを確認
   */
  it('deleteStateメソッドが正しく動作する', async () => {
    const state: ExecutionState = {
      runId: 'delete-test-run',
      taskId: 'task-001',
      status: 'running',
      workerAssignments: {},
      conversationHistories: {},
      gitBranches: {},
      artifacts: [],
      lastUpdated: new Date().toISOString(),
    };

    await stateManager.saveState(state.runId, state);
    expect(await stateManager.exists(state.runId)).toBe(true);

    // 削除
    const deleted = await stateManager.deleteState(state.runId);
    expect(deleted).toBe(true);
    expect(await stateManager.exists(state.runId)).toBe(false);

    // 存在しない状態の削除はfalseを返す
    const deletedAgain = await stateManager.deleteState(state.runId);
    expect(deletedAgain).toBe(false);
  });

  /**
   * 特殊文字を含む状態が正しく保存・読み込みされることを確認
   */
  it('特殊文字を含む状態が正しく保存・読み込みされる', async () => {
    const state: ExecutionState = {
      runId: 'special-chars-run',
      taskId: 'task-日本語-🚀',
      status: 'running',
      workerAssignments: {
        'agent-émoji': {
          id: 'subtask-001',
          parentId: 'task-日本語-🚀',
          title: 'タスク with "quotes" and \\backslash',
          description: '説明文\n改行あり',
          acceptanceCriteria: ['基準1', '基準2'],
          status: 'running',
          artifacts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      conversationHistories: {},
      gitBranches: {
        'agent-émoji': 'agent/task-日本語-feature',
      },
      artifacts: ['src/日本語ファイル.ts'],
      lastUpdated: new Date().toISOString(),
    };

    await stateManager.saveState(state.runId, state);
    const loadedState = await stateManager.loadState(state.runId);

    expect(loadedState).toEqual(state);
    expect(loadedState!.taskId).toBe('task-日本語-🚀');
    expect(loadedState!.workerAssignments['agent-émoji'].title).toBe(
      'タスク with "quotes" and \\backslash'
    );
  });
});
