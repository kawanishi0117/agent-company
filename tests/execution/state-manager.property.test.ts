/**
 * State Manager プロパティテスト
 *
 * Property 15: State Persistence Round-Trip
 * Property 16: Pause/Resume State Preservation
 * - 任意の実行状態に対して、一時停止と再開が正しく動作する
 * - ワーカー状態と会話履歴が保存・復元される
 *
 * **Validates: Requirements 9.2, 9.3, 9.4, 9.5**
 *
 * @module tests/execution/state-manager.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
// pathはテスト用ディレクトリ操作で使用
import { StateManager } from '../../tools/cli/lib/execution/state-manager';
import {
  ExecutionPersistenceData,
  WorkerState,
  ConversationHistory,
  WorkerType,
  WorkerStatus,
  ExecutionState,
  SubTask,
  DEFAULT_SYSTEM_CONFIG,
  SystemConfig,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_BASE_DIR = 'runtime/test-state-manager-property';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 実行ID（RunId）を生成するArbitrary
 */
const runIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
      minLength: 8,
      maxLength: 16,
    }),
    fc.integer({ min: 1, max: 9999 })
  )
  .map(([prefix, suffix]) => `run-${prefix}-${suffix.toString().padStart(4, '0')}`);

/**
 * チケットIDを生成するArbitrary
 */
const ticketIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), {
      minLength: 3,
      maxLength: 8,
    }),
    fc.integer({ min: 1, max: 999 })
  )
  .map(([proj, seq]) => `${proj}-${seq.toString().padStart(4, '0')}`);

/**
 * ワーカータイプを生成するArbitrary
 */
const workerTypeArb: fc.Arbitrary<WorkerType> = fc.constantFrom(
  'research',
  'design',
  'designer',
  'developer',
  'test',
  'reviewer'
);

/**
 * ワーカーステータスを生成するArbitrary
 */
const workerStatusArb: fc.Arbitrary<WorkerStatus> = fc.constantFrom(
  'idle',
  'working',
  'error',
  'terminated'
);

/**
 * ワーカー状態を生成するArbitrary
 */
const workerStateArb: fc.Arbitrary<WorkerState> = fc.record({
  workerId: fc
    .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
      minLength: 6,
      maxLength: 12,
    })
    .map((id) => `worker-${id}`),
  workerType: workerTypeArb,
  status: workerStatusArb,
  assignedTicketId: fc.option(ticketIdArb, { nil: undefined }),
  lastActivity: fc.date().map((d) => d.toISOString()),
});

/**
 * 会話履歴を生成するArbitrary
 */
const conversationHistoryArb: fc.Arbitrary<ConversationHistory> = fc.record({
  runId: runIdArb,
  agentId: fc
    .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
      minLength: 6,
      maxLength: 12,
    })
    .map((id) => `agent-${id}`),
  messages: fc.array(
    fc.record({
      role: fc.constantFrom('system', 'user', 'assistant') as fc.Arbitrary<
        'system' | 'user' | 'assistant'
      >,
      content: fc.string({ minLength: 1, maxLength: 100 }),
      timestamp: fc.date().map((d) => d.toISOString()),
    }),
    { minLength: 0, maxLength: 5 }
  ),
  toolCalls: fc.array(
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      arguments: fc.constant({}),
      result: fc.constant(null),
      timestamp: fc.date().map((d) => d.toISOString()),
      durationMs: fc.integer({ min: 1, max: 10000 }),
    }),
    { minLength: 0, maxLength: 3 }
  ),
  totalTokens: fc.integer({ min: 0, max: 100000 }),
});

/**
 * 実行永続化データを生成するArbitrary
 * @see Requirement 9.2
 */
const executionPersistenceDataArb: fc.Arbitrary<ExecutionPersistenceData> = fc.record({
  runId: runIdArb,
  ticketId: ticketIdArb,
  status: fc.constantFrom('running', 'paused', 'completed', 'failed') as fc.Arbitrary<
    'running' | 'paused' | 'completed' | 'failed'
  >,
  workerStates: fc.dictionary(
    fc
      .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
        minLength: 6,
        maxLength: 12,
      })
      .map((id) => `worker-${id}`),
    workerStateArb,
    { minKeys: 0, maxKeys: 3 }
  ),
  conversationHistories: fc.dictionary(
    fc
      .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
        minLength: 6,
        maxLength: 12,
      })
      .map((id) => `agent-${id}`),
    conversationHistoryArb,
    { minKeys: 0, maxKeys: 3 }
  ),
  gitBranches: fc.dictionary(
    fc
      .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
        minLength: 6,
        maxLength: 12,
      })
      .map((id) => `agent-${id}`),
    fc.string({ minLength: 5, maxLength: 30 }),
    { minKeys: 0, maxKeys: 3 }
  ),
  lastUpdated: fc.date().map((d) => d.toISOString()),
});

/**
 * ISO8601日付を生成するArbitrary
 */
const iso8601DateArb: fc.Arbitrary<string> = fc.date().map((d) => d.toISOString());

/**
 * 実行状態ステータスを生成するArbitrary
 */
const executionStateStatusArb: fc.Arbitrary<'running' | 'paused' | 'completed' | 'failed'> =
  fc.constantFrom('running', 'paused', 'completed', 'failed');

/**
 * サブタスクを生成するArbitrary
 */
const subTaskArb: fc.Arbitrary<SubTask> = fc.record({
  id: fc.string({ minLength: 5, maxLength: 20 }),
  parentId: fc.string({ minLength: 5, maxLength: 20 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  acceptanceCriteria: fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
    minLength: 0,
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
  assignee: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
  runId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
  gitBranch: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined }),
  artifacts: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
  qualityGateResult: fc.option(
    fc.record({
      lint: fc.record({
        passed: fc.boolean(),
        output: fc.string({ minLength: 0, maxLength: 100 }),
      }),
      test: fc.record({
        passed: fc.boolean(),
        output: fc.string({ minLength: 0, maxLength: 100 }),
      }),
      overall: fc.boolean(),
    }),
    { nil: undefined }
  ),
  createdAt: iso8601DateArb,
  updatedAt: iso8601DateArb,
});

/**
 * ワーカー割り当てマップを生成するArbitrary
 */
const workerAssignmentsArb: fc.Arbitrary<Record<string, SubTask>> = fc.dictionary(
  fc.string({ minLength: 5, maxLength: 20 }),
  subTaskArb,
  { minKeys: 0, maxKeys: 3 }
);

/**
 * 会話履歴マップを生成するArbitrary
 */
const conversationHistoriesArb: fc.Arbitrary<Record<string, ConversationHistory>> = fc.dictionary(
  fc.string({ minLength: 5, maxLength: 20 }),
  conversationHistoryArb,
  { minKeys: 0, maxKeys: 3 }
);

/**
 * Gitブランチマップを生成するArbitrary
 */
const gitBranchesArb: fc.Arbitrary<Record<string, string>> = fc.dictionary(
  fc.string({ minLength: 5, maxLength: 20 }),
  fc.string({ minLength: 5, maxLength: 50 }),
  { minKeys: 0, maxKeys: 3 }
);

/**
 * ExecutionStateを生成するArbitrary
 */
const executionStateArb: fc.Arbitrary<ExecutionState> = fc.record({
  runId: runIdArb,
  taskId: ticketIdArb,
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

describe('Property 15: State Persistence Round-Trip (ExecutionPersistenceData)', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    // テスト用のStateManagerインスタンスを作成
    stateManager = new StateManager(TEST_BASE_DIR);

    // テスト用ディレクトリを作成
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // Property 15: State Persistence Round-Trip
  // @see Requirement 9.2: THE System SHALL persist execution state to `runtime/state/runs/<run-id>/state.json`
  // ===========================================================================

  /**
   * Property 15.1: ExecutionPersistenceData Save/Load Round-Trip
   * 任意のExecutionPersistenceDataを保存後、読み込むと全フィールドが正確に復元されること
   *
   * **Validates: Requirement 9.2**
   */
  it('Property 15.1: 任意のExecutionPersistenceDataを保存後、読み込むと全フィールドが正確に復元される', async () => {
    await fc.assert(
      fc.asyncProperty(executionPersistenceDataArb, async (data) => {
        // 状態を保存
        await stateManager.saveExecutionData(data);

        // 状態を読み込み
        const loadedData = await stateManager.loadExecutionData(data.runId);

        // 読み込んだ状態が元の状態と一致することを確認
        expect(loadedData).not.toBeNull();
        expect(loadedData).toEqual(data);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.2: Worker States Preservation
   * workerStatesが正確に保持されること
   *
   * **Validates: Requirement 9.2 (worker states)**
   */
  it('Property 15.2: workerStatesが正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(executionPersistenceDataArb, async (data) => {
        // 状態を保存
        await stateManager.saveExecutionData(data);

        // 状態を読み込み
        const loadedData = await stateManager.loadExecutionData(data.runId);

        // workerStatesが正確に保持されていることを確認
        expect(loadedData).not.toBeNull();
        expect(loadedData!.workerStates).toEqual(data.workerStates);

        // 各ワーカー状態の詳細を確認
        for (const [workerId, state] of Object.entries(data.workerStates)) {
          expect(loadedData!.workerStates[workerId]).toEqual(state);
          expect(loadedData!.workerStates[workerId].workerType).toBe(state.workerType);
          expect(loadedData!.workerStates[workerId].status).toBe(state.status);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.3: Conversation Histories Preservation
   * conversationHistoriesが正確に保持されること
   *
   * **Validates: Requirement 9.2, 9.5 (conversation histories)**
   */
  it('Property 15.3: conversationHistoriesが正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(executionPersistenceDataArb, async (data) => {
        // 状態を保存
        await stateManager.saveExecutionData(data);

        // 状態を読み込み
        const loadedData = await stateManager.loadExecutionData(data.runId);

        // conversationHistoriesが正確に保持されていることを確認
        expect(loadedData).not.toBeNull();
        expect(loadedData!.conversationHistories).toEqual(data.conversationHistories);

        // 各会話履歴の詳細を確認
        for (const [agentId, history] of Object.entries(data.conversationHistories)) {
          expect(loadedData!.conversationHistories[agentId]).toEqual(history);
          expect(loadedData!.conversationHistories[agentId].messages).toEqual(history.messages);
          expect(loadedData!.conversationHistories[agentId].toolCalls).toEqual(history.toolCalls);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.4: Git Branches Preservation
   * gitBranchesが正確に保持されること
   *
   * **Validates: Requirement 9.2 (git branches)**
   */
  it('Property 15.4: gitBranchesが正確に保持される', async () => {
    await fc.assert(
      fc.asyncProperty(executionPersistenceDataArb, async (data) => {
        // 状態を保存
        await stateManager.saveExecutionData(data);

        // 状態を読み込み
        const loadedData = await stateManager.loadExecutionData(data.runId);

        // gitBranchesが正確に保持されていることを確認
        expect(loadedData).not.toBeNull();
        expect(loadedData!.gitBranches).toEqual(data.gitBranches);

        // 各ブランチの詳細を確認
        for (const [agentId, branch] of Object.entries(data.gitBranches)) {
          expect(loadedData!.gitBranches[agentId]).toBe(branch);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.5: Multiple ExecutionPersistenceData Independence
   * 複数の実行データを保存しても、それぞれが独立して保持されること
   *
   * **Validates: Requirement 9.2**
   */
  it('Property 15.5: 複数の実行データを保存しても、それぞれが独立して保持される', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(executionPersistenceDataArb, { minLength: 2, maxLength: 5 }),
        async (dataList) => {
          // 各データのrunIdをユニークにする
          const uniqueDataList = dataList.map((data, index) => ({
            ...data,
            runId: `${data.runId}-${index}`,
          }));

          // すべてのデータを保存
          for (const data of uniqueDataList) {
            await stateManager.saveExecutionData(data);
          }

          // すべてのデータを読み込んで確認
          for (const data of uniqueDataList) {
            const loadedData = await stateManager.loadExecutionData(data.runId);
            expect(loadedData).toEqual(data);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

// =============================================================================
// Property 16: Pause/Resume State Preservation
// =============================================================================

describe('Property 16: Pause/Resume State Preservation', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    stateManager = new StateManager(TEST_BASE_DIR);
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * Property 16.1: Pause preserves all state
   * 一時停止時にすべての状態が保存されること
   *
   * **Validates: Requirement 9.4, 9.5**
   */
  it('Property 16.1: 一時停止時にすべての状態が保存される', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        executionPersistenceDataArb.filter((d) => d.status === 'running'),
        async (data) => {
          // 実行中の状態を保存
          await stateManager.saveExecutionData(data);

          // 一時停止
          const result = await stateManager.pauseExecution(data.runId);

          // 一時停止が成功することを確認
          expect(result.success).toBe(true);
          expect(result.newStatus).toBe('paused');

          // 状態が保存されていることを確認
          const loadedData = await stateManager.loadExecutionData(data.runId);
          expect(loadedData).not.toBeNull();
          expect(loadedData!.status).toBe('paused');
          expect(loadedData!.workerStates).toEqual(data.workerStates);
          expect(loadedData!.conversationHistories).toEqual(data.conversationHistories);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.2: Resume restores all state
   * 再開時にすべての状態が復元されること
   *
   * **Validates: Requirement 9.4**
   */
  it('Property 16.2: 再開時にすべての状態が復元される', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        executionPersistenceDataArb.map((d) => ({ ...d, status: 'paused' as const })),
        async (data) => {
          // 一時停止中の状態を保存
          await stateManager.saveExecutionData(data);

          // 再開
          const result = await stateManager.resumeExecution(data.runId);

          // 再開が成功することを確認
          expect(result.success).toBe(true);
          expect(result.newStatus).toBe('running');

          // 状態が復元されていることを確認
          const loadedData = await stateManager.loadExecutionData(data.runId);
          expect(loadedData).not.toBeNull();
          expect(loadedData!.status).toBe('running');
          expect(loadedData!.workerStates).toEqual(data.workerStates);
          expect(loadedData!.conversationHistories).toEqual(data.conversationHistories);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.3: Pause/Resume round-trip preserves state
   * 一時停止→再開のサイクルで状態が完全に保持されること
   *
   * **Validates: Requirements 9.4, 9.5**
   */
  it('Property 16.3: 一時停止→再開のサイクルで状態が完全に保持される', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        executionPersistenceDataArb.filter((d) => d.status === 'running'),
        async (data) => {
          // 実行中の状態を保存
          await stateManager.saveExecutionData(data);

          // 一時停止
          await stateManager.pauseExecution(data.runId);

          // 再開
          await stateManager.resumeExecution(data.runId);

          // 状態が完全に保持されていることを確認
          const loadedData = await stateManager.loadExecutionData(data.runId);
          expect(loadedData).not.toBeNull();
          expect(loadedData!.status).toBe('running');
          expect(loadedData!.workerStates).toEqual(data.workerStates);
          expect(loadedData!.conversationHistories).toEqual(data.conversationHistories);
          expect(loadedData!.gitBranches).toEqual(data.gitBranches);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.4: Cannot pause completed/failed executions
   * 完了または失敗した実行は一時停止できないこと
   *
   * **Validates: Requirement 9.4**
   */
  it('Property 16.4: 完了または失敗した実行は一時停止できない', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionPersistenceDataArb.filter(
          (d) => d.status === 'completed' || d.status === 'failed'
        ),
        async (data) => {
          // 完了/失敗状態を保存
          await stateManager.saveExecutionData(data);

          // 一時停止を試みる
          const result = await stateManager.pauseExecution(data.runId);

          // 一時停止が失敗することを確認
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.5: Cannot resume non-paused executions
   * 一時停止中でない実行は再開できないこと
   *
   * **Validates: Requirement 9.4**
   */
  it('Property 16.5: 一時停止中でない実行は再開できない', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionPersistenceDataArb.filter((d) => d.status !== 'paused'),
        async (data) => {
          // 非一時停止状態を保存
          await stateManager.saveExecutionData(data);

          // 再開を試みる
          const result = await stateManager.resumeExecution(data.runId);

          // 再開が失敗することを確認
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// ExecutionState Round-Trip Tests (既存のsaveState/loadState)
// =============================================================================

describe('Property 22: ExecutionState Persistence Round-Trip', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    stateManager = new StateManager(TEST_BASE_DIR);
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

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
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('StateManager Unit Tests', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    stateManager = new StateManager(TEST_BASE_DIR);
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
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
   * 存在しないrunIdでloadExecutionDataがnullを返すことを確認
   */
  it('存在しないrunIdでloadExecutionDataがnullを返す', async () => {
    const result = await stateManager.loadExecutionData('non-existent-run-id');
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
   * initializeExecutionDataが正しく動作することを確認
   */
  it('initializeExecutionDataが正しく動作する', async () => {
    const runId = 'test-run-001';
    const ticketId = 'ticket-001';

    const data = await stateManager.initializeExecutionData(runId, ticketId);

    expect(data.runId).toBe(runId);
    expect(data.ticketId).toBe(ticketId);
    expect(data.status).toBe('running');
    expect(data.workerStates).toEqual({});
    expect(data.conversationHistories).toEqual({});
    expect(data.gitBranches).toEqual({});

    // 保存されていることを確認
    const loadedData = await stateManager.loadExecutionData(runId);
    expect(loadedData).toEqual(data);
  });

  /**
   * updateWorkerStateが正しく動作することを確認
   */
  it('updateWorkerStateが正しく動作する', async () => {
    const runId = 'test-run-002';
    const ticketId = 'ticket-002';
    const workerId = 'worker-001';

    // 初期化
    await stateManager.initializeExecutionData(runId, ticketId);

    // ワーカー状態を更新
    const workerState: WorkerState = {
      workerId,
      workerType: 'developer',
      status: 'working',
      assignedTicketId: ticketId,
      lastActivity: new Date().toISOString(),
    };

    await stateManager.updateWorkerState(runId, workerId, workerState);

    // 更新されていることを確認
    const loadedData = await stateManager.loadExecutionData(runId);
    expect(loadedData).not.toBeNull();
    expect(loadedData!.workerStates[workerId]).toEqual(workerState);
  });

  /**
   * updateConversationHistoryが正しく動作することを確認
   */
  it('updateConversationHistoryが正しく動作する', async () => {
    const runId = 'test-run-003';
    const ticketId = 'ticket-003';
    const agentId = 'agent-001';

    // 初期化
    await stateManager.initializeExecutionData(runId, ticketId);

    // 会話履歴を更新
    const history: ConversationHistory = {
      runId,
      agentId,
      messages: [
        { role: 'system', content: 'You are a developer.', timestamp: new Date().toISOString() },
        { role: 'user', content: 'Implement feature X.', timestamp: new Date().toISOString() },
      ],
      toolCalls: [],
      totalTokens: 100,
    };

    await stateManager.updateConversationHistory(runId, agentId, history);

    // 更新されていることを確認
    const loadedData = await stateManager.loadExecutionData(runId);
    expect(loadedData).not.toBeNull();
    expect(loadedData!.conversationHistories[agentId]).toEqual(history);
  });

  /**
   * updateGitBranchが正しく動作することを確認
   */
  it('updateGitBranchが正しく動作する', async () => {
    const runId = 'test-run-004';
    const ticketId = 'ticket-004';
    const agentId = 'agent-002';
    const branchName = 'agent/ticket-004-feature';

    // 初期化
    await stateManager.initializeExecutionData(runId, ticketId);

    // Gitブランチを更新
    await stateManager.updateGitBranch(runId, agentId, branchName);

    // 更新されていることを確認
    const loadedData = await stateManager.loadExecutionData(runId);
    expect(loadedData).not.toBeNull();
    expect(loadedData!.gitBranches[agentId]).toBe(branchName);
  });

  /**
   * updateExecutionStatusが正しく動作することを確認
   */
  it('updateExecutionStatusが正しく動作する', async () => {
    const runId = 'test-run-005';
    const ticketId = 'ticket-005';

    // 初期化
    await stateManager.initializeExecutionData(runId, ticketId);

    // ステータスを更新
    await stateManager.updateExecutionStatus(runId, 'completed');

    // 更新されていることを確認
    const loadedData = await stateManager.loadExecutionData(runId);
    expect(loadedData).not.toBeNull();
    expect(loadedData!.status).toBe('completed');
  });

  /**
   * findInProgressExecutionsが正しく動作することを確認
   */
  it('findInProgressExecutionsが正しく動作する', async () => {
    // 複数の実行データを作成
    const runningData: ExecutionPersistenceData = {
      runId: 'running-run',
      ticketId: 'ticket-running',
      status: 'running',
      workerStates: {},
      conversationHistories: {},
      gitBranches: {},
      lastUpdated: new Date().toISOString(),
    };

    const pausedData: ExecutionPersistenceData = {
      runId: 'paused-run',
      ticketId: 'ticket-paused',
      status: 'paused',
      workerStates: {},
      conversationHistories: {},
      gitBranches: {},
      lastUpdated: new Date().toISOString(),
    };

    const completedData: ExecutionPersistenceData = {
      runId: 'completed-run',
      ticketId: 'ticket-completed',
      status: 'completed',
      workerStates: {},
      conversationHistories: {},
      gitBranches: {},
      lastUpdated: new Date().toISOString(),
    };

    await stateManager.saveExecutionData(runningData);
    await stateManager.saveExecutionData(pausedData);
    await stateManager.saveExecutionData(completedData);

    // 進行中の実行を検索
    const inProgress = await stateManager.findInProgressExecutions();

    // running と paused のみが返されることを確認
    expect(inProgress).toHaveLength(2);
    const runIds = inProgress.map((d) => d.runId);
    expect(runIds).toContain('running-run');
    expect(runIds).toContain('paused-run');
    expect(runIds).not.toContain('completed-run');
  });

  /**
   * restoreExecutionが正しく動作することを確認
   */
  it('restoreExecutionが正しく動作する', async () => {
    const data: ExecutionPersistenceData = {
      runId: 'restore-test-run',
      ticketId: 'ticket-restore',
      status: 'paused',
      workerStates: {
        'worker-001': {
          workerId: 'worker-001',
          workerType: 'developer',
          status: 'idle',
          lastActivity: new Date().toISOString(),
        },
      },
      conversationHistories: {},
      gitBranches: { 'agent-001': 'agent/ticket-restore-feature' },
      lastUpdated: new Date().toISOString(),
    };

    await stateManager.saveExecutionData(data);

    // 復元
    const result = await stateManager.restoreExecution(data.runId);

    expect(result.success).toBe(true);
    expect(result.ticketId).toBe(data.ticketId);
    expect(result.status).toBe(data.status);
    expect(result.workerStates).toEqual(data.workerStates);
    expect(result.gitBranches).toEqual(data.gitBranches);
  });

  /**
   * 存在しない実行の復元が失敗することを確認
   */
  it('存在しない実行の復元が失敗する', async () => {
    const result = await stateManager.restoreExecution('non-existent-run');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  /**
   * 完了した実行の復元が失敗することを確認
   */
  it('完了した実行の復元が失敗する', async () => {
    const data: ExecutionPersistenceData = {
      runId: 'completed-restore-test',
      ticketId: 'ticket-completed',
      status: 'completed',
      workerStates: {},
      conversationHistories: {},
      gitBranches: {},
      lastUpdated: new Date().toISOString(),
    };

    await stateManager.saveExecutionData(data);

    const result = await stateManager.restoreExecution(data.runId);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
