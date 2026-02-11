# Agent Execution Engine アーキテクチャ

## 概要

Agent Execution Engineは、AgentCompanyの中核となるエージェント実行システムです。社長（ユーザー）からの指示を受け取り、Manager Agentがタスクを分解してWorker Agentに割り振り、実際のコード生成・ファイル操作を行います。

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                        GUI / CLI                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │Dashboard │  │ Command  │  │  Review  │  │ Settings │        │
│  │          │  │  Center  │  │          │  │          │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                      Orchestrator                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Task Management                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │   │
│  │  │  Decomposer │  │ State Mgr   │  │ Error Hdlr  │       │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                        Agent Bus                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Message Queue Abstraction                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │   │
│  │  │ File-based  │  │   SQLite    │  │    Redis    │       │   │
│  │  │  (default)  │  │             │  │  (optional) │       │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────┴───────┐  ┌─────────┴─────────┐  ┌──────┴──────┐
│ Manager Agent │  │   Worker Pool     │  │  Reviewer   │
│               │  │  ┌─────────────┐  │  │   Agent     │
│  - 分解       │  │  │  Worker 1   │  │  │             │
│  - 割り当て   │  │  │  Container  │  │  │  - Review   │
│  - 監視       │  │  ├─────────────┤  │  │  - Conflict │
│               │  │  │  Worker 2   │  │  │             │
└───────────────┘  │  │  Container  │  │  └─────────────┘
                   │  ├─────────────┤  │
                   │  │  Worker N   │  │  ┌─────────────┐
                   │  │  Container  │  │  │   Merger    │
                   │  └─────────────┘  │  │   Agent     │
                   └───────────────────┘  │             │
                                          │  - Merge    │
                                          │  - PR作成   │
                                          └─────────────┘
```

## コンポーネント

### 1. Orchestrator

全体の制御を担当するコンポーネント。

- **Task Management**: タスクの管理と状態追跡
- **Decomposer**: 大きなタスクを独立したサブタスクに分解
- **State Manager**: 状態の永続化と復元（詳細は下記参照）
- **Error Handler**: エラーハンドリングとリトライ

#### State Manager

実行状態の永続化を担当するコンポーネント。システム再起動後も前回の作業状態を復元可能にする。

**永続化データ構造**:

```
runtime/state/
├── config.json              # システム設定
├── runs/                    # 実行状態（旧形式）
│   └── <run-id>.json
└── runs/                    # 実行永続化データ（新形式）
    └── <run-id>/
        └── state.json       # ExecutionPersistenceData
```

**ExecutionPersistenceData**:

```typescript
interface ExecutionPersistenceData {
  runId: string; // 実行ID
  ticketId: string; // チケットID
  status: 'running' | 'paused' | 'completed' | 'failed';
  workerStates: Record<string, WorkerState>; // ワーカー状態
  conversationHistories: Record<string, ConversationHistory>; // 会話履歴
  gitBranches: Record<string, string>; // Gitブランチ情報
  lastUpdated: string; // 最終更新日時
}
```

**主要機能**:

| メソッド                      | 説明                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `saveExecutionData()`         | 実行状態を `runtime/state/runs/<run-id>/state.json` に保存 |
| `loadExecutionData()`         | 実行状態を読み込み                                         |
| `updateWorkerState()`         | ワーカー状態を更新                                         |
| `updateConversationHistory()` | 会話履歴を更新                                             |
| `pauseExecution()`            | 実行を一時停止（状態を保存）                               |
| `resumeExecution()`           | 実行を再開（状態を復元）                                   |
| `findInProgressExecutions()`  | 進行中の実行を検出                                         |
| `restoreExecution()`          | 実行状態を復元                                             |

**一時停止・再開フロー**:

```
実行中 → pauseExecution() → 一時停止
         ↓
    状態を完全保存
    - workerStates
    - conversationHistories
    - gitBranches
         ↓
一時停止 → resumeExecution() → 実行中
         ↓
    状態を完全復元
```

### 2. Agent Bus

エージェント間の通信を担当するメッセージバス。

- **Message Queue Abstraction**: 複数のバックエンドをサポート
  - File-based（デフォルト）: `runtime/state/bus/`
  - SQLite: 高スループット向け
  - Redis: 分散デプロイ向け
- **Pull/Poll Model**: ワーカーは受信ポートを持たない

### 3. Worker Pool

ワーカーエージェントのプール管理。

- **並列実行制御**: 最大同時実行ワーカー数の制御
- **タスク割り当て**: 空きワーカーへのタスク割り当て
- **リソース管理**: CPU/メモリ制限の管理

### 4. Worker Container

各ワーカー専用の隔離されたDockerコンテナ。

- **隔離保証**: ワーカー間のファイル・ネットワーク隔離
- **クリーンスレート**: タスク完了後にコンテナを破棄
- **リソース制限**: CPU/メモリの制限

## コンテナランタイム選択

3つのランタイム方式をサポート：

### Docker-outside-of-Docker (DoD) - デフォルト

```
┌─────────────────────────────────────┐
│           Host System               │
│  ┌─────────────────────────────┐   │
│  │      Docker Daemon          │   │
│  │  ┌───────┐  ┌───────┐      │   │
│  │  │Worker1│  │Worker2│      │   │
│  │  └───────┘  └───────┘      │   │
│  └─────────────────────────────┘   │
│         ↑                          │
│    docker.sock                     │
│    (restricted)                    │
└─────────────────────────────────────┘
```

- ホストのDockerデーモンを使用
- `docker.sock`へのアクセスは制限（allowlist方式）
- ローカル開発向け

### Rootless Docker/Podman

```
┌─────────────────────────────────────┐
│           Host System               │
│  ┌─────────────────────────────┐   │
│  │   Rootless Docker/Podman    │   │
│  │  ┌───────┐  ┌───────┐      │   │
│  │  │Worker1│  │Worker2│      │   │
│  │  └───────┘  └───────┘      │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

- 特権アクセス不要
- セキュリティ重視の環境向け

### Docker-in-Docker (DIND)

```
┌─────────────────────────────────────┐
│           Host System               │
│  ┌─────────────────────────────┐   │
│  │      DIND Container         │   │
│  │  ┌─────────────────────┐   │   │
│  │  │   Docker Daemon     │   │   │
│  │  │  ┌───────┐ ┌───────┐│   │   │
│  │  │  │Worker1│ │Worker2││   │   │
│  │  │  └───────┘ └───────┘│   │   │
│  │  └─────────────────────┘   │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

- CI環境向け
- 明示的オプトインが必要

## Git認証方式

3つの認証方式をサポート：

### 1. Deploy Key（推奨）

```yaml
git_credentials:
  type: deploy_key
  private_key_path: /secrets/deploy_key
```

- 読み取り専用
- リポジトリごとに発行
- CI/CD向け

### 2. Repository-scoped Token

```yaml
git_credentials:
  type: token
  token: ${GIT_TOKEN}
```

- GitHub PAT / GitLab Token
- スコープを限定可能

### 3. SSH Agent Forwarding（開発環境のみ）

```yaml
git_credentials:
  type: ssh_agent
  socket_path: ${SSH_AUTH_SOCK}
```

- 開発環境でのみ使用
- 明示的オプトインが必要

## メッセージキュー方式

### File-based（デフォルト）

```
runtime/state/bus/
├── queues/
│   ├── worker-001/
│   │   ├── msg-001.json
│   │   └── msg-002.json
│   └── worker-002/
│       └── msg-001.json
└── history/
    └── run-xxx/
        └── msg-001.json
```

- 追加依存なし
- Windows/WSL2互換
- 小〜中規模向け

### SQLite

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  queue TEXT,
  payload TEXT,
  created_at TIMESTAMP
);
```

- 高スループット
- トランザクション保証

### Redis

```
LPUSH queue:worker-001 '{"type":"task_assign",...}'
BRPOP queue:worker-001 0
```

- 分散デプロイ
- 高可用性

## 設定

### システム設定

`runtime/state/config.json`:

```json
{
  "max_workers": 3,
  "worker_memory_limit": "2g",
  "command_timeout": 300,
  "ai_adapter": "ollama",
  "container_runtime": "dod",
  "message_queue": "file"
}
```

### プロジェクト設定

`workspaces/projects.json`:

```json
{
  "projects": [
    {
      "id": "my-app",
      "name": "My Application",
      "git_url": "https://github.com/user/my-app.git",
      "default_branch": "main",
      "integration_branch": "develop"
    }
  ]
}
```

## セキュリティ考慮事項

### ワーカー隔離

- ワーカー間のファイルシステム隔離
- ワーカー間のネットワーク隔離
- ホストファイルシステムへのアクセス制限

### Git認証

- `~/.ssh/`の直接マウント禁止
- Deploy keyまたはスコープ付きトークンを推奨
- SSH agent forwardingは開発環境のみ

### Docker操作

- DoD使用時のコマンド制限（allowlist方式）
- 許可コマンド: run, stop, rm, logs, inspect
- 他ワーカーへの影響を防止

## Autonomous Agent Workflow コンポーネント

### TicketManager

チケットの階層構造を管理するコンポーネント。

**場所**: `tools/cli/lib/execution/ticket-manager.ts`

```
ParentTicket（社長の指示）
├── ChildTicket（部長が分解）
│   ├── GrandchildTicket（実作業）
│   └── GrandchildTicket
└── ChildTicket
    └── GrandchildTicket
```

**主要機能**:

| メソッド                    | 説明                 |
| --------------------------- | -------------------- |
| `createParentTicket()`      | 親チケット作成       |
| `createChildTicket()`       | 子チケット作成       |
| `createGrandchildTicket()`  | 孫チケット作成       |
| `updateTicketStatus()`      | ステータス更新       |
| `propagateStatusToParent()` | 親へのステータス伝播 |

### WorkerTypeRegistry

ワーカータイプの定義と管理。

**場所**: `tools/cli/lib/execution/worker-type-registry.ts`

| タイプ      | 役割          |
| ----------- | ------------- |
| `research`  | 調査・分析    |
| `design`    | 設計          |
| `designer`  | UI/UXデザイン |
| `developer` | 実装          |
| `test`      | テスト        |
| `reviewer`  | レビュー      |

### PRCreator

Pull Request作成を担当するコンポーネント。

**場所**: `tools/cli/lib/execution/pr-creator.ts`

- PRタイトル形式: `[AgentCompany] <summary>`
- PR本文: overview, changes, test results, tickets

### ReviewWorkflow

レビューワークフローを管理するコンポーネント。

**場所**: `tools/cli/lib/execution/review-workflow.ts`

- レビュー依頼・結果送信
- 承認時: マージトリガー
- 却下時: フィードバック提供

## 関連ドキュメント

- [Orchestrator Server（GUI連携）](./orchestrator-server.md)
- [AI実行統合](./ai-integration.md)
- [Company Workflow Engine](./workflow-engine.md)
- [コンテナ隔離](./container-isolation.md)
- [ワーカー管理](./worker-management.md)
- [Autonomous Agent Workflow仕様](../specs/autonomous-agent-workflow.md)
- [AI実行統合仕様](../specs/ai-execution-integration.md)
- [Company Workflow Engine仕様](../specs/company-workflow-engine.md)
- [CLI README](../../tools/cli/README.md)
