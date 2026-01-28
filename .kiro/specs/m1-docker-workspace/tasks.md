# Implementation Plan: M1 - Docker Workspace + 許可リスト

## Overview

Docker上の隔離されたWorkspace環境を構築する。allowlist方式で依存パッケージを管理し、インストール操作をログに記録する。シェルスクリプトとTypeScriptのハイブリッド実装で、実用性とテスタビリティを両立する。

## Tasks

- [x] 1. Allowlist基盤作成
  - [x] 1.1 Allowlistファイル作成
    - `tools/installers/allowlist/apt.txt` を作成（curl, git, jq, vim）
    - `tools/installers/allowlist/pip.txt` を作成（requests, pytest, black, flake8）
    - `tools/installers/allowlist/npm.txt` を作成（typescript, eslint, prettier, vitest）
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 1.2 Allowlistパーサー実装
    - `tools/installers/allowlist-parser.ts` を作成
    - ファイル読み込み、コメント除去、パッケージ名リスト化
    - _Requirements: 3.5_
  - [x] 1.3 Property Test: Allowlistフォーマット一貫性
    - **Property 4: Allowlist Format Consistency**
    - **Validates: Requirements 3.5**

- [x] 2. インストーラ実装
  - [x] 2.1 インストーラコアロジック（TypeScript）
    - `tools/installers/installer.ts` を作成
    - allowlist検証、ログ出力、結果返却
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  - [x] 2.2 インストーラシェルスクリプト
    - `tools/installers/install.sh` を作成
    - TypeScriptコアを呼び出すラッパー
    - apt/pip/npm実行
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 2.3 Property Test: Allowlist Enforcement
    - **Property 1: Allowlist Enforcement**
    - **Validates: Requirements 4.3**
  - [x] 2.4 Property Test: Allowlist Acceptance
    - **Property 2: Allowlist Acceptance**
    - **Validates: Requirements 4.2**

- [x] 3. ログ出力機能
  - [x] 3.1 ログライター実装
    - `tools/installers/log-writer.ts` を作成
    - JSON形式でログ出力、タイムスタンプ自動付与
    - _Requirements: 5.1, 5.2_
  - [x] 3.2 Property Test: Log Completeness
    - **Property 3: Log Completeness**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**

- [x] 4. Checkpoint - インストーラ動作確認
  - `make test` でプロパティテストが通ることを確認
  - allowlist内/外のパッケージでインストーラの動作を手動確認

- [x] 5. Docker環境構築
  - [x] 5.1 Base Image Dockerfile作成
    - `infra/docker/images/base/Dockerfile` を作成
    - Node.js 20 + Python3、非rootユーザー（agent）
    - インストーラとallowlistをコピー
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 5.2 Docker Compose設定作成
    - `infra/docker/compose.yaml` を作成
    - workspaceサービス、ボリュームマウント、ネットワーク設定
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 5.3 ログディレクトリ作成
    - `runtime/logs/install/.gitkeep` を作成
    - _Requirements: 5.1_

- [x] 6. 統合テスト
  - [x] 6.1 Docker Compose起動テスト
    - `docker compose -f infra/docker/compose.yaml build` が成功することを確認
    - _Requirements: 1.4, 6.1, 6.2_
  - [x] 6.2 インストーラ統合テスト
    - コンテナ内でallowlist内パッケージのインストール成功を確認
    - コンテナ内でallowlist外パッケージの拒否を確認
    - _Requirements: 4.2, 4.3, 6.3_

- [x] 7. ドキュメント更新
  - [x] 7.1 MVP.md更新
    - M1のチェックボックスを完了状態に更新
    - 完了条件の達成を記録
  - [x] 7.2 README.md更新（必要に応じて）
    - Docker Workspace の使い方を追記

- [x] 8. Final Checkpoint
  - `make test` が成功することを確認
  - Docker環境でallowlist運用が機能することを確認
  - ドキュメントが最新状態であることを確認

## Notes

- TypeScriptでコアロジックを実装し、シェルスクリプトはラッパーとして使用
- プロパティテストはTypeScriptコアに対して実行
- Docker統合テストは手動確認（CI環境ではスキップ可能）
- 全タスク必須（テスト含む）

