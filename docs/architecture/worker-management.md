# ワーカー管理アーキテクチャ

## 概要

Manager Agentは、ワークロードに基づいてWorker Agentを動的に管理する機能を持つ。
これにより、タスク量に応じた効率的なリソース配分と、問題のあるワーカーの自動置換が可能になる。

## 機能一覧

### 1. 動的スケーリング

ワークロードに基づいてワーカー数を自動調整する。

```typescript
// スケーリング設定
interface ScalingConfig {
  minWorkers: number;        // 最小ワーカー数（デフォルト: 1）
  maxWorkers: number;        // 最大ワーカー数（デフォルト: 10）
  scaleUpThreshold: number;  // スケールアップしきい値（デフォルト: 2.0）
  scaleDownThreshold: number; // スケールダウンしきい値（デフォルト: 0.5）
  scalingCooldown: number;   // クールダウン時間（デフォルト: 30秒）
  autoScalingEnabled: boolean; // 自動スケーリング有効フラグ
}
```

**スケールアップ条件:**
- 保留タスク数 / アクティブワーカー数 >= scaleUpThreshold
- 現在のワーカー数 < maxWorkers

**スケールダウン条件:**
- アイドルワーカー比率 >= scaleDownThreshold
- 保留タスク数 = 0
- 現在のワーカー数 > minWorkers

### 2. 能力マッチング

タスクの要件に基づいて最適なワーカーを選択する。

```typescript
// ワーカー仕様
interface WorkerSpec {
  name: string;              // ワーカー名
  capabilities: string[];    // 能力一覧（例: ['frontend', 'react', 'testing']）
  priority?: number;         // 優先度（高いほど優先的に割り当て）
  adapterName?: string;      // AIアダプタ名
  modelName?: string;        // モデル名
}
```

**マッチングスコア計算:**
1. 能力マッチング: タスクの要件とワーカーの能力の一致度
2. ヘルススコア: ワーカーの健全性（0-100）
3. 優先度: ワーカーに設定された優先度
4. 成功率: 過去のタスク完了率
5. 連続失敗ペナルティ: 連続失敗回数に応じたペナルティ

### 3. ヘルスモニタリング

ワーカーの健全性を継続的に監視する。

```typescript
// ワーカー情報
interface WorkerInfo {
  id: AgentId;
  name: string;
  capabilities: string[];
  status: 'idle' | 'working' | 'error' | 'terminated';
  hiredAt: string;
  lastActivityAt: string;
  completedTasks: number;
  failedTasks: number;
  consecutiveFailures: number;
  healthScore: number;       // 0-100
  priority: number;
}
```

**ヘルススコア計算:**
- 基本スコア: 100
- 連続失敗ペナルティ: -15 × 連続失敗回数
- 総失敗率ペナルティ: -30 × (失敗タスク数 / 総タスク数)
- 非アクティブペナルティ: 30分以上非アクティブで減点
- エラー状態ペナルティ: -30

### 4. 自動ワーカー置換

問題のあるワーカーを自動的に置換する。

**置換条件:**
- 連続失敗回数 >= 5回
- ヘルススコア < 10

**置換プロセス:**
1. 古いワーカーを解雇（割り当て中のタスクはpendingに戻す）
2. 同じ能力を持つ新しいワーカーを雇用
3. ログに記録

## 使用方法

### Manager Agentでの使用

```typescript
import { createManagerAgent } from './tools/cli/lib/execution/agents/manager';

// Manager Agentを作成
const manager = createManagerAgent({
  agentId: 'manager-001',
  adapterName: 'ollama',
  modelName: 'llama3',
});

// スケーリング設定を更新
manager.updateScalingConfig({
  minWorkers: 2,
  maxWorkers: 8,
  autoScalingEnabled: true,
});

// ワーカーを雇用
const workerId = await manager.hireWorker({
  name: 'Frontend Developer',
  capabilities: ['frontend', 'react', 'typescript'],
  priority: 5,
});

// タスクに最適なワーカーを選択
const bestWorker = manager.selectBestWorkerForTask(subTask);

// 自動スケーリングを開始
manager.startAutoScaling();

// ワークロード情報を取得
const workload = manager.getWorkloadInfo();
console.log(`保留タスク: ${workload.pendingTasks}`);
console.log(`スケーリング推奨: ${workload.scalingRecommendation}`);

// ヘルスチェックを実行
const healthResult = await manager.performHealthCheck();
console.log(`健全なワーカー: ${healthResult.healthyWorkers}`);
console.log(`置換されたワーカー: ${healthResult.replacedWorkers.length}`);
```

## 設計上の考慮事項

### スケーリングのクールダウン

頻繁なスケーリングを防ぐため、スケーリング操作後は一定時間（デフォルト30秒）のクールダウン期間を設ける。

### 最小/最大ワーカー数の制限

- 最小ワーカー数を下回る解雇は拒否される
- 最大ワーカー数を超える雇用は拒否される
- `replaceWorker()`は一時的に最小ワーカー数を下げて置換を許可

### ワーカー情報の保持

解雇されたワーカーの情報は`terminated`状態で保持され、履歴として参照可能。

## 関連ファイル

- `tools/cli/lib/execution/agents/manager.ts` - Manager Agent実装
- `tools/cli/lib/execution/types.ts` - 型定義
- `tests/execution/manager-agent.test.ts` - ユニットテスト

## 要件トレーサビリティ

| 機能 | 要件 |
|------|------|
| 動的スケーリング | Requirement 1.6 |
| ワーカー雇用/解雇 | Requirement 1.6 |
| 能力マッチング | Requirement 1.6 |
| ヘルスモニタリング | Requirement 1.6 |
| 自動ワーカー置換 | Requirement 1.6 |
