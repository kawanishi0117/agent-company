# 要件: ワークフロー本番対応（ギャップ解消）

## 概要

GUI → WorkflowEngine → CodingAgent のエンドツーエンドフローにおける
シミュレーション/スタブ部分を実装に置き換え、本番運用可能な状態にする。

## 要件一覧

### FR-1: GUI 警告バナー（CodingAgent/Orchestrator 未検出時）
- FR-1.1: Dashboard ページで CodingAgent が利用不可の場合、警告バナーを表示する
- FR-1.2: Command Center ページで CodingAgent が利用不可の場合、警告バナーを表示する
- FR-1.3: 警告バナーから Settings ページへの誘導リンクを含める
- FR-1.4: Orchestrator 未接続時も警告バナーを表示する

### FR-2: QA フェーズの実装（シミュレーション解消）
- FR-2.1: executeQualityAssurancePhase で CodingAgent を使って lint/test を実行する
- FR-2.2: CodingAgent 未利用時はシミュレーション結果を返す（フォールバック）
- FR-2.3: 品質結果を WorkflowState に保存する

### FR-3: レビューフェーズの実装（シミュレーション解消）
- FR-3.1: development フェーズ内のレビューで CodingAgent を使ってコードレビューを実行する
- FR-3.2: レビュー結果に基づいて approved/needs_revision 判定する
- FR-3.3: CodingAgent 未利用時はシミュレーション（即承認）にフォールバック

### FR-4: エスカレーション→再開フローの完全化
- FR-4.1: エスカレーション発生時、development フェーズの残タスクを再開できる
- FR-4.2: retry 決定後、失敗タスクから development フェーズを再実行する

### FR-5: テスト
- FR-5.1: 新規実装のユニットテストを作成する
- FR-5.2: 既存テストが全て通過することを確認する
