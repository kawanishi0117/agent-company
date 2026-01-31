# M4: GUI（ダッシュボード）

## 概要

AgentCompanyの状態を可視化するNext.jsベースのダッシュボードアプリケーション。Backlog（チケット管理）、Runs（実行ログ・成果物）、Reports（日次/週次レポート）の3画面を提供し、`runtime/runs/`および`workflows/`からデータを読み込んでリアルタイムで表示する。

## 機能

### Backlog画面（チケット管理）

チケットの状態をカンバンボード形式で一覧表示する。

- **カラム**: Todo, Doing, Review, Done
- **チケットカード**: ID、タイトル、担当者、更新日時を表示
- **詳細表示**: カードクリックでMarkdownコンテンツをモーダル表示
- **自動更新**: 30秒ごとにデータを自動リフレッシュ

### Runs画面（実行ログ・成果物）

実行履歴と成果物を一覧表示する。

- **一覧表示**: 新しい順（降順）でRunを表示
- **Runカード**: run_id、ticket_id、ステータス、開始/終了時刻を表示
- **判定表示**: PASS/FAIL/WAIVERのステータスバッジ
- **詳細表示**: ログ、成果物、判定詳細を表示
- **フィルタリング**: ステータス（success/failure）でフィルタ
- **ページネーション**: 10件/ページ

### Reports画面（日次/週次レポート）

日次・週次レポートをタブ形式で表示する。

- **タブ**: Daily、Weekly
- **レポートカード**: 日付、タイトル、サマリー（100文字）を表示
- **詳細表示**: Markdownコンテンツをレンダリング
- **ソート**: 新しい順（降順）で表示

## 技術スタック

| 技術         | バージョン | 用途                         |
| ------------ | ---------- | ---------------------------- |
| Next.js      | 14+        | フレームワーク（App Router） |
| TypeScript   | 5.0+       | 型安全性                     |
| Tailwind CSS | 3.4+       | スタイリング                 |
| React        | 18.2+      | UIライブラリ                 |
| gray-matter  | 4.0+       | Markdownフロントマターパース |
| marked       | 11.0+      | Markdown→HTML変換            |

## API仕様

### Backlog API

#### GET /api/backlog

チケット一覧を取得する。

**レスポンス:**

```json
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

チケット詳細を取得する。

**レスポンス:**

```json
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

### Runs API

#### GET /api/runs

Run一覧を取得する（ページネーション対応）。

**クエリパラメータ:**

- `page`: ページ番号（デフォルト: 1）
- `pageSize`: 1ページあたりの件数（デフォルト: 10）
- `status`: フィルタ（success/failure）

**レスポンス:**

```json
{
  "items": [...],
  "total": 10,
  "page": 1,
  "pageSize": 10,
  "hasMore": false
}
```

#### GET /api/runs/[id]

Run詳細を取得する。

**レスポンス:**

```json
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
      "timestamp": "2026-01-27T15:14:26.000Z",
      "run_id": "2026-01-27-151426-q3me",
      "checks": {
        "lint": { "passed": true },
        "test": { "passed": true },
        "e2e": { "passed": true },
        "format": { "passed": true }
      },
      "reasons": []
    }
  }
}
```

### Reports API

#### GET /api/reports

レポート一覧を取得する。

**レスポンス:**

```json
{
  "data": {
    "daily": [
      {
        "filename": "2026-01-27.md",
        "type": "daily",
        "date": "2026-01-27",
        "title": "日次レポート",
        "summary": "本日の活動サマリー..."
      }
    ],
    "weekly": [...]
  }
}
```

#### GET /api/reports/[type]/[filename]

レポート詳細を取得する。

**パラメータ:**

- `type`: daily または weekly
- `filename`: レポートファイル名

**レスポンス:**

```json
{
  "data": {
    "filename": "2026-01-27.md",
    "type": "daily",
    "date": "2026-01-27",
    "title": "日次レポート",
    "summary": "本日の活動サマリー...",
    "content": "# 日次レポート...(Markdown)"
  }
}
```

## データソース

| データ       | ソースパス                            | 形式                   |
| ------------ | ------------------------------------- | ---------------------- |
| チケット     | `workflows/backlog/*.md`              | Markdown + frontmatter |
| 実行結果     | `runtime/runs/<run-id>/result.json`   | JSON                   |
| 判定結果     | `runtime/runs/<run-id>/judgment.json` | JSON                   |
| 日次レポート | `workflows/reports/daily/*.md`        | Markdown               |
| 週次レポート | `workflows/reports/weekly/*.md`       | Markdown               |

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

## ファイル構成

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
│                   └── route.ts
├── components/
│   ├── layout/
│   │   ├── Header.tsx          # ヘッダー
│   │   └── Navigation.tsx      # ナビゲーション
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
│   ├── types.ts                # 型定義
│   └── parsers/
│       ├── ticket.ts           # チケットパーサー
│       ├── run.ts              # Runパーサー
│       └── report.ts           # レポートパーサー
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## 使用例

### 開発サーバー起動

```bash
cd gui/web
npm run dev
# http://localhost:3000 でアクセス
```

### ビルド

```bash
cd gui/web
npm run build
npm run start
```

### テスト実行

```bash
cd gui/web
npm run test          # ユニットテスト
npm run test:watch    # ウォッチモード
```

## デザインシステム

### カラーパレット

| 用途                   | カラー  | Tailwind   |
| ---------------------- | ------- | ---------- |
| 背景（プライマリ）     | #0f172a | slate-900  |
| 背景（セカンダリ）     | #1e293b | slate-800  |
| テキスト（プライマリ） | #f8fafc | slate-50   |
| テキスト（セカンダリ） | #94a3b8 | slate-400  |
| アクセント             | #3b82f6 | blue-500   |
| PASS                   | #22c55e | green-500  |
| FAIL                   | #ef4444 | red-500    |
| WAIVER                 | #eab308 | yellow-500 |

### ステータスバッジ

- **PASS**: 緑色バッジ（✅）
- **FAIL**: 赤色バッジ（❌）
- **WAIVER**: 黄色バッジ（⚠️）

## エラーハンドリング

| エラー                 | HTTPステータス | メッセージ                     |
| ---------------------- | -------------- | ------------------------------ |
| チケットが見つからない | 404            | "チケットが見つかりません"     |
| Runが見つからない      | 404            | "実行結果が見つかりません"     |
| レポートが見つからない | 404            | "レポートが見つかりません"     |
| ファイル読み込みエラー | 500            | "サーバーエラーが発生しました" |

## 関連ドキュメント

- [品質基準](../company/definition-of-done.md)
- [M3: Governance](./m3-governance.md)
- [プロジェクト構成](../../.kiro/steering/structure.md)
