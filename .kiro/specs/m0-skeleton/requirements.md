# Requirements Document

## Introduction

AgentCompanyの「会社の骨格」を構築する。エージェント定義のスキーマ、固定エージェント（COO/PM、Quality Authority）、成果物フォーマット、基本的なワークフロー、AI実行基盤（Ollama）を整備し、サンプルチケットが Plan → Run → Report まで通ることを目指す。

## Glossary

- **Registry**: エージェント定義を格納するYAMLファイル群（`agents/registry/`）
- **COO_PM**: バックログ管理、アサイン、レポート生成を担当するオーケストレーターエージェント
- **Quality_Authority**: 成果物を評価し PASS/FAIL/WAIVER 判定を行うガバナンスエージェント
- **Ticket**: 作業単位を表すMarkdownファイル（`workflows/backlog/`）
- **Adapter**: AI CLIとの通信を抽象化するインターフェース
- **Ollama**: ローカルで動作するLLM実行環境（認証不要）

## Requirements

### Requirement 1: Registryスキーマ定義

**User Story:** As a システム管理者, I want to エージェント定義のスキーマを確定する, so that 一貫した形式でエージェントを登録できる.

#### Acceptance Criteria

1. THE Registry_Schema SHALL define required fields: id, title, responsibilities, capabilities, deliverables, quality_gates, budget, persona, escalation
2. THE Registry_Schema SHALL be documented as a YAML template in `agents/registry/templates/`
3. WHEN an agent definition is missing required fields, THE Validator SHALL report an error

### Requirement 2: COO/PM エージェント定義

**User Story:** As a 社長, I want to COO/PMエージェントを定義する, so that バックログ管理とタスクアサインを自動化できる.

#### Acceptance Criteria

1. THE COO_PM definition SHALL be stored in `agents/registry/coo_pm.yaml`
2. THE COO_PM SHALL have responsibilities for: backlog management, task assignment, execution instruction, result collection, report generation
3. THE COO_PM definition SHALL conform to the Registry_Schema

### Requirement 3: Quality Authority エージェント定義

**User Story:** As a 社長, I want to Quality Authorityエージェントを定義する, so that 成果物の品質判定を自動化できる.

#### Acceptance Criteria

1. THE Quality_Authority definition SHALL be stored in `agents/registry/quality_authority.yaml`
2. THE Quality_Authority SHALL have responsibilities for: reviewing PR/diff/logs, issuing PASS/FAIL/WAIVER judgments
3. THE Quality_Authority definition SHALL conform to the Registry_Schema

### Requirement 4: 成果物フォーマット定義

**User Story:** As a 開発者, I want to 成果物の標準フォーマットを定義する, so that 一貫した形式で納品できる.

#### Acceptance Criteria

1. THE Definition_of_Done document SHALL be stored in `docs/company/definition-of-done.md`
2. THE Definition_of_Done SHALL specify required sections: 目的, 変更点, テスト結果, E2E結果, ロールバック, リスク
3. WHEN a deliverable is missing required sections, THE Quality_Authority SHALL issue FAIL

### Requirement 5: Makefile雛形

**User Story:** As a 開発者, I want to 統一コマンドを定義する, so that 一貫した方法でビルド・テストを実行できる.

#### Acceptance Criteria

1. THE Makefile SHALL define targets: install, lint, test, e2e, ci
2. WHEN `make ci` is executed, THE System SHALL run all quality gates in sequence
3. THE Makefile SHALL be placed in the project root

### Requirement 6: チケットフォーマット定義

**User Story:** As a COO/PM, I want to チケットの標準フォーマットを定義する, so that 作業を一貫した形式で管理できる.

#### Acceptance Criteria

1. THE Ticket_Template SHALL be stored in `workflows/backlog/`
2. THE Ticket_Template SHALL specify required sections: 目的, 範囲, DoD, リスク, ロールバック
3. WHEN a ticket is created, THE COO_PM SHALL use the Ticket_Template

### Requirement 7: Ollamaアダプタ基盤

**User Story:** As a システム管理者, I want to AI実行基盤を抽象化する, so that 将来的に他のAI CLIに切り替えられる.

#### Acceptance Criteria

1. THE Base_Adapter interface SHALL be defined in `tools/adapters/base.ts`
2. THE Base_Adapter SHALL define methods: generate, chat, complete
3. THE Ollama_Adapter SHALL implement Base_Adapter in `tools/adapters/ollama.ts`
4. THE Ollama_Adapter SHALL communicate with Ollama REST API at `localhost:11434`
5. WHEN Ollama is not running, THE Ollama_Adapter SHALL return a clear error message

### Requirement 8: サンプルワークフロー実行

**User Story:** As a 社長, I want to サンプルチケットでワークフローを検証する, so that システムが正しく動作することを確認できる.

#### Acceptance Criteria

1. THE Sample_Ticket SHALL be created in `workflows/backlog/0001-sample.md`
2. WHEN the Sample_Ticket is processed, THE COO_PM SHALL generate a plan
3. WHEN the plan is executed, THE System SHALL produce a run log in `runtime/runs/`
4. WHEN the run completes, THE COO_PM SHALL generate a report
5. THE workflow Plan → Run → Report SHALL complete successfully (content may be minimal)
