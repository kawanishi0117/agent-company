# Requirements Document

## Introduction

AgentCompanyの「品質ゲート」を構築する。ESLint + Prettierによる静的解析、Vitestによるユニットテスト、PlaywrightによるE2Eテストを統合し、`make ci`で全ゲートを一括実行できるようにする。E2E失敗時にはスクリーンショット・動画を保存し、デバッグを容易にする。

## Glossary

- **Quality Gate**: コードが満たすべき品質基準のチェックポイント
- **Lint**: 静的解析（ESLint + Prettier）
- **Unit Test**: 単体テスト（Vitest）
- **E2E Test**: エンドツーエンドテスト（Playwright）
- **Coverage**: テストカバレッジ（コードの何%がテストされているか）
- **Artifact**: テスト失敗時に保存される成果物（スクリーンショット、動画、トレース）

## Requirements

### Requirement 1: make lint 実装

**User Story:** As a 開発者, I want to `make lint`で静的解析を実行する, so that コードスタイルと潜在的なバグを検出できる.

#### Acceptance Criteria

1. WHEN `make lint` is executed, THE System SHALL run ESLint on all TypeScript files
2. WHEN `make lint` is executed, THE System SHALL run Prettier format check
3. WHEN lint errors exist, THE System SHALL return non-zero exit code
4. WHEN lint passes, THE System SHALL return exit code 0
5. THE lint configuration SHALL ignore `dist`, `node_modules`, `runtime` directories

### Requirement 2: make test 実装

**User Story:** As a 開発者, I want to `make test`でユニットテストを実行する, so that コードの正確性を検証できる.

#### Acceptance Criteria

1. WHEN `make test` is executed, THE System SHALL run Vitest on all test files in `tests/`
2. WHEN `make test` is executed, THE System SHALL generate coverage report
3. WHEN any test fails, THE System SHALL return non-zero exit code
4. WHEN all tests pass, THE System SHALL return exit code 0
5. THE coverage report SHALL be output to `coverage/` directory

### Requirement 3: make e2e 実装

**User Story:** As a 開発者, I want to `make e2e`でE2Eテストを実行する, so that システム全体の動作を検証できる.

#### Acceptance Criteria

1. WHEN `make e2e` is executed, THE System SHALL run Playwright tests
2. THE E2E tests SHALL verify at least one critical user flow
3. WHEN E2E test fails, THE System SHALL return non-zero exit code
4. WHEN all E2E tests pass, THE System SHALL return exit code 0
5. THE Playwright configuration SHALL be stored in `playwright.config.ts`

### Requirement 4: E2E失敗時の成果物保存

**User Story:** As a 開発者, I want to E2E失敗時にスクリーンショットと動画を保存する, so that 失敗原因を調査できる.

#### Acceptance Criteria

1. WHEN an E2E test fails, THE System SHALL capture a screenshot
2. WHEN an E2E test fails, THE System SHALL save a video recording
3. THE artifacts SHALL be saved to `runtime/e2e-artifacts/` directory
4. THE artifacts SHALL include timestamp and test name in filename
5. WHEN E2E test passes, THE System SHALL NOT save video (to save space)

### Requirement 5: make ci 実装

**User Story:** As a 開発者, I want to `make ci`で全品質ゲートを実行する, so that 一括で品質チェックできる.

#### Acceptance Criteria

1. WHEN `make ci` is executed, THE System SHALL run lint, test, and e2e in sequence
2. WHEN any gate fails, THE System SHALL stop and return non-zero exit code
3. WHEN all gates pass, THE System SHALL return exit code 0 and display success message
4. THE ci command SHALL display which gate failed (if any)

### Requirement 6: カバレッジ基準

**User Story:** As a Quality Authority, I want to カバレッジ基準を設定する, so that テスト品質を担保できる.

#### Acceptance Criteria

1. THE coverage threshold SHALL be configurable in vitest.config.ts
2. THE default coverage threshold SHALL be 80% for lines
3. WHEN coverage is below threshold, THE test command SHALL warn (not fail by default)
4. THE coverage report SHALL show uncovered lines
