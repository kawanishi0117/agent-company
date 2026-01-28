# AgentCompany CLI

## 概要

AgentCompanyのコマンドラインインターフェース。チケット実行、検証、ワークフロー管理を行う。

## インストール

```bash
npm install
```

## コマンド

### チケット実行

```bash
npx ts-node tools/cli/agentcompany.ts run <ticket-path>

# 例
npx ts-node tools/cli/agentcompany.ts run workflows/backlog/0001-sample.md
```

**出力先**: `runtime/runs/<date>-<run-id>/`

### エージェント定義検証

```bash
npx ts-node tools/cli/validator.ts <agent-yaml>

# 例
npx ts-node tools/cli/validator.ts agents/registry/coo_pm.yaml
```

### 成果物検証

```bash
npx ts-node tools/cli/deliverable-validator.ts <deliverable-md>
```

## ファイル構成

| ファイル | 用途 |
|----------|------|
| `agentcompany.ts` | メインエントリポイント |
| `workflow.ts` | Plan → Run → Report 実行 |
| `ticket.ts` | チケットパーサー |
| `validator.ts` | エージェント定義検証 |
| `deliverable-validator.ts` | 成果物検証 |

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

## 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `OLLAMA_HOST` | Ollamaエンドポイント | `http://localhost:11434` |

## エラーコード

| コード | 意味 |
|--------|------|
| 0 | 成功 |
| 1 | チケット読み込みエラー |
| 2 | 実行エラー |
| 3 | 検証エラー |
