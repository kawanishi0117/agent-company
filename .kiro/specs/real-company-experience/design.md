# Design Document: Real Company Experience

## Overview

AgentCompanyを「タスク処理マシン」から「生きた組織」に進化させる包括的な設計。社長（ユーザー）が本物の会社を経営しているかのような体験を提供する。6フェーズに分けて段階的に実装する。

### 設計目標

1. **社員の存在感**: 全社員のプロフィール、リアルタイムステータス、パフォーマンスをGUIで可視化
2. **日常業務のリズム**: 朝会、日報、週報による定期的な情報共有サイクル
3. **知識経営**: ナレッジベース、レトロスペクティブ、社内ルール自動策定による組織学習
4. **品質の深化**: 仕様適合チェック、技術的負債追跡による品質の客観的評価
5. **経営戦略**: KPIダッシュボード、経営会議、市場調査による戦略的意思決定
6. **企業文化**: モチベーション追跡、関係性マップ、キャリアパス、表彰制度による組織文化の醸成

### 既存コンポーネントとの関係

| 既存コンポーネント | 本specでの活用 |
|-------------------|---------------|
| AgentPerformanceTracker | 社員プロフィール、KPI、MVP選出のデータソース |
| SkillGapDetector | 経営会議の議題、採用提案のデータソース |
| EscalationAnalyzer | 経営会議の議題、モチベーション計算の入力 |
| MeetingCoordinator | 朝会、レトロスペクティブ、経営会議の実行基盤 |
| WorkflowEngine | レトロスペクティブのトリガー、仕様適合チェックの統合先 |
| AgentBus | チャットログの取得元 |
| QualityGate | 技術的負債メトリクスの取得元 |
| OrchestratorServer | 全APIエンドポイントのホスト |

## Architecture

### システム全体図

```
┌─────────────────────────────────────────────────────────────────────┐
│                          GUI Layer (Next.js)                         │
│                                                                      │
│  /employees  /meetings  /knowledge  /kpi  /market                   │
│  /employees/[id]        /meetings/[id]    /knowledge/[id]           │
│                                                                      │
│  Enhanced: /dashboard (Activity Stream, Employee Overview)           │
│  Enhanced: /reports (Daily/Weekly Reports)                           │
│  Enhanced: /workflows/[id] (Compliance Report, Preview)             │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                    API Layer (OrchestratorServer)                     │
│                                                                      │
│  GET/POST /api/employees          GET/POST /api/meetings             │
│  GET/POST /api/knowledge          GET/PUT  /api/okr                  │
│  GET      /api/kpi                GET/POST /api/market-research      │
│  GET      /api/chat-logs          GET      /api/activity-stream      │
│  GET      /api/reports/daily      GET      /api/reports/weekly       │
│  GET      /api/internal-rules     GET      /api/tech-debt            │
│  GET      /api/workflows/:id/compliance                              │
│  POST     /api/workflows/:id/preview                                 │
│  POST     /api/meetings/standup                                      │
│  POST     /api/meetings/retrospective                                │
│  POST     /api/meetings/executive                                    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                    Engine Layer (New Components)                      │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ EmployeeStatusTracker│  │ DailyStandupCoord.  │                   │
│  │ - trackStatus()     │  │ - conductStandup()   │                   │
│  │ - getStatus()       │  │ - generateReport()   │                   │
│  │ - getTimeline()     │  └─────────────────────┘                   │
│  └─────────────────────┘                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ RetrospectiveEngine │  │ KnowledgeBaseManager │                   │
│  │ - conduct()         │  │ - addEntry()         │                   │
│  │ - generateRules()   │  │ - search()           │                   │
│  │ - applyRules()      │  │ - autoGenerate()     │                   │
│  └─────────────────────┘  └─────────────────────┘                   │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ SpecComplianceCheck │  │ TechDebtTracker      │                   │
│  │ - check()           │  │ - snapshot()         │                   │
│  │ - generateReport()  │  │ - getTrend()         │                   │
│  └─────────────────────┘  └─────────────────────┘                   │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ ExecutiveMeetingCrd.│  │ MarketResearchAgent  │                   │
│  │ - conductMeeting()  │  │ - research()         │                   │
│  │ - prepareAgenda()   │  │ - generateReport()   │                   │
│  └─────────────────────┘  └─────────────────────┘                   │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ MoodTracker         │  │ RelationshipTracker  │                   │
│  │ - calculate()       │  │ - recordInteraction()│                   │
│  │ - getHistory()      │  │ - getMap()           │                   │
│  │ - checkAlerts()     │  │ - getCollaborators() │                   │
│  └─────────────────────┘  └─────────────────────┘                   │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ CareerManager       │  │ MVPSelector          │                   │
│  │ - checkPromotion()  │  │ - calculateScores()  │                   │
│  │ - promote/demote()  │  │ - selectCandidates() │                   │
│  │ - getHistory()      │  │ - award()            │                   │
│  └─────────────────────┘  └─────────────────────┘                   │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ ReportGenerator     │  │ ChatLogCapture       │                   │
│  │ - generateDaily()   │  │ - capture()          │                   │
│  │ - generateWeekly()  │  │ - query()            │                   │
│  └─────────────────────┘  └─────────────────────┘                   │
│  ┌─────────────────────┐                                             │
│  │ DeliverablePreview  │                                             │
│  │ - buildPreview()    │                                             │
│  │ - captureOutput()   │                                             │
│  └─────────────────────┘                                             │
└──────────────────────────────────────────────────────────────────────┘
```

### データフロー

```
ワークフロー実行
    │
    ├─→ EmployeeStatusTracker（リアルタイムステータス更新）
    ├─→ ChatLogCapture（Agent Busメッセージ記録）
    ├─→ AgentPerformanceTracker（パフォーマンス記録）
    │
    ├─ QAフェーズ完了 ─→ TechDebtTracker（メトリクス記録）
    ├─ QAフェーズ完了 ─→ SpecComplianceChecker（仕様適合チェック）
    │
    ├─ 納品承認 ─→ RetrospectiveEngine（振り返り会議開催）
    │                  ├─→ KnowledgeBaseManager（学びの蓄積）
    │                  └─→ Internal Rule生成 → CEO承認 → docs/company/
    │
    ├─→ MoodTracker（モチベーション更新）
    ├─→ RelationshipTracker（関係性更新）
    ├─→ CareerManager（昇進/降格チェック）
    │
    └─→ ReportGenerator（日報/週報生成）

定期イベント
    ├─ 朝会トリガー ─→ DailyStandupCoordinator
    ├─ 月末 ─→ MVPSelector（MVP候補選出）
    └─ CEO指示 ─→ ExecutiveMeetingCoordinator / MarketResearchAgent
```

### 永続化ディレクトリ構造

```
runtime/state/
├── performance/           # 既存: パフォーマンス履歴
├── escalations/           # 既存: エスカレーション履歴
├── hiring-proposals/      # 既存: 採用提案
│
├── employee-status/       # NEW: 社員ステータス
│   └── <agentId>.json     #   { status, lastChanged, timeline[] }
│
├── standups/              # NEW: 朝会記録
│   └── <date>.json        #   MeetingMinutes形式
│
├── reports/               # NEW: 日報・週報
│   ├── daily/
│   │   └── <date>.json
│   └── weekly/
│       └── <week>.json
│
├── chat-logs/             # NEW: チャットログ
│   └── <date>.json        #   ChatLogEntry[]
│
├── knowledge-base/        # NEW: ナレッジベース
│   ├── index.json         #   全エントリのインデックス
│   └── entries/
│       └── <id>.json      #   KnowledgeEntry
│
├── internal-rules/        # NEW: 社内ルール
│   └── rules.json         #   InternalRule[]
│
├── tech-debt/             # NEW: 技術的負債
│   └── <date>.json        #   TechDebtSnapshot
│
├── market-research/       # NEW: 市場調査
│   └── <id>.json          #   MarketResearchReport
│
├── employee-mood/         # NEW: モチベーション
│   └── <agentId>.json     #   MoodHistory
│
├── relationships/         # NEW: 関係性
│   └── interactions.json  #   InteractionRecord[]
│
├── career/                # NEW: キャリア
│   └── <agentId>.json     #   CareerHistory
│
├── awards/                # NEW: 表彰
│   └── mvp-history.json   #   MVPAward[]
│
└── okr/                   # NEW: OKR
    └── current.json       #   OKRData
```

## 新規コンポーネント設計

### Phase 1: Employee Visibility（社員の可視化）

#### EmployeeStatusTracker

```typescript
// tools/cli/lib/execution/employee-status-tracker.ts

interface EmployeeStatus {
  agentId: string;
  status: 'idle' | 'working' | 'in_meeting' | 'reviewing' | 'on_break' | 'offline';
  currentTask?: { id: string; title: string };
  lastChanged: string;
}

interface EmployeeTimeline {
  agentId: string;
  date: string;
  entries: { status: string; timestamp: string; duration?: number }[];
}

class EmployeeStatusTracker {
  updateStatus(agentId: string, status: EmployeeStatus['status'], task?: object): Promise<void>
  getStatus(agentId: string): Promise<EmployeeStatus | null>
  getAllStatuses(): Promise<EmployeeStatus[]>
  getTimeline(agentId: string, date: string): Promise<EmployeeTimeline>
}
```

#### EmployeeDirectory API Route

```typescript
// gui/web/app/api/employees/route.ts
// GET /api/employees → 全社員一覧（registry + performance + status統合）
// GET /api/employees/:id → 社員詳細

// データソース統合:
// 1. agents/registry/*.yaml → プロフィール、役割、能力
// 2. runtime/state/performance/ → パフォーマンスメトリクス
// 3. runtime/state/employee-status/ → リアルタイムステータス
// 4. runtime/state/employee-mood/ → モチベーション
// 5. runtime/state/career/ → キャリアレベル
```

#### GUI: Employee Directory Page

```
/employees
├── 組織図ビュー（ツリー表示）
├── リスト表示（テーブル形式）
│   ├── アバター | 名前 | 役割 | ステータス | 品質スコア | ムード | レベル
│   └── クリックで詳細へ
└── フィルタ（役割、ステータス、レベル）

/employees/[id]
├── プロフィールカード（名前、役割、能力、ペルソナ）
├── パフォーマンスグラフ（成功率、品質スコアの推移）
├── 活動タイムライン（今日のステータス変化）
├── 強み/弱み（カテゴリ別成功率）
├── ムード推移グラフ
├── キャリア履歴
├── トップコラボレーター
└── 最近のチャットログ
```

### Phase 2: Daily Operations（日常業務サイクル）

#### DailyStandupCoordinator

```typescript
// tools/cli/lib/execution/daily-standup-coordinator.ts

interface StandupEntry {
  agentId: string;
  accomplished: string[];   // 前日の成果
  planned: string[];        // 本日の予定
  blockers: string[];       // 課題・ブロッカー
}

interface StandupResult {
  date: string;
  entries: StandupEntry[];
  meetingMinutes: MeetingMinutes;
  summary: string;
}

class DailyStandupCoordinator {
  conductStandup(): Promise<StandupResult>
  // MeetingCoordinatorを使用して朝会を実施
  // 各社員のパフォーマンス履歴から自動的に3項目を生成
}
```

#### ReportGenerator

```typescript
// tools/cli/lib/execution/report-generator.ts

interface DailyReport {
  date: string;
  employees: EmployeeDailyActivity[];
  summary: { tasksCompleted: number; avgQuality: number; issues: string[] };
}

interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  summary: { ... };
  comparison: { metric: string; current: number; previous: number; trend: string }[];
  topPerformers: { agentId: string; score: number }[];
  recurringIssues: string[];
  hiringProposals: HiringProposal[];
}

class ReportGenerator {
  generateDailyReport(date: string): Promise<DailyReport>
  generateWeeklyReport(weekStart: string): Promise<WeeklyReport>
}
```

#### ChatLogCapture

```typescript
// tools/cli/lib/execution/chat-log-capture.ts

interface ChatLogEntry {
  id: string;
  timestamp: string;
  sender: string;
  recipient: string;
  type: 'task_assignment' | 'review_feedback' | 'meeting_discussion' | 'escalation' | 'general';
  content: string;
  workflowId?: string;
}

class ChatLogCapture {
  capture(entry: Omit<ChatLogEntry, 'id' | 'timestamp'>): Promise<void>
  query(filters: { date?: string; agentId?: string; type?: string }): Promise<ChatLogEntry[]>
  getActivityStream(limit: number): Promise<ActivityStreamItem[]>
}
```

### Phase 3: Knowledge & Learning（知識経営と学習）

#### RetrospectiveEngine

```typescript
// tools/cli/lib/execution/retrospective-engine.ts

interface RetrospectiveResult {
  workflowId: string;
  meetingMinutes: MeetingMinutes;
  goodPoints: string[];
  improvementPoints: string[];
  actionItems: ActionItem[];
  proposedRules: InternalRule[];
}

interface InternalRule {
  id: string;
  title: string;
  description: string;
  category: 'process' | 'quality' | 'communication' | 'technical';
  source: { type: 'retrospective'; workflowId: string };
  status: 'proposed' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
}

class RetrospectiveEngine {
  conductRetrospective(workflowId: string): Promise<RetrospectiveResult>
  // ワークフロー完了後に自動開催
  // 参加者: ワークフローに関わった全エージェント
  // 議題: 良かった点、改善点、次のアクション
  // AIを使って議論を生成し、改善ルールを提案
}
```

#### KnowledgeBaseManager

```typescript
// tools/cli/lib/execution/knowledge-base-manager.ts

interface KnowledgeEntry {
  id: string;
  title: string;
  category: 'best_practice' | 'failure_case' | 'technical_note' | 'process_improvement';
  content: string;
  tags: string[];
  relatedWorkflows: string[];
  authorAgentId: string;
  createdAt: string;
}

class KnowledgeBaseManager {
  addEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>): Promise<KnowledgeEntry>
  search(query: string, filters?: { category?: string; tags?: string[] }): Promise<KnowledgeEntry[]>
  getEntry(id: string): Promise<KnowledgeEntry | null>
  autoGenerateFromRetrospective(result: RetrospectiveResult): Promise<KnowledgeEntry[]>
  autoGenerateFromEscalation(record: EscalationRecord): Promise<KnowledgeEntry | null>
  getRelevantForWorkflow(instruction: string): Promise<KnowledgeEntry[]>
}
```

### Phase 4: Quality & Compliance（品質とガバナンス）

#### SpecComplianceChecker

```typescript
// tools/cli/lib/execution/spec-compliance-checker.ts

interface ComplianceReport {
  workflowId: string;
  totalRequirements: number;
  implemented: number;
  missing: number;
  partial: number;
  compliancePercentage: number;
  details: ComplianceItem[];
  checkedAt: string;
}

interface ComplianceItem {
  requirement: string;
  status: 'implemented' | 'missing' | 'partial';
  evidence?: string;
  notes?: string;
}

class SpecComplianceChecker {
  check(workflowId: string, proposal: Proposal, deliverables: string[]): Promise<ComplianceReport>
}
```

#### TechDebtTracker

```typescript
// tools/cli/lib/execution/tech-debt-tracker.ts

interface TechDebtSnapshot {
  date: string;
  projectId: string;
  workflowId?: string;
  metrics: {
    lintErrors: number;
    lintWarnings: number;
    testCoverage: number;
    testPassRate: number;
    totalTests: number;
  };
}

class TechDebtTracker {
  recordSnapshot(snapshot: TechDebtSnapshot): Promise<void>
  getTrend(projectId: string, days: number): Promise<TechDebtSnapshot[]>
  checkAlerts(projectId: string): Promise<TechDebtAlert[]>
}
```

### Phase 5: Strategy & Market（経営戦略と市場）

#### ExecutiveMeetingCoordinator

```typescript
// tools/cli/lib/execution/executive-meeting-coordinator.ts

class ExecutiveMeetingCoordinator {
  conductMeeting(): Promise<MeetingMinutes>
  // 参加者: COO/PM, QA, CFO, Security Officer
  // 議題を自動生成:
  //   1. KPIレビュー（PerformanceTracker集計）
  //   2. 採用提案レビュー（SkillGapDetector）
  //   3. エスカレーションパターン（EscalationAnalyzer）
  //   4. 技術的負債（TechDebtTracker）
  //   5. 戦略議論
}
```

#### MarketResearchAgent

```typescript
// tools/cli/lib/execution/market-research-agent.ts
// agents/registry/market_researcher.yaml に登録

interface MarketResearchReport {
  id: string;
  topic: string;
  overview: string;
  competitors: { name: string; strengths: string[]; weaknesses: string[] }[];
  trends: string[];
  recommendations: { title: string; description: string; priority: string }[];
  sources: string[];
  createdAt: string;
}

class MarketResearchAgent {
  research(topic: string): Promise<MarketResearchReport>
  // CodingAgentまたはWeb検索ツールを使用して情報収集
}
```

### Phase 6: Company Culture（企業文化）

#### MoodTracker

```typescript
// tools/cli/lib/execution/mood-tracker.ts

class MoodTracker {
  calculateMood(agentId: string): Promise<number>
  // 計算式:
  //   recentSuccessRate * 0.4
  // + (1 - workloadRatio) * 0.3
  // + (1 - escalationFrequency) * 0.2
  // + (1 - consecutiveFailureRatio) * 0.1
  // → 0-100 のスコア

  updateAfterTask(agentId: string, success: boolean): Promise<void>
  getHistory(agentId: string): Promise<MoodHistory>
  checkAlerts(): Promise<MoodAlert[]>
}
```

#### RelationshipTracker

```typescript
// tools/cli/lib/execution/relationship-tracker.ts

interface InteractionRecord {
  agentA: string;
  agentB: string;
  type: 'meeting' | 'review' | 'handoff' | 'chat';
  timestamp: string;
}

class RelationshipTracker {
  recordInteraction(record: InteractionRecord): Promise<void>
  getMap(): Promise<RelationshipMap>
  getCollaborators(agentId: string): Promise<{ agentId: string; score: number }[]>
}
```

#### CareerManager

```typescript
// tools/cli/lib/execution/career-manager.ts

type CareerLevel = 'junior' | 'mid' | 'senior' | 'lead' | 'principal';

class CareerManager {
  checkPromotionEligibility(agentId: string): Promise<PromotionSuggestion | null>
  promote(agentId: string, newLevel: CareerLevel): Promise<void>
  demote(agentId: string, newLevel: CareerLevel): Promise<void>
  getHistory(agentId: string): Promise<CareerEvent[]>
  getCurrentLevel(agentId: string): Promise<CareerLevel>
}
```

#### MVPSelector

```typescript
// tools/cli/lib/execution/mvp-selector.ts

class MVPSelector {
  calculateScores(month: string): Promise<MVPCandidate[]>
  selectCandidates(month: string, topN: number): Promise<MVPCandidate[]>
  award(month: string, agentId: string): Promise<MVPAward>
  getHistory(): Promise<MVPAward[]>
}
```

## GUI新規画面設計

### /employees — 社員名簿

- 組織図ビュー（ツリー構造、CEO→各部門長→Worker）
- リストビュー（テーブル、ソート・フィルタ対応）
- 各社員カード: アバター、名前、役割、ステータスインジケータ、品質スコア、ムードアイコン、レベルバッジ

### /employees/[id] — 社員詳細

- プロフィールセクション（名前、役割、能力、ペルソナ説明）
- パフォーマンスチャート（折れ線グラフ: 成功率、品質スコアの推移）
- 活動タイムライン（今日のステータス変化をタイムライン表示）
- 強み/弱みレーダーチャート
- ムード推移チャート
- キャリア履歴（レベル変化の年表）
- コラボレーター一覧
- 最近のチャットログ

### /meetings — 会議一覧

- 会議タイプフィルタ（朝会/レトロスペクティブ/経営会議/プロジェクト会議）
- 日付フィルタ
- 各会議カード: タイプアイコン、日付、参加者数、サマリー
- 会議詳細: 議事録全文、決定事項、アクションアイテム

### /knowledge — ナレッジベース

- 検索バー（全文検索）
- カテゴリフィルタ（ベストプラクティス/失敗事例/技術メモ/プロセス改善）
- タグフィルタ
- エントリカード: タイトル、カテゴリバッジ、作成者、日付、タグ
- エントリ詳細: 全文、関連ワークフローリンク、作成者プロフィール

### /kpi — KPIダッシュボード

- 生産性セクション（タスク完了数/週、推移チャート）
- 品質セクション（平均品質スコア、テストカバレッジ、推移チャート）
- コストセクション（推定トークン使用量、推移チャート）
- 成長セクション（新スキル獲得数、ナレッジエントリ数）
- OKRセクション（目標と進捗バー）
- 技術的負債セクション（lint/test推移チャート）

### /market — 市場調査

- 調査リクエストフォーム（トピック入力、送信ボタン）
- 過去の調査レポート一覧
- レポート詳細: 概要、競合分析テーブル、トレンド、推奨アクション
- 推奨アクションから直接ワークフロー指示に変換するボタン

## 実装フェーズ

| Phase | 名称 | 主要成果物 | 依存 |
|-------|------|-----------|------|
| 1 | Employee Visibility | 社員名簿、ステータス追跡、GUI画面 | 既存PerformanceTracker |
| 2 | Daily Operations | 朝会、日報/週報、チャットログ、アクティビティストリーム | Phase 1 |
| 3 | Knowledge & Learning | レトロスペクティブ、ナレッジベース、社内ルール策定 | Phase 2 |
| 4 | Quality & Compliance | 仕様適合チェック、技術的負債追跡、成果物プレビュー | Phase 1 |
| 5 | Strategy & Market | 経営会議、KPIダッシュボード、市場調査 | Phase 1, 3, 4 |
| 6 | Company Culture | モチベーション、関係性マップ、キャリアパス、MVP表彰 | Phase 1, 2 |

