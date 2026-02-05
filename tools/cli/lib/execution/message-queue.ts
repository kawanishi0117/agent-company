/**
 * Message Queue Abstraction - メッセージキュー抽象化
 *
 * エージェント間通信のためのメッセージキュー抽象化レイヤー。
 * ファイルベース（デフォルト）、SQLite、Redisの3方式をサポートし、
 * pull/pollモデルでワーカーは受信ポートを必要としない。
 *
 * @module execution/message-queue
 * @see Requirements: 10.6, 10.7
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentId, AgentMessage, RunId } from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのメッセージキューベースパス
 * @see Requirement 10.6: File-based queue (default): `runtime/state/bus/` directory with JSON files
 */
const DEFAULT_QUEUE_BASE_PATH = 'runtime/state/bus';

/**
 * メッセージファイルの拡張子
 */
const MESSAGE_FILE_EXTENSION = '.json';

/**
 * ポーリングのデフォルトタイムアウト（ミリ秒）
 */
const DEFAULT_POLL_TIMEOUT = 5000;

/**
 * ポーリング間隔（ミリ秒）
 */
const POLL_INTERVAL = 100;

// =============================================================================
// 型定義
// =============================================================================

/**
 * メッセージキュー種別
 * @description 使用するメッセージキューの種類
 */
export type MessageQueueType = 'file' | 'sqlite' | 'redis';

/**
 * メッセージキュー設定
 * @description メッセージキューの設定情報
 * @see Requirement 10.6: THE Agent_Bus SHALL use Message Queue Abstraction supporting multiple backends
 */
export interface MessageQueueConfig {
  /** キュー種別 */
  type: MessageQueueType;

  /**
   * ファイルベースキューのベースパス
   * @description デフォルト: 'runtime/state/bus/'
   */
  basePath?: string;

  /**
   * SQLiteデータベースパス
   * @description SQLiteキュー使用時のDBファイルパス
   */
  dbPath?: string;

  /**
   * Redis接続URL
   * @description Redisキュー使用時の接続URL（分散デプロイ用）
   */
  redisUrl?: string;
}

/**
 * メッセージキューインターフェース
 * @description 全てのメッセージキュー実装が従うべきインターフェース
 * @see Requirement 10.7: THE Agent_Bus SHALL NOT require workers to listen on network ports (pull/poll model)
 */
export interface IMessageQueue {
  /**
   * キュー種別を取得
   * @returns キュー種別
   */
  readonly type: MessageQueueType;

  /**
   * メッセージを送信（キューに追加）
   * @param message - 送信するメッセージ
   */
  send(message: AgentMessage): Promise<void>;

  /**
   * メッセージをポーリング（pull/pollモデル）
   * @param agentId - ポーリングするエージェントID
   * @param timeout - タイムアウト（ミリ秒、オプション）
   * @returns 受信したメッセージの配列
   * @see Requirement 10.7: pull/poll model - workers don't need receiving ports
   */
  poll(agentId: AgentId, timeout?: number): Promise<AgentMessage[]>;

  /**
   * 全エージェントにメッセージをブロードキャスト
   * @param message - ブロードキャストするメッセージ
   * @param excludeAgentIds - 除外するエージェントID（オプション）
   */
  broadcast(message: AgentMessage, excludeAgentIds?: AgentId[]): Promise<void>;

  /**
   * 実行IDに関連するメッセージ履歴を取得
   * @param runId - 実行ID
   * @returns メッセージ履歴の配列
   */
  getMessageHistory(runId: RunId): Promise<AgentMessage[]>;

  /**
   * キューを初期化（必要なディレクトリ/テーブル作成など）
   */
  initialize(): Promise<void>;

  /**
   * キューをクリーンアップ（古いメッセージの削除など）
   * @param retentionDays - 保持日数
   */
  cleanup(retentionDays: number): Promise<void>;
}

// =============================================================================
// FileMessageQueue - ファイルベースメッセージキュー
// =============================================================================

/**
 * FileMessageQueue - ファイルベースメッセージキュー
 *
 * JSONファイルを使用したメッセージキュー実装。
 * デフォルトの実装として、Windows/WSL2互換性を確保。
 *
 * @see Requirement 10.6: File-based queue (default): `runtime/state/bus/` directory with JSON files
 * @see Requirement 10.7: pull/poll model - workers don't need receiving ports
 */
export class FileMessageQueue implements IMessageQueue {
  /** キュー種別 */
  public readonly type: MessageQueueType = 'file';

  /** ベースパス */
  private readonly basePath: string;

  /** 登録済みエージェントID一覧（ブロードキャスト用） */
  private registeredAgents: Set<AgentId> = new Set();

  /**
   * コンストラクタ
   * @param basePath - ベースパス（デフォルト: 'runtime/state/bus'）
   */
  constructor(basePath: string = DEFAULT_QUEUE_BASE_PATH) {
    this.basePath = basePath;
  }

  // ===========================================================================
  // ディレクトリ管理
  // ===========================================================================

  /**
   * エージェント用キューディレクトリのパスを取得
   * @param agentId - エージェントID
   * @returns キューディレクトリのパス
   */
  private getAgentQueueDir(agentId: AgentId): string {
    return path.join(this.basePath, 'queues', agentId);
  }

  /**
   * メッセージ履歴ディレクトリのパスを取得
   * @param runId - 実行ID
   * @returns 履歴ディレクトリのパス
   */
  private getHistoryDir(runId: RunId): string {
    return path.join(this.basePath, 'history', runId);
  }

  /**
   * メッセージファイルのパスを生成
   * @param agentId - エージェントID
   * @param messageId - メッセージID
   * @returns メッセージファイルのパス
   */
  private getMessageFilePath(agentId: AgentId, messageId: string): string {
    return path.join(this.getAgentQueueDir(agentId), `${messageId}${MESSAGE_FILE_EXTENSION}`);
  }

  /**
   * 履歴ファイルのパスを生成
   * @param runId - 実行ID
   * @param messageId - メッセージID
   * @returns 履歴ファイルのパス
   */
  private getHistoryFilePath(runId: RunId, messageId: string): string {
    return path.join(this.getHistoryDir(runId), `${messageId}${MESSAGE_FILE_EXTENSION}`);
  }

  // ===========================================================================
  // IMessageQueue実装
  // ===========================================================================

  /**
   * キューを初期化
   * @description 必要なディレクトリを作成
   */
  async initialize(): Promise<void> {
    // ベースディレクトリを作成
    await fs.mkdir(path.join(this.basePath, 'queues'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'history'), { recursive: true });
  }

  /**
   * メッセージを送信
   * @param message - 送信するメッセージ
   * @see Requirement 10.6: File-based queue with JSON files
   */
  async send(message: AgentMessage): Promise<void> {
    // 送信先エージェントのキューディレクトリを確保
    const queueDir = this.getAgentQueueDir(message.to);
    await fs.mkdir(queueDir, { recursive: true });

    // メッセージをJSONファイルとして保存
    const filePath = this.getMessageFilePath(message.to, message.id);
    const messageJson = JSON.stringify(message, null, 2);
    await fs.writeFile(filePath, messageJson, 'utf-8');

    // エージェントを登録（ブロードキャスト用）
    this.registeredAgents.add(message.to);
    this.registeredAgents.add(message.from);

    // 履歴にも保存（runIdがペイロードに含まれている場合）
    await this.saveToHistory(message);
  }

  /**
   * メッセージをポーリング
   * @param agentId - ポーリングするエージェントID
   * @param timeout - タイムアウト（ミリ秒）
   * @returns 受信したメッセージの配列
   * @see Requirement 10.7: pull/poll model
   */
  async poll(agentId: AgentId, timeout: number = DEFAULT_POLL_TIMEOUT): Promise<AgentMessage[]> {
    // エージェントを登録
    this.registeredAgents.add(agentId);

    const startTime = Date.now();
    const messages: AgentMessage[] = [];

    // タイムアウトまでポーリング
    while (Date.now() - startTime < timeout) {
      const newMessages = await this.fetchMessages(agentId);

      if (newMessages.length > 0) {
        messages.push(...newMessages);
        break; // メッセージを取得したらループを抜ける
      }

      // 短い間隔で再試行
      await this.sleep(POLL_INTERVAL);
    }

    return messages;
  }

  /**
   * メッセージをブロードキャスト
   * @param message - ブロードキャストするメッセージ
   * @param excludeAgentIds - 除外するエージェントID
   */
  async broadcast(message: AgentMessage, excludeAgentIds: AgentId[] = []): Promise<void> {
    // 登録済みエージェント全員に送信
    const excludeSet = new Set(excludeAgentIds);

    for (const agentId of this.registeredAgents) {
      // 除外リストに含まれていない場合のみ送信
      if (!excludeSet.has(agentId) && agentId !== message.from) {
        const broadcastMessage: AgentMessage = {
          ...message,
          id: `${message.id}-${agentId}`, // ユニークIDを生成
          to: agentId,
        };
        await this.send(broadcastMessage);
      }
    }
  }

  /**
   * メッセージ履歴を取得
   * @param runId - 実行ID
   * @returns メッセージ履歴の配列
   */
  async getMessageHistory(runId: RunId): Promise<AgentMessage[]> {
    const historyDir = this.getHistoryDir(runId);

    try {
      const files = await fs.readdir(historyDir);
      const jsonFiles = files.filter((f) => f.endsWith(MESSAGE_FILE_EXTENSION));

      const messages: AgentMessage[] = [];

      for (const file of jsonFiles) {
        const filePath = path.join(historyDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const message = JSON.parse(content) as AgentMessage;
        messages.push(message);
      }

      // タイムスタンプでソート
      messages.sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

      return messages;
    } catch (error) {
      // ディレクトリが存在しない場合は空配列を返す
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * 古いメッセージをクリーンアップ
   * @param retentionDays - 保持日数
   */
  async cleanup(retentionDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // 履歴ディレクトリのクリーンアップ
    await this.cleanupDirectory(path.join(this.basePath, 'history'), cutoffDate);

    // キューディレクトリのクリーンアップ
    await this.cleanupDirectory(path.join(this.basePath, 'queues'), cutoffDate);
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * エージェントのキューからメッセージを取得して削除
   * @param agentId - エージェントID
   * @returns 取得したメッセージの配列
   */
  private async fetchMessages(agentId: AgentId): Promise<AgentMessage[]> {
    const queueDir = this.getAgentQueueDir(agentId);
    const messages: AgentMessage[] = [];

    try {
      const files = await fs.readdir(queueDir);
      const jsonFiles = files.filter((f) => f.endsWith(MESSAGE_FILE_EXTENSION));

      for (const file of jsonFiles) {
        const filePath = path.join(queueDir, file);

        try {
          // メッセージを読み込み
          const content = await fs.readFile(filePath, 'utf-8');
          const message = JSON.parse(content) as AgentMessage;
          messages.push(message);

          // 読み込んだメッセージを削除（消費済み）
          await fs.unlink(filePath);
        } catch (readError) {
          // 読み込み中に他のプロセスが削除した場合は無視
          if (!this.isFileNotFoundError(readError)) {
            throw readError;
          }
        }
      }
    } catch (error) {
      // ディレクトリが存在しない場合は空配列を返す
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    // タイムスタンプでソート
    messages.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    return messages;
  }

  /**
   * メッセージを履歴に保存
   * @param message - 保存するメッセージ
   */
  private async saveToHistory(message: AgentMessage): Promise<void> {
    // ペイロードからrunIdを抽出（存在する場合）
    const payload = message.payload as Record<string, unknown> | null;
    const runId = payload?.runId as string | undefined;

    if (runId) {
      const historyDir = this.getHistoryDir(runId);
      await fs.mkdir(historyDir, { recursive: true });

      const filePath = this.getHistoryFilePath(runId, message.id);
      const messageJson = JSON.stringify(message, null, 2);
      await fs.writeFile(filePath, messageJson, 'utf-8');
    }
  }

  /**
   * ディレクトリ内の古いファイルをクリーンアップ
   * @param dirPath - ディレクトリパス
   * @param cutoffDate - カットオフ日時
   */
  private async cleanupDirectory(dirPath: string, cutoffDate: Date): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // サブディレクトリを再帰的にクリーンアップ
          await this.cleanupDirectory(entryPath, cutoffDate);

          // 空のディレクトリを削除
          try {
            const subEntries = await fs.readdir(entryPath);
            if (subEntries.length === 0) {
              await fs.rmdir(entryPath);
            }
          } catch {
            // 削除に失敗しても続行
          }
        } else if (entry.isFile() && entry.name.endsWith(MESSAGE_FILE_EXTENSION)) {
          // ファイルの更新日時をチェック
          const stat = await fs.stat(entryPath);
          if (stat.mtime < cutoffDate) {
            await fs.unlink(entryPath);
          }
        }
      }
    } catch (error) {
      // ディレクトリが存在しない場合は無視
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * ファイルが存在しないエラーかどうかを判定
   * @param error - エラーオブジェクト
   * @returns ファイルが存在しないエラーの場合はtrue
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }

  /**
   * 指定ミリ秒スリープ
   * @param ms - スリープ時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 登録済みエージェントを追加（テスト用）
   * @param agentId - エージェントID
   */
  registerAgent(agentId: AgentId): void {
    this.registeredAgents.add(agentId);
  }

  /**
   * 登録済みエージェント一覧を取得（テスト用）
   * @returns 登録済みエージェントIDの配列
   */
  getRegisteredAgents(): AgentId[] {
    return Array.from(this.registeredAgents);
  }
}

// =============================================================================
// SQLiteMessageQueue - SQLiteメッセージキュー（スタブ実装）
// =============================================================================

/**
 * SQLiteMessageQueue - SQLiteメッセージキュー
 *
 * SQLiteを使用したメッセージキュー実装。
 * 高スループットシナリオ向け。
 *
 * @see Requirement 10.6: SQLite queue: For higher throughput scenarios
 * @note 現在はスタブ実装。将来の拡張で完全実装予定。
 */
export class SQLiteMessageQueue implements IMessageQueue {
  /** キュー種別 */
  public readonly type: MessageQueueType = 'sqlite';

  /** データベースパス */
  private readonly dbPath: string;

  /**
   * コンストラクタ
   * @param dbPath - データベースファイルパス
   */
  constructor(dbPath: string = 'runtime/state/bus/messages.db') {
    this.dbPath = dbPath;
  }

  /**
   * キューを初期化
   * @throws NotImplementedError - 未実装
   */
  async initialize(): Promise<void> {
    // TODO: SQLiteデータベースとテーブルを作成
    throw new Error('SQLiteMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージを送信
   * @param _message - 送信するメッセージ
   * @throws NotImplementedError - 未実装
   */
  async send(_message: AgentMessage): Promise<void> {
    throw new Error('SQLiteMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージをポーリング
   * @param _agentId - ポーリングするエージェントID
   * @param _timeout - タイムアウト（ミリ秒）
   * @throws NotImplementedError - 未実装
   */
  async poll(_agentId: AgentId, _timeout?: number): Promise<AgentMessage[]> {
    throw new Error('SQLiteMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージをブロードキャスト
   * @param _message - ブロードキャストするメッセージ
   * @param _excludeAgentIds - 除外するエージェントID
   * @throws NotImplementedError - 未実装
   */
  async broadcast(_message: AgentMessage, _excludeAgentIds?: AgentId[]): Promise<void> {
    throw new Error('SQLiteMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージ履歴を取得
   * @param _runId - 実行ID
   * @throws NotImplementedError - 未実装
   */
  async getMessageHistory(_runId: RunId): Promise<AgentMessage[]> {
    throw new Error('SQLiteMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * 古いメッセージをクリーンアップ
   * @param _retentionDays - 保持日数
   * @throws NotImplementedError - 未実装
   */
  async cleanup(_retentionDays: number): Promise<void> {
    throw new Error('SQLiteMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * データベースパスを取得（テスト用）
   * @returns データベースパス
   */
  getDbPath(): string {
    return this.dbPath;
  }
}

// =============================================================================
// RedisMessageQueue - Redisメッセージキュー（スタブ実装）
// =============================================================================

/**
 * RedisMessageQueue - Redisメッセージキュー
 *
 * Redisを使用したメッセージキュー実装。
 * 分散デプロイ向け。
 *
 * @see Requirement 10.6: Redis queue: Optional for distributed deployments
 * @note 現在はスタブ実装。将来の拡張で完全実装予定。
 */
export class RedisMessageQueue implements IMessageQueue {
  /** キュー種別 */
  public readonly type: MessageQueueType = 'redis';

  /** Redis接続URL */
  private readonly redisUrl: string;

  /**
   * コンストラクタ
   * @param redisUrl - Redis接続URL
   */
  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.redisUrl = redisUrl;
  }

  /**
   * キューを初期化
   * @throws NotImplementedError - 未実装
   */
  async initialize(): Promise<void> {
    // TODO: Redis接続を確立
    throw new Error('RedisMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージを送信
   * @param _message - 送信するメッセージ
   * @throws NotImplementedError - 未実装
   */
  async send(_message: AgentMessage): Promise<void> {
    throw new Error('RedisMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージをポーリング
   * @param _agentId - ポーリングするエージェントID
   * @param _timeout - タイムアウト（ミリ秒）
   * @throws NotImplementedError - 未実装
   */
  async poll(_agentId: AgentId, _timeout?: number): Promise<AgentMessage[]> {
    throw new Error('RedisMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージをブロードキャスト
   * @param _message - ブロードキャストするメッセージ
   * @param _excludeAgentIds - 除外するエージェントID
   * @throws NotImplementedError - 未実装
   */
  async broadcast(_message: AgentMessage, _excludeAgentIds?: AgentId[]): Promise<void> {
    throw new Error('RedisMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * メッセージ履歴を取得
   * @param _runId - 実行ID
   * @throws NotImplementedError - 未実装
   */
  async getMessageHistory(_runId: RunId): Promise<AgentMessage[]> {
    throw new Error('RedisMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * 古いメッセージをクリーンアップ
   * @param _retentionDays - 保持日数
   * @throws NotImplementedError - 未実装
   */
  async cleanup(_retentionDays: number): Promise<void> {
    throw new Error('RedisMessageQueue is not yet implemented. Use FileMessageQueue instead.');
  }

  /**
   * Redis接続URLを取得（テスト用）
   * @returns Redis接続URL
   */
  getRedisUrl(): string {
    return this.redisUrl;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * メッセージキューを作成
 *
 * 設定に基づいて適切なメッセージキュー実装を返す。
 *
 * @param config - メッセージキュー設定
 * @returns メッセージキューインスタンス
 * @throws Error - 未サポートのキュー種別の場合
 *
 * @example
 * ```typescript
 * // ファイルベースキュー（デフォルト）
 * const fileQueue = createMessageQueue({ type: 'file' });
 *
 * // カスタムパスのファイルベースキュー
 * const customQueue = createMessageQueue({
 *   type: 'file',
 *   basePath: '/custom/path/bus'
 * });
 *
 * // SQLiteキュー（将来実装）
 * const sqliteQueue = createMessageQueue({
 *   type: 'sqlite',
 *   dbPath: '/path/to/messages.db'
 * });
 *
 * // Redisキュー（将来実装）
 * const redisQueue = createMessageQueue({
 *   type: 'redis',
 *   redisUrl: 'redis://localhost:6379'
 * });
 * ```
 */
export function createMessageQueue(config: MessageQueueConfig): IMessageQueue {
  switch (config.type) {
    case 'file':
      return new FileMessageQueue(config.basePath);

    case 'sqlite':
      return new SQLiteMessageQueue(config.dbPath);

    case 'redis':
      return new RedisMessageQueue(config.redisUrl);

    default:
      throw new Error(`Unsupported message queue type: ${(config as MessageQueueConfig).type}`);
  }
}

/**
 * デフォルトのメッセージキュー設定
 * @description ファイルベースキューをデフォルトとして使用
 */
export const DEFAULT_MESSAGE_QUEUE_CONFIG: MessageQueueConfig = {
  type: 'file',
  basePath: DEFAULT_QUEUE_BASE_PATH,
};

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのメッセージキューインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const defaultMessageQueue = new FileMessageQueue();
