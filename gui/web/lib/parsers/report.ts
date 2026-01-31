/**
 * @file レポートパーサー
 * @description workflows/reports/ のMarkdownファイルからレポート情報を抽出する
 * @requirements 5.3 - Markdownファイルからfilename, type, date, title, summaryを抽出
 */

import matter from 'gray-matter';
import * as fs from 'fs';
import * as path from 'path';
import type { Report, ReportType, ReportSummary, GroupedReports } from '../types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * レポートディレクトリが格納されているパス（プロジェクトルートからの相対パス）
 */
const REPORTS_DIR = 'workflows/reports';

/**
 * サマリーの最大文字数
 */
const SUMMARY_MAX_LENGTH = 100;

// =============================================================================
// 型定義（内部使用）
// =============================================================================

/**
 * frontmatterから抽出される生データの型
 */
interface ReportFrontmatter {
  title?: string;
  date?: string;
}

/**
 * パース結果の型
 */
type ParseResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * プロジェクトルートディレクトリを取得する
 * @returns プロジェクトルートの絶対パス
 */
function getProjectRoot(): string {
  // gui/web/lib/parsers/ から4階層上がプロジェクトルート
  return path.resolve(__dirname, '../../../../');
}

/**
 * reportsディレクトリの絶対パスを取得する
 * @returns reportsディレクトリの絶対パス
 */
function getReportsPath(): string {
  return path.join(getProjectRoot(), REPORTS_DIR);
}

/**
 * ファイル名から日付を抽出する
 * @param filename - ファイル名（例: "2026-01-27.md", "2026-W04.md"）
 * @returns 日付文字列（YYYY-MM-DD形式）、抽出できない場合は空文字列
 */
function extractDateFromFilename(filename: string): string {
  // YYYY-MM-DD形式を探す
  const dailyMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (dailyMatch) {
    return dailyMatch[1];
  }

  // YYYY-Www形式（週次）を探す
  const weeklyMatch = filename.match(/(\d{4})-W(\d{2})/);
  if (weeklyMatch) {
    // 週番号から日付を計算（その週の月曜日）
    const year = parseInt(weeklyMatch[1], 10);
    const week = parseInt(weeklyMatch[2], 10);
    const date = getDateOfISOWeek(week, year);
    return date.toISOString().split('T')[0];
  }

  return '';
}

/**
 * ISO週番号から日付を取得する
 * @param week - 週番号
 * @param year - 年
 * @returns その週の月曜日の日付
 */
function getDateOfISOWeek(week: number, year: number): Date {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return ISOweekStart;
}

/**
 * Markdownコンテンツから最初のH1見出しを抽出してタイトルとする
 * @param content - Markdownコンテンツ
 * @returns 抽出されたタイトル、見つからない場合は空文字列
 */
function extractTitleFromContent(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      return trimmed.slice(2).trim();
    }
  }
  return '';
}

/**
 * Markdownコンテンツからサマリーを抽出する
 * @param content - Markdownコンテンツ
 * @returns サマリー（最初の100文字程度）
 */
function extractSummary(content: string): string {
  // H1見出しを除いた最初の段落を取得
  const lines = content.split('\n');
  let inParagraph = false;
  let summary = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // H1見出しはスキップ
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      continue;
    }

    // 空行で段落の区切り
    if (trimmed === '') {
      if (inParagraph && summary) {
        break;
      }
      continue;
    }

    // 見出し行はスキップ
    if (trimmed.startsWith('#')) {
      if (summary) break;
      continue;
    }

    // 段落の内容を収集
    inParagraph = true;
    summary += (summary ? ' ' : '') + trimmed;

    // 最大文字数に達したら終了
    if (summary.length >= SUMMARY_MAX_LENGTH) {
      break;
    }
  }

  // 最大文字数で切り詰め
  if (summary.length > SUMMARY_MAX_LENGTH) {
    summary = summary.slice(0, SUMMARY_MAX_LENGTH) + '...';
  }

  return summary;
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * Markdownファイルの内容をパースしてレポート情報を抽出する
 * @param fileContent - Markdownファイルの内容
 * @param filename - ファイル名
 * @param type - レポートの種類（daily/weekly）
 * @returns パース結果（成功時はReport、失敗時はエラーメッセージ）
 */
export function parseReportContent(
  fileContent: string,
  filename: string,
  type: ReportType
): ParseResult<Report> {
  try {
    // gray-matterでfrontmatterとコンテンツを分離
    const { data, content } = matter(fileContent);
    const frontmatter = data as ReportFrontmatter;

    // 日付の取得（frontmatterから、なければファイル名から推測）
    let date = frontmatter.date;
    if (!date) {
      date = extractDateFromFilename(filename);
    }
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }

    // タイトルの取得（frontmatterから、なければコンテンツから抽出）
    let title = frontmatter.title;
    if (!title) {
      title = extractTitleFromContent(content);
    }
    if (!title) {
      // ファイル名からタイトルを生成
      title = `${type === 'daily' ? '日次' : '週次'}レポート - ${date}`;
    }

    // サマリーの抽出
    const summary = extractSummary(content);

    // レポートオブジェクトを構築
    const report: Report = {
      filename,
      type,
      date,
      title,
      summary,
      content: content.trim(),
    };

    return {
      success: true,
      data: report,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `レポートのパースに失敗しました: ${message}`,
    };
  }
}

/**
 * 指定されたファイルパスからレポートを読み込んでパースする
 * @param filePath - レポートファイルの絶対パス
 * @param type - レポートの種類（daily/weekly）
 * @returns パース結果（成功時はReport、失敗時はエラーメッセージ）
 */
export function parseReportFile(filePath: string, type: ReportType): ParseResult<Report> {
  try {
    // ファイルの存在確認
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `ファイルが見つかりません: ${filePath}`,
      };
    }

    // ファイル内容を読み込み
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);

    return parseReportContent(fileContent, filename, type);
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `ファイルの読み込みに失敗しました: ${message}`,
    };
  }
}

/**
 * 指定されたタイプのレポート一覧を取得する
 * @param type - レポートの種類（daily/weekly）
 * @returns パース結果（成功時はReport配列、失敗時はエラーメッセージ）
 */
export function getReportsByType(type: ReportType): ParseResult<Report[]> {
  try {
    const reportsPath = path.join(getReportsPath(), type);

    // ディレクトリの存在確認
    if (!fs.existsSync(reportsPath)) {
      return {
        success: true,
        data: [],
      };
    }

    // ディレクトリ内のファイルを取得
    const files = fs.readdirSync(reportsPath);
    const reports: Report[] = [];

    for (const file of files) {
      // .mdファイルのみ対象
      if (!file.endsWith('.md')) continue;
      // .gitkeepは除外
      if (file.startsWith('.')) continue;

      const filePath = path.join(reportsPath, file);
      const result = parseReportFile(filePath, type);

      if (result.success) {
        reports.push(result.data);
      } else {
        // パースエラーはログ出力してスキップ
        console.warn(`レポートのパースをスキップ: ${file} - ${result.error}`);
      }
    }

    // 日付の降順でソート（新しい順）
    reports.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return {
      success: true,
      data: reports,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `レポート一覧の取得に失敗しました: ${message}`,
    };
  }
}

/**
 * 全てのレポートをグループ化して取得する
 * @returns パース結果（成功時はGroupedReports、失敗時はエラーメッセージ）
 */
export function getAllReports(): ParseResult<GroupedReports> {
  const dailyResult = getReportsByType('daily');
  const weeklyResult = getReportsByType('weekly');

  if (!dailyResult.success) {
    return dailyResult;
  }
  if (!weeklyResult.success) {
    return weeklyResult;
  }

  // サマリー形式に変換
  const toSummary = (report: Report): ReportSummary => ({
    filename: report.filename,
    type: report.type,
    date: report.date,
    title: report.title,
    summary: report.summary,
  });

  return {
    success: true,
    data: {
      daily: dailyResult.data.map(toSummary),
      weekly: weeklyResult.data.map(toSummary),
    },
  };
}

/**
 * 指定されたレポートを取得する
 * @param type - レポートの種類（daily/weekly）
 * @param filename - ファイル名
 * @returns パース結果（成功時はReport、失敗時はエラーメッセージ）
 */
export function getReportByFilename(type: ReportType, filename: string): ParseResult<Report> {
  try {
    const filePath = path.join(getReportsPath(), type, filename);

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `レポートが見つかりません: ${type}/${filename}`,
      };
    }

    return parseReportFile(filePath, type);
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `レポートの取得に失敗しました: ${message}`,
    };
  }
}
