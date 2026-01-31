/**
 * 登録完了通知モジュールのテスト
 *
 * Property 14: Registration Notification
 * エージェント登録成功時に、COO/PMへの通知が生成されることを検証
 *
 * Validates: Requirements 8.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateRegistrationNotification,
  sendRegistrationNotification,
  notifyRegistration,
  markNotificationAsRead,
  getUnreadNotifications,
  getAllNotifications,
  clearNotifications,
} from '../tools/cli/lib/hiring/notification.js';
import type { RegistrationResult } from '../tools/cli/lib/hiring/types.js';

// =============================================================================
// テスト用定数
// =============================================================================

const NOTIFICATIONS_DIR = 'runtime/notifications';
const HIRING_NOTIFICATIONS_JSON = path.join(NOTIFICATIONS_DIR, 'hiring_notifications.json');
const HIRING_NOTIFICATIONS_MD = path.join(NOTIFICATIONS_DIR, 'hiring_notifications.md');

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * 有効な登録結果を生成する
 */
function createValidRegistrationResult(agentId: string = 'test_agent'): RegistrationResult {
  return {
    success: true,
    agentId,
    registryPath: `agents/registry/${agentId}.yaml`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 失敗した登録結果を生成する
 */
function createFailedRegistrationResult(): RegistrationResult {
  return {
    success: false,
    agentId: '',
    registryPath: '',
    errors: ['ValidationFailed: テストエラー'],
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('Notification Module', () => {
  // 各テスト前後でクリーンアップ
  beforeEach(() => {
    clearNotifications();
  });

  afterEach(() => {
    clearNotifications();
  });

  // ===========================================================================
  // generateRegistrationNotification のテスト
  // ===========================================================================
  describe('generateRegistrationNotification', () => {
    /**
     * 正常系: 登録成功時に通知が生成される
     * Validates: Requirements 8.5
     */
    it('登録成功時に通知を生成する', () => {
      const result = createValidRegistrationResult('new_developer');
      const notification = generateRegistrationNotification(result, 'Developer Agent');

      // 通知の基本構造を検証
      expect(notification).toBeDefined();
      expect(notification.id).toMatch(/^notif-\d+-[a-z0-9]+$/);
      expect(notification.type).toBe('agent_registered');
      expect(notification.sender).toBe('Hiring Manager');
      expect(notification.recipient).toBe('COO/PM');
      expect(notification.read).toBe(false);

      // 通知内容を検証
      expect(notification.content.agentId).toBe('new_developer');
      expect(notification.content.role).toBe('Developer Agent');
      expect(notification.content.registryPath).toBe('agents/registry/new_developer.yaml');
    });

    /**
     * 役割が指定されない場合、エージェントIDが使用される
     */
    it('役割未指定時はエージェントIDを役割として使用する', () => {
      const result = createValidRegistrationResult('qa_executor');
      const notification = generateRegistrationNotification(result);

      expect(notification.content.role).toBe('qa_executor');
    });

    /**
     * 異常系: 登録失敗時はエラーをスローする
     */
    it('登録失敗時はエラーをスローする', () => {
      const result = createFailedRegistrationResult();

      expect(() => generateRegistrationNotification(result)).toThrow(
        'NotificationError: 登録が成功していないため、通知を生成できません'
      );
    });

    /**
     * タイムスタンプがISO8601形式であることを検証
     */
    it('タイムスタンプがISO8601形式である', () => {
      const result = createValidRegistrationResult();
      const notification = generateRegistrationNotification(result);

      // ISO8601形式の正規表現
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      expect(notification.timestamp).toMatch(iso8601Regex);
      expect(notification.content.registeredAt).toMatch(iso8601Regex);
    });
  });

  // ===========================================================================
  // sendRegistrationNotification のテスト
  // ===========================================================================
  describe('sendRegistrationNotification', () => {
    /**
     * 通知がファイルに保存される
     * Validates: Requirements 8.5
     */
    it('通知をファイルに保存する', () => {
      const result = createValidRegistrationResult('saved_agent');
      const notification = generateRegistrationNotification(result, 'Saved Agent');

      sendRegistrationNotification(notification);

      // JSONファイルが作成されていることを確認
      expect(fs.existsSync(HIRING_NOTIFICATIONS_JSON)).toBe(true);

      // Markdownファイルが作成されていることを確認
      expect(fs.existsSync(HIRING_NOTIFICATIONS_MD)).toBe(true);

      // JSONファイルの内容を検証
      const jsonContent = JSON.parse(fs.readFileSync(HIRING_NOTIFICATIONS_JSON, 'utf-8'));
      expect(jsonContent.notifications).toHaveLength(1);
      expect(jsonContent.notifications[0].content.agentId).toBe('saved_agent');
    });

    /**
     * 複数の通知が追加される
     */
    it('複数の通知を追加できる', () => {
      const result1 = createValidRegistrationResult('agent_1');
      const result2 = createValidRegistrationResult('agent_2');

      const notification1 = generateRegistrationNotification(result1, 'Agent 1');
      const notification2 = generateRegistrationNotification(result2, 'Agent 2');

      sendRegistrationNotification(notification1);
      sendRegistrationNotification(notification2);

      const allNotifications = getAllNotifications();
      expect(allNotifications).toHaveLength(2);
    });
  });

  // ===========================================================================
  // notifyRegistration のテスト（一括処理）
  // ===========================================================================
  describe('notifyRegistration', () => {
    /**
     * 通知の生成と送信を一度に行う
     * Validates: Requirements 8.5
     */
    it('通知の生成と送信を一括で行う', () => {
      const result = createValidRegistrationResult('bulk_agent');
      const notification = notifyRegistration(result, 'Bulk Agent');

      // 通知が返される
      expect(notification.content.agentId).toBe('bulk_agent');

      // ファイルに保存されている
      const allNotifications = getAllNotifications();
      expect(allNotifications).toHaveLength(1);
      expect(allNotifications[0].id).toBe(notification.id);
    });
  });

  // ===========================================================================
  // 既読管理のテスト
  // ===========================================================================
  describe('markNotificationAsRead', () => {
    /**
     * 通知を既読にできる
     */
    it('通知を既読にする', () => {
      const result = createValidRegistrationResult('read_test_agent');
      const notification = notifyRegistration(result);

      // 初期状態は未読
      expect(getUnreadNotifications()).toHaveLength(1);

      // 既読にする
      const success = markNotificationAsRead(notification.id);
      expect(success).toBe(true);

      // 未読が0になる
      expect(getUnreadNotifications()).toHaveLength(0);
    });

    /**
     * 存在しない通知IDの場合はfalseを返す
     */
    it('存在しない通知IDの場合はfalseを返す', () => {
      const success = markNotificationAsRead('non-existent-id');
      expect(success).toBe(false);
    });
  });

  // ===========================================================================
  // 通知一覧取得のテスト
  // ===========================================================================
  describe('getUnreadNotifications / getAllNotifications', () => {
    /**
     * 未読通知のみを取得できる
     */
    it('未読通知のみを取得する', () => {
      const result1 = createValidRegistrationResult('agent_a');
      const result2 = createValidRegistrationResult('agent_b');

      const notification1 = notifyRegistration(result1);
      notifyRegistration(result2);

      // 2件とも未読
      expect(getUnreadNotifications()).toHaveLength(2);

      // 1件を既読にする
      markNotificationAsRead(notification1.id);

      // 未読は1件
      expect(getUnreadNotifications()).toHaveLength(1);

      // 全体は2件
      expect(getAllNotifications()).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Property 14: Registration Notification
  // ===========================================================================
  describe('Property 14: Registration Notification', () => {
    /**
     * **Validates: Requirements 8.5**
     *
     * エージェント登録成功時に、COO/PMへの通知が生成され、
     * 通知には新規エージェントID、役割、登録日時が含まれる
     */
    it('登録成功時にCOO/PM向け通知が生成される', () => {
      const agentId = 'property_test_agent';
      const role = 'Property Test Role';
      const result = createValidRegistrationResult(agentId);

      const notification = notifyRegistration(result, role);

      // 通知が生成されている
      expect(notification).toBeDefined();

      // 受信者がCOO/PMである
      expect(notification.recipient).toBe('COO/PM');

      // 必須情報が含まれている
      expect(notification.content.agentId).toBe(agentId);
      expect(notification.content.role).toBe(role);
      expect(notification.content.registeredAt).toBeDefined();

      // 通知がファイルに保存されている
      const savedNotifications = getAllNotifications();
      expect(savedNotifications.some((n) => n.id === notification.id)).toBe(true);
    });
  });
});
