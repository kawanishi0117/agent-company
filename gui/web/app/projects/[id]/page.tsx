/**
 * @file プロジェクト詳細ページ
 * @description プロジェクトの詳細表示、編集、削除機能
 * @requirements 6.3, 6.4 - プロジェクト詳細表示、編集、削除
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay } from '@/components/ui/Error';
import { Modal } from '@/components/ui/Modal';
import { ProjectForm, ProjectFormData } from '@/components/projects';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * プロジェクト情報
 */
interface Project {
  id: string;
  name: string;
  gitUrl: string;
  defaultBranch: string;
  integrationBranch: string;
  baseBranch: string;
  agentBranch: string;
  workDir: string;
  createdAt: string;
  lastUsed: string;
}

// =============================================================================
// カスタムフック
// =============================================================================

/**
 * プロジェクト詳細を取得するカスタムフック
 */
function useProject(projectId: string): {
  project: Project | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const result: ApiResponse<Project> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'プロジェクトの取得に失敗しました');
      }

      setProject(result.data || null);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return {
    project,
    isLoading,
    error,
    refresh: fetchProject,
  };
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * 情報行コンポーネント
 */
interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono = false }: InfoRowProps): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-bg-tertiary last:border-b-0">
      <dt className="text-sm text-text-muted w-40 flex-shrink-0 mb-1 sm:mb-0">
        {label}
      </dt>
      <dd className={`text-sm text-text-primary ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * 削除確認モーダル
 */
interface DeleteModalProps {
  projectName: string;
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteModal({
  projectName,
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteModalProps): JSX.Element {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="プロジェクトの削除">
      <div className="space-y-4">
        <p className="text-text-secondary">
          プロジェクト「<span className="font-semibold text-text-primary">{projectName}</span>」を削除しますか？
        </p>
        <p className="text-sm text-status-fail">
          この操作は取り消せません。関連するチケットや実行履歴も削除されます。
        </p>
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="
              px-4 py-2
              text-sm font-medium
              bg-bg-secondary hover:bg-bg-tertiary
              text-text-primary
              rounded-md border border-bg-tertiary
              transition-colors duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="
              flex items-center gap-2 px-4 py-2
              text-sm font-medium
              bg-status-fail hover:bg-status-fail/90
              text-white
              rounded-md
              transition-colors duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isDeleting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                削除中...
              </>
            ) : (
              '削除する'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * プロジェクト詳細ページ
 * @requirements 6.3, 6.4 - プロジェクト詳細表示、編集、削除
 */
export default function ProjectDetailPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const { project, isLoading, error, refresh } = useProject(projectId);

  // 編集モード
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 削除モーダル
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * 日付フォーマット
   */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * 編集送信ハンドラ
   */
  const handleEditSubmit = useCallback(async (data: ProjectFormData): Promise<void> => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result: ApiResponse<Project> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'プロジェクトの更新に失敗しました');
      }

      setIsEditing(false);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [projectId, refresh]);

  /**
   * 削除ハンドラ
   */
  const handleDelete = useCallback(async (): Promise<void> => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      const result: ApiResponse<void> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'プロジェクトの削除に失敗しました');
      }

      router.push('/projects');
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setSubmitError(message);
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  }, [projectId, router]);

  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="プロジェクトを読み込み中..." size="lg" />
      </div>
    );
  }

  // エラー状態
  if (error || !project) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <ErrorDisplay
          message="プロジェクトの読み込みに失敗しました"
          details={error || 'プロジェクトが見つかりません'}
          onRetry={refresh}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* パンくずリスト */}
      <nav className="mb-6">
        <ol className="flex items-center gap-2 text-sm">
          <li>
            <Link
              href="/projects"
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              Projects
            </Link>
          </li>
          <li className="text-text-muted">/</li>
          <li className="text-text-primary">{project.name}</li>
        </ol>
      </nav>

      {/* ページヘッダー */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {project.name}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {project.id}
          </p>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="
                flex items-center gap-2 px-3 py-1.5
                text-sm font-medium
                bg-bg-secondary hover:bg-bg-tertiary
                text-text-primary
                rounded-md border border-bg-tertiary
                transition-colors duration-200
              "
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              編集
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="
                flex items-center gap-2 px-3 py-1.5
                text-sm font-medium
                bg-status-fail/10 hover:bg-status-fail/20
                text-status-fail
                rounded-md border border-status-fail/30
                transition-colors duration-200
              "
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              削除
            </button>
          </div>
        )}
      </div>

      {/* エラー表示 */}
      {submitError && (
        <div className="mb-6 p-4 bg-status-fail/10 border border-status-fail/30 rounded-lg">
          <p className="text-sm text-status-fail">{submitError}</p>
        </div>
      )}

      {/* 編集フォーム or 詳細表示 */}
      <Card>
        {isEditing ? (
          <ProjectForm
            initialData={{
              name: project.name,
              gitUrl: project.gitUrl,
              baseBranch: project.baseBranch,
              agentBranch: project.agentBranch,
            }}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditing(false)}
            isSubmitting={isSubmitting}
            isEditMode
          />
        ) : (
          <dl className="divide-y divide-bg-tertiary">
            <InfoRow label="Git URL" value={project.gitUrl} mono />
            <InfoRow label="デフォルトブランチ" value={project.defaultBranch} mono />
            <InfoRow label="統合ブランチ" value={project.integrationBranch} mono />
            <InfoRow label="ベースブランチ" value={project.baseBranch} mono />
            <InfoRow label="エージェントブランチ" value={project.agentBranch} mono />
            <InfoRow label="作業ディレクトリ" value={project.workDir} mono />
            <InfoRow label="作成日時" value={formatDate(project.createdAt)} />
            <InfoRow label="最終使用日時" value={formatDate(project.lastUsed)} />
          </dl>
        )}
      </Card>

      {/* 関連チケットへのリンク */}
      {!isEditing && (
        <div className="mt-6">
          <Link
            href={`/tickets?projectId=${project.id}`}
            className="
              inline-flex items-center gap-2
              text-sm text-accent-primary hover:text-accent-primary/80
              transition-colors duration-200
            "
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
            このプロジェクトのチケットを表示
          </Link>
        </div>
      )}

      {/* 削除確認モーダル */}
      <DeleteModal
        projectName={project.name}
        isOpen={showDeleteModal}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
