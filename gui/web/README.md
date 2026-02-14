# AgentCompany GUI ダッシュボード

AgentCompanyの状態を可視化するWebダッシュボードアプリケーションです。

## 概要

このダッシュボードは、AgentCompanyの以下の情報をリアルタイムで表示します：

- **Dashboard**: リアルタイム実行状況、承認待ち通知、MVP通知、ムードアラート
- **Command Center**: CEO指示入力、ワークフロー開始
- **Backlog**: チケット（タスク）の管理画面（カンバンボード形式）
- **Tickets**: チケット一覧・作成・詳細管理
- **Workflows**: ワークフロー一覧・詳細（6タブ: 概要/提案書/会議録/進捗/品質/承認履歴）
- **Employees**: 社員名簿（組織図・リスト・関係性マップビュー）、社員詳細（ムード・キャリア・パフォーマンス）
- **Meetings**: 会議一覧（朝会・レトロスペクティブ・経営会議）
- **Knowledge**: ナレッジベース（検索・カテゴリフィルタ・エントリ詳細）
- **KPI/OKR**: 生産性・品質・コスト・成長指標
- **Market**: 市場調査リクエスト・レポート一覧
- **Projects**: プロジェクト管理
- **Runs**: 実行ログと成果物の一覧・詳細画面
- **Reports**: 日次・週次レポートの閲覧画面
- **Review**: レビュー管理
- **Settings**: コーディングエージェント設定・システム設定

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
│   │   ├── command/       # コマンドAPI
│   │   ├── dashboard/     # ダッシュボードAPI
│   │   ├── employees/     # 社員API（mood, career含む）
│   │   ├── relationships/ # 関係性API
│   │   ├── mvp/           # MVP API
│   │   ├── mood-alerts/   # ムードアラートAPI
│   │   ├── meetings/      # 会議API（executive含む）
│   │   ├── knowledge/     # ナレッジAPI
│   │   ├── internal-rules/# 社内ルールAPI
│   │   ├── kpi/           # KPI API
│   │   ├── okr/           # OKR API
│   │   ├── market-research/ # 市場調査API
│   │   ├── tech-debt/     # 技術的負債API
│   │   ├── activity-stream/ # アクティビティAPI
│   │   ├── chat-logs/     # チャットログAPI
│   │   ├── projects/      # プロジェクトAPI
│   │   ├── reports/       # レポートAPI
│   │   ├── review/        # レビューAPI
│   │   ├── runs/          # 実行結果API
│   │   ├── settings/      # 設定API
│   │   ├── tasks/         # タスクAPI
│   │   ├── tickets/       # チケットAPI
│   │   └── workflows/     # ワークフローAPI
│   ├── backlog/           # Backlog画面
│   ├── command/           # Command Center画面
│   ├── dashboard/         # Dashboard画面
│   ├── employees/         # 社員名簿・詳細画面
│   ├── meetings/          # 会議一覧画面
│   ├── knowledge/         # ナレッジベース画面
│   ├── kpi/               # KPI/OKR画面
│   ├── market/            # 市場調査画面
│   ├── projects/          # プロジェクト画面
│   ├── runs/              # Runs画面
│   │   └── [id]/          # Run詳細画面
│   ├── reports/           # Reports画面
│   ├── review/            # Review画面
│   ├── settings/          # Settings画面
│   ├── tasks/             # Tasks画面
│   ├── tickets/           # Tickets画面
│   ├── workflows/         # Workflows画面
│   ├── layout.tsx         # ルートレイアウト
│   ├── page.tsx           # ホームページ
│   └── globals.css        # グローバルスタイル
├── components/            # Reactコンポーネント
│   ├── backlog/           # Backlog関連
│   ├── employees/         # 社員関連（EmployeeCard, OrgChart, PerformanceChart, StatusIndicator）
│   ├── layout/            # レイアウト関連
│   ├── projects/          # Projects関連
│   ├── reports/           # Reports関連
│   ├── runs/              # Runs関連
│   ├── tickets/           # Tickets関連
│   ├── workflows/         # Workflows関連
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

### Dashboard（/dashboard）

リアルタイムでエージェント実行状況を監視します。

- **機能**: ワーカー状態、タスクサマリー、承認待ちワークフロー通知、社員ステータスオーバービュー、MVP候補通知、ムードアラート、アクティビティストリーム、ワークフローサマリー
- **自動リフレッシュ**: 5秒間隔

### Command Center（/command）

CEOが自然言語で指示を入力し、ワークフローを開始します。

### Backlog（/backlog）

チケットをカンバンボード形式で表示します。

- **カラム**: Todo, Doing, Review, Done
- **データソース**: `workflows/backlog/*.md`
- **機能**: チケット詳細表示、30秒ごとの自動リフレッシュ

### Tickets（/tickets）

チケットの一覧・作成・詳細管理を行います。

### Workflows（/workflows）

ワークフロー一覧と詳細を管理します。

- **一覧**: フィルタ・ソート対応
- **詳細（/workflows/[id]）**: 6タブ（概要/提案書/会議録/進捗/品質/承認履歴）

### Employees（/employees）

社員名簿を3つのビューで表示します。

- **組織図ビュー**: ツリー構造（CEO → 部門長 → Worker）
- **リストビュー**: カード形式（ムードインジケータ、MVPバッジ付き）
- **関係性マップビュー**: SVGベースのノード＋エッジグラフ
- **詳細（/employees/[id]）**: プロフィール、ムード推移チャート、キャリア履歴、パフォーマンス、タイムライン、チャットログ
- **自動リフレッシュ**: 5秒間隔

### Meetings（/meetings）

会議一覧を表示します。

- **タイプ**: 朝会、レトロスペクティブ、経営会議
- **機能**: タイプフィルタ、日付フィルタ、朝会トリガーボタン

### Knowledge（/knowledge）

組織のナレッジベースを管理します。

- **機能**: 検索バー、カテゴリフィルタ、タグフィルタ、エントリ詳細表示

### KPI/OKR（/kpi）

組織のKPIとOKRを表示します。

- **指標**: 生産性、品質、コスト、成長
- **機能**: 技術的負債トレンドチャート、OKR目標設定・進捗表示

### Market（/market）

市場調査を管理します。

- **機能**: 調査リクエストフォーム、レポート一覧、推奨アクション表示

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

### Settings（/settings）

システム設定を管理します。

- **データソース**: `runtime/state/config.json`
- **機能**:
  - ワーカー設定（最大同時実行数、メモリ制限、CPU制限、タイムアウト）
  - AI設定（デフォルトアダプタ、モデル選択）
  - コンテナランタイム選択（DoD/Rootless/DIND）
  - その他設定（履歴保持日数、統合ブランチ、自動更新間隔）

## API エンドポイント

| エンドポイント                        | メソッド  | 説明                            |
| ------------------------------------- | --------- | ------------------------------- |
| `/api/dashboard`                      | GET       | ダッシュボード統合情報          |
| `/api/command`                        | POST      | CEO指示送信                     |
| `/api/backlog`                        | GET       | チケット一覧                    |
| `/api/backlog/[id]`                   | GET       | チケット詳細                    |
| `/api/tickets`                        | GET/POST  | チケット一覧・作成              |
| `/api/tickets/[id]`                   | GET       | チケット詳細                    |
| `/api/workflows`                      | GET       | ワークフロー一覧                |
| `/api/workflows/[id]`                 | GET       | ワークフロー詳細                |
| `/api/workflows/[id]/approve`         | POST      | ワークフロー承認                |
| `/api/workflows/[id]/compliance`      | GET       | 仕様適合レポート                |
| `/api/employees`                      | GET       | 社員一覧                        |
| `/api/employees/[id]`                 | GET       | 社員詳細                        |
| `/api/employees/[id]/mood`            | GET       | ムード履歴                      |
| `/api/employees/[id]/career`          | GET       | キャリア履歴                    |
| `/api/relationships`                  | GET       | 関係性マップ                    |
| `/api/mvp`                            | GET       | MVP履歴                         |
| `/api/mood-alerts`                    | GET       | ムードアラート                  |
| `/api/meetings`                       | GET       | 会議一覧                        |
| `/api/meetings/executive`             | POST      | 経営会議トリガー                |
| `/api/knowledge`                      | GET/POST  | ナレッジ検索・追加              |
| `/api/internal-rules`                 | GET/PUT   | 社内ルール一覧・承認            |
| `/api/kpi`                            | GET       | KPIデータ                       |
| `/api/okr`                            | GET/PUT   | OKRデータ                       |
| `/api/market-research`                | GET/POST  | 市場調査レポート・リクエスト    |
| `/api/tech-debt`                      | GET       | 技術的負債トレンド              |
| `/api/activity-stream`                | GET       | アクティビティストリーム        |
| `/api/chat-logs`                      | GET       | チャットログ                    |
| `/api/runs`                           | GET       | Run一覧（ページネーション対応） |
| `/api/runs/[id]`                      | GET       | Run詳細                         |
| `/api/reports`                        | GET       | レポート一覧                    |
| `/api/reports/[type]/[filename]`      | GET       | レポート詳細                    |
| `/api/settings`                       | GET/PUT   | システム設定                    |
| `/api/settings/coding-agents`         | GET/PUT   | コーディングエージェント設定    |
| `/api/settings/service-detection`     | GET       | サービス検出                    |

## 関連ドキュメント

- [M4 GUI仕様書](../../docs/specs/m4-gui.md)
- [プロジェクト概要](../../MVP.md)
