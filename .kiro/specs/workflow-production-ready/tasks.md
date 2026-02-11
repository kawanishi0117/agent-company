# タスク: ワークフロー本番対応

## Task 1: SystemHealthBanner コンポーネント作成
- [x] `gui/web/components/ui/SystemHealthBanner.tsx` を作成
- [x] Orchestrator 未接続、CodingAgent 未検出、Ollama 未起動を個別に警告表示
- [x] Settings ページへの誘導リンクを含める
- [x] 閉じるボタン付き

## Task 2: Dashboard に警告バナーを追加
- [x] `gui/web/app/dashboard/page.tsx` に SystemHealthBanner を追加
- [x] `/api/dashboard` の aiStatus から CodingAgent 情報を取得して表示

## Task 3: Command Center に警告バナーを追加
- [x] `gui/web/app/command/page.tsx` に SystemHealthBanner を追加
- [x] Orchestrator 接続状態と CodingAgent 可用性を表示

## Task 4: QA フェーズの実装
- [x] `executeQualityAssurancePhase()` で CodingAgent を使って lint/test を実行
- [x] CodingAgent 未利用時はシミュレーション結果にフォールバック
- [x] 品質結果を WorkflowState に保存

## Task 5: レビューフェーズの実装
- [x] development フェーズ内のレビューで CodingAgent を使ってコードレビュー実行
- [x] レビュー結果に基づいて approved/needs_revision 判定
- [x] CodingAgent 未利用時は即承認にフォールバック

## Task 6: エスカレーション→再開フローの完全化
- [x] retry 決定後に development フェーズの残タスクを再実行
- [x] handleEscalation の retry で executePhase を再呼び出し

## Task 7: テスト作成・確認
- [x] 新規実装のユニットテストを作成
- [x] 既存テスト全通過を確認

## Task 8: ドキュメント更新
- [x] `docs/specs/` に正式仕様書を作成
- [x] `docs/architecture/execution-engine.md` を更新
- [x] タスク完了マーク
