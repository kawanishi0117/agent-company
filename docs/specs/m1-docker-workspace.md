# M1 - Docker Workspace + 許可リスト

## 概要

エージェントが安全に作業できる隔離されたDocker環境。allowlist方式で依存パッケージを管理し、許可されていないパッケージのインストールを拒否する。

## 機能一覧

### 1. Docker Compose設定

**場所**: `infra/docker/compose.yaml`

```bash
# 起動
docker compose -f infra/docker/compose.yaml up

# 停止
docker compose -f infra/docker/compose.yaml down
```

**特徴**:
- プロジェクトファイルをボリュームマウント
- ネットワーク隔離
- 非rootユーザー実行

### 2. ベースイメージ

**Dockerfile**: `infra/docker/images/base/Dockerfile`

**含まれる環境**:
- Node.js 20
- Python 3
- Git, curl, jq

**セキュリティ**:
- 非rootユーザー（`agent`）で実行
- 最小権限の原則

### 3. Allowlist（許可リスト）

**場所**: `tools/installers/allowlist/`

| ファイル | 用途 |
|----------|------|
| `apt.txt` | システムパッケージ |
| `pip.txt` | Pythonパッケージ |
| `npm.txt` | Node.jsパッケージ |

**フォーマット**: 1行1パッケージ、`#`でコメント

```text
# 例: npm.txt
typescript
eslint
prettier
vitest
```

### 4. インストーラ

**スクリプト**: `tools/installers/install.sh`

```bash
# 使用方法
install.sh <type> <package>

# 例
install.sh npm typescript
install.sh pip requests
install.sh apt curl
```

**動作**:
| 状況 | 結果 | 終了コード |
|------|------|-----------|
| allowlist内 | インストール実行 | 0（成功）/ 2（失敗） |
| allowlist外 | 拒否 | 1 |
| ファイル不在 | エラー | 3 |
| 無効なタイプ | エラー | 4 |

### 5. インストールログ

**出力先**: `runtime/logs/install/`

**フォーマット（JSON）**:
```json
{
  "timestamp": "2026-01-28T10:30:00Z",
  "type": "npm",
  "package": "typescript",
  "status": "success",
  "duration_ms": 1234
}
```

**ステータス**:
- `success`: インストール成功
- `rejected`: allowlist外で拒否
- `failed`: allowlist内だがエラー発生

## TypeScriptユーティリティ

### AllowlistParser

**場所**: `tools/installers/allowlist-parser.ts`

```typescript
import { AllowlistParser } from './allowlist-parser';

const parser = new AllowlistParser();
const allowed = parser.isAllowed('npm', 'typescript'); // true/false
const packages = parser.getPackages('npm'); // string[]
```

### LogWriter

**場所**: `tools/installers/log-writer.ts`

```typescript
import { LogWriter } from './log-writer';

const logger = new LogWriter();
await logger.write({
  type: 'npm',
  package: 'typescript',
  status: 'success',
  duration_ms: 1234
});
```

## セキュリティ

- **隔離**: Docker networkで外部通信を制限
- **権限**: 非rootユーザーで実行
- **依存管理**: allowlist外パッケージは自動拒否
- **監査**: 全インストール操作をログ記録
