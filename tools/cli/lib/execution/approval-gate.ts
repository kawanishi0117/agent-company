/**
 * Approval Gate - 社長（CEO）承認ゲート
 *
 * 提案フェーズ完了時と納品フェーズで社長の承認を待つゲート機能。
 * Promiseベースの承認待ち機構により、submitDecisionが呼ばれるまで
 * ワーカー実行を一時停止する。
 *
 * 承認決定は `runtime/state/runs/<run-id>/approvals.json` に永続化される。
 *
 * @module execution/approval-gate
 * @see Requirements: 3.1, 3.2, 3.6, 3.7, 6.2
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  ApprovalAction,
  ApprovalDecision,
  PendingApproval,
  WorkflowPhase,
  Proposal,
  Deliverable,
  ApprovalsPersistenceData,
} from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/** 承認履歴ファイル名 */
const APPROVALS_FILE = 'approvals.json';

/** 承認データ保存ベースパス */
const RUNTIME_RUNS_DIR = 'runtime/state/runs';

// =============================================================================
// エラークラス
// =============================================================================

/**
 * ApprovalGate固有のエラー
 */
export class ApprovalGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalGateError';
  }
}

// =============================================================================
// IApprovalGate インターフェース
// =============================================================================

/**
 * 承認ゲートインターフェース
 * @see Requirements: 3.1, 3.2, 3.6, 3.7, 6.2
 */
export interface IApprovalGate {
  /**
   * 承認を要求する（ワーカー実行を一時停止）
   *
   * Promiseを返し、submitDecisionが呼ばれるまでawaitでブロックする。
   * これにより、承認待ち中はワーカー実行が一時停止される。
   *
   * @param workflowId - ワークフローID
   * @param phase - 承認対象フェーズ
   * @param content - 承認対象コンテンツ（提案書または納品物）
   * @returns CEO決定のApprovalDecision
   * @throws {ApprovalGateError} 既に承認待ちの場合
   * @see Requirement 3.1: WHEN proposal phase completes, present Proposal to CEO
   * @see Requirement 3.7: WHILE waiting for CEO input, pause all worker execution
   * @see Requirement 6.2: Present Deliverable to CEO via GUI notification
   */
  requestApproval(
    workflowId: string,
    phase: WorkflowPhase,
    content: Proposal | Deliverable
  ): Promise<ApprovalDecision>;

  /**
   * CEO決定を送信する
   *
   * 対応するrequestApprovalのPromiseをresolveし、
   * 決定を永続化する。
   * サーバー再起動後はresolverが失われるため、
   * 戻り値でresolverの有無を通知する。
   *
   * @param workflowId - ワークフローID
   * @param decision - CEO承認決定
   * @returns resolverが存在したかどうか（false = フォールバック処理が必要）
   * @throws {ApprovalGateError} 永続化に失敗した場合
   * @see Requirement 3.2: Support three CEO actions: approve, request_revision, reject
   * @see Requirement 3.6: Persist CEO decision and feedback to approvals.json
   */
  submitDecision(workflowId: string, decision: ApprovalDecision): Promise<boolean>;

  /**
   * 承認待ちアイテム一覧を取得する
   * @returns 承認待ちアイテムの配列
   */
  getPendingApprovals(): PendingApproval[];

  /**
   * 承認履歴を取得する
   * @param workflowId - ワークフローID
   * @returns 承認決定の配列
   */
  getApprovalHistory(workflowId: string): ApprovalDecision[];

  /**
   * 承認待ち状態かどうかを判定する
   * @param workflowId - ワークフローID
   * @returns 承認待ちの場合true
   */
  isWaitingApproval(workflowId: string): boolean;

  /**
   * サーバー再起動後に承認待ちアイテムをインメモリに復元する
   * @param workflowId - ワークフローID
   * @param phase - 承認待ちフェーズ
   * @param content - 承認対象コンテンツ（提案書または納品物）
   * @see Requirement 13.2
   */
  restorePendingApproval(
    workflowId: string,
    phase: WorkflowPhase,
    content: Proposal | Deliverable
  ): void;
}

// =============================================================================
// 内部型定義
// =============================================================================

/**
 * 承認待ちPromiseのリゾルバ
 * @description requestApprovalで作成されたPromiseのresolve/rejectを保持する
 */
interface PendingResolver {
  /** Promiseをresolveする関数 */
  resolve: (decision: ApprovalDecision) => void;
  /** Promiseをrejectする関数 */
  reject: (error: Error) => void;
}

// =============================================================================
// ApprovalGate クラス
// =============================================================================

/**
 * ApprovalGate - 社長（CEO）承認ゲート
 *
 * Promiseベースの承認待ち機構を提供する。
 * requestApprovalはPromiseを返し、submitDecisionが呼ばれるまでブロックする。
 * これにより、承認待ち中はワーカー実行が自然に一時停止される。
 *
 * @see Requirement 3.1: WHEN proposal phase completes, present Proposal to CEO via GUI notification
 * @see Requirement 3.2: THE Approval_Gate SHALL support three CEO actions: approve, request_revision, reject
 * @see Requirement 3.6: THE Approval_Gate SHALL persist the CEO decision and feedback to approvals.json
 * @see Requirement 3.7: WHILE the Approval_Gate is waiting for CEO input, pause all worker execution
 * @see Requirement 6.2: THE Approval_Gate SHALL present the Deliverable to CEO via GUI notification
 */
export class ApprovalGate implements IApprovalGate {
  /** 承認待ちPromiseリゾルバのマップ（workflowId -> PendingResolver） */
  private readonly pendingResolvers: Map<string, PendingResolver> = new Map();

  /** 承認待ちアイテムのマップ（workflowId -> PendingApproval） */
  private readonly pendingApprovals: Map<string, PendingApproval> = new Map();

  /** 承認履歴のマップ（workflowId -> ApprovalDecision[]） */
  private readonly approvalHistory: Map<string, ApprovalDecision[]> = new Map();

  /** 承認データ保存ベースパス（テスト時にオーバーライド可能） */
  private readonly basePath: string;

  /**
   * コンストラクタ
   * @param basePath - 承認データ保存ベースパス（デフォルト: 'runtime/state/runs'）
   */
  constructor(basePath: string = RUNTIME_RUNS_DIR) {
    this.basePath = basePath;
  }

  /**
   * 承認を要求する（ワーカー実行を一時停止）
   *
   * 新しいPromiseを作成し、そのresolve/rejectをpendingResolversに保存する。
   * submitDecisionが呼ばれるとresolveされ、Promiseが完了する。
   * awaitしている呼び出し元はその間ブロックされるため、
   * ワーカー実行が自然に一時停止される。
   *
   * @param workflowId - ワークフローID
   * @param phase - 承認対象フェーズ
   * @param content - 承認対象コンテンツ（提案書または納品物）
   * @returns CEO決定のApprovalDecision
   * @throws {ApprovalGateError} 既に承認待ちの場合
   * @see Requirement 3.1: present Proposal to CEO
   * @see Requirement 3.7: pause all worker execution
   * @see Requirement 6.2: present Deliverable to CEO
   */
  async requestApproval(
    workflowId: string,
    phase: WorkflowPhase,
    content: Proposal | Deliverable
  ): Promise<ApprovalDecision> {
    // 既に承認待ちの場合はエラー
    if (this.pendingResolvers.has(workflowId)) {
      throw new ApprovalGateError(
        `ワークフロー ${workflowId} は既に承認待ちです`
      );
    }

    // 承認待ちアイテムを登録
    const pendingApproval: PendingApproval = {
      workflowId,
      phase,
      content,
      createdAt: new Date().toISOString(),
    };
    this.pendingApprovals.set(workflowId, pendingApproval);

    // Promiseを作成し、resolve/rejectを保存
    // submitDecisionが呼ばれるまでこのPromiseはpendingのまま
    const decision = await new Promise<ApprovalDecision>((resolve, reject) => {
      this.pendingResolvers.set(workflowId, { resolve, reject });
    });

    return decision;
  }

  /**
   * CEO決定を送信する
   *
   * 対応するrequestApprovalのPromiseをresolveし、
   * 決定を承認履歴に追加して永続化する。
   *
   * サーバー再起動後など、pendingResolversが失われている場合でも
   * ファイルベースで承認履歴を永続化する（フォールバック）。
   *
   * @param workflowId - ワークフローID
   * @param decision - CEO承認決定
   * @returns resolverが存在したかどうか（false = フォールバック処理が必要）
   * @throws {ApprovalGateError} 永続化に失敗した場合
   * @see Requirement 3.2: approve, request_revision, reject
   * @see Requirement 3.6: persist CEO decision and feedback
   */
  async submitDecision(
    workflowId: string,
    decision: ApprovalDecision
  ): Promise<boolean> {
    // 承認履歴に追加（resolver有無に関わらず）
    const history = this.approvalHistory.get(workflowId) ?? [];
    history.push(decision);
    this.approvalHistory.set(workflowId, history);

    // 承認データを永続化
    await this.persistApprovals(workflowId, history);

    // インメモリのresolverが存在する場合はresolve
    const resolver = this.pendingResolvers.get(workflowId);
    if (resolver) {
      this.pendingResolvers.delete(workflowId);
      this.pendingApprovals.delete(workflowId);
      resolver.resolve(decision);
      return true;
    }

    // resolverがない場合（サーバー再起動後など）
    // 承認待ち状態をクリアし、呼び出し元にフォールバック処理を委譲
    this.pendingApprovals.delete(workflowId);
    return false;
  }

  /**
   * 承認待ちアイテム一覧を取得する
   * @returns 承認待ちアイテムの配列
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * 承認履歴を取得する
   * @param workflowId - ワークフローID
   * @returns 承認決定の配列
   */
  getApprovalHistory(workflowId: string): ApprovalDecision[] {
    return this.approvalHistory.get(workflowId) ?? [];
  }

  /**
   * 承認待ち状態かどうかを判定する
   * @param workflowId - ワークフローID
   * @returns 承認待ちの場合true
   */
  isWaitingApproval(workflowId: string): boolean {
    return this.pendingResolvers.has(workflowId);
  }

  /**
   * 承認待ちをキャンセルする（エラー時やワークフロー終了時に使用）
   * @param workflowId - ワークフローID
   * @param reason - キャンセル理由
   */
  cancelApproval(workflowId: string, reason: string): void {
    const resolver = this.pendingResolvers.get(workflowId);
    if (resolver) {
      this.pendingResolvers.delete(workflowId);
      this.pendingApprovals.delete(workflowId);
      resolver.reject(new ApprovalGateError(
        `承認がキャンセルされました: ${reason}`
      ));
    }
  }

  /**
   * 永続化された承認履歴を読み込む
   * @param workflowId - ワークフローID
   * @returns 承認履歴データ、存在しない場合はnull
   * @throws {ApprovalGateError} 読み込みに失敗した場合（ファイル未存在以外）
   */
  async loadApprovals(workflowId: string): Promise<ApprovalsPersistenceData | null> {
    try {
      const filePath = this.getApprovalsFilePath(workflowId);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as ApprovalsPersistenceData;

      // インメモリの履歴も更新
      this.approvalHistory.set(workflowId, [...data.decisions]);

      return data;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw new ApprovalGateError(
        `承認履歴の読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * サーバー再起動後に承認待ちアイテムをインメモリに復元する
   *
   * pendingResolvers は復元しない（submitApprovalDirectly で代替）。
   * pendingApprovals のみ復元し、GUIの getPendingApprovals() が
   * 正しい結果を返せるようにする。
   *
   * @param workflowId - ワークフローID
   * @param phase - 承認待ちフェーズ
   * @param content - 承認対象コンテンツ（提案書または納品物）
   * @see Requirement 13.2: THE Workflow_Engine SHALL restore workflow state on system restart
   */
  restorePendingApproval(
    workflowId: string,
    phase: WorkflowPhase,
    content: Proposal | Deliverable
  ): void {
    // 既に登録済みの場合はスキップ
    if (this.pendingApprovals.has(workflowId)) {
      return;
    }

    const pendingApproval: PendingApproval = {
      workflowId,
      phase,
      content,
      createdAt: new Date().toISOString(),
    };
    this.pendingApprovals.set(workflowId, pendingApproval);
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * 承認データを永続化する
   * @param workflowId - ワークフローID
   * @param decisions - 承認決定の配列
   * @throws {ApprovalGateError} 永続化に失敗した場合
   * @see Requirement 3.6: persist CEO decision and feedback to approvals.json
   */
  private async persistApprovals(
    workflowId: string,
    decisions: ApprovalDecision[]
  ): Promise<void> {
    try {
      const dirPath = path.join(this.basePath, workflowId);
      await fs.mkdir(dirPath, { recursive: true });

      const filePath = this.getApprovalsFilePath(workflowId);
      const data: ApprovalsPersistenceData = {
        workflowId,
        decisions,
      };
      const json = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, json, 'utf-8');
    } catch (error) {
      throw new ApprovalGateError(
        `承認データの永続化に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 承認履歴ファイルのパスを取得する
   * @param workflowId - ワークフローID
   * @returns ファイルパス
   */
  private getApprovalsFilePath(workflowId: string): string {
    return path.join(this.basePath, workflowId, APPROVALS_FILE);
  }

  /**
   * ファイル未存在エラーかどうかを判定する
   * @param error - エラーオブジェクト
   * @returns ファイル未存在エラーの場合true
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
 * ApprovalGateインスタンスを生成するファクトリ関数
 *
 * @param basePath - 承認データ保存ベースパス（デフォルト: 'runtime/state/runs'）
 * @returns ApprovalGateインスタンス
 *
 * @example
 * ```typescript
 * const approvalGate = createApprovalGate();
 *
 * // 承認を要求（ワーカー実行を一時停止）
 * const decision = await approvalGate.requestApproval(
 *   'wf-001',
 *   'approval',
 *   proposal
 * );
 *
 * // 別のコンテキストからCEO決定を送信
 * await approvalGate.submitDecision('wf-001', {
 *   workflowId: 'wf-001',
 *   phase: 'approval',
 *   action: 'approve',
 *   feedback: '問題なし',
 *   decidedAt: new Date().toISOString(),
 * });
 * ```
 */
export function createApprovalGate(basePath?: string): ApprovalGate {
  return new ApprovalGate(basePath);
}
