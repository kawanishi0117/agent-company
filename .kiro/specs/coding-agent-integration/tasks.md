# Implementation Plan: Coding Agent Integration

## Overview

外部コーディングエージェントCLI（opencode、Claude Code、Kiro CLI）をAgentCompanyのワーカーとして統合する。CLIサブプロセスラッパーパターンで実装し、既存のOllamaアダプタ（テキスト生成用）と共存させる。

## Tasks

- [x] 1. 型定義の追加
  - [x] 1.1 CodingAgentAdapter関連の型を `tools/cli/lib/execution/types.ts` に追加
    - CodingTaskOptions, CodingTaskResult, CodingAgentConfig 型
    - SystemConfig に codingAgent フィールド追加
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. CodingAgentAdapter基底インターフェースとエラークラス
  - [x] 2.1 `tools/coding-agents/base.ts` を作成
    - CodingAgentAdapter インターフェース定義
    - CodingAgentError, CodingAgentTimeoutError エラークラス
    - 共通ヘルパー（サブプロセス実行、タイムアウト管理）
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 2.2 プロパティテスト作成
    - **Property 1: Adapter Interface Compliance**
    - **Property 3: Subprocess Timeout Enforcement**

- [x] 3. OpenCodeAdapter実装
  - [x] 3.1 `tools/coding-agents/opencode.ts` を作成
    - `opencode run` コマンドのサブプロセス実行
    - `--format json`, `--model` フラグ対応
    - 結果パース、タイムアウト処理
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 3.2 ユニットテスト作成

- [x] 4. ClaudeCodeAdapter実装
  - [x] 4.1 `tools/coding-agents/claude-code.ts` を作成
    - `claude -p` コマンドのサブプロセス実行
    - `--output-format json`, `--allowedTools`, `--add-dir` フラグ対応
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 4.2 ユニットテスト作成

- [x] 5. KiroCliAdapter実装
  - [x] 5.1 `tools/coding-agents/kiro-cli.ts` を作成
    - `kiro chat -p` コマンドのサブプロセス実行
    - カスタムエージェント設定対応
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 5.2 ユニットテスト作成

- [x] 6. Checkpoint - 個別アダプタ完了確認
  - 全テスト通過確認済み（9ファイル、90テスト）

- [x] 7. CodingAgentRegistry実装
  - [x] 7.1 `tools/coding-agents/index.ts` を作成
    - アダプタ登録・取得・自動検出
    - 優先度ベースのフォールバック選択
    - 可用性キャッシュ
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 7.2 プロパティテスト作成
    - **Property 2: Availability Detection Accuracy**
    - **Property 6: Registry Fallback Selection**

- [x] 8. WorkspaceManager実装
  - [x] 8.1 `tools/cli/lib/execution/workspace-manager.ts` を作成
    - リポジトリclone、ブランチ作成、クリーンアップ
    - 新規プロジェクト対応（git init + オプションgh repo create）
    - GitManagerとの連携
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 8.2 プロパティテスト作成
    - **Property 4: Workspace Isolation**
    - **Property 5: Git Branch Naming Convention**

- [x] 9. Checkpoint - インフラ層完了確認
  - 全テスト通過確認済み

- [x] 10. WorkerAgent統合
  - [x] 10.1 WorkerAgentにCodingAgentAdapter連携を追加
    - コーディングタスク時はCodingAgentAdapterを使用
    - 非コーディングタスク（会議、提案書）は既存Ollamaを継続使用
    - タスクコンテキスト（チケット情報、受け入れ基準）をプロンプトに変換
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 11. WorkflowEngine開発フェーズ統合
  - [x] 11.1 開発フェーズでWorkspaceManager + CodingAgentAdapterを使用
    - リポジトリclone → ブランチ作成 → コーディングエージェント実行 → commit/push
    - 既存のシミュレーション実行を実際のエージェント実行に置き換え
    - _Requirements: 7.1_

- [x] 12. GUI設定画面の拡張
  - [x] 12.1 Settings画面にコーディングエージェント設定セクション追加
    - 利用可能エージェント表示、優先エージェント選択
    - エージェント別設定（モデル、タイムアウト）
    - 接続テストボタン
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 12.2 Settings APIの拡張
    - コーディングエージェント設定の取得・保存エンドポイント

- [x] 13. Checkpoint - 統合完了確認
  - 全テスト通過確認済み（11ファイル、133テスト）

- [x] 14. ドキュメント更新
  - [x] 14.1 `docs/specs/coding-agent-integration.md` 正式仕様書作成
  - [x] 14.2 `.kiro/steering/tech.md` にコーディングエージェント情報追加
  - [x] 14.3 `.kiro/steering/structure.md` に新規ディレクトリ追加
  - [x] 14.4 `.kiro/steering/product.md` にコーディングエージェント統合情報追加

- [x] 15. Final Checkpoint - 全テスト通過確認
  - 全テスト通過確認済み（11ファイル、133テスト）

## Notes

- CLIツールはサブプロセスとして実行（AI APIを直接叩かない）
- 既存のOllamaアダプタ（`tools/adapters/`）は会議・提案書生成に継続使用
- 新規の `tools/coding-agents/` はコーディング作業専用
- 各アダプタはCLIが未インストールでもエラーにならない（isAvailable()でfalse返却）
- テストではサブプロセス実行をモック化
