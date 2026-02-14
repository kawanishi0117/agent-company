---
inclusion: always
---

# AgentCompany - プロダクト概要

## コンセプト

AIエージェントを「会社組織」として運用するフレームワーク。
エージェントに役割・責任・品質基準を与え、ガバナンス付きで自律的に作業させる。

## 4ライン構造

| ライン     | 役割             | 担当エージェント                              |
| ---------- | ---------------- | --------------------------------------------- |
| Delivery   | 実行・納品       | Worker Agent, Developer                       |
| Governance | 品質判定         | Quality Authority, Reviewer Agent             |
| Security   | セキュリティ監査 | Security Officer                              |
| Talent     | 採用・評価       | Hiring Manager                                |
| Finance    | コスト・予算管理 | CFO                                           |

## 固定エージェント

| エージェント      | 役割                                                       | 定義ファイル                             |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------- |
| COO/PM            | バックログ管理、アサイン、実行指示、結果収集、レポート生成 | `agents/registry/coo_pm.yaml`            |
| Quality Authority | PR/差分/ログを見て `PASS/FAIL/WAIVER` 判定                 | `agents/registry/quality_authority.yaml` |
| Security Officer  | 依存パッケージ監査、Docker設定監査、脆弱性チェック         | `agents/registry/security_officer.yaml`  |
| CFO               | トークンコスト分析、予算管理、効率性レポート               | `agents/registry/cfo.yaml`               |
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

### 5. GUI（Dashboard/Backlog/Tickets/Runs/Reports）での可視化

- Dashboard: リアルタイム実行状況、承認待ち通知
- Backlog: カンバンボード（Todo/Doing/Review/Done）
- Tickets: チケット一覧・作成・詳細管理
- Runs: 実行ログ、成果物リンク
- Reports: 日次/週次レポート
- Command Center: タスク投入・制御
- Workflows: ワークフロー一覧・詳細
- Projects: プロジェクト管理
- Settings: コーディングエージェント設定

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

| コンポーネント        | 役割                   | 場所                                               |
| --------------------- | ---------------------- | -------------------------------------------------- |
| Orchestrator          | 全体制御、タスク管理   | `tools/cli/lib/execution/orchestrator.ts`          |
| OrchestratorServer    | GUI連携HTTPサーバー    | `tools/cli/lib/execution/orchestrator-server.ts`   |
| State Manager         | 状態永続化             | `tools/cli/lib/execution/state-manager.ts`         |
| Agent Bus             | エージェント間通信     | `tools/cli/lib/execution/agent-bus.ts`             |
| Worker Pool           | ワーカー管理           | `tools/cli/lib/execution/worker-pool.ts`           |
| Worker Container      | 隔離実行環境           | `tools/cli/lib/execution/worker-container.ts`      |
| Git Manager           | ブランチ・コミット管理 | `tools/cli/lib/execution/git-manager.ts`           |
| Quality Gate          | 品質チェック統合       | `tools/cli/lib/execution/quality-gate.ts`          |
| Quality Gate Integration | 品質ゲート統合実行  | `tools/cli/lib/execution/quality-gate-integration.ts` |
| Error Handler         | エラー処理・リトライ   | `tools/cli/lib/execution/error-handler.ts`         |
| AI Health Checker     | AI可用性チェック       | `tools/cli/lib/execution/ai-health-checker.ts`     |
| Execution Reporter    | 実行レポート生成       | `tools/cli/lib/execution/execution-reporter.ts`    |
| Settings Manager      | 設定管理               | `tools/cli/lib/execution/settings-manager.ts`      |
| Workspace Manager     | ワークスペース管理     | `tools/cli/lib/execution/workspace-manager.ts`     |
| QA Result Parser      | QA結果パース（Vitest/ESLint） | `tools/cli/lib/execution/qa-result-parser.ts` |
| Performance Tracker   | エージェントパフォーマンス追跡 | `tools/cli/lib/execution/agent-performance-tracker.ts` |
| Skill Gap Detector    | スキルギャップ検出・採用提案 | `tools/cli/lib/execution/skill-gap-detector.ts` |
| Escalation Analyzer   | エスカレーション分析・パターン検出 | `tools/cli/lib/execution/escalation-analyzer.ts` |

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

## Company Evolution（組織進化機能）

エージェントの実行結果を実データとして蓄積・分析し、組織の成長サイクルを実現する。

### 機能一覧

| 機能 | 説明 | コンポーネント |
|------|------|---------------|
| QA結果実パース | Vitest/ESLint出力を構造化データに変換 | QA Result Parser |
| 採用本物化 | CodingAgentで実際にタスク実行して評価 | Trial Runner + CodingAgent |
| パフォーマンス追跡 | 成功率・品質スコア・得意/苦手を追跡 | Performance Tracker |
| スキルギャップ検出 | 組織の不足スキルを検出し採用提案を生成 | Skill Gap Detector |
| エスカレーション分析 | 繰り返しパターンを検出し根本原因を推定 | Escalation Analyzer |

### データフロー

```
ワークフロー実行 → QAパーサー → パフォーマンス記録 → スキルギャップ分析 → 採用提案
                                                    ↑
                              エスカレーション分析 ──┘
```

### AI可用性

- Ollama OR CodingAgent のいずれかが利用可能であればタスク送信許可
- 両方利用不可の場合は 503 エラー
- 提案フェーズは Ollama、開発フェーズは CodingAgent と役割分担

### 統一AIサービス選択

全ワークフローフェーズ（proposal / development / QA）で使用するAIサービスを統一的に設定可能。

- **フェーズ別設定**: 各フェーズで異なるAIサービスを指定可能
- **エージェント別オーバーライド**: 特定のエージェント（社員）に対して個別にサービスを指定可能
- **サービス検出**: 環境にインストールされたCLIツール（opencode/claude/kiro）を自動検出
- **GUI設定**: Settings画面でフェーズ別・エージェント別の設定をドロップダウンで選択
- **4段階優先順位**: agentOverrides > phaseServices > preferredAgent > レジストリデフォルト

### GUI画面一覧

| パス | 画面 | 機能 |
|------|------|------|
| `/dashboard` | Dashboard | リアルタイム実行状況、承認待ち通知、MVP通知、ムードアラート |
| `/command` | Command Center | CEO指示入力、ワークフロー開始 |
| `/backlog` | Backlog | カンバンボード |
| `/tickets` | Tickets | チケット一覧・作成・詳細 |
| `/workflows` | Workflows | ワークフロー一覧（フィルタ・ソート） |
| `/workflows/[id]` | ワークフロー詳細 | 6タブ: 概要/提案書/会議録/進捗/品質/承認履歴 |
| `/employees` | 社員名簿 | 組織図・リスト・関係性マップビュー、ムード・MVPバッジ |
| `/employees/[id]` | 社員詳細 | プロフィール・ムード推移・キャリア履歴・パフォーマンス |
| `/meetings` | 会議一覧 | 朝会・レトロスペクティブ・経営会議 |
| `/knowledge` | ナレッジベース | 検索・カテゴリフィルタ・エントリ詳細 |
| `/kpi` | KPI/OKR | 生産性・品質・コスト・成長指標 |
| `/market` | 市場調査 | 調査リクエスト・レポート一覧 |
| `/projects` | Projects | プロジェクト管理 |
| `/runs` | Runs | 実行ログ・成果物 |
| `/reports` | Reports | 日次/週次レポート |
| `/review` | Review | レビュー管理 |
| `/settings` | Settings | コーディングエージェント設定 |

## Real Company Experience（生きた組織機能）

エージェントに人間的な属性を付与し、組織としての学習・成長サイクルを実現する機能群。

### コンポーネント一覧

| コンポーネント | 役割 | ファイル |
|---------------|------|---------|
| EmployeeStatusTracker | 社員ステータスのリアルタイム追跡 | `employee-status-tracker.ts` |
| DailyStandupCoordinator | 朝会の自動開催 | `daily-standup-coordinator.ts` |
| ReportGenerator | 日報/週報の自動生成 | `report-generator.ts` |
| ChatLogCapture | エージェント間通信のキャプチャ | `chat-log-capture.ts` |
| RetrospectiveEngine | ワークフロー完了後の振り返り | `retrospective-engine.ts` |
| KnowledgeBaseManager | 組織ナレッジの蓄積・検索 | `knowledge-base-manager.ts` |
| SpecComplianceChecker | 仕様適合チェック | `spec-compliance-checker.ts` |
| TechDebtTracker | 技術的負債の追跡 | `tech-debt-tracker.ts` |
| DeliverablePreview | 成果物プレビュー | `deliverable-preview.ts` |
| ExecutiveMeetingCoordinator | 経営会議の開催 | `executive-meeting-coordinator.ts` |
| MarketResearchAgent | 市場調査 | `market-research-agent.ts` |
| MoodTracker | ムード（感情）追跡 | `mood-tracker.ts` |
| RelationshipTracker | 社員間関係性の追跡 | `relationship-tracker.ts` |
| CareerManager | キャリアパス管理 | `career-manager.ts` |
| MVPSelector | MVP選出エンジン | `mvp-selector.ts` |
