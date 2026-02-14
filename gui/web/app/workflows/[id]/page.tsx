/**
 * @file ワークフロー詳細ページ
 * @description ワークフロー詳細の表示（6タブ構成）
 * @see Requirements: 9.1-9.12
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PhaseProgress } from '@/components/workflows/PhaseProgress';
import { ApprovalPanel } from '@/components/workflows/ApprovalPanel';
import { EscalationAlert } from '@/components/workflows/EscalationAlert';
import { OverviewTab } from '@/components/workflows/OverviewTab';
import { ProposalTab } from '@/components/workflows/ProposalTab';
import { MeetingsTab } from '@/components/workflows/MeetingsTab';
import { ProgressTab } from '@/components/workflows/ProgressTab';
import { QualityTab } from '@/components/workflows/QualityTab';
import { ApprovalsTab } from '@/components/workflows/ApprovalsTab';
import { Tabs } from '@/components/ui/Tabs';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay } from '@/components/ui/Error';
import type {
  WorkflowStateData,
  WorkflowPhase,
  MeetingMinutesData,
  SubtaskProgressItem,
  QualityResultsData,
} from '@/lib/types';

// =============================================================================
// 定数
// =============================================================================

/** アクティブ時の自動リフレッシュ間隔（ミリ秒） */
const ACTIVE_REFRESH_MS = 3000;

// =============================================================================
// ページコンポーネント
// =============================================================================

/**
 * ワークフロー詳細ページ
 */
export default function WorkflowDetailPage(): JSX.Element {
  const params = useParams();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowStateData | null>(null);
  const [meetings, setMeetings] = useState<MeetingMinutesData[]>([]);
  const [progress, setProgress] = useState<SubtaskProgressItem[]>([]);
  const [quality, setQuality] = useState<QualityResultsData | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** ワークフロー詳細を取得 */
  const fetchWorkflow = useCallback(async (): Promise<void> => {
    try {
      const [wfRes, mtgRes, progRes, qualRes] = await Promise.all([
        fetch(`/api/workflows/${workflowId}`),
        fetch(`/api/workflows/${workflowId}/meetings`),
        fetch(`/api/workflows/${workflowId}/progress`),
        fetch(`/api/workflows/${workflowId}/quality`),
      ]);

      if (!wfRes.ok) throw new Error('ワークフロー詳細の取得に失敗しました');

      const wfData = await wfRes.json();
      setWorkflow(wfData.data?.workflow ?? wfData.data ?? null);

      if (mtgRes.ok) {
        const mtgData = await mtgRes.json();
        setMeetings(mtgData.data?.meetings ?? []);
      }
      if (progRes.ok) {
        const progData = await progRes.json();
        setProgress(progData.data?.subtasks ?? []);
      }
      if (qualRes.ok) {
        const qualData = await qualRes.json();
        setQuality(qualData.data?.quality ?? undefined);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  // 初回読み込み + アクティブ時の自動リフレッシュ
  useEffect(() => {
    fetchWorkflow();
    const isActive = workflow?.status === 'running' || workflow?.status === 'waiting_approval';
    if (isActive) {
      const interval = setInterval(fetchWorkflow, ACTIVE_REFRESH_MS);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [fetchWorkflow, workflow?.status]);

  /** 承認決定を送信 */
  const handleApproval = async (
    action: 'approve' | 'request_revision' | 'reject',
    feedback: string
  ): Promise<void> => {
    await fetch(`/api/workflows/${workflowId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, feedback }),
    });
    await fetchWorkflow();
  };

  /** エスカレーション決定を送信 */
  const handleEscalation = async (
    action: 'retry' | 'skip' | 'abort',
    options?: string
  ): Promise<void> => {
    await fetch(`/api/workflows/${workflowId}/escalation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, options }),
    });
    await fetchWorkflow();
  };

  /** ロールバック実行 */
  const handleRollback = async (targetPhase: WorkflowPhase): Promise<void> => {
    await fetch(`/api/workflows/${workflowId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPhase }),
    });
    await fetchWorkflow();
  };

  if (loading) {
    return <Loading size="lg" text="ワークフロー詳細を読み込み中..." />;
  }

  if (error || !workflow) {
    return <ErrorDisplay message={error ?? 'ワークフローが見つかりません'} onRetry={fetchWorkflow} />;
  }

  const isWaitingApproval = workflow.status === 'waiting_approval';
  const hasEscalation = !!workflow.escalation;
  const approvalPhase = workflow.currentPhase === 'approval' ? 'approval' : 'delivery';

  // タブ定義
  const tabs = [
    { id: 'overview', label: '概要', content: <OverviewTab workflow={workflow} onRollback={handleRollback} /> },
    { id: 'proposal', label: '提案書', content: <ProposalTab proposal={workflow.proposal} /> },
    { id: 'meetings', label: '会議録', badge: meetings.length, content: <MeetingsTab meetings={meetings} /> },
    { id: 'progress', label: '進捗', content: <ProgressTab subtasks={progress} /> },
    { id: 'quality', label: '品質', content: <QualityTab quality={quality} currentPhase={workflow.currentPhase} workflowId={workflow.workflowId} /> },
    { id: 'approvals', label: '承認履歴', badge: (workflow.approvalDecisions ?? []).length, content: <ApprovalsTab approvals={workflow.approvalDecisions ?? []} /> },
  ];

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">ワークフロー詳細</h1>
          <p className="text-xs text-text-muted font-mono mt-1">{workflow.workflowId}</p>
        </div>
        {/* プレビューボタン（delivery フェーズ以降で表示） */}
        {(workflow.currentPhase === 'delivery' || workflow.status === 'completed') && (
          <a
            href={`/api/workflows/${workflow.workflowId}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-accent-primary hover:bg-accent-hover text-text-primary rounded-md transition-colors"
          >
            📦 成果物プレビュー
          </a>
        )}
      </div>

      {/* フェーズ進捗（フル表示） */}
      <PhaseProgress
        currentPhase={workflow.currentPhase}
        status={workflow.status}
      />

      {/* 承認パネル（承認待ち時のみ） */}
      {isWaitingApproval && (
        <ApprovalPanel
          workflowId={workflow.workflowId}
          phase={approvalPhase}
          proposal={workflow.proposal}
          deliverable={workflow.deliverable}
          onSubmit={handleApproval}
        />
      )}

      {/* エスカレーションアラート（エスカレーション時のみ） */}
      {hasEscalation && workflow.escalation && (
        <EscalationAlert
          workflowId={workflow.workflowId}
          escalation={workflow.escalation}
          onSubmit={handleEscalation}
        />
      )}

      {/* タブ */}
      <Tabs tabs={tabs} defaultTab="overview" />
    </div>
  );
}
