/**
 * ランタイム設定スキーマ ユニットテスト
 *
 * Task 9.3: ランタイム設定スキーマ
 * - `runtime/state/config.json` の `container_runtime` フィールド定義
 * - デフォルト: DoD（ローカル開発向け）
 *
 * **Validates: Requirements 5.8**
 *
 * @module tests/execution/config-schema.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  ContainerRuntimeType,
  VALID_CONTAINER_RUNTIMES,
  VALID_MESSAGE_QUEUE_TYPES,
  VALID_GIT_CREDENTIAL_TYPES,
  DEFAULT_ALLOWED_DOCKER_COMMANDS,
  validateSystemConfig,
  mergeWithDefaultConfig,
} from '../../tools/cli/lib/execution/types';
import { StateManager } from '../../tools/cli/lib/execution/state-manager';

// =============================================================================
// テスト用定数
// =============================================================================

/**
 * 実際の設定ファイルパス
 */
const ACTUAL_CONFIG_PATH = 'runtime/state/config.json';

/**
 * テスト用の一時ディレクトリ
 */
const TEST_STATE_DIR = 'runtime/state/test-config-schema';

// =============================================================================
// デフォルト設定のテスト
// =============================================================================

describe('DEFAULT_SYSTEM_CONFIG', () => {
  /**
   * デフォルトのコンテナランタイムがDoDであることを確認
   * @see Requirement 5.8: Default: DoD (for local development)
   */
  it('デフォルトのコンテナランタイムはDoDである', () => {
    expect(DEFAULT_SYSTEM_CONFIG.containerRuntime).toBe('dod');
  });

  /**
   * デフォルトの許可Dockerコマンドが正しいことを確認
   * @see Requirement 5.9: allowlisted commands only (run, stop, rm, logs, inspect)
   */
  it('デフォルトの許可Dockerコマンドが正しい', () => {
    expect(DEFAULT_SYSTEM_CONFIG.allowedDockerCommands).toEqual([
      'run',
      'stop',
      'rm',
      'logs',
      'inspect',
    ]);
  });

  /**
   * デフォルトのワーカー設定が正しいことを確認
   */
  it('デフォルトのワーカー設定が正しい', () => {
    expect(DEFAULT_SYSTEM_CONFIG.maxConcurrentWorkers).toBe(3);
    expect(DEFAULT_SYSTEM_CONFIG.defaultTimeout).toBe(300);
    expect(DEFAULT_SYSTEM_CONFIG.workerMemoryLimit).toBe('4g');
    expect(DEFAULT_SYSTEM_CONFIG.workerCpuLimit).toBe('2');
  });

  /**
   * デフォルトのAI設定が正しいことを確認
   */
  it('デフォルトのAI設定が正しい', () => {
    expect(DEFAULT_SYSTEM_CONFIG.defaultAiAdapter).toBe('ollama');
    expect(DEFAULT_SYSTEM_CONFIG.defaultModel).toBe('llama3.2:1b');
  });

  /**
   * デフォルトのメッセージキュー設定が正しいことを確認
   */
  it('デフォルトのメッセージキュー設定が正しい', () => {
    expect(DEFAULT_SYSTEM_CONFIG.messageQueueType).toBe('file');
  });

  /**
   * デフォルトのGit認証設定が正しいことを確認
   */
  it('デフォルトのGit認証設定が正しい', () => {
    expect(DEFAULT_SYSTEM_CONFIG.gitCredentialType).toBe('token');
    expect(DEFAULT_SYSTEM_CONFIG.gitSshAgentEnabled).toBe(false);
  });

  /**
   * デフォルトのその他設定が正しいことを確認
   */
  it('デフォルトのその他設定が正しい', () => {
    expect(DEFAULT_SYSTEM_CONFIG.stateRetentionDays).toBe(7);
    expect(DEFAULT_SYSTEM_CONFIG.integrationBranch).toBe('develop');
    expect(DEFAULT_SYSTEM_CONFIG.autoRefreshInterval).toBe(5000);
  });
});

// =============================================================================
// 有効な値の定数テスト
// =============================================================================

describe('有効な値の定数', () => {
  /**
   * 有効なコンテナランタイム種別が正しいことを確認
   */
  it('有効なコンテナランタイム種別が正しい', () => {
    expect(VALID_CONTAINER_RUNTIMES).toEqual(['dod', 'rootless', 'dind']);
  });

  /**
   * 有効なメッセージキュー種別が正しいことを確認
   */
  it('有効なメッセージキュー種別が正しい', () => {
    expect(VALID_MESSAGE_QUEUE_TYPES).toEqual(['file', 'sqlite', 'redis']);
  });

  /**
   * 有効なGit認証種別が正しいことを確認
   */
  it('有効なGit認証種別が正しい', () => {
    expect(VALID_GIT_CREDENTIAL_TYPES).toEqual(['deploy_key', 'token', 'ssh_agent']);
  });

  /**
   * デフォルトの許可Dockerコマンドが正しいことを確認
   */
  it('デフォルトの許可Dockerコマンドが正しい', () => {
    expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toEqual(['run', 'stop', 'rm', 'logs', 'inspect']);
  });
});

// =============================================================================
// バリデーション関数のテスト
// =============================================================================

describe('validateSystemConfig', () => {
  /**
   * 有効な設定でバリデーションが成功することを確認
   */
  it('有効な設定でバリデーションが成功する', () => {
    const result = validateSystemConfig(DEFAULT_SYSTEM_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  /**
   * nullでバリデーションが失敗することを確認
   */
  it('nullでバリデーションが失敗する', () => {
    const result = validateSystemConfig(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('設定がnullまたはundefinedです');
  });

  /**
   * undefinedでバリデーションが失敗することを確認
   */
  it('undefinedでバリデーションが失敗する', () => {
    const result = validateSystemConfig(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('設定がnullまたはundefinedです');
  });

  /**
   * オブジェクト以外でバリデーションが失敗することを確認
   */
  it('オブジェクト以外でバリデーションが失敗する', () => {
    const result = validateSystemConfig('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('設定はオブジェクトである必要があります');
  });

  /**
   * 無効なコンテナランタイムでバリデーションが失敗することを確認
   */
  it('無効なコンテナランタイムでバリデーションが失敗する', () => {
    const config = { ...DEFAULT_SYSTEM_CONFIG, containerRuntime: 'invalid' };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('containerRuntime'))).toBe(true);
  });

  /**
   * 無効なメッセージキュー種別でバリデーションが失敗することを確認
   */
  it('無効なメッセージキュー種別でバリデーションが失敗する', () => {
    const config = { ...DEFAULT_SYSTEM_CONFIG, messageQueueType: 'invalid' };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('messageQueueType'))).toBe(true);
  });

  /**
   * 無効なGit認証種別でバリデーションが失敗することを確認
   */
  it('無効なGit認証種別でバリデーションが失敗する', () => {
    const config = { ...DEFAULT_SYSTEM_CONFIG, gitCredentialType: 'invalid' };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('gitCredentialType'))).toBe(true);
  });

  /**
   * 無効なmaxConcurrentWorkersでバリデーションが失敗することを確認
   */
  it('無効なmaxConcurrentWorkersでバリデーションが失敗する', () => {
    const config = { ...DEFAULT_SYSTEM_CONFIG, maxConcurrentWorkers: 0 };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxConcurrentWorkers'))).toBe(true);
  });

  /**
   * 無効なdefaultTimeoutでバリデーションが失敗することを確認
   */
  it('無効なdefaultTimeoutでバリデーションが失敗する', () => {
    const config = { ...DEFAULT_SYSTEM_CONFIG, defaultTimeout: -1 };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('defaultTimeout'))).toBe(true);
  });

  /**
   * DINDを使用すると警告が出ることを確認
   */
  it('DINDを使用すると警告が出る', () => {
    const config = { ...DEFAULT_SYSTEM_CONFIG, containerRuntime: 'dind' as ContainerRuntimeType };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('DIND'))).toBe(true);
  });

  /**
   * SSH agent forwardingを有効にすると警告が出ることを確認
   */
  it('SSH agent forwardingを有効にすると警告が出る', () => {
    const config = { ...DEFAULT_SYSTEM_CONFIG, gitSshAgentEnabled: true };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('SSH agent forwarding'))).toBe(true);
  });

  /**
   * 空のオブジェクトでバリデーションが成功することを確認（部分設定）
   */
  it('空のオブジェクトでバリデーションが成功する（部分設定）', () => {
    const result = validateSystemConfig({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  /**
   * 有効なコンテナランタイム種別でバリデーションが成功することを確認
   */
  it.each(VALID_CONTAINER_RUNTIMES)(
    'コンテナランタイム "%s" でバリデーションが成功する',
    (runtime) => {
      const config = { containerRuntime: runtime };
      const result = validateSystemConfig(config);
      expect(result.valid).toBe(true);
    }
  );

  /**
   * 有効なメッセージキュー種別でバリデーションが成功することを確認
   */
  it.each(VALID_MESSAGE_QUEUE_TYPES)(
    'メッセージキュー種別 "%s" でバリデーションが成功する',
    (queueType) => {
      const config = { messageQueueType: queueType };
      const result = validateSystemConfig(config);
      expect(result.valid).toBe(true);
    }
  );

  /**
   * 有効なGit認証種別でバリデーションが成功することを確認
   */
  it.each(VALID_GIT_CREDENTIAL_TYPES)('Git認証種別 "%s" でバリデーションが成功する', (credType) => {
    const config = { gitCredentialType: credType };
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// mergeWithDefaultConfig関数のテスト
// =============================================================================

describe('mergeWithDefaultConfig', () => {
  /**
   * 空のオブジェクトでデフォルト値が返されることを確認
   */
  it('空のオブジェクトでデフォルト値が返される', () => {
    const result = mergeWithDefaultConfig({});
    expect(result).toEqual(DEFAULT_SYSTEM_CONFIG);
  });

  /**
   * 部分的な設定がマージされることを確認
   */
  it('部分的な設定がマージされる', () => {
    const partial: Partial<SystemConfig> = {
      containerRuntime: 'dind',
      maxConcurrentWorkers: 5,
    };
    const result = mergeWithDefaultConfig(partial);

    expect(result.containerRuntime).toBe('dind');
    expect(result.maxConcurrentWorkers).toBe(5);
    // その他はデフォルト値
    expect(result.defaultTimeout).toBe(DEFAULT_SYSTEM_CONFIG.defaultTimeout);
    expect(result.workerMemoryLimit).toBe(DEFAULT_SYSTEM_CONFIG.workerMemoryLimit);
  });

  /**
   * 全ての設定を上書きできることを確認
   */
  it('全ての設定を上書きできる', () => {
    const customConfig: SystemConfig = {
      maxConcurrentWorkers: 10,
      defaultTimeout: 600,
      workerMemoryLimit: '8g',
      workerCpuLimit: '4',
      defaultAiAdapter: 'gemini',
      defaultModel: 'gemini-pro',
      containerRuntime: 'dind',
      dockerSocketPath: '/custom/docker.sock',
      allowedDockerCommands: ['run', 'stop'],
      messageQueueType: 'redis',
      messageQueuePath: '/custom/queue',
      gitCredentialType: 'deploy_key',
      gitSshAgentEnabled: true,
      stateRetentionDays: 30,
      integrationBranch: 'staging',
      autoRefreshInterval: 10000,
    };

    const result = mergeWithDefaultConfig(customConfig);
    expect(result).toEqual(customConfig);
  });
});

// =============================================================================
// 実際の設定ファイルのテスト
// =============================================================================

describe('runtime/state/config.json', () => {
  /**
   * 設定ファイルが存在することを確認
   */
  it('設定ファイルが存在する', async () => {
    const exists = await fs
      .access(ACTUAL_CONFIG_PATH)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  /**
   * 設定ファイルが有効なJSONであることを確認
   */
  it('設定ファイルが有効なJSONである', async () => {
    const content = await fs.readFile(ACTUAL_CONFIG_PATH, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  /**
   * 設定ファイルがバリデーションを通過することを確認
   */
  it('設定ファイルがバリデーションを通過する', async () => {
    const content = await fs.readFile(ACTUAL_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);
    const result = validateSystemConfig(config);
    expect(result.valid).toBe(true);
  });

  /**
   * 設定ファイルのcontainer_runtimeがDoDであることを確認
   * @see Requirement 5.8: Default: DoD (for local development)
   */
  it('設定ファイルのcontainer_runtimeがDoDである', async () => {
    const content = await fs.readFile(ACTUAL_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);
    expect(config.containerRuntime).toBe('dod');
  });

  /**
   * 設定ファイルの許可Dockerコマンドが正しいことを確認
   */
  it('設定ファイルの許可Dockerコマンドが正しい', async () => {
    const content = await fs.readFile(ACTUAL_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);
    expect(config.allowedDockerCommands).toEqual(['run', 'stop', 'rm', 'logs', 'inspect']);
  });
});

// =============================================================================
// StateManagerとの統合テスト
// =============================================================================

describe('StateManager設定統合テスト', () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    stateManager = new StateManager(TEST_STATE_DIR);
    await fs.mkdir(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_STATE_DIR, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  /**
   * 設定ファイルが存在しない場合はデフォルト値が返されることを確認
   */
  it('設定ファイルが存在しない場合はデフォルト値が返される', async () => {
    const config = await stateManager.loadConfig();
    expect(config).toEqual(DEFAULT_SYSTEM_CONFIG);
  });

  /**
   * 設定を保存して読み込めることを確認
   */
  it('設定を保存して読み込める', async () => {
    const customConfig: SystemConfig = {
      ...DEFAULT_SYSTEM_CONFIG,
      containerRuntime: 'dind',
      maxConcurrentWorkers: 5,
    };

    await stateManager.saveConfig(customConfig);
    const loadedConfig = await stateManager.loadConfig();

    expect(loadedConfig.containerRuntime).toBe('dind');
    expect(loadedConfig.maxConcurrentWorkers).toBe(5);
  });

  /**
   * 部分的な設定ファイルでもデフォルト値とマージされることを確認
   */
  it('部分的な設定ファイルでもデフォルト値とマージされる', async () => {
    // 部分的な設定を直接ファイルに書き込む
    const partialConfig = {
      containerRuntime: 'rootless',
    };
    const configPath = path.join(TEST_STATE_DIR, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(partialConfig, null, 2), 'utf-8');

    const loadedConfig = await stateManager.loadConfig();

    // 指定した値が反映される
    expect(loadedConfig.containerRuntime).toBe('rootless');
    // 指定していない値はデフォルト値
    expect(loadedConfig.maxConcurrentWorkers).toBe(DEFAULT_SYSTEM_CONFIG.maxConcurrentWorkers);
    expect(loadedConfig.defaultTimeout).toBe(DEFAULT_SYSTEM_CONFIG.defaultTimeout);
  });

  /**
   * 全てのコンテナランタイム種別を保存・読み込みできることを確認
   */
  it.each(VALID_CONTAINER_RUNTIMES)(
    'コンテナランタイム "%s" を保存・読み込みできる',
    async (runtime) => {
      const config: SystemConfig = {
        ...DEFAULT_SYSTEM_CONFIG,
        containerRuntime: runtime,
      };

      await stateManager.saveConfig(config);
      const loadedConfig = await stateManager.loadConfig();

      expect(loadedConfig.containerRuntime).toBe(runtime);
    }
  );
});
