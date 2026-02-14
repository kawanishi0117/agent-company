# コーディングエージェント統合 仕様書

## 概要

外部コーディングエージェントCLI（Claude Code、OpenCode、Kiro CLI）をAgentCompanyのワーカーとして統合する機能。AgentCompanyはオーケストレーション層に徹し、実際のコーディング作業はCLIサブプロセスとして実行される外部エージェントに委譲する。

## 設計方針

- **CLIラッパーパターン**: AI APIを直接叩かず、CLIツールをサブプロセスとして実行
- **統一インターフェース**: 異なるCLIツールを `CodingAgentAdapter` で統一的に扱う
- **既存アダプタとの共存**: Ollama（`tools/adapters/`）は会議・提案書生成に継続使用
- **自動フォールバック**: 優先エージェントが利用不可の場合、次の候補に自動切替

## アーキテクチャ

```
社長（GUI） → Orchestrator → WorkflowEngine
                                ↓ 開発フェーズ
                          WorkspaceManager（git clone / branch作成）
                                ↓
                          WorkerAgent → CodingAgentAdapter選択
                                ↓
                    ┌─────────────────────────────┐
                    │  CodingAgentRegistry         │
                    │  ├── ClaudeCodeAdapter       │
                    │  ├── OpenCodeAdapter         │
                    │  └── KiroCliAdapter          │
                    └─────────────────────────────┘
                                ↓ CLIサブプロセス実行
                          コーディング → git commit/push → PR作成
```

## 対応エージェント

| エージェント | CLIコマンド | 主要フラグ |
|-------------|------------|-----------|
| Claude Code | `claude -p "prompt"` | `--output-format json`, `--allowedTools`, `--add-dir` |
| OpenCode | `opencode run "prompt"` | `--format json`, `--model` |
| Kiro CLI | `kiro chat -p "prompt"` | カスタムエージェント設定 |

## コンポーネント

### tools/coding-agents/

| ファイル | 役割 |
|---------|------|
| `base.ts` | `CodingAgentAdapter` インターフェース、エラークラス、サブプロセスヘルパー |
| `opencode.ts` | OpenCodeAdapter 実装 |
| `claude-code.ts` | ClaudeCodeAdapter 実装 |
| `kiro-cli.ts` | KiroCliAdapter 実装 |
| `index.ts` | CodingAgentRegistry（登録・検出・フォールバック選択） |

### 統合ポイント

| コンポーネント | 変更内容 |
|---------------|---------|
| `WorkerAgent` | コーディングタスク時は `CodingAgentAdapter` を使用、非コーディングタスクは既存Ollama継続 |
| `WorkflowEngine` | 開発フェーズで `WorkspaceManager` + `CodingAgentAdapter` を使用 |
| `WorkspaceManager` | リポジトリclone、ブランチ作成、クリーンアップ |

## 設定

### config.json

```json
{
  "codingAgent": {
    "preferredAgent": "claude-code",
    "agentSettings": {
      "claude-code": { "timeout": 600 },
      "opencode": { "timeout": 600, "model": "claude-sonnet-4-20250514" },
      "kiro-cli": { "timeout": 600 }
    },
    "autoCreateGithubRepo": false
  }
}
```

### GUI設定画面

Settings画面（`/settings`）にコーディングエージェント設定セクションを追加：

- 優先エージェント選択ドロップダウン
- エージェント別設定（モデル、タイムアウト）
- 接続テストボタン（CLI存在確認）
- GitHub自動リポジトリ作成トグル

### API

- `GET /api/settings/coding-agents` — 設定 + エージェント情報取得
- `PUT /api/settings/coding-agents` — 設定更新

## エラーハンドリング

| エラー | 対応 |
|--------|------|
| CLI未インストール | `isAvailable()` で false 返却、別エージェントにフォールバック |
| サブプロセスタイムアウト | プロセス強制終了、エラー結果返却 |
| サブプロセスクラッシュ | stderr 収集、エラー結果返却 |
| git clone 失敗 | リトライ後、エスカレーション |

## 統一AIサービス選択

### 概要

全ワークフローフェーズ（proposal / development / quality_assurance）で使用するAIサービスを統一的に設定できる機能。フェーズ別・エージェント（社員）別のオーバーライドにも対応する。

### サービス解決優先順位

コーディングエージェントの選択は以下の4段階の優先順位で解決される：

```
1. agentOverrides（社員別オーバーライド）  ← 最優先
2. phaseServices（フェーズ別設定）
3. preferredAgent（グローバルデフォルト）
4. レジストリのデフォルト優先順位          ← 最低優先
```

**解決ロジック**（`WorkflowEngine.resolveCodingAgent()`）:

1. `agentOverrides` に該当 `agentId` のエントリがあれば、そのサービスを使用
2. なければ `phaseServices` の該当フェーズ設定を使用
3. なければ `preferredAgent`（グローバルデフォルト）を使用
4. いずれも未設定の場合は `CodingAgentRegistry` のデフォルト優先順位に従う

### 設定構造

```json
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
      "development": "claude-code",
      "quality_assurance": "opencode"
    },
    "agentOverrides": [
      { "agentId": "reviewer", "service": "claude-code" },
      { "agentId": "coo_pm", "service": "kiro-cli", "model": "custom-model" }
    ]
  }
}
```

### 型定義

```typescript
// tools/cli/lib/execution/types.ts

/** コーディングエージェント名 */
type CodingAgentName = 'opencode' | 'claude-code' | 'kiro-cli';

/** フェーズ別AIサービス設定 */
interface PhaseServiceConfig {
  proposal?: CodingAgentName;
  development?: CodingAgentName;
  quality_assurance?: CodingAgentName;
}

/** エージェント（社員）別AIサービスオーバーライド */
interface AgentServiceOverride {
  agentId: string;
  service: CodingAgentName;
  model?: string;
}

/** AIサービス検出結果 */
interface ServiceDetectionResult {
  name: CodingAgentName;
  displayName: string;
  available: boolean;
  version: string | null;
  checkedAt: string;
}
```

### サービス検出API

環境にインストールされたCLIツールを自動検出するAPIエンドポイント。

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/settings/service-detection` | 利用可能なCLIツールを検出 |

**検出方法**:

| サービス | CLIコマンド | 検出コマンド |
|---------|------------|-------------|
| OpenCode | `opencode` | `where opencode` + `opencode --version` |
| Claude Code | `claude` | `where claude` + `claude --version` |
| Kiro CLI | `kiro` | `where kiro` + `kiro --version` |

**レスポンス例**:

```json
{
  "services": [
    {
      "name": "opencode",
      "displayName": "OpenCode",
      "available": true,
      "version": "v1.1.28",
      "checkedAt": "2026-02-14T10:00:00.000Z"
    },
    {
      "name": "claude-code",
      "displayName": "Claude Code",
      "available": false,
      "version": null,
      "checkedAt": "2026-02-14T10:00:00.000Z"
    }
  ]
}
```

### GUI設定画面

Settings画面（`/settings`）のコーディングエージェント設定セクションに以下のUIを提供：

| セクション | 機能 |
|-----------|------|
| サービス検出 | 環境で利用可能なCLIツールの表示（バージョン情報付き）、再検出ボタン |
| フェーズ別設定 | proposal / development / QA 各フェーズで使用するサービスのドロップダウン選択 |
| エージェント別オーバーライド | 特定エージェントに対するサービス個別指定の追加・削除 |

### 対応コンポーネント

| コンポーネント | ファイル | 変更内容 |
|---------------|---------|---------|
| WorkflowEngine | `tools/cli/lib/execution/workflow-engine.ts` | `resolveCodingAgent(phase, agentId)` メソッド追加、4段階優先順位解決 |
| WorkflowEngineOptions | `tools/cli/lib/execution/workflow-engine.ts` | `phaseServices`, `agentOverrides` フィールド追加 |
| OrchestratorServer | `tools/cli/lib/execution/orchestrator-server.ts` | `loadCodingAgentConfigSync()` で config.json から設定読み込み |
| Service Detection API | `gui/web/app/api/settings/service-detection/route.ts` | 新規作成 |
| Coding Agents API | `gui/web/app/api/settings/coding-agents/route.ts` | `phaseServices`, `agentOverrides` のバリデーション追加 |
| Settings Page | `gui/web/app/settings/page.tsx` | サービス検出UI、フェーズ別選択、オーバーライドUI追加 |
| 型定義 | `tools/cli/lib/execution/types.ts` | `PhaseServiceConfig`, `AgentServiceOverride`, `ServiceDetectionResult`, `CodingAgentName` 追加 |

## テスト

| テストファイル | 内容 |
|--------------|------|
| `tests/coding-agents/base.test.ts` | 基底インターフェーステスト |
| `tests/coding-agents/base.property.test.ts` | プロパティテスト |
| `tests/coding-agents/opencode.test.ts` | OpenCodeAdapter テスト |
| `tests/coding-agents/claude-code.test.ts` | ClaudeCodeAdapter テスト |
| `tests/coding-agents/kiro-cli.test.ts` | KiroCliAdapter テスト |
| `tests/coding-agents/registry.test.ts` | Registry テスト |
| `tests/coding-agents/registry.property.test.ts` | Registry プロパティテスト |
| `tests/execution/workspace-manager.test.ts` | WorkspaceManager テスト |
| `tests/execution/workspace-manager.property.test.ts` | WorkspaceManager プロパティテスト |
| `tests/execution/worker-coding-integration.test.ts` | WorkerAgent統合テスト |

合計: 11ファイル、133テスト
