# ワークフロー本番対応 仕様書

## 概要

ワークフローエンジンの各フェーズをシミュレーションから本番実装に移行する。
CodingAgent CLI（claude, opencode, kiro）を活用し、実際のコード生成・レビュー・品質チェックを行う。
CodingAgent 未インストール時はシミュレーションにフォールバックし、GUI に警告バナーを表示する。

## 対象コンポーネント

| コンポーネント | ファイル | 変更内容 |
|---------------|---------|---------|
| WorkflowEngine | `tools/cli/lib/execution/workflow-engine.ts` | QA/レビュー/エスカレーション実装 |
| SystemHealthBanner | `gui/web/components/ui/SystemHealthBanner.tsx` | 新規作成 |
| Dashboard | `gui/web/app/dashboard/page.tsx` | バナー追加 |
| Command Center | `gui/web/app/command/page.tsx` | バナー追加 |
| Dashboard API | `gui/web/app/api/dashboard/route.ts` | codingAgents フィールド追加 |

## 機能仕様

### 1. QA フェーズ本番実装

`executeQualityAssurancePhase()` を CodingAgent ベースの実装に置き換え。

- CodingAgent 利用可能時: `make lint`（120s timeout）、`make test`（300s timeout）を実行
- CodingAgent 未利用時: シミュレーション結果で自動通過
- lint/test 両方 PASS → delivery フェーズへ遷移
- いずれか FAIL → development フェーズへ差し戻し
- 結果は `state.qualityResults` に保存

### 2. レビューフェーズ本番実装

`executeCodeReview()` メソッドを新規追加。開発フェーズ内の各サブタスク完了後に呼び出す。

- CodingAgent 利用可能時: レビュープロンプトを送信し、APPROVED/NEEDS_REVISION を判定
- CodingAgent 未利用時: 即承認にフォールバック
- NEEDS_REVISION → エスカレーション生成、開発フェーズ中断
- 実行エラー時 → 安全側に倒して承認（ブロッキング回避）

### 3. エスカレーション→再開フロー

`handleEscalation()` の retry/skip 後に `executePhase()` を再呼び出し。

- retry: 失敗タスクを pending に戻して再実行
- skip: 失敗タスクを skipped にマークして残タスクを続行
- `executeDevelopmentPhase()` は再実行時に既存 progress を再利用し、completed/skipped タスクをスキップ

### 4. GUI 警告バナー

`SystemHealthBanner` コンポーネントを Dashboard と Command Center に配置。

- Orchestrator Server、CodingAgent、Ollama の3項目を個別表示
- CodingAgent 未検出 or Orchestrator 未接続 → 赤枠（error レベル）
- Ollama のみ未起動 → 黄枠（warning レベル）
- 全て正常 → バナー非表示
- 閉じるボタン、Settings ページへの誘導リンク付き

## テスト

テストファイル: `tests/execution/workflow-production-ready.test.ts`

| テストケース | 検証内容 |
|-------------|---------|
| QA: CodingAgent利用時 lint/test 実行 | 実際の CodingAgent 呼び出しと結果保存 |
| QA: CodingAgent未利用時シミュレーション | フォールバック動作 |
| QA: lint失敗時 development 差し戻し | 品質ゲート失敗フロー |
| レビュー: CodingAgent未利用時即承認 | フォールバック動作 |
| レビュー: NEEDS_REVISION エスカレーション | 差し戻しフロー |
| エスカレーション: retry 再実行 | pending 復帰と executePhase 再呼び出し |
| エスカレーション: skip 続行 | skipped マークと残タスク実行 |
| エスカレーション: abort 終了 | ワークフロー終了 |

## 関連ドキュメント

- [実行エンジン アーキテクチャ](../architecture/execution-engine.md)
- [エンドツーエンド ワークフロー接続 仕様](end-to-end-workflow-wiring.md)
- [Coding Agent Integration 仕様](coding-agent-integration.md)
