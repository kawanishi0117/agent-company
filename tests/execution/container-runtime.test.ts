/**
 * Container Runtime ユニットテスト
 *
 * コンテナランタイム抽象化レイヤーの機能をテストする。
 * DoD使用時のdocker.sockアクセス制限（allowlist方式）を検証する。
 *
 * **Validates: Requirements 5.7, 5.8, 5.9**
 * **Property 29: Container Runtime Abstraction**
 * **Property 30: Docker Socket Command Restriction**
 *
 * @module tests/execution/container-runtime.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContainerRuntime,
  DEFAULT_ALLOWED_DOCKER_COMMANDS,
  createContainerRuntime,
} from '../../tools/cli/lib/execution/container-runtime';
import { DEFAULT_SYSTEM_CONFIG } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テストセットアップ
// =============================================================================

describe('ContainerRuntime', () => {
  let containerRuntime: ContainerRuntime;

  beforeEach(() => {
    // デフォルト設定でContainerRuntimeインスタンスを作成
    containerRuntime = new ContainerRuntime();
  });

  // ===========================================================================
  // 設定管理テスト
  // ===========================================================================

  describe('configuration', () => {
    /**
     * デフォルト設定の確認
     * @see Requirement 5.8: THE container runtime selection SHALL be configurable
     */
    it('デフォルトでDoD（Docker-outside-of-Docker）が設定される', () => {
      const config = containerRuntime.getConfig();

      expect(config.type).toBe('dod');
    });

    it('デフォルトの許可コマンドリストが設定される', () => {
      const config = containerRuntime.getConfig();

      expect(config.allowedCommands).toEqual([...DEFAULT_ALLOWED_DOCKER_COMMANDS]);
      expect(config.allowedCommands).toContain('run');
      expect(config.allowedCommands).toContain('stop');
      expect(config.allowedCommands).toContain('rm');
      expect(config.allowedCommands).toContain('logs');
      expect(config.allowedCommands).toContain('inspect');
    });

    it('カスタム設定でインスタンスを作成できる', () => {
      const customRuntime = new ContainerRuntime({
        type: 'dind',
        allowedCommands: ['run', 'stop'],
        dindImage: 'docker:24-dind',
      });

      const config = customRuntime.getConfig();

      expect(config.type).toBe('dind');
      expect(config.allowedCommands).toEqual(['run', 'stop']);
      expect(config.dindImage).toBe('docker:24-dind');
    });

    it('設定を更新できる', () => {
      containerRuntime.setConfig({
        type: 'rootless',
        allowedCommands: ['run', 'stop', 'rm'],
      });

      const config = containerRuntime.getConfig();

      expect(config.type).toBe('rootless');
      expect(config.allowedCommands).toEqual(['run', 'stop', 'rm']);
    });

    it('部分的な設定更新が可能', () => {
      const originalConfig = containerRuntime.getConfig();
      const originalType = originalConfig.type;

      containerRuntime.setConfig({
        allowedCommands: ['run'],
      });

      const config = containerRuntime.getConfig();

      expect(config.type).toBe(originalType); // 変更されていない
      expect(config.allowedCommands).toEqual(['run']); // 変更された
    });

    it('ランタイム種別を取得できる', () => {
      expect(containerRuntime.getRuntimeType()).toBe('dod');

      containerRuntime.setConfig({ type: 'dind' });
      expect(containerRuntime.getRuntimeType()).toBe('dind');
    });

    it('許可コマンドリストを取得できる', () => {
      const allowedCommands = containerRuntime.getAllowedCommands();

      expect(allowedCommands).toEqual([...DEFAULT_ALLOWED_DOCKER_COMMANDS]);
      // 返されたリストを変更しても元のリストに影響しない
      allowedCommands.push('exec');
      expect(containerRuntime.getAllowedCommands()).not.toContain('exec');
    });
  });

  // ===========================================================================
  // Dockerコマンド検証テスト
  // ===========================================================================

  describe('validateDockerCommand', () => {
    /**
     * 許可されたコマンドの検証
     * @see Requirement 5.9: WHEN using DoD, THE System SHALL restrict docker.sock access to allowlisted commands only
     * @see Property 30: Docker Socket Command Restriction
     */
    describe('DoD mode - allowlisted commands', () => {
      it('docker run コマンドを許可する', () => {
        const result = containerRuntime.validateDockerCommand('docker run -d nginx');

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBe('run');
      });

      it('docker stop コマンドを許可する', () => {
        const result = containerRuntime.validateDockerCommand('docker stop container-id');

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBe('stop');
      });

      it('docker rm コマンドを許可する', () => {
        const result = containerRuntime.validateDockerCommand('docker rm container-id');

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBe('rm');
      });

      it('docker logs コマンドを許可する', () => {
        const result = containerRuntime.validateDockerCommand('docker logs container-id');

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBe('logs');
      });

      it('docker inspect コマンドを許可する', () => {
        const result = containerRuntime.validateDockerCommand('docker inspect container-id');

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBe('inspect');
      });

      it('オプション付きのコマンドを許可する', () => {
        const result = containerRuntime.validateDockerCommand(
          'docker run -d --name my-container -p 8080:80 nginx:latest'
        );

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBe('run');
      });

      it('グローバルオプション付きのコマンドを許可する', () => {
        const result = containerRuntime.validateDockerCommand(
          'docker -H unix:///var/run/docker.sock run -d nginx'
        );

        expect(result.valid).toBe(true);
        expect(result.detectedCommand).toBe('run');
      });
    });

    /**
     * 許可されていないコマンドの拒否
     * @see Requirement 5.9: Commands outside the allowlist SHALL be rejected
     */
    describe('DoD mode - non-allowlisted commands', () => {
      it('docker exec コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker exec -it container-id bash');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('exec');
      });

      it('docker cp コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand(
          'docker cp file.txt container-id:/app/'
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('cp');
      });

      it('docker build コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker build -t my-image .');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('build');
      });

      it('docker push コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker push my-image:latest');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('push');
      });

      it('docker pull コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker pull nginx:latest');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('pull');
      });

      it('docker network コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker network create my-network');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('network');
      });

      it('docker volume コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker volume create my-volume');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('volume');
      });

      it('docker system コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker system prune -a');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('system');
      });

      it('docker commit コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand(
          'docker commit container-id my-image'
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('commit');
      });

      it('docker save コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker save -o image.tar my-image');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('save');
      });

      it('docker load コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker load -i image.tar');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('load');
      });

      it('docker export コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand(
          'docker export container-id > container.tar'
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('export');
      });

      it('docker import コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand(
          'docker import container.tar my-image'
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('import');
      });

      it('docker swarm コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker swarm init');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('swarm');
      });

      it('docker secret コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand(
          'docker secret create my-secret file.txt'
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('secret');
      });

      it('docker plugin コマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker plugin install my-plugin');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
        expect(result.detectedCommand).toBe('plugin');
      });
    });

    /**
     * 無効なコマンド形式の処理
     */
    describe('invalid command format', () => {
      it('docker で始まらないコマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('podman run nginx');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid Docker command format');
      });

      it('空のコマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid Docker command format');
      });

      it('docker のみのコマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('docker');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid Docker command format');
      });

      it('空白のみのコマンドを拒否する', () => {
        const result = containerRuntime.validateDockerCommand('   ');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid Docker command format');
      });
    });

    /**
     * 非DoDモードでの検証スキップ
     * @see Requirement 5.7: THE container management SHALL use Container Runtime Abstraction supporting DoD, Rootless, DIND
     */
    describe('non-DoD modes', () => {
      it('DINDモードでは全てのコマンドを許可する', () => {
        containerRuntime.setConfig({ type: 'dind' });

        const result = containerRuntime.validateDockerCommand('docker exec -it container-id bash');

        expect(result.valid).toBe(true);
      });

      it('Rootlessモードでは全てのコマンドを許可する', () => {
        containerRuntime.setConfig({ type: 'rootless' });

        const result = containerRuntime.validateDockerCommand('docker build -t my-image .');

        expect(result.valid).toBe(true);
      });
    });
  });

  // ===========================================================================
  // isCommandAllowed テスト
  // ===========================================================================

  describe('isCommandAllowed', () => {
    /**
     * 許可コマンドのチェック
     * @see Property 30: Docker Socket Command Restriction
     */
    it('許可されたコマンドに対してtrueを返す', () => {
      expect(containerRuntime.isCommandAllowed('run')).toBe(true);
      expect(containerRuntime.isCommandAllowed('stop')).toBe(true);
      expect(containerRuntime.isCommandAllowed('rm')).toBe(true);
      expect(containerRuntime.isCommandAllowed('logs')).toBe(true);
      expect(containerRuntime.isCommandAllowed('inspect')).toBe(true);
    });

    it('許可されていないコマンドに対してfalseを返す', () => {
      expect(containerRuntime.isCommandAllowed('exec')).toBe(false);
      expect(containerRuntime.isCommandAllowed('build')).toBe(false);
      expect(containerRuntime.isCommandAllowed('push')).toBe(false);
      expect(containerRuntime.isCommandAllowed('pull')).toBe(false);
      expect(containerRuntime.isCommandAllowed('network')).toBe(false);
    });

    it('危険なコマンドは常にfalseを返す', () => {
      // カスタムallowlistに追加しても危険なコマンドは拒否される
      containerRuntime.setConfig({
        allowedCommands: ['run', 'exec', 'cp', 'build'],
      });

      expect(containerRuntime.isCommandAllowed('exec')).toBe(false);
      expect(containerRuntime.isCommandAllowed('cp')).toBe(false);
      expect(containerRuntime.isCommandAllowed('build')).toBe(false);
      expect(containerRuntime.isCommandAllowed('run')).toBe(true); // 安全なコマンドは許可
    });

    it('非DoDモードでは全てのコマンドを許可する', () => {
      containerRuntime.setConfig({ type: 'dind' });

      expect(containerRuntime.isCommandAllowed('exec')).toBe(true);
      expect(containerRuntime.isCommandAllowed('build')).toBe(true);
      expect(containerRuntime.isCommandAllowed('push')).toBe(true);
    });
  });

  // ===========================================================================
  // extractDockerSubCommand テスト
  // ===========================================================================

  describe('extractDockerSubCommand', () => {
    /**
     * サブコマンドの抽出
     */
    it('基本的なコマンドからサブコマンドを抽出する', () => {
      expect(containerRuntime.extractDockerSubCommand('docker run nginx')).toBe('run');
      expect(containerRuntime.extractDockerSubCommand('docker stop container-id')).toBe('stop');
      expect(containerRuntime.extractDockerSubCommand('docker rm container-id')).toBe('rm');
    });

    it('オプション付きコマンドからサブコマンドを抽出する', () => {
      expect(containerRuntime.extractDockerSubCommand('docker run -d --name test nginx')).toBe(
        'run'
      );
      expect(containerRuntime.extractDockerSubCommand('docker logs --tail 100 container-id')).toBe(
        'logs'
      );
    });

    it('グローバルオプション付きコマンドからサブコマンドを抽出する', () => {
      expect(
        containerRuntime.extractDockerSubCommand('docker -H unix:///var/run/docker.sock run nginx')
      ).toBe('run');
      expect(
        containerRuntime.extractDockerSubCommand(
          'docker --host tcp://localhost:2375 stop container-id'
        )
      ).toBe('stop');
      expect(containerRuntime.extractDockerSubCommand('docker -c my-context run nginx')).toBe(
        'run'
      );
      expect(
        containerRuntime.extractDockerSubCommand('docker --context my-context run nginx')
      ).toBe('run');
    });

    it('クォート付きコマンドを正しく処理する', () => {
      expect(containerRuntime.extractDockerSubCommand('docker run -e "VAR=value" nginx')).toBe(
        'run'
      );
      expect(containerRuntime.extractDockerSubCommand("docker run -e 'VAR=value' nginx")).toBe(
        'run'
      );
    });

    it('大文字小文字を区別しない', () => {
      expect(containerRuntime.extractDockerSubCommand('Docker Run nginx')).toBe('run');
      expect(containerRuntime.extractDockerSubCommand('DOCKER STOP container-id')).toBe('stop');
    });

    it('無効なコマンドに対してnullを返す', () => {
      expect(containerRuntime.extractDockerSubCommand('podman run nginx')).toBeNull();
      expect(containerRuntime.extractDockerSubCommand('')).toBeNull();
      expect(containerRuntime.extractDockerSubCommand('docker')).toBeNull();
      expect(containerRuntime.extractDockerSubCommand('   ')).toBeNull();
    });
  });

  // ===========================================================================
  // ファクトリ関数テスト
  // ===========================================================================

  describe('createContainerRuntime', () => {
    /**
     * ファクトリ関数のテスト
     */
    it('デフォルト設定でインスタンスを作成する', () => {
      const runtime = createContainerRuntime();

      expect(runtime.getRuntimeType()).toBe(DEFAULT_SYSTEM_CONFIG.containerRuntime);
      expect(runtime.getAllowedCommands()).toEqual([...DEFAULT_ALLOWED_DOCKER_COMMANDS]);
    });

    it('システム設定からインスタンスを作成する', () => {
      const runtime = createContainerRuntime({
        containerRuntime: 'dind',
        allowedDockerCommands: ['run', 'stop'],
      });

      expect(runtime.getRuntimeType()).toBe('dind');
      expect(runtime.getAllowedCommands()).toEqual(['run', 'stop']);
    });

    it('部分的なシステム設定でインスタンスを作成する', () => {
      const runtime = createContainerRuntime({
        containerRuntime: 'rootless',
      });

      expect(runtime.getRuntimeType()).toBe('rootless');
      expect(runtime.getAllowedCommands()).toEqual([...DEFAULT_ALLOWED_DOCKER_COMMANDS]);
    });
  });

  // ===========================================================================
  // セキュリティテスト
  // ===========================================================================

  describe('security', () => {
    /**
     * セキュリティ関連のテスト
     * @see Requirement 5.9: WHEN using DoD, THE System SHALL restrict docker.sock access
     */
    it('危険なコマンドはallowlistに追加しても拒否される', () => {
      // 危険なコマンドをallowlistに追加しようとしても
      containerRuntime.setConfig({
        allowedCommands: ['run', 'stop', 'exec', 'cp', 'network', 'volume'],
      });

      // 危険なコマンドは依然として拒否される
      expect(containerRuntime.validateDockerCommand('docker exec -it container bash').valid).toBe(
        false
      );
      expect(containerRuntime.validateDockerCommand('docker cp file container:/').valid).toBe(
        false
      );
      expect(containerRuntime.validateDockerCommand('docker network create net').valid).toBe(false);
      expect(containerRuntime.validateDockerCommand('docker volume create vol').valid).toBe(false);

      // 安全なコマンドは許可される
      expect(containerRuntime.validateDockerCommand('docker run nginx').valid).toBe(true);
      expect(containerRuntime.validateDockerCommand('docker stop container').valid).toBe(true);
    });

    it('エラーメッセージに許可コマンドリストを含める', () => {
      const result = containerRuntime.validateDockerCommand('docker ps');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Allowed commands:');
      expect(result.error).toContain('run');
      expect(result.error).toContain('stop');
      expect(result.error).toContain('rm');
      expect(result.error).toContain('logs');
      expect(result.error).toContain('inspect');
    });

    it('危険なコマンドのエラーメッセージはセキュリティ理由を示す', () => {
      const result = containerRuntime.validateDockerCommand('docker exec -it container bash');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('security reasons');
    });
  });

  // ===========================================================================
  // デフォルト許可コマンドリストのテスト
  // ===========================================================================

  describe('DEFAULT_ALLOWED_DOCKER_COMMANDS', () => {
    /**
     * デフォルト許可コマンドリストの検証
     * @see Requirement 5.9: allowlisted commands only (run, stop, rm, logs, inspect)
     */
    it('要件で指定された5つのコマンドを含む', () => {
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('run');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('stop');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('rm');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('logs');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).toContain('inspect');
    });

    it('5つのコマンドのみを含む', () => {
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS.length).toBe(5);
    });

    it('危険なコマンドを含まない', () => {
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('exec');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('cp');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('build');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('push');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('pull');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('network');
      expect(DEFAULT_ALLOWED_DOCKER_COMMANDS).not.toContain('volume');
    });
  });
});
