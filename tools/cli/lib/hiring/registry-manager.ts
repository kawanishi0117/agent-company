/**
 * Registry管理モジュール（Registry Manager）
 *
 * 採用システムにおけるエージェントのRegistry登録機能を提供
 * - エージェント定義のバリデーション
 * - Registryへの登録（コピー）
 * - 重複チェック
 * - 登録済みエージェント一覧の取得
 *
 * @module hiring/registry-manager
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import type { RegistrationResult, ValidationResult } from './types.js';
import { validateAgentDefinition, type AgentDefinition } from '../../validator.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * Registryディレクトリのパス
 * @description エージェント定義ファイルの格納先
 */
const REGISTRY_DIR = 'agents/registry';

/**
 * エージェント定義ファイルの拡張子
 */
const AGENT_FILE_EXTENSION = '.yaml';

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * ISO8601形式の現在時刻を取得する
 * @returns ISO8601形式の時刻文字列
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * エージェントIDからRegistryパスを生成する
 * @param agentId - エージェントID
 * @returns Registryファイルパス
 */
function getRegistryPath(agentId: string): string {
  return path.join(REGISTRY_DIR, `${agentId}${AGENT_FILE_EXTENSION}`);
}

/**
 * YAMLファイルからエージェント定義を読み込む
 * @param filePath - YAMLファイルパス
 * @returns エージェント定義オブジェクト
 * @throws Error - ファイル読み込みまたはパースに失敗した場合
 */
function loadAgentDefinition(filePath: string): unknown {
  // ファイル存在チェック
  if (!fs.existsSync(filePath)) {
    throw new Error(`CandidateNotFound: 候補エージェント定義ファイルが見つかりません: ${filePath}`);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return YAML.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`InvalidYAML: YAMLファイルのパースに失敗しました: ${message}`);
  }
}

/**
 * エージェント定義からIDを抽出する
 * @param definition - エージェント定義オブジェクト
 * @returns エージェントID
 * @throws Error - IDが見つからない場合
 */
function extractAgentId(definition: unknown): string {
  if (!definition || typeof definition !== 'object') {
    throw new Error('InvalidDefinition: エージェント定義がオブジェクトではありません');
  }

  const def = definition as Record<string, unknown>;

  if (!('id' in def) || typeof def.id !== 'string') {
    throw new Error("InvalidDefinition: エージェント定義に 'id' フィールドがありません");
  }

  return def.id;
}

/**
 * エージェント定義をYAML形式でファイルに保存する
 * @param filePath - 保存先ファイルパス
 * @param definition - エージェント定義オブジェクト
 */
function saveAgentDefinition(filePath: string, definition: unknown): void {
  // ディレクトリが存在しない場合は作成
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // YAML形式で保存
  const yamlContent = YAML.stringify(definition, {
    indent: 2,
    lineWidth: 0, // 行の折り返しを無効化
  });

  fs.writeFileSync(filePath, yamlContent, 'utf-8');
}

// =============================================================================
// バリデーション関数
// =============================================================================

/**
 * 候補エージェント定義を検証する
 *
 * エージェントテンプレートスキーマに対してバリデーションを実行し、
 * 必須フィールドの存在と型の正確性を確認する。
 *
 * @param definition - エージェント定義オブジェクト
 * @returns バリデーション結果
 *
 * Validates: Requirements 6.2, 6.5
 */
function validateCandidateAgent(definition: unknown): ValidationResult {
  // 既存のバリデータを使用
  const result = validateAgentDefinition(definition);

  return {
    valid: result.valid,
    errors: result.errors,
    warnings: [], // 現時点では警告は生成しない
  };
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * 重複チェックを行う
 *
 * 指定されたエージェントIDが既にRegistryに存在するかを確認する。
 *
 * @param agentId - エージェントID
 * @returns 重複があればtrue、なければfalse
 *
 * @example
 * ```typescript
 * if (isDuplicateAgent('my_agent')) {
 *   console.log('エージェントは既に登録されています');
 * }
 * ```
 *
 * Validates: Requirements 6.6
 */
export function isDuplicateAgent(agentId: string): boolean {
  const registryPath = getRegistryPath(agentId);
  return fs.existsSync(registryPath);
}

/**
 * 登録済みエージェント一覧を取得する
 *
 * Registryディレクトリ内の全エージェント定義ファイルを走査し、
 * エージェントIDの一覧を返す。
 *
 * @returns エージェントID一覧
 *
 * @example
 * ```typescript
 * const agents = listRegisteredAgents();
 * console.log('登録済みエージェント:', agents);
 * // => ['coo_pm', 'quality_authority', 'hiring_manager']
 * ```
 */
export function listRegisteredAgents(): string[] {
  // Registryディレクトリが存在しない場合は空配列を返す
  if (!fs.existsSync(REGISTRY_DIR)) {
    return [];
  }

  try {
    const files = fs.readdirSync(REGISTRY_DIR);

    // .yamlファイルのみをフィルタリングし、拡張子を除去してIDを取得
    const agentIds = files
      .filter((file) => {
        // ディレクトリは除外
        const filePath = path.join(REGISTRY_DIR, file);
        return fs.statSync(filePath).isFile() && file.endsWith(AGENT_FILE_EXTENSION);
      })
      .map((file) => file.replace(AGENT_FILE_EXTENSION, ''));

    return agentIds.sort();
  } catch (error) {
    // エラーが発生した場合は空配列を返す
    console.error(`Registryディレクトリの読み込みに失敗しました: ${error}`);
    return [];
  }
}

/**
 * エージェントをRegistryに登録する
 *
 * 候補エージェント定義ファイルを読み込み、バリデーションを実行した後、
 * Registryディレクトリにコピーする。
 *
 * 処理フロー:
 * 1. 候補エージェント定義ファイルを読み込む
 * 2. エージェントIDを抽出
 * 3. 重複チェック
 * 4. スキーマバリデーション
 * 5. Registryにコピー
 *
 * @param candidatePath - 候補エージェント定義ファイルのパス
 * @returns 登録結果
 *
 * @example
 * ```typescript
 * const result = registerAgent('candidates/new_agent.yaml');
 * if (result.success) {
 *   console.log(`エージェント ${result.agentId} を登録しました`);
 * } else {
 *   console.error('登録失敗:', result.errors);
 * }
 * ```
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6
 */
export function registerAgent(candidatePath: string): RegistrationResult {
  const timestamp = getCurrentTimestamp();

  // 1. 候補エージェント定義ファイルを読み込む
  let definition: unknown;
  try {
    definition = loadAgentDefinition(candidatePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      agentId: '',
      registryPath: '',
      errors: [message],
      timestamp,
    };
  }

  // 2. エージェントIDを抽出
  let agentId: string;
  try {
    agentId = extractAgentId(definition);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      agentId: '',
      registryPath: '',
      errors: [message],
      timestamp,
    };
  }

  // 3. 重複チェック（Requirements 6.6）
  if (isDuplicateAgent(agentId)) {
    return {
      success: false,
      agentId,
      registryPath: getRegistryPath(agentId),
      errors: [`DuplicateAgent: エージェントID '${agentId}' は既にRegistryに存在します`],
      timestamp,
    };
  }

  // 4. スキーマバリデーション（Requirements 6.2, 6.5）
  const validationResult = validateCandidateAgent(definition);
  if (!validationResult.valid) {
    return {
      success: false,
      agentId,
      registryPath: '',
      errors: validationResult.errors.map((err) => `ValidationFailed: ${err}`),
      timestamp,
    };
  }

  // 5. Registryにコピー（Requirements 6.3）
  const registryPath = getRegistryPath(agentId);
  try {
    saveAgentDefinition(registryPath, definition);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      agentId,
      registryPath,
      errors: [`RegistryWriteError: Registryへの書き込みに失敗しました: ${message}`],
      timestamp,
    };
  }

  // 登録成功
  return {
    success: true,
    agentId,
    registryPath,
    timestamp,
  };
}

/**
 * エージェント定義の詳細情報を取得する
 *
 * 指定されたエージェントIDの定義ファイルを読み込み、
 * エージェント定義オブジェクトを返す。
 *
 * @param agentId - エージェントID
 * @returns エージェント定義（存在しない場合はnull）
 *
 * @example
 * ```typescript
 * const agent = getAgentDetails('coo_pm');
 * if (agent) {
 *   console.log(`タイトル: ${agent.title}`);
 * }
 * ```
 */
export function getAgentDetails(agentId: string): AgentDefinition | null {
  const registryPath = getRegistryPath(agentId);

  if (!fs.existsSync(registryPath)) {
    return null;
  }

  try {
    const definition = loadAgentDefinition(registryPath);
    const validationResult = validateAgentDefinition(definition);

    if (!validationResult.valid) {
      console.error(`エージェント定義が無効です: ${agentId}`, validationResult.errors);
      return null;
    }

    return definition as AgentDefinition;
  } catch (error) {
    console.error(`エージェント定義の読み込みに失敗しました: ${agentId}`, error);
    return null;
  }
}

/**
 * エージェントをRegistryから削除する
 *
 * 指定されたエージェントIDの定義ファイルをRegistryから削除する。
 * 主にテストやロールバック用途で使用。
 *
 * @param agentId - エージェントID
 * @returns 削除成功ならtrue、失敗ならfalse
 *
 * @example
 * ```typescript
 * if (removeAgent('test_agent')) {
 *   console.log('エージェントを削除しました');
 * }
 * ```
 */
export function removeAgent(agentId: string): boolean {
  const registryPath = getRegistryPath(agentId);

  if (!fs.existsSync(registryPath)) {
    return false;
  }

  try {
    fs.unlinkSync(registryPath);
    return true;
  } catch (error) {
    console.error(`エージェントの削除に失敗しました: ${agentId}`, error);
    return false;
  }
}
