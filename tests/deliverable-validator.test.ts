/**
 * 成果物バリデータのテスト
 * Property 3: Deliverable Validation - 不完全な成果物はFAIL判定
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateDeliverable,
  REQUIRED_SECTIONS,
  extractSections,
} from '../tools/cli/deliverable-validator';

// 有効な成果物Markdownを生成するArbitrary
const validDeliverableArb = fc.record({
  title: fc.string({ minLength: 1 }),
  purpose: fc.string({ minLength: 1 }),
  changes: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
  testResult: fc.constantFrom('PASS', 'pass', '成功'),
  e2eResult: fc.constantFrom('PASS', 'pass', '成功'),
  rollback: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
  risks: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
}).map((data) => {
  return `# 成果物レポート: ${data.title}

## 目的
${data.purpose}

## 変更点
${data.changes.map((c) => `- ${c}`).join('\n')}

## テスト結果
結果: ${data.testResult}

## E2E結果
結果: ${data.e2eResult}

## ロールバック
${data.rollback.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## リスク
${data.risks.map((r) => `- ${r}`).join('\n')}
`;
});

// セクションを削除するヘルパー
function removeSections(content: string, sectionsToRemove: string[]): string {
  let result = content;
  for (const section of sectionsToRemove) {
    // セクションヘッダーとその内容を削除（次のセクションまで）
    const pattern = new RegExp(`## ${section}[\\s\\S]*?(?=## |$)`, 'gi');
    result = result.replace(pattern, '');
  }
  return result;
}

describe('Deliverable Validator', () => {
  /**
   * Property 3: Deliverable Validation
   * For any deliverable missing required sections, Quality Authority SHALL issue FAIL.
   * Validates: Requirements 4.3
   */
  it('Property 3: 必須セクションが欠けた成果物はFAIL判定を受ける', () => {
    fc.assert(
      fc.property(
        validDeliverableArb,
        fc.integer({ min: 1, max: REQUIRED_SECTIONS.length }),
        (validContent, numSectionsToRemove) => {
          // ランダムに1つ以上のセクションを削除
          const sectionsToRemove = fc.sample(
            fc.shuffledSubarray([...REQUIRED_SECTIONS], {
              minLength: numSectionsToRemove,
              maxLength: numSectionsToRemove,
            }),
            1
          )[0];

          const invalidContent = removeSections(validContent, sectionsToRemove);
          const result = validateDeliverable(invalidContent);

          expect(result.judgment).toBe('FAIL');
          expect(result.missingSections.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('有効な成果物はPASS判定を受ける', () => {
    fc.assert(
      fc.property(validDeliverableArb, (content) => {
        const result = validateDeliverable(content);
        expect(result.judgment).toBe('PASS');
        expect(result.missingSections).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  describe('Unit Tests', () => {
    it('空コンテンツはFAIL判定', () => {
      const result = validateDeliverable('');
      expect(result.judgment).toBe('FAIL');
      expect(result.errors).toContain('成果物が空です');
    });

    it('セクション抽出が正しく動作する', () => {
      const content = `
## 目的
テスト

## 変更点
- 変更1

### サブセクション
内容
`;
      const sections = extractSections(content);
      expect(sections.has('目的')).toBe(true);
      expect(sections.has('変更点')).toBe(true);
      expect(sections.has('サブセクション')).toBe(true);
    });

    it('英語セクション名も認識する', () => {
      const content = `
## Purpose
Test purpose

## Changes
- Change 1

## Test Results
PASS

## E2E Results
PASS

## Rollback
1. Step 1

## Risk
- Risk 1
`;
      const result = validateDeliverable(content);
      expect(result.judgment).toBe('PASS');
    });
  });
});
