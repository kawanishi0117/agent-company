# Implementation Plan: AI Execution Integration

## Overview

本実装計画は、既存のAI実行インフラを統合し、GUIからタスクを送信してAIが自律的に作業を完了するE2Eワークフローを実現する。既存コンポーネント（OllamaAdapter, WorkerAgent, ManagerAgent, Orchestrator）を活用し、新規コンポーネント（AIHealthChecker, ExecutionReporter, QualityGateIntegration）を追加する。

## Tasks

- [x] 1. AIHealthChecker実装
  - [x] 1.1 AIHealthCheckerクラスの作成
    - `tools/cli/lib/execution/ai-health-checker.ts` を作成
    - checkOllamaAvailability, getInstalledModels, getModelInstallCommands メソッド実装
    - _Requirements: 1.1, 1.2, 1.4_
  - [x] 1.2 エラーメッセージとセットアップ手順の定義
    - Ollama未起動時のメッセージ
    - モデル未インストール時の推奨コマンド
    - _Requirements: 1.2, 1.4_
  - [x] 1.3 AIHealthCheckerのプロパティテスト作成
    - **Property 1: AI Unavailability Error Handling**
    - **Validates: Requirements 1.2**

- [x] 2. OrchestratorServer拡張
  - [x] 2.1 ヘルスチェックエンドポイント追加
    - `GET /api/health/ai` エンドポイント実装
    - AIHealthCheckerとの連携
    - _Requirements: 1.3_
  - [x] 2.2 タスク送信時のAI可用性チェック
    - タスク送信前にAI可用性を確認
    - 利用不可時はエラーレスポンスを返却
    - _Requirements: 1.1, 1.2_
  - [x] 2.3 ヘルスチェックのユニットテスト作成
    - エンドポイントの動作検証
    - **Validates: Requirements 1.3**

- [x] 3. Checkpoint - AI可用性確認機能完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 実行ディレクトリ管理の強化
  - [x] 4.1 RunDirectoryManager実装
    - `tools/cli/lib/execution/run-directory-manager.ts` を作成
    - createRunDirectory, saveTaskMetadata, loadTaskMetadata メソッド実装
    - _Requirements: 2.4, 2.5_
  - [x] 4.2 タスクメタデータの永続化
    - task.json の保存・読み込み
    - _Requirements: 2.5_
  - [x] 4.3 RunDirectoryManagerのプロパティテスト作成
    - **Property 4: Run Directory and Metadata Persistence Round-Trip**
    - **Validates: Requirements 2.4, 2.5**

- [x] 5. QualityGateIntegration実装
  - [x] 5.1 QualityGateIntegrationクラスの作成
    - `tools/cli/lib/execution/quality-gate-integration.ts` を作成
    - runLint, runTests, runAllChecks メソッド実装
    - _Requirements: 4.1, 4.2_
  - [x] 5.2 品質ゲート結果の永続化
    - quality.json への保存
    - _Requirements: 4.3_
  - [x] 5.3 WorkerAgentへの品質ゲート統合
    - コード変更完了時の自動実行
    - 失敗時のフィードバック送信
    - _Requirements: 4.4, 4.5_
  - [x] 5.4 QualityGateIntegrationのプロパティテスト作成
    - **Property 10: Quality Gate Sequential Execution**
    - **Property 11: Quality Gate Feedback Loop**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [x] 6. Checkpoint - 品質ゲート統合完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. ExecutionReporter実装
  - [x] 7.1 ExecutionReporterクラスの作成
    - `tools/cli/lib/execution/execution-reporter.ts` を作成
    - generateReport, saveReport, collectArtifacts メソッド実装
    - _Requirements: 5.1, 5.2_
  - [x] 7.2 レポートテンプレートの作成
    - Markdownレポートフォーマット
    - タスク説明、変更点、テスト結果、会話サマリーを含む
    - _Requirements: 5.3_
  - [x] 7.3 成果物収集機能
    - 変更ファイルのartifactsディレクトリへのコピー
    - _Requirements: 5.4_
  - [x] 7.4 ExecutionReporterのプロパティテスト作成
    - **Property 12: Artifact Collection and Report Completeness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 8. エラーハンドリング強化
  - [x] 8.1 エラーログ機能の強化
    - errors.log への詳細ログ出力
    - _Requirements: 6.1_
  - [x] 8.2 失敗レポート生成
    - 永続的失敗時のレポート生成
    - _Requirements: 6.5_
  - [x] 8.3 Graceful Degradation実装
    - AI利用不可時の一時停止と状態保存
    - _Requirements: 1.5, 6.3_
  - [x] 8.4 エラーハンドリングのプロパティテスト作成
    - **Property 2: Graceful Degradation on AI Unavailability**
    - **Property 13: Error Logging and Failure Reporting**
    - **Validates: Requirements 1.5, 6.1, 6.3, 6.5**

- [x] 9. Checkpoint - レポート・エラーハンドリング完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. 設定管理の強化
  - [x] 10.1 設定バリデーション実装
    - AIアダプタ、モデル、ホストURLの検証
    - _Requirements: 8.4_
  - [x] 10.2 設定ホットリロード実装
    - 再起動なしでの設定適用
    - _Requirements: 8.5_
  - [x] 10.3 設定管理のプロパティテスト作成
    - **Property 14: Settings Validation**
    - **Property 15: Settings Hot-Reload**
    - **Validates: Requirements 8.4, 8.5**

- [x] 11. GUI API拡張
  - [x] 11.1 Dashboard API拡張
    - AI可用性ステータスの追加
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 11.2 Runs API拡張
    - 成果物・レポートの取得エンドポイント
    - _Requirements: 5.5_
  - [x] 11.3 Settings API拡張
    - AIアダプタ・モデル設定エンドポイント
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 12. Checkpoint - API拡張完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. 統合とワイヤリング
  - [x] 13.1 Orchestratorへの統合
    - AIHealthChecker, ExecutionReporter, QualityGateIntegrationの統合
    - タスク送信フローの完成
  - [x] 13.2 WorkerAgentへの統合
    - 品質ゲートフィードバックループの統合
    - 成果物追跡の統合
  - [x] 13.3 OrchestratorServerへの統合
    - 全APIエンドポイントの統合
    - エラーハンドリングの統合

- [x] 14. E2Eテスト
  - [x] 14.1 AI実行ワークフローE2Eテスト
    - `e2e/ai-execution-workflow.spec.ts` を作成
    - タスク送信から成果物生成までのフロー検証
  - [x] 14.2 エラーハンドリングE2Eテスト
    - AI利用不可時の動作検証
    - 品質ゲート失敗時の動作検証

- [x] 15. ドキュメント更新
  - [x] 15.1 CLI README更新
    - AI実行関連コマンドの追加
  - [x] 15.2 アーキテクチャドキュメント更新
    - `docs/architecture/execution-engine.md` にAI統合セクション追加
  - [x] 15.3 正式仕様書作成
    - `docs/specs/ai-execution-integration.md` を作成

- [x] 16. Final Checkpoint - 全テスト通過確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required for comprehensive quality assurance
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 既存コンポーネントの拡張は後方互換性を維持すること
- Ollamaが利用不可の場合でも、システムは起動できること
