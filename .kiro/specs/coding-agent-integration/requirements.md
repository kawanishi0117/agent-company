# Requirements Document: Coding Agent Integration

## Introduction

本ドキュメントは、外部コーディングエージェントCLI（opencode、Claude Code、Kiro CLI）をAgentCompanyのワーカーとして統合する機能の要件を定義する。

AgentCompanyはオーケストレーション層として機能し、実際のコーディング作業は外部CLIエージェントに委譲する。これにより、高性能なAIモデル（Claude、GPT-4等）を活用した実用的なコード生成・修正が可能になる。

## Glossary

- **Coding_Agent_Adapter**: 外部コーディングエージェントCLIとの通信を抽象化するアダプタ
- **opencode**: `opencode run "prompt"` で実行するCLIコーディングエージェント
- **Claude_Code**: `claude -p "prompt"` で実行するAnthropic製CLIエージェント
- **Kiro_CLI**: `kiro chat -p "prompt"` で実行するAWS製CLIエージェント
- **Workspace_Manager**: Gitリポジトリのclone・ブランチ管理を行うコンポーネント
- **Coding_Task**: コーディングエージェントに渡す作業指示

## Requirements

### Requirement 1: CodingAgentAdapterインターフェース

**User Story:** As a システム, I want to 複数のコーディングエージェントCLIを統一的に扱える, so that エージェントの追加・切り替えが容易にできる.

#### Acceptance Criteria

1. THE CodingAgentAdapter interface SHALL define: name, execute(), isAvailable() methods
2. THE execute() method SHALL accept: workingDirectory, prompt, systemPrompt, model, timeout options
3. THE execute() method SHALL return: success, output, exitCode, durationMs, filesChanged
4. THE isAvailable() method SHALL check if the CLI tool is installed and accessible
5. THE System SHALL support adding new adapters by implementing the interface

### Requirement 2: opencode Adapter

**User Story:** As a システム, I want to opencodeをワーカーとして使える, so that opencode対応モデルでコーディングできる.

#### Acceptance Criteria

1. THE OpenCodeAdapter SHALL execute `opencode run "<prompt>"` as a subprocess
2. THE OpenCodeAdapter SHALL support `--format json` for structured output
3. THE OpenCodeAdapter SHALL support `--model` flag for model selection
4. THE OpenCodeAdapter SHALL handle timeout and process termination gracefully
5. THE OpenCodeAdapter SHALL capture stdout/stderr and parse results

### Requirement 3: Claude Code Adapter

**User Story:** As a システム, I want to Claude Codeをワーカーとして使える, so that Claude APIを活用したコーディングができる.

#### Acceptance Criteria

1. THE ClaudeCodeAdapter SHALL execute `claude -p "<prompt>"` as a subprocess
2. THE ClaudeCodeAdapter SHALL support `--output-format json` for structured output
3. THE ClaudeCodeAdapter SHALL support `--allowedTools` for tool restriction
4. THE ClaudeCodeAdapter SHALL support `--add-dir` for working directory specification
5. THE ClaudeCodeAdapter SHALL handle `--dangerously-skip-permissions` flag based on configuration

### Requirement 4: Kiro CLI Adapter

**User Story:** As a システム, I want to Kiro CLIをワーカーとして使える, so that Kiroの機能を活用したコーディングができる.

#### Acceptance Criteria

1. THE KiroCliAdapter SHALL execute `kiro chat -p "<prompt>"` as a subprocess
2. THE KiroCliAdapter SHALL support custom agent configuration
3. THE KiroCliAdapter SHALL support MCP and steering integration
4. THE KiroCliAdapter SHALL handle timeout and process termination gracefully

### Requirement 5: CodingAgentRegistry

**User Story:** As a システム, I want to 利用可能なコーディングエージェントを自動検出できる, so that 設定なしで使えるエージェントを把握できる.

#### Acceptance Criteria

1. THE CodingAgentRegistry SHALL detect installed coding agents on system startup
2. THE CodingAgentRegistry SHALL provide getAvailableAgents() returning list of available adapters
3. THE CodingAgentRegistry SHALL provide getAdapter(name) to retrieve specific adapter
4. THE CodingAgentRegistry SHALL support priority-based agent selection with fallback
5. THE CodingAgentRegistry SHALL cache availability results with configurable TTL

### Requirement 6: WorkspaceManager

**User Story:** As a システム, I want to 作業ディレクトリを自動管理できる, so that エージェントが安全に作業できる環境を提供できる.

#### Acceptance Criteria

1. THE WorkspaceManager SHALL clone repositories to isolated working directories
2. THE WorkspaceManager SHALL create task branches following `agent/<ticket-id>-<description>` format
3. THE WorkspaceManager SHALL support both existing repositories (git clone) and new projects (git init)
4. FOR new projects, THE WorkspaceManager SHALL optionally create GitHub repository via `gh repo create`
5. THE WorkspaceManager SHALL clean up working directories after task completion
6. THE WorkspaceManager SHALL manage working directories under `runtime/workspaces/<project-id>/`

### Requirement 7: WorkerAgent統合

**User Story:** As a システム, I want to WorkerAgentがCodingAgentAdapterを使って作業できる, so that 実際のコーディング作業が自律的に行われる.

#### Acceptance Criteria

1. THE WorkerAgent SHALL use CodingAgentAdapter instead of direct Ollama calls for coding tasks
2. THE WorkerAgent SHALL select appropriate coding agent based on task type and configuration
3. THE WorkerAgent SHALL pass task context (ticket info, acceptance criteria) as prompt to coding agent
4. THE WorkerAgent SHALL collect results (changed files, output) from coding agent execution
5. THE existing Ollama adapter SHALL remain available for non-coding tasks (meetings, proposals)

### Requirement 8: GUI設定画面

**User Story:** As a ユーザー, I want to GUIでコーディングエージェントを設定できる, so that 使用するエージェントやモデルを選択できる.

#### Acceptance Criteria

1. THE Settings page SHALL display available coding agents with installation status
2. THE Settings page SHALL allow selection of preferred coding agent
3. THE Settings page SHALL allow configuration of agent-specific options (model, timeout)
4. THE Settings page SHALL provide a "Test Connection" button for each agent
5. WHEN settings are saved, THE System SHALL validate and apply without restart
