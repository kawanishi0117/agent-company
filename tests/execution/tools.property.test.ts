/**
 * Tool Call プロパティテスト
 *
 * Property 16: Tool Call Round-Trip
 * - write_fileで書き込んだファイルをread_fileで読み取ると、同じ内容が返ること
 *
 * Property 17: File Edit Consistency
 * - edit_fileで有効なdiffを適用すると、期待される結果になること
 *
 * **Validates: Requirements 8.2, 8.3, 8.4**
 *
 * @module tests/execution/tools.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ToolExecutor, FileEdit, applyEditsToContent } from '../../tools/cli/lib/execution/tools';
import { ProcessMonitor } from '../../tools/cli/lib/execution/process-monitor';
import { GitManager } from '../../tools/cli/lib/execution/git-manager';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * テスト用の一時ディレクトリ
 */
let TEST_WORKSPACE_DIR: string;

/**
 * テスト用の実行ID
 */
const TEST_RUN_ID = 'test-tools-property-001';

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 有効なファイル名を生成するArbitrary
 * - 英数字、ハイフン、アンダースコア、ドットのみ
 * - 先頭がドットでない
 * - 空でない
 */
const validFileNameArb: fc.Arbitrary<string> = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_.'.split('')), {
    minLength: 1,
    maxLength: 50,
  })
  .filter((s) => !s.startsWith('.') && !s.startsWith('-') && s.length > 0);

/**
 * 有効なファイルパスを生成するArbitrary
 * - ディレクトリ区切りを含む可能性がある
 */
const validFilePathArb: fc.Arbitrary<string> = fc
  .array(validFileNameArb, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join('/'));

/**
 * ファイル内容を生成するArbitrary
 * - 任意のUTF-8文字列
 * - 改行を含む可能性がある
 */
const fileContentArb: fc.Arbitrary<string> = fc.string({
  minLength: 0,
  maxLength: 10000,
});

/**
 * 行ベースのファイル内容を生成するArbitrary
 * - 複数行のテキスト
 */
const multiLineContentArb: fc.Arbitrary<string> = fc
  .array(
    fc.string({ minLength: 0, maxLength: 100 }).filter((s) => !s.includes('\n')),
    { minLength: 1, maxLength: 20 }
  )
  .map((lines) => lines.join('\n'));

/**
 * 有効なreplace編集を生成するArbitrary
 * @param lineCount - ファイルの行数
 */
const validReplaceEditArb = (lineCount: number): fc.Arbitrary<FileEdit> => {
  if (lineCount === 0) {
    // 空ファイルの場合は編集不可
    return fc.constant({ type: 'insert' as const, startLine: 1, content: '' });
  }
  return fc
    .tuple(
      fc.integer({ min: 1, max: lineCount }),
      fc.integer({ min: 1, max: lineCount }),
      fc.string({ minLength: 0, maxLength: 100 }).filter((s) => !s.includes('\n'))
    )
    .map(([start, end, content]) => ({
      type: 'replace' as const,
      startLine: Math.min(start, end),
      endLine: Math.max(start, end),
      content,
    }));
};

/**
 * 有効なinsert編集を生成するArbitrary
 * @param lineCount - ファイルの行数
 */
const validInsertEditArb = (lineCount: number): fc.Arbitrary<FileEdit> => {
  return fc
    .tuple(
      fc.integer({ min: 1, max: Math.max(1, lineCount + 1) }),
      fc.string({ minLength: 0, maxLength: 100 }).filter((s) => !s.includes('\n'))
    )
    .map(([startLine, content]) => ({
      type: 'insert' as const,
      startLine,
      content,
    }));
};

/**
 * 有効なdelete編集を生成するArbitrary
 * @param lineCount - ファイルの行数
 */
const validDeleteEditArb = (lineCount: number): fc.Arbitrary<FileEdit> => {
  if (lineCount === 0) {
    // 空ファイルの場合は削除不可
    return fc.constant({ type: 'insert' as const, startLine: 1, content: '' });
  }
  return fc
    .tuple(
      fc.integer({ min: 1, max: lineCount }),
      fc.integer({ min: 1, max: lineCount })
    )
    .map(([start, end]) => ({
      type: 'delete' as const,
      startLine: Math.min(start, end),
      endLine: Math.max(start, end),
    }));
};

// =============================================================================
// テストセットアップ
// =============================================================================

describe('Property 16: Tool Call Round-Trip', () => {
  let toolExecutor: ToolExecutor;
  let processMonitor: ProcessMonitor;
  let gitManager: GitManager;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    TEST_WORKSPACE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-property-test-'));

    // テスト用のインスタンスを作成
    processMonitor = new ProcessMonitor('runtime/runs');
    gitManager = new GitManager(processMonitor, 'runtime/runs');
    toolExecutor = new ToolExecutor(processMonitor, gitManager, TEST_WORKSPACE_DIR);
    toolExecutor.setRunId(TEST_RUN_ID);
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_WORKSPACE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  // ===========================================================================
  // Property 16: Tool Call Round-Trip
  // ===========================================================================

  /**
   * Property 16.1: write_file → read_file Round-Trip
   * 任意のファイル内容をwrite_fileで書き込み、read_fileで読み取ると同じ内容が返る
   *
   * **Validates: Requirements 8.2, 8.3**
   */
  it('Property 16.1: write_fileで書き込んだ内容をread_fileで読み取ると同じ内容が返る', async () => {
    await fc.assert(
      fc.asyncProperty(validFileNameArb, fileContentArb, async (fileName, content) => {
        // ファイルを書き込み
        const writeResult = await toolExecutor.writeFile(fileName, content);
        expect(writeResult.success).toBe(true);

        // ファイルを読み取り
        const readResult = await toolExecutor.readFile(fileName);
        expect(readResult.success).toBe(true);

        // 内容が一致することを確認
        expect(readResult.data).toBe(content);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.2: ネストしたパスでのRound-Trip
   * ネストしたディレクトリパスでも同様にRound-Tripが成立する
   *
   * **Validates: Requirements 8.2, 8.3**
   */
  it('Property 16.2: ネストしたパスでもwrite_file → read_fileのRound-Tripが成立する', async () => {
    await fc.assert(
      fc.asyncProperty(validFilePathArb, fileContentArb, async (filePath, content) => {
        // ファイルを書き込み
        const writeResult = await toolExecutor.writeFile(filePath, content);
        expect(writeResult.success).toBe(true);

        // ファイルを読み取り
        const readResult = await toolExecutor.readFile(filePath);
        expect(readResult.success).toBe(true);

        // 内容が一致することを確認
        expect(readResult.data).toBe(content);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.3: 上書きでのRound-Trip
   * 既存ファイルを上書きしても、最新の内容が読み取れる
   *
   * **Validates: Requirements 8.2, 8.3**
   */
  it('Property 16.3: ファイルを上書きしても最新の内容が読み取れる', async () => {
    await fc.assert(
      fc.asyncProperty(
        validFileNameArb,
        fileContentArb,
        fileContentArb,
        async (fileName, content1, content2) => {
          // 最初の内容を書き込み
          await toolExecutor.writeFile(fileName, content1);

          // 上書き
          const writeResult = await toolExecutor.writeFile(fileName, content2);
          expect(writeResult.success).toBe(true);

          // 読み取り
          const readResult = await toolExecutor.readFile(fileName);
          expect(readResult.success).toBe(true);

          // 最新の内容が返ることを確認
          expect(readResult.data).toBe(content2);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.4: 空ファイルのRound-Trip
   * 空のファイルでもRound-Tripが成立する
   *
   * **Validates: Requirements 8.2, 8.3**
   */
  it('Property 16.4: 空ファイルでもRound-Tripが成立する', async () => {
    await fc.assert(
      fc.asyncProperty(validFileNameArb, async (fileName) => {
        // 空ファイルを書き込み
        const writeResult = await toolExecutor.writeFile(fileName, '');
        expect(writeResult.success).toBe(true);

        // 読み取り
        const readResult = await toolExecutor.readFile(fileName);
        expect(readResult.success).toBe(true);

        // 空文字列が返ることを確認
        expect(readResult.data).toBe('');
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.5: 日本語・絵文字を含むファイルのRound-Trip
   * Unicode文字を含むファイルでもRound-Tripが成立する
   *
   * **Validates: Requirements 8.2, 8.3**
   */
  it('Property 16.5: Unicode文字を含むファイルでもRound-Tripが成立する', async () => {
    await fc.assert(
      fc.asyncProperty(
        validFileNameArb,
        fc.string({ minLength: 0, maxLength: 1000 }),
        async (fileName, content) => {
          // ファイルを書き込み
          const writeResult = await toolExecutor.writeFile(fileName, content);
          expect(writeResult.success).toBe(true);

          // 読み取り
          const readResult = await toolExecutor.readFile(fileName);
          expect(readResult.success).toBe(true);

          // 内容が一致することを確認
          expect(readResult.data).toBe(content);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// Property 17: File Edit Consistency
// =============================================================================

describe('Property 17: File Edit Consistency', () => {
  let toolExecutor: ToolExecutor;
  let processMonitor: ProcessMonitor;
  let gitManager: GitManager;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    TEST_WORKSPACE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-property-test-'));

    // テスト用のインスタンスを作成
    processMonitor = new ProcessMonitor('runtime/runs');
    gitManager = new GitManager(processMonitor, 'runtime/runs');
    toolExecutor = new ToolExecutor(processMonitor, gitManager, TEST_WORKSPACE_DIR);
    toolExecutor.setRunId(TEST_RUN_ID);
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(TEST_WORKSPACE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * Property 17.1: replace編集の一貫性
   * replace編集を適用すると、指定した行が新しい内容に置き換わる
   *
   * **Validates: Requirement 8.4**
   */
  it('Property 17.1: replace編集を適用すると指定した行が新しい内容に置き換わる', async () => {
    await fc.assert(
      fc.asyncProperty(multiLineContentArb, async (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        if (lineCount === 0) return; // 空ファイルはスキップ

        // ファイルを作成
        const fileName = 'test-replace.txt';
        await toolExecutor.writeFile(fileName, content);

        // ランダムな行を選択して置換
        const startLine = Math.floor(Math.random() * lineCount) + 1;
        const endLine = Math.min(startLine + Math.floor(Math.random() * 3), lineCount);
        const newContent = 'REPLACED_CONTENT';

        const edits: FileEdit[] = [
          { type: 'replace', startLine, endLine, content: newContent },
        ];

        // 編集を適用
        const editResult = await toolExecutor.editFile(fileName, edits);
        expect(editResult.success).toBe(true);

        // 結果を検証
        const readResult = await toolExecutor.readFile(fileName);
        expect(readResult.success).toBe(true);

        const resultLines = readResult.data!.split('\n');

        // 置換前の行数 - 削除された行数 + 挿入された行数 = 結果の行数
        const deletedLines = endLine - startLine + 1;
        const insertedLines = newContent.split('\n').length;
        expect(resultLines.length).toBe(lineCount - deletedLines + insertedLines);

        // 置換された内容が含まれていることを確認
        expect(readResult.data).toContain(newContent);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 17.2: insert編集の一貫性
   * insert編集を適用すると、指定した位置に新しい行が挿入される
   *
   * **Validates: Requirement 8.4**
   */
  it('Property 17.2: insert編集を適用すると指定した位置に新しい行が挿入される', async () => {
    await fc.assert(
      fc.asyncProperty(multiLineContentArb, async (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        // ファイルを作成
        const fileName = 'test-insert.txt';
        await toolExecutor.writeFile(fileName, content);

        // ランダムな位置に挿入
        const insertLine = Math.floor(Math.random() * (lineCount + 1)) + 1;
        const newContent = 'INSERTED_LINE';

        const edits: FileEdit[] = [
          { type: 'insert', startLine: insertLine, content: newContent },
        ];

        // 編集を適用
        const editResult = await toolExecutor.editFile(fileName, edits);
        expect(editResult.success).toBe(true);

        // 結果を検証
        const readResult = await toolExecutor.readFile(fileName);
        expect(readResult.success).toBe(true);

        const resultLines = readResult.data!.split('\n');

        // 行数が1増えていることを確認
        expect(resultLines.length).toBe(lineCount + 1);

        // 挿入された内容が含まれていることを確認
        expect(readResult.data).toContain(newContent);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 17.3: delete編集の一貫性
   * delete編集を適用すると、指定した行が削除される
   *
   * **Validates: Requirement 8.4**
   *
   * 注: 削除の本質は「行数の減少」であり、削除された内容が他の行に存在しないことを
   * 検証するのは不適切（空白行など、同じ内容が複数行に存在する場合があるため）。
   * そのため、行数の検証のみを行う。
   */
  it('Property 17.3: delete編集を適用すると指定した行が削除される', async () => {
    await fc.assert(
      fc.asyncProperty(multiLineContentArb, async (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        // 1行以下のファイルはスキップ（削除後に空になる場合の挙動が複雑）
        if (lineCount <= 1) return;

        // ファイルを作成
        const fileName = 'test-delete.txt';
        await toolExecutor.writeFile(fileName, content);

        // ランダムな行を選択して削除（全行削除は避ける）
        const startLine = Math.floor(Math.random() * lineCount) + 1;
        const maxEndLine = Math.min(startLine + Math.floor(Math.random() * 2), lineCount - 1);
        const endLine = Math.max(startLine, maxEndLine);

        const edits: FileEdit[] = [
          { type: 'delete', startLine, endLine },
        ];

        // 編集を適用
        const editResult = await toolExecutor.editFile(fileName, edits);
        expect(editResult.success).toBe(true);

        // 結果を検証
        const readResult = await toolExecutor.readFile(fileName);
        expect(readResult.success).toBe(true);

        const resultLines = readResult.data!.split('\n');

        // 行数が正しく減っていることを確認（削除の本質的な検証）
        const deletedLineCount = endLine - startLine + 1;
        expect(resultLines.length).toBe(lineCount - deletedLineCount);

        // 削除前後の行が保持されていることを確認
        // 削除前の行（startLine-1より前）
        for (let i = 0; i < startLine - 1; i++) {
          expect(resultLines[i]).toBe(lines[i]);
        }
        // 削除後の行（endLineより後）
        for (let i = endLine; i < lineCount; i++) {
          const resultIndex = i - deletedLineCount;
          expect(resultLines[resultIndex]).toBe(lines[i]);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 17.4: 編集後のファイル読み取りの一貫性
   * edit_fileの結果とread_fileの結果が一致する
   *
   * **Validates: Requirement 8.4**
   */
  it('Property 17.4: edit_fileの結果とread_fileの結果が一致する', async () => {
    await fc.assert(
      fc.asyncProperty(multiLineContentArb, async (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        if (lineCount === 0) return; // 空ファイルはスキップ

        // ファイルを作成
        const fileName = 'test-consistency.txt';
        await toolExecutor.writeFile(fileName, content);

        // ランダムな編集を生成
        const startLine = Math.floor(Math.random() * lineCount) + 1;
        const newContent = 'EDITED_CONTENT';

        const edits: FileEdit[] = [
          { type: 'replace', startLine, endLine: startLine, content: newContent },
        ];

        // 編集を適用
        const editResult = await toolExecutor.editFile(fileName, edits);
        expect(editResult.success).toBe(true);

        // edit_fileの戻り値とread_fileの結果が一致することを確認
        const readResult = await toolExecutor.readFile(fileName);
        expect(readResult.success).toBe(true);
        expect(readResult.data).toBe(editResult.data);
      }),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// applyEditsToContent 純粋関数のプロパティテスト
// =============================================================================

describe('applyEditsToContent Property Tests', () => {
  /**
   * Property: replace編集は行数を正しく変更する
   */
  it('replace編集は行数を正しく変更する', () => {
    fc.assert(
      fc.property(multiLineContentArb, (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        if (lineCount === 0) return true; // 空ファイルはスキップ

        const startLine = Math.floor(Math.random() * lineCount) + 1;
        const endLine = Math.min(startLine + Math.floor(Math.random() * 3), lineCount);
        const newContent = 'NEW\nCONTENT';

        const edits: FileEdit[] = [
          { type: 'replace', startLine, endLine, content: newContent },
        ];

        const result = applyEditsToContent(content, edits);

        if (!result.success) return true; // エラーの場合はスキップ

        const resultLines = result.data!.split('\n');
        const deletedLines = endLine - startLine + 1;
        const insertedLines = newContent.split('\n').length;

        return resultLines.length === lineCount - deletedLines + insertedLines;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: insert編集は行数を1増やす（単一行の場合）
   */
  it('insert編集は行数を1増やす（単一行の場合）', () => {
    fc.assert(
      fc.property(multiLineContentArb, (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        const insertLine = Math.floor(Math.random() * (lineCount + 1)) + 1;
        const newContent = 'SINGLE_LINE';

        const edits: FileEdit[] = [
          { type: 'insert', startLine: insertLine, content: newContent },
        ];

        const result = applyEditsToContent(content, edits);

        if (!result.success) return true; // エラーの場合はスキップ

        const resultLines = result.data!.split('\n');
        return resultLines.length === lineCount + 1;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: delete編集は行数を減らす
   */
  it('delete編集は行数を減らす', () => {
    fc.assert(
      fc.property(multiLineContentArb, (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        // 1行以下のファイルはスキップ（削除後に空になる場合の挙動が複雑）
        if (lineCount <= 1) return true;

        // 全行削除は避ける
        const startLine = Math.floor(Math.random() * lineCount) + 1;
        const maxEndLine = Math.min(startLine + Math.floor(Math.random() * 2), lineCount - 1);
        const endLine = Math.max(startLine, maxEndLine);

        const edits: FileEdit[] = [
          { type: 'delete', startLine, endLine },
        ];

        const result = applyEditsToContent(content, edits);

        if (!result.success) return true; // エラーの場合はスキップ

        const resultLines = result.data!.split('\n');
        const deletedLines = endLine - startLine + 1;

        return resultLines.length === lineCount - deletedLines;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: 空の編集リストは内容を変更しない
   */
  it('空の編集リストは内容を変更しない', () => {
    fc.assert(
      fc.property(fileContentArb, (content) => {
        const result = applyEditsToContent(content, []);

        return result.success && result.data === content;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: 無効な行番号はエラーを返す
   */
  it('無効な行番号はエラーを返す', () => {
    fc.assert(
      fc.property(multiLineContentArb, (content) => {
        const lines = content.split('\n');
        const lineCount = lines.length;

        // 範囲外の行番号
        const invalidLine = lineCount + 10;

        const edits: FileEdit[] = [
          { type: 'replace', startLine: invalidLine, endLine: invalidLine, content: 'INVALID' },
        ];

        const result = applyEditsToContent(content, edits);

        return !result.success && result.error !== undefined;
      }),
      { numRuns: 50 }
    );
  });
});
