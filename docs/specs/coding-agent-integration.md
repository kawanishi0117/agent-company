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
