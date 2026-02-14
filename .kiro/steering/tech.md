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
| Markdown       | marked 11.x               |
| テスト         | Vitest + Testing Library  |
| 場所           | `gui/web/`                |

### GUI カラーパレット（Tailwind設定）

```typescript
// gui/web/tailwind.config.ts
colors: {
  // Background
  'bg-primary': '#0f172a',      // slate-900
  'bg-secondary': '#1e293b',    // slate-800
  'bg-tertiary': '#334155',     // slate-700
  // Text
  'text-primary': '#f8fafc',    // slate-50
  'text-secondary': '#94a3b8',  // slate-400
  'text-muted': '#64748b',      // slate-500
  // Accent
  'accent-primary': '#3b82f6',  // blue-500
  'accent-hover': '#2563eb',    // blue-600
  // Status
  'status-pass': '#22c55e',     // green-500
  'status-fail': '#ef4444',     // red-500
  'status-waiver': '#eab308',   // yellow-500
  'status-running': '#3b82f6',  // blue-500
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

**Real Company Experience API**:
- `GET /api/employees` - 社員一覧
- `GET /api/employees/[id]` - 社員詳細
- `GET /api/employees/[id]/mood` - ムード履歴
- `GET /api/employees/[id]/career` - キャリア履歴
- `GET /api/relationships` - 関係性マップ
- `GET /api/mvp` - MVP履歴
- `GET /api/mood-alerts` - ムードアラート
- `GET /api/meetings` - 会議一覧
- `GET /api/knowledge` - ナレッジ検索
- `GET /api/kpi` - KPIデータ
- `GET /api/market-research` - 市場調査レポート
- `GET /api/tech-debt` - 技術的負債トレンド

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
npm run cli         # CLI実行（tsx tools/cli/agentcompany.ts）
npm run up          # ワンコマンド起動（scripts/start.ps1）
npm run down        # ワンコマンド停止（scripts/stop.ps1）
npm run status      # 起動状態確認（scripts/status.ps1）
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
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true
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

## 主要依存パッケージ

### ルート（package.json）

| パッケージ | 用途 |
|-----------|------|
| yaml | YAML解析 |
| gray-matter | Markdownフロントマター解析 |
| tsx | TypeScript実行 |
| vitest + @vitest/coverage-v8 | テスト + カバレッジ |
| fast-check | Property-based testing |
| @playwright/test | E2Eテスト |

### GUI（gui/web/package.json）

| パッケージ | 用途 |
|-----------|------|
| next ^14.2.0 | フレームワーク |
| react ^18.3.0 | UI |
| marked ^11.0.0 | Markdownレンダリング |
| gray-matter | フロントマター解析 |
| tailwindcss ^3.4.4 | スタイル |
| @testing-library/react | コンポーネントテスト |

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
| `gui/web/vitest.setup.ts`          | GUI Vitestセットアップ |
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

## コーディングエージェント統合

### 概要

外部コーディングエージェントCLIをサブプロセスとして実行し、実際のコーディング作業を委譲する。
既存のAI Adapter（Ollama等）はテキスト生成（会議・提案書）に継続使用。

### 対応エージェント

| エージェント | CLIコマンド | 用途 |
|-------------|------------|------|
| Claude Code | `claude -p "prompt"` | 高品質コード生成 |
| OpenCode | `opencode run "prompt"` | マルチモデル対応 |
| Kiro CLI | `kiro chat -p "prompt"` | AWS統合 |

### ディレクトリ構成

| ファイル | 役割 |
|---------|------|
| `tools/coding-agents/base.ts` | 基底インターフェース、エラークラス |
| `tools/coding-agents/opencode.ts` | OpenCodeAdapter |
| `tools/coding-agents/claude-code.ts` | ClaudeCodeAdapter |
| `tools/coding-agents/kiro-cli.ts` | KiroCliAdapter |
| `tools/coding-agents/index.ts` | CodingAgentRegistry |
| `tools/cli/lib/execution/workspace-manager.ts` | ワークスペース管理 |

### 設定

```json
// runtime/state/config.json の codingAgent フィールド
{
  "codingAgent": {
    "preferredAgent": "opencode",
    "agentSettings": {
      "opencode": { "timeout": 600, "model": "claude-sonnet-4-20250514" },
      "claude-code": { "timeout": 600 },
      "kiro-cli": { "timeout": 600 }
    },
    "autoCreateGithubRepo": false,
    "phaseServices": {
      "proposal": "opencode",
      "development": "opencode",
      "quality_assurance": "opencode"
    },
    "agentOverrides": [
      { "agentId": "reviewer", "service": "claude-code" }
    ]
  }
}
```

### 統一AIサービス選択

全ワークフローフェーズで使用するAIサービスを統一的に設定可能。

**サービス解決優先順位**:
1. `agentOverrides`（社員別オーバーライド） ← 最優先
2. `phaseServices`（フェーズ別設定）
3. `preferredAgent`（グローバルデフォルト）
4. レジストリのデフォルト優先順位 ← 最低優先

**型定義** (`tools/cli/lib/execution/types.ts`):
- `CodingAgentName`: `'opencode' | 'claude-code' | 'kiro-cli'`
- `PhaseServiceConfig`: フェーズ別サービス設定
- `AgentServiceOverride`: エージェント別オーバーライド
- `ServiceDetectionResult`: サービス検出結果

### サービス検出API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/settings/service-detection` | 環境のCLIツール自動検出（バージョン情報付き） |

### GUI設定

- Settings画面（`/settings`）にコーディングエージェント設定セクション
- サービス検出結果の表示（利用可能/不可、バージョン情報）
- フェーズ別AIサービス選択ドロップダウン
- エージェント（社員）別オーバーライドの追加・削除
- API: `GET/PUT /api/settings/coding-agents`, `GET /api/settings/service-detection`

## 環境変数

| 変数名                 | 用途                     | デフォルト                                     |
| ---------------------- | ------------------------ | ---------------------------------------------- |
| `NODE_ENV`             | 実行環境                 | `development`                                  |
| `OLLAMA_HOST`          | Ollama接続先             | `http://localhost:11434`                       |
| `ORCHESTRATOR_API_URL` | Orchestrator API接続先   | `http://localhost:3001`                        |
| `INSTALL_LOG_DIR`      | インストールログ出力先   | `/workspace/runtime/logs/install`              |
| `ALLOWLIST_DIR`        | allowlistディレクトリ    | `/usr/local/agentcompany/installers/allowlist` |
