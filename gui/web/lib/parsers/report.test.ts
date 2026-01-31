/**
 * @file レポートパーサーのユニットテスト
 * @description report.tsの各関数をテストする
 */

import { describe, it, expect } from 'vitest';
import { parseReportContent } from './report';

// =============================================================================
// parseReportContent のテスト
// =============================================================================

describe('parseReportContent', () => {
  describe('正常系', () => {
    it('有効なfrontmatterとコンテンツからレポート情報を抽出できる', () => {
      const content = `---
title: '日次レポート 2026-01-27'
date: '2026-01-27'
---

# 日次レポート 2026-01-27

## 概要
本日の作業内容をまとめます。

## 完了タスク
- タスク1
- タスク2
`;

      const result = parseReportContent(content, '2026-01-27.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filename).toBe('2026-01-27.md');
        expect(result.data.type).toBe('daily');
        expect(result.data.date).toBe('2026-01-27');
        expect(result.data.title).toBe('日次レポート 2026-01-27');
        expect(result.data.summary).toContain('本日の作業内容');
        expect(result.data.content).toContain('## 概要');
      }
    });

    it('週次レポートを正しく処理できる', () => {
      const content = `---
title: '週次レポート 2026-W04'
date: '2026-01-20'
---

# 週次レポート 2026-W04

今週の進捗をまとめます。
`;

      const result = parseReportContent(content, '2026-W04.md', 'weekly');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('weekly');
        expect(result.data.title).toBe('週次レポート 2026-W04');
      }
    });

    it('frontmatterがない場合もコンテンツから情報を抽出できる', () => {
      const content = `# 日次レポート 2026-01-28

本日の作業内容です。

## 完了タスク
- タスク1
`;

      const result = parseReportContent(content, '2026-01-28.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('日次レポート 2026-01-28');
        expect(result.data.date).toBe('2026-01-28');
        expect(result.data.summary).toContain('本日の作業内容');
      }
    });
  });

  describe('日付抽出', () => {
    it('ファイル名からYYYY-MM-DD形式の日付を抽出できる', () => {
      const content = `# テストレポート

内容です。
`;

      const result = parseReportContent(content, '2026-01-27.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.date).toBe('2026-01-27');
      }
    });

    it('ファイル名からYYYY-Www形式の日付を抽出できる', () => {
      const content = `# 週次レポート

内容です。
`;

      const result = parseReportContent(content, '2026-W04.md', 'weekly');

      expect(result.success).toBe(true);
      if (result.success) {
        // 2026年第4週の月曜日
        expect(result.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('日付が抽出できない場合は現在日付を使用する', () => {
      const content = `# レポート

内容です。
`;

      const result = parseReportContent(content, 'report.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('タイトル抽出', () => {
    it('H1見出しからタイトルを抽出する', () => {
      const content = `# カスタムタイトル

内容です。
`;

      const result = parseReportContent(content, '2026-01-27.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('カスタムタイトル');
      }
    });

    it('タイトルがない場合はデフォルトタイトルを生成する', () => {
      const content = `## セクション1

内容のみ。
`;

      const result = parseReportContent(content, '2026-01-27.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toContain('日次レポート');
        expect(result.data.title).toContain('2026-01-27');
      }
    });
  });

  describe('サマリー抽出', () => {
    it('最初の段落からサマリーを抽出する', () => {
      const content = `# タイトル

これはサマリーになる最初の段落です。

## セクション
詳細内容。
`;

      const result = parseReportContent(content, '2026-01-27.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary).toBe('これはサマリーになる最初の段落です。');
      }
    });

    it('長いサマリーは100文字で切り詰められる', () => {
      const longText = 'あ'.repeat(150);
      const content = `# タイトル

${longText}
`;

      const result = parseReportContent(content, '2026-01-27.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary.length).toBeLessThanOrEqual(103); // 100 + '...'
        expect(result.data.summary).toContain('...');
      }
    });

    it('コンテンツがない場合は空のサマリーになる', () => {
      const content = `# タイトルのみ
`;

      const result = parseReportContent(content, '2026-01-27.md', 'daily');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary).toBe('');
      }
    });
  });
});
