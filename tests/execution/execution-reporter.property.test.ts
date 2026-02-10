/**
 * ExecutionReporter プロパティテスト
 *
 * Property 12: Artifact Collection and Report Completeness
 * - 任意の完了タスクに対して、成果物が収集され、
 *   レポートにtask description, changes, test results, conversation summaryが含まれることを検証。
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 *
 * テスト戦略:
 * - fast-check でランダムな ExecutionResult を生成
 * - generateReport の出力に必須フィールドが含まれることを検証
 * - saveReport → ファイル読み込みのラウンドトリップを検証
 * - collectArtifacts で成果物がコピーされることを検証
 * - renderMarkdown の出力に全セクションが含まれることを検証
 *
 * @module tests/execution/execution-reporter.property.test
 * @see Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ExecutionReporter } from '../../tools/cli/lib/execution/execution-reporter';
import type {
  ExecutionResult,
  ExecutionStatus,
  ArtifactInfo,
  QualityGateResult,
  ReportData,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * fast-check の最小イテレーション回数
 */
const MIN_ITERATIONS = 100;

// =============================================================================
// テスト用一時ディレクトリ管理
// =============================================================================

/** テスト用一時ディレクトリのパス */
let tempDir: string;

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 安全な識別子文字列を生成するArbitrary
 *
 * ファイルシステムで安全に使用できる英数字とハイフンのみの文字列を生成する。
 *
 * @param minLength - 最小長
 * @param maxLength - 最大長
 * @returns 識別子文字列のArbitrary
 */
function safeIdArb(minLength = 3, maxLength = 20): fc.Arbitrary<string> {
  return fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
    { minLength, maxLength }
  );
}

/**
 * RunIDを生成するArbitrary
 *
 * `run-<alphanumeric>-<alphanumeric>` 形式のIDを生成する。
 *
 * @returns RunID文字列のArbitrary
 */
const runIdArb: fc.Arbitrary<string> = fc
  .tuple(safeIdArb(4, 12), safeIdArb(4, 8))
  .map(([ts, rand]) => `run-${ts}-${rand}`);

/**
 * ExecutionStatus を生成するArbitrary
 *
 * @returns ExecutionStatusのArbitrary
 */
const executionStatusArb: fc.Arbitrary<ExecutionStatus> = fc.constantFrom(
  'success' as const,
  'partial' as const,
  'quality_failed' as const,
  'error' as const
);

/**
 * 安全なファイルパスを生成するArbitrary
 *
 * テスト用に安全なファイルパス文字列を生成する。
 *
 * @returns ファイルパス文字列のArbitrary
 */
const safeFilePathArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('src', 'lib', 'tools', 'tests', 'docs'),
    safeIdArb(3, 15),
    fc.constantFrom('.ts', '.js', '.md', '.json', '.yaml')
  )
  .map(([dir, name, ext]) => `${dir}/${name}${ext}`);

/**
 * ArtifactInfo を生成するArbitrary
 *
 * @returns ArtifactInfoのArbitrary
 */
const artifactInfoArb: fc.Arbitrary<ArtifactInfo> = fc
  .tuple(
    safeFilePathArb,
    fc.constantFrom('created' as const, 'modified' as const, 'deleted' as const),
    fc.option(
      fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789+-= \n'),
        { minLength: 0, maxLength: 100 }
      ),
      { nil: undefined }
    )
  )
  .map(([filePath, action, diff]) => ({
    path: filePath,
    action,
    diff,
  }));

/**
 * 出力テキストを生成するArbitrary
 *
 * @returns 出力テキストのArbitrary
 */
const outputArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_()[]{}:;/\n'
  ),
  { minLength: 0, maxLength: 200 }
);

/**
 * QualityGateResult を生成するArbitrary
 *
 * @returns QualityGateResultのArbitrary
 */
const qualityGateResultArb: fc.Arbitrary<QualityGateResult> = fc
  .tuple(
    fc.boolean(), // lint.passed
    outputArb,    // lint.output
    fc.boolean(), // test.passed
    outputArb     // test.output
  )
  .map(([lintPassed, lintOutput, testPassed, testOutput]) => ({
    lint: { passed: lintPassed, output: lintOutput },
    test: { passed: testPassed, output: testOutput },
    overall: lintPassed && testPassed,
  }));

/**
 * ISO8601形式の日時ペア（開始・終了）を生成するArbitrary
 *
 * 開始日時が終了日時より前であることを保証する。
 *
 * @returns [startTime, endTime] のタプルArbitrary
 */
const timeRangeArb: fc.Arbitrary<[string, string]> = fc
  .tuple(
    fc.integer({ min: 1700000000000, max: 1800000000000 }), // 開始タイムスタンプ
    fc.integer({ min: 1000, max: 3600000 })                  // 所要時間（ミリ秒）
  )
  .map(([startMs, durationMs]) => {
    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(startMs + durationMs).toISOString();
    return [startTime, endTime];
  });

/**
 * 正の整数を生成するArbitrary（会話ターン数用）
 *
 * @returns 正の整数のArbitrary
 */
const conversationTurnsArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100 });

/**
 * 正の整数を生成するArbitrary（トークン数用）
 *
 * @returns 正の整数のArbitrary
 */
const tokensUsedArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100000 });

/**
 * ExecutionResult を生成するArbitrary
 *
 * @returns ExecutionResultのArbitrary
 */
const executionResultArb: fc.Arbitrary<ExecutionResult> = fc
  .tuple(
    runIdArb,                                                // runId
    safeIdArb(3, 10),                                        // ticketId
    safeIdArb(3, 10),                                        // agentId
    executionStatusArb,                                      // status
    timeRangeArb,                                            // [startTime, endTime]
    fc.array(artifactInfoArb, { minLength: 0, maxLength: 5 }), // artifacts
    safeIdArb(5, 15),                                        // gitBranch
    qualityGateResultArb,                                    // qualityGates
    conversationTurnsArb,                                    // conversationTurns
    tokensUsedArb                                            // tokensUsed
  )
  .map(([
    runId, ticketId, agentId, status, [startTime, endTime],
    artifacts, gitBranch, qualityGates, conversationTurns, tokensUsed,
  ]) => ({
    runId,
    ticketId,
    agentId,
    status,
    startTime,
    endTime,
    artifacts,
    gitBranch: `feature/${gitBranch}`,
    commits: [],
    qualityGates,
    errors: [],
    conversationTurns,
    tokensUsed,
  }));

/**
 * ReportData を生成するArbitrary
 *
 * @returns ReportDataのArbitrary
 */
const reportDataArb: fc.Arbitrary<ReportData> = fc
  .tuple(
    runIdArb,
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '),
      { minLength: 5, maxLength: 50 }
    ),
    executionStatusArb,
    timeRangeArb,
    fc.array(
      fc.tuple(
        safeFilePathArb,
        fc.constantFrom('created' as const, 'modified' as const, 'deleted' as const)
      ).map(([p, a]) => ({ path: p, action: a })),
      { minLength: 0, maxLength: 5 }
    ),
    qualityGateResultArb,
    conversationTurnsArb,
    tokensUsedArb,
    fc.array(safeFilePathArb, { minLength: 0, maxLength: 5 })
  )
  .map(([
    runId, taskDescription, status, [startTime, endTime],
    changes, qualityGates, turns, tokens, artifacts,
  ]) => ({
    runId,
    taskDescription,
    status,
    startTime,
    endTime,
    duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
    changes,
    testResults: {
      lintPassed: qualityGates.lint.passed,
      lintOutput: qualityGates.lint.output,
      testPassed: qualityGates.test.passed,
      testOutput: qualityGates.test.output,
      overallPassed: qualityGates.overall,
    },
    conversationSummary: `会話ターン数: ${turns}回、使用トークン数: ${tokens}`,
    artifacts,
  }));

// =============================================================================
// セットアップ・クリーンアップ
// =============================================================================

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-reporter-test-'));
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // クリーンアップ失敗は無視
  }
});

// =============================================================================
// Property 12: Artifact Collection and Report Completeness
// =============================================================================

describe('Feature: ai-execution-integration, Property 12: Artifact Collection and Report Completeness', () => {
  /**
   * Property 12a: generateReport は必須フィールドを全て含むレポートを返すこと
   *
   * 任意の ExecutionResult に対して、生成されたレポートには
   * task description, changes, test results, conversation summary が含まれること。
   *
   * **Validates: Requirements 5.2, 5.3**
   */
  it('generateReport: 任意のExecutionResultに対して必須フィールドを全て含むレポートを返す', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionResultArb,
        async (result: ExecutionResult) => {
          // Arrange
          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          // Act: レポートを生成
          const report = reporter.generateReport(result.runId, result);

          // Assert: runId が一致すること
          expect(report.runId).toBe(result.runId);

          // Assert: taskDescription が空でないこと
          expect(report.taskDescription).toBeDefined();
          expect(report.taskDescription.length).toBeGreaterThan(0);

          // Assert: status が元の結果と一致すること
          expect(report.status).toBe(result.status);

          // Assert: startTime, endTime が設定されていること
          expect(report.startTime).toBe(result.startTime);
          expect(report.endTime).toBe(result.endTime);

          // Assert: duration が 0 以上であること
          expect(report.duration).toBeGreaterThanOrEqual(0);

          // Assert: changes が artifacts と同じ数であること
          expect(report.changes.length).toBe(result.artifacts.length);

          // Assert: testResults が設定されていること
          expect(report.testResults).toBeDefined();
          expect(typeof report.testResults.lintPassed).toBe('boolean');
          expect(typeof report.testResults.testPassed).toBe('boolean');
          expect(typeof report.testResults.overallPassed).toBe('boolean');

          // Assert: testResults が元の品質ゲート結果と一致すること
          expect(report.testResults.lintPassed).toBe(result.qualityGates.lint.passed);
          expect(report.testResults.testPassed).toBe(result.qualityGates.test.passed);
          expect(report.testResults.overallPassed).toBe(result.qualityGates.overall);

          // Assert: conversationSummary が空でないこと
          expect(report.conversationSummary).toBeDefined();
          expect(report.conversationSummary.length).toBeGreaterThan(0);

          // Assert: conversationSummary にターン数とトークン数が含まれること
          expect(report.conversationSummary).toContain(String(result.conversationTurns));
          expect(report.conversationSummary).toContain(String(result.tokensUsed));

          // Assert: artifacts パス一覧が元の成果物と一致すること
          expect(report.artifacts).toEqual(result.artifacts.map((a) => a.path));
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 12b: saveReport → ファイル読み込みでレポートが永続化されること
   *
   * 任意の ReportData に対して、saveReport で保存した後、
   * ファイルが存在し、Markdown形式の内容が含まれること。
   *
   * **Validates: Requirements 5.2**
   */
  it('saveReport: 任意のReportDataに対してreport.mdが作成され、必須セクションを含む', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportDataArb,
        async (report: ReportData) => {
          // Arrange
          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          // Act: レポートを保存
          await reporter.saveReport(report.runId, report);

          // Assert: report.md ファイルが存在すること
          const reportPath = path.join(tempDir, report.runId, 'report.md');
          const stat = await fs.stat(reportPath);
          expect(stat.isFile()).toBe(true);

          // Assert: ファイル内容を読み込み
          const content = await fs.readFile(reportPath, 'utf-8');

          // Assert: タイトルセクションが含まれること
          expect(content).toContain(`# 実行レポート: ${report.runId}`);

          // Assert: ステータスセクションが含まれること
          expect(content).toContain('## ステータス');

          // Assert: タイムラインセクションが含まれること
          expect(content).toContain('## タイムライン');

          // Assert: 変更点セクションが含まれること
          expect(content).toContain('## 変更点');

          // Assert: 品質ゲート結果セクションが含まれること
          expect(content).toContain('## 品質ゲート結果');

          // Assert: 会話サマリーセクションが含まれること
          expect(content).toContain('## 会話サマリー');

          // Assert: 成果物セクションが含まれること
          expect(content).toContain('## 成果物');

          // Assert: タスク説明が含まれること
          expect(content).toContain(report.taskDescription);

          // Assert: 会話サマリーが含まれること
          expect(content).toContain(report.conversationSummary);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 12c: generateReport → saveReport の統合フロー
   *
   * 任意の ExecutionResult に対して、generateReport で生成したレポートを
   * saveReport で保存し、ファイルが正しく作成されること。
   *
   * **Validates: Requirements 5.2, 5.3**
   */
  it('generateReport → saveReport: 統合フローでレポートが正しく保存される', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionResultArb,
        async (result: ExecutionResult) => {
          // Arrange
          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          // Act: レポートを生成して保存
          const report = reporter.generateReport(result.runId, result);
          await reporter.saveReport(result.runId, report);

          // Assert: report.md ファイルが存在すること
          const reportPath = path.join(tempDir, result.runId, 'report.md');
          const stat = await fs.stat(reportPath);
          expect(stat.isFile()).toBe(true);

          // Assert: ファイル内容にrunIdが含まれること
          const content = await fs.readFile(reportPath, 'utf-8');
          expect(content).toContain(result.runId);

          // Assert: ファイル内容にticketIdが含まれること（taskDescriptionに含まれる）
          expect(content).toContain(result.ticketId);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 12d: collectArtifacts で成果物ディレクトリが作成されること
   *
   * 任意の成果物リストに対して、collectArtifacts を呼び出すと
   * artifacts/ ディレクトリが作成されること。
   * （ソースファイルが存在しない場合はスキップされる）
   *
   * **Validates: Requirements 5.1, 5.4**
   */
  it('collectArtifacts: 成果物ディレクトリが作成される', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        fc.array(artifactInfoArb, { minLength: 0, maxLength: 5 }),
        async (runId: string, artifacts: ArtifactInfo[]) => {
          // Arrange
          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          // Act: 成果物を収集（ソースファイルは存在しないのでスキップされる）
          await reporter.collectArtifacts(runId, artifacts);

          // Assert: artifacts/ ディレクトリが作成されること
          const artifactsDir = path.join(tempDir, runId, 'artifacts');
          const stat = await fs.stat(artifactsDir);
          expect(stat.isDirectory()).toBe(true);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 12e: collectArtifacts で実在するファイルがコピーされること
   *
   * テスト用の一時ファイルを作成し、それを成果物として収集した場合、
   * artifacts/ ディレクトリにコピーされること。
   * 削除アクションのファイルはスキップされること。
   *
   * **Validates: Requirements 5.1, 5.4**
   */
  it('collectArtifacts: 実在するファイルがコピーされ、削除ファイルはスキップされる', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        safeIdArb(3, 10),
        fc.constantFrom('created' as const, 'modified' as const, 'deleted' as const),
        async (runId: string, fileName: string, action: ArtifactInfo['action']) => {
          // Arrange: テスト用ソースファイルを作成
          const sourceDir = path.join(tempDir, 'source');
          await fs.mkdir(sourceDir, { recursive: true });
          const sourceFile = path.join(sourceDir, `${fileName}.ts`);
          const fileContent = `// テスト用ファイル: ${fileName}`;
          await fs.writeFile(sourceFile, fileContent, 'utf-8');

          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          const artifacts: ArtifactInfo[] = [
            { path: sourceFile, action },
          ];

          // Act: 成果物を収集
          await reporter.collectArtifacts(runId, artifacts);

          // Assert: artifacts/ ディレクトリが存在すること
          const artifactsDir = path.join(tempDir, runId, 'artifacts');
          const stat = await fs.stat(artifactsDir);
          expect(stat.isDirectory()).toBe(true);

          if (action === 'deleted') {
            // 削除アクションの場合、ファイルはコピーされないこと
            const files = await fs.readdir(artifactsDir);
            const copiedFile = files.find((f) => f === `${fileName}.ts`);
            expect(copiedFile).toBeUndefined();
          } else {
            // 作成・変更アクションの場合、ファイルがコピーされること
            const copiedPath = path.join(artifactsDir, `${fileName}.ts`);
            const copiedStat = await fs.stat(copiedPath);
            expect(copiedStat.isFile()).toBe(true);

            // コピーされたファイルの内容が一致すること
            const copiedContent = await fs.readFile(copiedPath, 'utf-8');
            expect(copiedContent).toBe(fileContent);
          }
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 12f: renderMarkdown の出力に全必須セクションが含まれること
   *
   * 任意の ReportData に対して、renderMarkdown の出力には
   * タイトル、ステータス、タイムライン、変更点、品質ゲート結果、
   * 会話サマリー、成果物の全セクションが含まれること。
   *
   * **Validates: Requirements 5.3**
   */
  it('renderMarkdown: 全必須セクションが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportDataArb,
        async (report: ReportData) => {
          // Arrange
          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          // Act: Markdownをレンダリング
          const markdown = reporter.renderMarkdown(report);

          // Assert: 全必須セクションが含まれること
          const requiredSections = [
            `# 実行レポート: ${report.runId}`,
            '## ステータス',
            '## タイムライン',
            '## 変更点',
            '## 品質ゲート結果',
            '## 会話サマリー',
            '## 成果物',
          ];

          for (const section of requiredSections) {
            expect(markdown).toContain(section);
          }

          // Assert: タスク説明が含まれること
          expect(markdown).toContain(report.taskDescription);

          // Assert: 会話サマリーが含まれること
          expect(markdown).toContain(report.conversationSummary);

          // Assert: 開始・終了時刻が含まれること
          expect(markdown).toContain(report.startTime);
          expect(markdown).toContain(report.endTime);

          // Assert: Lint結果が含まれること
          expect(markdown).toContain('Lint');
          expect(markdown).toContain('Test');
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 12g: changes の各エントリが正しくカテゴリ分けされること
   *
   * 任意の ExecutionResult に対して、generateReport で生成された changes は
   * 元の artifacts と同じ数・同じアクション種別であること。
   *
   * **Validates: Requirements 5.3**
   */
  it('generateReport: changes が artifacts と同じ数・同じアクション種別を持つ', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionResultArb,
        async (result: ExecutionResult) => {
          // Arrange
          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          // Act: レポートを生成
          const report = reporter.generateReport(result.runId, result);

          // Assert: changes の数が artifacts と一致すること
          expect(report.changes.length).toBe(result.artifacts.length);

          // Assert: 各 change のパスとアクションが元の artifact と一致すること
          for (let i = 0; i < report.changes.length; i++) {
            expect(report.changes[i].path).toBe(result.artifacts[i].path);
            expect(report.changes[i].action).toBe(result.artifacts[i].action);
          }
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 12h: duration は startTime と endTime の差と一致すること
   *
   * 任意の ExecutionResult に対して、generateReport で計算された duration は
   * endTime - startTime（ミリ秒）と一致すること。
   *
   * **Validates: Requirements 5.3**
   */
  it('generateReport: duration は endTime - startTime と一致する', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionResultArb,
        async (result: ExecutionResult) => {
          // Arrange
          const reporter = new ExecutionReporter({ runsBaseDir: tempDir });

          // Act: レポートを生成
          const report = reporter.generateReport(result.runId, result);

          // Assert: duration が正しく計算されていること
          const expectedDuration = Math.max(
            0,
            new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
          );
          expect(report.duration).toBe(expectedDuration);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });
});
