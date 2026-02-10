/**
 * @file 新規プロジェクト作成ページ
 * @description プロジェクト登録フォームを表示
 * @requirements 6.1 - プロジェクト登録機能
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { ProjectForm, ProjectFormData } from '@/components/projects';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * 新規プロジェクト作成ページ
 * @requirements 6.1 - プロジェクト登録機能
 */
export default function NewProjectPage(): JSX.Element {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = useCallback(async (data: ProjectFormData): Promise<void> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result: ApiResponse<{ id: string }> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'プロジェクトの作成に失敗しました');
      }

      // 成功時はプロジェクト一覧に遷移
      router.push('/projects');
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [router]);

  /**
   * キャンセルハンドラ
   */
  const handleCancel = useCallback((): void => {
    router.push('/projects');
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto">
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
          <li className="text-text-primary">新規作成</li>
        </ol>
      </nav>

      {/* ページヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">
          新規プロジェクト
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          エージェントに作業させるGitリポジトリを登録します
        </p>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mb-6 p-4 bg-status-fail/10 border border-status-fail/30 rounded-lg">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-status-fail flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-status-fail">
                エラーが発生しました
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* フォームカード */}
      <Card>
        <ProjectForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      </Card>
    </div>
  );
}
