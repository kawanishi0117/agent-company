/**
 * レトロスペクティブエンジン
 *
 * ワークフロー完了後に振り返り会議を開催し、
 * 良かった点・改善点・アクションアイテムを抽出する。
 * さらに社内ルール提案を自動生成する。
 *
 * @module execution/retrospective-engine
 * @see Requirements: 6.1, 6.2, 6.3, 6.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { MeetingMinutes } from './types.js';

// =============================================================================
// 型定義
// =============================================================================

/** アクションアイテム */
export interface ActionItem {
  /** アクション内容 */
  action: string;
  /** 担当エージェントID */
  assignee: string;
  /** 期限（ISO8601） */
  deadline: string;
  /** 優先度 */
  priority: 'high' | 'medium' | 'low';
}

/** 社内ルール提案 */
export interface InternalRule {
  /** ルールID */
  id: string;
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** カテゴリ */
  category: 'process' | 'quality' | 'communication' | 'technical';
  /** 提案元 */
  source: { type: 'retrospective'; workflowId: string };
  /** ステータス */
  status: 'proposed' | 'approved' | 'rejected';
  /** 作成日時 */
  createdAt: string;
  /** 承認日時 */
  approvedAt?: string;
}

/** レトロスペクティブ結果 */
export interface RetrospectiveResult {
  /** ワークフローID */
  workflowId: string;
  /** 会議議事録 */
  meetingMinutes: MeetingMinutes;
  /** 良かった点 */
  goodPoints: string[];
  /** 改善点 */
  improvementPoints: string[];
  /** アクションアイテム */
  actionItems: ActionItem[];
  /** 提案ルール */
  proposedRules: InternalRule[];
  /** 実施日時 */
  conductedAt: string;
}

/** MeetingCoordinatorインターフェース（依存注入用） */
export interface IMeetingCoordinatorLike {
  conveneMeeting(
    workflowId: string,
    instruction: string,
    facilitatorId: string
  ): Promise<MeetingMinutes>;
}

// =============================================================================
// 定数
// =============================================================================

/** レトロスペクティブ結果保存ディレクトリ */
const RETROSPECTIVE_DIR = 'runtime/state/retrospectives';

/** 社内ルール保存ファイル */
const INTERNAL_RULES_FILE = 'runtime/state/internal-rules/rules.json';

// =============================================================================
// RetrospectiveEngine
// =============================================================================

/**
 * レトロスペクティブエンジン
 *
 * ワークフロー完了後に振り返り会議を開催し、組織学習を促進する。
 *
 * @see Requirements: 6.1, 6.2, 6.3, 6.4
 */
export class RetrospectiveEngine {
  /** データ保存ベースパス */
  private readonly basePath: string;
  /** 社内ルール保存パス */
  private readonly rulesPath: string;
  /** MeetingCoordinator */
  private readonly meetingCoordinator: IMeetingCoordinatorLike | null;

  /**
   * @param options - 設定オプション
   */
  constructor(options?: {
    basePath?: string;
    rulesPath?: string;
    meetingCoordinator?: IMeetingCoordinatorLike;
  }) {
    this.basePath = options?.basePath ?? RETROSPECTIVE_DIR;
    this.rulesPath = options?.rulesPath ?? INTERNAL_RULES_FILE;
    this.meetingCoordinator = options?.meetingCoordinator ?? null;
  }

  /**
   * レトロスペクティブを実施する
   *
   * @param workflowId - ワークフローID
   * @param context - ワークフローのコンテキスト情報
   * @returns レトロスペクティブ結果
   * @see Requirements: 6.1, 6.2
   */
  async conductRetrospective(
    workflowId: string,
    context: {
      instruction: string;
      participants: string[];
      outcome: 'success' | 'partial' | 'failure';
      issues?: string[];
    }
  ): Promise<RetrospectiveResult> {
    // 会議を開催（MeetingCoordinatorがあれば使用）
    let meetingMinutes: MeetingMinutes;
    if (this.meetingCoordinator) {
      const retroInstruction = this.buildRetroInstruction(context);
      meetingMinutes = await this.meetingCoordinator.conveneMeeting(
        workflowId,
        retroInstruction,
        'quality_authority'
      );
    } else {
      // MeetingCoordinatorなしの場合はダミー議事録を生成
      meetingMinutes = this.generateFallbackMinutes(workflowId, context);
    }

    // 議事録から良かった点・改善点を抽出
    const goodPoints = this.extractGoodPoints(meetingMinutes, context);
    const improvementPoints = this.extractImprovementPoints(
      meetingMinutes,
      context
    );

    // アクションアイテムを生成
    const actionItems = this.generateActionItems(
      improvementPoints,
      context.participants
    );

    // 社内ルール提案を生成
    const proposedRules = this.generateRuleProposals(
      workflowId,
      improvementPoints
    );

    const result: RetrospectiveResult = {
      workflowId,
      meetingMinutes,
      goodPoints,
      improvementPoints,
      actionItems,
      proposedRules,
      conductedAt: new Date().toISOString(),
    };

    // 結果を永続化
    await this.saveResult(result);

    // ルール提案を保存
    if (proposedRules.length > 0) {
      await this.saveRuleProposals(proposedRules);
    }

    return result;
  }

  /**
   * レトロスペクティブ結果を取得する
   *
   * @param workflowId - ワークフローID
   * @returns 結果（存在しない場合はnull）
   */
  async getResult(workflowId: string): Promise<RetrospectiveResult | null> {
    try {
      const filePath = path.join(this.basePath, `${workflowId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as RetrospectiveResult;
    } catch (error) {
      if (this.isFileNotFoundError(error)) return null;
      throw error;
    }
  }

  /**
   * 全レトロスペクティブ結果を一覧取得する
   *
   * @returns 結果配列
   */
  async listResults(): Promise<RetrospectiveResult[]> {
    try {
      const entries = await fs.readdir(this.basePath);
      const results: RetrospectiveResult[] = [];
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        const filePath = path.join(this.basePath, entry);
        const content = await fs.readFile(filePath, 'utf-8');
        results.push(JSON.parse(content) as RetrospectiveResult);
      }
      // 新しい順にソート
      return results.sort(
        (a, b) =>
          new Date(b.conductedAt).getTime() -
          new Date(a.conductedAt).getTime()
      );
    } catch (error) {
      if (this.isFileNotFoundError(error)) return [];
      throw error;
    }
  }

  /**
   * 社内ルール一覧を取得する
   *
   * @returns ルール配列
   * @see Requirements: 6.5
   */
  async getRules(): Promise<InternalRule[]> {
    try {
      const content = await fs.readFile(this.rulesPath, 'utf-8');
      return JSON.parse(content) as InternalRule[];
    } catch (error) {
      if (this.isFileNotFoundError(error)) return [];
      throw error;
    }
  }

  /**
   * ルールを承認する
   *
   * @param ruleId - ルールID
   * @see Requirements: 6.5, 6.6
   */
  async approveRule(ruleId: string): Promise<InternalRule | null> {
    const rules = await this.getRules();
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule || rule.status !== 'proposed') return null;

    rule.status = 'approved';
    rule.approvedAt = new Date().toISOString();
    await this.saveAllRules(rules);
    return rule;
  }

  /**
   * ルールを却下する
   *
   * @param ruleId - ルールID
   */
  async rejectRule(ruleId: string): Promise<InternalRule | null> {
    const rules = await this.getRules();
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule || rule.status !== 'proposed') return null;

    rule.status = 'rejected';
    await this.saveAllRules(rules);
    return rule;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /** レトロスペクティブ用の指示文を構築 */
  private buildRetroInstruction(context: {
    instruction: string;
    outcome: string;
    issues?: string[];
  }): string {
    const parts = [
      `レトロスペクティブ: ワークフロー「${context.instruction}」の振り返り`,
      `結果: ${context.outcome}`,
    ];
    if (context.issues && context.issues.length > 0) {
      parts.push(`課題: ${context.issues.join(', ')}`);
    }
    parts.push(
      '議題: 1) 良かった点 2) 改善すべき点 3) 次のアクション'
    );
    return parts.join('\n');
  }

  /** MeetingCoordinatorなしの場合のフォールバック議事録 */
  private generateFallbackMinutes(
    workflowId: string,
    context: { instruction: string; participants: string[] }
  ): MeetingMinutes {
    return {
      meetingId: `retro-${workflowId}-${Date.now()}`,
      workflowId,
      facilitator: 'quality_authority',
      participants: context.participants.map((id) => ({
        agentId: id,
        role: 'participant',
        opinion: '',
      })),
      agenda: [
        {
          id: 'retro-1',
          topic: 'レトロスペクティブ',
          description: context.instruction,
          discussion: [],
          decisions: [],
        },
      ],
      summary: `ワークフロー「${context.instruction}」のレトロスペクティブ`,
      actionItems: [],
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };
  }

  /** 良かった点を抽出 */
  private extractGoodPoints(
    minutes: MeetingMinutes,
    context: { outcome: string }
  ): string[] {
    const points: string[] = [];
    if (context.outcome === 'success') {
      points.push('ワークフローが正常に完了した');
    }
    // 議事録のサマリーから抽出
    if (minutes.summary) {
      points.push(`会議サマリー: ${minutes.summary}`);
    }
    // 参加者の意見から良い点を抽出
    for (const p of minutes.participants) {
      if (p.opinion && p.opinion.length > 0) {
        points.push(`${p.agentId}: ${p.opinion}`);
      }
    }
    return points.length > 0 ? points : ['特記事項なし'];
  }

  /** 改善点を抽出 */
  private extractImprovementPoints(
    _minutes: MeetingMinutes,
    context: { outcome: string; issues?: string[] }
  ): string[] {
    const points: string[] = [];
    if (context.outcome === 'failure') {
      points.push('ワークフローが失敗した - 根本原因の調査が必要');
    }
    if (context.outcome === 'partial') {
      points.push('ワークフローが部分的にしか完了しなかった');
    }
    if (context.issues) {
      for (const issue of context.issues) {
        points.push(issue);
      }
    }
    return points.length > 0 ? points : ['特記事項なし'];
  }

  /** アクションアイテムを生成 */
  private generateActionItems(
    improvementPoints: string[],
    participants: string[]
  ): ActionItem[] {
    if (
      improvementPoints.length === 0 ||
      (improvementPoints.length === 1 &&
        improvementPoints[0] === '特記事項なし')
    ) {
      return [];
    }

    const defaultAssignee = participants[0] ?? 'coo_pm';
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);

    return improvementPoints
      .filter((p) => p !== '特記事項なし')
      .map((point) => ({
        action: `改善: ${point}`,
        assignee: defaultAssignee,
        deadline: deadline.toISOString(),
        priority: point.includes('失敗') ? 'high' as const : 'medium' as const,
      }));
  }

  /** ルール提案を生成 */
  private generateRuleProposals(
    workflowId: string,
    improvementPoints: string[]
  ): InternalRule[] {
    // 改善点がない場合はルール提案なし
    if (
      improvementPoints.length === 0 ||
      (improvementPoints.length === 1 &&
        improvementPoints[0] === '特記事項なし')
    ) {
      return [];
    }

    return improvementPoints
      .filter((p) => p !== '特記事項なし')
      .slice(0, 3) // 最大3件のルール提案
      .map((point, index) => ({
        id: `rule-${workflowId}-${index}-${Date.now()}`,
        title: this.generateRuleTitle(point),
        description: `レトロスペクティブで検出された改善点: ${point}`,
        category: this.categorizeRule(point),
        source: { type: 'retrospective' as const, workflowId },
        status: 'proposed' as const,
        createdAt: new Date().toISOString(),
      }));
  }

  /** ルールタイトルを生成 */
  private generateRuleTitle(point: string): string {
    if (point.includes('失敗')) return 'エラー防止ルール';
    if (point.includes('品質')) return '品質改善ルール';
    if (point.includes('テスト')) return 'テスト強化ルール';
    if (point.includes('レビュー')) return 'レビュープロセス改善';
    return '業務改善ルール';
  }

  /** ルールカテゴリを推定 */
  private categorizeRule(
    point: string
  ): 'process' | 'quality' | 'communication' | 'technical' {
    if (point.includes('テスト') || point.includes('品質'))
      return 'quality';
    if (point.includes('コード') || point.includes('技術'))
      return 'technical';
    if (point.includes('コミュニケーション') || point.includes('連携'))
      return 'communication';
    return 'process';
  }

  /** 結果を永続化 */
  private async saveResult(result: RetrospectiveResult): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${result.workflowId}.json`);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  }

  /** ルール提案を保存 */
  private async saveRuleProposals(rules: InternalRule[]): Promise<void> {
    const existing = await this.getRules();
    const merged = [...existing, ...rules];
    await this.saveAllRules(merged);
  }

  /** 全ルールを保存 */
  private async saveAllRules(rules: InternalRule[]): Promise<void> {
    const dir = path.dirname(this.rulesPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.rulesPath, JSON.stringify(rules, null, 2), 'utf-8');
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
