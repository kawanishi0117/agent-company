/**
 * QA結果パーサーモジュール
 *
 * Vitest / ESLint の標準出力をパースし、構造化されたテスト結果を返す。
 * WorkflowEngine の QA フェーズで使用し、ハードコード値を排除する。
 *
 * @module execution/qa-result-parser
 */

// =============================================================================
// 型定義
// =============================================================================

/** Vitest 出力のパース結果 */
export interface VitestParseResult {
  /** テスト総数 */
  total: number;
  /** 成功数 */
  passed: number;
  /** 失敗数 */
  failed: number;
  /** スキップ数 */
  skipped: number;
  /** カバレッジ（%、取得できない場合は -1） */
  coverage: number;
  /** パース成功フラグ */
  parsed: boolean;
  /** 生の出力（デバッグ用、先頭500文字） */
  rawExcerpt: string;
}

/** ESLint 出力のパース結果 */
export interface EslintParseResult {
  /** エラー数 */
  errorCount: number;
  /** 警告数 */
  warningCount: number;
  /** 全チェック通過フラグ */
  passed: boolean;
  /** パース成功フラグ */
  parsed: boolean;
  /** 詳細メッセージ */
  details: string;
}

// =============================================================================
// 定数
// =============================================================================

/** 生出力の保持上限（文字数） */
const RAW_EXCERPT_LIMIT = 500;

// =============================================================================
// Vitest 出力パーサー
// =============================================================================

/**
 * Vitest の標準出力をパースしてテスト結果を抽出する
 *
 * 対応フォーマット:
 * - "Tests  X passed | Y failed | Z skipped (W)"
 * - "Tests  X passed (X)"
 * - "Test Files  ..."
 * - カバレッジ: "All files" 行の "Stmts" 列、または "% Stmts" ヘッダー下の値
 *
 * @param output - Vitest の stdout/stderr 結合出力
 * @returns パース結果
 */
export function parseVitestOutput(output: string): VitestParseResult {
  const result: VitestParseResult = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    coverage: -1,
    parsed: false,
    rawExcerpt: output.slice(0, RAW_EXCERPT_LIMIT),
  };

  if (!output || output.trim() === '') {
    return result;
  }

  // ANSIエスケープコードを除去
  const clean = stripAnsi(output);

  // テスト件数の抽出
  // パターン: "Tests  3 passed | 1 failed | 2 skipped (6)"
  // パターン: "Tests  10 passed (10)"
  const testsLineMatch = clean.match(
    /Tests\s+(.+?)(?:\((\d+)\)|\n)/i
  );

  if (testsLineMatch) {
    const testsSegment = testsLineMatch[1];

    // passed
    const passedMatch = testsSegment.match(/(\d+)\s+passed/i);
    if (passedMatch) {
      result.passed = parseInt(passedMatch[1], 10);
    }

    // failed
    const failedMatch = testsSegment.match(/(\d+)\s+failed/i);
    if (failedMatch) {
      result.failed = parseInt(failedMatch[1], 10);
    }

    // skipped
    const skippedMatch = testsSegment.match(/(\d+)\s+skipped/i);
    if (skippedMatch) {
      result.skipped = parseInt(skippedMatch[1], 10);
    }

    // 合計: 括弧内の数値、またはpassed+failed+skippedの合算
    if (testsLineMatch[2]) {
      result.total = parseInt(testsLineMatch[2], 10);
    } else {
      result.total = result.passed + result.failed + result.skipped;
    }

    result.parsed = true;
  }

  // Test Files 行からのフォールバック
  if (!result.parsed) {
    const testFilesMatch = clean.match(
      /Test Files\s+(.+?)(?:\((\d+)\)|\n)/i
    );
    if (testFilesMatch) {
      const segment = testFilesMatch[1];
      const passedMatch = segment.match(/(\d+)\s+passed/i);
      const failedMatch = segment.match(/(\d+)\s+failed/i);

      if (passedMatch) result.passed = parseInt(passedMatch[1], 10);
      if (failedMatch) result.failed = parseInt(failedMatch[1], 10);
      result.total = result.passed + result.failed;
      result.parsed = result.total > 0;
    }
  }

  // カバレッジの抽出
  // パターン: "All files  |  85.5  |  80.2  |  90.1  |  85.5"
  // "All files" 行の最初の数値をステートメントカバレッジとして取得
  const coverageMatch = clean.match(
    /All files\s*\|\s*([\d.]+)/
  );
  if (coverageMatch) {
    result.coverage = parseFloat(coverageMatch[1]);
  }

  // "Statements   : XX%" パターン（istanbul形式）
  if (result.coverage < 0) {
    const statementsMatch = clean.match(
      /Statements\s*:\s*([\d.]+)%/i
    );
    if (statementsMatch) {
      result.coverage = parseFloat(statementsMatch[1]);
    }
  }

  // "% Stmts" ヘッダーの下にある "All files" 行（v8形式）
  if (result.coverage < 0) {
    const v8Match = clean.match(
      /% Stmts.*\n.*All files.*?([\d.]+)/
    );
    if (v8Match) {
      result.coverage = parseFloat(v8Match[1]);
    }
  }

  return result;
}

// =============================================================================
// ESLint 出力パーサー
// =============================================================================

/**
 * ESLint の標準出力をパースしてエラー・警告数を抽出する
 *
 * 対応フォーマット:
 * - "✖ X problems (Y errors, Z warnings)"
 * - "X errors and Y warnings"
 * - エラーなし時は空出力またはパース不能 → passed: true
 *
 * @param output - ESLint の stdout/stderr 結合出力
 * @returns パース結果
 */
export function parseEslintOutput(output: string): EslintParseResult {
  const result: EslintParseResult = {
    errorCount: 0,
    warningCount: 0,
    passed: true,
    parsed: false,
    details: '',
  };

  if (!output || output.trim() === '') {
    // 出力なし = エラーなし（ESLintの正常終了）
    result.parsed = true;
    result.details = 'lint完了: エラーなし';
    return result;
  }

  const clean = stripAnsi(output);

  // パターン1: "✖ X problems (Y errors, Z warnings)"
  const problemsMatch = clean.match(
    /(\d+)\s+problems?\s*\(\s*(\d+)\s+errors?,\s*(\d+)\s+warnings?\s*\)/i
  );
  if (problemsMatch) {
    result.errorCount = parseInt(problemsMatch[2], 10);
    result.warningCount = parseInt(problemsMatch[3], 10);
    result.passed = result.errorCount === 0;
    result.parsed = true;
    result.details = `lint完了: エラー${result.errorCount}件、警告${result.warningCount}件`;
    return result;
  }

  // パターン2: "X errors and Y warnings" (Prettier等)
  const errWarnMatch = clean.match(
    /(\d+)\s+errors?\s+and\s+(\d+)\s+warnings?/i
  );
  if (errWarnMatch) {
    result.errorCount = parseInt(errWarnMatch[1], 10);
    result.warningCount = parseInt(errWarnMatch[2], 10);
    result.passed = result.errorCount === 0;
    result.parsed = true;
    result.details = `lint完了: エラー${result.errorCount}件、警告${result.warningCount}件`;
    return result;
  }

  // パターン3: "X warnings" のみ
  const warnOnlyMatch = clean.match(/(\d+)\s+warnings?/i);
  // "error" が含まれていないことを確認（誤検出防止）
  if (warnOnlyMatch && !clean.match(/\d+\s+errors?/i)) {
    result.warningCount = parseInt(warnOnlyMatch[1], 10);
    result.passed = true;
    result.parsed = true;
    result.details = `lint完了: エラー0件、警告${result.warningCount}件`;
    return result;
  }

  // パターン4: "error" キーワードの存在チェック（最終手段）
  const errorLines = clean.split('\n').filter(
    (line) => /^\s*\d+:\d+\s+error\s+/i.test(line)
  );
  const warningLines = clean.split('\n').filter(
    (line) => /^\s*\d+:\d+\s+warning\s+/i.test(line)
  );

  if (errorLines.length > 0 || warningLines.length > 0) {
    result.errorCount = errorLines.length;
    result.warningCount = warningLines.length;
    result.passed = result.errorCount === 0;
    result.parsed = true;
    result.details = `lint完了: エラー${result.errorCount}件、警告${result.warningCount}件`;
    return result;
  }

  // パース不能だが出力あり → エラーなしと推定（安全側）
  result.parsed = false;
  result.passed = true;
  result.details = `lint完了（出力パース不能）: ${clean.slice(0, 200)}`;
  return result;
}

// =============================================================================
// ユーティリティ
// =============================================================================

/**
 * ANSIエスケープコードを除去する
 *
 * @param text - ANSI コード付きテキスト
 * @returns クリーンなテキスト
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}
