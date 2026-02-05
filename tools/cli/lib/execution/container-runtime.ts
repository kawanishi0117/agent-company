/**
 * Container Runtime Abstraction - コンテナランタイムの抽象化レイヤー
 *
 * DoD（Docker-outside-of-Docker）、Rootless Docker/Podman、DIND（Docker-in-Docker）を
 * 切り替え可能にする抽象化レイヤー。DoD使用時はdocker.sockアクセスをallowlistで制限する。
 *
 * @module execution/container-runtime
 * @see Requirements: 5.7, 5.8, 5.9
 * @see Property 29: Container Runtime Abstraction
 * @see Property 30: Docker Socket Command Restriction
 */

import { spawn } from 'child_process';
import * as path from 'path';
import {
  ContainerId,
  ContainerRuntimeType,
  SystemConfig,
  DEFAULT_SYSTEM_CONFIG,
} from './types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトのDockerソケットパス
 * @description プラットフォームに応じたデフォルトパス
 */
const DEFAULT_DOCKER_SOCKET_PATH =
  process.platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock';

/**
 * 許可されたDockerコマンドのデフォルトリスト
 * @description DoD使用時に実行可能なDockerコマンド
 * @see Requirement 5.9: WHEN using DoD, THE System SHALL restrict docker.sock access to allowlisted commands only (run, stop, rm, logs, inspect)
 */
export const DEFAULT_ALLOWED_DOCKER_COMMANDS: readonly string[] = [
  'run',
  'stop',
  'rm',
  'logs',
  'inspect',
] as const;

/**
 * 危険なDockerコマンドのリスト
 * @description セキュリティ上の理由から常に拒否されるコマンド
 */
const DANGEROUS_DOCKER_COMMANDS: readonly string[] = [
  'exec',      // コンテナ内でコマンド実行（他ワーカーへの干渉可能）
  'cp',        // ファイルコピー（ホストファイルシステムへのアクセス可能）
  'export',    // コンテナのエクスポート
  'import',    // イメージのインポート
  'load',      // イメージのロード
  'save',      // イメージの保存
  'commit',    // コンテナからイメージ作成
  'push',      // イメージのプッシュ
  'pull',      // イメージのプル（制御されていないイメージの取得）
  'build',     // イメージのビルド
  'network',   // ネットワーク操作
  'volume',    // ボリューム操作
  'system',    // システム操作
  'swarm',     // Swarm操作
  'node',      // ノード操作
  'service',   // サービス操作
  'stack',     // スタック操作
  'secret',    // シークレット操作
  'config',    // コンフィグ操作
  'plugin',    // プラグイン操作
  'trust',     // 信頼操作
] as const;

// =============================================================================
// 型定義
// =============================================================================

/**
 * コンテナランタイム設定
 * @description コンテナランタイムの設定情報
 */
export interface ContainerRuntimeConfig {
  /** ランタイム種別 */
  type: ContainerRuntimeType;

  // DoD（デフォルト）: ホストのdocker.sockを使用
  /** Dockerソケットパス（DoD用） */
  dockerSocketPath?: string;
  /** 許可されたDockerコマンド */
  allowedCommands?: string[];

  // Rootless: privileged不要の環境向け
  /** Rootless Dockerのパス */
  rootlessPath?: string;

  // DIND: CI環境向け（明示的オプトイン）
  /** DINDイメージ名 */
  dindImage?: string;
}

/**
 * Dockerコマンド実行結果
 * @description Dockerコマンドの実行結果
 */
export interface DockerCommandResult {
  /** 成功フラグ */
  success: boolean;
  /** 標準出力 */
  stdout: string;
  /** 標準エラー出力 */
  stderr: string;
  /** 終了コード */
  exitCode: number;
}

/**
 * コマンド検証結果
 * @description Dockerコマンドの検証結果
 */
export interface CommandValidationResult {
  /** 有効フラグ */
  valid: boolean;
  /** エラーメッセージ（無効な場合） */
  error?: string;
  /** 検出されたDockerサブコマンド */
  detectedCommand?: string;
}

/**
 * コンテナ作成オプション
 * @description コンテナ作成時のオプション
 */
export interface ContainerCreateOptions {
  /** コンテナ名 */
  name?: string;
  /** イメージ名 */
  image: string;
  /** 環境変数 */
  env?: Record<string, string>;
  /** ボリュームマウント */
  volumes?: string[];
  /** 作業ディレクトリ */
  workDir?: string;
  /** CPU制限 */
  cpuLimit?: string;
  /** メモリ制限 */
  memoryLimit?: string;
  /** ネットワークモード */
  networkMode?: string;
  /** 追加のDockerオプション */
  additionalOptions?: string[];
}

// =============================================================================
// ContainerRuntime クラス
// =============================================================================

/**
 * ContainerRuntime - コンテナランタイム抽象化クラス
 *
 * DoD、Rootless、DINDを切り替え可能にする抽象化レイヤー。
 * DoD使用時はdocker.sockアクセスをallowlistで制限する。
 *
 * @see Requirement 5.7: THE container management SHALL use Container Runtime Abstraction supporting DoD, Rootless, DIND
 * @see Requirement 5.8: THE container runtime selection SHALL be configurable via `runtime/state/config.json`
 * @see Requirement 5.9: WHEN using DoD, THE System SHALL restrict docker.sock access to allowlisted commands only
 */
export class ContainerRuntime {
  /**
   * ランタイム設定
   */
  private config: ContainerRuntimeConfig;

  /**
   * コンストラクタ
   * @param config - ランタイム設定（省略時はデフォルト設定を使用）
   */
  constructor(config?: Partial<ContainerRuntimeConfig>) {
    this.config = {
      type: config?.type ?? DEFAULT_SYSTEM_CONFIG.containerRuntime,
      dockerSocketPath: config?.dockerSocketPath ?? DEFAULT_DOCKER_SOCKET_PATH,
      allowedCommands: config?.allowedCommands ?? [...DEFAULT_ALLOWED_DOCKER_COMMANDS],
      rootlessPath: config?.rootlessPath,
      dindImage: config?.dindImage ?? 'docker:dind',
    };
  }

  // ===========================================================================
  // 設定管理
  // ===========================================================================

  /**
   * ランタイム設定を取得
   * @returns 現在のランタイム設定（ディープコピー）
   */
  getConfig(): ContainerRuntimeConfig {
    return {
      ...this.config,
      // allowedCommandsは配列なのでディープコピーを返す
      allowedCommands: this.config.allowedCommands
        ? [...this.config.allowedCommands]
        : undefined,
    };
  }

  /**
   * ランタイム設定を更新
   * @param config - 新しい設定（部分的な更新可能）
   */
  setConfig(config: Partial<ContainerRuntimeConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * ランタイム種別を取得
   * @returns ランタイム種別
   */
  getRuntimeType(): ContainerRuntimeType {
    return this.config.type;
  }

  /**
   * 許可されたコマンドリストを取得
   * @returns 許可されたDockerコマンドのリスト
   */
  getAllowedCommands(): string[] {
    return [...(this.config.allowedCommands ?? DEFAULT_ALLOWED_DOCKER_COMMANDS)];
  }

  // ===========================================================================
  // コマンド検証
  // ===========================================================================

  /**
   * Dockerコマンドを検証
   *
   * DoD使用時、コマンドがallowlistに含まれているかを検証する。
   * allowlist外のコマンドは拒否される。
   *
   * @param command - 検証するDockerコマンド（docker run ... など）
   * @returns 検証結果
   *
   * @see Requirement 5.9: WHEN using DoD, THE System SHALL restrict docker.sock access to allowlisted commands only
   * @see Property 30: Docker Socket Command Restriction
   */
  validateDockerCommand(command: string): CommandValidationResult {
    // DoD以外のランタイムでは検証をスキップ
    if (this.config.type !== 'dod') {
      return { valid: true };
    }

    // コマンドを解析してDockerサブコマンドを抽出
    const dockerSubCommand = this.extractDockerSubCommand(command);

    if (!dockerSubCommand) {
      return {
        valid: false,
        error: 'Invalid Docker command format. Expected: docker <subcommand> [options]',
      };
    }

    // 危険なコマンドは常に拒否
    if (DANGEROUS_DOCKER_COMMANDS.includes(dockerSubCommand)) {
      return {
        valid: false,
        error: `Docker command "${dockerSubCommand}" is not allowed for security reasons.`,
        detectedCommand: dockerSubCommand,
      };
    }

    // allowlistに含まれているかチェック
    const allowedCommands = this.config.allowedCommands ?? DEFAULT_ALLOWED_DOCKER_COMMANDS;
    if (!allowedCommands.includes(dockerSubCommand)) {
      return {
        valid: false,
        error: `Docker command "${dockerSubCommand}" is not in the allowlist. Allowed commands: ${allowedCommands.join(', ')}`,
        detectedCommand: dockerSubCommand,
      };
    }

    return {
      valid: true,
      detectedCommand: dockerSubCommand,
    };
  }

  /**
   * Dockerコマンドがallowlistに含まれているかをチェック
   *
   * @param subCommand - Dockerサブコマンド（run, stop, rm など）
   * @returns allowlistに含まれている場合はtrue
   *
   * @see Property 30: Docker Socket Command Restriction
   */
  isCommandAllowed(subCommand: string): boolean {
    // DoD以外のランタイムでは全てのコマンドを許可
    if (this.config.type !== 'dod') {
      return true;
    }

    // 危険なコマンドは常に拒否
    if (DANGEROUS_DOCKER_COMMANDS.includes(subCommand)) {
      return false;
    }

    const allowedCommands = this.config.allowedCommands ?? DEFAULT_ALLOWED_DOCKER_COMMANDS;
    return allowedCommands.includes(subCommand);
  }

  /**
   * Dockerコマンド文字列からサブコマンドを抽出
   *
   * @param command - Dockerコマンド文字列
   * @returns サブコマンド（抽出できない場合はnull）
   */
  extractDockerSubCommand(command: string): string | null {
    const trimmedCommand = command.trim();

    // "docker" で始まるかチェック
    if (!trimmedCommand.toLowerCase().startsWith('docker')) {
      return null;
    }

    // コマンドをトークンに分割
    const tokens = this.tokenizeCommand(trimmedCommand);

    if (tokens.length < 2) {
      return null;
    }

    // 最初のトークンが "docker" であることを確認
    if (tokens[0].toLowerCase() !== 'docker') {
      return null;
    }

    // 2番目のトークンがサブコマンド
    // ただし、グローバルオプション（-H, --host など）をスキップ
    let index = 1;
    while (index < tokens.length) {
      const token = tokens[index];

      // グローバルオプションをスキップ
      if (token.startsWith('-')) {
        // -H, --host などの値を持つオプションは次のトークンもスキップ
        if (token === '-H' || token === '--host' || token === '-c' || token === '--context') {
          index += 2;
          continue;
        }
        index++;
        continue;
      }

      // サブコマンドを発見
      return token.toLowerCase();
    }

    return null;
  }

  // ===========================================================================
  // Dockerコマンド実行
  // ===========================================================================

  /**
   * Dockerコマンドを実行
   *
   * DoD使用時はallowlist検証を行い、許可されたコマンドのみ実行する。
   *
   * @param command - 実行するDockerコマンド
   * @returns 実行結果
   *
   * @see Requirement 5.9: Commands outside the allowlist SHALL be rejected
   */
  async executeDockerCommand(command: string): Promise<DockerCommandResult> {
    // DoD使用時はコマンドを検証
    if (this.config.type === 'dod') {
      const validation = this.validateDockerCommand(command);
      if (!validation.valid) {
        return {
          success: false,
          stdout: '',
          stderr: validation.error ?? 'Command validation failed',
          exitCode: 1,
        };
      }
    }

    // コマンドを実行
    return this.runCommand(command);
  }

  /**
   * コンテナを作成して起動
   *
   * @param options - コンテナ作成オプション
   * @returns コンテナID
   */
  async createContainer(options: ContainerCreateOptions): Promise<ContainerId> {
    // docker run コマンドを構築
    const args: string[] = ['docker', 'run', '-d'];

    // コンテナ名
    if (options.name) {
      args.push('--name', options.name);
    }

    // 環境変数
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // ボリュームマウント
    if (options.volumes) {
      for (const volume of options.volumes) {
        args.push('-v', volume);
      }
    }

    // 作業ディレクトリ
    if (options.workDir) {
      args.push('-w', options.workDir);
    }

    // CPU制限
    if (options.cpuLimit) {
      args.push('--cpus', options.cpuLimit);
    }

    // メモリ制限
    if (options.memoryLimit) {
      args.push('-m', options.memoryLimit);
    }

    // ネットワークモード
    if (options.networkMode) {
      args.push('--network', options.networkMode);
    }

    // 追加オプション
    if (options.additionalOptions) {
      args.push(...options.additionalOptions);
    }

    // イメージ名
    args.push(options.image);

    // コマンドを実行
    const command = args.join(' ');
    const result = await this.executeDockerCommand(command);

    if (!result.success) {
      throw new Error(`Failed to create container: ${result.stderr}`);
    }

    // コンテナIDを返す（stdoutの最初の行）
    return result.stdout.trim().split('\n')[0];
  }

  /**
   * コンテナを停止
   *
   * @param containerId - コンテナID
   */
  async stopContainer(containerId: ContainerId): Promise<void> {
    const result = await this.executeDockerCommand(`docker stop ${containerId}`);
    if (!result.success) {
      throw new Error(`Failed to stop container: ${result.stderr}`);
    }
  }

  /**
   * コンテナを削除
   *
   * @param containerId - コンテナID
   */
  async removeContainer(containerId: ContainerId): Promise<void> {
    const result = await this.executeDockerCommand(`docker rm ${containerId}`);
    if (!result.success) {
      throw new Error(`Failed to remove container: ${result.stderr}`);
    }
  }

  /**
   * コンテナのログを取得
   *
   * @param containerId - コンテナID
   * @param options - ログ取得オプション
   * @returns ログ内容
   */
  async getContainerLogs(
    containerId: ContainerId,
    options?: { tail?: number; follow?: boolean }
  ): Promise<string> {
    let command = `docker logs ${containerId}`;

    if (options?.tail !== undefined) {
      command += ` --tail ${options.tail}`;
    }

    const result = await this.executeDockerCommand(command);
    if (!result.success) {
      throw new Error(`Failed to get container logs: ${result.stderr}`);
    }

    return result.stdout + result.stderr;
  }

  /**
   * コンテナの情報を取得
   *
   * @param containerId - コンテナID
   * @returns コンテナ情報（JSON）
   */
  async inspectContainer(containerId: ContainerId): Promise<unknown> {
    const result = await this.executeDockerCommand(`docker inspect ${containerId}`);
    if (!result.success) {
      throw new Error(`Failed to inspect container: ${result.stderr}`);
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error(`Failed to parse container info: ${result.stdout}`);
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * コマンドをトークンに分割
   *
   * クォートで囲まれた文字列を考慮してトークン化する。
   *
   * @param command - コマンド文字列
   * @returns トークン配列
   */
  private tokenizeCommand(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false;
          quoteChar = '';
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuote = true;
          quoteChar = char;
        } else if (char === ' ' || char === '\t') {
          if (current) {
            tokens.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * コマンドを実行
   *
   * @param command - 実行するコマンド
   * @returns 実行結果
   */
  private runCommand(command: string): Promise<DockerCommandResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const childProcess = spawn(command, [], {
        shell: true,
      });

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });

      childProcess.on('error', (error: Error) => {
        resolve({
          success: false,
          stdout,
          stderr: stderr + '\n' + error.message,
          exitCode: 1,
        });
      });
    });
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * システム設定からContainerRuntimeを作成
 *
 * @param systemConfig - システム設定
 * @returns ContainerRuntimeインスタンス
 */
export function createContainerRuntime(systemConfig: Partial<SystemConfig> = {}): ContainerRuntime {
  return new ContainerRuntime({
    type: systemConfig.containerRuntime ?? DEFAULT_SYSTEM_CONFIG.containerRuntime,
    dockerSocketPath: systemConfig.dockerSocketPath,
    allowedCommands: systemConfig.allowedDockerCommands ?? [...DEFAULT_ALLOWED_DOCKER_COMMANDS],
  });
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのContainerRuntimeインスタンス
 * @description 通常使用時はこのインスタンスを使用する
 */
export const containerRuntime = new ContainerRuntime();
