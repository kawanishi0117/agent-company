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
- **State Manager**: 状態の永続化と復元
- **Error Handler**: エラーハンドリングとリトライ

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

## 関連ドキュメント

- [コンテナ隔離](./container-isolation.md)
- [ワーカー管理](./worker-management.md)
- [CLI README](../../tools/cli/README.md)
