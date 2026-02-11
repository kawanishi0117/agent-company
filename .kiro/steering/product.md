---
inclusion: always
---

# AgentCompany - プロダクト概要

## コンセプト

AIエージェントを「会社組織」として運用するフレームワーク。
エージェントに役割・責任・品質基準を与え、ガバナンス付きで自律的に作業させる。

## 3ライン構造

| ライン     | 役割       | 担当エージェント                  |
| ---------- | ---------- | --------------------------------- |
| Delivery   | 実行・納品 | Worker Agent, Developer           |
| Governance | 品質判定   | Quality Authority, Reviewer Agent |
| Talent     | 採用・評価 | Hiring Manager                    |

## 固定エージェント

| エージェント      | 役割                                                       | 定義ファイル                             |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------- |
| COO/PM            | バックログ管理、アサイン、実行指示、結果収集、レポート生成 | `agents/registry/coo_pm.yaml`            |
| Quality Authority | PR/差分/ログを見て `PASS/FAIL/WAIVER` 判定                 | `agents/registry/quality_authority.yaml` |
| Hiring Manager    | JD生成、面接課題生成、試用実行、Registry登録               | `agents/registry/hiring_manager.yaml`    |
| Reviewer          | コードレビュー、品質チェック                               | `agents/registry/reviewer.yaml`          |
| Merger            | ブランチマージ、コンフリクト解決                           | `agents/registry/merger.yaml`            |

## 主要機能

### 1. Docker隔離環境での安全な実行

- ワーカーコンテナは `/workspace` にリポジトリをclone
- 非rootユーザー（`agent`）で実行
- リソース制限（CPU: 2コア、メモリ: 4GB）
- ネットワーク隔離（Agent Bus経由のみ通信可能）

### 2. allowlist方式による依存管理

- 許可リスト: `tools/installers/allowlist/{apt,pip,npm}.txt`
- インストーラ: `tools/installers/install.sh`
- allowlist外のパッケージは自動拒否
- 全インストール操作をJSONLログに記録

### 3. 品質ゲート（lint/test/e2e）の強制

- `make lint`: ESLint + Prettier
- `make test`: Vitest（カバレッジ80%目標）
- `make e2e`: Playwright
- `make ci`: 全ゲート統合

### 4. Registry登録によるエージェント採用

- YAML形式でエージェント定義
- 必須フィールド: id, title, responsibilities, capabilities, deliverables, quality_gates, budget, persona, escalation
- 採用フロー: JD生成 → 面接課題 → 試用実行 → スコア化 → 登録

### 5. GUI（Backlog/Runs/Reports）での可視化

- Backlog: カンバンボード（Todo/Doing/Review/Done）
- Runs: 実行ログ、成果物リンク
- Reports: 日次/週次レポート
- Dashboard: リアルタイム実行状況
- Command Center: タスク投入・制御

## Agent Execution Engine

### 実行フロー

```
社長からの指示
    ↓
Task Decomposer（タスク分解）
    ↓
Manager Agent（アサイン・監督）
    ↓
Worker Container（隔離実行）
    ↓
Reviewer Agent（コードレビュー）
    ↓
Quality Gate（lint/test）
    ↓
Merger Agent（ブランチマージ）
    ↓
成果物出力
```

### 主要コンポーネント

| コンポーネント   | 役割                   | 場所                                          |
| ---------------- | ---------------------- | --------------------------------------------- |
| Orchestrator     | 全体制御、タスク管理   | `tools/cli/lib/execution/orchestrator.ts`     |
| State Manager    | 状態永続化             | `tools/cli/lib/execution/state-manager.ts`    |
| Agent Bus        | エージェント間通信     | `tools/cli/lib/execution/agent-bus.ts`        |
| Worker Pool      | ワーカー管理           | `tools/cli/lib/execution/worker-pool.ts`      |
| Worker Container | 隔離実行環境           | `tools/cli/lib/execution/worker-container.ts` |
| Git Manager      | ブランチ・コミット管理 | `tools/cli/lib/execution/git-manager.ts`      |
| Quality Gate     | 品質チェック統合       | `tools/cli/lib/execution/quality-gate.ts`     |
| Error Handler    | エラー処理・リトライ   | `tools/cli/lib/execution/error-handler.ts`    |

## 品質判定基準

### PASS（合格）

- Definition of Doneの全項目を満たしている
- テストが全て通過している
- リスクが適切に文書化されている

### FAIL（不合格）

- 必須セクションが欠けている
- テストが失敗している
- 重大なリスクが未対処

### WAIVER（例外承認）

- 正当な理由がある
- 期限が設定されている
- フォロータスクが明確
- Quality Authorityの承認がある

## 成果物フォーマット

全ての納品物に以下を含めること：

1. 目的
2. 変更点
3. テスト結果
4. E2E結果
5. ロールバック手順
6. リスク / 未検証項目

## AI実行基盤

### テキスト生成（会議・提案書）

| 項目             | 設定                                   |
| ---------------- | -------------------------------------- |
| MVP              | Ollama（ローカル、認証不要）           |
| モデル           | codellama / llama3 / deepseek-coder    |
| インターフェース | REST API (`localhost:11434`)           |
| アダプタ         | `tools/adapters/ollama.ts`             |

### コーディングエージェント（コード生成・実装）

外部CLIツールをサブプロセスとして実行し、実際のコーディング作業を委譲する。

| エージェント | CLIコマンド | 特徴 |
|-------------|------------|------|
| Claude Code | `claude -p "prompt"` | 高品質コード生成、JSON出力対応 |
| OpenCode | `opencode run "prompt"` | マルチモデル対応、オープンソース |
| Kiro CLI | `kiro chat -p "prompt"` | AWS統合 |

- 統一インターフェース: `CodingAgentAdapter`
- 自動検出・フォールバック: `CodingAgentRegistry`
- ワークスペース管理: `WorkspaceManager`（git clone/branch/cleanup）
- GUI設定: Settings画面でエージェント選択・個別設定・接続テスト

## Company Workflow Engine

5フェーズの業務フローを管理するエンジン。

### エンドツーエンドフロー（GUI → CodingAgent）

```
[Command Center GUI]  ── CEO が自然言語で指示
    │
    ├─ POST /api/command (Next.js API Route)
    │      │
    │      ├─ チケットファイル作成（workflows/backlog/）
    │      │
    │      └─ POST http://localhost:3001/api/workflows
    │              │
    │              └─ OrchestratorServer → WorkflowEngine.startWorkflow()
    │                      │
    │                      ├─ 1. proposal:     MeetingCoordinator（Ollama）
    │                      ├─ 2. approval:     ApprovalGate（CEO承認待ち）
    │                      ├─ 3. development:  CodingAgentAdapter.execute()
    │                      ├─ 4. QA:           品質ゲート（lint/test）
    │                      └─ 5. delivery:     ApprovalGate（CEO最終承認）
```

### コンポーネント

| コンポーネント       | 役割                           | 場所                                             |
| -------------------- | ------------------------------ | ------------------------------------------------ |
| WorkflowEngine       | ワークフロー全体制御           | `tools/cli/lib/execution/workflow-engine.ts`     |
| MeetingCoordinator   | エージェント間会議の開催・記録 | `tools/cli/lib/execution/meeting-coordinator.ts` |
| ApprovalGate         | CEO承認ゲート管理              | `tools/cli/lib/execution/approval-gate.ts`       |
| OrchestratorServer   | GUI連携HTTPサーバー            | `tools/cli/lib/execution/orchestrator-server.ts` |
| CodingAgentRegistry  | コーディングエージェント管理   | `tools/coding-agents/index.ts`                   |

### AI可用性

- Ollama OR CodingAgent のいずれかが利用可能であればタスク送信許可
- 両方利用不可の場合は 503 エラー
- 提案フェーズは Ollama、開発フェーズは CodingAgent と役割分担

### GUI

- Command Center: `/command`（CEO指示入力、ワークフロー開始）
- Workflows一覧: `/workflows`（フィルタ・ソート対応）
- ワークフロー詳細: `/workflows/[id]`（6タブ: 概要/提案書/会議録/進捗/品質/承認履歴）
- Dashboard: 承認待ち通知カード、ワークフローサマリー
- Settings: `/settings`（コーディングエージェント設定）
- Navigation: 承認待ち数の通知バッジ
