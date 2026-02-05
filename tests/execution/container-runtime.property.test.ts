/**
 * Container Runtime プロパティテスト
 *
 * Property 29: Container Runtime Abstraction
 * - 任意のコンテナランタイム（DoD, Rootless, DIND）で正しく動作する
 * - ランタイム設定の切り替えが正しく機能する
 *
 * Property 30: Docker Socket Command Restriction
 * - DoD使用時、allowlist内のコマンドのみが許可される
 * - allowlist外のコマンドは必ず拒否される
 * - 危険なコマンドは常に拒否される
 *
 * **Validates: Requirements 5.7, 5.8, 5.9**
 *
 * @module tests/execution/container-runtime.property.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  ContainerRuntime,
  DEFAULT_ALLOWED_DOCKER_COMMANDS,
  createContainerRuntime,
} from '../../tools/cli/lib/execution/container-runtime';
import { ContainerRuntimeType } from '../../tools/cli/lib/execution/types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 許可されたDockerコマンド（デフォルト）
 * @see Requirement 5.9: allowlisted commands only (run, stop, rm, logs, inspect)
 */
const ALLOWED_COMMANDS = ['run', 'stop', 'rm', 'logs', 'inspect'];

/**
 * 危険なDockerコマンド（常に拒否）
 */
const DANGEROUS_COMMANDS = [
  'exec',
  'cp',
  'export',
  'import',
  'load',
  'save',
  'commit',
  'push',
  'pull',
  'build',
  'network',
  'volume',
  'system',
  'swarm',
  'node',
  'service',
  'stack',
  'secret',
  'config',
  'plugin',
  'trust',
];

/**
 * 許可されていないが危険でもないコマンド
 */
const NON_ALLOWED_SAFE_COMMANDS = [
  'ps',
  'images',
  'info',
  'version',
  'events',
  'history',
  'tag',
  'rename',
  'pause',
  'unpause',
  'wait',
  'attach',
  'diff',
  'port',
  'stats',
  'top',
  'update',
  'create',
  'start',
  'restart',
  'kill',
];

/**
 * コンテナランタイム種別
 */
const RUNTIME_TYPES: ContainerRuntimeType[] = ['dod', 'rootless', 'dind'];

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 許可されたDockerコマンドを生成するArbitrary
 */
const allowedCommandArb: fc.Arbitrary<string> = fc.constantFrom(...ALLOWED_COMMANDS);

/**
 * 危険なDockerコマンドを生成するArbitrary
 */
const dangerousCommandArb: fc.Arbitrary<string> = fc.constantFrom(...DANGEROUS_COMMANDS);

/**
 * 許可されていないが危険でもないコマンドを生成するArbitrary
 */
const nonAllowedSafeCommandArb: fc.Arbitrary<string> = fc.constantFrom(...NON_ALLOWED_SAFE_COMMANDS);

/**
 * コンテナランタイム種別を生成するArbitrary
 */
const runtimeTypeArb: fc.Arbitrary<ContainerRuntimeType> = fc.constantFrom(...RUNTIME_TYPES);

/**
 * Dockerコマンドオプションを生成するArbitrary
 */
const dockerOptionsArb: fc.Arbitrary<string[]> = fc.array(
  fc.oneof(
    fc.constant('-d'),
    fc.constant('--detach'),
    fc.constant('-it'),
    fc.constant('--rm'),
    fc.tuple(fc.constant('-p'), fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':'), { minLength: 3, maxLength: 9 })).map(([opt, val]) => `${opt} ${val}`),
    fc.tuple(fc.constant('-e'), fc.stringOf(fc.constantFrom('A', 'B', 'C', '=', '1', '2', '3'), { minLength: 3, maxLength: 10 })).map(([opt, val]) => `${opt} ${val}`),
    fc.tuple(fc.constant('--name'), fc.stringOf(fc.constantFrom('a', 'b', 'c', '-', '_'), { minLength: 3, maxLength: 10 })).map(([opt, val]) => `${opt} ${val}`),
  ),
  { minLength: 0, maxLength: 3 }
);

/**
 * コンテナIDを生成するArbitrary
 */
const containerIdArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
  { minLength: 12, maxLength: 12 }
);

/**
 * イメージ名を生成するArbitrary
 */
const imageNameArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant('nginx'),
  fc.constant('alpine'),
  fc.constant('ubuntu'),
  fc.constant('node:18'),
  fc.constant('python:3.11'),
  fc.constant('redis:latest'),
);

/**
 * 完全なDockerコマンド（許可されたもの）を生成するArbitrary
 */
const fullAllowedDockerCommandArb: fc.Arbitrary<string> = fc
  .tuple(allowedCommandArb, dockerOptionsArb, fc.oneof(containerIdArb, imageNameArb))
  .map(([cmd, opts, target]) => {
    const optStr = opts.join(' ');
    return `docker ${cmd} ${optStr} ${target}`.replace(/\s+/g, ' ').trim();
  });

/**
 * 完全なDockerコマンド（危険なもの）を生成するArbitrary
 */
const fullDangerousDockerCommandArb: fc.Arbitrary<string> = fc
  .tuple(dangerousCommandArb, containerIdArb)
  .map(([cmd, target]) => `docker ${cmd} ${target}`);

/**
 * 完全なDockerコマンド（許可されていないが危険でもないもの）を生成するArbitrary
 */
const fullNonAllowedSafeDockerCommandArb: fc.Arbitrary<string> = fc
  .tuple(nonAllowedSafeCommandArb, containerIdArb)
  .map(([cmd, target]) => `docker ${cmd} ${target}`);

/**
 * カスタムallowlistを生成するArbitrary
 */
const customAllowlistArb: fc.Arbitrary<string[]> = fc.subarray(ALLOWED_COMMANDS, { minLength: 1 });

// =============================================================================
// テストセットアップ
// =============================================================================

describe('Property 29: Container Runtime Abstraction', () => {
  let containerRuntime: ContainerRuntime;

  beforeEach(() => {
    containerRuntime = new ContainerRuntime();
  });

  /**
   * Property 29.1: ランタイム種別の設定と取得
   * 任意のランタイム種別を設定・取得できる
   *
   * **Validates: Requirement 5.7, 5.8**
   * - THE container management SHALL use Container Runtime Abstraction supporting DoD, Rootless, DIND
   * - THE container runtime selection SHALL be configurable
   */
  it('Property 29.1: 任意のランタイム種別を設定・取得できる', () => {
    fc.assert(
      fc.property(runtimeTypeArb, (runtimeType) => {
        containerRuntime.setConfig({ type: runtimeType });

        const config = containerRuntime.getConfig();
        expect(config.type).toBe(runtimeType);
        expect(containerRuntime.getRuntimeType()).toBe(runtimeType);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.2: 設定の独立性
   * 設定の一部を変更しても他の設定に影響しない
   *
   * **Validates: Requirement 5.8**
   */
  it('Property 29.2: 設定の一部を変更しても他の設定に影響しない', () => {
    fc.assert(
      fc.property(runtimeTypeArb, customAllowlistArb, (runtimeType, allowlist) => {
        // 初期設定を取得
        const initialConfig = containerRuntime.getConfig();
        const initialSocketPath = initialConfig.dockerSocketPath;

        // ランタイム種別のみ変更
        containerRuntime.setConfig({ type: runtimeType });
        expect(containerRuntime.getConfig().dockerSocketPath).toBe(initialSocketPath);

        // allowlistのみ変更
        containerRuntime.setConfig({ allowedCommands: allowlist });
        expect(containerRuntime.getRuntimeType()).toBe(runtimeType);
        expect(containerRuntime.getAllowedCommands()).toEqual(allowlist);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.3: 設定の不変性
   * getConfig()で取得した設定を変更しても元の設定に影響しない
   *
   * **Validates: Requirement 5.8**
   */
  it('Property 29.3: 取得した設定を変更しても元の設定に影響しない', () => {
    fc.assert(
      fc.property(runtimeTypeArb, (runtimeType) => {
        // 新しいインスタンスを作成して初期状態を確保
        const runtime = new ContainerRuntime({ type: runtimeType });
        const originalAllowedCommands = runtime.getAllowedCommands();

        // 設定を取得して変更
        const config = runtime.getConfig();
        const originalType = config.type;
        config.type = (runtimeType === 'dod' ? 'dind' : 'dod') as ContainerRuntimeType;
        if (config.allowedCommands) {
          config.allowedCommands.push('test-command');
        }

        // 元の設定は変更されていない
        expect(runtime.getRuntimeType()).toBe(originalType);
        expect(runtime.getAllowedCommands()).toEqual(originalAllowedCommands);
        expect(runtime.getAllowedCommands()).not.toContain('test-command');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.4: getAllowedCommands()の不変性
   * getAllowedCommands()で取得したリストを変更しても元のリストに影響しない
   *
   * **Validates: Requirement 5.8**
   */
  it('Property 29.4: 取得した許可コマンドリストを変更しても元のリストに影響しない', () => {
    fc.assert(
      fc.property(customAllowlistArb, (allowlist) => {
        containerRuntime.setConfig({ allowedCommands: allowlist });

        // リストを取得して変更
        const commands = containerRuntime.getAllowedCommands();
        const originalLength = commands.length;
        commands.push('exec');
        commands.push('build');

        // 元のリストは変更されていない
        expect(containerRuntime.getAllowedCommands().length).toBe(originalLength);
        expect(containerRuntime.getAllowedCommands()).not.toContain('exec');
        expect(containerRuntime.getAllowedCommands()).not.toContain('build');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29.5: ファクトリ関数の一貫性
   * createContainerRuntime()で作成したインスタンスは設定通りに動作する
   *
   * **Validates: Requirement 5.8**
   */
  it('Property 29.5: ファクトリ関数で作成したインスタンスは設定通りに動作する', () => {
    fc.assert(
      fc.property(runtimeTypeArb, customAllowlistArb, (runtimeType, allowlist) => {
        const runtime = createContainerRuntime({
          containerRuntime: runtimeType,
          allowedDockerCommands: allowlist,
        });

        expect(runtime.getRuntimeType()).toBe(runtimeType);
        expect(runtime.getAllowedCommands()).toEqual(allowlist);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 30: Docker Socket Command Restriction', () => {
  let containerRuntime: ContainerRuntime;

  beforeEach(() => {
    // DoD（デフォルト）モードでインスタンスを作成
    containerRuntime = new ContainerRuntime({ type: 'dod' });
  });

  /**
   * Property 30.1: 許可されたコマンドの受け入れ
   * DoD使用時、allowlist内のコマンドは必ず許可される
   *
   * **Validates: Requirement 5.9**
   * - WHEN using DoD, THE System SHALL restrict docker.sock access to allowlisted commands only
   */
  it('Property 30.1: DoD使用時、allowlist内のコマンドは許可される', () => {
    fc.assert(
      fc.property(fullAllowedDockerCommandArb, (command) => {
        const result = containerRuntime.validateDockerCommand(command);

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBeDefined();
        expect(ALLOWED_COMMANDS).toContain(result.detectedCommand);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.2: 危険なコマンドの拒否
   * DoD使用時、危険なコマンドは必ず拒否される
   *
   * **Validates: Requirement 5.9**
   * - Commands outside the allowlist SHALL be rejected
   */
  it('Property 30.2: DoD使用時、危険なコマンドは拒否される', () => {
    fc.assert(
      fc.property(fullDangerousDockerCommandArb, (command) => {
        const result = containerRuntime.validateDockerCommand(command);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBeDefined();
        expect(DANGEROUS_COMMANDS).toContain(result.detectedCommand);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.3: 許可されていないコマンドの拒否
   * DoD使用時、allowlist外のコマンドは拒否される
   *
   * **Validates: Requirement 5.9**
   * - Commands outside the allowlist SHALL be rejected
   */
  it('Property 30.3: DoD使用時、allowlist外のコマンドは拒否される', () => {
    fc.assert(
      fc.property(fullNonAllowedSafeDockerCommandArb, (command) => {
        const result = containerRuntime.validateDockerCommand(command);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('not in the allowlist');
        expect(result.detectedCommand).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.4: isCommandAllowed()の一貫性
   * isCommandAllowed()とvalidateDockerCommand()の結果は一致する
   *
   * **Validates: Requirement 5.9**
   */
  it('Property 30.4: isCommandAllowed()とvalidateDockerCommand()の結果は一致する', () => {
    fc.assert(
      fc.property(allowedCommandArb, (subCommand) => {
        const isAllowed = containerRuntime.isCommandAllowed(subCommand);
        const validation = containerRuntime.validateDockerCommand(`docker ${subCommand} test`);

        expect(isAllowed).toBe(validation.valid);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.5: 危険なコマンドはallowlistに追加しても拒否される
   * セキュリティ上の理由から、危険なコマンドは常に拒否される
   *
   * **Validates: Requirement 5.9**
   */
  it('Property 30.5: 危険なコマンドはallowlistに追加しても拒否される', () => {
    fc.assert(
      fc.property(dangerousCommandArb, (dangerousCmd) => {
        // 危険なコマンドをallowlistに追加
        containerRuntime.setConfig({
          allowedCommands: [...ALLOWED_COMMANDS, dangerousCmd],
        });

        // それでも拒否される
        const result = containerRuntime.validateDockerCommand(`docker ${dangerousCmd} test`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('security reasons');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.6: 非DoDモードでは全てのコマンドが許可される
   * DIND/Rootlessモードでは制限なし
   *
   * **Validates: Requirement 5.7**
   */
  it('Property 30.6: 非DoDモードでは全てのコマンドが許可される', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('dind', 'rootless') as fc.Arbitrary<ContainerRuntimeType>,
        fullDangerousDockerCommandArb,
        (runtimeType, command) => {
          containerRuntime.setConfig({ type: runtimeType });

          const result = containerRuntime.validateDockerCommand(command);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.7: コマンド検証の一貫性
   * 同じコマンドに対して、検証結果は常に同じ
   *
   * **Validates: Requirement 5.9**
   */
  it('Property 30.7: コマンド検証は一貫している', () => {
    fc.assert(
      fc.property(fullAllowedDockerCommandArb, (command) => {
        // 複数回検証を実行
        const result1 = containerRuntime.validateDockerCommand(command);
        const result2 = containerRuntime.validateDockerCommand(command);
        const result3 = containerRuntime.validateDockerCommand(command);

        // すべて同じ結果であること
        expect(result1.valid).toBe(result2.valid);
        expect(result2.valid).toBe(result3.valid);
        expect(result1.detectedCommand).toBe(result2.detectedCommand);
        expect(result2.detectedCommand).toBe(result3.detectedCommand);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.8: カスタムallowlistの適用
   * カスタムallowlistを設定すると、そのリストに基づいて検証される
   *
   * **Validates: Requirement 5.9**
   */
  it('Property 30.8: カスタムallowlistが正しく適用される', () => {
    fc.assert(
      fc.property(customAllowlistArb, (allowlist) => {
        containerRuntime.setConfig({ allowedCommands: allowlist });

        // allowlist内のコマンドは許可される
        for (const cmd of allowlist) {
          const result = containerRuntime.validateDockerCommand(`docker ${cmd} test`);
          expect(result.valid).toBe(true);
        }

        // allowlist外のコマンドは拒否される
        const notInAllowlist = ALLOWED_COMMANDS.filter((cmd) => !allowlist.includes(cmd));
        for (const cmd of notInAllowlist) {
          const result = containerRuntime.validateDockerCommand(`docker ${cmd} test`);
          expect(result.valid).toBe(false);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 30.9: サブコマンド抽出の正確性
   * extractDockerSubCommand()は正しくサブコマンドを抽出する
   *
   * **Validates: Requirement 5.9**
   */
  it('Property 30.9: サブコマンド抽出は正確である', () => {
    fc.assert(
      fc.property(allowedCommandArb, containerIdArb, (subCommand, containerId) => {
        const command = `docker ${subCommand} ${containerId}`;
        const extracted = containerRuntime.extractDockerSubCommand(command);

        expect(extracted).toBe(subCommand);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30.10: 大文字小文字の正規化
   * コマンドは大文字小文字を区別せずに検証される
   *
   * **Validates: Requirement 5.9**
   */
  it('Property 30.10: コマンドは大文字小文字を区別せずに検証される', () => {
    fc.assert(
      fc.property(allowedCommandArb, (subCommand) => {
        const lowerCase = `docker ${subCommand.toLowerCase()} test`;
        const upperCase = `docker ${subCommand.toUpperCase()} test`;
        const mixedCase = `docker ${subCommand.charAt(0).toUpperCase()}${subCommand.slice(1).toLowerCase()} test`;

        const resultLower = containerRuntime.validateDockerCommand(lowerCase);
        const resultUpper = containerRuntime.validateDockerCommand(upperCase);
        const resultMixed = containerRuntime.validateDockerCommand(mixedCase);

        // すべて同じ結果（許可）であること
        expect(resultLower.valid).toBe(true);
        expect(resultUpper.valid).toBe(true);
        expect(resultMixed.valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// エッジケーステスト
// =============================================================================

describe('Container Runtime Edge Cases', () => {
  let containerRuntime: ContainerRuntime;

  beforeEach(() => {
    containerRuntime = new ContainerRuntime({ type: 'dod' });
  });

  /**
   * 無効なコマンド形式のテスト
   */
  describe('invalid command format', () => {
    it('空のコマンドは無効', () => {
      const result = containerRuntime.validateDockerCommand('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Docker command format');
    });

    it('空白のみのコマンドは無効', () => {
      const result = containerRuntime.validateDockerCommand('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Docker command format');
    });

    it('dockerのみのコマンドは無効', () => {
      const result = containerRuntime.validateDockerCommand('docker');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Docker command format');
    });

    it('docker以外で始まるコマンドは無効', () => {
      const result = containerRuntime.validateDockerCommand('podman run nginx');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Docker command format');
    });
  });

  /**
   * グローバルオプション付きコマンドのテスト
   */
  describe('global options', () => {
    it('-H オプション付きコマンドを正しく解析する', () => {
      const result = containerRuntime.validateDockerCommand(
        'docker -H unix:///var/run/docker.sock run nginx'
      );
      expect(result.valid).toBe(true);
      expect(result.detectedCommand).toBe('run');
    });

    it('--host オプション付きコマンドを正しく解析する', () => {
      const result = containerRuntime.validateDockerCommand(
        'docker --host tcp://localhost:2375 stop container'
      );
      expect(result.valid).toBe(true);
      expect(result.detectedCommand).toBe('stop');
    });

    it('-c オプション付きコマンドを正しく解析する', () => {
      const result = containerRuntime.validateDockerCommand(
        'docker -c my-context run nginx'
      );
      expect(result.valid).toBe(true);
      expect(result.detectedCommand).toBe('run');
    });

    it('--context オプション付きコマンドを正しく解析する', () => {
      const result = containerRuntime.validateDockerCommand(
        'docker --context my-context logs container'
      );
      expect(result.valid).toBe(true);
      expect(result.detectedCommand).toBe('logs');
    });
  });

  /**
   * クォート付きコマンドのテスト
   */
  describe('quoted arguments', () => {
    it('ダブルクォート付き引数を正しく処理する', () => {
      const result = containerRuntime.validateDockerCommand(
        'docker run -e "VAR=value with spaces" nginx'
      );
      expect(result.valid).toBe(true);
      expect(result.detectedCommand).toBe('run');
    });

    it('シングルクォート付き引数を正しく処理する', () => {
      const result = containerRuntime.validateDockerCommand(
        "docker run -e 'VAR=value with spaces' nginx"
      );
      expect(result.valid).toBe(true);
      expect(result.detectedCommand).toBe('run');
    });
  });

  /**
   * デフォルト許可コマンドリストのテスト
   */
  describe('DEFAULT_ALLOWED_DOCKER_COMMANDS', () => {
    it('要件で指定された5つのコマンドを含む', () => {
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('run');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('stop');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('rm');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('logs');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('inspect');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS.length).toBe(5);
    });
  });
});
