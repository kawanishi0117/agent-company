/**
 * Agent Bus - エージェント間通信バス
 *
 * エージェント間のメッセージパッシングを担当するコンポーネント。
 * Message Queue Abstractionを使用してメッセージの送受信を行い、
 * pull/pollモデルでワーカーは受信ポートを必要としない。
 *
 * @module execution/agent-bus
 * @see Requirements: 10.1, 10.2
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { AgentId, AgentMessage, AgentMessageType, RunId } from './types';
import {
  IMessageQueue,
  FileMessageQueue,
  createMessageQueue,
  MessageQueueConfig,
} from './message-queue';
import type { ChatLogCapture, ChatLogType } from './chat-log-capture';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのポーリングタイムアウト（ミリ秒）
 */
const DEFAULT_POLL_TIMEOUT = 5000;

/**
 * メッセージログファイル名
 * @see Requirement 10.8: THE message history SHALL be logged to `runtime/runs/<run-id>/messages.log`
 */
const MESSAGE_LOG_FILENAME = 'messages.log';

/**
 * ブロードキャスト用の特殊エージェントID
 */
const BROADCAST_AGENT_ID = '__broadcast__';

// =============================================================================
// 型定義
// =============================================================================

/**
 * Agent Busの設定
 */
export interface AgentBusConfig {
  /** メッセージキュー設定 */
  messageQueueConfig?: MessageQueueConfig;
  /** ランタイムディレクトリのベースパス */
  runtimeBasePath?: string;
}

/**
 * メッセージ送信オプション
 */
export interface SendOptions {
  /** 実行ID（履歴ログ用） */
  runId?: RunId;
}

/**
 * Agent Busインターフェース
 * @see Requirement 10.1: THE Agent_Bus SHALL provide message passing between agents
 */
export interface IAgentBus {
  /**
   * メッセージキューを設定
   * @param queue - メッセージキューインスタンス
   */
  setMessageQueue(queue: IMessageQueue): void;

  /**
   * メッセージを送信
   * @param message - 送信するメッセージ
   * @param options - 送信オプション
   * @see Requirement 10.1: message passing between agents
   */
  send(message: AgentMessage, options?: SendOptions): Promise<void>;

  /**
   * メッセージをポーリング（pull/pollモデル）
   * @param agentId - ポーリングするエージェントID
   * @param timeout - タイムアウト（ミリ秒、オプション）
   * @returns 受信したメッセージの配列
   */
  poll(agentId: AgentId, timeout?: number): Promise<AgentMessage[]>;

  /**
   * 全エージェントにメッセージをブロードキャスト
   * @param message - ブロードキャストするメッセージ
   * @param options - 送信オプション
   */
  broadcast(message: AgentMessage, options?: SendOptions): Promise<void>;

  /**
   * 実行IDに関連するメッセージ履歴を取得
   * @param runId - 実行ID
   * @returns メッセージ履歴の配列
   */
  getMessageHistory(runId: RunId): Promise<AgentMessage[]>;
}

// =============================================================================
// AgentBus実装
// =============================================================================

/**
 * AgentBus - エージェント間通信バス
 *
 * Message Queue Abstractionを使用してエージェント間のメッセージパッシングを実現。
 * pull/pollモデルを採用し、ワーカーは受信ポートを必要としない。
 *
 * @see Requirement 10.1: THE Agent_Bus SHALL provide message passing between agents
 * @see Requirement 10.2: THE Agent_Bus SHALL support message types: task_assign, task_complete, task_failed, escalate, status_request, status_response
 *
 * @example
 * ```typescript
 * // Agent Busの作成と初期化
 * const bus = new AgentBus();
 * await bus.initialize();
 *
 * // メッセージの送信
 * await bus.send({
 *   id: 'msg-001',
 *   type: 'task_assign',
 *   from: 'manager-001',
 *   to: 'worker-001',
 *   payload: { taskId: 'task-001' },
 *   timestamp: new Date().toISOString(),
 * });
 *
 * // メッセージのポーリング
 * const messages = await bus.poll('worker-001', 5000);
 * ```
 */
export class AgentBus implements IAgentBus {
  /** メッセージキュー */
  private messageQueue: IMessageQueue;

  /** ランタイムディレクトリのベースパス */
  private runtimeBasePath: string;

  /** 初期化済みフラグ */
  private initialized: boolean = false;

  /** チャットログキャプチャ（オプション） */
  private chatLogCapture: ChatLogCapture | null = null;

  /**
   * コンストラクタ
   * @param config - Agent Bus設定（オプション）
   */
  constructor(config?: AgentBusConfig) {
    // メッセージキューの初期化
    if (config?.messageQueueConfig) {
      this.messageQueue = createMessageQueue(config.messageQueueConfig);
    } else {
      this.messageQueue = new FileMessageQueue();
    }

    // ランタイムベースパスの設定
    this.runtimeBasePath = config?.runtimeBasePath ?? 'runtime/runs';
  }

  // ===========================================================================
  // 初期化
  // ===========================================================================

  /**
   * Agent Busを初期化
   * @description メッセージキューの初期化を行う
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.messageQueue.initialize();
    this.initialized = true;
  }

  /**
   * 初期化を確認し、未初期化の場合は初期化を実行
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ===========================================================================
  // IAgentBus実装
  // ===========================================================================

  /**
   * メッセージキューを設定
   * @param queue - メッセージキューインスタンス
   */
  setMessageQueue(queue: IMessageQueue): void {
    this.messageQueue = queue;
    // 新しいキューに切り替えた場合は再初期化が必要
    this.initialized = false;
  }

  /**
   * ChatLogCaptureを設定する
   *
   * 設定すると、メッセージ送信時に自動的にチャットログに記録される。
   *
   * @param capture - ChatLogCaptureインスタンス
   * @see Requirement 5.1: Agent Busメッセージのキャプチャ
   */
  setChatLogCapture(capture: ChatLogCapture): void {
    this.chatLogCapture = capture;
  }

  /**
   * メッセージを送信
   * @param message - 送信するメッセージ
   * @param options - 送信オプション
   * @see Requirement 10.1: THE Agent_Bus SHALL provide message passing between agents
   */
  async send(message: AgentMessage, options?: SendOptions): Promise<void> {
    await this.ensureInitialized();

    // メッセージの検証
    this.validateMessage(message);

    // メッセージキューに送信
    await this.messageQueue.send(message);

    // 履歴ログに記録（runIdが指定されている場合）
    const runId = options?.runId ?? this.extractRunIdFromPayload(message);
    if (runId) {
      await this.logMessage(runId, message);
    }

    // チャットログにキャプチャ（設定されている場合）
    if (this.chatLogCapture) {
      try {
        await this.chatLogCapture.capture({
          sender: message.from,
          recipient: message.to,
          type: this.mapMessageTypeToChatLogType(message.type),
          content: typeof message.payload === 'string'
            ? message.payload
            : JSON.stringify(message.payload),
          workflowId: runId ?? undefined,
        });
      } catch {
        // チャットログのキャプチャ失敗はメッセージ送信に影響させない
      }
    }
  }

  /**
   * メッセージをポーリング（pull/pollモデル）
   * @param agentId - ポーリングするエージェントID
   * @param timeout - タイムアウト（ミリ秒、デフォルト: 5000）
   * @returns 受信したメッセージの配列
   */
  async poll(agentId: AgentId, timeout: number = DEFAULT_POLL_TIMEOUT): Promise<AgentMessage[]> {
    await this.ensureInitialized();

    // エージェントIDの検証
    if (!agentId || agentId.trim() === '') {
      throw new Error('Agent ID is required for polling');
    }

    // メッセージキューからポーリング
    return await this.messageQueue.poll(agentId, timeout);
  }

  /**
   * 全エージェントにメッセージをブロードキャスト
   * @param message - ブロードキャストするメッセージ
   * @param options - 送信オプション
   */
  async broadcast(message: AgentMessage, options?: SendOptions): Promise<void> {
    await this.ensureInitialized();

    // メッセージの検証（toフィールドはブロードキャスト用に特別扱い）
    this.validateBroadcastMessage(message);

    // メッセージキューでブロードキャスト
    await this.messageQueue.broadcast(message);

    // 履歴ログに記録（runIdが指定されている場合）
    const runId = options?.runId ?? this.extractRunIdFromPayload(message);
    if (runId) {
      // ブロードキャストメッセージとしてログに記録
      const broadcastLogMessage: AgentMessage = {
        ...message,
        to: BROADCAST_AGENT_ID,
      };
      await this.logMessage(runId, broadcastLogMessage);
    }
  }

  /**
   * 実行IDに関連するメッセージ履歴を取得
   * @param runId - 実行ID
   * @returns メッセージ履歴の配列
   */
  async getMessageHistory(runId: RunId): Promise<AgentMessage[]> {
    await this.ensureInitialized();

    // 実行IDの検証
    if (!runId || runId.trim() === '') {
      throw new Error('Run ID is required to get message history');
    }

    // メッセージキューから履歴を取得
    const queueHistory = await this.messageQueue.getMessageHistory(runId);

    // ログファイルからも履歴を取得（補完用）
    const logHistory = await this.readMessageLog(runId);

    // 両方の履歴をマージしてユニークなメッセージのみを返す
    return this.mergeAndDeduplicateMessages(queueHistory, logHistory);
  }

  // ===========================================================================
  // ヘルパーメソッド - メッセージ作成
  // ===========================================================================

  /**
   * 新しいメッセージを作成
   * @param type - メッセージ種別
   * @param from - 送信元エージェントID
   * @param to - 送信先エージェントID
   * @param payload - ペイロード
   * @returns 新しいAgentMessage
   */
  createMessage(
    type: AgentMessageType,
    from: AgentId,
    to: AgentId,
    payload: unknown
  ): AgentMessage {
    return {
      id: crypto.randomUUID(),
      type,
      from,
      to,
      payload,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * タスク割り当てメッセージを作成
   * @param from - 送信元エージェントID（通常はマネージャー）
   * @param to - 送信先エージェントID（通常はワーカー）
   * @param taskPayload - タスク情報
   * @returns タスク割り当てメッセージ
   */
  createTaskAssignMessage(from: AgentId, to: AgentId, taskPayload: unknown): AgentMessage {
    return this.createMessage('task_assign', from, to, taskPayload);
  }

  /**
   * タスク完了メッセージを作成
   * @param from - 送信元エージェントID（通常はワーカー）
   * @param to - 送信先エージェントID（通常はマネージャー）
   * @param resultPayload - 結果情報
   * @returns タスク完了メッセージ
   */
  createTaskCompleteMessage(from: AgentId, to: AgentId, resultPayload: unknown): AgentMessage {
    return this.createMessage('task_complete', from, to, resultPayload);
  }

  /**
   * タスク失敗メッセージを作成
   * @param from - 送信元エージェントID（通常はワーカー）
   * @param to - 送信先エージェントID（通常はマネージャー）
   * @param errorPayload - エラー情報
   * @returns タスク失敗メッセージ
   */
  createTaskFailedMessage(from: AgentId, to: AgentId, errorPayload: unknown): AgentMessage {
    return this.createMessage('task_failed', from, to, errorPayload);
  }

  /**
   * エスカレーションメッセージを作成
   * @param from - 送信元エージェントID
   * @param to - 送信先エージェントID（通常は上位エージェント）
   * @param escalationPayload - エスカレーション情報
   * @returns エスカレーションメッセージ
   */
  createEscalateMessage(from: AgentId, to: AgentId, escalationPayload: unknown): AgentMessage {
    return this.createMessage('escalate', from, to, escalationPayload);
  }

  /**
   * ステータス要求メッセージを作成
   * @param from - 送信元エージェントID
   * @param to - 送信先エージェントID
   * @param requestPayload - 要求情報
   * @returns ステータス要求メッセージ
   */
  createStatusRequestMessage(from: AgentId, to: AgentId, requestPayload: unknown): AgentMessage {
    return this.createMessage('status_request', from, to, requestPayload);
  }

  /**
   * ステータス応答メッセージを作成
   * @param from - 送信元エージェントID
   * @param to - 送信先エージェントID
   * @param responsePayload - 応答情報
   * @returns ステータス応答メッセージ
   */
  createStatusResponseMessage(from: AgentId, to: AgentId, responsePayload: unknown): AgentMessage {
    return this.createMessage('status_response', from, to, responsePayload);
  }

  /**
   * レビュー要求メッセージを作成
   * @param from - 送信元エージェントID（通常はワーカー）
   * @param to - 送信先エージェントID（通常はレビューア）
   * @param reviewPayload - レビュー情報（チケットID、変更内容など）
   * @returns レビュー要求メッセージ
   *
   * @see Requirement 5.1: THE Worker_Agent SHALL request review from Reviewer_Agent upon task completion
   */
  createReviewRequestMessage(from: AgentId, to: AgentId, reviewPayload: unknown): AgentMessage {
    return this.createMessage('review_request', from, to, reviewPayload);
  }

  /**
   * レビュー応答メッセージを作成
   * @param from - 送信元エージェントID（通常はレビューア）
   * @param to - 送信先エージェントID（通常はワーカーまたはマネージャー）
   * @param reviewResultPayload - レビュー結果（承認/却下、フィードバックなど）
   * @returns レビュー応答メッセージ
   *
   * @see Requirement 5.2: THE Reviewer_Agent SHALL provide review decision: approve, request_changes, reject
   */
  createReviewResponseMessage(
    from: AgentId,
    to: AgentId,
    reviewResultPayload: unknown
  ): AgentMessage {
    return this.createMessage('review_response', from, to, reviewResultPayload);
  }

  /**
   * コンフリクトエスカレーションメッセージを作成
   * @param from - 送信元エージェントID（通常はマージャー）
   * @param to - 送信先エージェントID（通常はレビューア）
   * @param conflictPayload - コンフリクト情報（ファイル、詳細など）
   * @returns コンフリクトエスカレーションメッセージ
   *
   * @see Requirement 4.6: WHEN merge conflict cannot be auto-resolved, THE Merger_Agent SHALL escalate to Reviewer_Agent
   */
  createConflictEscalateMessage(
    from: AgentId,
    to: AgentId,
    conflictPayload: unknown
  ): AgentMessage {
    return this.createMessage('conflict_escalate', from, to, conflictPayload);
  }

  // ===========================================================================
  // プライベートメソッド - 検証
  // ===========================================================================

  /**
   * メッセージを検証
   * @param message - 検証するメッセージ
   * @throws Error - 検証エラーの場合
   */
  private validateMessage(message: AgentMessage): void {
    // 必須フィールドの検証
    if (!message.id || message.id.trim() === '') {
      throw new Error('Message ID is required');
    }

    if (!message.type) {
      throw new Error('Message type is required');
    }

    if (!this.isValidMessageType(message.type)) {
      throw new Error(`Invalid message type: ${message.type}`);
    }

    if (!message.from || message.from.trim() === '') {
      throw new Error('Message sender (from) is required');
    }

    if (!message.to || message.to.trim() === '') {
      throw new Error('Message recipient (to) is required');
    }

    if (!message.timestamp) {
      throw new Error('Message timestamp is required');
    }
  }

  /**
   * ブロードキャストメッセージを検証
   * @param message - 検証するメッセージ
   * @throws Error - 検証エラーの場合
   */
  private validateBroadcastMessage(message: AgentMessage): void {
    // 必須フィールドの検証（toは任意）
    if (!message.id || message.id.trim() === '') {
      throw new Error('Message ID is required');
    }

    if (!message.type) {
      throw new Error('Message type is required');
    }

    if (!this.isValidMessageType(message.type)) {
      throw new Error(`Invalid message type: ${message.type}`);
    }

    if (!message.from || message.from.trim() === '') {
      throw new Error('Message sender (from) is required');
    }

    if (!message.timestamp) {
      throw new Error('Message timestamp is required');
    }
  }

  /**
   * メッセージ種別が有効かどうかを検証
   * @param type - メッセージ種別
   * @returns 有効な場合はtrue
   * @see Requirement 10.2: THE Agent_Bus SHALL support message types
   * @see Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 4.6
   */
  private isValidMessageType(type: string): type is AgentMessageType {
    const validTypes: AgentMessageType[] = [
      'task_assign',
      'task_complete',
      'task_failed',
      'escalate',
      'status_request',
      'status_response',
      'review_request',
      'review_response',
      'conflict_escalate',
    ];
    return validTypes.includes(type as AgentMessageType);
  }

  // ===========================================================================
  // プライベートメソッド - ログ
  // ===========================================================================

  /**
   * メッセージをログファイルに記録
   * @param runId - 実行ID
   * @param message - 記録するメッセージ
   * @see Requirement 10.8: THE message history SHALL be logged to `runtime/runs/<run-id>/messages.log`
   */
  private async logMessage(runId: RunId, message: AgentMessage): Promise<void> {
    const logDir = path.join(this.runtimeBasePath, runId);
    const logPath = path.join(logDir, MESSAGE_LOG_FILENAME);

    try {
      // ディレクトリを作成
      await fs.mkdir(logDir, { recursive: true });

      // ログエントリを作成
      const logEntry = this.formatLogEntry(message);

      // ログファイルに追記
      await fs.appendFile(logPath, logEntry + '\n', 'utf-8');
    } catch (error) {
      // ログ記録の失敗は警告として扱い、メッセージ送信自体は失敗させない
      console.warn(`Failed to log message to ${logPath}:`, error);
    }
  }

  /**
   * ログエントリをフォーマット
   * @param message - フォーマットするメッセージ
   * @returns フォーマットされたログエントリ
   */
  private formatLogEntry(message: AgentMessage): string {
    const timestamp = message.timestamp;
    const type = message.type.toUpperCase().padEnd(16);
    const from = message.from.padEnd(20);
    const to = message.to.padEnd(20);
    const payloadStr = JSON.stringify(message.payload);

    return `[${timestamp}] ${type} ${from} -> ${to} | ${payloadStr}`;
  }

  /**
   * ログファイルからメッセージ履歴を読み込み
   * @param runId - 実行ID
   * @returns メッセージ履歴の配列
   */
  private async readMessageLog(runId: RunId): Promise<AgentMessage[]> {
    const logPath = path.join(this.runtimeBasePath, runId, MESSAGE_LOG_FILENAME);

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim() !== '');

      const messages: AgentMessage[] = [];

      for (const line of lines) {
        const parsed = this.parseLogEntry(line);
        if (parsed) {
          messages.push(parsed);
        }
      }

      return messages;
    } catch (error) {
      // ファイルが存在しない場合は空配列を返す
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * ログエントリをパース
   * @param line - パースするログ行
   * @returns パースされたメッセージ、またはnull
   */
  private parseLogEntry(line: string): AgentMessage | null {
    try {
      // フォーマット: [timestamp] TYPE from -> to | payload
      const match = line.match(/^\[([^\]]+)\]\s+(\S+)\s+(\S+)\s+->\s+(\S+)\s+\|\s+(.+)$/);

      if (!match) {
        return null;
      }

      const [, timestamp, type, from, to, payloadStr] = match;

      return {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: type.toLowerCase().trim() as AgentMessageType,
        from: from.trim(),
        to: to.trim(),
        payload: JSON.parse(payloadStr),
        timestamp: timestamp.trim(),
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // プライベートメソッド - ユーティリティ
  // ===========================================================================

  /**
   * ペイロードからrunIdを抽出
   * @param message - メッセージ
   * @returns runId、または undefined
   */
  private extractRunIdFromPayload(message: AgentMessage): RunId | undefined {
    const payload = message.payload as Record<string, unknown> | null;
    return payload?.runId as string | undefined;
  }

  /**
   * メッセージ配列をマージして重複を除去
   * @param messages1 - メッセージ配列1
   * @param messages2 - メッセージ配列2
   * @returns マージされたメッセージ配列
   */
  private mergeAndDeduplicateMessages(
    messages1: AgentMessage[],
    messages2: AgentMessage[]
  ): AgentMessage[] {
    const messageMap = new Map<string, AgentMessage>();

    // messages1を追加
    for (const msg of messages1) {
      messageMap.set(msg.id, msg);
    }

    // messages2を追加（重複はスキップ）
    for (const msg of messages2) {
      if (!messageMap.has(msg.id)) {
        messageMap.set(msg.id, msg);
      }
    }

    // タイムスタンプでソート
    const merged = Array.from(messageMap.values());
    merged.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    return merged;
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
   * AgentMessageTypeをChatLogTypeにマッピングする
   */
  private mapMessageTypeToChatLogType(type: AgentMessageType): ChatLogType {
    const mapping: Record<string, ChatLogType> = {
      task_assign: 'task_assignment',
      task_complete: 'task_assignment',
      task_failed: 'task_assignment',
      review_request: 'review_feedback',
      review_response: 'review_feedback',
      escalate: 'escalation',
      conflict_escalate: 'escalation',
      status_request: 'general',
      status_response: 'general',
    };
    return mapping[type] ?? 'general';
  }

  // ===========================================================================
  // テスト用メソッド
  // ===========================================================================

  /**
   * 現在のメッセージキューを取得（テスト用）
   * @returns メッセージキューインスタンス
   */
  getMessageQueue(): IMessageQueue {
    return this.messageQueue;
  }

  /**
   * ランタイムベースパスを取得（テスト用）
   * @returns ランタイムベースパス
   */
  getRuntimeBasePath(): string {
    return this.runtimeBasePath;
  }

  /**
   * 初期化状態を取得（テスト用）
   * @returns 初期化済みの場合はtrue
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * Agent Busを作成
 * @param config - Agent Bus設定（オプション）
 * @returns Agent Busインスタンス
 *
 * @example
 * ```typescript
 * // デフォルト設定でAgent Busを作成
 * const bus = createAgentBus();
 *
 * // カスタム設定でAgent Busを作成
 * const customBus = createAgentBus({
 *   messageQueueConfig: {
 *     type: 'file',
 *     basePath: '/custom/path/bus',
 *   },
 *   runtimeBasePath: '/custom/runtime/runs',
 * });
 * ```
 */
export function createAgentBus(config?: AgentBusConfig): AgentBus {
  return new AgentBus(config);
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのAgent Busインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const defaultAgentBus = new AgentBus();
