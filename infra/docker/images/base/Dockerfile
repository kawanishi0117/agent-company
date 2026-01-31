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

# システムパッケージインストール（Playwright依存含む）
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
    # Playwright依存パッケージ
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
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
