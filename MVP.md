# AgentCompany MVP

## 方針

- 部門は「組織図」ではなく **3ライン（Delivery / Governance / Talent）** として実装
- 実体はすべて **Docker上の隔離Workspace** で動かす
- ルールは **ゲートで強制**、最終判断は **Quality Authority** が行う
- 採用は **Registry登録** で増やす（人格は自由、会社ポリシーは固定）

---

## MVPで作るもの

### A. Company OS（固定2エージェント）

| エージェント | 役割 |
|-------------|------|
| COO/PM | バックログ化、アサイン、実行指示、結果収集、レポート生成 |
| Quality Authority | PR/差分/ログを見て `PASS/FAIL/WAIVER` 判定 |

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

### M1: Docker Workspace + 許可リスト [1-2日]

- [ ] `infra/docker/compose.yaml` 作成
- [ ] ベースイメージ作成 (`infra/docker/images/base/`)
- [ ] `tools/installers/install.sh` 作成
- [ ] allowlist作成 (`apt.txt`, `pip.txt`, `npm.txt`)
- [ ] インストールログ出力機能

**完了条件**: 
- allowlist外のパッケージは拒否される
- allowlist内は成功し、ログが保存される

---

### M2: 品質ゲート [2-3日]

- [ ] `make lint` 実装（ESLint + Prettier）
- [ ] `make test` 実装（Vitest）
- [ ] `make e2e` 実装（Playwright 1本）
- [ ] `make ci` 実装（全ゲート統合）
- [ ] E2E失敗時の成果物保存（スクショ/動画）

**完了条件**: 
- `make ci` が成功/失敗を明確に返す
- E2E失敗時に成果物が残る

---

### M3: Governance判定 [1日]

- [ ] Quality Authority判定ロジック実装
- [ ] `PASS/FAIL/WAIVER` 出力フォーマット
- [ ] Waiver作成テンプレート (`workflows/waivers/`)
- [ ] Waiver必須項目チェック（期限・理由・フォロータスク）

**完了条件**: PASS/FAIL/WAIVERの例がそれぞれ再現できる

---

### M4: GUI [2-4日]

- [ ] Next.jsプロジェクト作成 (`gui/web/`)
- [ ] 画面1: Backlog（Todo/Doing/Review/Done）
- [ ] 画面2: Runs（実行ログ、成果物リンク）
- [ ] 画面3: Reports（日次/週次レポート）
- [ ] `runtime/runs/` からのデータ読み込み

**完了条件**: 今何が動いていて、何が詰まっているかがGUIで追える

---

### M5: 採用システム [1-2日]

- [ ] Hiring Manager定義 (`agents/registry/hiring_manager.yaml`)
- [ ] JD生成機能
- [ ] 面接課題（小タスク）生成
- [ ] 試用実行 + スコア化
- [ ] Registry登録フロー

**完了条件**: 新エージェント（例: Security Reviewer）が登録され、PMが呼び出せる

---

## MVP完了の Definition of Done

- [ ] Docker上で隔離された環境で実装〜テスト〜E2Eが回る
- [ ] allowlist運用（方式A）が機能する
- [ ] Quality Authorityが最終判定できる
- [ ] GUIでBacklog/Runs/Reportsが見える
- [ ] 採用（Registry登録）でエージェントを増やせる
