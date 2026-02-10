/**
 * SettingsManager プロパティテスト
 *
 * Property 14: Settings Validation
 * - 任意の有効な設定は、バリデーションを通過すること
 * - 任意の無効な設定は、明確なエラーメッセージと共に拒否されること
 * - バリデーション結果は冪等であること（同じ入力に対して同じ結果）
 *
 * Property 15: Settings Hot-Reload
 * - 任意の有効な設定変更は、再起動なしで適用されること
 * - 設定の保存→読み込みラウンドトリップが正確であること
 * - 無効な設定変更は適用されないこと
 *
 * **Validates: Requirements 8.4, 8.5**
 *
 * テスト戦略:
 * - fast-check で有効・無効な SystemConfig を生成
 * - validateAISettings / validateFullConfig の冪等性を検証
 * - saveSettings → loadSettings のラウンドトリップで等価性を検証
 * - applySettings で無効な設定が拒否されることを検証
 * - 一時ディレクトリを使用してファイルシステムの副作用を隔離
 *
 * @module tests/execution/settings-manager.property.test
 * @see Requirements: 8.4, 8.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  SettingsManager,
  SettingsValidationError,
  validateAISettings,
  validateFullConfig,
  isValidOllamaHost,
  VALID_AI_ADAPTERS,
} from '../../tools/cli/lib/execution/settings-manager';
import type { SystemConfig } from '../../tools/cli/lib/execution/types';
import { DEFAULT_SYSTEM_CONFIG } from '../../tools/cli/lib/execution/types';

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
 * 有効なAIアダプタ名を生成するArbitrary
 *
 * @returns 有効なAIアダプタ名のArbitrary
 */
const validAiAdapterArb: fc.Arbitrary<string> = fc.constantFrom(
  ...VALID_AI_ADAPTERS
);

/**
 * 無効なAIアダプタ名を生成するArbitrary
 *
 * VALID_AI_ADAPTERS に含まれない文字列を生成する。
 *
 * @returns 無効なAIアダプタ名のArbitrary
 */
const invalidAiAdapterArb: fc.Arbitrary<string> = fc
  .stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'),
    { minLength: 1, maxLength: 20 }
  )
  .filter((s) => !VALID_AI_ADAPTERS.includes(s as (typeof VALID_AI_ADAPTERS)[number]));

/**
 * 有効なモデル名を生成するArbitrary
 *
 * 空でない文字列を生成する。
 *
 * @returns 有効なモデル名のArbitrary
 */
const validModelArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.:_-'),
  { minLength: 1, maxLength: 30 }
);

/**
 * 有効なOllama host URLを生成するArbitrary
 *
 * http:// または https:// で始まる有効なURLを生成する。
 *
 * @returns 有効なURL文字列のArbitrary
 */
const validOllamaHostArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
      { minLength: 1, maxLength: 15 }
    ),
    fc.constantFrom('.com', '.local', '.io', '.test'),
    fc.integer({ min: 1, max: 65535 })
  )
  .map(([protocol, host, tld, port]) => `${protocol}://${host}${tld}:${port}`);

/**
 * 無効なOllama host URLを生成するArbitrary
 *
 * http:// / https:// で始まらない文字列を生成する。
 *
 * @returns 無効なURL文字列のArbitrary
 */
const invalidOllamaHostArb: fc.Arbitrary<string> = fc.oneof(
  // 空文字列
  fc.constant(''),
  // プロトコルなし
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.:'),
    { minLength: 1, maxLength: 20 }
  ).filter((s) => !s.startsWith('http://') && !s.startsWith('https://')),
  // ftp:// など無効なプロトコル
  fc
    .stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
      { minLength: 1, maxLength: 10 }
    )
    .map((host) => `ftp://${host}.com`),
  // スペースのみ
  fc.constant('   ')
);

/**
 * 正の整数を生成するArbitrary
 *
 * @param min - 最小値
 * @param max - 最大値
 * @returns 正の整数のArbitrary
 */
function positiveIntArb(min = 1, max = 1000): fc.Arbitrary<number> {
  return fc.integer({ min, max });
}

/**
 * 有効な SystemConfig を生成するArbitrary
 *
 * 全フィールドが有効な値を持つ SystemConfig を生成する。
 *
 * @returns 有効な SystemConfig のArbitrary
 */
const validSystemConfigArb: fc.Arbitrary<SystemConfig> = fc
  .tuple(
    positiveIntArb(1, 10),                                    // maxConcurrentWorkers
    positiveIntArb(1, 3600),                                  // defaultTimeout
    fc.constantFrom('1g', '2g', '4g', '8g'),                 // workerMemoryLimit
    fc.constantFrom('1', '2', '4'),                           // workerCpuLimit
    validAiAdapterArb,                                        // defaultAiAdapter
    validModelArb,                                            // defaultModel
    fc.constantFrom('dod', 'rootless', 'dind') as fc.Arbitrary<'dod' | 'rootless' | 'dind'>,
    fc.constantFrom('file', 'sqlite', 'redis') as fc.Arbitrary<'file' | 'sqlite' | 'redis'>,
    fc.constantFrom('deploy_key', 'token', 'ssh_agent') as fc.Arbitrary<'deploy_key' | 'token' | 'ssh_agent'>,
    fc.boolean(),                                             // gitSshAgentEnabled
    positiveIntArb(1, 365),                                   // stateRetentionDays
    fc.constantFrom('main', 'develop', 'staging'),            // integrationBranch
    positiveIntArb(100, 60000)                                // autoRefreshInterval
  )
  .map(([
    maxConcurrentWorkers,
    defaultTimeout,
    workerMemoryLimit,
    workerCpuLimit,
    defaultAiAdapter,
    defaultModel,
    containerRuntime,
    messageQueueType,
    gitCredentialType,
    gitSshAgentEnabled,
    stateRetentionDays,
    integrationBranch,
    autoRefreshInterval,
  ]) => ({
    maxConcurrentWorkers,
    defaultTimeout,
    workerMemoryLimit,
    workerCpuLimit,
    defaultAiAdapter,
    defaultModel,
    containerRuntime,
    allowedDockerCommands: ['run', 'stop', 'rm', 'logs', 'inspect'],
    messageQueueType,
    gitCredentialType,
    gitSshAgentEnabled,
    stateRetentionDays,
    integrationBranch,
    autoRefreshInterval,
  }));

// =============================================================================
// セットアップ・クリーンアップ
// =============================================================================

beforeEach(async () => {
  // テスト用一時ディレクトリを作成
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-mgr-test-'));
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
// Property 14: Settings Validation
// =============================================================================

describe('Feature: ai-execution-integration, Property 14: Settings Validation', () => {
  /**
   * Property 14a: 任意の有効な設定は、バリデーションを通過すること
   *
   * 有効な SystemConfig を生成し、validateFullConfig が valid: true を返すことを検証する。
   *
   * **Validates: Requirements 8.4**
   */
  it('validateFullConfig: 有効な設定は valid: true を返す', () => {
    fc.assert(
      fc.property(
        validSystemConfigArb,
        (config: SystemConfig) => {
          // Act: バリデーション実行
          const result = validateFullConfig(config);

          // Assert: 有効であること
          expect(result.valid).toBe(true);
          expect(result.errors).toEqual([]);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 14b: 無効なAIアダプタ名は明確なエラーメッセージと共に拒否されること
   *
   * VALID_AI_ADAPTERS に含まれないアダプタ名を持つ設定が拒否されることを検証する。
   *
   * **Validates: Requirements 8.4**
   */
  it('validateAISettings: 無効なAIアダプタ名はエラーメッセージ付きで拒否される', () => {
    fc.assert(
      fc.property(
        invalidAiAdapterArb,
        (invalidAdapter: string) => {
          // Arrange: 無効なアダプタ名を持つ部分設定
          const partialConfig: Partial<SystemConfig> = {
            defaultAiAdapter: invalidAdapter,
          };

          // Act: AI設定バリデーション実行
          const result = validateAISettings(partialConfig);

          // Assert: 無効であること
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);

          // Assert: エラーメッセージにアダプタ名が含まれること
          const hasAdapterError = result.errors.some(
            (e) => e.includes('defaultAiAdapter') && e.includes(invalidAdapter)
          );
          expect(hasAdapterError).toBe(true);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 14c: 空文字列のモデル名はエラーメッセージ付きで拒否されること
   *
   * **Validates: Requirements 8.4**
   */
  it('validateAISettings: 空文字列のモデル名はエラーメッセージ付きで拒否される', () => {
    // 空文字列とスペースのみの文字列をテスト
    const emptyStrings = ['', ' ', '  ', '\t', '\n'];

    for (const emptyModel of emptyStrings) {
      const partialConfig: Partial<SystemConfig> = {
        defaultModel: emptyModel,
      };

      const result = validateAISettings(partialConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const hasModelError = result.errors.some((e) =>
        e.includes('defaultModel')
      );
      expect(hasModelError).toBe(true);
    }
  });

  /**
   * Property 14d: バリデーション結果は冪等であること（同じ入力に対して同じ結果）
   *
   * 同じ設定に対して validateFullConfig を複数回呼び出しても、
   * 常に同じ結果を返すことを検証する。
   *
   * **Validates: Requirements 8.4**
   */
  it('validateFullConfig: 同じ入力に対して冪等な結果を返す', () => {
    fc.assert(
      fc.property(
        validSystemConfigArb,
        (config: SystemConfig) => {
          // Act: 同じ設定で2回バリデーション
          const result1 = validateFullConfig(config);
          const result2 = validateFullConfig(config);

          // Assert: 結果が等価であること
          expect(result1.valid).toBe(result2.valid);
          expect(result1.errors).toEqual(result2.errors);
          expect(result1.warnings).toEqual(result2.warnings);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 14e: isValidOllamaHost は有効なURLに対して true を返すこと
   *
   * **Validates: Requirements 8.4**
   */
  it('isValidOllamaHost: 有効なURLに対して true を返す', () => {
    fc.assert(
      fc.property(
        validOllamaHostArb,
        (url: string) => {
          // Act
          const result = isValidOllamaHost(url);

          // Assert: 有効であること
          expect(result).toBe(true);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 14f: isValidOllamaHost は無効なURLに対して false を返すこと
   *
   * **Validates: Requirements 8.4**
   */
  it('isValidOllamaHost: 無効なURLに対して false を返す', () => {
    fc.assert(
      fc.property(
        invalidOllamaHostArb,
        (url: string) => {
          // Act
          const result = isValidOllamaHost(url);

          // Assert: 無効であること
          expect(result).toBe(false);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 14g: validateAISettings の冪等性（無効な入力に対しても）
   *
   * **Validates: Requirements 8.4**
   */
  it('validateAISettings: 無効な入力に対しても冪等な結果を返す', () => {
    fc.assert(
      fc.property(
        invalidAiAdapterArb,
        (invalidAdapter: string) => {
          const partialConfig: Partial<SystemConfig> = {
            defaultAiAdapter: invalidAdapter,
          };

          // Act: 同じ設定で2回バリデーション
          const result1 = validateAISettings(partialConfig);
          const result2 = validateAISettings(partialConfig);

          // Assert: 結果が等価であること
          expect(result1.valid).toBe(result2.valid);
          expect(result1.errors).toEqual(result2.errors);
          expect(result1.warnings).toEqual(result2.warnings);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });
});

// =============================================================================
// Property 15: Settings Hot-Reload
// =============================================================================

describe('Feature: ai-execution-integration, Property 15: Settings Hot-Reload', () => {
  /**
   * Property 15a: 任意の有効な設定変更は、再起動なしで適用されること
   *
   * applySettings で有効な設定を適用し、getCurrentConfig で反映されることを検証する。
   *
   * **Validates: Requirements 8.5**
   */
  it('applySettings: 有効な設定は再起動なしで適用される', () => {
    fc.assert(
      fc.property(
        validSystemConfigArb,
        (config: SystemConfig) => {
          // Arrange: SettingsManager を作成
          const manager = new SettingsManager();

          // Act: 設定を適用
          manager.applySettings(config);

          // Assert: 適用された設定が取得できること
          const current = manager.getCurrentConfig();
          expect(current).toEqual(config);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 15b: 設定の保存→読み込みラウンドトリップが正確であること
   *
   * saveSettings → loadSettings で等価な設定が返ることを検証する。
   *
   * **Validates: Requirements 8.4, 8.5**
   */
  it('saveSettings → loadSettings: ラウンドトリップで等価な設定が返る', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSystemConfigArb,
        async (config: SystemConfig) => {
          // Arrange: 一時ディレクトリ内に設定ファイルパスを作成
          const configPath = path.join(tempDir, 'config.json');
          const manager = new SettingsManager();

          // Act: 設定を保存
          await manager.saveSettings(configPath, config);

          // Act: 設定を読み込み
          const loaded = await manager.loadSettings(configPath);

          // Assert: 全フィールドが等価であること
          expect(loaded.maxConcurrentWorkers).toBe(config.maxConcurrentWorkers);
          expect(loaded.defaultTimeout).toBe(config.defaultTimeout);
          expect(loaded.workerMemoryLimit).toBe(config.workerMemoryLimit);
          expect(loaded.workerCpuLimit).toBe(config.workerCpuLimit);
          expect(loaded.defaultAiAdapter).toBe(config.defaultAiAdapter);
          expect(loaded.defaultModel).toBe(config.defaultModel);
          expect(loaded.containerRuntime).toBe(config.containerRuntime);
          expect(loaded.messageQueueType).toBe(config.messageQueueType);
          expect(loaded.gitCredentialType).toBe(config.gitCredentialType);
          expect(loaded.gitSshAgentEnabled).toBe(config.gitSshAgentEnabled);
          expect(loaded.stateRetentionDays).toBe(config.stateRetentionDays);
          expect(loaded.integrationBranch).toBe(config.integrationBranch);
          expect(loaded.autoRefreshInterval).toBe(config.autoRefreshInterval);

          // Assert: ディープイコールでも等価であること
          expect(loaded).toEqual(config);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 15c: 無効な設定変更は適用されないこと
   *
   * applySettings に無効な設定を渡した場合、
   * SettingsValidationError がスローされ、内部状態が変更されないことを検証する。
   *
   * **Validates: Requirements 8.5**
   */
  it('applySettings: 無効な設定は適用されず SettingsValidationError がスローされる', () => {
    fc.assert(
      fc.property(
        invalidAiAdapterArb,
        (invalidAdapter: string) => {
          // Arrange: デフォルト設定で SettingsManager を作成
          const manager = new SettingsManager();
          const originalConfig = manager.getCurrentConfig();

          // Arrange: 無効なアダプタ名を持つ設定を作成
          const invalidConfig: SystemConfig = {
            ...DEFAULT_SYSTEM_CONFIG,
            defaultAiAdapter: invalidAdapter,
          };

          // Act & Assert: SettingsValidationError がスローされること
          expect(() => manager.applySettings(invalidConfig)).toThrow(
            SettingsValidationError
          );

          // Assert: 内部状態が変更されていないこと
          const currentConfig = manager.getCurrentConfig();
          expect(currentConfig).toEqual(originalConfig);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 15d: saveSettings に無効な設定を渡した場合、ファイルが作成されないこと
   *
   * **Validates: Requirements 8.4, 8.5**
   */
  it('saveSettings: 無効な設定はファイルに保存されない', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidAiAdapterArb,
        async (invalidAdapter: string) => {
          // Arrange
          const configPath = path.join(tempDir, `invalid-${Date.now()}.json`);
          const manager = new SettingsManager();

          const invalidConfig: SystemConfig = {
            ...DEFAULT_SYSTEM_CONFIG,
            defaultAiAdapter: invalidAdapter,
          };

          // Act & Assert: SettingsValidationError がスローされること
          await expect(
            manager.saveSettings(configPath, invalidConfig)
          ).rejects.toThrow(SettingsValidationError);

          // Assert: ファイルが作成されていないこと
          await expect(fs.access(configPath)).rejects.toThrow();
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 15e: loadSettings で存在しないファイルを指定した場合、デフォルト設定が返ること
   *
   * **Validates: Requirements 8.4**
   */
  it('loadSettings: 存在しないファイルに対してデフォルト設定を返す', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringOf(
          fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
          { minLength: 5, maxLength: 15 }
        ),
        async (filename: string) => {
          // Arrange: 存在しないファイルパス
          const configPath = path.join(tempDir, `${filename}.json`);
          const manager = new SettingsManager();

          // Act: 存在しないファイルを読み込み
          const loaded = await manager.loadSettings(configPath);

          // Assert: デフォルト設定が返ること
          expect(loaded).toEqual(DEFAULT_SYSTEM_CONFIG);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });

  /**
   * Property 15f: 連続した applySettings で最後の設定が反映されること
   *
   * **Validates: Requirements 8.5**
   */
  it('applySettings: 連続適用で最後の設定が反映される', () => {
    fc.assert(
      fc.property(
        validSystemConfigArb,
        validSystemConfigArb,
        (config1: SystemConfig, config2: SystemConfig) => {
          // Arrange
          const manager = new SettingsManager();

          // Act: 2つの設定を連続適用
          manager.applySettings(config1);
          manager.applySettings(config2);

          // Assert: 最後の設定が反映されていること
          const current = manager.getCurrentConfig();
          expect(current).toEqual(config2);
        }
      ),
      {
        numRuns: MIN_ITERATIONS,
        verbose: true,
      }
    );
  });
});
