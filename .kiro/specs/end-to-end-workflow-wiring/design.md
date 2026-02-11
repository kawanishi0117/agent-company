# 設計: エンドツーエンド ワークフロー接続

## 概要

既存コンポーネントの「配線」を修正し、CEO指示 → WorkflowEngine → CodingAgent の完全フローを実現する。
新しいコンポーネントは作成せず、既存コードの接続部分のみを修正する。

## 変更対象ファイル

### 1. `tools/cli/lib/execution/workflow-engine.ts`
- `createWorkflowEngine` ファクトリ関数に `options` パラメータを追加
- WorkflowEngine コンストラクタは既に options を受け取れるため、ファクトリ関数のみ修正

### 2. `tools/cli/lib/execution/orchestrator-server.ts`
- コンストラクタで `CodingAgentRegistry` と `WorkspaceManager` を初期化
- `createWorkflowEngine()` 呼び出し時に options を渡す
- `handleSubmitTask()` の AI 可用性チェックを改善（Ollama OR CodingAgent で許可）
- `handleAIHealth()` に CodingAgent 可用性情報を追加
- `handleDashboardStatus()` に CodingAgent ステータスを追加
- config.json から `codingAgent.preferredAgent` を読み込む

### 3. `gui/web/app/api/command/route.ts`
- `submitTaskToOrchestrator()` を `POST /api/workflows` に変更
- レスポンスから `workflowId` を取得して履歴に保存
- `CommandHistoryItem` に `workflowId` フィールドを追加

### 4. `gui/web/app/command/page.tsx`
- 履歴表示に `workflowId` を追加
- ワークフローIDクリックで `/workflows/[id]` に遷移するリンクを追加
- Orchestrator ステータス表示を改善

## アーキテクチャ（修正後のフロー）

```
[Command Center GUI]
    │
    ├─ POST /api/command (Next.js API Route)
    │      │
    │      ├─ チケットファイル作成（workflows/backlog/）
    │      │
    │      └─ POST http://localhost:3001/api/workflows  ← 変更点（旧: /api/tasks）
    │              │
    │              └─ OrchestratorServer.handleStartWorkflow()
    │                      │
    │                      └─ WorkflowEngine.startWorkflow(instruction, projectId)
    │                              │
    │                              ├─ proposalフェーズ: MeetingCoordinator.conveneMeeting()
    │                              ├─ approvalフェーズ: ApprovalGate.requestApproval() → CEO承認待ち
    │                              ├─ developmentフェーズ: CodingAgentAdapter.execute() ← 接続点
    │                              ├─ QAフェーズ: 品質ゲート実行
    │                              └─ deliveryフェーズ: ApprovalGate.requestApproval() → CEO最終承認
    │
[Workflows GUI]  ← ワークフロー状態・承認操作
[Dashboard GUI]  ← リアルタイムステータス
```

## 設計判断

### D-1: `/api/tasks` は残す（後方互換性）
- 既存の `/api/tasks` エンドポイントは削除しない
- Command Center からの新規指示は `/api/workflows` を使用
- CLI からの直接タスク送信は引き続き `/api/tasks` を使用可能

### D-2: CodingAgentRegistry はシングルトンを使用
- `globalCodingAgentRegistry`（`tools/coding-agents/index.ts`）を使用
- OrchestratorServer 内で新しいインスタンスを作成しない
- テスト時は DI で差し替え可能

### D-3: AI ヘルスチェックは OR 条件
- Ollama が利用可能 OR CodingAgent が利用可能 → タスク送信許可
- 両方利用不可 → 503 エラー（セットアップ手順を含む）
- 提案フェーズ（会議）は Ollama が必要だが、開発フェーズは CodingAgent のみで動作可能

### D-4: config.json の読み込みは起動時のみ
- OrchestratorServer 起動時に `runtime/state/config.json` を読み込む
- Settings 画面からの変更は `PUT /api/config` 経由で反映
- ホットリロードは既存の SettingsManager が対応済み
