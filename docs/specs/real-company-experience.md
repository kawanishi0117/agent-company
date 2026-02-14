# Real Company Experience 仕様書

## 概要

AgentCompanyを「生きた組織」に進化させる機能群。エージェントに感情・関係性・キャリアパスを持たせ、
組織としての学習・成長サイクルを実現する。

## 機能一覧

### Phase 1: Employee Visibility（社員の可視化）

| 機能 | 説明 | コンポーネント |
|------|------|---------------|
| 社員ステータス追跡 | リアルタイムで社員の状態を追跡 | EmployeeStatusTracker |
| 社員名簿GUI | 組織図・リストビューで社員を表示 | `/employees` |
| 社員詳細GUI | プロフィール・パフォーマンス・タイムライン | `/employees/[id]` |

### Phase 2: Daily Operations（日常業務サイクル）

| 機能 | 説明 | コンポーネント |
|------|------|---------------|
| 朝会自動開催 | 毎日の朝会を自動実施 | DailyStandupCoordinator |
| 日報/週報生成 | 活動データから自動レポート生成 | ReportGenerator |
| チャットログ | エージェント間通信の記録・検索 | ChatLogCapture |
| アクティビティストリーム | リアルタイム活動表示 | Dashboard |

### Phase 3: Knowledge & Learning（知識経営と学習）

| 機能 | 説明 | コンポーネント |
|------|------|---------------|
| レトロスペクティブ | ワークフロー完了後の振り返り会議 | RetrospectiveEngine |
| ナレッジベース | 組織の知識を蓄積・検索 | KnowledgeBaseManager |
| 社内ルール自動生成 | レトロから改善ルールを提案 | InternalRule承認フロー |

### Phase 4: Quality & Compliance（品質とガバナンス）

| 機能 | 説明 | コンポーネント |
|------|------|---------------|
| 仕様適合チェック | 提案書と成果物の突合 | SpecComplianceChecker |
| 技術的負債追跡 | メトリクスの推移を記録・アラート | TechDebtTracker |
| 成果物プレビュー | ビルド試行・出力キャプチャ | DeliverablePreview |

### Phase 5: Strategy & Market（経営戦略と市場）

| 機能 | 説明 | コンポーネント |
|------|------|---------------|
| 経営会議 | KPI・採用・技術負債を議題に自動開催 | ExecutiveMeetingCoordinator |
| 市場調査 | トピックベースの調査レポート生成 | MarketResearchAgent |
| KPI/OKR | 生産性・品質・コスト指標の可視化 | `/kpi` |

### Phase 6: Company Culture（企業文化）

| 機能 | 説明 | コンポーネント |
|------|------|---------------|
| ムード追跡 | 成功率・負荷からムードスコアを算出 | MoodTracker |
| 関係性追跡 | 社員間インタラクションを記録・可視化 | RelationshipTracker |
| キャリア管理 | 昇進/降格の自動検出・履歴管理 | CareerManager |
| MVP選出 | 月間MVPの候補選出・表彰 | MVPSelector |

## アーキテクチャ

### WorkflowEngine 統合フック

各コンポーネントはWorkflowEngineのオプショナル依存として統合され、ワークフロー実行中に自動的にトリガーされる。

| フェーズ | トリガー | コンポーネント | 処理内容 |
|----------|----------|---------------|----------|
| Proposal | 会議前 | KnowledgeBaseManager | 関連する過去のナレッジを会議コンテキストに注入 |
| Development | タスク成功時 | MoodTracker | ムードスコアを成功方向に更新 |
| Development | タスク失敗時 | MoodTracker | ムードスコアを失敗方向に更新 |
| QA | 完了時 | TechDebtTracker | lint/testメトリクスのスナップショットを記録 |
| Delivery | 承認前 | SpecComplianceChecker | 仕様適合率チェック（80%未満で警告） |
| Delivery | 承認後 | RetrospectiveEngine | 振り返り会議を自動開催 |

全フックは `try/catch` で囲まれ、失敗してもワークフロー本体に影響しない（非侵襲的統合）。

### MeetingCoordinator / ReviewWorkflow 統合

| コンポーネント | トリガー | 処理内容 |
|---------------|----------|----------|
| MeetingCoordinator | 会議終了後 | RelationshipTracker に参加者ペアの 'meeting' インタラクションを記録 |
| ReviewWorkflow | レビュー提出時 | RelationshipTracker にレビュアー・ワーカー間の 'review' インタラクションを記録 |

### KPI集計

`KpiAggregator` が `AgentPerformanceTracker` と `TechDebtTracker` からデータを集約し、4カテゴリのKPIを算出する。

| カテゴリ | 指標 |
|----------|------|
| 生産性 | タスク完了数、平均完了時間、スループット |
| 品質 | 平均品質スコア、テストカバレッジ、lint警告数 |
| コスト | 総トークン使用量、タスクあたりコスト |
| 成長 | 社員数、スキルカバレッジ、昇進率 |

OKRデータは `runtime/state/okr/current.json` に永続化される。

### データフロー

```
ワークフロー実行
  ├─ EmployeeStatusTracker（ステータス更新）
  ├─ MoodTracker（ムード更新）
  ├─ RelationshipTracker（インタラクション記録）
  ├─ ChatLogCapture（通信ログ）
  ├─ PerformanceTracker（パフォーマンス記録）
  │
  ├─ QAフェーズ完了時
  │   └─ TechDebtTracker（メトリクス記録）
  │
  ├─ Deliveryフェーズ
  │   └─ SpecComplianceChecker（仕様適合チェック）
  │
  └─ ワークフロー完了後
      ├─ RetrospectiveEngine（振り返り会議）
      │   └─ KnowledgeBaseManager（ナレッジ自動生成）
      ├─ ReportGenerator（日報/週報）
      └─ MVPSelector（月間MVP候補算出）
```

### 永続化先

| データ | パス |
|--------|------|
| 社員ステータス | `runtime/state/employee-status/<agentId>.json` |
| ムード | `runtime/state/employee-mood/<agentId>.json` |
| 関係性 | `runtime/state/relationships/interactions.json` |
| キャリア | `runtime/state/career/<agentId>.json` |
| MVP履歴 | `runtime/state/awards/mvp-history.json` |
| ナレッジベース | `runtime/state/knowledge-base/` |
| 朝会記録 | `runtime/state/standups/<date>.json` |
| レポート | `runtime/state/reports/daily/`, `weekly/` |
| チャットログ | `runtime/state/chat-logs/<date>.json` |
| 技術的負債 | `runtime/state/tech-debt/<date>.json` |
| 市場調査 | `runtime/state/market-research/` |
| OKR | `runtime/state/okr/current.json` |

## GUI画面

| パス | 画面 | 機能 |
|------|------|------|
| `/employees` | 社員名簿 | 組織図・リスト・関係性マップビュー |
| `/employees/[id]` | 社員詳細 | プロフィール・ムード・キャリア・パフォーマンス |
| `/meetings` | 会議一覧 | 朝会・レトロ・経営会議 |
| `/knowledge` | ナレッジベース | 検索・カテゴリフィルタ |
| `/kpi` | KPI/OKR | 生産性・品質・コスト指標 |
| `/market` | 市場調査 | 調査リクエスト・レポート一覧 |
| `/dashboard` | ダッシュボード | MVP通知・ムードアラート・アクティビティ |

## API エンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/employees` | 社員一覧 |
| GET | `/api/employees/[id]` | 社員詳細 |
| GET | `/api/employees/[id]/mood` | ムード履歴 |
| GET | `/api/employees/[id]/career` | キャリア履歴 |
| GET | `/api/relationships` | 関係性マップ |
| GET | `/api/mvp` | MVP履歴 |
| GET | `/api/mood-alerts` | ムードアラート |
| GET | `/api/meetings` | 会議一覧 |
| GET | `/api/knowledge` | ナレッジ検索 |
| GET | `/api/internal-rules` | 社内ルール一覧 |
| GET | `/api/kpi` | KPIデータ |
| GET | `/api/okr` | OKRデータ |
| GET | `/api/market-research` | 市場調査レポート |
| GET | `/api/meetings/executive` | 経営会議 |
| GET | `/api/tech-debt` | 技術的負債トレンド |
| GET | `/api/workflows/[id]/compliance` | 仕様適合レポート |
| GET | `/api/activity-stream` | アクティビティストリーム |
| GET | `/api/chat-logs` | チャットログ |
| GET | `/api/reports/daily` | 日報 |
| GET | `/api/reports/weekly` | 週報 |
