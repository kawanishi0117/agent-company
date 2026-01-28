# Implementation Plan: M2 - 品質ゲート

## Overview

品質ゲートシステムを構築する。lint（ESLint + Prettier）、test（Vitest + カバレッジ）、e2e（Playwright）の3段階を実装し、`make ci`で一括実行できるようにする。

## Tasks

- [x] 1. Lint強化
  - [x] 1.1 ESLint設定確認・調整
    - `.eslintrc.json` に `coverage` を ignorePatterns に追加
    - _Requirements: 1.5_
  - [x] 1.2 Prettier設定確認
    - `.prettierrc` の設定確認
    - _Requirements: 1.2_
  - [x] 1.3 package.json scripts更新
    - `lint` スクリプトにPrettier checkを追加
    - `lint:fix` スクリプトを整備
    - _Requirements: 1.1, 1.2_
  - [x] 1.4 Lint動作確認
    - `make lint` が正常に動作することを確認
    - エラー時にnon-zero exit codeを返すことを確認
    - _Requirements: 1.3, 1.4_

- [x] 2. Test強化
  - [x] 2.1 Vitest設定更新
    - `vitest.config.ts` にカバレッジ閾値を追加（警告のみ）
    - _Requirements: 6.1, 6.2_
  - [x] 2.2 カバレッジ出力確認
    - `coverage/` ディレクトリに出力されることを確認
    - _Requirements: 2.5_
  - [x] 2.3 Test動作確認
    - `make test` が正常に動作することを確認
    - カバレッジレポートが生成されることを確認
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Checkpoint - Lint/Test動作確認
  - `make lint` と `make test` が正常に動作することを確認
  - 両方成功した場合のみ次に進む

- [x] 4. E2E基盤構築
  - [x] 4.1 Playwright依存追加
    - `@playwright/test` を devDependencies に追加
    - `npx playwright install` でブラウザをインストール
    - _Requirements: 3.1_
  - [x] 4.2 Playwright設定作成
    - `playwright.config.ts` を作成
    - 成果物出力先を `runtime/e2e-artifacts/` に設定
    - _Requirements: 3.5, 4.3_
  - [x] 4.3 E2Eディレクトリ作成
    - `e2e/` ディレクトリを作成
    - `runtime/e2e-artifacts/.gitkeep` を作成
    - _Requirements: 4.3_

- [x] 5. E2Eテスト実装
  - [x] 5.1 CLIワークフローテスト作成
    - `e2e/cli-workflow.spec.ts` を作成
    - プロジェクト構造・設定の検証テスト
    - _Requirements: 3.2_
  - [x] 5.2 成果物保存設定
    - スクリーンショット: 失敗時のみ
    - 動画: 失敗時のみ（リトライ時）
    - _Requirements: 4.1, 4.2, 4.5_
  - [x] 5.3 package.json scripts更新
    - `e2e` スクリプトを実装
    - `e2e:ui` スクリプトを追加（デバッグ用）
    - _Requirements: 3.1_

- [x] 6. E2E動作確認
  - [x] 6.1 E2Eテスト実行
    - `make e2e` が正常に動作することを確認
    - _Requirements: 3.3, 3.4_
  - [x] 6.2 失敗時の成果物確認
    - 設定で失敗時にスクリーンショットが保存されることを確認
    - _Requirements: 4.1, 4.4_

- [x] 7. CI統合
  - [x] 7.1 Makefile更新
    - `ci` ターゲットに `e2e` を追加
    - _Requirements: 5.1_
  - [x] 7.2 package.json ci script更新
    - `ci` スクリプトに `e2e` を追加
    - _Requirements: 5.1_
  - [x] 7.3 CI動作確認
    - `make ci` が lint → test → e2e の順で実行されることを確認
    - 途中で失敗した場合に停止することを確認
    - _Requirements: 5.2, 5.3, 5.4_

- [x] 8. ドキュメント更新
  - [x] 8.1 docs/specs/m2-quality-gates.md 作成
    - 品質ゲートの正式仕様書を作成
  - [x] 8.2 README.md更新
    - E2Eテストの使い方を追記（既存で十分）
  - [x] 8.3 MVP.md更新
    - M2のチェックボックスを完了状態に更新

- [x] 9. Final Checkpoint
  - `make ci` が成功することを確認
  - E2E失敗時に成果物が保存されることを確認
  - ドキュメントが最新状態であることを確認

## Notes

- PlaywrightはCLIテストに使用（GUIはM4で実装）
- E2Eテストは最小限（1-2本）から開始
- カバレッジ閾値は警告のみ（CIを止めない）
- 全タスク必須
