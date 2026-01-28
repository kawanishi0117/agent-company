# AgentCompany Base Image
# Node.js + Python環境、非rootユーザーで実行

FROM node:20-slim

# メタデータ
LABEL maintainer="AgentCompany"
LABEL description="Base image for AgentCompany workspace"

# 環境変数
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=development
ENV INSTALL_LOG_DIR=/workspace/runtime/logs/install

# システムパッケージインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    git \
    jq \
    vim \
    wget \
    ca-certificates \
    gnupg \
    sudo \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 非rootユーザー作成
RUN useradd -m -s /bin/bash -G sudo agent \
    && echo "agent ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# インストーラディレクトリ作成
RUN mkdir -p /usr/local/agentcompany/installers/allowlist

# allowlistファイルをコピー
COPY allowlist/ /usr/local/agentcompany/installers/allowlist/

# インストーラスクリプトをコピー
COPY install.sh /usr/local/agentcompany/installers/install.sh
RUN chmod +x /usr/local/agentcompany/installers/install.sh

# PATHに追加
ENV PATH="/usr/local/agentcompany/installers:${PATH}"
ENV ALLOWLIST_DIR="/usr/local/agentcompany/installers/allowlist"

# 作業ディレクトリ作成
RUN mkdir -p /workspace/runtime/logs/install \
    && chown -R agent:agent /workspace

# 作業ディレクトリ設定
WORKDIR /workspace

# 非rootユーザーに切り替え
USER agent

# デフォルトコマンド
CMD ["/bin/bash"]
