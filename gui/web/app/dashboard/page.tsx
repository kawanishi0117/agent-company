/**
 * @file Dashboard Page
 * @description エージェント実行エンジンのダッシュボード画面
 * @requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7
 * @requirements 10.1, 10.2, 10.4, 10.5 - ワークフロー承認通知・サマリー
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { SystemHealthBanner } from '@/components/ui/SystemHealthBanner';
import { StatusIndicator } from '@/components/employees';

// =============================================================================
// 型定義
// =============================================================================

interface WorkerStatus {
  id: string;
  status: 'idle' | 'working' | 'paused' | 'error' | 'terminated';
  currentTask?: { id: string; title: string };
  startedAt?: string;
}

interface TaskSummary {
  pending: number;
  executing: number;
  completed: number;
  failed: number;
}

interface ActivityItem {
  id: string;
  type: 'task_started' | 'task_completed' | 'task_failed' | 'worker_started' | 'worker_stopped' | 'error';
  message: string;
  timestamp: string;
}

interface DashboardData {
  workers: WorkerStatus[];
  tasks: TaskSummary;
  activities: ActivityItem[];
  systemStatus: { paused: boolean; emergencyStopped: boolean };
  lastUpdated: string;
}

/** ワークフローサマリー（ダッシュボード用） */
interface WorkflowSummary {
  running: number;
  waitingApproval: number;
  completed: number;
  failed: number;
}

/** 承認待ちワークフロー情報 */
interface PendingWorkflow {
  workflowId: string;
  instruction: string;
  currentPhase: string;
  createdAt: string;
}

const AUTO_REFRESH_INTERVAL = 5000;

/** 社員ステータスカウント */
interface EmployeeStatusCounts {
  idle: number;
  working: number;
  in_meeting: number;
  reviewing: number;
  on_break: number;
  offline: number;
}

/**
 * 社員ステータスオーバービューセクション
 * @see Requirements: 2.5
 */
function EmployeeOverviewSection(): JSX.Element {
  const [counts, setCounts] = useState<EmployeeStatusCounts | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/employees');
        const json = await res.json();
        if (json.data) {
          setCounts(json.data.statusCounts);
          setTotal(json.data.totalEmployees);
        }
      } catch {
        // 失敗時は非表示
      }
    };
    load();
    const interval = setInterval(load, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!counts) return <></>;

  const items = [
    { status: 'working', label: '作業中', count: counts.working },
    { status: 'in_meeting', label: '会議中', count: counts.in_meeting },
    { status: 'reviewing', label: 'レビュー', count: counts.reviewing },
    { status: 'idle', label: 'アイドル', count: counts.idle },
    { status: 'offline', label: 'オフライン', count: counts.offline },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        社員 ({total}名)
      </h2>
      <Link href="/employees">
        <Card className="p-4 hover:bg-bg-tertiary/30 transition-colors cursor-pointer">
          <div className="flex items-center gap-6 flex-wrap">
            {items.map((item) => (
              <div key={item.status} className="flex items-center gap-1.5">
                <StatusIndicator status={item.status} size="sm" />
                <span className="text-sm text-text-secondary">
                  {item.label}: <span className="font-medium text-text-primary">{item.count}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </Link>
    </div>
  );
}

// =============================================================================
// MVP候補通知セクション（Task 25.6）
// =============================================================================

/** MVP表彰データ */
interface MVPAwardData {
  month: string;
  agentId: string;
  score: number;
  reason: string;
  awardedAt: string;
}

/**
 * MVP候補通知セクション
 * 最新のMVP受賞者を表示
 * @see Requirements: 16.2, 16.3
 */
function MVPCandidateSection(): JSX.Element {
  const [latest, setLatest] = useState<MVPAwardData | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/mvp');
        if (res.ok) {
          const json = await res.json();
          setLatest(json.data?.latest ?? null);
        }
      } catch {
        // 失敗時は非表示
      }
    };
    load();
  }, []);

  if (!latest) return <></>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
        <span className="text-xl">🏆</span>
        月間MVP
      </h2>
      <Link href={`/employees/${latest.agentId}`}>
        <Card className="p-4 border border-status-waiver/30 hover:bg-bg-tertiary/30 transition-colors cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-status-waiver/20 flex items-center justify-center">
              <span className="text-2xl">🏆</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {latest.agentId}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                {latest.month} MVP · スコア {latest.score}
              </p>
              {latest.reason && (
                <p className="text-xs text-text-muted mt-0.5 truncate">{latest.reason}</p>
              )}
            </div>
            <svg className="w-5 h-5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Card>
      </Link>
    </div>
  );
}

// =============================================================================
// ムードアラートセクション（Task 25.7）
// =============================================================================

/** ムードアラート */
interface MoodAlertItem {
  agentId: string;
  currentMood: number;
  trend: 'declining' | 'stable' | 'improving';
}

/**
 * ムードアラートセクション
 * ムードが低い社員を警告表示
 * @see Requirements: 13.4
 */
function MoodAlertSection(): JSX.Element {
  const [alerts, setAlerts] = useState<MoodAlertItem[]>([]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/mood-alerts');
        if (res.ok) {
          const json = await res.json();
          setAlerts(json.data ?? []);
        }
      } catch {
        // 失敗時は非表示
      }
    };
    load();
    const interval = setInterval(load, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (alerts.length === 0) return <></>;

  /** トレンドアイコン */
  const trendIcon = (trend: string): string => {
    switch (trend) {
      case 'declining': return '📉';
      case 'improving': return '📈';
      default: return '➡️';
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-status-fail" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        ムードアラート
        <span className="text-sm font-normal text-text-muted">({alerts.length}名)</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {alerts.map((alert) => (
          <Link key={alert.agentId} href={`/employees/${alert.agentId}`}>
            <Card className="p-3 border border-status-fail/20 hover:bg-bg-tertiary/30 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-status-fail/20 flex items-center justify-center">
                  <span className="text-sm">😟</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{alert.agentId}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-status-fail">ムード: {alert.currentMood}</span>
                    <span className="text-xs">{trendIcon(alert.trend)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// アクティビティストリームセクション
// =============================================================================

/** アクティビティストリームの項目 */
interface StreamItem {
  id: string;
  type: string;
  agentId: string;
  agentTitle: string;
  message: string;
  timestamp: string;
}

/**
 * アクティビティストリームセクション
 * 直近のエージェント間通信をリアルタイム表示
 * @see Requirements: 5.3, 5.4
 */
function ActivityStreamSection(): JSX.Element {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/activity-stream?limit=15');
        if (!res.ok) { setStreamError(true); return; }
        const json = await res.json();
        if (json.data) {
          setItems(json.data);
          setStreamError(false);
        }
      } catch {
        setStreamError(true);
      }
    };
    load();
    const interval = setInterval(load, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // データなし or エラー時は非表示
  if (streamError || items.length === 0) return <></>;

  /** タイプに応じたアイコン色 */
  const typeColor = (type: string): string => {
    switch (type) {
      case 'task_assignment': return 'text-accent-primary';
      case 'task_completion': return 'text-status-pass';
      case 'review_request': return 'text-status-waiver';
      case 'escalation': return 'text-status-fail';
      default: return 'text-text-muted';
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        アクティビティストリーム
      </h2>
      <Card className="p-4">
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 py-1.5 border-b border-bg-tertiary/50 last:border-0">
              <span className={`text-xs mt-0.5 ${typeColor(item.type)}`}>●</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">
                  <span className="font-medium">{item.agentTitle || item.agentId}</span>
                  {' '}{item.message}
                </p>
                <p className="text-xs text-text-muted">
                  {new Date(item.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }): JSX.Element {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">{title}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <div className={`p-3 rounded-full bg-opacity-10 ${color.replace('text-', 'bg-')}`}>{icon}</div>
      </div>
    </Card>
  );
}

function ActivityIcon({ type }: { type: ActivityItem['type'] }): JSX.Element {
  const cls = 'w-4 h-4';
  if (type === 'task_started') return <svg className={`${cls} text-accent-primary`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  if (type === 'task_completed') return <svg className={`${cls} text-status-pass`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  return <svg className={`${cls} text-status-fail`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

export default function DashboardPage(): JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [workflowSummary, setWorkflowSummary] = useState<WorkflowSummary>({
    running: 0, waitingApproval: 0, completed: 0, failed: 0,
  });
  const [pendingWorkflows, setPendingWorkflows] = useState<PendingWorkflow[]>([]);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/dashboard');
      const result = await response.json();
      if (result.error) setError(result.error);
      else setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  /** ワークフローサマリーと承認待ちデータを取得 */
  const loadWorkflowData = useCallback(async () => {
    try {
      // 全ワークフローを取得してサマリーを集計
      const res = await fetch('/api/workflows');
      if (!res.ok) return;
      const json = await res.json();
      const workflows = Array.isArray(json) ? json : (json.data ?? []);

      const summary: WorkflowSummary = {
        running: 0, waitingApproval: 0, completed: 0, failed: 0,
      };
      const pending: PendingWorkflow[] = [];

      for (const wf of workflows) {
        const status = wf.status ?? '';
        if (status === 'completed') summary.completed++;
        else if (status === 'failed' || status === 'terminated') summary.failed++;
        else if (status === 'waiting_approval') {
          summary.waitingApproval++;
          pending.push({
            workflowId: wf.workflowId ?? wf.id ?? '',
            instruction: wf.instruction ?? '',
            currentPhase: wf.currentPhase ?? '',
            createdAt: wf.createdAt ?? '',
          });
        } else {
          summary.running++;
        }
      }

      setWorkflowSummary(summary);
      setPendingWorkflows(pending);
    } catch {
      // ワークフローデータ取得失敗時は前回の値を維持
    }
  }, []);

  useEffect(() => {
    loadData();
    loadWorkflowData();
    const interval = setInterval(() => {
      loadData();
      loadWorkflowData();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData, loadWorkflowData]);

  const handlePauseAll = async () => { setActionLoading('pause'); await new Promise(r => setTimeout(r, 500)); await loadData(); setActionLoading(null); };
  const handleResumeAll = async () => { setActionLoading('resume'); await new Promise(r => setTimeout(r, 500)); await loadData(); setActionLoading(null); };
  const handleEmergencyStop = async () => { if (!confirm('緊急停止を実行しますか？')) return; setActionLoading('emergency'); await new Promise(r => setTimeout(r, 500)); await loadData(); setActionLoading(null); };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3 text-text-secondary"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg><span>ダッシュボードを読み込み中...</span></div></div>;
  if (!data) return <div className="flex items-center justify-center min-h-[400px]"><Card className="p-6 text-center"><p className="text-status-fail mb-4">{error || 'データの読み込みに失敗しました'}</p><button onClick={loadData} className="px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors">再読み込み</button></Card></div>;

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-6">
      {/* システムヘルス警告バナー */}
      <SystemHealthBanner
        orchestratorConnected={Boolean(data && (data as DashboardData & { orchestratorConnected: boolean }).orchestratorConnected)}
        codingAgents={(data?.aiStatus as AIStatus & { codingAgents?: string[] })?.codingAgents ?? []}
        ollamaRunning={data?.aiStatus?.ollamaRunning ?? false}
      />
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-text-primary">ダッシュボード</h1><p className="text-text-secondary mt-1">エージェント実行エンジンの状態を監視します</p></div>
        <div className="flex items-center gap-2 text-sm text-text-muted"><span>最終更新: {formatTime(data.lastUpdated)}</span><span className="w-2 h-2 bg-status-pass rounded-full animate-pulse" /></div>
      </div>
      {data.systemStatus.emergencyStopped && <div className="p-4 bg-status-fail/10 border border-status-fail/30 rounded-lg text-status-fail flex items-center gap-3"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><span className="font-medium">緊急停止中</span></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="アクティブワーカー" value={data.workers.filter(w => w.status === 'working').length} color="text-accent-primary" icon={<svg className="w-6 h-6 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <StatCard title="保留中タスク" value={data.tasks.pending + data.tasks.executing} color="text-status-waiver" icon={<svg className="w-6 h-6 text-status-waiver" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="完了タスク" value={data.tasks.completed} color="text-status-pass" icon={<svg className="w-6 h-6 text-status-pass" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="エラー" value={data.tasks.failed} color="text-status-fail" icon={<svg className="w-6 h-6 text-status-fail" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>
      {/* ワークフロー承認待ち通知カード */}
      {pendingWorkflows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <svg className="w-5 h-5 text-status-waiver" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            承認待ちワークフロー
            <span className="text-sm font-normal text-text-muted">({pendingWorkflows.length}件)</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingWorkflows.map((wf) => (
              <Link key={wf.workflowId} href={`/workflows/${wf.workflowId}`}>
                <Card className="p-4 border border-accent-primary/30 shadow-[0_0_12px_rgba(59,130,246,0.15)] hover:shadow-[0_0_20px_rgba(59,130,246,0.25)] transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {wf.instruction || wf.workflowId}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-status-waiver/10 text-status-waiver">
                          {wf.currentPhase}
                        </span>
                        {wf.createdAt && (
                          <span className="text-xs text-text-muted">
                            {new Date(wf.createdAt).toLocaleDateString('ja-JP')}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-accent-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
      {/* 社員ステータスオーバービュー */}
      <EmployeeOverviewSection />

      {/* MVP候補通知セクション */}
      <MVPCandidateSection />

      {/* ムードアラートセクション */}
      <MoodAlertSection />

      {/* アクティビティストリーム */}
      <ActivityStreamSection />

      {/* ワークフローサマリーセクション */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          ワークフロー
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/workflows?status=running">
            <Card className="p-3 hover:bg-bg-tertiary/30 transition-colors cursor-pointer">
              <p className="text-xs text-text-muted">実行中</p>
              <p className="text-xl font-bold text-accent-primary">{workflowSummary.running}</p>
            </Card>
          </Link>
          <Link href="/workflows?status=waiting_approval">
            <Card className="p-3 hover:bg-bg-tertiary/30 transition-colors cursor-pointer">
              <p className="text-xs text-text-muted">承認待ち</p>
              <p className="text-xl font-bold text-status-waiver">{workflowSummary.waitingApproval}</p>
            </Card>
          </Link>
          <Link href="/workflows?status=completed">
            <Card className="p-3 hover:bg-bg-tertiary/30 transition-colors cursor-pointer">
              <p className="text-xs text-text-muted">完了</p>
              <p className="text-xl font-bold text-status-pass">{workflowSummary.completed}</p>
            </Card>
          </Link>
          <Link href="/workflows?status=failed">
            <Card className="p-3 hover:bg-bg-tertiary/30 transition-colors cursor-pointer">
              <p className="text-xs text-text-muted">失敗</p>
              <p className="text-xl font-bold text-status-fail">{workflowSummary.failed}</p>
            </Card>
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2"><svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>最近のアクティビティ</h2>
          {data.activities.length === 0 ? <p className="text-text-muted text-center py-8">アクティビティはありません</p> : <div className="space-y-3">{data.activities.map(a => <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary/30 hover:bg-bg-tertiary/50 transition-colors"><ActivityIcon type={a.type} /><div className="flex-1 min-w-0"><p className="text-sm text-text-primary truncate">{a.message}</p><p className="text-xs text-text-muted">{formatTime(a.timestamp)}</p></div></div>)}</div>}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">クイックアクション</h2>
          <div className="space-y-3">
            <button onClick={handlePauseAll} disabled={actionLoading !== null || data.systemStatus.paused} className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${data.systemStatus.paused ? 'bg-bg-tertiary text-text-muted cursor-not-allowed' : 'bg-status-waiver/10 text-status-waiver hover:bg-status-waiver/20'}`}>{actionLoading === 'pause' ? <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}一括停止</button>
            <button onClick={handleResumeAll} disabled={actionLoading !== null || !data.systemStatus.paused} className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${!data.systemStatus.paused ? 'bg-bg-tertiary text-text-muted cursor-not-allowed' : 'bg-status-pass/10 text-status-pass hover:bg-status-pass/20'}`}>{actionLoading === 'resume' ? <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}一括再開</button>
            <button onClick={handleEmergencyStop} disabled={actionLoading !== null} className="w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 bg-status-fail/10 text-status-fail hover:bg-status-fail/20">{actionLoading === 'emergency' ? <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>}緊急停止</button>
          </div>
          <div className="mt-6 pt-6 border-t border-bg-tertiary">
            <h3 className="text-sm font-medium text-text-secondary mb-3">ワーカー状態</h3>
            {data.workers.length === 0 ? <p className="text-text-muted text-sm">アクティブなワーカーはありません</p> : <div className="space-y-2">{data.workers.map(w => <div key={w.id} className="flex items-center justify-between p-2 rounded bg-bg-tertiary/30"><span className="text-sm text-text-primary truncate">{w.id}</span><span className={`text-xs px-2 py-1 rounded ${w.status === 'working' ? 'bg-status-pass/10 text-status-pass' : w.status === 'idle' ? 'bg-text-muted/10 text-text-muted' : w.status === 'paused' ? 'bg-status-waiver/10 text-status-waiver' : 'bg-status-fail/10 text-status-fail'}`}>{w.status}</span></div>)}</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
