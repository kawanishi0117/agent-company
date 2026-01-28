# Requirements Document

## Introduction

AgentCompanyの「Docker Workspace + 許可リスト」を構築する。エージェントが安全に作業できる隔離されたDocker環境を提供し、allowlist方式で依存パッケージを管理する。許可されていないパッケージのインストールを拒否し、すべてのインストール操作をログに記録する。

## Glossary

- **Workspace**: エージェントが作業を行う隔離されたDocker環境
- **Allowlist**: インストールを許可するパッケージのリスト（apt.txt, pip.txt, npm.txt）
- **Installer**: allowlistに基づいてパッケージをインストールするスクリプト
- **Base_Image**: すべてのWorkspaceの基盤となるDockerイメージ
- **Install_Log**: パッケージインストールの成功/失敗を記録するログファイル

## Requirements

### Requirement 1: Docker Compose設定

**User Story:** As a システム管理者, I want to Docker Compose設定を作成する, so that 一貫した方法でWorkspace環境を起動できる.

#### Acceptance Criteria

1. THE Docker_Compose configuration SHALL be stored in `infra/docker/compose.yaml`
2. THE Docker_Compose SHALL define a workspace service with volume mounts for project files
3. THE Docker_Compose SHALL configure network isolation for the workspace
4. WHEN `docker compose up` is executed, THE System SHALL start the workspace container

### Requirement 2: ベースイメージ作成

**User Story:** As a システム管理者, I want to ベースDockerイメージを作成する, so that すべてのWorkspaceが同じ基盤で動作する.

#### Acceptance Criteria

1. THE Base_Image Dockerfile SHALL be stored in `infra/docker/images/base/Dockerfile`
2. THE Base_Image SHALL include Node.js runtime environment
3. THE Base_Image SHALL include Python runtime environment
4. THE Base_Image SHALL copy the installer script into the image
5. THE Base_Image SHALL set appropriate security configurations (non-root user)

### Requirement 3: Allowlist定義

**User Story:** As a システム管理者, I want to 許可パッケージリストを定義する, so that インストール可能なパッケージを制御できる.

#### Acceptance Criteria

1. THE Allowlist files SHALL be stored in `tools/installers/allowlist/`
2. THE Allowlist SHALL include `apt.txt` for system packages
3. THE Allowlist SHALL include `pip.txt` for Python packages
4. THE Allowlist SHALL include `npm.txt` for Node.js packages
5. THE Allowlist files SHALL use one package name per line format

### Requirement 4: インストーラスクリプト

**User Story:** As a 開発者, I want to allowlistに基づいてパッケージをインストールする, so that 許可されたパッケージのみを安全にインストールできる.

#### Acceptance Criteria

1. THE Installer script SHALL be stored in `tools/installers/install.sh`
2. WHEN a package is in the allowlist, THE Installer SHALL install it successfully
3. WHEN a package is NOT in the allowlist, THE Installer SHALL reject the installation with an error message
4. THE Installer SHALL support package type argument (apt, pip, npm)
5. THE Installer SHALL validate package names against the corresponding allowlist file

### Requirement 5: インストールログ出力

**User Story:** As a システム管理者, I want to インストール操作をログに記録する, so that 何がインストールされたか追跡できる.

#### Acceptance Criteria

1. THE Installer SHALL write logs to `runtime/logs/install/` directory
2. THE Install_Log SHALL include timestamp, package name, package type, and result (success/rejected/failed)
3. WHEN installation succeeds, THE Installer SHALL log with status "success"
4. WHEN installation is rejected (not in allowlist), THE Installer SHALL log with status "rejected"
5. WHEN installation fails (in allowlist but error), THE Installer SHALL log with status "failed" and include error message

### Requirement 6: Workspace起動検証

**User Story:** As a 開発者, I want to Workspace環境が正しく動作することを確認する, so that エージェントが安全に作業できる.

#### Acceptance Criteria

1. WHEN the workspace container starts, THE System SHALL have access to project files via volume mount
2. WHEN the workspace container starts, THE System SHALL be able to run the installer script
3. THE Workspace SHALL run as a non-root user for security
4. THE Workspace SHALL have network access restricted to necessary services only

