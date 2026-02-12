/**
 * QA結果パーサーのユニットテスト
 *
 * @module tests/execution/qa-result-parser
 */

import { describe, it, expect } from 'vitest';
import {
  parseVitestOutput,
  parseEslintOutput,
  stripAnsi,
} from '../../tools/cli/lib/execution/qa-result-parser.js';

// =============================================================================
// stripAnsi
// =============================================================================

describe('stripAnsi', () => {
  it('ANSIエスケープコードを除去する', () => {
    const input = '\x1B[32m✓\x1B[0m テスト通過';
    expect(stripAnsi(input)).toBe('✓ テスト通過');
  });

  it('ANSIコードがない場合はそのまま返す', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  it('空文字列を処理できる', () => {
    expect(stripAnsi('')).toBe('');
  });
});

// =============================================================================
// parseVitestOutput
// =============================================================================

describe('parseVitestOutput', () => {
  it('空出力でパース失敗を返す', () => {
    const result = parseVitestOutput('');
    expect(result.parsed).toBe(false);
    expect(result.total).toBe(0);
  });

  it('標準的なVitest出力をパースする', () => {
    const output = `
 ✓ tests/example.test.ts (3 tests) 45ms
 ✓ tests/other.test.ts (2 tests) 12ms

 Tests  5 passed (5)
 Duration  1.23s
`;
    const result = parseVitestOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.total).toBe(5);
    expect(result.passed).toBe(5);
    expect(result.failed).toBe(0);
  });

  it('passed + failed + skipped の混合出力をパースする', () => {
    const output = `
 Tests  8 passed | 2 failed | 1 skipped (11)
 Duration  3.45s
`;
    const result = parseVitestOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.total).toBe(11);
    expect(result.passed).toBe(8);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('括弧なしの場合は合算で total を計算する', () => {
    const output = `
 Tests  3 passed | 1 failed
 Duration  0.5s
`;
    const result = parseVitestOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.total).toBe(4);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(1);
  });

  it('v8カバレッジ出力をパースする', () => {
    const output = `
 Tests  10 passed (10)

 % Stmts | % Branch | % Funcs | % Lines
All files  |   85.5  |   72.3  |   90.1  |   85.5
 src/       |   80.0  |   70.0  |   85.0  |   80.0
`;
    const result = parseVitestOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.coverage).toBeCloseTo(85.5, 1);
  });

  it('istanbul形式のカバレッジをパースする', () => {
    const output = `
 Tests  5 passed (5)
Statements   : 78.5% ( 100/127 )
Branches     : 65.0% ( 26/40 )
`;
    const result = parseVitestOutput(output);
    expect(result.coverage).toBeCloseTo(78.5, 1);
  });

  it('"All files |" 形式のカバレッジをパースする', () => {
    const output = `
 Tests  10 passed (10)
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |   92.3  |   88.1   |   95.0  |   92.3  |
----------|---------|----------|---------|---------|
`;
    const result = parseVitestOutput(output);
    expect(result.coverage).toBeCloseTo(92.3, 1);
  });

  it('カバレッジ情報がない場合は -1 を返す', () => {
    const output = `
 Tests  3 passed (3)
 Duration  0.5s
`;
    const result = parseVitestOutput(output);
    expect(result.coverage).toBe(-1);
  });

  it('ANSIコード付き出力を正しくパースする', () => {
    const output = `
\x1B[32m ✓\x1B[0m tests/example.test.ts
 \x1B[1mTests\x1B[0m  \x1B[32m5 passed\x1B[0m (5)
`;
    const result = parseVitestOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.passed).toBe(5);
  });

  it('Test Files 行からフォールバックパースする', () => {
    const output = `
 Test Files  3 passed | 1 failed (4)
 Tests  15 passed | 2 failed (17)
`;
    const result = parseVitestOutput(output);
    expect(result.parsed).toBe(true);
    // Tests 行が優先される
    expect(result.passed).toBe(15);
    expect(result.failed).toBe(2);
    expect(result.total).toBe(17);
  });

  it('rawExcerpt が500文字以内に切り詰められる', () => {
    const longOutput = 'x'.repeat(1000);
    const result = parseVitestOutput(longOutput);
    expect(result.rawExcerpt.length).toBe(500);
  });
});

// =============================================================================
// parseEslintOutput
// =============================================================================

describe('parseEslintOutput', () => {
  it('空出力でエラーなしを返す', () => {
    const result = parseEslintOutput('');
    expect(result.parsed).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('problems形式の出力をパースする', () => {
    const output = `
/src/index.ts
  1:1  error  Unexpected var  no-var
  3:5  warning  Unexpected console  no-console

✖ 2 problems (1 error, 1 warning)
`;
    const result = parseEslintOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(result.passed).toBe(false);
  });

  it('複数エラー・警告をパースする', () => {
    const output = '✖ 15 problems (10 errors, 5 warnings)';
    const result = parseEslintOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.errorCount).toBe(10);
    expect(result.warningCount).toBe(5);
    expect(result.passed).toBe(false);
  });

  it('警告のみの場合は passed: true を返す', () => {
    const output = '✖ 3 problems (0 errors, 3 warnings)';
    const result = parseEslintOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(3);
    expect(result.passed).toBe(true);
  });

  it('"X errors and Y warnings" 形式をパースする', () => {
    const output = 'Found 2 errors and 4 warnings';
    const result = parseEslintOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.errorCount).toBe(2);
    expect(result.warningCount).toBe(4);
    expect(result.passed).toBe(false);
  });

  it('行単位のerror/warningカウントにフォールバックする', () => {
    const output = `
/src/foo.ts
  1:1  error  Missing return type  @typescript-eslint/explicit-function-return-type
  5:3  error  Unused variable  @typescript-eslint/no-unused-vars
  8:1  warning  Unexpected console  no-console
`;
    const result = parseEslintOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.errorCount).toBe(2);
    expect(result.warningCount).toBe(1);
    expect(result.passed).toBe(false);
  });

  it('パース不能な出力でも安全側に倒す', () => {
    const output = 'Some random output that is not ESLint format';
    const result = parseEslintOutput(output);
    expect(result.parsed).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('ANSIコード付き出力を正しくパースする', () => {
    const output = '\x1B[31m✖ 5 problems (3 errors, 2 warnings)\x1B[0m';
    const result = parseEslintOutput(output);
    expect(result.parsed).toBe(true);
    expect(result.errorCount).toBe(3);
    expect(result.warningCount).toBe(2);
  });
});
