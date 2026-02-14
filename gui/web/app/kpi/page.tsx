/**
 * @file KPI Dashboard Page
 * @description KPIダッシュボード・OKR管理画面
 * @see Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Loading } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

interface KpiData {
  productivity: {
    totalTasks: number;
    successRate: number;
    avgQuality: number;
    activeAgents: number;
  };
  techDebt: {
    metrics?: {
      lintErrors: number;
      lintWarnings: number;
      testCoverage: number;
      testPassRate: number;
      totalTests: number;
    };
  } | null;
  updatedAt: string;
}

interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
}

interface Objective {
  id: string;
  title: string;
  keyResults: KeyResult[];
}

interface OkrData {
  quarter: string;
  objectives: Objective[];
  updatedAt: string;
}

// =============================================================================
// KPIカードコンポーネント
// =============================================================================

function KpiCard({
  title,
  value,
  unit,
  color,
}: {
  title: string;
  value: number | string;
  unit?: string;
  color?: string;
}): JSX.Element {
  return (
    <Card className="p-4">
      <p className="text-xs text-text-muted uppercase tracking-wide">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? 'text-text-primary'}`}>
        {value}
        {unit && <span className="text-sm font-normal text-text-muted ml-1">{unit}</span>}
      </p>
    </Card>
  );
}

// =============================================================================
// OKRセクション
// =============================================================================

function OkrSection({ okr }: { okr: OkrData | null }): JSX.Element {
  if (!okr) {
    return (
      <Card className="p-4">
        <p className="text-text-muted text-sm">OKRデータがありません</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">OKR</h2>
        <span className="text-sm text-text-muted">{okr.quarter}</span>
      </div>
      {okr.objectives.map((obj) => (
        <Card key={obj.id} className="p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">{obj.title}</h3>
          <div className="space-y-3">
            {obj.keyResults.map((kr) => {
              const progress = kr.target > 0
                ? Math.min(100, Math.round((kr.current / kr.target) * 100))
                : 0;
              return (
                <div key={kr.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-secondary">{kr.title}</span>
                    <span className="text-text-muted">
                      {kr.current} / {kr.target} ({progress}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        progress >= 100
                          ? 'bg-status-pass'
                          : progress >= 50
                            ? 'bg-accent-primary'
                            : 'bg-status-waiver'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// メインページ
// =============================================================================

export default function KpiPage(): JSX.Element {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [okr, setOkr] = useState<OkrData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [kpiRes, okrRes] = await Promise.all([
        fetch('/api/kpi'),
        fetch('/api/okr'),
      ]);
      const kpiJson = await kpiRes.json();
      const okrJson = await okrRes.json();
      setKpi(kpiJson.data ?? null);
      setOkr(okrJson.data ?? null);
    } catch {
      // エラー時は前回値を維持
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="KPIデータを読み込み中..." />
      </div>
    );
  }

  const prod = kpi?.productivity;
  const debt = kpi?.techDebt?.metrics;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">KPI Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">
          組織のパフォーマンス指標とOKR
        </p>
      </div>

      {/* 生産性KPI */}
      <div>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          生産性
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="総タスク数"
            value={prod?.totalTasks ?? 0}
          />
          <KpiCard
            title="成功率"
            value={prod?.successRate ?? 0}
            unit="%"
            color={
              (prod?.successRate ?? 0) >= 90
                ? 'text-status-pass'
                : (prod?.successRate ?? 0) >= 70
                  ? 'text-status-waiver'
                  : 'text-status-fail'
            }
          />
          <KpiCard
            title="平均品質スコア"
            value={prod?.avgQuality ?? 0}
            unit="/ 100"
          />
          <KpiCard
            title="アクティブエージェント"
            value={prod?.activeAgents ?? 0}
          />
        </div>
      </div>

      {/* 技術的負債 */}
      {debt && (
        <div>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            技術的負債
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              title="Lintエラー"
              value={debt.lintErrors}
              color={debt.lintErrors === 0 ? 'text-status-pass' : 'text-status-fail'}
            />
            <KpiCard
              title="Lint警告"
              value={debt.lintWarnings}
              color={debt.lintWarnings === 0 ? 'text-status-pass' : 'text-status-waiver'}
            />
            <KpiCard
              title="テストカバレッジ"
              value={debt.testCoverage}
              unit="%"
              color={
                debt.testCoverage >= 80
                  ? 'text-status-pass'
                  : debt.testCoverage >= 60
                    ? 'text-status-waiver'
                    : 'text-status-fail'
              }
            />
            <KpiCard
              title="テスト通過率"
              value={debt.testPassRate}
              unit="%"
              color={debt.testPassRate >= 95 ? 'text-status-pass' : 'text-status-waiver'}
            />
          </div>
        </div>
      )}

      {/* OKR */}
      <OkrSection okr={okr} />
    </div>
  );
}
