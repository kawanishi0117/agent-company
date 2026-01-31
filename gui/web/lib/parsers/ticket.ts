/**
 * @file チケットパーサー
 * @description workflows/backlog/ のMarkdownファイルからチケット情報を抽出する
 * @requirements 3.3 - frontmatterからid, status, assignee, title, created, updatedを抽出
 */

import matter from 'gray-matter';
import * as fs from 'fs';
import * as path from 'path';
import type { Ticket, TicketStatus, TicketSummary } from '../types';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * チケットファイルが格納されているディレクトリ（プロジェクトルートからの相対パス）
 */
const BACKLOG_DIR = 'workflows/backlog';

/**
 * 有効なチケットステータスの一覧
 */
const VALID_STATUSES: TicketStatus[] = ['todo', 'doing', 'review', 'done'];

// =============================================================================
// 型定義（内部使用）
// =============================================================================

/**
 * frontmatterから抽出される生データの型
 */
interface TicketFrontmatter {
  id?: string;
  status?: string;
  assignee?: string;
  created?: string;
  updated?: string;
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
 * backlogディレクトリの絶対パスを取得する
 * @returns backlogディレクトリの絶対パス
 */
function getBacklogPath(): string {
  return path.join(getProjectRoot(), BACKLOG_DIR);
}

/**
 * ステータス文字列を検証し、有効なTicketStatusに変換する
 * @param status - 検証するステータス文字列
 * @returns 有効なTicketStatus、無効な場合は'todo'をデフォルトとして返す
 */
function validateStatus(status: string | undefined): TicketStatus {
  if (status && VALID_STATUSES.includes(status as TicketStatus)) {
    return status as TicketStatus;
  }
  return 'todo';
}

/**
 * Markdownコンテンツから最初のH1見出しを抽出してタイトルとする
 * @param content - Markdownコンテンツ
 * @returns 抽出されたタイトル、見つからない場合は空文字列
 */
function extractTitleFromContent(content: string): string {
  // 最初の # で始まる行を探す（H1見出し）
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // # で始まり、## ではない行を探す
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      // # を除去してタイトルを返す
      return trimmed.slice(2).trim();
    }
  }
  return '';
}

/**
 * 日付文字列をISO 8601形式に正規化する
 * @param dateStr - 日付文字列
 * @returns ISO 8601形式の日付文字列、無効な場合は現在時刻
 */
function normalizeDate(dateStr: string | undefined): string {
  if (!dateStr) {
    return new Date().toISOString();
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date().toISOString();
    }
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * Markdownファイルの内容をパースしてチケット情報を抽出する
 * @param fileContent - Markdownファイルの内容
 * @param filename - ファイル名（IDのフォールバック用）
 * @returns パース結果（成功時はTicket、失敗時はエラーメッセージ）
 */
export function parseTicketContent(
  fileContent: string,
  filename: string = ''
): ParseResult<Ticket> {
  try {
    // gray-matterでfrontmatterとコンテンツを分離
    const { data, content } = matter(fileContent);
    const frontmatter = data as TicketFrontmatter;

    // IDの取得（frontmatterから、なければファイル名から推測）
    let id = frontmatter.id;
    if (!id && filename) {
      // ファイル名からIDを抽出（例: "0001-sample.md" → "0001"）
      const match = filename.match(/^(\d+)/);
      if (match) {
        id = match[1];
      }
    }

    // IDが取得できない場合はエラー
    if (!id) {
      return {
        success: false,
        error: 'チケットIDが見つかりません',
      };
    }

    // タイトルをコンテンツから抽出
    const title = extractTitleFromContent(content);
    if (!title) {
      return {
        success: false,
        error: 'チケットタイトル（H1見出し）が見つかりません',
      };
    }

    // チケットオブジェクトを構築
    const ticket: Ticket = {
      id,
      status: validateStatus(frontmatter.status),
      assignee: frontmatter.assignee || '',
      title,
      created: normalizeDate(frontmatter.created),
      updated: normalizeDate(frontmatter.updated),
      content: content.trim(),
    };

    return {
      success: true,
      data: ticket,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `チケットのパースに失敗しました: ${message}`,
    };
  }
}

/**
 * 指定されたファイルパスからチケットを読み込んでパースする
 * @param filePath - チケットファイルの絶対パス
 * @returns パース結果（成功時はTicket、失敗時はエラーメッセージ）
 */
export function parseTicketFile(filePath: string): ParseResult<Ticket> {
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

    return parseTicketContent(fileContent, filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `ファイルの読み込みに失敗しました: ${message}`,
    };
  }
}

/**
 * 指定されたIDのチケットを取得する
 * @param ticketId - チケットID
 * @returns パース結果（成功時はTicket、失敗時はエラーメッセージ）
 */
export function getTicketById(ticketId: string): ParseResult<Ticket> {
  try {
    const backlogPath = getBacklogPath();

    // ディレクトリの存在確認
    if (!fs.existsSync(backlogPath)) {
      return {
        success: false,
        error: `backlogディレクトリが見つかりません: ${backlogPath}`,
      };
    }

    // ディレクトリ内のファイルを検索
    const files = fs.readdirSync(backlogPath);

    for (const file of files) {
      // .mdファイルのみ対象
      if (!file.endsWith('.md')) continue;
      // テンプレートファイルは除外
      if (file === 'TEMPLATE.md') continue;
      // .gitkeepは除外
      if (file.startsWith('.')) continue;

      const filePath = path.join(backlogPath, file);
      const result = parseTicketFile(filePath);

      if (result.success && result.data.id === ticketId) {
        return result;
      }
    }

    return {
      success: false,
      error: `チケットが見つかりません: ${ticketId}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `チケットの検索に失敗しました: ${message}`,
    };
  }
}

/**
 * backlogディレクトリから全てのチケットを取得する
 * @returns パース結果（成功時はTicket配列、失敗時はエラーメッセージ）
 */
export function getAllTickets(): ParseResult<Ticket[]> {
  try {
    const backlogPath = getBacklogPath();

    // ディレクトリの存在確認
    if (!fs.existsSync(backlogPath)) {
      // ディレクトリが存在しない場合は空配列を返す
      return {
        success: true,
        data: [],
      };
    }

    // ディレクトリ内のファイルを取得
    const files = fs.readdirSync(backlogPath);
    const tickets: Ticket[] = [];

    for (const file of files) {
      // .mdファイルのみ対象
      if (!file.endsWith('.md')) continue;
      // テンプレートファイルは除外
      if (file === 'TEMPLATE.md') continue;
      // .gitkeepは除外
      if (file.startsWith('.')) continue;

      const filePath = path.join(backlogPath, file);
      const result = parseTicketFile(filePath);

      if (result.success) {
        tickets.push(result.data);
      } else {
        // パースエラーはログ出力してスキップ
        console.warn(`チケットのパースをスキップ: ${file} - ${result.error}`);
      }
    }

    // 更新日時の降順でソート
    tickets.sort((a, b) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    return {
      success: true,
      data: tickets,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return {
      success: false,
      error: `チケット一覧の取得に失敗しました: ${message}`,
    };
  }
}

/**
 * チケット一覧をサマリー形式で取得する（contentを除く）
 * @returns パース結果（成功時はTicketSummary配列、失敗時はエラーメッセージ）
 */
export function getAllTicketSummaries(): ParseResult<TicketSummary[]> {
  const result = getAllTickets();

  if (!result.success) {
    return result;
  }

  // contentを除いたサマリー形式に変換
  const summaries: TicketSummary[] = result.data.map((ticket) => ({
    id: ticket.id,
    status: ticket.status,
    assignee: ticket.assignee,
    title: ticket.title,
    created: ticket.created,
    updated: ticket.updated,
  }));

  return {
    success: true,
    data: summaries,
  };
}

/**
 * ステータスごとにチケットをグループ化する
 * @param tickets - チケットの配列
 * @returns ステータスをキーとしたチケットのマップ
 */
export function groupTicketsByStatus(tickets: Ticket[]): Record<TicketStatus, Ticket[]> {
  const grouped: Record<TicketStatus, Ticket[]> = {
    todo: [],
    doing: [],
    review: [],
    done: [],
  };

  for (const ticket of tickets) {
    grouped[ticket.status].push(ticket);
  }

  return grouped;
}
