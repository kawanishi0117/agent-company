# エンドツーエンド ワークフロー接続 仕様書

## 概要

GUI Command Center から CEO が指示を出し、OrchestratorServer → WorkflowEngine → CodingAgent の完全フローで自律的にコーディング作業を実行するための接続仕様。

既存コンポーネント間の「配線」を修正し、新しいコンポーネントは作成せず接続部分のみを整備した。

## エンドツーエンドフロー

```
[Command Center GUI]  ── CEO が自然言語で指示を入力
    │
    ├─ POST /api/command (Next.js API Route)
    │      │
    │      ├─ チケットファイル作成（workflows/backlog/）
    │      │
    │      └─ POST http://localhost:3001/api/workflows
    │              │
    │              └─ OrchestratorServer.handleStartWorkflow()
    │                      │
    │                      └─ WorkflowEngine.startWorkflow(instruction, projectId)
    │                              │
    │                              ├─ 1. proposalフェーズ: MeetingCoordinator.conveneMeeting()
    │                              ├─ 2. approvalフェーズ: ApprovalGate.requestApproval() → CEO承認待ち
    │                              ├─ 3. developmentフェーズ: CodingAgentAdapter.execute()
    │                              ├─ 4. QAフェーズ: 品質ゲート実行
    │                              └─ 5. deliveryフェーズ: ApprovalGate.requestApproval() → CEO最終承認
    │
[Workflows GUI]  ← ワークフロー状態確認・承認操作
[Dashboard GUI]  ← リアルタイムステータス表示
```

## 変更内容

### 1. WorkflowEngine ファクトリ関数の拡張

`createWorkflowEngine()` に `WorkflowEngineOptions` パラメータを追加。

```typescript
interface WorkflowEngineOptions {
  codingAgentRegistry?: CodingAgentRegistry;
  workspaceManager?: WorkspaceManager;
  preferredCodingAgent?: string;
}
```

- 既存の呼び出し元との後方互換性を維持（options はオプショナル）
- development フェーズで CodingAgentAdapter を使用してコード生成を実行

### 2. OrchestratorServer の CodingAgentRegistry 接続

- `globalCodingAgentRegistry` をインポートし、WorkflowEngine 初期化時に渡す
- `runtime/state/config.json` の `codingAgent.preferredAgent` を読み込み
- DI 用に `OrchestratorServerConfig.codingAgentRegistry` フィールドを追加

### 3. AI ヘルスチェックの改善

| 条件 | 結果 |
|------|------|
| Ollama 利用可能 | タスク送信許可 |
| Ollama 不可 + CodingAgent 利用可能 | タスク送信許可（警告付き） |
| 両方利用不可 | 503 エラー |

- `GET /api/health/ai` に CodingAgent 可用性情報を追加
- `GET /api/dashboard/status` の aiStatus に CodingAgent ステータスを追加

### 4. GUI Command Center の接続変更

- `submitTaskToOrchestrator()` → `submitWorkflowToOrchestrator()`
- `POST /api/tasks` → `POST /api/workflows` に変更
- レスポンスから `workflowId` を取得し履歴に保存
- ワークフロー ID クリックで `/workflows/[id]` に遷移
- Orchestrator 接続ステータスインジケーター表示

## API エンドポイント

### OrchestratorServer（port 3001）

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/workflows` | ワークフロー開始 |
| GET | `/api/workflows` | ワークフロー一覧 |
| GET | `/api/workflows/:id` | ワークフロー状態取得 |
| GET | `/api/health/ai` | AI ヘルスチェック（CodingAgent 含む） |
| POST | `/api/tasks` | タスク送信（レガシー、後方互換） |

### GUI API Routes

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/command` | Command Center からの指示送信 |

## 設計判断

| ID | 判断 | 理由 |
|----|------|------|
| D-1 | `/api/tasks` は残す | 後方互換性。CLI からの直接タスク送信に使用 |
| D-2 | `globalCodingAgentRegistry` シングルトン使用 | インスタンス管理の簡素化。テスト時は DI で差し替え |
| D-3 | AI ヘルスチェックは OR 条件 | 提案フェーズは Ollama、開発フェーズは CodingAgent と役割分担 |
| D-4 | config.json 読み込みは起動時のみ | Settings 画面からの変更は既存 SettingsManager が対応 |

## テスト

- `tests/execution/orchestrator-server-wiring.test.ts`（11テスト）
  - CodingAgentRegistry DI 接続
  - AI ヘルスチェック（CodingAgent 可用性考慮）
  - `/api/workflows` エンドポイント（POST/GET）
  - タスク送信時の AI 可用性チェック

## 関連ドキュメント

- [Agent Execution Engine](../architecture/execution-engine.md)
- [Company Workflow Engine 仕様](./company-workflow-engine.md)
- [Coding Agent Integration 仕様](./coding-agent-integration.md)
- [AI Execution Integration 仕様](./ai-execution-integration.md)
