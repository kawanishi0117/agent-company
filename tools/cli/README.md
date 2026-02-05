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

| ファイル                   | 用途                       |
| -------------------------- | -------------------------- |
| `agentcompany.ts`          | メインエントリポイント     |
| `workflow.ts`              | Plan → Run → Report 実行   |
| `ticket.ts`                | チケットパーサー           |
| `validator.ts`             | エージェント定義検証       |
| `deliverable-validator.ts` | 成果物検証                 |
| `commands/judge.ts`        | 品質判定コマンド           |
| `commands/waiver.ts`       | Waiver管理コマンド         |
| `commands/hire.ts`         | 採用プロセスコマンド       |
| `commands/execute.ts`      | エージェント実行コマンド   |
| `commands/project.ts`      | プロジェクト管理コマンド   |
| `lib/judgment.ts`          | 判定ロジック               |
| `lib/waiver-validator.ts`  | Waiver検証                 |
| `lib/hiring/`              | 採用システムライブラリ     |
| `lib/execution/`           | エージェント実行エンジン   |

## ライブラリ

### lib/execution/ - エージェント実行エンジン

エージェント実行エンジンの機能を提供するライブラリ群。

| ファイル                | 用途                           | 状態   |
| ----------------------- | ------------------------------ | ------ |
| `types.ts`              | 共通型定義                     | ✅完了 |
| `orchestrator.ts`       | 全体制御・タスク管理           | ✅完了 |
| `state-manager.ts`      | 状態永続化・履歴管理           | ✅完了 |
| `agent-bus.ts`          | エージェント間通信             | ✅完了 |
| `message-queue.ts`      | メッセージキュー抽象化         | ✅完了 |
| `decomposer.ts`         | タスク分解                     | ✅完了 |
| `process-monitor.ts`    | コマンド実行監視               | ✅完了 |
| `git-manager.ts`        | Git操作管理                    | ✅完了 |
| `git-credentials.ts`    | Git認証管理                    | ✅完了 |
| `worker-pool.ts`        | ワーカープール管理             | ✅完了 |
| `worker-container.ts`   | ワーカーコンテナ管理           | ✅完了 |
| `container-runtime.ts`  | コンテナランタイム抽象化       | ✅完了 |
| `tools.ts`              | ツール呼び出しインターフェース | ✅完了 |
| `quality-gate.ts`       | 品質ゲート統合                 | ✅完了 |
| `error-handler.ts`      | エラーハンドリング             | ✅完了 |
| `project-manager.ts`    | プロジェクト管理               | ✅完了 |
| `agents/manager.ts`     | マネージャーエージェント       | ✅完了 |
| `agents/worker.ts`      | ワーカーエージェント           | ✅完了 |
| `agents/reviewer.ts`    | レビューエージェント           | ✅完了 |
| `agents/merger.ts`      | マージエージェント             | ✅完了 |

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
