# AgentCompany Makefile
# 統一コマンドインターフェース

.PHONY: install lint test e2e ci clean help up down status

# デフォルトターゲット
.DEFAULT_GOAL := help

# ============================================================
# ワンコマンド起動・停止
# ============================================================

# 全環境を一括起動（Docker + Ollama + Server + GUI）
up:
ifeq ($(OS),Windows_NT)
	@powershell -ExecutionPolicy Bypass -File scripts/start.ps1
else
	@bash scripts/start.sh
endif

# 全環境を一括停止
down:
ifeq ($(OS),Windows_NT)
	@powershell -ExecutionPolicy Bypass -File scripts/stop.ps1
else
	@bash scripts/stop.sh
endif

# 起動状態を確認
status:
	@echo "=== AgentCompany Status ==="
	@echo ""
	@echo "[Ollama]"
	@curl -s http://localhost:11434/api/tags > /dev/null 2>&1 && echo "  ✓ Running (http://localhost:11434)" || echo "  ✗ Not running"
	@echo ""
	@echo "[Orchestrator Server]"
	@curl -s http://localhost:3001/api/health > /dev/null 2>&1 && echo "  ✓ Running (http://localhost:3001)" || echo "  ✗ Not running"
	@echo ""
	@echo "[GUI]"
	@curl -s http://localhost:3000 > /dev/null 2>&1 && echo "  ✓ Running (http://localhost:3000)" || echo "  ✗ Not running"
	@echo ""

# ============================================================
# 開発コマンド
# ============================================================

# 依存インストール
install:
	npm install
	cd gui/web && npm install

# 静的解析
lint:
	npm run lint

# ユニットテスト
test:
	npm run test

# E2Eテスト
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
	rm -rf runtime/.pids

# CLI実行
run:
	npm run cli -- run

# ============================================================
# Docker操作
# ============================================================

# Docker環境のみ起動（Ollama + Workspace）
docker-up:
	docker compose -f infra/docker/compose.yaml up -d

# Docker環境のみ停止
docker-down:
	docker compose -f infra/docker/compose.yaml down

# Dockerログ表示
docker-logs:
	docker compose -f infra/docker/compose.yaml logs -f

# ============================================================
# ヘルプ
# ============================================================

help:
	@echo "AgentCompany - 利用可能なコマンド:"
	@echo ""
	@echo "  === ワンコマンド起動 ==="
	@echo "  make up       - 全環境を一括起動（Docker + Ollama + Server + GUI）"
	@echo "  make down     - 全環境を一括停止"
	@echo "  make status   - 起動状態を確認"
	@echo ""
	@echo "  === 開発 ==="
	@echo "  make install  - 依存パッケージをインストール"
	@echo "  make lint     - 静的解析を実行"
	@echo "  make test     - ユニットテストを実行"
	@echo "  make e2e      - E2Eテストを実行"
	@echo "  make ci       - 全品質ゲートを実行"
	@echo "  make build    - TypeScriptをビルド"
	@echo "  make clean    - ビルド成果物を削除"
	@echo "  make run      - CLIを実行"
	@echo ""
	@echo "  === Docker ==="
	@echo "  make docker-up    - Docker環境のみ起動"
	@echo "  make docker-down  - Docker環境のみ停止"
	@echo "  make docker-logs  - Dockerログ表示"
	@echo ""
