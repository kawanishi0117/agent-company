---
inclusion: always
---

# AgentCompany - プロダクト概要

## 概要

AIエージェントを「会社組織」として運用するフレームワーク。
エージェントに役割・責任・品質基準を与え、ガバナンス付きで自律的に作業させる。

## 3ライン構造

| ライン     | 役割       | 担当エージェント       |
| ---------- | ---------- | ---------------------- |
| Delivery   | 実行・納品 | Developer, QA Executor |
| Governance | 品質判定   | Quality Authority      |
| Talent     | 採用・評価 | Hiring Manager         |

## 固定エージェント（MVP）

- **COO/PM**: バックログ管理、アサイン、レポート生成
- **Quality Authority**: PASS/FAIL/WAIVER判定

## 主要機能

- Docker隔離環境での安全な実行
- allowlist方式による依存管理
- 品質ゲート（lint/test/e2e）の強制
- Registry登録によるエージェント採用
- GUI（Backlog/Runs/Reports）での可視化
