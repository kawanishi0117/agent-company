# Design Document: Coding Agent Integration

## Overview

外部コーディングエージェントCLI（opencode、Claude Code、Kiro CLI）をAgentCompanyのワーカーとして統合する。AgentCompanyはオーケストレーション層に徹し、実際のコーディング作業はCLIサブプロセスとして実行される外部エージェントに委譲する。

### 設計目標

1. **CLIラッパーパターン**: AI APIを直接叩かず、CLIツールをサブプロセスとして実行
2. **統一インターフェース**: 異なるCLIツールを同一のインターフェースで扱う
3. **既存アダプタとの共存**: Ollama（テキスト生成用）は会議・提案書生成に継続使用
4. **実用的なGit操作**: 実際のリポジトリclone、ブランチ作成、コミット、PR作成

### 既存コンポーネントとの関係

| コンポーネント | 役割 | 変更 |
|---------------|------|------|
| `tools/adapters/` | テキスト生成（会議、提案書） | 変更なし |
| `tools/coding-agents/` | **新規**: コーディング作業 | 新規作成 |
| `WorkerAgent` | タスク実行 | CodingAgentAdapter使用に拡張 |
| `WorkflowEngine` | 開発フェーズ制御 | WorkspaceManager統合 |
| `GitManager` | Git操作 | 変更なし（既存を活用） |

## Architecture

```
社長（GUI）
    ↓ タスク送信
Orchestrator → WorkflowEngine
    ↓ 開発フェーズ
WorkspaceManager（git clone / branch作成）
    ↓ 作業ディレクトリ準備
WorkerAgent
    ↓ CodingAgentAdapter選択
┌─────────────────────────────────────┐
│  CodingAgentRegistry                │
│  ├── OpenCodeAdapter    (opencode)  │
│  ├── ClaudeCodeAdapter  (claude)    │
│  └── KiroCliAdapter     (kiro)      │
└─────────────────────────────────────┘
    ↓ CLIサブプロセス実行
コーディングエージェントが作業ディレクトリで作業
    ↓ 結果収集
WorkerAgent → git commit/push → ReviewWorkflow → PR作成
```

## Components and Interfaces

### 1. CodingAgentAdapter（基底インターフェース）

```typescript
// tools/coding-agents/base.ts

/** コーディングタスクオプション */
interface CodingTaskOptions {
  /** 作業ディレクトリ（git clone先） */
  workingDirectory: string;
  /** 作業指示プロンプト */
  prompt: string;
  /** システムプロンプト（オプション） */
  systemPrompt?: string;
  /** 使用モデル（オプション） */
  model?: string;
  /** 許可ツール（オプション） */
  allowedTools?: string[];
  /** タイムアウト秒数（デフォルト: 600） */
  timeout?: number;
  /** 環境変数（オプション） */
  env?: Record<string, string>;
}

/** コーディングタスク結果 */
interface CodingTaskResult {
  /** 成功フラグ */
  success: boolean;
  /** 標準出力 */
  output: string;
  /** 標準エラー出力 */
  stderr: string;
  /** 終了コード */
  exitCode: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** 変更されたファイル一覧（検出可能な場合） */
  filesChanged: string[];
}

/** コーディングエージェントアダプタ */
interface CodingAgentAdapter {
  /** アダプタ名 */
  readonly name: string;
  /** 表示名 */
  readonly displayName: string;
  /** タスクを実行 */
  execute(options: CodingTaskOptions): Promise<CodingTaskResult>;
  /** CLIが利用可能かチェック */
  isAvailable(): Promise<boolean>;
  /** バージョン情報を取得 */
  getVersion(): Promise<string | null>;
}
```

### 2. OpenCodeAdapter

```typescript
// tools/coding-agents/opencode.ts

// 実行コマンド例:
// opencode run "Implement the login feature" --format json --model claude-sonnet-4-20250514
```

### 3. ClaudeCodeAdapter

```typescript
// tools/coding-agents/claude-code.ts

// 実行コマンド例:
// claude -p "Implement the login feature" --output-format json --add-dir /workspace
```

### 4. KiroCliAdapter

```typescript
// tools/coding-agents/kiro-cli.ts

// 実行コマンド例:
// kiro chat -p "Implement the login feature"
```

### 5. CodingAgentRegistry

```typescript
// tools/coding-agents/index.ts

/** レジストリ */
class CodingAgentRegistry {
  /** 利用可能なエージェント一覧を取得 */
  getAvailableAgents(): Promise<CodingAgentAdapter[]>;
  /** 名前でアダプタを取得 */
  getAdapter(name: string): CodingAgentAdapter;
  /** 優先度に基づいてアダプタを選択 */
  selectAdapter(preferred?: string): Promise<CodingAgentAdapter>;
}
```

### 6. WorkspaceManager

```typescript
// tools/cli/lib/execution/workspace-manager.ts

/** ワークスペース管理 */
class WorkspaceManager {
  /** リポジトリをcloneして作業ディレクトリを準備 */
  prepareWorkspace(projectId: string, gitUrl: string, branch?: string): Promise<string>;
  /** 新規プロジェクト用のワークスペースを作成 */
  createNewWorkspace(projectId: string, options?: NewWorkspaceOptions): Promise<string>;
  /** タスクブランチを作成 */
  createTaskBranch(workspacePath: string, ticketId: string, description: string): Promise<string>;
  /** 作業ディレクトリをクリーンアップ */
  cleanup(workspacePath: string): Promise<void>;
}
```

## Data Models

### コーディングエージェント設定

```typescript
/** SystemConfigへの追加フィールド */
interface CodingAgentConfig {
  /** 優先コーディングエージェント名 */
  preferredCodingAgent: string;
  /** エージェント別設定 */
  agentSettings: Record<string, {
    model?: string;
    timeout?: number;
    additionalFlags?: string[];
  }>;
  /** 新規プロジェクト時にGitHubリポジトリを自動作成するか */
  autoCreateGithubRepo: boolean;
}
```

### ワークスペースディレクトリ構造

```
runtime/workspaces/
└── <project-id>/
    ├── repo/              # git clone先
    └── workspace.json     # ワークスペースメタデータ
```

## Correctness Properties

### Property 1: Adapter Interface Compliance

_For any_ CodingAgentAdapter implementation, the execute() method SHALL return a CodingTaskResult with all required fields (success, output, exitCode, durationMs, filesChanged).

**Validates: Requirements 1.1, 1.3**

### Property 2: Availability Detection Accuracy

_For any_ installed CLI tool, isAvailable() SHALL return true. For any uninstalled CLI tool, isAvailable() SHALL return false.

**Validates: Requirements 1.4, 5.1**

### Property 3: Subprocess Timeout Enforcement

_For any_ coding task execution, if the subprocess exceeds the specified timeout, the adapter SHALL terminate the process and return a result with success=false.

**Validates: Requirements 2.4, 3.5, 4.4**

### Property 4: Workspace Isolation

_For any_ two concurrent task executions, their working directories SHALL be distinct paths with no shared mutable state.

**Validates: Requirements 6.1, 6.2**

### Property 5: Git Branch Naming Convention

_For any_ task branch created by WorkspaceManager, the branch name SHALL follow the format `agent/<ticket-id>-<description>`.

**Validates: Requirements 6.2**

### Property 6: Registry Fallback Selection

_For any_ adapter selection where the preferred adapter is unavailable, the registry SHALL fall back to the next available adapter in priority order.

**Validates: Requirements 5.4**

## Error Handling

| エラー | 対応 |
|--------|------|
| CLI未インストール | isAvailable()でfalse返却、別エージェントにフォールバック |
| サブプロセスタイムアウト | プロセス強制終了、エラー結果返却 |
| サブプロセスクラッシュ | stderr収集、エラー結果返却 |
| git clone失敗 | リトライ後、エスカレーション |
| 作業ディレクトリ不正 | バリデーションエラー |

## Testing Strategy

### テストファイル構成

```
tests/
├── coding-agents/
│   ├── base.test.ts
│   ├── base.property.test.ts
│   ├── opencode.test.ts
│   ├── claude-code.test.ts
│   ├── kiro-cli.test.ts
│   └── registry.test.ts
└── execution/
    └── workspace-manager.test.ts
```
