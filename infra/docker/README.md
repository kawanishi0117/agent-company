# Docker Workspace

## 概要

エージェントが安全に作業するための隔離されたDocker環境。

## クイックスタート

```bash
# ビルド
docker compose -f infra/docker/compose.yaml build

# 起動
docker compose -f infra/docker/compose.yaml up -d

# コンテナに入る
docker compose -f infra/docker/compose.yaml exec workspace bash

# 停止
docker compose -f infra/docker/compose.yaml down
```

## 構成

```
infra/docker/
├── compose.yaml           # Docker Compose設定
├── images/
│   └── base/
│       ├── Dockerfile     # ベースイメージ
│       ├── install.sh     # インストーラ（コピー用）
│       └── allowlist/     # 許可リスト（コピー用）
└── policies/              # セキュリティポリシー
```

## ベースイメージ

### 含まれる環境

- Node.js 20
- Python 3
- Git, curl, jq

## セキュリティ

- 非rootユーザー（`agent`）で実行
- ネットワーク隔離
- allowlist方式の依存管理

### E2Eテスト実行時の注意

E2Eテスト（Playwright）を実行する場合、`no-new-privileges`セキュリティオプションを無効化する必要があります。
これはPlaywrightのブラウザインストール時にsudoが必要なためです。

```yaml
# compose.yaml での設定（E2Eテスト時）
# security_opt:
#   - no-new-privileges:true  # コメントアウト
```

## ボリュームマウント

| ホスト             | コンテナ     | 用途             |
| ------------------ | ------------ | ---------------- |
| プロジェクトルート | `/workspace` | 作業ディレクトリ |
| `runtime/logs`     | `/logs`      | ログ出力         |

## パッケージインストール

### 許可されたパッケージのみインストール可能

```bash
# コンテナ内で実行
/usr/local/bin/install.sh npm typescript  # OK
/usr/local/bin/install.sh npm malicious   # 拒否
```

### 許可リスト

| ファイル                 | 用途               |
| ------------------------ | ------------------ |
| `/etc/allowlist/apt.txt` | システムパッケージ |
| `/etc/allowlist/pip.txt` | Pythonパッケージ   |
| `/etc/allowlist/npm.txt` | Node.jsパッケージ  |

## ログ

インストール操作は `/logs/install/` に記録される。

```json
{
  "timestamp": "2026-01-28T10:30:00Z",
  "type": "npm",
  "package": "typescript",
  "status": "success"
}
```

## トラブルシューティング

### ビルドエラー

```bash
# キャッシュクリアして再ビルド
docker compose -f infra/docker/compose.yaml build --no-cache
```

### パッケージインストール拒否

1. `/etc/allowlist/` を確認
2. 必要なら `tools/installers/allowlist/` に追加
3. イメージを再ビルド

### E2Eテスト実行

E2Eテストを実行する前に、Playwrightブラウザをインストールする必要があります：

```bash
# コンテナ起動
docker compose -f infra/docker/compose.yaml up -d

# Playwrightブラウザインストール
docker compose -f infra/docker/compose.yaml exec workspace npx playwright install chromium

# E2Eテスト実行
docker compose -f infra/docker/compose.yaml exec workspace npm run e2e
```

### 全品質ゲート実行

```bash
docker compose -f infra/docker/compose.yaml exec workspace npm run ci
```
