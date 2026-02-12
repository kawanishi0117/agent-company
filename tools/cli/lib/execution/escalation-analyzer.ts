/**
 * エスカレーション分析モジュール
 *
 * エスカレーション履歴を蓄積し、パターンを検出する。
 * 同一エージェント × 同一エラータイプの繰り返しを検知し、
 * 根本原因の推定とスキルギャップ検出器との連携を行う。
 *
 * @module execution/escalation-analyzer
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** エスカレーション理由カテゴリ */
export type EscalationCategory =
  | 'quality_gate_failure'
  | 'timeout'
  | 'runtime_error'
  | 'review_rejection'
  | 'resource_limit'
  | 'unknown';

/**
 * エスカレーションレコード
 * @description 1回のエスカレーション記録
 */
export interface EscalationRecord {
  /** エスカレーションID */
  id: string;
  /** エージェントID */
  agentId: string;
  /** タスクID */
  taskId: string;
  /** ワークフローID（オプション） */
  workflowId?: string;
  /** エスカレーション理由カテゴリ */
  category: EscalationCategory;
  /** エラーメッセージ */
  errorMessage: string;
  /** エスカレーション先 */
  escalatedTo: string;
  /** 記録日時（ISO8601形式） */
  timestamp: string;
  /** 解決済みフラグ */
  resolved: boolean;
  /** 解決方法（オプション） */
  resolution?: string;
}

/**
 * エスカレーションパターン
 * @description 検出された繰り返しパターン
 */
export interface EscalationPattern {
  /** パターンID */
  id: string;
  /** 対象エージェントID */
  agentId: string;
  /** エラーカテゴリ */
  category: EscalationCategory;
  /** 発生回数 */
  occurrences: number;
  /** 最初の発生日時 */
  firstOccurrence: string;
  /** 最後の発生日時 */
  lastOccurrence: string;
  /** 推定根本原因 */
  rootCauseSuggestion: string;
  /** 推奨アクション */
  suggestedActions: string[];
}

/**
 * エスカレーション分析結果
 * @description 分析の全体結果
 */
export interface EscalationAnalysisResult {
  /** 総エスカレーション数 */
  totalEscalations: number;
  /** 未解決数 */
  unresolvedCount: number;
  /** 検出されたパターン一覧 */
  patterns: EscalationPattern[];
  /** エージェント別サマリー */
  agentSummary: AgentEscalationSummary[];
  /** 分析日時（ISO8601形式） */
  analyzedAt: string;
}

/**
 * エージェント別エスカレーションサマリー
 */
export interface AgentEscalationSummary {
  /** エージェントID */
  agentId: string;
  /** 総エスカレーション数 */
  totalEscalations: number;
  /** カテゴリ別件数 */
  byCategory: Partial<Record<EscalationCategory, number>>;
  /** 解決率（0-1） */
  resolutionRate: number;
}

// =============================================================================
// 定数
// =============================================================================

/** エスカレーションデータ保存ディレクトリ */
const ESCALATION_DIR = 'runtime/state/escalations';

/** パターン検出の最小発生回数 */
const PATTERN_MIN_OCCURRENCES = 3;

/** 根本原因推定マップ */
const ROOT_CAUSE_MAP: Record<EscalationCategory, string> = {
  quality_gate_failure:
    'エージェントのコード品質スキルが不足している可能性があります',
  timeout:
    'タスクの複雑度がエージェントの処理能力を超えている可能性があります',
  runtime_error:
    'エージェントの実行環境またはツール使用に問題がある可能性があります',
  review_rejection:
    'エージェントの成果物が品質基準を満たしていない可能性があります',
  resource_limit:
    'リソース制限が厳しすぎるか、タスクが大きすぎる可能性があります',
  unknown: '原因不明のエラーが繰り返し発生しています',
};

/** カテゴリ別推奨アクション */
const SUGGESTED_ACTIONS_MAP: Record<EscalationCategory, string[]> = {
  quality_gate_failure: [
    'エージェントのlint/test対応能力を確認',
    '品質ゲートの閾値を見直し',
    'コーディング専門エージェントの採用を検討',
  ],
  timeout: [
    'タスクの分割粒度を細かくする',
    'タイムアウト値の見直し',
    'より高性能なAIモデルの使用を検討',
  ],
  runtime_error: [
    'エージェントの実行環境を確認',
    'ツール設定の見直し',
    'エラーハンドリングの強化',
  ],
  review_rejection: [
    'レビュー基準の明確化',
    'エージェントへのフィードバック強化',
    'レビュー専門エージェントの追加を検討',
  ],
  resource_limit: [
    'リソース制限の緩和を検討',
    'タスクの分割',
    'より効率的なエージェントの採用',
  ],
  unknown: [
    'エラーログの詳細確認',
    'エージェントの再起動',
    '手動介入の検討',
  ],
};

// =============================================================================
// エスカレーション分析器
// =============================================================================

/**
 * エスカレーション分析器
 *
 * エスカレーション履歴を蓄積・分析し、繰り返しパターンを検出する。
 */
export class EscalationAnalyzer {
  private readonly basePath: string;

  /**
   * @param basePath - データ保存ベースパス（デフォルト: runtime/state/escalations）
   */
  constructor(basePath: string = ESCALATION_DIR) {
    this.basePath = basePath;
  }

  /**
   * エスカレーションを記録する
   *
   * @param record - 記録するエスカレーション
   */
  async recordEscalation(record: EscalationRecord): Promise<void> {
    const records = await this.loadAllRecords();
    records.push(record);
    await this.saveAllRecords(records);
  }

  /**
   * エスカレーションを解決済みにする
   *
   * @param escalationId - エスカレーションID
   * @param resolution - 解決方法
   */
  async resolveEscalation(
    escalationId: string,
    resolution: string
  ): Promise<boolean> {
    const records = await this.loadAllRecords();
    const record = records.find((r) => r.id === escalationId);
    if (!record) return false;

    record.resolved = true;
    record.resolution = resolution;
    await this.saveAllRecords(records);
    return true;
  }

  /**
   * エスカレーション分析を実行する
   *
   * @returns 分析結果
   */
  async analyze(): Promise<EscalationAnalysisResult> {
    const records = await this.loadAllRecords();

    const patterns = this.detectPatterns(records);
    const agentSummary = this.computeAgentSummary(records);
    const unresolvedCount = records.filter((r) => !r.resolved).length;

    return {
      totalEscalations: records.length,
      unresolvedCount,
      patterns,
      agentSummary,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * 特定エージェントのエスカレーション履歴を取得する
   *
   * @param agentId - エージェントID
   * @returns エスカレーションレコード配列
   */
  async getAgentEscalations(agentId: string): Promise<EscalationRecord[]> {
    const records = await this.loadAllRecords();
    return records.filter((r) => r.agentId === agentId);
  }

  /**
   * 全レコードを取得する
   *
   * @returns 全エスカレーションレコード
   */
  async getAllRecords(): Promise<EscalationRecord[]> {
    return this.loadAllRecords();
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * 繰り返しパターンを検出する
   */
  private detectPatterns(records: EscalationRecord[]): EscalationPattern[] {
    // エージェント × カテゴリ でグループ化
    const groups = new Map<string, EscalationRecord[]>();
    for (const record of records) {
      const key = `${record.agentId}::${record.category}`;
      const existing = groups.get(key) ?? [];
      existing.push(record);
      groups.set(key, existing);
    }

    const patterns: EscalationPattern[] = [];
    for (const [key, groupRecords] of groups) {
      if (groupRecords.length < PATTERN_MIN_OCCURRENCES) continue;

      const [agentId, category] = key.split('::') as [
        string,
        EscalationCategory,
      ];
      const sorted = groupRecords.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      patterns.push({
        id: `pattern-${agentId}-${category}`,
        agentId,
        category,
        occurrences: groupRecords.length,
        firstOccurrence: sorted[0].timestamp,
        lastOccurrence: sorted[sorted.length - 1].timestamp,
        rootCauseSuggestion: ROOT_CAUSE_MAP[category],
        suggestedActions: SUGGESTED_ACTIONS_MAP[category],
      });
    }

    // 発生回数の多い順にソート
    return patterns.sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * エージェント別サマリーを計算する
   */
  private computeAgentSummary(
    records: EscalationRecord[]
  ): AgentEscalationSummary[] {
    const agentMap = new Map<string, EscalationRecord[]>();
    for (const record of records) {
      const existing = agentMap.get(record.agentId) ?? [];
      existing.push(record);
      agentMap.set(record.agentId, existing);
    }

    const summaries: AgentEscalationSummary[] = [];
    for (const [agentId, agentRecords] of agentMap) {
      const byCategory: Partial<Record<EscalationCategory, number>> = {};
      for (const record of agentRecords) {
        byCategory[record.category] =
          (byCategory[record.category] ?? 0) + 1;
      }

      const resolved = agentRecords.filter((r) => r.resolved).length;
      summaries.push({
        agentId,
        totalEscalations: agentRecords.length,
        byCategory,
        resolutionRate:
          agentRecords.length > 0
            ? Math.round((resolved / agentRecords.length) * 100) / 100
            : 0,
      });
    }

    // エスカレーション数の多い順にソート
    return summaries.sort(
      (a, b) => b.totalEscalations - a.totalEscalations
    );
  }

  /**
   * 全レコードをファイルから読み込む
   */
  private async loadAllRecords(): Promise<EscalationRecord[]> {
    try {
      const filePath = path.join(this.basePath, 'escalations.json');
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as EscalationRecord[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * 全レコードをファイルに保存する
   */
  private async saveAllRecords(records: EscalationRecord[]): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, 'escalations.json');
    await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  /** ファイル未存在エラー判定 */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
