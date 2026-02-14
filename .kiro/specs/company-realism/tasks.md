# Implementation Plan: Company Realism（組織リアリズム強化）

## Overview

既存のReal Company Experienceの基盤を拡張し、5つの柱（部署構造、エージェント個性、ナレッジ強化、アジャイルサイクル、会社状況分析）で組織のリアリティを強化する。既存コンポーネントへの破壊的変更を避け、オプショナル拡張として実装する。

## Tasks

- [ ] 1. 型定義の追加
  - [ ] 1.1 `tools/cli/lib/execution/types.ts` に部署・思考スタイル・スプリント関連の型を追加
    - Department, DepartmentConfig, DepartmentCollaboration, DepartmentCollaborationScore 型
    - ThinkingStyleType, PersonalityTrait, ThinkingProfile 型
    - SprintStatus, Sprint, CreateSprintInput 型
    - OrgHealthScore, Bottleneck, BottleneckAnalysis, GrowthMetrics, GrowthTrend 型
    - DocumentIndexEntry, DocumentIndex 型
    - KnowledgeEntry への source_type フィールド追加（オプショナル、後方互換）
    - _Requirements: 1.1, 2.1, 2.4, 3.1, 3.2, 7.1, 7.2, 9.2, 10.1, 10.2, 11.1_

- [ ] 2. 部署構造管理（DepartmentManager）
  - [ ] 2.1 `tools/cli/lib/execution/department-manager.ts` を作成
    - getConfig(): 部署設定を取得（未存在時はデフォルト生成）
    - updateConfig(): 部署設定を更新して永続化
    - createDefaultConfig(): 開発部、品質管理部、経営企画部、人事部のデフォルト設定
    - getDepartmentForAgent(): エージェントIDから所属部署を検索
    - recordCollaboration(): 部署間コラボレーションを記録
    - getCollaborationScores(): 過去30日のコラボレーションスコアを計算（0-100）
    - checkIsolationAlerts(): 全他部署とのスコアが20未満の部署を検出
    - 永続化先: `runtime/state/departments/config.json`, `collaborations.json`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.4, 2.5_

  - [ ]* 2.2 DepartmentManager のプロパティテストを作成
    - `tests/execution/department-manager.property.test.ts`
    - **Property 1: DepartmentManager永続化ラウンドトリップ**
    - **Property 2: コラボレーションスコアの範囲と単調性**
    - **Property 3: 部署孤立アラートの正確性**
    - **Validates: Requirements 1.3, 2.2, 2.4, 2.5**

  - [ ]* 2.3 DepartmentManager のユニットテストを作成
    - `tests/execution/department-manager.test.ts`
    - デフォルト部署設定の正確性テスト（4部署、正しいエージェント割り当て）
    - エッジケース: 空のコラボレーション記録、単一部署
    - _Requirements: 1.1, 1.2, 2.1_

- [ ] 3. チェックポイント - 部署構造の基盤確認
  - テストが全て通過することを確認、問題があればユーザーに質問

- [ ] 4. 思考スタイル解決（ThinkingStyleResolver）
  - [ ] 4.1 エージェント定義YAMLにthinking_style/personality_traitsフィールドを追加
    - `agents/registry/*.yaml` の全エージェントに思考スタイルと性格特性を追加
    - 既存フィールドは変更しない（後方互換）
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 4.2 `tools/cli/lib/execution/thinking-style-resolver.ts` を作成
    - getProfile(): エージェントIDからYAMLを読み取りThinkingProfileを返す
    - getAllProfiles(): 全エージェントのプロファイルを取得
    - getDefaultProfile(): YAML未定義時のデフォルトプロファイルを返す
    - buildOpinionPrompt(): 思考スタイルに基づく意見生成プロンプトを構築
    - detectConflicts(): 参加者間の対立する思考スタイルペアを検出
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.1, 4.2_

  - [ ]* 4.3 ThinkingStyleResolver のプロパティテストを作成
    - `tests/execution/thinking-style-resolver.property.test.ts`
    - **Property 4: ThinkingProfile YAML解析ラウンドトリップ**
    - **Property 5: 思考スタイルに基づく意見プロンプトの一貫性**
    - **Property 6: 会議参加者間の対立検出**
    - **Validates: Requirements 3.1, 3.2, 4.1, 4.2**

  - [ ]* 4.4 ThinkingStyleResolver のユニットテストを作成
    - `tests/execution/thinking-style-resolver.test.ts`
    - デフォルト思考スタイル割り当ての正確性テスト
    - _Requirements: 3.3_

- [ ] 5. MeetingCoordinator への思考スタイル統合
  - [ ] 5.1 `tools/cli/lib/execution/meeting-coordinator.ts` の `generateParticipantOpinion` を拡張
    - ThinkingStyleResolverを使用して参加者の思考スタイルを取得
    - 思考スタイルに基づいた意見テキストを生成（既存のworkerType分岐に追加）
    - MeetingCoordinatorのコンストラクタにオプショナルなThinkingStyleResolver依存を追加
    - _Requirements: 4.1_

  - [ ] 5.2 会議議事録に「perspectives」セクションと Meeting_Dynamics サマリーを追加
    - 対立する思考スタイルがある場合、対立ポイントと解決方法をサマリーに含める
    - 各参加者のスタンスを思考スタイル別にラベル付け
    - _Requirements: 4.2, 4.3_

- [ ] 6. チェックポイント - 思考スタイル統合の確認
  - テストが全て通過することを確認、問題があればユーザーに質問

- [ ] 7. ドキュメント自動インデックス（DocumentIndexer）
  - [ ] 7.1 `tools/cli/lib/execution/document-indexer.ts` を作成
    - buildIndex(): docs/company/, docs/specs/, docs/architecture/, workflows/decisions/ をスキャン
    - 各Markdownファイルからメタデータ抽出（パス、タイトル、カテゴリ、更新日、サマリー）
    - incrementalUpdate(): ファイル更新日時を比較して変更分のみ再インデックス
    - search(): クエリとカテゴリでインデックスを検索
    - 永続化先: `runtime/state/knowledge-base/document-index.json`
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [ ]* 7.2 DocumentIndexer のプロパティテストを作成
    - `tests/execution/document-indexer.property.test.ts`
    - **Property 7: DocumentIndexerの抽出完全性**
    - **Property 8: DocumentIndexerの増分更新の正確性**
    - **Validates: Requirements 5.1, 5.2, 5.6**

  - [ ]* 7.3 DocumentIndexer のユニットテストを作成
    - `tests/execution/document-indexer.test.ts`
    - カテゴリマッピングの正確性テスト
    - エッジケース: 空ディレクトリ、見出しのないファイル
    - _Requirements: 5.1, 5.2_

- [ ] 8. ナレッジベース拡張
  - [ ] 8.1 KnowledgeBaseManager の search メソッドを拡張
    - DocumentIndexer の検索結果を統合して返す
    - source_type フィールドで通常エントリとドキュメントインデックスを区別
    - _Requirements: 5.4, 6.4_

  - [ ] 8.2 品質ゲート失敗時のナレッジ自動生成ロジックを追加
    - WorkflowEngine の QA フェーズ失敗時に failure_case エントリを自動生成
    - source_type = 'quality_gate_failure' を設定
    - _Requirements: 6.1_

  - [ ]* 8.3 ナレッジ拡張のプロパティテストを作成
    - `tests/execution/knowledge-base-extended.property.test.ts`
    - **Property 9: ナレッジ検索のドキュメントインデックス統合**
    - **Property 10: 品質ゲート失敗時のナレッジ自動生成**
    - **Validates: Requirements 5.4, 6.1, 6.4**

- [ ] 9. チェックポイント - ナレッジ基盤の確認
  - テストが全て通過することを確認、問題があればユーザーに質問

- [ ] 10. スプリント管理（SprintManager）
  - [ ] 10.1 `tools/cli/lib/execution/sprint-manager.ts` を作成
    - createSprint(): スプリント作成（planning状態で開始）
    - getActiveSprint(): アクティブスプリントを取得
    - getSprint()/listSprints(): スプリント取得・一覧
    - updateStatus(): ステータス遷移（planning→active→review→completed のみ許可）
    - completeTicket(): チケット完了を記録
    - calculateVelocity(): 完了チケット数からベロシティを計算
    - getVelocityTrend(): 過去スプリントのベロシティ推移を取得
    - closeSprint(): スプリントを閉じる（review→completed）
    - 永続化先: `runtime/state/sprints/<sprint-id>.json`
    - _Requirements: 7.1, 7.2, 7.4_

  - [ ]* 10.2 SprintManager のプロパティテストを作成
    - `tests/execution/sprint-manager.property.test.ts`
    - **Property 11: スプリントライフサイクルの状態遷移**
    - **Property 12: スプリント永続化ラウンドトリップ**
    - **Validates: Requirements 7.1, 7.2, 7.4**

  - [ ]* 10.3 SprintManager のユニットテストを作成
    - `tests/execution/sprint-manager.test.ts`
    - 不正な状態遷移の拒否テスト
    - ベロシティ計算のエッジケース（空スプリント、全チケット完了）
    - _Requirements: 7.1, 7.2_

- [ ] 11. スプリント会議統合
  - [ ] 11.1 SprintManager にプランニング・レビュー会議トリガーを実装
    - createSprint() 内で MeetingCoordinator を使用して Sprint_Planning 会議を自動開催
    - closeSprint() 内で Sprint_Review 会議を自動開催
    - レビュー結果を RetrospectiveEngine に渡してナレッジ生成
    - _Requirements: 8.1, 8.3, 8.5_

  - [ ]* 11.2 スプリント会議統合のプロパティテストを作成
    - `tests/execution/sprint-manager.property.test.ts` に追加
    - **Property 13: スプリント作成時のプランニング会議トリガー**
    - **Property 14: スプリント閉鎖時のレビュー会議トリガー**
    - **Validates: Requirements 8.1, 8.3, 8.5**

- [ ] 12. チェックポイント - スプリント管理の確認
  - テストが全て通過することを確認、問題があればユーザーに質問

- [ ] 13. 組織健全性分析（OrgHealthAnalyzer）
  - [ ] 13.1 `tools/cli/lib/execution/org-health-analyzer.ts` を作成
    - analyze(): mood*0.3 + collaboration*0.2 + taskSuccess*0.25 + knowledgeGrowth*0.25 で算出
    - attritionRisk: mood平均40未満→high、40-60→medium、60以上→low
    - trend: 前回スコアとの比較で improving/stable/declining を判定
    - getHistory(): 過去の健全性スコア履歴を取得
    - checkCriticalAlerts(): スコア50未満でクリティカルアラート生成
    - 永続化先: `runtime/state/org-health/<date>.json`
    - _Requirements: 9.2, 9.4, 9.5_

  - [ ]* 13.2 OrgHealthAnalyzer のプロパティテストを作成
    - `tests/execution/org-health-analyzer.property.test.ts`
    - **Property 15: 組織健全性スコアの範囲と重み付け**
    - **Property 16: 組織健全性クリティカルアラート**
    - **Validates: Requirements 9.2, 9.4**

  - [ ]* 13.3 OrgHealthAnalyzer のユニットテストを作成
    - `tests/execution/org-health-analyzer.test.ts`
    - attritionRisk判定のエッジケース
    - データソース取得失敗時のデフォルト値テスト
    - _Requirements: 9.2, 9.4, 9.5_

- [ ] 14. ボトルネック分析（BottleneckAnalyzer）
  - [ ] 14.1 `tools/cli/lib/execution/bottleneck-analyzer.ts` を作成
    - analyze(): ワークフロー状態からフェーズ別・エージェント別の滞留を分析
    - 各ボトルネックにseverity（high/medium/low）とsuggestedActionsを付与
    - getLatest(): 最新の分析結果を取得
    - persist(): 分析結果を永続化
    - 永続化先: `runtime/state/bottleneck/latest.json`
    - _Requirements: 10.1, 10.2, 10.4_

  - [ ]* 14.2 BottleneckAnalyzer のプロパティテストを作成
    - `tests/execution/bottleneck-analyzer.property.test.ts`
    - **Property 17: ボトルネック分析の出力完全性**
    - **Validates: Requirements 10.1, 10.2**

  - [ ]* 14.3 BottleneckAnalyzer のユニットテストを作成
    - `tests/execution/bottleneck-analyzer.test.ts`
    - エッジケース: ワークフローデータなし、全フェーズ均等
    - _Requirements: 10.1, 10.2_

- [ ] 15. 成長トレンド分析（GrowthTrendAnalyzer）
  - [ ] 15.1 `tools/cli/lib/execution/growth-trend-analyzer.ts` を作成
    - analyze(): PerformanceTracker、KnowledgeBaseManager、SprintManagerからメトリクス集計
    - 成長率計算: (current - previous) / max(previous, 1) * 100
    - getHistory(): 過去のトレンドデータを取得
    - 永続化先: `runtime/state/growth-trends/latest.json`
    - _Requirements: 11.1, 11.3, 11.4_

  - [ ]* 15.2 GrowthTrendAnalyzer のプロパティテストを作成
    - `tests/execution/growth-trend-analyzer.property.test.ts`
    - **Property 18: 成長メトリクス計算と成長率**
    - **Validates: Requirements 11.1, 11.3**

  - [ ]* 15.3 GrowthTrendAnalyzer のユニットテストを作成
    - `tests/execution/growth-trend-analyzer.test.ts`
    - エッジケース: 前期データなし、ゼロ除算防止
    - _Requirements: 11.1, 11.3_

- [ ] 16. チェックポイント - 分析エンジンの確認
  - テストが全て通過することを確認、問題があればユーザーに質問

- [ ] 17. WorkflowEngine への統合フック
  - [ ] 17.1 WorkflowEngine に部署コラボレーション記録フックを追加
    - ワークフロー開始時に参加エージェントの部署を解決し、複数部署の場合にコラボレーション記録
    - try/catchで囲み、失敗しても既存ワークフローに影響しない
    - _Requirements: 2.1_

  - [ ] 17.2 WorkflowEngine にボトルネック分析フックを追加
    - ワークフロー完了時にBottleneckAnalyzerを実行
    - try/catchで囲み、失敗しても既存ワークフローに影響しない
    - _Requirements: 10.4_

  - [ ] 17.3 WorkflowEngine にスプリント進捗更新フックを追加
    - チケット完了時にアクティブスプリントのcompleteTicketを呼び出し
    - try/catchで囲み、失敗しても既存ワークフローに影響しない
    - _Requirements: 7.1_

- [ ] 18. API エンドポイント作成
  - [ ] 18.1 `gui/web/app/api/departments/route.ts` を作成
    - GET: 部署設定取得（DepartmentConfig + コラボレーションスコア）
    - PUT: 部署設定更新
    - _Requirements: 1.5_

  - [ ] 18.2 `gui/web/app/api/sprints/route.ts` と `gui/web/app/api/sprints/[id]/route.ts` を作成
    - GET: スプリント一覧（statusフィルタ対応）
    - POST: スプリント作成
    - PUT: スプリント更新（ステータス変更）
    - _Requirements: 7.6_

  - [ ] 18.3 `gui/web/app/api/org-health/route.ts` を作成
    - GET: 組織健全性スコア取得
    - _Requirements: 9.1_

  - [ ] 18.4 `gui/web/app/api/bottleneck/route.ts` を作成
    - GET: ボトルネック分析結果取得
    - _Requirements: 10.5_

  - [ ] 18.5 `gui/web/app/api/growth-trends/route.ts` を作成
    - GET: 成長トレンドデータ取得
    - _Requirements: 11.5_

- [ ] 19. チェックポイント - API エンドポイントの確認
  - テストが全て通過することを確認、問題があればユーザーに質問

- [ ] 20. GUI: スプリント管理画面
  - [ ] 20.1 `gui/web/app/sprints/page.tsx` を作成
    - アクティブスプリントの進捗表示（完了/計画チケット数、進捗バー）
    - スプリント作成フォーム（名前、目標、期間、チケット選択）
    - 過去スプリント一覧とベロシティトレンドチャート
    - プランニング・レビュー会議結果へのリンク
    - _Requirements: 7.3, 7.5, 8.6_

  - [ ] 20.2 `gui/web/components/sprints/` にコンポーネントを作成
    - SprintCard.tsx: スプリントカード（進捗バー、ステータス、ベロシティ）
    - SprintForm.tsx: スプリント作成フォーム
    - VelocityChart.tsx: ベロシティトレンドチャート
    - _Requirements: 7.3, 7.5_

- [ ] 21. GUI: 社員名簿の部署・思考スタイル拡張
  - [ ] 21.1 `/employees` ページに部署グループビューを追加
    - 部署ごとにエージェントをグループ化して表示
    - 部署長をハイライト表示
    - 既存のリスト/組織図ビューと切り替え可能
    - _Requirements: 1.4_

  - [ ] 21.2 `/employees/[id]` ページに思考スタイル・性格特性セクションを追加
    - ThinkingStyleType をカラーラベルで表示
    - PersonalityTraits を強度バーで表示
    - _Requirements: 3.4_

  - [ ] 21.3 `/employees` ページに部署間コラボレーションマトリクスを追加
    - 部署ペアのコラボレーションスコアをマトリクス表示
    - スコアに応じた色分け（高=緑、中=黄、低=赤）
    - _Requirements: 2.3_

- [ ] 22. GUI: KPIページの分析機能拡張
  - [ ] 22.1 `/kpi` ページに組織健全性セクションを追加
    - Organization_Health スコアの大きな数値表示とトレンドインジケータ
    - 構成要素（mood, collaboration, taskSuccess, knowledgeGrowth）の内訳バー
    - attritionRisk インジケータ
    - _Requirements: 9.1, 9.3_

  - [ ] 22.2 `/kpi` ページにボトルネック分析セクションを追加
    - ボトルネック一覧（location, severity, waitTime）
    - severity に応じた色分け表示
    - suggestedActions の表示
    - _Requirements: 10.3_

  - [ ] 22.3 `/kpi` ページに成長トレンドセクションを追加
    - 各メトリクスの推移チャート
    - 成長率の表示（前期比）
    - _Requirements: 11.2_

- [ ] 23. GUI: ナレッジページの拡張
  - [ ] 23.1 `/knowledge` ページに「社内ドキュメント」タブを追加
    - DocumentIndexer のインデックスからドキュメント一覧を表示
    - カテゴリフィルタ（policy, spec, architecture, decision）
    - ファイルパスリンク
    - _Requirements: 5.5_

  - [ ] 23.2 `/knowledge` ページに source_type フィルタを追加
    - retrospective, escalation, quality_gate_failure, document_index, sprint_review, manual
    - _Requirements: 6.5_

- [ ] 24. GUI: ナビゲーション・ダッシュボード拡張
  - [ ] 24.1 Navigation に `/sprints` リンクを追加
    - _Requirements: 7.5_

  - [ ] 24.2 Dashboard に組織健全性スコアと部署孤立アラートを追加
    - Organization_Health スコアの表示
    - 孤立部署アラートの表示
    - _Requirements: 2.5, 9.3, 9.4_

  - [ ] 24.3 会議詳細ページに思考スタイルカラーラベルを追加
    - 各参加者の発言に思考スタイルラベルを付与
    - _Requirements: 4.4_

- [ ] 25. チェックポイント - GUI全体の確認
  - テストが全て通過することを確認、問題があればユーザーに質問

- [ ] 26. ドキュメント更新
  - [ ] 26.1 `docs/specs/company-realism.md` に正式仕様書を作成
    - 5つの柱の概要、各機能の説明、API一覧
  - [ ] 26.2 `docs/architecture/` に Company Realism アーキテクチャドキュメントを追加
    - コンポーネント構成、データフロー、既存コンポーネントとの統合ポイント
  - [ ] 26.3 `.kiro/steering/structure.md` を更新
    - 新ディレクトリ（departments/, sprints/, org-health/, bottleneck/, growth-trends/）
    - 新コンポーネント一覧
  - [ ] 26.4 `.kiro/steering/product.md` を更新
    - 新機能（部署構造、思考スタイル、スプリント管理、組織分析）
    - 新GUI画面（/sprints）
  - [ ] 26.5 `.kiro/steering/tech.md` を更新
    - 新APIエンドポイント一覧

- [ ] 27. 最終チェックポイント
  - テストが全て通過することを確認、問題があればユーザーに質問

## Notes

- タスクに `*` が付いているものはオプショナル（テスト関連）でスキップ可能
- 各タスクは特定の要件を参照しており、トレーサビリティを確保
- チェックポイントで段階的に検証を行い、問題を早期発見
- プロパティテストは各Correctness Propertyに1対1で対応
- 既存コンポーネントへの変更は全てtry/catchで囲み、非侵襲的に統合
