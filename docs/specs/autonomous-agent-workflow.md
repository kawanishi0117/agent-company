# Autonomous Agent Workflow 仕様書

## 概要

本仕様は、AIエージェントが自律的にGitリポジトリに対して開発作業を行い、Pull Requestを作成するワークフロー機能を定義する。

### 目的

1. **階層的タスク管理**: 社長の指示を段階的に分解し、専門ワーカーに割り当てる
2. **安全なGit操作**: ブランチ戦略により作業を隔離し、レビュー後にマージする
3. **自律的実行**: 人間の介入を最小限に抑えつつ、品質を確保する
4. **可視化**: GUIでプロジェクトとチケットの状態を確認できる

## アーキテクチャ

### システム構成

```
┌─────────────────────────────────────────────────────────────────┐
│                        GUI Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Project Mgmt │  │ Ticket Tree  │  │ Ticket Create│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                        Core Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Orchestrator │  │TicketManager │  │ProjectManager│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  WorkerPool  │  │  PRCreator   │  │ReviewWorkflow│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                       Worker Layer                               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │Research│ │ Design │ │Designer│ │Developer│ │  Test  │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### ワークフロー

```
社長からの指示
    ↓
TicketManager（親チケット作成）
    ↓
Manager Agent（タスク分解 → 子/孫チケット作成）
    ↓
WorkerPool（ワーカー割り当て）
    ↓
Worker Container（隔離実行）
    ↓
ReviewWorkflow（コードレビュー）
    ↓
GitManager（ブランチマージ）
    ↓
PRCreator（Pull Request作成）
    ↓
完了
```

## コンポーネント

### 1. TicketManager

チケットの階層構造を管理するコンポーネント。

**場所**: `tools/cli/lib/execution/ticket-manager.ts`

**主要機能**:

| メソッド                    | 説明                           |
| --------------------------- | ------------------------------ |
| `createParentTicket()`      | 親チケット（社長の指示）を作成 |
| `createChildTicket()`       | 子チケット（部長が分解）を作成 |
| `createGrandchildTicket()`  | 孫チケット（実作業）を作成     |
| `updateTicketStatus()`      | チケットステータスを更新       |
| `propagateStatusToParent()` | 子の完了時に親ステータスを更新 |
| `saveTickets()`             | チケットを永続化               |
| `loadTickets()`             | チケットを読み込み             |

**チケット階層**:

```
ParentTicket（社長の指示）
├── ChildTicket（部長が分解）
│   ├── GrandchildTicket（実作業）
│   ├── GrandchildTicket
│   └── GrandchildTicket
└── ChildTicket
    └── GrandchildTicket
```

**チケットID形式**:

- 親: `<project-id>-<sequence>` (例: `proj-001-0001`)
- 子: `<parent-id>-<sequence>` (例: `proj-001-0001-01`)
- 孫: `<child-id>-<sequence>` (例: `proj-001-0001-01-001`)

### 2. WorkerTypeRegistry

ワーカータイプの定義と管理。

**場所**: `tools/cli/lib/execution/worker-type-registry.ts`

**ワーカータイプ**:

| タイプ      | 役割          | 主な能力                       |
| ----------- | ------------- | ------------------------------ |
| `research`  | 調査・分析    | 情報収集、要件分析             |
| `design`    | 設計          | アーキテクチャ設計、API設計    |
| `designer`  | UI/UXデザイン | UIデザイン、プロトタイプ       |
| `developer` | 実装          | コーディング、リファクタリング |
| `test`      | テスト        | テスト作成、品質検証           |
| `reviewer`  | レビュー      | コードレビュー、品質チェック   |

### 3. PRCreator

Pull Request作成を担当するコンポーネント。

**場所**: `tools/cli/lib/execution/pr-creator.ts`

**主要機能**:

| メソッド              | 説明                                                     |
| --------------------- | -------------------------------------------------------- |
| `createPullRequest()` | PRを作成                                                 |
| `generatePRTitle()`   | PRタイトルを生成（形式: `[AgentCompany] <summary>`）     |
| `generatePRBody()`    | PR本文を生成（overview, changes, test results, tickets） |
| `getPRStatus()`       | PRステータスを取得                                       |

### 4. ReviewWorkflow

レビューワークフローを管理するコンポーネント。

**場所**: `tools/cli/lib/execution/review-workflow.ts`

**主要機能**:

| メソッド            | 説明               |
| ------------------- | ------------------ |
| `requestReview()`   | レビューを依頼     |
| `submitReview()`    | レビュー結果を送信 |
| `getReviewStatus()` | レビュー状態を取得 |

**レビュー決定**:

- **承認**: マージをトリガー
- **却下**: フィードバック提供、ステータスを`revision_required`に更新

## データモデル

### チケットステータス

```typescript
type TicketStatus =
  | 'pending' // 待機中
  | 'decomposing' // 分解中
  | 'in_progress' // 実行中
  | 'review_requested' // レビュー待ち
  | 'revision_required' // 修正要求
  | 'completed' // 完了
  | 'failed' // 失敗
  | 'pr_created'; // PR作成済み
```

### 親チケット

```typescript
interface ParentTicket {
  id: string;
  projectId: string;
  instruction: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  childTickets: ChildTicket[];
  metadata: {
    priority: 'low' | 'medium' | 'high';
    deadline?: string;
    tags: string[];
  };
}
```

### 子チケット

```typescript
interface ChildTicket {
  id: string;
  parentId: string;
  title: string;
  description: string;
  status: TicketStatus;
  workerType: WorkerType;
  createdAt: string;
  updatedAt: string;
  grandchildTickets: GrandchildTicket[];
}
```

### 孫チケット

```typescript
interface GrandchildTicket {
  id: string;
  parentId: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: TicketStatus;
  assignee?: string;
  gitBranch?: string;
  artifacts: string[];
  reviewResult?: ReviewResult;
  createdAt: string;
  updatedAt: string;
}
```

## CLI コマンド

### ticket サブコマンド

```bash
# チケット作成
agentcompany ticket create <project-id> --instruction "指示内容"

# チケット一覧
agentcompany ticket list [project-id]

# チケットステータス確認
agentcompany ticket status <ticket-id>

# チケット一時停止
agentcompany ticket pause <ticket-id>

# チケット再開
agentcompany ticket resume <ticket-id>
```

### project コマンド拡張

```bash
# プロジェクト登録（ブランチ設定付き）
agentcompany project add <name> <git-url> \
  --base-branch main \
  --agent-branch agent/my-project
```

## GUI 画面

### プロジェクト管理画面

**場所**: `gui/web/app/projects/`

- プロジェクト一覧表示
- プロジェクト登録フォーム（name, gitUrl, baseBranch, agentBranch）
- プロジェクト詳細・編集・削除

### チケット階層管理画面

**場所**: `gui/web/app/tickets/`

- チケットツリービュー（階層表示、展開/折りたたみ）
- ステータスインジケーター（色分け表示）
- チケット詳細ページ

### チケット作成画面

**場所**: `gui/web/app/tickets/create/`

- プロジェクト選択
- 指示入力（Markdown対応）
- プレビュー機能

## ステータス色分け

| ステータス        | 色       | Tailwindクラス  |
| ----------------- | -------- | --------------- |
| pending           | グレー   | `bg-gray-500`   |
| decomposing       | 紫       | `bg-purple-500` |
| in_progress       | 青       | `bg-blue-500`   |
| review_requested  | 黄       | `bg-yellow-500` |
| revision_required | オレンジ | `bg-orange-500` |
| completed         | 緑       | `bg-green-500`  |
| failed            | 赤       | `bg-red-500`    |
| pr_created        | シアン   | `bg-cyan-500`   |

## エラーハンドリング

### リトライ戦略

- 最大3回リトライ
- 指数バックオフ（1s, 2s, 4s）

### エスカレーション

| エラーカテゴリ | エスカレーション先 |
| -------------- | ------------------ |
| git_operation  | Reviewer Agent     |
| worker_failure | Manager Agent      |
| pr_creation    | ユーザー通知       |
| persistence    | 緊急停止           |

## 永続化

### チケット永続化

**場所**: `runtime/state/tickets/<project-id>.json`

### 実行状態永続化

**場所**: `runtime/state/runs/<run-id>/state.json`

### レビューログ

**場所**: `runtime/runs/<run-id>/reviews.log`

### エラーログ

**場所**: `runtime/runs/<run-id>/errors.log`

## テスト

### ユニットテスト

- `tests/execution/ticket-manager.test.ts`
- `tests/execution/pr-creator.property.test.ts`
- `tests/execution/review-workflow.property.test.ts`

### E2Eテスト

- `e2e/ticket-workflow.spec.ts`
- `e2e/project-management.spec.ts`

## GUI連携（Orchestrator Server）

GUIからOrchestratorを制御するためのHTTP APIサーバーを提供。

### 起動方法

```bash
# Orchestrator APIサーバーを起動
agentcompany server

# GUIを起動（別ターミナル）
cd gui/web && npm run dev
```

### 連携フロー

```
┌─────────────────┐     HTTP      ┌─────────────────────┐
│   GUI (Next.js) │ ────────────→ │ Orchestrator Server │
│                 │               │    (port 3001)      │
│  - Command      │               │                     │
│  - Dashboard    │ ←──────────── │  - Task Management  │
│  - Settings     │     JSON      │  - Agent Control    │
└─────────────────┘               └─────────────────────┘
```

### Command Center API

**POST /api/command** - 指示送信

1. チケットファイルを作成
2. Orchestrator APIにタスクを送信
3. コマンド履歴を更新

**レスポンス**:
```json
{
  "data": {
    "command": { "id": "...", "status": "decomposing", "taskId": "..." },
    "orchestratorStatus": { "connected": true, "taskId": "..." }
  }
}
```

### Dashboard API

**GET /api/dashboard** - ダッシュボードデータ取得

- Orchestrator APIから実際のワーカー情報を取得
- タスクサマリー、アクティビティを統合

**レスポンス**:
```json
{
  "data": {
    "workers": [...],
    "tasks": { "pending": 0, "executing": 1, "completed": 5 },
    "orchestratorConnected": true
  }
}
```

### 環境変数

| 変数名               | 説明                  | デフォルト              |
| -------------------- | --------------------- | ----------------------- |
| `ORCHESTRATOR_API_URL` | API接続先           | `http://localhost:3001` |

## 関連ドキュメント

- [Agent Execution Engine](./agent-execution-engine.md)
- [アーキテクチャ概要](../architecture/overview.md)
- [実行エンジンアーキテクチャ](../architecture/execution-engine.md)
