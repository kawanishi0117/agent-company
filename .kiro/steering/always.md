---
inclusion: always
---

# AgentCompany 開発ルール

## 最上位ルール

### R0. 変更は必ず記録する

- コード・設定・運用を変更したら対応ドキュメントも更新
- 不要なら「不要な理由」を成果物に明記
- **spec実装完了時は必ず関連ドキュメントを更新すること**

### R0.1 Spec実装時のドキュメント更新（必須）

spec（`.kiro/specs/`）のタスク完了時、以下を必ず実施：

1. **実装内容に応じたドキュメント更新**
   - 新機能 → `docs/architecture/` または該当README
   - CLI追加 → `tools/cli/README.md`（なければ作成）
   - Docker変更 → `infra/docker/README.md`
   - 設定変更 → 該当する設定ファイルのコメント

2. **steering更新の検討**
   - 新しい技術導入 → `tech.md` 更新
   - 構造変更 → `structure.md` 更新
   - 新ルール追加 → `always.md` 更新

3. **docs/specs/ への正式仕様作成**
   - `.kiro/specs/`での実装完了後、`docs/specs/`に正式仕様書を作成・更新
   - 機能の「何ができるか」「どう使うか」を人が読める形で記載

4. **MVP.md / README.md の同期**
   - 大きな機能追加時はプロジェクト概要も更新

### R1. 会社OSを参照

意思決定前に必ず確認：

| ドキュメント                         | 内容                         |
| ------------------------------------ | ---------------------------- |
| `docs/company/policies.md`           | 会社ポリシー、依存管理ルール |
| `docs/company/definition-of-done.md` | 成果物の完了基準             |
| `docs/company/review-standards.md`   | レビュー基準、判定条件       |
| `docs/company/waiver-policy.md`      | 例外承認ルール               |

### R2. 例外はWaiverを発行

- `workflows/waivers/` に作成
- 必須項目: 期限・理由・代替策・フォロータスク
- テンプレート: `workflows/waivers/TEMPLATE.md`

## コーディング規約

### TypeScript基本ルール

- 関数には戻り値の型を明示（ESLint: explicit-function-return-type）
- 未使用変数は `_` プレフィックス（ESLint: no-unused-vars）
- console.log は warn（本番コードでは避ける）
- CLI（ESM）: 相対パス + `.js` 拡張子でインポート
- GUI（Next.js）: `@/` パスエイリアスでインポート
- 型は `tools/cli/lib/execution/types.ts` に集約
- インターフェースにはJSDocコメント必須

### エラーハンドリング

- カスタムエラークラスを使用（例: `OrchestratorError`）
- エラーは適切にキャッチして処理
- 未知のエラーはラップして再スロー

### コメント規約

- モジュールには `@module` タグ
- 関数には `@param`, `@returns`, `@throws` タグ
- 要件との対応は `@see Requirements:` で記載

## テスト規約

| 種別           | 場所                   | 命名規則             |
| -------------- | ---------------------- | -------------------- |
| ユニットテスト | `tests/`               | `*.test.ts`          |
| Property-based | `tests/`               | `*.property.test.ts` |
| E2Eテスト      | `e2e/`                 | `*.spec.ts`          |
| GUIテスト      | `gui/web/lib/parsers/` | `*.test.ts`          |

## ドキュメント更新ルール

| 変更内容     | 更新先                                               |
| ------------ | ---------------------------------------------------- |
| 会社ルール   | `docs/company/` + `workflows/decisions/`             |
| Docker/権限  | `infra/docker/` + `docs/architecture/permissions.md` |
| 品質ゲート   | `docs/company/definition-of-done.md`                 |
| allowlist    | `tools/installers/` + `docs/company/policies.md`     |
| エージェント | `agents/registry/` + `docs/playbooks/hiring.md`      |
| GUI          | `gui/web/README.md`                                  |
| 実行エンジン | `docs/architecture/execution-engine.md` + 分割先ファイル |

## 作業フロー

1. **チケット化**: `workflows/backlog/` に作成
2. **統一コマンド**: `make` または `tools/cli` 経由で実行
3. **成果物**: `runtime/runs/<run-id>/` に保存
4. **ADR**: 重要決定は `workflows/decisions/` に記録

## 依存管理（方式A）

- 導入は `tools/installers/install.sh` 経由のみ
- allowlist: `tools/installers/allowlist/`
- allowlist外は先にWaiver作成
- 新規追加手順: Waiver申請 → レビュー → 承認 → allowlist追加

## 品質ゲート

```bash
make lint   # 静的解析（ESLint + Prettier）
make test   # ユニットテスト（Vitest、カバレッジ80%目標）
make e2e    # E2Eテスト（Playwright）
make ci     # 全ゲート統合
```

## Git規約

### ブランチ命名

- `feature/<ticket-id>-<description>`
- `fix/<ticket-id>-<description>`
- `hotfix/<description>`

### コミットタイプ

| type     | 用途             |
| -------- | ---------------- |
| feat     | 新機能           |
| fix      | バグ修正         |
| docs     | ドキュメント     |
| refactor | リファクタリング |
| test     | テスト           |
| chore    | ビルド・設定     |

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

## 禁止事項

1. ハードコードされた認証情報
2. allowlist外パッケージの使用（Waiverなし）
3. テストのスキップ（理由なし）
4. 未処理のエラー
5. console.log の乱用
6. 型の `any` 使用
7. マジックナンバー

## 日本語対応

- 途中経過・まとめは日本語で回答
- コード内コメントは適宜追加
- 可読性を重視
