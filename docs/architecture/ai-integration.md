# AI実行統合アーキテクチャ

## 概要

AI実行統合は、既存のAgent Execution Engineに対してAI実行基盤（Ollama）との接続、品質ゲートの自動実行、成果物管理、設定管理を追加する拡張機能である。ユーザー（社長）がGUIからタスクを送信すると、AIエージェントが自律的に作業を開始し、コードを生成・修正して品質ゲートを通過させ、成果物をレポートとして確認できる。

## システム構成図

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

## 新規コンポーネント

AI実行統合で追加された新規コンポーネントの一覧と役割。

### AIHealthChecker

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

### RunDirectoryManager

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

### QualityGateIntegration

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

### ExecutionReporter

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

## AI実行フロー

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

## エラーハンドリング戦略

### エラーカテゴリ

| カテゴリ | 説明 | 対応 |
|---------|------|------|
| `ai_unavailable` | AI実行基盤（Ollama）が利用不可 | セットアップ手順を表示、実行を一時停止 |
| `ai_timeout` | AIレスポンスのタイムアウト | リトライ（指数バックオフ） |
| `tool_execution` | ツール実行エラー（ファイル操作等） | AIにエラーを報告し、続行を試みる |
| `quality_gate` | 品質ゲート失敗（lint/test） | AIにフィードバックを送信、修正ループ |
| `persistence` | 状態保存エラー（ディスク等） | リトライ後、緊急停止 |

### Graceful Degradation

AI実行基盤が利用不可になった場合の動作：

1. **タスク送信時**: AIHealthCheckerが可用性を確認し、利用不可の場合はセットアップ手順付きのエラーレスポンスを返す
2. **実行中の切断**: 現在の実行状態を保存し、一時停止状態に遷移。ユーザーに通知する
3. **復旧後**: 保存された状態から実行を再開可能

### リトライ戦略

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

### エラーログ

全てのエラーは `runtime/runs/<run-id>/errors.log` に記録される。永続的失敗時には失敗レポートが自動生成される。

## API拡張（AI統合関連）

AI実行統合で追加・拡張されたAPIエンドポイント。

### ヘルスチェック

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

### タスク送信（AI可用性チェック統合）

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

### 実行結果取得

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/runs/:runId/report` | 実行レポート（Markdown）を取得 |
| GET | `/api/runs/:runId/artifacts` | 成果物一覧を取得 |
| GET | `/api/runs/:runId/quality` | 品質ゲート結果を取得 |

### 設定管理

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/config` | 現在の設定を取得 |
| PUT | `/api/config` | 設定を更新（バリデーション付き） |
| POST | `/api/config/validate` | 設定のバリデーションのみ実行 |

### ダッシュボード

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/dashboard/status` | ダッシュボード統合情報（AI状態、成功率含む） |

**レスポンスに含まれる情報**:

- アクティブワーカー数と現在のタスク
- 待機中タスクキューの長さ
- 完了タスク数と成功率
- AI可用性ステータス

## 設定管理

### SettingsManager

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

## データモデル

### 実行ディレクトリ構造

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

### タスクメタデータ（task.json）

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

### 品質ゲート結果（quality.json）

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

### 実行レポート（report.md）

Markdown形式のレポートで、以下のセクションを含む：

1. **タスク概要**: タスクID、説明、ステータス
2. **実行時間**: 開始・終了時刻、所要時間
3. **変更点**: 作成・変更・削除されたファイル一覧
4. **テスト結果**: lint/testの合否サマリー
5. **会話サマリー**: AIとの会話ターン数、トークン使用量
6. **成果物一覧**: 収集された成果物ファイルのリスト

## 関連ドキュメント

- [実行エンジン](./execution-engine.md)
- [Orchestrator Server](./orchestrator-server.md)
- [ワークフローエンジン](./workflow-engine.md)
- [AI実行統合仕様](../specs/ai-execution-integration.md)
