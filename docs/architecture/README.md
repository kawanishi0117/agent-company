# アーキテクチャドキュメント

AgentCompanyのシステムアーキテクチャに関するドキュメント一覧。

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [overview.md](./overview.md) | システム全体のアーキテクチャ概要 |
| [execution-engine.md](./execution-engine.md) | Agent Execution Engine（コア実行エンジン） |
| [orchestrator-server.md](./orchestrator-server.md) | Orchestrator Server（GUI連携API） |
| [ai-integration.md](./ai-integration.md) | AI実行統合（Ollama接続、品質ゲート、成果物管理） |
| [workflow-engine.md](./workflow-engine.md) | Company Workflow Engine（5フェーズ業務フロー） |
| [container-isolation.md](./container-isolation.md) | コンテナ隔離（セキュリティ、ネットワーク分離） |
| [worker-management.md](./worker-management.md) | ワーカー管理（スケーリング、ヘルスモニタリング） |

## 読む順序

1. `overview.md` — 全体像を把握
2. `execution-engine.md` — コア実行エンジンの仕組み
3. `orchestrator-server.md` — GUI連携APIの詳細
4. `ai-integration.md` — AI実行基盤との接続
5. `workflow-engine.md` — 5フェーズ業務フローの管理
6. `container-isolation.md` / `worker-management.md` — 詳細設計
