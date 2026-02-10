/**
 * Ticket Manager - チケット階層管理
 *
 * 3階層のチケット構造（Parent → Child → Grandchild）を管理し、
 * ステータス伝播と永続化を提供する。
 * 一時停止・再開機能を含む。
 *
 * @module execution/ticket-manager
 * @see Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 9.1, 9.4, 9.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ParentTicket,
  ChildTicket,
  GrandchildTicket,
  TicketStatus,
  WorkerType,
  TicketPersistenceData,
  ExecutionPersistenceData,
  WorkerState,
  ConversationHistory,
  VALID_TICKET_STATUSES,
  VALID_WORKER_TYPES,
} from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * チケット保存ディレクトリ
 * @see Requirement 9.1: THE System SHALL persist ticket hierarchy to `runtime/state/tickets/<project-id>.json`
 */
const TICKETS_DIR = 'runtime/state/tickets';

/**
 * 実行状態保存ディレクトリ
 * @see Requirement 9.2: THE System SHALL persist execution state to `runtime/state/runs/<run-id>/state.json`
 */
const RUNS_DIR = 'runtime/state/runs';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 子チケット作成データ
 */
export interface ChildTicketData {
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** 担当ワーカータイプ */
  workerType: WorkerType;
}

/**
 * 孫チケット作成データ
 */
export interface GrandchildTicketData {
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** 受け入れ基準一覧 */
  acceptanceCriteria: string[];
}

/**
 * チケット一時停止・再開結果
 * @description pauseTicket/resumeTicketメソッドの戻り値
 * @see Requirements: 9.4, 9.5
 */
export interface TicketPauseResumeResult {
  /** 操作が成功したか */
  success: boolean;
  /** チケットID */
  ticketId: string;
  /** 実行ID（関連する実行がある場合） */
  runId?: string;
  /** 操作前のステータス */
  previousStatus: TicketStatus;
  /** 操作後のステータス */
  newStatus: TicketStatus;
  /** メッセージ（成功時） */
  message?: string;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 保存されたワーカー状態のID一覧（一時停止時） */
  savedWorkerStates?: string[];
  /** 保存された会話履歴のID一覧（一時停止時） */
  savedConversationHistories?: string[];
  /** 復元されたワーカー状態のID一覧（再開時） */
  restoredWorkerStates?: string[];
  /** 復元された会話履歴のID一覧（再開時） */
  restoredConversationHistories?: string[];
}

/**
 * チケットマネージャーインターフェース
 * @see Requirements: 2.1-2.8, 9.4, 9.5
 */
export interface ITicketManager {
  // 親チケット操作
  createParentTicket(projectId: string, instruction: string): Promise<ParentTicket>;
  getParentTicket(ticketId: string): Promise<ParentTicket | null>;
  listParentTickets(projectId: string): Promise<ParentTicket[]>;

  // 子チケット操作
  createChildTicket(parentId: string, data: ChildTicketData): Promise<ChildTicket>;
  getChildTicket(ticketId: string): Promise<ChildTicket | null>;

  // 孫チケット操作
  createGrandchildTicket(parentId: string, data: GrandchildTicketData): Promise<GrandchildTicket>;
  getGrandchildTicket(ticketId: string): Promise<GrandchildTicket | null>;

  // ステータス管理
  updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void>;
  propagateStatusToParent(ticketId: string): Promise<void>;

  // 一時停止・再開
  pauseTicket(
    ticketId: string,
    runId?: string,
    workerStates?: Record<string, WorkerState>,
    conversationHistories?: Record<string, ConversationHistory>
  ): Promise<TicketPauseResumeResult>;
  resumeTicket(ticketId: string): Promise<TicketPauseResumeResult>;

  // 永続化
  saveTickets(projectId: string): Promise<void>;
  loadTickets(projectId: string): Promise<void>;
}

// =============================================================================
// TicketManager クラス
// =============================================================================

/**
 * TicketManager - チケット階層管理マネージャー
 *
 * 3階層のチケット構造を管理し、ステータス伝播と永続化を提供する。
 * 一時停止・再開機能を含む。
 *
 * @see Requirement 2.1: THE Ticket_Manager SHALL support three-level hierarchy
 * @see Requirement 2.2: Parent ticket ID format: <project-id>-<sequence>
 * @see Requirement 2.3: Child ticket ID format: <parent-id>-<sequence>
 * @see Requirement 2.4: Grandchild ticket ID format: <child-id>-<sequence>
 * @see Requirement 9.4: THE System SHALL support manual pause and resume of ticket execution
 * @see Requirement 9.5: WHEN a ticket is paused, THE System SHALL preserve all worker state and conversation history
 */
export class TicketManager implements ITicketManager {
  /**
   * チケット保存ディレクトリ
   */
  private readonly ticketsDir: string;

  /**
   * 実行状態保存ディレクトリ
   */
  private readonly runsDir: string;

  /**
   * プロジェクトごとの親チケットマップ
   * key: projectId, value: ParentTicket[]
   */
  private ticketsByProject: Map<string, ParentTicket[]> = new Map();

  /**
   * プロジェクトごとのシーケンス番号
   * key: projectId, value: 次のシーケンス番号
   */
  private sequenceByProject: Map<string, number> = new Map();

  /**
   * コンストラクタ
   * @param ticketsDir - チケット保存ディレクトリ（デフォルト: 'runtime/state/tickets'）
   * @param runsDir - 実行状態保存ディレクトリ（デフォルト: 'runtime/state/runs'）
   */
  constructor(ticketsDir: string = TICKETS_DIR, runsDir: string = RUNS_DIR) {
    this.ticketsDir = ticketsDir;
    this.runsDir = runsDir;
  }

  // ===========================================================================
  // 親チケット操作
  // ===========================================================================

  /**
   * 親チケットを作成
   *
   * @param projectId - プロジェクトID
   * @param instruction - 社長からの指示
   * @returns 作成された親チケット
   * @throws TicketManagerError - 指示が空の場合
   *
   * @see Requirement 2.2: WHEN a Parent_Ticket is created, THE Ticket_Manager SHALL assign a unique ticket ID
   * @see Requirement 2.5: THE Parent_Ticket SHALL contain required fields
   */
  async createParentTicket(projectId: string, instruction: string): Promise<ParentTicket> {
    // バリデーション
    if (!projectId || projectId.trim() === '') {
      throw new TicketManagerError('プロジェクトIDは必須です', 'INVALID_PROJECT_ID');
    }
    if (!instruction || instruction.trim() === '') {
      throw new TicketManagerError('指示は必須です', 'INVALID_INSTRUCTION');
    }

    // チケットIDを生成
    const ticketId = this.generateParentTicketId(projectId);
    const now = new Date().toISOString();

    // 親チケットを作成
    const parentTicket: ParentTicket = {
      id: ticketId,
      projectId,
      instruction: instruction.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      childTickets: [],
      metadata: {
        priority: 'medium',
        tags: [],
      },
    };

    // メモリに保存
    const tickets = this.ticketsByProject.get(projectId) ?? [];
    tickets.push(parentTicket);
    this.ticketsByProject.set(projectId, tickets);

    return parentTicket;
  }

  /**
   * 親チケットを取得
   *
   * @param ticketId - チケットID
   * @returns 親チケット（存在しない場合はnull）
   */
  async getParentTicket(ticketId: string): Promise<ParentTicket | null> {
    // チケットIDからプロジェクトIDを抽出
    const projectId = this.extractProjectIdFromTicketId(ticketId);
    if (!projectId) {
      return null;
    }

    const tickets = this.ticketsByProject.get(projectId) ?? [];
    return tickets.find((t) => t.id === ticketId) ?? null;
  }

  /**
   * プロジェクトの親チケット一覧を取得
   *
   * @param projectId - プロジェクトID
   * @returns 親チケット一覧
   */
  async listParentTickets(projectId: string): Promise<ParentTicket[]> {
    return this.ticketsByProject.get(projectId) ?? [];
  }

  // ===========================================================================
  // 子チケット操作
  // ===========================================================================

  /**
   * 子チケットを作成
   *
   * @param parentId - 親チケットID
   * @param data - 子チケットデータ
   * @returns 作成された子チケット
   * @throws TicketManagerError - 親チケットが存在しない場合
   *
   * @see Requirement 2.3: WHEN a Child_Ticket is created, THE Ticket_Manager SHALL assign ID with format <parent-id>-<sequence>
   * @see Requirement 2.6: THE Child_Ticket SHALL contain required fields
   */
  async createChildTicket(parentId: string, data: ChildTicketData): Promise<ChildTicket> {
    // バリデーション
    this.validateChildTicketData(data);

    // 親チケットを取得
    const parentTicket = await this.getParentTicket(parentId);
    if (!parentTicket) {
      throw new TicketManagerError(`親チケット "${parentId}" が存在しません`, 'PARENT_NOT_FOUND');
    }

    // チケットIDを生成
    const sequence = parentTicket.childTickets.length + 1;
    const ticketId = `${parentId}-${String(sequence).padStart(2, '0')}`;
    const now = new Date().toISOString();

    // 子チケットを作成
    const childTicket: ChildTicket = {
      id: ticketId,
      parentId,
      title: data.title.trim(),
      description: data.description.trim(),
      status: 'pending',
      workerType: data.workerType,
      createdAt: now,
      updatedAt: now,
      grandchildTickets: [],
    };

    // 親チケットに追加
    parentTicket.childTickets.push(childTicket);
    parentTicket.updatedAt = now;

    return childTicket;
  }

  /**
   * 子チケットを取得
   *
   * @param ticketId - チケットID
   * @returns 子チケット（存在しない場合はnull）
   */
  async getChildTicket(ticketId: string): Promise<ChildTicket | null> {
    // チケットIDから親チケットIDを抽出
    const parentId = this.extractParentIdFromChildTicketId(ticketId);
    if (!parentId) {
      return null;
    }

    const parentTicket = await this.getParentTicket(parentId);
    if (!parentTicket) {
      return null;
    }

    return parentTicket.childTickets.find((c) => c.id === ticketId) ?? null;
  }

  // ===========================================================================
  // 孫チケット操作
  // ===========================================================================

  /**
   * 孫チケットを作成
   *
   * @param parentId - 子チケットID（親となる）
   * @param data - 孫チケットデータ
   * @returns 作成された孫チケット
   * @throws TicketManagerError - 子チケットが存在しない場合
   *
   * @see Requirement 2.4: WHEN a Grandchild_Ticket is created, THE Ticket_Manager SHALL assign ID with format <child-id>-<sequence>
   * @see Requirement 2.7: THE Grandchild_Ticket SHALL contain required fields
   */
  async createGrandchildTicket(
    parentId: string,
    data: GrandchildTicketData
  ): Promise<GrandchildTicket> {
    // バリデーション
    this.validateGrandchildTicketData(data);

    // 子チケットを取得
    const childTicket = await this.getChildTicket(parentId);
    if (!childTicket) {
      throw new TicketManagerError(`子チケット "${parentId}" が存在しません`, 'CHILD_NOT_FOUND');
    }

    // チケットIDを生成
    const sequence = childTicket.grandchildTickets.length + 1;
    const ticketId = `${parentId}-${String(sequence).padStart(3, '0')}`;
    const now = new Date().toISOString();

    // 孫チケットを作成
    const grandchildTicket: GrandchildTicket = {
      id: ticketId,
      parentId,
      title: data.title.trim(),
      description: data.description.trim(),
      acceptanceCriteria: data.acceptanceCriteria.map((c) => c.trim()),
      status: 'pending',
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };

    // 子チケットに追加
    childTicket.grandchildTickets.push(grandchildTicket);
    childTicket.updatedAt = now;

    // 親チケットの更新日時も更新
    const rootParentId = this.extractParentIdFromChildTicketId(parentId);
    if (rootParentId) {
      const parentTicket = await this.getParentTicket(rootParentId);
      if (parentTicket) {
        parentTicket.updatedAt = now;
      }
    }

    return grandchildTicket;
  }

  /**
   * 孫チケットを取得
   *
   * @param ticketId - チケットID
   * @returns 孫チケット（存在しない場合はnull）
   */
  async getGrandchildTicket(ticketId: string): Promise<GrandchildTicket | null> {
    // チケットIDから子チケットIDを抽出
    const childId = this.extractChildIdFromGrandchildTicketId(ticketId);
    if (!childId) {
      return null;
    }

    const childTicket = await this.getChildTicket(childId);
    if (!childTicket) {
      return null;
    }

    return childTicket.grandchildTickets.find((g) => g.id === ticketId) ?? null;
  }

  // ===========================================================================
  // ステータス管理
  // ===========================================================================

  /**
   * チケットステータスを更新
   *
   * @param ticketId - チケットID
   * @param status - 新しいステータス
   * @throws TicketManagerError - チケットが存在しない場合、無効なステータスの場合
   *
   * @see Requirement 2.8: WHEN a ticket status changes, THE Ticket_Manager SHALL propagate status updates
   */
  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    // ステータスのバリデーション
    if (!VALID_TICKET_STATUSES.includes(status)) {
      throw new TicketManagerError(`無効なステータス "${status}" です`, 'INVALID_STATUS');
    }

    const now = new Date().toISOString();

    // チケットの階層を判定して更新
    const ticketLevel = this.getTicketLevel(ticketId);

    switch (ticketLevel) {
      case 'parent': {
        const ticket = await this.getParentTicket(ticketId);
        if (!ticket) {
          throw new TicketManagerError(`チケット "${ticketId}" が存在しません`, 'TICKET_NOT_FOUND');
        }
        ticket.status = status;
        ticket.updatedAt = now;
        break;
      }
      case 'child': {
        const ticket = await this.getChildTicket(ticketId);
        if (!ticket) {
          throw new TicketManagerError(`チケット "${ticketId}" が存在しません`, 'TICKET_NOT_FOUND');
        }
        ticket.status = status;
        ticket.updatedAt = now;
        break;
      }
      case 'grandchild': {
        const ticket = await this.getGrandchildTicket(ticketId);
        if (!ticket) {
          throw new TicketManagerError(`チケット "${ticketId}" が存在しません`, 'TICKET_NOT_FOUND');
        }
        ticket.status = status;
        ticket.updatedAt = now;
        break;
      }
      default:
        throw new TicketManagerError(
          `チケットID "${ticketId}" の形式が不正です`,
          'INVALID_TICKET_ID'
        );
    }

    // ステータス伝播
    await this.propagateStatusToParent(ticketId);
  }

  /**
   * ステータスを親チケットに伝播
   *
   * @param ticketId - チケットID
   *
   * @see Requirement 2.8: WHEN a ticket status changes, THE Ticket_Manager SHALL propagate status updates to parent tickets
   */
  async propagateStatusToParent(ticketId: string): Promise<void> {
    const ticketLevel = this.getTicketLevel(ticketId);
    const now = new Date().toISOString();

    if (ticketLevel === 'grandchild') {
      // 孫チケット → 子チケットへの伝播
      const childId = this.extractChildIdFromGrandchildTicketId(ticketId);
      if (childId) {
        const childTicket = await this.getChildTicket(childId);
        if (childTicket) {
          const newStatus = this.calculateParentStatus(
            childTicket.grandchildTickets.map((g) => g.status)
          );
          if (newStatus && childTicket.status !== newStatus) {
            childTicket.status = newStatus;
            childTicket.updatedAt = now;
            // さらに親へ伝播
            await this.propagateStatusToParent(childId);
          }
        }
      }
    } else if (ticketLevel === 'child') {
      // 子チケット → 親チケットへの伝播
      const parentId = this.extractParentIdFromChildTicketId(ticketId);
      if (parentId) {
        const parentTicket = await this.getParentTicket(parentId);
        if (parentTicket) {
          const newStatus = this.calculateParentStatus(
            parentTicket.childTickets.map((c) => c.status)
          );
          if (newStatus && parentTicket.status !== newStatus) {
            parentTicket.status = newStatus;
            parentTicket.updatedAt = now;
          }
        }
      }
    }
    // 親チケットの場合は伝播なし
  }

  // ===========================================================================
  // 永続化
  // ===========================================================================

  /**
   * チケットを保存
   *
   * @param projectId - プロジェクトID
   *
   * @see Requirement 9.1: THE System SHALL persist ticket hierarchy to `runtime/state/tickets/<project-id>.json`
   */
  async saveTickets(projectId: string): Promise<void> {
    const tickets = this.ticketsByProject.get(projectId) ?? [];

    const data: TicketPersistenceData = {
      projectId,
      parentTickets: tickets,
      lastUpdated: new Date().toISOString(),
    };

    // ディレクトリを作成
    await fs.mkdir(this.ticketsDir, { recursive: true });

    // ファイルに保存
    const filePath = path.join(this.ticketsDir, `${projectId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * チケットを読み込み
   *
   * @param projectId - プロジェクトID
   *
   * @see Requirement 9.1: THE System SHALL persist ticket hierarchy
   */
  async loadTickets(projectId: string): Promise<void> {
    const filePath = path.join(this.ticketsDir, `${projectId}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as TicketPersistenceData;

      // メモリに読み込み
      this.ticketsByProject.set(projectId, data.parentTickets);

      // シーケンス番号を復元
      const maxSequence = this.calculateMaxSequence(data.parentTickets, projectId);
      this.sequenceByProject.set(projectId, maxSequence + 1);
    } catch (error) {
      // ファイルが存在しない場合は空のデータを設定
      if (this.isFileNotFoundError(error)) {
        this.ticketsByProject.set(projectId, []);
        this.sequenceByProject.set(projectId, 1);
        return;
      }
      throw error;
    }
  }

  // ===========================================================================
  // ユーティリティ（プライベート）
  // ===========================================================================

  /**
   * 親チケットIDを生成
   *
   * @param projectId - プロジェクトID
   * @returns チケットID
   *
   * @see Requirement 2.2: ticket ID format: <project-id>-<sequence>
   */
  private generateParentTicketId(projectId: string): string {
    const sequence = this.sequenceByProject.get(projectId) ?? 1;
    this.sequenceByProject.set(projectId, sequence + 1);
    return `${projectId}-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * チケットIDからプロジェクトIDを抽出
   *
   * @param ticketId - チケットID
   * @returns プロジェクトID（抽出できない場合はnull）
   */
  private extractProjectIdFromTicketId(ticketId: string): string | null {
    // 形式: <project-id>-<sequence>
    // project-idにはハイフンが含まれる可能性があるため、末尾の数字部分を除去
    const match = ticketId.match(/^(.+)-\d{4}$/);
    return match ? match[1] : null;
  }

  /**
   * 子チケットIDから親チケットIDを抽出
   *
   * @param ticketId - 子チケットID
   * @returns 親チケットID（抽出できない場合はnull）
   */
  private extractParentIdFromChildTicketId(ticketId: string): string | null {
    // 形式: <parent-id>-<sequence>（2桁）
    const match = ticketId.match(/^(.+-\d{4})-\d{2}$/);
    return match ? match[1] : null;
  }

  /**
   * 孫チケットIDから子チケットIDを抽出
   *
   * @param ticketId - 孫チケットID
   * @returns 子チケットID（抽出できない場合はnull）
   */
  private extractChildIdFromGrandchildTicketId(ticketId: string): string | null {
    // 形式: <child-id>-<sequence>（3桁）
    const match = ticketId.match(/^(.+-\d{4}-\d{2})-\d{3}$/);
    return match ? match[1] : null;
  }

  /**
   * チケットの階層レベルを判定
   *
   * @param ticketId - チケットID
   * @returns 階層レベル
   */
  private getTicketLevel(ticketId: string): 'parent' | 'child' | 'grandchild' | 'unknown' {
    // 孫チケット: xxx-0001-01-001
    if (/^.+-\d{4}-\d{2}-\d{3}$/.test(ticketId)) {
      return 'grandchild';
    }
    // 子チケット: xxx-0001-01
    if (/^.+-\d{4}-\d{2}$/.test(ticketId)) {
      return 'child';
    }
    // 親チケット: xxx-0001
    if (/^.+-\d{4}$/.test(ticketId)) {
      return 'parent';
    }
    return 'unknown';
  }

  /**
   * 子チケットのステータスから親チケットのステータスを計算
   *
   * @param childStatuses - 子チケットのステータス一覧
   * @returns 計算されたステータス（変更不要の場合はnull）
   */
  private calculateParentStatus(childStatuses: TicketStatus[]): TicketStatus | null {
    if (childStatuses.length === 0) {
      return null;
    }

    // 全て完了 → completed
    if (childStatuses.every((s) => s === 'completed')) {
      return 'completed';
    }

    // 1つでも失敗 → failed
    if (childStatuses.some((s) => s === 'failed')) {
      return 'failed';
    }

    // 1つでも実行中 → in_progress
    if (childStatuses.some((s) => s === 'in_progress' || s === 'review_requested')) {
      return 'in_progress';
    }

    // 1つでも分解中 → decomposing
    if (childStatuses.some((s) => s === 'decomposing')) {
      return 'decomposing';
    }

    return null;
  }

  /**
   * 最大シーケンス番号を計算
   *
   * @param tickets - 親チケット一覧
   * @param projectId - プロジェクトID
   * @returns 最大シーケンス番号
   */
  private calculateMaxSequence(tickets: ParentTicket[], projectId: string): number {
    let maxSequence = 0;
    for (const ticket of tickets) {
      const match = ticket.id.match(new RegExp(`^${projectId}-(\\d{4})$`));
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSequence) {
          maxSequence = seq;
        }
      }
    }
    return maxSequence;
  }

  /**
   * 子チケットデータのバリデーション
   */
  private validateChildTicketData(data: ChildTicketData): void {
    if (!data.title || data.title.trim() === '') {
      throw new TicketManagerError('タイトルは必須です', 'INVALID_TITLE');
    }
    // descriptionは空文字を許可（オプショナル）
    if (!VALID_WORKER_TYPES.includes(data.workerType)) {
      throw new TicketManagerError(
        `無効なワーカータイプ "${data.workerType}" です`,
        'INVALID_WORKER_TYPE'
      );
    }
  }

  /**
   * 孫チケットデータのバリデーション
   */
  private validateGrandchildTicketData(data: GrandchildTicketData): void {
    if (!data.title || data.title.trim() === '') {
      throw new TicketManagerError('タイトルは必須です', 'INVALID_TITLE');
    }
    // descriptionは空文字を許可（オプショナル）
    if (!Array.isArray(data.acceptanceCriteria)) {
      throw new TicketManagerError(
        '受け入れ基準は配列である必要があります',
        'INVALID_ACCEPTANCE_CRITERIA'
      );
    }
  }

  /**
   * ファイルが存在しないエラーかどうかを判定
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.ticketsByProject.clear();
    this.sequenceByProject.clear();
  }

  /**
   * 全チケットをクリア（テスト用）
   * clearCacheのエイリアス
   */
  clear(): void {
    this.clearCache();
  }

  /**
   * チケットIDからチケットタイプを判定
   *
   * @param ticketId - チケットID
   * @returns チケットタイプ（'parent' | 'child' | 'grandchild' | 'unknown'）
   */
  getTicketType(ticketId: string): 'parent' | 'child' | 'grandchild' | 'unknown' {
    return this.getTicketLevel(ticketId);
  }

  // ===========================================================================
  // 一時停止・再開機能（Task 12.2）
  // @see Requirements: 9.4, 9.5
  // ===========================================================================

  /**
   * チケット実行を一時停止
   *
   * チケットのステータスを更新し、関連するワーカー状態と会話履歴を保存する。
   *
   * @param ticketId - チケットID
   * @param runId - 実行ID（オプション）
   * @param workerStates - 保存するワーカー状態（オプション）
   * @param conversationHistories - 保存する会話履歴（オプション）
   * @returns 一時停止結果
   *
   * @see Requirement 9.4: THE System SHALL support manual pause and resume of ticket execution
   * @see Requirement 9.5: WHEN a ticket is paused, THE System SHALL preserve all worker state and conversation history
   */
  async pauseTicket(
    ticketId: string,
    runId?: string,
    workerStates?: Record<string, WorkerState>,
    conversationHistories?: Record<string, ConversationHistory>
  ): Promise<TicketPauseResumeResult> {
    // チケットを取得
    const ticketLevel = this.getTicketLevel(ticketId);
    let currentStatus: TicketStatus;
    let projectId: string | null = null;

    try {
      switch (ticketLevel) {
        case 'parent': {
          const ticket = await this.getParentTicket(ticketId);
          if (!ticket) {
            return {
              success: false,
              ticketId,
              previousStatus: 'pending',
              newStatus: 'pending',
              error: `チケット "${ticketId}" が存在しません`,
            };
          }
          currentStatus = ticket.status;
          projectId = ticket.projectId;
          break;
        }
        case 'child': {
          const ticket = await this.getChildTicket(ticketId);
          if (!ticket) {
            return {
              success: false,
              ticketId,
              previousStatus: 'pending',
              newStatus: 'pending',
              error: `チケット "${ticketId}" が存在しません`,
            };
          }
          currentStatus = ticket.status;
          // 親チケットからプロジェクトIDを取得
          const parentId = this.extractParentIdFromChildTicketId(ticketId);
          if (parentId) {
            const parentTicket = await this.getParentTicket(parentId);
            projectId = parentTicket?.projectId ?? null;
          }
          break;
        }
        case 'grandchild': {
          const ticket = await this.getGrandchildTicket(ticketId);
          if (!ticket) {
            return {
              success: false,
              ticketId,
              previousStatus: 'pending',
              newStatus: 'pending',
              error: `チケット "${ticketId}" が存在しません`,
            };
          }
          currentStatus = ticket.status;
          // 子チケット → 親チケットからプロジェクトIDを取得
          const childId = this.extractChildIdFromGrandchildTicketId(ticketId);
          if (childId) {
            const parentId = this.extractParentIdFromChildTicketId(childId);
            if (parentId) {
              const parentTicket = await this.getParentTicket(parentId);
              projectId = parentTicket?.projectId ?? null;
            }
          }
          break;
        }
        default:
          return {
            success: false,
            ticketId,
            previousStatus: 'pending',
            newStatus: 'pending',
            error: `チケットID "${ticketId}" の形式が不正です`,
          };
      }

      // 完了または失敗の場合は一時停止不可
      if (
        currentStatus === 'completed' ||
        currentStatus === 'failed' ||
        currentStatus === 'pr_created'
      ) {
        return {
          success: false,
          ticketId,
          previousStatus: currentStatus,
          newStatus: currentStatus,
          error: `${currentStatus}状態のチケットは一時停止できません`,
        };
      }

      // 実行状態を保存（runIdが指定されている場合）
      if (runId && (workerStates || conversationHistories)) {
        const executionData: ExecutionPersistenceData = {
          runId,
          ticketId,
          status: 'paused',
          workerStates: workerStates ?? {},
          conversationHistories: conversationHistories ?? {},
          gitBranches: {},
          lastUpdated: new Date().toISOString(),
        };

        // 実行状態を保存
        const execDir = path.join(this.runsDir, runId);
        await fs.mkdir(execDir, { recursive: true });
        const statePath = path.join(execDir, 'state.json');
        await fs.writeFile(statePath, JSON.stringify(executionData, null, 2), 'utf-8');
      }

      // チケットステータスを更新（in_progressに戻す - 一時停止状態を表現）
      // 注: TicketStatusには'paused'がないため、ステータスは変更せず、
      // 実行状態（ExecutionPersistenceData）で一時停止を管理する

      // プロジェクトのチケットを保存
      if (projectId) {
        await this.saveTickets(projectId);
      }

      return {
        success: true,
        ticketId,
        runId,
        previousStatus: currentStatus,
        newStatus: currentStatus, // ステータスは変更しない
        message: 'チケット実行を一時停止しました',
        savedWorkerStates: workerStates ? Object.keys(workerStates) : [],
        savedConversationHistories: conversationHistories ? Object.keys(conversationHistories) : [],
      };
    } catch (error) {
      return {
        success: false,
        ticketId,
        previousStatus: 'pending',
        newStatus: 'pending',
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      };
    }
  }

  /**
   * チケット実行を再開
   *
   * 一時停止中のチケット実行を再開し、保存されたワーカー状態と会話履歴を復元する。
   *
   * @param ticketId - チケットID
   * @returns 再開結果
   *
   * @see Requirement 9.4: THE System SHALL support manual pause and resume of ticket execution
   */
  async resumeTicket(ticketId: string): Promise<TicketPauseResumeResult> {
    // チケットを取得
    const ticketLevel = this.getTicketLevel(ticketId);
    let currentStatus: TicketStatus;

    try {
      switch (ticketLevel) {
        case 'parent': {
          const ticket = await this.getParentTicket(ticketId);
          if (!ticket) {
            return {
              success: false,
              ticketId,
              previousStatus: 'pending',
              newStatus: 'pending',
              error: `チケット "${ticketId}" が存在しません`,
            };
          }
          currentStatus = ticket.status;
          break;
        }
        case 'child': {
          const ticket = await this.getChildTicket(ticketId);
          if (!ticket) {
            return {
              success: false,
              ticketId,
              previousStatus: 'pending',
              newStatus: 'pending',
              error: `チケット "${ticketId}" が存在しません`,
            };
          }
          currentStatus = ticket.status;
          break;
        }
        case 'grandchild': {
          const ticket = await this.getGrandchildTicket(ticketId);
          if (!ticket) {
            return {
              success: false,
              ticketId,
              previousStatus: 'pending',
              newStatus: 'pending',
              error: `チケット "${ticketId}" が存在しません`,
            };
          }
          currentStatus = ticket.status;
          break;
        }
        default:
          return {
            success: false,
            ticketId,
            previousStatus: 'pending',
            newStatus: 'pending',
            error: `チケットID "${ticketId}" の形式が不正です`,
          };
      }

      // 完了または失敗の場合は再開不可
      if (
        currentStatus === 'completed' ||
        currentStatus === 'failed' ||
        currentStatus === 'pr_created'
      ) {
        return {
          success: false,
          ticketId,
          previousStatus: currentStatus,
          newStatus: currentStatus,
          error: `${currentStatus}状態のチケットは再開できません`,
        };
      }

      // 関連する実行状態を検索して復元
      let restoredWorkerStates: string[] = [];
      let restoredConversationHistories: string[] = [];
      let foundRunId: string | undefined;

      try {
        const entries = await fs.readdir(this.runsDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const runId = entry.name;
            const statePath = path.join(this.runsDir, runId, 'state.json');

            try {
              const content = await fs.readFile(statePath, 'utf-8');
              const data = JSON.parse(content) as ExecutionPersistenceData;

              if (data.ticketId === ticketId && data.status === 'paused') {
                // 一時停止中の実行を発見
                foundRunId = runId;

                // ステータスを'running'に更新
                data.status = 'running';
                data.lastUpdated = new Date().toISOString();
                await fs.writeFile(statePath, JSON.stringify(data, null, 2), 'utf-8');

                restoredWorkerStates = Object.keys(data.workerStates);
                restoredConversationHistories = Object.keys(data.conversationHistories);
                break;
              }
            } catch {
              // ファイルが存在しない場合は無視
              continue;
            }
          }
        }
      } catch {
        // ディレクトリが存在しない場合は無視
      }

      return {
        success: true,
        ticketId,
        runId: foundRunId,
        previousStatus: currentStatus,
        newStatus: currentStatus, // ステータスは変更しない
        message: foundRunId
          ? 'チケット実行を再開しました（実行状態を復元）'
          : 'チケット実行を再開しました',
        restoredWorkerStates,
        restoredConversationHistories,
      };
    } catch (error) {
      return {
        success: false,
        ticketId,
        previousStatus: 'pending',
        newStatus: 'pending',
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      };
    }
  }

  /**
   * チケットに関連する実行状態を取得
   *
   * @param ticketId - チケットID
   * @returns 実行永続化データ（存在しない場合はnull）
   */
  async getExecutionDataForTicket(ticketId: string): Promise<ExecutionPersistenceData | null> {
    try {
      const entries = await fs.readdir(this.runsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const runId = entry.name;
          const statePath = path.join(this.runsDir, runId, 'state.json');

          try {
            const content = await fs.readFile(statePath, 'utf-8');
            const data = JSON.parse(content) as ExecutionPersistenceData;

            if (data.ticketId === ticketId) {
              return data;
            }
          } catch {
            // ファイルが存在しない場合は無視
            continue;
          }
        }
      }
    } catch {
      // ディレクトリが存在しない場合は無視
    }

    return null;
  }
}

// =============================================================================
// エラークラス
// =============================================================================

/**
 * TicketManagerエラー
 */
export class TicketManagerError extends Error {
  /** エラーコード */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TicketManagerError';
    this.code = code;
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * TicketManagerを作成
 *
 * @param ticketsDir - チケット保存ディレクトリ
 * @returns TicketManagerインスタンス
 */
export function createTicketManager(ticketsDir?: string): TicketManager {
  return new TicketManager(ticketsDir);
}

// =============================================================================
// デフォルトインスタンスのエクスポート
// =============================================================================

/**
 * デフォルトのTicketManagerインスタンス
 */
export const ticketManager = new TicketManager();
