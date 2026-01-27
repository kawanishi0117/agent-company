/**
 * スキーマバリデータのテスト
 * Property 1: Schema Conformance - 有効な定義は検証を通過
 * Property 2: Invalid Definition Detection - 不完全な定義はエラー
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateAgentDefinition, ValidationResult } from '../tools/cli/validator';

// 有効なエージェント定義を生成するArbitrary
const validAgentDefinitionArb = fc.record({
  id: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  responsibilities: fc.array(fc.string(), { minLength: 1 }),
  capabilities: fc.array(fc.string(), { minLength: 1 }),
  deliverables: fc.array(fc.string(), { minLength: 1 }),
  quality_gates: fc.array(fc.string(), { minLength: 1 }),
  budget: fc.record({
    tokens: fc.integer({ min: 1 }),
    time_minutes: fc.integer({ min: 1 }),
  }),
  persona: fc.string({ minLength: 1 }),
  escalation: fc.record({
    to: fc.string({ minLength: 1 }),
    conditions: fc.array(fc.string()),
  }),
});

// 必須フィールド一覧
const REQUIRED_FIELDS = [
  'id',
  'title',
  'responsibilities',
  'capabilities',
  'deliverables',
  'quality_gates',
  'budget',
  'persona',
  'escalation',
];

describe('Schema Validator', () => {
  /**
   * Property 1: Schema Conformance
   * For any valid agent definition, validation SHALL succeed without errors.
   * Validates: Requirements 1.1, 2.3, 3.3
   */
  it('Property 1: 有効なエージェント定義はスキーマに準拠する', () => {
    fc.assert(
      fc.property(validAgentDefinitionArb, (definition) => {
        const result: ValidationResult = validateAgentDefinition(definition);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Invalid Definition Detection
   * For any agent definition missing required fields, validation SHALL return errors.
   * Validates: Requirements 1.3
   */
  it('Property 2: 必須フィールドが欠けた定義はエラーを返す', () => {
    fc.assert(
      fc.property(
        validAgentDefinitionArb,
        fc.integer({ min: 1, max: REQUIRED_FIELDS.length }),
        (definition, numFieldsToRemove) => {
          // ランダムに1つ以上のフィールドを削除
          const fieldsToRemove = fc.sample(
            fc.shuffledSubarray(REQUIRED_FIELDS, {
              minLength: numFieldsToRemove,
              maxLength: numFieldsToRemove,
            }),
            1
          )[0];

          const invalidDefinition = { ...definition };
          for (const field of fieldsToRemove) {
            delete (invalidDefinition as Record<string, unknown>)[field];
          }

          const result: ValidationResult = validateAgentDefinition(invalidDefinition);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // 具体的なエッジケースのユニットテスト
  describe('Unit Tests', () => {
    it('null入力はエラーを返す', () => {
      const result = validateAgentDefinition(null);
      expect(result.valid).toBe(false);
    });

    it('空オブジェクトは全フィールド欠落エラーを返す', () => {
      const result = validateAgentDefinition({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(REQUIRED_FIELDS.length);
    });

    it('budgetが不正な型の場合エラーを返す', () => {
      const definition = {
        id: 'test',
        title: 'Test',
        responsibilities: ['r1'],
        capabilities: ['c1'],
        deliverables: ['d1'],
        quality_gates: ['g1'],
        budget: 'invalid', // 不正な型
        persona: 'persona',
        escalation: { to: 'target', conditions: [] },
      };
      const result = validateAgentDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('budget'))).toBe(true);
    });
  });
});
