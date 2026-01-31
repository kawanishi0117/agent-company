# AgentCompany MVP

## 方針

- 部門は「組織図」ではなく **3ライン（Delivery / Governance / Talent）** として実装
- 実体はすべて **Docker上の隔離Workspace** で動かす
- ルールは **ゲートで強制**、最終判断は **Quality Authority** が行う
- 採用は **Registry登録** で増やす（人格は自由、会社ポリシーは固定）

---

## MVPで作るもの

### A. Company OS（固定2エージェント）

| エージェント      | 役割                                                     |
| ----------------- | -------------------------------------------------------- |
| COO/PM            | バックログ化、アサイン、実行指示、結果収集、レポート生成 |
| Quality Authority | PR/差分/ログを見て `PASS/FAIL/WAIVER` 判定               |

### B. Agent Registry

- `agents/registry/` にYAML定義
- 必須フィールド: `id, title, responsibilities, capabilities, deliverables, quality_gates, budget, persona, escalation`

### C. Docker Workspace（方式A）

- 許可リスト: `tools/installers/allowlist/`
- 強制インストール: `tools/installers/install.sh`
- レイヤーキャッシュ: `layer-playwright`

### D. Quality Gates

- `make lint / test / e2e / ci`

### E. 納品テンプレ

- 目的 / 変更点 / テスト結果 / E2E結果 / ロールバック / リスク

### F. GUI

- Backlog / Runs / Reports の3画面

### G. AI実行基盤

- **MVP**: Ollama（ローカル、認証不要）
- **モデル**: codellama / llama3 / deepseek-coder
- **インターフェース**: REST API (`localhost:11434`)
- **アダプタ**: `tools/adapters/ollama.ts`
- **将来対応**: Claude Code, Kiro CLI, Codex, OpenCode

---

## マイルストーン TODO

### M0: 会社の骨格 [1日] ✅ 完了

- [x] Registryスキーマ確定 (`agents/registry/templates/`)
- [x] COO/PM定義 (`agents/registry/coo_pm.yaml`)
- [x] Quality Authority定義 (`agents/registry/quality_authority.yaml`)
- [x] 成果物フォーマット定義 (`docs/company/definition-of-done.md`)
- [x] `Makefile` 雛形作成
- [x] サンプルチケット作成 (`workflows/backlog/0001-sample.md`)
- [x] Ollamaアダプタ基盤 (`tools/adapters/base.ts`, `tools/adapters/ollama.ts`)

**完了条件**: サンプルチケット1件が Plan → Run → Report まで通る ✅

---

### M1: Docker Workspace + 許可リスト [1-2日] ✅ 完了

- [x] `infra/docker/compose.yaml` 作成
- [x] ベースイメージ作成 (`infra/docker/images/base/`)
- [x] `tools/installers/install.sh` 作成
- [x] allowlist作成 (`apt.txt`, `pip.txt`, `npm.txt`)
- [x] インストールログ出力機能

**完了条件**:

- [x] allowlist外のパッケージは拒否される
- [x] allowlist内は成功し、ログが保存される

---

### M2: 品質ゲート [2-3日] ✅ 完了

- [x] `make lint` 実装（ESLint + Prettier）
- [x] `make test` 実装（Vitest）
- [x] `make e2e` 実装（Playwright 5本）
- [x] `make ci` 実装（全ゲート統合）
- [x] E2E失敗時の成果物保存（スクショ/動画）

**完了条件**:

- [x] `make ci` が成功/失敗を明確に返す
- [x] E2E失敗時に成果物が残る

---

### M3: Governance判定 [1日] ✅ 完了

- [x] Quality Authority判定ロジック実装 (`tools/cli/lib/judgment.ts`)
- [x] `PASS/FAIL/WAIVER` 出力フォーマット（JSON形式）
- [x] Waiver作成テンプレート (`workflows/waivers/TEMPLATE.md`)
- [x] Waiver必須項目チェック（期限・理由・フォロータスク）
- [x] `judge`コマンド実装 (`tools/cli/commands/judge.ts`)
- [x] `waiver`コマンド実装 (`tools/cli/commands/waiver.ts`)

**完了条件**: PASS/FAIL/WAIVERの例がそれぞれ再現できる ✅

```bash
# PASS判定
npx tsx tools/cli/agentcompany.ts judge 2026-01-27-151426-q3me

# Waiver作成・検証
npx tsx tools/cli/agentcompany.ts waiver create "テスト例外"
npx tsx tools/cli/agentcompany.ts waiver list
```

---

### M4: GUI [2-4日] ✅ 完了

- [x] Next.jsプロジェクト作成 (`gui/web/`)
- [x] 画面1: Backlog（Todo/Doing/Review/Done）
- [x] 画面2: Runs（実行ログ、成果物リンク）
- [x] 画面3: Reports（日次/週次レポート）
- [x] `runtime/runs/` からのデータ読み込み

**完了条件**: 今何が動いていて、何が詰まっているかがGUIで追える ✅

```bash
# 確認コマンド
cd gui/web && npm run dev  # http://localhost:3000 でGUIを確認
```

---

### M5: 採用システム [1-2日] ✅ 完了

- [x] Hiring Manager定義 (`agents/registry/hiring_manager.yaml`)
- [x] JD生成機能 (`tools/cli/lib/hiring/jd-generator.ts`)
- [x] 面接課題（小タスク）生成 (`tools/cli/lib/hiring/interview-generator.ts`)
- [x] 試用実行 + スコア化 (`tools/cli/lib/hiring/trial-runner.ts`, `scoring-engine.ts`)
- [x] Registry登録フロー (`tools/cli/lib/hiring/registry-manager.ts`)
- [x] CLIコマンド実装 (`tools/cli/commands/hire.ts`)

**完了条件**: 新エージェント（例: Security Reviewer）が登録され、PMが呼び出せる ✅

```bash
# 確認コマンド
npx tsx tools/cli/agentcompany.ts hire jd "Developer"
npx tsx tools/cli/agentcompany.ts hire full "QA Engineer" candidate.yaml
```

---

## MVP完了の Definition of Done

- [x] Docker上で隔離された環境で実装〜テスト〜E2Eが回る
- [x] allowlist運用（方式A）が機能する
- [x] Quality Authorityが最終判定できる
- [x] GUIでBacklog/Runs/Reportsが見える
- [x] 採用（Registry登録）でエージェントを増やせる

---

## Docker環境での動作確認

```bash
# Docker環境でのテスト実行（2026-01-31確認済み）
docker compose -f infra/docker/compose.yaml up -d
docker compose -f infra/docker/compose.yaml exec workspace npm run ci  # ✅ 全ゲート通過

# 個別実行
docker compose -f infra/docker/compose.yaml exec workspace npm run lint  # ✅ 通過（警告のみ）
docker compose -f infra/docker/compose.yaml exec workspace npm run test  # ✅ 88件通過
docker compose -f infra/docker/compose.yaml exec workspace npm run e2e   # ✅ 37件通過
```

### 注意事項

- E2Eテスト実行前に `npx playwright install chromium` が必要
- Dockerイメージには Playwright 依存パッケージが含まれている
