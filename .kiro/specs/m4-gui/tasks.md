# Implementation Plan: M4 GUI

## Overview

AgentCompanyのGUIダッシュボードをNext.jsで実装する。Backlog（チケット管理）、Runs（実行ログ・成果物）、Reports（日次/週次レポート）の3画面を提供し、`runtime/runs/`および`workflows/`からデータを読み込んで表示する。

## Tasks

- [x] 1. Next.jsプロジェクトセットアップ
  - [x] 1.1 `gui/web/`にNext.js 14プロジェクトを作成
    - TypeScript + Tailwind CSS + App Router
    - `npx create-next-app@latest gui/web --typescript --tailwind --app --eslint`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 ESLint/Prettier設定をルートプロジェクトと統合
    - ルートの`.eslintrc.json`と`.prettierrc`を参照
    - _Requirements: 1.5_

  - [x] 1.3 依存パッケージをインストール
    - `gray-matter`: frontmatterパース
    - `marked`: Markdown→HTML変換
    - `fast-check`: Property-based testing
    - _Requirements: 1.1_

- [x] 2. 型定義とパーサー実装
  - [x] 2.1 `lib/types.ts`を作成
    - Ticket, Run, Judgment, Report, ApiResponse, PaginatedResponse型を定義
    - _Requirements: 3.3, 4.3, 5.3_

  - [x] 2.2 `lib/parsers/ticket.ts`を作成
    - frontmatterからid, status, assignee, title, created, updatedを抽出
    - Markdownコンテンツを取得
    - _Requirements: 3.3_

  - [x] 2.3 `lib/parsers/run.ts`を作成
    - result.jsonからrunId, ticketId, status, startTime, endTime, logs, artifactsを抽出
    - judgment.jsonが存在すれば読み込み
    - _Requirements: 4.3, 4.5_

  - [x] 2.4 `lib/parsers/report.ts`を作成
    - Markdownファイルからfilename, type, date, title, summaryを抽出
    - _Requirements: 5.3_

  - [ ]\* 2.5 パーサーのProperty-based testを作成
    - **Property 1: チケットパース完全性**
    - **Property 3: Runパース完全性**
    - **Property 8: レポートパース完全性**
    - **Validates: Requirements 3.3, 4.3, 5.3**

- [x] 3. API Routes実装
  - [x] 3.1 `app/api/backlog/route.ts`を作成
    - GET: `workflows/backlog/`からチケット一覧を返す
    - _Requirements: 6.2_

  - [x] 3.2 `app/api/backlog/[id]/route.ts`を作成
    - GET: 指定IDのチケット詳細を返す
    - _Requirements: 6.3_

  - [x] 3.3 `app/api/runs/route.ts`を作成
    - GET: `runtime/runs/`からRun一覧を返す
    - ページネーション対応（page, pageSize）
    - ステータスフィルタ対応
    - _Requirements: 6.4, 4.9, 4.10_

  - [x] 3.4 `app/api/runs/[id]/route.ts`を作成
    - GET: 指定IDのRun詳細を返す
    - _Requirements: 6.5_

  - [x] 3.5 `app/api/reports/route.ts`を作成
    - GET: `workflows/reports/`からレポート一覧を返す
    - _Requirements: 6.6_

  - [x] 3.6 `app/api/reports/[type]/[filename]/route.ts`を作成
    - GET: 指定レポートの詳細を返す
    - _Requirements: 6.7_

  - [ ]\* 3.7 APIのProperty-based testを作成
    - **Property 11: APIレスポンス形式**
    - **Property 12: APIエラーステータスコード**
    - **Validates: Requirements 6.8, 6.9**

- [x] 4. Checkpoint - API動作確認
  - 全APIエンドポイントが正しくデータを返すことを確認
  - `npm run dev`でサーバー起動、curlまたはブラウザで確認

- [x] 5. 共通UIコンポーネント実装
  - [x] 5.1 `components/ui/`に共通コンポーネントを作成
    - Card.tsx: 汎用カード
    - Badge.tsx: ステータスバッジ（PASS/FAIL/WAIVER/todo/doing/review/done）
    - Modal.tsx: モーダルダイアログ
    - Tabs.tsx: タブコンポーネント
    - Loading.tsx: ローディングスピナー
    - Error.tsx: エラー表示
    - _Requirements: 7.1, 7.2, 8.1-8.7_

  - [x] 5.2 `components/layout/`にレイアウトコンポーネントを作成
    - Header.tsx: ヘッダー（ロゴ + ナビゲーション）
    - Navigation.tsx: ナビゲーションリンク
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 5.3 `app/layout.tsx`を更新
    - Headerコンポーネントを配置
    - グローバルスタイル適用
    - _Requirements: 2.1, 2.4_

- [x] 6. Backlog画面実装
  - [x] 6.1 `components/backlog/`にコンポーネントを作成
    - KanbanBoard.tsx: カンバンボード（4カラム）
    - TicketCard.tsx: チケットカード
    - TicketModal.tsx: チケット詳細モーダル
    - _Requirements: 3.2, 3.4, 3.5, 3.6_

  - [x] 6.2 `app/backlog/page.tsx`を作成
    - KanbanBoardを表示
    - 30秒ごとの自動リフレッシュ
    - 空状態の表示
    - _Requirements: 3.1, 3.7, 3.8_

  - [ ]\* 6.3 Backlog画面のProperty-based testを作成
    - **Property 2: チケットステータス分類**
    - **Validates: Requirements 3.2**

- [x] 7. Runs画面実装
  - [x] 7.1 `components/runs/`にコンポーネントを作成
    - RunList.tsx: Run一覧
    - RunCard.tsx: Runカード（判定ステータス表示）
    - RunDetail.tsx: Run詳細（ログ、成果物、判定）
    - _Requirements: 4.4, 4.5, 4.7_

  - [x] 7.2 `app/runs/page.tsx`を作成
    - RunListを表示
    - ステータスフィルタ
    - ページネーション
    - _Requirements: 4.1, 4.2, 4.9, 4.10_

  - [x] 7.3 `app/runs/[id]/page.tsx`を作成
    - RunDetailを表示
    - 成果物リンク
    - _Requirements: 4.6, 4.7, 4.8_

  - [ ]\* 7.4 Runs画面のProperty-based testを作成
    - **Property 4: Run時系列ソート**
    - **Property 5: 判定結果表示**
    - **Property 6: Runフィルタリング**
    - **Property 7: ページネーション**
    - **Validates: Requirements 4.2, 4.5, 4.9, 4.10**

- [x] 8. Reports画面実装
  - [x] 8.1 `components/reports/`にコンポーネントを作成
    - ReportList.tsx: レポート一覧
    - ReportCard.tsx: レポートカード
    - _Requirements: 5.4_

  - [x] 8.2 `app/reports/page.tsx`を作成
    - Daily/Weeklyタブ
    - ReportListを表示
    - 空状態の表示
    - _Requirements: 5.1, 5.2, 5.5, 5.7, 5.8_

  - [ ]\* 8.3 Reports画面のProperty-based testを作成
    - **Property 9: レポート時系列ソート**
    - **Property 10: Markdown→HTML変換**
    - **Validates: Requirements 5.6, 5.8**

- [x] 9. Checkpoint - 画面動作確認
  - 全画面が正しく表示されることを確認
  - ナビゲーションが動作することを確認
  - `npm run dev`でサーバー起動、ブラウザで確認

- [x] 10. E2Eテスト追加
  - [x] 10.1 `e2e/gui.spec.ts`を作成
    - Backlog画面の表示テスト
    - Runs画面の表示・フィルタリングテスト
    - Reports画面の表示テスト
    - ナビゲーション動作テスト
    - _Requirements: 2.6, 3.1, 4.1, 5.1_

- [x] 11. ドキュメント作成
  - [x] 11.1 `gui/web/README.md`を作成
    - セットアップ手順
    - 開発サーバー起動方法
    - ビルド方法
    - _Requirements: 1.6_

  - [x] 11.2 `docs/specs/m4-gui.md`を作成
    - GUI機能の概要
    - 各画面の説明
    - API仕様
    - _Requirements: 1.1-8.7_

  - [x] 11.3 `MVP.md`のM4セクションを更新
    - M4 GUI機能の完了を記録
    - _Requirements: 1.1-8.7_

- [x] 12. Final Checkpoint - 全テスト確認
  - `cd gui/web && npm run test`で全ユニットテストがパス
  - `npm run e2e`で全E2Eテストがパス
  - `make ci`で全品質ゲートがパス

## Notes

- `*`マークのタスクはオプション（Property-based tests）
- 各タスクは前のタスクに依存するため、順番に実行
- `workflows/reports/`ディレクトリが存在しない場合は作成が必要
- 既存の`runtime/runs/`のデータ構造に合わせて実装
- ルートプロジェクトのESLint/Prettier設定を継承
