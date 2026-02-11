/**
 * @file ProposalTab コンポーネント
 * @description ワークフロー詳細 - 提案書タブ
 * @see Requirements: 9.3
 */

'use client';

import { Badge } from '@/components/ui/Badge';
import type { ProposalData } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface ProposalTabProps {
  /** 提案書データ */
  proposal?: ProposalData;
}

// =============================================================================
// ユーティリティ
// =============================================================================

/** 重要度バッジのバリアント */
function getSeverityVariant(severity: string): 'fail' | 'waiver' | 'running' | 'pass' {
  switch (severity) {
    case 'critical': return 'fail';
    case 'high': return 'fail';
    case 'medium': return 'waiver';
    case 'low': return 'pass';
    default: return 'running';
  }
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 提案書タブコンポーネント
 */
export function ProposalTab({ proposal }: ProposalTabProps): JSX.Element {
  if (!proposal) {
    return (
      <div className="p-8 text-center text-text-muted">
        <span className="text-4xl mb-4 block">📋</span>
        <p>提案書はまだ作成されていません</p>
        <p className="text-xs mt-1">提案フェーズ完了後に表示されます</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* サマリー */}
      <section>
        <h3 className="text-sm font-medium text-text-muted mb-2">サマリー</h3>
        <div className="p-4 bg-bg-secondary rounded-md border border-bg-tertiary">
          <p className="text-sm text-text-primary">{proposal.summary}</p>
        </div>
      </section>

      {/* スコープ */}
      <section>
        <h3 className="text-sm font-medium text-text-muted mb-2">スコープ</h3>
        <div className="p-4 bg-bg-secondary rounded-md border border-bg-tertiary">
          <p className="text-sm text-text-secondary">{proposal.scope}</p>
        </div>
      </section>

      {/* タスク分解テーブル */}
      <section>
        <h3 className="text-sm font-medium text-text-muted mb-2">
          タスク分解 ({proposal.taskBreakdown.length}件)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-tertiary text-text-muted text-left">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">タイトル</th>
                <th className="py-2 px-3">担当</th>
                <th className="py-2 px-3">工数</th>
                <th className="py-2 px-3">依存</th>
              </tr>
            </thead>
            <tbody>
              {proposal.taskBreakdown.map((task) => (
                <tr key={task.taskNumber} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                  <td className="py-2 px-3 text-text-muted">{task.taskNumber}</td>
                  <td className="py-2 px-3 text-text-primary">{task.title}</td>
                  <td className="py-2 px-3">
                    <Badge variant="running" size="sm">{task.workerType}</Badge>
                  </td>
                  <td className="py-2 px-3 text-text-secondary">{task.estimatedEffort}</td>
                  <td className="py-2 px-3 text-text-muted text-xs">
                    {task.dependencies.length > 0 ? task.dependencies.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ワーカー割り当て */}
      {proposal.workerAssignments.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-muted mb-2">ワーカー割り当て</h3>
          <div className="flex flex-wrap gap-3">
            {proposal.workerAssignments.map((assignment) => (
              <div
                key={assignment.workerType}
                className="p-3 bg-bg-secondary rounded-md border border-bg-tertiary"
              >
                <div className="text-sm font-medium text-text-primary">{assignment.workerType}</div>
                <div className="text-xs text-text-muted mt-1">
                  タスク: {assignment.taskNumbers.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* リスク評価 */}
      {proposal.risks.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-muted mb-2">
            リスク評価 ({proposal.risks.length}件)
          </h3>
          <div className="space-y-2">
            {proposal.risks.map((risk, idx) => (
              <div
                key={idx}
                className="p-3 bg-bg-secondary rounded-md border border-bg-tertiary flex items-start gap-3"
              >
                <Badge variant={getSeverityVariant(risk.severity)} size="sm">
                  {risk.severity}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm text-text-primary">{risk.description}</p>
                  <p className="text-xs text-text-muted mt-1">対策: {risk.mitigation}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 会議録リンク */}
      {proposal.meetingId && (
        <div className="text-xs text-text-muted">
          参照会議: <span className="font-mono">{proposal.meetingId}</span>
          {proposal.version && <span className="ml-2">（バージョン {proposal.version}）</span>}
        </div>
      )}
    </div>
  );
}

export default ProposalTab;
