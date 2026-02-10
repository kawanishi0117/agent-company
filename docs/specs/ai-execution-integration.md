# AI実行統合 仕様書

## 概要

本仕様は、AIエージェントが実際にタスクを実行し、コードを生成・修正して成果物を納品するまでの統合機能を定義する。

ユーザー（社長）がGUIのCommand Centerからタスクを送信すると、AIエージェント（Ollama）が自律的に作業を開始し、コードを生成・修正して品質ゲート（lint/test）を通過させ、成果物をレポートとして確認できるE2Eワークフローを提供する。

### 目的

1. **E2Eワークフローの完成**: GUI → Orchestrator → AI実行 → 成果物生成の一連のフローを動作させる
2. **AI可用性確認**: Ollamaの状態確認とGraceful Degradationを実現する
3. **品質ゲート統合**: lint/testの自動実行とフィードバックループを統合する
4. **成果物管理**: 実行結果のレポート生成と保存を行う
5. **設定管理**: AIアダプタ・モデル設定のバリデーションとホットリロードを提供する

## アーキテクチャ

### システム構成

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
│                    API Layer (Orchestrator Server)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ /api/tasks   │  │/api/health/ai│  │ /api/config  │              │
│  │ (タスク送信) │  │(AI可用性)    │  │ (設定管理)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │/api/runs/:id │  │/api/dashboard│  │/api/config/  │              │
│  │(成果物取得)  │  │/status       │  │validate      │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────┐
│                    Core Layer                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Orchestrator │  │ Manager      │  │ Settings     │              │
│  │ (タスク管理) │  │ Agent        │  │ Manager      │              │
│  │              │  │ (タスク分解) │  │ (設定管理)   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘              │
└─────────┼─────────────────┼─────────────────────────────────────────┘
          │                 │
┌─────────┼─────────────────┼─────────────────────────────────────────┐
│         │          Worker Layer                                      │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Worker Agent │  │ Tool         │  │ Run Directory│              │
│  │ (AI会話)     │  │ Executor     │  │ Manager      │              │
│  └──────┬───────┘  └──────────────┘  └──────────────┘              │
└─────────┼───────────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────────────┐
│         │           AI / Quality Layer                               │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ AI Health    │  │ Ollama       │  │ Quality Gate │              │
│  │ Checker      │  │ Adapter      │  │ Integration  │              │
│  │ (可用性確認) │  │ (AI通信)     │  │ (lint/test)  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                       ┌──────────────┐              │
│                                       │ Execution    │              │
│                                       │ Reporter     │              │
│                                       │ (レポート)   │              │
│                                       └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### 実行フロー

```
1. ユーザーがGUI（Command Center）からタスクを入力
       ↓
2. Orchestrator Server（POST /api/tasks）でタスク受付
       ↓
3. AI可用性チェック（AIHealthChecker）
       ↓  ※利用不可の場合はエラーレスポンス（セットアップ手順付き）
4. 実行ディレクトリ作成（RunDirectoryManager）
       ↓
5. Manager Agent がタスクを分解し、Worker Agentに割り当て
       ↓
6. Worker Agent がAI（Ollama）と会話しながらコード生成・修正
       ↓  （最大30ターンの会話ループ）
7. 品質ゲート自動実行（QualityGateIntegration）
       ↓  ※失敗時はWorker Agentにフィードバック → 修正ループ（最大3回）
8. 成果物収集・レポート生成（ExecutionReporter）
       ↓
9. Dashboard / Runs画面で結果確認
```

## 機能一覧

### 1. AI実行基盤の可用性確認（AIHealthChecker）

AI実行基盤（Ollama）の状態を確認し、問題発生時に適切なガイダンスを提供する。

**主な機能**:

| 機能 | 説明 |
|------|------|
| Ollama可用性チェック | `/api/tags` エンドポイントへの疎通確認（タイムアウト5秒） |
| インストール済みモデル取得 | Ollama APIからモデル一覧を取得 |
| セットアップ手順提供 | 未起動時・モデル未インストール時のガイダンス表示 |
| ヘルスチェックAPI | `GET /api/health/ai` エンドポイントでステータスを返却 |

**推奨モデル**:

| モデル | 用途 |
|--------|------|
| `llama3.2:1b` | 軽量・高速（テスト・簡易タスク向け） |
| `codellama` | コード生成向け |
| `qwen2.5-coder` | コード生成向け（高精度） |

### 2. GUIからのタスク送信フロー

Command Centerからタスクを送信し、AIに作業を指示する。

- タスク送信時にAI可用性を自動チェック
- 即座にrun IDを返却し、非同期で実行を開始
- 実行ディレクトリ（`runtime/runs/<run-id>/`）を自動作成
- タスクメタデータを `task.json` に永続化

### 3. AIエージェント実行フロー

Manager AgentとWorker Agentが連携してタスクを自律的に実行する。

- **Manager Agent**: タスクを独立したサブタスクに分解し、Worker Agentに割り当て
- **Worker Agent**: AI（Ollama）と会話しながらツール（read_file, write_file, run_command等）を実行
- **会話ループ**: 最大30ターンの会話でタスクを完了
- **会話履歴**: `conversation.json` に全会話を保存
- **失敗時リトライ**: 指数バックオフ（1s, 2s, 4s）で最大3回リトライ

### 4. 品質ゲート統合（QualityGateIntegration）

コード変更完了時にlint/testを自動実行し、品質を担保する。

**実行順序**:

```
コード変更完了
    ↓
lint実行（ESLint） → 失敗? → フィードバック → Worker Agentが修正
    ↓ 成功
test実行（Vitest） → 失敗? → フィードバック → Worker Agentが修正
    ↓ 成功
品質ゲート通過 → 結果を quality.json に保存
```

- lint → test の順序で実行（lintが失敗した場合、testはスキップ）
- 失敗時はエラー詳細とアクション提案をWorker Agentにフィードバック
- 修正ループは最大3回まで

### 5. 成果物収集と保存（ExecutionReporter）

タスク完了時に成果物を収集し、レポートを生成する。

- 変更されたファイルを `artifacts/` ディレクトリにコピー
- Markdown形式のレポート（`report.md`）を自動生成
- レポートにはタスク説明、変更点、テスト結果、会話サマリーを含む
- GUI（Runs詳細ページ）から成果物とレポートを確認可能

### 6. エラーハンドリングと通知

エラー発生時に適切に対応し、ユーザーに通知する。

**エラーカテゴリ**:

| カテゴリ | 説明 | 対応 |
|---------|------|------|
| `ai_unavailable` | AI実行基盤が利用不可 | セットアップ手順を表示、実行を一時停止 |
| `ai_timeout` | AIレスポンスタイムアウト | リトライ（指数バックオフ） |
| `tool_execution` | ツール実行エラー | AIにエラーを報告し、続行を試みる |
| `quality_gate` | 品質ゲート失敗 | AIにフィードバックを送信、修正ループ |
| `persistence` | 状態保存エラー | リトライ後、緊急停止 |

**Graceful Degradation**:

- タスク送信時にAI利用不可 → セットアップ手順付きエラーレスポンスを返却
- 実行中にAI切断 → 現在の状態を保存し一時停止、ユーザーに通知
- 復旧後 → 保存された状態から実行を再開可能

**リトライ戦略**:

| パラメータ | 値 |
|-----------|-----|
| 最大リトライ回数 | 3回 |
| 初回待機時間 | 1秒 |
| バックオフ倍率 | 2倍 |
| 最大待機時間 | 4秒 |

### 7. 実行状態の可視化（Dashboard）

Dashboardでリアルタイムに実行状態を確認できる。

- アクティブワーカー数と現在のタスク
- 待機中タスクキューの長さ
- 完了タスク数と成功率
- AI可用性ステータス
- 5秒間隔での自動更新

### 8. 設定管理（SettingsManager）

AI実行に関する設定をGUIから管理できる。

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

**ホットリロード**: 設定変更時、再起動なしで即座に適用される。

## セットアップ手順

### 1. Ollamaのインストール

```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh

# または公式サイトからダウンロード
# https://ollama.ai/download
```

### 2. Ollamaの起動

```bash
ollama serve
```

### 3. モデルのインストール

```bash
# 推奨モデル（用途に応じて選択）
ollama pull llama3.2:1b      # 軽量・高速（テスト・簡易タスク向け）
ollama pull codellama         # コード生成向け
ollama pull qwen2.5-coder    # コード生成向け（高精度）
```

### 4. Orchestrator Serverの起動

```bash
# デフォルトポート（3001）で起動
npx tsx tools/cli/agentcompany.ts server

# カスタムポートで起動
npx tsx tools/cli/agentcompany.ts server --port 8080
```

### 5. 動作確認

```bash
# Ollamaの起動確認
curl http://localhost:11434/api/tags

# AI可用性チェック
curl http://localhost:3001/api/health/ai
```

## 使い方

### CLIからの使用

#### タスク実行

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

### GUIからの使用

1. **Command Center** でタスクを入力して送信
2. **Dashboard** でリアルタイムに実行状態を監視
3. **Runs** ページで完了したタスクの成果物・レポートを確認
4. **Settings** ページでAIアダプタ・モデルを設定

### APIエンドポイント一覧

#### ヘルスチェック

| メソッド | パス | 説明 |
|----------|------|------|
| `GET` | `/api/health` | サーバーヘルスチェック |
| `GET` | `/api/health/ai` | AI可用性チェック（Ollama状態・モデル確認） |

#### タスク管理

| メソッド | パス | 説明 |
|----------|------|------|
| `POST` | `/api/tasks` | タスク送信（AI可用性チェック付き、run ID返却） |
| `GET` | `/api/tasks/:id` | タスクステータス取得 |
| `DELETE` | `/api/tasks/:id` | タスクキャンセル |

#### エージェント制御

| メソッド | パス | 説明 |
|----------|------|------|
| `GET` | `/api/agents` | アクティブエージェント一覧 |
| `POST` | `/api/agents/pause` | 全エージェント一時停止 |
| `POST` | `/api/agents/resume` | 全エージェント再開 |
| `POST` | `/api/agents/emergency-stop` | 緊急停止 |

#### ダッシュボード

| メソッド | パス | 説明 |
|----------|------|------|
| `GET` | `/api/dashboard/status` | ダッシュボード統合情報（ワーカー数、キュー長、成功率、AI状態） |

#### 実行結果

| メソッド | パス | 説明 |
|----------|------|------|
| `GET` | `/api/runs/:runId/report` | 実行レポート（Markdown）取得 |
| `GET` | `/api/runs/:runId/artifacts` | 成果物一覧取得 |
| `GET` | `/api/runs/:runId/quality` | 品質ゲート結果取得 |

#### 設定管理

| メソッド | パス | 説明 |
|----------|------|------|
| `GET` | `/api/config` | 現在の設定を取得 |
| `PUT` | `/api/config` | 設定を更新（ホットリロード対応） |
| `POST` | `/api/config/validate` | 設定バリデーション（dry-run、保存なし） |

#### チケット管理

| メソッド | パス | 説明 |
|----------|------|------|
| `POST` | `/api/tickets` | チケット作成 |
| `POST` | `/api/tickets/:ticketId/execute` | チケット実行 |

## コンポーネント

### AIHealthChecker

**場所**: `tools/cli/lib/execution/ai-health-checker.ts`

AI実行基盤（Ollama）の可用性を確認するコンポーネント。

| メソッド | 説明 |
|----------|------|
| `checkOllamaAvailability()` | Ollamaの起動状態とモデル確認を行い、AIHealthStatusを返す |
| `getInstalledModels()` | インストール済みモデル名の配列を返す |
| `getModelInstallCommands()` | 推奨モデルのインストールコマンドを返す |
| `getHealthStatus()` | checkOllamaAvailabilityのエイリアス |

### RunDirectoryManager

**場所**: `tools/cli/lib/execution/run-directory-manager.ts`

タスク実行ごとのディレクトリ作成とメタデータ永続化を担当するコンポーネント。

| メソッド | 説明 |
|----------|------|
| `createRunDirectory(runId)` | 実行ディレクトリと `artifacts/` サブディレクトリを作成 |
| `saveTaskMetadata(runId, metadata)` | タスクメタデータを `task.json` に保存 |
| `loadTaskMetadata(runId)` | `task.json` からメタデータを読み込み |
| `generateRunId()` | ユニークな実行ID（`run-<timestamp>-<random>`）を生成 |
| `exists(runId)` | 実行ディレクトリの存在確認 |

### QualityGateIntegration

**場所**: `tools/cli/lib/execution/quality-gate-integration.ts`

品質ゲート（lint/test）の自動実行、結果永続化、フィードバックループを担当するコンポーネント。

| メソッド | 説明 |
|----------|------|
| `runLint(workspacePath)` | ESLintによる静的解析を実行 |
| `runTests(workspacePath)` | Vitestによるユニットテストを実行 |
| `runAllChecks(workspacePath)` | lint → test の順序で全チェック実行 |
| `saveResults(runId, results)` | 品質ゲート結果を `quality.json` に保存 |
| `loadResults(runId)` | `quality.json` から結果を読み込み |
| `generateFeedback(results)` | 失敗時のフィードバック情報を生成 |

### ExecutionReporter

**場所**: `tools/cli/lib/execution/execution-reporter.ts`

実行結果のレポート生成と成果物収集を担当するコンポーネント。

| メソッド | 説明 |
|----------|------|
| `generateReport(runId, result)` | ExecutionResultからReportDataを生成 |
| `saveReport(runId, report)` | レポートをMarkdown形式で `report.md` に保存 |
| `collectArtifacts(runId, artifacts)` | 成果物を `artifacts/` ディレクトリにコピー |
| `renderMarkdown(report)` | ReportDataをMarkdown文字列に変換 |

### SettingsManager

**場所**: `tools/cli/lib/execution/settings-manager.ts`

AI実行に関する設定のバリデーションとホットリロードを担当するコンポーネント。

| メソッド | 説明 |
|----------|------|
| `loadSettings(configPath?)` | 設定ファイルを読み込み |
| `saveSettings(config, configPath?)` | バリデーション後に設定を保存 |
| `validateAISettings(config)` | AI関連設定のバリデーション |
| `watchSettings(configPath, callback)` | ファイル変更を監視し、変更時にコールバック実行 |
| `stopWatching()` | ファイル監視を停止 |
| `applySettings(config)` | 設定を即座に適用 |

## 実行ディレクトリ構造

各タスク実行は `runtime/runs/<run-id>/` 配下に独立したディレクトリを持つ。

```
runtime/runs/<run-id>/
├── task.json           # タスクメタデータ
├── conversation.json   # AIとの会話履歴
├── quality.json        # 品質ゲート結果
├── report.md           # 実行レポート（Markdown形式）
├── errors.log          # エラーログ（発生時のみ）
└── artifacts/          # 成果物（変更されたファイルのコピー）
    ├── src/
    │   └── feature.ts
    └── tests/
        └── feature.test.ts
```

**各ファイルの詳細**:

| ファイル | 内容 |
|----------|------|
| `task.json` | タスクID、run ID、指示内容、ステータス、使用AIアダプタ・モデル |
| `conversation.json` | AIとの全会話履歴（プロンプト・レスポンス） |
| `quality.json` | lint結果（エラー数/警告数）、test結果（通過数/失敗数/カバレッジ） |
| `report.md` | タスク概要、変更点、テスト結果、会話サマリー、成果物一覧 |
| `errors.log` | エラー発生時の詳細ログ（タイムスタンプ・カテゴリ付き） |
| `artifacts/` | 変更されたファイルのコピー |

## エラーハンドリング

### リトライ戦略

指数バックオフによるリトライを実装。

```
1回目失敗 → 1秒待機 → リトライ
2回目失敗 → 2秒待機 → リトライ
3回目失敗 → 4秒待機 → リトライ
4回目失敗 → 永続的失敗 → 失敗レポート生成
```

### Graceful Degradation

AI実行基盤が利用不可になった場合の動作：

1. **タスク送信時**: AIHealthCheckerが可用性を確認し、利用不可の場合はセットアップ手順付きのエラーレスポンスを返す
2. **実行中の切断**: 現在の実行状態を保存し、一時停止状態に遷移。ユーザーに通知する
3. **復旧後**: 保存された状態から実行を再開可能

### エラーメッセージ例

**Ollama未起動時**:

```
Ollamaが起動していません。

セットアップ手順:
1. Ollamaをインストール: https://ollama.ai/download
2. Ollamaを起動: ollama serve
3. モデルをインストール: ollama pull llama3.2:1b
```

**モデル未インストール時**:

```
Ollamaにモデルがインストールされていません。

推奨モデル:
- ollama pull llama3.2:1b (軽量、高速)
- ollama pull codellama (コード生成向け)
- ollama pull qwen2.5-coder (コード生成向け)
```

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `OLLAMA_HOST` | Ollamaエンドポイント | `http://localhost:11434` |
| `ORCHESTRATOR_API_URL` | Orchestrator API接続先 | `http://localhost:3001` |

## テスト

### ユニットテスト

| テストファイル | 対象 |
|---------------|------|
| `tests/execution/ai-health-checker.test.ts` | AIHealthChecker |
| `tests/execution/execution-reporter.test.ts` | ExecutionReporter |
| `tests/execution/quality-gate-integration.test.ts` | QualityGateIntegration |

### プロパティベーステスト

| テストファイル | 対象 |
|---------------|------|
| `tests/execution/ai-health-checker.property.test.ts` | AI可用性エラーハンドリング |
| `tests/execution/run-directory-manager.property.test.ts` | ディレクトリ・メタデータ永続化 |
| `tests/execution/quality-gate-integration.property.test.ts` | 品質ゲート実行・フィードバック |
| `tests/execution/execution-reporter.property.test.ts` | レポート生成・成果物収集 |
| `tests/execution/settings-manager.property.test.ts` | 設定バリデーション・ホットリロード |

### E2Eテスト

| テストファイル | 対象 |
|---------------|------|
| `e2e/ai-execution-workflow.spec.ts` | タスク送信から成果物生成までのE2Eフロー |

## 関連ドキュメント

- [Agent Execution Engine アーキテクチャ](../architecture/execution-engine.md)
- [Autonomous Agent Workflow 仕様書](./autonomous-agent-workflow.md)
- [Agent Execution Engine 仕様書](./agent-execution-engine.md)
- [CLI README](../../tools/cli/README.md)
