/**
 * @file Employee Detail Page
 * @description 社員詳細画面（プロフィール、パフォーマンス、タイムライン）
 * @see Requirements: 1.4, 1.5, 2.4
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, Loading } from '@/components/ui';
import { StatusIndicator, PerformanceChart } from '@/components/employees';

// =============================================================================
// 型定義
// =============================================================================

interface EmployeeProfile {
  id: string;
  title: string;
  responsibilities: string[];
  capabilities: string[];
  deliverables: string[];
  qualityGates: string[];
  persona: string;
  budget?: { tokens?: number; time_minutes?: number };
  escalation?: { to?: string; conditions?: string[] };
}

interface PerformanceRecord {
  taskId: string;
  taskCategory: string;
  success: boolean;
  qualityScore: number;
  timestamp: string;
}

interface TimelineEntry {
  status: string;
  timestamp: string;
  duration?: number;
}

interface EmployeeDetail {
  profile: EmployeeProfile;
  status: {
    current: string;
    currentTask?: { id: string; title: string };
    lastChanged?: string;
  };
  performance: {
    totalTasks: number;
    successRate: number;
    averageQuality: number;
    strengths: string[];
    weaknesses: string[];
    recentRecords: PerformanceRecord[];
  };
  timeline: {
    date: string;
    entries: TimelineEntry[];
  };
}

// =============================================================================
// ヘルパー
// =============================================================================

/** 時刻をHH:MM形式にフォーマット */
function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ミリ秒を「Xm」形式にフォーマット */
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1m';
  return `${minutes}m`;
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/** プロフィールセクション */
function ProfileSection({ profile }: { profile: EmployeeProfile }): JSX.Element {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-text-muted mb-3">プロフィール</h2>

      {/* 責務 */}
      <div className="mb-4">
        <p className="text-xs text-text-muted mb-1">責務</p>
        <ul className="space-y-1">
          {profile.responsibilities.map((r, i) => (
            <li key={i} className="text-sm text-text-secondary flex items-start gap-1.5">
              <span className="text-accent-primary mt-0.5">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 能力 */}
      <div className="mb-4">
        <p className="text-xs text-text-muted mb-1">能力</p>
        <div className="flex flex-wrap gap-1.5">
          {profile.capabilities.map((c, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs rounded-full bg-bg-tertiary text-text-secondary"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* 予算 */}
      {profile.budget && (
        <div>
          <p className="text-xs text-text-muted mb-1">予算</p>
          <div className="flex gap-4 text-sm text-text-secondary">
            {profile.budget.tokens && (
              <span>🪙 {profile.budget.tokens.toLocaleString()} tokens</span>
            )}
            {profile.budget.time_minutes && (
              <span>⏱ {profile.budget.time_minutes}分</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** タイムラインセクション */
function TimelineSection({
  entries,
  date,
}: {
  entries: TimelineEntry[];
  date: string;
}): JSX.Element {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-text-muted mb-3">
        本日のタイムライン ({date})
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">本日のアクティビティはありません</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-text-muted w-12 flex-shrink-0">
                {formatTime(entry.timestamp)}
              </span>
              <StatusIndicator status={entry.status} size="sm" showLabel />
              {entry.duration !== undefined && (
                <span className="text-xs text-text-muted ml-auto">
                  {formatDuration(entry.duration)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// ムード推移チャートセクション（Task 25.1）
// =============================================================================

/** ムードエントリ */
interface MoodEntry {
  score: number;
  factors: {
    successRate: number;
    workload: number;
    escalationFrequency: number;
    consecutiveFailures: number;
  };
  timestamp: string;
}

/** ムードデータ */
interface MoodData {
  agentId: string;
  currentMood: number;
  history: MoodEntry[];
}

/** ムードスコアに応じた色 */
function getMoodColor(score: number): string {
  if (score >= 70) return 'text-status-pass';
  if (score >= 40) return 'text-status-waiver';
  return 'text-status-fail';
}

/** ムードスコアに応じたバー色 */
function getMoodBarColor(score: number): string {
  if (score >= 70) return 'bg-status-pass';
  if (score >= 40) return 'bg-status-waiver';
  return 'bg-status-fail';
}

/** ムードスコアに応じたラベル */
function getMoodLabel(score: number): string {
  if (score >= 80) return '😊 好調';
  if (score >= 60) return '🙂 普通';
  if (score >= 40) return '😐 注意';
  return '😟 要ケア';
}

function MoodChartSection({ agentId }: { agentId: string }): JSX.Element {
  const [moodData, setMoodData] = useState<MoodData | null>(null);
  const [moodLoading, setMoodLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/employees/${agentId}/mood`);
        if (res.ok) {
          const json = await res.json();
          setMoodData(json.data ?? null);
        }
      } catch {
        // 失敗時は非表示
      } finally {
        setMoodLoading(false);
      }
    };
    load();
  }, [agentId]);

  if (moodLoading) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-medium text-text-muted mb-3">ムード推移</h2>
        <p className="text-sm text-text-muted">読み込み中...</p>
      </Card>
    );
  }

  if (!moodData) return <></>;

  const current = moodData.currentMood;
  // 直近10件の履歴を表示
  const recentHistory = moodData.history.slice(-10);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-text-muted mb-3">ムード推移</h2>

      {/* 現在のムード */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-2xl font-bold ${getMoodColor(current)}`}>{current}</span>
        <span className="text-sm text-text-secondary">{getMoodLabel(current)}</span>
      </div>

      {/* ムードバーチャート（簡易） */}
      {recentHistory.length > 0 ? (
        <div className="space-y-1.5">
          {recentHistory.map((entry, i) => {
            const date = new Date(entry.timestamp);
            const label = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-10 flex-shrink-0">{label}</span>
                <div className="flex-1 h-3 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getMoodBarColor(entry.score)}`}
                    style={{ width: `${entry.score}%` }}
                  />
                </div>
                <span className={`text-xs w-6 text-right ${getMoodColor(entry.score)}`}>
                  {entry.score}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted">ムード履歴がありません</p>
      )}

      {/* ファクター内訳（最新） */}
      {recentHistory.length > 0 && (
        <div className="mt-4 pt-3 border-t border-bg-tertiary">
          <p className="text-xs text-text-muted mb-2">最新のファクター内訳</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">成功率</span>
              <span className="text-text-secondary">
                {Math.round(recentHistory[recentHistory.length - 1].factors.successRate * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">負荷</span>
              <span className="text-text-secondary">
                {Math.round(recentHistory[recentHistory.length - 1].factors.workload * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">エスカレーション</span>
              <span className="text-text-secondary">
                {Math.round(recentHistory[recentHistory.length - 1].factors.escalationFrequency * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">連続失敗</span>
              <span className="text-text-secondary">
                {recentHistory[recentHistory.length - 1].factors.consecutiveFailures}回
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// キャリア履歴セクション（Task 25.4）
// =============================================================================

/** キャリアイベント */
interface CareerEvent {
  type: 'initial' | 'promotion' | 'demotion';
  fromLevel?: string;
  toLevel: string;
  reason: string;
  timestamp: string;
}

/** キャリアデータ */
interface CareerData {
  agentId: string;
  currentLevel: string;
  events: CareerEvent[];
}

/** レベルに応じたバッジ色 */
function getLevelBadgeClass(level: string): string {
  switch (level) {
    case 'lead': return 'bg-status-waiver/20 text-status-waiver';
    case 'senior': return 'bg-status-pass/20 text-status-pass';
    case 'mid': return 'bg-accent-primary/20 text-accent-primary';
    case 'junior': return 'bg-text-muted/20 text-text-muted';
    default: return 'bg-bg-tertiary text-text-secondary';
  }
}

/** イベントタイプに応じたアイコン */
function getCareerEventIcon(type: string): string {
  switch (type) {
    case 'promotion': return '⬆️';
    case 'demotion': return '⬇️';
    case 'initial': return '🎯';
    default: return '📌';
  }
}

function CareerHistorySection({ agentId }: { agentId: string }): JSX.Element {
  const [careerData, setCareerData] = useState<CareerData | null>(null);
  const [careerLoading, setCareerLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/employees/${agentId}/career`);
        if (res.ok) {
          const json = await res.json();
          setCareerData(json.data ?? null);
        }
      } catch {
        // 失敗時は非表示
      } finally {
        setCareerLoading(false);
      }
    };
    load();
  }, [agentId]);

  if (careerLoading) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-medium text-text-muted mb-3">キャリア履歴</h2>
        <p className="text-sm text-text-muted">読み込み中...</p>
      </Card>
    );
  }

  if (!careerData) return <></>;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-text-muted mb-3">キャリア履歴</h2>

      {/* 現在のレベル */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-text-muted">現在のレベル:</span>
        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getLevelBadgeClass(careerData.currentLevel)}`}>
          {careerData.currentLevel.toUpperCase()}
        </span>
      </div>

      {/* イベント年表 */}
      {careerData.events.length > 0 ? (
        <div className="space-y-3">
          {[...careerData.events].reverse().map((event, i) => (
            <div key={i} className="flex items-start gap-3 relative">
              {/* タイムラインライン */}
              {i < careerData.events.length - 1 && (
                <div className="absolute left-[11px] top-6 bottom-0 w-px bg-bg-tertiary" />
              )}
              <span className="text-sm flex-shrink-0 mt-0.5">{getCareerEventIcon(event.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {event.fromLevel && (
                    <>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded ${getLevelBadgeClass(event.fromLevel)}`}>
                        {event.fromLevel}
                      </span>
                      <span className="text-text-muted text-xs">→</span>
                    </>
                  )}
                  <span className={`px-1.5 py-0.5 text-[10px] rounded ${getLevelBadgeClass(event.toLevel)}`}>
                    {event.toLevel}
                  </span>
                </div>
                {event.reason && (
                  <p className="text-xs text-text-secondary mt-0.5">{event.reason}</p>
                )}
                <p className="text-[10px] text-text-muted mt-0.5">
                  {new Date(event.timestamp).toLocaleDateString('ja-JP')}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">キャリアイベントはありません</p>
      )}
    </Card>
  );
}

// =============================================================================
// チャットログセクション
// =============================================================================

/** チャットログエントリ */
interface ChatLogEntry {
  id: string;
  type: string;
  from: string;
  to: string;
  message: string;
  timestamp: string;
}

/** チャットログセクション */
function ChatLogSection({ agentId }: { agentId: string }): JSX.Element {
  const [logs, setLogs] = useState<ChatLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/chat-logs?agentId=${agentId}&limit=20`);
        if (res.ok) {
          const json = await res.json();
          setLogs(json.data ?? []);
        }
      } catch {
        // 失敗時は空表示
      } finally {
        setLogLoading(false);
      }
    };
    load();
  }, [agentId]);

  /** タイプに応じたラベル */
  const typeLabel = (type: string): string => {
    switch (type) {
      case 'task_assignment': return '📋 タスク割当';
      case 'task_completion': return '✅ タスク完了';
      case 'review_request': return '🔍 レビュー依頼';
      case 'escalation': return '⚠️ エスカレーション';
      case 'status_update': return '📊 ステータス更新';
      default: return '💬 メッセージ';
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-text-muted mb-3">チャットログ</h2>
      {logLoading ? (
        <p className="text-sm text-text-muted">読み込み中...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-text-muted">チャットログはありません</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="p-2 rounded bg-bg-tertiary/30">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-muted">{typeLabel(log.type)}</span>
                <span className="text-xs text-text-muted">
                  {new Date(log.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-text-secondary mt-1 line-clamp-2">{log.message}</p>
              {log.to && log.to !== agentId && (
                <p className="text-xs text-text-muted mt-0.5">→ {log.to}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// メインページ
// =============================================================================

export default function EmployeeDetailPage(): JSX.Element {
  const params = useParams();
  const agentId = params.id as string;
  const [data, setData] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/employees/${agentId}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="p-6">
        <Loading message="社員データを読み込み中..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-status-fail">{error ?? '社員が見つかりません'}</p>
          <Link
            href="/employees"
            className="mt-3 inline-block text-sm text-accent-primary hover:underline"
          >
            ← 社員名簿に戻る
          </Link>
        </Card>
      </div>
    );
  }

  const { profile, status, performance, timeline } = data;

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/employees"
            className="text-xs text-text-muted hover:text-accent-primary transition-colors"
          >
            ← 社員名簿
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <div className="w-12 h-12 rounded-lg bg-accent-primary/20 flex items-center justify-center">
              <span className="text-lg font-bold text-accent-primary">
                {profile.id
                  .split(/[_-]/)
                  .map((p) => p.charAt(0).toUpperCase())
                  .slice(0, 2)
                  .join('')}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{profile.title}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-text-muted">{profile.id}</span>
                <StatusIndicator status={status.current} size="md" showLabel />
              </div>
            </div>
          </div>
          {status.currentTask && (
            <p className="text-sm text-accent-primary mt-2">
              📋 現在のタスク: {status.currentTask.title}
            </p>
          )}
        </div>
      </div>

      {/* メインコンテンツ: 2カラム */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左カラム: プロフィール + ムード + キャリア + タイムライン + チャットログ */}
        <div className="space-y-6">
          <ProfileSection profile={profile} />
          <MoodChartSection agentId={agentId} />
          <CareerHistorySection agentId={agentId} />
          <TimelineSection entries={timeline.entries} date={timeline.date} />
          <ChatLogSection agentId={agentId} />
        </div>

        {/* 右カラム: パフォーマンス */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-sm font-medium text-text-muted mb-4">パフォーマンス</h2>
            {performance.totalTasks > 0 ? (
              <PerformanceChart
                records={performance.recentRecords}
                successRate={performance.successRate}
                averageQuality={performance.averageQuality}
                strengths={performance.strengths}
                weaknesses={performance.weaknesses}
              />
            ) : (
              <p className="text-sm text-text-muted">パフォーマンスデータがありません</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
