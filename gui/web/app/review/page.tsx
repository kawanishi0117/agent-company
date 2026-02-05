/**
 * @file Review Page
 * @description 成果物プレビュー・承認画面
 * @requirements 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  diff?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

interface Comment {
  id: string;
  filePath: string;
  line?: number;
  content: string;
  author: string;
  createdAt: string;
}

interface ReviewTask {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  assignedWorker: string;
  gitBranch: string;
  completedAt: string;
  fileChanges: FileChange[];
  qualityGates: {
    lint: { passed: boolean; details?: string };
    test: { passed: boolean; details?: string };
  };
  comments: Comment[];
}

// =============================================================================
// ファイル変更コンポーネント
// =============================================================================

function FileChangeCard({
  change,
  comments,
  onAddComment,
}: {
  change: FileChange;
  comments: Comment[];
  onAddComment: (filePath: string, content: string, line?: number) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState('');

  const typeStyles: Record<string, string> = {
    created: 'text-status-pass bg-status-pass/10',
    modified: 'text-status-waiver bg-status-waiver/10',
    deleted: 'text-status-fail bg-status-fail/10',
  };

  const typeLabels: Record<string, string> = {
    created: '新規',
    modified: '変更',
    deleted: '削除',
  };

  const fileComments = comments.filter((c) => c.filePath === change.path);

  const handleSubmitComment = () => {
    if (newComment.trim()) {
      onAddComment(change.path, newComment.trim());
      setNewComment('');
    }
  };

  return (
    <div className="border border-bg-tertiary rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-bg-tertiary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2 py-1 rounded ${typeStyles[change.type]}`}>
            {typeLabels[change.type]}
          </span>
          <span className="text-sm text-text-primary font-mono">{change.path}</span>
          {fileComments.length > 0 && (
            <span className="text-xs text-accent-primary">
              {fileComments.length} コメント
            </span>
          )}
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

      {expanded && (
        <div className="border-t border-bg-tertiary">
          {/* Diff表示 */}
          {change.diff ? (
            <div className="p-4 bg-bg-secondary">
              <pre className="text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap">
                {change.diff}
              </pre>
            </div>
          ) : (
            <div className="p-4 bg-bg-secondary text-center text-text-muted text-sm">
              差分情報がありません
            </div>
          )}

          {/* コメント一覧 */}
          {fileComments.length > 0 && (
            <div className="p-4 border-t border-bg-tertiary space-y-3">
              <h4 className="text-sm font-medium text-text-secondary">コメント</h4>
              {fileComments.map((comment) => (
                <div key={comment.id} className="p-3 bg-bg-tertiary/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-accent-primary">
                      {comment.author}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(comment.createdAt).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary">{comment.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* コメント入力 */}
          <div className="p-4 border-t border-bg-tertiary">
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="コメントを追加..."
                className="flex-1 px-3 py-2 bg-bg-tertiary border border-bg-tertiary rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <button
                onClick={handleSubmitComment}
                disabled={!newComment.trim()}
                className="px-3 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 text-sm"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// レビュータスクカードコンポーネント
// =============================================================================

function ReviewTaskCard({
  task,
  onAction,
  onAddComment,
  actionLoading,
}: {
  task: ReviewTask;
  onAction: (taskId: string, action: string) => void;
  onAddComment: (taskId: string, filePath: string, content: string, line?: number) => void;
  actionLoading: string | null;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const formatDateTime = (ts: string) => {
    return new Date(ts).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="overflow-hidden">
      {/* ヘッダー */}
      <div className="p-4 border-b border-bg-tertiary">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary">{task.title}</h3>
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">
              {task.description}
            </p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-4 p-2 hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            <svg
              className={`w-5 h-5 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* メタ情報 */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1 text-text-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>{task.assignedWorker}</span>
          </div>
          <div className="flex items-center gap-1 text-text-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="font-mono">{task.gitBranch}</span>
          </div>
          <div className="flex items-center gap-1 text-text-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatDateTime(task.completedAt)}</span>
          </div>
        </div>

        {/* 品質ゲート */}
        <div className="flex items-center gap-3 mt-3">
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${task.qualityGates.lint.passed ? 'bg-status-pass/10 text-status-pass' : 'bg-status-fail/10 text-status-fail'}`}>
            {task.qualityGates.lint.passed ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            Lint
          </div>
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${task.qualityGates.test.passed ? 'bg-status-pass/10 text-status-pass' : 'bg-status-fail/10 text-status-fail'}`}>
            {task.qualityGates.test.passed ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            Test
          </div>
          <span className="text-xs text-text-muted">
            {task.fileChanges.length} ファイル変更
          </span>
        </div>
      </div>

      {/* 展開コンテンツ */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* ファイル変更一覧 */}
          <div>
            <h4 className="text-sm font-medium text-text-secondary mb-3">ファイル変更</h4>
            {task.fileChanges.length === 0 ? (
              <p className="text-text-muted text-sm">ファイル変更はありません</p>
            ) : (
              <div className="space-y-2">
                {task.fileChanges.map((change, index) => (
                  <FileChangeCard
                    key={index}
                    change={change}
                    comments={task.comments}
                    onAddComment={(filePath, content, line) =>
                      onAddComment(task.id, filePath, content, line)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* アクションボタン */}
      <div className="p-4 border-t border-bg-tertiary flex flex-wrap gap-3">
        <button
          onClick={() => onAction(task.id, 'approve')}
          disabled={actionLoading !== null}
          className="px-4 py-2 bg-status-pass text-white rounded-lg hover:bg-status-pass/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {actionLoading === `${task.id}-approve` ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          承認
        </button>
        <button
          onClick={() => onAction(task.id, 'request_changes')}
          disabled={actionLoading !== null}
          className="px-4 py-2 bg-status-waiver/10 text-status-waiver rounded-lg hover:bg-status-waiver/20 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {actionLoading === `${task.id}-request_changes` ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )}
          修正依頼
        </button>
        <button
          onClick={() => onAction(task.id, 'reject')}
          disabled={actionLoading !== null}
          className="px-4 py-2 bg-status-fail/10 text-status-fail rounded-lg hover:bg-status-fail/20 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {actionLoading === `${task.id}-reject` ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          却下
        </button>
      </div>
    </Card>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export default function ReviewPage(): JSX.Element {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // データ読み込み
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/review');
      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        setTasks(result.data.tasks);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // アクション実行
  const handleAction = async (taskId: string, action: string) => {
    setActionLoading(`${taskId}-${action}`);
    setError(null);

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  // コメント追加
  const handleAddComment = async (
    taskId: string,
    filePath: string,
    content: string,
    line?: number
  ) => {
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          action: 'comment',
          comment: content,
          filePath,
          line,
        }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'コメントの追加に失敗しました');
    }
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">レビュー</h1>
        <p className="text-text-secondary mt-1">
          承認待ちのタスクを確認し、承認または却下してください
        </p>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="p-4 bg-status-fail/10 border border-status-fail/30 rounded-lg text-status-fail">
          {error}
        </div>
      )}

      {/* タスク一覧 */}
      {tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <svg
            className="w-12 h-12 text-text-muted mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-text-muted">承認待ちのタスクはありません</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <ReviewTaskCard
              key={task.id}
              task={task}
              onAction={handleAction}
              onAddComment={handleAddComment}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
