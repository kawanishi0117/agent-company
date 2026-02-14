/**
 * @file Coding Agents Settings API Route
 * @description GET/PUT /api/settings/coding-agents - コーディングエージェント設定の取得・更新
 * @module api/settings/coding-agents
 * @see Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/**
 * コーディングエージェント個別設定
 */
interface AgentSetting {
  /** 使用モデル */
  model?: string;
  /** タイムアウト秒数 */
  timeout?: number;
  /** 追加フラグ */
  additionalFlags?: string[];
}

/**
 * フェーズ別AIサービス設定
 */
interface PhaseServiceConfig {
  proposal?: string;
  development?: string;
  quality_assurance?: string;
}

/**
 * エージェント（社員）別AIサービスオーバーライド
 */
interface AgentServiceOverride {
  agentId: string;
  service: string;
  model?: string;
}

/**
 * コーディングエージェント設定
 */
interface CodingAgentSettings {
  /** 優先コーディングエージェント名 */
  preferredAgent: string;
  /** エージェント別設定 */
  agentSettings: Record<string, AgentSetting>;
  /** 新規プロジェクト時にGitHubリポジトリを自動作成するか */
  autoCreateGithubRepo: boolean;
  /** フェーズ別AIサービス設定 */
  phaseServices?: PhaseServiceConfig;
  /** エージェント（社員）別AIサービスオーバーライド */
  agentOverrides?: AgentServiceOverride[];
}

/**
 * エージェント情報（フロントエンド表示用）
 */
interface AgentInfo {
  /** アダプタ名 */
  name: string;
  /** 表示名 */
  displayName: string;
  /** CLIコマンド例 */
  command: string;
  /** 説明 */
  description: string;
}

/**
 * APIレスポンス型
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// =============================================================================
// 定数
// =============================================================================

/** 設定ファイルパス（gui/web/ から2階層上がってルートへ） */
const CONFIG_FILE_PATH = path.join(
  process.cwd(), '..', '..', 'runtime', 'state', 'config.json'
);

/** デフォルトタイムアウト（秒） */
const DEFAULT_TIMEOUT = 600;

/** 有効なエージェント名 */
const VALID_AGENT_NAMES = ['claude-code', 'opencode', 'kiro-cli'];

/**
 * 登録済みコーディングエージェント情報
 * @see Requirements: 8.4 - エージェント一覧表示
 */
const REGISTERED_AGENTS: AgentInfo[] = [
  {
    name: 'claude-code',
    displayName: 'Claude Code',
    command: 'claude -p "prompt"',
    description: 'Anthropic Claude Code CLI。高品質なコード生成・リファクタリングに最適。',
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    command: 'opencode run "prompt"',
    description: 'OpenCode CLI。複数モデル対応のオープンソースコーディングエージェント。',
  },
  {
    name: 'kiro-cli',
    displayName: 'Kiro CLI',
    command: 'kiro chat -p "prompt"',
    description: 'Kiro CLI。AWS統合に強いコーディングエージェント。',
  },
];

/** デフォルトのコーディングエージェント設定 */
const DEFAULT_CODING_AGENT_SETTINGS: CodingAgentSettings = {
  preferredAgent: 'claude-code',
  agentSettings: {
    'claude-code': { timeout: DEFAULT_TIMEOUT },
    'opencode': { timeout: DEFAULT_TIMEOUT },
    'kiro-cli': { timeout: DEFAULT_TIMEOUT },
  },
  autoCreateGithubRepo: false,
  phaseServices: {},
  agentOverrides: [],
};

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ファイルが存在しないエラーかどうかを判定
 * @param error - エラーオブジェクト
 * @returns ENOENT エラーの場合 true
 */
function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/**
 * config.json からコーディングエージェント設定を読み込む
 * @returns コーディングエージェント設定
 */
async function loadCodingAgentSettings(): Promise<CodingAgentSettings> {
  try {
    const configJson = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const config = JSON.parse(configJson) as Record<string, unknown>;

    // codingAgent フィールドが存在すればマージ
    if (config.codingAgent && typeof config.codingAgent === 'object') {
      return {
        ...DEFAULT_CODING_AGENT_SETTINGS,
        ...(config.codingAgent as Partial<CodingAgentSettings>),
      };
    }

    return { ...DEFAULT_CODING_AGENT_SETTINGS };
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return { ...DEFAULT_CODING_AGENT_SETTINGS };
    }
    throw error;
  }
}

/**
 * config.json にコーディングエージェント設定を保存する
 * @param settings - 保存する設定
 */
async function saveCodingAgentSettings(settings: CodingAgentSettings): Promise<void> {
  const configDir = path.dirname(CONFIG_FILE_PATH);
  await fs.mkdir(configDir, { recursive: true });

  // 既存設定を読み込み
  let existingConfig: Record<string, unknown> = {};
  try {
    const configJson = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    existingConfig = JSON.parse(configJson) as Record<string, unknown>;
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  // codingAgent フィールドを更新
  existingConfig.codingAgent = settings;

  const configJson = JSON.stringify(existingConfig, null, 2);
  await fs.writeFile(CONFIG_FILE_PATH, configJson, 'utf-8');
}

/**
 * コーディングエージェント設定のバリデーション
 * @param settings - バリデーション対象
 * @returns エラーメッセージの配列（空なら有効）
 */
function validateSettings(settings: unknown): string[] {
  const errors: string[] = [];

  if (settings === null || settings === undefined || typeof settings !== 'object') {
    return ['設定はオブジェクトである必要があります'];
  }

  const s = settings as Record<string, unknown>;

  // preferredAgent のバリデーション
  if (s.preferredAgent !== undefined) {
    if (typeof s.preferredAgent !== 'string' || !VALID_AGENT_NAMES.includes(s.preferredAgent)) {
      errors.push(
        `preferredAgent は ${VALID_AGENT_NAMES.join(', ')} のいずれかである必要があります`
      );
    }
  }

  // agentSettings のバリデーション
  if (s.agentSettings !== undefined) {
    if (typeof s.agentSettings !== 'object' || s.agentSettings === null) {
      errors.push('agentSettings はオブジェクトである必要があります');
    } else {
      const agentSettings = s.agentSettings as Record<string, unknown>;
      for (const [name, setting] of Object.entries(agentSettings)) {
        if (!VALID_AGENT_NAMES.includes(name)) {
          errors.push(`不明なエージェント名: ${name}`);
          continue;
        }
        if (setting !== null && typeof setting === 'object') {
          const agentSetting = setting as Record<string, unknown>;
          if (agentSetting.timeout !== undefined) {
            if (typeof agentSetting.timeout !== 'number' || agentSetting.timeout < 30 || agentSetting.timeout > 3600) {
              errors.push(`${name} の timeout は 30〜3600秒の範囲で設定してください`);
            }
          }
        }
      }
    }
  }

  // autoCreateGithubRepo のバリデーション
  if (s.autoCreateGithubRepo !== undefined) {
    if (typeof s.autoCreateGithubRepo !== 'boolean') {
      errors.push('autoCreateGithubRepo は真偽値である必要があります');
    }
  }

  // phaseServices のバリデーション
  if (s.phaseServices !== undefined) {
    if (typeof s.phaseServices !== 'object' || s.phaseServices === null) {
      errors.push('phaseServices はオブジェクトである必要があります');
    } else {
      const ps = s.phaseServices as Record<string, unknown>;
      const validPhases = ['proposal', 'development', 'quality_assurance'];
      for (const [phase, service] of Object.entries(ps)) {
        if (!validPhases.includes(phase)) {
          errors.push(`不明なフェーズ名: ${phase}`);
        }
        if (service !== undefined && service !== null && typeof service === 'string') {
          if (!VALID_AGENT_NAMES.includes(service)) {
            errors.push(`フェーズ '${phase}' のサービス '${service}' は無効です`);
          }
        }
      }
    }
  }

  // agentOverrides のバリデーション
  if (s.agentOverrides !== undefined) {
    if (!Array.isArray(s.agentOverrides)) {
      errors.push('agentOverrides は配列である必要があります');
    } else {
      for (const override of s.agentOverrides as Record<string, unknown>[]) {
        if (!override.agentId || typeof override.agentId !== 'string') {
          errors.push('agentOverrides の各要素には agentId（文字列）が必要です');
        }
        if (!override.service || typeof override.service !== 'string') {
          errors.push('agentOverrides の各要素には service（文字列）が必要です');
        } else if (!VALID_AGENT_NAMES.includes(override.service as string)) {
          errors.push(`agentOverrides のサービス '${override.service}' は無効です`);
        }
      }
    }
  }

  return errors;
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/settings/coding-agents
 * コーディングエージェント設定と登録済みエージェント情報を取得
 * @returns 設定 + エージェント情報一覧
 * @see Requirement 8.4: エージェント一覧表示
 */
export async function GET(): Promise<NextResponse<ApiResponse<{
  settings: CodingAgentSettings;
  agents: AgentInfo[];
}>>> {
  try {
    const settings = await loadCodingAgentSettings();

    return NextResponse.json({
      data: {
        settings,
        agents: REGISTERED_AGENTS,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `コーディングエージェント設定の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/coding-agents
 * コーディングエージェント設定を更新
 * @param request - リクエスト
 * @returns 更新後の設定
 * @see Requirement 8.5: 設定の保存
 */
export async function PUT(
  request: NextRequest
): Promise<NextResponse<ApiResponse<CodingAgentSettings>>> {
  try {
    const body = await request.json();

    // バリデーション
    const validationErrors = validateSettings(body);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: `設定が無効です: ${validationErrors.join(', ')}` },
        { status: 400 }
      );
    }

    // 現在の設定を読み込み、マージ
    const currentSettings = await loadCodingAgentSettings();
    const newSettings: CodingAgentSettings = {
      ...currentSettings,
      ...body,
      // agentSettings はディープマージ
      agentSettings: {
        ...currentSettings.agentSettings,
        ...(body.agentSettings ?? {}),
      },
    };

    // 保存
    await saveCodingAgentSettings(newSettings);

    return NextResponse.json({ data: newSettings });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `コーディングエージェント設定の更新に失敗しました: ${message}` },
      { status: 400 }
    );
  }
}
