# タスク: エンドツーエンド ワークフロー接続

## Task 1: createWorkflowEngine ファクトリ関数を拡張
- [x] `tools/cli/lib/execution/workflow-engine.ts` の `createWorkflowEngine()` に `options` パラメータを追加
- [x] options: `{ codingAgentRegistry?, workspaceManager?, preferredCodingAgent? }`
- [x] 既存の呼び出し元（テスト含む）が壊れないことを確認（options はオプショナル）
- [x] 既存テスト（`tests/execution/workflow-engine.test.ts`）が全て通ることを確認

## Task 2: OrchestratorServer に CodingAgentRegistry を接続
- [x] `tools/cli/lib/execution/orchestrator-server.ts` のコンストラクタに CodingAgentRegistry インポートを追加
- [x] `globalCodingAgentRegistry` を使用して WorkflowEngine を初期化
- [x] `createWorkflowEngine()` 呼び出しに `{ codingAgentRegistry: globalCodingAgentRegistry }` を渡す
- [x] `runtime/state/config.json` から `codingAgent.preferredAgent` を読み込み、options に渡す
- [x] OrchestratorServerConfig に `codingAgentRegistry` フィールドを追加（DI用）

## Task 3: AI ヘルスチェックの改善
- [x] `handleSubmitTask()` の AI 可用性チェックを修正: Ollama OR CodingAgent で許可
- [x] CodingAgentRegistry の `getAvailableAgents()` を呼び出して可用性を確認
- [x] Ollama 利用不可 + CodingAgent 利用可能 → タスク送信許可（警告付き）
- [x] 両方利用不可 → 503 エラー
- [x] `handleAIHealth()` に CodingAgent 可用性情報を追加
- [x] `handleDashboardStatus()` の aiStatus に CodingAgent 情報を追加

## Task 4: チェックポイント - サーバーサイド接続確認
- [x] 既存テスト全通過を確認（`npm run test`）
- [x] OrchestratorServer のワークフローテスト通過確認

## Task 5: GUI `/api/command` route を WorkflowEngine に接続
- [x] `gui/web/app/api/command/route.ts` の `submitTaskToOrchestrator()` を修正
- [x] `POST /api/tasks` → `POST /api/workflows` に変更（`{ instruction, projectId }` を送信）
- [x] レスポンスから `workflowId` を取得
- [x] `CommandHistoryItem` に `workflowId` フィールドを追加
- [x] 履歴保存時に `workflowId` を記録
- [x] Orchestrator 未起動時のフォールバック処理を維持

## Task 6: Command Center UI の改善
- [x] `gui/web/app/command/page.tsx` の履歴表示に `workflowId` を追加
- [x] ワークフローIDクリックで `/workflows/[id]` に遷移するリンクを追加
- [x] Orchestrator 接続ステータスの表示を改善（CodingAgent 可用性を含む）
- [x] 送信成功時に「ワークフロー開始」メッセージを表示

## Task 7: テスト作成
- [x] `tests/execution/orchestrator-server-wiring.test.ts` を作成
  - OrchestratorServer が CodingAgentRegistry 付きで WorkflowEngine を初期化することを確認
  - AI ヘルスチェックが CodingAgent 可用性を考慮することを確認
  - `/api/workflows` エンドポイントが WorkflowEngine.startWorkflow() を呼ぶことを確認
- [x] テスト全通過を確認

## Task 8: ドキュメント更新
- [x] `docs/specs/end-to-end-workflow-wiring.md` に正式仕様書を作成
- [x] `docs/architecture/execution-engine.md` にエンドツーエンドフロー図を追加
- [x] `.kiro/steering/product.md` のフロー図を更新
- [x] 全タスク完了を確認
