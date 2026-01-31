# AgentCompany GUI ダッシュボード

AgentCompanyの状態を可視化するWebダッシュボードアプリケーションです。

## 概要

このダッシュボードは、AgentCompanyの以下の情報をリアルタイムで表示します：

- **Backlog**: チケット（タスク）の管理画面（カンバンボード形式）
- **Runs**: 実行ログと成果物の一覧・詳細画面
- **Reports**: 日次・週次レポートの閲覧画面

## 技術スタック

| 技術         | バージョン | 用途                         |
| ------------ | ---------- | ---------------------------- |
| Next.js      | 14+        | フレームワーク（App Router） |
| TypeScript   | 5.4+       | 型安全な開発                 |
| Tailwind CSS | 3.4+       | スタイリング                 |
| React        | 18.3+      | UIライブラリ                 |
| Vitest       | 1.0+       | ユニットテスト               |
| fast-check   | 3.15+      | Property-based testing       |

## セットアップ

### 前提条件

- Node.js 18.17以上
- npm 9以上

### 依存パッケージのインストール

```bash
cd gui/web
npm install
```

## 開発

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開いてダッシュボードにアクセスできます。

### コードの静的解析

```bash
npm run lint
```

## ビルド

### プロダクションビルド

```bash
npm run build
```

### プロダクションサーバーの起動

```bash
npm run start
```

## テスト

### ユニットテスト

```bash
# 一度だけ実行
npm run test

# ウォッチモード（ファイル変更時に自動実行）
npm run test:watch
```

### E2Eテスト

E2Eテストはプロジェクトルートから実行します：

```bash
# プロジェクトルートで実行
npm run e2e
# または
make e2e
```

## ディレクトリ構成

```
gui/web/
├── app/                    # Next.js App Router
│   ├── api/               # APIルート
│   │   ├── backlog/       # チケットAPI
│   │   ├── runs/          # 実行結果API
│   │   └── reports/       # レポートAPI
│   ├── backlog/           # Backlog画面
│   ├── runs/              # Runs画面
│   │   └── [id]/          # Run詳細画面
│   ├── reports/           # Reports画面
│   ├── layout.tsx         # ルートレイアウト
│   ├── page.tsx           # ホームページ
│   └── globals.css        # グローバルスタイル
├── components/            # Reactコンポーネント
│   ├── backlog/           # Backlog関連
│   ├── layout/            # レイアウト関連
│   ├── reports/           # Reports関連
│   ├── runs/              # Runs関連
│   └── ui/                # 共通UIコンポーネント
├── lib/                   # ユーティリティ
│   ├── parsers/           # ファイルパーサー
│   └── types.ts           # 型定義
├── next.config.mjs        # Next.js設定
├── tailwind.config.ts     # Tailwind CSS設定
├── tsconfig.json          # TypeScript設定
└── vitest.config.ts       # Vitest設定
```

## 画面説明

### Backlog（/backlog）

チケットをカンバンボード形式で表示します。

- **カラム**: Todo, Doing, Review, Done
- **データソース**: `workflows/backlog/*.md`
- **機能**: チケット詳細表示、30秒ごとの自動リフレッシュ

### Runs（/runs）

実行履歴と成果物を一覧表示します。

- **データソース**: `runtime/runs/*/`
- **機能**:
  - ステータスフィルタ（success/failure）
  - ページネーション（10件/ページ）
  - 判定結果表示（PASS/FAIL/WAIVER）
  - 詳細画面でログ・成果物を確認

### Reports（/reports）

日次・週次レポートを表示します。

- **データソース**: `workflows/reports/daily/`, `workflows/reports/weekly/`
- **機能**: Daily/Weeklyタブ切り替え、Markdown表示

## API エンドポイント

| エンドポイント                   | メソッド | 説明                            |
| -------------------------------- | -------- | ------------------------------- |
| `/api/backlog`                   | GET      | チケット一覧                    |
| `/api/backlog/[id]`              | GET      | チケット詳細                    |
| `/api/runs`                      | GET      | Run一覧（ページネーション対応） |
| `/api/runs/[id]`                 | GET      | Run詳細                         |
| `/api/reports`                   | GET      | レポート一覧                    |
| `/api/reports/[type]/[filename]` | GET      | レポート詳細                    |

## 関連ドキュメント

- [M4 GUI仕様書](../../docs/specs/m4-gui.md)
- [プロジェクト概要](../../MVP.md)
