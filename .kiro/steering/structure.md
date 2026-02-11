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
│   │   ├── ai-execution-integration/
│   │   ├── autonomous-agent-workflow/
│   │   ├── coding-agent-integration/
│   │   ├── company-workflow-engine/
│   │   ├── end-to-end-workflow-wiring/
│   │   ├── m0-skeleton/
│   │   ├── m1-docker-workspace/
│   │   ├── m2-quality-gates/
│   │   ├── m3-governance/
│   │   ├── m4-gui/
│   │   ├── m5-hiring-system/
│   │   └── workflow-production-ready/
│   └── steering/                # LLM向けガイドライン
│       ├── always.md            # 常時適用ルール
│       ├── product.md           # プロダクト概要
│       ├── tech.md              # 技術スタック
│       └── structure.md         # 本ファイル
│
├── docs/                        # 会社の規程（人が読める）
│   ├── specs/                   # 機能仕様書（正式版）
│   │   ├── README.md
│   │   ├── agent-execution-engine.md
│   │   ├── ai-adapters.md
│   │   ├── ai-execution-integration.md
│   │   ├── autonomous-agent-workflow.md
│   │   ├── coding-agent-integration.md
│   │   ├── company-workflow-engine.md
│   │   ├── end-to-end-workflow-wiring.md
│   │   ├── workflow-production-ready.md
│   │   └── milestones/
│   │       ├── m0-skeleton.md
│   │       ├── m1-docker-workspace.md
│   │       ├── m2-quality-gates.md
│   │       ├── m3-governance.md
│   │       ├── m4-gui.md
│   │       └── m5-hiring-system.md
│   ├── company/                 # 不変のポリシー
│   │   ├── policies.md
│   │   ├── definition-of-done.md
│   │   ├── review-standards.md
│   │   └── waiver-policy.md
│   ├── playbooks/               # 運用手順書
│   │   └── hiring.md
│   └── architecture/            # 設計ドキュメント
│       ├── README.md
│       ├── overview.md
│       ├── execution-engine.md
│       ├── orchestrator-server.md
│       ├── ai-integration.md
│       ├── workflow-engine.md
│       ├── container-isolation.md
│       └── worker-management.md
│
├── agents/                      # エージェント定義
│   ├── registry/                # 採用済みエージェント
│   │   ├── coo_pm.yaml
│   │   ├── quality_authority.yaml
│   │   ├── hiring_manager.yaml
│   │   ├── reviewer.yaml
│   │   ├── merger.yaml
│   │   └── templates/
│   │       ├── agent_template.yaml
│   │       └── worker.yaml
│   └── prompts/                 # 役割別プロンプト
│       ├── shared/
│       ├── roles/
│       │   ├── manager.md
│       │   └── worker.md
│       └── rubrics/
│
├── workflows/                   # 作業管理
│   ├── backlog/                 # チケット（1件=1ファイル）
│   ├── reports/                 # レポート
│   ├── decisions/               # ADR（意思決定ログ）
│   └── waivers/                 # 例外承認記録
│
├── tools/                       # 実行ツール
│   ├── cli/                     # AgentCompany CLI
│   │   ├── agentcompany.ts      # メインエントリ
│   │   ├── ticket.ts            # チケットパーサー
│   │   ├── workflow.ts          # ワークフロー実行
│   │   ├── validator.ts         # エージェント検証
│   │   ├── deliverable-validator.ts # 成果物検証
│   │   ├── demo.ts              # デモ実行
│   │   ├── README.md            # CLI説明
│   │   ├── commands/            # CLIコマンド
│   │   │   ├── execute.ts       # 実行コマンド
│   │   │   ├── hire.ts          # 採用コマンド
│   │   │   ├── judge.ts         # 判定コマンド
│   │   │   ├── project.ts       # プロジェクト管理
│   │   │   ├── server.ts        # Orchestrator APIサーバー
│   │   │   ├── ticket.ts        # チケット管理
│   │   │   └── waiver.ts        # Waiver管理
│   │   └── lib/                 # ライブラリ
│   │       ├── execution/       # 実行エンジン
│   │       │   ├── types.ts     # 型定義
│   │       │   ├── orchestrator.ts
│   │       │   ├── orchestrator-server.ts
│   │       │   ├── state-manager.ts
│   │       │   ├── agent-bus.ts
│   │       │   ├── worker-pool.ts
│   │       │   ├── worker-container.ts
│   │       │   ├── container-runtime.ts
│   │       │   ├── git-manager.ts
│   │       │   ├── git-credentials.ts
│   │       │   ├── decomposer.ts
│   │       │   ├── quality-gate.ts
│   │       │   ├── quality-gate-integration.ts
│   │       │   ├── error-handler.ts
│   │       │   ├── process-monitor.ts
│   │       │   ├── message-queue.ts
│   │       │   ├── project-manager.ts
│   │       │   ├── ticket-manager.ts
│   │       │   ├── worker-type-registry.ts
│   │       │   ├── pr-creator.ts
│   │       │   ├── review-workflow.ts
│   │       │   ├── workflow-engine.ts     # 5フェーズワークフロー
│   │       │   ├── meeting-coordinator.ts
│   │       │   ├── approval-gate.ts
│   │       │   ├── ai-health-checker.ts   # AI可用性チェック
│   │       │   ├── execution-reporter.ts  # 実行レポート生成
│   │       │   ├── run-directory-manager.ts # 実行ディレクトリ管理
│   │       │   ├── settings-manager.ts    # 設定管理
│   │       │   ├── workspace-manager.ts   # ワークスペース管理
│   │       │   ├── tools.ts
│   │       │   └── agents/      # エージェント実装
│   │       │       ├── manager.ts
│   │       │       ├── worker.ts
│   │       │       ├── reviewer.ts
│   │       │       └── merger.ts
│   │       ├── hiring/          # 採用システム
│   │       │   ├── index.ts
│   │       │   ├── types.ts
│   │       │   ├── jd-generator.ts
│   │       │   ├── interview-generator.ts
│   │       │   ├── trial-runner.ts
│   │       │   ├── scoring-engine.ts
│   │       │   ├── registry-manager.ts
│   │       │   ├── hiring-logger.ts
│   │       │   └── notification.ts
│   │       ├── judgment.ts
│   │       └── waiver-validator.ts
│   ├── installers/              # 許可リスト管理
│   │   ├── install.sh
│   │   ├── allowlist-parser.ts
│   │   ├── installer.ts
│   │   ├── log-writer.ts
│   │   └── allowlist/
│   │       ├── apt.txt
│   │       ├── pip.txt
│   │       └── npm.txt
│   ├── validators/              # ルール検査
│   ├── adapters/                # AI CLIアダプタ（テキスト生成用）
│   │   ├── base.ts
│   │   ├── index.ts
│   │   └── ollama.ts
│   └── coding-agents/           # コーディングエージェントCLIラッパー
│       ├── base.ts
│       ├── opencode.ts
│       ├── claude-code.ts
│       ├── kiro-cli.ts
│       └── index.ts
│
├── runtime/                     # 実行時データ（自動生成）
│   ├── .pids/                   # プロセスID管理
│   ├── runs/                    # 実行ログ・成果物
│   ├── cache/
│   ├── logs/
│   │   └── install/
│   ├── notifications/           # 通知データ
│   ├── state/                   # ジョブ状態
│   │   ├── config.json
│   │   ├── bus/
│   │   └── runs/
│   ├── e2e-artifacts/
│   └── e2e-report/
│
├── infra/                       # インフラ定義
│   ├── docker/
│   │   ├── compose.yaml
│   │   ├── README.md
│   │   ├── images/
│   │   │   ├── base/
│   │   │   └── worker/
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
│       │   │   ├── projects/
│       │   │   ├── reports/
│       │   │   ├── review/
│       │   │   ├── runs/
│       │   │   ├── settings/
│       │   │   │   └── coding-agents/
│       │   │   ├── tasks/
│       │   │   ├── tickets/
│       │   │   └── workflows/
│       │   │       └── [id]/
│       │   │           ├── approve/
│       │   │           ├── meetings/
│       │   │           ├── progress/
│       │   │           ├── quality/
│       │   │           ├── escalation/
│       │   │           └── rollback/
│       │   ├── backlog/
│       │   ├── command/
│       │   ├── dashboard/
│       │   ├── projects/
│       │   ├── reports/
│       │   ├── review/
│       │   ├── runs/
│       │   ├── settings/
│       │   ├── tasks/
│       │   ├── tickets/         # チケット管理画面
│       │   │   ├── page.tsx
│       │   │   ├── create/
│       │   │   └── [id]/
│       │   └── workflows/
│       │       └── [id]/
│       ├── components/
│       │   ├── backlog/
│       │   ├── layout/
│       │   ├── projects/
│       │   ├── reports/
│       │   ├── runs/
│       │   ├── tickets/
│       │   ├── workflows/
│       │   └── ui/
│       ├── lib/
│       │   ├── types.ts
│       │   └── parsers/
│       ├── package.json
│       ├── tailwind.config.ts
│       └── vitest.config.ts
│
├── tests/                       # テスト
│   ├── execution/               # 実行エンジンテスト（*.test.ts, *.property.test.ts）
│   ├── coding-agents/           # コーディングエージェントテスト
│   ├── cli/                     # CLIコマンドテスト
│   ├── adapters/                # アダプタテスト
│   └── *.test.ts                # ルートレベルテスト
│
├── e2e/                         # E2Eテスト
│   ├── ai-execution-workflow.spec.ts
│   ├── cli-workflow.spec.ts
│   ├── execution-engine.spec.ts
│   ├── governance.spec.ts
│   ├── gui.spec.ts
│   ├── project-management.spec.ts
│   └── ticket-workflow.spec.ts
│
├── workspaces/                  # 対象案件管理
│   └── projects.json
│
├── scripts/                     # 起動・停止スクリプト
│   ├── start.ps1                # ワンコマンド起動（Windows）
│   ├── start.sh                 # ワンコマンド起動（Linux/macOS）
│   ├── status.ps1               # 起動状態確認（Windows）
│   ├── stop.ps1                 # 一括停止（Windows）
│   └── stop.sh                  # 一括停止（Linux/macOS）
│
├── coverage/                    # カバレッジレポート
├── Makefile
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── MVP.md
├── README.md
├── QUICKSTART.md                # クイックスタートガイド
└── CONTRIBUTING.md              # コントリビューションガイド
```

## 境界の意図

| ディレクトリ    | 役割                           | 変更頻度 | 所有者            |
| --------------- | ------------------------------ | -------- | ----------------- |
| `docs/company/` | 会社規程（プロンプトより上位） | 低       | Quality Authority |
| `docs/specs/`   | 正式仕様書                     | 低       | COO/PM            |
| `agents/`       | 採用・人格定義                 | 中       | Hiring Manager    |
| `tools/`        | 実行手段（CLI/インストーラ）   | 高       | Developer         |
| `infra/`        | Docker/隔離/権限               | 低       | システム管理者    |
| `runtime/`      | ログ・成果物                   | 自動生成 | -                 |
| `gui/`          | 可視化UI                       | 中       | Developer         |
| `workflows/`    | 作業管理                       | 高       | COO/PM            |

## 重要な設計原則

### 1. 採用と実行を分離

- `agents/registry/`: エージェント定義（YAML）
- `tools/adapters/`: AI実行アダプタ（テキスト生成用、TypeScript）
- `tools/coding-agents/`: コーディングエージェントCLIラッパー（コード生成用）
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
- `runtime/.pids/`: プロセスID管理

## ファイル命名規則

| 種別             | パターン                 | 例                           |
| ---------------- | ------------------------ | ---------------------------- |
| TypeScriptソース | `kebab-case.ts`          | `agent-bus.ts`               |
| テストファイル   | `*.test.ts`              | `orchestrator.test.ts`       |
| Property-based   | `*.property.test.ts`     | `agent-bus.property.test.ts` |
| E2Eテスト        | `*.spec.ts`              | `cli-workflow.spec.ts`       |
| エージェント定義 | `snake_case.yaml`        | `coo_pm.yaml`                |
| チケット         | `NNNN-title.md`          | `0001-sample.md`             |
| 実行ディレクトリ | `YYYY-MM-DD-HHMMSS-<id>` | `2026-01-27-151426-q3me`     |

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
