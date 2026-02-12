# Company Evolution - 正式仕様書

## 概要

AgentCompanyを「シミュレーション会社」から「本物の会社」に進化させるための4つの機能群。
エージェントの実行結果を実データとして蓄積・分析し、組織の成長サイクルを実現する。

## Phase 1: QA結果の実パース

### 目的

WorkflowEngine の QA フェーズで、Vitest / ESLint の出力を実際にパースし、
ハードコード値を排除する。

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `tools/cli/lib/execution/qa-result-parser.ts` | Vitest / ESLint 出力パーサー |

### API

```typescript
// Vitest 出力パース
parseVitestOutput(output: string): VitestParseResult
// → { total, passed, failed, skipped, coverage, parsed, rawExcerpt }

// ESLint 出力パース
parseEslintOutput(output: string): EslintParseResult
// → { errorCount, warningCount, passed, parsed, details }
```

### 対応フォーマット

- Vitest: `Tests  X passed | Y failed | Z skipped (W)` 形式
- Vitest カバレッジ: `All files | XX.X` 形式（v8/istanbul両対応）
- ESLint: `✖ X problems (Y errors, Z warnings)` 形式
- ANSIエスケープコード自動除去

---

## Phase 2: 採用の本物化（CodingAgent連携）

### 目的

採用試用実行で `Math.random()` によるシミュレーションではなく、
CodingAgent を使って実際にタスクを実行し、QAパーサーで評価する。

### 改修ファイル

| ファイル | 変更内容 |
|---------|----------|
| `tools/cli/lib/hiring/trial-runner.ts` | `executeTrialWithAgent()` 追加 |

### フロー

```
1. CodingAgentRegistry から利用可能なエージェントを取得
2. CodingAgent.execute(面接課題プロンプト) を実行
3. 成果物をワークスペースに保存
4. QAパーサーで lint/test 結果を評価
5. CodingAgent未利用時は従来のシミュレーションにフォールバック
```

---

## Phase 3: エージェント成長メカニズム

### 目的

エージェントの実行履歴を蓄積し、パフォーマンスプロファイルを生成する。
スキルギャップを検出し、自動採用提案を生成する。

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `tools/cli/lib/execution/agent-performance-tracker.ts` | パフォーマンス追跡 |
| `tools/cli/lib/execution/skill-gap-detector.ts` | スキルギャップ検出 |

### AgentPerformanceTracker API

```typescript
class AgentPerformanceTracker {
  recordPerformance(record: PerformanceRecord): Promise<void>
  getProfile(agentId: string): Promise<PerformanceProfile | null>
  getAllProfiles(): Promise<PerformanceProfile[]>
  getRecords(agentId: string): Promise<PerformanceRecord[]>
}
```

### SkillGapDetector API

```typescript
class SkillGapDetector {
  analyze(): Promise<SkillGapAnalysis>
  detectGaps(profiles, registryAgents): SkillGap[]
}
```

### データモデル

- `PerformanceRecord`: 1回の実行記録（agentId, taskId, taskCategory, success, qualityScore, durationMs）
- `PerformanceProfile`: 総合評価（successRate, averageQuality, strengths, weaknesses, recentTrend）
- `SkillGap`: 不足スキル（requiredSkill, currentCoverage, severity, suggestedAction）
- `HiringProposal`: 自動採用提案（gaps, suggestedRole, suggestedCapabilities, priority）

### 永続化

- `runtime/state/performance/<agentId>.json` - エージェント別パフォーマンス履歴
- `runtime/state/hiring-proposals/analysis-<timestamp>.json` - 採用提案

### WorkflowEngine統合

- ワークフロー完了時（deliveryフェーズ承認時）にパフォーマンスを自動記録
- QA結果から品質スコア（0-100）を自動計算

---

## Phase 4: 部門間連携強化（エスカレーション分析）

### 目的

エスカレーション履歴を分析し、繰り返しパターンを検出して根本原因を提案する。

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `tools/cli/lib/execution/escalation-analyzer.ts` | エスカレーション分析 |

### EscalationAnalyzer API

```typescript
class EscalationAnalyzer {
  recordEscalation(record: EscalationRecord): Promise<void>
  resolveEscalation(escalationId: string, resolution: string): Promise<boolean>
  analyze(): Promise<EscalationAnalysisResult>
  getAgentEscalations(agentId: string): Promise<EscalationRecord[]>
}
```

### パターン検出

- エージェント × エラーカテゴリ でグループ化
- 3回以上の繰り返しをパターンとして検出
- カテゴリ: `quality_gate_failure`, `timeout`, `runtime_error`, `review_rejection`, `resource_limit`

### 根本原因推定

各カテゴリに対応する根本原因テンプレートと推奨アクションを提供。

### 永続化

- `runtime/state/escalations/escalations.json` - エスカレーション履歴

### WorkflowEngine統合

- フェーズエラー発生時にエスカレーションを自動記録

---

## テスト

| テストファイル | テスト数 | 対象 |
|---------------|---------|------|
| `tests/execution/qa-result-parser.test.ts` | 22 | QAパーサー |
| `tests/execution/agent-performance-tracker.test.ts` | 14 | パフォーマンストラッカー |
| `tests/execution/skill-gap-detector.test.ts` | 9 | スキルギャップ検出 |
| `tests/execution/escalation-analyzer.test.ts` | 13 | エスカレーション分析 |

## 依存関係

```
Phase 1: QA結果パース（基盤）
    ↓
Phase 2: 採用本物化（Phase 1のパーサーを使用）
    ↓
Phase 3: エージェント成長（Phase 1+2の結果を蓄積）
    ↓
Phase 4: 部門間連携（Phase 3の分析と連携）
```
