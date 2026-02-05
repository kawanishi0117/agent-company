# AgentCompany Worker Image
# ワーカーエージェント専用のDockerイメージ
#
# @see Requirement 5.2: THE Worker_Container SHALL be based on `infra/docker/images/worker/` image
# @see Requirement 5.3: THE Worker_Container SHALL clone the repository into container-local `/workspace`

FROM agentcompany/base:latest

# メタデータ
LABEL maintainer="AgentCompany"
LABEL description="Worker agent container image for AgentCompany"
LABEL version="1.0.0"

# 環境変数
ENV WORKER_ID=""
ENV RUN_ID=""
ENV GIT_REPO_URL=""
ENV GIT_BRANCH="main"
ENV WORKSPACE_PATH="/workspace"

# rootユーザーに切り替えて追加パッケージをインストール
USER root

# Git認証用のツールとSSHクライアントをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Git設定ディレクトリを作成
RUN mkdir -p /home/agent/.ssh \
    && chmod 700 /home/agent/.ssh \
    && chown -R agent:agent /home/agent/.ssh

# known_hostsファイルを事前に設定（GitHub, GitLab, Bitbucket）
RUN ssh-keyscan -t rsa github.com >> /home/agent/.ssh/known_hosts 2>/dev/null || true \
    && ssh-keyscan -t rsa gitlab.com >> /home/agent/.ssh/known_hosts 2>/dev/null || true \
    && ssh-keyscan -t rsa bitbucket.org >> /home/agent/.ssh/known_hosts 2>/dev/null || true \
    && chmod 644 /home/agent/.ssh/known_hosts \
    && chown agent:agent /home/agent/.ssh/known_hosts

# エントリポイントスクリプトをコピー
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# 結果出力ディレクトリを作成
RUN mkdir -p /results \
    && chown agent:agent /results

# 非rootユーザーに切り替え
USER agent

# 作業ディレクトリ設定
WORKDIR /workspace

# エントリポイント設定
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# デフォルトコマンド（無限待機）
CMD ["tail", "-f", "/dev/null"]
