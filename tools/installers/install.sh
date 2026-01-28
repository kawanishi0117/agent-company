#!/bin/bash
#
# AgentCompany Package Installer
# allowlistに基づいてパッケージをインストールする
#
# Usage: install.sh <type> <package>
# Types: apt, pip, npm
#
# Exit codes:
#   0 - Success
#   1 - Rejected (not in allowlist)
#   2 - Installation failed
#   3 - Allowlist file not found
#   4 - Invalid package type
#   5 - Invalid package name

set -e

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST_DIR="${ALLOWLIST_DIR:-$SCRIPT_DIR/allowlist}"
LOG_DIR="${INSTALL_LOG_DIR:-/workspace/runtime/logs/install}"

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ログ出力関数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# ログファイルに記録
write_log() {
    local pkg_type="$1"
    local pkg_name="$2"
    local status="$3"
    local duration="$4"
    local error_msg="$5"
    
    # ログディレクトリ作成
    mkdir -p "$LOG_DIR"
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local log_file="$LOG_DIR/install-$(date +%Y%m%d).jsonl"
    
    # JSON形式でログ出力
    local log_entry="{\"timestamp\":\"$timestamp\",\"type\":\"$pkg_type\",\"package\":\"$pkg_name\",\"status\":\"$status\",\"duration_ms\":$duration"
    if [ -n "$error_msg" ]; then
        log_entry="$log_entry,\"error\":\"$error_msg\""
    fi
    log_entry="$log_entry}"
    
    echo "$log_entry" >> "$log_file"
}

# allowlistチェック
is_allowed() {
    local pkg_type="$1"
    local pkg_name="$2"
    local allowlist_file="$ALLOWLIST_DIR/${pkg_type}.txt"
    
    if [ ! -f "$allowlist_file" ]; then
        log_error "Allowlist file not found: $allowlist_file"
        return 3
    fi
    
    # コメントと空行を除いてパッケージ名を検索
    if grep -v '^#' "$allowlist_file" | grep -v '^$' | grep -qx "$pkg_name"; then
        return 0
    else
        return 1
    fi
}

# パッケージインストール
install_package() {
    local pkg_type="$1"
    local pkg_name="$2"
    local start_time=$(date +%s%3N)
    local status="success"
    local error_msg=""
    local exit_code=0
    
    # allowlistチェック
    if ! is_allowed "$pkg_type" "$pkg_name"; then
        local check_result=$?
        if [ $check_result -eq 3 ]; then
            status="failed"
            error_msg="Allowlist file not found"
            exit_code=3
        else
            status="rejected"
            error_msg="Package not in allowlist"
            exit_code=1
        fi
        
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        write_log "$pkg_type" "$pkg_name" "$status" "$duration" "$error_msg"
        
        log_error "REJECTED: $pkg_type/$pkg_name - $error_msg"
        return $exit_code
    fi
    
    log_info "Installing $pkg_type package: $pkg_name"
    
    # インストール実行
    case "$pkg_type" in
        apt)
            if ! sudo apt-get install -y "$pkg_name" 2>&1; then
                status="failed"
                error_msg="apt-get install failed"
                exit_code=2
            fi
            ;;
        pip)
            if ! pip install "$pkg_name" 2>&1; then
                status="failed"
                error_msg="pip install failed"
                exit_code=2
            fi
            ;;
        npm)
            if ! npm install "$pkg_name" 2>&1; then
                status="failed"
                error_msg="npm install failed"
                exit_code=2
            fi
            ;;
        *)
            status="failed"
            error_msg="Invalid package type: $pkg_type"
            exit_code=4
            ;;
    esac
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    write_log "$pkg_type" "$pkg_name" "$status" "$duration" "$error_msg"
    
    if [ $exit_code -eq 0 ]; then
        log_info "SUCCESS: $pkg_type/$pkg_name installed"
    else
        log_error "FAILED: $pkg_type/$pkg_name - $error_msg"
    fi
    
    return $exit_code
}

# メイン処理
main() {
    if [ $# -lt 2 ]; then
        echo "Usage: $0 <type> <package>"
        echo "Types: apt, pip, npm"
        echo ""
        echo "Examples:"
        echo "  $0 apt curl"
        echo "  $0 pip requests"
        echo "  $0 npm typescript"
        exit 4
    fi
    
    local pkg_type="$1"
    local pkg_name="$2"
    
    # タイプ検証
    case "$pkg_type" in
        apt|pip|npm)
            ;;
        *)
            log_error "Invalid package type: $pkg_type"
            log_error "Valid types: apt, pip, npm"
            exit 4
            ;;
    esac
    
    # パッケージ名検証
    if [ -z "$pkg_name" ]; then
        log_error "Package name cannot be empty"
        exit 5
    fi
    
    install_package "$pkg_type" "$pkg_name"
}

main "$@"
