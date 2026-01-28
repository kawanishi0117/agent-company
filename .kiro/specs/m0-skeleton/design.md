# Design Document: M0 - 会社の骨格

## Overview

AgentCompanyの基盤となる「会社の骨格」を構築する。エージェント定義のスキーマ、固定エージェント、成果物フォーマット、ワークフロー基盤、AI実行アダプタを整備し、最小限のワークフロー（Plan → Run → Report）が動作することを目指す。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentCompany                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   COO/PM    │───▶│   Worker    │───▶│  Quality    │     │
│  │ (Orchestrator)   │  (Executor) │    │  Authority  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Ollama Adapter (AI実行基盤)             │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Ollama (localhost:11434)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Registry Schema

エージェント定義の標準スキーマ。

```yaml
# agents/registry/templates/agent_template.yaml
id: string # 一意識別子（snake_case）
title: string # 表示名
responsibilities: # 責務リスト
  - string
capabilities: # 能力リスト
  - string
deliverables: # 成果物リスト
  - string
quality_gates: # 品質ゲート
  - string
budget: # 予算制約
  tokens: number # トークン上限
  time_minutes: number
persona: string # 人格設定（プロンプト）
escalation: # エスカレーション先
  to: string # エージェントID
  conditions: # 条件リスト
    - string
```

### 2. Base Adapter Interface

AI CLIとの通信を抽象化するインターフェース。

```typescript
// tools/adapters/base.ts
export interface GenerateOptions {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AdapterResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  finishReason?: string;
}

export interface BaseAdapter {
  name: string;

  // 単発生成
  generate(options: GenerateOptions): Promise<AdapterResponse>;

  // チャット形式
  chat(options: ChatOptions): Promise<AdapterResponse>;

  // ヘルスチェック
  isAvailable(): Promise<boolean>;
}
```

### 3. Ollama Adapter

Ollama REST APIとの通信を実装。

```typescript
// tools/adapters/ollama.ts
export class OllamaAdapter implements BaseAdapter {
  name = 'ollama';
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async generate(options: GenerateOptions): Promise<AdapterResponse>;
  async chat(options: ChatOptions): Promise<AdapterResponse>;
  async isAvailable(): Promise<boolean>;
}
```

### 4. Ticket Format

チケットの標準フォーマット。

```markdown
# workflows/backlog/NNNN-title.md

---

id: "NNNN"
status: "todo" | "doing" | "review" | "done"
assignee: "agent_id"
created: "ISO8601"
updated: "ISO8601"

---

## 目的

[このチケットで達成したいこと]

## 範囲

[変更対象のファイル・コンポーネント]

## DoD (Definition of Done)

- [ ] 条件1
- [ ] 条件2

## リスク

[想定されるリスクと対策]

## ロールバック

[問題発生時の復旧手順]
```

### 5. Definition of Done Format

成果物の標準フォーマット。

```markdown
# 成果物レポート

## 目的

[変更の目的]

## 変更点

[具体的な変更内容]

## テスト結果

[ユニットテストの結果]

## E2E結果

[E2Eテストの結果、スクショ/動画リンク]

## ロールバック

[復旧手順]

## リスク / 未検証

[残存リスク、未検証項目]
```

### 6. Workflow Engine (Minimal)

M0では最小限のワークフローエンジンを実装。

```typescript
// tools/cli/workflow.ts
export interface WorkflowStep {
  name: string;
  execute(): Promise<StepResult>;
}

export interface StepResult {
  success: boolean;
  output: string;
  artifacts?: string[];
}

export class MinimalWorkflow {
  async plan(ticket: Ticket): Promise<Plan>;
  async run(plan: Plan): Promise<RunResult>;
  async report(result: RunResult): Promise<Report>;
}
```

## Data Models

### Agent Definition

```typescript
interface AgentDefinition {
  id: string;
  title: string;
  responsibilities: string[];
  capabilities: string[];
  deliverables: string[];
  qualityGates: string[];
  budget: {
    tokens: number;
    timeMinutes: number;
  };
  persona: string;
  escalation: {
    to: string;
    conditions: string[];
  };
}
```

### Ticket

```typescript
interface Ticket {
  id: string;
  status: 'todo' | 'doing' | 'review' | 'done';
  assignee: string;
  created: string;
  updated: string;
  purpose: string;
  scope: string[];
  dod: string[];
  risks: string[];
  rollback: string;
}
```

### Run Result

```typescript
interface RunResult {
  runId: string;
  ticketId: string;
  startTime: string;
  endTime: string;
  status: 'success' | 'failure' | 'partial';
  logs: string[];
  artifacts: string[];
}
```

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: Schema Conformance

_For any_ valid agent definition YAML file, parsing and validating against the Registry Schema SHALL succeed without errors.

**Validates: Requirements 1.1, 2.3, 3.3**

### Property 2: Invalid Definition Detection

_For any_ agent definition YAML file missing one or more required fields (id, title, responsibilities, capabilities, deliverables, quality_gates, budget, persona, escalation), the Validator SHALL return an error indicating the missing field(s).

**Validates: Requirements 1.3**

### Property 3: Deliverable Validation

_For any_ deliverable report missing one or more required sections (目的, 変更点, テスト結果, E2E結果, ロールバック, リスク), the Quality Authority SHALL issue a FAIL judgment.

**Validates: Requirements 4.3**

## Error Handling

### Ollama Connection Errors

- Ollamaが起動していない場合: `OllamaNotAvailableError` を返す
- タイムアウト: 30秒でタイムアウトし、`OllamaTimeoutError` を返す
- 不正なレスポンス: `OllamaResponseError` を返す

### Validation Errors

- スキーマ違反: `SchemaValidationError` を返す（不足フィールドを明示）
- ファイル不存在: `FileNotFoundError` を返す

### Workflow Errors

- Plan失敗: ログに記録し、ステータスを `failure` に設定
- Run失敗: 部分的な成果物を保存し、ステータスを `partial` に設定

## Testing Strategy

### Unit Tests

- Registry Schemaバリデーション
- Ticket/Report パース
- Adapter インターフェース実装

### Property-Based Tests

- **Property 1**: ランダムに生成した有効なエージェント定義がスキーマに準拠することを検証
- **Property 2**: ランダムに1つ以上のフィールドを削除したエージェント定義がエラーを返すことを検証
- **Property 3**: ランダムに1つ以上のセクションを削除した成果物がFAIL判定を受けることを検証

### Integration Tests

- Ollama接続テスト（モック使用可）
- ワークフロー実行テスト（Plan → Run → Report）

### Testing Framework

- **Unit/Property Tests**: Vitest + fast-check
- **E2E Tests**: Playwright（M2で実装）
- **Property Test Configuration**: 最低100回のイテレーション
