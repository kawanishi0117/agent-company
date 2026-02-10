# Implementation Plan: Company Workflow Engine

## Overview

会社組織としてのワークフローエンジンを実装する。既存のOrchestrator、ManagerAgent、WorkerAgent等を統合し、提案→承認→開発→品質確認→納品の5フェーズで構成される業務フローを実現する。エージェント間の会議プロセス、社長の承認ゲート、GUI完結操作を含む。

## Tasks

- [ ] 1. 型定義とワークフロー基盤
  - [ ] 1.1 ワークフロー関連の型定義を `tools/cli/lib/execution/types.ts` に追加
    - WorkflowPhase, WorkflowStatus, PhaseTransition, WorkflowState 型を追加
    - WorkflowProgress, SubtaskProgress, QualityResults 型を追加
    - ApprovalAction, ApprovalDecision, PendingApproval 型を追加
    - MeetingParticipant, AgendaItem, MeetingStatement, MeetingDecision, ActionItem, MeetingMinutes 型を追加
    - Proposal, ProposalTask, ProposalWorkerAssignment, RiskItem, Dependency 型を追加
    - Deliverable, WorkflowEscalation, EscalationAction, EscalationDecision 型を追加
    - WorkflowPersistenceData, ProposalPersistenceData, ApprovalsPersistenceData 型を追加
    - _Requirements: 1.1, 1.2, 1.3, 2.8, 2.9, 3.2, 3.6, 6.1, 9.5, 9.7, 13.3, 14.2, 12.2_

  - [ ]* 1.2 Write property test for WorkflowPhase and WorkflowStatus type validation
    - **Property 1: Phase Validity Invariant**
    - **Validates: Requirements 1.1**

- [ ] 2. MeetingCoordinator 実装
  - [ ] 2.1 `tools/cli/lib/execution/meeting-coordinator.ts` を作成
    - IMeetingCoordinator インターフェースを実装
    - conveneMeeting: COO/PMをファシリテーターとして会議を開催、指示内容から議題を生成
    - 各議題について参加者全員から意見を収集するラウンド制の会議ループ
    - 各議題の議論後にファシリテーターがまとめを記録
    - 会議録（MeetingMinutes）の生成と永続化（`runtime/runs/<run-id>/meeting-minutes/<meeting-id>.json`）
    - AgentBus経由でのエージェント間通信
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 12.1, 12.2, 12.3, 12.4_

  - [ ]* 2.2 Write property test for MeetingMinutes structure completeness
    - **Property 7a: Meeting Minutes Structure Completeness**
    - **Validates: Requirements 2.8**

  - [ ]* 2.3 Write property test for meeting discussion coverage
    - **Property 7b: Meeting Discussion Coverage**
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [ ]* 2.4 Write property test for meeting minutes persistence round-trip
    - **Property 7c: Meeting Minutes Persistence Round-Trip**
    - **Validates: Requirements 2.7**

- [ ] 3. ApprovalGate 実装
  - [ ] 3.1 `tools/cli/lib/execution/approval-gate.ts` を作成
    - IApprovalGate インターフェースを実装
    - requestApproval: 承認要求を作成し、ワーカー実行を一時停止
    - submitDecision: CEO決定（approve/request_revision/reject）を処理
    - getPendingApprovals: 承認待ちアイテム一覧
    - getApprovalHistory: 承認履歴
    - 承認決定の永続化（`runtime/runs/<run-id>/approvals.json`）
    - Promise ベースの承認待ち機構（submitDecision で resolve）
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 6.2_

  - [ ]* 3.2 Write property test for approval decision phase transitions
    - **Property 9: Approval Decision Phase Transitions**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [ ]* 3.3 Write property test for worker pause during approval wait
    - **Property 10: Worker Pause During Approval Wait**
    - **Validates: Requirements 3.7**

- [ ] 4. Checkpoint - 基盤コンポーネント確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. WorkflowEngine 実装
  - [ ] 5.1 `tools/cli/lib/execution/workflow-engine.ts` を作成
    - IWorkflowEngine インターフェースを実装
    - startWorkflow: ワークフロー開始、提案フェーズへ遷移
    - listWorkflows: 全ワークフロー一覧取得（statusフィルタ対応）
    - getProgress: 開発進捗取得（SubtaskProgress一覧）
    - getQualityResults: 品質結果取得
    - フェーズ遷移ロジック（VALID_TRANSITIONS マップに基づくバリデーション）
    - 各フェーズの実行ロジック:
      - proposal: MeetingCoordinator で会議開催 → Proposal 生成
      - approval: ApprovalGate で CEO 承認待ち
      - development: ManagerAgent でタスク分解 → WorkerPool でワーカー割り当て → ReviewWorkflow でレビュー
      - quality_assurance: QualityGateIntegration で品質チェック → 最終レビュー
      - delivery: Deliverable 生成 → ApprovalGate で CEO 承認 → PRCreator で PR 作成
    - ワークフロー状態の永続化（`runtime/runs/<run-id>/workflow.json`）
    - rollbackToPhase: フェーズロールバック
    - terminateWorkflow: ワークフロー終了
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.9, 2.10, 2.11, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3, 6.4, 6.5, 8.7, 9.5, 9.7, 13.1, 12.7_

  - [ ]* 5.2 Write property test for phase transition recording
    - **Property 2: Phase Transition Recording**
    - **Validates: Requirements 1.2**

  - [ ]* 5.3 Write property test for workflow state persistence round-trip
    - **Property 3: Workflow State Persistence Round-Trip**
    - **Validates: Requirements 1.3, 2.7, 2.11, 3.6, 13.1, 13.2, 13.3**

  - [ ]* 5.4 Write property test for error halts phase
    - **Property 4: Error Halts Phase and Notifies CEO**
    - **Validates: Requirements 1.4**

  - [ ]* 5.5 Write property test for phase rollback
    - **Property 5: Phase Rollback Resets State**
    - **Validates: Requirements 1.5**

  - [ ]* 5.6 Write property test for instruction triggers meeting and creates proposal
    - **Property 6: Instruction Triggers Meeting and Creates Proposal**
    - **Validates: Requirements 2.1, 2.9, 2.10**

  - [ ]* 5.7 Write property test for proposal structure completeness
    - **Property 7: Proposal Structure Completeness**
    - **Validates: Requirements 2.9**

  - [ ]* 5.8 Write property test for approval gate activation
    - **Property 8: Approval Gate Activation on Phase Completion**
    - **Validates: Requirements 3.1, 6.2**

- [ ] 6. 開発フェーズ詳細ロジック
  - [ ] 6.1 WorkflowEngine に開発フェーズの詳細ロジックを実装
    - Proposal の taskBreakdown から Grandchild_Ticket を生成し、TicketManager に登録
    - 依存関係に基づく順序制御（Dependency の from/to を解析してトポロジカルソート）
    - 各タスク完了後に ReviewWorkflow でレビューをトリガー
    - レビュー却下時のワーカーへの差し戻しループ
    - 全タスク完了時の quality_assurance フェーズへの遷移
    - ワーカー失敗時のエスカレーション（ApprovalGate 経由で CEO に通知）
    - SubtaskProgress の更新（GUI Progress タブ用）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 9.5, 9.6_

  - [ ]* 6.2 Write property test for task assignment from proposal
    - **Property 11: Task Assignment From Proposal**
    - **Validates: Requirements 4.1**

  - [ ]* 6.3 Write property test for dependency-ordered execution
    - **Property 12: Dependency-Ordered Execution**
    - **Validates: Requirements 4.2**

  - [ ]* 6.4 Write property test for review trigger after completion
    - **Property 13: Review Trigger After Task Completion**
    - **Validates: Requirements 4.3**

  - [ ]* 6.5 Write property test for review rejection returns ticket
    - **Property 14: Review Rejection Returns Ticket to Worker**
    - **Validates: Requirements 4.4**

  - [ ]* 6.6 Write property test for parent ticket status propagation
    - **Property 15: Parent Ticket Status Propagation**
    - **Validates: Requirements 4.5**

  - [ ]* 6.7 Write property test for escalation on max retries
    - **Property 16: Escalation on Maximum Retries**
    - **Validates: Requirements 4.6, 14.1**

- [ ] 7. 品質確認・納品フェーズロジック
  - [ ] 7.1 WorkflowEngine に品質確認フェーズと納品フェーズのロジックを実装
    - quality_assurance: QualityGateIntegration.runAllChecks() 実行、失敗時は development に戻す
    - quality_assurance: 品質ゲート通過後に ReviewWorkflow で最終レビュー
    - quality_assurance: QualityResults の更新（GUI Quality タブ用）
    - delivery: Deliverable 生成（summaryReport, changes, testResults, reviewHistory, artifacts）
    - delivery: ApprovalGate で CEO 承認待ち
    - delivery: CEO 承認後に PRCreator.createPullRequest() 実行
    - delivery: PR 作成後に Parent_Ticket ステータスを 'pr_created' に更新
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3, 6.4, 6.5, 9.7_

  - [ ]* 7.2 Write property test for development completion triggers QA
    - **Property 17: Development Completion Triggers QA Transition**
    - **Validates: Requirements 5.1**

  - [ ]* 7.3 Write property test for QA/review failure returns to development
    - **Property 18: QA or Review Failure Returns to Development**
    - **Validates: Requirements 5.3, 5.5**

  - [ ]* 7.4 Write property test for deliverable structure completeness
    - **Property 19: Deliverable Structure Completeness**
    - **Validates: Requirements 6.1**

  - [ ]* 7.5 Write property test for delivery approval creates PR
    - **Property 20: Delivery Approval Creates PR and Completes Workflow**
    - **Validates: Requirements 6.3, 6.5**

  - [ ]* 7.6 Write property test for delivery revision returns to development
    - **Property 21: Delivery Revision Returns to Development**
    - **Validates: Requirements 6.4**

- [ ] 8. Checkpoint - ワークフローエンジン確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Orchestrator.startTaskProcessing 修正
  - [ ] 9.1 `tools/cli/lib/execution/orchestrator.ts` の startTaskProcessing を修正
    - assignSubTasksToWorkers の戻り値を `Promise<ExecutionResult[]>` に変更
    - 全ワーカーの ExecutionResult 完了を await してから finalizeTaskExecution を呼ぶ
    - 各ワーカーの結果を ExecutionState に反映（artifacts, conversationHistories）
    - 失敗したワーカーの結果を ExecutionState に記録
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 9.2 Write property test for orchestrator awaits workers
    - **Property 22: Orchestrator Awaits All Workers Before Finalization**
    - **Validates: Requirements 7.1**

  - [ ]* 9.3 Write property test for worker results collected in state
    - **Property 23: Worker Results Collected in ExecutionState**
    - **Validates: Requirements 7.2, 7.3**

- [ ] 10. エスカレーション管理
  - [ ] 10.1 WorkflowEngine にエスカレーション処理を実装
    - ワーカー失敗時の Escalation 生成と ApprovalGate への通知
    - CEO の retry/skip/abort 決定の処理
    - retry: 新ワーカーへの再割り当て
    - skip: タスクをスキップして残りを続行
    - abort: ワークフロー終了とレポート生成
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 10.2 Write property test for escalation decision handling
    - **Property 24: Escalation Decision Handling**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.5**

- [ ] 11. ワークフロー状態の復元
  - [ ] 11.1 WorkflowEngine にワークフロー復元ロジックを実装
    - システム再起動時に workflow.json から状態を復元
    - 最後に完了したフェーズから再開
    - StateManager との統合
    - _Requirements: 13.1, 13.2, 13.3_

- [ ] 12. Checkpoint - コアロジック確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. OrchestratorServer ワークフローAPI拡張
  - [ ] 13.1 `tools/cli/lib/execution/orchestrator-server.ts` にワークフローAPIエンドポイントを追加
    - POST /api/workflows: ワークフロー開始
    - GET /api/workflows: ワークフロー一覧（statusフィルタ対応）
    - GET /api/workflows/:id: ワークフロー状態取得（全データ含む）
    - POST /api/workflows/:id/approve: CEO承認決定送信
    - GET /api/workflows/:id/proposal: 提案書取得
    - GET /api/workflows/:id/deliverable: 納品物取得
    - GET /api/workflows/:id/meetings: 会議録一覧取得
    - GET /api/workflows/:id/progress: 開発進捗取得
    - GET /api/workflows/:id/quality: 品質結果取得
    - POST /api/workflows/:id/escalation: エスカレーション決定送信
    - POST /api/workflows/:id/rollback: フェーズロールバック
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11_

  - [ ]* 13.2 Write unit tests for workflow API endpoints
    - Test each endpoint with valid/invalid inputs
    - _Requirements: 15.1-15.11_

- [ ] 14. Orchestrator への WorkflowEngine 統合
  - [ ] 14.1 Orchestrator に WorkflowEngine を統合
    - Orchestrator のコンストラクタで WorkflowEngine, MeetingCoordinator, ApprovalGate を初期化
    - executeTicketWorkflow を WorkflowEngine 経由に変更
    - 既存の submitTask との共存（WorkflowEngine は新しいワークフロー用、submitTask は既存互換）
    - getter メソッド追加（getWorkflowEngine, getMeetingCoordinator, getApprovalGate）
    - _Requirements: 1.1, 7.1_

- [ ] 15. Checkpoint - バックエンド確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. GUI共通コンポーネント
  - [ ] 16.1 `gui/web/components/workflows/PhaseProgress.tsx` を作成
    - 5フェーズの水平ステッパーコンポーネント
    - 各フェーズの状態表示: completed（緑チェック）, active（青パルス）, pending（グレー空円）, failed（赤エラー）
    - フェーズ間を線で接続（完了=実線、未完了=点線）
    - compact プロパティで一覧カード用のコンパクト表示に対応
    - _Requirements: 16.2, 16.3, 16.4, 16.5_

  - [ ] 16.2 `gui/web/components/workflows/WorkflowCard.tsx` を作成
    - ワークフローカードコンポーネント（一覧画面用）
    - ワークフローID、指示サマリー（truncated）、現在フェーズ、ステータス、日時を表示
    - PhaseProgress（compact）を内包
    - 承認待ち時は通知バッジ表示
    - クリックで詳細画面に遷移
    - _Requirements: 8.2, 8.3, 8.6_

  - [ ] 16.3 `gui/web/components/workflows/WorkflowFilter.tsx` を作成
    - ステータスフィルタ（running, waiting_approval, completed, terminated, failed）
    - ソート（作成日時、更新日時、ステータス）
    - _Requirements: 8.4, 8.5_

  - [ ] 16.4 `gui/web/components/workflows/ApprovalPanel.tsx` を作成
    - 承認アクションパネル（詳細画面上部に表示）
    - Proposal または Deliverable の内容表示
    - フィードバック入力テキストエリア
    - approve / request_revision / reject アクションボタン
    - accent-primary ボーダー + グロー効果
    - _Requirements: 9.9, 9.10, 16.6_

  - [ ] 16.5 `gui/web/components/workflows/EscalationAlert.tsx` を作成
    - エスカレーションアラートパネル
    - 失敗詳細、タスク情報、ワーカータイプ、リトライ回数、エラーメッセージ表示
    - retry / skip / abort アクションボタン
    - retry 時のオプションパラメータ入力
    - status-fail カラー + パルスアニメーション
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 16.9_

  - [ ] 16.6 `gui/web/components/workflows/RollbackDialog.tsx` を作成
    - ロールバック確認ダイアログ（Modal コンポーネント使用）
    - 影響範囲の説明表示
    - ロールバック先フェーズの選択
    - 確認/キャンセルボタン
    - _Requirements: 9.11_

- [ ] 17. GUIワークフロー詳細タブコンポーネント
  - [ ] 17.1 `gui/web/components/workflows/OverviewTab.tsx` を作成
    - 指示内容表示
    - メタデータ表示（ワークフローID、プロジェクト、作成日時）
    - フェーズ遷移タイムライン（PhaseTransition 配列を時系列表示）
    - ロールバックボタン（RollbackDialog を開く）
    - _Requirements: 9.2, 9.11_

  - [ ] 17.2 `gui/web/components/workflows/ProposalTab.tsx` を作成
    - サマリー、スコープ表示
    - タスク分解テーブル（タスク番号、タイトル、担当、工数、依存）
    - ワーカー割り当て表示
    - リスク評価テーブル（リスク、重要度バッジ、対策）
    - 依存関係表示
    - 参照会議録へのリンク
    - バージョン切り替え（修正要求後の再提案がある場合）
    - _Requirements: 9.3_

  - [ ] 17.3 `gui/web/components/workflows/MeetingsTab.tsx` を作成
    - 会議一覧（アコーディオン形式）
    - 各会議: 日時、参加者アイコン、議題数、決定事項数
    - 展開時: チャット風タイムライン表示
    - 参加者ロールアイコン（👔🔬🎨💻🧪）
    - ファシリテーターのまとめは accent-primary/10 背景で区別
    - 決定事項とアクションアイテムのセクション
    - _Requirements: 9.4, 12.5, 12.6, 16.7_

  - [ ] 17.4 `gui/web/components/workflows/ProgressTab.tsx` を作成
    - 全体進捗バー（完了率）
    - Kanban風5列レイアウト（pending, working, review, completed, failed）
    - 各タスクカード（タスク番号、タイトル、ワーカータイプアイコン、ステータス）
    - working 列のカードに accent-primary パルスボーダー
    - ワーカー状態セクション（各ワーカーの現在の活動）
    - 3秒間隔の自動リフレッシュ
    - _Requirements: 9.5, 9.6, 9.12, 16.8_

  - [ ] 17.5 `gui/web/components/workflows/QualityTab.tsx` を作成
    - Lint結果（PASS/FAIL バッジ、エラー数、警告数、詳細）
    - テスト結果（PASS/FAIL バッジ、合計/成功/失敗数、カバレッジバー）
    - 最終レビュー結果（PASS/FAIL バッジ、レビュアー、フィードバック）
    - 品質確認フェーズ前は「品質確認フェーズ完了後に結果が表示されます」メッセージ
    - _Requirements: 9.7_

  - [ ] 17.6 `gui/web/components/workflows/ApprovalsTab.tsx` を作成
    - 承認履歴一覧（時系列降順）
    - 各決定: アクションアイコン（✅↩✕）、フェーズ、日時、フィードバック
    - approve は status-pass、request_revision は status-waiver、reject は status-fail カラー
    - _Requirements: 9.8_

- [ ] 18. GUIワークフローページ
  - [ ] 18.1 `gui/web/app/workflows/page.tsx` を作成 - ワークフロー一覧ページ
    - WorkflowCard 一覧表示
    - WorkflowFilter によるフィルタ・ソート
    - 5秒間隔の自動リフレッシュ
    - ローディング・エラー・空状態の処理
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 18.2 `gui/web/app/workflows/[id]/page.tsx` を作成 - ワークフロー詳細ページ
    - PhaseProgress（フル表示）
    - ApprovalPanel（承認待ち時のみ表示）
    - EscalationAlert（エスカレーション時のみ表示）
    - Tabs コンポーネントで6タブ切り替え（概要/提案書/会議録/進捗/品質/承認履歴）
    - 3秒間隔の自動リフレッシュ（アクティブフェーズ時）
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12_

- [ ] 19. GUI API Routes
  - [ ] 19.1 `gui/web/app/api/workflows/route.ts` を作成
    - GET: ワークフロー一覧取得（Orchestrator Server へプロキシ）
    - POST: ワークフロー開始（Orchestrator Server へプロキシ）
    - _Requirements: 15.1, 15.2_

  - [ ] 19.2 `gui/web/app/api/workflows/[id]/route.ts` を作成
    - GET: ワークフロー詳細取得
    - _Requirements: 15.3_

  - [ ] 19.3 `gui/web/app/api/workflows/[id]/approve/route.ts` を作成
    - POST: 承認決定送信
    - _Requirements: 15.4_

  - [ ] 19.4 `gui/web/app/api/workflows/[id]/meetings/route.ts` を作成
    - GET: 会議録一覧取得
    - _Requirements: 15.7_

  - [ ] 19.5 `gui/web/app/api/workflows/[id]/progress/route.ts` を作成
    - GET: 開発進捗取得
    - _Requirements: 15.10_

  - [ ] 19.6 `gui/web/app/api/workflows/[id]/quality/route.ts` を作成
    - GET: 品質結果取得
    - _Requirements: 15.11_

  - [ ] 19.7 `gui/web/app/api/workflows/[id]/escalation/route.ts` を作成
    - POST: エスカレーション決定送信
    - _Requirements: 15.8_

  - [ ] 19.8 `gui/web/app/api/workflows/[id]/rollback/route.ts` を作成
    - POST: フェーズロールバック
    - _Requirements: 15.9_

- [ ] 20. Checkpoint - GUI画面確認
  - Ensure all pages render correctly, ask the user if questions arise.

- [ ] 21. ダッシュボード・ナビゲーション統合
  - [ ] 21.1 Navigation コンポーネントに Workflows リンクと通知バッジを追加
    - `gui/web/components/layout/Navigation.tsx` を更新
    - navItems に Workflows アイテムを追加（Dashboard の次に配置）
    - 承認待ちワークフロー数の通知バッジ（赤丸 + 数字）
    - 10秒間隔で `/api/workflows?status=waiting_approval` をポーリング
    - _Requirements: 8.8, 10.3, 16.12_

  - [ ] 21.2 Dashboard に承認通知カードとワークフローサマリーを追加
    - `gui/web/app/dashboard/page.tsx` を更新
    - 承認待ちワークフローの通知カード（accent-primary ボーダー + グロー効果）
    - クリックで `/workflows/[id]` に直接遷移
    - ワークフローサマリーセクション（実行中/承認待ち/完了/失敗の件数）
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

- [ ] 22. Checkpoint - GUI統合確認
  - Ensure navigation, dashboard integration, and all workflow pages work together.

- [ ] 23. ドキュメント更新
  - [ ] 23.1 ドキュメントを更新
    - `docs/specs/company-workflow-engine.md` に正式仕様書を作成
    - `docs/architecture/execution-engine.md` にワークフローエンジンのアーキテクチャを追記
    - `.kiro/steering/structure.md` に新規ファイルの配置を追記
    - `.kiro/steering/product.md` にワークフローエンジンの概要を追記

- [ ] 24. Final checkpoint - 全体確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 実装言語: TypeScript (ESM)
- テストフレームワーク: Vitest + fast-check
- GUI: Next.js 14 App Router + Tailwind CSS
- 既存UIコンポーネント（Card, Badge, Tabs, Loading, Modal, Error）を最大限活用
- GUIカラーパレット: bg-primary(#0f172a), bg-secondary(#1e293b), accent-primary(#3b82f6), status-pass(#22c55e), status-fail(#ef4444), status-waiver(#eab308)
