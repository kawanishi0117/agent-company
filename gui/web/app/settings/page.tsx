/**
 * @file Settings Page
 * @description システム設定画面
 * @requirements 15.1, 15.2, 15.5, 15.6
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

  // 初回読み込み
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
        // 3秒後にメッセージを消す
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
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
        </div>
      </Card>
    </div>
  );
}
