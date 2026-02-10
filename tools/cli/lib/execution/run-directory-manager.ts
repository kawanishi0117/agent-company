/**
 * RunDirectoryManager - 実行ディレクトリ管理
 *
 * タスク送信時に実行ディレクトリを作成し、タスクメタデータを永続化する。
 * 各実行は `runtime/runs/<run-id>/` 配下に独立したディレクトリを持ち、
 * task.json、conversation.json、quality.json、report.md、errors.log、artifacts/ を格納する。
 *
 * @module execution/run-directory-manager
 * @see Requirement 2.4: WHEN a task is submitted, THE System SHALL create a run directory at `runtime/runs/<run-id>/`
 * @see Requirement 2.5: THE System SHALL persist task metadata to `runtime/runs/<run-id>/task.json`
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { RunTaskMetadata } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 実行ディレクトリのベースパス
 * @see Requirement 2.4
 */
const DEFAULT_RUNS_BASE_DIR = 'runtime/runs';

/**
 * タスクメタデータファイル名
 * @see Requirement 2.5
 */
const TASK_METADATA_FILENAME = 'task.json';

/**
 * 成果物ディレクトリ名
 */
const ARTIFACTS_DIR_NAME = 'artifacts';

/**
 * RunID生成時のランダム部分の長さ（バイト数）
 */
const RUN_ID_RANDOM_BYTES = 4;

// =============================================================================
// RunDirectoryManager クラス
// =============================================================================

/**
 * RunDirectoryManager - 実行ディレクトリ管理マネージャー
 *
 * タスク実行ごとのディレクトリ作成、メタデータの保存・読み込みを担当する。
 * StateManagerと連携して、実行状態の永続化を実現する。
 *
 * @see Requirement 2.4: WHEN a task is submitted, THE System SHALL create a run directory
 * @see Requirement 2.5: THE System SHALL persist task metadata to task.json
 */
export class RunDirectoryManager {
  /**
   * 実行ディレクトリのベースパス
   * @description テスト時にカスタムパスを指定可能
   */
  private readonly baseDir: string;

  /**
   * コンストラクタ
   *
   * @param baseDir - 実行ディレクトリのベースパス（デフォルト: 'runtime/runs'）
   */
  constructor(baseDir: string = DEFAULT_RUNS_BASE_DIR) {
    this.baseDir = baseDir;
  }

  // ===========================================================================
  // ディレクトリ管理
  // ===========================================================================

  /**
   * 実行ディレクトリのパスを取得
   *
   * @param runId - 実行ID
   * @returns 実行ディレクトリの絶対パス
   */
  getRunDirectory(runId: string): string {
    return path.join(this.baseDir, runId);
  }

  /**
   * 実行ディレクトリを作成
   *
   * `runtime/runs/<run-id>/` ディレクトリと `artifacts/` サブディレクトリを作成する。
   * 既にディレクトリが存在する場合はエラーにならず、そのまま返す。
   *
   * @param runId - 実行ID
   * @returns 作成されたディレクトリのパス
   * @throws ファイルシステムエラー（権限不足等）
   *
   * @see Requirement 2.4: WHEN a task is submitted, THE System SHALL create a run directory at `runtime/runs/<run-id>/`
   */
  async createRunDirectory(runId: string): Promise<string> {
    const runDir = this.getRunDirectory(runId);
    const artifactsDir = path.join(runDir, ARTIFACTS_DIR_NAME);

    // 実行ディレクトリと成果物ディレクトリを再帰的に作成
    await fs.mkdir(artifactsDir, { recursive: true });

    return runDir;
  }

  // ===========================================================================
  // メタデータ管理
  // ===========================================================================

  /**
   * タスクメタデータを保存
   *
   * `runtime/runs/<run-id>/task.json` にメタデータをJSON形式で保存する。
   * ディレクトリが存在しない場合は自動的に作成する。
   *
   * @param runId - 実行ID
   * @param metadata - 保存するタスクメタデータ
   * @throws ファイルシステムエラー（権限不足等）
   *
   * @see Requirement 2.5: THE System SHALL persist task metadata to `runtime/runs/<run-id>/task.json`
   */
  async saveTaskMetadata(runId: string, metadata: RunTaskMetadata): Promise<void> {
    const runDir = this.getRunDirectory(runId);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(runDir, { recursive: true });

    const metadataPath = path.join(runDir, TASK_METADATA_FILENAME);
    const metadataJson = JSON.stringify(metadata, null, 2);
    await fs.writeFile(metadataPath, metadataJson, 'utf-8');
  }

  /**
   * タスクメタデータを読み込み
   *
   * `runtime/runs/<run-id>/task.json` からメタデータを読み込む。
   * ファイルが存在しない場合は null を返す。
   *
   * @param runId - 実行ID
   * @returns タスクメタデータ（存在しない場合は null）
   * @throws JSONパースエラー、ファイルシステムエラー
   *
   * @see Requirement 2.5: THE System SHALL persist task metadata to `runtime/runs/<run-id>/task.json`
   */
  async loadTaskMetadata(runId: string): Promise<RunTaskMetadata | null> {
    const metadataPath = path.join(this.getRunDirectory(runId), TASK_METADATA_FILENAME);

    try {
      const metadataJson = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(metadataJson) as RunTaskMetadata;
    } catch (error) {
      // ファイルが存在しない場合は null を返す
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      // その他のエラーは再スロー
      throw error;
    }
  }

  // ===========================================================================
  // ID生成
  // ===========================================================================

  /**
   * 実行IDを生成
   *
   * `run-<timestamp>-<random>` 形式のユニークなIDを生成する。
   * timestamp はミリ秒精度、random は暗号学的に安全なランダム文字列。
   *
   * @returns 生成された実行ID
   */
  generateRunId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(RUN_ID_RANDOM_BYTES).toString('hex');
    return `run-${timestamp}-${random}`;
  }

  // ===========================================================================
  // ユーティリティ
  // ===========================================================================

  /**
   * 実行ディレクトリが存在するか確認
   *
   * @param runId - 実行ID
   * @returns ディレクトリが存在する場合は true
   */
  async exists(runId: string): Promise<boolean> {
    const runDir = this.getRunDirectory(runId);

    try {
      const stat = await fs.stat(runDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * ファイルが存在しないエラーかどうかを判定
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
 * デフォルトのRunDirectoryManagerインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const runDirectoryManager = new RunDirectoryManager();
