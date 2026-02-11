# M2 - 品質ゲート

## 概要

AgentCompanyの品質ゲートシステム。lint（ESLint + Prettier）、test（Vitest）、e2e（Playwright）の3段階で品質を担保する。

## コマンド

```bash
# 静的解析（ESLint + Prettier）
make lint
npm run lint

# ユニットテスト（Vitest + カバレッジ）
make test
npm run test

# E2Eテスト（Playwright）
make e2e
npm run e2e

# 全ゲート一括実行
make ci
npm run ci
```

## 各ゲートの詳細

### 1. Lint（静的解析）

**ツール**: ESLint + Prettier

**設定ファイル**:

- `.eslintrc.json` - ESLint設定
- `.prettierrc` - Prettier設定

**チェック内容**:

- TypeScript構文エラー
- コードスタイル違反
- 未使用変数
- フォーマット不整合

**修正コマンド**:

```bash
npm run lint:fix
```

### 2. Test（ユニットテスト）

**ツール**: Vitest

**設定ファイル**: `vitest.config.ts`

**テストディレクトリ**: `tests/`

**カバレッジ出力**: `coverage/`

**実行オプション**:

```bash
# 通常実行
npm run test

# ウォッチモード
npm run test:watch
```

### 3. E2E（エンドツーエンドテスト）

**ツール**: Playwright

**設定ファイル**: `playwright.config.ts`

**テストディレクトリ**: `e2e/`

**成果物出力**: `runtime/e2e-artifacts/`

**レポート出力**: `runtime/e2e-report/`

**実行オプション**:

```bash
# 通常実行
npm run e2e

# UIモード（デバッグ用）
npm run e2e:ui

# レポート表示
npx playwright show-report runtime/e2e-report
```

### 失敗時の成果物

E2Eテスト失敗時、以下が自動保存される:

- スクリーンショット（失敗時のみ）
- 動画（リトライ時のみ）
- トレース（リトライ時のみ）

## CI統合

`npm run ci`は以下の順序で実行:

1. `lint` - 静的解析
2. `test` - ユニットテスト
3. `e2e` - E2Eテスト

途中で失敗した場合、後続のゲートは実行されない。

## 設定ファイル一覧

| ファイル               | 用途           |
| ---------------------- | -------------- |
| `.eslintrc.json`       | ESLint設定     |
| `.prettierrc`          | Prettier設定   |
| `vitest.config.ts`     | Vitest設定     |
| `playwright.config.ts` | Playwright設定 |

## 除外パターン

以下のディレクトリはlint/テストから除外:

- `node_modules/`
- `dist/`
- `runtime/`
- `coverage/`
- `e2e/`（ESLintのみ）
