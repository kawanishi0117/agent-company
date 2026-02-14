/**
 * @file Settings Page
 * @description システム設定画面（コーディングエージェント設定を含む）
 * @requirements 15.1, 15.2, 15.5, 15.6, 8.1, 8.2, 8.3, 8.4, 8.5
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

/**
 * コンテナランタイム種別
 */
type ContainerRuntimeType = 'dod' | 'rootless' | 'dind';

/**
 * メッセージキュー種別
 */
type MessageQueueType = 'file' | 'sqlite' | 'redis';

/**
 * Git認証種別
 */
type GitCredentialType = 'deploy_key' | 'token' | 'ssh_agent';

/**
 * システム設定
 */
interface SystemConfig {
  maxConcurrentWorkers: number;
  defaultTimeout: number;
  workerMemoryLimit: string;
  workerCpuLimit: string;
  defaultAiAdapter: string;
  defaultModel: string;
  containerRuntime: ContainerRuntimeType;
  dockerSocketPath?: string;
  allowedDockerCommands: string[];
  messageQueueType: MessageQueueType;
  messageQueuePath?: string;
  gitCredentialType: GitCredentialType;
  gitSshAgentEnabled: boolean;
  stateRetentionDays: number;
  integrationBranch: string;
  autoRefreshInterval: number;
}

// コーディングエージェント関連型

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
 * サービス検出結果
 */
interface ServiceDetectionResult {
  name: string;
  displayName: string;
  available: boolean;
  version: string | null;
  checkedAt: string;
}

/**
 * エージェント情報（表示用）
 */
interface AgentInfo {
  name: string;
  displayName: string;
  command: string;
  description: string;
}

// =============================================================================
// 定数
// =============================================================================

/**
 * 利用可能なAIアダプタ一覧
 */
const AI_ADAPTERS = [
  { value: 'ollama', label: 'Ollama', description: 'ローカルLLM実行' },
  { value: 'gemini', label: 'Gemini', description: 'Google Gemini API' },
  { value: 'kiro', label: 'Kiro CLI', description: 'Kiro CLI経由' },
  { value: 'opencode', label: 'OpenCode', description: 'OpenCode CLI' },
  { value: 'claude', label: 'Claude Code', description: 'Claude Code CLI' },
];

/**
 * コンテナランタイム一覧
 */
const CONTAINER_RUNTIMES = [
  { value: 'dod', label: 'Docker-outside-of-Docker (DoD)', description: 'ホストのDockerデーモンを使用（推奨）' },
  { value: 'rootless', label: 'Rootless Docker/Podman', description: '特権不要の環境向け' },
  { value: 'dind', label: 'Docker-in-Docker (DIND)', description: 'CI環境向け（明示的オプトイン）' },
];

/**
 * メモリ制限オプション
 */
const MEMORY_OPTIONS = ['1g', '2g', '4g', '8g', '16g'];

/**
 * CPU制限オプション
 */
const CPU_OPTIONS = ['1', '2', '4', '8'];

/**
 * ワークフローフェーズ定義（表示用）
 */
const WORKFLOW_PHASES = [
  { key: 'proposal' as const, label: '提案フェーズ', description: '会議・提案書生成' },
  { key: 'development' as const, label: '開発フェーズ', description: 'コーディング・実装' },
  { key: 'quality_assurance' as const, label: 'QAフェーズ', description: 'lint/test・品質確認' },
];

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * Settings Page
 * システム設定画面
 * @see Requirement 15.1: THE GUI SHALL provide Settings page at `/settings`
 * @see Requirement 15.5: THE GUI SHALL display current resource usage
 */
export default function SettingsPage(): JSX.Element {
  // 状態管理
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // コーディングエージェント設定の状態
  const [codingAgentSettings, setCodingAgentSettings] = useState<CodingAgentSettings | null>(null);
  const [agentInfoList, setAgentInfoList] = useState<AgentInfo[]>([]);
  const [codingAgentLoading, setCodingAgentLoading] = useState(true);
  const [codingAgentSaving, setCodingAgentSaving] = useState(false);
  const [connectionTestResults, setConnectionTestResults] = useState<Record<string, 'testing' | 'available' | 'unavailable'>>({});

  // サービス検出結果の状態
  const [detectedServices, setDetectedServices] = useState<ServiceDetectionResult[]>([]);
  const [serviceDetecting, setServiceDetecting] = useState(false);

  // 設定を読み込む
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/settings');
      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        setConfig(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // コーディングエージェント設定を読み込む
  const loadCodingAgentSettings = useCallback(async () => {
    try {
      setCodingAgentLoading(true);
      const response = await fetch('/api/settings/coding-agents');
      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        setCodingAgentSettings(result.data.settings);
        setAgentInfoList(result.data.agents);
      }
    } catch (err) {
      // コーディングエージェント設定の読み込み失敗はメイン設定に影響させない
      setCodingAgentSettings(null);
    } finally {
      setCodingAgentLoading(false);
    }
  }, []);

  /**
   * 環境で利用可能なAIサービスを検出する
   */
  const detectServices = useCallback(async () => {
    try {
      setServiceDetecting(true);
      const response = await fetch('/api/settings/service-detection');
      const result = await response.json();

      if (result.data?.services) {
        setDetectedServices(result.data.services);
      }
    } catch {
      // 検出失敗は無視
    } finally {
      setServiceDetecting(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    loadSettings();
    loadCodingAgentSettings();
    detectServices();
  }, [loadSettings, loadCodingAgentSettings, detectServices]);

  // 設定を保存する
  const saveSettings = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        setConfig(result.data);
        setSuccessMessage('設定を保存しました');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  /**
   * コーディングエージェント設定を保存する
   * @see Requirement 8.5: 設定の保存
   */
  const saveCodingAgentSettings = async (): Promise<void> => {
    if (!codingAgentSettings) return;

    try {
      setCodingAgentSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/settings/coding-agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(codingAgentSettings),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        setCodingAgentSettings(result.data);
        setSuccessMessage('コーディングエージェント設定を保存しました');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'コーディングエージェント設定の保存に失敗しました');
    } finally {
      setCodingAgentSaving(false);
    }
  };

  /**
   * 接続テスト（CLIの存在確認をシミュレート）
   * 実際にはOrchestratorのAPIを叩いて確認する想定
   * @param agentName - テスト対象のエージェント名
   */
  const testConnection = async (agentName: string): Promise<void> => {
    setConnectionTestResults((prev) => ({ ...prev, [agentName]: 'testing' }));

    try {
      // Orchestrator APIに接続テストを依頼
      const response = await fetch(`/api/settings/coding-agents?test=${agentName}`);
      const result = await response.json();

      // APIが正常応答すればavailable扱い（実際のCLI検出はサーバーサイドで行う）
      if (result.data) {
        setConnectionTestResults((prev) => ({ ...prev, [agentName]: 'available' }));
      } else {
        setConnectionTestResults((prev) => ({ ...prev, [agentName]: 'unavailable' }));
      }
    } catch {
      setConnectionTestResults((prev) => ({ ...prev, [agentName]: 'unavailable' }));
    }

    // 5秒後にテスト結果をクリア
    setTimeout(() => {
      setConnectionTestResults((prev) => {
        const next = { ...prev };
        delete next[agentName];
        return next;
      });
    }, 5000);
  };

  // 設定値を更新するヘルパー
  const updateConfig = <K extends keyof SystemConfig>(key: K, value: SystemConfig[K]): void => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  // ローディング表示
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-text-secondary">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>設定を読み込み中...</span>
        </div>
      </div>
    );
  }

  // エラー表示（設定がない場合）
  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="p-6 text-center">
          <p className="text-status-fail mb-4">{error || '設定の読み込みに失敗しました'}</p>
          <button
            onClick={loadSettings}
            className="px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors"
          >
            再読み込み
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">設定</h1>
          <p className="text-text-secondary mt-1">
            システム設定を管理します
          </p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className={`
            px-4 py-2 rounded-md font-medium transition-colors
            ${saving
              ? 'bg-bg-tertiary text-text-muted cursor-not-allowed'
              : 'bg-accent-primary text-white hover:bg-accent-primary/90'
            }
          `}
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
      </div>

      {/* メッセージ表示 */}
      {error && (
        <div className="p-4 bg-status-fail/10 border border-status-fail/30 rounded-lg text-status-fail">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-status-pass/10 border border-status-pass/30 rounded-lg text-status-pass">
          {successMessage}
        </div>
      )}

      {/* ワーカー設定 */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          ワーカー設定
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 最大ワーカー数 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              最大同時実行ワーカー数
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={config.maxConcurrentWorkers}
              onChange={(e) => updateConfig('maxConcurrentWorkers', parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
            <p className="text-xs text-text-muted mt-1">1〜10の範囲で設定</p>
          </div>

          {/* メモリ制限 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              ワーカーメモリ制限
            </label>
            <select
              value={config.workerMemoryLimit}
              onChange={(e) => updateConfig('workerMemoryLimit', e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            >
              {MEMORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* CPU制限 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              ワーカーCPU制限
            </label>
            <select
              value={config.workerCpuLimit}
              onChange={(e) => updateConfig('workerCpuLimit', e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            >
              {CPU_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt} コア</option>
              ))}
            </select>
          </div>

          {/* タイムアウト */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              コマンドタイムアウト（秒）
            </label>
            <input
              type="number"
              min={30}
              max={3600}
              value={config.defaultTimeout}
              onChange={(e) => updateConfig('defaultTimeout', parseInt(e.target.value) || 300)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
            <p className="text-xs text-text-muted mt-1">30〜3600秒の範囲で設定</p>
          </div>
        </div>
      </Card>

      {/* AI設定 */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          AI設定
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AIアダプタ選択 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              デフォルトAIアダプタ
            </label>
            <select
              value={config.defaultAiAdapter}
              onChange={(e) => updateConfig('defaultAiAdapter', e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            >
              {AI_ADAPTERS.map((adapter) => (
                <option key={adapter.value} value={adapter.value}>
                  {adapter.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              {AI_ADAPTERS.find((a): boolean => a.value === config.defaultAiAdapter)?.description}
            </p>
          </div>

          {/* モデル名 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              デフォルトモデル
            </label>
            <input
              type="text"
              value={config.defaultModel}
              onChange={(e) => updateConfig('defaultModel', e.target.value)}
              placeholder="llama3"
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
          </div>
        </div>
      </Card>

      {/* コーディングエージェント設定 */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            コーディングエージェント設定
          </h2>
          <button
            onClick={saveCodingAgentSettings}
            disabled={codingAgentSaving || !codingAgentSettings}
            className={`
              px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${codingAgentSaving || !codingAgentSettings
                ? 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                : 'bg-accent-primary text-white hover:bg-accent-primary/90'
              }
            `}
          >
            {codingAgentSaving ? '保存中...' : 'エージェント設定を保存'}
          </button>
        </div>

        {codingAgentLoading ? (
          <div className="flex items-center gap-2 text-text-secondary py-4">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">コーディングエージェント設定を読み込み中...</span>
          </div>
        ) : codingAgentSettings ? (
          <div className="space-y-5">
            {/* 優先エージェント選択 */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                優先コーディングエージェント
              </label>
              <select
                value={codingAgentSettings.preferredAgent}
                onChange={(e) => setCodingAgentSettings({
                  ...codingAgentSettings,
                  preferredAgent: e.target.value,
                })}
                className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
              >
                {agentInfoList.map((agent) => (
                  <option key={agent.name} value={agent.name}>
                    {agent.displayName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted mt-1">
                開発タスク実行時に優先的に使用されるエージェント。利用不可の場合は自動フォールバック。
              </p>
            </div>

            {/* サービス検出結果 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-text-secondary">
                  環境のサービス検出
                </label>
                <button
                  onClick={detectServices}
                  disabled={serviceDetecting}
                  className="px-3 py-1 text-xs rounded-md border border-bg-tertiary text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-colors disabled:opacity-50"
                >
                  {serviceDetecting ? '検出中...' : '再検出'}
                </button>
              </div>
              {detectedServices.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {detectedServices.map((svc) => (
                    <div
                      key={svc.name}
                      className={`p-3 rounded-lg border ${
                        svc.available
                          ? 'border-status-pass/40 bg-status-pass/5'
                          : 'border-bg-tertiary bg-bg-primary/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${svc.available ? 'bg-status-pass' : 'bg-text-muted'}`} />
                        <span className="text-sm font-medium text-text-primary">{svc.displayName}</span>
                      </div>
                      <p className="text-xs text-text-muted">
                        {svc.available
                          ? `v${svc.version ?? '不明'}`
                          : '未インストール'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">サービス検出結果がありません。「再検出」を押してください。</p>
              )}
            </div>

            {/* フェーズ別AIサービス設定 */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                フェーズ別AIサービス設定
              </label>
              <p className="text-xs text-text-muted mb-3">
                各ワークフローフェーズで使用するAIサービスを個別に指定できます。未指定の場合は上記の優先エージェントが使用されます。
              </p>
              <div className="space-y-2">
                {WORKFLOW_PHASES.map((phase) => {
                  const currentValue = codingAgentSettings.phaseServices?.[phase.key] ?? '';
                  return (
                    <div key={phase.key} className="flex items-center gap-3 p-3 rounded-lg border border-bg-tertiary">
                      <div className="min-w-[140px]">
                        <div className="text-sm font-medium text-text-primary">{phase.label}</div>
                        <div className="text-xs text-text-muted">{phase.description}</div>
                      </div>
                      <select
                        value={currentValue}
                        onChange={(e) => {
                          const val = e.target.value || undefined;
                          setCodingAgentSettings({
                            ...codingAgentSettings,
                            phaseServices: {
                              ...codingAgentSettings.phaseServices,
                              [phase.key]: val,
                            },
                          });
                        }}
                        className="flex-1 px-2 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        <option value="">デフォルト（優先エージェント）</option>
                        {agentInfoList.map((agent) => {
                          const detected = detectedServices.find((s) => s.name === agent.name);
                          const available = detected?.available ?? false;
                          return (
                            <option key={agent.name} value={agent.name}>
                              {agent.displayName}{available ? '' : ' (未検出)'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* エージェント（社員）別オーバーライド */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-text-secondary">
                  社員別AIサービスオーバーライド
                </label>
                <button
                  onClick={() => {
                    const overrides = codingAgentSettings.agentOverrides ?? [];
                    setCodingAgentSettings({
                      ...codingAgentSettings,
                      agentOverrides: [...overrides, { agentId: '', service: agentInfoList[0]?.name ?? 'opencode' }],
                    });
                  }}
                  className="px-3 py-1 text-xs rounded-md border border-bg-tertiary text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-colors"
                >
                  + 追加
                </button>
              </div>
              <p className="text-xs text-text-muted mb-3">
                特定のエージェント（社員）に対して、使用するAIサービスを個別に指定できます。フェーズ設定より優先されます。
              </p>
              {(codingAgentSettings.agentOverrides ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(codingAgentSettings.agentOverrides ?? []).map((override, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border border-bg-tertiary">
                      <input
                        type="text"
                        value={override.agentId}
                        onChange={(e) => {
                          const overrides = [...(codingAgentSettings.agentOverrides ?? [])];
                          overrides[idx] = { ...overrides[idx], agentId: e.target.value };
                          setCodingAgentSettings({ ...codingAgentSettings, agentOverrides: overrides });
                        }}
                        placeholder="エージェントID（例: coo_pm）"
                        className="flex-1 px-2 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      />
                      <select
                        value={override.service}
                        onChange={(e) => {
                          const overrides = [...(codingAgentSettings.agentOverrides ?? [])];
                          overrides[idx] = { ...overrides[idx], service: e.target.value };
                          setCodingAgentSettings({ ...codingAgentSettings, agentOverrides: overrides });
                        }}
                        className="w-40 px-2 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        {agentInfoList.map((agent) => (
                          <option key={agent.name} value={agent.name}>{agent.displayName}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const overrides = (codingAgentSettings.agentOverrides ?? []).filter((_, i) => i !== idx);
                          setCodingAgentSettings({ ...codingAgentSettings, agentOverrides: overrides });
                        }}
                        className="p-1.5 text-text-muted hover:text-status-fail transition-colors"
                        aria-label="削除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted py-2 px-3 border border-dashed border-bg-tertiary rounded-lg text-center">
                  オーバーライドなし。「+ 追加」で社員別の設定を追加できます。
                </p>
              )}
            </div>

            {/* エージェント一覧 */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-3">
                登録済みエージェント
              </label>
              <div className="space-y-3">
                {agentInfoList.map((agent) => {
                  const agentSetting = codingAgentSettings.agentSettings[agent.name] ?? {};
                  const testStatus = connectionTestResults[agent.name];
                  const isPreferred = codingAgentSettings.preferredAgent === agent.name;

                  return (
                    <div
                      key={agent.name}
                      className={`
                        p-4 rounded-lg border transition-colors
                        ${isPreferred
                          ? 'border-accent-primary bg-accent-primary/5'
                          : 'border-bg-tertiary'
                        }
                      `}
                    >
                      {/* エージェントヘッダー */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{agent.displayName}</span>
                          {isPreferred && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-accent-primary/20 text-accent-primary">
                              優先
                            </span>
                          )}
                          {/* 接続テスト結果 */}
                          {testStatus === 'testing' && (
                            <span className="flex items-center gap-1 text-xs text-text-muted">
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              テスト中...
                            </span>
                          )}
                          {testStatus === 'available' && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-status-pass/20 text-status-pass">
                              利用可能
                            </span>
                          )}
                          {testStatus === 'unavailable' && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-status-fail/20 text-status-fail">
                              利用不可
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => testConnection(agent.name)}
                          disabled={testStatus === 'testing'}
                          className="px-3 py-1 text-xs rounded-md border border-bg-tertiary text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-colors disabled:opacity-50"
                        >
                          接続テスト
                        </button>
                      </div>

                      {/* エージェント説明 */}
                      <p className="text-xs text-text-muted mb-3">{agent.description}</p>
                      <p className="text-xs text-text-muted mb-3 font-mono bg-bg-primary/50 px-2 py-1 rounded inline-block">
                        {agent.command}
                      </p>

                      {/* エージェント個別設定 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-xs font-medium text-text-muted mb-1">
                            モデル（オプション）
                          </label>
                          <input
                            type="text"
                            value={agentSetting.model ?? ''}
                            onChange={(e) => setCodingAgentSettings({
                              ...codingAgentSettings,
                              agentSettings: {
                                ...codingAgentSettings.agentSettings,
                                [agent.name]: {
                                  ...agentSetting,
                                  model: e.target.value || undefined,
                                },
                              },
                            })}
                            placeholder="デフォルト"
                            className="w-full px-2 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-text-muted mb-1">
                            タイムアウト（秒）
                          </label>
                          <input
                            type="number"
                            min={30}
                            max={3600}
                            value={agentSetting.timeout ?? 600}
                            onChange={(e) => setCodingAgentSettings({
                              ...codingAgentSettings,
                              agentSettings: {
                                ...codingAgentSettings.agentSettings,
                                [agent.name]: {
                                  ...agentSetting,
                                  timeout: parseInt(e.target.value) || 600,
                                },
                              },
                            })}
                            className="w-full px-2 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GitHub自動リポジトリ作成 */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="autoCreateGithubRepo"
                checked={codingAgentSettings.autoCreateGithubRepo}
                onChange={(e) => setCodingAgentSettings({
                  ...codingAgentSettings,
                  autoCreateGithubRepo: e.target.checked,
                })}
                className="accent-accent-primary"
              />
              <label htmlFor="autoCreateGithubRepo" className="text-sm text-text-secondary cursor-pointer">
                新規プロジェクト時にGitHubリポジトリを自動作成する
              </label>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted py-2">
            コーディングエージェント設定を読み込めませんでした。
          </p>
        )}
      </Card>

      {/* コンテナランタイム設定 */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
          コンテナランタイム設定
        </h2>
        <div className="space-y-4">
          {/* ランタイム選択 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              コンテナランタイム
            </label>
            <div className="space-y-2">
              {CONTAINER_RUNTIMES.map((runtime) => (
                <label
                  key={runtime.value}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${config.containerRuntime === runtime.value
                      ? 'border-accent-primary bg-accent-primary/5'
                      : 'border-bg-tertiary hover:border-text-muted'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="containerRuntime"
                    value={runtime.value}
                    checked={config.containerRuntime === runtime.value}
                    onChange={(e) => updateConfig('containerRuntime', e.target.value as ContainerRuntimeType)}
                    className="mt-1 accent-accent-primary"
                  />
                  <div>
                    <div className="font-medium text-text-primary">{runtime.label}</div>
                    <div className="text-sm text-text-muted">{runtime.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* DIND警告 */}
          {config.containerRuntime === 'dind' && (
            <div className="p-3 bg-status-waiver/10 border border-status-waiver/30 rounded-lg text-status-waiver text-sm">
              ⚠️ DINDはCI環境など必要な場合のみ使用してください。ローカル開発にはDoDを推奨します。
            </div>
          )}
        </div>
      </Card>

      {/* その他の設定 */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          その他の設定
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 状態保持日数 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              実行履歴保持日数
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={config.stateRetentionDays}
              onChange={(e) => updateConfig('stateRetentionDays', parseInt(e.target.value) || 7)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
            <p className="text-xs text-text-muted mt-1">1〜365日の範囲で設定</p>
          </div>

          {/* 統合ブランチ */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              統合ブランチ名
            </label>
            <input
              type="text"
              value={config.integrationBranch}
              onChange={(e) => updateConfig('integrationBranch', e.target.value)}
              placeholder="develop"
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
          </div>

          {/* 自動更新間隔 */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              ダッシュボード自動更新間隔（ミリ秒）
            </label>
            <input
              type="number"
              min={1000}
              max={60000}
              step={1000}
              value={config.autoRefreshInterval}
              onChange={(e) => updateConfig('autoRefreshInterval', parseInt(e.target.value) || 5000)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
            <p className="text-xs text-text-muted mt-1">1000〜60000ミリ秒の範囲で設定</p>
          </div>
        </div>
      </Card>

      {/* 現在の設定サマリー */}
      <Card className="bg-bg-tertiary/30">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          現在の設定サマリー
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-text-muted">ワーカー数</div>
            <div className="text-text-primary font-medium">{config.maxConcurrentWorkers}</div>
          </div>
          <div>
            <div className="text-text-muted">メモリ制限</div>
            <div className="text-text-primary font-medium">{config.workerMemoryLimit}</div>
          </div>
          <div>
            <div className="text-text-muted">AIアダプタ</div>
            <div className="text-text-primary font-medium">{config.defaultAiAdapter}</div>
          </div>
          <div>
            <div className="text-text-muted">ランタイム</div>
            <div className="text-text-primary font-medium">{config.containerRuntime.toUpperCase()}</div>
          </div>
          {codingAgentSettings && (
            <>
              <div>
                <div className="text-text-muted">コーディングエージェント</div>
                <div className="text-text-primary font-medium">
                  {agentInfoList.find((a) => a.name === codingAgentSettings.preferredAgent)?.displayName ?? codingAgentSettings.preferredAgent}
                </div>
              </div>
              {codingAgentSettings.phaseServices && Object.values(codingAgentSettings.phaseServices).some(Boolean) && (
                <div>
                  <div className="text-text-muted">フェーズ別設定</div>
                  <div className="text-text-primary font-medium">有効</div>
                </div>
              )}
              {(codingAgentSettings.agentOverrides ?? []).length > 0 && (
                <div>
                  <div className="text-text-muted">社員別オーバーライド</div>
                  <div className="text-text-primary font-medium">{codingAgentSettings.agentOverrides!.length}件</div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
