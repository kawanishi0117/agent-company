# Requirements Document

## Introduction

AgentCompanyのGUIダッシュボードを構築する。Next.jsを使用し、Backlog（チケット管理）、Runs（実行ログ・成果物）、Reports（日次/週次レポート）の3画面を提供する。`runtime/runs/`および`workflows/`からデータを読み込み、現在の作業状況をリアルタイムで可視化する。

## Glossary

- **Dashboard**: AgentCompanyの状態を一覧表示するWebアプリケーション
- **Backlog**: チケット（タスク）の一覧画面
- **Runs**: 実行ログと成果物の一覧画面
- **Reports**: 日次・週次レポートの一覧画面
- **Ticket**: `workflows/backlog/`に格納されるMarkdownファイル
- **Run**: `runtime/runs/<run-id>/`に格納される実行結果
- **Judgment**: Quality Authorityによる判定結果（PASS/FAIL/WAIVER）

## Requirements

### Requirement 1: Next.jsプロジェクトセットアップ

**User Story:** As a 開発者, I want to GUIプロジェクトを初期化する, so that ダッシュボード開発を開始できる.

#### Acceptance Criteria

1. THE System SHALL create a Next.js project in `gui/web/` directory
2. THE project SHALL use TypeScript for type safety
3. THE project SHALL use Tailwind CSS for styling
4. THE project SHALL use App Router (Next.js 14+)
5. THE project SHALL include ESLint and Prettier configuration consistent with the root project
6. WHEN `npm run dev` is executed in `gui/web/`, THE System SHALL start a development server on port 3000

### Requirement 2: 共通レイアウトとナビゲーション

**User Story:** As a ユーザー, I want to 画面間を簡単に移動する, so that 必要な情報にすぐアクセスできる.

#### Acceptance Criteria

1. THE Dashboard SHALL have a consistent header with navigation links
2. THE navigation SHALL include links to: Backlog, Runs, Reports
3. THE current page SHALL be visually highlighted in the navigation
4. THE layout SHALL be responsive (mobile and desktop)
5. THE Dashboard SHALL display the AgentCompany logo or title in the header
6. WHEN a navigation link is clicked, THE System SHALL navigate to the corresponding page without full page reload

### Requirement 3: Backlog画面（チケット管理）

**User Story:** As a COO/PM, I want to チケットの状態を一覧で確認する, so that 作業の進捗を把握できる.

#### Acceptance Criteria

1. THE Backlog page SHALL display tickets from `workflows/backlog/` directory
2. THE tickets SHALL be organized in columns by status: Todo, Doing, Review, Done
3. WHEN a ticket file is parsed, THE System SHALL extract: id, status, assignee, title, created, updated
4. THE ticket card SHALL display: id, title, assignee, updated date
5. WHEN a ticket card is clicked, THE System SHALL show ticket details in a modal or side panel
6. THE ticket details SHALL display the full Markdown content rendered as HTML
7. THE Backlog page SHALL auto-refresh data every 30 seconds
8. WHEN no tickets exist, THE System SHALL display an empty state message

### Requirement 4: Runs画面（実行ログ・成果物）

**User Story:** As a 開発者, I want to 実行履歴と成果物を確認する, so that 問題の原因を特定できる.

#### Acceptance Criteria

1. THE Runs page SHALL display runs from `runtime/runs/` directory
2. THE runs SHALL be listed in reverse chronological order (newest first)
3. WHEN a run directory is scanned, THE System SHALL read `result.json` for run metadata
4. THE run card SHALL display: run_id, ticket_id, status, start_time, end_time
5. WHEN a run has `judgment.json`, THE System SHALL display the judgment status (PASS/FAIL/WAIVER)
6. WHEN a run card is clicked, THE System SHALL show run details including logs and artifacts
7. THE run details SHALL display: full logs, artifact links, judgment details (if exists)
8. WHEN an artifact link is clicked, THE System SHALL open or download the artifact
9. THE Runs page SHALL support filtering by status (success/failure)
10. THE Runs page SHALL support pagination (10 runs per page)

### Requirement 5: Reports画面（日次/週次レポート）

**User Story:** As a マネージャー, I want to 日次・週次レポートを確認する, so that チームの活動を把握できる.

#### Acceptance Criteria

1. THE Reports page SHALL display reports from `workflows/reports/daily/` and `workflows/reports/weekly/`
2. THE reports SHALL be organized in tabs: Daily, Weekly
3. WHEN a report file is found, THE System SHALL parse the Markdown content
4. THE report card SHALL display: date, title, summary (first 100 characters)
5. WHEN a report card is clicked, THE System SHALL show the full report content
6. THE report content SHALL be rendered as HTML from Markdown
7. WHEN no reports exist, THE System SHALL display an empty state message
8. THE Reports page SHALL list reports in reverse chronological order

### Requirement 6: データ読み込みAPI

**User Story:** As a フロントエンド, I want to バックエンドAPIからデータを取得する, so that ファイルシステムのデータを表示できる.

#### Acceptance Criteria

1. THE System SHALL provide API routes under `/api/` directory
2. THE API SHALL include: `GET /api/backlog` for ticket list
3. THE API SHALL include: `GET /api/backlog/[id]` for ticket details
4. THE API SHALL include: `GET /api/runs` for run list with pagination
5. THE API SHALL include: `GET /api/runs/[id]` for run details
6. THE API SHALL include: `GET /api/reports` for report list
7. THE API SHALL include: `GET /api/reports/[type]/[filename]` for report content
8. WHEN an API request fails, THE System SHALL return appropriate HTTP status codes and error messages
9. THE API responses SHALL be in JSON format

### Requirement 7: エラーハンドリングとローディング状態

**User Story:** As a ユーザー, I want to ローディング状態とエラーを明確に認識する, so that システムの状態を理解できる.

#### Acceptance Criteria

1. WHEN data is loading, THE System SHALL display a loading indicator
2. WHEN an API request fails, THE System SHALL display an error message with retry option
3. WHEN a file is not found, THE System SHALL display a 404 message
4. THE error messages SHALL be user-friendly and actionable
5. THE loading states SHALL not block the entire page (skeleton loading preferred)

### Requirement 8: デザインシステム

**User Story:** As a ユーザー, I want to 一貫したデザインのUIを使用する, so that 直感的に操作できる.

#### Acceptance Criteria

1. THE Dashboard SHALL use a dark theme suitable for developer tools
2. THE color scheme SHALL use: dark background, accent color for important elements
3. THE typography SHALL use a clear hierarchy with readable fonts
4. THE status indicators SHALL use consistent colors: green (success/PASS), red (failure/FAIL), yellow (warning/WAIVER)
5. THE cards and panels SHALL have subtle borders and shadows for depth
6. THE interactive elements SHALL have clear hover and focus states
7. THE design SHALL follow accessibility guidelines (WCAG 2.1 AA)
