/**
 * Message Queue ユニットテスト
 *
 * メッセージキュー抽象化のテスト。
 * ファイルベース（デフォルト）、SQLite、Redisの3方式をサポートし、
 * pull/pollモデルでワーカーは受信ポートを必要としない。
 *
 * **Validates: Requirements 10.6, 10.7**
 *
 * @module tests/execution/message-queue.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  FileMessageQueue,
  SQLiteMessageQueue,
  RedisMessageQueue,
  createMessageQueue,
  DEFAULT_MESSAGE_QUEUE_CONFIG,
  IMessageQueue,
  MessageQueueConfig,
} from '../../tools/cli/lib/execution/message-queue';
import { AgentMessage, AgentMessageType } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
const TEST_QUEUE_DIR = 'runtime/state/test-message-queue';

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * テスト用のAgentMessageを生成
 * @param overrides - 上書きするフィールド
 * @returns AgentMessage
 */
function createTestMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    type: 'task_assign' as AgentMessageType,
    from: 'manager-001',
    to: 'worker-001',
    payload: { taskId: 'task-001', description: 'Test task' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * ディレクトリを再帰的に削除
 * @param dirPath - 削除するディレクトリパス
 */
async function removeDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // ディレクトリが存在しない場合は無視
  }
}

// =============================================================================
// FileMessageQueue テスト
// =============================================================================

describe('FileMessageQueue', () => {
  let queue: FileMessageQueue;

  beforeEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await removeDirectory(TEST_QUEUE_DIR);
    queue = new FileMessageQueue(TEST_QUEUE_DIR);
    await queue.initialize();
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    await removeDirectory(TEST_QUEUE_DIR);
  });

  describe('type', () => {
    it('キュー種別が"file"であること', () => {
      expect(queue.type).toBe('file');
    });
  });

  describe('initialize', () => {
    it('必要なディレクトリが作成されること', async () => {
      // queuesディレクトリの存在確認
      const queuesDir = path.join(TEST_QUEUE_DIR, 'queues');
      const queuesStat = await fs.stat(queuesDir);
      expect(queuesStat.isDirectory()).toBe(true);

      // historyディレクトリの存在確認
      const historyDir = path.join(TEST_QUEUE_DIR, 'history');
      const historyStat = await fs.stat(historyDir);
      expect(historyStat.isDirectory()).toBe(true);
    });
  });

  describe('send', () => {
    /**
     * @see Requirement 10.6: File-based queue with JSON files
     */
    it('メッセージがJSONファイルとして保存されること', async () => {
      const message = createTestMessage();
      await queue.send(message);

      // ファイルが作成されていることを確認
      const queueDir = path.join(TEST_QUEUE_DIR, 'queues', message.to);
      const files = await fs.readdir(queueDir);
      expect(files.length).toBe(1);
      expect(files[0]).toContain('.json');

      // ファイル内容を確認
      const filePath = path.join(queueDir, files[0]);
      const content = await fs.readFile(filePath, 'utf-8');
      const savedMessage = JSON.parse(content);
      expect(savedMessage.id).toBe(message.id);
      expect(savedMessage.type).toBe(message.type);
      expect(savedMessage.from).toBe(message.from);
      expect(savedMessage.to).toBe(message.to);
    });

    it('送信元と送信先のエージェントが登録されること', async () => {
      const message = createTestMessage();
      await queue.send(message);

      const registeredAgents = queue.getRegisteredAgents();
      expect(registeredAgents).toContain(message.from);
      expect(registeredAgents).toContain(message.to);
    });
  });

  describe('poll', () => {
    /**
     * @see Requirement 10.7: pull/poll model - workers don't need receiving ports
     */
    it('送信されたメッセージをポーリングで取得できること', async () => {
      const message = createTestMessage();
      await queue.send(message);

      // ポーリングでメッセージを取得
      const messages = await queue.poll(message.to, 1000);
      expect(messages.length).toBe(1);
      expect(messages[0].id).toBe(message.id);
    });

    it('メッセージ取得後はキューから削除されること', async () => {
      const message = createTestMessage();
      await queue.send(message);

      // 1回目のポーリング
      const messages1 = await queue.poll(message.to, 1000);
      expect(messages1.length).toBe(1);

      // 2回目のポーリング（メッセージは削除済み）
      const messages2 = await queue.poll(message.to, 100);
      expect(messages2.length).toBe(0);
    });

    it('複数のメッセージがタイムスタンプ順にソートされること', async () => {
      const message1 = createTestMessage({
        id: 'msg-1',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      const message2 = createTestMessage({
        id: 'msg-2',
        timestamp: '2024-01-01T00:00:01.000Z',
      });
      const message3 = createTestMessage({
        id: 'msg-3',
        timestamp: '2024-01-01T00:00:02.000Z',
      });

      // 順番をバラバラに送信
      await queue.send(message3);
      await queue.send(message1);
      await queue.send(message2);

      // ポーリングで取得
      const messages = await queue.poll(message1.to, 1000);
      expect(messages.length).toBe(3);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[1].id).toBe('msg-2');
      expect(messages[2].id).toBe('msg-3');
    });

    it('タイムアウト内にメッセージがない場合は空配列を返すこと', async () => {
      const messages = await queue.poll('non-existent-agent', 100);
      expect(messages).toEqual([]);
    });

    it('ポーリング中にエージェントが登録されること', async () => {
      await queue.poll('new-agent', 100);
      const registeredAgents = queue.getRegisteredAgents();
      expect(registeredAgents).toContain('new-agent');
    });
  });

  describe('broadcast', () => {
    it('登録済みの全エージェントにメッセージが送信されること', async () => {
      // エージェントを登録
      queue.registerAgent('worker-001');
      queue.registerAgent('worker-002');
      queue.registerAgent('worker-003');

      const message = createTestMessage({
        from: 'manager-001',
        to: 'broadcast', // ブロードキャスト用
      });

      await queue.broadcast(message);

      // 各ワーカーがメッセージを受信できることを確認
      const messages1 = await queue.poll('worker-001', 100);
      const messages2 = await queue.poll('worker-002', 100);
      const messages3 = await queue.poll('worker-003', 100);

      expect(messages1.length).toBe(1);
      expect(messages2.length).toBe(1);
      expect(messages3.length).toBe(1);
    });

    it('送信元エージェントには送信されないこと', async () => {
      queue.registerAgent('manager-001');
      queue.registerAgent('worker-001');

      const message = createTestMessage({
        from: 'manager-001',
        to: 'broadcast',
      });

      await queue.broadcast(message);

      // 送信元にはメッセージがないことを確認
      const managerMessages = await queue.poll('manager-001', 100);
      expect(managerMessages.length).toBe(0);
    });

    it('除外リストのエージェントには送信されないこと', async () => {
      queue.registerAgent('worker-001');
      queue.registerAgent('worker-002');
      queue.registerAgent('worker-003');

      const message = createTestMessage({
        from: 'manager-001',
        to: 'broadcast',
      });

      await queue.broadcast(message, ['worker-002']);

      // worker-002にはメッセージがないことを確認
      const messages1 = await queue.poll('worker-001', 100);
      const messages2 = await queue.poll('worker-002', 100);
      const messages3 = await queue.poll('worker-003', 100);

      expect(messages1.length).toBe(1);
      expect(messages2.length).toBe(0);
      expect(messages3.length).toBe(1);
    });
  });

  describe('getMessageHistory', () => {
    it('runIdを含むメッセージが履歴に保存されること', async () => {
      const runId = 'run-001';
      const message = createTestMessage({
        payload: { runId, taskId: 'task-001' },
      });

      await queue.send(message);

      // 履歴を取得
      const history = await queue.getMessageHistory(runId);
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(message.id);
    });

    it('履歴がタイムスタンプ順にソートされること', async () => {
      const runId = 'run-002';
      const message1 = createTestMessage({
        id: 'msg-1',
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { runId },
      });
      const message2 = createTestMessage({
        id: 'msg-2',
        timestamp: '2024-01-01T00:00:01.000Z',
        payload: { runId },
      });

      await queue.send(message2);
      await queue.send(message1);

      const history = await queue.getMessageHistory(runId);
      expect(history.length).toBe(2);
      expect(history[0].id).toBe('msg-1');
      expect(history[1].id).toBe('msg-2');
    });

    it('存在しないrunIdの場合は空配列を返すこと', async () => {
      const history = await queue.getMessageHistory('non-existent-run');
      expect(history).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('古いメッセージファイルが削除されること', async () => {
      // メッセージを送信
      const message = createTestMessage();
      await queue.send(message);

      // ファイルが存在することを確認
      const queueDir = path.join(TEST_QUEUE_DIR, 'queues', message.to);
      let files = await fs.readdir(queueDir);
      expect(files.length).toBe(1);

      // ファイルの更新日時を過去に設定（2日前）
      const filePath = path.join(queueDir, files[0]);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      await fs.utimes(filePath, pastDate, pastDate);

      // クリーンアップ（1日保持 = 2日前のファイルは削除）
      await queue.cleanup(1);

      // ファイルが削除されていることを確認
      // 空のディレクトリも削除される可能性があるため、ディレクトリの存在も確認
      try {
        files = await fs.readdir(queueDir);
        expect(files.length).toBe(0);
      } catch (error) {
        // ディレクトリが削除された場合はENOENTエラーが発生するが、これは期待通りの動作
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // ディレクトリが削除されたことは、クリーンアップが成功したことを意味する
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    });
  });
});

// =============================================================================
// SQLiteMessageQueue テスト
// =============================================================================

describe('SQLiteMessageQueue', () => {
  it('キュー種別が"sqlite"であること', () => {
    const queue = new SQLiteMessageQueue();
    expect(queue.type).toBe('sqlite');
  });

  it('デフォルトのデータベースパスが設定されること', () => {
    const queue = new SQLiteMessageQueue();
    expect(queue.getDbPath()).toBe('runtime/state/bus/messages.db');
  });

  it('カスタムデータベースパスが設定できること', () => {
    const customPath = '/custom/path/messages.db';
    const queue = new SQLiteMessageQueue(customPath);
    expect(queue.getDbPath()).toBe(customPath);
  });

  /**
   * @see Requirement 10.6: SQLite queue: For higher throughput scenarios
   * @note 現在はスタブ実装のため、NotImplementedErrorをスロー
   */
  it('initialize()が未実装エラーをスローすること', async () => {
    const queue = new SQLiteMessageQueue();
    await expect(queue.initialize()).rejects.toThrow('SQLiteMessageQueue is not yet implemented');
  });

  it('send()が未実装エラーをスローすること', async () => {
    const queue = new SQLiteMessageQueue();
    const message = createTestMessage();
    await expect(queue.send(message)).rejects.toThrow('SQLiteMessageQueue is not yet implemented');
  });

  it('poll()が未実装エラーをスローすること', async () => {
    const queue = new SQLiteMessageQueue();
    await expect(queue.poll('agent-001')).rejects.toThrow('SQLiteMessageQueue is not yet implemented');
  });

  it('broadcast()が未実装エラーをスローすること', async () => {
    const queue = new SQLiteMessageQueue();
    const message = createTestMessage();
    await expect(queue.broadcast(message)).rejects.toThrow('SQLiteMessageQueue is not yet implemented');
  });

  it('getMessageHistory()が未実装エラーをスローすること', async () => {
    const queue = new SQLiteMessageQueue();
    await expect(queue.getMessageHistory('run-001')).rejects.toThrow('SQLiteMessageQueue is not yet implemented');
  });

  it('cleanup()が未実装エラーをスローすること', async () => {
    const queue = new SQLiteMessageQueue();
    await expect(queue.cleanup(7)).rejects.toThrow('SQLiteMessageQueue is not yet implemented');
  });
});

// =============================================================================
// RedisMessageQueue テスト
// =============================================================================

describe('RedisMessageQueue', () => {
  it('キュー種別が"redis"であること', () => {
    const queue = new RedisMessageQueue();
    expect(queue.type).toBe('redis');
  });

  it('デフォルトのRedis URLが設定されること', () => {
    const queue = new RedisMessageQueue();
    expect(queue.getRedisUrl()).toBe('redis://localhost:6379');
  });

  it('カスタムRedis URLが設定できること', () => {
    const customUrl = 'redis://custom-host:6380';
    const queue = new RedisMessageQueue(customUrl);
    expect(queue.getRedisUrl()).toBe(customUrl);
  });

  /**
   * @see Requirement 10.6: Redis queue: Optional for distributed deployments
   * @note 現在はスタブ実装のため、NotImplementedErrorをスロー
   */
  it('initialize()が未実装エラーをスローすること', async () => {
    const queue = new RedisMessageQueue();
    await expect(queue.initialize()).rejects.toThrow('RedisMessageQueue is not yet implemented');
  });

  it('send()が未実装エラーをスローすること', async () => {
    const queue = new RedisMessageQueue();
    const message = createTestMessage();
    await expect(queue.send(message)).rejects.toThrow('RedisMessageQueue is not yet implemented');
  });

  it('poll()が未実装エラーをスローすること', async () => {
    const queue = new RedisMessageQueue();
    await expect(queue.poll('agent-001')).rejects.toThrow('RedisMessageQueue is not yet implemented');
  });

  it('broadcast()が未実装エラーをスローすること', async () => {
    const queue = new RedisMessageQueue();
    const message = createTestMessage();
    await expect(queue.broadcast(message)).rejects.toThrow('RedisMessageQueue is not yet implemented');
  });

  it('getMessageHistory()が未実装エラーをスローすること', async () => {
    const queue = new RedisMessageQueue();
    await expect(queue.getMessageHistory('run-001')).rejects.toThrow('RedisMessageQueue is not yet implemented');
  });

  it('cleanup()が未実装エラーをスローすること', async () => {
    const queue = new RedisMessageQueue();
    await expect(queue.cleanup(7)).rejects.toThrow('RedisMessageQueue is not yet implemented');
  });
});

// =============================================================================
// createMessageQueue ファクトリ関数テスト
// =============================================================================

describe('createMessageQueue', () => {
  /**
   * @see Requirement 10.6: THE Agent_Bus SHALL use Message Queue Abstraction supporting multiple backends
   */
  it('type="file"でFileMessageQueueが作成されること', () => {
    const config: MessageQueueConfig = { type: 'file' };
    const queue = createMessageQueue(config);
    expect(queue.type).toBe('file');
    expect(queue).toBeInstanceOf(FileMessageQueue);
  });

  it('type="file"でカスタムbasePathが設定できること', () => {
    const config: MessageQueueConfig = {
      type: 'file',
      basePath: '/custom/path',
    };
    const queue = createMessageQueue(config);
    expect(queue.type).toBe('file');
  });

  it('type="sqlite"でSQLiteMessageQueueが作成されること', () => {
    const config: MessageQueueConfig = { type: 'sqlite' };
    const queue = createMessageQueue(config);
    expect(queue.type).toBe('sqlite');
    expect(queue).toBeInstanceOf(SQLiteMessageQueue);
  });

  it('type="sqlite"でカスタムdbPathが設定できること', () => {
    const config: MessageQueueConfig = {
      type: 'sqlite',
      dbPath: '/custom/path/messages.db',
    };
    const queue = createMessageQueue(config);
    expect(queue.type).toBe('sqlite');
  });

  it('type="redis"でRedisMessageQueueが作成されること', () => {
    const config: MessageQueueConfig = { type: 'redis' };
    const queue = createMessageQueue(config);
    expect(queue.type).toBe('redis');
    expect(queue).toBeInstanceOf(RedisMessageQueue);
  });

  it('type="redis"でカスタムredisUrlが設定できること', () => {
    const config: MessageQueueConfig = {
      type: 'redis',
      redisUrl: 'redis://custom-host:6380',
    };
    const queue = createMessageQueue(config);
    expect(queue.type).toBe('redis');
  });

  it('未サポートのキュー種別でエラーがスローされること', () => {
    const config = { type: 'unknown' } as unknown as MessageQueueConfig;
    expect(() => createMessageQueue(config)).toThrow('Unsupported message queue type');
  });
});

// =============================================================================
// DEFAULT_MESSAGE_QUEUE_CONFIG テスト
// =============================================================================

describe('DEFAULT_MESSAGE_QUEUE_CONFIG', () => {
  it('デフォルト設定がファイルベースであること', () => {
    expect(DEFAULT_MESSAGE_QUEUE_CONFIG.type).toBe('file');
  });

  it('デフォルトのbasePathが設定されていること', () => {
    expect(DEFAULT_MESSAGE_QUEUE_CONFIG.basePath).toBe('runtime/state/bus');
  });
});

// =============================================================================
// IMessageQueue インターフェース準拠テスト
// =============================================================================

describe('IMessageQueue Interface Compliance', () => {
  /**
   * 全てのメッセージキュー実装がIMessageQueueインターフェースに準拠していることを確認
   */
  const implementations: Array<{ name: string; create: () => IMessageQueue }> = [
    { name: 'FileMessageQueue', create: () => new FileMessageQueue(TEST_QUEUE_DIR) },
    { name: 'SQLiteMessageQueue', create: () => new SQLiteMessageQueue() },
    { name: 'RedisMessageQueue', create: () => new RedisMessageQueue() },
  ];

  implementations.forEach(({ name, create }) => {
    describe(name, () => {
      it('typeプロパティを持つこと', () => {
        const queue = create();
        expect(typeof queue.type).toBe('string');
      });

      it('send()メソッドを持つこと', () => {
        const queue = create();
        expect(typeof queue.send).toBe('function');
      });

      it('poll()メソッドを持つこと', () => {
        const queue = create();
        expect(typeof queue.poll).toBe('function');
      });

      it('broadcast()メソッドを持つこと', () => {
        const queue = create();
        expect(typeof queue.broadcast).toBe('function');
      });

      it('getMessageHistory()メソッドを持つこと', () => {
        const queue = create();
        expect(typeof queue.getMessageHistory).toBe('function');
      });

      it('initialize()メソッドを持つこと', () => {
        const queue = create();
        expect(typeof queue.initialize).toBe('function');
      });

      it('cleanup()メソッドを持つこと', () => {
        const queue = create();
        expect(typeof queue.cleanup).toBe('function');
      });
    });
  });
});

// =============================================================================
// pull/pollモデル検証テスト
// =============================================================================

describe('Pull/Poll Model Verification', () => {
  let queue: FileMessageQueue;

  beforeEach(async () => {
    await removeDirectory(TEST_QUEUE_DIR);
    queue = new FileMessageQueue(TEST_QUEUE_DIR);
    await queue.initialize();
  });

  afterEach(async () => {
    await removeDirectory(TEST_QUEUE_DIR);
  });

  /**
   * @see Requirement 10.7: THE Agent_Bus SHALL NOT require workers to listen on network ports (pull/poll model)
   */
  it('ワーカーがネットワークポートなしでメッセージを受信できること', async () => {
    // マネージャーがタスクを送信
    const taskMessage = createTestMessage({
      type: 'task_assign',
      from: 'manager-001',
      to: 'worker-001',
      payload: { taskId: 'task-001', description: 'Implement feature X' },
    });
    await queue.send(taskMessage);

    // ワーカーがポーリングでメッセージを取得（ネットワークポート不要）
    const messages = await queue.poll('worker-001', 1000);
    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe('task_assign');
    expect((messages[0].payload as { taskId: string }).taskId).toBe('task-001');
  });

  it('複数のワーカーが独立してポーリングできること', async () => {
    // 各ワーカーにタスクを送信
    await queue.send(createTestMessage({ to: 'worker-001', payload: { taskId: 'task-001' } }));
    await queue.send(createTestMessage({ to: 'worker-002', payload: { taskId: 'task-002' } }));
    await queue.send(createTestMessage({ to: 'worker-003', payload: { taskId: 'task-003' } }));

    // 各ワーカーが独立してポーリング
    const messages1 = await queue.poll('worker-001', 100);
    const messages2 = await queue.poll('worker-002', 100);
    const messages3 = await queue.poll('worker-003', 100);

    expect(messages1.length).toBe(1);
    expect(messages2.length).toBe(1);
    expect(messages3.length).toBe(1);
    expect((messages1[0].payload as { taskId: string }).taskId).toBe('task-001');
    expect((messages2[0].payload as { taskId: string }).taskId).toBe('task-002');
    expect((messages3[0].payload as { taskId: string }).taskId).toBe('task-003');
  });
});
