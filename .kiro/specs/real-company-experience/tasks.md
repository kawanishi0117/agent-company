# Implementation Plan: Real Company Experience

## Overview

AgentCompanyを「生きた組織」に進化させる6フェーズの実装計画。各フェーズは独立して価値を提供しつつ、後続フェーズのデータ基盤となる。

## Phase 1: Employee Visibility（社員の可視化）

- [x] 1. 型定義
  - [x] 1.1 `tools/cli/lib/execution/types.ts` に社員関連の型を追加
    - EmployeeStatus, EmployeeTimeline, EmployeeProfile, EmployeeOverview 型
    - CareerLevel, MoodScore 型（後続フェーズで使用）
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

- [x] 2. EmployeeStatusTracker 実装
  - [x] 2.1 `tools/cli/lib/execution/employee-status-tracker.ts` を作成
    - updateStatus(): 社員ステータスを更新し永続化
    - getStatus(): 特定社員の現在ステータスを取得
    - getAllStatuses(): 全社員のステータス一覧を取得
    - getTimeline(): 特定社員の1日のステータス変化タイムラインを取得
    - 永続化先: `runtime/state/employee-status/<agentId>.json`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 WorkflowEngine にステータス更新フックを統合
    - フェーズ開始時に関連エージェントのステータスを `working` に更新
    - 会議開始時に参加者のステータスを `in_meeting` に更新
    - レビュー時にレビュアーのステータスを `reviewing` に更新
    - タスク完了時にステータスを `idle` に戻す
    - _Requirements: 2.1, 2.2_

  - [x] 2.3 EmployeeStatusTracker のユニットテストを作成
    - `tests/execution/employee-status-tracker.test.ts`
    - ステータス更新、取得、タイムライン生成のテスト
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Employee API エンドポイント
  - [x] 3.1 `gui/web/app/api/employees/route.ts` を作成
    - GET: 全社員一覧（registry YAML + performance + status を統合）
    - agents/registry/*.yaml からプロフィール情報を読み取り
    - runtime/state/performance/ からパフォーマンスデータを統合
    - runtime/state/employee-status/ からリアルタイムステータスを統合
    - _Requirements: 1.1, 1.2, 2.5, 2.6_

  - [x] 3.2 `gui/web/app/api/employees/[id]/route.ts` を作成
    - GET: 社員詳細（プロフィール + パフォーマンス履歴 + タイムライン + 強み/弱み）
    - _Requirements: 1.4, 1.5, 2.4_

- [x] 4. GUI: 社員名簿画面
  - [x] 4.1 `gui/web/app/employees/page.tsx` を作成
    - 組織図ビュー（ツリー構造: CEO → 部門長 → Worker）
    - リストビュー（テーブル形式、ソート・フィルタ対応）
    - 各社員カード: アバター、名前、役割、ステータスインジケータ、品質スコア
    - 5秒間隔の自動リフレッシュ
    - _Requirements: 1.1, 1.2, 1.3, 2.2_

  - [x] 4.2 `gui/web/app/employees/[id]/page.tsx` を作成
    - プロフィールセクション（名前、役割、能力、ペルソナ説明）
    - パフォーマンスチャート（成功率、品質スコアの推移）
    - 活動タイムライン（今日のステータス変化）
    - 強み/弱み表示（カテゴリ別成功率）
    - _Requirements: 1.4, 1.5, 2.4_

  - [x] 4.3 `gui/web/components/employees/` にコンポーネントを作成
    - EmployeeCard.tsx: 社員カードコンポーネント
    - OrgChart.tsx: 組織図コンポーネント
    - PerformanceChart.tsx: パフォーマンスチャート
    - StatusIndicator.tsx: ステータスインジケータ
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 4.4 Dashboard に Employee Overview セクションを追加
    - 各ステータスの社員数カウント表示
    - _Requirements: 2.5_

  - [x] 4.5 Navigation に `/employees` リンクを追加
    - _Requirements: 1.1_

## Phase 2: Daily Operations（日常業務サイクル）

- [x] 5. DailyStandupCoordinator 実装
  - [x] 5.1 `tools/cli/lib/execution/daily-standup-coordinator.ts` を作成
    - conductStandup(): MeetingCoordinatorを使用して朝会を実施
    - 各社員のパフォーマンス履歴から「前日の成果」「本日の予定」「課題」を自動生成
    - 結果を `runtime/state/standups/<date>.json` に永続化
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.2 DailyStandupCoordinator のユニットテストを作成
    - `tests/execution/daily-standup-coordinator.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. ReportGenerator 実装
  - [x] 6.1 `tools/cli/lib/execution/report-generator.ts` を作成
    - generateDailyReport(): 日報を自動生成（各社員の活動集計）
    - generateWeeklyReport(): 週報を自動生成（週間サマリー、前週比較、トップパフォーマー）
    - 永続化先: `runtime/state/reports/daily/` と `runtime/state/reports/weekly/`
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 6.2 ReportGenerator のユニットテストを作成
    - `tests/execution/report-generator.test.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 7. ChatLogCapture 実装
  - [x] 7.1 `tools/cli/lib/execution/chat-log-capture.ts` を作成
    - capture(): Agent Busメッセージをキャプチャして永続化
    - query(): 日付、社員、タイプでフィルタしてログを取得
    - getActivityStream(): 直近N件のアクティビティを取得
    - 永続化先: `runtime/state/chat-logs/<date>.json`
    - _Requirements: 5.1, 5.5_

  - [x] 7.2 AgentBus にメッセージキャプチャフックを統合
    - メッセージ送信時に自動的にChatLogCaptureに記録
    - _Requirements: 5.1_

  - [x] 7.3 ChatLogCapture のユニットテストを作成
    - `tests/execution/chat-log-capture.test.ts`
    - _Requirements: 5.1, 5.5_

- [x] 8. Daily Operations API エンドポイント
  - [x] 8.1 `gui/web/app/api/meetings/route.ts` を作成
    - GET: 会議一覧（朝会、レトロ、経営会議）
    - POST: 朝会トリガー（/api/meetings/standup）
    - _Requirements: 3.5, 3.7_

  - [x] 8.2 `gui/web/app/api/reports/daily/route.ts` と `weekly/route.ts` を作成
    - GET: 日報/週報の取得（日付フィルタ対応）
    - _Requirements: 4.4, 4.6_

  - [x] 8.3 `gui/web/app/api/chat-logs/route.ts` を作成
    - GET: チャットログ取得（日付、社員フィルタ）
    - _Requirements: 5.6_

  - [x] 8.4 `gui/web/app/api/activity-stream/route.ts` を作成
    - GET: アクティビティストリーム取得
    - _Requirements: 5.6_

- [x] 9. GUI: 会議・レポート画面
  - [x] 9.1 `gui/web/app/meetings/page.tsx` を作成
    - 会議一覧（タイプフィルタ、日付フィルタ）
    - 朝会トリガーボタン
    - 各会議カード: タイプアイコン、日付、参加者数、サマリー
    - _Requirements: 3.5, 3.6_

  - [x] 9.2 既存 Reports ページを拡張
    - 日報/週報タブを追加
    - 日付範囲フィルタ、社員フィルタ
    - 前週比較表示
    - _Requirements: 4.4, 4.5_

  - [x] 9.3 Dashboard に Activity Stream セクションを追加
    - 直近20件のアクティビティをリアルタイム表示
    - _Requirements: 5.3, 5.4_

  - [x] 9.4 Employee 詳細ページにチャットログセクションを追加
    - _Requirements: 5.2_

  - [x] 9.5 Navigation に `/meetings` リンクを追加
    - _Requirements: 3.5_

## Phase 3: Knowledge & Learning（知識経営と学習）

- [x] 10. RetrospectiveEngine 実装
  - [x] 10.1 `tools/cli/lib/execution/retrospective-engine.ts` を作成
    - conductRetrospective(): ワークフロー完了後に振り返り会議を開催
    - MeetingCoordinatorを使用、参加者はワークフロー関与エージェント全員
    - 議題: 良かった点、改善点、次のアクション
    - AIを使って議論を生成し、InternalRule提案を自動生成
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 10.2 WorkflowEngine の delivery 承認後に RetrospectiveEngine を自動トリガー
    - _Requirements: 6.1_

  - [x] 10.3 InternalRule の承認フローを実装
    - CEO承認時に `docs/company/auto-generated-rules.md` に追記
    - 承認済みルールを今後のワークフロープロンプトに組み込み
    - _Requirements: 6.5, 6.6_

  - [x] 10.4 RetrospectiveEngine のユニットテストを作成
    - `tests/execution/retrospective-engine.test.ts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 11. KnowledgeBaseManager 実装
  - [x] 11.1 `tools/cli/lib/execution/knowledge-base-manager.ts` を作成
    - addEntry(): ナレッジエントリを追加
    - search(): キーワード検索（カテゴリ、タグフィルタ対応）
    - autoGenerateFromRetrospective(): レトロスペクティブ結果からエントリ自動生成
    - autoGenerateFromEscalation(): エスカレーション解決からエントリ自動生成
    - getRelevantForWorkflow(): ワークフロー指示に関連するエントリを検索
    - 永続化先: `runtime/state/knowledge-base/`
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

  - [x] 11.2 WorkflowEngine の proposal フェーズでナレッジベースを参照
    - 関連する過去の学びを会議コンテキストに含める
    - _Requirements: 7.7_

  - [x] 11.3 KnowledgeBaseManager のユニットテストを作成
    - `tests/execution/knowledge-base-manager.test.ts`
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

- [x] 12. Knowledge API & GUI
  - [x] 12.1 `gui/web/app/api/knowledge/route.ts` を作成
    - GET: ナレッジ検索（クエリ、カテゴリ、タグフィルタ）
    - POST: ナレッジエントリ追加
    - _Requirements: 7.8_

  - [x] 12.2 `gui/web/app/api/internal-rules/route.ts` を作成
    - GET: 社内ルール一覧
    - PUT: ルール承認/却下
    - _Requirements: 6.8_

  - [x] 12.3 `gui/web/app/knowledge/page.tsx` を作成
    - 検索バー、カテゴリフィルタ、タグフィルタ
    - エントリカード一覧
    - エントリ詳細表示
    - _Requirements: 7.3, 7.4_

  - [x] 12.4 `/meetings` ページにレトロスペクティブ結果とルール提案を表示
    - _Requirements: 6.7_

  - [x] 12.5 Navigation に `/knowledge` リンクを追加
    - _Requirements: 7.3_

## Phase 4: Quality & Compliance（品質とガバナンス）

- [x] 13. SpecComplianceChecker 実装
  - [x] 13.1 `tools/cli/lib/execution/spec-compliance-checker.ts` を作成
    - check(): 提案書の要件と成果物を突合
    - タスク一覧の実装状況チェック、ファイル存在確認、テストカバレッジ確認
    - ComplianceReport 生成（総要件数、実装済み、未実装、部分実装、適合率）
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 13.2 WorkflowEngine の delivery フェーズに SpecComplianceChecker を統合
    - 適合率80%未満の場合はCEOレビューフラグを設定
    - _Requirements: 8.4, 8.5_

  - [x] 13.3 SpecComplianceChecker のユニットテストを作成
    - `tests/execution/spec-compliance-checker.test.ts`
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 14. TechDebtTracker 実装
  - [x] 14.1 `tools/cli/lib/execution/tech-debt-tracker.ts` を作成
    - recordSnapshot(): QAフェーズ完了時にメトリクスを記録
    - getTrend(): 指定期間のトレンドを取得
    - checkAlerts(): 悪化傾向のアラートを生成
    - 永続化先: `runtime/state/tech-debt/<date>.json`
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 14.2 WorkflowEngine の QA フェーズ完了時に TechDebtTracker を統合
    - _Requirements: 9.1_

  - [x] 14.3 TechDebtTracker のユニットテストを作成
    - `tests/execution/tech-debt-tracker.test.ts`
    - _Requirements: 9.1, 9.2, 9.4_

- [x] 15. DeliverablePreview 実装
  - [x] 15.1 `tools/cli/lib/execution/deliverable-preview.ts` を作成
    - buildPreview(): 成果物のビルドを試行
    - captureOutput(): ビルド出力/スクリーンショットをキャプチャ
    - 結果を `runtime/runs/<run-id>/preview/` に保存
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 15.2 DeliverablePreview のユニットテストを作成
    - `tests/execution/deliverable-preview.test.ts`
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [x] 16. Quality API & GUI
  - [x] 16.1 `gui/web/app/api/workflows/[id]/compliance/route.ts` を作成
    - GET: 仕様適合レポート取得
    - _Requirements: 8.6_

  - [x] 16.2 `gui/web/app/api/tech-debt/route.ts` を作成
    - GET: 技術的負債トレンド取得
    - _Requirements: 9.5_

  - [x] 16.3 ワークフロー詳細ページの品質タブに仕様適合レポートを追加
    - _Requirements: 8.4_

  - [x] 16.4 ワークフロー詳細ページにプレビューボタンを追加
    - _Requirements: 17.2_

## Phase 5: Strategy & Market（経営戦略と市場）

- [x] 17. ExecutiveMeetingCoordinator 実装
  - [x] 17.1 `tools/cli/lib/execution/executive-meeting-coordinator.ts` を作成
    - conductMeeting(): 経営会議を開催（COO/PM, QA, CFO, Security Officer参加）
    - prepareAgenda(): KPI、採用提案、エスカレーション、技術的負債から議題を自動生成
    - MeetingCoordinatorを使用してAI生成の議論を実施
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 17.2 ExecutiveMeetingCoordinator のユニットテストを作成
    - `tests/execution/executive-meeting-coordinator.test.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 18. MarketResearchAgent 実装
  - [x] 18.1 `agents/registry/market_researcher.yaml` を作成
    - 市場調査エージェントの定義（役割、能力、品質基準）
    - _Requirements: 12.1_

  - [x] 18.2 `tools/cli/lib/execution/market-research-agent.ts` を作成
    - research(): トピックに基づいて市場調査を実施
    - CodingAgentまたはWeb検索ツールを使用して情報収集
    - 構造化レポート生成（概要、競合分析、トレンド、推奨アクション）
    - 永続化先: `runtime/state/market-research/`
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

  - [x] 18.3 MarketResearchAgent のユニットテストを作成
    - `tests/execution/market-research-agent.test.ts`
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 19. KPI/OKR 実装
  - [x] 19.1 KPIデータ集計ロジックを実装
    - PerformanceTracker、TechDebtTracker、ReportGeneratorからKPIを集計
    - OKRデータの永続化（`runtime/state/okr/current.json`）
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 20. Strategy API & GUI
  - [x] 20.1 `gui/web/app/api/meetings/executive/route.ts` を作成
    - POST: 経営会議トリガー
    - _Requirements: 10.6_

  - [x] 20.2 `gui/web/app/api/market-research/route.ts` を作成
    - GET: 調査レポート一覧
    - POST: 調査リクエスト送信
    - _Requirements: 12.7_

  - [x] 20.3 `gui/web/app/api/kpi/route.ts` と `gui/web/app/api/okr/route.ts` を作成
    - GET: KPIデータ取得
    - GET/PUT: OKRデータ取得/更新
    - _Requirements: 11.6_

  - [x] 20.4 `gui/web/app/kpi/page.tsx` を作成
    - 生産性、品質、コスト、成長のKPIチャート
    - OKRセクション（目標設定・進捗表示）
    - 技術的負債トレンドチャート
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 20.5 `gui/web/app/market/page.tsx` を作成
    - 調査リクエストフォーム
    - 過去の調査レポート一覧
    - レポート詳細表示
    - 推奨アクションからワークフロー指示への変換ボタン
    - _Requirements: 12.4, 12.6_

  - [x] 20.6 Navigation に `/kpi` と `/market` リンクを追加
    - _Requirements: 11.1, 12.4_

## Phase 6: Company Culture（企業文化）

- [x] 21. MoodTracker 実装
  - [x] 21.1 `tools/cli/lib/execution/mood-tracker.ts` を作成
    - calculateMood(): 成功率40% + 負荷30% + エスカレーション頻度20% + 連続失敗10% で算出
    - updateAfterTask(): タスク完了/失敗後にムードを更新
    - getHistory(): ムード推移履歴を取得
    - checkAlerts(): ムード40未満の社員をアラート
    - 永続化先: `runtime/state/employee-mood/<agentId>.json`
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6_

  - [x] 21.2 WorkflowEngine にMoodTracker更新フックを統合
    - _Requirements: 13.2_

  - [x] 21.3 MoodTracker のユニットテストを作成
    - `tests/execution/mood-tracker.test.ts`
    - _Requirements: 13.1, 13.2, 13.4_

- [x] 22. RelationshipTracker 実装
  - [x] 22.1 `tools/cli/lib/execution/relationship-tracker.ts` を作成
    - recordInteraction(): 社員間のインタラクションを記録
    - getMap(): 全社員の関係性マップを生成
    - getCollaborators(): 特定社員のトップコラボレーターを取得
    - 永続化先: `runtime/state/relationships/interactions.json`
    - _Requirements: 14.1, 14.3, 14.4_

  - [x] 22.2 MeetingCoordinator、ReviewWorkflow にインタラクション記録フックを統合
    - _Requirements: 14.1_

  - [x] 22.3 RelationshipTracker のユニットテストを作成
    - `tests/execution/relationship-tracker.test.ts`
    - _Requirements: 14.1, 14.3, 14.4_

- [x] 23. CareerManager 実装
  - [x] 23.1 `tools/cli/lib/execution/career-manager.ts` を作成
    - checkPromotionEligibility(): 昇進/降格の候補を自動検出
    - promote()/demote(): レベル変更を実行し、registry YAMLを更新
    - getHistory(): キャリア履歴を取得
    - getCurrentLevel(): 現在のレベルを取得
    - 永続化先: `runtime/state/career/<agentId>.json`
    - _Requirements: 15.1, 15.2, 15.3, 15.5_

  - [x] 23.2 CareerManager のユニットテストを作成
    - `tests/execution/career-manager.test.ts`
    - _Requirements: 15.1, 15.2, 15.3, 15.5_

- [x] 24. MVPSelector 実装
  - [x] 24.1 `tools/cli/lib/execution/mvp-selector.ts` を作成
    - calculateScores(): タスク完了数、品質、コラボレーション、ナレッジ貢献からスコア算出
    - selectCandidates(): 上位3名を候補として選出
    - award(): CEO選出のMVPを表彰
    - getHistory(): 過去のMVP履歴を取得
    - 永続化先: `runtime/state/awards/mvp-history.json`
    - _Requirements: 16.1, 16.2, 16.4_

  - [x] 24.2 MVPSelector のユニットテストを作成
    - `tests/execution/mvp-selector.test.ts`
    - _Requirements: 16.1, 16.2, 16.4_

- [x] 25. Culture GUI
  - [x] 25.1 Employee 詳細ページにムード推移チャートを追加
    - _Requirements: 13.3, 13.5_

  - [x] 25.2 Employee 名簿ページにムードインジケータを追加
    - _Requirements: 13.3_

  - [x] 25.3 Employee 名簿ページに関係性マップビューを追加
    - ノード（社員）とエッジ（関係性）のグラフ表示
    - エッジの太さでインタラクション頻度を表現
    - _Requirements: 14.2, 14.3_

  - [x] 25.4 Employee 詳細ページにキャリア履歴セクションを追加
    - レベル変化の年表表示
    - 昇進/降格の承認ボタン（CEO用）
    - _Requirements: 15.4, 15.5_

  - [x] 25.5 Employee 名簿ページにMVPバッジを追加
    - _Requirements: 16.4_

  - [x] 25.6 Dashboard にMVP候補通知セクションを追加
    - _Requirements: 16.2, 16.3_

  - [x] 25.7 Dashboard にムードアラートセクションを追加
    - _Requirements: 13.4_

## Phase 7: ドキュメント更新

- [x] 26. ドキュメント更新
  - [x] 26.1 `docs/specs/real-company-experience.md` に正式仕様書を作成
  - [x] 26.2 `docs/architecture/` に Real Company Experience アーキテクチャドキュメントを追加
  - [x] 26.3 `.kiro/steering/structure.md` を更新（新ディレクトリ、新コンポーネント）
  - [x] 26.4 `.kiro/steering/product.md` を更新（新機能、新画面）
  - [x] 26.5 `.kiro/steering/tech.md` を更新（新APIエンドポイント）
  - [x] 26.6 `gui/web/README.md` を更新（新画面一覧）

