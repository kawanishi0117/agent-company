# Requirements Document

## Introduction

M5: 採用システム（Hiring System）は、AgentCompanyにおいて新しいエージェントを採用・登録するためのシステムである。Hiring Managerエージェントが採用プロセスを管理し、JD（Job Description）生成、面接課題の作成、試用実行、スコア化、Registry登録までの一連のフローを提供する。

## Glossary

- **Hiring_Manager**: 採用プロセスを管理するエージェント。JD生成から登録までを担当
- **JD（Job_Description）**: 採用するエージェントの役割・責務・必要スキルを定義した文書
- **Interview_Task**: 候補エージェントの能力を評価するための小タスク（面接課題）
- **Trial_Run**: 候補エージェントに面接課題を実行させる試用実行
- **Score**: 試用実行の結果を数値化した評価スコア
- **Registry**: エージェント定義を格納する `agents/registry/` ディレクトリ
- **Candidate_Agent**: 採用候補となるエージェント定義
- **Hiring_CLI**: 採用フローを実行するCLIコマンド群

## Requirements

### Requirement 1: Hiring Managerエージェント定義

**User Story:** As a COO/PM, I want to have a Hiring Manager agent, so that I can delegate the recruitment process to a specialized agent.

#### Acceptance Criteria

1. THE Hiring_Manager SHALL be defined in `agents/registry/hiring_manager.yaml` following the standard agent template format
2. THE Hiring_Manager SHALL have responsibilities including JD generation, interview task creation, trial execution, scoring, and registry registration
3. THE Hiring_Manager SHALL have escalation rules to Quality_Authority for quality-related decisions
4. WHEN the Hiring_Manager definition is validated, THE Validator SHALL confirm all required fields are present

### Requirement 2: JD（Job Description）生成

**User Story:** As a Hiring Manager, I want to generate Job Descriptions, so that I can clearly define what kind of agent is needed.

#### Acceptance Criteria

1. WHEN a hiring request is received, THE Hiring_CLI SHALL generate a JD based on the specified role requirements
2. THE JD SHALL include: role title, responsibilities, required capabilities, deliverables, quality gates, and budget constraints
3. THE JD SHALL be saved as a Markdown file in `runtime/runs/<run-id>/jd.md`
4. WHEN generating a JD, THE Hiring_CLI SHALL validate that all required sections are present
5. THE JD format SHALL be compatible with the agent template schema

### Requirement 3: 面接課題（Interview Task）生成

**User Story:** As a Hiring Manager, I want to generate interview tasks, so that I can evaluate candidate agents' capabilities.

#### Acceptance Criteria

1. WHEN a JD is approved, THE Hiring_CLI SHALL generate interview tasks based on the JD requirements
2. THE Interview_Task SHALL be a small, executable task that tests specific capabilities defined in the JD
3. THE Interview_Task SHALL include: task description, expected deliverables, evaluation criteria, and time limit
4. THE Interview_Task SHALL be saved as a Markdown file in `runtime/runs/<run-id>/interview_task.md`
5. WHEN generating interview tasks, THE Hiring_CLI SHALL ensure tasks are achievable within the candidate's budget constraints

### Requirement 4: 試用実行（Trial Run）

**User Story:** As a Hiring Manager, I want to execute trial runs, so that I can observe how candidate agents perform on interview tasks.

#### Acceptance Criteria

1. WHEN an interview task is ready, THE Hiring_CLI SHALL execute a trial run with the candidate agent
2. THE Trial_Run SHALL execute in the Docker isolated environment following company security policies
3. THE Trial_Run SHALL capture all outputs, logs, and artifacts in `runtime/runs/<run-id>/trial/`
4. WHEN a trial run completes, THE Hiring_CLI SHALL record the execution time and resource usage
5. IF a trial run exceeds budget constraints, THEN THE Hiring_CLI SHALL terminate the run and record the failure reason

### Requirement 5: スコア化（Scoring）

**User Story:** As a Hiring Manager, I want to score trial run results, so that I can objectively evaluate candidate agents.

#### Acceptance Criteria

1. WHEN a trial run completes, THE Hiring_CLI SHALL calculate a score based on predefined criteria
2. THE Score SHALL be calculated from: task completion (0-40 points), quality gate compliance (0-30 points), and efficiency (0-30 points)
3. THE Scoring_Result SHALL include: total score, breakdown by category, pass/fail determination, and detailed feedback
4. THE Scoring_Result SHALL be saved as JSON in `runtime/runs/<run-id>/score.json`
5. WHEN scoring, THE Hiring_CLI SHALL apply a minimum passing threshold of 60 points
6. THE Scoring_Result SHALL be human-readable and include justification for each score component

### Requirement 6: Registry登録フロー

**User Story:** As a Hiring Manager, I want to register approved agents to the Registry, so that they can be assigned tasks by COO/PM.

#### Acceptance Criteria

1. WHEN a candidate agent passes the scoring threshold, THE Hiring_CLI SHALL initiate the registry registration flow
2. THE Registration_Flow SHALL validate the candidate agent definition against the agent template schema
3. THE Registration_Flow SHALL copy the agent definition to `agents/registry/<agent_id>.yaml`
4. WHEN registration is complete, THE Hiring_CLI SHALL update the hiring log in `runtime/runs/<run-id>/hiring_log.md`
5. IF registration fails validation, THEN THE Hiring_CLI SHALL report specific validation errors and reject registration
6. THE Registration_Flow SHALL prevent duplicate agent IDs in the registry

### Requirement 7: CLIコマンド実装

**User Story:** As a user, I want to use CLI commands for the hiring process, so that I can easily manage agent recruitment.

#### Acceptance Criteria

1. THE Hiring_CLI SHALL provide a `hire` command with subcommands: `jd`, `interview`, `trial`, `score`, `register`, and `full`
2. WHEN `hire jd <role>` is executed, THE Hiring_CLI SHALL generate a JD for the specified role
3. WHEN `hire interview <jd-path>` is executed, THE Hiring_CLI SHALL generate interview tasks from the JD
4. WHEN `hire trial <candidate-path> <task-path>` is executed, THE Hiring_CLI SHALL run a trial with the candidate
5. WHEN `hire score <run-id>` is executed, THE Hiring_CLI SHALL calculate and display the score
6. WHEN `hire register <candidate-path>` is executed, THE Hiring_CLI SHALL register the candidate to the registry
7. WHEN `hire full <role> <candidate-path>` is executed, THE Hiring_CLI SHALL run the complete hiring flow
8. THE Hiring_CLI SHALL provide `--help` option for each subcommand with usage examples

### Requirement 8: 採用ログと監査

**User Story:** As a Quality Authority, I want to audit the hiring process, so that I can ensure compliance with company policies.

#### Acceptance Criteria

1. THE Hiring_CLI SHALL log all hiring activities to `runtime/runs/<run-id>/hiring_log.md`
2. THE Hiring_Log SHALL include: timestamps, actions taken, decisions made, and responsible parties
3. WHEN a hiring decision is made, THE Hiring_CLI SHALL record the rationale and supporting evidence
4. THE Hiring_Log SHALL be in a format compatible with the existing reporting system
5. WHEN an agent is registered, THE Hiring_CLI SHALL notify COO/PM that a new agent is available
