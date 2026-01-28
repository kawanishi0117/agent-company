# AgentCompany

AIエージェントを「会社」として運用するためのフレームワーク。

## コンセプト

- **会社OS**: 不変のポリシー・品質基準・例外管理を固定
- **隔離実行**: Docker上のWorkspaceで安全に実行
- **ゲート強制**: Quality Authorityによる最終判定
- **採用システム**: Registry登録でエージェントを増員

## フォルダ構成

```
agent-company/
├── docs/                    # 会社の規程（人が読める）
│   ├── company/             # 不変のポリシー
│   ├── playbooks/           # 運用手順書
│   └── architecture/        # 設計ドキュメント
├── agents/                  # エージェント定義
│   ├── registry/            # 採用済みエージェント（YAML）
│   └── prompts/             # 役割別プロンプト
├── workflows/               # 作業管理
│   ├── backlog/             # チケット
│   ├── reports/             # レポート
│   ├── decisions/           # ADR（意思決定ログ）
│   └── waivers/             # 例外承認
├── tools/                   # 実行ツール
│   ├── cli/                 # AgentCompany CLI
│   ├── installers/          # 許可リスト管理
│   ├── validators/          # ルール検査
│   └── adapters/            # AI CLI アダプタ
├── runtime/                 # 実行時データ
│   ├── runs/                # 実行ログ・成果物
│   ├── cache/               # キャッシュ
│   └── state/               # ジョブ状態
├── infra/                   # インフラ定義
│   ├── docker/              # Docker設定
│   └── ci/                  # CI設定
├── gui/                     # ダッシュボード
│   └── web/                 # Web UI
└── workspaces/              # 対象案件管理
```

## クイックスタート

```bash
# 依存インストール（allowlist経由）
make install

# 品質ゲート実行
make ci

# 開発サーバー起動
make dev
```

## Docker Workspace

隔離されたDocker環境でエージェントを安全に実行できます。

### 起動方法

```bash
# Workspaceコンテナをビルド・起動
docker compose -f infra/docker/compose.yaml up -d

# コンテナに入る
docker compose -f infra/docker/compose.yaml exec workspace bash
```

### パッケージインストール

Workspace内では、allowlist方式で許可されたパッケージのみインストール可能です。

```bash
# allowlist内のパッケージをインストール
/usr/local/bin/install.sh npm typescript
/usr/local/bin/install.sh pip requests
/usr/local/bin/install.sh apt curl

# allowlist外のパッケージは拒否される
/usr/local/bin/install.sh npm malicious-package  # → rejected
```

### Allowlist管理

許可パッケージは以下のファイルで管理されています：

| ファイル                             | 用途               |
| ------------------------------------ | ------------------ |
| `tools/installers/allowlist/apt.txt` | システムパッケージ |
| `tools/installers/allowlist/pip.txt` | Pythonパッケージ   |
| `tools/installers/allowlist/npm.txt` | Node.jsパッケージ  |

新しいパッケージを追加する場合は、対応するallowlistファイルに追記してください。

### インストールログ

すべてのインストール操作は `runtime/logs/install/` に記録されます。

## 主要コマンド

| コマンド    | 説明           |
| ----------- | -------------- |
| `make lint` | 静的解析       |
| `make test` | ユニットテスト |
| `make e2e`  | E2Eテスト      |
| `make ci`   | 全ゲート実行   |

## MVPマイルストーン

- **M0**: 会社の骨格（Registry/Orchestrator/QA） ✅
- **M1**: Docker Workspace + 許可リスト ✅
- **M2**: 品質ゲート（lint/test/e2e）
- **M3**: Governance判定（PASS/FAIL/WAIVER）
- **M4**: GUI（Backlog/Runs/Reports）
- **M5**: 採用システム

## ライセンス

MIT
