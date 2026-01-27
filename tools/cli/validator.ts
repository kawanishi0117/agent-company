/**
 * AgentCompany スキーマバリデータ
 * エージェント定義YAMLの検証を行う
 */

import { readFileSync } from 'fs';
import YAML from 'yaml';

// エージェント定義の型
export interface AgentDefinition {
  id: string;
  title: string;
  responsibilities: string[];
  capabilities: string[];
  deliverables: string[];
  quality_gates: string[];
  budget: {
    tokens: number;
    time_minutes: number;
  };
  persona: string;
  escalation: {
    to: string;
    conditions: string[];
  };
}

// バリデーション結果
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// 必須フィールド一覧
const REQUIRED_FIELDS = [
  'id',
  'title',
  'responsibilities',
  'capabilities',
  'deliverables',
  'quality_gates',
  'budget',
  'persona',
  'escalation',
] as const;

// budget の必須フィールド
const REQUIRED_BUDGET_FIELDS = ['tokens', 'time_minutes'] as const;

// escalation の必須フィールド
const REQUIRED_ESCALATION_FIELDS = ['to', 'conditions'] as const;

/**
 * エージェント定義を検証する
 * @param definition 検証対象のオブジェクト
 * @returns バリデーション結果
 */
export function validateAgentDefinition(definition: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (!definition || typeof definition !== 'object') {
    return { valid: false, errors: ['定義がオブジェクトではありません'] };
  }

  const def = definition as Record<string, unknown>;

  // 必須フィールドチェック
  for (const field of REQUIRED_FIELDS) {
    if (!(field in def)) {
      errors.push(`必須フィールド '${field}' がありません`);
    }
  }

  // id の型チェック
  if ('id' in def && typeof def.id !== 'string') {
    errors.push("'id' は文字列である必要があります");
  }

  // title の型チェック
  if ('title' in def && typeof def.title !== 'string') {
    errors.push("'title' は文字列である必要があります");
  }

  // 配列フィールドの型チェック
  const arrayFields = ['responsibilities', 'capabilities', 'deliverables', 'quality_gates'];
  for (const field of arrayFields) {
    if (field in def && !Array.isArray(def[field])) {
      errors.push(`'${field}' は配列である必要があります`);
    }
  }

  // budget の検証
  if ('budget' in def) {
    if (typeof def.budget !== 'object' || def.budget === null) {
      errors.push("'budget' はオブジェクトである必要があります");
    } else {
      const budget = def.budget as Record<string, unknown>;
      for (const field of REQUIRED_BUDGET_FIELDS) {
        if (!(field in budget)) {
          errors.push(`'budget.${field}' がありません`);
        } else if (typeof budget[field] !== 'number') {
          errors.push(`'budget.${field}' は数値である必要があります`);
        }
      }
    }
  }

  // escalation の検証
  if ('escalation' in def) {
    if (typeof def.escalation !== 'object' || def.escalation === null) {
      errors.push("'escalation' はオブジェクトである必要があります");
    } else {
      const escalation = def.escalation as Record<string, unknown>;
      for (const field of REQUIRED_ESCALATION_FIELDS) {
        if (!(field in escalation)) {
          errors.push(`'escalation.${field}' がありません`);
        }
      }
      if ('to' in escalation && typeof escalation.to !== 'string') {
        errors.push("'escalation.to' は文字列である必要があります");
      }
      if ('conditions' in escalation && !Array.isArray(escalation.conditions)) {
        errors.push("'escalation.conditions' は配列である必要があります");
      }
    }
  }

  // persona の型チェック
  if ('persona' in def && typeof def.persona !== 'string') {
    errors.push("'persona' は文字列である必要があります");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * YAMLファイルからエージェント定義を読み込んで検証する
 * @param filePath YAMLファイルのパス
 * @returns バリデーション結果
 */
export function validateAgentFile(filePath: string): ValidationResult {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const definition = YAML.parse(content);
    return validateAgentDefinition(definition);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      errors: [`ファイル読み込みエラー: ${message}`],
    };
  }
}

/**
 * 有効なエージェント定義としてパースする
 * @param definition 検証済みのオブジェクト
 * @returns エージェント定義（検証失敗時はnull）
 */
export function parseAgentDefinition(definition: unknown): AgentDefinition | null {
  const result = validateAgentDefinition(definition);
  if (!result.valid) {
    return null;
  }
  return definition as AgentDefinition;
}
