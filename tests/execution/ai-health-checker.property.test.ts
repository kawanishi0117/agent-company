/**
 * AIHealthChecker プロパティテスト
 *
 * Property 1: AI Unavailability Error Handling
 * - Ollamaが利用不可な任意のシステム状態において、
 *   ヘルスチェックレスポンスには明確なエラーメッセージとセットアップ手順が含まれること。
 *
 * **Validates: Requirements 1.2**
 *
 * テスト戦略:
 * - 存在しないホスト/ポートの組み合わせをfast-checkで生成
 * - AIHealthCheckerに接続不可能なURLを渡し、レスポンスを検証
 * - ネットワーク呼び出しは実際に行うが、到達不可能なアドレスを使用
 *
 * @module tests/execution/ai-health-checker.property.test
 * @see Requirements: 1.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  AIHealthChecker,
  AIHealthStatus,
  ERROR_MESSAGES,
} from '../../tools/cli/lib/execution/ai-health-checker';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * ヘルスチェックのタイムアウト（テスト用に短縮）
 * 到達不可能なホストへの接続を素早くタイムアウトさせる
 */
const TEST_TIMEOUT_MS = 500;

/**
 * fast-checkの最小イテレーション回数
 */
const MIN_ITERATIONS = 100;

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 到達不可能なポート番号を生成するArbitrary
 *
 * 有効なポート範囲（1-65535）内で、Ollamaが動作していないポートを生成する。
 * 一般的なサービスポート（80, 443, 11434等）を避け、
 * 高ポート番号帯（49152-65535: エフェメラルポート）を使用する。
 *
 * @returns ポート番号のArbitrary
 */
const unreachablePortArb: fc.Arbitrary<number> = fc.integer({
  min: 49152,
  max: 65535,
});

/**
 * 到達不可能なホスト名を生成するArbitrary
 *
 * RFC 2606で予約された到達不可能なドメイン名を使用する。
 * `.invalid` TLDはDNS解決が保証されないため、テストに適している。
 *
 * @returns ホスト名のArbitrary
 */
const unreachableHostArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
      { minLength: 3, maxLength: 12 }
    ),
    fc.constantFrom('.invalid', '.test', '.example')
  )
  .map(([prefix, tld]) => `${prefix}${tld}`);

/**
 * 到達不可能なOllama URLを生成するArbitrary
 *
 * ホスト名とポート番号を組み合わせて、確実に到達不可能なURLを生成する。
 *
 * @returns URL文字列のArbitrary
 */
const unreachableOllamaUrlArb: fc.Arbitrary<string> = fc
  .tuple(unreachableHostArb, unreachablePortArb)
  .map(([host, port]) => `http://${host}:${port}`);

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 到達不可能なURLでAIHealthCheckerインスタンスを作成
 *
 * @param ollamaBaseUrl - 到達不可能なOllama URL
 * @returns AIHealthCheckerインスタンス
 */
function createUnavailableChecker(ollamaBaseUrl: string): AIHealthChecker {
  return new AIHealthChecker({
    ollamaBaseUrl,
    timeoutMs: TEST_TIMEOUT_MS,
  });
}

/**
 * AIHealthStatusが「利用不可」の条件を満たすか検証
 *
 * @param status - 検証対象のAIHealthStatus
 */
function assertUnavailableStatus(status: AIHealthStatus): void {
  // available は false であること
  expect(status.available).toBe(false);

  // ollamaRunning は false であること
  expect(status.ollamaRunning).toBe(false);

  // setupInstructions が存在すること
  expect(status.setupInstructions).toBeDefined();
  expect(typeof status.setupInstructions).toBe('string');

  // setupInstructions が空でないこと
  expect(status.setupInstructions!.length).toBeGreaterThan(0);

  // setupInstructions にセットアップ手順が含まれること
  expect(status.setupInstructions).toBe(ERROR_MESSAGES.ollamaNotRunning);

  // modelsInstalled は空配列であること
  expect(status.modelsInstalled).toEqual([]);

  // recommendedModels が提供されること
  expect(status.recommendedModels).toBeDefined();
  expect(status.recommendedModels.length).toBeGreaterThan(0);

  // lastChecked がISO8601形式であること
  expect(status.lastChecked).toBeDefined();
  expect(() => new Date(status.lastChecked)).not.toThrow();
  expect(new Date(status.lastChecked).toISOString()).toBe(status.lastChecked);
}

// =============================================================================
// プロパティテスト
// =============================================================================

describe('Feature: ai-execution-integration, Property 1: AI Unavailability Error Handling', () => {
  /**
   * Property 1: AI Unavailability Error Handling
   *
   * 任意のOllama利用不可状態において、ヘルスチェックレスポンスは
   * 明確なエラーメッセージとセットアップ手順を含むこと。
   *
   * **Validates: Requirements 1.2**
   */
  it('checkOllamaAvailability: 到達不可能なURLに対して、available=false かつ setupInstructions を返す', async () => {
    await fc.assert(
      fc.asyncProperty(
        unreachableOllamaUrlArb,
        async (url: string) => {
          // Arrange: 到達不可能なURLでチェッカーを作成
          const checker = createUnavailableChecker(url);

          // Act: 可用性チェックを実行
          const status = await checker.checkOllamaAvailability();

          // Assert: 利用不可ステータスの全条件を検証
          assertUnavailableStatus(status);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 1 補強: getHealthStatus も同様の結果を返すこと
   *
   * getHealthStatus は checkOllamaAvailability のエイリアスであるため、
   * 同一の結果を返すことを検証する。
   *
   * **Validates: Requirements 1.2**
   */
  it('getHealthStatus: 到達不可能なURLに対して、checkOllamaAvailabilityと同等の結果を返す', async () => {
    await fc.assert(
      fc.asyncProperty(
        unreachableOllamaUrlArb,
        async (url: string) => {
          // Arrange: 到達不可能なURLでチェッカーを作成
          const checker = createUnavailableChecker(url);

          // Act: getHealthStatus を実行
          const status = await checker.getHealthStatus();

          // Assert: 利用不可ステータスの全条件を検証
          assertUnavailableStatus(status);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 1 補強: getInstalledModels は到達不可能時に空配列を返すこと
   *
   * Ollamaが利用不可の場合、モデル一覧は空配列として返されること。
   * これはgraceful degradationの一部。
   *
   * **Validates: Requirements 1.2**
   */
  it('getInstalledModels: 到達不可能なURLに対して、空配列を返す', async () => {
    await fc.assert(
      fc.asyncProperty(
        unreachableOllamaUrlArb,
        async (url: string) => {
          // Arrange: 到達不可能なURLでチェッカーを作成
          const checker = createUnavailableChecker(url);

          // Act: インストール済みモデルを取得
          const models = await checker.getInstalledModels();

          // Assert: 空配列であること
          expect(models).toEqual([]);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 1 補強: setupInstructions にインストール手順のURLが含まれること
   *
   * エラーメッセージには、ユーザーが問題を解決するための
   * 具体的な手順（URL、コマンド）が含まれていること。
   *
   * **Validates: Requirements 1.2**
   */
  it('setupInstructions: セットアップ手順にインストールURL・コマンドが含まれる', async () => {
    await fc.assert(
      fc.asyncProperty(
        unreachableOllamaUrlArb,
        async (url: string) => {
          // Arrange
          const checker = createUnavailableChecker(url);

          // Act
          const status = await checker.checkOllamaAvailability();

          // Assert: setupInstructions の内容を詳細検証
          const instructions = status.setupInstructions!;

          // Ollamaのダウンロードリンクが含まれること
          expect(instructions).toContain('https://ollama.ai/download');

          // 起動コマンドが含まれること
          expect(instructions).toContain('ollama serve');

          // モデルインストールコマンドが含まれること
          expect(instructions).toContain('ollama pull');
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 1 補強: ランダムなポート番号でも一貫した結果を返すこと
   *
   * ポート番号に関わらず、到達不可能な場合は常に同じ構造の
   * エラーレスポンスを返すことを検証する。
   *
   * **Validates: Requirements 1.2**
   */
  it('一貫性: 異なるポート番号でも同一構造のエラーレスポンスを返す', async () => {
    await fc.assert(
      fc.asyncProperty(
        unreachablePortArb,
        async (port: number) => {
          // Arrange: localhost の到達不可能なポートを使用
          const url = `http://localhost:${port}`;
          const checker = createUnavailableChecker(url);

          // Act
          const status = await checker.checkOllamaAvailability();

          // Assert: 利用不可ステータスの全条件を検証
          assertUnavailableStatus(status);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });
});
