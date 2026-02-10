# Requirements Document

## Introduction

本ドキュメントは、AIエージェントが実際にタスクを実行し、コードを生成・修正して成果物を納品するまでの統合機能の要件を定義する。

既存のインフラ（OllamaAdapter、WorkerAgent、ManagerAgent、Orchestrator）は実装済みだが、実際のE2Eワークフローとして動作することを検証し、不足している統合部分を補完する。

ユーザー（社長）がGUIからタスクを送信すると、AIエージェントが自動的に作業を開始し、コードを生成・修正して品質ゲートを通過させ、成果物をレポートとして確認できる状態を目指す。

## Glossary

- **Orchestrator_Server**: GUI-Orchestrator連携用のHTTP APIサーバー
- **AI_Adapter**: Ollama等のAI実行基盤との接続アダプタ
- **Worker_Agent**: 実際のコード生成・ファイル操作を行うエージェント
- **Manager_Agent**: タスク分解とワーカー管理を行うエージェント
- **Quality_Gate**: lint/testの自動実行と結果判定
- **Execution_Result**: タスク実行の結果（成功/失敗/部分完了）
- **Conversation_History**: AIとの会話履歴
- **Run_Directory**: 実行ごとの成果物保存ディレクトリ（`runtime/runs/<run-id>/`）

## Requirements

### Requirement 1: AI実行基盤の可用性確認

**User Story:** As a システム管理者, I want to AI実行基盤の状態を確認できる, so that 問題発生時に適切に対応できる.

#### Acceptance Criteria

1. WHEN the system starts, THE Orchestrator SHALL check AI adapter availability
2. IF Ollama is not available, THEN THE System SHALL display a clear error message with setup instructions
3. THE System SHALL provide a health check endpoint `/api/health/ai` that returns adapter status
4. WHEN Ollama is available but no model is installed, THE System SHALL suggest model installation commands
5. THE System SHALL support graceful degradation when AI is temporarily unavailable

### Requirement 2: GUIからのタスク送信フロー

**User Story:** As a ユーザー（社長）, I want to GUIからタスクを送信してAIに作業させる, so that 手動でコマンドを実行せずに開発を進められる.

#### Acceptance Criteria

1. WHEN a user submits a task from Command Center, THE System SHALL forward it to Orchestrator Server
2. THE Orchestrator Server SHALL validate the task and return a run ID immediately
3. THE System SHALL display task progress in real-time on Dashboard
4. WHEN a task is submitted, THE System SHALL create a run directory at `runtime/runs/<run-id>/`
5. THE System SHALL persist task metadata to `runtime/runs/<run-id>/task.json`

### Requirement 3: AIエージェント実行フロー

**User Story:** As a システム, I want to AIエージェントがタスクを自律的に実行する, so that 人間の介入なしに作業が進む.

#### Acceptance Criteria

1. WHEN a task is received, THE Manager_Agent SHALL decompose it into sub-tasks
2. THE Manager_Agent SHALL assign sub-tasks to appropriate Worker_Agents
3. THE Worker_Agent SHALL execute tools (read_file, write_file, run_command, etc.) based on AI responses
4. WHEN a Worker_Agent completes a sub-task, THE System SHALL notify Manager_Agent
5. THE Worker_Agent SHALL save conversation history to `runtime/runs/<run-id>/conversation.json`
6. IF a Worker_Agent fails, THE Manager_Agent SHALL retry or escalate

### Requirement 4: 品質ゲート統合

**User Story:** As a システム, I want to 品質ゲートを自動実行する, so that 品質基準を満たした成果物のみが納品される.

#### Acceptance Criteria

1. WHEN a Worker_Agent completes code changes, THE System SHALL run lint automatically
2. WHEN lint passes, THE System SHALL run tests automatically
3. THE System SHALL record quality gate results to `runtime/runs/<run-id>/quality.json`
4. IF quality gate fails, THE System SHALL notify Worker_Agent with failure details
5. THE Worker_Agent SHALL attempt to fix issues based on quality gate feedback

### Requirement 5: 成果物収集と保存

**User Story:** As a ユーザー, I want to 完了したタスクの成果物を確認できる, so that 作業結果を検証できる.

#### Acceptance Criteria

1. WHEN a task completes, THE System SHALL collect all artifacts to Run_Directory
2. THE System SHALL generate a summary report at `runtime/runs/<run-id>/report.md`
3. THE report SHALL include: task description, changes made, test results, conversation summary
4. THE System SHALL preserve all modified files in `runtime/runs/<run-id>/artifacts/`
5. THE GUI SHALL display artifacts and report on Runs detail page

### Requirement 6: エラーハンドリングと通知

**User Story:** As a ユーザー, I want to エラー発生時に通知を受ける, so that 問題に対応できる.

#### Acceptance Criteria

1. WHEN an error occurs, THE System SHALL log it to `runtime/runs/<run-id>/errors.log`
2. THE System SHALL display error status on Dashboard with error category
3. IF AI adapter becomes unavailable during execution, THE System SHALL pause and notify user
4. THE System SHALL support manual retry of failed tasks from GUI
5. WHEN a task fails permanently, THE System SHALL generate a failure report

### Requirement 7: 実行状態の可視化

**User Story:** As a ユーザー, I want to 実行状態をリアルタイムで確認できる, so that 進捗を把握できる.

#### Acceptance Criteria

1. THE Dashboard SHALL show active workers count and their current tasks
2. THE Dashboard SHALL show pending tasks queue length
3. THE Dashboard SHALL show completed tasks count and success rate
4. THE System SHALL update Dashboard every 5 seconds
5. THE Task detail page SHALL show real-time conversation log

### Requirement 8: 設定管理

**User Story:** As a システム管理者, I want to AI実行設定を管理できる, so that 環境に合わせて調整できる.

#### Acceptance Criteria

1. THE Settings page SHALL allow selection of AI adapter (Ollama, etc.)
2. THE Settings page SHALL allow configuration of Ollama host URL
3. THE Settings page SHALL allow selection of AI model
4. THE System SHALL validate settings before saving
5. WHEN settings are changed, THE System SHALL apply them without restart

