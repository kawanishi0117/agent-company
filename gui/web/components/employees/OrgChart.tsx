/**
 * @file OrgChart コンポーネント
 * @description 組織図ビュー（ツリー構造: CEO → 部門長 → Worker）
 * @see Requirements: 1.1, 1.2
 */

'use client';

import Link from 'next/link';
import { StatusIndicator } from './StatusIndicator';

// =============================================================================
// 型定義
// =============================================================================

interface Employee {
  id: string;
  title: string;
  status: string;
  currentTask?: { id: string; title: string };
}

interface OrgChartProps {
  /** 社員一覧 */
  employees: Employee[];
}

// =============================================================================
// 組織構造定義
// =============================================================================

/** 組織階層の定義（上位 → 下位） */
const ORG_HIERARCHY: Record<string, { level: number; label: string }> = {
  coo_pm: { level: 1, label: 'C-Suite' },
  quality_authority: { level: 1, label: 'Governance' },
  security_officer: { level: 1, label: 'Security' },
  cfo: { level: 1, label: 'Finance' },
  hiring_manager: { level: 1, label: 'Talent' },
  reviewer: { level: 2, label: 'Delivery' },
  merger: { level: 2, label: 'Delivery' },
};

/** レベルに応じたスタイル */
const LEVEL_STYLES: Record<number, string> = {
  1: 'border-accent-primary/30 bg-accent-primary/5',
  2: 'border-slate-600 bg-bg-secondary',
  3: 'border-slate-700 bg-bg-tertiary/50',
};

// =============================================================================
// コンポーネント
// =============================================================================

/** 組織図ノード */
function OrgNode({ employee }: { employee: Employee }): JSX.Element {
  const hierarchy = ORG_HIERARCHY[employee.id];
  const level = hierarchy?.level ?? 3;
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES[3];

  return (
    <Link href={`/employees/${employee.id}`}>
      <div
        className={`border rounded-lg p-3 hover:bg-bg-tertiary/80 transition-colors cursor-pointer ${style}`}
      >
        <div className="flex items-center gap-2">
          <StatusIndicator status={employee.status} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {employee.title}
            </p>
            <p className="text-xs text-text-muted">{employee.id}</p>
          </div>
        </div>
        {employee.currentTask && (
          <p className="text-xs text-accent-primary mt-1.5 truncate">
            📋 {employee.currentTask.title}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * 組織図コンポーネント
 * 社員をレベル別にグループ化して表示する
 */
export function OrgChart({ employees }: OrgChartProps): JSX.Element {
  // レベル別にグループ化
  const grouped = new Map<number, Employee[]>();
  for (const emp of employees) {
    const level = ORG_HIERARCHY[emp.id]?.level ?? 3;
    const group = grouped.get(level) ?? [];
    group.push(emp);
    grouped.set(level, group);
  }

  const levels = Array.from(grouped.keys()).sort();

  return (
    <div className="space-y-6">
      {levels.map((level) => {
        const group = grouped.get(level) ?? [];
        const levelLabel =
          level === 1 ? '経営層' : level === 2 ? 'ミドル' : 'ワーカー';

        return (
          <div key={level}>
            <p className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
              {levelLabel}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.map((emp) => (
                <OrgNode key={emp.id} employee={emp} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
