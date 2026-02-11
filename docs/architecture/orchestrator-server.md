# Orchestrator Server（GUI連携）

GUIからOrchestratorを制御するためのHTTP APIサーバー。

**場所**: `tools/cli/lib/execution/orchestrator-server.ts`

## 起動方法

```bash
# デフォルトポート（3001）で起動
agentcompany server

# カスタムポートで起動
agentcompany server --port 8080
```

## APIエンドポイント

| メソッド | パス                         | 説明                              |
| -------- | ---------------------------- | --------------------------------- |
| GET      | `/api/health`                | ヘルスチェック                    |
| GET      | `/api/health/ai`             | AI可用性チェック（※AI統合で追加） |
| POST     | `/api/tasks`                 | タスク送信（AI可用性チェック付き） |
| GET      | `/api/tasks/:id`             | タスクステータス取得              |
| DELETE   | `/api/tasks/:id`             | タスクキャンセル                  |
| GET      | `/api/agents`                | アクティブエージェント            |
| POST     | `/api/agents/pause`          | 全エージェント一時停止            |
| POST     | `/api/agents/resume`         | 全エージェント再開                |
| POST     | `/api/agents/emergency-stop` | 緊急停止                          |
| POST     | `/api/tickets`               | チケット作成＆実行                |
| GET      | `/api/dashboard/status`      | ダッシュボード統合情報（AI状態含む）|
| GET      | `/api/config`                | 設定取得                          |
| PUT      | `/api/config`                | 設定更新（バリデーション付き）    |
| POST     | `/api/config/validate`       | 設定バリデーション（※AI統合で追加）|
| GET      | `/api/runs/:runId/report`    | 実行レポート取得（※AI統合で追加） |
| GET      | `/api/runs/:runId/artifacts` | 成果物一覧取得（※AI統合で追加）   |
| GET      | `/api/runs/:runId/quality`   | 品質ゲート結果取得（※AI統合で追加）|

## GUI連携フロー

```
┌─────────────────┐     HTTP      ┌─────────────────────┐
│   GUI (Next.js) │ ────────────→ │ Orchestrator Server │
│                 │               │    (port 3001)      │
│  - Command      │               │                     │
│  - Dashboard    │ ←──────────── │  - Task Management  │
│  - Settings     │     JSON      │  - Agent Control    │
└─────────────────┘               └─────────────────────┘
                                           │
                                           ↓
                                  ┌─────────────────────┐
                                  │    Orchestrator     │
                                  │  - Worker Pool      │
                                  │  - Agent Bus        │
                                  │  - State Manager    │
                                  └─────────────────────┘
```

## 環境変数

| 変数名               | 説明                    | デフォルト              |
| -------------------- | ----------------------- | ----------------------- |
| `ORCHESTRATOR_API_URL` | GUI側のAPI接続先      | `http://localhost:3001` |

## 関連ドキュメント

- [実行エンジン](./execution-engine.md)
- [AI実行統合](./ai-integration.md)
- [ワークフローエンジン](./workflow-engine.md)
