---
inclusion: always
---

# AgentCompany 開発ルール

## 最上位ルール

### R0. 変更は必ず記録する
- コード・設定・運用を変更したら対応ドキュメントも更新
- 不要なら「不要な理由」を成果物に明記

### R1. 会社OSを参照
意思決定前に必ず確認：
- `docs/company/policies.md`
- `docs/company/definition-of-done.md`
- `docs/company/review-standards.md`
- `docs/company/waiver-policy.md`

### R2. 例外はWaiverを発行
- `workflows/waivers/` に作成
- 期限・理由・代替策・フォロータスク必須

## ドキュメント更新ルール

| 変更内容 | 更新先 |
|---------|--------|
| 会社ルール | `docs/company/` + `workflows/decisions/` |
| Docker/権限 | `infra/docker/` + `docs/architecture/permissions.md` |
| 品質ゲート | `docs/company/definition-of-done.md` |
| allowlist | `tools/installers/` + `docs/company/policies.md` |
| エージェント | `agents/registry/` + `docs/playbooks/hiring.md` |
| GUI | `gui/web/README.md` |

## 作業フロー

1. **チケット化**: `workflows/backlog/` に作成
2. **統一コマンド**: `make` または `tools/cli` 経由で実行
3. **成果物**: `runtime/runs/<run-id>/` に保存
4. **ADR**: 重要決定は `workflows/decisions/` に記録

## 依存管理（方式A）

- 導入は `tools/installers/install.sh` 経由のみ
- allowlist: `tools/installers/allowlist/`
- allowlist外は先にWaiver作成

## 品質ゲート

```bash
make lint   # 静的解析
make test   # ユニットテスト
make e2e    # E2Eテスト
make ci     # 全ゲート
```

## 日本語対応

- 途中経過・まとめは日本語で回答
- コード内コメントは適宜追加
- 可読性を重視
