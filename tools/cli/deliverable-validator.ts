/**
 * 成果物バリデータ
 * Definition of Doneに基づいて成果物を検証する
 */

import { readFileSync } from 'fs';

// 判定結果の型
export type Judgment = 'PASS' | 'FAIL' | 'WAIVER';

// 検証結果
export interface DeliverableValidationResult {
  judgment: Judgment;
  missingSections: string[];
  errors: string[];
  warnings: string[];
}

// 必須セクション一覧
export const REQUIRED_SECTIONS = [
  '目的',
  '変更点',
  'テスト結果',
  'E2E結果',
  'ロールバック',
  'リスク',
] as const;

// セクションの別名（柔軟なマッチング用）
const SECTION_ALIASES: Record<string, string[]> = {
  目的: ['目的', 'purpose', 'objective'],
  変更点: ['変更点', 'changes', '変更内容'],
  テスト結果: ['テスト結果', 'test results', 'テスト', 'unit test'],
  E2E結果: ['E2E結果', 'e2e results', 'e2e', 'end-to-end'],
  ロールバック: ['ロールバック', 'rollback', '復旧手順'],
  リスク: ['リスク', 'risk', 'リスク / 未検証', '未検証'],
};

/**
 * Markdownコンテンツからセクションを抽出する
 * @param content Markdownコンテンツ
 * @returns 見つかったセクション名のセット
 */
export function extractSections(content: string): Set<string> {
  const sections = new Set<string>();

  // ## または ### で始まる行をセクションとして認識
  const sectionPattern = /^#{2,3}\s+(.+)$/gm;
  let match;

  while ((match = sectionPattern.exec(content)) !== null) {
    const sectionTitle = match[1].trim().toLowerCase();
    sections.add(sectionTitle);
  }

  return sections;
}

/**
 * セクションが存在するかチェックする（別名も考慮）
 * @param foundSections 見つかったセクション
 * @param requiredSection 必須セクション名
 * @returns 存在するかどうか
 */
function hasSection(foundSections: Set<string>, requiredSection: string): boolean {
  const aliases = SECTION_ALIASES[requiredSection] || [requiredSection];

  for (const alias of aliases) {
    if (foundSections.has(alias.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * 成果物レポートを検証する
 * @param content Markdownコンテンツ
 * @returns 検証結果
 */
export function validateDeliverable(content: string): DeliverableValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingSections: string[] = [];

  // 空コンテンツチェック
  if (!content || content.trim().length === 0) {
    return {
      judgment: 'FAIL',
      missingSections: [...REQUIRED_SECTIONS],
      errors: ['成果物が空です'],
      warnings: [],
    };
  }

  // セクション抽出
  const foundSections = extractSections(content);

  // 必須セクションチェック
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(foundSections, section)) {
      missingSections.push(section);
      errors.push(`必須セクション '${section}' がありません`);
    }
  }

  // テスト結果の内容チェック（簡易）
  if (hasSection(foundSections, 'テスト結果')) {
    if (content.toLowerCase().includes('fail') && !content.toLowerCase().includes('pass')) {
      warnings.push('テストが失敗している可能性があります');
    }
  }

  // 判定
  let judgment: Judgment;
  if (missingSections.length === 0 && errors.length === 0) {
    judgment = 'PASS';
  } else {
    judgment = 'FAIL';
  }

  return {
    judgment,
    missingSections,
    errors,
    warnings,
  };
}

/**
 * ファイルから成果物を読み込んで検証する
 * @param filePath ファイルパス
 * @returns 検証結果
 */
export function validateDeliverableFile(filePath: string): DeliverableValidationResult {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return validateDeliverable(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      judgment: 'FAIL',
      missingSections: [],
      errors: [`ファイル読み込みエラー: ${message}`],
      warnings: [],
    };
  }
}

/**
 * 判定結果をフォーマットする
 * @param result 検証結果
 * @returns フォーマットされた文字列
 */
export function formatValidationResult(result: DeliverableValidationResult): string {
  const lines: string[] = [];

  lines.push(`## 品質判定: ${result.judgment}`);
  lines.push('');

  if (result.missingSections.length > 0) {
    lines.push('### 欠落セクション');
    for (const section of result.missingSections) {
      lines.push(`- ${section}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('### エラー');
    for (const error of result.errors) {
      lines.push(`- ❌ ${error}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('### 警告');
    for (const warning of result.warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
    lines.push('');
  }

  if (result.judgment === 'PASS') {
    lines.push('✅ 全ての必須セクションが含まれています。');
  }

  return lines.join('\n');
}
