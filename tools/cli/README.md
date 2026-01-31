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

| ファイル                   | 用途                     |
| -------------------------- | ------------------------ |
| `agentcompany.ts`          | メインエントリポイント   |
| `workflow.ts`              | Plan → Run → Report 実行 |
| `ticket.ts`                | チケットパーサー         |
| `validator.ts`             | エージェント定義検証     |
| `deliverable-validator.ts` | 成果物検証               |
| `commands/judge.ts`        | 品質判定コマンド         |
| `commands/waiver.ts`       | Waiver管理コマンド       |
| `lib/judgment.ts`          | 判定ロジック             |
| `lib/waiver-validator.ts`  | Waiver検証               |
| `lib/hiring/`              | 採用システムライブラリ   |

## ライブラリ

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

## 環境変数

| 変数          | 説明                 | デフォルト               |
| ------------- | -------------------- | ------------------------ |
| `OLLAMA_HOST` | Ollamaエンドポイント | `http://localhost:11434` |

## エラーコード

| コード | 意味                   |
| ------ | ---------------------- |
| 0      | 成功                   |
| 1      | チケット読み込みエラー |
| 2      | 実行エラー             |
| 3      | 検証エラー             |
