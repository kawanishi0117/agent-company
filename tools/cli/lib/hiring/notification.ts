/**
 * 登録完了通知モジュール（Notification）
 *
 * 採用システムにおけるエージェント登録完了時の通知機能を提供
 * - COO/PMへの通知生成
 * - 通知内容: 新規エージェントID、役割、登録日時
 * - 通知ファイルへの保存
 *
 * @module hiring/notification
 *
 * Validates: Requirements 8.5
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RegistrationResult } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 通知ファイルの格納先ディレクトリ
 * @description COO/PMが参照する通知ファイルの保存先
 */
const NOTIFICATIONS_DIR = 'runtime/notifications';

/**
 * 通知ファイル名
 * @description 採用関連の通知を集約するファイル
 */
const HIRING_NOTIFICATIONS_FILENAME = 'hiring_notifications.md';

/**
 * 通知JSONファイル名
 * @description プログラムからアクセスするためのJSON形式ファイル
 */
const HIRING_NOTIFICATIONS_JSON_FILENAME = 'hiring_notifications.json';

/**
 * 通知の送信先
 */
const NOTIFICATION_RECIPIENT = 'COO/PM';

/**
 * 通知の送信者
 */
const NOTIFICATION_SENDER = 'Hiring Manager';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 登録完了通知
 * @description エージェント登録完了時に生成される通知
 */
export interface RegistrationNotification {
  /** 通知ID（一意識別子） */
  id: string;
  /** 通知種別 */
  type: 'agent_registered';
  /** 通知タイムスタンプ（ISO8601形式） */
  timestamp: string;
  /** 送信者 */
  sender: string;
  /** 受信者 */
  recipient: string;
  /** 通知内容 */
  content: {
    /** 新規エージェントID */
    agentId: string;
    /** エージェントの役割/タイトル */
    role: string;
    /** 登録日時（ISO8601形式） */
    registeredAt: string;
    /** Registryパス */
    registryPath: string;
  };
  /** 既読フラグ */
  read: boolean;
}

/**
 * 通知スキーマ
 * @description 通知ファイルの永続化形式
 */
export interface NotificationSchema {
  /** スキーマバージョン */
  version: '1.0';
  /** 最終更新日時 */
  lastUpdated: string;
  /** 通知一覧 */
  notifications: RegistrationNotification[];
}

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * ISO8601形式の現在時刻を取得する
 * @returns ISO8601形式の時刻文字列
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 一意の通知IDを生成する
 * @returns 通知ID
 */
function generateNotificationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `notif-${timestamp}-${random}`;
}

/**
 * 通知ディレクトリのパスを取得する
 * @returns 通知ディレクトリパス
 */
function getNotificationsDir(): string {
  return NOTIFICATIONS_DIR;
}

/**
 * Markdown通知ファイルのパスを取得する
 * @returns Markdownファイルパス
 */
function getMarkdownNotificationPath(): string {
  return path.join(getNotificationsDir(), HIRING_NOTIFICATIONS_FILENAME);
}

/**
 * JSON通知ファイルのパスを取得する
 * @returns JSONファイルパス
 */
function getJsonNotificationPath(): string {
  return path.join(getNotificationsDir(), HIRING_NOTIFICATIONS_JSON_FILENAME);
}

/**
 * ディレクトリが存在しない場合は作成する
 * @param dirPath - ディレクトリパス
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 既存の通知スキーマを読み込む
 * @returns 通知スキーマ（存在しない場合は新規作成）
 */
function loadNotificationSchema(): NotificationSchema {
  const jsonPath = getJsonNotificationPath();

  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(content) as NotificationSchema;
    } catch (error) {
      // パースエラーの場合は新規作成
      console.warn(`通知ファイルのパースに失敗しました: ${error}`);
    }
  }

  // 新規スキーマを作成
  return {
    version: '1.0',
    lastUpdated: getCurrentTimestamp(),
    notifications: [],
  };
}

/**
 * 通知スキーマをJSONファイルに保存する
 * @param schema - 通知スキーマ
 */
function saveNotificationSchema(schema: NotificationSchema): void {
  const notificationsDir = getNotificationsDir();
  ensureDirectoryExists(notificationsDir);

  const jsonPath = getJsonNotificationPath();
  fs.writeFileSync(jsonPath, JSON.stringify(schema, null, 2), 'utf-8');
}

/**
 * タイムスタンプを人間可読形式にフォーマットする
 * @param timestamp - ISO8601形式のタイムスタンプ
 * @returns フォーマット済みの日時文字列
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * 登録完了通知を生成する
 *
 * エージェントがRegistryに登録された際に、COO/PMへの通知を生成する。
 * 通知には新規エージェントID、役割、登録日時が含まれる。
 *
 * @param registrationResult - 登録結果
 * @param role - エージェントの役割/タイトル（オプション）
 * @returns 生成された通知
 *
 * @example
 * ```typescript
 * const notification = generateRegistrationNotification(
 *   { success: true, agentId: 'new_agent', registryPath: 'agents/registry/new_agent.yaml', timestamp: '2024-01-15T10:00:00Z' },
 *   'Developer Agent'
 * );
 * console.log(notification.content.agentId); // => 'new_agent'
 * ```
 *
 * Validates: Requirements 8.5
 */
export function generateRegistrationNotification(
  registrationResult: RegistrationResult,
  role?: string
): RegistrationNotification {
  // 登録が成功していない場合はエラー
  if (!registrationResult.success) {
    throw new Error('NotificationError: 登録が成功していないため、通知を生成できません');
  }

  const notification: RegistrationNotification = {
    id: generateNotificationId(),
    type: 'agent_registered',
    timestamp: getCurrentTimestamp(),
    sender: NOTIFICATION_SENDER,
    recipient: NOTIFICATION_RECIPIENT,
    content: {
      agentId: registrationResult.agentId,
      role: role || registrationResult.agentId, // 役割が指定されていない場合はIDを使用
      registeredAt: registrationResult.timestamp,
      registryPath: registrationResult.registryPath,
    },
    read: false,
  };

  return notification;
}

/**
 * 登録完了通知をCOO/PMに送信する
 *
 * 生成された通知を通知ファイルに保存し、COO/PMが参照できるようにする。
 * 通知はMarkdownとJSON両方の形式で保存される。
 *
 * @param notification - 登録完了通知
 *
 * @example
 * ```typescript
 * const notification = generateRegistrationNotification(result, 'Developer');
 * sendRegistrationNotification(notification);
 * // => runtime/notifications/hiring_notifications.md に保存
 * ```
 *
 * Validates: Requirements 8.5
 */
export function sendRegistrationNotification(notification: RegistrationNotification): void {
  // 既存の通知スキーマを読み込む
  const schema = loadNotificationSchema();

  // 新しい通知を追加
  schema.notifications.push(notification);
  schema.lastUpdated = getCurrentTimestamp();

  // JSONファイルに保存
  saveNotificationSchema(schema);

  // Markdownファイルも更新
  const markdownContent = formatNotificationsAsMarkdown(schema);
  const markdownPath = getMarkdownNotificationPath();
  fs.writeFileSync(markdownPath, markdownContent, 'utf-8');
}

/**
 * 登録完了通知を生成して送信する（一括処理）
 *
 * エージェント登録完了時に呼び出す便利関数。
 * 通知の生成と送信を一度に行う。
 *
 * @param registrationResult - 登録結果
 * @param role - エージェントの役割/タイトル（オプション）
 * @returns 生成された通知
 *
 * @example
 * ```typescript
 * const result = registerAgent('candidates/new_agent.yaml');
 * if (result.success) {
 *   const notification = notifyRegistration(result, 'Developer Agent');
 *   console.log(`通知を送信しました: ${notification.id}`);
 * }
 * ```
 *
 * Validates: Requirements 8.5
 */
export function notifyRegistration(
  registrationResult: RegistrationResult,
  role?: string
): RegistrationNotification {
  const notification = generateRegistrationNotification(registrationResult, role);
  sendRegistrationNotification(notification);
  return notification;
}

/**
 * 通知一覧をMarkdown形式でフォーマットする
 *
 * @param schema - 通知スキーマ
 * @returns Markdown形式の通知一覧
 */
export function formatNotificationsAsMarkdown(schema: NotificationSchema): string {
  const lines: string[] = [
    '# 採用通知（Hiring Notifications）',
    '',
    '> このファイルはCOO/PM向けの採用関連通知を集約しています。',
    '',
    `**最終更新**: ${formatTimestamp(schema.lastUpdated)}`,
    '',
    '---',
    '',
  ];

  // 未読通知のカウント
  const unreadCount = schema.notifications.filter((n) => !n.read).length;
  lines.push(`## 📬 未読通知: ${unreadCount}件`);
  lines.push('');

  if (schema.notifications.length === 0) {
    lines.push('_通知はありません。_');
  } else {
    // 新しい順にソート
    const sortedNotifications = [...schema.notifications].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    for (const notification of sortedNotifications) {
      const readIcon = notification.read ? '✅' : '🆕';
      const typeIcon = '🎉';

      lines.push(`### ${readIcon} ${typeIcon} 新規エージェント登録`);
      lines.push('');
      lines.push(`| 項目 | 内容 |`);
      lines.push(`|------|------|`);
      lines.push(`| 通知ID | \`${notification.id}\` |`);
      lines.push(`| 日時 | ${formatTimestamp(notification.timestamp)} |`);
      lines.push(`| 送信者 | ${notification.sender} |`);
      lines.push(`| 受信者 | ${notification.recipient} |`);
      lines.push('');
      lines.push('**登録内容:**');
      lines.push('');
      lines.push(`- **エージェントID**: \`${notification.content.agentId}\``);
      lines.push(`- **役割**: ${notification.content.role}`);
      lines.push(`- **登録日時**: ${formatTimestamp(notification.content.registeredAt)}`);
      lines.push(`- **Registryパス**: \`${notification.content.registryPath}\``);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // フッター
  lines.push(`_このファイルは ${formatTimestamp(getCurrentTimestamp())} に生成されました。_`);

  return lines.join('\n');
}

/**
 * 通知を既読にする
 *
 * @param notificationId - 通知ID
 * @returns 更新成功ならtrue
 */
export function markNotificationAsRead(notificationId: string): boolean {
  const schema = loadNotificationSchema();

  const notification = schema.notifications.find((n) => n.id === notificationId);
  if (!notification) {
    return false;
  }

  notification.read = true;
  schema.lastUpdated = getCurrentTimestamp();

  // 保存
  saveNotificationSchema(schema);

  // Markdownも更新
  const markdownContent = formatNotificationsAsMarkdown(schema);
  const markdownPath = getMarkdownNotificationPath();
  fs.writeFileSync(markdownPath, markdownContent, 'utf-8');

  return true;
}

/**
 * 未読通知の一覧を取得する
 *
 * @returns 未読通知の配列
 */
export function getUnreadNotifications(): RegistrationNotification[] {
  const schema = loadNotificationSchema();
  return schema.notifications.filter((n) => !n.read);
}

/**
 * 全通知の一覧を取得する
 *
 * @returns 全通知の配列
 */
export function getAllNotifications(): RegistrationNotification[] {
  const schema = loadNotificationSchema();
  return schema.notifications;
}

/**
 * 通知をクリアする（テスト用）
 *
 * @returns クリア成功ならtrue
 */
export function clearNotifications(): boolean {
  const jsonPath = getJsonNotificationPath();
  const markdownPath = getMarkdownNotificationPath();

  let success = true;

  if (fs.existsSync(jsonPath)) {
    try {
      fs.unlinkSync(jsonPath);
    } catch {
      success = false;
    }
  }

  if (fs.existsSync(markdownPath)) {
    try {
      fs.unlinkSync(markdownPath);
    } catch {
      success = false;
    }
  }

  return success;
}
