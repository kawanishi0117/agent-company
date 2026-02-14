/**
 * チャットログキャプチャ
 *
 * Agent Busのメッセージをキャプチャして永続化する。
 * 日付、社員、タイプでフィルタしてログを取得でき、
 * アクティビティストリームとしてリアルタイム表示にも対応する。
 *
 * @module execution/chat-log-capture
 * @see Requirements: 5.1, 5.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** チャットログのメッセージタイプ */
export type ChatLogType =
  | 'task_assignment'
  | 'review_feedback'
  | 'meeting_discussion'
  | 'escalation'
  | 'general';

/** チャットログエントリ */
export interface ChatLogEntry {
  /** 一意ID */
  id: string;
  /** タイムスタンプ（ISO8601形式） */
  timestamp: string;
  /** 送信者エージェントID */
  sender: string;
  /** 受信者エージェントID */
  recipient: string;
  /** メッセージタイプ */
  type: ChatLogType;
  /** メッセージ内容 */
  content: string;
  /** 関連ワークフローID（オプション） */
  workflowId?: string;
}

/** チャットログキャプチャ入力（id, timestampは自動生成） */
export type ChatLogInput = Omit<ChatLogEntry, 'id' | 'timestamp'>;

/** アクティビティストリームアイテム */
export interface ActivityStreamItem {
  /** 一意ID */
  id: string;
  /** タイムスタンプ */
  timestamp: string;
  /** アクティビティの種類 */
  type: ChatLogType;
  /** 表示用テキスト */
  description: string;
  /** 関連エージェントID */
  agentIds: string[];
  /** 関連ワークフローID */
  workflowId?: string;
}

/** クエリフィルタ */
export interface ChatLogFilter {
  /** 対象日（YYYY-MM-DD形式） */
  date?: string;
  /** エージェントID（送信者または受信者） */
  agentId?: string;
  /** メッセージタイプ */
  type?: ChatLogType;
  /** ワークフローID */
  workflowId?: string;
}

// =============================================================================
// 定数
// =============================================================================

/** デフォルトの保存ディレクトリ */
const DEFAULT_CHAT_LOG_DIR = 'runtime/state/chat-logs';

// =============================================================================
// ChatLogCapture
// =============================================================================

/**
 * チャットログキャプチャ
 *
 * Agent Busメッセージを日付別ファイルに永続化し、
 * フィルタ付きクエリとアクティビティストリーム取得を提供する。
 *
 * @see Requirement 5.1: メッセージキャプチャと永続化
 * @see Requirement 5.5: アクティビティストリーム
 */
export class ChatLogCapture {
  /** データ保存ベースパス */
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス（デフォルト: runtime/state/chat-logs）
   */
  constructor(basePath: string = DEFAULT_CHAT_LOG_DIR) {
    this.basePath = basePath;
  }

  /**
   * チャットログエントリをキャプチャして永続化する
   *
   * @param input - キャプチャするメッセージ（id, timestampは自動生成）
   * @returns 保存されたエントリ
   * @see Requirement 5.1
   */
  async capture(input: ChatLogInput): Promise<ChatLogEntry> {
    const entry: ChatLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...input,
    };

    const date = entry.timestamp.slice(0, 10);
    const entries = await this.loadEntries(date);
    entries.push(entry);
    await this.saveEntries(date, entries);

    return entry;
  }

  /**
   * フィルタ条件でチャットログを検索する
   *
   * @param filters - 検索フィルタ
   * @returns マッチしたエントリの配列
   * @see Requirement 5.5
   */
  async query(filters: ChatLogFilter = {}): Promise<ChatLogEntry[]> {
    // 日付指定がある場合はその日のみ、なければ全日付を検索
    const dates = filters.date
      ? [filters.date]
      : await this.listDates();

    let results: ChatLogEntry[] = [];

    for (const date of dates) {
      const entries = await this.loadEntries(date);
      results = results.concat(entries);
    }

    // フィルタ適用
    return results.filter((entry) => {
      if (filters.agentId &&
          entry.sender !== filters.agentId &&
          entry.recipient !== filters.agentId) {
        return false;
      }
      if (filters.type && entry.type !== filters.type) {
        return false;
      }
      if (filters.workflowId && entry.workflowId !== filters.workflowId) {
        return false;
      }
      return true;
    });
  }

  /**
   * アクティビティストリームを取得する（直近N件）
   *
   * @param limit - 取得件数上限（デフォルト: 20）
   * @returns アクティビティストリームアイテムの配列（新しい順）
   * @see Requirement 5.5
   */
  async getActivityStream(limit: number = 20): Promise<ActivityStreamItem[]> {
    const dates = await this.listDates();
    const allEntries: ChatLogEntry[] = [];

    // 新しい日付から順に読み込み、十分な件数が集まったら終了
    for (const date of dates) {
      const entries = await this.loadEntries(date);
      allEntries.push(...entries);
      if (allEntries.length >= limit) break;
    }

    // タイムスタンプ降順でソートし、limit件に制限
    allEntries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return allEntries.slice(0, limit).map((entry) => this.toActivityItem(entry));
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /** ChatLogEntryをActivityStreamItemに変換する */
  private toActivityItem(entry: ChatLogEntry): ActivityStreamItem {
    return {
      id: entry.id,
      timestamp: entry.timestamp,
      type: entry.type,
      description: this.buildDescription(entry),
      agentIds: [entry.sender, entry.recipient].filter(Boolean),
      workflowId: entry.workflowId,
    };
  }

  /** エントリから表示用テキストを生成する */
  private buildDescription(entry: ChatLogEntry): string {
    const typeLabels: Record<ChatLogType, string> = {
      task_assignment: 'タスク割り当て',
      review_feedback: 'レビューフィードバック',
      meeting_discussion: '会議発言',
      escalation: 'エスカレーション',
      general: 'メッセージ',
    };
    const label = typeLabels[entry.type];
    // 内容を80文字に切り詰め
    const truncated = entry.content.length > 80
      ? entry.content.slice(0, 80) + '...'
      : entry.content;
    return `[${label}] ${entry.sender} → ${entry.recipient}: ${truncated}`;
  }

  /** 一意IDを生成する */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `chat-${timestamp}-${random}`;
  }

  /** 指定日のエントリを読み込む */
  private async loadEntries(date: string): Promise<ChatLogEntry[]> {
    try {
      const filePath = path.join(this.basePath, `${date}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ChatLogEntry[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /** 指定日のエントリを保存する */
  private async saveEntries(date: string, entries: ChatLogEntry[]): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${date}.json`);
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  /** 保存済み日付一覧を取得する（降順） */
  private async listDates(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .sort()
        .reverse();
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /** ファイル未存在エラー判定 */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
