# Company Evolution - アーキテクチャ

## 概要

AgentCompanyの「会社進化」機能群のアーキテクチャ。
4つのフェーズで構成され、エージェントの実行結果を実データとして蓄積・分析する。

## コンポーネント図

```
┌─────────────────────────────────────────────────────┐
│                  WorkflowEngine                      │
│                                                      │
│  QAフェーズ ──→ QAResultParser                       │
│       │              ├── parseVitestOutput()          │
│       │              └── parseEslintOutput()          │
│       │                                              │
│  完了時 ──→ AgentPerformanceTracker                  │
│       │         └── recordPerformance()              │
│       │                                              │
│  エラー時 ──→ EscalationAnalyzer                     │
│                 └── recordEscalation()               │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              SkillGapDetector                         │
│                                                      │
│  AgentPerformanceTracker.getAllProfiles()             │
│         +                                            │
│  agents/registry/*.yaml                              │
│         ↓                                            │
│  detectGaps() → generateProposals()                  │
│         ↓                                            │
│  runtime/state/hiring-proposals/                     │
└─────────────────────────────────────────────────────┘
```

## データフロー

```
[CodingAgent実行]
    │
    ├── stdout/stderr ──→ QAResultParser
    │                        ├── VitestParseResult
    │                        └── EslintParseResult
    │
    ├── 成功/失敗 ──→ AgentPerformanceTracker
    │                    └── PerformanceRecord → runtime/state/performance/
    │
    └── エラー ──→ EscalationAnalyzer
                     └── EscalationRecord → runtime/state/escalations/

[定期分析]
    │
    ├── AgentPerformanceTracker.getAllProfiles()
    │        └── PerformanceProfile[]
    │
    ├── SkillGapDetector.analyze()
    │        ├── SkillGap[]
    │        └── HiringProposal[] → runtime/state/hiring-proposals/
    │
    └── EscalationAnalyzer.analyze()
             ├── EscalationPattern[]
             └── AgentEscalationSummary[]
```

## 永続化構造

```
runtime/state/
├── performance/           # エージェント別パフォーマンス
│   ├── worker-1.json
│   └── reviewer-1.json
├── escalations/           # エスカレーション履歴
│   └── escalations.json
└── hiring-proposals/      # 自動採用提案
    └── analysis-<ts>.json
```

## WorkflowEngine統合ポイント

### パフォーマンス記録（deliveryフェーズ承認時）

`recordWorkflowPerformance()` が呼ばれ、以下を記録:
- タスクカテゴリ: `coding`
- 成功フラグ: `true`（deliveryまで到達 = 成功）
- 品質スコア: `computeQualityScore()` で QA結果から算出

### 品質スコア計算ロジック

```
baseScore = 50
+ テスト成功率 × 30  （passed / total × 30）
+ カバレッジ × 10    （coverage / 100 × 10）
+ lintエラー0件 → +10
```

### エスカレーション記録（フェーズエラー時）

`handlePhaseError()` 内で `recordEscalationEvent()` が呼ばれ、
エラーカテゴリを自動分類して記録。
