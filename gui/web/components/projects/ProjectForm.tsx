/**
 * @file ProjectForm コンポーネント
 * @description プロジェクト登録・編集フォーム
 * @requirements 6.1, 6.5, 6.6 - プロジェクト登録フォームとバリデーション
 */

'use client';

import { useState, useCallback, FormEvent } from 'react';

// =============================================================================
// 型定義
// =============================================================================

/**
 * フォームデータ
 */
export interface ProjectFormData {
  /** プロジェクト名 */
  name: string;
  /** GitリポジトリURL */
  gitUrl: string;
  /** PRの作成先ブランチ */
  baseBranch: string;
  /** エージェント作業用ブランチ */
  agentBranch: string;
}

/**
 * バリデーションエラー
 */
interface ValidationErrors {
  name?: string;
  gitUrl?: string;
  baseBranch?: string;
  agentBranch?: string;
}

/**
 * フォームプロパティ
 */
interface ProjectFormProps {
  /** 初期値（編集時） */
  initialData?: Partial<ProjectFormData>;
  /** 送信ハンドラ */
  onSubmit: (data: ProjectFormData) => Promise<void>;
  /** キャンセルハンドラ */
  onCancel: () => void;
  /** 送信中フラグ */
  isSubmitting?: boolean;
  /** 編集モードフラグ */
  isEditMode?: boolean;
}

// =============================================================================
// バリデーション
// =============================================================================

/**
 * Git URLの検証
 * @param url - 検証対象のURL
 * @returns 有効な場合はtrue
 */
function isValidGitUrl(url: string): boolean {
  // HTTPS形式
  const httpsPattern = /^https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
  // SSH形式
  const sshPattern = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
  
  return httpsPattern.test(url) || sshPattern.test(url);
}

/**
 * ブランチ名の検証
 * @param branch - 検証対象のブランチ名
 * @returns 有効な場合はtrue
 */
function isValidBranchName(branch: string): boolean {
  // Gitブランチ名の基本的なルール
  // - 空白を含まない
  // - 連続するドットを含まない
  // - スラッシュで始まらない・終わらない
  // - 特殊文字を含まない
  const pattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  return pattern.test(branch) && !branch.includes('..');
}

/**
 * フォームデータのバリデーション
 * @param data - 検証対象のデータ
 * @returns バリデーションエラー
 */
function validateForm(data: ProjectFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  // プロジェクト名の検証
  if (!data.name.trim()) {
    errors.name = 'プロジェクト名は必須です';
  } else if (data.name.length < 2) {
    errors.name = 'プロジェクト名は2文字以上で入力してください';
  } else if (data.name.length > 50) {
    errors.name = 'プロジェクト名は50文字以内で入力してください';
  }

  // Git URLの検証
  if (!data.gitUrl.trim()) {
    errors.gitUrl = 'Git URLは必須です';
  } else if (!isValidGitUrl(data.gitUrl)) {
    errors.gitUrl = '有効なGit URLを入力してください（HTTPS または SSH形式）';
  }

  // ベースブランチの検証
  if (!data.baseBranch.trim()) {
    errors.baseBranch = 'ベースブランチは必須です';
  } else if (!isValidBranchName(data.baseBranch)) {
    errors.baseBranch = '有効なブランチ名を入力してください';
  }

  // エージェントブランチの検証
  if (!data.agentBranch.trim()) {
    errors.agentBranch = 'エージェントブランチは必須です';
  } else if (!isValidBranchName(data.agentBranch)) {
    errors.agentBranch = '有効なブランチ名を入力してください';
  }

  return errors;
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * プロジェクト登録・編集フォームコンポーネント
 * @requirements 6.1, 6.5, 6.6 - プロジェクト登録フォームとバリデーション
 */
export function ProjectForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isEditMode = false,
}: ProjectFormProps): JSX.Element {
  // フォーム状態
  const [formData, setFormData] = useState<ProjectFormData>({
    name: initialData?.name || '',
    gitUrl: initialData?.gitUrl || '',
    baseBranch: initialData?.baseBranch || 'main',
    agentBranch: initialData?.agentBranch || '',
  });

  // バリデーションエラー
  const [errors, setErrors] = useState<ValidationErrors>({});

  // タッチ状態（フィールドがフォーカスを失ったかどうか）
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  /**
   * フィールド変更ハンドラ
   */
  const handleChange = useCallback((field: keyof ProjectFormData, value: string): void => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    
    // エラーをクリア
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  /**
   * フィールドブラーハンドラ
   */
  const handleBlur = useCallback((field: keyof ProjectFormData): void => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    
    // 個別フィールドのバリデーション
    const fieldErrors = validateForm(formData);
    if (fieldErrors[field]) {
      setErrors((prev) => ({ ...prev, [field]: fieldErrors[field] }));
    }
  }, [formData]);

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = useCallback(async (e: FormEvent): Promise<void> => {
    e.preventDefault();

    // 全フィールドをタッチ済みにする
    setTouched({
      name: true,
      gitUrl: true,
      baseBranch: true,
      agentBranch: true,
    });

    // バリデーション
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    // エラーがあれば送信しない
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // 送信
    await onSubmit(formData);
  }, [formData, onSubmit]);

  /**
   * エージェントブランチの自動生成
   */
  const generateAgentBranch = useCallback((): void => {
    if (formData.name) {
      const sanitizedName = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      handleChange('agentBranch', `agent/${sanitizedName}`);
    }
  }, [formData.name, handleChange]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* プロジェクト名 */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-text-primary mb-2"
        >
          プロジェクト名 <span className="text-status-fail">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          onBlur={() => handleBlur('name')}
          placeholder="例: my-awesome-project"
          className={`
            w-full px-4 py-2
            bg-bg-tertiary border rounded-md
            text-text-primary placeholder-text-muted
            focus:outline-none focus:ring-2 focus:ring-accent-primary
            transition-colors duration-200
            ${touched.name && errors.name
              ? 'border-status-fail focus:ring-status-fail'
              : 'border-bg-tertiary'
            }
          `}
          disabled={isSubmitting}
          aria-invalid={touched.name && !!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {touched.name && errors.name && (
          <p id="name-error" className="mt-1 text-sm text-status-fail">
            {errors.name}
          </p>
        )}
      </div>

      {/* Git URL */}
      <div>
        <label
          htmlFor="gitUrl"
          className="block text-sm font-medium text-text-primary mb-2"
        >
          Git URL <span className="text-status-fail">*</span>
        </label>
        <input
          type="text"
          id="gitUrl"
          name="gitUrl"
          value={formData.gitUrl}
          onChange={(e) => handleChange('gitUrl', e.target.value)}
          onBlur={() => handleBlur('gitUrl')}
          placeholder="例: https://github.com/user/repo.git"
          className={`
            w-full px-4 py-2
            bg-bg-tertiary border rounded-md
            text-text-primary placeholder-text-muted font-mono text-sm
            focus:outline-none focus:ring-2 focus:ring-accent-primary
            transition-colors duration-200
            ${touched.gitUrl && errors.gitUrl
              ? 'border-status-fail focus:ring-status-fail'
              : 'border-bg-tertiary'
            }
          `}
          disabled={isSubmitting || isEditMode}
          aria-invalid={touched.gitUrl && !!errors.gitUrl}
          aria-describedby={errors.gitUrl ? 'gitUrl-error' : 'gitUrl-hint'}
        />
        {touched.gitUrl && errors.gitUrl ? (
          <p id="gitUrl-error" className="mt-1 text-sm text-status-fail">
            {errors.gitUrl}
          </p>
        ) : (
          <p id="gitUrl-hint" className="mt-1 text-xs text-text-muted">
            HTTPS形式（https://...）または SSH形式（git@...）で入力
          </p>
        )}
      </div>

      {/* ブランチ設定 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ベースブランチ */}
        <div>
          <label
            htmlFor="baseBranch"
            className="block text-sm font-medium text-text-primary mb-2"
          >
            ベースブランチ <span className="text-status-fail">*</span>
          </label>
          <input
            type="text"
            id="baseBranch"
            name="baseBranch"
            value={formData.baseBranch}
            onChange={(e) => handleChange('baseBranch', e.target.value)}
            onBlur={() => handleBlur('baseBranch')}
            placeholder="例: main"
            className={`
              w-full px-4 py-2
              bg-bg-tertiary border rounded-md
              text-text-primary placeholder-text-muted font-mono text-sm
              focus:outline-none focus:ring-2 focus:ring-accent-primary
              transition-colors duration-200
              ${touched.baseBranch && errors.baseBranch
                ? 'border-status-fail focus:ring-status-fail'
                : 'border-bg-tertiary'
              }
            `}
            disabled={isSubmitting}
            aria-invalid={touched.baseBranch && !!errors.baseBranch}
            aria-describedby={errors.baseBranch ? 'baseBranch-error' : 'baseBranch-hint'}
          />
          {touched.baseBranch && errors.baseBranch ? (
            <p id="baseBranch-error" className="mt-1 text-sm text-status-fail">
              {errors.baseBranch}
            </p>
          ) : (
            <p id="baseBranch-hint" className="mt-1 text-xs text-text-muted">
              PRの作成先ブランチ
            </p>
          )}
        </div>

        {/* エージェントブランチ */}
        <div>
          <label
            htmlFor="agentBranch"
            className="block text-sm font-medium text-text-primary mb-2"
          >
            エージェントブランチ <span className="text-status-fail">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="agentBranch"
              name="agentBranch"
              value={formData.agentBranch}
              onChange={(e) => handleChange('agentBranch', e.target.value)}
              onBlur={() => handleBlur('agentBranch')}
              placeholder="例: agent/my-project"
              className={`
                flex-1 px-4 py-2
                bg-bg-tertiary border rounded-md
                text-text-primary placeholder-text-muted font-mono text-sm
                focus:outline-none focus:ring-2 focus:ring-accent-primary
                transition-colors duration-200
                ${touched.agentBranch && errors.agentBranch
                  ? 'border-status-fail focus:ring-status-fail'
                  : 'border-bg-tertiary'
                }
              `}
              disabled={isSubmitting}
              aria-invalid={touched.agentBranch && !!errors.agentBranch}
              aria-describedby={errors.agentBranch ? 'agentBranch-error' : 'agentBranch-hint'}
            />
            <button
              type="button"
              onClick={generateAgentBranch}
              disabled={isSubmitting || !formData.name}
              className="
                px-3 py-2
                bg-bg-secondary hover:bg-bg-tertiary
                text-text-secondary text-sm
                rounded-md border border-bg-tertiary
                transition-colors duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
              "
              title="プロジェクト名から自動生成"
            >
              自動生成
            </button>
          </div>
          {touched.agentBranch && errors.agentBranch ? (
            <p id="agentBranch-error" className="mt-1 text-sm text-status-fail">
              {errors.agentBranch}
            </p>
          ) : (
            <p id="agentBranch-hint" className="mt-1 text-xs text-text-muted">
              エージェントの作業用ブランチ
            </p>
          )}
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-bg-tertiary">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
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
          type="submit"
          disabled={isSubmitting}
          className="
            flex items-center gap-2 px-4 py-2
            text-sm font-medium
            bg-accent-primary hover:bg-accent-primary/90
            text-white
            rounded-md
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isSubmitting ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              処理中...
            </>
          ) : (
            <>
              {isEditMode ? '更新' : '作成'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export default ProjectForm;
