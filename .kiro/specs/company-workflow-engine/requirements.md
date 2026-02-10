# Requirements Document

## Introduction

本ドキュメントは、AIエージェントを「会社組織」として運用するためのワークフローエンジンの要件を定義する。

社長（ユーザー）が大雑把な指示を出すと、COO/PM（Manager Agent）がプロジェクトを分析・計画し、社長の承認を経て、専門ワーカーチーム（リサーチャー、デザイナー、開発者、テスター）が開発を実行する。各フェーズには社長の承認ゲートがあり、リアルな会社組織の意思決定プロセスを再現する。

すべての操作・確認はGUIから行えることを前提とし、社長（ユーザー）がCLIを使わずにプロジェクトの全体像を把握し、意思決定できるUI/UXを提供する。

既存の `autonomous-agent-workflow` spec（チケット階層・ワーカータイプ・Gitフロー）と `ai-execution-integration` spec（AI実行基盤・品質ゲート）の上位に位置し、これらを「会社の業務フロー」として統合する。

## Glossary

- **Workflow_Engine**: フェーズ管理と状態遷移を制御するコンポーネント
- **Approval_Gate**: 社長（ユーザー）の承認を待つゲート機能
- **Proposal**: COO/PMが作成するプロジェクト計画書（提案書）
- **Phase**: ワークフローの実行段階（proposal, approval, development, quality_assurance, delivery）
- **Phase_Transition**: フェーズ間の状態遷移イベント
- **CEO**: 社長（ユーザー、人間）。指示出しと承認判断を行う
- **COO_PM**: Manager Agentが担うCOO/PM役。プロジェクト分析・計画・進捗管理を行う
- **Research_Worker**: 技術調査・実現可能性分析を行うワーカー
- **Design_Worker**: アーキテクチャ設計・API設計を行うワーカー
- **Developer_Worker**: コード実装を行うワーカー
- **Test_Worker**: テスト作成・実行を行うワーカー
- **Escalation**: 問題発生時に上位者（社長）へ判断を仰ぐプロセス
- **Deliverable**: 納品フェーズで社長に提示する成果物一式
- **Orchestrator**: 既存の全体制御コンポーネント（本specで拡張）
- **Meeting**: 複数エージェントが参加する会議プロセス。議題に対して各エージェントが専門的見地から意見を出し、合意形成を行う
- **Meeting_Minutes**: 会議録。参加者、議題、各発言、決定事項、アクションアイテムを記録したドキュメント
- **Meeting_Participant**: 会議に参加するエージェント。役職と専門分野を持つ

## Requirements

### Requirement 1: ワークフローフェーズ管理

**User Story:** As a CEO, I want to プロジェクトが明確なフェーズで進行する, so that 各段階で適切な判断ができる.

#### Acceptance Criteria

1. THE Workflow_Engine SHALL manage five sequential phases: proposal, approval, development, quality_assurance, delivery
2. WHEN a phase completes, THE Workflow_Engine SHALL transition to the next phase and record the Phase_Transition event with timestamp
3. THE Workflow_Engine SHALL persist the current phase and transition history to `runtime/state/runs/<run-id>/workflow.json`
4. IF an error occurs during a phase, THEN THE Workflow_Engine SHALL halt the phase and notify the CEO via Approval_Gate
5. WHEN the CEO requests a phase rollback, THE Workflow_Engine SHALL return to the specified previous phase and reset dependent state

### Requirement 2: 提案フェーズ（Proposal Phase）

**User Story:** As a CEO, I want to COO/PMが専門家チームと会議を行い計画を作成する, so that 多角的な視点で検討された計画を確認できる.

#### Acceptance Criteria

1. WHEN the CEO submits an instruction, THE COO_PM SHALL convene a Meeting with relevant specialist agents to analyze the instruction
2. THE Meeting SHALL include at minimum the COO_PM as facilitator and one or more specialist agents selected based on the instruction content
3. WHEN technical investigation is needed, THE COO_PM SHALL include Research_Worker as a Meeting_Participant to evaluate feasibility
4. WHEN architecture decisions are needed, THE COO_PM SHALL include Design_Worker as a Meeting_Participant to propose architecture
5. WHEN UI/UX decisions are needed, THE COO_PM SHALL include Designer_Worker as a Meeting_Participant to propose user experience
6. THE Meeting SHALL proceed in rounds where each Meeting_Participant provides input on the agenda items in sequence
7. THE Workflow_Engine SHALL record all Meeting exchanges as Meeting_Minutes and persist them to `runtime/runs/<run-id>/meeting-minutes/<meeting-id>.json`
8. THE Meeting_Minutes SHALL contain: meeting ID, agenda, list of participants with roles, chronological list of statements with speaker and content, decisions made, and action items
9. THE COO_PM SHALL synthesize Meeting outcomes into a Proposal containing: summary, scope, task breakdown, estimated worker assignments, risk assessment, and dependencies
10. THE Proposal SHALL reference the Meeting_Minutes that informed the planning decisions
11. THE Workflow_Engine SHALL persist the Proposal to `runtime/runs/<run-id>/proposal.json`

### Requirement 3: 承認フェーズ（Approval Phase）

**User Story:** As a CEO, I want to 計画を承認・修正要求・却下できる, so that プロジェクトの方向性を制御できる.

#### Acceptance Criteria

1. WHEN the proposal phase completes, THE Approval_Gate SHALL present the Proposal to the CEO via GUI notification
2. THE Approval_Gate SHALL support three CEO actions: approve, request_revision, reject
3. WHEN the CEO approves, THE Workflow_Engine SHALL transition to the development phase
4. WHEN the CEO requests revision, THE Workflow_Engine SHALL return to the proposal phase with the CEO feedback
5. WHEN the CEO rejects, THE Workflow_Engine SHALL terminate the workflow and record the rejection reason
6. THE Approval_Gate SHALL persist the CEO decision and feedback to `runtime/runs/<run-id>/approvals.json`
7. WHILE the Approval_Gate is waiting for CEO input, THE Workflow_Engine SHALL pause all worker execution

### Requirement 4: 開発フェーズ（Development Phase）

**User Story:** As a CEO, I want to 専門ワーカーチームが計画に基づいて開発を実行する, so that 品質の高い成果物が得られる.

#### Acceptance Criteria

1. WHEN the development phase starts, THE Workflow_Engine SHALL assign Grandchild_Tickets to appropriate workers based on the approved Proposal
2. THE Workflow_Engine SHALL execute worker tasks sequentially respecting dependency order defined in the Proposal
3. WHEN a Developer_Worker completes a Grandchild_Ticket, THE Workflow_Engine SHALL trigger Reviewer_Agent review before proceeding
4. WHEN a Reviewer_Agent rejects a review, THE Workflow_Engine SHALL return the Grandchild_Ticket to the assigned worker with feedback
5. THE Workflow_Engine SHALL track progress of all Grandchild_Tickets and update the Parent_Ticket status accordingly
6. WHEN a worker fails after maximum retries, THE Workflow_Engine SHALL escalate to the CEO via Approval_Gate with failure details

### Requirement 5: 品質確認フェーズ（Quality Assurance Phase）

**User Story:** As a CEO, I want to 成果物が品質基準を満たしていることを確認する, so that 品質の低い成果物が納品されない.

#### Acceptance Criteria

1. WHEN all development tasks complete, THE Workflow_Engine SHALL transition to the quality_assurance phase
2. THE Workflow_Engine SHALL execute lint and test quality gates on the Agent_Branch
3. IF quality gates fail, THEN THE Workflow_Engine SHALL return to the development phase with failure details assigned to the appropriate worker
4. WHEN quality gates pass, THE Workflow_Engine SHALL trigger a final Reviewer_Agent review on the combined changes
5. IF the final review fails, THEN THE Workflow_Engine SHALL return to the development phase with review feedback

### Requirement 6: 納品フェーズ（Delivery Phase）

**User Story:** As a CEO, I want to 完成した成果物を確認して承認する, so that 最終的な品質を保証できる.

#### Acceptance Criteria

1. WHEN the quality_assurance phase passes, THE Workflow_Engine SHALL compile a Deliverable containing: summary report, list of changes, test results, and review history
2. THE Approval_Gate SHALL present the Deliverable to the CEO via GUI notification
3. WHEN the CEO approves the Deliverable, THE Workflow_Engine SHALL trigger PR_Creator to create a Pull Request from Agent_Branch to Base_Branch
4. WHEN the CEO requests revision on the Deliverable, THE Workflow_Engine SHALL return to the development phase with the CEO feedback
5. WHEN the Pull Request is created, THE Workflow_Engine SHALL update the Parent_Ticket status to 'pr_created' and mark the workflow as completed

### Requirement 7: Orchestrator.startTaskProcessing の修正

**User Story:** As a システム, I want to Orchestratorがワーカーの実行完了を待つ, so that タスクが正しく完了してから後処理が実行される.

#### Acceptance Criteria

1. WHEN Orchestrator assigns sub-tasks to workers, THE Orchestrator SHALL await all worker ExecutionResult promises before calling finalizeTaskExecution
2. WHEN a worker completes execution, THE Orchestrator SHALL collect the ExecutionResult and update the ExecutionState with worker artifacts and conversation history
3. IF any worker execution fails, THEN THE Orchestrator SHALL record the failure in ExecutionState and proceed with error handling before finalization

### Requirement 8: GUIワークフロー一覧画面

**User Story:** As a CEO, I want to 全ワークフローの状態を一覧で確認できる, so that 組織全体の進捗を俯瞰できる.

#### Acceptance Criteria

1. THE GUI SHALL provide a Workflows page (`/workflows`) displaying all workflows in a list/card view
2. EACH workflow card SHALL display: workflow ID, instruction summary (truncated), current phase, status, creation date, and last updated date
3. THE workflow card SHALL display a visual phase progress indicator showing all 5 phases with the current phase highlighted
4. THE GUI SHALL support filtering workflows by status (running, waiting_approval, completed, terminated, failed)
5. THE GUI SHALL support sorting workflows by creation date, last updated date, or status
6. WHEN a workflow has status 'waiting_approval', THE card SHALL display a prominent notification badge indicating CEO action is required
7. THE GUI SHALL auto-refresh the workflow list every 5 seconds to reflect real-time status changes
8. THE Navigation component SHALL include a "Workflows" link with a notification badge showing the count of workflows awaiting approval

### Requirement 9: GUIワークフロー詳細画面

**User Story:** As a CEO, I want to ワークフローの詳細をすべてGUIで確認・操作できる, so that CLIを使わずに意思決定できる.

#### Acceptance Criteria

1. THE GUI SHALL provide a Workflow Detail page (`/workflows/[id]`) with a tabbed interface containing: Overview, Proposal, Meetings, Progress, Quality, and Approvals tabs
2. THE Overview tab SHALL display: instruction text, current phase with visual progress bar, phase transition timeline, and workflow metadata (ID, project, dates)
3. THE Proposal tab SHALL display the full Proposal content: summary, scope, task breakdown table, worker assignments, risk assessment, and dependencies graph
4. THE Meetings tab SHALL display a list of all meetings for the workflow, each expandable to show full meeting minutes including agenda, participant statements, decisions, and action items
5. THE Progress tab SHALL display a real-time view of development phase progress: list of all subtasks with status (pending/working/review/completed/failed), assigned worker type, and completion percentage
6. THE Progress tab SHALL display each worker's current activity status and the task they are working on
7. THE Quality tab SHALL display quality gate results: lint results, test results with pass/fail counts, coverage percentage, and final review status
8. THE Approvals tab SHALL display approval history: list of all approval decisions with phase, action taken, feedback, and timestamp
9. WHEN the workflow status is 'waiting_approval', THE detail page SHALL display a prominent approval action panel at the top with approve/request_revision/reject buttons and a feedback text area
10. THE approval action panel SHALL display the relevant content (Proposal for approval phase, Deliverable for delivery phase) directly above the action buttons
11. THE GUI SHALL provide a "Rollback" button on the Overview tab allowing the CEO to rollback to a previous phase, with a confirmation dialog showing the target phase and consequences
12. THE detail page SHALL auto-refresh every 3 seconds during active phases (proposal, development, quality_assurance) to show real-time progress

### Requirement 10: GUI承認通知とダッシュボード統合

**User Story:** As a CEO, I want to 承認が必要な時にすぐ気づける, so that ワークフローが承認待ちで停滞しない.

#### Acceptance Criteria

1. WHEN an Approval_Gate is activated, THE Dashboard SHALL display a notification card at the top showing the workflow ID, phase, and a direct link to the approval action
2. THE Dashboard notification card SHALL use a distinct visual style (accent color border, pulsing indicator) to draw attention
3. THE Header component SHALL display a notification badge next to the "Workflows" navigation link showing the count of pending approvals
4. WHEN the CEO clicks the notification, THE GUI SHALL navigate directly to the Workflow Detail page with the approval action panel visible
5. THE Dashboard SHALL display a "Workflows Summary" section showing: active workflows count, waiting approval count, completed today count, and failed count

### Requirement 11: GUIエスカレーション対応

**User Story:** As a CEO, I want to エスカレーションをGUIで確認して対応できる, so that 問題発生時に迅速に判断できる.

#### Acceptance Criteria

1. WHEN an escalation occurs, THE Workflow Detail page SHALL display an escalation alert panel with: failure details, affected task, worker type, retry count, and error message
2. THE escalation alert panel SHALL provide three action buttons: retry (with optional parameter input), skip, and abort
3. WHEN the CEO selects retry, THE GUI SHALL allow optional parameter input (e.g., different worker type) before submitting
4. WHEN the CEO selects abort, THE GUI SHALL display a confirmation dialog before terminating the workflow
5. THE escalation alert SHALL be visually distinct (red/warning styling) and positioned prominently on the detail page

### Requirement 12: エージェント会議プロセス

**User Story:** As a CEO, I want to エージェント間の議論プロセスを確認できる, so that 計画の根拠と意思決定過程を理解できる.

#### Acceptance Criteria

1. THE Meeting SHALL support multiple agenda items, and each agenda item SHALL be discussed by all Meeting_Participants before moving to the next
2. WHEN a Meeting_Participant provides input, THE Meeting SHALL record the participant role, statement content, and timestamp
3. THE COO_PM SHALL summarize each agenda item discussion and record the summary in Meeting_Minutes before proceeding to the next item
4. WHEN all agenda items are discussed, THE COO_PM SHALL compile final decisions and action items into the Meeting_Minutes
5. THE GUI Meetings tab SHALL display each meeting as an expandable card with: meeting date, participant avatars/icons, agenda item count, and decision count
6. WHEN expanded, THE meeting card SHALL show a chat-like timeline of statements with participant role icons, names, and content, visually distinguishing facilitator summaries from participant opinions
7. THE Workflow_Engine SHALL support multiple Meetings per workflow for iterative refinement when the CEO requests revision

### Requirement 13: ワークフロー状態の永続化と復元

**User Story:** As a システム, I want to ワークフロー状態を永続化する, so that システム再起動後にワークフローを再開できる.

#### Acceptance Criteria

1. THE Workflow_Engine SHALL persist the complete workflow state to `runtime/state/runs/<run-id>/workflow.json` after every phase transition
2. WHEN the system restarts, THE Workflow_Engine SHALL restore in-progress workflows from persisted state and resume from the last completed phase
3. THE persisted workflow state SHALL contain: current phase, phase history, approval decisions, worker assignments, and error log

### Requirement 14: エスカレーション管理

**User Story:** As a CEO, I want to 問題発生時にエスカレーションを受ける, so that 重要な判断を適切なタイミングで行える.

#### Acceptance Criteria

1. WHEN a worker fails after maximum retries, THE Workflow_Engine SHALL create an Escalation with failure details and present it to the CEO via Approval_Gate
2. THE CEO SHALL be able to choose: retry with different parameters, skip the failed task, or abort the workflow
3. WHEN the CEO chooses to retry, THE Workflow_Engine SHALL reassign the task to a new worker with the CEO-specified parameters
4. WHEN the CEO chooses to skip, THE Workflow_Engine SHALL mark the task as skipped and continue with remaining tasks
5. WHEN the CEO chooses to abort, THE Workflow_Engine SHALL terminate the workflow and generate a failure report

### Requirement 15: ワークフローAPI

**User Story:** As a 開発者, I want to APIでワークフローを制御できる, so that GUIやCLIから操作できる.

#### Acceptance Criteria

1. THE Orchestrator_Server SHALL provide `POST /api/workflows` to start a new workflow with instruction and project ID
2. THE Orchestrator_Server SHALL provide `GET /api/workflows` to list all workflows with optional status filter
3. THE Orchestrator_Server SHALL provide `GET /api/workflows/:id` to retrieve workflow status including current phase, progress, and all associated data
4. THE Orchestrator_Server SHALL provide `POST /api/workflows/:id/approve` to submit CEO approval decisions
5. THE Orchestrator_Server SHALL provide `GET /api/workflows/:id/proposal` to retrieve the Proposal content
6. THE Orchestrator_Server SHALL provide `GET /api/workflows/:id/deliverable` to retrieve the Deliverable content
7. THE Orchestrator_Server SHALL provide `GET /api/workflows/:id/meetings` to retrieve all meeting minutes for the workflow
8. THE Orchestrator_Server SHALL provide `POST /api/workflows/:id/escalation` to submit CEO escalation decisions
9. THE Orchestrator_Server SHALL provide `POST /api/workflows/:id/rollback` to rollback to a specified previous phase
10. THE Orchestrator_Server SHALL provide `GET /api/workflows/:id/progress` to retrieve real-time development progress (subtask statuses, worker activities)
11. THE Orchestrator_Server SHALL provide `GET /api/workflows/:id/quality` to retrieve quality gate results

### Requirement 16: GUI UI/UXデザイン指針

**User Story:** As a CEO, I want to 直感的で見やすいUIで操作できる, so that どのデバイスでも迷わず行動できる.

#### Acceptance Criteria

1. THE GUI SHALL follow the existing design system: dark theme (bg-primary: #0f172a), Tailwind CSS color tokens, and Card/Badge/Modal shared components
2. THE workflow phase progress indicator SHALL use a horizontal stepper design with 5 steps, each showing phase name and status icon (pending/active/completed/failed)
3. THE active phase step SHALL use accent-primary (#3b82f6) color with a pulsing animation to indicate current progress
4. THE completed phase steps SHALL use status-pass (#22c55e) color with a checkmark icon
5. THE failed phase steps SHALL use status-fail (#ef4444) color with an error icon
6. THE approval action panel SHALL use a visually prominent card with accent-primary border and a subtle glow effect to draw CEO attention
7. THE meeting timeline SHALL use a chat-bubble style layout with participant role icons on the left, distinguishing facilitator (COO/PM) messages with a different background color
8. THE development progress view SHALL use a Kanban-style column layout with columns for each subtask status (pending, working, review, completed, failed)
9. THE escalation alert SHALL use status-fail color with an animated warning icon to ensure immediate CEO attention
10. ALL interactive elements (buttons, links, cards) SHALL have clear hover states, focus indicators for accessibility, and appropriate aria labels
11. THE GUI SHALL be responsive: workflow list as cards on mobile, table-like on desktop; detail page tabs as horizontal scroll on mobile
12. THE notification badge SHALL use a red dot with count number, positioned at the top-right of the Workflows navigation link
