/**
 * 経営会議コーディネーター
 *
 * COO/PM、QA、CFO、Security Officerが参加する経営会議を開催する。
 * KPI、採用提案、エスカレーション、技術的負債から議題を自動生成し、
 * MeetingCoordinatorを使用してAI生成の議論を実施する。
 *
 * @module execution/executive-meeting-coordinator
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** 経営会議の議題 */
export interface ExecutiveAgendaItem {
  /** 議題タイトル */
  title: string;
  /** 議題カテゴリ */
  category: 'kpi' | 'hiring' | 'escalation' | 'tech_debt' | 'strategy';
  /** 議題の詳細 */
  details: string;
  /** 優先度 */
  priority: 'high' | 'medium' | 'low';
}

/** 経営会議結果 */
export interface ExecutiveMeetingResult {
  /** 会議ID */
  meetingId: string;
  /** 開催日時 */
  date: string;
  /** 参加者 */
  participants: string[];
  /** 議題一覧 */
  agenda: ExecutiveAgendaItem[];
  /** 議事録テキスト */
  minutes: string;
  /** 決定事項 */
  decisions: string[];
  /** アクションアイテム */
  actionItems: { title: string; assignee: string; deadline?: string }[];
}

/** MeetingCoordinator互換インターフェース */
export interface IMeetingCoordinatorLike {
  conveneMeeting(
    workflowId: string,
    instruction: string,
    facilitatorId: string
  ): Promise<{ summary: string; decisions: string[] }>;
}

/** データソースインターフェース */
export interface ExecutiveDataSources {
  /** パフォーマンスサマリー取得 */
  getPerformanceSummary?: () => Promise<string>;
  /** 採用提案取得 */
  getHiringProposals?: () => Promise<string>;
  /** エスカレーションサマリー取得 */
  getEscalationSummary?: () => Promise<string>;
  /** 技術的負債サマリー取得 */
  getTechDebtSummary?: () => Promise<string>;
}

// =============================================================================
// 定数
// =============================================================================

/** 経営会議記録保存ディレクトリ */
const EXECUTIVE_MEETINGS_DIR = 'runtime/state/executive-meetings';

/** 経営会議の固定参加者 */
const EXECUTIVE_PARTICIPANTS = [
  'coo_pm',
  'quality_authority',
  'cfo',
  'security_officer',
];

// =============================================================================
// ExecutiveMeetingCoordinator
// =============================================================================

/**
 * 経営会議コーディネーター
 *
 * 経営層エージェントが参加する定期会議を開催し、
 * 組織の状況を議論して意思決定を行う。
 */
export class ExecutiveMeetingCoordinator {
  private readonly basePath: string;
  private readonly meetingCoordinator?: IMeetingCoordinatorLike;
  private readonly dataSources: ExecutiveDataSources;

  /**
   * @param options - 設定オプション
   */
  constructor(options?: {
    basePath?: string;
    meetingCoordinator?: IMeetingCoordinatorLike;
    dataSources?: ExecutiveDataSources;
  }) {
    this.basePath = options?.basePath ?? EXECUTIVE_MEETINGS_DIR;
    this.meetingCoordinator = options?.meetingCoordinator;
    this.dataSources = options?.dataSources ?? {};
  }

  /**
   * 経営会議を開催する
   *
   * 各データソースから議題を自動生成し、MeetingCoordinatorで議論を実施する。
   *
   * @returns 経営会議結果
   */
  async conductMeeting(): Promise<ExecutiveMeetingResult> {
    const meetingId = `exec-${Date.now()}`;
    const date = new Date().toISOString();

    // 1. 議題を自動生成
    const agenda = await this.prepareAgenda();

    // 2. MeetingCoordinatorで議論を実施
    let minutes = '';
    let decisions: string[] = [];

    if (this.meetingCoordinator && agenda.length > 0) {
      const instruction = this.buildMeetingInstruction(agenda);
      try {
        const result = await this.meetingCoordinator.conveneMeeting(
          meetingId,
          instruction,
          'coo_pm'
        );
        minutes = result.summary;
        decisions = result.decisions;
      } catch {
        minutes = this.generateFallbackMinutes(agenda);
        decisions = this.generateFallbackDecisions(agenda);
      }
    } else {
      minutes = this.generateFallbackMinutes(agenda);
      decisions = this.generateFallbackDecisions(agenda);
    }

    // 3. アクションアイテムを生成
    const actionItems = this.generateActionItems(agenda, decisions);

    const result: ExecutiveMeetingResult = {
      meetingId,
      date,
      participants: EXECUTIVE_PARTICIPANTS,
      agenda,
      minutes,
      decisions,
      actionItems,
    };

    // 4. 永続化
    await this.saveResult(result);

    return result;
  }

  /**
   * 議題を自動生成する
   *
   * 各データソースから情報を収集し、議題リストを構築する。
   *
   * @returns 議題一覧
   */
  async prepareAgenda(): Promise<ExecutiveAgendaItem[]> {
    const agenda: ExecutiveAgendaItem[] = [];

    // KPIレビュー
    if (this.dataSources.getPerformanceSummary) {
      try {
        const summary = await this.dataSources.getPerformanceSummary();
        if (summary) {
          agenda.push({
            title: 'KPIレビュー',
            category: 'kpi',
            details: summary,
            priority: 'high',
          });
        }
      } catch {
        // データ取得失敗時はスキップ
      }
    }

    // 採用提案レビュー
    if (this.dataSources.getHiringProposals) {
      try {
        const proposals = await this.dataSources.getHiringProposals();
        if (proposals) {
          agenda.push({
            title: '採用提案レビュー',
            category: 'hiring',
            details: proposals,
            priority: 'medium',
          });
        }
      } catch {
        // スキップ
      }
    }

    // エスカレーションパターン
    if (this.dataSources.getEscalationSummary) {
      try {
        const escalations = await this.dataSources.getEscalationSummary();
        if (escalations) {
          agenda.push({
            title: 'エスカレーションパターン分析',
            category: 'escalation',
            details: escalations,
            priority: 'high',
          });
        }
      } catch {
        // スキップ
      }
    }

    // 技術的負債
    if (this.dataSources.getTechDebtSummary) {
      try {
        const techDebt = await this.dataSources.getTechDebtSummary();
        if (techDebt) {
          agenda.push({
            title: '技術的負債レビュー',
            category: 'tech_debt',
            details: techDebt,
            priority: 'medium',
          });
        }
      } catch {
        // スキップ
      }
    }

    // 議題がない場合はデフォルト議題を追加
    if (agenda.length === 0) {
      agenda.push({
        title: '組織状況の全体レビュー',
        category: 'strategy',
        details: '定期的な組織状況の確認と今後の方針について議論する',
        priority: 'medium',
      });
    }

    // 優先度順にソート
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    agenda.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return agenda;
  }

  /**
   * 保存済みの経営会議結果を取得する
   *
   * @param meetingId - 会議ID
   * @returns 会議結果（存在しない場合はnull）
   */
  async getResult(meetingId: string): Promise<ExecutiveMeetingResult | null> {
    try {
      const filePath = path.join(this.basePath, `${meetingId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ExecutiveMeetingResult;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 全経営会議結果を一覧取得する
   *
   * @returns 会議結果配列（新しい順）
   */
  async listResults(): Promise<ExecutiveMeetingResult[]> {
    try {
      const entries = await fs.readdir(this.basePath);
      const results: ExecutiveMeetingResult[] = [];
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const filePath = path.join(this.basePath, entry);
          const content = await fs.readFile(filePath, 'utf-8');
          results.push(JSON.parse(content) as ExecutiveMeetingResult);
        }
      }
      results.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      return results;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * MeetingCoordinator用の会議指示を構築する
   */
  private buildMeetingInstruction(agenda: ExecutiveAgendaItem[]): string {
    const agendaText = agenda
      .map((item, i) => `${i + 1}. [${item.category}] ${item.title}\n   ${item.details}`)
      .join('\n\n');

    return [
      '## 経営会議',
      '',
      '参加者: COO/PM, Quality Authority, CFO, Security Officer',
      '',
      '### 議題',
      agendaText,
      '',
      '各議題について議論し、決定事項とアクションアイテムをまとめてください。',
    ].join('\n');
  }

  /**
   * フォールバック議事録を生成する（AI不使用時）
   */
  private generateFallbackMinutes(agenda: ExecutiveAgendaItem[]): string {
    const lines = [
      `# 経営会議 議事録`,
      `日時: ${new Date().toISOString()}`,
      `参加者: ${EXECUTIVE_PARTICIPANTS.join(', ')}`,
      '',
      '## 議題',
    ];

    for (const item of agenda) {
      lines.push(`### ${item.title} (${item.category})`);
      lines.push(item.details);
      lines.push('');
    }

    lines.push('## 決定事項');
    lines.push('（AI未使用のため自動生成）');

    return lines.join('\n');
  }

  /**
   * フォールバック決定事項を生成する
   */
  private generateFallbackDecisions(agenda: ExecutiveAgendaItem[]): string[] {
    return agenda
      .filter((item) => item.priority === 'high')
      .map((item) => `${item.title}について対応を検討する`);
  }

  /**
   * アクションアイテムを生成する
   */
  private generateActionItems(
    agenda: ExecutiveAgendaItem[],
    _decisions: string[]
  ): { title: string; assignee: string; deadline?: string }[] {
    const items: { title: string; assignee: string; deadline?: string }[] = [];

    // 議題カテゴリに基づいてアサインを決定
    const categoryAssignee: Record<string, string> = {
      kpi: 'coo_pm',
      hiring: 'coo_pm',
      escalation: 'quality_authority',
      tech_debt: 'quality_authority',
      strategy: 'coo_pm',
    };

    for (const item of agenda) {
      if (item.priority === 'high' || item.priority === 'medium') {
        items.push({
          title: `${item.title}のフォローアップ`,
          assignee: categoryAssignee[item.category] ?? 'coo_pm',
        });
      }
    }

    return items;
  }

  /**
   * 会議結果を保存する
   */
  private async saveResult(result: ExecutiveMeetingResult): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${result.meetingId}.json`);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
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
