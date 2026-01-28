---
inclusion: always
---

# プロジェクト構成

## ディレクトリ構造

```
agent-company/
├── docs/                        # 会社の規程（人が読める）
│   ├── specs/                   # 機能仕様書（正式版）
│   │   ├── cli.md               # CLI仕様
│   │   ├── docker-workspace.md  # Docker隔離仕様
│   │   └── quality-gate.md      # 品質ゲート仕様
│   ├── company/                 # 不変のポリシー
│   │   ├── policies.md          # 会社ポリシー
│   │   ├── definition-of-done.md
│   │   ├── review-standards.md
│   │   ├── waiver-policy.md     # 例外承認ルール
│   │   └── security-baseline.md
│   ├── playbooks/               # 運用手順書
│   │   ├── incident.md
│   │   ├── release.md
│   │   └── hiring.md
│   └── architecture/            # 設計ドキュメント
│       ├── overview.md
│       ├── data-flow.md
│       └── permissions.md
│
├── agents/                      # エージェント定義
│   ├── registry/                # 採用済みエージェント
│   │   ├── coo_pm.yaml
│   │   ├── quality_authority.yaml
│   │   └── templates/
│   └── prompts/                 # 役割別プロンプト
│       ├── shared/
│       ├── roles/
│       └── rubrics/
│
├── workflows/                   # 作業管理
│   ├── backlog/                 # チケット（1件=1ファイル）
│   ├── reports/                 # 日次・週次レポート
│   ├── decisions/               # ADR（意思決定ログ）
│   └── waivers/                 # 例外承認記録
│
├── tools/                       # 実行ツール
│   ├── cli/                     # AgentCompany CLI
│   ├── installers/              # 許可リスト管理
│   │   ├── install.sh
│   │   └── allowlist/
│   ├── validators/              # ルール検査
│   └── adapters/                # AI CLIアダプタ
│
├── runtime/                     # 実行時データ
│   ├── runs/                    # 実行ログ・成果物
│   │   └── <date>/<run-id>/
│   ├── cache/                   # キャッシュ
│   └── state/                   # ジョブ状態
│
├── infra/                       # インフラ定義
│   ├── docker/
│   │   ├── compose.yaml
│   │   ├── images/
│   │   └── policies/
│   └── ci/
│
├── gui/                         # ダッシュボード
│   └── web/
│
└── workspaces/                  # 対象案件管理
    └── projects.json
```

## 境界の意図

| ディレクトリ | 役割 | 変更頻度 |
|-------------|------|---------|
| `docs/` | 会社規程（プロンプトより上位） | 低 |
| `agents/` | 採用・人格定義 | 中 |
| `tools/` | 実行手段（CLI/インストーラ） | 高 |
| `infra/` | Docker/隔離/権限 | 低 |
| `runtime/` | ログ・成果物 | 自動生成 |
| `gui/` | 可視化UI | 中 |

## 重要な設計原則

1. **採用と実行を分離**: `agents/registry/` と `tools/adapters/` は混ぜない
2. **成果物集約**: `runtime/runs/<run-id>/` に全て保存
3. **例外のファイル化**: `workflows/waivers/` に期限付きで記録
4. **許可リスト集約**: `tools/installers/allowlist/` で一元管理
