# AgentCompany 進化計画 - 設計書

## 概要

AgentCompanyを「シミュレーション会社」から「本物の会社」に進化させる。
4つの領域を段階的に実装し、エージェントが実際に仕事をし、評価され、成長する仕組みを構築する。

## 実装順序と依存関係

```
Phase 1: QA結果の実パース（基盤）
    ↓
Phase 2: 採用の本物化（Phase 1のパーサーを使って評価）
    ↓
Phase 3: エージェント成長メカニズム（Phase 1+2の結果を蓄積・分析）
    ↓
Phase 4: 部門間連携強化（Phase 3の分析結果をフィードバック）
```

---

## Phase 1: QA結果の実パース

### 問題
`executeQualityAssurancePhase` でテスト件数・カバレッジがハードコード値。

### 解決策
Vitest / ESLint の出力をパースするユーティリティを作成。

### 新規ファイル
- `tools/cli/lib/execution/qa-result-parser.ts`
- `tests/execution/qa-result-parser.test.ts`

### 改修ファイル
- `tools/cli/lib/execution/workflow-engine.ts`（QAフェーズでパーサーを使用）

### パーサー仕様
- `parseVitestOutput(output: string)` → `{ total, passed, failed, coverage }`
- `parseEslintOutput(output: string)` → `{ errorCount, warningCount, details }`
- CodingAgent の stdout/stderr から正規表現で抽出

---

## Phase 2: 採用の本物化

### 問題
`simulateTrialExecution` が `Math.random()` でスコアを生成。

### 解決策
CodingAgent を使って実際にタスクを実行し、QAパーサーで評価。

### 改修ファイル
- `tools/cli/lib/hiring/trial-runner.ts`（CodingAgent連携追加）
- `tools/cli/lib/hiring/scoring-engine.ts`（QA結果を反映）

### フロー
```
1. CodingAgent.execute(面接課題のプロンプト)
2. 成果物をワークスペースに保存
3. QAパーサーで lint/test 結果を評価
4. scoring-engine に実測値を渡してスコア化
5. CodingAgent未利用時は従来のシミュレーションにフォールバック
```

---

## Phase 3: エージェント成長メカニズム

### 問題
エージェントの能力が静的。実行結果から学習しない。

### 解決策
実行履歴を蓄積し、パフォーマンスを追跡し、スキルギャップを検出する。

### 新規ファイル
- `tools/cli/lib/execution/agent-performance-tracker.ts`
- `tools/cli/lib/execution/skill-gap-detector.ts`
- `tests/execution/agent-performance-tracker.test.ts`
- `tests/execution/skill-gap-detector.test.ts`

### データモデル
```typescript
interface AgentPerformanceRecord {
  agentId: string;
  taskId: string;
  taskType: string;        // 'coding' | 'review' | 'test' | 'documentation'
  success: boolean;
  qualityScore: number;    // 0-100
  duration: number;        // ms
  timestamp: string;
  errorPatterns?: string[];
}

interface AgentPerformanceProfile {
  agentId: string;
  totalTasks: number;
  successRate: number;
  averageQuality: number;
  strengths: string[];     // 得意な taskType
  weaknesses: string[];    // 苦手な taskType
  recentTrend: 'improving' | 'stable' | 'declining';
  lastUpdated: string;
}

interface SkillGap {
  requiredSkill: string;
  currentCoverage: number;  // 0-1（既存エージェントのカバー率）
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction: 'hire' | 'train' | 'reassign';
  suggestedRole?: string;
}
```

### 永続化
- `runtime/state/performance/` にエージェントごとのJSONファイル
- `runtime/state/skill-gaps.json` にスキルギャップ分析結果

---

## Phase 4: 部門間連携強化

### 問題
エスカレーション内容が次回に活かされない。

### 解決策
エスカレーション履歴を分析し、繰り返しパターンを検出して根本原因を提案。

### 新規ファイル
- `tools/cli/lib/execution/escalation-analyzer.ts`
- `tests/execution/escalation-analyzer.test.ts`

### 機能
- エスカレーション履歴の蓄積（`runtime/state/escalations/`）
- パターン検出（同じエージェント×同じエラー種別の繰り返し）
- 根本原因の提案（「Worker Aはlintエラーを3回連続で出している → コーディング規約の理解不足」）
- Phase 3 のスキルギャップ検出と連携（繰り返しエスカレーション → スキルギャップとして登録）
