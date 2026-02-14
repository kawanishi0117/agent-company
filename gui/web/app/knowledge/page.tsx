/**
 * @file Knowledge Base Page
 * @description ナレッジベース画面（検索、カテゴリフィルタ、エントリ一覧）
 * @see Requirements: 7.3, 7.4
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Loading } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

interface KnowledgeEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  relatedWorkflows: string[];
  authorAgentId: string;
  createdAt: string;
}

interface InternalRule {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'proposed' | 'approved' | 'rejected';
  source: { type: string; workflowId: string };
  createdAt: string;
}

// =============================================================================
// 定数
// =============================================================================

/** カテゴリ設定 */
const CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  best_practice: { label: 'ベストプラクティス', icon: '✅', color: 'text-status-pass' },
  failure_case: { label: '失敗事例', icon: '⚠️', color: 'text-status-waiver' },
  technical_note: { label: '技術メモ', icon: '📝', color: 'text-accent-primary' },
  process_improvement: { label: 'プロセス改善', icon: '🔄', color: 'text-text-secondary' },
};

const CATEGORY_OPTIONS = [
  { value: '', label: '全カテゴリ' },
  { value: 'best_practice', label: 'ベストプラクティス' },
  { value: 'failure_case', label: '失敗事例' },
  { value: 'technical_note', label: '技術メモ' },
  { value: 'process_improvement', label: 'プロセス改善' },
] as const;

const RULE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  proposed: { label: '提案中', color: 'bg-status-waiver/10 text-status-waiver' },
  approved: { label: '承認済', color: 'bg-status-pass/10 text-status-pass' },
  rejected: { label: '却下', color: 'bg-status-fail/10 text-status-fail' },
};

// =============================================================================
// サブコンポーネント
// =============================================================================

/** ナレッジエントリカード */
function EntryCard({
  entry,
  onSelect,
}: {
  entry: KnowledgeEntry;
  onSelect: (entry: KnowledgeEntry) => void;
}): JSX.Element {
  const cat = CATEGORIES[entry.category] ?? CATEGORIES.technical_note;

  return (
    <Card
      className="p-4 hover:border-slate-500 transition-colors cursor-pointer"
      onClick={() => onSelect(entry)}
    >
      <div className="flex items-start gap-2 mb-2">
        <span role="img" aria-label={cat.label}>{cat.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary truncate">
            {entry.title}
          </h3>
          <span className={`text-xs ${cat.color}`}>{cat.label}</span>
        </div>
      </div>
      <p className="text-sm text-text-secondary line-clamp-2 mb-2">
        {entry.content}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {entry.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs rounded bg-bg-tertiary text-text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="text-xs text-text-muted">
          {new Date(entry.createdAt).toLocaleDateString('ja-JP')}
        </span>
      </div>
    </Card>
  );
}

/** エントリ詳細パネル */
function EntryDetail({
  entry,
  onClose,
}: {
  entry: KnowledgeEntry;
  onClose: () => void;
}): JSX.Element {
  const cat = CATEGORIES[entry.category] ?? CATEGORIES.technical_note;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span>{cat.icon}</span>
            <span className={`text-xs ${cat.color}`}>{cat.label}</span>
          </div>
          <h2 className="text-lg font-semibold text-text-primary">
            {entry.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>
      <div className="text-sm text-text-secondary whitespace-pre-wrap mb-4">
        {entry.content}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {entry.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 text-xs rounded-full bg-bg-tertiary text-text-secondary"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="text-xs text-text-muted space-y-1">
        <p>作成者: {entry.authorAgentId}</p>
        <p>作成日: {new Date(entry.createdAt).toLocaleString('ja-JP')}</p>
        {entry.relatedWorkflows.length > 0 && (
          <p>関連WF: {entry.relatedWorkflows.join(', ')}</p>
        )}
      </div>
    </Card>
  );
}

/** 社内ルールカード */
function RuleCard({
  rule,
  onAction,
}: {
  rule: InternalRule;
  onAction: (ruleId: string, action: 'approve' | 'reject') => void;
}): JSX.Element {
  const statusConfig = RULE_STATUS_LABELS[rule.status] ?? RULE_STATUS_LABELS.proposed;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-medium text-text-primary">{rule.title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>
      <p className="text-sm text-text-secondary mb-3">{rule.description}</p>
      {rule.status === 'proposed' && (
        <div className="flex gap-2">
          <button
            onClick={() => onAction(rule.id, 'approve')}
            className="px-3 py-1 text-xs font-medium rounded
              bg-status-pass/10 text-status-pass hover:bg-status-pass/20 transition-colors"
          >
            承認
          </button>
          <button
            onClick={() => onAction(rule.id, 'reject')}
            className="px-3 py-1 text-xs font-medium rounded
              bg-status-fail/10 text-status-fail hover:bg-status-fail/20 transition-colors"
          >
            却下
          </button>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// メインページ
// =============================================================================

export default function KnowledgePage(): JSX.Element {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [rules, setRules] = useState<InternalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'knowledge' | 'rules'>('knowledge');

  /** データ取得 */
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (categoryFilter) params.set('category', categoryFilter);

      const [kbRes, rulesRes] = await Promise.all([
        fetch(`/api/knowledge?${params.toString()}`),
        fetch('/api/internal-rules'),
      ]);

      const kbJson = await kbRes.json();
      const rulesJson = await rulesRes.json();

      setEntries(kbJson.data ?? []);
      setRules(rulesJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [query, categoryFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** ルール承認/却下 */
  const handleRuleAction = useCallback(
    async (ruleId: string, action: 'approve' | 'reject') => {
      try {
        const res = await fetch('/api/internal-rules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruleId, action }),
        });
        if (res.ok) {
          await loadData();
        }
      } catch {
        // エラー時は何もしない
      }
    },
    [loadData]
  );

  /** 検索実行 */
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      loadData();
    },
    [loadData]
  );

  const proposedRulesCount = rules.filter((r) => r.status === 'proposed').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="ナレッジベースを読み込み中..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Knowledge Base</h1>
        <p className="text-sm text-text-secondary mt-1">
          組織の知見・ベストプラクティス・社内ルール
        </p>
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-1 border-b border-bg-tertiary">
        <button
          onClick={() => setActiveTab('knowledge')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'knowledge'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-muted hover:text-text-secondary'
          }`}
        >
          📚 ナレッジ ({entries.length})
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-muted hover:text-text-secondary'
          }`}
        >
          📋 社内ルール ({rules.length})
          {proposedRulesCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-status-waiver/20 text-status-waiver">
              {proposedRulesCount}
            </span>
          )}
        </button>
      </div>

      {error && (
        <Card className="p-4">
          <p className="text-status-fail text-sm">{error}</p>
        </Card>
      )}

      {/* ナレッジタブ */}
      {activeTab === 'knowledge' && (
        <>
          {/* 検索・フィルタ */}
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワード検索..."
              className="flex-1 px-3 py-2 text-sm rounded-md
                bg-bg-secondary border border-bg-tertiary text-text-primary
                placeholder:text-text-muted
                focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-md
                bg-bg-secondary border border-bg-tertiary text-text-primary
                focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-md
                bg-accent-primary text-white hover:bg-accent-hover transition-colors"
            >
              検索
            </button>
          </form>

          {/* コンテンツ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* エントリ一覧 */}
            <div className={selectedEntry ? 'lg:col-span-2' : 'lg:col-span-3'}>
              {entries.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-text-muted">ナレッジエントリはありません</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onSelect={setSelectedEntry}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 詳細パネル */}
            {selectedEntry && (
              <div>
                <EntryDetail
                  entry={selectedEntry}
                  onClose={() => setSelectedEntry(null)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* 社内ルールタブ */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {rules.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-text-muted">社内ルールはありません</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onAction={handleRuleAction}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
