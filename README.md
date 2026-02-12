# AgentCompany

AIエージェントを「会社」として運用するためのフレームワーク。

## コンセプト

- **会社OS**: 不変のポリシー・品質基準・例外管理を固定
- **隔離実行**: Docker上のWorkspaceで安全に実行
- **ゲート強制**: Quality Authorityによる最終判定
- **採用システム**: Registry登録でエージェントを増員

## 主要機能

| 機能                   | 説明                                              |
| ---------------------- | ------------------------------------------------- |
| Agent Execution Engine | タスク分解 → 並列実行 → レビュー → マージの自動化 |
| Docker隔離環境         | ワーカーごとに独立したコンテナで安全に実行        |
| 品質ゲート             | lint/test/e2eの強制、PASS/FAIL/WAIVER判定         |
| allowlist依存管理      | 許可されたパッケージのみインストール可能          |
| GUI ダッシュボード     | Backlog/Runs/Reports/Settingsの可視化             |
| 採用システム           | JD生成 → 面接 → 試用 → Registry登録               |
| 組織進化               | パフォーマンス追跡・スキルギャップ検出・エスカレーション分析 |

## クイックスタート

```bash
# 1. 依存インストール
npm install
cd gui/web && npm install && cd ../..

# 2. Docker環境を起動
docker compose -f infra/docker/compose.yaml up -d

# 3. Ollamaにモデルをインストール（初回のみ）
docker exec agentcompany-ollama ollama pull llama3.2:1b

# 4. 品質ゲート実行
make ci

# 5. GUIを起動
cd gui/web && npm run dev
# http://localhost:3000 でアクセス
```

詳細は [QUICKSTART.md](QUICKSTART.md) を参照。

## フォルダ構成

```
agent-company/
├── docs/                    # 会社の規程・仕様書
│   ├── company/             # 不変のポリシー
│   ├── specs/               # 機能仕様書
│   ├── architecture/        # 設計ドキュメント
│   └── playbooks/           # 運用手順書
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
│   └── adapters/            # AI アダプタ
├── runtime/                 # 実行時データ
│   ├── runs/                # 実行ログ・成果物
│   ├── state/               # ジョブ状態
│   └── logs/                # ログ
├── infra/                   # インフラ定義
│   └── docker/              # Docker設定
├── gui/                     # ダッシュボード
│   └── web/                 # Next.js Web UI
├── tests/                   # ユニットテスト
└── e2e/                     # E2Eテスト
```

## 主要コマンド

### Make

| コマンド       | 説明                          |
| -------------- | ----------------------------- |
| `make install` | 依存インストール              |
| `make lint`    | 静的解析（ESLint + Prettier） |
| `make test`    | ユニットテスト（Vitest）      |
| `make e2e`     | E2Eテスト（Playwright）       |
| `make ci`      | 全品質ゲート実行              |

### CLI

```bash
# チケット管理
npx tsx tools/cli/agentcompany.ts list
npx tsx tools/cli/agentcompany.ts run workflows/backlog/0001-sample.md

# エージェント実行
npx tsx tools/cli/agentcompany.ts execute <ticket-id>
npx tsx tools/cli/agentcompany.ts status
npx tsx tools/cli/agentcompany.ts stop <run-id>

# 品質判定
npx tsx tools/cli/agentcompany.ts judge <run-id>
npx tsx tools/cli/agentcompany.ts waiver create "例外理由"

# 採用
npx tsx tools/cli/agentcompany.ts hire jd "Developer"

# プロジェクト管理
npx tsx tools/cli/agentcompany.ts project list
npx tsx tools/cli/agentcompany.ts project add my-app https://github.com/user/my-app.git
```

## Docker環境

```bash
# 起動
docker compose -f infra/docker/compose.yaml up -d

# コンテナ内でコマンド実行
docker compose -f infra/docker/compose.yaml exec workspace npm run ci

# 停止
docker compose -f infra/docker/compose.yaml down
```

詳細は [infra/docker/README.md](infra/docker/README.md) を参照。

## GUI ダッシュボード

| 画面           | パス         | 説明                 |
| -------------- | ------------ | -------------------- |
| Dashboard      | `/dashboard` | リアルタイム実行状況 |
| Command Center | `/command`   | タスク投入・制御     |
| Backlog        | `/backlog`   | カンバンボード       |
| Runs           | `/runs`      | 実行履歴・成果物     |
| Reports        | `/reports`   | 日次/週次レポート    |
| Review         | `/review`    | コードレビュー       |
| Settings       | `/settings`  | システム設定         |

詳細は [gui/web/README.md](gui/web/README.md) を参照。

## エージェント

### 固定エージェント

| エージェント      | 役割                                   | 定義ファイル                             |
| ----------------- | -------------------------------------- | ---------------------------------------- |
| COO/PM            | バックログ管理、アサイン、レポート生成 | `agents/registry/coo_pm.yaml`            |
| Quality Authority | PASS/FAIL/WAIVER判定                   | `agents/registry/quality_authority.yaml` |
| Hiring Manager    | 採用プロセス管理                       | `agents/registry/hiring_manager.yaml`    |
| Reviewer          | コードレビュー                         | `agents/registry/reviewer.yaml`          |
| Merger            | ブランチマージ                         | `agents/registry/merger.yaml`            |

### エージェント定義

```yaml
# agents/registry/templates/agent_template.yaml
id: 'agent_id'
title: 'Agent Title'
responsibilities:
  - '責務1'
capabilities:
  - '能力1'
deliverables:
  - '成果物1'
quality_gates:
  - '品質基準1'
budget:
  tokens: 50000
  time_minutes: 60
persona: |
  ペルソナ説明
escalation:
  to: 'escalation_target'
  conditions:
    - 'エスカレーション条件'
```

## ドキュメント

| ドキュメント                                     | 説明                   |
| ------------------------------------------------ | ---------------------- |
| [MVP.md](MVP.md)                                 | MVPロードマップ        |
| [QUICKSTART.md](QUICKSTART.md)                   | クイックスタートガイド |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | 開発者向けガイド       |
| [docs/specs/](docs/specs/)                       | 機能仕様書             |
| [docs/architecture/](docs/architecture/)         | アーキテクチャ設計     |
| [docs/company/](docs/company/)                   | 会社ポリシー           |
| [tools/cli/README.md](tools/cli/README.md)       | CLI詳細                |
| [gui/web/README.md](gui/web/README.md)           | GUI詳細                |
| [infra/docker/README.md](infra/docker/README.md) | Docker詳細             |

## 技術スタック

| カテゴリ   | 技術                                  |
| ---------- | ------------------------------------- |
| 言語       | TypeScript 5.3+                       |
| ランタイム | Node.js 20+                           |
| GUI        | Next.js 14 (App Router), Tailwind CSS |
| テスト     | Vitest, Playwright, fast-check        |
| コンテナ   | Docker, Docker Compose                |
| AI         | Ollama (ローカルLLM)                  |

## ライセンス

MIT
