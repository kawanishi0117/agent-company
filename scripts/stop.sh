#!/usr/bin/env bash
# ============================================================
# AgentCompany 一括停止スクリプト（Linux / macOS）
# 使い方:
#   ./scripts/stop.sh                # 全部停止
#   ./scripts/stop.sh --keep-docker  # Dockerは残す
# ============================================================

set -euo pipefail

KEEP_DOCKER=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --keep-docker) KEEP_DOCKER=true; shift ;;
    *) echo "不明なオプション: $1"; exit 1 ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$PROJECT_ROOT/runtime/.pids"

step()  { echo -e "\n\033[36m==> $1\033[0m"; }
ok()    { echo -e "  \033[32m✓ $1\033[0m"; }

# PIDファイルからプロセスを停止するヘルパー
stop_process() {
  local name="$1"
  local pid_file="$PID_DIR/${name}.pid"

  step "${name}を停止中..."
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      # まだ生きていたらSIGKILL
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
      ok "${name}停止（PID: $pid）"
    else
      ok "${name}は既に停止済み"
    fi
    rm -f "$pid_file"
  else
    ok "${name}のPIDファイルなし（起動されていない）"
  fi
}

# 1. GUI 停止
stop_process "gui"

# 2. Orchestrator Server 停止
stop_process "orchestrator"

# 3. Docker 停止
if [ "$KEEP_DOCKER" = false ]; then
  step "Dockerコンテナを停止中..."
  COMPOSE_FILE="$PROJECT_ROOT/infra/docker/compose.yaml"
  docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
  ok "Dockerコンテナ停止"
else
  step "Dockerコンテナの停止をスキップ（--keep-docker）"
  echo "  Ollamaコンテナは起動したままです"
fi

# ログクリーンアップ
step "ログファイルをクリーンアップ中..."
rm -f "$PID_DIR"/*.log 2>/dev/null || true
ok "ログファイル削除"

echo ""
echo -e "\033[32m========================================\033[0m"
echo -e "\033[32m  AgentCompany 停止完了\033[0m"
echo -e "\033[32m========================================\033[0m"
echo ""
