# Requirements Document

## Introduction

本ドキュメントは、AIエージェントが自律的にGitリポジトリに対して開発作業を行い、最終的にPull Requestを作成するワークフロー機能の要件を定義する。

ユーザー（社長）がチケットを作成すると、Manager Agent（部長）がタスクを分解し、専門ワーカー（調査、設計、開発、テスト、レビュー）に割り当てる。各ワーカーは隔離されたDocker環境で作業を行い、レビュー承認後にエージェントブランチにマージされる。全作業完了後、mainブランチへのPull Requestが自動作成される。

## Glossary

- **Project**: Gitリポジトリとブランチ設定を含む管理対象プロジェクト
- **Parent_Ticket**: 社長（ユーザー）からの指示を表す親チケット
- **Child_Ticket**: Manager Agentが分解した子チケット
- **Grandchild_Ticket**: 実際の作業単位となる孫チケット
- **Worker_Agent**: 特定の専門分野を持つ作業エージェント
- **Research_Worker**: 市場調査・技術調査を行うワーカー
- **Design_Worker**: アーキテクチャ設計を行うワーカー
- **Designer_Worker**: UI/UXデザインを行うワーカー
- **Developer_Worker**: コード実装を行うワーカー
- **Test_Worker**: テスト作成・実行を行うワーカー
- **Reviewer_Agent**: コードレビューを行うエージェント
- **Agent_Branch**: エージェント作業用の統合ブランチ（`agent/<project-id>`形式）
- **Task_Branch**: 各ワーカーの作業ブランチ（`agent/<ticket-id>-xxx`形式）
- **Base_Branch**: PRの作成先ブランチ（通常はmain）
- **Git_Manager**: Gitリポジトリ操作を管理するコンポーネント
- **Ticket_Manager**: チケットの階層構造を管理するコンポーネント
- **PR_Creator**: Pull Request作成を担当するコンポーネント

## Requirements

### Requirement 1: プロジェクト管理の拡張

**User Story:** As a ユーザー, I want to プロジェクトにブランチ設定を追加できる, so that エージェントが適切なブランチで作業できる.

#### Acceptance Criteria

1. THE Project SHALL include `baseBranch` field for PR target branch (default: 'main')
2. THE Project SHALL include `agentBranch` field for agent work integration branch (default: 'agent/<project-id>')
3. WHEN a project is registered, THE System SHALL validate that the Git URL is accessible
4. WHEN a project is registered, THE System SHALL create the agent branch if it does not exist
5. THE Project config SHALL be stored in `workspaces/projects.json`

### Requirement 2: チケット階層構造

**User Story:** As a ユーザー, I want to チケットを階層構造で管理できる, so that 大きなタスクを段階的に分解できる.

#### Acceptance Criteria

1. THE Ticket_Manager SHALL support three-level hierarchy: Parent_Ticket → Child_Ticket → Grandchild_Ticket
2. WHEN a Parent_Ticket is created, THE Ticket_Manager SHALL assign a unique ticket ID with format `<project-id>-<sequence>`
3. WHEN a Child_Ticket is created, THE Ticket_Manager SHALL assign ID with format `<parent-id>-<sequence>`
4. WHEN a Grandchild_Ticket is created, THE Ticket_Manager SHALL assign ID with format `<child-id>-<sequence>`
5. THE Parent_Ticket SHALL contain: id, projectId, instruction, status, createdAt, childTickets[]
6. THE Child_Ticket SHALL contain: id, parentId, title, description, status, workerType, grandchildTickets[]
7. THE Grandchild_Ticket SHALL contain: id, parentId, title, description, acceptanceCriteria[], status, assignee, gitBranch, artifacts[]
8. WHEN a ticket status changes, THE Ticket_Manager SHALL propagate status updates to parent tickets

### Requirement 3: ワーカータイプの定義

**User Story:** As a Manager Agent, I want to 専門ワーカーにタスクを割り当てる, so that 適切なスキルを持つエージェントが作業できる.

#### Acceptance Criteria

1. THE System SHALL support the following worker types: research, design, designer, developer, test, reviewer
2. THE Research_Worker SHALL have capabilities: web search, document analysis, technology evaluation
3. THE Design_Worker SHALL have capabilities: architecture design, API design, data model design
4. THE Designer_Worker SHALL have capabilities: UI/UX design, wireframe creation, style guide
5. THE Developer_Worker SHALL have capabilities: code implementation, file operations, command execution
6. THE Test_Worker SHALL have capabilities: test creation, test execution, coverage analysis
7. THE Reviewer_Agent SHALL have capabilities: code review, quality check, merge approval
8. WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements

### Requirement 4: Gitブランチフロー

**User Story:** As a システム, I want to 適切なブランチ戦略を実行する, so that 作業が安全に統合される.

#### Acceptance Criteria

1. WHEN a Grandchild_Ticket starts, THE Git_Manager SHALL create Task_Branch from Agent_Branch with format `agent/<ticket-id>-<description>`
2. WHEN a worker completes work, THE Git_Manager SHALL commit changes to Task_Branch with message format `[<ticket-id>] <description>`
3. WHEN a worker completes work, THE Git_Manager SHALL push Task_Branch to remote
4. WHEN Reviewer_Agent approves, THE Git_Manager SHALL merge Task_Branch into Agent_Branch
5. IF merge conflict occurs, THE Git_Manager SHALL first attempt automatic resolution
6. IF automatic resolution fails, THE Git_Manager SHALL escalate to Reviewer_Agent with conflict details
7. WHEN all Child_Tickets complete, THE PR_Creator SHALL create Pull Request from Agent_Branch to Base_Branch
8. THE Pull Request SHALL include: title, description, list of completed tickets, test results summary

### Requirement 5: レビューワークフロー

**User Story:** As a Reviewer Agent, I want to コードレビューを実行する, so that 品質を確保できる.

#### Acceptance Criteria

1. WHEN a Grandchild_Ticket is marked as ready for review, THE System SHALL notify Reviewer_Agent
2. THE Reviewer_Agent SHALL check: code quality, test coverage, acceptance criteria fulfillment
3. IF review passes, THE Reviewer_Agent SHALL approve and trigger merge to Agent_Branch
4. IF review fails, THE Reviewer_Agent SHALL provide feedback and return ticket to worker
5. WHEN review feedback is provided, THE System SHALL update ticket status to 'revision_required'
6. THE Reviewer_Agent SHALL log all review decisions to `runtime/runs/<run-id>/reviews.log`

### Requirement 6: GUI - プロジェクト管理画面

**User Story:** As a ユーザー, I want to GUIでプロジェクトを管理できる, so that 簡単にプロジェクトを登録・設定できる.

#### Acceptance Criteria

1. THE GUI SHALL provide a project registration form with: name, gitUrl, baseBranch, agentBranch
2. THE GUI SHALL display a list of registered projects with status indicators
3. WHEN a project is selected, THE GUI SHALL show project details and recent activity
4. THE GUI SHALL provide edit and delete actions for each project
5. THE GUI SHALL validate input fields before submission
6. WHEN validation fails, THE GUI SHALL display clear error messages

### Requirement 7: GUI - チケット階層管理画面

**User Story:** As a ユーザー, I want to GUIでチケット階層を確認できる, so that 作業の進捗を把握できる.

#### Acceptance Criteria

1. THE GUI SHALL display ticket hierarchy as a tree view
2. THE GUI SHALL show ticket status with color-coded indicators (pending: gray, in-progress: blue, review: yellow, completed: green, failed: red)
3. WHEN a ticket is expanded, THE GUI SHALL show child tickets and their details
4. THE GUI SHALL display assigned worker type and current assignee for each ticket
5. THE GUI SHALL show Git branch name associated with each Grandchild_Ticket
6. WHEN a ticket is clicked, THE GUI SHALL navigate to ticket detail view

### Requirement 8: GUI - チケット作成画面

**User Story:** As a ユーザー, I want to GUIでチケットを作成できる, so that エージェントに指示を出せる.

#### Acceptance Criteria

1. THE GUI SHALL provide a ticket creation form with: project selection, instruction text area
2. THE GUI SHALL support markdown formatting in instruction text
3. WHEN a ticket is submitted, THE GUI SHALL display confirmation and ticket ID
4. THE GUI SHALL provide a preview of the instruction before submission
5. IF submission fails, THE GUI SHALL display error message and allow retry

### Requirement 9: 状態永続化

**User Story:** As a システム, I want to 実行状態を永続化する, so that 中断後に再開できる.

#### Acceptance Criteria

1. THE System SHALL persist ticket hierarchy to `runtime/state/tickets/<project-id>.json`
2. THE System SHALL persist execution state to `runtime/state/runs/<run-id>/state.json`
3. WHEN system restarts, THE System SHALL restore in-progress tickets and continue execution
4. THE System SHALL support manual pause and resume of ticket execution
5. WHEN a ticket is paused, THE System SHALL preserve all worker state and conversation history

### Requirement 10: Pull Request作成

**User Story:** As a システム, I want to 自動的にPull Requestを作成する, so that 人間のレビューを受けられる.

#### Acceptance Criteria

1. WHEN all Grandchild_Tickets under a Parent_Ticket are completed, THE PR_Creator SHALL create a Pull Request
2. THE Pull Request title SHALL follow format: `[AgentCompany] <parent-ticket-instruction-summary>`
3. THE Pull Request body SHALL include: overview, list of changes, test results, related tickets
4. THE PR_Creator SHALL use GitHub API or git command to create the Pull Request
5. WHEN Pull Request creation succeeds, THE System SHALL update Parent_Ticket status to 'pr_created'
6. IF Pull Request creation fails, THE System SHALL log error and notify user

### Requirement 11: エラーハンドリングとリカバリー

**User Story:** As a システム, I want to エラーから回復できる, so that 作業が中断されない.

#### Acceptance Criteria

1. WHEN a worker fails, THE System SHALL retry with exponential backoff (1s, 2s, 4s) up to 3 times
2. IF all retries fail, THE System SHALL mark Grandchild_Ticket as failed and notify Manager_Agent
3. THE Manager_Agent SHALL decide whether to reassign to another worker or escalate
4. WHEN Git operation fails, THE System SHALL log detailed error and attempt recovery
5. THE System SHALL maintain audit log of all errors in `runtime/runs/<run-id>/errors.log`

### Requirement 12: CLI拡張

**User Story:** As a 開発者, I want to CLIでワークフローを制御できる, so that 自動化やデバッグができる.

#### Acceptance Criteria

1. THE CLI SHALL support `agentcompany ticket create <project-id> <instruction>` to create Parent_Ticket
2. THE CLI SHALL support `agentcompany ticket list <project-id>` to list all tickets
3. THE CLI SHALL support `agentcompany ticket status <ticket-id>` to show ticket details
4. THE CLI SHALL support `agentcompany ticket pause <ticket-id>` to pause execution
5. THE CLI SHALL support `agentcompany ticket resume <ticket-id>` to resume execution
6. THE CLI SHALL support `agentcompany project add <name> <git-url> --base-branch <branch> --agent-branch <branch>` to register project with branch settings
