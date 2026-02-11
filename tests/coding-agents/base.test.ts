/**
 * CodingAgentAdapter基底テスト
 *
 * エラークラス、ヘルパー関数のユニットテスト。
 *
 * @module tests/coding-agents/base
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CodingAgentError,
  CodingAgentTimeoutError,
  CodingAgentNotFoundError,
  getDefaultTimeoutSeconds,
} from '../../tools/coding-agents/base.js';

// =============================================================================
// エラークラスのテスト
// =============================================================================

describe('CodingAgentError', () => {
  it('正しいプロパティを持つこと', () => {
    const error = new CodingAgentError('テストエラー', 'TEST_CODE', 'test-agent');

    expect(error.message).toBe('テストエラー');
    expect(error.code).toBe('TEST_CODE');
    expect(error.agentName).toBe('test-agent');
    expect(error.name).toBe('CodingAgentError');
    expect(error).toBeInstanceOf(Error);
  });

  it('causeを保持できること', () => {
    const cause = new Error('原因エラー');
    const error = new CodingAgentError('テストエラー', 'TEST_CODE', 'test-agent', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('CodingAgentTimeoutError', () => {
  it('タイムアウト情報を含むメッセージを生成すること', () => {
    const error = new CodingAgentTimeoutError('claude-code', 600);

    expect(error.message).toContain('claude-code');
    expect(error.message).toContain('600');
    expect(error.code).toBe('TIMEOUT');
    expect(error.agentName).toBe('claude-code');
    expect(error.name).toBe('CodingAgentTimeoutError');
    expect(error).toBeInstanceOf(CodingAgentError);
  });
});

describe('CodingAgentNotFoundError', () => {
  it('コマンド名を含むメッセージを生成すること', () => {
    const error = new CodingAgentNotFoundError('opencode', 'opencode');

    expect(error.message).toContain('opencode');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.agentName).toBe('opencode');
    expect(error.name).toBe('CodingAgentNotFoundError');
    expect(error).toBeInstanceOf(CodingAgentError);
  });
});

// =============================================================================
// ヘルパー関数のテスト
// =============================================================================

describe('getDefaultTimeoutSeconds', () => {
  it('正の数値を返すこと', () => {
    const timeout = getDefaultTimeoutSeconds();

    expect(timeout).toBeGreaterThan(0);
    expect(typeof timeout).toBe('number');
  });

  it('600秒（10分）を返すこと', () => {
    expect(getDefaultTimeoutSeconds()).toBe(600);
  });
});
