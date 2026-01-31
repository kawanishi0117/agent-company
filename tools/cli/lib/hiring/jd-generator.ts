/**
 * JD（Job Description）生成モジュール
 *
 * 採用システムにおけるJD生成機能を提供
 * - 役割名からJDを生成
 * - JDをMarkdown形式に変換
 * - JDの必須セクション検証
 *
 * @module hiring/jd-generator
 *
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5
 */

import type { JDGeneratorOptions, GeneratedJD, ValidationResult } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトの予算設定
 * @description 役割が指定されていない場合のデフォルト値
 */
const DEFAULT_BUDGET = {
  tokens: 30000,
  timeMinutes: 30,
} as const;

/**
 * 役割別のデフォルト設定
 * @description 一般的な役割に対するプリセット
 */
const ROLE_PRESETS: Record<
  string,
  {
    responsibilities: string[];
    capabilities: string[];
    deliverables: string[];
    qualityGates: string[];
    budget: { tokens: number; timeMinutes: number };
  }
> = {
  developer: {
    responsibilities: [
      'コードの実装と修正',
      'ユニットテストの作成',
      'コードレビューへの対応',
      'ドキュメントの更新',
    ],
    capabilities: [
      'TypeScript/JavaScript開発',
      'テスト駆動開発（TDD）',
      'Git操作',
      'コード品質の維持',
    ],
    deliverables: ['実装コード', 'ユニットテスト', '更新されたドキュメント'],
    qualityGates: ['lint通過', 'テストカバレッジ80%以上', 'コードレビュー承認'],
    budget: { tokens: 40000, timeMinutes: 45 },
  },
  qa_executor: {
    responsibilities: [
      'テスト計画の作成',
      'テストケースの実行',
      'バグレポートの作成',
      '品質メトリクスの収集',
    ],
    capabilities: ['テスト設計', 'E2Eテスト実行', 'バグ分析', 'テストツールの操作'],
    deliverables: ['テスト結果レポート', 'バグレポート', '品質メトリクス'],
    qualityGates: ['テストカバレッジ達成', 'クリティカルバグゼロ', 'レポート完成'],
    budget: { tokens: 35000, timeMinutes: 40 },
  },
  reviewer: {
    responsibilities: [
      'コードレビューの実施',
      'アーキテクチャレビュー',
      'セキュリティチェック',
      'フィードバックの提供',
    ],
    capabilities: [
      'コード品質評価',
      'セキュリティ知識',
      'ベストプラクティスの理解',
      '建設的なフィードバック',
    ],
    deliverables: ['レビューコメント', '改善提案', '承認/却下判定'],
    qualityGates: ['レビュー完了', '全コメント対応確認', '最終承認'],
    budget: { tokens: 25000, timeMinutes: 30 },
  },
};

// =============================================================================
// JD生成関数
// =============================================================================

/**
 * JDを生成する
 *
 * 指定された役割名に基づいてJob Descriptionを生成する。
 * 役割名がプリセットに存在する場合はプリセット値を使用し、
 * 存在しない場合は汎用的なテンプレートを生成する。
 *
 * @param options - JD生成オプション
 * @returns 生成されたJD
 * @throws Error - 役割名が空の場合
 *
 * @example
 * ```typescript
 * const jd = generateJD({
 *   role: 'developer',
 *   outputDir: 'runtime/runs/run-001',
 * });
 * ```
 *
 * Validates: Requirements 2.1, 2.2
 */
export function generateJD(options: JDGeneratorOptions): GeneratedJD {
  const { role, description, outputDir } = options;

  // 役割名のバリデーション
  if (!role || role.trim() === '') {
    throw new Error('InvalidRole: 役割名が空または無効です');
  }

  // 役割名を正規化（小文字、スペースをアンダースコアに）
  const normalizedRole = role.toLowerCase().trim().replace(/\s+/g, '_');

  // プリセットを取得、なければデフォルト値を使用
  const preset = ROLE_PRESETS[normalizedRole];

  // タイトルを生成（役割名を適切にフォーマット）
  const title = formatRoleTitle(role);

  // JDを構築
  const jd: GeneratedJD = {
    title,
    responsibilities:
      preset?.responsibilities ?? generateDefaultResponsibilities(role, description),
    capabilities: preset?.capabilities ?? generateDefaultCapabilities(role),
    deliverables: preset?.deliverables ?? generateDefaultDeliverables(role),
    qualityGates: preset?.qualityGates ?? generateDefaultQualityGates(),
    budget: preset?.budget ?? { ...DEFAULT_BUDGET },
    filePath: `${outputDir}/jd.md`,
  };

  return jd;
}

/**
 * 役割名をタイトル形式にフォーマット
 * @param role - 役割名
 * @returns フォーマットされたタイトル
 */
function formatRoleTitle(role: string): string {
  // アンダースコアやハイフンをスペースに変換し、各単語の先頭を大文字に
  return role
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * デフォルトの責務を生成
 * @param role - 役割名
 * @param description - 追加説明
 * @returns 責務一覧
 */
function generateDefaultResponsibilities(role: string, description?: string): string[] {
  const responsibilities = [
    `${formatRoleTitle(role)}としての主要タスクの遂行`,
    '成果物の品質確保',
    '進捗報告とコミュニケーション',
    'ドキュメントの作成・更新',
  ];

  // 追加説明がある場合は責務に反映
  if (description) {
    responsibilities.unshift(description);
  }

  return responsibilities;
}

/**
 * デフォルトの能力要件を生成
 * @param role - 役割名
 * @returns 能力一覧
 */
function generateDefaultCapabilities(role: string): string[] {
  return [
    `${formatRoleTitle(role)}に関する専門知識`,
    '問題解決能力',
    'コミュニケーション能力',
    '自律的な作業遂行能力',
  ];
}

/**
 * デフォルトの成果物を生成
 * @param _role - 役割名（将来の拡張用）
 * @returns 成果物一覧
 */
function generateDefaultDeliverables(_role: string): string[] {
  return ['完了した作業成果物', '作業ログ・レポート', '更新されたドキュメント'];
}

/**
 * デフォルトの品質ゲートを生成
 * @returns 品質ゲート一覧
 */
function generateDefaultQualityGates(): string[] {
  return ['成果物が要件を満たすこと', '品質基準に準拠すること', 'レビュー承認を得ること'];
}

// =============================================================================
// Markdown変換関数
// =============================================================================

/**
 * JDをMarkdown形式に変換する
 *
 * 生成されたJDを人間が読みやすいMarkdown形式に変換する。
 * エージェントテンプレートスキーマと互換性のある形式で出力する。
 *
 * @param jd - 生成されたJD
 * @returns Markdown文字列
 *
 * @example
 * ```typescript
 * const markdown = formatJDAsMarkdown(jd);
 * fs.writeFileSync('jd.md', markdown);
 * ```
 *
 * Validates: Requirements 2.5
 */
export function formatJDAsMarkdown(jd: GeneratedJD): string {
  const lines: string[] = [];

  // ヘッダー
  lines.push(`# Job Description: ${jd.title}`);
  lines.push('');
  lines.push(`> Generated by Hiring Manager`);
  lines.push('');

  // 責務セクション
  lines.push('## Responsibilities（責務）');
  lines.push('');
  for (const responsibility of jd.responsibilities) {
    lines.push(`- ${responsibility}`);
  }
  lines.push('');

  // 能力セクション
  lines.push('## Capabilities（必要な能力）');
  lines.push('');
  for (const capability of jd.capabilities) {
    lines.push(`- ${capability}`);
  }
  lines.push('');

  // 成果物セクション
  lines.push('## Deliverables（成果物）');
  lines.push('');
  for (const deliverable of jd.deliverables) {
    lines.push(`- ${deliverable}`);
  }
  lines.push('');

  // 品質ゲートセクション
  lines.push('## Quality Gates（品質ゲート）');
  lines.push('');
  for (const gate of jd.qualityGates) {
    lines.push(`- ${gate}`);
  }
  lines.push('');

  // 予算セクション
  lines.push('## Budget（予算制約）');
  lines.push('');
  lines.push(`| 項目 | 値 |`);
  lines.push(`|------|-----|`);
  lines.push(`| トークン上限 | ${jd.budget.tokens.toLocaleString()} |`);
  lines.push(`| 時間上限 | ${jd.budget.timeMinutes}分 |`);
  lines.push('');

  // フッター
  lines.push('---');
  lines.push('');
  lines.push('*このJDはエージェントテンプレートスキーマと互換性があります。*');

  return lines.join('\n');
}

// =============================================================================
// バリデーション関数
// =============================================================================

/**
 * JDを検証する
 *
 * 生成されたJDが全ての必須セクションを含んでいるかを検証する。
 * エージェントテンプレートスキーマとの互換性も確認する。
 *
 * @param jd - 検証対象のJD
 * @returns バリデーション結果
 *
 * @example
 * ```typescript
 * const result = validateJD(jd);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 *
 * Validates: Requirements 2.4, 2.5
 */
export function validateJD(jd: GeneratedJD): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必須フィールドの存在チェック
  if (!jd.title || jd.title.trim() === '') {
    errors.push('title: 役割タイトルが必須です');
  }

  // 責務のチェック
  if (!jd.responsibilities || jd.responsibilities.length === 0) {
    errors.push('responsibilities: 責務が1つ以上必要です');
  } else if (jd.responsibilities.some((r) => !r || r.trim() === '')) {
    warnings.push('responsibilities: 空の責務項目があります');
  }

  // 能力のチェック
  if (!jd.capabilities || jd.capabilities.length === 0) {
    errors.push('capabilities: 必要な能力が1つ以上必要です');
  } else if (jd.capabilities.some((c) => !c || c.trim() === '')) {
    warnings.push('capabilities: 空の能力項目があります');
  }

  // 成果物のチェック
  if (!jd.deliverables || jd.deliverables.length === 0) {
    errors.push('deliverables: 成果物が1つ以上必要です');
  } else if (jd.deliverables.some((d) => !d || d.trim() === '')) {
    warnings.push('deliverables: 空の成果物項目があります');
  }

  // 品質ゲートのチェック
  if (!jd.qualityGates || jd.qualityGates.length === 0) {
    errors.push('qualityGates: 品質ゲートが1つ以上必要です');
  } else if (jd.qualityGates.some((g) => !g || g.trim() === '')) {
    warnings.push('qualityGates: 空の品質ゲート項目があります');
  }

  // 予算のチェック
  if (!jd.budget) {
    errors.push('budget: 予算制約が必須です');
  } else {
    if (typeof jd.budget.tokens !== 'number' || jd.budget.tokens <= 0) {
      errors.push('budget.tokens: トークン数は正の数値である必要があります');
    }
    if (typeof jd.budget.timeMinutes !== 'number' || jd.budget.timeMinutes <= 0) {
      errors.push('budget.timeMinutes: 時間は正の数値である必要があります');
    }
  }

  // ファイルパスのチェック（警告レベル）
  if (!jd.filePath || jd.filePath.trim() === '') {
    warnings.push('filePath: 出力ファイルパスが指定されていません');
  }

  // エージェントテンプレートスキーマとの互換性チェック
  // 最低限の項目数チェック
  if (jd.responsibilities && jd.responsibilities.length < 2) {
    warnings.push('responsibilities: エージェントテンプレートでは2つ以上の責務を推奨します');
  }
  if (jd.capabilities && jd.capabilities.length < 2) {
    warnings.push('capabilities: エージェントテンプレートでは2つ以上の能力を推奨します');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
