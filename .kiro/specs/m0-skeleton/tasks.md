# Implementation Plan: M0 - 会社の骨格

## Overview

AgentCompanyの基盤を構築する。Registry Schema、固定エージェント定義、成果物フォーマット、Ollamaアダプタ、最小ワークフローを実装し、サンプルチケットが Plan → Run → Report まで通ることを確認する。

## Tasks

- [x] 1. プロジェクト基盤セットアップ
  - [x] 1.1 ディレクトリ構造作成
    - `agents/registry/templates/`, `docs/company/`, `workflows/backlog/`, `tools/adapters/`, `tools/cli/`, `runtime/runs/` を作成
    - _Requirements: 1.2, 4.1, 6.1, 7.1_
  - [x] 1.2 package.json と TypeScript設定
    - Node.js プロジェクト初期化、TypeScript, Vitest, fast-check を依存に追加
    - _Requirements: 5.1_
  - [x] 1.3 Makefile雛形作成
    - install, lint, test, e2e, ci ターゲットを定義
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Registry Schema実装
  - [x] 2.1 スキーマテンプレート作成
    - `agents/registry/templates/agent_template.yaml` を作成
    - 必須フィールド: id, title, responsibilities, capabilities, deliverables, quality_gates, budget, persona, escalation
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 スキーマバリデータ実装
    - `tools/cli/validator.ts` を作成
    - YAML読み込み、必須フィールドチェック
    - _Requirements: 1.3_
  - [x] 2.3 Property Test: スキーマ準拠
    - **Property 1: Schema Conformance**
    - **Validates: Requirements 1.1, 2.3, 3.3**
  - [x] 2.4 Property Test: 不正検出
    - **Property 2: Invalid Definition Detection**
    - **Validates: Requirements 1.3**

- [x] 3. 固定エージェント定義
  - [x] 3.1 COO/PM定義作成
    - `agents/registry/coo_pm.yaml` を作成
    - responsibilities: backlog management, task assignment, execution instruction, result collection, report generation
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.2 Quality Authority定義作成
    - `agents/registry/quality_authority.yaml` を作成
    - responsibilities: reviewing PR/diff/logs, issuing PASS/FAIL/WAIVER judgments
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint - スキーマとエージェント定義
  - バリデータでCOO/PMとQuality Authorityの定義を検証
  - `make test` でプロパティテストが通ることを確認

- [x] 5. ドキュメントフォーマット定義
  - [x] 5.1 Definition of Done作成
    - `docs/company/definition-of-done.md` を作成
    - 必須セクション: 目的, 変更点, テスト結果, E2E結果, ロールバック, リスク
    - _Requirements: 4.1, 4.2_
  - [x] 5.2 チケットテンプレート作成
    - `workflows/backlog/TEMPLATE.md` を作成
    - 必須セクション: 目的, 範囲, DoD, リスク, ロールバック
    - _Requirements: 6.1, 6.2_
  - [x] 5.3 成果物バリデータ実装
    - `tools/cli/deliverable-validator.ts` を作成
    - 必須セクションチェック、PASS/FAIL判定
    - _Requirements: 4.3_
  - [x] 5.4 Property Test: 成果物検証
    - **Property 3: Deliverable Validation**
    - **Validates: Requirements 4.3**

- [x] 6. Ollamaアダプタ実装
  - [x] 6.1 Base Adapter インターフェース定義
    - `tools/adapters/base.ts` を作成
    - GenerateOptions, ChatOptions, AdapterResponse, BaseAdapter インターフェース
    - _Requirements: 7.1, 7.2_
  - [x] 6.2 Ollama Adapter実装
    - `tools/adapters/ollama.ts` を作成
    - generate, chat, isAvailable メソッド実装
    - REST API通信 (localhost:11434)
    - _Requirements: 7.3, 7.4_
  - [x] 6.3 Unit Test: Ollama Adapter
    - 接続テスト、エラーハンドリングテスト
    - _Requirements: 7.5_

- [x] 7. Checkpoint - アダプタ動作確認
  - Ollamaが起動している状態で `isAvailable()` が true を返すことを確認
  - Ollamaが停止している状態でエラーメッセージが返ることを確認

- [x] 8. 最小ワークフロー実装
  - [x] 8.1 Ticket パーサー実装
    - `tools/cli/ticket.ts` を作成
    - Markdownフロントマター解析、Ticketオブジェクト生成
    - _Requirements: 6.3_
  - [x] 8.2 Workflow Engine実装
    - `tools/cli/workflow.ts` を作成
    - plan, run, report メソッド実装
    - _Requirements: 8.2, 8.3, 8.4_
  - [x] 8.3 CLI エントリポイント作成
    - `tools/cli/agentcompany.ts` を作成
    - run コマンド実装
    - _Requirements: 8.5_

- [x] 9. サンプルワークフロー実行
  - [x] 9.1 サンプルチケット作成
    - `workflows/backlog/0001-sample.md` を作成
    - _Requirements: 8.1_
  - [x] 9.2 ワークフロー実行テスト
    - サンプルチケットで Plan → Run → Report を実行
    - `runtime/runs/` にログが出力されることを確認
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [x] 10. Final Checkpoint
  - `make ci` が成功することを確認
  - サンプルチケットのワークフローが完了することを確認

## Notes

- 全タスク必須
- Ollamaが必要なテストは、Ollamaが起動していない環境ではモックを使用
- M0完了後、M1（Docker Workspace）に進む
