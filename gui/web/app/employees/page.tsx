/**
 * @file Employees Page
 * @description 社員名簿画面（組織図ビュー + リストビュー）
 * @see Requirements: 1.1, 1.2, 1.3, 2.2
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Loading, EmptyState } from '@/components/ui';
import { EmployeeCard, OrgChart, StatusIndicator } from '@/components/employees';

// =============================================================================
// 型定義
// =============================================================================

interface Employee {
  id: string;
  title: string;
  responsibilities: string[];
  capabilities: string[];
  status: string;
  currentTask?: { id: string; title: string };
  lastChanged?: string;
  performance?: {
    totalTasks: number;
    successRate: number;
    averageQuality: number;
    strengths: string[];
    weaknesses: string[];
    recentTrend: string;
  };
  /** ムードスコア（Culture機能） */
  mood?: number;
  /** MVP受賞月（Culture機能） */
  mvpMonth?: string;
}

interface StatusCounts {
  idle: number;
  working: number;
  in_meeting: number;
  reviewing: number;
  on_break: number;
  offline: number;
}

interface EmployeesData {
  employees: Employee[];
  statusCounts: StatusCounts;
  totalEmployees: number;
}

// =============================================================================
// 定数
// =============================================================================

/** 自動リフレッシュ間隔（ミリ秒） */
const AUTO_REFRESH_INTERVAL = 5000;

/** ビューモード */
type ViewMode = 'org' | 'list' | 'relationship';

/** ステータスフィルタ */
const STATUS_OPTIONS = [
  { value: 'all', label: '全員' },
  { value: 'working', label: '作業中' },
  { value: 'in_meeting', label: '会議中' },
  { value: 'reviewing', label: 'レビュー中' },
  { value: 'idle', label: 'アイドル' },
  { value: 'offline', label: 'オフライン' },
] as const;

// =============================================================================
// 関係性マップコンポーネント（Task 25.3）
// =============================================================================

/** インタラクション */
interface RelationshipInteraction {
  from: string;
  to: string;
  type: string;
  count: number;
}

/**
 * 関係性マップ（ノード＋エッジのグラフ表示）
 * SVGベースの簡易グラフ表示
 */
function RelationshipMap({ employees }: { employees: Employee[] }): JSX.Element {
  const [interactions, setInteractions] = useState<RelationshipInteraction[]>([]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/relationships');
        if (res.ok) {
          const json = await res.json();
          setInteractions(json.data?.interactions ?? []);
        }
      } catch {
        // 失敗時は空
      }
    };
    load();
  }, []);

  // ノード位置を円形に配置
  const cx = 300;
  const cy = 250;
  const radius = 180;
  const nodePositions = new Map<string, { x: number; y: number }>();

  employees.forEach((emp, i) => {
    const angle = (2 * Math.PI * i) / employees.length - Math.PI / 2;
    nodePositions.set(emp.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });

  // エッジの最大カウント（太さ正規化用）
  const maxCount = Math.max(1, ...interactions.map((i) => i.count));

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-text-muted mb-3">関係性マップ</h2>
      {employees.length === 0 ? (
        <p className="text-sm text-text-muted">社員データがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox="0 0 600 500"
            className="w-full max-w-2xl mx-auto"
            role="img"
            aria-label="社員間の関係性マップ"
          >
            {/* エッジ */}
            {interactions.map((interaction, i) => {
              const fromPos = nodePositions.get(interaction.from);
              const toPos = nodePositions.get(interaction.to);
              if (!fromPos || !toPos) return null;
              const strokeWidth = 1 + (interaction.count / maxCount) * 4;
              return (
                <line
                  key={`edge-${i}`}
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke="#3b82f6"
                  strokeWidth={strokeWidth}
                  strokeOpacity={0.3 + (interaction.count / maxCount) * 0.4}
                />
              );
            })}

            {/* ノード */}
            {employees.map((emp) => {
              const pos = nodePositions.get(emp.id);
              if (!pos) return null;
              const initials = emp.id
                .split(/[_-]/)
                .map((p) => p.charAt(0).toUpperCase())
                .slice(0, 2)
                .join('');
              return (
                <g key={emp.id}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={22}
                    fill="#1e293b"
                    stroke={emp.status === 'working' ? '#22c55e' : emp.status === 'idle' ? '#64748b' : '#3b82f6'}
                    strokeWidth={2}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#f8fafc"
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {initials}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 36}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="9"
                  >
                    {emp.title.length > 12 ? emp.title.slice(0, 12) + '…' : emp.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {interactions.length === 0 && employees.length > 0 && (
        <p className="text-xs text-text-muted text-center mt-2">
          インタラクションデータがまだありません
        </p>
      )}
    </Card>
  );
}

// =============================================================================
// ステータスサマリーコンポーネント
// =============================================================================

function StatusSummary({ counts }: { counts: StatusCounts }): JSX.Element {
  const items = [
    { status: 'working', label: '作業中', count: counts.working },
    { status: 'in_meeting', label: '会議中', count: counts.in_meeting },
    { status: 'reviewing', label: 'レビュー', count: counts.reviewing },
    { status: 'idle', label: 'アイドル', count: counts.idle },
    { status: 'offline', label: 'オフライン', count: counts.offline },
  ];

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {items.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <StatusIndicator status={item.status} size="sm" />
          <span className="text-xs text-text-secondary">
            {item.label}: <span className="font-medium text-text-primary">{item.count}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// メインページ
// =============================================================================

export default function EmployeesPage(): JSX.Element {
  const [data, setData] = useState<EmployeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('org');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        const employees: Employee[] = json.data.employees ?? [];

        // ムードデータを並列取得
        const moodPromises = employees.map(async (emp) => {
          try {
            const moodRes = await fetch(`/api/employees/${emp.id}/mood`);
            if (moodRes.ok) {
              const moodJson = await moodRes.json();
              return { id: emp.id, mood: moodJson.data?.currentMood };
            }
          } catch { /* 失敗時は無視 */ }
          return { id: emp.id, mood: undefined };
        });

        // MVP履歴を取得
        let latestMvpAgentId: string | undefined;
        let latestMvpMonth: string | undefined;
        try {
          const mvpRes = await fetch('/api/mvp');
          if (mvpRes.ok) {
            const mvpJson = await mvpRes.json();
            if (mvpJson.data?.latest) {
              latestMvpAgentId = mvpJson.data.latest.agentId;
              latestMvpMonth = mvpJson.data.latest.month;
            }
          }
        } catch { /* 失敗時は無視 */ }

        const moodResults = await Promise.all(moodPromises);
        const moodMap = new Map(moodResults.map((r) => [r.id, r.mood]));

        // ムード・MVPデータを社員データに統合
        const enrichedEmployees = employees.map((emp) => ({
          ...emp,
          mood: moodMap.get(emp.id),
          mvpMonth: emp.id === latestMvpAgentId ? latestMvpMonth : undefined,
        }));

        setData({
          ...json.data,
          employees: enrichedEmployees,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // フィルタ適用
  const filteredEmployees = data?.employees.filter((emp) =>
    statusFilter === 'all' ? true : emp.status === statusFilter
  ) ?? [];

  if (loading) {
    return (
      <div className="p-6">
        <Loading message="社員データを読み込み中..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-status-fail">{error}</p>
          <button
            onClick={loadData}
            className="mt-3 px-4 py-2 text-sm bg-accent-primary text-white rounded-md hover:bg-accent-hover transition-colors"
          >
            再読み込み
          </button>
        </Card>
      </div>
    );
  }

  if (!data || data.employees.length === 0) {
    return (
      <div className="p-6">
        <EmptyState message="登録されている社員がいません" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">社員名簿</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {data.totalEmployees}名の社員
          </p>
        </div>

        {/* ビュー切替 + フィルタ */}
        <div className="flex items-center gap-3">
          {/* ステータスフィルタ */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-bg-secondary border border-slate-600 rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            aria-label="ステータスフィルタ"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* ビュー切替ボタン */}
          <div className="flex rounded-md border border-slate-600 overflow-hidden">
            <button
              onClick={() => setViewMode('org')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'org'
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
              }`}
              aria-label="組織図ビュー"
            >
              組織図
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'list'
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
              }`}
              aria-label="リストビュー"
            >
              リスト
            </button>
            <button
              onClick={() => setViewMode('relationship')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'relationship'
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
              }`}
              aria-label="関係性マップビュー"
            >
              関係性
            </button>
          </div>
        </div>
      </div>

      {/* ステータスサマリー */}
      <Card className="p-4">
        <StatusSummary counts={data.statusCounts} />
      </Card>

      {/* メインコンテンツ */}
      {viewMode === 'org' ? (
        <OrgChart employees={filteredEmployees} />
      ) : viewMode === 'relationship' ? (
        <RelationshipMap employees={filteredEmployees} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredEmployees.map((emp) => (
            <EmployeeCard
              key={emp.id}
              id={emp.id}
              title={emp.title}
              status={emp.status}
              currentTask={emp.currentTask}
              performance={emp.performance}
              mood={emp.mood}
              mvpMonth={emp.mvpMonth}
            />
          ))}
        </div>
      )}

      {filteredEmployees.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-text-muted">該当する社員がいません</p>
        </Card>
      )}
    </div>
  );
}
