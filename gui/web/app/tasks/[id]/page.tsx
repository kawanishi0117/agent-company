/**
 * @file Task Detail Page
 * @description タスク詳細・介入画面
 * @requirements 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

type TaskStatus = 'pending' | 'executing' | 'paused' | 'completed' | 'failed' | 'cancelled';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
    result?: string;
  };
}

interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  diff?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

interface TaskDetail {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedWorker?: string;
  projectId: string;
  projectName: string;
  gitBranch?: string;
  startedAt?: string;
  completedAt?: string;
  conversation: ConversationMessage[];
  fileChanges: FileChange[];
  logs: string[];
  qualityGates?: {
    lint: { passed: boolean; details?: string };
    test: { passed: boolean; details?: string };
  };
}

// =============================================================================
// ステータスバッジコンポーネント
// =============================================================================

function StatusBadge({ status }: { status: TaskStatus }): JSX.Element {
  const styles: Record<TaskStatus, string> = {
    pending: 'bg-text-muted/10 text-text-muted',
    executing: 'bg-status-waiver/10 text-status-waiver animate-pulse',
    paused: 'bg-accent-primary/10 text-accent-primary',
    completed: 'bg-status-pass/10 text-status-pass',
    failed: 'bg-status-fail/10 text-status-fail',
    cancelled: 'bg-text-muted/10 text-text-muted',
  };

  const labels: Record<TaskStatus, string> = {
    pending: '待機中',
    executing: '実行中',
    paused: '一時停止',
    completed: '完了',
    failed: '失敗',
    cancelled: 'キャンセル',
  };

  return (
    <span className={`text-sm px-3 py-1 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// =============================================================================
// 会話メッセージコンポーネント
// =============================================================================

function ConversationItem({ message }: { message: ConversationMessage }): JSX.Element {
  const roleStyles: Record<string, string> = {
    user: 'bg-accent-primary/10 border-accent-primary/30',
    assistant: 'bg-bg-tertiary border-bg-tertiary',
    system: 'bg-status-waiver/10 border-status-waiver/30',
    tool: 'bg-status-pass/10 border-status-pass/30',
  };

  const roleLabels: Record<string, string> = {
    user: 'ユーザー',
    assistant: 'AI',
    system: 'システム',
    tool: 'ツール',
  };

  return (
    <div className={`p-3 rounded-lg border ${roleStyles[message.role] || roleStyles.system}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary">
          {roleLabels[message.role] || message.role}
        </span>
        {message.timestamp && (
          <span className="text-xs text-text-muted">
            {new Date(message.timestamp).toLocaleTimeString('ja-JP')}
          </span>
        )}
      </div>
      <div className="text-sm text-text-primary whitespace-pre-wrap">
        {message.content}
      </div>
      {message.toolCall && (
        <div className="mt-2 p-2 bg-bg-secondary rounded text-xs">
          <div className="font-medium text-accent-primary">
            {message.toolCall.name}
          </div>
          {message.toolCall.result && (
            <div className="mt-1 text-text-muted truncate">
              結果: {message.toolCall.result.slice(0, 100)}...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ファイル変更コンポーネント
// =============================================================================

function FileChangeItem({ change }: { change: FileChange }): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const typeStyles: Record<string, string> = {
    created: 'text-status-pass',
    modified: 'text-status-waiver',
    deleted: 'text-status-fail',
  };

  const typeLabels: Record<string, string> = {
    created: '新規',
    modified: '変更',
    deleted: '削除',
  };

  return (
    <div className="border border-bg-tertiary rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-bg-tertiary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${typeStyles[change.type]}`}>
            {typeLabels[change.type]}
          </span>
          <span className="text-sm text-text-primary font-mono">
            {change.path}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {change.linesAdded !== undefined && (
            <span className="text-xs text-status-pass">+{change.linesAdded}</span>
          )}
          {change.linesRemoved !== undefined && (
            <span className="text-xs text-status-fail">-{change.linesRemoved}</span>
          )}
          <svg
            className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && change.diff && (
        <div className="p-3 bg-bg-secondary border-t border-bg-tertiary">
          <pre className="text-xs font-mono text-text-secondary overflow-x-auto">
            {change.diff}
          </pre>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export default function TaskDetailPage(): JSX.Element {
  const params = useParams();
  const taskId = params.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [activeTab, setActiveTab] = useState('conversation');

  // データ読み込み
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/tasks/${taskId}`);
      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        setTask(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadData();
    // 実行中の場合は自動更新
    const interval = setInterval(() => {
      if (task?.status === 'executing') {
        loadData();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData, task?.status]);

  // アクション実行
  const handleAction = async (action: string) => {
    setActionLoading(action);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          instruction: action === 'instruct' ? instruction : undefined,
        }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        if (action === 'instruct') {
          setInstruction('');
        }
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  // 時刻フォーマット
  const formatDateTime = (ts: string) => {
    return new Date(ts).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ローディング表示
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-text-secondary">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>読み込み中...</span>
        </div>
      </div>
    );
  }

  // エラー表示
  if (!task) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="p-6 text-center">
          <p className="text-status-fail mb-4">{error || 'タスクが見つかりません'}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors"
          >
            再読み込み
          </button>
        </Card>
      </div>
    );
  }

  const tabs = [
    { id: 'conversation', label: '会話履歴', count: task.conversation.length },
    { id: 'files', label: 'ファイル変更', count: task.fileChanges.length },
    { id: 'logs', label: 'ログ', count: task.logs.length },
  ];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-text-primary">{task.title}</h1>
            <StatusBadge status={task.status} />
          </div>
          <p className="text-text-secondary">{task.description.slice(0, 200)}</p>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="p-4 bg-status-fail/10 border border-status-fail/30 rounded-lg text-status-fail">
          {error}
        </div>
      )}

      {/* メタ情報 */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-text-muted">チケットID</span>
            <p className="text-text-primary font-mono">{task.ticketId}</p>
          </div>
          <div>
            <span className="text-text-muted">担当ワーカー</span>
            <p className="text-text-primary">{task.assignedWorker || '未割当'}</p>
          </div>
          <div>
            <span className="text-text-muted">Gitブランチ</span>
            <p className="text-text-primary font-mono">{task.gitBranch || '-'}</p>
          </div>
          <div>
            <span className="text-text-muted">開始時刻</span>
            <p className="text-text-primary">{task.startedAt ? formatDateTime(task.startedAt) : '-'}</p>
          </div>
        </div>
      </Card>

      {/* 介入コントロール */}
      {(task.status === 'executing' || task.status === 'paused') && (
        <Card className="p-4">
          <h2 className="text-lg font-semibold text-text-primary mb-4">タスク制御</h2>
          <div className="flex flex-wrap gap-3 mb-4">
            {task.status === 'executing' && (
              <button
                onClick={() => handleAction('pause')}
                disabled={actionLoading !== null}
                className="px-4 py-2 bg-status-waiver/10 text-status-waiver rounded-lg hover:bg-status-waiver/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === 'pause' ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                一時停止
              </button>
            )}
            {task.status === 'paused' && (
              <button
                onClick={() => handleAction('resume')}
                disabled={actionLoading !== null}
                className="px-4 py-2 bg-status-pass/10 text-status-pass rounded-lg hover:bg-status-pass/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === 'resume' ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                )}
                再開
              </button>
            )}
            <button
              onClick={() => handleAction('cancel')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-status-fail/10 text-status-fail rounded-lg hover:bg-status-fail/20 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {actionLoading === 'cancel' ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              キャンセル
            </button>
          </div>

          {/* 追加指示 */}
          <div className="border-t border-bg-tertiary pt-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              追加指示を送信
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="追加の指示を入力..."
                className="flex-1 px-3 py-2 bg-bg-tertiary border border-bg-tertiary rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              <button
                onClick={() => handleAction('instruct')}
                disabled={!instruction.trim() || actionLoading !== null}
                className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
              >
                送信
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* 品質ゲート結果 */}
      {task.qualityGates && (
        <Card className="p-4">
          <h2 className="text-lg font-semibold text-text-primary mb-4">品質ゲート</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-3 rounded-lg ${task.qualityGates.lint.passed ? 'bg-status-pass/10' : 'bg-status-fail/10'}`}>
              <div className="flex items-center gap-2">
                {task.qualityGates.lint.passed ? (
                  <svg className="w-5 h-5 text-status-pass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-status-fail" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className="font-medium">Lint</span>
              </div>
              {task.qualityGates.lint.details && (
                <p className="text-xs text-text-muted mt-1">{task.qualityGates.lint.details}</p>
              )}
            </div>
            <div className={`p-3 rounded-lg ${task.qualityGates.test.passed ? 'bg-status-pass/10' : 'bg-status-fail/10'}`}>
              <div className="flex items-center gap-2">
                {task.qualityGates.test.passed ? (
                  <svg className="w-5 h-5 text-status-pass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-status-fail" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className="font-medium">Test</span>
              </div>
              {task.qualityGates.test.details && (
                <p className="text-xs text-text-muted mt-1">{task.qualityGates.test.details}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* タブコンテンツ */}
      <Card>
        {/* タブヘッダー */}
        <div className="flex border-b border-bg-tertiary" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3
                text-sm font-medium
                border-b-2 -mb-px
                transition-colors duration-200
                ${
                  activeTab === tab.id
                    ? 'border-accent-primary text-accent-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }
              `.trim()}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${activeTab === tab.id ? 'bg-accent-primary/20' : 'bg-bg-tertiary'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === 'conversation' && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {task.conversation.length === 0 ? (
                <p className="text-text-muted text-center py-8">会話履歴はありません</p>
              ) : (
                task.conversation.map((msg, index) => (
                  <ConversationItem key={index} message={msg} />
                ))
              )}
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {task.fileChanges.length === 0 ? (
                <p className="text-text-muted text-center py-8">ファイル変更はありません</p>
              ) : (
                task.fileChanges.map((change, index) => (
                  <FileChangeItem key={index} change={change} />
                ))
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-bg-secondary rounded-lg p-4 max-h-[500px] overflow-y-auto">
              {task.logs.length === 0 ? (
                <p className="text-text-muted text-center py-8">ログはありません</p>
              ) : (
                <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap">
                  {task.logs.join('\n')}
                </pre>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
