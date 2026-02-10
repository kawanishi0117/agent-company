/**
 * @file チケット作成ページ
 * @description 新規チケット作成フォーム - Markdownプレビュー付き
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.5 - プロジェクト選択、指示入力、送信、プレビュー
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loading } from '@/components/ui/Loading';
import { Error as ErrorDisplay } from '@/components/ui/Error';
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
  baseBranch: string;
  agentBranch: string;
}

/**
 * フォームデータ
 */
interface FormData {
  projectId: string;
  instruction: string;
  priority: 'low' | 'medium' | 'high';
  tags: string;
  deadline: string;
}

/**
 * フォームエラー
 */
interface FormErrors {
  projectId?: string;
  instruction?: string;
}

// =============================================================================
// 定数定義
// =============================================================================

/** 初期フォームデータ */
const INITIAL_FORM_DATA: FormData = {
  projectId: '',
  instruction: '',
  priority: 'medium',
  tags: '',
  deadline: '',
};

/** 優先度オプション */
const PRIORITY_OPTIONS = [
  { value: 'low', label: '低', color: 'text-gray-400' },
  { value: 'medium', label: '中', color: 'text-yellow-400' },
  { value: 'high', label: '高', color: 'text-red-400' },
] as const;


// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * MarkdownをHTMLに変換（簡易版）
 * @param markdown - Markdownテキスト
 * @returns HTML文字列
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // コードブロック（```）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    return `<pre class="bg-bg-primary rounded-lg p-4 overflow-x-auto my-4"><code class="text-sm text-text-secondary">${escapeHtml(code.trim())}</code></pre>`;
  });

  // インラインコード（`）
  html = html.replace(/`([^`]+)`/g, '<code class="bg-bg-primary px-1.5 py-0.5 rounded text-sm text-accent-primary">$1</code>');

  // 見出し（H1-H4）
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold text-text-primary mt-4 mb-2">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-text-primary mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-text-primary mt-8 mb-4 pb-2 border-b border-bg-tertiary">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-text-primary mb-6">$1</h1>');

  // リスト（箇条書き）
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 text-text-secondary list-disc">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-3 space-y-1">$&</ul>');

  // 太字
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>');

  // 斜体
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');

  // 段落
  html = html.replace(/\n\n/g, '</p><p class="text-text-secondary my-3">');
  html = `<p class="text-text-secondary my-3">${html}</p>`;

  // 空の段落を削除
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

  return html;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * フォームバリデーション
 */
function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};

  if (!data.projectId) {
    errors.projectId = 'プロジェクトを選択してください';
  }

  if (!data.instruction.trim()) {
    errors.instruction = '指示内容を入力してください';
  } else if (data.instruction.trim().length < 10) {
    errors.instruction = '指示内容は10文字以上で入力してください';
  }

  return errors;
}


// =============================================================================
// カスタムフック
// =============================================================================

/**
 * プロジェクト一覧を取得するカスタムフック
 */
function useProjects(): {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
} {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async (): Promise<void> => {
      try {
        const response = await fetch('/api/projects');
        const result: ApiResponse<Project[]> = await response.json();

        if (!response.ok || result.error) {
          throw new Error(result.error || 'プロジェクトの取得に失敗しました');
        }

        setProjects(result.data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : '不明なエラー';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  return { projects, isLoading, error };
}

// =============================================================================
// サブコンポーネント
// =============================================================================

/**
 * ページヘッダー
 */
function PageHeader(): JSX.Element {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          新規チケット作成
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          エージェントに作業を依頼するチケットを作成します
        </p>
      </div>
      <Link
        href="/tickets"
        className="
          flex items-center gap-2 px-4 py-2
          text-sm font-medium
          bg-bg-secondary hover:bg-bg-tertiary
          text-text-primary
          rounded-md border border-bg-tertiary
          transition-colors duration-200
        "
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        戻る
      </Link>
    </div>
  );
}

/**
 * プロジェクト選択フィールド
 */
interface ProjectSelectProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function ProjectSelect({ projects, value, onChange, error }: ProjectSelectProps): JSX.Element {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-primary">
        プロジェクト <span className="text-red-400">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`
          w-full px-4 py-3
          bg-bg-secondary
          text-text-primary
          border rounded-lg
          focus:outline-none focus:ring-2 focus:ring-accent-primary
          ${error ? 'border-red-500' : 'border-bg-tertiary'}
        `}
      >
        <option value="">プロジェクトを選択...</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} ({project.gitUrl})
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}


/**
 * 指示入力フィールド（Markdown対応）
 */
interface InstructionInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function InstructionInput({ value, onChange, error }: InstructionInputProps): JSX.Element {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-primary">
        指示内容 <span className="text-red-400">*</span>
      </label>
      <p className="text-xs text-text-muted">
        Markdown形式で記述できます。エージェントに実行してほしい作業を具体的に記述してください。
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        placeholder={`例:
# 機能追加: ユーザー認証

## 概要
ログイン機能を実装してください。

## 要件
- メールアドレスとパスワードでログイン
- セッション管理
- ログアウト機能

## 受け入れ条件
- ユニットテストが通ること
- E2Eテストが通ること`}
        className={`
          w-full px-4 py-3
          bg-bg-secondary
          text-text-primary
          border rounded-lg
          font-mono text-sm
          focus:outline-none focus:ring-2 focus:ring-accent-primary
          resize-y min-h-[200px]
          ${error ? 'border-red-500' : 'border-bg-tertiary'}
        `}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-text-muted text-right">
        {value.length} 文字
      </p>
    </div>
  );
}

/**
 * メタデータ入力フィールド
 */
interface MetadataInputProps {
  priority: 'low' | 'medium' | 'high';
  tags: string;
  deadline: string;
  onPriorityChange: (value: 'low' | 'medium' | 'high') => void;
  onTagsChange: (value: string) => void;
  onDeadlineChange: (value: string) => void;
}

function MetadataInput({
  priority,
  tags,
  deadline,
  onPriorityChange,
  onTagsChange,
  onDeadlineChange,
}: MetadataInputProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 優先度 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-primary">
          優先度
        </label>
        <select
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value as 'low' | 'medium' | 'high')}
          className="
            w-full px-4 py-3
            bg-bg-secondary
            text-text-primary
            border border-bg-tertiary rounded-lg
            focus:outline-none focus:ring-2 focus:ring-accent-primary
          "
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* タグ */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-primary">
          タグ
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => onTagsChange(e.target.value)}
          placeholder="feature, bug, refactor..."
          className="
            w-full px-4 py-3
            bg-bg-secondary
            text-text-primary
            border border-bg-tertiary rounded-lg
            focus:outline-none focus:ring-2 focus:ring-accent-primary
          "
        />
        <p className="text-xs text-text-muted">カンマ区切りで複数指定可</p>
      </div>

      {/* 期限 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-primary">
          期限
        </label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => onDeadlineChange(e.target.value)}
          className="
            w-full px-4 py-3
            bg-bg-secondary
            text-text-primary
            border border-bg-tertiary rounded-lg
            focus:outline-none focus:ring-2 focus:ring-accent-primary
          "
        />
      </div>
    </div>
  );
}


/**
 * Markdownプレビュー
 * @requirements 8.4 - Markdownプレビュー表示
 */
interface PreviewPanelProps {
  content: string;
}

function PreviewPanel({ content }: PreviewPanelProps): JSX.Element {
  if (!content.trim()) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-text-muted">
        <p>指示内容を入力するとプレビューが表示されます</p>
      </div>
    );
  }

  return (
    <div
      className="prose prose-invert max-w-none p-4"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
    />
  );
}

/**
 * 送信確認ダイアログ
 */
interface ConfirmDialogProps {
  isOpen: boolean;
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ isOpen, projectName, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />

      {/* ダイアログ */}
      <div className="relative bg-bg-secondary rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          チケット作成の確認
        </h3>
        <p className="text-text-secondary mb-6">
          プロジェクト「<span className="text-accent-primary">{projectName}</span>」に
          新しいチケットを作成します。よろしいですか？
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="
              px-4 py-2
              text-sm font-medium
              bg-bg-tertiary hover:bg-bg-primary
              text-text-primary
              rounded-md
              transition-colors duration-200
            "
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="
              px-4 py-2
              text-sm font-medium
              bg-accent-primary hover:bg-accent-primary/90
              text-white
              rounded-md
              transition-colors duration-200
            "
          >
            作成する
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 成功メッセージ
 */
interface SuccessMessageProps {
  ticketId: string;
}

function SuccessMessage({ ticketId }: SuccessMessageProps): JSX.Element {
  return (
    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
      <svg className="w-12 h-12 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        チケットを作成しました
      </h3>
      <p className="text-text-secondary mb-4">
        チケットID: <span className="text-accent-primary font-mono">{ticketId}</span>
      </p>
      <div className="flex justify-center gap-4">
        <Link
          href={`/tickets/${ticketId}`}
          className="
            px-4 py-2
            text-sm font-medium
            bg-accent-primary hover:bg-accent-primary/90
            text-white
            rounded-md
            transition-colors duration-200
          "
        >
          チケットを表示
        </Link>
        <Link
          href="/tickets"
          className="
            px-4 py-2
            text-sm font-medium
            bg-bg-tertiary hover:bg-bg-primary
            text-text-primary
            rounded-md
            transition-colors duration-200
          "
        >
          一覧に戻る
        </Link>
      </div>
    </div>
  );
}


// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * チケット作成ページ
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */
export default function CreateTicketPage(): JSX.Element {
  const router = useRouter();
  const { projects, isLoading: projectsLoading, error: projectsError } = useProjects();

  // フォーム状態
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);

  // UI状態
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // フォーム更新ハンドラ
  const updateFormData = useCallback(<K extends keyof FormData>(
    key: K,
    value: FormData[K]
  ): void => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // エラーをクリア
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }, [errors]);

  // 送信前バリデーション
  const handlePreSubmit = useCallback((): void => {
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      setShowConfirmDialog(true);
    }
  }, [formData]);

  // 送信処理
  const handleSubmit = useCallback(async (): Promise<void> => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: formData.projectId,
          instruction: formData.instruction,
          metadata: {
            priority: formData.priority,
            tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
            deadline: formData.deadline || undefined,
          },
        }),
      });

      const result: ApiResponse<{ id: string }> = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'チケットの作成に失敗しました');
      }

      if (result.data?.id) {
        setCreatedTicketId(result.data.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラー';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData]);

  // 選択中のプロジェクト名を取得
  const selectedProject = projects.find((p) => p.id === formData.projectId);

  // ローディング状態
  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="プロジェクトを読み込み中..." size="lg" />
      </div>
    );
  }

  // プロジェクト取得エラー
  if (projectsError) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <ErrorDisplay
          message="プロジェクトの読み込みに失敗しました"
          details={projectsError}
          onRetry={() => router.refresh()}
        />
      </div>
    );
  }

  // 作成成功
  if (createdTicketId) {
    return (
      <>
        <PageHeader />
        <SuccessMessage ticketId={createdTicketId} />
      </>
    );
  }

  return (
    <>
      <PageHeader />

      {/* 送信エラー */}
      {submitError && (
        <div className="mb-6">
          <ErrorDisplay
            message="チケットの作成に失敗しました"
            details={submitError}
            variant="warning"
          />
        </div>
      )}

      {/* フォーム */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 入力パネル */}
        <div className="bg-bg-secondary rounded-lg p-6 space-y-6">
          <h2 className="text-lg font-semibold text-text-primary border-b border-bg-tertiary pb-3">
            チケット情報
          </h2>

          {/* プロジェクト選択 */}
          <ProjectSelect
            projects={projects}
            value={formData.projectId}
            onChange={(v) => updateFormData('projectId', v)}
            error={errors.projectId}
          />

          {/* 指示入力 */}
          <InstructionInput
            value={formData.instruction}
            onChange={(v) => updateFormData('instruction', v)}
            error={errors.instruction}
          />

          {/* メタデータ */}
          <MetadataInput
            priority={formData.priority}
            tags={formData.tags}
            deadline={formData.deadline}
            onPriorityChange={(v) => updateFormData('priority', v)}
            onTagsChange={(v) => updateFormData('tags', v)}
            onDeadlineChange={(v) => updateFormData('deadline', v)}
          />

          {/* 送信ボタン */}
          <div className="flex justify-end gap-4 pt-4 border-t border-bg-tertiary">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="
                lg:hidden
                px-4 py-2
                text-sm font-medium
                bg-bg-tertiary hover:bg-bg-primary
                text-text-primary
                rounded-md
                transition-colors duration-200
              "
            >
              {showPreview ? '編集に戻る' : 'プレビュー'}
            </button>
            <button
              type="button"
              onClick={handlePreSubmit}
              disabled={isSubmitting}
              className="
                px-6 py-2
                text-sm font-medium
                bg-accent-primary hover:bg-accent-primary/90
                text-white
                rounded-md
                transition-colors duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {isSubmitting ? '作成中...' : 'チケットを作成'}
            </button>
          </div>
        </div>

        {/* プレビューパネル */}
        <div className={`
          bg-bg-secondary rounded-lg p-6
          ${showPreview ? 'block' : 'hidden lg:block'}
        `}>
          <h2 className="text-lg font-semibold text-text-primary border-b border-bg-tertiary pb-3 mb-4">
            プレビュー
          </h2>
          <PreviewPanel content={formData.instruction} />
        </div>
      </div>

      {/* 確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        projectName={selectedProject?.name || ''}
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </>
  );
}
