# Requirements Document: Company Realism（組織リアリズム強化）

## Introduction

本ドキュメントは、AgentCompanyの「リアルな会社」としての体験をさらに深化させるための要件を定義する。

既存のReal Company Experience specでは、社員の可視化、日常業務サイクル、ナレッジベース、品質管理、経営戦略、企業文化の基盤を構築した。本specでは、その基盤の上に以下の5つの柱で組織のリアリティを強化する：

1. **部署構造のリアル化** — フラットな役割ベースから、部署間の連携・対立・協力が表現される組織構造へ
2. **エージェントの個性・思考スタイル** — 多様な思考スタイルを持つ人材が会議や意思決定で異なる視点をぶつけ合う
3. **ナレッジ蓄積の強化** — 既存ドキュメントの自動インデックス、失敗事例・成功パターンの積極的活用
4. **アジャイル開発サイクル** — スプリント→振り返り→改善のイテレーティブなサイクル運用
5. **会社状況分析ダッシュボード** — 組織健全性、ボトルネック分析、成長トレンドの俯瞰

### 設計原則

- **既存コンポーネントの拡張**: 破壊的変更を避け、既存のReal Company Experienceコンポーネントを拡張する
- **非侵襲的統合**: WorkflowEngineへの統合はtry/catch、オプショナル依存で行う
- **ファイルベース永続化**: runtime/state/配下にJSON形式で永続化
- **YAML拡張**: 既存のエージェント定義YAMLフォーマットを後方互換で拡張

## Glossary

- **Department**: 部署。複数のEmployeeが所属する組織単位。部署長（Department_Head）が管理する
- **Department_Head**: 部署長。部署内のメンバーを統括し、他部署との連携窓口となるEmployee
- **Department_Collaboration**: 部署間コラボレーション。複数部署が関与するワークフローでの協力関係
- **Thinking_Style**: 思考スタイル。Employeeの意思決定や議論における傾向（現実主義、革新派、慎重派、楽観主義等）
- **Personality_Trait**: 性格特性。Employeeの行動パターンに影響する特性（協調性、独立性、リーダーシップ等）
- **Meeting_Dynamics**: 会議ダイナミクス。異なるThinking_Styleを持つ参加者間の議論の相互作用
- **Document_Index**: ドキュメントインデックス。既存ドキュメント（docs/company/, docs/specs/, workflows/decisions/）を自動スキャンして構築する検索可能なインデックス
- **Knowledge_Source**: ナレッジソース。ナレッジベースに取り込む元データの種類（レトロスペクティブ、エスカレーション、ADR、仕様書等）
- **Sprint**: スプリント。1〜2週間の固定期間で区切られた開発イテレーション
- **Sprint_Backlog**: スプリントバックログ。スプリント期間中に完了を目指すチケットの集合
- **Sprint_Planning**: スプリントプランニング。スプリント開始時にバックログからチケットを選択し計画する会議
- **Sprint_Review**: スプリントレビュー。スプリント終了時に成果物をデモし振り返る会議
- **Velocity**: ベロシティ。スプリントあたりの完了タスク数（チームの生産能力指標）
- **Organization_Health**: 組織健全性。ムード平均、離職リスク、部署間コラボレーション度合い等の総合指標
- **Bottleneck_Analysis**: ボトルネック分析。どの部署・工程・エージェントで作業が滞留しているかの分析
- **Growth_Trend**: 成長トレンド。スキル獲得、ナレッジ蓄積、品質向上等の経時変化

## Requirements

### Requirement 1: 部署構造の定義と管理

**User Story:** As a CEO, I want to エージェントを部署単位で組織し管理できる, so that 現実の会社のような組織構造で業務を運営できる.

#### Acceptance Criteria

1. THE system SHALL define a Department structure with: department ID, name, description, Department_Head agent ID, and member agent IDs
2. THE system SHALL provide default departments: "開発部"（Development）, "品質管理部"（Quality Assurance）, "経営企画部"（Corporate Planning）, "人事部"（Human Resources）, with appropriate agent assignments
3. THE Department configuration SHALL be persisted to `runtime/state/departments/config.json` and editable by the CEO from the GUI
4. WHEN the CEO views the Employee_Directory, THE GUI SHALL display a department-grouped view showing agents organized by their department with Department_Head highlighted
5. THE OrchestratorServer SHALL expose `GET /api/departments` and `PUT /api/departments` endpoints for department configuration management

### Requirement 2: 部署間コラボレーションの追跡と可視化

**User Story:** As a CEO, I want to 部署間の連携状況を把握できる, so that 組織のサイロ化を防ぎ効果的なコラボレーションを促進できる.

#### Acceptance Criteria

1. WHEN a workflow involves agents from multiple departments, THE system SHALL record a Department_Collaboration entry with: participating department IDs, workflow ID, collaboration type (joint_review, cross_department_task, shared_meeting), and timestamp
2. THE system SHALL persist Department_Collaboration data to `runtime/state/departments/collaborations.json`
3. THE GUI SHALL display a department collaboration matrix on the organization analysis dashboard showing interaction frequency between each department pair
4. THE system SHALL calculate a collaboration score (0-100) for each department pair based on interaction frequency over the past 30 days
5. WHEN a department's collaboration score with all other departments falls below 20, THE system SHALL generate an isolation alert on the Dashboard

### Requirement 3: エージェントの思考スタイル定義

**User Story:** As a CEO, I want to 各エージェントに固有の思考スタイルと性格特性を持たせたい, so that 会議や意思決定で多様な視点が反映されリアルな議論が生まれる.

#### Acceptance Criteria

1. THE system SHALL extend the agent registry YAML format with an optional `thinking_style` field containing: primary style (one of: realist, innovator, cautious, optimist, analyst, pragmatist), secondary style, and a description of how the style influences decision-making
2. THE system SHALL extend the agent registry YAML format with an optional `personality_traits` field containing: a list of traits (e.g., collaborative, independent, detail_oriented, big_picture, risk_taker, risk_averse) with intensity scores (1-5)
3. THE system SHALL provide default Thinking_Style and Personality_Trait assignments for all existing agents that align with their roles (e.g., Quality Authority as cautious/analyst, COO/PM as pragmatist/realist)
4. THE Employee detail page SHALL display the agent's Thinking_Style and Personality_Traits as visual indicators
5. THE system SHALL persist Thinking_Style and Personality_Trait data by reading from the agent registry YAML files at runtime

### Requirement 4: 会議における思考スタイルの反映

**User Story:** As a CEO, I want to 会議でエージェントの思考スタイルに基づいた多様な意見が出る, so that 一面的でない深い議論が行われる.

#### Acceptance Criteria

1. WHEN MeetingCoordinator generates agent statements for a meeting, THE system SHALL incorporate each participant's Thinking_Style into the prompt to produce style-consistent opinions (e.g., a cautious agent raises risks, an innovator proposes novel approaches)
2. WHEN a meeting has participants with conflicting Thinking_Styles (e.g., innovator vs cautious), THE system SHALL generate a Meeting_Dynamics summary noting the key disagreements and how they were resolved
3. THE meeting minutes SHALL include a "perspectives" section listing each participant's stance categorized by their Thinking_Style
4. THE GUI meeting detail page SHALL visually distinguish different Thinking_Styles in the discussion display using color-coded labels

### Requirement 5: 既存ドキュメントの自動インデックス

**User Story:** As a CEO, I want to 既存の社内ドキュメントが自動的にナレッジベースに取り込まれる, so that 過去の意思決定や仕様が検索可能になり組織の記憶として活用できる.

#### Acceptance Criteria

1. THE system SHALL provide a DocumentIndexer component that scans and indexes documents from: `docs/company/`, `docs/specs/`, `docs/architecture/`, and `workflows/decisions/`
2. THE DocumentIndexer SHALL extract metadata from each document: file path, title (from first heading), category (policy, spec, architecture, decision), last modified date, and a content summary
3. THE DocumentIndexer SHALL persist the index to `runtime/state/knowledge-base/document-index.json`
4. THE KnowledgeBaseManager search method SHALL include Document_Index results alongside regular Knowledge_Entry results, with source type clearly distinguished
5. THE GUI `/knowledge` page SHALL display indexed documents in a separate "社内ドキュメント" tab with file path links
6. THE DocumentIndexer SHALL support incremental updates by checking file modification timestamps against the last index time

### Requirement 6: ナレッジソースの拡充

**User Story:** As a CEO, I want to より多くの情報源からナレッジが自動蓄積される, so that 組織の学習サイクルが加速する.

#### Acceptance Criteria

1. WHEN a workflow completes with quality gate failures, THE KnowledgeBaseManager SHALL automatically generate a "failure_case" entry documenting the failure pattern, root cause analysis, and resolution steps
2. WHEN a new ADR (Architecture Decision Record) is created in `workflows/decisions/`, THE DocumentIndexer SHALL detect and index the new document within the next indexing cycle
3. WHEN a sprint review identifies recurring issues, THE system SHALL generate "process_improvement" entries in the Knowledge_Base with actionable recommendations
4. THE Knowledge_Entry creation SHALL include a `source_type` field indicating the origin: "retrospective", "escalation", "quality_gate_failure", "document_index", "sprint_review", or "manual"
5. THE GUI `/knowledge` page SHALL provide filtering by source_type to help the CEO trace where knowledge originated

### Requirement 7: スプリント管理

**User Story:** As a CEO, I want to アジャイルなスプリントサイクルで開発を管理できる, so that 定期的な振り返りと改善のリズムが生まれる.

#### Acceptance Criteria

1. THE system SHALL provide a SprintManager component that manages Sprint lifecycle: planning, active, review, completed
2. THE Sprint SHALL have: sprint ID, name, goal, start date, end date, Sprint_Backlog (list of ticket IDs), status, and Velocity metrics
3. THE CEO SHALL be able to create a new Sprint from the GUI specifying name, goal, duration (1 or 2 weeks), and selecting tickets from the backlog
4. THE Sprint data SHALL be persisted to `runtime/state/sprints/` with one JSON file per sprint
5. THE GUI SHALL provide a `/sprints` page showing the current active sprint with progress, and a history of past sprints with Velocity trends
6. THE OrchestratorServer SHALL expose `GET /api/sprints`, `POST /api/sprints`, and `PUT /api/sprints/:id` endpoints

### Requirement 8: スプリントプランニングとレビュー

**User Story:** As a CEO, I want to スプリント開始時にプランニング会議、終了時にレビュー会議を開催できる, so that チーム全体で計画と振り返りを共有できる.

#### Acceptance Criteria

1. WHEN a new Sprint is created, THE system SHALL automatically trigger a Sprint_Planning meeting using MeetingCoordinator with COO/PM and relevant department heads as participants
2. THE Sprint_Planning meeting SHALL produce: prioritized ticket list, agent assignments, risk assessment, and estimated Velocity
3. WHEN a Sprint reaches its end date or the CEO manually closes it, THE system SHALL automatically trigger a Sprint_Review meeting
4. THE Sprint_Review meeting SHALL include: completed vs planned comparison, demo of deliverables, Velocity calculation, and improvement suggestions
5. THE Sprint_Review results SHALL feed into the RetrospectiveEngine to generate improvement rules and Knowledge_Base entries
6. THE GUI sprint detail page SHALL display planning and review meeting results with links to the meeting minutes

### Requirement 9: 組織健全性ダッシュボード

**User Story:** As a CEO, I want to 組織全体の健全性を一目で把握できるダッシュボード, so that 問題の兆候を早期に発見し対処できる.

#### Acceptance Criteria

1. THE GUI SHALL provide an organization health section on the `/kpi` page displaying: average Mood_Score across all employees, number of mood alerts, department collaboration scores, and attrition risk indicators
2. THE system SHALL calculate an overall Organization_Health score (0-100) based on: average mood (weight 30%), collaboration score (weight 20%), task success rate (weight 25%), and knowledge growth rate (weight 25%)
3. THE Organization_Health score SHALL be displayed prominently on the Dashboard with trend indicator (improving/stable/declining)
4. WHEN the Organization_Health score drops below 50, THE system SHALL generate a critical alert on the Dashboard with specific contributing factors highlighted
5. THE system SHALL persist Organization_Health snapshots to `runtime/state/org-health/` for trend analysis

### Requirement 10: ボトルネック分析

**User Story:** As a CEO, I want to どの部署・工程・エージェントで作業が滞留しているか分析できる, so that リソース配分を最適化し生産性を向上できる.

#### Acceptance Criteria

1. THE system SHALL provide a BottleneckAnalyzer component that analyzes workflow execution data to identify: agents with high task queue depth, departments with low throughput, workflow phases where tasks spend the most time, and recurring failure points
2. THE Bottleneck_Analysis results SHALL include: bottleneck location (agent/department/phase), severity (high/medium/low), average wait time, suggested remediation actions
3. THE GUI SHALL display Bottleneck_Analysis results on the `/kpi` page as a visual heatmap showing where work is accumulating
4. THE BottleneckAnalyzer SHALL run automatically after each workflow completion and persist results to `runtime/state/bottleneck/`
5. THE OrchestratorServer SHALL expose `GET /api/bottleneck` endpoint returning the latest analysis results

### Requirement 11: 成長トレンド分析

**User Story:** As a CEO, I want to 組織の成長を多角的に追跡できる, so that 長期的な組織発展の方向性を確認できる.

#### Acceptance Criteria

1. THE system SHALL track Growth_Trend metrics including: new skills acquired per sprint, Knowledge_Base entries added per sprint, average quality score improvement over time, sprint Velocity trend, and department capability expansion
2. THE GUI `/kpi` page SHALL display Growth_Trend charts showing the above metrics over the past 10 sprints or 3 months
3. THE system SHALL calculate a growth rate percentage comparing the current period to the previous period for each metric
4. THE Growth_Trend data SHALL be aggregated from existing data sources (PerformanceTracker, KnowledgeBaseManager, SprintManager) and persisted to `runtime/state/growth-trends/`
5. THE OrchestratorServer SHALL expose `GET /api/growth-trends` endpoint with period filter parameters
