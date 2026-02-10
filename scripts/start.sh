#!/usr/bin/env bash
# ============================================================
# AgentCompany ワンコマンド起動スクリプト（Linux / macOS）
# 使い方:
#   ./scripts/start.sh                    # 全部起動
#   ./scripts/start.sh --skip-docker      # Docker不要（ローカルOllama使用）
#   ./scripts/start.sh --model codellama  # モデル指定
# ============================================================

set -euo pipefail

# デフォルト設定
MODEL="llama3.2:1b"
GUI_PORT=3000
SERVER_PORT=3001
SKIP_DOCKER=false
SKIP_GUI=false
SKIP_SERVER=false

# 引数パース
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-docker)  SKIP_DOCKER=true; shift ;;
    --skip-gui)     SKIP_GUI=true; shift ;;
    --skip-server)  SKIP_SERVER=true; shift ;;
    --model)        MODEL="$2"; shift 2 ;;
    --gui-port)     GUI_PORT="$2"; shift 2 ;;
    --server-port)  SERVER_PORT="$2"; shift 2 ;;
    *) echo "不明なオプション: $1"; exit 1 ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$PROJECT_ROOT/runtime/.pids"
mkdir -p "$PID_DIR"

# ユーティリティ
step()  { echo -e "\n\033[36m==> $1\033[0m"; }
ok()    { echo -e "  \033[32m✓ $1\033[0m"; }
warn()  { echo -e "  \033[33m! $1\033[0m"; }
fail()  { echo -e "  \033[31m✗ $1\033[0m"; }

# ============================================================
# 1. Docker (Ollama) 起動
# ============================================================

if [ "$SKIP_DOCKER" = false ]; then
  step "Docker環境を起動中..."

  if ! command -v docker &> /dev/null; then
    fail "Dockerが見つかりません。Docker Desktopをインストールしてください。"
    echo "  https://www.docker.com/products/docker-desktop/"
    echo "  Dockerなしで起動: ./scripts/start.sh --skip-docker"
    exit 1
  fi

  COMPOSE_FILE="$PROJECT_ROOT/infra/docker/compose.yaml"
  docker compose -f "$COMPOSE_FILE" up -d ollama 2>/dev/null || true
  ok "Ollamaコンテナ起動"

  # ヘルスチェック待機
  step "Ollamaの起動を待機中..."
  MAX_WAIT=60
  WAITED=0
  while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
      break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    printf "."
  done
  echo ""

  if [ $WAITED -ge $MAX_WAIT ]; then
    fail "Ollamaが起動しませんでした（${MAX_WAIT}秒タイムアウト）"
    exit 1
  fi
  ok "Ollama起動確認"

  # モデルインストール
  step "AIモデルを確認中..."
  INSTALLED=$(curl -s http://localhost:11434/api/tags | grep -o "\"name\":\"[^\"]*\"" | grep -c "$MODEL" || true)

  if [ "$INSTALLED" -eq 0 ]; then
    step "モデル '$MODEL' をインストール中（初回のみ、数分かかります）..."
    docker exec agentcompany-ollama ollama pull "$MODEL" && \
      ok "モデル '$MODEL' インストール完了" || \
      warn "モデルのインストールに失敗。後で手動実行: docker exec agentcompany-ollama ollama pull $MODEL"
  else
    ok "モデル '$MODEL' は既にインストール済み"
  fi
else
  step "Docker起動をスキップ（--skip-docker）"
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    ok "ローカルOllamaを検出"
  else
    warn "ローカルOllamaが見つかりません。ollama serve を実行してください。"
  fi
fi

# ============================================================
# 2. 依存パッケージの確認
# ============================================================

step "依存パッケージを確認中..."

if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
  step "ルートの依存パッケージをインストール中..."
  (cd "$PROJECT_ROOT" && npm install --silent)
  ok "ルート依存パッケージインストール完了"
else
  ok "ルート依存パッケージ確認済み"
fi

GUI_DIR="$PROJECT_ROOT/gui/web"
if [ ! -d "$GUI_DIR/node_modules" ]; then
  step "GUI依存パッケージをインストール中..."
  (cd "$GUI_DIR" && npm install --silent)
  ok "GUI依存パッケージインストール完了"
else
  ok "GUI依存パッケージ確認済み"
fi

# ============================================================
# 3. Orchestrator Server 起動
# ============================================================

if [ "$SKIP_SERVER" = false ]; then
  step "Orchestrator Serverを起動中（ポート $SERVER_PORT）..."

  PID_FILE="$PID_DIR/orchestrator.pid"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    ok "Orchestrator Serverは既に起動中（PID: $(cat "$PID_FILE")）"
  else
    (cd "$PROJECT_ROOT" && \
      npx tsx tools/cli/agentcompany.ts server --port "$SERVER_PORT" \
        > "$PID_DIR/orchestrator.log" 2>&1 &
      echo $! > "$PID_FILE")
    sleep 2
    ok "Orchestrator Server起動（PID: $(cat "$PID_FILE")）"
  fi
else
  step "Orchestrator Server起動をスキップ（--skip-server）"
fi

# ============================================================
# 4. GUI (Next.js) 起動
# ============================================================

if [ "$SKIP_GUI" = false ]; then
  step "GUI（Next.js）を起動中（ポート $GUI_PORT）..."

  export ORCHESTRATOR_API_URL="http://localhost:${SERVER_PORT}"
  GUI_PID_FILE="$PID_DIR/gui.pid"

  if [ -f "$GUI_PID_FILE" ] && kill -0 "$(cat "$GUI_PID_FILE")" 2>/dev/null; then
    ok "GUIは既に起動中（PID: $(cat "$GUI_PID_FILE")）"
  else
    (cd "$GUI_DIR" && \
      npx next dev --port "$GUI_PORT" \
        > "$PID_DIR/gui.log" 2>&1 &
      echo $! > "$GUI_PID_FILE")
    sleep 3
    ok "GUI起動（PID: $(cat "$GUI_PID_FILE")）"
  fi
else
  step "GUI起動をスキップ（--skip-gui）"
fi

# ============================================================
# 完了メッセージ
# ============================================================

echo ""
echo -e "\033[32m========================================\033[0m"
echo -e "\033[32m  AgentCompany 起動完了!\033[0m"
echo -e "\033[32m========================================\033[0m"
echo ""
echo "  GUI:                 http://localhost:${GUI_PORT}"
echo "  Orchestrator API:    http://localhost:${SERVER_PORT}"
echo "  Ollama API:          http://localhost:11434"
echo "  AIモデル:            $MODEL"
echo ""
echo -e "  停止: make down  または  ./scripts/stop.sh"
echo -e "  ログ: runtime/.pids/*.log"
echo ""
