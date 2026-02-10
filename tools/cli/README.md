# AgentCompany CLI

## 概要

AgentCompanyのコマンドラインインターフェース。チケット実行、検証、ワークフロー管理、エージェント実行エンジンの制御を行う。

## インストール

```bash
npm install
```

## コマンド

### チケット実行

```bash
npx tsx tools/cli/agentcompany.ts run <ticket-path>

# 例
npx tsx tools/cli/agentcompany.ts run workflows/backlog/0001-sample.md
```

**出力先**: `runtime/runs/<date>-<run-id>/`

### エージェント実行エンジン

#### タスク実行

```bash
# タスクを実行
npx tsx tools/cli/agentcompany.ts execute <ticket-id>

# オプション付き実行
npx tsx tools/cli/agentcompany.ts execute <ticket-id> --adapter gemini --workers 5

# タスク分解のみ（実行しない）
npx tsx tools/cli/agentcompany.ts execute --decompose <ticket-id>
```

**オプション**:

- `--adapter <name>`: 使用するAIアダプタ（デフォルト: ollama）
- `--workers <count>`: 並列ワーカー数（デフォルト: 3）
- `--project <id>`: プロジェクトID
- `--decompose`: タスク分解のみ実行

#### 実行状況確認

```bash
# 実行状況を表示
npx tsx tools/cli/agentcompany.ts status

# 詳細表示
npx tsx tools/cli/agentcompany.ts status --verbose

# JSON形式で出力
npx tsx tools/cli/agentcompany.ts status --json
```

#### 実行制御

```bash
# 実行を停止
npx tsx tools/cli/agentcompany.ts stop <run-id>

# 実行を再開
npx tsx tools/cli/agentcompany.ts resume <run-id>
```

### プロジェクト管理

```bash
# プロジェクト一覧
npx tsx tools/cli/agentcompany.ts project list

# プロジェクト追加
npx tsx tools/cli/agentcompany.ts project add <name> <git-url>

# オプション付き追加
npx tsx tools/cli/agentcompany.ts project add my-app https://github.com/user/my-app.git --branch main --integration develop

# プロジェクト詳細
npx tsx tools/cli/agentcompany.ts project show <project-id>

# プロジェクト削除
npx tsx tools/cli/agentcompany.ts project remove <project-id>
```

**オプション**:

- `--branch <name>`: デフォルトブランチ（デフォルト: main）
- `--integration <name>`: 統合ブランチ（デフォルト: develop）
- `--workdir <path>`: 作業ディレクトリ
- `--json`: JSON形式で出力

### エージェント定義検証

```bash
npx tsx tools/cli/validator.ts <agent-yaml>

# 例
npx tsx tools/cli/validator.ts agents/registry/coo_pm.yaml
```

### 成果物検証

```bash
npx tsx tools/cli/deliverable-validator.ts <deliverable-md>
```

### 品質判定

```bash
npx tsx tools/cli/agentcompany.ts judge <run-id>

# Waiver適用
npx tsx tools/cli/agentcompany.ts judge <run-id> --waiver <waiver-id>
```

### Waiver管理

```bash
# Waiver作成
npx tsx tools/cli/agentcompany.ts waiver create "テストカバレッジ例外"

# Waiver一覧
npx tsx tools/cli/agentcompany.ts waiver list
```

### 採用プロセス

```bash
# JD生成
npx tsx tools/cli/agentcompany.ts hire jd "Developer"

# フル採用プロセス
npx tsx tools/cli/agentcompany.ts hire full "QA Engineer" candidate.yaml
```

## ファイル構成

| ファイル                   | 用途                     |
| -------------------------- | ------------------------ |
| `agentcompany.ts`          | メインエントリポイント   |
| `workflow.ts`              | Plan → Run → Report 実行 |
| `ticket.ts`                | チケットパーサー         |
| `validator.ts`             | エージェント定義検証     |
| `deliverable-validator.ts` | 成果物検証               |
| `commands/judge.ts`        | 品質判定コマンド         |
| `commands/waiver.ts`       | Waiver管理コマンド       |
| `commands/hire.ts`         | 採用プロセスコマンド     |
| `commands/execute.ts`      | エージェント実行コマンド |
| `commands/project.ts`      | プロジェクト管理コマンド |
| `commands/server.ts`       | Orchestrator APIサーバー起動コマンド |
| `commands/ticket.ts`       | チケット管理コマンド     |
| `lib/judgment.ts`          | 判定ロジック             |
| `lib/waiver-validator.ts`  | Waiver検証               |
| `lib/hiring/`              | 採用システムライブラリ   |
| `lib/execution/`           | エージェント実行エンジン |

## ライブラリ

### lib/execution/ - エージェント実行エンジン

エージェント実行エンジンの機能を提供するライブラリ群。

| ファイル               | 用途                           | 状態   |
| ---------------------- | ------------------------------ | ------ |
| `types.ts`             | 共通型定義                     | ✅完了 |
| `orchestrator.ts`      | 全体制御・タスク管理           | ✅完了 |
| `state-manager.ts`     | 状態永続化・履歴管理           | ✅完了 |
| `agent-bus.ts`         | エージェント間通信             | ✅完了 |
| `message-queue.ts`     | メッセージキュー抽象化         | ✅完了 |
| `decomposer.ts`        | タスク分解                     | ✅完了 |
| `process-monitor.ts`   | コマンド実行監視               | ✅完了 |
| `git-manager.ts`       | Git操作管理                    | ✅完了 |
| `git-credentials.ts`   | Git認証管理                    | ✅完了 |
| `worker-pool.ts`       | ワーカープール管理             | ✅完了 |
| `worker-container.ts`  | ワーカーコンテナ管理           | ✅完了 |
| `container-runtime.ts` | コンテナランタイム抽象化       | ✅完了 |
| `tools.ts`             | ツール呼び出しインターフェース | ✅完了 |
| `quality-gate.ts`      | 品質ゲート統合                 | ✅完了 |
| `error-handler.ts`     | エラーハンドリング             | ✅完了 |
| `project-manager.ts`   | プロジェクト管理               | ✅完了 |
| `agents/manager.ts`    | マネージャーエージェント       | ✅完了 |
| `agents/worker.ts`     | ワーカーエージェント           | ✅完了 |
| `agents/reviewer.ts`   | レビューエージェント           | ✅完了 |
| `agents/merger.ts`     | マージエージェント             | ✅完了 |
| `ai-health-checker.ts` | AI可用性チェック               | ✅完了 |
| `run-directory-manager.ts` | 実行ディレクトリ管理       | ✅完了 |
| `quality-gate-integration.ts` | 品質ゲート統合（lint/test） | ✅完了 |
| `execution-reporter.ts` | 実行レポート生成・成果物収集  | ✅完了 |

### lib/hiring/ - 採用システム

採用システム（Hiring System）の機能を提供するライブラリ群。

| ファイル                 | 用途                      | 状態   |
| ------------------------ | ------------------------- | ------ |
| `types.ts`               | 共通型定義                | ✅完了 |
| `index.ts`               | エクスポート集約          | ✅完了 |
| `jd-generator.ts`        | JD（Job Description）生成 | ✅完了 |
| `interview-generator.ts` | 面接課題生成              | 未実装 |
| `trial-runner.ts`        | 試用実行                  | 未実装 |
| `scoring-engine.ts`      | スコア化                  | 未実装 |
| `registry-manager.ts`    | Registry管理              | 未実装 |
| `hiring-logger.ts`       | 採用ログ                  | 未実装 |

#### JD Generator 使用例

```typescript
import { generateJD, formatJDAsMarkdown, validateJD } from './lib/hiring/index.js';

// JD生成
const jd = generateJD({
  role: 'developer',
  outputDir: 'runtime/runs/run-001',
});

// バリデーション
const result = validateJD(jd);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}

// Markdown形式で出力
const markdown = formatJDAsMarkdown(jd);
console.log(markdown);
```

#### 対応役割プリセット

| 役割名        | 説明                   |
| ------------- | ---------------------- |
| `developer`   | 開発者エージェント     |
| `qa_executor` | QA実行エージェント     |
| `reviewer`    | レビュアーエージェント |

プリセットにない役割名を指定した場合は、汎用テンプレートが生成されます。

## 実行フロー

```
1. チケット読み込み (ticket.ts)
       ↓
2. プラン生成 (workflow.ts - plan)
       ↓
3. 実行 (workflow.ts - run)
       ↓
4. レポート生成 (workflow.ts - report)
       ↓
5. 成果物保存 (runtime/runs/)
```

## AI実行統合

### 概要

GUIからタスクを送信し、AIエージェントが自律的にコード生成・修正・品質チェックを行い、
成果物をレポートとして確認できるE2Eワークフローを提供する。

### AI実行基盤のセットアップ

#### 1. Ollamaのインストール

```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh

# または公式サイトからダウンロード
# https://ollama.ai/download
```

#### 2. Ollamaの起動

```bash
ollama serve
```

#### 3. モデルのインストール

```bash
# 推奨モデル（用途に応じて選択）
ollama pull llama3.2:1b      # 軽量・高速（テスト・簡易タスク向け）
ollama pull codellama         # コード生成向け
ollama pull qwen2.5-coder    # コード生成向け（高精度）
```

#### 4. 動作確認

```bash
# Ollamaの起動確認
curl http://localhost:11434/api/tags

# CLIからAI可用性を確認
npx tsx tools/cli/agentcompany.ts server &
curl http://localhost:3001/api/health/ai
```

### AI実行関連CLIコマンド

#### Orchestrator APIサーバー起動

```bash
# デフォルトポート（3001）で起動
npx tsx tools/cli/agentcompany.ts server

# カスタムポートで起動
npx tsx tools/cli/agentcompany.ts server --port 8080

# ヘルプ表示
npx tsx tools/cli/agentcompany.ts server --help
```

GUI（Next.js）からOrchestratorを制御するためのHTTP APIサーバーを起動する。
起動後、`Ctrl+C` で停止。

#### エージェント実行

```bash
# タスクを実行
npx tsx tools/cli/agentcompany.ts execute <ticket-id>

# AIアダプタとワーカー数を指定
npx tsx tools/cli/agentcompany.ts execute <ticket-id> --adapter ollama --workers 3

# タスク分解のみ（実行しない）
npx tsx tools/cli/agentcompany.ts execute --decompose <ticket-id>
```

#### 実行状況確認

```bash
# 実行状況を表示
npx tsx tools/cli/agentcompany.ts status

# 詳細表示
npx tsx tools/cli/agentcompany.ts status --verbose

# JSON形式で出力
npx tsx tools/cli/agentcompany.ts status --json
```

#### 実行制御

```bash
# 実行を停止
npx tsx tools/cli/agentcompany.ts stop <run-id>

# 実行を再開
npx tsx tools/cli/agentcompany.ts resume <run-id>
```

### Orchestrator Server APIエンドポイント

#### ヘルスチェック

| メソッド | パス              | 説明                                     |
| -------- | ----------------- | ---------------------------------------- |
| `GET`    | `/api/health`     | サーバーヘルスチェック                   |
| `GET`    | `/api/health/ai`  | AI可用性チェック（Ollama状態・モデル確認） |

**`GET /api/health/ai` レスポンス例:**

```json
{
  "success": true,
  "data": {
    "available": true,
    "ollamaRunning": true,
    "modelsInstalled": ["llama3.2:1b", "codellama"],
    "recommendedModels": ["llama3.2:1b", "codellama", "qwen2.5-coder"],
    "lastChecked": "2026-01-27T15:14:26.000Z"
  }
}
```

#### タスク管理

| メソッド | パス               | 説明                     |
| -------- | ------------------ | ------------------------ |
| `POST`   | `/api/tasks`       | タスク送信（run ID返却） |
| `GET`    | `/api/tasks/:id`   | タスクステータス取得     |
| `DELETE` | `/api/tasks/:id`   | タスクキャンセル         |

#### エージェント制御

| メソッド | パス                         | 説明                 |
| -------- | ---------------------------- | -------------------- |
| `GET`    | `/api/agents`                | アクティブエージェント一覧 |
| `POST`   | `/api/agents/pause`          | 全エージェント一時停止 |
| `POST`   | `/api/agents/resume`         | 全エージェント再開   |
| `POST`   | `/api/agents/emergency-stop` | 緊急停止             |

#### ダッシュボード

| メソッド | パス                    | 説明                                       |
| -------- | ----------------------- | ------------------------------------------ |
| `GET`    | `/api/dashboard/status` | ダッシュボード統合情報（ワーカー数、キュー長、成功率） |

#### 実行結果（Runs）

| メソッド | パス                          | 説明               |
| -------- | ----------------------------- | ------------------ |
| `GET`    | `/api/runs/:runId/report`     | 実行レポート取得   |
| `GET`    | `/api/runs/:runId/artifacts`  | 成果物一覧取得     |
| `GET`    | `/api/runs/:runId/quality`    | 品質ゲート結果取得 |

#### 設定管理

| メソッド | パス                    | 説明                                 |
| -------- | ----------------------- | ------------------------------------ |
| `GET`    | `/api/config`           | 設定取得                             |
| `PUT`    | `/api/config`           | 設定更新（ホットリロード対応）       |
| `POST`   | `/api/config/validate`  | 設定バリデーション（dry-run、保存なし） |

#### チケット管理

| メソッド | パス                              | 説明                   |
| -------- | --------------------------------- | ---------------------- |
| `POST`   | `/api/tickets`                    | チケット作成           |
| `POST`   | `/api/tickets/:ticketId/execute`  | チケット実行           |

### 実行ディレクトリ構造

タスク実行時、以下の構造で成果物が保存される。

```
runtime/runs/<run-id>/
├── task.json           # タスクメタデータ（タスクID、指示内容、ステータス等）
├── conversation.json   # AIとの会話履歴
├── quality.json        # 品質ゲート結果（lint/test結果）
├── report.md           # 実行レポート（Markdown形式）
├── errors.log          # エラーログ（発生時のみ）
└── artifacts/          # 成果物（変更されたファイルのコピー）
    ├── file1.ts
    └── file2.ts
```

**各ファイルの詳細:**

| ファイル            | 内容                                                   |
| ------------------- | ------------------------------------------------------ |
| `task.json`         | タスクID、run ID、指示内容、ステータス、使用モデル等   |
| `conversation.json` | AIとの全会話履歴（プロンプト・レスポンス）             |
| `quality.json`      | lint結果（エラー数/警告数）、test結果（通過数/失敗数） |
| `report.md`         | タスク概要、変更点、テスト結果、会話サマリー           |
| `errors.log`        | エラー発生時の詳細ログ（タイムスタンプ付き）           |
| `artifacts/`        | 変更されたファイルのコピー                             |

### AI実行統合コンポーネント

AI実行統合で追加されたコンポーネント群。

| ファイル                       | 用途                                   | 状態   |
| ------------------------------ | -------------------------------------- | ------ |
| `ai-health-checker.ts`        | AI可用性チェック（Ollama状態確認）     | ✅完了 |
| `run-directory-manager.ts`    | 実行ディレクトリ・メタデータ管理       | ✅完了 |
| `quality-gate-integration.ts` | 品質ゲート統合（lint/test自動実行）    | ✅完了 |
| `execution-reporter.ts`       | 実行レポート生成・成果物収集           | ✅完了 |

### AI実行フロー

```
1. ユーザーがGUI（Command Center）からタスクを入力
       ↓
2. Orchestrator Server（POST /api/tasks）でタスク受付
       ↓
3. AI可用性チェック（AIHealthChecker）
       ↓  ※利用不可の場合はエラーレスポンス（セットアップ手順付き）
4. 実行ディレクトリ作成（RunDirectoryManager）
       ↓
5. Manager Agent がタスクを分解
       ↓
6. Worker Agent がAI（Ollama）と会話しながらコード生成・修正
       ↓
7. 品質ゲート自動実行（QualityGateIntegration）
       ↓  ※失敗時はWorker Agentにフィードバック → 修正ループ
8. 成果物収集・レポート生成（ExecutionReporter）
       ↓
9. Dashboard / Runs画面で結果確認
```

## 環境変数

| 変数                   | 説明                       | デフォルト               |
| ---------------------- | -------------------------- | ------------------------ |
| `OLLAMA_HOST`          | Ollamaエンドポイント       | `http://localhost:11434` |
| `ORCHESTRATOR_API_URL` | Orchestrator API接続先     | `http://localhost:3001`  |

## エラーコード

| コード | 意味                   |
| ------ | ---------------------- |
| 0      | 成功                   |
| 1      | チケット読み込みエラー |
| 2      | 実行エラー             |
| 3      | 検証エラー             |
