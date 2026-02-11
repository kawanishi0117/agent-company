/**
 * RunDirectoryManager プロパティテスト
 *
 * Property 4: Run Directory and Metadata Persistence Round-Trip
 * - 任意のタスク送信において、システムは `runtime/runs/<run-id>/` に実行ディレクトリを作成し、
 *   タスクメタデータを `task.json` に永続化する。
 *   メタデータの読み込みは保存時と等価なオブジェクトを返すこと。
 *
 * **Validates: Requirements 2.4, 2.5**
 *
 * テスト戦略:
 * - fast-check でランダムな RunTaskMetadata を生成
 * - saveTaskMetadata → loadTaskMetadata のラウンドトリップで等価性を検証
 * - createRunDirectory でディレクトリが実際に作成されることを検証
 * - 一時ディレクトリを使用してファイルシステムの副作用を隔離
 *
 * @module tests/execution/run-directory-manager.property.test
 * @see Requirements: 2.4, 2.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RunDirectoryManager } from '../../tools/cli/lib/execution/run-directory-manager';
import type { RunTaskMetadata } from '../../tools/cli/lib/execution/types';
import type { TaskStatus } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * fast-check の最小イテレーション回数
 */
const MIN_ITERATIONS = 100;

/**
 * 有効なタスクステータス一覧
 */
const VALID_TASK_STATUSES: TaskStatus[] = [
  'pending',
  'decomposing',
  'executing',
  'reviewing',
  'completed',
  'failed',
];

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
 * TaskStatusを生成するArbitrary
 *
 * @returns TaskStatusのArbitrary
 */
const taskStatusArb: fc.Arbitrary<TaskStatus> = fc.constantFrom(...VALID_TASK_STATUSES);

/**
 * ISO8601形式の日時文字列を生成するArbitrary
 *
 * 2020年〜2030年の範囲でランダムな日時を生成する。
 *
 * @returns ISO8601日時文字列のArbitrary
 */
const iso8601Arb: fc.Arbitrary<string> = fc
  .date({
    min: new Date('2020-01-01T00:00:00.000Z'),
    max: new Date('2030-12-31T23:59:59.999Z'),
  })
  .map((d) => d.toISOString());

/**
 * 指示文字列を生成するArbitrary
 *
 * 空でない、JSON安全な文字列を生成する。
 * 制御文字を避け、一般的なテキストを生成する。
 *
 * @returns 指示文字列のArbitrary
 */
const instructionArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_()[]{}:;/\n'
  ),
  { minLength: 1, maxLength: 200 }
);

/**
 * AIアダプタ名を生成するArbitrary
 *
 * @returns AIアダプタ名のArbitrary
 */
const aiAdapterArb: fc.Arbitrary<string> = fc.constantFrom(
  'ollama',
  'gemini',
  'kiro',
  'openai',
  'anthropic'
);

/**
 * AIモデル名を生成するArbitrary
 *
 * @returns AIモデル名のArbitrary
 */
const modelArb: fc.Arbitrary<string> = fc.constantFrom(
  'llama3.2:1b',
  'codellama',
  'qwen2.5-coder',
  'deepseek-coder',
  'gpt-4o'
);

/**
 * RunTaskMetadata を生成するArbitrary
 *
 * 全フィールドがランダムに生成された有効なメタデータを返す。
 *
 * @returns RunTaskMetadataのArbitrary
 */
const runTaskMetadataArb: fc.Arbitrary<RunTaskMetadata> = fc
  .tuple(
    safeIdArb(5, 15),   // taskId
    runIdArb,            // runId
    safeIdArb(3, 10),    // projectId
    instructionArb,      // instruction
    taskStatusArb,       // status
    iso8601Arb,          // createdAt
    iso8601Arb,          // updatedAt
    aiAdapterArb,        // aiAdapter
    modelArb             // model
  )
  .map(([taskId, runId, projectId, instruction, status, createdAt, updatedAt, aiAdapter, model]) => ({
    taskId,
    runId,
    projectId,
    instruction,
    status,
    createdAt,
    updatedAt,
    aiAdapter,
    model,
  }));

// =============================================================================
// セットアップ・クリーンアップ
// =============================================================================

beforeEach(async () => {
  // テスト用一時ディレクトリを作成
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-dir-mgr-test-'));
});

afterEach(async () => {
  // テスト用一時ディレクトリを削除
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // クリーンアップ失敗は無視
  }
});

// =============================================================================
// プロパティテスト
// =============================================================================

describe('Feature: ai-execution-integration, Property 4: Run Directory and Metadata Persistence Round-Trip', () => {
  /**
   * Property 4a: createRunDirectory でディレクトリと artifacts サブディレクトリが作成されること
   *
   * **Validates: Requirements 2.4**
   */
  it('createRunDirectory: 実行ディレクトリと artifacts サブディレクトリが作成される', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        async (runId: string) => {
          // Arrange: 一時ディレクトリ内にマネージャーを作成
          const manager = new RunDirectoryManager(tempDir);

          // Act: 実行ディレクトリを作成
          const createdDir = await manager.createRunDirectory(runId);

          // Assert: ディレクトリが存在すること
          const dirStat = await fs.stat(createdDir);
          expect(dirStat.isDirectory()).toBe(true);

          // Assert: artifacts サブディレクトリが存在すること
          const artifactsDir = path.join(createdDir, 'artifacts');
          const artifactsStat = await fs.stat(artifactsDir);
          expect(artifactsStat.isDirectory()).toBe(true);

          // Assert: パスが正しいこと
          expect(createdDir).toBe(path.join(tempDir, runId));
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 4b: saveTaskMetadata → loadTaskMetadata のラウンドトリップで等価なオブジェクトが返ること
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it('saveTaskMetadata → loadTaskMetadata: ラウンドトリップで等価なオブジェクトが返る', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        runTaskMetadataArb,
        async (metadata: RunTaskMetadata) => {
          // Arrange: 一時ディレクトリ内にマネージャーを作成
          const manager = new RunDirectoryManager(tempDir);
          const runId = metadata.runId;

          // Act: メタデータを保存
          await manager.saveTaskMetadata(runId, metadata);

          // Act: メタデータを読み込み
          const loaded = await manager.loadTaskMetadata(runId);

          // Assert: 読み込んだメタデータが null でないこと
          expect(loaded).not.toBeNull();

          // Assert: 全フィールドが等価であること
          expect(loaded!.taskId).toBe(metadata.taskId);
          expect(loaded!.runId).toBe(metadata.runId);
          expect(loaded!.projectId).toBe(metadata.projectId);
          expect(loaded!.instruction).toBe(metadata.instruction);
          expect(loaded!.status).toBe(metadata.status);
          expect(loaded!.createdAt).toBe(metadata.createdAt);
          expect(loaded!.updatedAt).toBe(metadata.updatedAt);
          expect(loaded!.aiAdapter).toBe(metadata.aiAdapter);
          expect(loaded!.model).toBe(metadata.model);

          // Assert: ディープイコールでも等価であること
          expect(loaded).toEqual(metadata);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 4c: createRunDirectory + saveTaskMetadata の統合フロー
   *
   * タスク送信の完全なフロー（ディレクトリ作成 → メタデータ保存 → メタデータ読み込み）
   * が正しく動作すること。
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  it('統合フロー: createRunDirectory → saveTaskMetadata → loadTaskMetadata が正しく動作する', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        runTaskMetadataArb,
        async (metadata: RunTaskMetadata) => {
          // Arrange
          const manager = new RunDirectoryManager(tempDir);
          const runId = metadata.runId;

          // Act: ディレクトリを作成
          const runDir = await manager.createRunDirectory(runId);

          // Act: メタデータを保存
          await manager.saveTaskMetadata(runId, metadata);

          // Assert: task.json ファイルが存在すること
          const taskJsonPath = path.join(runDir, 'task.json');
          const fileStat = await fs.stat(taskJsonPath);
          expect(fileStat.isFile()).toBe(true);

          // Assert: ファイル内容が有効なJSONであること
          const rawContent = await fs.readFile(taskJsonPath, 'utf-8');
          const parsed = JSON.parse(rawContent);
          expect(parsed).toEqual(metadata);

          // Act: loadTaskMetadata で読み込み
          const loaded = await manager.loadTaskMetadata(runId);

          // Assert: ラウンドトリップで等価
          expect(loaded).toEqual(metadata);

          // Assert: exists が true を返すこと
          const dirExists = await manager.exists(runId);
          expect(dirExists).toBe(true);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 4d: 存在しない runId に対して loadTaskMetadata は null を返すこと
   *
   * **Validates: Requirements 2.5**
   */
  it('loadTaskMetadata: 存在しない runId に対して null を返す', async () => {
    await fc.assert(
      fc.asyncProperty(
        runIdArb,
        async (runId: string) => {
          // Arrange: 空の一時ディレクトリ内にマネージャーを作成
          const manager = new RunDirectoryManager(tempDir);

          // Act: 存在しない runId でメタデータを読み込み
          const loaded = await manager.loadTaskMetadata(runId);

          // Assert: null が返ること
          expect(loaded).toBeNull();
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 4e: generateRunId は `run-<timestamp>-<random>` 形式のユニークなIDを生成すること
   *
   * **Validates: Requirements 2.4**
   */
  it('generateRunId: run-<timestamp>-<random> 形式のユニークなIDを生成する', () => {
    const manager = new RunDirectoryManager(tempDir);
    const generatedIds = new Set<string>();

    // 100個のIDを生成してユニーク性を検証
    for (let i = 0; i < MIN_ITERATIONS; i++) {
      const id = manager.generateRunId();

      // 形式チェック: run-<hex>-<hex>
      expect(id).toMatch(/^run-[a-z0-9]+-[a-f0-9]+$/);

      // ユニーク性チェック
      expect(generatedIds.has(id)).toBe(false);
      generatedIds.add(id);
    }

    // 全てユニークであること
    expect(generatedIds.size).toBe(MIN_ITERATIONS);
  });

  /**
   * Property 4f: getRunDirectory は正しいパスを返すこと
   *
   * **Validates: Requirements 2.4**
   */
  it('getRunDirectory: baseDir/runId のパスを返す', () => {
    fc.assert(
      fc.property(
        runIdArb,
        (runId: string) => {
          // Arrange
          const manager = new RunDirectoryManager(tempDir);

          // Act
          const dir = manager.getRunDirectory(runId);

          // Assert: パスが正しいこと
          expect(dir).toBe(path.join(tempDir, runId));
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });
});
