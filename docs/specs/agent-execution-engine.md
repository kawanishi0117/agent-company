# Agent Execution Engine 仕様書

## 概要

Agent Execution Engineは、AgentCompanyの中核となるエージェント実行システムです。社長（ユーザー）からの大雑把な指示を受け取り、Manager Agentがタスクを分解してWorker Agentに割り振り、実際のコード生成・ファイル操作を行います。

## 機能一覧

### 1. エージェント階層

| エージェント   | 役割       | 責務                                 |
| -------------- | ---------- | ------------------------------------ |
| Manager Agent  | 上司       | タスク分解、割り当て、進捗監視       |
| Worker Agent   | 部下       | コード生成、ファイル操作、テスト実行 |
| Reviewer Agent | レビュアー | コードレビュー、コンフリクト解決     |
| Merger Agent   | マージ担当 | ブランチマージ、PR作成               |

### 2. タスク分解

- 大きな指示を独立したサブタスクに分解
- 依存関係のないタスクは並列実行可能
- サブタスクは `workflows/backlog/<parent-id>-<sub-id>.md` に保存

### 3. ワーカーコンテナ

- 各ワーカーは専用のDockerコンテナで作業
- ワーカー間のファイル・ネットワーク隔離
- タスク完了後にコンテナを破棄（クリーンスレート）

### 4. Git統合

- リポジトリのclone、ブランチ作成、コミット、プッシュ
- ブランチ命名: `agent/<ticket-id>-<description>`
- コミットメッセージ: `[<ticket-id>] <description>`

### 5. 品質ゲート

- タスク完了時に自動でlint/test実行
- 失敗時はManager Agentに通知
- 成功時はレビューに回す

### 6. GUI

| 画面           | パス          | 機能                                 |
| -------------- | ------------- | ------------------------------------ |
| Dashboard      | `/dashboard`  | リアルタイム監視、クイックアクション |
| Command Center | `/command`    | 指示入力、履歴表示                   |
| Task Detail    | `/tasks/[id]` | タスク詳細、介入操作                 |
| Review         | `/review`     | 成果物プレビュー、承認/却下          |
| Settings       | `/settings`   | システム設定                         |

### 7. CLI

```bash
# タスク実行
npx tsx tools/cli/agentcompany.ts execute <ticket-id>

# 実行状況確認
npx tsx tools/cli/agentcompany.ts status

# 実行制御
npx tsx tools/cli/agentcompany.ts stop <run-id>
npx tsx tools/cli/agentcompany.ts resume <run-id>

# プロジェクト管理
npx tsx tools/cli/agentcompany.ts project list
npx tsx tools/cli/agentcompany.ts project add <name> <git-url>
```

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

### コンテナランタイム

| 方式     | 説明                     | 用途                       |
| -------- | ------------------------ | -------------------------- |
| DoD      | Docker-outside-of-Docker | ローカル開発（デフォルト） |
| Rootless | Rootless Docker/Podman   | セキュリティ重視           |
| DIND     | Docker-in-Docker         | CI環境                     |

### Git認証

| 方式       | 説明                 | 用途          |
| ---------- | -------------------- | ------------- |
| Deploy Key | 読み取り専用キー     | CI/CD（推奨） |
| Token      | スコープ付きトークン | 汎用          |
| SSH Agent  | SSH agent forwarding | 開発環境のみ  |

### メッセージキュー

| 方式   | 説明               | 用途                     |
| ------ | ------------------ | ------------------------ |
| File   | ファイルベース     | 小〜中規模（デフォルト） |
| SQLite | SQLiteデータベース | 高スループット           |
| Redis  | Redisキュー        | 分散デプロイ             |

## ファイル構成

```
tools/cli/lib/execution/
├── types.ts              # 共通型定義
├── orchestrator.ts       # 全体制御
├── state-manager.ts      # 状態管理
├── agent-bus.ts          # エージェント間通信
├── message-queue.ts      # メッセージキュー
├── decomposer.ts         # タスク分解
├── process-monitor.ts    # コマンド監視
├── git-manager.ts        # Git操作
├── git-credentials.ts    # Git認証
├── worker-pool.ts        # ワーカープール
├── worker-container.ts   # ワーカーコンテナ
├── container-runtime.ts  # コンテナランタイム
├── tools.ts              # ツール呼び出し
├── quality-gate.ts       # 品質ゲート
├── error-handler.ts      # エラーハンドリング
├── project-manager.ts    # プロジェクト管理
└── agents/
    ├── manager.ts        # Manager Agent
    ├── worker.ts         # Worker Agent
    ├── reviewer.ts       # Reviewer Agent
    └── merger.ts         # Merger Agent
```

## 実行フロー

```
1. 社長が指示を入力（GUI/CLI）
       ↓
2. Manager Agentがタスクを分解
       ↓
3. Worker Agentにタスクを割り当て
       ↓
4. Worker Agentがコンテナ内で作業
       ↓
5. 品質ゲート実行（lint/test）
       ↓
6. Reviewer Agentがレビュー
       ↓
7. 社長が承認
       ↓
8. Merger Agentがマージ
```

## セキュリティ

### ワーカー隔離

- ワーカー間のファイルシステム隔離
- ワーカー間のネットワーク隔離
- ホストファイルシステムへのアクセス制限

### Git認証

- `~/.ssh/`の直接マウント禁止
- Deploy keyまたはスコープ付きトークンを推奨

### Docker操作

- DoD使用時のコマンド制限（allowlist方式）
- 許可コマンド: run, stop, rm, logs, inspect

## 関連ドキュメント

- [アーキテクチャ](../architecture/execution-engine.md)
- [CLI README](../../tools/cli/README.md)
- [コンテナ隔離](../architecture/container-isolation.md)
