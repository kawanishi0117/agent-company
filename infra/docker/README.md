# AgentCompany Docker環境

## 概要

AgentCompanyの実行環境をDockerで提供します。

- **Workspace**: 開発・テスト実行環境
- **Ollama**: ローカルLLM実行基盤

## クイックスタート

```bash
# 1. Docker環境を起動
docker compose -f infra/docker/compose.yaml up -d

# 2. Ollamaにモデルをインストール（初回のみ）
docker exec agentcompany-ollama ollama pull llama3.2:1b

# 3. デモを実行
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/demo.ts
```

## 推奨モデル

| モデル | サイズ | 用途 |
|--------|--------|------|
| `llama3.2:1b` | ~1GB | 軽量・高速（デモ向け） |
| `qwen2.5-coder:1.5b` | ~1GB | コード生成特化 |
| `llama3.2:3b` | ~2GB | バランス型 |
| `codellama:7b` | ~4GB | 高品質コード生成 |
| `deepseek-coder:6.7b` | ~4GB | 高性能コード生成 |

```bash
# モデルのインストール
docker exec agentcompany-ollama ollama pull <model-name>

# インストール済みモデルの確認
docker exec agentcompany-ollama ollama list
```

## コマンド一覧

```bash
# 環境起動
docker compose -f infra/docker/compose.yaml up -d

# 環境停止
docker compose -f infra/docker/compose.yaml down

# ログ確認
docker compose -f infra/docker/compose.yaml logs -f

# Workspace内でコマンド実行
docker compose -f infra/docker/compose.yaml exec workspace <command>

# 例: テスト実行
docker compose -f infra/docker/compose.yaml exec workspace npm run test

# 例: CLI実行
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/agentcompany.ts list
```

## MVP機能の試し方

### 1. デモスクリプト（推奨）

```bash
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/demo.ts
```

Ollamaとの接続確認、テキスト生成、チャット、コードレビューのデモを実行します。

### 2. チケット実行

```bash
# チケット一覧
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/agentcompany.ts list

# チケット実行
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/agentcompany.ts run workflows/backlog/0001-sample.md
```

### 3. 品質判定

```bash
# 判定実行
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/agentcompany.ts judge 2026-01-27-151426-q3me
```

### 4. 採用プロセス

```bash
# JD生成
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/agentcompany.ts hire jd "Developer"

# 採用フロー全体
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/agentcompany.ts hire full "QA Engineer" candidate.yaml
```

### 5. GUI

```bash
# ホストマシンで実行（Docker外）
cd gui/web && npm run dev
# http://localhost:3000 でアクセス
```

## 構成

```
infra/docker/
├── compose.yaml           # Docker Compose設定
├── images/
│   ├── base/
│   │   ├── Dockerfile     # ベースイメージ
│   │   ├── install.sh     # インストーラ
│   │   └── allowlist/     # 許可リスト
│   └── worker/
│       ├── Dockerfile     # ワーカーイメージ
│       └── entrypoint.sh  # エントリポイント
└── policies/              # セキュリティポリシー
```

## イメージ構成

### ベースイメージ (`agentcompany/base`)

開発・テスト実行環境の基盤イメージ。Node.js、Python、Git等の基本ツールを含む。

### ワーカーイメージ (`agentcompany/worker`)

エージェント実行エンジンのワーカーコンテナ用イメージ。

**特徴:**
- ベースイメージを継承
- Git認証（トークン、Deploy key）対応
- リポジトリを`/workspace`にclone（ホストbind mountではない）
- リソース制限（CPU、メモリ）設定可能
- ネットワーク隔離

**ビルド方法:**
```bash
# ベースイメージをビルド
docker build -t agentcompany/base:latest infra/docker/images/base/

# ワーカーイメージをビルド
docker build -t agentcompany/worker:latest infra/docker/images/worker/
```

**環境変数:**
| 変数名 | 説明 | 必須 |
|--------|------|------|
| `WORKER_ID` | ワーカーID | ○ |
| `RUN_ID` | 実行ID | - |
| `GIT_REPO_URL` | cloneするリポジトリURL | - |
| `GIT_BRANCH` | cloneするブランチ（デフォルト: main） | - |
| `GIT_TOKEN` | Git認証トークン（HTTPS用） | - |

## セキュリティ

- 非rootユーザー（`agent`）で実行
- ネットワーク隔離
- allowlist方式の依存管理

## GPU対応（オプション）

NVIDIA GPUを使用する場合、`compose.yaml`のollamaサービスで以下のコメントを解除：

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

## トラブルシューティング

### Ollamaに接続できない

```bash
# コンテナの状態確認
docker compose -f infra/docker/compose.yaml ps

# Ollamaのログ確認
docker logs agentcompany-ollama

# ヘルスチェック
curl http://localhost:11434/api/tags
```

### モデルのダウンロードが遅い

大きなモデルは時間がかかります。まず軽量モデル（`llama3.2:1b`）で試してください。

### メモリ不足

`compose.yaml`のリソース制限を調整するか、より小さいモデルを使用してください。

### E2Eテスト実行

```bash
# Playwrightブラウザインストール
docker compose -f infra/docker/compose.yaml exec workspace npx playwright install chromium

# E2Eテスト実行
docker compose -f infra/docker/compose.yaml exec workspace npm run e2e
```

### 全品質ゲート実行

```bash
docker compose -f infra/docker/compose.yaml exec workspace npm run ci
```
