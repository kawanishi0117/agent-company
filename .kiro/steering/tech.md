---
inclusion: always
---

# 技術スタック

## 実行基盤

- **コンテナ**: Docker / Docker Compose
- **隔離**: seccomp, ネットワーク制限

## GUI

- **フレームワーク**: Next.js
- **言語**: TypeScript
- **スタイル**: Tailwind CSS

## CLI

- **言語**: TypeScript (Node.js)
- **場所**: `tools/cli/`

## 品質ゲート

- **静的解析**: ESLint, Prettier
- **テスト**: Vitest / Jest
- **E2E**: Playwright

## 依存管理

- **方式**: allowlist（許可リスト）
- **場所**: `tools/installers/allowlist/`
- **インストーラ**: `tools/installers/install.sh`

## ビルド・実行コマンド

```bash
# 依存インストール
make install

# 静的解析
make lint

# ユニットテスト
make test

# E2Eテスト
make e2e

# 全ゲート実行
make ci

# Docker起動
docker compose -f infra/docker/compose.yaml up

# CLI実行
npx ts-node tools/cli/agentcompany.ts <command>
```

## 設定ファイル

| ファイル | 用途 |
|---------|------|
| `infra/docker/compose.yaml` | Docker Compose設定 |
| `tools/installers/allowlist/*.txt` | 許可パッケージリスト |
| `Makefile` | 統一コマンド定義 |
