/**
 * @file Command Center Page
 * @description 社長（ユーザー）からの指示入力画面
 * @requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

interface Project {
  id: string;
  name: string;
  git_url: string;
  default_branch: string;
}

interface CommandHistoryItem {
  id: string;
  instruction: string;
  projectId: string;
  projectName: string;
  status: 'pending' | 'decomposing' | 'executing' | 'completed' | 'failed';
  ticketId?: string;
  createdAt: string;
  updatedAt: string;
  subTasks?: Array<{ id: string; title: string; status: string }>;
}

interface DecompositionPreview {
  estimatedTasks: number;
  suggestedTasks: Array<{
    title: string;
    description: string;
    estimatedTime: string;
  }>;
}

// =============================================================================
// ステータスバッジコンポーネント
// =============================================================================

function StatusBadge({ status }: { status: CommandHistoryItem['status'] }): JSX.Element {
  const styles: Record<CommandHistoryItem['status'], string> = {
    pending: 'bg-text-muted/10 text-text-muted',
    decomposing: 'bg-accent-primary/10 text-accent-primary',
    executing: 'bg-status-waiver/10 text-status-waiver',
    completed: 'bg-status-pass/10 text-status-pass',
    failed: 'bg-status-fail/10 text-status-fail',
  };

  const labels: Record<CommandHistoryItem['status'], string> = {
    pending: '待機中',
    decomposing: '分解中',
    executing: '実行中',
    completed: '完了',
    failed: '失敗',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export default function CommandCenterPage(): JSX.Element {
  // 状態管理
  const [instruction, setInstruction] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [preview, setPreview] = useState<DecompositionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ読み込み
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/command');
      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
      } else {
        setProjects(result.data.projects);
        setHistory(result.data.history);
        
        // デフォルトプロジェクトを選択
        if (result.data.projects.length > 0 && !selectedProject) {
          setSelectedProject(result.data.projects[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // プレビュー取得
  const handlePreview = async () => {
    if (!instruction.trim()) return;

    setPreviewing(true);
    setError(null);

    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instruction.trim(),
          projectId: selectedProject,
          previewOnly: true,
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
      } else {
        setPreview(result.data.preview);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プレビューの取得に失敗しました');
    } finally {
      setPreviewing(false);
    }
  };

  // 指示送信
  const handleSubmit = async () => {
    if (!instruction.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instruction.trim(),
          projectId: selectedProject,
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
      } else {
        // 成功時はフォームをクリアして履歴を更新
        setInstruction('');
        setPreview(null);
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '指示の送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 時刻フォーマット
  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString('ja-JP', {
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
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
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
        <h1 className="text-2xl font-bold text-text-primary">コマンドセンター</h1>
        <p className="text-text-secondary mt-1">
          エージェントへの指示を入力してください
        </p>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="p-4 bg-status-fail/10 border border-status-fail/30 rounded-lg text-status-fail">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 指示入力フォーム */}
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-accent-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            新しい指示
          </h2>

          {/* プロジェクト選択 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              対象プロジェクト
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-bg-tertiary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              {projects.length === 0 ? (
                <option value="">プロジェクトがありません</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
            {projects.length === 0 && (
              <p className="text-xs text-text-muted mt-1">
                CLIで `agentcompany project add` を実行してプロジェクトを追加してください
              </p>
            )}
          </div>

          {/* 指示入力 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              指示内容
            </label>
            <textarea
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setPreview(null); // 入力変更時にプレビューをクリア
              }}
              placeholder="例: ユーザー認証機能を実装してください。ログイン、ログアウト、パスワードリセットの機能が必要です。"
              rows={5}
              className="w-full px-3 py-2 bg-bg-tertiary border border-bg-tertiary rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
            />
            <p className="text-xs text-text-muted mt-1">
              {instruction.length} 文字
            </p>
          </div>

          {/* アクションボタン */}
          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={!instruction.trim() || previewing}
              className="px-4 py-2 bg-bg-tertiary text-text-primary rounded-lg hover:bg-bg-tertiary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {previewing ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
              プレビュー
            </button>
            <button
              onClick={handleSubmit}
              disabled={!instruction.trim() || submitting}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
              送信
            </button>
          </div>

          {/* 分解プレビュー */}
          {preview && (
            <div className="mt-6 pt-6 border-t border-bg-tertiary">
              <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-accent-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                タスク分解プレビュー（推定 {preview.estimatedTasks} タスク）
              </h3>
              <div className="space-y-2">
                {preview.suggestedTasks.map((task, index) => (
                  <div
                    key={index}
                    className="p-3 bg-bg-tertiary/30 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-primary">
                        {task.title}
                      </span>
                      <span className="text-xs text-text-muted">
                        {task.estimatedTime}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">
                      {task.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* 履歴 */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-accent-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            指示履歴
          </h2>

          {history.length === 0 ? (
            <p className="text-text-muted text-center py-8">
              履歴はありません
            </p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-bg-tertiary/30 hover:bg-bg-tertiary/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-text-primary line-clamp-2 flex-1">
                      {item.instruction}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-text-muted">
                      {item.projectName}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatTime(item.createdAt)}
                    </span>
                  </div>
                  {item.ticketId && (
                    <div className="mt-2">
                      <span className="text-xs text-accent-primary">
                        チケット: {item.ticketId}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
