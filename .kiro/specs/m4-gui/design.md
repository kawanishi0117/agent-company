# Design Document

## Overview

M4 GUIは、AgentCompanyの状態を可視化するNext.jsベースのダッシュボードアプリケーション。Backlog（チケット管理）、Runs（実行ログ・成果物）、Reports（日次/週次レポート）の3画面を提供し、`runtime/runs/`および`workflows/`からデータを読み込んでリアルタイムで表示する。

## Architecture

### 技術スタック

```
gui/web/
├── Next.js 14+ (App Router)
├── TypeScript
├── Tailwind CSS
├── React Server Components
└── API Routes
```

### ディレクトリ構成

```
gui/web/
├── app/
│   ├── layout.tsx              # ルートレイアウト
│   ├── page.tsx                # ホーム（リダイレクト）
│   ├── backlog/
│   │   └── page.tsx            # Backlog画面
│   ├── runs/
│   │   ├── page.tsx            # Runs一覧画面
│   │   └── [id]/
│   │       └── page.tsx        # Run詳細画面
│   ├── reports/
│   │   └── page.tsx            # Reports画面
│   └── api/
│       ├── backlog/
│       │   ├── route.ts        # GET /api/backlog
│       │   └── [id]/
│       │       └── route.ts    # GET /api/backlog/[id]
│       ├── runs/
│       │   ├── route.ts        # GET /api/runs
│       │   └── [id]/
│       │       └── route.ts    # GET /api/runs/[id]
│       └── reports/
│           ├── route.ts        # GET /api/reports
│           └── [type]/
│               └── [filename]/
│                   └── route.ts # GET /api/reports/[type]/[filename]
├── components/
│   ├── layout/
│   │   ├── Header.tsx          # ヘッダー
│   │   ├── Navigation.tsx      # ナビゲーション
│   │   └── Sidebar.tsx         # サイドバー（オプション）
│   ├── backlog/
│   │   ├── KanbanBoard.tsx     # カンバンボード
│   │   ├── TicketCard.tsx      # チケットカード
│   │   └── TicketModal.tsx     # チケット詳細モーダル
│   ├── runs/
│   │   ├── RunList.tsx         # Run一覧
│   │   ├── RunCard.tsx         # Runカード
│   │   └── RunDetail.tsx       # Run詳細
│   ├── reports/
│   │   ├── ReportList.tsx      # レポート一覧
│   │   └── ReportCard.tsx      # レポートカード
│   └── ui/
│       ├── Card.tsx            # 汎用カード
│       ├── Badge.tsx           # ステータスバッジ
│       ├── Modal.tsx           # モーダル
│       ├── Tabs.tsx            # タブ
│       ├── Loading.tsx         # ローディング
│       └── Error.tsx           # エラー表示
├── lib/
│   ├── api.ts                  # APIクライアント
│   ├── parsers/
│   │   ├── ticket.ts           # チケットパーサー
│   │   ├── run.ts              # Runパーサー
│   │   └── report.ts           # レポートパーサー
│   └── types.ts                # 型定義
├── styles/
│   └── globals.css             # グローバルスタイル
├── public/
│   └── logo.svg                # ロゴ
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── README.md
```

### データフロー

```
[ファイルシステム]
      │
      ├── workflows/backlog/*.md
      ├── runtime/runs/*/
      └── workflows/reports/*/
      │
      ▼
[API Routes]
      │
      ├── /api/backlog
      ├── /api/runs
      └── /api/reports
      │
      ▼
[React Components]
      │
      ├── KanbanBoard
      ├── RunList
      └── ReportList
      │
      ▼
[UI表示]
```

## Components and Interfaces

### 型定義 (`lib/types.ts`)

```typescript
// チケット
export interface Ticket {
  id: string;
  status: 'todo' | 'doing' | 'review' | 'done';
  assignee: string;
  title: string;
  created: string;
  updated: string;
  content: string; // Markdownコンテンツ
}

// Run
export interface Run {
  runId: string;
  ticketId: string;
  status: 'success' | 'failure' | 'running';
  startTime: string;
  endTime?: string;
  logs: string[];
  artifacts: string[];
  judgment?: Judgment;
}

// 判定結果
export interface Judgment {
  status: 'PASS' | 'FAIL' | 'WAIVER';
  timestamp: string;
  run_id: string;
  checks: {
    lint: CheckResult;
    test: CheckResult;
    e2e: CheckResult;
    format: CheckResult;
  };
  reasons: string[];
  waiver_id?: string;
}

export interface CheckResult {
  passed: boolean;
  details?: string;
}

// レポート
export interface Report {
  filename: string;
  type: 'daily' | 'weekly';
  date: string;
  title: string;
  summary: string;
  content: string;
}

// API レスポンス
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// ページネーション
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

### API Routes

#### GET /api/backlog

```typescript
// Response
{
  "data": [
    {
      "id": "0001",
      "status": "done",
      "assignee": "coo_pm",
      "title": "サンプルチケット: M0動作確認",
      "created": "2026-01-27T00:00:00.000Z",
      "updated": "2026-01-27T15:14:26.436Z"
    }
  ]
}
```

#### GET /api/backlog/[id]

```typescript
// Response
{
  "data": {
    "id": "0001",
    "status": "done",
    "assignee": "coo_pm",
    "title": "サンプルチケット: M0動作確認",
    "created": "2026-01-27T00:00:00.000Z",
    "updated": "2026-01-27T15:14:26.436Z",
    "content": "# サンプルチケット...(Markdown)"
  }
}
```

#### GET /api/runs

```typescript
// Query params: page, pageSize, status
// Response
{
  "items": [...],
  "total": 10,
  "page": 1,
  "pageSize": 10,
  "hasMore": false
}
```

#### GET /api/runs/[id]

```typescript
// Response
{
  "data": {
    "runId": "2026-01-27-151426-q3me",
    "ticketId": "0001",
    "status": "success",
    "startTime": "2026-01-27T15:14:26.394Z",
    "endTime": "2026-01-27T15:14:26.396Z",
    "logs": [...],
    "artifacts": [...],
    "judgment": {
      "status": "PASS",
      ...
    }
  }
}
```

#### GET /api/reports

```typescript
// Response
{
  "data": {
    "daily": [...],
    "weekly": [...]
  }
}
```

## Data Models

### チケットファイル形式

```markdown
---
id: '0001'
status: 'todo'
assignee: 'coo_pm'
created: '2026-01-27T00:00:00.000Z'
updated: '2026-01-27T00:00:00.000Z'
---

# チケットタイトル

## 目的

...
```

### Runディレクトリ構造

```
runtime/runs/<run-id>/
├── result.json      # 実行結果メタデータ
├── logs.txt         # 実行ログ
├── report.md        # 実行レポート
└── judgment.json    # 判定結果（オプション）
```

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: チケットパース完全性

_For any_ 有効なチケットMarkdownファイル, パース処理は必ず `id`, `status`, `assignee`, `title`, `created`, `updated` の全フィールドを抽出する

**Validates: Requirements 3.3**

### Property 2: チケットステータス分類

_For any_ チケットの集合, カンバンボードは各チケットを正確に `todo`, `doing`, `review`, `done` のいずれかのカラムに分類する

**Validates: Requirements 3.2**

### Property 3: Runパース完全性

_For any_ 有効な `result.json` ファイル, パース処理は必ず `runId`, `ticketId`, `status`, `startTime`, `endTime`, `logs`, `artifacts` を抽出する

**Validates: Requirements 4.3**

### Property 4: Run時系列ソート

_For any_ Runの集合, 一覧表示は `startTime` の降順（新しい順）でソートされる

**Validates: Requirements 4.2**

### Property 5: 判定結果表示

_For any_ `judgment.json` を持つRun, 判定ステータス（PASS/FAIL/WAIVER）が正しく表示される

**Validates: Requirements 4.5**

### Property 6: Runフィルタリング

_For any_ ステータスフィルタ, フィルタ結果には指定されたステータスのRunのみが含まれる

**Validates: Requirements 4.9**

### Property 7: ページネーション

_For any_ ページリクエスト, 返却されるアイテム数は `pageSize` 以下であり、`page` と `total` から正しい範囲のアイテムが返される

**Validates: Requirements 4.10**

### Property 8: レポートパース完全性

_For any_ 有効なレポートMarkdownファイル, パース処理は `filename`, `type`, `date`, `title`, `summary` を抽出する

**Validates: Requirements 5.3**

### Property 9: レポート時系列ソート

_For any_ レポートの集合, 一覧表示は `date` の降順（新しい順）でソートされる

**Validates: Requirements 5.8**

### Property 10: Markdown→HTML変換

_For any_ 有効なMarkdownコンテンツ, HTML変換後も元のテキスト内容が保持される

**Validates: Requirements 3.6, 5.6**

### Property 11: APIレスポンス形式

_For any_ APIリクエスト, レスポンスは有効なJSON形式であり、成功時は `data` フィールド、エラー時は `error` フィールドを含む

**Validates: Requirements 6.8, 6.9**

### Property 12: APIエラーステータスコード

_For any_ エラー条件, APIは適切なHTTPステータスコードを返す（404: Not Found, 500: Server Error）

**Validates: Requirements 6.8**

## Error Handling

| エラー                           | 対応                                           |
| -------------------------------- | ---------------------------------------------- |
| チケットファイルが存在しない     | 404エラー + "チケットが見つかりません"         |
| チケットのfrontmatterが不正      | パースエラーをログ出力、該当チケットをスキップ |
| Runディレクトリが存在しない      | 404エラー + "実行結果が見つかりません"         |
| result.jsonが存在しない          | 該当Runをスキップ                              |
| judgment.jsonが存在しない        | 判定なしとして表示                             |
| レポートディレクトリが存在しない | 空配列を返す                                   |
| ファイル読み込みエラー           | 500エラー + エラーメッセージ                   |
| Markdownパースエラー             | 生のテキストとして表示                         |

## Testing Strategy

### ユニットテスト

- `lib/parsers/ticket.test.ts`: チケットパーサーのテスト
- `lib/parsers/run.test.ts`: Runパーサーのテスト
- `lib/parsers/report.test.ts`: レポートパーサーのテスト

### Property-Based Tests

Property-based testingには `fast-check` ライブラリを使用する。

- `tests/parsers.property.test.ts`: パーサーのプロパティテスト
  - Property 1, 3, 8: パース完全性
  - Property 10: Markdown変換
- `tests/sorting.property.test.ts`: ソートのプロパティテスト
  - Property 4, 9: 時系列ソート
- `tests/filtering.property.test.ts`: フィルタリングのプロパティテスト
  - Property 2, 6: ステータスフィルタ
  - Property 7: ページネーション
- `tests/api.property.test.ts`: APIのプロパティテスト
  - Property 11, 12: レスポンス形式とエラーハンドリング

### E2Eテスト

- `e2e/gui.spec.ts`: GUI統合テスト
  - Backlog画面の表示
  - Runs画面の表示とフィルタリング
  - Reports画面の表示
  - ナビゲーション動作

### テスト設定

```typescript
// vitest.config.ts (gui/web/)
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['**/*.test.ts', '**/*.property.test.ts'],
  },
});
```

## Dependencies

### 新規パッケージ

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "gray-matter": "^4.0.3",
    "marked": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "fast-check": "^3.15.0",
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "jsdom": "^23.0.0"
  }
}
```

### 既存パッケージ（ルートプロジェクト）

- ESLint, Prettier: ルートの設定を継承
- Playwright: E2Eテスト用（既存）

## UI Design

### カラーパレット

```css
:root {
  /* Background */
  --bg-primary: #0f172a; /* slate-900 */
  --bg-secondary: #1e293b; /* slate-800 */
  --bg-tertiary: #334155; /* slate-700 */

  /* Text */
  --text-primary: #f8fafc; /* slate-50 */
  --text-secondary: #94a3b8; /* slate-400 */
  --text-muted: #64748b; /* slate-500 */

  /* Accent */
  --accent-primary: #3b82f6; /* blue-500 */
  --accent-hover: #2563eb; /* blue-600 */

  /* Status */
  --status-pass: #22c55e; /* green-500 */
  --status-fail: #ef4444; /* red-500 */
  --status-waiver: #eab308; /* yellow-500 */
  --status-running: #3b82f6; /* blue-500 */
}
```

### レイアウト

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  AgentCompany    [Backlog] [Runs] [Reports]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  Todo   │ │  Doing  │ │ Review  │ │  Done   │       │
│  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤       │
│  │ [Card]  │ │ [Card]  │ │ [Card]  │ │ [Card]  │       │
│  │ [Card]  │ │         │ │         │ │ [Card]  │       │
│  │         │ │         │ │         │ │ [Card]  │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```
