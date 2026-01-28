# AgentCompany アーキテクチャ概要

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                        Host Machine                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   CLI       │  │   GUI       │  │   Runtime           │  │
│  │ agentcompany│  │  Next.js    │  │ runs/logs/state     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │              Docker Workspace Container                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  │  │
│  │  │ Node.js 20  │  │  Python 3   │  │  install.sh   │  │  │
│  │  └─────────────┘  └─────────────┘  └───────────────┘  │  │
│  │                                                        │  │
│  │  Volume: /workspace ← Project Files                    │  │
│  │  User: agent (non-root)                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │                   Ollama (LLM)                         │  │
│  │                 localhost:11434                        │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 3ライン構造

| ライン     | 役割       | エージェント           |
| ---------- | ---------- | ---------------------- |
| Delivery   | 実行・納品 | Developer, QA Executor |
| Governance | 品質判定   | Quality Authority      |
| Talent     | 採用・評価 | Hiring Manager         |

## コンポーネント

### 1. CLI (`tools/cli/`)

- `agentcompany.ts`: メインエントリポイント
- `workflow.ts`: Plan → Run → Report 実行
- `validator.ts`: エージェント定義検証
- `deliverable-validator.ts`: 成果物検証

### 2. Adapters (`tools/adapters/`)

- `base.ts`: AI実行基盤インターフェース
- `ollama.ts`: Ollama実装

### 3. Installers (`tools/installers/`)

- `install.sh`: パッケージインストーラ
- `allowlist-parser.ts`: 許可リスト解析
- `log-writer.ts`: インストールログ出力

### 4. Docker (`infra/docker/`)

- `compose.yaml`: Workspace定義
- `images/base/`: ベースイメージ

### 5. Runtime (`runtime/`)

- `runs/`: 実行ログ・成果物
- `logs/install/`: インストールログ
- `cache/`: キャッシュ
- `state/`: ジョブ状態

## データフロー

```
1. チケット作成 (workflows/backlog/)
       ↓
2. COO/PM がプラン生成
       ↓
3. Docker Workspace で実行
       ↓
4. 成果物を runtime/runs/ に保存
       ↓
5. Quality Authority が判定 (PASS/FAIL/WAIVER)
       ↓
6. レポート生成
```

## セキュリティ境界

- **Docker隔離**: ホストとの分離
- **非rootユーザー**: 権限最小化
- **Allowlist**: 許可パッケージのみインストール可能
- **ネットワーク制限**: 必要なサービスのみ接続
