/**
 * @file Meetings Page
 * @description 会議一覧画面（朝会、レトロスペクティブ、経営会議、プロジェクト会議）
 * @see Requirements: 3.5, 3.6
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Loading, EmptyState } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

interface MeetingSummary {
  meetingId: string;
  workflowId: string;
  type: 'standup' | 'retrospective' | 'executive' | 'project';
  date: string;
  participantCount: number;
  summary: string;
}

// =============================================================================
// 定数
// =============================================================================

/** 会議タイプ設定 */
const MEETING_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  standup: { label: '朝会', icon: '☀️', color: 'text-status-pass' },
  retrospective: { label: 'レトロスペクティブ', icon: '🔄', color: 'text-status-waiver' },
  executive: { label: '経営会議', icon: '🏢', color: 'text-accent-primary' },
  project: { label: 'プロジェクト会議', icon: '📋', color: 'text-text-secondary' },
};

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: '全タイプ' },
  { value: 'standup', label: '朝会' },
  { value: 'retrospective', label: 'レトロスペクティブ' },
  { value: 'executive', label: '経営会議' },
  { value: 'project', label: 'プロジェクト会議' },
] as const;

// =============================================================================
// 会議カードコンポーネント
// =============================================================================

function MeetingCard({ meeting }: { meeting: MeetingSummary }): JSX.Element {
  const typeConfig = MEETING_TYPES[meeting.type] ?? MEETING_TYPES.project;

  return (
    <Card className="p-4 hover:border-slate-500 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-label={typeConfig.label}>
            {typeConfig.icon}
          </span>
          <div>
            <span className={`text-sm font-medium ${typeConfig.color}`}>
              {typeConfig.label}
            </span>
            <p className="text-xs text-text-muted mt-0.5">{meeting.date}</p>
          </div>
        </div>
        <span className="text-xs text-text-muted whitespace-nowrap">
          {meeting.participantCount}名参加
        </span>
      </div>
      {meeting.summary && (
        <p className="text-sm text-text-secondary mt-3 line-clamp-2">
          {meeting.summary}
        </p>
      )}
      <p className="text-xs text-text-muted mt-2 truncate">
        ID: {meeting.meetingId}
      </p>
    </Card>
  );
}

// =============================================================================
// レトロスペクティブ結果セクション
// =============================================================================

/** レトロスペクティブ結果型 */
interface RetroResult {
  workflowId: string;
  goodPoints: string[];
  improvementPoints: string[];
  actionItems: { title: string; assignee: string; priority: string }[];
}

/** ルール提案型 */
interface RuleProposal {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'proposed' | 'approved' | 'rejected';
  source: { workflowId: string };
}

/** カテゴリバッジの色設定 */
const RULE_CATEGORY_COLORS: Record<string, string> = {
  process: 'bg-accent-primary/20 text-accent-primary',
  quality: 'bg-status-pass/20 text-status-pass',
  communication: 'bg-status-waiver/20 text-status-waiver',
  technical: 'bg-purple-500/20 text-purple-400',
};

function RetrospectiveSection(): JSX.Element {
  const [retros, setRetros] = useState<RetroResult[]>([]);
  const [rules, setRules] = useState<RuleProposal[]>([]);
  const [loadingRetros, setLoadingRetros] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        // レトロスペクティブ結果を取得（会議APIからretroタイプをフィルタ）
        const [retroRes, rulesRes] = await Promise.all([
          fetch('/api/meetings?type=retrospective'),
          fetch('/api/internal-rules?status=proposed'),
        ]);
        const retroJson = await retroRes.json();
        const rulesJson = await rulesRes.json();
        setRetros(retroJson.data ?? []);
        setRules(rulesJson.data ?? []);
      } catch {
        // エラー時は空表示
      } finally {
        setLoadingRetros(false);
      }
    }
    load();
  }, []);

  /** ルール承認/却下 */
  const handleRuleAction = async (ruleId: string, action: 'approve' | 'reject'): Promise<void> => {
    try {
      const res = await fetch('/api/internal-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, action }),
      });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      }
    } catch {
      // エラー時は何もしない
    }
  };

  if (loadingRetros) return <></>;

  // 提案中ルールがない場合は非表示
  if (rules.length === 0 && retros.length === 0) return <></>;

  return (
    <div className="space-y-4">
      {/* ルール提案セクション */}
      {rules.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <span>📋</span>
            承認待ちルール提案（{rules.length}件）
          </h2>
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="p-3 rounded-md bg-bg-primary border border-bg-tertiary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          RULE_CATEGORY_COLORS[rule.category] ?? 'bg-bg-tertiary text-text-muted'
                        }`}
                      >
                        {rule.category}
                      </span>
                      <span className="text-xs text-text-muted truncate">
                        from: {rule.source.workflowId}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-text-primary">{rule.title}</p>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {rule.description}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRuleAction(rule.id, 'approve')}
                      className="px-2 py-1 text-xs font-medium rounded
                        bg-status-pass/10 text-status-pass
                        hover:bg-status-pass/20 transition-colors"
                      aria-label={`${rule.title}を承認`}
                    >
                      承認
                    </button>
                    <button
                      onClick={() => handleRuleAction(rule.id, 'reject')}
                      className="px-2 py-1 text-xs font-medium rounded
                        bg-status-fail/10 text-status-fail
                        hover:bg-status-fail/20 transition-colors"
                      aria-label={`${rule.title}を却下`}
                    >
                      却下
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// メインページコンポーネント
// =============================================================================

/** 自動リフレッシュ間隔（ミリ秒） */
const AUTO_REFRESH_INTERVAL = 10000;

export default function MeetingsPage(): JSX.Element {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [standupLoading, setStandupLoading] = useState(false);
  const [standupMessage, setStandupMessage] = useState<string | null>(null);

  /** 会議データを取得 */
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/meetings');
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setMeetings(json.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 朝会をトリガー */
  const triggerStandup = useCallback(async () => {
    setStandupLoading(true);
    setStandupMessage(null);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'standup' }),
      });
      const json = await res.json();
      if (json.error) {
        setStandupMessage(`❌ ${json.error}`);
      } else {
        setStandupMessage('✅ 朝会を開始しました');
        // データをリフレッシュ
        await loadData();
      }
    } catch (err) {
      setStandupMessage(`❌ ${err instanceof Error ? err.message : '朝会の開始に失敗しました'}`);
    } finally {
      setStandupLoading(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // タイプフィルタ適用
  const filteredMeetings = typeFilter === 'all'
    ? meetings
    : meetings.filter((m) => m.type === typeFilter);

  // ローディング
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="会議データを読み込み中..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Meetings</h1>
          <p className="text-sm text-text-secondary mt-1">
            朝会・レトロスペクティブ・経営会議の記録
          </p>
        </div>
        <button
          onClick={triggerStandup}
          disabled={standupLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium
            bg-accent-primary text-white rounded-md
            hover:bg-accent-hover transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="朝会を開始"
        >
          {standupLoading ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <span>☀️</span>
          )}
          朝会を開始
        </button>
      </div>

      {/* 朝会トリガーメッセージ */}
      {standupMessage && (
        <div className={`p-3 rounded-md text-sm ${
          standupMessage.startsWith('✅')
            ? 'bg-status-pass/10 text-status-pass'
            : 'bg-status-fail/10 text-status-fail'
        }`}>
          {standupMessage}
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <Card className="p-4">
          <p className="text-status-fail text-sm">{error}</p>
          <button
            onClick={loadData}
            className="mt-2 text-sm text-accent-primary hover:underline"
          >
            再読み込み
          </button>
        </Card>
      )}

      {/* レトロスペクティブ結果・ルール提案 */}
      <RetrospectiveSection />

      {/* フィルタ */}
      <div className="flex items-center gap-3">
        <label htmlFor="type-filter" className="text-sm text-text-muted">
          タイプ:
        </label>
        <select
          id="type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-md
            bg-bg-secondary border border-bg-tertiary
            text-text-primary
            focus:outline-none focus:ring-2 focus:ring-accent-primary"
        >
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-muted">
          {filteredMeetings.length}件
        </span>
      </div>

      {/* 会議カード一覧 */}
      {filteredMeetings.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">会議の記録はありません</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.meetingId} meeting={meeting} />
          ))}
        </div>
      )}
    </div>
  );
}
