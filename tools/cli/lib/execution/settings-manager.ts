/**
 * Settings Manager - AI実行統合のための設定管理
 *
 * 設定バリデーション（AI関連フィールド）の拡張、設定ホットリロード機能を提供する。
 * SystemConfigの読み込み・保存・監視・バリデーションを一元管理する。
 *
 * @module execution/settings-manager
 * @see Requirements: 8.4, 8.5
 */

import * as fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import * as path from 'path';
import type {
  SystemConfig,
  ValidationResult,
} from './types.js';
import {
  DEFAULT_SYSTEM_CONFIG,
  validateSystemConfig,
  mergeWithDefaultConfig,
} from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 有効なAIアダプタ一覧
 * @description 現在サポートされているAIアダプタ名
 * @see Requirement 8.4
 */
export const VALID_AI_ADAPTERS = ['ollama'] as const;

/**
 * 有効なAIアダプタの型
 */
export type ValidAIAdapter = (typeof VALID_AI_ADAPTERS)[number];

/**
 * デフォルトの設定ファイルパス
 */
const DEFAULT_CONFIG_PATH = 'runtime/state/config.json';

/**
 * ファイル監視のデバウンス間隔（ミリ秒）
 * @description 短時間に複数回の変更イベントが発生した場合にまとめて処理する
 */
const WATCH_DEBOUNCE_MS = 300;

// =============================================================================
// ログユーティリティ
// =============================================================================

/**
 * 設定管理用ロガー
 * @description console.log/console.warn の代わりに使用するカスタムロガー
 */
const logger = {
  /**
   * 警告ログを出力
   * @param message - ログメッセージ
   * @param context - 追加コンテキスト
   */
  warn(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      level: 'warn',
      module: 'settings-manager',
      timestamp,
      message,
      ...context,
    };
    // 構造化ログとして stderr に出力（console.log は禁止）
    process.stderr.write(JSON.stringify(logEntry) + '\n');
  },

  /**
   * 情報ログを出力
   * @param message - ログメッセージ
   * @param context - 追加コンテキスト
   */
  info(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      level: 'info',
      module: 'settings-manager',
      timestamp,
      message,
      ...context,
    };
    process.stderr.write(JSON.stringify(logEntry) + '\n');
  },
};

// =============================================================================
// バリデーション関数
// =============================================================================

/**
 * Ollama host URLが有効な形式かどうかを検証
 *
 * http:// または https:// で始まり、有効なURL形式であることを確認する。
 *
 * @param url - 検証対象のURL文字列
 * @returns 有効なURL形式の場合 true
 *
 * @see Requirement 8.4
 */
export function isValidOllamaHost(url: string): boolean {
  // 空文字列チェック
  if (!url || url.trim().length === 0) {
    return false;
  }

  // http:// または https:// で始まることを確認
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // URL コンストラクタで有効性を検証
  try {
    const parsed = new URL(url);
    // プロトコルが http: または https: であること
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * AI関連設定の詳細バリデーション
 *
 * SystemConfig の AI 関連フィールドに対して、
 * 既存の validateSystemConfig よりも詳細な検証を行う。
 *
 * @param config - バリデーション対象の部分設定
 * @returns バリデーション結果
 *
 * @see Requirement 8.4
 */
export function validateAISettings(config: Partial<SystemConfig>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- defaultAiAdapter のバリデーション ---
  if (config.defaultAiAdapter !== undefined) {
    if (typeof config.defaultAiAdapter !== 'string') {
      errors.push('defaultAiAdapter は文字列である必要があります');
    } else if (config.defaultAiAdapter.trim().length === 0) {
      errors.push('defaultAiAdapter は空文字列にできません');
    } else if (
      !VALID_AI_ADAPTERS.includes(config.defaultAiAdapter as ValidAIAdapter)
    ) {
      errors.push(
        `defaultAiAdapter '${config.defaultAiAdapter}' は無効です。有効な値: ${VALID_AI_ADAPTERS.join(', ')}`
      );
    }
  }

  // --- defaultModel のバリデーション ---
  if (config.defaultModel !== undefined) {
    if (typeof config.defaultModel !== 'string') {
      errors.push('defaultModel は文字列である必要があります');
    } else if (config.defaultModel.trim().length === 0) {
      errors.push('defaultModel は空文字列にできません');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 設定全体の統合バリデーション
 *
 * 既存の validateSystemConfig と AI 設定バリデーションを統合して実行する。
 *
 * @param config - バリデーション対象の設定
 * @returns バリデーション結果
 *
 * @see Requirement 8.4
 */
export function validateFullConfig(config: unknown): ValidationResult {
  // 基本バリデーション（既存の validateSystemConfig）
  const baseResult = validateSystemConfig(config);

  // 基本バリデーションが失敗した場合はそのまま返す
  if (!baseResult.valid) {
    return baseResult;
  }

  // AI設定の詳細バリデーション
  const aiResult = validateAISettings(config as Partial<SystemConfig>);

  // 結果をマージ
  const allErrors = [...baseResult.errors, ...aiResult.errors];
  const allWarnings = [...baseResult.warnings, ...aiResult.warnings];

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// =============================================================================
// SettingsManager クラス
// =============================================================================

/**
 * SettingsManager - 設定管理クラス
 *
 * SystemConfig の読み込み・保存・監視・バリデーションを一元管理する。
 * ホットリロード機能により、設定ファイルの変更を検知して自動的に適用する。
 *
 * @see Requirement 8.4: 設定バリデーション
 * @see Requirement 8.5: 設定ホットリロード
 *
 * @example
 * ```typescript
 * const manager = new SettingsManager();
 *
 * // 設定の読み込み
 * const config = await manager.loadSettings('runtime/state/config.json');
 *
 * // 設定の保存
 * await manager.saveSettings('runtime/state/config.json', config);
 *
 * // ホットリロードの開始
 * manager.watchSettings('runtime/state/config.json', (newConfig) => {
 *   console.error('設定が更新されました');
 * });
 *
 * // ホットリロードの停止
 * manager.stopWatching();
 * ```
 */
export class SettingsManager {
  /** 現在の設定 */
  private currentConfig: SystemConfig;

  /** ファイル監視インスタンス */
  private watcher: FSWatcher | null = null;

  /** デバウンスタイマー */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** 監視中の設定ファイルパス */
  private watchedPath: string | null = null;

  /**
   * コンストラクタ
   *
   * @param initialConfig - 初期設定（省略時はデフォルト設定を使用）
   */
  constructor(initialConfig?: Partial<SystemConfig>) {
    this.currentConfig = initialConfig
      ? mergeWithDefaultConfig(initialConfig)
      : { ...DEFAULT_SYSTEM_CONFIG };
  }

  // ===========================================================================
  // 公開メソッド - 設定の読み込み・保存
  // ===========================================================================

  /**
   * 設定ファイルから設定を読み込む
   *
   * 指定されたパスの JSON ファイルを読み込み、バリデーションを行った上で
   * デフォルト値とマージした完全な SystemConfig を返す。
   *
   * @param configPath - 設定ファイルのパス（デフォルト: runtime/state/config.json）
   * @returns 読み込まれた SystemConfig
   * @throws 設定ファイルが存在しない場合やバリデーション失敗時
   *
   * @see Requirement 8.4
   */
  async loadSettings(configPath: string = DEFAULT_CONFIG_PATH): Promise<SystemConfig> {
    try {
      const rawContent = await fs.readFile(configPath, 'utf-8');
      const parsed: unknown = JSON.parse(rawContent);

      // 統合バリデーション
      const validationResult = validateFullConfig(parsed);
      if (!validationResult.valid) {
        throw new SettingsValidationError(
          `設定ファイルのバリデーションに失敗しました: ${validationResult.errors.join('; ')}`,
          validationResult
        );
      }

      // 警告があればログ出力
      if (validationResult.warnings.length > 0) {
        logger.warn('設定に警告があります', {
          warnings: validationResult.warnings,
          configPath,
        });
      }

      // デフォルト値とマージ
      const config = mergeWithDefaultConfig(parsed as Partial<SystemConfig>);
      this.currentConfig = config;

      return config;
    } catch (error) {
      // SettingsValidationError はそのまま再スロー
      if (error instanceof SettingsValidationError) {
        throw error;
      }

      // ファイルが存在しない場合はデフォルト設定を返す
      if (isNodeError(error) && error.code === 'ENOENT') {
        logger.warn('設定ファイルが見つかりません。デフォルト設定を使用します', {
          configPath,
        });
        this.currentConfig = { ...DEFAULT_SYSTEM_CONFIG };
        return this.currentConfig;
      }

      // JSON パースエラー
      if (error instanceof SyntaxError) {
        throw new SettingsValidationError(
          `設定ファイルのJSON解析に失敗しました: ${error.message}`,
          { valid: false, errors: [error.message], warnings: [] }
        );
      }

      // その他のエラー
      throw new SettingsError(
        `設定ファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 設定をファイルに保存する
   *
   * バリデーションを行った上で、設定を JSON ファイルに書き込む。
   * ディレクトリが存在しない場合は自動的に作成する。
   *
   * @param configPath - 設定ファイルのパス（デフォルト: runtime/state/config.json）
   * @param config - 保存する設定
   * @throws バリデーション失敗時
   *
   * @see Requirement 8.4
   */
  async saveSettings(
    configPath: string = DEFAULT_CONFIG_PATH,
    config: SystemConfig
  ): Promise<void> {
    // バリデーション
    const validationResult = validateFullConfig(config);
    if (!validationResult.valid) {
      throw new SettingsValidationError(
        `設定のバリデーションに失敗しました: ${validationResult.errors.join('; ')}`,
        validationResult
      );
    }

    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });

    // JSON として書き込み（整形あり）
    const jsonContent = JSON.stringify(config, null, 2) + '\n';
    await fs.writeFile(configPath, jsonContent, 'utf-8');

    // 内部状態を更新
    this.currentConfig = { ...config };

    logger.info('設定を保存しました', { configPath });
  }

  // ===========================================================================
  // 公開メソッド - AI設定バリデーション
  // ===========================================================================

  /**
   * AI関連設定のバリデーション
   *
   * @param config - バリデーション対象の部分設定
   * @returns バリデーション結果
   *
   * @see Requirement 8.4
   */
  validateAISettings(config: Partial<SystemConfig>): ValidationResult {
    return validateAISettings(config);
  }

  // ===========================================================================
  // 公開メソッド - ホットリロード
  // ===========================================================================

  /**
   * 設定ファイルの監視を開始（ホットリロード）
   *
   * 設定ファイルの変更を検知し、バリデーション後にコールバックを呼び出す。
   * 無効な設定変更は無視してログ出力する。
   *
   * @param configPath - 監視する設定ファイルのパス
   * @param callback - 設定変更時に呼び出されるコールバック
   *
   * @see Requirement 8.5
   */
  watchSettings(
    configPath: string,
    callback: (config: SystemConfig) => void
  ): void {
    // 既存の監視を停止
    this.stopWatching();

    this.watchedPath = configPath;

    try {
      this.watcher = watch(configPath, (_eventType) => {
        // デバウンス処理: 短時間の連続変更をまとめる
        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
          this.handleFileChange(configPath, callback);
        }, WATCH_DEBOUNCE_MS);
      });

      // エラーハンドリング
      this.watcher.on('error', (error) => {
        logger.warn('ファイル監視でエラーが発生しました', {
          configPath,
          error: error.message,
        });
      });

      logger.info('設定ファイルの監視を開始しました', { configPath });
    } catch (error) {
      logger.warn('設定ファイルの監視開始に失敗しました', {
        configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 設定ファイルの監視を停止
   *
   * @see Requirement 8.5
   */
  stopWatching(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher !== null) {
      this.watcher.close();
      this.watcher = null;

      if (this.watchedPath) {
        logger.info('設定ファイルの監視を停止しました', {
          configPath: this.watchedPath,
        });
      }
    }

    this.watchedPath = null;
  }

  /**
   * 設定を適用する（再起動不要）
   *
   * 渡された設定をバリデーションし、有効であれば内部状態を更新する。
   *
   * @param config - 適用する設定
   * @throws バリデーション失敗時
   *
   * @see Requirement 8.5
   */
  applySettings(config: SystemConfig): void {
    // バリデーション
    const validationResult = validateFullConfig(config);
    if (!validationResult.valid) {
      throw new SettingsValidationError(
        `設定の適用に失敗しました: ${validationResult.errors.join('; ')}`,
        validationResult
      );
    }

    // 内部状態を更新
    this.currentConfig = { ...config };

    logger.info('設定を適用しました');
  }

  // ===========================================================================
  // 公開メソッド - 現在の設定取得
  // ===========================================================================

  /**
   * 現在の設定を取得
   *
   * @returns 現在の SystemConfig のコピー
   */
  getCurrentConfig(): SystemConfig {
    return { ...this.currentConfig };
  }

  /**
   * 監視中かどうかを返す
   *
   * @returns 監視中の場合 true
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * ファイル変更時のハンドラ
   *
   * 設定ファイルを再読み込みし、バリデーション後にコールバックを呼び出す。
   * 無効な設定変更は無視してログ出力する。
   *
   * @param configPath - 設定ファイルのパス
   * @param callback - 設定変更時のコールバック
   */
  private handleFileChange(
    configPath: string,
    callback: (config: SystemConfig) => void
  ): void {
    // 非同期処理を即時実行関数で包む
    void (async (): Promise<void> => {
      try {
        const rawContent = await fs.readFile(configPath, 'utf-8');
        const parsed: unknown = JSON.parse(rawContent);

        // 統合バリデーション
        const validationResult = validateFullConfig(parsed);
        if (!validationResult.valid) {
          logger.warn('無効な設定変更を検知しました。変更は無視されます', {
            configPath,
            errors: validationResult.errors,
          });
          return;
        }

        // 警告があればログ出力
        if (validationResult.warnings.length > 0) {
          logger.warn('設定変更に警告があります', {
            warnings: validationResult.warnings,
            configPath,
          });
        }

        // デフォルト値とマージして適用
        const newConfig = mergeWithDefaultConfig(parsed as Partial<SystemConfig>);
        this.currentConfig = newConfig;

        // コールバック呼び出し
        callback(newConfig);

        logger.info('設定のホットリロードが完了しました', { configPath });
      } catch (error) {
        // JSON パースエラーや読み込みエラーは無視してログ出力
        logger.warn('設定ファイルの再読み込みに失敗しました。変更は無視されます', {
          configPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }
}

// =============================================================================
// カスタムエラークラス
// =============================================================================

/**
 * 設定エラー
 * @description 設定管理で発生する一般的なエラー
 */
export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

/**
 * 設定バリデーションエラー
 * @description 設定のバリデーション失敗時のエラー
 */
export class SettingsValidationError extends SettingsError {
  /** バリデーション結果 */
  readonly validationResult: ValidationResult;

  constructor(message: string, validationResult: ValidationResult) {
    super(message);
    this.name = 'SettingsValidationError';
    this.validationResult = validationResult;
  }
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * Node.js のエラーオブジェクトかどうかを判定
 *
 * @param error - 判定対象
 * @returns Node.js エラーの場合 true
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * デフォルトの SettingsManager インスタンスを作成
 *
 * @param initialConfig - 初期設定（オプション）
 * @returns SettingsManager インスタンス
 */
export function createSettingsManager(
  initialConfig?: Partial<SystemConfig>
): SettingsManager {
  return new SettingsManager(initialConfig);
}
