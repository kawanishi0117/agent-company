# Design Document

## Overview

M3 Governanceは、Quality Authorityの判定ロジックをCLIコマンドとして実装する。`judge`コマンドで成果物を評価し、`waiver`コマンドで例外承認を管理する。判定結果はJSON形式で保存され、自動処理や履歴追跡が可能。

## Architecture

### コンポーネント構成

```
tools/cli/
├── agentcompany.ts          # メインエントリ（既存）
├── commands/
│   ├── judge.ts             # 判定コマンド（新規）
│   └── waiver.ts            # Waiver管理コマンド（新規）
└── lib/
    ├── judgment.ts          # 判定ロジック（新規）
    └── waiver-validator.ts  # Waiver検証（新規）

workflows/waivers/
├── TEMPLATE.md              # Waiverテンプレート（新規）
└── YYYY-MM-DD-*.md          # 個別Waiver（運用時生成）

runtime/runs/<run-id>/
└── judgment.json            # 判定結果（judge実行時生成）
```

### データフロー

```
[make ci 実行]
      ↓
[runtime/runs/<run-id>/ に結果保存]
      ↓
[judge コマンド実行]
      ↓
[judgment.ts が各チェックを評価]
      ↓
[judgment.json 出力]
      ↓
[FAIL の場合 → waiver create で例外申請]
      ↓
[waiver validate で検証]
      ↓
[承認後 → judge --waiver で再判定]
```

## Component Details

### 1. judge.ts - 判定コマンド

```typescript
// コマンド: npx ts-node tools/cli/agentcompany.ts judge <run-id>
// オプション: --waiver <waiver-id> (Waiver適用時)

interface JudgeOptions {
  runId: string;
  waiverId?: string;
}

// 実行フロー:
// 1. runtime/runs/<run-id>/ の存在確認
// 2. 各チェック結果の読み込み（lint, test, e2e）
// 3. 成果物フォーマットの検証
// 4. Waiver適用の確認（指定時）
// 5. 総合判定の決定
// 6. judgment.json の出力
```

### 2. judgment.ts - 判定ロジック

```typescript
// 判定結果の型定義
interface JudgmentResult {
  status: 'PASS' | 'FAIL' | 'WAIVER';
  timestamp: string;
  run_id: string;
  checks: {
    lint: CheckResult;
    test: CheckResult;
    e2e: CheckResult;
    format: CheckResult;
  };
  reasons: string[];
  waiver_id?: string;
}

interface CheckResult {
  passed: boolean;
  details?: string;
}

// 判定ロジック:
// - 全チェックPASS → PASS
// - いずれかFAIL かつ Waiverなし → FAIL
// - いずれかFAIL かつ 有効Waiver → WAIVER
```

### 3. waiver.ts - Waiver管理コマンド

```typescript
// サブコマンド:
// - create <title>: 新規Waiver作成
// - validate <file>: Waiver検証
// - list [--overdue]: Waiver一覧

// create: TEMPLATEをコピーし、日付とタイトルを設定
// validate: 必須フィールドの存在チェック
// list: workflows/waivers/*.md をスキャンして一覧表示
```

### 4. waiver-validator.ts - Waiver検証ロジック

```typescript
// 必須フィールド:
const REQUIRED_FIELDS = ['申請日', '申請者', '対象', '理由', '期限', 'フォロータスク'];

// 検証ルール:
// - 期限: YYYY-MM-DD形式で未来日付
// - フォロータスク: 最低1つのチェックボックス項目
// - 理由: 空でないこと
```

## Judgment Output Format

```json
{
  "status": "PASS",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "run_id": "20260128-001",
  "checks": {
    "lint": { "passed": true },
    "test": { "passed": true, "details": "coverage: 85%" },
    "e2e": { "passed": true, "details": "5/5 tests passed" },
    "format": { "passed": true }
  },
  "reasons": []
}
```

```json
{
  "status": "FAIL",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "run_id": "20260128-002",
  "checks": {
    "lint": { "passed": false, "details": "3 errors found" },
    "test": { "passed": true },
    "e2e": { "passed": false, "details": "2/5 tests failed" },
    "format": { "passed": true }
  },
  "reasons": ["lint: 3 errors found", "e2e: 2/5 tests failed"]
}
```

```json
{
  "status": "WAIVER",
  "timestamp": "2026-01-28T15:00:00.000Z",
  "run_id": "20260128-003",
  "checks": {
    "lint": { "passed": true },
    "test": { "passed": false, "details": "coverage: 65%" },
    "e2e": { "passed": true },
    "format": { "passed": true }
  },
  "reasons": ["test: coverage below threshold (65% < 80%)"],
  "waiver_id": "2026-01-28-coverage-exception"
}
```

## Waiver Template Structure

```markdown
# Waiver: [タイトル]

## 申請日

YYYY-MM-DD

## 申請者

[エージェント名]

## 対象

[例外を求める品質基準]

## 理由

[なぜ例外が必要か]

## 緊急性

[なぜ今すぐ必要か]

## 代替策

[リスク軽減のために何をするか]

## 期限

YYYY-MM-DD

## フォロータスク

- [ ] [解消のためのタスク1]
- [ ] [解消のためのタスク2]

## 承認者

[Quality Authority]

## ステータス

- [ ] 申請中
- [ ] 承認
- [ ] 却下
- [ ] 解消済み
```

## Error Handling

| エラー                 | 対応                        |
| ---------------------- | --------------------------- |
| run-id が存在しない    | エラーメッセージ + exit 1   |
| waiver-id が存在しない | エラーメッセージ + exit 1   |
| Waiver期限切れ         | 警告表示 + FAIL判定         |
| 必須フィールド欠落     | 欠落フィールド一覧 + exit 1 |

## Testing Strategy

### ユニットテスト

- `tests/judgment.test.ts`: 判定ロジックのテスト
- `tests/waiver-validator.test.ts`: Waiver検証のテスト

### E2Eテスト

- `e2e/governance.spec.ts`: judge/waiverコマンドの統合テスト

## Dependencies

既存の依存関係のみ使用（追加パッケージなし）:

- `fs/promises`: ファイル操作
- `path`: パス操作
- `commander`: CLIフレームワーク（既存）
