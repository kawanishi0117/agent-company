# Implementation Plan: Agent Execution Engine

## Overview

エージェント実行エンジンの実装計画。社長（ユーザー）からの指示を受け取り、上司エージェント（Manager）が部下エージェント（Worker）に作業を割り振り、実際のコード生成・ファイル操作を行うシステムを構築する。

実装は3つのフェーズに分けて段階的に進める：
- **Phase 1**: コア実行エンジン（基盤コンポーネント）
- **Phase 2**: GUI拡張（ダッシュボード、指示入力、レビュー画面）
- **Phase 3**: 統合・最適化（E2Eフロー、ドキュメント）

## Tasks

### Phase 1: コア実行エンジン

- [x] 1. 基盤インターフェースとデータモデルの定義
  - [x] 1.1 コアインターフェース定義
    - `tools/cli/lib/execution/types.ts` を作成
    - Task, SubTask, ExecutionResult, AgentConfig, SystemConfig, Project, ConversationHistory の型定義
    - _Requirements: 20.1, 20.2, 20.4_
  - [x] 1.2 データモデルのプロパティテスト
    - **Property 23: Execution Result Structure**
    - **Validates: Requirements 20.1, 20.2, 20.4**
  - [x] 1.3 State Manager実装
    - `tools/cli/lib/execution/state-manager.ts` を作成
    - 状態の保存・読み込み・クリーンアップ機能
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [x] 1.4 State Managerのプロパティテスト
    - **Property 22: State Persistence Round-Trip**
    - **Validates: Requirements 14.1, 14.2, 14.3**

- [x] 2. Checkpoint - 基盤インターフェース完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Process Monitor実装
  - [x] 3.1 Process Monitor基本機能
    - `tools/cli/lib/execution/process-monitor.ts` を作成
    - コマンド実行、タイムアウト、プロセス終了機能
    - _Requirements: 6.1, 6.2, 6.6, 6.7_
  - [x] 3.2 インタラクティブ/サーバーコマンド検出
    - インタラクティブコマンド（vim, nano等）の検出と拒否
    - サーバーコマンド（npm run dev等）のバックグラウンド実行
    - _Requirements: 6.3, 6.4, 6.5_
  - [x] 3.3 Process Monitorのプロパティテスト
    - **Property 12: Command Timeout Enforcement**
    - **Property 13: Interactive Command Rejection**
    - **Property 14: Server Command Background Execution**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 4. Git Manager実装
  - [x] 4.1 Git認証方式設計
    - `tools/cli/lib/execution/git-credentials.ts` を作成
    - Deploy key, Repository-scoped token, SSH agent forwarding の3方式サポート
    - `~/.ssh/` 直接マウント禁止の実装
    - _Requirements: 3.1, 3.2_
  - [x] 4.2 Git Manager基本機能
    - `tools/cli/lib/execution/git-manager.ts` を作成
    - clone（コンテナローカルストレージへ）, createBranch, checkout, stage, commit, push機能
    - known_hosts検証
    - _Requirements: 3.3, 3.4, 3.9_
  - [x] 4.3 ブランチ命名とコミットメッセージ
    - ブランチ名: `agent/<ticket-id>-<description>`
    - コミットメッセージ: `[<ticket-id>] <description>`
    - _Requirements: 3.4, 3.6_
  - [x] 4.4 コンフリクト検出
    - コンフリクト検出とレポート機能
    - _Requirements: 4.1, 4.2_
  - [x] 4.5 Git操作ログ出力
    - `runtime/runs/<run-id>/git.log` への出力
    - _Requirements: 3.8_
  - [x] 4.6 Git Managerのプロパティテスト
    - **Property 6: Git Naming Conventions**
    - **Property 7: Git Operation Logging**
    - **Property 27: Git Credential Isolation** (新規)
    - **Validates: Requirements 3.2, 3.4, 3.6, 3.8**

- [x] 5. Checkpoint - 基盤ユーティリティ完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Agent Bus実装
  - [x] 6.1 Message Queue Abstraction設計
    - `tools/cli/lib/execution/message-queue.ts` を作成
    - File-based（デフォルト）, SQLite, Redis の3方式サポート
    - pull/pollモデル（ワーカーは受信ポート不要）
    - _Requirements: 10.6, 10.7_
  - [x] 6.2 Agent Bus基本機能
    - `tools/cli/lib/execution/agent-bus.ts` を作成
    - Message Queue Abstraction経由でメッセージ送受信
    - _Requirements: 10.1, 10.2_
  - [x] 6.3 メッセージタイプとルーティング
    - task_assign, task_complete, task_failed, escalate, status_request, status_response
    - _Requirements: 10.2, 10.3, 10.4, 10.5_
  - [x] 6.4 メッセージ履歴ログ
    - `runtime/runs/<run-id>/messages.log` への出力
    - _Requirements: 10.8_
  - [x] 6.5 Agent Busのプロパティテスト
    - **Property 18: Message Delivery Guarantee**
    - **Property 28: Message Queue Abstraction** (新規)
    - **Validates: Requirements 10.1, 10.3, 10.4, 10.5, 10.6**

- [x] 7. Task Decomposer実装
  - [x] 7.1 Task Decomposer基本機能
    - `tools/cli/lib/execution/decomposer.ts` を作成
    - AIを使用したタスク分解機能
    - _Requirements: 2.1_
  - [x] 7.2 独立タスク生成
    - 依存関係のない独立したサブタスクの生成
    - 依存関係分析と並列化可能性判定
    - _Requirements: 2.2, 2.3_
  - [x] 7.3 サブタスクファイル保存
    - `workflows/backlog/<parent-id>-<sub-id>.md` 形式で保存
    - parent_idフィールドの設定
    - _Requirements: 2.4, 2.5_
  - [x] 7.4 Task Decomposerのプロパティテスト
    - **Property 2: Task Decomposition Independence**
    - **Property 3: Sub-Task Parent Reference**
    - **Property 4: Sub-Task File Naming Convention**
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.5**

- [x] 8. Checkpoint - コア機能完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. コンテナランタイム方式選定と設計
  - [x] 9.1 Container Runtime Abstraction設計
    - `tools/cli/lib/execution/container-runtime.ts` を作成
    - DoD, Rootless, DIND を切り替え可能な抽象化レイヤー
    - _Requirements: 5.7, 5.8_
  - [x] 9.2 docker.sock アクセス制限実装
    - allowlist方式でDockerコマンドを制限（run, stop, rm, logs, inspect のみ）
    - DoD使用時のセキュリティガード
    - _Requirements: 5.9_
  - [x] 9.3 ランタイム設定スキーマ
    - `runtime/state/config.json` の `container_runtime` フィールド定義
    - デフォルト: DoD（ローカル開発向け）
    - _Requirements: 5.8_

- [x] 10. Worker Container管理
  - [x] 10.1 Worker Container基本機能
    - `tools/cli/lib/execution/worker-container.ts` を作成
    - Container Runtime Abstraction経由でコンテナ作成・破棄
    - _Requirements: 5.1, 5.5_
  - [x] 10.2 コンテナ設定
    - ベースイメージ、リソース制限設定
    - リポジトリはコンテナ内にclone（ホストbind mountではない）
    - _Requirements: 5.2, 5.3, 5.6_
  - [x] 10.3 コンテナ隔離実装
    - ネットワーク: Agent_Bus経由のみ通信可
    - ファイルシステム: ワーカー間で共有ボリュームなし
    - 読み取り専用共有: `runtime/runs/<run-id>/` のみ
    - _Requirements: 5.4_
  - [x] 10.4 Worker Containerのプロパティテスト
    - **Property 10: Worker Container Isolation**
    - **Property 11: Worker Container Cleanup**
    - **Validates: Requirements 5.4, 5.5**
  - [x] 10.5 隔離受け入れテスト
    - Worker A が Worker B の `/workspace` にアクセス不可
    - Worker A が Worker B にネットワークパケット送信不可
    - Worker A がホストファイルシステムにアクセス不可
    - DoD使用時、他ワーカーに影響するコンテナ生成不可
    - _Requirements: 5.4 (Isolation Acceptance Test Criteria)_

- [x] 11. Worker Dockerイメージ作成
  - [x] 11.1 Workerベースイメージ
    - `infra/docker/images/worker/Dockerfile` を作成
    - Node.js, Git, 基本ツールのインストール
    - _Requirements: 5.2_
  - [x] 11.2 Docker Compose更新
    - `infra/docker/compose.yaml` にworkerサービス追加
    - _Requirements: 5.7_

- [x] 12. Tool Call実装
  - [x] 12.1 ツールインターフェース定義
    - `tools/cli/lib/execution/tools.ts` を作成
    - read_file, write_file, edit_file, list_directory, run_command, git_commit, git_status
    - _Requirements: 8.1_
  - [x] 12.2 ファイル操作ツール
    - read_file, write_file, edit_file, list_directory実装
    - _Requirements: 8.2, 8.3, 8.4_
  - [x] 12.3 コマンド実行ツール
    - run_command実装（Process Monitor経由）
    - _Requirements: 8.5_
  - [x] 12.4 Git操作ツール
    - git_commit, git_status実装（Git Manager経由）
    - _Requirements: 8.6_
  - [x] 12.5 Tool Callのプロパティテスト
    - **Property 16: Tool Call Round-Trip**
    - **Property 17: File Edit Consistency**
    - **Validates: Requirements 8.2, 8.3, 8.4**

- [x] 13. Checkpoint - インフラ層完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. AI Adapter拡張
  - [x] 14.1 ツール呼び出し対応インターフェース
    - `tools/adapters/base.ts` を拡張
    - chatWithTools, ToolCallResponse追加
    - _Requirements: 7.1, 7.2_
  - [x] 14.2 Ollamaアダプタ拡張
    - `tools/adapters/ollama.ts` にツール呼び出し対応追加
    - _Requirements: 7.3_
  - [x] 14.3 アダプタ登録機構
    - `tools/adapters/index.ts` にアダプタ登録（1行追加で新アダプタ対応）
    - _Requirements: 7.7_
  - [x] 14.4 フォールバック機能
    - プライマリアダプタ失敗時の代替アダプタ使用
    - _Requirements: 7.5_
  - [x] 14.5 AI Adapterのプロパティテスト
    - **Property 15: AI Adapter Fallback**
    - **Validates: Requirements 7.5**

- [x] 15. Worker Agent実装
  - [x] 15.1 Worker Agent基本機能
    - `tools/cli/lib/execution/agents/worker.ts` を作成
    - タスク実行、ツール呼び出し、状態管理
    - _Requirements: 8.1_
  - [x] 15.2 会話ループ実装
    - AIとの複数回やり取り
    - 最大イテレーション制限（30回）
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 15.3 会話履歴保存
    - `runtime/runs/<run-id>/conversation.json` への保存
    - _Requirements: 11.6_
  - [x] 15.4 完了・部分完了処理
    - AI完了シグナル検出、成果物収集
    - 最大イテレーション到達時のpartialステータス
    - _Requirements: 11.4, 11.5_
  - [x] 15.5 Worker Agentのプロパティテスト
    - **Property 19: Conversation History Persistence Round-Trip**
    - **Property 20: Conversation Loop Termination**
    - **Property 21: Partial Completion Status**
    - **Validates: Requirements 11.1, 11.3, 11.5, 11.6**

- [x] 16. Checkpoint - Worker Agent完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Manager Agent実装
  - [x] 17.1 Manager Agent基本機能
    - `tools/cli/lib/execution/agents/manager.ts` を作成
    - タスク受信、分解、割り当て
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 17.2 進捗監視とサポート
    - Worker進捗の監視
    - 失敗時のサポート提供
    - _Requirements: 1.5, 13.3, 13.4_
  - [x] 17.3 ワーカー管理
    - 動的なワーカーの追加・削除
    - _Requirements: 1.6_

- [x] 18. Worker Pool実装
  - [x] 18.1 Worker Pool基本機能
    - `tools/cli/lib/execution/worker-pool.ts` を作成
    - ワーカー取得・解放、プール状態管理
    - _Requirements: 9.3_
  - [x] 18.2 並列実行制御
    - 最大同時実行ワーカー数の制御
    - タスク完了時の次タスク割り当て
    - _Requirements: 9.1, 9.4, 9.5_

- [x] 19. Reviewer/Merger Agent実装
  - [x] 19.1 Reviewer Agent
    - `tools/cli/lib/execution/agents/reviewer.ts` を作成
    - コンフリクト分析と解決提案
    - _Requirements: 4.3, 4.4_
  - [x] 19.2 Merger Agent
    - `tools/cli/lib/execution/agents/merger.ts` を作成
    - 統合ブランチへのマージ、PR作成
    - _Requirements: 4.5, 4.6, 4.7_
  - [x] 19.3 Merge制限のプロパティテスト
    - **Property 8: Merge Branch Restriction**
    - **Property 9: Pull Request Creation on Completion**
    - **Validates: Requirements 4.5, 4.6, 4.7**

- [x] 20. 品質ゲート統合
  - [x] 20.1 品質ゲート実行
    - タスク完了時のlint/test自動実行
    - _Requirements: 12.1, 12.2_
  - [x] 20.2 結果報告
    - 品質ゲート結果のExecutionResultへの含有
    - 失敗時のManager通知
    - _Requirements: 12.3, 12.4, 12.5_
  - [x] 20.3 品質ゲートのプロパティテスト
    - **Property 25: Quality Gate Execution Order**
    - **Validates: Requirements 12.1, 12.2**

- [x] 21. Orchestrator実装
  - [x] 21.1 Orchestrator基本機能
    - `tools/cli/lib/execution/orchestrator.ts` を作成
    - タスク管理、エージェント管理、設定管理
    - _Requirements: 23.2, 23.3_
  - [x] 21.2 エラーハンドリング
    - リトライ、フォールバック、エスカレーション
    - _Requirements: 13.1, 13.2, 13.5_
  - [x] 21.3 リトライのプロパティテスト
    - **Property 26: Retry with Exponential Backoff**
    - **Validates: Requirements 13.1**

- [x] 22. Checkpoint - Phase 1完了
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: GUI拡張

- [x] 23. CLIコマンド実装
  - [x] 23.1 executeコマンド
    - `tools/cli/commands/execute.ts` を作成
    - execute, execute --decompose, --adapter, --workers オプション
    - _Requirements: 21.1, 21.2, 21.6, 21.7_
  - [x] 23.2 statusコマンド
    - 実行状況の表示
    - _Requirements: 21.3_
  - [x] 23.3 stop/resumeコマンド
    - 実行の停止・再開
    - _Requirements: 21.4, 21.5_
  - [x] 23.4 projectコマンド
    - プロジェクト管理（list, add）
    - _Requirements: 22.5, 22.6_

- [x] 24. Project Manager実装
  - [x] 24.1 Project Manager基本機能
    - `tools/cli/lib/execution/project-manager.ts` を作成
    - プロジェクトの登録・一覧・取得
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [x] 25. GUI Settings画面
  - [x] 25.1 Settings API
    - `gui/web/app/api/settings/route.ts` を作成
    - 設定の取得・更新API
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
  - [x] 25.2 Settings画面UI
    - `gui/web/app/settings/page.tsx` を作成
    - 最大ワーカー数、メモリ制限、タイムアウト、AIアダプタ選択
    - コンテナランタイム選択（DoD/Rootless/DIND）
    - _Requirements: 15.5, 15.6_

- [x] 26. GUI Dashboard画面
  - [x] 26.1 Dashboard API
    - `gui/web/app/api/dashboard/route.ts` を作成
    - リアルタイムステータス取得API
    - _Requirements: 16.8_
  - [x] 26.2 Dashboard画面UI
    - `gui/web/app/dashboard/page.tsx` を作成
    - アクティブワーカー、保留タスク、完了タスク、エラー数表示
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [x] 26.3 アクティビティフィードと自動更新
    - 最近のアクティビティ表示
    - 5秒ごとの自動更新
    - _Requirements: 16.5, 16.6_
  - [x] 26.4 クイックアクション
    - 一括停止/再開/緊急停止ボタン
    - _Requirements: 16.7_

- [x] 27. Checkpoint - Dashboard完了
  - Ensure all tests pass, ask the user if questions arise.

- [x] 28. GUI Command Center画面
  - [x] 28.1 Command API
    - `gui/web/app/api/command/route.ts` を作成
    - 指示送信、履歴取得API
    - _Requirements: 17.8_
  - [x] 28.2 Command Center画面UI
    - `gui/web/app/command/page.tsx` を作成
    - テキスト入力、プロジェクト選択、履歴表示
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  - [x] 28.3 タスク分解プレビュー
    - 実行前の分解プレビュー表示
    - _Requirements: 17.6_

- [x] 29. GUI Task Detail画面
  - [x] 29.1 Task API
    - `gui/web/app/api/tasks/[id]/route.ts` を作成
    - タスク詳細、介入API
    - _Requirements: 18.8_
  - [x] 29.2 Task Detail画面UI
    - `gui/web/app/tasks/[id]/page.tsx` を作成
    - ステータス、会話履歴、ファイル変更表示
    - _Requirements: 18.1, 18.2_
  - [x] 29.3 介入機能
    - 追加指示送信、一時停止/再開/キャンセル
    - _Requirements: 18.3, 18.4, 18.5_
  - [x] 29.4 リアルタイムログとdiffプレビュー
    - ログストリーミング、ファイルdiff表示
    - _Requirements: 18.6, 18.7_

- [x] 30. GUI Review画面
  - [x] 30.1 Review API
    - `gui/web/app/api/review/route.ts` を作成
    - 承認待ちタスク一覧、承認/却下API
    - _Requirements: 19.8_
  - [x] 30.2 Review画面UI
    - `gui/web/app/review/page.tsx` を作成
    - 承認待ちタスク一覧、diff表示
    - _Requirements: 19.1, 19.2, 19.3_
  - [x] 30.3 承認フロー
    - 承認/却下/修正依頼アクション
    - インラインコメント機能
    - _Requirements: 19.4, 19.5, 19.6, 19.7_

- [x] 31. Checkpoint - Phase 2完了
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: 統合・最適化

- [x] 32. エージェント定義ファイル作成
  - [x] 32.1 Reviewer Agent定義
    - `agents/registry/reviewer.yaml` を作成
    - _Requirements: 4.10_
  - [x] 32.2 Merger Agent定義
    - `agents/registry/merger.yaml` を作成
    - _Requirements: 4.10_
  - [x] 32.3 Worker Agent定義テンプレート
    - `agents/registry/templates/worker.yaml` を更新
    - role: worker フィールド追加
    - _Requirements: 1.8_

- [x] 33. プロンプトテンプレート作成
  - [x] 33.1 Manager用プロンプト
    - `agents/prompts/roles/manager.md` を作成
    - _Requirements: 13.4_
  - [x] 33.2 Worker用プロンプト
    - `agents/prompts/roles/worker.md` を作成
    - _Requirements: 13.5_

- [x] 34. E2Eフロー統合テスト
  - [x] 34.1 完全フローテスト
    - 指示 → 分解 → 実行 → レビュー → マージの統合テスト
    - _Requirements: 23.1, 23.8_
  - [x] 34.2 エラーリカバリテスト
    - AI失敗、コンテナ失敗からのリカバリテスト
    - _Requirements: 13.6, 13.7_
  - [x] 34.3 隔離検証テスト
    - ワーカー間隔離の統合テスト
    - _Requirements: 5.4 (Isolation Acceptance Test Criteria)_

- [x] 35. ドキュメント更新
  - [x] 35.1 CLI README更新
    - `tools/cli/README.md` にexecute, status, project コマンド追加
  - [x] 35.2 アーキテクチャドキュメント
    - `docs/architecture/execution-engine.md` を作成
    - コンテナランタイム選択、Git認証方式、メッセージキュー方式の説明
  - [x] 35.3 正式仕様書
    - `docs/specs/agent-execution-engine.md` を作成
  - [x] 35.4 MVP.md更新
    - M6: Agent Execution Engine セクション追加

- [x] 36. Final Checkpoint - 全テスト通過確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Phase 1 completes the core execution engine
- Phase 2 adds GUI capabilities for monitoring and control
- Phase 3 integrates everything and adds documentation
