# AgentCompany 開発者ガイド

このドキュメントでは、AgentCompanyへの貢献方法を説明します。

## 開発環境のセットアップ

### 前提条件

- Node.js 18.17以上
- Docker Desktop
- Git

### セットアップ

```bash
# リポジトリをクローン
git clone <repository-url>
cd agent-company

# 依存パッケージをインストール
npm install
cd gui/web && npm install && cd ../..

# Docker環境を起動
docker compose -f infra/docker/compose.yaml up -d

# 品質ゲートを実行して動作確認
make ci
```

## 開発フロー

### 1. チケットを作成

`workflows/backlog/` にチケットを作成：

```markdown
---
id: 'NNNN'
title: 'タイトル'
status: 'todo'
assignee: ''
priority: 'medium'
---

# タイトル

## 概要

[何をするか]

## 受け入れ基準

- [ ] 基準1
- [ ] 基準2
```

### 2. ブランチを作成

```bash
git checkout -b feature/NNNN-description
```

### 3. 実装

コーディング規約に従って実装します。

### 4. テスト

```bash
# 静的解析
make lint

# ユニットテスト
make test

# E2Eテスト
make e2e

# 全ゲート
make ci
```

### 5. コミット

```bash
git add .
git commit -m "feat(scope): 変更内容"
```

### 6. プルリクエスト

プルリクエストを作成し、レビューを依頼します。

## コーディング規約

### TypeScript

```typescript
// 関数には戻り値の型を明示
function processTask(task: Task): ExecutionResult {
  // ...
}

// 未使用変数は _ プレフィックス
function handler(_event: Event, data: Data): void {
  console.log(data);
}

// インターフェースにはJSDocコメント
/**
 * タスク
 * @description 社長からの指示を表すタスク
 */
export interface Task {
  /** タスクID */
  id: string;
}
```

### インポート

```typescript
// CLI（ESM）: 相対パス + .js 拡張子
import { parseTicket } from './ticket.js';

// GUI（Next.js）: パスエイリアス
import { Button } from '@/components/ui/Button';
```

### コメント

```typescript
/**
 * モジュールの説明
 *
 * @module execution/orchestrator
 * @see Requirements: 23.2, 23.3
 */

/**
 * 関数の説明
 *
 * @param task - タスク情報
 * @returns 実行結果
 * @throws {OrchestratorError} タスクが見つからない場合
 */
```

## テスト

### ファイル配置

| 種別           | 場所                   | 命名規則             |
| -------------- | ---------------------- | -------------------- |
| ユニットテスト | `tests/`               | `*.test.ts`          |
| Property-based | `tests/`               | `*.property.test.ts` |
| E2Eテスト      | `e2e/`                 | `*.spec.ts`          |
| GUIテスト      | `gui/web/lib/parsers/` | `*.test.ts`          |

### テスト構造

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    orchestrator = createOrchestrator();
    await orchestrator.initialize();
  });

  afterEach(async () => {
    await orchestrator.emergencyStop();
  });

  describe('タスク管理', () => {
    it('タスクを送信してタスクIDを取得できる', async () => {
      const taskId = await orchestrator.submitTask('テスト', 'project-001');
      expect(taskId).toMatch(/^task-/);
    });
  });
});
```

### Property-based テスト

```typescript
import * as fc from 'fast-check';

it('任意の有効な入力で正しく動作する', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (input) => {
      const result = validate(input);
      return result.valid === true;
    })
  );
});
```

## Git規約

### ブランチ命名

- `feature/<ticket-id>-<description>` - 新機能
- `fix/<ticket-id>-<description>` - バグ修正
- `hotfix/<description>` - 緊急修正

### コミットメッセージ

```
<type>(<scope>): <subject>

<body>

<footer>
```

| type     | 用途             |
| -------- | ---------------- |
| feat     | 新機能           |
| fix      | バグ修正         |
| docs     | ドキュメント     |
| style    | フォーマット     |
| refactor | リファクタリング |
| test     | テスト           |
| chore    | ビルド・設定     |

例：

```
feat(execution): タスク分解機能を追加

- Decomposerクラスを実装
- サブタスク生成ロジックを追加
- ユニットテストを追加

Closes #123
```

## ドキュメント更新

コード変更時は対応するドキュメントも更新してください。

| 変更内容     | 更新先                                          |
| ------------ | ----------------------------------------------- |
| 新機能       | `docs/architecture/` または該当README           |
| CLI追加      | `tools/cli/README.md`                           |
| Docker変更   | `infra/docker/README.md`                        |
| 会社ルール   | `docs/company/`                                 |
| エージェント | `agents/registry/` + `docs/playbooks/hiring.md` |
| GUI          | `gui/web/README.md`                             |

## 禁止事項

1. ハードコードされた認証情報
2. allowlist外パッケージの使用（Waiverなし）
3. テストのスキップ（理由なし）
4. 未処理のエラー
5. `console.log` の乱用
6. 型の `any` 使用
7. マジックナンバー

## Waiver（例外承認）

品質基準を満たせない場合は、Waiverを申請してください。

```bash
npx tsx tools/cli/agentcompany.ts waiver create "例外理由"
```

必須項目：

- 期限
- 理由
- 代替策
- フォロータスク

## ディレクトリ構成

```
agent-company/
├── docs/                    # ドキュメント
│   ├── company/             # 会社ポリシー
│   ├── specs/               # 機能仕様書
│   └── architecture/        # 設計ドキュメント
├── agents/                  # エージェント定義
│   └── registry/            # YAML定義
├── tools/                   # 実行ツール
│   ├── cli/                 # CLI
│   ├── installers/          # インストーラ
│   └── adapters/            # AIアダプタ
├── gui/web/                 # GUI（Next.js）
├── tests/                   # ユニットテスト
├── e2e/                     # E2Eテスト
├── runtime/                 # 実行時データ
└── infra/docker/            # Docker設定
```

## 参考ドキュメント

- [README.md](README.md) - プロジェクト概要
- [MVP.md](MVP.md) - MVPロードマップ
- [docs/company/policies.md](docs/company/policies.md) - 会社ポリシー
- [docs/company/definition-of-done.md](docs/company/definition-of-done.md) - 完了基準
- [docs/architecture/](docs/architecture/) - アーキテクチャ設計
