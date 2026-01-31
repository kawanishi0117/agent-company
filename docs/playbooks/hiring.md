# 採用プレイブック（Hiring Playbook）

## 概要

AIエージェントの採用プロセスに関する運用手順書。Hiring Managerエージェントが主導し、JD作成から Registry登録までの一連のフローを管理する。

## 採用フロー

```
1. JD作成 → 2. 面接課題作成 → 3. 試用実行 → 4. スコア評価 → 5. 採用判定 → 6. Registry登録
```

## 1. JD作成

### 目的

採用する役割の職務記述書（Job Description）を作成する。

### 手順

```bash
# CLIでJD生成
agentcompany hire jd "<役割名>"

# 例
agentcompany hire jd "Developer"
agentcompany hire jd "QA Engineer"
```

### 出力

`runtime/hiring/jd/<role>-<timestamp>.md`

### 必須セクション

- 役割概要
- 責任範囲
- 必要スキル
- 評価基準
- 予算制約

### レビューポイント

- [ ] 責任範囲が明確か
- [ ] 評価基準が測定可能か
- [ ] 予算が適切か

## 2. 面接課題作成

### 目的

JDに基づいた面接課題を作成する。

### 手順

```bash
# CLIで面接課題生成
agentcompany hire interview <jd-path>

# 例
agentcompany hire interview runtime/hiring/jd/developer-20260131.md
```

### 出力

`runtime/hiring/tasks/<role>-<timestamp>.md`

### 必須要素

- タスク説明
- 成功基準
- 評価ルーブリック
- 制限時間

### レビューポイント

- [ ] タスクがJDの責任範囲をカバーしているか
- [ ] 成功基準が明確か
- [ ] 制限時間が適切か

## 3. 試用実行

### 目的

候補エージェントで面接課題を実行し、パフォーマンスを測定する。

### 手順

```bash
# CLIで試用実行
agentcompany hire trial <candidate-path> <task-path> [--timeout <minutes>]

# 例
agentcompany hire trial candidate.yaml task.md --timeout 30
```

### 出力

`runtime/runs/<run-id>/`

- `result.json` - 実行結果メタデータ
- `logs.txt` - 実行ログ
- `report.md` - 実行レポート

### 監視項目

- 実行時間
- リソース使用量
- エラー発生状況
- 成果物の品質

## 4. スコア評価

### 目的

試用結果を定量的に評価する。

### 手順

```bash
# CLIでスコア化
agentcompany hire score <run-id>

# 例
agentcompany hire score 2026-01-31-120000-abcd
```

### スコア構成

| 項目           | 配点 | 説明                       |
| -------------- | ---- | -------------------------- |
| タスク完了度   | 40点 | 要求されたタスクの完了率   |
| 品質ゲート準拠 | 30点 | lint/test/formatの通過状況 |
| 効率性         | 30点 | 時間内完了、リソース効率   |

### 合格基準

- **合格**: 60点以上
- **不合格**: 60点未満

## 5. 採用判定

### 判定基準

| スコア   | 判定   | アクション           |
| -------- | ------ | -------------------- |
| 80点+    | 優秀   | 即時登録推奨         |
| 60-79点  | 合格   | 登録可能             |
| 40-59点  | 保留   | 再試用または却下検討 |
| 40点未満 | 不合格 | 却下                 |

### 判定プロセス

1. スコアを確認
2. 詳細レポートをレビュー
3. 採用/却下を決定
4. 決定理由を記録

## 6. Registry登録

### 目的

合格したエージェントを正式にRegistryに登録する。

### 手順

```bash
# CLIで登録
agentcompany hire register <candidate-path>

# 例
agentcompany hire register candidate.yaml
```

### 出力

`agents/registry/<agent-id>.yaml`

### 登録後の確認

- [ ] エージェント定義が正しく保存されたか
- [ ] 重複がないか
- [ ] 通知がCOO/PMに送信されたか

## 完全自動フロー

### 目的

JD作成から登録までを一括で実行する。

### 手順

```bash
# 完全フロー実行
agentcompany hire full "<役割名>" <candidate-path> [--auto-register]

# 例（自動登録あり）
agentcompany hire full "Developer" candidate.yaml --auto-register

# 例（手動確認）
agentcompany hire full "QA Engineer" candidate.yaml
```

### 注意事項

- `--auto-register` は60点以上で自動登録
- 手動確認の場合、スコア表示後に登録を促す

## トラブルシューティング

### JD生成が失敗する

- 役割名が空でないか確認
- 出力ディレクトリの権限を確認

### 試用実行がタイムアウトする

- タイムアウト値を増やす（`--timeout`）
- 候補エージェントの設定を確認

### スコアが低い

- 詳細レポートで失敗箇所を確認
- 品質ゲートの通過状況を確認
- 候補エージェントの改善点を特定

### Registry登録が失敗する

- 重複エージェントがないか確認
- 必須フィールドが全て入力されているか確認
- バリデーションエラーの詳細を確認

## 関連ドキュメント

- [M5: Hiring System仕様](../specs/m5-hiring-system.md)
- [エージェント定義テンプレート](../../agents/registry/templates/agent_template.yaml)
- [品質基準](../company/definition-of-done.md)
- [会社ポリシー](../company/policies.md)

## 更新履歴

| 日付       | 内容     | 担当者         |
| ---------- | -------- | -------------- |
| 2026-01-31 | 初版作成 | Hiring Manager |
