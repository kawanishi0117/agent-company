/**
 * Waiver検証ロジック
 * Waiverファイルの必須項目を検証する
 */

import * as fs from 'fs';

/**
 * Waiver検証結果の型定義
 */
export interface WaiverValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fields: {
    申請日?: string;
    申請者?: string;
    対象?: string;
    理由?: string;
    緊急性?: string;
    代替策?: string;
    期限?: string;
    フォロータスク?: string[];
    承認者?: string;
    ステータス?: string;
  };
}

/**
 * 必須フィールド一覧
 */
const REQUIRED_FIELDS = ['申請日', '申請者', '対象', '理由', '期限', 'フォロータスク'] as const;

/**
 * 日付形式（YYYY-MM-DD）の正規表現
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Waiverファイルの内容を解析
 * @param content Waiverファイルの内容
 * @returns 解析されたフィールド
 */
export function parseWaiverContent(content: string): WaiverValidationResult['fields'] {
  const fields: WaiverValidationResult['fields'] = {};
  const lines = content.split('\n');

  let currentSection = '';
  let sectionContent: string[] = [];

  for (const line of lines) {
    // セクションヘッダーを検出（## で始まる行）
    if (line.startsWith('## ')) {
      // 前のセクションを保存
      if (currentSection) {
        saveSection(fields, currentSection, sectionContent);
      }
      currentSection = line.replace('## ', '').trim();
      sectionContent = [];
    } else if (currentSection) {
      sectionContent.push(line);
    }
  }

  // 最後のセクションを保存
  if (currentSection) {
    saveSection(fields, currentSection, sectionContent);
  }

  return fields;
}

/**
 * セクション内容をフィールドに保存
 */
function saveSection(
  fields: WaiverValidationResult['fields'],
  section: string,
  content: string[]
): void {
  const trimmedContent = content
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  switch (section) {
    case '申請日':
      fields.申請日 = trimmedContent;
      break;
    case '申請者':
      fields.申請者 = trimmedContent;
      break;
    case '対象':
      fields.対象 = trimmedContent;
      break;
    case '理由':
      fields.理由 = trimmedContent;
      break;
    case '緊急性':
      fields.緊急性 = trimmedContent;
      break;
    case '代替策':
      fields.代替策 = trimmedContent;
      break;
    case '期限':
      fields.期限 = trimmedContent;
      break;
    case 'フォロータスク':
      // チェックボックス項目を抽出
      fields.フォロータスク = content
        .filter((line) => line.trim().startsWith('- ['))
        .map((line) => line.trim());
      break;
    case '承認者':
      fields.承認者 = trimmedContent;
      break;
    case 'ステータス':
      fields.ステータス = trimmedContent;
      break;
  }
}

/**
 * Waiverの内容を検証
 * @param content Waiverファイルの内容
 * @returns 検証結果
 */
export function validateWaiverContent(content: string): WaiverValidationResult {
  const fields = parseWaiverContent(content);
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必須フィールドのチェック
  for (const field of REQUIRED_FIELDS) {
    const value = fields[field as keyof typeof fields];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      errors.push(`必須フィールド「${field}」が欠落しています`);
    }
  }

  // 期限の形式チェック
  if (fields.期限) {
    if (!DATE_PATTERN.test(fields.期限)) {
      errors.push(`期限の形式が不正です（YYYY-MM-DD形式で指定してください）: ${fields.期限}`);
    } else {
      // 期限が過去日付かチェック
      const deadline = new Date(fields.期限);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (deadline < today) {
        warnings.push(`期限が過去の日付です: ${fields.期限}`);
      }
    }
  }

  // 理由が空でないことをチェック
  if (fields.理由 && fields.理由.includes('[なぜ例外が必要か]')) {
    errors.push('理由がテンプレートのままです。具体的な理由を記載してください');
  }

  // フォロータスクが1つ以上あることをチェック
  if (fields.フォロータスク) {
    const validTasks = fields.フォロータスク.filter(
      (task) => !task.includes('[解消のためのタスク')
    );
    if (validTasks.length === 0) {
      errors.push(
        'フォロータスクが1つ以上必要です（テンプレートのままではなく具体的なタスクを記載してください）'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fields,
  };
}

/**
 * Waiverファイルを検証
 * @param filePath Waiverファイルのパス
 * @returns 検証結果
 */
export function validateWaiverFile(filePath: string): WaiverValidationResult {
  // ファイルの存在確認
  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      errors: [`ファイルが見つかりません: ${filePath}`],
      warnings: [],
      fields: {},
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return validateWaiverContent(content);
}

/**
 * Waiverが期限切れかどうかを判定
 * @param deadline 期限（YYYY-MM-DD形式）
 * @returns 期限切れの場合true
 */
export function isOverdue(deadline: string): boolean {
  if (!DATE_PATTERN.test(deadline)) {
    return false;
  }
  const deadlineDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadlineDate < today;
}

/**
 * 検証結果をフォーマットして出力
 * @param result 検証結果
 * @returns フォーマットされた文字列
 */
export function formatValidationResult(result: WaiverValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✅ Waiverは有効です');
  } else {
    lines.push('❌ Waiverにエラーがあります:');
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\n⚠️ 警告:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}
