# Company Workflow Engine 仕様書

## 概要

Company Workflow Engineは、AgentCompanyの業務フローを5フェーズ（提案→承認→開発→品質確認→納品）で管理するエンジンである。エージェント間の会議プロセス、社長（CEO）の承認ゲート、エスカレーション管理、GUI完結操作を提供する。

## アーキテクチャ

### コンポーネント構成

| コンポーネント      | 場所                                                    | 役割                           |
| ------------------- | ------------------------------------------------------- | ------------------------------ |
| WorkflowEngine      | `tools/cli/lib/execution/workflow-engine.ts`            | ワークフロー全体制御           |
| MeetingCoordinator  | `tools/cli/lib/execution/meeting-coordinator.ts`        | エージェント間会議の開催・記録 |
| ApprovalGate        | `tools/cli/lib/execution/approval-gate.ts`              | CEO承認ゲート管理              |

### 5フェーズワークフロー

```
proposal → approval → development → quality_assurance → delivery
```

| フェーズ            | 内容                                                   |
| ------------------- | ------------------------------------------------------ |
| proposal            | MeetingCoordinatorで会議開催、Proposal（提案書）生成   |
| approval            | ApprovalGateでCEO承認待ち                              |
| development         | タスク分解→ワーカー割り当て→レビュー                   |
| quality_assurance   | 品質ゲート実行（lint/test）→最終レビュー               |
| delivery            | 納品物生成→CEO承認→PR作成                              |

## 主要機能

### WorkflowEngine

- `startWorkflow(instruction, projectId, runId)`: ワークフロー開始
- `getWorkflowState(workflowId)`: ワークフロー状態取得
- `listWorkflows(status?)`: ワークフロー一覧（フィルタ対応）
- `rollbackToPhase(workflowId, targetPhase)`: フェーズロールバック
- `terminateWorkflow(workflowId, reason)`: ワークフロー終了
- `getProgress(workflowId)`: 開発進捗取得
- `getQualityResults(workflowId)`: 品質結果取得
- `handleEscalation(workflowId, decision)`: エスカレーション処理（retry/skip/abort）
- `restoreWorkflows()`: システム再起動時の状態復元

### MeetingCoordinator

- `conveneMeeting(meetingType, participants, agenda, runId)`: 会議開催
- ラウンド制の議論ループ（各議題について全参加者から意見収集）
- 会議録（MeetingMinutes）の生成と永続化
- AgentBus経由でのエージェント間通信

### ApprovalGate

- `requestApproval(workflowId, phase, summary)`: 承認要求作成
- `submitDecision(approvalId, action, feedback?)`: CEO決定処理
- `cancelApproval(approvalId)`: 承認キャンセル
- `getPendingApprovals()`: 承認待ち一覧
- `getApprovalHistory(workflowId)`: 承認履歴
- Promise ベースの承認待ち機構

## 永続化

### ワークフロー状態

`runtime/runs/<run-id>/workflow.json` にワークフロー状態を保存。

### 会議録

`runtime/runs/<run-id>/meeting-minutes/<meeting-id>.json` に会議録を保存。

### 承認履歴

`runtime/runs/<run-id>/approvals.json` に承認決定を保存。

## エスカレーション

ワーカー失敗時にCEOへエスカレーションし、以下の決定を処理：

| 決定   | 動作                               |
| ------ | ---------------------------------- |
| retry  | 新ワーカーへの再割り当て           |
| skip   | タスクをスキップして残りを続行     |
| abort  | ワークフロー終了とレポート生成     |

## Orchestrator Server API

| メソッド | パス                                    | 説明                   |
| -------- | --------------------------------------- | ---------------------- |
| POST     | `/api/workflows`                        | ワークフロー開始       |
| GET      | `/api/workflows`                        | ワークフロー一覧       |
| GET      | `/api/workflows/:id`                    | ワークフロー状態取得   |
| POST     | `/api/workflows/:id/approve`            | CEO承認決定送信        |
| GET      | `/api/workflows/:id/meetings`           | 会議録一覧取得         |
| GET      | `/api/workflows/:id/progress`           | 開発進捗取得           |
| GET      | `/api/workflows/:id/quality`            | 品質結果取得           |
| POST     | `/api/workflows/:id/escalation`         | エスカレーション決定   |
| POST     | `/api/workflows/:id/rollback`           | フェーズロールバック   |

## GUI

### ワークフロー一覧ページ (`/workflows`)

- WorkflowCard一覧表示、フィルタ・ソート対応
- 5秒間隔の自動リフレッシュ

### ワークフロー詳細ページ (`/workflows/[id]`)

6タブ構成：

| タブ     | 内容                                           |
| -------- | ---------------------------------------------- |
| 概要     | 指示内容、メタデータ、フェーズ遷移タイムライン |
| 提案書   | サマリー、タスク分解、リスク評価               |
| 会議録   | 会議一覧（アコーディオン形式）                 |
| 進捗     | Kanban風レイアウト、全体進捗バー               |
| 品質     | lint/test結果、最終レビュー結果                |
| 承認履歴 | 承認決定の時系列表示                           |

### ダッシュボード統合

- 承認待ちワークフローの通知カード（グロー効果付き）
- ワークフローサマリーセクション（実行中/承認待ち/完了/失敗）

### ナビゲーション統合

- Workflowsリンクに承認待ち数の通知バッジ（10秒ポーリング）

## テスト

157テスト全パス：

| テストファイル                                  | テスト数 |
| ----------------------------------------------- | -------- |
| `workflow-engine.test.ts`                       | 31       |
| `workflow-engine.property.test.ts`              | 20       |
| `meeting-coordinator.test.ts`                   | 25       |
| `meeting-coordinator.property.test.ts`          | 7        |
| `approval-gate.test.ts`                         | 26       |
| `approval-gate.property.test.ts`                | 7        |
| `workflow-types.property.test.ts`               | 15       |
| `orchestrator-fix.property.test.ts`             | 2        |
| `orchestrator-server-workflow.test.ts`           | 24       |

## 関連ドキュメント

- [Agent Execution Engine アーキテクチャ](../architecture/execution-engine.md)
- [Autonomous Agent Workflow 仕様](./autonomous-agent-workflow.md)
- [AI実行統合仕様](./ai-execution-integration.md)
