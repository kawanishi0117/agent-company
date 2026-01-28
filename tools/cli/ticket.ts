/**
 * Ticket パーサー
 * Markdownフロントマターを解析してTicketオブジェクトを生成
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

/**
 * チケットのステータス
 */
export type TicketStatus = 'todo' | 'doing' | 'review' | 'done';

/**
 * チケットデータ
 */
export interface Ticket {
  /** チケットID */
  id: string;
  /** ステータス */
  status: TicketStatus;
  /** アサイン先エージェントID */
  assignee: string;
  /** 作成日時 */
  created: string;
  /** 更新日時 */
  updated: string;
  /** タイトル */
  title: string;
  /** 目的 */
  purpose: string;
  /** 範囲 */
  scope: string[];
  /** DoD（完了条件） */
  dod: string[];
  /** リスク */
  risks: string[];
  /** ロールバック手順 */
  rollback: string;
  /** 元のMarkdownコンテンツ */
  rawContent: string;
  /** ファイルパス */
  filePath: string;
}

/**
 * フロントマターのデータ型
 */
interface TicketFrontMatter {
  id?: string;
  status?: string;
  assignee?: string;
  created?: string;
  updated?: string;
}

/**
 * Markdownからセクションを抽出
 */
function extractSection(content: string, sectionName: string): string {
  // 複数のセクション名をサポート（|区切り）
  const names = sectionName.split('|');
  for (const name of names) {
    const pattern = new RegExp(`## ${name.trim()}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return '';
}

/**
 * Markdownからリストアイテムを抽出
 */
function extractListItems(content: string): string[] {
  const items: string[] = [];
  const pattern = /^[-*]\s*\[?\s*[x ]?\s*\]?\s*(.+)$/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    items.push(match[1].trim());
  }
  return items;
}

/**
 * Markdownからタイトルを抽出
 */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * チケットファイルをパースする
 * @param filePath チケットファイルのパス
 * @returns パースされたチケット
 */
export function parseTicket(filePath: string): Ticket {
  const fileContent = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  const frontMatter = data as TicketFrontMatter;

  // セクション抽出
  const purposeSection = extractSection(content, '目的');
  const scopeSection = extractSection(content, '範囲');
  const dodSection = extractSection(content, 'DoD|Definition of Done');
  const risksSection = extractSection(content, 'リスク');
  const rollbackSection = extractSection(content, 'ロールバック');

  return {
    id: frontMatter.id || '',
    status: (frontMatter.status as TicketStatus) || 'todo',
    assignee: frontMatter.assignee || '',
    created: frontMatter.created || new Date().toISOString(),
    updated: frontMatter.updated || new Date().toISOString(),
    title: extractTitle(content),
    purpose: purposeSection,
    scope: extractListItems(scopeSection),
    dod: extractListItems(dodSection),
    risks: extractListItems(risksSection),
    rollback: rollbackSection,
    rawContent: content,
    filePath,
  };
}

/**
 * チケットのステータスを更新する
 * @param ticket チケット
 * @param newStatus 新しいステータス
 */
export function updateTicketStatus(ticket: Ticket, newStatus: TicketStatus): void {
  const fileContent = readFileSync(ticket.filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  data.status = newStatus;
  data.updated = new Date().toISOString();

  const newContent = matter.stringify(content, data);
  writeFileSync(ticket.filePath, newContent, 'utf-8');

  ticket.status = newStatus;
  ticket.updated = data.updated;
}

/**
 * バックログディレクトリから全チケットを読み込む
 * @param backlogDir バックログディレクトリのパス
 * @returns チケットの配列
 */
export function loadAllTickets(backlogDir: string): Ticket[] {
  const files = readdirSync(backlogDir).filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md');

  return files.map((f) => parseTicket(join(backlogDir, f)));
}

/**
 * ステータスでチケットをフィルタリング
 * @param tickets チケットの配列
 * @param status フィルタするステータス
 * @returns フィルタされたチケット
 */
export function filterByStatus(tickets: Ticket[], status: TicketStatus): Ticket[] {
  return tickets.filter((t) => t.status === status);
}

/**
 * チケットをフォーマットして表示用文字列を生成
 * @param ticket チケット
 * @returns フォーマットされた文字列
 */
export function formatTicket(ticket: Ticket): string {
  return `[${ticket.id}] ${ticket.title} (${ticket.status}) - ${ticket.assignee || '未アサイン'}`;
}
