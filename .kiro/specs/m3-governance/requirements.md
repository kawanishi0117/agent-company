# Requirements Document

## Introduction

AgentCompanyの「Governance判定」機能を構築する。Quality Authorityが成果物・テスト結果・コード変更を評価し、`PASS/FAIL/WAIVER`の判定を発行する。Waiverは例外承認として、期限・理由・フォロータスクを必須とし、`workflows/waivers/`で管理する。

## Glossary

- **Quality Authority**: 品質判定を行う固定エージェント
- **PASS**: 品質基準を満たした合格判定
- **FAIL**: 品質基準を満たさない不合格判定
- **WAIVER**: 例外承認（一時的に基準を緩和）
- **Judgment**: Quality Authorityが発行する判定結果
- **Waiver Template**: 例外承認申請の雛形

## Requirements

### Requirement 1: Quality Authority判定ロジック

**User Story:** As a COO/PM, I want to Quality Authorityに判定を依頼する, so that 成果物の品質を客観的に評価できる.

#### Acceptance Criteria

1. WHEN `npx ts-node tools/cli/agentcompany.ts judge <run-id>` is executed, THE System SHALL evaluate the specified run
2. THE judgment SHALL check: lint結果、test結果、e2e結果、成果物フォーマット
3. WHEN all checks pass, THE System SHALL return `PASS` judgment
4. WHEN any check fails, THE System SHALL return `FAIL` judgment with reasons
5. THE judgment logic SHALL be implemented in `tools/cli/commands/judge.ts`

### Requirement 2: PASS/FAIL/WAIVER出力フォーマット

**User Story:** As a 開発者, I want to 判定結果を構造化されたフォーマットで受け取る, so that 結果を自動処理できる.

#### Acceptance Criteria

1. THE judgment output SHALL be in JSON format
2. THE output SHALL include: `status` (PASS/FAIL/WAIVER), `timestamp`, `run_id`, `checks`, `reasons`
3. THE `checks` field SHALL contain individual check results (lint, test, e2e, format)
4. WHEN status is FAIL, THE `reasons` field SHALL list all failure reasons
5. WHEN status is WAIVER, THE output SHALL include `waiver_id` reference
6. THE output SHALL be saved to `runtime/runs/<run-id>/judgment.json`

### Requirement 3: Waiverテンプレート作成

**User Story:** As a 開発者, I want to Waiverテンプレートを使用する, so that 例外申請を正しいフォーマットで作成できる.

#### Acceptance Criteria

1. THE System SHALL provide a Waiver template at `workflows/waivers/TEMPLATE.md`
2. THE template SHALL include all required fields: 申請日, 申請者, 対象, 理由, 緊急性, 代替策, 期限, フォロータスク, 承認者, ステータス
3. WHEN `npx ts-node tools/cli/agentcompany.ts waiver create <title>` is executed, THE System SHALL generate a new waiver file from template
4. THE generated waiver file SHALL be named `YYYY-MM-DD-<title>.md`
5. THE generated waiver file SHALL be placed in `workflows/waivers/`

### Requirement 4: Waiver必須項目チェック

**User Story:** As a Quality Authority, I want to Waiverの必須項目をチェックする, so that 不完全な例外申請を防げる.

#### Acceptance Criteria

1. WHEN `npx ts-node tools/cli/agentcompany.ts waiver validate <waiver-file>` is executed, THE System SHALL check required fields
2. THE validation SHALL check: 期限が設定されている, 理由が記載されている, フォロータスクが1つ以上ある
3. WHEN validation fails, THE System SHALL return non-zero exit code and list missing fields
4. WHEN validation passes, THE System SHALL return exit code 0
5. THE validation logic SHALL be implemented in `tools/cli/commands/waiver.ts`

### Requirement 5: Waiver期限管理

**User Story:** As a Quality Authority, I want to 期限切れWaiverを検出する, so that 例外が放置されることを防げる.

#### Acceptance Criteria

1. WHEN `npx ts-node tools/cli/agentcompany.ts waiver list` is executed, THE System SHALL list all waivers with status
2. THE list SHALL show: ファイル名, タイトル, 期限, ステータス, 期限超過フラグ
3. WHEN a waiver's deadline has passed, THE System SHALL mark it as `OVERDUE`
4. THE list output SHALL be in table format for readability
5. THE list SHALL support `--overdue` flag to show only overdue waivers

### Requirement 6: 判定結果の再現性

**User Story:** As a 開発者, I want to PASS/FAIL/WAIVERの各判定を再現できる, so that 判定ロジックをテストできる.

#### Acceptance Criteria

1. THE System SHALL provide example runs that produce PASS judgment
2. THE System SHALL provide example runs that produce FAIL judgment
3. THE System SHALL provide example waiver that demonstrates WAIVER flow
4. THE examples SHALL be documented in `docs/specs/m3-governance.md`
5. THE judgment command SHALL be idempotent (same input produces same output)
