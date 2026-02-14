/**
 * 成果物プレビュー
 *
 * 成果物のビルドを試行し、出力をキャプチャする。
 * ビルド結果やスクリーンショットを runtime/runs/<run-id>/preview/ に保存する。
 *
 * @module execution/deliverable-preview
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// =============================================================================
// 型定義
// =============================================================================

/** プレビュー結果 */
export interface PreviewResult {
  /** ワークフローID */
  workflowId: string;
  /** ビルド成功フラグ */
  buildSuccess: boolean;
  /** ビルド出力 */
  buildOutput: string;
  /** エラー出力 */
  errorOutput?: string;
  /** プレビューファイルパス一覧 */
  previewFiles: string[];
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** 生成日時 */
  createdAt: string;
}

/** ビルドコマンド設定 */
export interface BuildConfig {
  /** ビルドコマンド */
  command: string;
  /** コマンド引数 */
  args: string[];
  /** 作業ディレクトリ */
  cwd: string;
  /** タイムアウト（ミリ秒） */
  timeoutMs?: number;
}

// =============================================================================
// 定数
// =============================================================================

/** デフォルトタイムアウト（60秒） */
const DEFAULT_TIMEOUT_MS = 60000;

/** プレビュー保存ディレクトリ名 */
const PREVIEW_DIR_NAME = 'preview';

// =============================================================================
// DeliverablePreview
// =============================================================================

/**
 * 成果物プレビュー
 *
 * ビルドを試行し、結果をキャプチャして保存する。
 */
export class DeliverablePreview {
  /** 実行ログ保存ベースパス */
  private readonly runsBasePath: string;

  /**
   * @param runsBasePath - 実行ログ保存ベースパス（デフォルト: runtime/runs）
   */
  constructor(runsBasePath: string = 'runtime/runs') {
    this.runsBasePath = runsBasePath;
  }

  /**
   * 成果物のビルドを試行し、プレビューを生成する
   *
   * @param workflowId - ワークフローID
   * @param runId - 実行ID
   * @param buildConfig - ビルドコマンド設定
   * @returns プレビュー結果
   */
  async buildPreview(
    workflowId: string,
    runId: string,
    buildConfig: BuildConfig
  ): Promise<PreviewResult> {
    const startTime = Date.now();
    const previewDir = path.join(this.runsBasePath, runId, PREVIEW_DIR_NAME);
    await fs.mkdir(previewDir, { recursive: true });

    let buildSuccess = false;
    let buildOutput = '';
    let errorOutput: string | undefined;

    try {
      const timeout = buildConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const result = await execFileAsync(
        buildConfig.command,
        buildConfig.args,
        {
          cwd: buildConfig.cwd,
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }
      );
      buildOutput = result.stdout;
      if (result.stderr) {
        errorOutput = result.stderr;
      }
      buildSuccess = true;
    } catch (error) {
      buildSuccess = false;
      if (error instanceof Error) {
        const execError = error as Error & { stdout?: string; stderr?: string };
        buildOutput = execError.stdout ?? '';
        errorOutput = execError.stderr ?? error.message;
      } else {
        errorOutput = String(error);
      }
    }

    const durationMs = Date.now() - startTime;

    // ビルド出力をファイルに保存
    const outputFile = path.join(previewDir, 'build-output.txt');
    await fs.writeFile(outputFile, buildOutput, 'utf-8');

    if (errorOutput) {
      const errorFile = path.join(previewDir, 'build-errors.txt');
      await fs.writeFile(errorFile, errorOutput, 'utf-8');
    }

    // プレビューディレクトリ内のファイル一覧を取得
    const previewFiles = await this.listPreviewFiles(previewDir);

    const result: PreviewResult = {
      workflowId,
      buildSuccess,
      buildOutput: this.truncateOutput(buildOutput),
      errorOutput: errorOutput ? this.truncateOutput(errorOutput) : undefined,
      previewFiles,
      durationMs,
      createdAt: new Date().toISOString(),
    };

    // 結果JSONを保存
    const resultFile = path.join(previewDir, 'result.json');
    await fs.writeFile(resultFile, JSON.stringify(result, null, 2), 'utf-8');

    return result;
  }

  /**
   * 保存済みのプレビュー結果を取得する
   *
   * @param runId - 実行ID
   * @returns プレビュー結果（存在しない場合はnull）
   */
  async getPreview(runId: string): Promise<PreviewResult | null> {
    try {
      const resultFile = path.join(
        this.runsBasePath,
        runId,
        PREVIEW_DIR_NAME,
        'result.json'
      );
      const content = await fs.readFile(resultFile, 'utf-8');
      return JSON.parse(content) as PreviewResult;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * プレビューディレクトリ内のファイル一覧を取得する
   */
  private async listPreviewFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir);
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * 出力テキストを切り詰める（保存用JSONが巨大にならないよう）
   */
  private truncateOutput(output: string, maxLength: number = 5000): string {
    if (output.length <= maxLength) {
      return output;
    }
    return output.slice(0, maxLength) + '\n... (truncated)';
  }

  /** ファイル未存在エラー判定 */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
