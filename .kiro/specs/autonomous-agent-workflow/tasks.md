# Implementation Plan: Autonomous Agent Workflow

## Overview

本実装計画は、AIエージェントが自律的にGitリポジトリに対して開発作業を行い、Pull Requestを作成するワークフロー機能を段階的に実装する。既存のコンポーネント（ProjectManager, GitManager, Orchestrator, WorkerPool）を拡張し、新規コンポーネント（TicketManager, PRCreator, ReviewWorkflow）を追加する。

## Tasks

- [x] 1. 型定義とデータモデルの拡張
  - [x] 1.1 チケット関連の型定義を追加
    - `tools/cli/lib/execution/types.ts` にTicketStatus, ParentTicket, ChildTicket, GrandchildTicket型を追加
    - WorkerType型とWorkerTypeConfig型を追加
    - ReviewResult, ReviewDecision型を追加
    - _Requirements: 2.5, 2.6, 2.7, 3.1, 5.2_
  - [x] 1.2 プロジェクト型の拡張
    - ExtendedProject型にbaseBranch, agentBranchフィールドを追加
    - ExtendedAddProjectOptions型を追加
    - _Requirements: 1.1, 1.2_
  - [x] 1.3 型定義のプロパティテスト作成
    - **Property 4: Ticket Structure Completeness**
    - **Validates: Requirements 2.5, 2.6, 2.7**

- [x] 2. TicketManager実装
  - [x] 2.1 TicketManagerクラスの基本実装
    - `tools/cli/lib/execution/ticket-manager.ts` を作成
    - createParentTicket, createChildTicket, createGrandchildTicket メソッド実装
    - チケットID生成ロジック（階層的ID形式）
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 ステータス管理機能の実装
    - updateTicketStatus メソッド実装
    - propagateStatusToParent メソッド実装（子の完了時に親を更新）
    - _Requirements: 2.8_
  - [x] 2.3 永続化機能の実装
    - saveTickets, loadTickets メソッド実装
    - `runtime/state/tickets/<project-id>.json` への保存
    - _Requirements: 9.1_
  - [x] 2.4 TicketManagerのプロパティテスト作成
    - **Property 3: Hierarchical Ticket ID Generation**
    - **Property 5: Status Propagation**
    - **Property 15: State Persistence Round-Trip**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.8, 9.1**

- [x] 3. Checkpoint - TicketManager完了確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. ProjectManager拡張
  - [x] 4.1 ブランチ設定の追加
    - `tools/cli/lib/execution/project-manager.ts` を拡張
    - addProject メソッドにbaseBranch, agentBranchオプション追加
    - デフォルト値の設定（baseBranch: 'main', agentBranch: 'agent/<id>'）
    - _Requirements: 1.1, 1.2, 1.5_
  - [x] 4.2 Git URL検証の追加
    - validateGitUrl メソッド実装
    - プロジェクト登録時のURL検証
    - _Requirements: 1.3_
  - [x] 4.3 エージェントブランチ自動作成
    - ensureAgentBranch メソッド実装
    - プロジェクト登録時にブランチが存在しなければ作成
    - _Requirements: 1.4_
  - [x] 4.4 ProjectManager拡張のプロパティテスト作成
    - **Property 1: Project Structure Completeness**
    - **Property 2: Project Persistence Round-Trip**
    - **Validates: Requirements 1.1, 1.2, 1.5**

- [x] 5. WorkerTypeRegistry実装
  - [x] 5.1 ワーカータイプ定義の実装
    - `tools/cli/lib/execution/worker-type-registry.ts` を作成
    - 6種類のワーカータイプ設定（research, design, designer, developer, test, reviewer）
    - 各タイプのcapabilities, tools, persona定義
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 5.2 ワーカータイプマッチング
    - matchWorkerType メソッド実装（タスク内容からワーカータイプを推定）
    - _Requirements: 3.8_
  - [x] 5.3 WorkerTypeRegistryのユニットテスト作成
    - 各ワーカータイプの設定検証
    - **Validates: Requirements 3.1-3.7**

- [x] 6. Checkpoint - Core Components完了確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. GitManager拡張（ブランチフロー）
  - [x] 7.1 タスクブランチ作成機能
    - createTaskBranch メソッド実装
    - ブランチ名形式: `agent/<ticket-id>-<description>`
    - _Requirements: 4.1_
  - [x] 7.2 コミットメッセージ形式の強制
    - commitWithTicketId メソッド実装
    - メッセージ形式: `[<ticket-id>] <description>`
    - _Requirements: 4.2_
  - [x] 7.3 マージ機能の拡張
    - mergeToAgentBranch メソッド実装
    - コンフリクト検出と自動解決試行
    - _Requirements: 4.4, 4.5_
  - [x] 7.4 コンフリクトエスカレーション
    - escalateConflict メソッド実装
    - Reviewer Agentへのコンフリクト詳細通知
    - _Requirements: 4.6_
  - [x] 7.5 GitManager拡張のプロパティテスト作成
    - **Property 7: Git Naming Conventions**
    - **Property 8: Merge Flow Integrity**
    - **Property 9: Conflict Escalation**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6**

- [x] 8. PRCreator実装
  - [x] 8.1 PRCreatorクラスの実装
    - `tools/cli/lib/execution/pr-creator.ts` を作成
    - createPullRequest メソッド実装
    - GitHub CLI または git コマンドによるPR作成
    - _Requirements: 10.1, 10.4_
  - [x] 8.2 PR内容生成
    - generatePRTitle メソッド実装（形式: `[AgentCompany] <summary>`）
    - generatePRBody メソッド実装（overview, changes, test results, tickets）
    - _Requirements: 10.2, 10.3_
  - [x] 8.3 PR作成後のステータス更新
    - PR作成成功時にParentTicketステータスを'pr_created'に更新
    - 失敗時のエラーログとユーザー通知
    - _Requirements: 10.5, 10.6_
  - [x] 8.4 PRCreatorのプロパティテスト作成
    - **Property 17: PR Creation Trigger**
    - **Property 18: PR Content Completeness**
    - **Property 19: PR Status Update**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.5**

- [x] 9. ReviewWorkflow実装
  - [x] 9.1 ReviewWorkflowクラスの実装
    - `tools/cli/lib/execution/review-workflow.ts` を作成
    - requestReview, submitReview, getReviewStatus メソッド実装
    - _Requirements: 5.1, 5.2_
  - [x] 9.2 レビュー決定処理
    - 承認時: マージトリガー
    - 却下時: フィードバック提供、ステータス更新
    - _Requirements: 5.3, 5.4, 5.5_
  - [x] 9.3 レビューログ記録
    - `runtime/runs/<run-id>/reviews.log` への記録
    - _Requirements: 5.6_
  - [x] 9.4 ReviewWorkflowのプロパティテスト作成
    - **Property 10: Review Decision Handling**
    - **Property 11: Review Logging**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6**

- [x] 10. Checkpoint - Backend Components完了確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. エラーハンドリングとリカバリー
  - [x] 11.1 リトライ機能の拡張
    - 指数バックオフ（1s, 2s, 4s）の実装
    - 最大3回リトライ
    - _Requirements: 11.1_
  - [x] 11.2 失敗時の処理
    - リトライ失敗時のチケットステータス更新
    - Manager Agentへの通知
    - _Requirements: 11.2_
  - [x] 11.3 エラーログ記録
    - `runtime/runs/<run-id>/errors.log` への記録
    - _Requirements: 11.5_
  - [x] 11.4 エラーハンドリングのプロパティテスト作成
    - **Property 20: Exponential Backoff Retry**
    - **Property 21: Error Audit Logging**
    - **Validates: Requirements 11.1, 11.2, 11.5**

- [x] 12. 状態永続化と復旧
  - [x] 12.1 実行状態の永続化
    - `runtime/state/runs/<run-id>/state.json` への保存
    - ワーカー状態、会話履歴の保存
    - _Requirements: 9.2_
  - [x] 12.2 一時停止・再開機能
    - pauseTicket, resumeTicket メソッド実装
    - 状態の完全保存と復元
    - _Requirements: 9.4, 9.5_
  - [x] 12.3 システム再起動時の復旧
    - 起動時のin-progressチケット検出と復元
    - _Requirements: 9.3_
  - [x] 12.4 状態永続化のプロパティテスト作成
    - **Property 16: Pause/Resume State Preservation**
    - **Validates: Requirements 9.4, 9.5**

- [x] 13. Checkpoint - Core Implementation完了確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. CLI拡張
  - [x] 14.1 ticketサブコマンドの追加
    - `tools/cli/commands/ticket.ts` を作成
    - create, list, status, pause, resume コマンド実装
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x] 14.2 projectコマンドの拡張
    - --base-branch, --agent-branch オプション追加
    - _Requirements: 12.6_
  - [x] 14.3 CLIエントリポイントの更新
    - `tools/cli/agentcompany.ts` にticketコマンド追加
  - [x] 14.4 CLIのユニットテスト作成
    - 各コマンドの動作検証
    - **Validates: Requirements 12.1-12.6**

- [x] 15. GUI - プロジェクト管理画面
  - [x] 15.1 プロジェクト一覧ページ
    - `gui/web/app/projects/page.tsx` を作成
    - プロジェクト一覧表示、ステータスインジケーター
    - _Requirements: 6.2_
  - [x] 15.2 プロジェクト登録フォーム
    - `gui/web/components/projects/ProjectForm.tsx` を作成
    - name, gitUrl, baseBranch, agentBranch入力フィールド
    - バリデーションとエラー表示
    - _Requirements: 6.1, 6.5, 6.6_
  - [x] 15.3 プロジェクト詳細・編集・削除
    - `gui/web/app/projects/[id]/page.tsx` を作成
    - 詳細表示、編集フォーム、削除確認
    - _Requirements: 6.3, 6.4_
  - [x] 15.4 プロジェクトAPI
    - `gui/web/app/api/projects/route.ts` を作成
    - GET, POST, PUT, DELETE エンドポイント
  - [x] 15.5 プロジェクト画面のテスト作成
    - **Property 12: Form Validation Behavior**
    - **Validates: Requirements 6.5, 6.6**

- [x] 16. GUI - チケット階層管理画面
  - [x] 16.1 チケットツリービュー
    - `gui/web/components/tickets/TicketTree.tsx` を作成
    - 階層表示、展開/折りたたみ
    - _Requirements: 7.1, 7.3_
  - [x] 16.2 ステータスインジケーター
    - `gui/web/components/tickets/StatusBadge.tsx` を作成
    - 色分け表示（pending: gray, in_progress: blue, etc.）
    - _Requirements: 7.2_
  - [x] 16.3 チケット情報表示
    - ワーカータイプ、アサイニー、Gitブランチ名の表示
    - _Requirements: 7.4, 7.5_
  - [x] 16.4 チケット詳細ページ
    - `gui/web/app/tickets/[id]/page.tsx` を作成
    - 詳細情報、ログ、成果物リンク
    - _Requirements: 7.6_
  - [x] 16.5 チケットAPI
    - `gui/web/app/api/tickets/route.ts` を作成
    - GET, POST, PUT エンドポイント
  - [x] 16.6 チケット画面のプロパティテスト作成
    - **Property 13: Ticket Status Color Mapping**
    - **Property 14: Ticket Information Display**
    - **Validates: Requirements 7.2, 7.4, 7.5**

- [x] 17. GUI - チケット作成画面
  - [x] 17.1 チケット作成フォーム
    - `gui/web/app/tickets/create/page.tsx` を作成
    - プロジェクト選択、指示入力（Markdown対応）
    - _Requirements: 8.1, 8.2_
  - [x] 17.2 プレビュー機能
    - Markdownプレビュー表示
    - _Requirements: 8.4_
  - [x] 17.3 送信と確認
    - 送信処理、確認表示、エラーハンドリング
    - _Requirements: 8.3, 8.5_
  - [x] 17.4 チケット作成画面のユニットテスト作成
    - フォーム動作、プレビュー、送信処理の検証
    - **Validates: Requirements 8.1-8.5**

- [x] 18. Checkpoint - GUI Implementation完了確認
  - 全GUIテスト通過確認済み（117テスト全てパス）

- [x] 19. 統合とワイヤリング
  - [x] 19.1 Orchestratorへの統合
    - TicketManager, PRCreator, ReviewWorkflowの統合
    - チケットベースのワークフロー実行
  - [x] 19.2 WorkerPoolへの統合
    - WorkerTypeRegistryとの連携
    - ワーカータイプに基づく割り当て
  - [x] 19.3 AgentBusへの統合
    - レビューリクエスト/レスポンスメッセージ
    - エスカレーションメッセージ
  - [x] 19.4 統合テスト作成
    - エンドツーエンドのワークフロー検証

- [x] 20. E2Eテスト
  - [x] 20.1 チケットワークフローE2Eテスト
    - `e2e/ticket-workflow.spec.ts` を作成
    - チケット作成からPR作成までのフロー検証
  - [x] 20.2 プロジェクト管理E2Eテスト
    - `e2e/project-management.spec.ts` を作成
    - プロジェクト登録、編集、削除のフロー検証

- [x] 21. Final Checkpoint - 全テスト通過確認
  - E2Eテスト全て通過（ticket-workflow: 23テスト、project-management: 24テスト）
  - ドキュメント更新完了（docs/specs/autonomous-agent-workflow.md、docs/architecture/execution-engine.md）

## Notes

- All tasks including tests are required for comprehensive quality assurance
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 既存コンポーネントの拡張は後方互換性を維持すること
- GUI実装はTailwind CSSとプロジェクトのカラーパレットを使用すること
