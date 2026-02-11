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

## Orchestrator Server（GUI連携）

GUIからOrchestratorを制御するためのHTTP APIサーバー。

**場所**: `tools/cli/lib/execution/orchestrator-server.ts`

### 起動方法

```bash
# デフォルトポート（3001）で起動
agentcompany server

# カスタムポートで起動
agentcompany server --port 8080
```

### APIエンドポイント

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

### GUI連携フロー

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

### 環境変数

| 変数名               | 説明                    | デフォルト              |
| -------------------- | ----------------------- | ----------------------- |
| `ORCHESTRATOR_API_URL` | GUI側のAPI接続先      | `http://localhost:3001` |

## AI実行統合アーキテクチャ

### 概要

AI実行統合は、既存のAgent Execution Engineに対してAI実行基盤（Ollama）との接続、品質ゲートの自動実行、成果物管理、設定管理を追加する拡張機能である。ユーザー（社長）がGUIからタスクを送信すると、AIエージェントが自律的に作業を開始し、コードを生成・修正して品質ゲートを通過させ、成果物をレポートとして確認できる。

### システム構成図

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GUI Layer (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Command      │  │  Dashboard   │  │   Settings   │              │
│  │ Center       │  │              │  │              │              │
│  │ (タスク送信) │  │ (状態監視)   │  │ (AI設定管理) │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼──────────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │ HTTP (port 3001)
┌───────────────────────────┼─────────────────────────────────────────┐
│                    API Layer                                         │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Orchestrator Server                               │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │ │
│  │  │ /api/tasks   │  │/api/health/ai│  │ /api/config  │         │ │
│  │  │ (タスク送信) │  │(AI可用性)    │  │ (設定管理)   │         │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │ │
│  │  │/api/runs/:id │  │/api/dashboard│  │/api/config/  │         │ │
│  │  │(成果物取得)  │  │/status       │  │validate      │         │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────┐
│                    Core Layer                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Orchestrator │  │ Manager      │  │ Settings     │              │
│  │              │  │ Agent        │  │ Manager      │              │
│  │ - タスク管理 │  │ - タスク分解 │  │ - バリデーション│           │
│  │ - 状態追跡   │  │ - ワーカー   │  │ - ホットリロード│           │
│  │ - エラー処理 │  │   割り当て   │  │              │              │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘              │
└─────────┼─────────────────┼─────────────────────────────────────────┘
          │                 │
┌─────────┼─────────────────┼─────────────────────────────────────────┐
│         │          Worker Layer                                      │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Worker Agent │  │ Tool         │  │ Run Directory│              │
│  │              │  │ Executor     │  │ Manager      │              │
│  │ - AI会話     │  │ - read_file  │  │ - ディレクトリ│             │
│  │ - ツール実行 │  │ - write_file │  │   作成       │              │
│  │ - 品質ゲート │  │ - run_command│  │ - メタデータ │              │
│  │   フィードバック│ └──────────────┘  │   永続化     │              │
│  └──────┬───────┘                     └──────────────┘              │
└─────────┼───────────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────────────┐
│         │           AI Layer                                         │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ AI Health    │  │ Ollama       │  │ Ollama       │              │
│  │ Checker      │  │ Adapter      │  │ Server       │              │
│  │              │  │              │  │              │              │
│  │ - 可用性確認 │  │ - generate() │  │ (port 11434) │              │
│  │ - モデル確認 │  │ - chat()     │  │              │              │
│  │ - セットアップ│  │ - isAvailable│  │              │              │
│  │   手順提供   │  │              │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────────────┐
│         │        Quality Layer                                       │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Quality Gate │  │ ESLint       │  │ Vitest       │              │
│  │ Integration  │  │ (lint)       │  │ (test)       │              │
│  │              │  │              │  │              │              │
│  │ - 自動実行   │  └──────────────┘  └──────────────┘              │
│  │ - 結果永続化 │                                                   │
│  │ - フィードバック│  ┌──────────────┐                              │
│  │   ループ     │  │ Execution    │                                │
│  └──────────────┘  │ Reporter     │                                │
│                     │ - レポート生成│                                │
│                     │ - 成果物収集 │                                │
│                     └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 新規コンポーネント

AI実行統合で追加された新規コンポーネントの一覧と役割。

#### AIHealthChecker

**場所**: `tools/cli/lib/execution/ai-health-checker.ts`

AI実行基盤（Ollama）の可用性を確認するコンポーネント。

| 機能 | 説明 |
|------|------|
| Ollama可用性チェック | `/api/tags` エンドポイントへの疎通確認 |
| インストール済みモデル取得 | Ollama APIからモデル一覧を取得 |
| セットアップ手順提供 | 未起動時・モデル未インストール時のガイダンス |
| タイムアウト制御 | デフォルト5秒のタイムアウト付きfetch |

**主要メソッド**:

| メソッド | 説明 |
|----------|------|
| `checkOllamaAvailability()` | Ollamaの起動状態とモデル確認を行い、AIHealthStatusを返す |
| `getInstalledModels()` | インストール済みモデル名の配列を返す |
| `getModelInstallCommands()` | 推奨モデルのインストールコマンドを返す |
| `getHealthStatus()` | checkOllamaAvailabilityのエイリアス |

**推奨モデル**: `llama3.2:1b`, `codellama`, `qwen2.5-coder`

**AIHealthStatus構造**:

```typescript
interface AIHealthStatus {
  available: boolean;        // AI実行基盤が利用可能か
  ollamaRunning: boolean;    // Ollamaが起動しているか
  modelsInstalled: string[]; // インストール済みモデル一覧
  recommendedModels: string[]; // 推奨モデル一覧
  setupInstructions?: string;  // セットアップ手順（利用不可時）
  lastChecked: string;       // 最終チェック日時（ISO8601）
}
```

#### RunDirectoryManager

**場所**: `tools/cli/lib/execution/run-directory-manager.ts`

タスク実行ごとのディレクトリ作成とメタデータ永続化を担当するコンポーネント。

| 機能 | 説明 |
|------|------|
| ディレクトリ作成 | `runtime/runs/<run-id>/` と `artifacts/` サブディレクトリを作成 |
| メタデータ保存 | `task.json` にタスクメタデータをJSON形式で保存 |
| メタデータ読み込み | `task.json` からメタデータを復元 |
| RunID生成 | `run-<timestamp(base36)>-<random(hex)>` 形式のユニークID生成 |

**主要メソッド**:

| メソッド | 説明 |
|----------|------|
| `createRunDirectory(runId)` | 実行ディレクトリとartifactsサブディレクトリを作成 |
| `saveTaskMetadata(runId, metadata)` | タスクメタデータをtask.jsonに保存 |
| `loadTaskMetadata(runId)` | task.jsonからメタデータを読み込み（存在しない場合はnull） |
| `generateRunId()` | ユニークな実行IDを生成 |
| `exists(runId)` | 実行ディレクトリの存在確認 |

#### QualityGateIntegration

**場所**: `tools/cli/lib/execution/quality-gate-integration.ts`

品質ゲート（lint/test）の自動実行、結果永続化、フィードバックループを担当するコンポーネント。

| 機能 | 説明 |
|------|------|
| lint自動実行 | ESLintによる静的解析の自動実行 |
| test自動実行 | Vitestによるユニットテストの自動実行 |
| 結果永続化 | `quality.json` への品質ゲート結果の保存 |
| フィードバック生成 | 失敗時のエラー詳細とアクション提案の生成 |

**主要メソッド**:

| メソッド | 説明 |
|----------|------|
| `runLint(workspacePath)` | lint実行、QualityCheckResultを返す |
| `runTests(workspacePath)` | test実行、QualityCheckResultを返す |
| `runAllChecks(workspacePath)` | lint→testの順序で全チェック実行 |
| `saveResults(runId, results)` | 品質ゲート結果をquality.jsonに保存 |
| `loadResults(runId)` | quality.jsonから結果を読み込み |
| `generateFeedback(results)` | 失敗時のフィードバック情報を生成 |

**品質ゲートフィードバックループ**:

```
コード変更完了
    ↓
runAllChecks() 実行
    ↓
lint実行 → 失敗? → フィードバック生成 → Worker Agentに送信
    ↓ 成功                                    ↓
test実行 → 失敗? → フィードバック生成 → Worker Agentに送信
    ↓ 成功                                    ↓
品質ゲート通過                          修正ループ（最大3回）
```

#### ExecutionReporter

**場所**: `tools/cli/lib/execution/execution-reporter.ts`

実行結果のレポート生成と成果物収集を担当するコンポーネント。

| 機能 | 説明 |
|------|------|
| レポート生成 | タスク説明、変更点、テスト結果、会話サマリーを含むレポートデータ生成 |
| Markdownレンダリング | ReportDataをMarkdown形式の文字列に変換 |
| レポート保存 | `report.md` への保存 |
| 成果物収集 | 変更ファイルの `artifacts/` ディレクトリへのコピー |

**主要メソッド**:

| メソッド | 説明 |
|----------|------|
| `generateReport(runId, result)` | ExecutionResultからReportDataを生成 |
| `saveReport(runId, report)` | レポートをMarkdown形式でreport.mdに保存 |
| `collectArtifacts(runId, artifacts)` | 成果物をartifactsディレクトリにコピー |
| `renderMarkdown(report)` | ReportDataをMarkdown文字列に変換 |

**レポート内容**:

| セクション | 内容 |
|-----------|------|
| タスク概要 | タスクID、説明、ステータス |
| 実行時間 | 開始・終了時刻、所要時間 |
| 変更点 | 作成・変更・削除されたファイル一覧 |
| テスト結果 | lint/testの合否、テスト数、カバレッジ |
| 会話サマリー | AIとの会話ターン数、トークン使用量 |
| 成果物一覧 | 収集された成果物ファイルのリスト |

### AI実行フロー

ユーザーがGUIからタスクを送信してから成果物が生成されるまでの完全なフロー。

```
1. タスク送信
   ユーザー → Command Center → POST /api/tasks → Orchestrator Server
                                                        │
2. AI可用性チェック                                      │
   Orchestrator Server → AIHealthChecker                │
   ├── Ollama未起動 → エラーレスポンス（セットアップ手順付き）
   ├── モデル未インストール → エラーレスポンス（インストールコマンド付き）
   └── 正常 → 続行                                      │
                                                        │
3. 実行ディレクトリ作成                                  │
   RunDirectoryManager → runtime/runs/<run-id>/         │
   └── task.json にメタデータ保存                        │
                                                        │
4. タスク分解                                            │
   Orchestrator → Manager Agent → タスク分解             │
   └── サブタスクをWorker Agentに割り当て                │
                                                        │
5. AI会話ループ（最大30ターン）                          │
   Worker Agent ←→ Ollama Adapter ←→ Ollama Server      │
   ├── AIレスポンス解析                                  │
   ├── ツール呼び出し（read_file, write_file, run_command等）
   └── 結果をAIにフィードバック                          │
                                                        │
6. 品質ゲート実行                                        │
   Worker Agent → QualityGateIntegration                │
   ├── lint実行（ESLint）                                │
   ├── test実行（Vitest）                                │
   ├── 結果をquality.jsonに保存                          │
   └── 失敗時: フィードバック → 修正ループ（最大3回）    │
                                                        │
7. レポート生成・成果物収集                              │
   ExecutionReporter                                    │
   ├── report.md 生成                                   │
   ├── 変更ファイルをartifacts/にコピー                  │
   └── 完了通知 → Dashboard更新                          │
```

### エラーハンドリング戦略

#### エラーカテゴリ

| カテゴリ | 説明 | 対応 |
|---------|------|------|
| `ai_unavailable` | AI実行基盤（Ollama）が利用不可 | セットアップ手順を表示、実行を一時停止 |
| `ai_timeout` | AIレスポンスのタイムアウト | リトライ（指数バックオフ） |
| `tool_execution` | ツール実行エラー（ファイル操作等） | AIにエラーを報告し、続行を試みる |
| `quality_gate` | 品質ゲート失敗（lint/test） | AIにフィードバックを送信、修正ループ |
| `persistence` | 状態保存エラー（ディスク等） | リトライ後、緊急停止 |

#### Graceful Degradation

AI実行基盤が利用不可になった場合の動作：

1. **タスク送信時**: AIHealthCheckerが可用性を確認し、利用不可の場合はセットアップ手順付きのエラーレスポンスを返す
2. **実行中の切断**: 現在の実行状態を保存し、一時停止状態に遷移。ユーザーに通知する
3. **復旧後**: 保存された状態から実行を再開可能

#### リトライ戦略

指数バックオフによるリトライを実装：

| パラメータ | 値 |
|-----------|-----|
| 最大リトライ回数 | 3回 |
| 初回待機時間 | 1秒 |
| バックオフ倍率 | 2倍 |
| 最大待機時間 | 4秒 |

```
1回目失敗 → 1秒待機 → リトライ
2回目失敗 → 2秒待機 → リトライ
3回目失敗 → 4秒待機 → リトライ
4回目失敗 → 永続的失敗 → 失敗レポート生成
```

#### エラーログ

全てのエラーは `runtime/runs/<run-id>/errors.log` に記録される。永続的失敗時には失敗レポートが自動生成される。

### API拡張（AI統合関連）

AI実行統合で追加・拡張されたAPIエンドポイント。

#### ヘルスチェック

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/health/ai` | AI可用性ステータスを返す |

**レスポンス例**:

```json
{
  "success": true,
  "data": {
    "available": true,
    "ollamaRunning": true,
    "modelsInstalled": ["llama3.2:1b", "codellama"],
    "recommendedModels": ["llama3.2:1b", "codellama", "qwen2.5-coder"]
  }
}
```

#### タスク送信（AI可用性チェック統合）

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/tasks` | タスク送信（AI可用性チェック付き） |

タスク送信時にAIHealthCheckerで可用性を確認し、利用不可の場合はセットアップ手順付きのエラーレスポンスを返す。

**リクエスト例**:

```json
{
  "instruction": "ユーザー認証機能を実装してください",
  "projectId": "my-app"
}
```

**成功レスポンス例**:

```json
{
  "success": true,
  "data": {
    "taskId": "task-abc123",
    "runId": "run-m1abc-def456",
    "runDirectory": "runtime/runs/run-m1abc-def456"
  }
}
```

#### 実行結果取得

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/runs/:runId/report` | 実行レポート（Markdown）を取得 |
| GET | `/api/runs/:runId/artifacts` | 成果物一覧を取得 |
| GET | `/api/runs/:runId/quality` | 品質ゲート結果を取得 |

#### 設定管理

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/config` | 現在の設定を取得 |
| PUT | `/api/config` | 設定を更新（バリデーション付き） |
| POST | `/api/config/validate` | 設定のバリデーションのみ実行 |

#### ダッシュボード

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/dashboard/status` | ダッシュボード統合情報（AI状態、成功率含む） |

**レスポンスに含まれる情報**:

- アクティブワーカー数と現在のタスク
- 待機中タスクキューの長さ
- 完了タスク数と成功率
- AI可用性ステータス

### 設定管理

#### SettingsManager

**場所**: `tools/cli/lib/execution/settings-manager.ts`

AI実行に関する設定のバリデーションとホットリロードを担当するコンポーネント。

| 機能 | 説明 |
|------|------|
| 設定バリデーション | AIアダプタ、モデル、ホストURLの検証 |
| ホットリロード | ファイル監視による再起動なしの設定適用 |
| 設定読み込み・保存 | `runtime/state/config.json` の読み書き |

**主要メソッド**:

| メソッド | 説明 |
|----------|------|
| `loadSettings(configPath?)` | 設定ファイルを読み込み |
| `saveSettings(config, configPath?)` | バリデーション後に設定を保存 |
| `validateAISettings(config)` | AI関連設定のバリデーション |
| `watchSettings(configPath, callback)` | ファイル変更を監視し、変更時にコールバック実行 |
| `stopWatching()` | ファイル監視を停止 |
| `applySettings(config)` | 設定を即座に適用 |
| `getCurrentConfig()` | 現在の設定を取得 |

**設定項目**:

| 項目 | 説明 | デフォルト値 |
|------|------|-------------|
| `ai_adapter` | AIアダプタの種類 | `"ollama"` |
| `model` | 使用するAIモデル | `"llama3.2:1b"` |
| `ollama_host` | OllamaサーバーのURL | `"http://localhost:11434"` |
| `max_workers` | 最大同時実行ワーカー数 | `3` |
| `command_timeout` | コマンドタイムアウト（秒） | `300` |

**バリデーションルール**:

- `ai_adapter`: 許可されたアダプタ名のみ（現在は `"ollama"` のみ）
- `ollama_host`: 有効なURL形式（`http://` または `https://` で始まる）
- `model`: 空文字列でないこと

### データモデル

#### 実行ディレクトリ構造

各タスク実行は `runtime/runs/<run-id>/` 配下に独立したディレクトリを持つ。

```
runtime/runs/<run-id>/
├── task.json           # タスクメタデータ
├── conversation.json   # AIとの会話履歴
├── quality.json        # 品質ゲート結果
├── report.md           # 実行レポート（Markdown）
├── errors.log          # エラーログ
└── artifacts/          # 成果物（変更されたファイルのコピー）
    ├── src/
    │   └── feature.ts
    └── tests/
        └── feature.test.ts
```

#### タスクメタデータ（task.json）

```typescript
interface RunTaskMetadata {
  taskId: string;       // タスクID
  runId: string;        // 実行ID
  projectId: string;    // プロジェクトID
  instruction: string;  // タスク指示内容
  status: TaskStatus;   // 実行ステータス
  createdAt: string;    // 作成日時（ISO8601）
  updatedAt: string;    // 更新日時（ISO8601）
  aiAdapter: string;    // 使用AIアダプタ
  model: string;        // 使用AIモデル
}
```

#### 品質ゲート結果（quality.json）

```typescript
interface QualityGateResultData {
  runId: string;        // 実行ID
  timestamp: string;    // 実行日時
  lint: {
    passed: boolean;    // lint合否
    output: string;     // lint出力
    errorCount: number; // エラー数
    warningCount: number; // 警告数
  };
  test: {
    passed: boolean;    // test合否
    output: string;     // test出力
    totalTests: number; // 総テスト数
    passedTests: number; // 合格テスト数
    failedTests: number; // 失敗テスト数
    coverage?: number;  // カバレッジ（%）
  };
  overall: boolean;     // 総合合否
}
```

#### 実行レポート（report.md）

Markdown形式のレポートで、以下のセクションを含む：

1. **タスク概要**: タスクID、説明、ステータス
2. **実行時間**: 開始・終了時刻、所要時間
3. **変更点**: 作成・変更・削除されたファイル一覧
4. **テスト結果**: lint/testの合否サマリー
5. **会話サマリー**: AIとの会話ターン数、トークン使用量
6. **成果物一覧**: 収集された成果物ファイルのリスト

## 関連ドキュメント

- [コンテナ隔離](./container-isolation.md)
- [ワーカー管理](./worker-management.md)
- [Autonomous Agent Workflow仕様](../specs/autonomous-agent-workflow.md)
- [AI実行統合仕様](../specs/ai-execution-integration.md)
- [Company Workflow Engine仕様](../specs/company-workflow-engine.md)
- [CLI README](../../tools/cli/README.md)

## Company Workflow Engine

### 概要

Company Workflow Engineは、業務フローを5フェーズ（提案→承認→開発→品質確認→納品）で管理するエンジン。エージェント間の会議プロセス、CEO承認ゲート、エスカレーション管理を統合する。

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                     GUI Layer (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Workflows    │  │  Dashboard   │  │  Navigation  │          │
│  │ 一覧/詳細    │  │ 承認通知     │  │ 通知バッジ   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │ HTTP (port 3001)
┌───────────────────────────┼─────────────────────────────────────┐
│              Orchestrator Server                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /api/workflows/*  (ワークフローAPI)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    Workflow Engine                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Workflow     │  │ Meeting      │  │ Approval     │          │
│  │ Engine       │  │ Coordinator  │  │ Gate         │          │
│  │              │  │              │  │              │          │
│  │ - 5フェーズ  │  │ - 会議開催   │  │ - 承認要求   │          │
│  │ - 状態管理   │  │ - 議事録生成 │  │ - 決定処理   │          │
│  │ - ロールバック│  │ - AgentBus   │  │ - 永続化     │          │
│  │ - エスカレーション│ └──────────────┘  └──────────────┘          │
│  └──────┬───────┘                                               │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ├── Orchestrator (タスク管理)
          ├── Manager Agent (タスク分解)
          ├── Worker Pool (ワーカー割り当て)
          ├── Review Workflow (レビュー)
          ├── Quality Gate Integration (品質チェック)
          └── PR Creator (PR作成)
```

### フェーズ遷移

```
proposal ──→ approval ──→ development ──→ quality_assurance ──→ delivery
    ↑            │              ↑                │                  │
    │            │              │                │                  │
    │      reject/revision      │          QA失敗                   │
    │            │              └────────────────┘            revision
    │            ↓                                                 │
    └──── terminated                                               │
                                                                   ↓
                                                              development
```

### コンポーネント詳細

#### WorkflowEngine

**場所**: `tools/cli/lib/execution/workflow-engine.ts`

ファクトリ関数 `createWorkflowEngine(meetingCoordinator, approvalGate, basePath)` で生成。

| メソッド | 説明 |
|----------|------|
| `startWorkflow()` | ワークフロー開始、proposalフェーズへ遷移 |
| `listWorkflows()` | 全ワークフロー一覧（statusフィルタ対応） |
| `getProgress()` | 開発進捗取得（SubtaskProgress一覧） |
| `getQualityResults()` | 品質結果取得 |
| `rollbackToPhase()` | フェーズロールバック |
| `terminateWorkflow()` | ワークフロー終了 |
| `handleEscalation()` | エスカレーション処理（retry/skip/abort） |
| `restoreWorkflows()` | 状態復元 |

#### MeetingCoordinator

**場所**: `tools/cli/lib/execution/meeting-coordinator.ts`

ファクトリ関数 `createMeetingCoordinator(agentBus, basePath)` で生成。

- ラウンド制の議論ループ
- 会議録（MeetingMinutes）の永続化
- `runtime/runs/<run-id>/meeting-minutes/<meeting-id>.json`

#### ApprovalGate

**場所**: `tools/cli/lib/execution/approval-gate.ts`

ファクトリ関数 `createApprovalGate(basePath)` で生成。

- Promise ベースの承認待ち機構
- 承認決定の永続化: `runtime/runs/<run-id>/approvals.json`
- `cancelApproval()` でロールバック時の承認キャンセル

### 永続化データ

```
runtime/runs/<run-id>/
├── workflow.json                    # ワークフロー状態
├── approvals.json                   # 承認履歴
└── meeting-minutes/                 # 会議録
    └── <meeting-id>.json
```

### Orchestrator統合

OrchestratorのコンストラクタでWorkflowEngine、MeetingCoordinator、ApprovalGateをオプショナルに初期化。getterメソッド（`getWorkflowEngine()`, `getMeetingCoordinator()`, `getApprovalGate()`）で外部からアクセス可能。


## エンドツーエンド ワークフロー接続

### 概要

GUI Command Center → OrchestratorServer → WorkflowEngine → CodingAgent の完全フローを実現する接続レイヤー。CEO がブラウザから自然言語で指示を出し、エージェントが自律的にコーディング作業を実行する。

### フロー図

```
┌─────────────────────────────────────────────────────────────────┐
│                     GUI Layer (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Command      │  │  Workflows   │  │  Dashboard   │          │
│  │ Center       │  │  一覧/詳細   │  │  ステータス  │          │
│  │ (CEO指示)    │  │  (承認操作)  │  │  (監視)      │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                       │
│  POST /api/command (Next.js API Route)                          │
│         │                                                       │
│         ├─ チケットファイル作成 (workflows/backlog/)              │
│         │                                                       │
│         └─ POST /api/workflows → OrchestratorServer              │
└─────────┼───────────────────────────────────────────────────────┘
          │ HTTP (port 3001)
┌─────────┼───────────────────────────────────────────────────────┐
│         │        Orchestrator Server                             │
│  ┌──────┴──────────────────────────────────────────────────┐    │
│  │  handleStartWorkflow()                                   │    │
│  │    ├─ AI可用性チェック (Ollama OR CodingAgent)            │    │
│  │    └─ WorkflowEngine.startWorkflow(instruction, projId)  │    │
│  └──────┬──────────────────────────────────────────────────┘    │
│         │                                                       │
│  ┌──────┴──────────────────────────────────────────────────┐    │
│  │  CodingAgentRegistry (globalCodingAgentRegistry)         │    │
│  │    ├─ ClaudeCodeAdapter                                  │    │
│  │    ├─ OpenCodeAdapter                                    │    │
│  │    └─ KiroCliAdapter                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────┬───────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────────┐
│         │        Workflow Engine (5フェーズ)                      │
│  ┌──────┴──────────────────────────────────────────────────┐    │
│  │  1. proposal     → MeetingCoordinator (Ollama)          │    │
│  │  2. approval     → ApprovalGate (CEO承認待ち)            │    │
│  │  3. development  → CodingAgentAdapter.execute()          │    │
│  │  4. QA           → Quality Gate (lint/test)              │    │
│  │  5. delivery     → ApprovalGate (CEO最終承認)            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### AI可用性チェック

OrchestratorServer はタスク送信時に AI の可用性を OR 条件で判定する。

| Ollama | CodingAgent | 結果 |
|--------|-------------|------|
| ✅ | ✅ | 送信許可 |
| ✅ | ❌ | 送信許可 |
| ❌ | ✅ | 送信許可（警告付き） |
| ❌ | ❌ | 503 エラー |

### 関連ドキュメント

- [エンドツーエンド ワークフロー接続 仕様](../specs/end-to-end-workflow-wiring.md)
- [Coding Agent Integration 仕様](../specs/coding-agent-integration.md)


---

## ワークフロー本番対応

### 概要

ワークフローの各フェーズをシミュレーションから本番実装に移行し、
CodingAgent CLI（claude, opencode, kiro）を活用した実際のコード生成・レビュー・品質チェックを実現する。
CodingAgent が未インストールの場合はシミュレーションにフォールバックし、GUI に警告を表示する。

### QA フェーズ（品質確認）

`executeQualityAssurancePhase()` は CodingAgent の可用性に応じて動作を切り替える。

| CodingAgent | 動作 |
|-------------|------|
| 利用可能 | `make lint` / `make test` を CodingAgent 経由で実行し、実際の結果を取得 |
| 利用不可 | シミュレーション結果（lint: PASS, test: PASS）で自動通過 |

```
CodingAgent利用時:
  1. resolveWorkingDirectory() でプロジェクトの作業ディレクトリを取得
  2. CodingAgent に lint 実行プロンプトを送信（timeout: 120s）
  3. CodingAgent に test 実行プロンプトを送信（timeout: 300s）
  4. 結果を QualityResults に保存
  5. lint/test 両方 PASS → delivery フェーズへ遷移
  6. いずれか FAIL → development フェーズへ差し戻し
```

### レビューフェーズ（コードレビュー）

`executeCodeReview()` は開発フェーズ内の各サブタスク完了後に呼び出される。

| CodingAgent | 動作 |
|-------------|------|
| 利用可能 | レビュープロンプトを送信し、出力から APPROVED/NEEDS_REVISION を判定 |
| 利用不可 | 即承認（フォールバック） |

```
レビュープロンプト:
  - 直近の git commit の変更内容をレビュー
  - 品質・可読性・エラーハンドリング・セキュリティ・テストを確認
  - 問題なし → "APPROVED" を出力
  - 修正必要 → "NEEDS_REVISION" を出力

判定ロジック:
  - 出力に "NEEDS_REVISION" を含む → needs_revision → エスカレーション生成
  - それ以外 → approved → タスク完了
  - 実行エラー時 → approved（ブロッキング回避）
```

### エスカレーション→再開フロー

`handleEscalation()` の retry/skip 決定後、`executePhase()` を再呼び出しして開発フェーズを再開する。

```
retry:
  1. 失敗タスクのステータスを 'pending' に戻す
  2. エスカレーションをクリア、ステータスを 'running' に変更
  3. executePhase() を呼び出し

skip:
  1. 失敗タスクのステータスを 'skipped' に変更
  2. エスカレーションをクリア、ステータスを 'running' に変更
  3. executePhase() を呼び出し

executeDevelopmentPhase() の再実行時:
  - 既存の state.progress を再利用（初期化しない）
  - completed/skipped ステータスのタスクはスキップ
  - pending/failed のタスクのみ実行
```

### GUI SystemHealthBanner

Dashboard と Command Center に `SystemHealthBanner` コンポーネントを配置。
以下の3項目の可用性を個別に表示する。

| 項目 | 正常時 | 異常時 |
|------|--------|--------|
| Orchestrator Server | 「接続中」 | 「未接続 — `agentcompany server` で起動してください」 |
| コーディングエージェント | 「利用可能: claude, ...」 | 「未検出 — claude, opencode, kiro のいずれかをインストールしてください」 |
| Ollama | 「起動中」 | 「未起動 — 提案フェーズではテンプレートベースで動作します」 |

- CodingAgent 未検出 or Orchestrator 未接続 → 赤枠（error）
- Ollama のみ未起動 → 黄枠（warning）
- 全て正常 → バナー非表示
- 閉じるボタンで一時的に非表示可能
- Settings ページへの誘導リンク付き

### 関連ドキュメント

- [ワークフロー本番対応 仕様](../specs/workflow-production-ready.md)
