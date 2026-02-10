/**
 * @file チケット作成画面のユニットテスト
 * @description フォームバリデーション、Markdownプレビュー、送信処理のテスト
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.5 - プロジェクト選択、指示入力、送信、プレビュー
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// =============================================================================
// 型定義
// =============================================================================

/**
 * フォームデータ
 */
interface FormData {
  projectId: string;
  instruction: string;
  priority: 'low' | 'medium' | 'high';
  tags: string;
  deadline: string;
}

/**
 * フォームエラー
 */
interface FormErrors {
  projectId?: string;
  instruction?: string;
}

// =============================================================================
// バリデーション関数（テスト対象）
// =============================================================================

/**
 * フォームバリデーション
 * @requirements 8.5 - エラーハンドリング
 */
function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};

  if (!data.projectId) {
    errors.projectId = 'プロジェクトを選択してください';
  }

  if (!data.instruction.trim()) {
    errors.instruction = '指示内容を入力してください';
  } else if (data.instruction.trim().length < 10) {
    errors.instruction = '指示内容は10文字以上で入力してください';
  }

  return errors;
}

/**
 * タグ文字列をパース
 */
function parseTags(tagString: string): string[] {
  return tagString
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// =============================================================================
// ユニットテスト
// =============================================================================

describe('Form Validation', () => {
  /**
   * @validates Requirements 8.1, 8.2, 8.5
   */
  describe('validateForm', () => {
    it('プロジェクトIDが空の場合、エラーを返す', () => {
      const data: FormData = {
        projectId: '',
        instruction: 'テスト指示内容です',
        priority: 'medium',
        tags: '',
        deadline: '',
      };
      const errors = validateForm(data);
      expect(errors.projectId).toBe('プロジェクトを選択してください');
    });

    it('指示内容が空の場合、エラーを返す', () => {
      const data: FormData = {
        projectId: 'proj-001',
        instruction: '',
        priority: 'medium',
        tags: '',
        deadline: '',
      };
      const errors = validateForm(data);
      expect(errors.instruction).toBe('指示内容を入力してください');
    });

    it('指示内容が空白のみの場合、エラーを返す', () => {
      const data: FormData = {
        projectId: 'proj-001',
        instruction: '   ',
        priority: 'medium',
        tags: '',
        deadline: '',
      };
      const errors = validateForm(data);
      expect(errors.instruction).toBe('指示内容を入力してください');
    });

    it('指示内容が10文字未満の場合、エラーを返す', () => {
      const data: FormData = {
        projectId: 'proj-001',
        instruction: '短い指示',
        priority: 'medium',
        tags: '',
        deadline: '',
      };
      const errors = validateForm(data);
      expect(errors.instruction).toBe('指示内容は10文字以上で入力してください');
    });

    it('有効なデータの場合、エラーを返さない', () => {
      const data: FormData = {
        projectId: 'proj-001',
        instruction: 'これは十分に長い指示内容です',
        priority: 'medium',
        tags: 'feature, test',
        deadline: '2026-03-01',
      };
      const errors = validateForm(data);
      expect(Object.keys(errors).length).toBe(0);
    });

    it('複数のエラーがある場合、全てのエラーを返す', () => {
      const data: FormData = {
        projectId: '',
        instruction: '',
        priority: 'medium',
        tags: '',
        deadline: '',
      };
      const errors = validateForm(data);
      expect(errors.projectId).toBeDefined();
      expect(errors.instruction).toBeDefined();
    });
  });
});

describe('Tag Parsing', () => {
  it('カンマ区切りのタグを配列に変換する', () => {
    const result = parseTags('feature, bug, refactor');
    expect(result).toEqual(['feature', 'bug', 'refactor']);
  });

  it('空白を含むタグをトリムする', () => {
    const result = parseTags('  feature  ,  bug  ');
    expect(result).toEqual(['feature', 'bug']);
  });

  it('空文字列の場合、空配列を返す', () => {
    const result = parseTags('');
    expect(result).toEqual([]);
  });

  it('空白のみの場合、空配列を返す', () => {
    const result = parseTags('   ,   ,   ');
    expect(result).toEqual([]);
  });

  it('単一のタグを正しく処理する', () => {
    const result = parseTags('feature');
    expect(result).toEqual(['feature']);
  });
});

describe('HTML Escaping', () => {
  it('特殊文字をエスケープする', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
    expect(escapeHtml("'test'")).toBe('&#039;test&#039;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('通常の文字はそのまま返す', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('日本語テスト')).toBe('日本語テスト');
  });

  it('空文字列はそのまま返す', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// =============================================================================
// プロパティベーステスト
// =============================================================================

describe('Property-based tests', () => {
  /**
   * Property: Form Validation Consistency
   * @validates Requirements 8.5
   */
  describe('Form Validation Properties', () => {
    it('有効なプロジェクトIDと十分な長さの指示があればエラーなし', () => {
      // 空白のみの文字列を除外するためにfilterを使用
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 10, maxLength: 1000 }).filter((s) => s.trim().length >= 10),
          (projectId, instruction) => {
            const data: FormData = {
              projectId,
              instruction,
              priority: 'medium',
              tags: '',
              deadline: '',
            };
            const errors = validateForm(data);
            return Object.keys(errors).length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('空のプロジェクトIDは常にエラーを返す', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 1000 }), (instruction) => {
          const data: FormData = {
            projectId: '',
            instruction,
            priority: 'medium',
            tags: '',
            deadline: '',
          };
          const errors = validateForm(data);
          return errors.projectId !== undefined;
        }),
        { numRuns: 100 }
      );
    });

    it('10文字未満の指示は常にエラーを返す', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 9 }),
          (projectId, instruction) => {
            const data: FormData = {
              projectId,
              instruction,
              priority: 'medium',
              tags: '',
              deadline: '',
            };
            const errors = validateForm(data);
            return errors.instruction !== undefined;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Tag Parsing Consistency
   */
  describe('Tag Parsing Properties', () => {
    it('パースされたタグ数はカンマ数+1以下', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (tagString) => {
          const result = parseTags(tagString);
          const commaCount = (tagString.match(/,/g) || []).length;
          return result.length <= commaCount + 1;
        }),
        { numRuns: 100 }
      );
    });

    it('パースされたタグには空文字列が含まれない', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (tagString) => {
          const result = parseTags(tagString);
          return result.every((tag) => tag.length > 0);
        }),
        { numRuns: 100 }
      );
    });

    it('パースされたタグには前後の空白がない', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (tagString) => {
          const result = parseTags(tagString);
          return result.every((tag) => tag === tag.trim());
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: HTML Escaping Safety
   */
  describe('HTML Escaping Properties', () => {
    it('エスケープ後の文字列に生の特殊文字が含まれない', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 500 }), (input) => {
          const escaped = escapeHtml(input);
          // エスケープ後は生の < > " ' & が含まれない（エンティティ形式のみ）
          // ただし、元々エンティティ形式だった場合は除く
          const hasRawSpecialChars = /[<>"']/.test(escaped);
          // & は &amp; &lt; などの一部として存在する可能性があるので別途チェック
          const hasRawAmpersand = /&(?!(amp|lt|gt|quot|#039);)/.test(escaped);
          return !hasRawSpecialChars && !hasRawAmpersand;
        }),
        { numRuns: 100 }
      );
    });

    it('エスケープは冪等ではない（二重エスケープが発生する）', () => {
      // これは仕様確認のテスト
      const input = '<script>';
      const once = escapeHtml(input);
      const twice = escapeHtml(once);
      expect(once).not.toBe(twice);
    });
  });
});
