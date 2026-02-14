# Requirements Document: Real Company Experience

## Introduction

本ドキュメントは、AgentCompanyを「タスク処理マシン」から「生きた組織」に進化させるための包括的な要件を定義する。

社長（ユーザー）が本物の会社を経営しているかのような体験を提供する。社員の存在感、日常業務のリズム、知識の蓄積と学習、品質へのこだわり、経営戦略、そして企業文化——これらすべてが有機的に連携し、「会社が生きている」と感じられるシステムを構築する。

### 現状の課題

1. 社員の「存在感」がない — 誰がいて、今何をしているかがGUIで見えない
2. 日常のリズムがない — タスクが来たら処理するだけの機械的な動作
3. 知識が蓄積されない — 過去の学びが次に活かされない
4. 品質チェックが浅い — lint/testは自動だが仕様適合は人間依存
5. 経営視点がない — 市場調査、KPI、事業計画がない
6. 文化がない — 社員の成長、モチベーション、関係性が見えない

### 設計原則

- **社長体験ファースト**: すべての機能は「社長がGUIから会社を経営する」体験を軸に設計する
- **有機的な連携**: 各機能は独立せず、データが循環して組織が成長するサイクルを形成する
- **段階的実装**: 6フェーズに分けて段階的に実装し、各フェーズで価値を提供する
- **既存資産の活用**: 既存のWorkflowEngine、MeetingCoordinator、PerformanceTracker等を最大限活用する

## Glossary

- **Employee**: AgentCompanyに登録されたエージェント（社員）。固定エージェント（COO/PM、QA等）とWorkerを含む
- **Employee_Directory**: 社員名簿。全社員のプロフィール、スキル、パフォーマンス、活動状況を一覧表示する画面
- **Employee_Status**: 社員のリアルタイム状態（idle/working/in_meeting/reviewing/on_break）
- **Daily_Standup**: デイリースタンドアップ（朝会）。各社員が前日の成果、本日の予定、課題を共有する定期会議
- **Daily_Report**: 日報。各社員の1日の活動を自動集計したレポート
- **Weekly_Report**: 週報。1週間の成果、課題、次週計画をまとめたレポート
- **Retrospective**: レトロスペクティブ（振り返り会議）。ワークフロー完了後に開催し、良かった点・改善点・次のアクションを議論する
- **Knowledge_Base**: ナレッジベース。過去のプロジェクトで得た学び、ベストプラクティス、失敗事例を蓄積するデータベース
- **Knowledge_Entry**: ナレッジベースの1エントリ。タイトル、カテゴリ、内容、関連ワークフロー、作成者を含む
- **Internal_Rule**: 社内ルール。レトロスペクティブから自動生成される改善ルール
- **Spec_Compliance_Check**: 仕様適合チェック。提案書の要件と成果物を突合し、未実装項目を検出する
- **Tech_Debt**: 技術的負債。コード品質の経時変化を追跡するメトリクス
- **Executive_Meeting**: 経営会議。KPI確認、戦略見直し、重要意思決定を行う定期会議
- **KPI_Dashboard**: KPIダッシュボード。生産性、品質、コスト、成長率を可視化する画面
- **Market_Research**: 市場調査。Web検索を活用した競合分析、技術トレンド調査
- **Business_Plan**: 事業計画。中長期の方向性と目標を定義するドキュメント
- **Mood_Score**: 社員のモチベーション/疲労度スコア（0-100）。連続成功で上昇、連続失敗で低下
- **Relationship_Map**: 社員間関係性マップ。協力頻度、レビュー関係、メンタリング関係を可視化
- **Career_Path**: キャリアパス。社員の昇進/降格の履歴と現在のレベル
- **MVP_Award**: 月間MVP表彰。最も貢献した社員を自動選出し表彰する制度
- **Chat_Log**: 社内チャットログ。Agent Bus経由のメッセージ履歴をタイムライン表示
- **Activity_Stream**: アクティビティストリーム。全社員の活動をリアルタイムで流すフィード

## Requirements

### Requirement 1: 社員名簿と組織図（Employee Directory）

**User Story:** As a CEO, I want to 全社員のプロフィール・スキル・パフォーマンスを一覧で確認できる, so that 組織の全体像を把握し適切な人事判断ができる.

#### Acceptance Criteria

1. THE GUI SHALL provide an Employee_Directory page at `/employees` that lists all registered agents with their role, status, and key metrics
2. THE Employee_Directory SHALL display each Employee's profile including: agent ID, title, role (manager/worker/reviewer/etc.), capabilities, persona description, and avatar/icon
3. THE Employee_Directory SHALL show an organization chart view that visualizes the reporting hierarchy (CEO → COO/PM → Workers, CEO → QA, CEO → Security Officer, CEO → CFO)
4. WHEN an Employee is clicked, THE GUI SHALL navigate to `/employees/[id]` showing detailed profile, performance history graph, activity log, strengths/weaknesses, and recent trend
5. THE Employee detail page SHALL display the agent's performance metrics from AgentPerformanceTracker: success rate, average quality score, total tasks, strengths, weaknesses, recent trend (improving/stable/declining)
6. THE Employee_Directory data SHALL be sourced from `agents/registry/*.yaml` files merged with `runtime/state/performance/` data

### Requirement 2: リアルタイム社員ステータス（Employee Status Tracking）

**User Story:** As a CEO, I want to 各社員が今何をしているかリアルタイムで確認できる, so that 会社の稼働状況を常に把握できる.

#### Acceptance Criteria

1. THE system SHALL track each Employee's real-time status as one of: `idle`, `working`, `in_meeting`, `reviewing`, `on_break`, `offline`
2. THE Employee_Directory page SHALL display each Employee's current status with a color-coded indicator (green=working, blue=in_meeting, yellow=idle, gray=offline)
3. WHEN an Employee's status changes, THE system SHALL record the transition with timestamp to `runtime/state/employee-status/`
4. THE Employee detail page SHALL show an activity timeline of status changes for the current day
5. THE Dashboard page SHALL include an "Employee Overview" section showing the count of employees in each status category
6. THE OrchestratorServer SHALL expose `GET /api/employees` and `GET /api/employees/:id` endpoints that return employee data with current status

### Requirement 3: デイリースタンドアップ（Daily Standup）

**User Story:** As a CEO, I want to 毎日の朝会で各社員の進捗と課題を把握できる, so that 問題を早期に発見し対処できる.

#### Acceptance Criteria

1. THE system SHALL provide a DailyStandupCoordinator that automatically generates a standup meeting when triggered by the CEO or on schedule
2. THE Daily_Standup SHALL collect from each active Employee: what they accomplished since last standup, what they plan to do next, and any blockers or concerns
3. THE Daily_Standup SHALL use MeetingCoordinator to conduct the standup as a structured meeting with COO/PM as facilitator
4. THE Daily_Standup results SHALL be persisted as Meeting_Minutes to `runtime/state/standups/<date>.json`
5. THE GUI SHALL provide a `/meetings` page that lists all meetings (standups, retrospectives, executive meetings) with date, type, and participant count
6. THE GUI SHALL display standup results in a card format showing each Employee's three items (done, planned, blockers) with visual indicators for blockers
7. THE OrchestratorServer SHALL expose `POST /api/meetings/standup` to trigger a standup and `GET /api/meetings` to list meetings

### Requirement 4: 日報・週報の自動生成（Automated Reports）

**User Story:** As a CEO, I want to 日報と週報が自動生成される, so that 手間なく会社の活動を振り返れる.

#### Acceptance Criteria

1. THE system SHALL automatically generate a Daily_Report for each Employee at the end of each workflow execution day, summarizing: tasks completed, quality scores, time spent, issues encountered
2. THE system SHALL automatically generate a Weekly_Report summarizing: total tasks completed, average quality, top performers, recurring issues, skill gap changes, hiring proposals
3. THE Daily_Report and Weekly_Report SHALL be persisted to `runtime/state/reports/daily/<date>.json` and `runtime/state/reports/weekly/<week>.json`
4. THE existing Reports page (`/reports`) SHALL be enhanced to display daily and weekly reports with filtering by date range and employee
5. THE Weekly_Report SHALL include a comparison with the previous week showing improvement or decline in key metrics
6. THE OrchestratorServer SHALL expose `GET /api/reports/daily` and `GET /api/reports/weekly` endpoints

### Requirement 5: 社内チャットログとアクティビティストリーム（Communication Visibility）

**User Story:** As a CEO, I want to 社員間のコミュニケーションと全社の活動をリアルタイムで見れる, so that 組織の動きを肌で感じられる.

#### Acceptance Criteria

1. THE system SHALL capture all Agent Bus messages and persist them as Chat_Log entries to `runtime/state/chat-logs/<date>.json`
2. THE GUI SHALL provide a chat log view (accessible from Employee detail page and a dedicated section) showing messages in chronological order with sender, recipient, timestamp, and content
3. THE Dashboard SHALL include an Activity_Stream section showing the most recent 20 activities across all employees (task started, task completed, review submitted, meeting held, etc.)
4. THE Activity_Stream SHALL auto-refresh every 5 seconds to provide near-real-time updates
5. THE Chat_Log SHALL categorize messages by type: task_assignment, review_feedback, meeting_discussion, escalation, general
6. THE OrchestratorServer SHALL expose `GET /api/chat-logs` with date and employee filters, and `GET /api/activity-stream` for recent activities

### Requirement 6: レトロスペクティブと社内ルール策定（Retrospective & Rule Generation）

**User Story:** As a CEO, I want to ワークフロー完了後に自動で振り返り会議が開催され、改善ルールが策定される, so that 組織が継続的に改善される.

#### Acceptance Criteria

1. THE system SHALL provide a RetrospectiveEngine that automatically triggers a Retrospective meeting after each workflow completion (delivery phase approved)
2. THE Retrospective SHALL use MeetingCoordinator to conduct a structured discussion with all agents who participated in the workflow
3. THE Retrospective agenda SHALL include: "What went well?", "What could be improved?", "What actions should we take?"
4. THE RetrospectiveEngine SHALL analyze the discussion and generate Internal_Rule proposals (e.g., "Always run integration tests before code review")
5. THE Internal_Rule proposals SHALL be persisted to `runtime/state/internal-rules/` and presented to the CEO for approval on the GUI
6. WHEN the CEO approves an Internal_Rule, THE system SHALL add it to `docs/company/auto-generated-rules.md` and incorporate it into future workflow prompts
7. THE GUI `/meetings` page SHALL display retrospective results with the generated rule proposals and approval status
8. THE OrchestratorServer SHALL expose `POST /api/meetings/retrospective` and `GET /api/internal-rules` endpoints

### Requirement 7: ナレッジベース（Knowledge Management）

**User Story:** As a CEO, I want to 過去のプロジェクトで得た学びが蓄積され検索できる, so that 同じ失敗を繰り返さず知識が組織に残る.

#### Acceptance Criteria

1. THE system SHALL provide a KnowledgeBaseManager that stores Knowledge_Entry items with: title, category (best_practice/failure_case/technical_note/process_improvement), content, related workflow IDs, author agent ID, tags, created date
2. THE system SHALL automatically generate Knowledge_Entry items from: retrospective action items, escalation resolutions, quality gate failure patterns, and successful workflow patterns
3. THE GUI SHALL provide a `/knowledge` page with search, category filter, and tag filter functionality
4. THE Knowledge_Entry detail view SHALL show the full content, related workflows (linked), and the author agent's profile
5. THE KnowledgeBaseManager SHALL provide a `search(query)` method that returns relevant entries ranked by relevance
6. THE Knowledge_Base data SHALL be persisted to `runtime/state/knowledge-base/`
7. THE WorkflowEngine SHALL query the Knowledge_Base at the proposal phase to include relevant past learnings in the meeting context
8. THE OrchestratorServer SHALL expose `GET /api/knowledge`, `POST /api/knowledge`, and `GET /api/knowledge/:id` endpoints

### Requirement 8: 仕様適合チェック（Spec Compliance）

**User Story:** As a CEO, I want to 成果物が提案書の仕様通りに実装されているか自動チェックされる, so that 納品物の品質を客観的に確認できる.

#### Acceptance Criteria

1. THE system SHALL provide a SpecComplianceChecker that compares the Proposal's task list and requirements against the actual deliverables
2. THE SpecComplianceChecker SHALL check: all proposed tasks have corresponding commits/changes, all proposed files exist, test coverage meets the proposed targets
3. THE SpecComplianceChecker SHALL generate a compliance report with: total requirements, implemented count, missing count, partial count, and compliance percentage
4. THE compliance report SHALL be included in the delivery phase and displayed on the workflow detail page's quality tab
5. IF the compliance percentage is below 80%, THE system SHALL flag the workflow for CEO review with specific missing items highlighted
6. THE OrchestratorServer SHALL expose `GET /api/workflows/:id/compliance` endpoint

### Requirement 9: 技術的負債トラッカー（Tech Debt Tracking）

**User Story:** As a CEO, I want to コード品質の経時変化を追跡できる, so that 技術的負債が蓄積する前に対処できる.

#### Acceptance Criteria

1. THE system SHALL track Tech_Debt metrics after each workflow QA phase: lint error count, test coverage percentage, test pass rate, code complexity indicators
2. THE system SHALL persist Tech_Debt snapshots to `runtime/state/tech-debt/<date>.json` with project ID and workflow ID
3. THE GUI SHALL provide a tech debt section on the KPI_Dashboard showing trend charts for lint errors, test coverage, and test pass rate over time
4. WHEN Tech_Debt metrics show a declining trend (e.g., coverage dropping below 70% or lint errors increasing by 20%), THE system SHALL generate an alert on the Dashboard
5. THE OrchestratorServer SHALL expose `GET /api/tech-debt` with date range and project filters

### Requirement 10: 経営会議（Executive Meeting）

**User Story:** As a CEO, I want to 定期的に経営会議を開催してKPIを確認し戦略を議論できる, so that 会社の方向性を適切に舵取りできる.

#### Acceptance Criteria

1. THE system SHALL provide an ExecutiveMeetingCoordinator that conducts an Executive_Meeting with COO/PM, QA, CFO, and Security Officer as participants
2. THE Executive_Meeting agenda SHALL include: KPI review (productivity, quality, cost), hiring proposals review, escalation pattern review, tech debt status, and strategic discussion
3. THE Executive_Meeting SHALL use MeetingCoordinator with AI-generated discussion based on actual data from PerformanceTracker, SkillGapDetector, EscalationAnalyzer, and Tech_Debt metrics
4. THE Executive_Meeting results SHALL include: decisions made, action items with owners, and strategic recommendations
5. THE GUI `/meetings` page SHALL display executive meeting results with KPI charts and decision summaries
6. THE CEO SHALL be able to trigger an Executive_Meeting from the GUI at any time via `POST /api/meetings/executive`

### Requirement 11: KPI/OKRダッシュボード（KPI Dashboard）

**User Story:** As a CEO, I want to 会社の主要指標を一目で確認できるダッシュボード, so that 経営判断に必要な情報がすぐ手に入る.

#### Acceptance Criteria

1. THE GUI SHALL provide a `/kpi` page displaying key performance indicators in chart format
2. THE KPI_Dashboard SHALL display: productivity (tasks completed per week), quality (average quality score, test coverage), cost (estimated token usage), growth (new skills acquired, knowledge entries added)
3. THE KPI_Dashboard SHALL show trend indicators (up/down/stable) for each metric compared to the previous period
4. THE KPI_Dashboard SHALL include an OKR section where the CEO can set quarterly objectives and track progress
5. THE OKR data SHALL be persisted to `runtime/state/okr/` and editable from the GUI
6. THE OrchestratorServer SHALL expose `GET /api/kpi` and `GET/PUT /api/okr` endpoints

### Requirement 12: 市場調査エージェント（Market Research）

**User Story:** As a CEO, I want to 市場動向や競合の情報を調査してサービス改善提案を受けたい, so that 競争力のあるプロダクトを作れる.

#### Acceptance Criteria

1. THE system SHALL provide a MarketResearchAgent (registered in `agents/registry/market_researcher.yaml`) capable of conducting web-based research
2. THE MarketResearchAgent SHALL accept research topics from the CEO and produce structured reports with: market overview, competitor analysis, technology trends, and improvement recommendations
3. THE Market_Research reports SHALL be persisted to `runtime/state/market-research/` with timestamp and topic
4. THE GUI SHALL provide a `/market` page where the CEO can submit research requests and view past research reports
5. THE MarketResearchAgent SHALL use available web search tools (or CodingAgent with web access) to gather current information
6. THE Market_Research reports SHALL include actionable recommendations that can be converted to workflow instructions
7. THE OrchestratorServer SHALL expose `POST /api/market-research` and `GET /api/market-research` endpoints

### Requirement 13: 社員のモチベーションと疲労度（Mood Tracking）

**User Story:** As a CEO, I want to 社員のモチベーションや疲労度を把握できる, so that 過負荷を防ぎ適切なケアができる.

#### Acceptance Criteria

1. THE system SHALL calculate a Mood_Score (0-100) for each Employee based on: recent success rate (weight 40%), workload (weight 30%), escalation frequency (weight 20%), and consecutive failure count (weight 10%)
2. THE Mood_Score SHALL be updated after each task completion or failure
3. THE Employee_Directory SHALL display Mood_Score as a visual indicator (emoji or color: green ≥70, yellow 40-69, red <40)
4. WHEN an Employee's Mood_Score drops below 40, THE system SHALL generate an alert on the Dashboard recommending the CEO take action (reduce workload, reassign tasks, or schedule 1-on-1)
5. THE Employee detail page SHALL show Mood_Score history as a trend chart
6. THE Mood_Score data SHALL be persisted to `runtime/state/employee-mood/`

### Requirement 14: 社員間関係性マップ（Relationship Map）

**User Story:** As a CEO, I want to 社員同士の協力関係やコミュニケーション頻度を可視化できる, so that チームダイナミクスを理解し最適なアサインができる.

#### Acceptance Criteria

1. THE system SHALL track interaction frequency between Employees based on: co-participation in meetings, review relationships (reviewer ↔ reviewee), task handoffs, and chat messages
2. THE GUI SHALL provide a Relationship_Map visualization on the Employee_Directory page showing connections between employees with line thickness representing interaction frequency
3. THE Relationship_Map SHALL highlight strong collaboration pairs and isolated employees
4. THE relationship data SHALL be persisted to `runtime/state/relationships/` and updated after each interaction
5. THE Employee detail page SHALL show the selected employee's top collaborators

### Requirement 15: キャリアパスと昇進制度（Career Path）

**User Story:** As a CEO, I want to 社員の成長に応じて昇進・降格を管理できる, so that 優秀な社員を適切に評価し組織を強化できる.

#### Acceptance Criteria

1. THE system SHALL define Career_Path levels: Junior → Mid → Senior → Lead → Principal, with promotion/demotion criteria based on PerformanceProfile metrics
2. THE system SHALL automatically suggest promotions when an Employee's success rate exceeds 85% and average quality exceeds 80 for 10+ consecutive tasks
3. THE system SHALL automatically suggest demotions when an Employee's success rate drops below 50% for 10+ consecutive tasks
4. THE CEO SHALL approve or reject promotion/demotion suggestions from the Employee detail page
5. THE Career_Path history SHALL be persisted to `runtime/state/career/` and displayed on the Employee detail page
6. WHEN an Employee is promoted, THE system SHALL update their `agents/registry/*.yaml` capabilities and announce it in the Activity_Stream

### Requirement 16: 月間MVP表彰（MVP Award）

**User Story:** As a CEO, I want to 毎月最も貢献した社員を自動選出して表彰できる, so that 社員のモチベーションを高め良い文化を作れる.

#### Acceptance Criteria

1. THE system SHALL automatically calculate MVP candidates at the end of each month based on: task completion count, average quality score, collaboration score (reviews given, meetings participated), and knowledge contributions
2. THE system SHALL present the top 3 MVP candidates to the CEO on the Dashboard with their scores and achievements
3. THE CEO SHALL select the MVP from the candidates or choose a different employee
4. THE MVP_Award history SHALL be persisted to `runtime/state/awards/` and displayed on the Employee_Directory page with a badge
5. THE MVP announcement SHALL be added to the Activity_Stream

### Requirement 17: 成果物デモ/プレビュー（Deliverable Preview）

**User Story:** As a CEO, I want to 完成した成果物を実際にプレビューして動作確認できる, so that 仕様通りに動くか自分の目で確かめられる.

#### Acceptance Criteria

1. THE delivery phase SHALL include a preview/demo step where the system attempts to build and serve the deliverable for CEO inspection
2. THE workflow detail page SHALL provide a "Preview" button that opens the deliverable in a new tab (for web projects) or shows build output (for CLI/library projects)
3. THE system SHALL capture screenshots or build output as part of the deliverable artifacts stored in `runtime/runs/<run-id>/preview/`
4. IF the preview build fails, THE system SHALL report the failure with error details on the workflow detail page
5. THE OrchestratorServer SHALL expose `POST /api/workflows/:id/preview` to trigger a preview build

