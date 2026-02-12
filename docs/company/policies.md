# AgentCompany ポリシー

## 基本方針

1. **安全第一**: すべての実行はDocker隔離環境で行う
2. **許可リスト方式**: allowlist外のパッケージは導入禁止
3. **品質ゲート必須**: lint/test/e2e を通過しないと納品不可
4. **記録の徹底**: すべての操作・判定をログに残す

## 依存管理ポリシー

### 許可パッケージ

| 種別 | 許可リスト                           | 管理者           |
| ---- | ------------------------------------ | ---------------- |
| apt  | `tools/installers/allowlist/apt.txt` | Security Officer |
| pip  | `tools/installers/allowlist/pip.txt` | Security Officer |
| npm  | `tools/installers/allowlist/npm.txt` | Security Officer |

### 新規パッケージ追加手順

1. `workflows/waivers/` にWaiver申請を作成
2. Security Officerによるセキュリティレビュー実施
3. 承認後、allowlistに追加
4. `docs/company/policies.md` を更新

## 品質基準

### 必須ゲート

```bash
make lint   # ESLint + Prettier
make test   # Vitest（カバレッジ80%以上）
make e2e    # Playwright
make ci     # 全ゲート統合
```

### 成果物要件

すべての納品物に以下を含めること：

- 目的
- 変更点
- テスト結果
- E2E結果
- ロールバック手順
- リスク評価

## エスカレーション

| 状況                      | エスカレーション先 |
| ------------------------- | ------------------ |
| 品質ゲート失敗            | Quality Authority  |
| allowlist外パッケージ必要 | Security Officer   |
| セキュリティ懸念          | Security Officer   |
| 脆弱性（Critical/High）  | Security Officer   |
| 予算超過（20%以上）       | CFO                |
| コスト異常検出            | CFO                |
| 判断困難                  | COO/PM             |
