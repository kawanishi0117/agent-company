# M0 - 会社の骨格

## 概要

AgentCompanyの基盤機能。エージェント定義スキーマ、固定エージェント、成果物フォーマット、AI実行基盤を提供する。

## 機能一覧

### 1. Registry Schema

エージェント定義の標準フォーマット。

**場所**: `agents/registry/templates/agent_template.yaml`

**必須フィールド**:

- `id`: 一意識別子
- `title`: エージェント名
- `responsibilities`: 責務リスト
- `capabilities`: 能力リスト
- `deliverables`: 成果物定義
- `quality_gates`: 品質基準
- `budget`: リソース制限
- `persona`: 人格設定
- `escalation`: エスカレーション先

### 2. 固定エージェント

#### COO/PM (`agents/registry/coo_pm.yaml`)

- バックログ管理
- タスクアサイン
- 実行指示
- 結果収集
- レポート生成

#### Quality Authority (`agents/registry/quality_authority.yaml`)

- PR/diff/ログレビュー
- PASS/FAIL/WAIVER判定

### 3. 成果物フォーマット

**Definition of Done**: `docs/company/definition-of-done.md`

必須セクション:

- 目的
- 変更点
- テスト結果
- E2E結果
- ロールバック手順
- リスク

### 4. チケットフォーマット

**テンプレート**: `workflows/backlog/TEMPLATE.md`

必須セクション:

- 目的
- 範囲
- DoD
- リスク
- ロールバック

### 5. AI実行基盤（Ollamaアダプタ）

**インターフェース**: `tools/adapters/base.ts`
**実装**: `tools/adapters/ollama.ts`

```typescript
interface BaseAdapter {
  generate(options: GenerateOptions): Promise<AdapterResponse>;
  chat(options: ChatOptions): Promise<AdapterResponse>;
  isAvailable(): Promise<boolean>;
}
```

**エンドポイント**: `localhost:11434`

### 6. ワークフロー

**CLI**: `tools/cli/agentcompany.ts`

```bash
# チケット実行
npx ts-node tools/cli/agentcompany.ts run <ticket-path>
```

**実行フロー**: Plan → Run → Report

**成果物出力先**: `runtime/runs/<date>-<run-id>/`

## 品質ゲート

```bash
make lint   # ESLint + Prettier
make test   # Vitest（プロパティテスト含む）
make ci     # 全ゲート
```

## バリデータ

| ツール                | 場所                                 | 用途                 |
| --------------------- | ------------------------------------ | -------------------- |
| Schema Validator      | `tools/cli/validator.ts`             | エージェント定義検証 |
| Deliverable Validator | `tools/cli/deliverable-validator.ts` | 成果物検証           |
