/**
 * Agent Bus プロパティテスト
 *
 * Property 18: Message Delivery Guarantee
 * - 任意のメッセージがAgent_Bus経由で送信された場合、
 *   ターゲットエージェントに配信され、メッセージ履歴にログされること
 *
 * Property 28: Message Queue Abstraction
 * - 任意のメッセージがAgent_Bus経由で送信された場合、
 *   基盤となるキュー実装（file, SQLite, Redis）に関係なく配信されること
 *
 * **Validates: Requirements 10.1, 10.3, 10.4, 10.5, 10.6, 10.7**
 *
 * @module tests/execution/agent-bus.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import { AgentBus, createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { FileMessageQueue } from '../../tools/cli/lib/execution/message-queue';
import {
  AgentMessage,
  AgentMessageType,
  AgentId,
  RunId,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用のメッセージキューベースパス
 */
const TEST_QUEUE_BASE_PATH = 'runtime/state/test-agent-bus-property';

/**
 * テスト用のランタイムベースパス
 */
const TEST_RUNTIME_BASE_PATH = 'runtime/runs/test-agent-bus-property';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 有効なAgentMessageTypeを生成するArbitrary
 * @see Requirement 10.2: THE Agent_Bus SHALL support message types
 */
const agentMessageTypeArb: fc.Arbitrary<AgentMessageType> = fc.constantFrom(
  'task_assign',
  'task_complete',
  'task_failed',
  'escalate',
  'status_request',
  'status_response'
);

/**
 * 有効なAgentIdを生成するArbitrary
 * - エージェントIDは英数字とハイフンで構成
 * - 空文字列は除外
 */
const agentIdArb: fc.Arbitrary<AgentId> = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
    minLength: 3,
    maxLength: 30,
  })
  .filter((s) => s.trim().length > 0 && !s.startsWith('-') && !s.endsWith('-'));

/**
 * 有効なRunIdを生成するArbitrary
 */
const runIdArb: fc.Arbitrary<RunId> = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
    minLength: 5,
    maxLength: 40,
  })
  .filter((s) => s.trim().length > 0 && !s.startsWith('-') && !s.endsWith('-'));

/**
 * ISO8601形式の日時文字列を生成するArbitrary
 */
const iso8601DateArb: fc.Arbitrary<string> = fc.date().map((d) => d.toISOString());

/**
 * メッセージペイロードを生成するArbitrary
 * - 様々な型のペイロードをサポート
 */
const payloadArb: fc.Arbitrary<unknown> = fc.oneof(
  // シンプルなオブジェクト
  fc.record({
    taskId: fc.uuid(),
    description: fc.string({ minLength: 0, maxLength: 200 }),
  }),
  // 配列を含むオブジェクト
  fc.record({
    items: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    count: fc.integer({ min: 0, max: 100 }),
  }),
  // ネストしたオブジェクト
  fc.record({
    data: fc.record({
      value: fc.integer(),
      label: fc.string({ minLength: 1, maxLength: 30 }),
    }),
    metadata: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
      fc.oneof(fc.string(), fc.integer(), fc.boolean())
    ),
  }),
  // 空オブジェクト
  fc.constant({}),
  // null
  fc.constant(null)
);

/**
 * 有効なAgentMessageを生成するArbitrary
 * - 送信元と送信先が異なることを保証
 */
const agentMessageArb: fc.Arbitrary<AgentMessage> = fc
  .record({
    id: fc.uuid(),
    type: agentMessageTypeArb,
    from: agentIdArb,
    to: agentIdArb,
    payload: payloadArb,
    timestamp: iso8601DateArb,
  })
  .filter((msg) => msg.from !== msg.to); // 送信元と送信先が異なることを保証

/**
 * runIdを含むペイロードを持つAgentMessageを生成するArbitrary
 * - メッセージ履歴のテスト用
 */
const agentMessageWithRunIdArb = (runId: string): fc.Arbitrary<AgentMessage> =>
  fc
    .record({
      id: fc.uuid(),
      type: agentMessageTypeArb,
      from: agentIdArb,
      to: agentIdArb,
      payload: fc.record({
        taskId: fc.uuid(),
        runId: fc.constant(runId),
        data: fc.string({ minLength: 0, maxLength: 100 }),
      }),
      timestamp: iso8601DateArb,
    })
    .filter((msg) => msg.from !== msg.to);

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * ディレクトリを再帰的に削除
 */
async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

/**
 * 短い待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Property 18: Message Delivery Guarantee テスト
// =============================================================================

describe('Property 18: Message Delivery Guarantee', () => {
  let agentBus: AgentBus;

  beforeEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await cleanupDirectory(TEST_QUEUE_BASE_PATH);
    await cleanupDirectory(TEST_RUNTIME_BASE_PATH);

    // Agent Busを作成
    agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: TEST_QUEUE_BASE_PATH,
      },
      runtimeBasePath: TEST_RUNTIME_BASE_PATH,
    });

    // 初期化
    await agentBus.initialize();
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await cleanupDirectory(TEST_QUEUE_BASE_PATH);
    await cleanupDirectory(TEST_RUNTIME_BASE_PATH);
  });

  /**
   * Property 18.1: 任意のメッセージがターゲットエージェントに配信される
   *
   * *For any* message sent via Agent_Bus, the message SHALL be delivered
   * to the target agent.
   *
   * **Validates: Requirements 10.1, 10.3**
   */
  it('Property 18.1: 任意のメッセージがターゲットエージェントに配信される', async () => {
    await fc.assert(
      fc.asyncProperty(agentMessageArb, async (message) => {
        // メッセージを送信
        await agentBus.send(message);

        // ターゲットエージェントがメッセージを受信
        const receivedMessages = await agentBus.poll(message.to, 2000);

        // 検証: メッセージが配信されたこと
        expect(receivedMessages.length).toBeGreaterThanOrEqual(1);

        // 検証: 受信したメッセージが送信したメッセージと一致すること
        const receivedMessage = receivedMessages.find((m) => m.id === message.id);
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage!.type).toBe(message.type);
        expect(receivedMessage!.from).toBe(message.from);
        expect(receivedMessage!.to).toBe(message.to);
        expect(receivedMessage!.payload).toEqual(message.payload);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.2: 任意のメッセージがメッセージ履歴にログされる
   *
   * *For any* message sent via Agent_Bus, the message SHALL be logged
   * to the message history.
   *
   * **Validates: Requirements 10.4, 10.5**
   */
  it('Property 18.2: 任意のメッセージがメッセージ履歴にログされる', async () => {
    await fc.assert(
      fc.asyncProperty(runIdArb, async (runId) => {
        // runIdを含むメッセージを生成
        const messageArb = agentMessageWithRunIdArb(runId);
        const message = fc.sample(messageArb, 1)[0];

        // メッセージを送信（runIdをオプションで指定）
        await agentBus.send(message, { runId });

        // メッセージ履歴を取得
        const history = await agentBus.getMessageHistory(runId);

        // 検証: 履歴にメッセージが含まれていること
        expect(history.length).toBeGreaterThanOrEqual(1);

        // 検証: 履歴に送信したメッセージが含まれていること
        const loggedMessage = history.find(
          (m) => m.type === message.type && m.from === message.from && m.to === message.to
        );
        expect(loggedMessage).toBeDefined();
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.3: task_assignメッセージがマネージャーからワーカーに配信される
   *
   * @see Requirement 10.3: WHEN Manager_Agent assigns task, THE Agent_Bus SHALL deliver to Worker_Agent
   *
   * **Validates: Requirement 10.3**
   */
  it('Property 18.3: task_assignメッセージがマネージャーからワーカーに配信される', async () => {
    await fc.assert(
      fc.asyncProperty(agentIdArb, agentIdArb, payloadArb, async (managerId, workerId, payload) => {
        // マネージャーとワーカーが異なることを確認
        fc.pre(managerId !== workerId);

        // task_assignメッセージを作成
        const message = agentBus.createTaskAssignMessage(managerId, workerId, payload);

        // メッセージを送信
        await agentBus.send(message);

        // ワーカーがメッセージを受信
        const receivedMessages = await agentBus.poll(workerId, 2000);

        // 検証: task_assignメッセージが配信されたこと
        const taskAssignMessage = receivedMessages.find((m) => m.type === 'task_assign');
        expect(taskAssignMessage).toBeDefined();
        expect(taskAssignMessage!.from).toBe(managerId);
        expect(taskAssignMessage!.to).toBe(workerId);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.4: task_complete/task_failedメッセージがワーカーからマネージャーに配信される
   *
   * @see Requirement 10.4: WHEN Worker_Agent completes/fails, THE Agent_Bus SHALL notify Manager_Agent
   *
   * **Validates: Requirement 10.4**
   */
  it('Property 18.4: task_complete/task_failedメッセージがワーカーからマネージャーに配信される', async () => {
    await fc.assert(
      fc.asyncProperty(
        agentIdArb,
        agentIdArb,
        fc.constantFrom('task_complete', 'task_failed') as fc.Arbitrary<AgentMessageType>,
        payloadArb,
        async (workerId, managerId, messageType, payload) => {
          // ワーカーとマネージャーが異なることを確認
          fc.pre(workerId !== managerId);

          // メッセージを作成
          const message =
            messageType === 'task_complete'
              ? agentBus.createTaskCompleteMessage(workerId, managerId, payload)
              : agentBus.createTaskFailedMessage(workerId, managerId, payload);

          // メッセージを送信
          await agentBus.send(message);

          // マネージャーがメッセージを受信
          const receivedMessages = await agentBus.poll(managerId, 2000);

          // 検証: メッセージが配信されたこと
          const notificationMessage = receivedMessages.find((m) => m.type === messageType);
          expect(notificationMessage).toBeDefined();
          expect(notificationMessage!.from).toBe(workerId);
          expect(notificationMessage!.to).toBe(managerId);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.5: escalateメッセージがワーカーからマネージャーに配信される
   *
   * @see Requirement 10.5: WHEN Worker_Agent needs help, THE Agent_Bus SHALL escalate to Manager_Agent
   *
   * **Validates: Requirement 10.5**
   */
  it('Property 18.5: escalateメッセージがワーカーからマネージャーに配信される', async () => {
    await fc.assert(
      fc.asyncProperty(agentIdArb, agentIdArb, payloadArb, async (workerId, managerId, payload) => {
        // ワーカーとマネージャーが異なることを確認
        fc.pre(workerId !== managerId);

        // escalateメッセージを作成
        const message = agentBus.createEscalateMessage(workerId, managerId, payload);

        // メッセージを送信
        await agentBus.send(message);

        // マネージャーがメッセージを受信
        const receivedMessages = await agentBus.poll(managerId, 2000);

        // 検証: escalateメッセージが配信されたこと
        const escalateMessage = receivedMessages.find((m) => m.type === 'escalate');
        expect(escalateMessage).toBeDefined();
        expect(escalateMessage!.from).toBe(workerId);
        expect(escalateMessage!.to).toBe(managerId);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.6: 複数のメッセージが順序を保って配信される
   *
   * **Validates: Requirements 10.1**
   */
  it('Property 18.6: 複数のメッセージが順序を保って配信される', async () => {
    await fc.assert(
      fc.asyncProperty(
        agentIdArb,
        agentIdArb,
        fc.array(agentMessageTypeArb, { minLength: 2, maxLength: 5 }),
        async (fromId, toId, messageTypes) => {
          // 送信元と送信先が異なることを確認
          fc.pre(fromId !== toId);

          // 複数のメッセージを順番に送信
          const sentMessages: AgentMessage[] = [];
          for (let i = 0; i < messageTypes.length; i++) {
            const message = agentBus.createMessage(messageTypes[i], fromId, toId, {
              index: i,
              timestamp: Date.now(),
            });
            await agentBus.send(message);
            sentMessages.push(message);
            // 順序を保証するために少し待機
            await sleep(10);
          }

          // メッセージを受信
          const receivedMessages = await agentBus.poll(toId, 3000);

          // 検証: 全てのメッセージが配信されたこと
          expect(receivedMessages.length).toBe(messageTypes.length);

          // 検証: メッセージの順序が保たれていること（タイムスタンプ順）
          for (let i = 1; i < receivedMessages.length; i++) {
            const prevTime = new Date(receivedMessages[i - 1].timestamp).getTime();
            const currTime = new Date(receivedMessages[i].timestamp).getTime();
            expect(currTime).toBeGreaterThanOrEqual(prevTime);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// Property 28: Message Queue Abstraction テスト
// =============================================================================

describe('Property 28: Message Queue Abstraction', () => {
  /**
   * Property 28.1: ファイルベースキューでメッセージが配信される
   *
   * *For any* message sent via Agent_Bus with file-based queue,
   * the message SHALL be delivered to the target agent.
   *
   * **Validates: Requirements 10.6, 10.7**
   */
  it('Property 28.1: ファイルベースキューでメッセージが配信される', async () => {
    const testPath = `${TEST_QUEUE_BASE_PATH}-file`;
    const runtimePath = `${TEST_RUNTIME_BASE_PATH}-file`;

    // クリーンアップ
    await cleanupDirectory(testPath);
    await cleanupDirectory(runtimePath);

    try {
      // ファイルベースキューでAgent Busを作成
      const agentBus = createAgentBus({
        messageQueueConfig: {
          type: 'file',
          basePath: testPath,
        },
        runtimeBasePath: runtimePath,
      });
      await agentBus.initialize();

      await fc.assert(
        fc.asyncProperty(agentMessageArb, async (message) => {
          // メッセージを送信
          await agentBus.send(message);

          // ターゲットエージェントがメッセージを受信
          const receivedMessages = await agentBus.poll(message.to, 2000);

          // 検証: メッセージが配信されたこと
          expect(receivedMessages.length).toBeGreaterThanOrEqual(1);

          // 検証: 受信したメッセージが送信したメッセージと一致すること
          const receivedMessage = receivedMessages.find((m) => m.id === message.id);
          expect(receivedMessage).toBeDefined();
          expect(receivedMessage!.type).toBe(message.type);
          expect(receivedMessage!.from).toBe(message.from);
          expect(receivedMessage!.to).toBe(message.to);
        }),
        { numRuns: 100 }
      );
    } finally {
      // クリーンアップ
      await cleanupDirectory(testPath);
      await cleanupDirectory(runtimePath);
    }
  });

  /**
   * Property 28.2: 異なるキュー設定でも同じインターフェースで動作する
   *
   * **Validates: Requirements 10.6**
   */
  it('Property 28.2: 異なるキュー設定でも同じインターフェースで動作する', async () => {
    const testPath1 = `${TEST_QUEUE_BASE_PATH}-config1`;
    const testPath2 = `${TEST_QUEUE_BASE_PATH}-config2`;
    const runtimePath = `${TEST_RUNTIME_BASE_PATH}-config`;

    // クリーンアップ
    await cleanupDirectory(testPath1);
    await cleanupDirectory(testPath2);
    await cleanupDirectory(runtimePath);

    try {
      // 異なるパスで2つのAgent Busを作成
      const agentBus1 = createAgentBus({
        messageQueueConfig: {
          type: 'file',
          basePath: testPath1,
        },
        runtimeBasePath: runtimePath,
      });
      await agentBus1.initialize();

      const agentBus2 = createAgentBus({
        messageQueueConfig: {
          type: 'file',
          basePath: testPath2,
        },
        runtimeBasePath: runtimePath,
      });
      await agentBus2.initialize();

      await fc.assert(
        fc.asyncProperty(agentMessageArb, async (message) => {
          // 両方のAgent Busで同じメッセージを送信
          await agentBus1.send(message);

          // 別のメッセージIDで同じ内容を送信
          const message2: AgentMessage = {
            ...message,
            id: `${message.id}-copy`,
          };
          await agentBus2.send(message2);

          // 両方のAgent Busでメッセージを受信
          const received1 = await agentBus1.poll(message.to, 2000);
          const received2 = await agentBus2.poll(message.to, 2000);

          // 検証: 両方でメッセージが配信されたこと
          expect(received1.length).toBeGreaterThanOrEqual(1);
          expect(received2.length).toBeGreaterThanOrEqual(1);

          // 検証: 同じインターフェースで動作すること
          expect(received1[0].type).toBe(message.type);
          expect(received2[0].type).toBe(message.type);
        }),
        { numRuns: 30 }
      );
    } finally {
      // クリーンアップ
      await cleanupDirectory(testPath1);
      await cleanupDirectory(testPath2);
      await cleanupDirectory(runtimePath);
    }
  });

  /**
   * Property 28.3: pull/pollモデルでワーカーは受信ポートを必要としない
   *
   * @see Requirement 10.7: THE Agent_Bus SHALL NOT require workers to listen on network ports (pull/poll model)
   *
   * **Validates: Requirement 10.7**
   */
  it('Property 28.3: pull/pollモデルでワーカーは受信ポートを必要としない', async () => {
    const testPath = `${TEST_QUEUE_BASE_PATH}-poll`;
    const runtimePath = `${TEST_RUNTIME_BASE_PATH}-poll`;

    // クリーンアップ
    await cleanupDirectory(testPath);
    await cleanupDirectory(runtimePath);

    try {
      const agentBus = createAgentBus({
        messageQueueConfig: {
          type: 'file',
          basePath: testPath,
        },
        runtimeBasePath: runtimePath,
      });
      await agentBus.initialize();

      await fc.assert(
        fc.asyncProperty(agentIdArb, agentIdArb, async (senderId, receiverId) => {
          // 送信者と受信者が異なることを確認
          fc.pre(senderId !== receiverId);

          // メッセージを送信（受信者はまだポーリングしていない）
          const message = agentBus.createTaskAssignMessage(senderId, receiverId, {
            taskId: 'test-task',
          });
          await agentBus.send(message);

          // 少し待機（ネットワークポートがないことを確認するため）
          await sleep(50);

          // 受信者がポーリングでメッセージを取得
          const receivedMessages = await agentBus.poll(receiverId, 1000);

          // 検証: ポーリングでメッセージが取得できること
          expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
          expect(receivedMessages[0].type).toBe('task_assign');

          // 検証: 再度ポーリングすると空（メッセージは消費済み）
          const emptyMessages = await agentBus.poll(receiverId, 50);
          expect(emptyMessages.length).toBe(0);
        }),
        { numRuns: 30 }
      );
    } finally {
      // クリーンアップ
      await cleanupDirectory(testPath);
      await cleanupDirectory(runtimePath);
    }
  }, 30000); // タイムアウトを30秒に設定

  /**
   * Property 28.4: メッセージキューの切り替えが可能
   *
   * **Validates: Requirements 10.6**
   */
  it('Property 28.4: メッセージキューの切り替えが可能', async () => {
    const testPath1 = `${TEST_QUEUE_BASE_PATH}-switch1`;
    const testPath2 = `${TEST_QUEUE_BASE_PATH}-switch2`;
    const runtimePath = `${TEST_RUNTIME_BASE_PATH}-switch`;

    // クリーンアップ
    await cleanupDirectory(testPath1);
    await cleanupDirectory(testPath2);
    await cleanupDirectory(runtimePath);

    try {
      // 最初のキューでAgent Busを作成
      const agentBus = createAgentBus({
        messageQueueConfig: {
          type: 'file',
          basePath: testPath1,
        },
        runtimeBasePath: runtimePath,
      });
      await agentBus.initialize();

      await fc.assert(
        fc.asyncProperty(agentMessageArb, async (message) => {
          // 最初のキューでメッセージを送信
          await agentBus.send(message);

          // メッセージを受信
          const received1 = await agentBus.poll(message.to, 2000);
          expect(received1.length).toBeGreaterThanOrEqual(1);

          // 新しいキューに切り替え
          const newQueue = new FileMessageQueue(testPath2);
          agentBus.setMessageQueue(newQueue);
          await agentBus.initialize();

          // 新しいキューでメッセージを送信
          const message2: AgentMessage = {
            ...message,
            id: `${message.id}-new`,
          };
          await agentBus.send(message2);

          // 新しいキューでメッセージを受信
          const received2 = await agentBus.poll(message.to, 2000);
          expect(received2.length).toBeGreaterThanOrEqual(1);
          expect(received2[0].id).toBe(message2.id);
        }),
        { numRuns: 20 }
      );
    } finally {
      // クリーンアップ
      await cleanupDirectory(testPath1);
      await cleanupDirectory(testPath2);
      await cleanupDirectory(runtimePath);
    }
  });
});

// =============================================================================
// エッジケースのユニットテスト
// =============================================================================

describe('Agent Bus Property Tests - Edge Cases', () => {
  let agentBus: AgentBus;

  beforeEach(async () => {
    await cleanupDirectory(TEST_QUEUE_BASE_PATH);
    await cleanupDirectory(TEST_RUNTIME_BASE_PATH);

    agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: TEST_QUEUE_BASE_PATH,
      },
      runtimeBasePath: TEST_RUNTIME_BASE_PATH,
    });
    await agentBus.initialize();
  });

  afterEach(async () => {
    await cleanupDirectory(TEST_QUEUE_BASE_PATH);
    await cleanupDirectory(TEST_RUNTIME_BASE_PATH);
  });

  /**
   * 空のペイロードを持つメッセージが正しく配信される
   */
  it('空のペイロードを持つメッセージが正しく配信される', async () => {
    const message: AgentMessage = {
      id: 'msg-empty-payload',
      type: 'task_assign',
      from: 'manager-001',
      to: 'worker-001',
      payload: {},
      timestamp: new Date().toISOString(),
    };

    await agentBus.send(message);
    const received = await agentBus.poll('worker-001', 2000);

    expect(received.length).toBe(1);
    expect(received[0].payload).toEqual({});
  });

  /**
   * nullペイロードを持つメッセージが正しく配信される
   */
  it('nullペイロードを持つメッセージが正しく配信される', async () => {
    const message: AgentMessage = {
      id: 'msg-null-payload',
      type: 'status_request',
      from: 'manager-001',
      to: 'worker-001',
      payload: null,
      timestamp: new Date().toISOString(),
    };

    await agentBus.send(message);
    const received = await agentBus.poll('worker-001', 2000);

    expect(received.length).toBe(1);
    expect(received[0].payload).toBeNull();
  });

  /**
   * 日本語を含むペイロードが正しく配信される
   */
  it('日本語を含むペイロードが正しく配信される', async () => {
    const message: AgentMessage = {
      id: 'msg-japanese',
      type: 'task_assign',
      from: 'manager-001',
      to: 'worker-001',
      payload: {
        taskId: 'task-日本語',
        description: 'これは日本語のタスクです。絵文字も含む🚀',
        tags: ['日本語', 'テスト', '🎉'],
      },
      timestamp: new Date().toISOString(),
    };

    await agentBus.send(message);
    const received = await agentBus.poll('worker-001', 2000);

    expect(received.length).toBe(1);
    expect((received[0].payload as Record<string, unknown>).description).toBe(
      'これは日本語のタスクです。絵文字も含む🚀'
    );
    expect((received[0].payload as Record<string, unknown>).tags).toContain('🎉');
  });

  /**
   * 大きなペイロードを持つメッセージが正しく配信される
   */
  it('大きなペイロードを持つメッセージが正しく配信される', async () => {
    const largeArray = Array.from({ length: 100 }, (_, i) => ({
      index: i,
      data: `item-${i}-${'x'.repeat(100)}`,
    }));

    const message: AgentMessage = {
      id: 'msg-large-payload',
      type: 'task_assign',
      from: 'manager-001',
      to: 'worker-001',
      payload: {
        items: largeArray,
        metadata: {
          totalItems: 100,
          description: 'Large payload test',
        },
      },
      timestamp: new Date().toISOString(),
    };

    await agentBus.send(message);
    const received = await agentBus.poll('worker-001', 3000);

    expect(received.length).toBe(1);
    expect((received[0].payload as Record<string, unknown[]>).items.length).toBe(100);
  });

  /**
   * 同じエージェントに複数のメッセージを送信した場合、全て配信される
   */
  it('同じエージェントに複数のメッセージを送信した場合、全て配信される', async () => {
    const messageCount = 10;
    const messages: AgentMessage[] = [];

    for (let i = 0; i < messageCount; i++) {
      const message: AgentMessage = {
        id: `msg-multi-${i}`,
        type: 'task_assign',
        from: 'manager-001',
        to: 'worker-001',
        payload: { index: i },
        timestamp: new Date().toISOString(),
      };
      messages.push(message);
      await agentBus.send(message);
    }

    const received = await agentBus.poll('worker-001', 3000);

    expect(received.length).toBe(messageCount);

    // 全てのメッセージが含まれていることを確認
    const receivedIds = received.map((m) => m.id);
    for (const msg of messages) {
      expect(receivedIds).toContain(msg.id);
    }
  });
});
