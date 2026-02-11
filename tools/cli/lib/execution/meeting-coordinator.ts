/**
 * Meeting Coordinator - エージェント間会議調整
 *
 * 提案フェーズでCOO/PMが専門家エージェントを招集し、
 * 議題ごとにラウンド制で意見を収集して合意形成を行う。
 * 会議録（MeetingMinutes）を生成し永続化する。
 *
 * @module execution/meeting-coordinator
 * @see Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 12.1, 12.2, 12.3, 12.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  MeetingParticipant,
  AgendaItem,
  MeetingStatement,
  MeetingDecision,
  ActionItem,
  MeetingMinutes,
  WorkerType,
  AgentId,
  RunId,
} from './types.js';
import { AgentBus } from './agent-bus.js';

// =============================================================================
// 定数定義
// =============================================================================

/** 会議録保存ディレクトリ名 */
const MEETING_MINUTES_DIR = 'meeting-minutes';

/** 会議録保存ベースパス */
const RUNTIME_RUNS_DIR = 'runtime/state/runs';

/** ファシリテーター（COO/PM）のデフォルトエージェントID */
const DEFAULT_FACILITATOR_ID = 'coo_pm';

/**
 * ワーカータイプごとの専門分野マッピング
 * @description 指示内容のキーワードに基づいて参加者を選定するために使用
 */
const WORKER_TYPE_EXPERTISE: Record<WorkerType, string[]> = {
  research: ['調査', '分析', '技術選定', '実現可能性', 'リサーチ', '比較', '検証'],
  design: ['設計', 'アーキテクチャ', 'API', 'データベース', 'スキーマ', '構造'],
  designer: ['UI', 'UX', 'デザイン', '画面', 'レイアウト', 'ユーザー体験'],
  developer: ['実装', '開発', 'コーディング', 'プログラミング', '機能', 'コード'],
  test: ['テスト', '品質', 'QA', '検証', 'バグ', 'カバレッジ'],
  reviewer: ['レビュー', '品質チェック', 'コードレビュー'],
};

// =============================================================================
// エラークラス
// =============================================================================

/**
 * MeetingCoordinator固有のエラー
 */
export class MeetingCoordinatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeetingCoordinatorError';
  }
}

// =============================================================================
// IMeetingCoordinator インターフェース
// =============================================================================

/**
 * 会議調整インターフェース
 * @see Requirements: 2.1-2.8, 12.1-12.4
 */
export interface IMeetingCoordinator {
  /**
   * 会議を開催する
   * @param workflowId - ワークフローID
   * @param instruction - 社長からの指示内容
   * @param facilitatorId - ファシリテーターのエージェントID
   * @returns 会議録
   * @see Requirements: 2.1, 2.2, 2.6, 12.1
   */
  conveneMeeting(
    workflowId: string,
    instruction: string,
    facilitatorId: string
  ): Promise<MeetingMinutes>;

  /**
   * 会議に参加者を追加する
   * @param meetingId - 会議ID
   * @param participant - 追加する参加者
   * @see Requirement 2.2
   */
  addParticipant(meetingId: string, participant: MeetingParticipant): void;

  /**
   * 議題を追加する
   * @param meetingId - 会議ID
   * @param item - 追加する議題
   * @see Requirement 12.1
   */
  addAgendaItem(meetingId: string, item: AgendaItem): void;

  /**
   * 会議録を取得する
   * @param meetingId - 会議ID
   * @returns 会議録、存在しない場合はnull
   */
  getMeetingMinutes(meetingId: string): MeetingMinutes | null;

  /**
   * ワークフローの全会議録を取得する
   * @param workflowId - ワークフローID
   * @returns 会議録の配列
   */
  getMeetingMinutesForWorkflow(workflowId: string): MeetingMinutes[];

  /**
   * 会議録を永続化する
   * @param minutes - 会議録
   * @see Requirement 2.7
   */
  saveMeetingMinutes(minutes: MeetingMinutes): Promise<void>;
}

// =============================================================================
// MeetingCoordinator クラス
// =============================================================================

/**
 * MeetingCoordinator - エージェント間会議調整
 *
 * COO/PMをファシリテーターとして専門家エージェントを招集し、
 * 議題ごとにラウンド制で意見を収集して合意形成を行う。
 *
 * @see Requirement 2.1: WHEN the CEO submits an instruction, THE COO_PM SHALL convene a Meeting
 * @see Requirement 2.2: THE Meeting SHALL include at minimum the COO_PM as facilitator
 * @see Requirement 2.6: THE Meeting SHALL proceed in rounds
 * @see Requirement 2.7: THE Workflow_Engine SHALL record all Meeting exchanges as Meeting_Minutes
 * @see Requirement 2.8: THE Meeting_Minutes SHALL contain meeting ID, agenda, participants, statements, decisions, action items
 * @see Requirement 12.1: THE Meeting SHALL support multiple agenda items
 * @see Requirement 12.2: WHEN a Meeting_Participant provides input, record role, content, timestamp
 * @see Requirement 12.3: THE COO_PM SHALL summarize each agenda item discussion
 * @see Requirement 12.4: THE COO_PM SHALL compile final decisions and action items
 */
export class MeetingCoordinator implements IMeetingCoordinator {
  /** インメモリの会議録ストア（meetingId -> MeetingMinutes） */
  private readonly meetingStore: Map<string, MeetingMinutes> = new Map();

  /** ワークフローIDから会議IDへのマッピング */
  private readonly workflowMeetings: Map<string, string[]> = new Map();

  /** AgentBus インスタンス */
  private readonly agentBus: AgentBus;

  /** 会議録保存ベースパス（テスト時にオーバーライド可能） */
  private readonly basePath: string;

  /**
   * コンストラクタ
   * @param agentBus - エージェント間通信バス
   * @param basePath - 会議録保存ベースパス（デフォルト: 'runtime/state/runs'）
   */
  constructor(agentBus: AgentBus, basePath: string = RUNTIME_RUNS_DIR) {
    this.agentBus = agentBus;
    this.basePath = basePath;
  }

  /**
   * 一意な会議IDを生成する
   * @returns 会議ID（例: 'mtg-1234567890-a1b2c3d4'）
   */
  private generateMeetingId(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `mtg-${timestamp}-${random}`;
  }

  /**
   * 一意な議題IDを生成する
   * @returns 議題ID（例: 'agenda-a1b2c3d4'）
   */
  private generateAgendaId(): string {
    return `agenda-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 指示内容から議題を生成する
   *
   * 指示内容を分析し、技術調査・設計・実装・テスト等の観点から
   * 議論すべき議題を自動生成する。
   *
   * @param instruction - 社長からの指示内容
   * @returns 議題の配列
   * @see Requirement 2.1: COO_PM SHALL convene a Meeting to analyze the instruction
   */
  private generateAgendaFromInstruction(instruction: string): AgendaItem[] {
    const agenda: AgendaItem[] = [];

    // 議題1: 要件の確認と分析（常に含める）
    agenda.push({
      id: this.generateAgendaId(),
      topic: '要件の確認と分析',
      description: `指示内容「${instruction}」の要件を確認し、スコープと制約を明確にする`,
      status: 'pending',
    });

    // 議題2: 技術的な実現可能性（技術関連キーワードがある場合）
    const technicalKeywords = [
      ...WORKER_TYPE_EXPERTISE.research,
      ...WORKER_TYPE_EXPERTISE.developer,
    ];
    const hasTechnicalAspect = technicalKeywords.some((kw) =>
      instruction.includes(kw)
    );
    if (hasTechnicalAspect) {
      agenda.push({
        id: this.generateAgendaId(),
        topic: '技術的実現可能性の評価',
        description: '技術選定、アーキテクチャ、実装上の課題を議論する',
        status: 'pending',
      });
    }

    // 議題3: 設計方針（設計関連キーワードがある場合）
    const designKeywords = [
      ...WORKER_TYPE_EXPERTISE.design,
      ...WORKER_TYPE_EXPERTISE.designer,
    ];
    const hasDesignAspect = designKeywords.some((kw) =>
      instruction.includes(kw)
    );
    if (hasDesignAspect) {
      agenda.push({
        id: this.generateAgendaId(),
        topic: '設計方針の策定',
        description: 'アーキテクチャ設計、UI/UX設計の方針を決定する',
        status: 'pending',
      });
    }

    // 議題4: タスク分解と担当割り当て（常に含める）
    agenda.push({
      id: this.generateAgendaId(),
      topic: 'タスク分解と担当割り当て',
      description: '作業をタスクに分解し、各タスクの担当ワーカータイプを決定する',
      status: 'pending',
    });

    // 議題5: リスク評価と対策（常に含める）
    agenda.push({
      id: this.generateAgendaId(),
      topic: 'リスク評価と対策',
      description: 'プロジェクトのリスクを洗い出し、対策を検討する',
      status: 'pending',
    });

    return agenda;
  }

  /**
   * 指示内容に基づいて適切な参加者を選定する
   *
   * 指示内容のキーワードを分析し、関連する専門分野のワーカーを
   * 会議参加者として選定する。COO/PMは常にファシリテーターとして参加。
   *
   * @param instruction - 社長からの指示内容
   * @param facilitatorId - ファシリテーターのエージェントID
   * @returns 参加者の配列（ファシリテーター含む）
   * @see Requirement 2.2: THE Meeting SHALL include at minimum the COO_PM as facilitator
   * @see Requirement 2.3: WHEN technical investigation is needed, include Research_Worker
   * @see Requirement 2.4: WHEN architecture decisions are needed, include Design_Worker
   * @see Requirement 2.5: WHEN UI/UX decisions are needed, include Designer_Worker
   */
  private selectParticipants(
    instruction: string,
    facilitatorId: string
  ): MeetingParticipant[] {
    const participants: MeetingParticipant[] = [];

    // ファシリテーター（COO/PM）は常に参加
    participants.push({
      agentId: facilitatorId,
      role: 'ファシリテーター（COO/PM）',
      workerType: 'design', // COO/PMは設計寄りの役割
      expertise: ['プロジェクト管理', '要件分析', 'タスク分解', 'リスク管理'],
    });

    // 指示内容のキーワードに基づいて専門家を選定
    const workerTypes: WorkerType[] = [
      'research',
      'design',
      'designer',
      'developer',
      'test',
    ];

    for (const workerType of workerTypes) {
      const keywords = WORKER_TYPE_EXPERTISE[workerType];
      const isRelevant = keywords.some((kw) => instruction.includes(kw));

      if (isRelevant) {
        participants.push(
          this.createParticipantForWorkerType(workerType)
        );
      }
    }

    // 最低1人の専門家が必要（キーワードマッチしない場合はdeveloperを追加）
    if (participants.length <= 1) {
      participants.push(
        this.createParticipantForWorkerType('developer')
      );
    }

    return participants;
  }

  /**
   * ワーカータイプに対応する参加者を生成する
   * @param workerType - ワーカータイプ
   * @returns 会議参加者
   */
  private createParticipantForWorkerType(
    workerType: WorkerType
  ): MeetingParticipant {
    const roleMap: Record<WorkerType, string> = {
      research: 'リサーチャー',
      design: 'アーキテクト',
      designer: 'UI/UXデザイナー',
      developer: 'デベロッパー',
      test: 'テスター',
      reviewer: 'レビュアー',
    };

    return {
      agentId: `${workerType}-agent`,
      role: roleMap[workerType],
      workerType,
      expertise: WORKER_TYPE_EXPERTISE[workerType],
    };
  }

  /**
   * 参加者の意見を生成する（AgentBus経由でシミュレート）
   *
   * 各参加者がAgentBus経由で議題に対する意見を提出する。
   * 実際のAI統合時はここでLLMを呼び出す。
   *
   * @param participant - 発言する参加者
   * @param agendaItem - 対象議題
   * @param instruction - 元の指示内容
   * @param facilitatorId - ファシリテーターID
   * @param runId - 実行ID（AgentBusログ用）
   * @returns 発言内容
   * @see Requirement 12.2: record participant role, statement content, and timestamp
   */
  private async collectParticipantInput(
    participant: MeetingParticipant,
    agendaItem: AgendaItem,
    instruction: string,
    facilitatorId: string,
    runId: RunId
  ): Promise<MeetingStatement> {
    // AgentBus経由でメッセージを送信（意見要求）
    const requestMessage = this.agentBus.createMessage(
      'status_request',
      facilitatorId as AgentId,
      participant.agentId as AgentId,
      {
        type: 'meeting_input_request',
        agendaItemId: agendaItem.id,
        agendaItemTopic: agendaItem.topic,
        instruction,
      }
    );
    await this.agentBus.send(requestMessage, { runId });

    // 参加者の意見を生成（AI統合前はテンプレートベース）
    const content = this.generateParticipantOpinion(
      participant,
      agendaItem,
      instruction
    );

    // AgentBus経由で応答メッセージを送信
    const responseMessage = this.agentBus.createMessage(
      'status_response',
      participant.agentId as AgentId,
      facilitatorId as AgentId,
      {
        type: 'meeting_input_response',
        agendaItemId: agendaItem.id,
        content,
      }
    );
    await this.agentBus.send(responseMessage, { runId });

    return {
      participantId: participant.agentId,
      participantRole: participant.role,
      content,
      agendaItemId: agendaItem.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 参加者の専門分野に基づいた意見を生成する
   *
   * AI統合前のテンプレートベース実装。
   * 将来的にはLLM呼び出しに置き換える。
   *
   * @param participant - 発言する参加者
   * @param agendaItem - 対象議題
   * @param instruction - 元の指示内容
   * @returns 意見テキスト
   */
  private generateParticipantOpinion(
    participant: MeetingParticipant,
    agendaItem: AgendaItem,
    instruction: string
  ): string {
    const topicLower = agendaItem.topic;
    const expertiseStr = participant.expertise.join('、');

    // ワーカータイプに応じた視点で意見を生成
    switch (participant.workerType) {
      case 'research':
        return `[${participant.role}の見解] 「${topicLower}」について、${expertiseStr}の観点から分析します。` +
          `指示「${instruction}」に対して、技術的な実現可能性と既存ソリューションの調査が必要です。`;
      case 'design':
        return `[${participant.role}の見解] 「${topicLower}」について、${expertiseStr}の観点から提案します。` +
          `システム全体のアーキテクチャと拡張性を考慮した設計方針を検討すべきです。`;
      case 'designer':
        return `[${participant.role}の見解] 「${topicLower}」について、${expertiseStr}の観点から提案します。` +
          `ユーザー体験を最優先に、直感的で使いやすいインターフェースを設計すべきです。`;
      case 'developer':
        return `[${participant.role}の見解] 「${topicLower}」について、${expertiseStr}の観点から提案します。` +
          `実装の複雑さとメンテナンス性を考慮し、段階的な開発アプローチを推奨します。`;
      case 'test':
        return `[${participant.role}の見解] 「${topicLower}」について、${expertiseStr}の観点から提案します。` +
          `テスト戦略の早期策定と品質基準の明確化が重要です。`;
      case 'reviewer':
        return `[${participant.role}の見解] 「${topicLower}」について、${expertiseStr}の観点から提案します。` +
          `コード品質とベストプラクティスの遵守を確認する体制が必要です。`;
      default:
        return `[${participant.role}の見解] 「${topicLower}」について意見を述べます。`;
    }
  }

  /**
   * ファシリテーターが議題のまとめを生成する
   *
   * 各参加者の意見を集約し、議題の結論と決定事項をまとめる。
   *
   * @param agendaItem - 対象議題
   * @param statements - この議題に対する全発言
   * @param facilitatorId - ファシリテーターID
   * @param runId - 実行ID（AgentBusログ用）
   * @returns まとめの発言と決定事項
   * @see Requirement 12.3: THE COO_PM SHALL summarize each agenda item discussion
   */
  private async generateFacilitatorSummary(
    agendaItem: AgendaItem,
    statements: MeetingStatement[],
    facilitatorId: string,
    runId: RunId
  ): Promise<{ summary: MeetingStatement; decision: MeetingDecision }> {
    const participantCount = statements.length;
    const summaryContent =
      `[ファシリテーターまとめ] 「${agendaItem.topic}」について${participantCount}名の意見を集約しました。` +
      `各専門家の見解を踏まえ、本議題の方針を決定します。`;

    // AgentBus経由でまとめメッセージを送信
    const summaryMessage = this.agentBus.createMessage(
      'status_response',
      facilitatorId as AgentId,
      facilitatorId as AgentId,
      {
        type: 'meeting_summary',
        agendaItemId: agendaItem.id,
        content: summaryContent,
      }
    );
    await this.agentBus.send(summaryMessage, { runId });

    const summary: MeetingStatement = {
      participantId: facilitatorId,
      participantRole: 'ファシリテーター（COO/PM）',
      content: summaryContent,
      agendaItemId: agendaItem.id,
      timestamp: new Date().toISOString(),
    };

    const decision: MeetingDecision = {
      agendaItemId: agendaItem.id,
      decision: `「${agendaItem.topic}」について合意形成完了`,
      rationale: `${participantCount}名の専門家の意見を総合的に判断`,
    };

    return { summary, decision };
  }

  /**
   * 会議の全決定事項からアクションアイテムを生成する
   *
   * @param decisions - 決定事項の配列
   * @param participants - 参加者の配列
   * @param instruction - 元の指示内容
   * @returns アクションアイテムの配列
   * @see Requirement 12.4: THE COO_PM SHALL compile final decisions and action items
   */
  private generateActionItems(
    decisions: MeetingDecision[],
    participants: MeetingParticipant[],
    _instruction: string
  ): ActionItem[] {
    const actionItems: ActionItem[] = [];

    // ファシリテーター以外の参加者からワーカータイプを取得
    const specialists = participants.filter(
      (p) => !p.role.includes('ファシリテーター')
    );

    // 各決定事項に対してアクションアイテムを生成
    for (const decision of decisions) {
      // 適切な担当者を選定（ラウンドロビン的に割り当て）
      const assigneeIndex = actionItems.length % Math.max(specialists.length, 1);
      const assignee = specialists[assigneeIndex] ?? participants[0];

      actionItems.push({
        description: `${decision.decision}に基づく作業を実施`,
        assignee: assignee.agentId,
        workerType: assignee.workerType,
        priority: 'medium',
      });
    }

    return actionItems;
  }

  /**
   * 会議を開催する
   *
   * COO/PMをファシリテーターとして専門家エージェントを招集し、
   * 議題ごとにラウンド制で意見を収集して合意形成を行う。
   *
   * 処理フロー:
   * 1. 指示内容から議題を生成
   * 2. 指示内容に基づいて参加者を選定
   * 3. 各議題についてラウンド制で全参加者から意見を収集
   * 4. 各議題の議論後にファシリテーターがまとめを記録
   * 5. 最終的な決定事項とアクションアイテムを生成
   * 6. 会議録を生成して永続化
   *
   * @param workflowId - ワークフローID
   * @param instruction - 社長からの指示内容
   * @param facilitatorId - ファシリテーターのエージェントID
   * @returns 会議録
   * @throws {MeetingCoordinatorError} 会議の開催に失敗した場合
   * @see Requirement 2.1: WHEN the CEO submits an instruction, THE COO_PM SHALL convene a Meeting
   * @see Requirement 2.6: THE Meeting SHALL proceed in rounds
   * @see Requirement 12.1: each agenda item SHALL be discussed by all Meeting_Participants
   */
  async conveneMeeting(
    workflowId: string,
    instruction: string,
    facilitatorId: string
  ): Promise<MeetingMinutes> {
    if (!workflowId || !instruction || !facilitatorId) {
      throw new MeetingCoordinatorError(
        '会議の開催にはworkflowId、instruction、facilitatorIdが必要です'
      );
    }

    const meetingId = this.generateMeetingId();
    const startedAt = new Date().toISOString();

    // runIdはworkflowIdを使用（AgentBusログ用）
    const runId = workflowId as RunId;

    try {
      // 1. 議題を生成
      const agenda = this.generateAgendaFromInstruction(instruction);

      // 2. 参加者を選定
      const participants = this.selectParticipants(instruction, facilitatorId);

      // 3. ラウンド制の会議ループ
      const allStatements: MeetingStatement[] = [];
      const allDecisions: MeetingDecision[] = [];

      for (const agendaItem of agenda) {
        // 議題のステータスを「議論中」に更新
        agendaItem.status = 'discussing';

        // ファシリテーターが議題を提示
        const openingStatement: MeetingStatement = {
          participantId: facilitatorId,
          participantRole: 'ファシリテーター（COO/PM）',
          content: `議題「${agendaItem.topic}」について議論を開始します。${agendaItem.description}`,
          agendaItemId: agendaItem.id,
          timestamp: new Date().toISOString(),
        };
        allStatements.push(openingStatement);

        // 各参加者から意見を収集（ファシリテーター以外）
        const agendaStatements: MeetingStatement[] = [];
        for (const participant of participants) {
          // ファシリテーターは意見収集の対象外（まとめ役）
          if (participant.agentId === facilitatorId) {
            continue;
          }

          const statement = await this.collectParticipantInput(
            participant,
            agendaItem,
            instruction,
            facilitatorId,
            runId
          );
          agendaStatements.push(statement);
          allStatements.push(statement);
        }

        // ファシリテーターがまとめを記録
        const { summary, decision } = await this.generateFacilitatorSummary(
          agendaItem,
          agendaStatements,
          facilitatorId,
          runId
        );
        allStatements.push(summary);
        allDecisions.push(decision);

        // 議題のステータスを「結論済み」に更新し、まとめを記録
        agendaItem.status = 'concluded';
        agendaItem.summary = summary.content;
      }

      // 4. アクションアイテムを生成
      const actionItems = this.generateActionItems(
        allDecisions,
        participants,
        instruction
      );

      // 5. 会議録を生成
      const minutes: MeetingMinutes = {
        meetingId,
        workflowId,
        agenda,
        participants,
        statements: allStatements,
        decisions: allDecisions,
        actionItems,
        facilitator: facilitatorId,
        startedAt,
        endedAt: new Date().toISOString(),
      };

      // 6. インメモリストアに保存
      this.meetingStore.set(meetingId, minutes);
      const workflowMeetingIds = this.workflowMeetings.get(workflowId) ?? [];
      workflowMeetingIds.push(meetingId);
      this.workflowMeetings.set(workflowId, workflowMeetingIds);

      // 7. ファイルに永続化
      await this.saveMeetingMinutes(minutes);

      return minutes;
    } catch (error) {
      if (error instanceof MeetingCoordinatorError) {
        throw error;
      }
      throw new MeetingCoordinatorError(
        `会議の開催に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 会議に参加者を追加する
   *
   * 既存の会議に新しい参加者を追加する。
   * 会議が存在しない場合はエラーをスローする。
   *
   * @param meetingId - 会議ID
   * @param participant - 追加する参加者
   * @throws {MeetingCoordinatorError} 会議が存在しない場合
   * @see Requirement 2.2
   */
  addParticipant(meetingId: string, participant: MeetingParticipant): void {
    const minutes = this.meetingStore.get(meetingId);
    if (!minutes) {
      throw new MeetingCoordinatorError(
        `会議が見つかりません: ${meetingId}`
      );
    }

    // 重複チェック
    const exists = minutes.participants.some(
      (p) => p.agentId === participant.agentId
    );
    if (!exists) {
      minutes.participants.push(participant);
    }
  }

  /**
   * 議題を追加する
   *
   * 既存の会議に新しい議題を追加する。
   * 会議が存在しない場合はエラーをスローする。
   *
   * @param meetingId - 会議ID
   * @param item - 追加する議題
   * @throws {MeetingCoordinatorError} 会議が存在しない場合
   * @see Requirement 12.1
   */
  addAgendaItem(meetingId: string, item: AgendaItem): void {
    const minutes = this.meetingStore.get(meetingId);
    if (!minutes) {
      throw new MeetingCoordinatorError(
        `会議が見つかりません: ${meetingId}`
      );
    }
    minutes.agenda.push(item);
  }

  /**
   * 会議録を取得する
   *
   * @param meetingId - 会議ID
   * @returns 会議録、存在しない場合はnull
   */
  getMeetingMinutes(meetingId: string): MeetingMinutes | null {
    return this.meetingStore.get(meetingId) ?? null;
  }

  /**
   * ワークフローの全会議録を取得する
   *
   * @param workflowId - ワークフローID
   * @returns 会議録の配列
   * @see Requirement 12.7: THE Workflow_Engine SHALL support multiple Meetings per workflow
   */
  getMeetingMinutesForWorkflow(workflowId: string): MeetingMinutes[] {
    const meetingIds = this.workflowMeetings.get(workflowId) ?? [];
    const minutes: MeetingMinutes[] = [];

    for (const meetingId of meetingIds) {
      const m = this.meetingStore.get(meetingId);
      if (m) {
        minutes.push(m);
      }
    }

    return minutes;
  }

  /**
   * 会議録を永続化する
   *
   * 会議録をJSON形式でファイルに保存する。
   * 保存先: `runtime/state/runs/<run-id>/meeting-minutes/<meeting-id>.json`
   *
   * @param minutes - 会議録
   * @throws {MeetingCoordinatorError} ファイル保存に失敗した場合
   * @see Requirement 2.7: THE Workflow_Engine SHALL record all Meeting exchanges as Meeting_Minutes and persist them
   */
  async saveMeetingMinutes(minutes: MeetingMinutes): Promise<void> {
    try {
      const meetingDir = this.getMeetingMinutesDir(minutes.workflowId);
      await fs.mkdir(meetingDir, { recursive: true });

      const filePath = path.join(meetingDir, `${minutes.meetingId}.json`);
      const json = JSON.stringify(minutes, null, 2);
      await fs.writeFile(filePath, json, 'utf-8');
    } catch (error) {
      throw new MeetingCoordinatorError(
        `会議録の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 永続化された会議録を読み込む
   *
   * @param workflowId - ワークフローID（runIdとして使用）
   * @param meetingId - 会議ID
   * @returns 会議録、存在しない場合はnull
   */
  async loadMeetingMinutes(
    workflowId: string,
    meetingId: string
  ): Promise<MeetingMinutes | null> {
    try {
      const meetingDir = this.getMeetingMinutesDir(workflowId);
      const filePath = path.join(meetingDir, `${meetingId}.json`);
      const json = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(json) as MeetingMinutes;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw new MeetingCoordinatorError(
        `会議録の読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 会議録保存ディレクトリのパスを取得する
   * @param workflowId - ワークフローID（runIdとして使用）
   * @returns ディレクトリパス
   */
  private getMeetingMinutesDir(workflowId: string): string {
    return path.join(this.basePath, workflowId, MEETING_MINUTES_DIR);
  }

  /**
   * ファイルが見つからないエラーかどうかを判定する
   * @param error - エラーオブジェクト
   * @returns ENOENT エラーの場合 true
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * MeetingCoordinatorインスタンスを生成する
 *
 * @param agentBus - エージェント間通信バス
 * @param basePath - 会議録保存ベースパス（オプション）
 * @returns MeetingCoordinatorインスタンス
 */
export function createMeetingCoordinator(
  agentBus: AgentBus,
  basePath?: string
): MeetingCoordinator {
  return new MeetingCoordinator(agentBus, basePath);
}
