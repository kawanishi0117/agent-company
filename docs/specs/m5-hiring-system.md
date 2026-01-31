# M5: Hiring System（採用システム）

## 概要

AIエージェントの採用プロセスを自動化するシステム。JD（Job Description）生成、面接課題生成、試用実行、スコア化、Registry登録までの一連のフローをCLIコマンドで実行できる。Hiring Managerエージェントが採用プロセス全体を管理する。

## 機能

### JD生成（Job Description Generator）

役割名から職務記述書を自動生成する。

- **入力**: 役割名（例: "Developer", "QA Engineer"）
- **出力**: Markdown形式のJDファイル
- **セクション**: 役割概要、責任範囲、必要スキル、評価基準、予算制約

### 面接課題生成（Interview Task Generator）

JDから面接課題を自動生成する。

- **入力**: JDファイルパス
- **出力**: Markdown形式の面接課題ファイル
- **内容**: タスク説明、成功基準、評価ルーブリック、制限時間

### 試用実行（Trial Runner）

候補エージェントで面接課題を実行する。

- **入力**: 候補エージェント定義、面接課題
- **出力**: 実行結果（ログ、成果物、メトリクス）
- **機能**: タイムアウト処理、リソース使用量記録

### スコア化（Scoring Engine）

試用結果からスコアを算出する。

- **タスク完了度**: 0-40点
- **品質ゲート準拠**: 0-30点
- **効率性**: 0-30点
- **合格基準**: 60点以上

### Registry登録（Registry Manager）

合格したエージェントをRegistryに登録する。

- **バリデーション**: 必須フィールド、重複チェック
- **通知**: COO/PMへの登録完了通知
- **ログ**: 採用活動の記録

## CLI仕様

### hire コマンド

```bash
# JD生成
agentcompany hire jd <role> [--output <path>]

# 面接課題生成
agentcompany hire interview <jd-path> [--output <path>]

# 試用実行
agentcompany hire trial <candidate-path> <task-path> [--timeout <minutes>]

# スコア化
agentcompany hire score <run-id> [--format json|readable]

# Registry登録
agentcompany hire register <candidate-path> [--force]

# 完全フロー（JD→面接→試用→スコア→登録）
agentcompany hire full <role> <candidate-path> [--auto-register]
```

### サブコマンド詳細

#### hire jd

役割名からJDを生成する。

```bash
agentcompany hire jd "Developer"
# 出力: runtime/hiring/jd/developer-<timestamp>.md
```

#### hire interview

JDから面接課題を生成する。

```bash
agentcompany hire interview runtime/hiring/jd/developer-20260131.md
# 出力: runtime/hiring/tasks/developer-<timestamp>.md
```

#### hire trial

候補エージェントで試用実行する。

```bash
agentcompany hire trial candidate.yaml task.md --timeout 30
# 出力: runtime/runs/<run-id>/
```

#### hire score

試用結果をスコア化する。

```bash
agentcompany hire score 2026-01-31-120000-abcd
# 出力: スコア詳細（タスク完了度、品質、効率性）
```

#### hire register

エージェントをRegistryに登録する。

```bash
agentcompany hire register candidate.yaml
# 出力: agents/registry/<agent-id>.yaml
```

#### hire full

完全な採用フローを実行する。

```bash
agentcompany hire full "QA Engineer" candidate.yaml --auto-register
# JD生成 → 面接課題生成 → 試用実行 → スコア化 → 登録
```

## Hiring Managerエージェント

### 定義ファイル

`agents/registry/hiring_manager.yaml`

### 責任範囲

- JD作成・レビュー
- 面接課題設計
- 試用実行の監督
- スコア評価
- 採用判定
- Registry登録

### 品質ゲート

- JDの必須セクション検証
- 面接課題の評価基準明確化
- スコア計算の透明性
- 重複エージェント防止

## スコアリング詳細

### タスク完了度（0-40点）

| 完了率 | 点数 |
| ------ | ---- |
| 100%   | 40   |
| 80%+   | 32   |
| 60%+   | 24   |
| 40%+   | 16   |
| 20%+   | 8    |
| 0%     | 0    |

### 品質ゲート準拠（0-30点）

| ゲート | 点数 |
| ------ | ---- |
| lint   | 10   |
| test   | 10   |
| format | 10   |

### 効率性（0-30点）

| 指標         | 点数 |
| ------------ | ---- |
| 時間内完了   | 15   |
| リソース効率 | 15   |

## ファイル構成

```
tools/cli/
├── commands/
│   └── hire.ts                    # hireコマンド実装
└── lib/
    └── hiring/
        ├── index.ts               # エクスポート
        ├── types.ts               # 型定義
        ├── jd-generator.ts        # JD生成
        ├── interview-generator.ts # 面接課題生成
        ├── trial-runner.ts        # 試用実行
        ├── scoring-engine.ts      # スコア化
        ├── registry-manager.ts    # Registry管理
        ├── hiring-logger.ts       # 採用ログ
        └── notification.ts        # 通知機能

agents/registry/
└── hiring_manager.yaml            # Hiring Managerエージェント定義

runtime/hiring/
├── jd/                            # 生成されたJD
├── tasks/                         # 生成された面接課題
├── scores/                        # スコア結果
└── logs/                          # 採用活動ログ
```

## 通知機能

### 登録完了通知

エージェント登録完了時にCOO/PMへ通知を送信する。

```json
{
  "type": "registration",
  "agentId": "developer_001",
  "role": "Developer",
  "registeredAt": "2026-01-31T12:00:00.000Z",
  "registeredBy": "hiring_manager"
}
```

### 通知保存先

`runtime/notifications/`

## エラーハンドリング

| エラー                   | 対応                       |
| ------------------------ | -------------------------- |
| JD生成失敗               | エラーメッセージ表示       |
| 面接課題生成失敗         | JDの検証エラー詳細を表示   |
| 試用実行タイムアウト     | 部分結果を保存、スコア0    |
| スコア計算エラー         | 詳細ログを出力             |
| Registry登録失敗（重複） | 既存エージェント情報を表示 |
| Registry登録失敗（検証） | バリデーションエラー詳細   |

## 使用例

### 新規エージェント採用フロー

```bash
# 1. JD生成
agentcompany hire jd "Frontend Developer"

# 2. 面接課題生成
agentcompany hire interview runtime/hiring/jd/frontend-developer-20260131.md

# 3. 試用実行
agentcompany hire trial candidate.yaml runtime/hiring/tasks/frontend-developer-20260131.md

# 4. スコア確認
agentcompany hire score 2026-01-31-120000-abcd

# 5. 登録（60点以上の場合）
agentcompany hire register candidate.yaml
```

### 完全自動フロー

```bash
agentcompany hire full "Backend Developer" candidate.yaml --auto-register
```

## 関連ドキュメント

- [採用プレイブック](../playbooks/hiring.md)
- [エージェント定義テンプレート](../../agents/registry/templates/agent_template.yaml)
- [品質基準](../company/definition-of-done.md)
- [M3: Governance](./m3-governance.md)
