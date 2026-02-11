# Company Workflow Engine

## 概要

Company Workflow Engineは、業務フローを5フェーズ（提案→承認→開発→品質確認→納品）で管理するエンジン。エージェント間の会議プロセス、CEO承認ゲート、エスカレーション管理を統合する。

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                     GUI Layer (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Workflows    │  │  Dashboard   │  │  Navigation  │          │
│  │ 一覧/詳細    │  │ 承認通知     │  │ 通知バッジ   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │ HTTP (port 3001)
┌───────────────────────────┼─────────────────────────────────────┐
│              Orchestrator Server                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /api/workflows/*  (ワークフローAPI)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    Workflow Engine                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Workflow     │  │ Meeting      │  │ Approval     │          │
│  │ Engine       │  │ Coordinator  │  │ Gate         │          │
│  │              │  │              │  │              │          │
│  │ - 5フェーズ  │  │ - 会議開催   │  │ - 承認要求   │          │
│  │ - 状態管理   │  │ - 議事録生成 │  │ - 決定処理   │          │
│  │ - ロールバック│  │ - AgentBus   │  │ - 永続化     │          │
│  │ - エスカレーション│ └──────────────┘  └──────────────┘          │
│  └──────┬───────┘                                               │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ├── Orchestrator (タスク管理)
          ├── Manager Agent (タスク分解)
          ├── Worker Pool (ワーカー割り当て)
          ├── Review Workflow (レビュー)
          ├── Quality Gate Integration (品質チェック)
          └── PR Creator (PR作成)
```

## フェーズ遷移

```
proposal ──→ approval ──→ development ──→ quality_assurance ──→ delivery
    ↑            │              ↑                │                  │
    │            │              │                │                  │
    │      reject/revision      │          QA失敗                   │
    │            │              └────────────────┘            revision
    │            ↓                                                 │
    └──── terminated                                               │
                                                                   ↓
                                                              development
```

## コンポーネント詳細

### WorkflowEngine

**場所**: `tools/cli/lib/execution/workflow-engine.ts`

ファクトリ関数 `createWorkflowEngine(meetingCoordinator, approvalGate, basePath)` で生成。

| メソッド | 説明 |
|----------|------|
| `startWorkflow()` | ワークフロー開始、proposalフェーズへ遷移 |
| `listWorkflows()` | 全ワークフロー一覧（statusフィルタ対応） |
| `getProgress()` | 開発進捗取得（SubtaskProgress一覧） |
| `getQualityResults()` | 品質結果取得 |
| `rollbackToPhase()` | フェーズロールバック |
| `terminateWorkflow()` | ワークフロー終了 |
| `handleEscalation()` | エスカレーション処理（retry/skip/abort） |
| `restoreWorkflows()` | 状態復元 |

### MeetingCoordinator

**場所**: `tools/cli/lib/execution/meeting-coordinator.ts`

ファクトリ関数 `createMeetingCoordinator(agentBus, basePath)` で生成。

- ラウンド制の議論ループ
- 会議録（MeetingMinutes）の永続化
- `runtime/runs/<run-id>/meeting-minutes/<meeting-id>.json`

### ApprovalGate

**場所**: `tools/cli/lib/execution/approval-gate.ts`

ファクトリ関数 `createApprovalGate(basePath)` で生成。

- Promise ベースの承認待ち機構
- 承認決定の永続化: `runtime/runs/<run-id>/approvals.json`
- `cancelApproval()` でロールバック時の承認キャンセル

## 永続化データ

```
runtime/runs/<run-id>/
├── workflow.json                    # ワークフロー状態
├── approvals.json                   # 承認履歴
└── meeting-minutes/                 # 会議録
    └── <meeting-id>.json
```

## Orchestrator統合

OrchestratorのコンストラクタでWorkflowEngine、MeetingCoordinator、ApprovalGateをオプショナルに初期化。getterメソッド（`getWorkflowEngine()`, `getMeetingCoordinator()`, `getApprovalGate()`）で外部からアクセス可能。

## エンドツーエンド ワークフロー接続

### 概要

GUI Command Center → OrchestratorServer → WorkflowEngine → CodingAgent の完全フローを実現する接続レイヤー。CEO がブラウザから自然言語で指示を出し、エージェントが自律的にコーディング作業を実行する。

### フロー図

```
┌─────────────────────────────────────────────────────────────────┐
│                     GUI Layer (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Command      │  │  Workflows   │  │  Dashboard   │          │
│  │ Center       │  │  一覧/詳細   │  │  ステータス  │          │
│  │ (CEO指示)    │  │  (承認操作)  │  │  (監視)      │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                       │
│  POST /api/command (Next.js API Route)                          │
│         │                                                       │
│         ├─ チケットファイル作成 (workflows/backlog/)              │
│         │                                                       │
│         └─ POST /api/workflows → OrchestratorServer              │
└─────────┼───────────────────────────────────────────────────────┘
          │ HTTP (port 3001)
┌─────────┼───────────────────────────────────────────────────────┐
│         │        Orchestrator Server                             │
│  ┌──────┴──────────────────────────────────────────────────┐    │
│  │  handleStartWorkflow()                                   │    │
│  │    ├─ AI可用性チェック (Ollama OR CodingAgent)            │    │
│  │    └─ WorkflowEngine.startWorkflow(instruction, projId)  │    │
│  └──────┬──────────────────────────────────────────────────┘    │
│         │                                                       │
│  ┌──────┴──────────────────────────────────────────────────┐    │
│  │  CodingAgentRegistry (globalCodingAgentRegistry)         │    │
│  │    ├─ ClaudeCodeAdapter                                  │    │
│  │    ├─ OpenCodeAdapter                                    │    │
│  │    └─ KiroCliAdapter                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────┬───────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────────┐
│         │        Workflow Engine (5フェーズ)                      │
│  ┌──────┴──────────────────────────────────────────────────┐    │
│  │  1. proposal     → MeetingCoordinator (Ollama)          │    │
│  │  2. approval     → ApprovalGate (CEO承認待ち)            │    │
│  │  3. development  → CodingAgentAdapter.execute()          │    │
│  │  4. QA           → Quality Gate (lint/test)              │    │
│  │  5. delivery     → ApprovalGate (CEO最終承認)            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### AI可用性チェック

OrchestratorServer はタスク送信時に AI の可用性を OR 条件で判定する。

| Ollama | CodingAgent | 結果 |
|--------|-------------|------|
| ✅ | ✅ | 送信許可 |
| ✅ | ❌ | 送信許可 |
| ❌ | ✅ | 送信許可（警告付き） |
| ❌ | ❌ | 503 エラー |

## ワークフロー本番対応

### 概要

ワークフローの各フェーズをシミュレーションから本番実装に移行し、
CodingAgent CLI（claude, opencode, kiro）を活用した実際のコード生成・レビュー・品質チェックを実現する。
CodingAgent が未インストールの場合はシミュレーションにフォールバックし、GUI に警告を表示する。

### QA フェーズ（品質確認）

`executeQualityAssurancePhase()` は CodingAgent の可用性に応じて動作を切り替える。

| CodingAgent | 動作 |
|-------------|------|
| 利用可能 | `make lint` / `make test` を CodingAgent 経由で実行し、実際の結果を取得 |
| 利用不可 | シミュレーション結果（lint: PASS, test: PASS）で自動通過 |

```
CodingAgent利用時:
  1. resolveWorkingDirectory() でプロジェクトの作業ディレクトリを取得
  2. CodingAgent に lint 実行プロンプトを送信（timeout: 120s）
  3. CodingAgent に test 実行プロンプトを送信（timeout: 300s）
  4. 結果を QualityResults に保存
  5. lint/test 両方 PASS → delivery フェーズへ遷移
  6. いずれか FAIL → development フェーズへ差し戻し
```

### レビューフェーズ（コードレビュー）

`executeCodeReview()` は開発フェーズ内の各サブタスク完了後に呼び出される。

| CodingAgent | 動作 |
|-------------|------|
| 利用可能 | レビュープロンプトを送信し、出力から APPROVED/NEEDS_REVISION を判定 |
| 利用不可 | 即承認（フォールバック） |

```
レビュープロンプト:
  - 直近の git commit の変更内容をレビュー
  - 品質・可読性・エラーハンドリング・セキュリティ・テストを確認
  - 問題なし → "APPROVED" を出力
  - 修正必要 → "NEEDS_REVISION" を出力

判定ロジック:
  - 出力に "NEEDS_REVISION" を含む → needs_revision → エスカレーション生成
  - それ以外 → approved → タスク完了
  - 実行エラー時 → approved（ブロッキング回避）
```

### エスカレーション→再開フロー

`handleEscalation()` の retry/skip 決定後、`executePhase()` を再呼び出しして開発フェーズを再開する。

```
retry:
  1. 失敗タスクのステータスを 'pending' に戻す
  2. エスカレーションをクリア、ステータスを 'running' に変更
  3. executePhase() を呼び出し

skip:
  1. 失敗タスクのステータスを 'skipped' に変更
  2. エスカレーションをクリア、ステータスを 'running' に変更
  3. executePhase() を呼び出し

executeDevelopmentPhase() の再実行時:
  - 既存の state.progress を再利用（初期化しない）
  - completed/skipped ステータスのタスクはスキップ
  - pending/failed のタスクのみ実行
```

### GUI SystemHealthBanner

Dashboard と Command Center に `SystemHealthBanner` コンポーネントを配置。
以下の3項目の可用性を個別に表示する。

| 項目 | 正常時 | 異常時 |
|------|--------|--------|
| Orchestrator Server | 「接続中」 | 「未接続 — `agentcompany server` で起動してください」 |
| コーディングエージェント | 「利用可能: claude, ...」 | 「未検出 — claude, opencode, kiro のいずれかをインストールしてください」 |
| Ollama | 「起動中」 | 「未起動 — 提案フェーズではテンプレートベースで動作します」 |

- CodingAgent 未検出 or Orchestrator 未接続 → 赤枠（error）
- Ollama のみ未起動 → 黄枠（warning）
- 全て正常 → バナー非表示
- 閉じるボタンで一時的に非表示可能
- Settings ページへの誘導リンク付き

## 関連ドキュメント

- [実行エンジン](./execution-engine.md)
- [Orchestrator Server](./orchestrator-server.md)
- [AI実行統合](./ai-integration.md)
- [Company Workflow Engine仕様](../specs/company-workflow-engine.md)
- [エンドツーエンド ワークフロー接続 仕様](../specs/end-to-end-workflow-wiring.md)
- [Coding Agent Integration 仕様](../specs/coding-agent-integration.md)
- [ワークフロー本番対応 仕様](../specs/workflow-production-ready.md)
