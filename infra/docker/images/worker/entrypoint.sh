#!/bin/bash
# AgentCompany Worker Entrypoint Script
#
# ワーカーコンテナ起動時にリポジトリをcloneする
#
# @see Requirement 5.3: THE Worker_Container SHALL clone the repository into container-local `/workspace`

set -e

# ログ出力関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WORKER] $1"
}

log "Worker container starting..."
log "WORKER_ID: ${WORKER_ID:-not set}"
log "RUN_ID: ${RUN_ID:-not set}"

# Git設定
git config --global user.name "AgentCompany Worker"
git config --global user.email "worker@agentcompany.local"
git config --global init.defaultBranch main

# リポジトリURLが指定されている場合はclone
if [ -n "${GIT_REPO_URL}" ]; then
    log "Cloning repository: ${GIT_REPO_URL}"
    
    # 既存のファイルがある場合は削除
    if [ -d "${WORKSPACE_PATH}/.git" ]; then
        log "Existing repository found, removing..."
        rm -rf "${WORKSPACE_PATH}"/*
        rm -rf "${WORKSPACE_PATH}"/.[!.]*
    fi
    
    # リポジトリをclone
    # 認証情報は環境変数またはマウントされた認証ファイルから取得
    if [ -n "${GIT_TOKEN}" ]; then
        # トークン認証の場合
        log "Using token authentication"
        
        # URLにトークンを埋め込む（HTTPS）
        REPO_URL_WITH_TOKEN=$(echo "${GIT_REPO_URL}" | sed "s|https://|https://${GIT_TOKEN}@|")
        git clone --branch "${GIT_BRANCH:-main}" --single-branch "${REPO_URL_WITH_TOKEN}" "${WORKSPACE_PATH}" 2>&1 || {
            log "ERROR: Failed to clone repository"
            exit 1
        }
        
        # トークンをリモートURLから削除（セキュリティ）
        cd "${WORKSPACE_PATH}"
        git remote set-url origin "${GIT_REPO_URL}"
    elif [ -f "/run/secrets/deploy_key" ]; then
        # Deploy key認証の場合
        log "Using deploy key authentication"
        
        # SSH設定
        mkdir -p ~/.ssh
        cp /run/secrets/deploy_key ~/.ssh/id_rsa
        chmod 600 ~/.ssh/id_rsa
        
        git clone --branch "${GIT_BRANCH:-main}" --single-branch "${GIT_REPO_URL}" "${WORKSPACE_PATH}" 2>&1 || {
            log "ERROR: Failed to clone repository"
            exit 1
        }
    else
        # 認証なし（パブリックリポジトリ）
        log "Using no authentication (public repository)"
        git clone --branch "${GIT_BRANCH:-main}" --single-branch "${GIT_REPO_URL}" "${WORKSPACE_PATH}" 2>&1 || {
            log "ERROR: Failed to clone repository"
            exit 1
        }
    fi
    
    log "Repository cloned successfully"
    cd "${WORKSPACE_PATH}"
    log "Current branch: $(git branch --show-current)"
    log "Latest commit: $(git log -1 --oneline)"
else
    log "No GIT_REPO_URL specified, skipping clone"
fi

log "Worker container ready"

# メインコマンドを実行
exec "$@"
