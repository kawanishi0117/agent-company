/**
 * ExecutionResult データモデルのプロパティテスト
 *
 * Property 23: Execution Result Structure
 * - 任意のExecutionResult出力は有効なJSONであること
 * - 必須フィールドがすべて含まれていること
 * - statusフィールドは有効な値のいずれかであること
 *
 * **Validates: Requirements 20.1, 20.2, 20.4**
 *
 * @module tests/execution/types.property.test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ExecutionResult,
  ExecutionStatus,
  ArtifactInfo,
  CommitInfo,
  ErrorInfo,
  QualityGateResult,
  EXECUTION_RESULT_REQUIRED_FIELDS,
  VALID_EXECUTION_STATUSES,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * ISO8601形式の日時文字列を生成するArbitrary
 */
const iso8601DateArb = fc.date().map((d) => d.toISOString());

/**
 * 有効なExecutionStatusを生成するArbitrary
 */
const executionStatusArb: fc.Arbitrary<ExecutionStatus> = fc.constantFrom(
  ...VALID_EXECUTION_STATUSES
);

/**
 * ArtifactInfoを生成するArbitrary
 */
const artifactInfoArb: fc.Arbitrary<ArtifactInfo> = fc.record({
  path: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  action: fc.constantFrom('created', 'modified', 'deleted'),
  diff: fc.option(fc.string(), { nil: undefined }),
});

/**
 * CommitInfoを生成するArbitrary
 */
const commitInfoArb: fc.Arbitrary<CommitInfo> = fc.record({
  hash: fc.hexaString({ minLength: 40, maxLength: 40 }),
  message: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  author: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  timestamp: iso8601DateArb,
});

/**
 * ErrorInfoを生成するArbitrary
 */
const errorInfoArb: fc.Arbitrary<ErrorInfo> = fc.record({
  code: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  message: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  stack: fc.option(fc.string(), { nil: undefined }),
  timestamp: iso8601DateArb,
  recoverable: fc.boolean(),
});

/**
 * QualityGateResultを生成するArbitrary
 */
const qualityGateResultArb: fc.Arbitrary<QualityGateResult> = fc.record({
  lint: fc.record({
    passed: fc.boolean(),
    output: fc.string(),
  }),
  test: fc.record({
    passed: fc.boolean(),
    output: fc.string(),
  }),
  overall: fc.boolean(),
});

/**
 * 有効なExecutionResultを生成するArbitrary
 */
const executionResultArb: fc.Arbitrary<ExecutionResult> = fc.record({
  runId: fc.uuid(),
  ticketId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  agentId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  status: executionStatusArb,
  startTime: iso8601DateArb,
  endTime: iso8601DateArb,
  artifacts: fc.array(artifactInfoArb, { minLength: 0, maxLength: 10 }),
  gitBranch: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  commits: fc.array(commitInfoArb, { minLength: 0, maxLength: 5 }),
  qualityGates: qualityGateResultArb,
  errors: fc.array(errorInfoArb, { minLength: 0, maxLength: 5 }),
  conversationTurns: fc.integer({ min: 0, max: 100 }),
  tokensUsed: fc.integer({ min: 0, max: 1000000 }),
});

// =============================================================================
// プロパティテスト
// =============================================================================

describe('Property 23: Execution Result Structure', () => {
  /**
   * Property 23.1: JSON Serialization
   * 任意のExecutionResultは有効なJSONにシリアライズできること
   *
   * **Validates: Requirement 20.1**
   * THE Execution_Result SHALL be output in JSON format
   */
  it('Property 23.1: 任意のExecutionResultは有効なJSONにシリアライズできる', () => {
    fc.assert(
      fc.property(executionResultArb, (result) => {
        // JSONにシリアライズ
        const jsonString = JSON.stringify(result);

        // 有効なJSON文字列であることを確認
        expect(typeof jsonString).toBe('string');
        expect(jsonString.length).toBeGreaterThan(0);

        // パースして元のオブジェクトと同等であることを確認
        const parsed = JSON.parse(jsonString);
        expect(parsed).toEqual(result);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.2: Required Fields Presence
   * 任意のExecutionResultは必須フィールドをすべて含むこと
   *
   * **Validates: Requirement 20.2**
   * THE output SHALL include: run_id, ticket_id, agent_id, status, start_time,
   * end_time, artifacts, git_branch, quality_gates, errors
   */
  it('Property 23.2: 任意のExecutionResultは必須フィールドをすべて含む', () => {
    fc.assert(
      fc.property(executionResultArb, (result) => {
        // 必須フィールドがすべて存在することを確認
        for (const field of EXECUTION_RESULT_REQUIRED_FIELDS) {
          expect(result).toHaveProperty(field);
          expect(result[field]).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.3: Valid Status Values
   * 任意のExecutionResultのstatusフィールドは有効な値のいずれかであること
   *
   * **Validates: Requirement 20.4**
   * THE status field SHALL be one of: success, partial, quality_failed, error
   */
  it('Property 23.3: statusフィールドは有効な値のいずれかである', () => {
    fc.assert(
      fc.property(executionResultArb, (result) => {
        // statusが有効な値のいずれかであることを確認
        expect(VALID_EXECUTION_STATUSES).toContain(result.status);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.4: JSON Round-Trip Consistency
   * 任意のExecutionResultはJSON変換後も構造が保持されること
   *
   * **Validates: Requirements 20.1, 20.2**
   */
  it('Property 23.4: JSON変換後も構造が保持される', () => {
    fc.assert(
      fc.property(executionResultArb, (result) => {
        // JSONにシリアライズしてパース
        const jsonString = JSON.stringify(result);
        const parsed = JSON.parse(jsonString) as ExecutionResult;

        // 必須フィールドがすべて保持されていることを確認
        for (const field of EXECUTION_RESULT_REQUIRED_FIELDS) {
          expect(parsed).toHaveProperty(field);
        }

        // statusが有効な値であることを確認
        expect(VALID_EXECUTION_STATUSES).toContain(parsed.status);

        // 配列フィールドが配列として保持されていることを確認
        expect(Array.isArray(parsed.artifacts)).toBe(true);
        expect(Array.isArray(parsed.commits)).toBe(true);
        expect(Array.isArray(parsed.errors)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.5: Artifacts Structure Validity
   * 任意のExecutionResultのartifactsは有効な構造を持つこと
   *
   * **Validates: Requirement 20.2 (artifacts field)**
   */
  it('Property 23.5: artifactsは有効な構造を持つ', () => {
    fc.assert(
      fc.property(executionResultArb, (result) => {
        // 各artifactが必須フィールドを持つことを確認
        for (const artifact of result.artifacts) {
          expect(artifact).toHaveProperty('path');
          expect(artifact).toHaveProperty('action');
          expect(['created', 'modified', 'deleted']).toContain(artifact.action);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.6: Quality Gates Structure Validity
   * 任意のExecutionResultのqualityGatesは有効な構造を持つこと
   *
   * **Validates: Requirement 20.2 (quality_gates field)**
   */
  it('Property 23.6: qualityGatesは有効な構造を持つ', () => {
    fc.assert(
      fc.property(executionResultArb, (result) => {
        // qualityGatesが必須フィールドを持つことを確認
        expect(result.qualityGates).toHaveProperty('lint');
        expect(result.qualityGates).toHaveProperty('test');
        expect(result.qualityGates).toHaveProperty('overall');

        // lint/testが必須フィールドを持つことを確認
        expect(result.qualityGates.lint).toHaveProperty('passed');
        expect(result.qualityGates.lint).toHaveProperty('output');
        expect(result.qualityGates.test).toHaveProperty('passed');
        expect(result.qualityGates.test).toHaveProperty('output');

        // 型が正しいことを確認
        expect(typeof result.qualityGates.lint.passed).toBe('boolean');
        expect(typeof result.qualityGates.test.passed).toBe('boolean');
        expect(typeof result.qualityGates.overall).toBe('boolean');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.7: Errors Structure Validity
   * 任意のExecutionResultのerrorsは有効な構造を持つこと
   *
   * **Validates: Requirement 20.2 (errors field)**
   */
  it('Property 23.7: errorsは有効な構造を持つ', () => {
    fc.assert(
      fc.property(executionResultArb, (result) => {
        // 各errorが必須フィールドを持つことを確認
        for (const error of result.errors) {
          expect(error).toHaveProperty('code');
          expect(error).toHaveProperty('message');
          expect(error).toHaveProperty('timestamp');
          expect(error).toHaveProperty('recoverable');
          expect(typeof error.recoverable).toBe('boolean');
        }
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('ExecutionResult Unit Tests', () => {
  /**
   * 空の配列フィールドを持つExecutionResultが有効であることを確認
   */
  it('空の配列フィールドを持つExecutionResultは有効', () => {
    const result: ExecutionResult = {
      runId: 'run-123',
      ticketId: 'ticket-456',
      agentId: 'agent-789',
      status: 'success',
      startTime: '2024-01-01T00:00:00.000Z',
      endTime: '2024-01-01T01:00:00.000Z',
      artifacts: [],
      gitBranch: 'agent/ticket-456-feature',
      commits: [],
      qualityGates: {
        lint: { passed: true, output: '' },
        test: { passed: true, output: '' },
        overall: true,
      },
      errors: [],
      conversationTurns: 0,
      tokensUsed: 0,
    };

    // JSONシリアライズが成功することを確認
    const jsonString = JSON.stringify(result);
    expect(typeof jsonString).toBe('string');

    // 必須フィールドがすべて存在することを確認
    for (const field of EXECUTION_RESULT_REQUIRED_FIELDS) {
      expect(result).toHaveProperty(field);
    }
  });

  /**
   * 各statusの値が有効であることを確認
   */
  it('各statusの値が有効である', () => {
    const statuses: ExecutionStatus[] = ['success', 'partial', 'quality_failed', 'error'];

    for (const status of statuses) {
      expect(VALID_EXECUTION_STATUSES).toContain(status);
    }

    // 無効なstatusが含まれていないことを確認
    expect(VALID_EXECUTION_STATUSES).toHaveLength(4);
  });

  /**
   * 必須フィールドリストが正しいことを確認
   */
  it('必須フィールドリストが正しい', () => {
    const expectedFields = [
      'runId',
      'ticketId',
      'agentId',
      'status',
      'startTime',
      'endTime',
      'artifacts',
      'gitBranch',
      'qualityGates',
      'errors',
    ];

    expect(EXECUTION_RESULT_REQUIRED_FIELDS).toEqual(expectedFields);
  });

  /**
   * 大量のartifactsを持つExecutionResultが有効であることを確認
   */
  it('大量のartifactsを持つExecutionResultは有効', () => {
    const artifacts: ArtifactInfo[] = Array.from({ length: 100 }, (_, i) => ({
      path: `src/file${i}.ts`,
      action: 'created' as const,
      diff: `+// File ${i}`,
    }));

    const result: ExecutionResult = {
      runId: 'run-large',
      ticketId: 'ticket-large',
      agentId: 'agent-large',
      status: 'success',
      startTime: '2024-01-01T00:00:00.000Z',
      endTime: '2024-01-01T01:00:00.000Z',
      artifacts,
      gitBranch: 'agent/ticket-large-feature',
      commits: [],
      qualityGates: {
        lint: { passed: true, output: '' },
        test: { passed: true, output: '' },
        overall: true,
      },
      errors: [],
      conversationTurns: 50,
      tokensUsed: 100000,
    };

    // JSONシリアライズが成功することを確認
    const jsonString = JSON.stringify(result);
    const parsed = JSON.parse(jsonString);

    expect(parsed.artifacts).toHaveLength(100);
  });

  /**
   * 特殊文字を含むフィールドが正しく処理されることを確認
   */
  it('特殊文字を含むフィールドが正しく処理される', () => {
    const result: ExecutionResult = {
      runId: 'run-special',
      ticketId: 'ticket-日本語',
      agentId: 'agent-émoji-🚀',
      status: 'success',
      startTime: '2024-01-01T00:00:00.000Z',
      endTime: '2024-01-01T01:00:00.000Z',
      artifacts: [
        {
          path: 'src/日本語ファイル.ts',
          action: 'created',
          diff: '+// コメント with "quotes" and \\backslash',
        },
      ],
      gitBranch: 'agent/ticket-日本語-feature',
      commits: [
        {
          hash: 'a'.repeat(40),
          message: 'コミットメッセージ with "quotes"',
          author: '作者名',
          timestamp: '2024-01-01T00:30:00.000Z',
        },
      ],
      qualityGates: {
        lint: { passed: true, output: '出力メッセージ' },
        test: { passed: true, output: '' },
        overall: true,
      },
      errors: [],
      conversationTurns: 10,
      tokensUsed: 5000,
    };

    // JSONシリアライズとパースが成功することを確認
    const jsonString = JSON.stringify(result);
    const parsed = JSON.parse(jsonString) as ExecutionResult;

    expect(parsed.ticketId).toBe('ticket-日本語');
    expect(parsed.agentId).toBe('agent-émoji-🚀');
    expect(parsed.artifacts[0].path).toBe('src/日本語ファイル.ts');
  });
});
