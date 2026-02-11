/**
 * @file SystemHealthBanner コンポーネント
 * @description システムヘルス警告バナー（CodingAgent/Orchestrator/Ollama 可用性表示）
 * @see Requirements: FR-1.1, FR-1.2, FR-1.3, FR-1.4
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';

// =============================================================================
// 型定義
// =============================================================================

/** ヘルス項目 */
interface HealthItem {
  /** 項目名 */
  label: string;
  /** 利用可能か */
  available: boolean;
  /** 詳細メッセージ */
  detail?: string;
}

/** SystemHealthBanner のプロパティ */
interface SystemHealthBannerProps {
  /** Orchestrator 接続状態 */
  orchestratorConnected: boolean;
  /** CodingAgent 利用可能リスト（空なら未検出） */
  codingAgents: string[];
  /** Ollama 起動状態 */
  ollamaRunning: boolean;
  /** 追加の CSS クラス */
  className?: string;
}

// =============================================================================
// アイコン
// =============================================================================

/** 警告アイコン */
function WarningIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

/** チェックアイコン */
function CheckIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

/** 閉じるアイコン */
function CloseIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * システムヘルス警告バナー
 *
 * CodingAgent、Orchestrator、Ollama の可用性を表示し、
 * 問題がある場合は警告バナーを表示する。
 * 全て正常な場合はバナーを表示しない。
 *
 * @see Requirement FR-1.1: Dashboard で CodingAgent 未検出時に警告
 * @see Requirement FR-1.2: Command Center で CodingAgent 未検出時に警告
 * @see Requirement FR-1.3: Settings ページへの誘導リンク
 * @see Requirement FR-1.4: Orchestrator 未接続時の警告
 */
export function SystemHealthBanner({
  orchestratorConnected,
  codingAgents,
  ollamaRunning,
  className = '',
}: SystemHealthBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);

  // ヘルス項目を構築
  const items: HealthItem[] = [
    {
      label: 'Orchestrator Server',
      available: orchestratorConnected,
      detail: orchestratorConnected
        ? '接続中'
        : '未接続 — `agentcompany server` で起動してください',
    },
    {
      label: 'コーディングエージェント',
      available: codingAgents.length > 0,
      detail: codingAgents.length > 0
        ? `利用可能: ${codingAgents.join(', ')}`
        : '未検出 — claude, opencode, kiro のいずれかをインストールしてください',
    },
    {
      label: 'Ollama (提案生成用)',
      available: ollamaRunning,
      detail: ollamaRunning
        ? '起動中'
        : '未起動 — 提案フェーズではテンプレートベースで動作します',
    },
  ];

  // 問題がある項目
  const issues = items.filter((item) => !item.available);

  // 全て正常、または閉じた場合は非表示
  if (issues.length === 0 || dismissed) {
    return null;
  }

  // 重大度判定: CodingAgent 未検出は error、それ以外は warning
  const hasCritical = !orchestratorConnected || codingAgents.length === 0;
  const borderColor = hasCritical
    ? 'border-status-fail/40'
    : 'border-status-waiver/40';
  const bgColor = hasCritical
    ? 'bg-status-fail/5'
    : 'bg-status-waiver/5';

  return (
    <div
      className={`${bgColor} ${borderColor} border rounded-lg p-4 ${className}`}
      role="alert"
      aria-label="システムヘルス警告"
    >
      <div className="flex items-start justify-between gap-3">
        {/* 左: アイコン + 内容 */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <WarningIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-status-waiver" />
          <div className="flex-1 min-w-0">
            <p className="text-text-primary font-medium text-sm">
              システム構成に問題があります
            </p>

            {/* 各項目のステータス */}
            <ul className="mt-2 space-y-1">
              {items.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-xs">
                  {item.available ? (
                    <CheckIcon className="w-3.5 h-3.5 text-status-pass flex-shrink-0" />
                  ) : (
                    <WarningIcon className="w-3.5 h-3.5 text-status-waiver flex-shrink-0" />
                  )}
                  <span className={item.available ? 'text-text-secondary' : 'text-text-primary'}>
                    {item.label}: {item.detail}
                  </span>
                </li>
              ))}
            </ul>

            {/* Settings への誘導 */}
            <div className="mt-3">
              <Link
                href="/settings"
                className="text-xs text-accent-primary hover:underline"
              >
                Settings で設定を確認 →
              </Link>
            </div>
          </div>
        </div>

        {/* 右: 閉じるボタン */}
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors"
          aria-label="閉じる"
        >
          <CloseIcon className="w-4 h-4 text-text-muted" />
        </button>
      </div>
    </div>
  );
}

export default SystemHealthBanner;
