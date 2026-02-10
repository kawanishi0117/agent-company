# AgentCompany クイックスタートガイド

このガイドでは、AgentCompanyを最短で動かすための手順を説明します。

## 前提条件

- Node.js 18.17以上
- Docker Desktop（または Docker Engine + Docker Compose）
- Git

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd agent-company
```

### 2. 依存パッケージのインストール

```bash
# ルートプロジェクト
npm install

# GUI
cd gui/web && npm install && cd ../..
```

### 3. Docker環境の起動

```bash
docker compose -f infra/docker/compose.yaml up -d
```

### 4. AIモデルのインストール（初回のみ）

```bash
# 軽量モデル（推奨）
docker exec agentcompany-ollama ollama pull llama3.2:1b

# または高品質モデル
docker exec agentcompany-ollama ollama pull codellama:7b
```

### 5. 動作確認

```bash
# 品質ゲート実行
make ci

# デモスクリプト実行
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/demo.ts
```

## 基本的な使い方

### チケット管理

```bash
# チケット一覧を表示
npx tsx tools/cli/agentcompany.ts list

# チケットを実行
npx tsx tools/cli/agentcompany.ts run workflows/backlog/0001-sample.md
```

### エージェント実行

```bash
# タスクを実行
npx tsx tools/cli/agentcompany.ts execute 0001-sample

# 実行状況を確認
npx tsx tools/cli/agentcompany.ts status

# 実行を停止
npx tsx tools/cli/agentcompany.ts stop <run-id>
```

### 品質判定

```bash
# 判定を実行
npx tsx tools/cli/agentcompany.ts judge <run-id>

# Waiverを作成
npx tsx tools/cli/agentcompany.ts waiver create "テストカバレッジ例外"
```

### GUI ダッシュボード

```bash
cd gui/web && npm run dev
# http://localhost:3000 でアクセス
```

| 画面           | URL          | 説明                 |
| -------------- | ------------ | -------------------- |
| Dashboard      | `/dashboard` | リアルタイム実行状況 |
| Command Center | `/command`   | タスク投入           |
| Backlog        | `/backlog`   | カンバンボード       |
| Runs           | `/runs`      | 実行履歴             |
| Reports        | `/reports`   | レポート             |
| Settings       | `/settings`  | 設定                 |

## Docker内での実行

```bash
# コンテナ内でコマンド実行
docker compose -f infra/docker/compose.yaml exec workspace <command>

# 例: テスト実行
docker compose -f infra/docker/compose.yaml exec workspace npm run test

# 例: CLI実行
docker compose -f infra/docker/compose.yaml exec workspace npx tsx tools/cli/agentcompany.ts list
```

## チケットの作成

`workflows/backlog/` にMarkdownファイルを作成：

```markdown
---
id: '0002'
title: '新機能の実装'
status: 'todo'
assignee: ''
priority: 'medium'
---

# 新機能の実装

## 概要

[何をするか]

## 受け入れ基準

- [ ] 基準1
- [ ] 基準2
```

## プロジェクトの追加

```bash
# プロジェクトを追加
npx tsx tools/cli/agentcompany.ts project add my-app https://github.com/user/my-app.git

# プロジェクト一覧
npx tsx tools/cli/agentcompany.ts project list
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

### テストが失敗する

```bash
# Playwrightブラウザをインストール
npx playwright install chromium

# 個別にテスト実行
npm run lint
npm run test
npm run e2e
```

### メモリ不足

`infra/docker/compose.yaml` のリソース制限を調整するか、より小さいモデルを使用してください。

## 次のステップ

- [README.md](README.md) - プロジェクト概要
- [MVP.md](MVP.md) - MVPロードマップ
- [tools/cli/README.md](tools/cli/README.md) - CLI詳細
- [gui/web/README.md](gui/web/README.md) - GUI詳細
- [docs/architecture/](docs/architecture/) - アーキテクチャ設計
