# Implementation Plan: M5 Hiring System

## Overview

採用システム（Hiring System）の実装計画。Hiring Managerエージェント定義、JD生成、面接課題生成、試用実行、スコア化、Registry登録の各機能をCLIコマンドとして実装する。

## Tasks

- [x] 1. Hiring Managerエージェント定義の作成
  - [x] 1.1 `agents/registry/hiring_manager.yaml` を作成
    - 既存のエージェントテンプレート形式に準拠
    - responsibilities, capabilities, deliverables, quality_gates, budget, persona, escalation を定義
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]\* 1.2 エージェント定義のバリデーションテスト
    - 既存の `validate-agent` コマンドで検証
    - **Property 1: Agent definition validation**
    - **Validates: Requirements 1.4**

- [x] 2. Core Libraries の基盤作成
  - [x] 2.1 `tools/cli/lib/hiring/` ディレクトリ構造を作成
    - 共通型定義ファイル `types.ts` を作成
    - エクスポート用 `index.ts` を作成
    - _Requirements: 2.1, 3.1, 4.1, 5.1, 6.1_

- [x] 3. JD Generator の実装
  - [x] 3.1 `tools/cli/lib/hiring/jd-generator.ts` を実装
    - `generateJD()` 関数: 役割名からJDを生成
    - `formatJDAsMarkdown()` 関数: JDをMarkdown形式に変換
    - `validateJD()` 関数: JDの必須セクション検証
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  - [ ]\* 3.2 JD Generator のプロパティテスト
    - **Property 2: JD generation and structure**
    - **Property 3: JD file persistence**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [x] 4. Interview Task Generator の実装
  - [x] 4.1 `tools/cli/lib/hiring/interview-generator.ts` を実装
    - `generateInterviewTask()` 関数: JDから面接課題を生成
    - `formatInterviewTaskAsMarkdown()` 関数: 課題をMarkdown形式に変換
    - 予算制約のチェックロジック
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]\* 4.2 Interview Task Generator のプロパティテスト
    - **Property 4: Interview task generation and structure**
    - **Property 5: Interview task file persistence**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 5. Checkpoint - JD・面接課題生成の検証
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Trial Runner の実装
  - [x] 6.1 `tools/cli/lib/hiring/trial-runner.ts` を実装
    - `runTrial()` 関数: 候補エージェントで試用実行
    - 出力・ログ・成果物のキャプチャ
    - 実行時間・リソース使用量の記録
    - 予算超過時のタイムアウト処理
    - _Requirements: 4.1, 4.3, 4.4, 4.5_
  - [ ]\* 6.2 Trial Runner のプロパティテスト
    - **Property 6: Trial run execution and output capture**
    - **Property 7: Budget constraint enforcement**
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5**

- [x] 7. Scoring Engine の実装
  - [x] 7.1 `tools/cli/lib/hiring/scoring-engine.ts` を実装
    - `calculateScore()` 関数: 試用結果からスコアを計算
    - タスク完了度（0-40点）、品質ゲート準拠（0-30点）、効率性（0-30点）の算出
    - 合格判定ロジック（60点以上で合格）
    - `formatScoreAsJSON()` 関数: JSON形式で出力
    - `formatScoreAsReadable()` 関数: 人間可読形式で出力
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ]\* 7.2 Scoring Engine のプロパティテスト
    - **Property 8: Score calculation and structure**
    - **Property 9: Score file persistence**
    - **Property 10: Pass/Fail threshold**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

- [x] 8. Registry Manager の実装
  - [x] 8.1 `tools/cli/lib/hiring/registry-manager.ts` を実装
    - `registerAgent()` 関数: エージェントをRegistryに登録
    - `isDuplicateAgent()` 関数: 重複チェック
    - `listRegisteredAgents()` 関数: 登録済みエージェント一覧
    - バリデーションエラーの詳細報告
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [ ]\* 8.2 Registry Manager のプロパティテスト
    - **Property 11: Registry registration with validation**
    - **Property 12: Duplicate agent prevention**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6**

- [x] 9. Checkpoint - Core Libraries の検証
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Hiring Logger の実装
  - [x] 10.1 `tools/cli/lib/hiring/hiring-logger.ts` を実装
    - `logHiringActivity()` 関数: 採用活動をログに記録
    - `formatHiringLogAsMarkdown()` 関数: ログをMarkdown形式で出力
    - タイムスタンプ、アクション、詳細、担当者の記録
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]\* 10.2 Hiring Logger のプロパティテスト
    - **Property 13: Hiring log structure**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [x] 11. 通知機能の実装
  - [x] 11.1 登録完了通知の実装
    - COO/PMへの通知生成
    - 通知内容: 新規エージェントID、役割、登録日時
    - _Requirements: 8.5_
  - [ ]\* 11.2 通知機能のプロパティテスト
    - **Property 14: Registration notification**
    - **Validates: Requirements 8.5**

- [x] 12. CLI `hire` コマンドの実装
  - [x] 12.1 `tools/cli/commands/hire.ts` を作成
    - `hire jd <role>` サブコマンド
    - `hire interview <jd-path>` サブコマンド
    - `hire trial <candidate-path> <task-path>` サブコマンド
    - `hire score <run-id>` サブコマンド
    - `hire register <candidate-path>` サブコマンド
    - `hire full <role> <candidate-path>` サブコマンド
    - 各サブコマンドの `--help` オプション
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - [x] 12.2 `tools/cli/agentcompany.ts` に `hire` コマンドを統合
    - コマンドルーティングの追加
    - ヘルプメッセージの更新
    - _Requirements: 7.1_

- [x] 13. Checkpoint - CLI コマンドの検証
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. 統合テストの実装
  - [ ]\* 14.1 完全な採用フローのE2Eテスト
    - JD生成 → 面接課題生成 → 試用実行 → スコア化 → 登録
    - 各ステップの成果物検証
    - _Requirements: 全要件_

- [x] 15. ドキュメント更新
  - [x] 15.1 `docs/specs/m5-hiring-system.md` を作成
    - 採用システムの正式仕様書
    - CLIコマンドの使用方法
    - _Requirements: 全要件_
  - [x] 15.2 `docs/playbooks/hiring.md` を更新
    - 採用プロセスの運用手順
    - _Requirements: 全要件_
  - [x] 15.3 `MVP.md` を更新
    - M5完了のチェックマーク
    - _Requirements: 全要件_

- [x] 16. Final Checkpoint - 全テスト通過確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- プロパティベーステストには `fast-check` ライブラリを使用
- 既存のCLI構造（`tools/cli/`）に準拠して実装
