# Real Company Experience アーキテクチャ

## 概要

AgentCompanyの「生きた組織」機能群のアーキテクチャ設計。
エージェントに人間的な属性（感情・関係性・キャリア）を付与し、組織の学習サイクルを実現する。

## コンポーネント構成

### コアエンジン層（`tools/cli/lib/execution/`）

```
employee-status-tracker.ts   # 社員ステータスのリアルタイム追跡
daily-standup-coordinator.ts # 朝会の自動開催
report-generator.ts          # 日報/週報の自動生成
chat-log-capture.ts          # エージェント間通信のキャプチャ
retrospective-engine.ts      # ワークフロー完了後の振り返り
knowledge-base-manager.ts    # 組織ナレッジの蓄積・検索
spec-compliance-checker.ts   # 仕様適合チェック
tech-debt-tracker.ts         # 技術的負債の追跡
deliverable-preview.ts       # 成果物プレビュー
executive-meeting-coordinator.ts # 経営会議の開催
market-research-agent.ts     # 市場調査
mood-tracker.ts              # ムード（感情）追跡
relationship-tracker.ts      # 社員間関係性の追跡
career-manager.ts            # キャリアパス管理
mvp-selector.ts              # MVP選出エンジン
kpi-aggregator.ts            # KPI集計・OKR管理
```

### GUI層（`gui/web/`）

- API Routes: `/api/employees`, `/api/mood-alerts`, `/api/mvp`, `/api/relationships` 等
- Pages: `/employees`, `/meetings`, `/knowledge`, `/kpi`, `/market`
- Components: `EmployeeCard`（ムード・MVPバッジ付き）、`RelationshipMap`（SVGグラフ）

## 設計原則

### 1. ファイルベース永続化

全データは `runtime/state/` 配下にJSONファイルとして保存。
データベース不要で、ファイルシステムのみで動作する。

### 2. 非侵襲的統合

既存のWorkflowEngine・MeetingCoordinator・AgentBusに対して、
フック（コールバック）方式で統合。既存機能を壊さない。

#### WorkflowEngine 統合フック

WorkflowEngineは以下のオプショナル依存を受け取り、各フェーズで自動トリガーする。
全フックは `try/catch` で囲まれ、失敗してもワークフロー本体に影響しない。

| フェーズ | トリガータイミング | コンポーネント | 処理内容 |
|----------|-------------------|---------------|----------|
| Proposal | 会議開催前 | KnowledgeBaseManager | 関連する過去のナレッジを会議コンテキストに注入 |
| Development | タスク成功時 | MoodTracker | ムードスコアを成功方向に更新 |
| Development | タスク失敗時 | MoodTracker | ムードスコアを失敗方向に更新 |
| QA | 完了時（pass/fail両方） | TechDebtTracker | lint/testメトリクスのスナップショットを記録 |
| Delivery | 承認判定前 | SpecComplianceChecker | 仕様適合率チェック（80%未満で警告付与） |
| Delivery | 承認後 | RetrospectiveEngine | 振り返り会議を自動開催 |

#### MeetingCoordinator / ReviewWorkflow 統合

| コンポーネント | トリガー | 処理内容 |
|---------------|----------|----------|
| MeetingCoordinator | 会議議事録保存後 | RelationshipTracker に参加者全ペアの 'meeting' インタラクションを記録 |
| ReviewWorkflow | レビュー提出時 | RelationshipTracker にレビュアー・ワーカー間の 'review' インタラクションを記録 |

#### InternalRule 承認フロー

RetrospectiveEngine が生成したルール提案は `/api/internal-rules` 経由でCEOが承認/却下。
承認されたルールは `docs/company/auto-generated-rules.md` に自動追記される。

#### KPI集計（KpiAggregator）

`AgentPerformanceTracker` と `TechDebtTracker` からデータを集約し、4カテゴリのKPIを算出。
OKRデータは `runtime/state/okr/current.json` に永続化。

| カテゴリ | 主要指標 |
|----------|----------|
| 生産性 | タスク完了数、平均完了時間、スループット |
| 品質 | 平均品質スコア、テストカバレッジ、lint警告数 |
| コスト | 総トークン使用量、タスクあたりコスト |
| 成長 | 社員数、スキルカバレッジ、昇進率 |

### 3. 段階的データ蓄積

各コンポーネントはデータがない状態でも正常動作する。
ワークフロー実行を重ねるごとにデータが蓄積され、分析精度が向上する。

## データモデル

### MoodScore（ムードスコア）

```
score = successRate × 0.4 + (1 - workload) × 0.3
      + (1 - escalationFrequency) × 0.2
      + (1 - consecutiveFailurePenalty) × 0.1
```

### MVPScore（MVP総合スコア）

```
score = taskCompletion × 0.35 + quality × 0.30
      + collaboration × 0.20 + knowledgeContribution × 0.15
```

### CareerLevel（キャリアレベル）

`junior` → `mid` → `senior` → `lead`

昇進条件: 成功率80%以上、品質70以上、タスク数30以上
降格条件: 成功率40%未満、品質40未満
