/**
 * ExecutionReporter - 実行結果レポート生成・成果物収集
 *
 * タスク実行完了後のレポート生成、Markdown形式での保存、
 * および変更ファイルの成果物ディレクトリへの収集を担当する。
 *
 * 主な責務:
 * - ExecutionResult から ReportData を生成
 * - Markdown形式のレポートを `runtime/runs/<run-id>/report.md` に保存
 * - 変更ファイルを `runtime/runs/<run-id>/artifacts/` にコピー
 *
 * @module execution/execution-reporter
 * @see Requirements: 5.1, 5.2, 5.3, 5.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  ExecutionResult,
  ExecutionStatus,
  ArtifactInfo,
  ReportData,
  ChangeEntry,
  TestResultSummary,
} from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 実行ディレクトリのデフォルトベースパス
 */
const DEFAULT_RUNS_BASE_DIR = 'runtime/runs';

/**
 * レポートファイル名
 * @see Requirement 5.2: レポートを report.md に保存
 */
const REPORT_FILENAME = 'report.md';

/**
 * 成果物ディレクトリ名
 * @see Requirement 5.4: 成果物を artifacts/ に収集
 */
const ARTIFACTS_DIR_NAME = 'artifacts';

/**
 * ミリ秒から秒への変換係数
 */
const MS_PER_SECOND = 1000;

/**
 * 秒から分への変換係数
 */
const SECONDS_PER_MINUTE = 60;

// =============================================================================
// ExecutionReporter 設定インターフェース
// =============================================================================

/**
 * ExecutionReporter の設定オプション
 * @description コンストラクタに渡す設定
 */
export interface ExecutionReporterOptions {
  /** 実行ディレクトリのベースパス（デフォルト: 'runtime/runs'） */
  runsBaseDir?: string;
}

// =============================================================================
// ExecutionReporter クラス
// =============================================================================

/**
 * ExecutionReporter - 実行結果レポーター
 *
 * タスク実行完了後のレポート生成と成果物収集を担当する。
 * RunDirectoryManager と連携して、実行ディレクトリ内にレポートと成果物を保存する。
 *
 * @see Requirement 5.1: 完了タスクの成果物を収集すること
 * @see Requirement 5.2: レポートを生成すること
 * @see Requirement 5.3: レポートにはtask description, changes, test results, conversation summaryを含むこと
 * @see Requirement 5.4: 成果物をrunディレクトリに収集すること
 */
export class ExecutionReporter {
  /**
   * 実行ディレクトリのベースパス
   */
  private readonly runsBaseDir: string;

  /**
   * コンストラクタ
   *
   * @param options - 設定オプション
   */
  constructor(options: ExecutionReporterOptions = {}) {
    this.runsBaseDir = options.runsBaseDir ?? DEFAULT_RUNS_BASE_DIR;
  }

  // ===========================================================================
  // レポート生成
  // ===========================================================================

  /**
   * ExecutionResult から ReportData を生成する
   *
   * 実行結果からレポートに必要なデータを抽出・変換する。
   * タスク説明、変更点、テスト結果、会話サマリーを含む。
   *
   * @param runId - 実行ID
   * @param result - 実行結果
   * @returns 生成されたレポートデータ
   *
   * @see Requirement 5.2: レポートを生成すること
   * @see Requirement 5.3: レポートにはtask description, changes, test results, conversation summaryを含むこと
   */
  generateReport(runId: string, result: ExecutionResult): ReportData {
    // 変更エントリの抽出
    const changes = this.extractChanges(result.artifacts);

    // テスト結果サマリーの生成
    const testResults = this.extractTestResults(result.qualityGates);

    // 会話サマリーの生成
    const conversationSummary = this.buildConversationSummary(
      result.conversationTurns,
      result.tokensUsed
    );

    // 所要時間の計算
    const duration = this.calculateDuration(result.startTime, result.endTime);

    // 成果物パス一覧の抽出
    const artifactPaths = result.artifacts.map((a) => a.path);

    return {
      runId,
      taskDescription: `チケット ${result.ticketId} の実行結果（エージェント: ${result.agentId}）`,
      status: result.status,
      startTime: result.startTime,
      endTime: result.endTime,
      duration,
      changes,
      testResults,
      conversationSummary,
      artifacts: artifactPaths,
    };
  }

  // ===========================================================================
  // レポート保存
  // ===========================================================================

  /**
   * レポートをMarkdown形式でファイルに保存する
   *
   * `runtime/runs/<run-id>/report.md` にMarkdown形式のレポートを書き出す。
   * ディレクトリが存在しない場合は自動的に作成する。
   *
   * @param runId - 実行ID
   * @param report - 保存するレポートデータ
   * @throws ファイルシステムエラー（権限不足等）
   *
   * @see Requirement 5.2: レポートを report.md に保存すること
   */
  async saveReport(runId: string, report: ReportData): Promise<void> {
    const runDir = path.join(this.runsBaseDir, runId);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(runDir, { recursive: true });

    // Markdownレポートを生成
    const markdown = this.renderMarkdown(report);

    // ファイルに書き出し
    const reportPath = path.join(runDir, REPORT_FILENAME);
    await fs.writeFile(reportPath, markdown, 'utf-8');
  }

  // ===========================================================================
  // 成果物収集
  // ===========================================================================

  /**
   * 変更ファイルを成果物ディレクトリにコピーする
   *
   * 実行中に作成・変更されたファイルを `runtime/runs/<run-id>/artifacts/` にコピーする。
   * 削除されたファイルはスキップする。
   * ソースファイルが存在しない場合もスキップする（エラーにしない）。
   *
   * @param runId - 実行ID
   * @param artifacts - 成果物情報の配列
   * @throws ファイルシステムエラー（権限不足等）
   *
   * @see Requirement 5.1: 完了タスクの成果物を収集すること
   * @see Requirement 5.4: 成果物をrunディレクトリに収集すること
   */
  async collectArtifacts(runId: string, artifacts: ArtifactInfo[]): Promise<void> {
    const artifactsDir = path.join(this.runsBaseDir, runId, ARTIFACTS_DIR_NAME);

    // 成果物ディレクトリを作成
    await fs.mkdir(artifactsDir, { recursive: true });

    for (const artifact of artifacts) {
      // 削除されたファイルはスキップ
      if (artifact.action === 'deleted') {
        continue;
      }

      try {
        // コピー先のパスを構築（ディレクトリ構造を維持）
        const destPath = path.join(artifactsDir, path.basename(artifact.path));
        const destDir = path.dirname(destPath);

        // コピー先ディレクトリを作成
        await fs.mkdir(destDir, { recursive: true });

        // ファイルをコピー
        await fs.copyFile(artifact.path, destPath);
      } catch (error) {
        // ソースファイルが存在しない場合はスキップ
        if (this.isFileNotFoundError(error)) {
          continue;
        }
        // その他のエラーは再スロー
        throw error;
      }
    }
  }

  // ===========================================================================
  // Markdownレンダリング
  // ===========================================================================

  /**
   * ReportData を Markdown 文字列にレンダリングする
   *
   * レポートデータからMarkdown形式の文字列を生成する。
   * 以下のセクションを含む:
   * - タイトル（実行ID）
   * - ステータス
   * - タイムライン（開始・終了・所要時間）
   * - 変更点（created/modified/deleted）
   * - 品質ゲート結果（lint/test）
   * - 会話サマリー（ターン数、トークン数）
   * - 成果物一覧
   *
   * @param report - レポートデータ
   * @returns Markdown形式の文字列
   *
   * @see Requirement 5.3: レポートフォーマット仕様
   */
  renderMarkdown(report: ReportData): string {
    const sections: string[] = [];

    // タイトル
    sections.push(`# 実行レポート: ${report.runId}`);
    sections.push('');

    // ステータス
    sections.push(`## ステータス`);
    sections.push('');
    sections.push(`- **結果**: ${this.formatStatus(report.status)}`);
    sections.push(`- **タスク**: ${report.taskDescription}`);
    sections.push('');

    // タイムライン
    sections.push(`## タイムライン`);
    sections.push('');
    sections.push(`| 項目 | 値 |`);
    sections.push(`| --- | --- |`);
    sections.push(`| 開始 | ${report.startTime} |`);
    sections.push(`| 終了 | ${report.endTime} |`);
    sections.push(`| 所要時間 | ${this.formatDuration(report.duration)} |`);
    sections.push('');

    // 変更点
    sections.push(`## 変更点`);
    sections.push('');
    sections.push(this.renderChangesSection(report.changes));
    sections.push('');

    // 品質ゲート結果
    sections.push(`## 品質ゲート結果`);
    sections.push('');
    sections.push(this.renderTestResultsSection(report.testResults));
    sections.push('');

    // 会話サマリー
    sections.push(`## 会話サマリー`);
    sections.push('');
    sections.push(report.conversationSummary);
    sections.push('');

    // 成果物一覧
    sections.push(`## 成果物`);
    sections.push('');
    sections.push(this.renderArtifactsSection(report.artifacts));
    sections.push('');

    return sections.join('\n');
  }

  // ===========================================================================
  // プライベートヘルパーメソッド
  // ===========================================================================

  /**
   * ArtifactInfo 配列から ChangeEntry 配列を抽出する
   *
   * @param artifacts - 成果物情報の配列
   * @returns 変更エントリの配列
   */
  private extractChanges(artifacts: ArtifactInfo[]): ChangeEntry[] {
    return artifacts.map((a) => ({
      path: a.path,
      action: a.action,
    }));
  }

  /**
   * QualityGateResult から TestResultSummary を抽出する
   *
   * @param qualityGates - 品質ゲート結果
   * @returns テスト結果サマリー
   */
  private extractTestResults(qualityGates: ExecutionResult['qualityGates']): TestResultSummary {
    return {
      lintPassed: qualityGates.lint.passed,
      lintOutput: qualityGates.lint.output,
      testPassed: qualityGates.test.passed,
      testOutput: qualityGates.test.output,
      overallPassed: qualityGates.overall,
    };
  }

  /**
   * 会話サマリー文字列を構築する
   *
   * @param turns - 会話ターン数
   * @param tokens - 使用トークン数
   * @returns 会話サマリー文字列
   */
  private buildConversationSummary(turns: number, tokens: number): string {
    return `会話ターン数: ${turns}回、使用トークン数: ${tokens}`;
  }

  /**
   * 開始時刻と終了時刻から所要時間（ミリ秒）を計算する
   *
   * @param startTime - 開始日時（ISO8601形式）
   * @param endTime - 終了日時（ISO8601形式）
   * @returns 所要時間（ミリ秒）。計算不能な場合は 0
   */
  private calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    // 無効な日付の場合は 0 を返す
    if (isNaN(start) || isNaN(end)) {
      return 0;
    }

    const duration = end - start;
    // 負の値は 0 に補正
    return Math.max(0, duration);
  }

  /**
   * ExecutionStatus を日本語表示に変換する
   *
   * @param status - 実行ステータス
   * @returns 日本語表示文字列
   */
  private formatStatus(status: ExecutionStatus): string {
    const statusMap: Record<ExecutionStatus, string> = {
      success: '✅ 成功',
      partial: '⚠️ 部分完了',
      quality_failed: '❌ 品質ゲート失敗',
      error: '🚨 エラー',
    };
    return statusMap[status] ?? status;
  }

  /**
   * ミリ秒の所要時間を人間が読みやすい形式に変換する
   *
   * @param durationMs - 所要時間（ミリ秒）
   * @returns フォーマットされた所要時間文字列
   */
  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / MS_PER_SECOND);
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;

    if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    }
    return `${seconds}秒`;
  }

  /**
   * 変更点セクションをMarkdownにレンダリングする
   *
   * @param changes - 変更エントリの配列
   * @returns Markdown文字列
   */
  private renderChangesSection(changes: ChangeEntry[]): string {
    if (changes.length === 0) {
      return '変更なし';
    }

    const created = changes.filter((c) => c.action === 'created');
    const modified = changes.filter((c) => c.action === 'modified');
    const deleted = changes.filter((c) => c.action === 'deleted');

    const lines: string[] = [];

    if (created.length > 0) {
      lines.push(`### 作成 (${created.length}件)`);
      for (const c of created) {
        lines.push(`- \`${c.path}\``);
      }
      lines.push('');
    }

    if (modified.length > 0) {
      lines.push(`### 変更 (${modified.length}件)`);
      for (const m of modified) {
        lines.push(`- \`${m.path}\``);
      }
      lines.push('');
    }

    if (deleted.length > 0) {
      lines.push(`### 削除 (${deleted.length}件)`);
      for (const d of deleted) {
        lines.push(`- \`${d.path}\``);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * テスト結果セクションをMarkdownにレンダリングする
   *
   * @param testResults - テスト結果サマリー
   * @returns Markdown文字列
   */
  private renderTestResultsSection(testResults: TestResultSummary): string {
    const lintIcon = testResults.lintPassed ? '✅' : '❌';
    const testIcon = testResults.testPassed ? '✅' : '❌';
    const overallIcon = testResults.overallPassed ? '✅' : '❌';

    const lines: string[] = [];
    lines.push(`| ゲート | 結果 |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Lint | ${lintIcon} ${testResults.lintPassed ? '合格' : '不合格'} |`);
    lines.push(`| Test | ${testIcon} ${testResults.testPassed ? '合格' : '不合格'} |`);
    lines.push(`| **総合** | ${overallIcon} ${testResults.overallPassed ? '合格' : '不合格'} |`);

    return lines.join('\n');
  }

  /**
   * 成果物一覧セクションをMarkdownにレンダリングする
   *
   * @param artifacts - 成果物パスの配列
   * @returns Markdown文字列
   */
  private renderArtifactsSection(artifacts: string[]): string {
    if (artifacts.length === 0) {
      return '成果物なし';
    }

    return artifacts.map((a) => `- \`${a}\``).join('\n');
  }

  /**
   * ファイルが存在しないエラーかどうかを判定する
   *
   * @param error - エラーオブジェクト
   * @returns ファイルが存在しないエラーの場合は true
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのExecutionReporterインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const executionReporter = new ExecutionReporter();
