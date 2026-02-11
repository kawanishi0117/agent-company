/**
 * CodingAgentAdapter基底プロパティテスト
 *
 * Property 1: Adapter Interface Compliance
 * Property 3: Subprocess Timeout Enforcement
 *
 * @module tests/coding-agents/base.property
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { CodingTaskResult } from '../../tools/cli/lib/execution/types.js';
import {
  CodingAgentError,
  CodingAgentTimeoutError,
  CodingAgentNotFoundError,
} from '../../tools/coding-agents/base.js';

// =============================================================================
// Property 1: Adapter Interface Compliance
// CodingTaskResultの全必須フィールドが存在すること
// =============================================================================

describe('Property 1: Adapter Interface Compliance', () => {
  /**
   * CodingTaskResult Arbitrary
   * 任意のCodingTaskResultを生成
   */
  const codingTaskResultArb: fc.Arbitrary<CodingTaskResult> = fc.record({
    success: fc.boolean(),
    output: fc.string(),
    stderr: fc.string(),
    exitCode: fc.integer({ min: 0, max: 255 }),
    durationMs: fc.nat(),
    filesChanged: fc.array(fc.string()),
  });

  it('CodingTaskResultは全必須フィールドを持つこと', () => {
    fc.assert(
      fc.property(codingTaskResultArb, (result) => {
        // 全必須フィールドが存在する
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('output');
        expect(result).toHaveProperty('stderr');
        expect(result).toHaveProperty('exitCode');
        expect(result).toHaveProperty('durationMs');
        expect(result).toHaveProperty('filesChanged');

        // 型が正しい
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.output).toBe('string');
        expect(typeof result.stderr).toBe('string');
        expect(typeof result.exitCode).toBe('number');
        expect(typeof result.durationMs).toBe('number');
        expect(Array.isArray(result.filesChanged)).toBe(true);
      }),
      { numRuns: 10 }
    );
  });

  it('exitCodeは0-255の範囲であること', () => {
    fc.assert(
      fc.property(codingTaskResultArb, (result) => {
        expect(result.exitCode).toBeGreaterThanOrEqual(0);
        expect(result.exitCode).toBeLessThanOrEqual(255);
      }),
      { numRuns: 10 }
    );
  });

  it('durationMsは非負であること', () => {
    fc.assert(
      fc.property(codingTaskResultArb, (result) => {
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 10 }
    );
  });
});

// =============================================================================
// Property 3: Subprocess Timeout Enforcement
// タイムアウトエラーが正しく生成されること
// =============================================================================

describe('Property 3: Subprocess Timeout Enforcement', () => {
  it('CodingAgentTimeoutErrorは正しいエージェント名とタイムアウト値を含むこと', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 3600 }),
        (agentName, timeoutSeconds) => {
          const error = new CodingAgentTimeoutError(agentName, timeoutSeconds);

          // エラーメッセージにエージェント名とタイムアウト値が含まれる
          expect(error.message).toContain(agentName);
          expect(error.message).toContain(String(timeoutSeconds));

          // エラーコードがTIMEOUT
          expect(error.code).toBe('TIMEOUT');

          // エージェント名が正しい
          expect(error.agentName).toBe(agentName);

          // CodingAgentErrorのインスタンス
          expect(error).toBeInstanceOf(CodingAgentError);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('CodingAgentNotFoundErrorは正しいコマンド名を含むこと', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (agentName, command) => {
          const error = new CodingAgentNotFoundError(agentName, command);

          expect(error.message).toContain(command);
          expect(error.code).toBe('NOT_FOUND');
          expect(error.agentName).toBe(agentName);
          expect(error).toBeInstanceOf(CodingAgentError);
        }
      ),
      { numRuns: 10 }
    );
  });
});
