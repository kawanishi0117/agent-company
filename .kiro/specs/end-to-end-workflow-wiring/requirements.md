# 要件: エンドツーエンド ワークフロー接続

## 概要

社長（CEO）がGUI Command Centerから指示を出し、WorkflowEngineの5フェーズ（提案→承認→開発→QA→納品）が
CodingAgentAdapter（Claude Code / OpenCode / Kiro CLI）を使って自律的に実行される、
完全なエンドツーエンドフローを実現する。

現状、個々のコンポーネント（GUI、OrchestratorServer、WorkflowEngine、CodingAgentRegistry）は
実装済みだが、相互の接続に4つのギャップがある。本specはそれらを解消する。

## 要件一覧

### REQ-1: Command Center → WorkflowEngine 接続
- REQ-1.1: Command Center の「送信」ボタンは、OrchestratorServer の `POST /api/workflows` エンドポイントを経由して WorkflowEngine.startWorkflow() を呼び出すこと
- REQ-1.2: GUI `/api/command` route は、`/api/tasks`（旧パス）ではなく `POST /api/workflows` を使用してワークフローを開始すること
- REQ-1.3: ワークフロー開始後、Command Center の履歴にワークフローIDとステータスが表示されること
- REQ-1.4: ワークフロー開始後、Workflows画面（`/workflows`）で新しいワークフローが一覧に表示されること

### REQ-2: WorkflowEngine に CodingAgentRegistry を接続
- REQ-2.1: OrchestratorServer のコンストラクタで、WorkflowEngine に CodingAgentRegistry を渡すこと
- REQ-2.2: `createWorkflowEngine` ファクトリ関数が options パラメータ（codingAgentRegistry, workspaceManager, preferredCodingAgent）を受け取れるように拡張すること
- REQ-2.3: 開発フェーズで CodingAgentAdapter が利用可能な場合、実際のコーディングエージェントCLIを使用してタスクを実行すること
- REQ-2.4: CodingAgentAdapter が利用不可の場合、シミュレーションモードにフォールバックすること

### REQ-3: AI ヘルスチェックの改善
- REQ-3.1: `handleSubmitTask()` の AI 可用性チェックは、Ollama だけでなく CodingAgentRegistry の可用性も考慮すること
- REQ-3.2: Ollama が利用不可でも、CodingAgentAdapter が利用可能であればタスク送信を許可すること
- REQ-3.3: `/api/health/ai` エンドポイントが CodingAgentAdapter の可用性情報も返すこと
- REQ-3.4: Dashboard の AI ステータス表示に CodingAgentAdapter の状態を含めること

### REQ-4: config.json からの設定読み込み
- REQ-4.1: OrchestratorServer 起動時に `runtime/state/config.json` の `codingAgent.preferredAgent` を読み込み、WorkflowEngine に渡すこと
- REQ-4.2: Settings 画面でコーディングエージェント設定を変更した場合、WorkflowEngine にも反映されること
