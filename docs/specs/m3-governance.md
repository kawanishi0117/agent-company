# M3: Governance（品質判定）

## 概要

Quality Authorityの判定ロジックをCLIコマンドとして実装。`judge`コマンドで成果物を評価し、`waiver`コマンドで例外承認を管理する。

## 機能

### 判定（judge）

実行結果を評価し、PASS/FAIL/WAIVERの判定を発行する。

```bash
# 基本的な判定
npx tsx tools/cli/agentcompany.ts judge <run-id>

# Waiverを適用した判定
npx tsx tools/cli/agentcompany.ts judge <run-id> --waiver <waiver-id>
```

### 判定結果

判定結果は `runtime/runs/<run-id>/judgment.json` に保存される。

```json
{
  "status": "PASS",
  "timestamp": "2026-01-29T00:00:00.000Z",
  "run_id": "2026-01-27-151426-q3me",
  "checks": {
    "lint": { "passed": true },
    "test": { "passed": true },
    "e2e": { "passed": true },
    "format": { "passed": true }
  },
  "reasons": []
}
```

### Waiver管理

例外承認（Waiver）の作成・検証・一覧表示を行う。

```bash
# 新規Waiver作成
npx tsx tools/cli/agentcompany.ts waiver create "テストカバレッジ例外"

# Waiver検証
npx tsx tools/cli/agentcompany.ts waiver validate workflows/waivers/2026-01-29-test.md

# Waiver一覧
npx tsx tools/cli/agentcompany.ts waiver list

# 期限切れWaiverのみ表示
npx tsx tools/cli/agentcompany.ts waiver list --overdue
```

## 判定ステータス

| ステータス | 説明                                 |
| ---------- | ------------------------------------ |
| PASS       | 全ての品質チェックに合格             |
| FAIL       | いずれかの品質チェックに不合格       |
| WAIVER     | 不合格だが有効なWaiverにより例外承認 |

## 品質チェック項目

- **lint**: 静的解析（ESLint）
- **test**: ユニットテスト（Vitest）
- **e2e**: E2Eテスト（Playwright）
- **format**: コードフォーマット（Prettier）

## Waiverテンプレート

`workflows/waivers/TEMPLATE.md` に定義。必須フィールド：

- 申請日
- 申請者
- 対象
- 理由
- 緊急性
- 代替策
- 期限
- フォロータスク
- 承認者
- ステータス

## 使用例

### PASS判定の再現

```bash
# 成功したrunに対して判定
npx tsx tools/cli/agentcompany.ts judge 2026-01-27-151426-q3me
# 出力: ✅ Judgment: PASS
```

### FAIL判定の再現

品質チェックに失敗したrunに対して判定を実行すると、FAIL判定が返される。

### WAIVER判定の再現

```bash
# 1. Waiverを作成
npx tsx tools/cli/agentcompany.ts waiver create "テストカバレッジ例外"

# 2. Waiverを編集して必須項目を記入

# 3. Waiverを検証
npx tsx tools/cli/agentcompany.ts waiver validate workflows/waivers/2026-01-29-テストカバレッジ例外.md

# 4. Waiverを適用して判定
npx tsx tools/cli/agentcompany.ts judge <run-id> --waiver 2026-01-29-テストカバレッジ例外
# 出力: ⚠️ Judgment: WAIVER
```

## ファイル構成

```
tools/cli/
├── agentcompany.ts          # メインエントリ
├── commands/
│   ├── judge.ts             # 判定コマンド
│   └── waiver.ts            # Waiver管理コマンド
└── lib/
    ├── judgment.ts          # 判定ロジック
    └── waiver-validator.ts  # Waiver検証

workflows/waivers/
├── TEMPLATE.md              # Waiverテンプレート
└── YYYY-MM-DD-*.md          # 個別Waiver

runtime/runs/<run-id>/
└── judgment.json            # 判定結果
```

## 関連ドキュメント

- [Waiverポリシー](../company/waiver-policy.md)
- [品質基準](../company/definition-of-done.md)
