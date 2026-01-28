# AgentCompany Makefile
# 統一コマンドインターフェース

.PHONY: install lint test e2e ci clean help

# デフォルトターゲット
.DEFAULT_GOAL := help

# 依存インストール
install:
	npm install

# 静的解析
lint:
	npm run lint

# ユニットテスト
test:
	npm run test

# E2Eテスト（M2で実装）
e2e:
	npm run e2e

# 全品質ゲート実行
ci: lint test e2e
	@echo "✅ All quality gates passed"

# ビルド
build:
	npm run build

# クリーンアップ
clean:
	rm -rf dist node_modules coverage

# CLI実行
run:
	npm run cli -- run

# ヘルプ
help:
	@echo "AgentCompany - 利用可能なコマンド:"
	@echo ""
	@echo "  make install  - 依存パッケージをインストール"
	@echo "  make lint     - 静的解析を実行"
	@echo "  make test     - ユニットテストを実行"
	@echo "  make e2e      - E2Eテストを実行"
	@echo "  make ci       - 全品質ゲートを実行"
	@echo "  make build    - TypeScriptをビルド"
	@echo "  make clean    - ビルド成果物を削除"
	@echo "  make run      - CLIを実行"
	@echo ""
