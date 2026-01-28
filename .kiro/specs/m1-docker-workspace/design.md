# Design Document: M1 - Docker Workspace + 許可リスト

## Overview

AgentCompanyのエージェントが安全に作業できる隔離されたDocker環境を構築する。allowlist方式で依存パッケージを管理し、許可されていないパッケージのインストールを拒否する。すべてのインストール操作はログに記録され、監査可能な状態を維持する。

## Architecture

```mermaid
graph TB
    subgraph Host["ホストマシン"]
        DC[Docker Compose]
        PF[Project Files]
        AL[Allowlist Files]
        IL[Install Logs]
    end
    
    subgraph Container["Workspace Container"]
        BI[Base Image]
        IS[install.sh]
        NR[Node.js Runtime]
        PR[Python Runtime]
        WD[/workspace]
    end
    
    DC -->|起動| Container
    PF -->|volume mount| WD
    AL -->|copy| IS
    IS -->|write| IL
    
    subgraph Allowlist["Allowlist Files"]
        APT[apt.txt]
        PIP[pip.txt]
        NPM[npm.txt]
    end
```

## Components and Interfaces

### 1. Docker Compose Configuration

```yaml
# infra/docker/compose.yaml
services:
  workspace:
    build:
      context: ./images/base
      dockerfile: Dockerfile
    volumes:
      - ../../..:/workspace:rw
      - ../../../runtime/logs:/logs:rw
    working_dir: /workspace
    user: agent
    networks:
      - workspace-net
    environment:
      - NODE_ENV=development

networks:
  workspace-net:
    driver: bridge
```

### 2. Base Image Dockerfile

```dockerfile
# infra/docker/images/base/Dockerfile
FROM node:20-slim

# システムパッケージインストール
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 非rootユーザー作成
RUN useradd -m -s /bin/bash agent

# インストーラとallowlistをコピー
COPY --chown=agent:agent install.sh /usr/local/bin/install.sh
COPY --chown=agent:agent allowlist/ /etc/allowlist/

RUN chmod +x /usr/local/bin/install.sh

# 作業ディレクトリ設定
WORKDIR /workspace

USER agent
```

### 3. Installer Script Interface

```bash
# tools/installers/install.sh
# Usage: install.sh <type> <package>
# Types: apt, pip, npm
# Returns: 0 on success, 1 on rejection, 2 on failure

install_package() {
    local pkg_type=$1
    local pkg_name=$2
    
    # Allowlist検証
    if ! is_allowed "$pkg_type" "$pkg_name"; then
        log_install "$pkg_type" "$pkg_name" "rejected"
        return 1
    fi
    
    # インストール実行
    case "$pkg_type" in
        apt) sudo apt-get install -y "$pkg_name" ;;
        pip) pip install "$pkg_name" ;;
        npm) npm install "$pkg_name" ;;
    esac
    
    # 結果ログ
    if [ $? -eq 0 ]; then
        log_install "$pkg_type" "$pkg_name" "success"
        return 0
    else
        log_install "$pkg_type" "$pkg_name" "failed"
        return 2
    fi
}
```

### 4. Allowlist File Format

```text
# tools/installers/allowlist/apt.txt
curl
git
jq
vim

# tools/installers/allowlist/pip.txt
requests
pytest
black
flake8

# tools/installers/allowlist/npm.txt
typescript
eslint
prettier
vitest
```

### 5. Install Log Format

```json
{
  "timestamp": "2026-01-28T10:30:00Z",
  "type": "npm",
  "package": "typescript",
  "status": "success",
  "duration_ms": 1234
}
```

## Data Models

### InstallRequest

```typescript
interface InstallRequest {
  type: 'apt' | 'pip' | 'npm';
  package: string;
}
```

### InstallResult

```typescript
interface InstallResult {
  timestamp: string;
  type: 'apt' | 'pip' | 'npm';
  package: string;
  status: 'success' | 'rejected' | 'failed';
  duration_ms?: number;
  error?: string;
}
```

### AllowlistConfig

```typescript
interface AllowlistConfig {
  apt: string[];
  pip: string[];
  npm: string[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Allowlist Enforcement

*For any* package installation request, if the package is NOT in the corresponding allowlist, the installer SHALL reject the request and return exit code 1.

**Validates: Requirements 4.3**

### Property 2: Allowlist Acceptance

*For any* package installation request, if the package IS in the corresponding allowlist, the installer SHALL attempt to install it (not reject it).

**Validates: Requirements 4.2**

### Property 3: Log Completeness

*For any* package installation request (whether successful, rejected, or failed), the installer SHALL write a log entry containing timestamp, package type, package name, and status.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5**

### Property 4: Allowlist Format Consistency

*For any* valid allowlist file, each line SHALL contain exactly one package name (ignoring empty lines and comments starting with #).

**Validates: Requirements 3.5**

## Error Handling

| エラー状況 | 対応 |
|-----------|------|
| Allowlist外パッケージ | 拒否、exit code 1、ログに"rejected"記録 |
| インストール失敗 | exit code 2、ログに"failed"とエラーメッセージ記録 |
| Allowlistファイル不在 | エラーメッセージ出力、exit code 3 |
| 無効なパッケージタイプ | エラーメッセージ出力、exit code 4 |
| ログディレクトリ書き込み不可 | stderrに警告出力、インストール自体は続行 |

## Testing Strategy

### Unit Tests
- Allowlist読み込みテスト
- パッケージ名検証テスト
- ログフォーマットテスト

### Property-Based Tests
- Property 1: ランダムなパッケージ名でallowlist外は必ず拒否
- Property 2: allowlist内パッケージは拒否されない
- Property 3: すべての操作でログが出力される
- Property 4: allowlistファイルのパース一貫性

### Integration Tests
- Docker Compose起動テスト
- ボリュームマウント検証
- 実際のパッケージインストール（allowlist内）
- 拒否動作検証（allowlist外）

