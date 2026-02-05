# Requirements Document

## Introduction

AgentCompanyの「エージェント実行エンジン」機能を構築する。本機能は「会社」のコンセプトに基づき、社長（ユーザー）からの大雑把な指示を上司エージェント（マネージャー）が受け取り、依存関係のない独立したタスクに分解して部下エージェント（ワーカー）に並列で割り振る。各ワーカーは専用のDockerコンテナで作業し、完了後はコンテナをリセットする。Gitを使ったブランチ管理、コンフリクト時のレビューエージェント対応、マージ承認エージェントによる最終確認を経て、品質ゲートを通過した成果物をQuality Authorityが判定する。

## Glossary

- **President**: 社長（ユーザー）。大雑把な指示を出す
- **Manager_Agent**: 上司エージェント。タスクの分解、ワーカーへの割り振り、進捗管理を担当
- **Worker_Agent**: 部下エージェント。実際のコード生成、ファイル操作を実行
- **Reviewer_Agent**: レビューエージェント。コンフリクト解決、コードレビューを担当
- **Merger_Agent**: マージ承認エージェント。ブランチのマージを最終承認
- **Execution_Engine**: エージェントがAIを使用してタスクを実行するコアエンジン
- **AI_Adapter**: AI（Ollama、Gemini、Kiro CLI等）との通信を抽象化するアダプタ
- **Task_Decomposer**: 大雑把な指示を独立したサブチケットに分解するコンポーネント
- **Worker_Pool**: 利用可能なワーカーエージェントのプール
- **Worker_Container**: 各ワーカー専用の隔離されたDockerコンテナ
- **Git_Manager**: Gitリポジトリのclone、ブランチ、コミット、プッシュを管理
- **Process_Monitor**: 長時間実行コマンドの監視と制御
- **Agent_Bus**: エージェント間通信を担当するメッセージバス（pull/pollモデル）
- **System_Config**: GUIから設定可能なシステム設定
- **Container_Runtime_Abstraction**: DoD/Rootless/DINDを切り替え可能にする抽象化レイヤー
- **DoD (Docker-outside-of-Docker)**: ホストのDockerデーモンをdocker.sock経由で操作する方式
- **DIND (Docker-in-Docker)**: コンテナ内で別のDockerデーモンを起動する方式（CI向け）
- **Message_Queue_Abstraction**: ファイル/SQLite/Redisを切り替え可能にする通信抽象化

## Design Constraints and Safety Notes

### コンテナ隔離に関する制約

1. **DIND は明示的オプトインのみ**: デフォルトは DoD。DIND は CI 環境など必要な場合のみ `container_runtime: dind` で有効化
2. **docker.sock アクセス制限**: DoD 使用時、ワーカーが実行可能な Docker コマンドは allowlist で制限（run, stop, rm, logs, inspect のみ）
3. **ワーカー間の隔離保証**: ワーカー A がワーカー B のファイル・ネットワークにアクセスできないことをテストで検証

### Git 認証に関する制約

1. **ホスト鍵の直接マウント禁止**: `~/.ssh/` をコンテナにマウントしない
2. **推奨方式**: Deploy key（読み取り専用）またはリポジトリスコープトークン
3. **開発時のみ許可**: SSH agent forwarding は明示的オプトインで開発環境のみ

### エージェント間通信に関する制約

1. **ネットワークポート不要**: ワーカーは受信ポートを持たない（pull/poll モデル）
2. **デフォルトはファイルベース**: Docker networking は使用しない（Windows/WSL2 互換性のため）

## Requirements

### Requirement 1: 会社組織としてのエージェント階層

**User Story:** As a 社長（ユーザー）, I want to 大雑把な指示を出すだけで上司が適切に分解・割り振りしてくれる, so that 細かい指示を出さなくても会社として作業が進む.

#### Acceptance Criteria

1. THE System SHALL implement President → Manager_Agent → Worker_Agent hierarchy
2. WHEN President submits a high-level task, THE Manager_Agent SHALL receive and analyze it
3. THE Manager_Agent SHALL decompose tasks into independent sub-tasks with no dependencies
4. THE Manager_Agent SHALL assign sub-tasks to Worker_Agents for parallel execution
5. THE Manager_Agent SHALL monitor Worker_Agent progress and provide support when failures occur
6. THE Manager_Agent SHALL be able to dynamically hire/fire Worker_Agents based on workload
7. THE System SHALL support multiple Manager_Agents for different domains (e.g., Frontend Manager, Backend Manager)
8. THE hierarchy SHALL be defined in `agents/registry/` with `role: manager | worker | reviewer | merger` field

### Requirement 2: チケット分解と独立タスク生成

**User Story:** As a Manager_Agent, I want to 大雑把な指示を依存関係のない独立タスクに分解する, so that ワーカーが並列で効率的に作業できる.

#### Acceptance Criteria

1. WHEN a high-level ticket is received, THE Task_Decomposer SHALL analyze and split into independent sub-tickets
2. THE sub-tickets SHALL have no dependencies on each other (parallelizable)
3. IF dependencies are unavoidable, THE Manager_Agent SHALL sequence them appropriately
4. THE sub-tickets SHALL have `parent_id` field referencing the original ticket
5. THE sub-tickets SHALL be saved to `workflows/backlog/` with naming `<parent-id>-<sub-id>.md`
6. WHEN all sub-tickets complete, THE parent ticket status SHALL update to `review`
7. THE ticket hierarchy SHALL be queryable via `npx tsx tools/cli/agentcompany.ts ticket tree <ticket-id>`
8. THE decomposition logic SHALL be in `tools/cli/lib/execution/decomposer.ts`

### Requirement 3: Git統合とブランチ管理

**User Story:** As a Worker_Agent, I want to Gitリポジトリをcloneしてブランチで作業しコミット・プッシュする, so that 変更履歴を適切に管理できる.

#### Acceptance Criteria

1. THE Git_Manager SHALL support multiple credential injection methods:
   - Deploy key (read-only, recommended for CI)
   - Repository-scoped token (GitHub PAT, GitLab token)
   - SSH agent forwarding (development only, with explicit opt-in)
2. THE Git_Manager SHALL NOT directly mount `~/.ssh/` into Worker_Container
3. WHEN Worker_Agent starts, THE Git_Manager SHALL clone the target repository into container-local storage
4. THE Git_Manager SHALL create feature branch named `agent/<ticket-id>-<description>`
5. WHEN Worker_Agent completes modifications, THE Git_Manager SHALL stage and commit
6. THE commit message SHALL follow format: `[<ticket-id>] <description>`
7. WHEN task completes, THE Git_Manager SHALL push the branch to remote
8. THE Git operations SHALL be logged to `runtime/runs/<run-id>/git.log`
9. THE Git_Manager SHALL validate `known_hosts` before connecting to remote
10. THE Git_Manager SHALL be implemented in `tools/cli/lib/execution/git-manager.ts`

### Requirement 4: コンフリクト解決とマージ戦略

**User Story:** As a Reviewer_Agent, I want to Gitコンフリクトを解決しコードをレビューする, so that 品質を保ちながら統合ブランチにマージできる.

#### Acceptance Criteria

1. WHEN Git conflict occurs, THE Git_Manager SHALL first attempt automatic resolution
2. IF automatic resolution fails, THE Git_Manager SHALL escalate to Reviewer_Agent
3. THE Reviewer_Agent SHALL analyze conflicts and propose resolution
4. WHEN Reviewer_Agent resolves conflict, THE resolution SHALL be committed
5. WHEN branch is ready for merge, THE Merger_Agent SHALL merge to integration branch (develop/staging)
6. THE Merger_Agent SHALL NOT merge directly to master/main branch
7. WHEN all tasks for a ticket complete, THE System SHALL create Pull Request to master/main
8. THE Pull Request SHALL require President (user) approval before merge to master
9. THE merge approval SHALL be logged to `runtime/runs/<run-id>/merge.log`
10. THE Reviewer_Agent and Merger_Agent SHALL be defined in `agents/registry/`

### Requirement 5: ワーカー専用Dockerコンテナ

**User Story:** As a system administrator, I want to 各ワーカーが専用の隔離コンテナで作業する, so that ワーカー間の干渉を防ぎ安全性を確保できる.

#### Acceptance Criteria

1. WHEN Worker_Agent is assigned a task, THE System SHALL create a dedicated Docker container
2. THE Worker_Container SHALL be based on `infra/docker/images/worker/` image
3. THE Worker_Container SHALL clone the repository into container-local `/workspace` (NOT bind mount from host)
4. THE Worker_Container SHALL be isolated with the following guarantees:
   - Network: No inter-container communication except via Agent_Bus
   - Filesystem: No shared volumes between workers (each has own `/workspace`)
   - Shared read-only: `runtime/runs/<run-id>/` for result collection only
5. WHEN task execution completes, THE Worker_Container SHALL be destroyed (clean slate)
6. THE Worker_Container SHALL have configurable resource limits (CPU, memory)
7. THE container management SHALL use Container Runtime Abstraction supporting:
   - Docker-outside-of-Docker (DoD): Default for local development (uses host docker.sock with restricted commands)
   - Rootless Docker/Podman: For environments requiring no privileged access
   - Docker-in-Docker (DIND): Optional for CI environments with explicit opt-in
8. THE container runtime selection SHALL be configurable via `runtime/state/config.json` under `container_runtime` field
9. WHEN using DoD, THE System SHALL restrict docker.sock access to allowlisted commands only (run, stop, rm, logs, inspect)
10. THE environment management SHALL be in `tools/cli/lib/execution/worker-container.ts`

#### Isolation Acceptance Test Criteria

- Worker A SHALL NOT be able to read/write files in Worker B's `/workspace`
- Worker A SHALL NOT be able to send network packets directly to Worker B
- Worker A SHALL NOT be able to access host filesystem outside of designated paths
- Worker A SHALL NOT be able to spawn containers affecting other workers (when using DoD)

### Requirement 6: 長時間コマンド対策

**User Story:** As a system administrator, I want to 終了しないコマンドを適切に処理する, so that システムがハングしない.

#### Acceptance Criteria

1. THE Process_Monitor SHALL enforce configurable timeout (default: 300 seconds)
2. WHEN command exceeds timeout, THE Process_Monitor SHALL terminate and report to Worker_Agent
3. THE Process_Monitor SHALL detect and reject interactive commands (vim, nano, less, etc.)
4. THE Process_Monitor SHALL detect server commands (npm run dev, etc.) and run in background
5. WHEN background process starts, THE Process_Monitor SHALL return process_id for control
6. THE Process_Monitor SHALL support `kill <process_id>` to terminate background processes
7. THE Process_Monitor SHALL log all command executions to `runtime/runs/<run-id>/commands.log`
8. THE Process_Monitor SHALL be in `tools/cli/lib/execution/process-monitor.ts`

### Requirement 7: マルチAIアダプタ対応

**User Story:** As a developer, I want to 複数のAIプロバイダーを切り替えて使用できる, so that 最適なAIを選択できる.

#### Acceptance Criteria

1. THE System SHALL support multiple AI_Adapters: Ollama, Gemini, Kiro CLI, OpenCode, Claude Code
2. THE AI_Adapter interface SHALL be defined in `tools/adapters/base.ts` (existing)
3. WHEN executing tasks, THE System SHALL use configured AI_Adapter
4. THE AI_Adapter SHALL be configurable per agent or per task
5. THE System SHALL gracefully fallback to alternative adapter if primary fails
6. THE adapter configuration SHALL be in `agents/registry/<agent-id>.yaml` under `ai_config` field
7. THE System SHALL support adding new adapters with minimal code changes:
   - New adapter implementation in `tools/adapters/<adapter-name>.ts`
   - Adapter registration in `tools/adapters/index.ts` (single line addition)
   - No changes required to core execution engine
8. THE adapter implementations SHALL follow the interface defined in `tools/adapters/base.ts`

### Requirement 8: ツール呼び出しインターフェース

**User Story:** As a Worker_Agent, I want to AIからファイル操作やコマンド実行を要求できる, so that 実際のコード生成・編集ができる.

#### Acceptance Criteria

1. THE Execution_Engine SHALL support Tool_Calls: `read_file`, `write_file`, `edit_file`, `list_directory`, `run_command`, `git_commit`, `git_status`
2. WHEN AI requests `read_file`, THE System SHALL return file content from Worker_Container
3. WHEN AI requests `write_file`, THE System SHALL create or overwrite file in Worker_Container
4. WHEN AI requests `edit_file`, THE System SHALL apply diff-based changes
5. WHEN AI requests `run_command`, THE System SHALL execute via Process_Monitor
6. WHEN AI requests `git_commit`, THE System SHALL stage and commit via Git_Manager
7. THE Tool_Call interface SHALL be in `tools/cli/lib/execution/tools.ts`

### Requirement 9: 並列ワーカー実行

**User Story:** As a Manager_Agent, I want to 複数のワーカーを並列で実行する, so that プロジェクトを効率的に遂行できる.

#### Acceptance Criteria

1. THE System SHALL support concurrent execution of multiple Worker_Agents
2. THE Manager_Agent SHALL ensure assigned tasks have no dependencies (parallelizable)
3. THE Worker_Pool SHALL manage available workers and their assignments
4. THE max concurrent workers SHALL be configurable via GUI (default: 3)
5. WHEN Worker_Agent completes, THE Worker_Pool SHALL assign next pending task
6. THE parallel execution status SHALL be viewable via CLI and GUI
7. THE Worker_Pool SHALL be in `tools/cli/lib/execution/worker-pool.ts`

### Requirement 10: エージェント間通信

**User Story:** As a Manager_Agent, I want to ワーカーや他のエージェントと通信できる, so that 作業を調整できる.

#### Acceptance Criteria

1. THE Agent_Bus SHALL provide message passing between agents
2. THE Agent_Bus SHALL support message types: `task_assign`, `task_complete`, `task_failed`, `escalate`, `status_request`, `status_response`
3. WHEN Manager_Agent assigns task, THE Agent_Bus SHALL deliver to Worker_Agent
4. WHEN Worker_Agent completes/fails, THE Agent_Bus SHALL notify Manager_Agent
5. WHEN Worker_Agent needs help, THE Agent_Bus SHALL escalate to Manager_Agent
6. THE Agent_Bus SHALL use Message Queue Abstraction supporting:
   - File-based queue (default): `runtime/state/bus/` directory with JSON files
   - SQLite queue: For higher throughput scenarios
   - Redis queue: Optional for distributed deployments
7. THE Agent_Bus SHALL NOT require workers to listen on network ports (pull/poll model)
8. THE message history SHALL be logged to `runtime/runs/<run-id>/messages.log`
9. THE Agent_Bus SHALL be in `tools/cli/lib/execution/agent-bus.ts`

### Requirement 11: 会話ループによるタスク実行

**User Story:** As a Worker_Agent, I want to AIと複数回のやり取りでタスクを完了する, so that 複雑なタスクを段階的に実行できる.

#### Acceptance Criteria

1. THE Execution_Engine SHALL maintain conversation history during task execution
2. WHEN AI requests Tool_Call, THE System SHALL execute and return result
3. THE conversation loop SHALL continue until AI signals completion or max iterations (30)
4. WHEN AI signals completion, THE System SHALL collect all artifacts
5. IF max iterations reached, THE System SHALL mark task as `partial` and notify Manager_Agent
6. THE conversation history SHALL be saved to `runtime/runs/<run-id>/conversation.json`
7. THE System SHALL support resuming from saved conversation state

### Requirement 12: 品質ゲート統合

**User Story:** As a Quality Authority, I want to ワーカーの成果物に対して自動的に品質ゲートを実行する, so that 品質基準を満たしているか確認できる.

#### Acceptance Criteria

1. WHEN Worker_Agent completes, THE System SHALL run `make lint` in Worker_Container
2. WHEN lint passes, THE System SHALL run `make test` if test files exist
3. THE quality gate results SHALL be included in Execution_Result
4. IF quality gate fails, THE Worker_Agent SHALL report to Manager_Agent for support
5. THE Manager_Agent SHALL decide whether to retry, reassign, or escalate
6. THE quality gate logs SHALL be saved to `runtime/runs/<run-id>/quality_gates.log`
7. WHEN quality gates pass, THE System SHALL notify Quality Authority for final judgment

### Requirement 13: エラーハンドリングとマネージャーサポート

**User Story:** As a Manager_Agent, I want to ワーカーの失敗時にサポートを提供する, so that 問題を解決して作業を継続できる.

#### Acceptance Criteria

1. WHEN AI connection fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
2. WHEN Tool_Call fails, THE System SHALL report error to AI and continue conversation
3. WHEN Worker_Agent fails repeatedly, THE Manager_Agent SHALL be notified via Agent_Bus
4. THE Manager_Agent SHALL analyze failure and provide guidance or reassign task
5. THE error details SHALL be logged to `runtime/runs/<run-id>/errors.log`
6. THE System SHALL support `--resume <run-id>` to resume from saved state
7. THE System SHALL support `--rollback <run-id>` to undo changes

### Requirement 14: 状態永続化と履歴管理

**User Story:** As a Manager_Agent, I want to 前日の作業情報を維持する, so that 継続的に作業を進められる.

#### Acceptance Criteria

1. THE System SHALL persist execution state to `runtime/state/`
2. THE state SHALL include: active tasks, worker assignments, conversation histories, git branches
3. WHEN System restarts, THE Manager_Agent SHALL restore previous state
4. THE System SHALL retain execution history for configurable period (default: 7 days)
5. THE Worker_Container SHALL be destroyed after task completion (clean slate)
6. THE state persistence SHALL be in `tools/cli/lib/execution/state-manager.ts`

### Requirement 15: GUI設定インターフェース

**User Story:** As a 社長（ユーザー）, I want to GUIからシステム設定を変更できる, so that 簡単にリソース制限などを調整できる.

#### Acceptance Criteria

1. THE GUI SHALL provide Settings page at `/settings`
2. THE Settings page SHALL allow configuring: max concurrent workers, worker memory limit, command timeout, AI adapter selection
3. THE settings SHALL be saved to `runtime/state/config.json`
4. THE settings changes SHALL take effect immediately for new tasks
5. THE GUI SHALL display current resource usage (active workers, memory, etc.)
6. THE GUI SHALL provide agent management (view, hire, fire workers)
7. THE Settings API SHALL be implemented in `gui/web/app/api/settings/`

### Requirement 16: GUIリアルタイム監視ダッシュボード

**User Story:** As a 社長（ユーザー）, I want to GUIからリアルタイムで作業状況を確認できる, so that 会社の稼働状況を把握できる.

#### Acceptance Criteria

1. THE GUI SHALL provide Dashboard page at `/dashboard`
2. THE Dashboard SHALL display: active workers count, pending tasks count, completed tasks today, error count
3. THE Dashboard SHALL show real-time worker status (idle, working, error) with visual indicators
4. THE Dashboard SHALL display current task progress for each active worker
5. THE Dashboard SHALL show recent activity feed (task started, completed, failed)
6. THE Dashboard SHALL auto-refresh every 5 seconds (configurable)
7. THE Dashboard SHALL provide quick actions: pause all, resume all, emergency stop
8. THE Dashboard API SHALL be implemented in `gui/web/app/api/dashboard/`

### Requirement 17: GUI指示入力インターフェース

**User Story:** As a 社長（ユーザー）, I want to GUIから直接指示を出せる, so that CLIを使わずに作業を依頼できる.

#### Acceptance Criteria

1. THE GUI SHALL provide Command Center page at `/command`
2. THE Command Center SHALL have text input for high-level instructions
3. WHEN instruction is submitted, THE System SHALL create a ticket and assign to Manager_Agent
4. THE Command Center SHALL show instruction history with status
5. THE Command Center SHALL allow selecting target project from dropdown
6. THE Command Center SHALL show estimated task decomposition preview before execution
7. THE Command Center SHALL support attaching reference files or URLs
8. THE Command Center API SHALL be implemented in `gui/web/app/api/command/`

### Requirement 18: GUIタスク詳細・介入インターフェース

**User Story:** As a 社長（ユーザー）, I want to 実行中のタスクに介入できる, so that 問題があれば修正指示を出せる.

#### Acceptance Criteria

1. THE GUI SHALL provide Task Detail page at `/tasks/<task-id>`
2. THE Task Detail SHALL show: current status, assigned worker, conversation history, file changes
3. THE Task Detail SHALL allow sending additional instructions to the worker
4. THE Task Detail SHALL allow pausing/resuming individual tasks
5. THE Task Detail SHALL allow canceling tasks with rollback option
6. THE Task Detail SHALL show real-time log streaming
7. THE Task Detail SHALL show file diff preview for modified files
8. THE Task Detail API SHALL be implemented in `gui/web/app/api/tasks/`

### Requirement 19: GUI成果物プレビュー・承認

**User Story:** As a 社長（ユーザー）, I want to 成果物をプレビューして承認できる, so that マージ前に確認できる.

#### Acceptance Criteria

1. THE GUI SHALL provide Review page at `/review`
2. THE Review page SHALL list all tasks pending approval
3. THE Review page SHALL show file diffs with syntax highlighting
4. THE Review page SHALL allow inline comments on changes
5. THE Review page SHALL provide Approve/Reject/Request Changes actions
6. WHEN approved, THE System SHALL trigger Merger_Agent to merge
7. WHEN rejected, THE System SHALL notify Manager_Agent with feedback
8. THE Review API SHALL be implemented in `gui/web/app/api/review/`

### Requirement 20: 実行結果の構造化出力

**User Story:** As a Manager_Agent, I want to タスク実行結果を構造化されたフォーマットで受け取る, so that 結果を自動処理しレポートに含められる.

#### Acceptance Criteria

1. THE Execution_Result SHALL be output in JSON format
2. THE output SHALL include: `run_id`, `ticket_id`, `agent_id`, `status`, `start_time`, `end_time`, `artifacts`, `git_branch`, `quality_gates`, `errors`
3. THE `artifacts` field SHALL list all created/modified files with paths and diffs
4. THE `status` field SHALL be one of: `success`, `partial`, `quality_failed`, `error`
5. THE output SHALL be saved to `runtime/runs/<run-id>/execution_result.json`
6. THE System SHALL generate human-readable summary in `runtime/runs/<run-id>/summary.md`

### Requirement 21: CLIコマンド実装

**User Story:** As a developer, I want to CLIからエージェント実行を制御する, so that 手動でタスク実行をトリガーできる.

#### Acceptance Criteria

1. `npx tsx tools/cli/agentcompany.ts execute <ticket-id>` SHALL start task execution
2. `npx tsx tools/cli/agentcompany.ts execute --decompose <ticket-id>` SHALL decompose into sub-tickets
3. `npx tsx tools/cli/agentcompany.ts status` SHALL show current execution status
4. `npx tsx tools/cli/agentcompany.ts stop <run-id>` SHALL gracefully stop execution
5. `npx tsx tools/cli/agentcompany.ts resume <run-id>` SHALL resume from saved state
6. THE commands SHALL support `--adapter <adapter-name>` option (default: ollama)
7. THE commands SHALL support `--workers <count>` option for parallel execution
8. THE command implementation SHALL be in `tools/cli/commands/execute.ts`

### Requirement 22: プロジェクト管理統合

**User Story:** As a 社長（ユーザー）, I want to 複数のプロジェクトを管理できる, so that 異なるリポジトリの作業を整理できる.

#### Acceptance Criteria

1. THE System SHALL manage projects in `workspaces/projects.json`
2. WHEN creating ticket, THE user SHALL specify target project
3. THE project config SHALL include: `id`, `name`, `git_url`, `default_branch`, `work_dir`
4. THE Worker_Container SHALL clone the project's repository
5. `npx tsx tools/cli/agentcompany.ts project list` SHALL show all projects
6. `npx tsx tools/cli/agentcompany.ts project add <name> <git-url>` SHALL register project
7. THE project management SHALL be in `tools/cli/lib/execution/project-manager.ts`

### Requirement 23: エンドツーエンド開発フロー

**User Story:** As a 社長（ユーザー）, I want to 指示を出してから成果物がマージされるまでの一連のフローが自動化されている, so that 実際の開発をこのシステムで進められる.

#### Acceptance Criteria

1. THE System SHALL support complete flow: Instruction → Decompose → Execute → Review → Merge
2. WHEN President submits instruction via GUI, THE Manager_Agent SHALL automatically start processing
3. THE Manager_Agent SHALL decompose, assign, and monitor without manual intervention
4. WHEN all sub-tasks complete, THE System SHALL automatically trigger quality gates
5. WHEN quality gates pass, THE System SHALL notify President for review via GUI
6. WHEN President approves, THE Merger_Agent SHALL merge to target branch
7. THE System SHALL generate completion report with all changes summary
8. THE entire flow SHALL be observable via GUI Dashboard
