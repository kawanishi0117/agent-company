---
inclusion: always
---

# 技術スタック

## 言語・ランタイム

| 項目       | バージョン | 用途                |
| ---------- | ---------- | ------------------- |
| Node.js    | 20.x       | CLI、テスト、ビルド |
| TypeScript | 5.3+       | 全TypeScriptコード  |
| Python     | 3.x        | Docker内スクリプト  |

## 実行基盤

### Docker

- **ベースイメージ**: `node:20-slim`
- **Compose**: `infra/docker/compose.yaml`
- **隔離**: seccomp, no-new-privileges, cap_drop ALL
- **リソース制限**: CPU 2コア、メモリ 4GB

### コンテナ構成

| サービス  | 役割                     | ポート |
| --------- | ------------------------ | ------ |
| ollama    | ローカルLLM実行基盤      | 11434  |
| workspace | 開発・実行環境           | -      |
| worker    | ワーカーエージェント実行 | -      |

## GUI

| 項目           | 技術                      |
| -------------- | ------------------------- |
| フレームワーク | Next.js 14.x (App Router) |
| 言語           | TypeScript                |
| スタイル       | Tailwind CSS 3.x          |
| テスト         | Vitest + Testing Library  |
| 場所           | `gui/web/`                |

### GUI カラーパレット（Tailwind設定）

```typescript
// gui/web/tailwind.config.ts
colors: {
  'bg-primary': '#0f172a',      // slate-900
  'bg-secondary': '#1e293b',    // slate-800
  'text-primary': '#f8fafc',    // slate-50
  'accent-primary': '#3b82f6',  // blue-500
  'status-pass': '#22c55e',     // green-500
  'status-fail': '#ef4444',     // red-500
  'status-waiver': '#eab308',   // yellow-500
}
```

## CLI

| 項目     | 技術                        |
| -------- | --------------------------- |
| 言語     | TypeScript (ESM)            |
| 実行     | tsx                         |
| 場所     | `tools/cli/`                |
| エントリ | `tools/cli/agentcompany.ts` |

### CLIコマンド一覧

```bash
agentcompany run <ticket-path>       # ワークフロー実行
agentcompany list                    # チケット一覧
agentcompany validate-agent <path>   # エージェント定義検証
agentcompany validate-deliverable <path>  # 成果物検証
agentcompany judge <run-id>          # 品質判定
agentcompany waiver <subcommand>     # Waiver管理
agentcompany hire <subcommand>       # 採用プロセス
agentcompany execute <ticket-id>     # エージェント実行
agentcompany status                  # 実行状況表示
agentcompany stop <run-id>           # 実行停止
agentcompany resume <run-id>         # 実行再開
agentcompany project <subcommand>    # プロジェクト管理
agentcompany ticket <subcommand>     # チケット管理
agentcompany server                  # Orchestrator APIサーバー起動（GUI連携用）
```

### Orchestrator Server（GUI連携）

GUIからOrchestratorを制御するためのHTTP APIサーバー。

```bash
# デフォルトポート（3001）で起動
agentcompany server

# カスタムポートで起動
agentcompany server --port 8080
```

**主要エンドポイント**:
- `POST /api/tasks` - タスク送信
- `GET /api/dashboard/status` - ダッシュボード統合情報
- `POST /api/agents/pause` - 全エージェント一時停止
- `POST /api/agents/emergency-stop` - 緊急停止

## 品質ゲート

### 静的解析

| ツール   | 設定ファイル     | 用途         |
| -------- | ---------------- | ------------ |
| ESLint   | `.eslintrc.json` | コード品質   |
| Prettier | `.prettierrc`    | フォーマット |

### ESLintルール（主要）

```json
{
  "@typescript-eslint/explicit-function-return-type": "warn",
  "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
  "no-console": "warn"
}
```

### テスト

| ツール     | 設定ファイル           | 用途                |
| ---------- | ---------------------- | ------------------- |
| Vitest     | `vitest.config.ts`     | ユニットテスト      |
| fast-check | -                      | Property-based test |
| Playwright | `playwright.config.ts` | E2Eテスト           |

### テストファイル命名規則

- ユニットテスト: `*.test.ts`
- Property-based: `*.property.test.ts`
- E2Eテスト: `e2e/*.spec.ts`

## 依存管理

### allowlist方式

| ファイル                             | 用途               |
| ------------------------------------ | ------------------ |
| `tools/installers/allowlist/apt.txt` | システムパッケージ |
| `tools/installers/allowlist/pip.txt` | Pythonパッケージ   |
| `tools/installers/allowlist/npm.txt` | Node.jsパッケージ  |

### インストーラ

```bash
# allowlist内のパッケージをインストール
/usr/local/bin/install.sh npm typescript
/usr/local/bin/install.sh pip requests
/usr/local/bin/install.sh apt curl

# allowlist外は自動拒否
/usr/local/bin/install.sh npm malicious-package  # → rejected
```

## ビルド・実行コマンド

### Makefile

```bash
# ワンコマンド起動・停止
make up         # 全環境一括起動（Docker + Ollama + Server + GUI）
make down       # 全環境一括停止
make status     # 起動状態確認

# 開発
make install    # 依存インストール
make lint       # 静的解析
make test       # ユニットテスト
make e2e        # E2Eテスト
make ci         # 全ゲート実行
make build      # TypeScriptビルド
make clean      # ビルド成果物削除
make run        # CLI実行

# Docker
make docker-up    # Docker環境のみ起動
make docker-down  # Docker環境のみ停止
make docker-logs  # Dockerログ表示
```

### npm scripts

```bash
npm run lint        # ESLint + Prettier
npm run lint:fix    # 自動修正
npm run test        # Vitest（カバレッジ付き）
npm run test:watch  # Vitest（ウォッチモード）
npm run e2e         # Playwright
npm run ci          # 全ゲート
npm run cli         # CLI実行
```

### Docker

```bash
# Workspace起動
docker compose -f infra/docker/compose.yaml up -d

# コンテナ内でテスト実行
docker compose -f infra/docker/compose.yaml exec workspace npm run ci

# コンテナに入る
docker compose -f infra/docker/compose.yaml exec workspace bash
```

## TypeScript設定

### コンパイラオプション（主要）

```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitReturns": true
}
```

### パスエイリアス（GUI）

```json
{
  "paths": {
    "@/*": ["./*"]
  }
}
```

## 設定ファイル一覧

| ファイル                           | 用途                   |
| ---------------------------------- | ---------------------- |
| `package.json`                     | ルートプロジェクト設定 |
| `tsconfig.json`                    | TypeScript設定         |
| `vitest.config.ts`                 | Vitest設定             |
| `playwright.config.ts`             | Playwright設定         |
| `.eslintrc.json`                   | ESLint設定             |
| `.prettierrc`                      | Prettier設定           |
| `Makefile`                         | 統一コマンド定義       |
| `infra/docker/compose.yaml`        | Docker Compose設定     |
| `gui/web/package.json`             | GUI依存設定            |
| `gui/web/tailwind.config.ts`       | Tailwind設定           |
| `gui/web/vitest.config.ts`         | GUI Vitest設定         |
| `runtime/state/config.json`        | システム設定           |
| `tools/installers/allowlist/*.txt` | 許可パッケージリスト   |

## AI Adapter

### 基底クラス

```typescript
// tools/adapters/base.ts
export interface AIAdapter {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  chat(messages: Message[], options?: ChatOptions): Promise<string>;
  isAvailable(): Promise<boolean>;
}
```

### Ollama Adapter

```typescript
// tools/adapters/ollama.ts
// デフォルト: http://localhost:11434
// Docker内: http://ollama:11434
```

## 環境変数

| 変数名                 | 用途                     | デフォルト                                     |
| ---------------------- | ------------------------ | ---------------------------------------------- |
| `NODE_ENV`             | 実行環境                 | `development`                                  |
| `OLLAMA_HOST`          | Ollama接続先             | `http://localhost:11434`                       |
| `ORCHESTRATOR_API_URL` | Orchestrator API接続先   | `http://localhost:3001`                        |
| `INSTALL_LOG_DIR`      | インストールログ出力先   | `/workspace/runtime/logs/install`              |
| `ALLOWLIST_DIR`        | allowlistディレクトリ    | `/usr/local/agentcompany/installers/allowlist` |
