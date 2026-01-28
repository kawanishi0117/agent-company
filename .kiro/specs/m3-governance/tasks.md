# Implementation Plan: M3 Governance

## Overview

Quality Authorityの判定ロジック（PASS/FAIL/WAIVER）をCLIコマンドとして実装する。`judge`コマンドで成果物を評価し、`waiver`コマンドで例外承認を管理する。

## Tasks

- [x] 1. Waiverテンプレート作成
  - [x] 1.1 `workflows/waivers/TEMPLATE.md`を作成
    - `docs/company/waiver-policy.md`のテンプレートと整合性を保つ
    - 必須フィールド: 申請日, 申請者, 対象, 理由, 緊急性, 代替策, 期限, フォロータスク, 承認者, ステータス
    - _Requirements: 3.1, 3.2_

- [x] 2. Waiver検証ロジック実装
  - [x] 2.1 `tools/cli/lib/waiver-validator.ts`を作成
    - WaiverValidationResult型を定義
    - 期限フィールドの存在と形式（YYYY-MM-DD）チェック
    - 理由フィールドが空でないことをチェック
    - フォロータスクが1つ以上あることをチェック
    - 検証結果を構造化して返す
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 `tests/waiver-validator.test.ts`を作成
    - 有効なWaiverの検証テスト
    - 期限欠落時のエラーテスト
    - 理由欠落時のエラーテスト
    - フォロータスク欠落時のエラーテスト
    - _Requirements: 4.2_

- [x] 3. 判定ロジック実装
  - [x] 3.1 `tools/cli/lib/judgment.ts`を作成
    - JudgmentResult型、CheckResult型を定義
    - lint, test, e2e, formatの各チェック結果を評価
    - 全チェックPASSで`PASS`を返す
    - いずれかFAILで`FAIL`を返す（理由付き）
    - 有効Waiver適用時に`WAIVER`を返す
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 `tests/judgment.test.ts`を作成
    - 全チェックPASS時のPASS判定テスト
    - いずれかFAIL時のFAIL判定テスト
    - Waiver適用時のWAIVER判定テスト
    - _Requirements: 6.5_

- [x] 4. Waiverコマンド実装
  - [x] 4.1 `tools/cli/commands/waiver.ts`を作成
    - `create <title>`: テンプレートから新規Waiver生成（YYYY-MM-DD-<title>.md）
    - `validate <file>`: Waiverの必須項目チェック
    - `list`: 全Waiverを一覧表示（テーブル形式）
    - `list --overdue`: 期限切れWaiverのみ表示
    - 各コマンドが適切な終了コードを返す
    - _Requirements: 3.3, 3.4, 3.5, 4.1, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5. judgeコマンド実装
  - [x] 5.1 `tools/cli/commands/judge.ts`を作成
    - `judge <run-id>`: 指定runの判定を実行
    - `--waiver <waiver-id>`: Waiverを適用するオプション
    - 判定結果を`runtime/runs/<run-id>/judgment.json`に保存
    - 判定結果をコンソールにも出力
    - 存在しないrun-idでエラーを返す（exit 1）
    - _Requirements: 1.1, 1.5, 2.5, 2.6_

- [x] 6. CLIメインへの統合
  - [x] 6.1 `tools/cli/agentcompany.ts`にjudge/waiverコマンドを追加
    - `npx ts-node tools/cli/agentcompany.ts judge`が動作する
    - `npx ts-node tools/cli/agentcompany.ts waiver`が動作する
    - ヘルプメッセージに新コマンドが表示される
    - _Requirements: 1.1, 3.3, 4.1, 5.1_

- [x] 7. Checkpoint - ユニットテスト確認
  - 全ユニットテストがパスすることを確認
  - `npm run test`で確認

- [x] 8. E2Eテスト追加
  - [x] 8.1 `e2e/governance.spec.ts`を作成
    - waiver createコマンドのテスト
    - waiver validateコマンドのテスト
    - waiver listコマンドのテスト
    - judgeコマンドのテスト（PASS/FAIL/WAIVERケース）
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. ドキュメント作成
  - [x] 9.1 `docs/specs/m3-governance.md`を作成
    - judgeコマンドの使用方法
    - waiverコマンドの使用方法
    - PASS/FAIL/WAIVERの各例
    - 再現手順
    - _Requirements: 6.4_

  - [x] 9.2 `MVP.md`のM3セクションを更新
    - M3 Governance機能の概要を追記
    - _Requirements: 6.4_

- [x] 10. Final Checkpoint - 全テスト確認
  - `npm run test`で全ユニットテストがパス
  - `npm run e2e`で全E2Eテストがパス
  - `make ci`で全品質ゲートがパス

## Notes

- 全タスクが必須
- 各タスクは前のタスクに依存するため、順番に実行
- `tools/cli/lib/`と`tools/cli/commands/`ディレクトリは新規作成が必要
- 既存の`tools/cli/agentcompany.ts`のコマンド構造に合わせて実装
