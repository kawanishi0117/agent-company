# コンテナ隔離アーキテクチャ

## 概要

AgentCompanyのワーカーコンテナは、セキュリティと信頼性を確保するために厳格な隔離を実装している。
各ワーカーエージェントは専用のDockerコンテナで作業し、他のワーカーとの干渉を防ぐ。

## 隔離保証

### 1. ネットワーク隔離

```
┌─────────────────────────────────────────────────────────────┐
│                      Host System                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Worker A   │  │  Worker B   │  │  Worker C   │          │
│  │ network:none│  │ network:none│  │ network:none│          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          │                                   │
│                    ┌─────┴─────┐                             │
│                    │ Agent Bus │ (ファイルベース)            │
│                    │ pull/poll │                             │
│                    └───────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

- **networkMode: 'none'**: コンテナ間の直接通信を完全に禁止
- **Agent Bus経由のみ**: ファイルベースのメッセージキューで通信
- **Worker A → Worker B への直接パケット送信不可**

### 2. ファイルシステム隔離

```
Worker A                    Worker B
┌─────────────────┐        ┌─────────────────┐
│ /workspace      │        │ /workspace      │
│ (独自ストレージ)│        │ (独自ストレージ)│
│                 │        │                 │
│ /results (ro)   │        │ /results (ro)   │
│ ↓               │        │ ↓               │
└────────┬────────┘        └────────┬────────┘
         │                          │
         └──────────┬───────────────┘
                    │
         ┌──────────┴──────────┐
         │ runtime/runs/<id>/  │
         │ (読み取り専用共有)  │
         └─────────────────────┘
```

- **各ワーカーは独自の `/workspace`**: 共有ボリュームなし
- **リポジトリはコンテナ内にclone**: ホストbind mountではない
- **Worker A は Worker B の `/workspace` にアクセス不可**

### 3. 読み取り専用共有

- `runtime/runs/<run-id>/` のみ読み取り専用（`:ro`）でマウント
- 結果収集用のディレクトリのみ共有
- 書き込み不可

## セキュリティオプション

### デフォルト設定

```typescript
const DEFAULT_ISOLATION_CONFIG = {
  networkMode: 'none', // ネットワーク隔離
  noNewPrivileges: true, // 特権昇格禁止
  dropAllCapabilities: true, // 全capabilities削除
  pidsLimit: 256, // プロセス数制限
  readOnlyRootFilesystem: false, // /workspaceへの書き込みが必要
  tmpfsMounts: ['/tmp', '/var/tmp'],
};
```

### 各オプションの説明

| オプション                              | 説明                              | セキュリティ効果   |
| --------------------------------------- | --------------------------------- | ------------------ |
| `--security-opt=no-new-privileges:true` | setuid/setgidによる特権取得を禁止 | 特権昇格攻撃を防止 |
| `--cap-drop=ALL`                        | 全てのLinux capabilitiesを削除    | 特権操作を制限     |
| `--pids-limit=256`                      | プロセス数を制限                  | フォーク爆弾を防止 |
| `--tmpfs=/tmp:rw,noexec,nosuid`         | 一時ファイル用の揮発性ストレージ  | 永続化攻撃を防止   |

## 隔離検証

### プログラムによる検証

```typescript
// 隔離設定の検証
const result = await container.verifyIsolation();
console.log(result);
// {
//   valid: true,
//   networkIsolated: true,
//   filesystemIsolated: true,
//   readOnlySharedCorrect: true,
//   securityOptionsCorrect: true,
//   errors: []
// }
```

### 2コンテナ間の隔離検証

```typescript
import { verifyContainerIsolation } from './worker-container';

const result = await verifyContainerIsolation(containerA, containerB);
// {
//   isolated: true,
//   networkIsolated: true,
//   filesystemIsolated: true,
//   errors: []
// }
```

## 受け入れテスト基準

要件5.4に基づく隔離受け入れテスト基準：

1. **Worker A は Worker B の `/workspace` にアクセス不可**
2. **Worker A は Worker B にネットワークパケット送信不可**
3. **Worker A はホストファイルシステムにアクセス不可**
4. **DoD使用時、他ワーカーに影響するコンテナ生成不可**

## 使用方法

### 基本的な使用

```typescript
import { createWorkerContainer } from './worker-container';

// デフォルトの隔離設定でコンテナを作成
const container = createWorkerContainer('worker-001', {
  runId: 'run-123',
  resultsDir: '/path/to/runtime/runs/run-123',
});

await container.createAndStart();
```

### 最大限の隔離設定

```typescript
import { createIsolatedWorkerContainer } from './worker-container';

// 最大限の隔離設定でコンテナを作成
const container = createIsolatedWorkerContainer('worker-001');
```

### カスタム隔離設定

```typescript
const container = createWorkerContainer('worker-001', {
  isolation: {
    networkMode: 'none',
    noNewPrivileges: true,
    dropAllCapabilities: true,
    pidsLimit: 512, // カスタム値
  },
});
```

## 関連ファイル

- `tools/cli/lib/execution/worker-container.ts` - ワーカーコンテナ管理
- `tools/cli/lib/execution/container-runtime.ts` - コンテナランタイム抽象化
- `tests/execution/worker-container.test.ts` - ユニットテスト

## 参照

- **Requirement 5.4**: THE Worker_Container SHALL be isolated
- **Property 10**: Worker Container Isolation
- **Property 11**: Worker Container Cleanup
