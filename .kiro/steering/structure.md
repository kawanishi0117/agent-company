---
inclusion: always
---

# プロジェクト構成

## ディレクトリ構造

```
agent-company/
├── .kiro/                       # Kiro設定
│   ├── specs/                   # 機能仕様（開発中）
│   │   ├── agent-execution-engine/
│   │   ├── m0-skeleton/
│   │   ├── m1-docker-workspace/
│   │   ├── m2-quality-gates/
│   │   ├── m3-governance/
│   │   ├── m4-gui/
│   │   └── m5-hiring-system/
│   └── steering/                # LLM向けガイドライン
│       ├── always.md            # 常時適用ルール
│       ├── product.md           # プロダクト概要
│       ├── tech.md              # 技術スタック
│       └── structure.md         # 本ファイル
│
├── docs/                        # 会社の規程（人が読める）
│   ├── specs/                   # 機能仕様書（正式版）
│   │   ├── agent-execution-engine.md
│   │   ├── ai-adapters.md
│   │   ├── m0-skeleton.md
│   │   ├── m1-docker-workspace.md
│   │   ├── m2-quality-gates.md
│   │   ├── m3-governance.md
│   │   ├── m4-gui.md
│   │   └── m5-hiring-system.md
│   ├── company/                 # 不変のポリシー
│   │   ├── policies.md          # 会社ポリシー
│   │   ├── definition-of-done.md # 完了基準
│   │   ├── review-standards.md  # レビュー基準
│   │   └── waiver-policy.md     # 例外承認ルール
│   ├── playbooks/               # 運用手順書
│   │   └── hiring.md            # 採用手順
│   └── architecture/            # 設計ドキュメント
│       ├── overview.md          # アーキテクチャ概要
│       ├── container-isolation.md
│       ├── execution-engine.md
│       └── worker-management.md
│
├── agents/                      # エージェント定義
│   ├── registry/                # 採用済みエージェント
│   │   ├── coo_pm.yaml          # COO/PM
│   │   ├── quality_authority.yaml # Quality Authority
│   │   ├── hiring_manager.yaml  # Hiring Manager
│   │   ├── reviewer.yaml        # Reviewer Agent
│   │   ├── merger.yaml          # Merger Agent
│   │   └── templates/           # テンプレート
│   │       ├── agent_template.yaml
│   │       └── worker.yaml
│   └── prompts/                 # 役割別プロンプト
│       ├── shared/              # 共通プロンプト
│       ├── roles/               # 役割別
│       │   ├── manager.md
│       │   └── worker.md
│       └── rubrics/             # 評価基準
│
├── workflows/                   # 作業管理
│   ├── backlog/                 # チケット（1件=1ファイル）
│   │   ├── TEMPLATE.md
│   │   └── 0001-sample.md
│   ├── reports/                 # レポート
│   │   ├── daily/
│   │   └── weekly/
│   ├── decisions/               # ADR（意思決定ログ）
│   └── waivers/                 # 例外承認記録
│       └── TEMPLATE.md
│
├── tools/                       # 実行ツール
│   ├── cli/                     # AgentCompany CLI
│   │   ├── agentcompany.ts      # メインエントリ
│   │   ├── ticket.ts            # チケットパーサー
│   │   ├── workflow.ts          # ワークフロー実行
│   │   ├── validator.ts         # エージェント検証
│   │   ├── deliverable-validator.ts # 成果物検証
│   │   ├── commands/            # CLIコマンド
│   │   │   ├── execute.ts       # 実行コマンド
│   │   │   ├── hire.ts          # 採用コマンド
│   │   │   ├── judge.ts         # 判定コマンド
│   │   │   ├── project.ts       # プロジェクト管理
│   │   │   └── waiver.ts        # Waiver管理
│   │   └── lib/                 # ライブラリ
│   │       ├── execution/       # 実行エンジン
│   │       │   ├── types.ts     # 型定義
│   │       │   ├── orchestrator.ts
│   │       │   ├── state-manager.ts
│   │       │   ├── agent-bus.ts
│   │       │   ├── worker-pool.ts
│   │       │   ├── worker-container.ts
│   │       │   ├── container-runtime.ts
│   │       │   ├── git-manager.ts
│   │       │   ├── git-credentials.ts
│   │       │   ├── decomposer.ts
│   │       │   ├── quality-gate.ts
│   │       │   ├── error-handler.ts
│   │       │   ├── process-monitor.ts
│   │       │   ├── message-queue.ts
│   │       │   ├── project-manager.ts
│   │       │   ├── tools.ts
│   │       │   └── agents/      # エージェント実装
│   │       │       ├── manager-agent.ts
│   │       │       ├── worker-agent.ts
│   │       │       ├── reviewer-agent.ts
│   │       │       └── merger-agent.ts
│   │       ├── hiring/          # 採用システム
│   │       │   ├── jd-generator.ts
│   │       │   ├── interview-generator.ts
│   │       │   ├── trial-runner.ts
│   │       │   ├── scoring-engine.ts
│   │       │   └── registry-manager.ts
│   │       ├── judgment.ts      # 品質判定
│   │       └── waiver-validator.ts
│   ├── installers/              # 許可リスト管理
│   │   ├── install.sh           # インストーラ
│   │   ├── allowlist-parser.ts
│   │   ├── installer.ts
│   │   ├── log-writer.ts
│   │   └── allowlist/           # 許可リスト
│   │       ├── apt.txt
│   │       ├── pip.txt
│   │       └── npm.txt
│   ├── validators/              # ルール検査
│   └── adapters/                # AI CLIアダプタ
│       ├── base.ts              # 基底クラス
│       ├── index.ts             # エクスポート
│       └── ollama.ts            # Ollama実装
│
├── runtime/                     # 実行時データ（自動生成）
│   ├── runs/                    # 実行ログ・成果物
│   │   └── <date>-<run-id>/
│   │       ├── logs.txt
│   │       ├── report.md
│   │       ├── result.json
│   │       └── judgment.json
│   ├── cache/                   # キャッシュ
│   ├── logs/                    # ログ
│   │   └── install/             # インストールログ
│   ├── state/                   # ジョブ状態
│   │   ├── config.json          # システム設定
│   │   ├── bus/                 # Agent Bus状態
│   │   │   ├── history/
│   │   │   └── queues/
│   │   └── runs/
│   ├── e2e-artifacts/           # E2Eテスト成果物
│   └── e2e-report/              # E2Eレポート
│
├── infra/                       # インフラ定義
│   ├── docker/
│   │   ├── compose.yaml         # Docker Compose
│   │   ├── README.md
│   │   ├── images/
│   │   │   ├── base/            # ベースイメージ
│   │   │   │   ├── Dockerfile
│   │   │   │   ├── install.sh
│   │   │   │   └── allowlist/
│   │   │   └── worker/          # ワーカーイメージ
│   │   │       ├── Dockerfile
│   │   │       └── entrypoint.sh
│   │   └── policies/
│   └── ci/
│
├── gui/                         # ダッシュボード
│   └── web/                     # Next.js App
│       ├── app/                 # App Router
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── globals.css
│       │   ├── api/             # API Routes
│       │   │   ├── backlog/
│       │   │   ├── command/
│       │   │   ├── dashboard/
│       │   │   ├── reports/
│       │   │   ├── review/
│       │   │   ├── runs/
│       │   │   ├── settings/
│       │   │   └── tasks/
│       │   ├── backlog/         # Backlog画面
│       │   ├── command/         # Command Center
│       │   ├── dashboard/       # Dashboard
│       │   ├── reports/         # Reports画面
│       │   ├── review/          # Review画面
│       │   ├── runs/            # Runs画面
│       │   ├── settings/        # Settings画面
│       │   └── tasks/           # Task詳細
│       ├── components/          # UIコンポーネント
│       │   ├── backlog/
│       │   ├── layout/
│       │   ├── reports/
│       │   ├── runs/
│       │   └── ui/              # 共通UI
│       ├── lib/                 # ユーティリティ
│       │   ├── types.ts
│       │   └── parsers/
│       ├── package.json
│       ├── tailwind.config.ts
│       └── vitest.config.ts
│
├── tests/                       # テスト
│   ├── execution/               # 実行エンジンテスト
│   │   ├── orchestrator.test.ts
│   │   ├── agent-bus.test.ts
│   │   ├── worker-container.test.ts
│   │   └── *.property.test.ts   # Property-based
│   ├── adapters/
│   └── *.test.ts
│
├── e2e/                         # E2Eテスト
│   ├── cli-workflow.spec.ts
│   ├── execution-engine.spec.ts
│   ├── governance.spec.ts
│   └── gui.spec.ts
│
├── workspaces/                  # 対象案件管理
│   └── projects.json
│
├── coverage/                    # カバレッジレポート
├── Makefile                     # 統一コマンド
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── MVP.md                       # MVPロードマップ
└── README.md
```

## 境界の意図

| ディレクトリ   | 役割                           | 変更頻度 | 所有者           |
| -------------- | ------------------------------ | -------- | ---------------- |
| `docs/company/`| 会社規程（プロンプトより上位） | 低       | Quality Authority |
| `docs/specs/`  | 正式仕様書                     | 低       | COO/PM           |
| `agents/`      | 採用・人格定義                 | 中       | Hiring Manager   |
| `tools/`       | 実行手段（CLI/インストーラ）   | 高       | Developer        |
| `infra/`       | Docker/隔離/権限               | 低       | システム管理者   |
| `runtime/`     | ログ・成果物                   | 自動生成 | -                |
| `gui/`         | 可視化UI                       | 中       | Developer        |
| `workflows/`   | 作業管理                       | 高       | COO/PM           |

## 重要な設計原則

### 1. 採用と実行を分離
- `agents/registry/`: エージェント定義（YAML）
- `tools/adapters/`: AI実行アダプタ（TypeScript）
- 混ぜない

### 2. 成果物集約
- 全ての実行結果は `runtime/runs/<run-id>/` に保存
- 構造: `logs.txt`, `report.md`, `result.json`, `judgment.json`

### 3. 例外のファイル化
- `workflows/waivers/` に期限付きで記録
- 必須項目: 期限、理由、代替策、フォロータスク

### 4. 許可リスト集約
- `tools/installers/allowlist/` で一元管理
- 新規追加はWaiver申請 → セキュリティレビュー → 承認後追加

### 5. 状態の永続化
- `runtime/state/config.json`: システム設定
- `runtime/state/bus/`: Agent Bus状態
- `runtime/state/runs/`: 実行状態

## ファイル命名規則

| 種別               | パターン                    | 例                           |
| ------------------ | --------------------------- | ---------------------------- |
| TypeScriptソース   | `kebab-case.ts`             | `agent-bus.ts`               |
| テストファイル     | `*.test.ts`                 | `orchestrator.test.ts`       |
| Property-based     | `*.property.test.ts`        | `agent-bus.property.test.ts` |
| E2Eテスト          | `*.spec.ts`                 | `cli-workflow.spec.ts`       |
| エージェント定義   | `snake_case.yaml`           | `coo_pm.yaml`                |
| チケット           | `NNNN-title.md`             | `0001-sample.md`             |
| 実行ディレクトリ   | `YYYY-MM-DD-HHMMSS-<id>`    | `2026-01-27-151426-q3me`     |

## インポートパス

### CLI（ESM）
```typescript
// 相対パス + .js 拡張子
import { parseTicket } from './ticket.js';
import { StateManager } from './lib/execution/state-manager.js';
```

### GUI（Next.js）
```typescript
// パスエイリアス
import { Button } from '@/components/ui/Button';
import { parseRun } from '@/lib/parsers/run';
```
