/**
 * Waiver検証ロジックのテスト
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect } from 'vitest';
import {
  validateWaiverContent,
  parseWaiverContent,
  isOverdue,
  formatValidationResult,
} from '../tools/cli/lib/waiver-validator';

// 有効なWaiverコンテンツ
const validWaiverContent = `# Waiver: テストカバレッジ例外

## 申請日

2026-01-29

## 申請者

Developer Agent

## 対象

テストカバレッジ80%基準

## 理由

新機能の緊急リリースのため、一時的にカバレッジ基準を緩和する必要がある。

## 緊急性

顧客要望により2026-01-30までにリリースが必要。

## 代替策

手動テストを実施し、重要なパスは確認済み。

## 期限

2026-02-15

## フォロータスク

- [ ] 不足しているユニットテストを追加
- [ ] E2Eテストを拡充

## 承認者

Quality Authority

## ステータス

- [x] 申請中
- [ ] 承認
- [ ] 却下
- [ ] 解消済み
`;

describe('Waiver Validator', () => {
  describe('parseWaiverContent', () => {
    it('有効なWaiverコンテンツを正しく解析する', () => {
      const fields = parseWaiverContent(validWaiverContent);

      expect(fields.申請日).toBe('2026-01-29');
      expect(fields.申請者).toBe('Developer Agent');
      expect(fields.対象).toBe('テストカバレッジ80%基準');
      expect(fields.理由).toContain('新機能の緊急リリース');
      expect(fields.期限).toBe('2026-02-15');
      expect(fields.フォロータスク).toHaveLength(2);
    });

    it('空のコンテンツは空のフィールドを返す', () => {
      const fields = parseWaiverContent('');
      expect(Object.keys(fields)).toHaveLength(0);
    });
  });

  describe('validateWaiverContent', () => {
    it('有効なWaiverは検証を通過する', () => {
      const result = validateWaiverContent(validWaiverContent);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('期限が欠落している場合エラーを返す', () => {
      const content = validWaiverContent.replace('## 期限\n\n2026-02-15', '## 期限\n\n');
      const result = validateWaiverContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('期限'))).toBe(true);
    });

    it('期限の形式が不正な場合エラーを返す', () => {
      const content = validWaiverContent.replace('2026-02-15', '2026/02/15');
      const result = validateWaiverContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('形式が不正'))).toBe(true);
    });

    it('理由が欠落している場合エラーを返す', () => {
      const content = validWaiverContent.replace(
        '## 理由\n\n新機能の緊急リリースのため、一時的にカバレッジ基準を緩和する必要がある。',
        '## 理由\n\n'
      );
      const result = validateWaiverContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('理由'))).toBe(true);
    });

    it('理由がテンプレートのままの場合エラーを返す', () => {
      const content = validWaiverContent.replace(
        '新機能の緊急リリースのため、一時的にカバレッジ基準を緩和する必要がある。',
        '[なぜ例外が必要か]'
      );
      const result = validateWaiverContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('テンプレートのまま'))).toBe(true);
    });

    it('フォロータスクが欠落している場合エラーを返す', () => {
      const content = validWaiverContent.replace(
        '## フォロータスク\n\n- [ ] 不足しているユニットテストを追加\n- [ ] E2Eテストを拡充',
        '## フォロータスク\n\n'
      );
      const result = validateWaiverContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('フォロータスク'))).toBe(true);
    });

    it('フォロータスクがテンプレートのままの場合エラーを返す', () => {
      const content = validWaiverContent.replace(
        '- [ ] 不足しているユニットテストを追加\n- [ ] E2Eテストを拡充',
        '- [ ] [解消のためのタスク1]\n- [ ] [解消のためのタスク2]'
      );
      const result = validateWaiverContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('フォロータスク'))).toBe(true);
    });

    it('申請者が欠落している場合エラーを返す', () => {
      const content = validWaiverContent.replace('## 申請者\n\nDeveloper Agent', '## 申請者\n\n');
      const result = validateWaiverContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('申請者'))).toBe(true);
    });
  });

  describe('isOverdue', () => {
    it('過去の日付は期限切れと判定する', () => {
      expect(isOverdue('2020-01-01')).toBe(true);
    });

    it('未来の日付は期限切れではないと判定する', () => {
      expect(isOverdue('2030-12-31')).toBe(false);
    });

    it('不正な形式の日付はfalseを返す', () => {
      expect(isOverdue('invalid')).toBe(false);
      expect(isOverdue('2026/01/01')).toBe(false);
    });
  });

  describe('formatValidationResult', () => {
    it('有効な結果は成功メッセージを返す', () => {
      const result = validateWaiverContent(validWaiverContent);
      const formatted = formatValidationResult(result);

      expect(formatted).toContain('✅');
      expect(formatted).toContain('有効');
    });

    it('無効な結果はエラーメッセージを返す', () => {
      const result = validateWaiverContent('');
      const formatted = formatValidationResult(result);

      expect(formatted).toContain('❌');
      expect(formatted).toContain('エラー');
    });

    it('警告がある場合は警告メッセージを含む', () => {
      // 過去の期限を設定して警告を発生させる
      const content = validWaiverContent.replace('2026-02-15', '2020-01-01');
      const result = validateWaiverContent(content);
      const formatted = formatValidationResult(result);

      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('警告');
    });
  });
});
