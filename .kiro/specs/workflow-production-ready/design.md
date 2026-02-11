# 設計: ワークフロー本番対応（ギャップ解消）

## 概要

既存のシミュレーション/スタブ部分を実装に置き換え、GUI警告バナーを追加する。

## 変更対象

### 1. GUI 警告バナー

#### `gui/web/components/ui/SystemHealthBanner.tsx`（新規）
- CodingAgent/Orchestrator の可用性を表示する共通バナーコンポーネント
- Dashboard と Command Center で再利用

#### `gui/web/app/dashboard/page.tsx`（修正）
- SystemHealthBanner を追加
- aiStatus から CodingAgent 情報を取得して表示

#### `gui/web/app/command/page.tsx`（修正）
- SystemHealthBanner を追加
- 送信前に CodingAgent 可用性を警告

### 2. QA フェーズ実装

#### `tools/cli/lib/execution/workflow-engine.ts`（修正）
- `executeQualityAssurancePhase()` を実装に置き換え
- CodingAgent を使って `make lint` / `make test` を実行
- CodingAgent 未利用時は既存シミュレーションにフォールバック

### 3. レビューフェーズ実装

#### `tools/cli/lib/execution/workflow-engine.ts`（修正）
- `executeDevelopmentPhase()` 内のレビューシミュレーションを実装に置き換え
- CodingAgent を使ってコードレビューを実行
- CodingAgent 未利用時は即承認にフォールバック

### 4. エスカレーション→再開フロー

#### `tools/cli/lib/execution/workflow-engine.ts`（修正）
- `handleEscalation()` の retry 後に development フェーズを再実行
- 残タスクの再開ロジック

## 設計判断

### D-1: CodingAgent でシェルコマンド実行
- QA フェーズで `make lint` / `make test` を実行するために CodingAgent.execute() を使用
- プロンプトに「lint/testを実行して結果を報告」と指示
- CodingAgent 未利用時はハードコードされたシミュレーション結果を返す

### D-2: レビューも CodingAgent で実行
- コードレビューのプロンプトを CodingAgent に渡す
- 結果を解析して approved/needs_revision を判定
- CodingAgent 未利用時は即承認

### D-3: 警告バナーは共通コンポーネント
- `SystemHealthBanner` として切り出し、Dashboard/CommandCenter で再利用
- Orchestrator 未接続、CodingAgent 未検出、Ollama 未起動を個別に表示
