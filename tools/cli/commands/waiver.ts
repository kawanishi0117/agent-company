/**
 * Waiverコマンド
 * Waiver（例外承認）の作成・検証・一覧表示を行う
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  validateWaiverFile,
  formatValidationResult,
  parseWaiverContent,
  isOverdue,
} from '../lib/waiver-validator.js';

// Waiverディレクトリ
const WAIVER_DIR = 'workflows/waivers';
const TEMPLATE_PATH = path.join(WAIVER_DIR, 'TEMPLATE.md');

/**
 * Waiver一覧の項目
 */
interface WaiverListItem {
  filename: string;
  title: string;
  deadline: string;
  status: string;
  overdue: boolean;
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 */
function getTodayDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * タイトルをファイル名用にサニタイズ
 */
function sanitizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 新規Waiverを作成
 * @param title Waiverのタイトル
 */
export function createWaiver(title: string): void {
  // テンプレートの存在確認
  if (!fs.existsSync(TEMPLATE_PATH)) {
    // eslint-disable-next-line no-console
    console.error(`エラー: テンプレートが見つかりません: ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  // ファイル名を生成
  const date = getTodayDate();
  const sanitizedTitle = sanitizeTitle(title);
  const filename = `${date}-${sanitizedTitle}.md`;
  const filepath = path.join(WAIVER_DIR, filename);

  // 既存ファイルのチェック
  if (fs.existsSync(filepath)) {
    // eslint-disable-next-line no-console
    console.error(`エラー: ファイルが既に存在します: ${filepath}`);
    process.exit(1);
  }

  // テンプレートを読み込み、タイトルを置換
  let content = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  content = content.replace('[タイトル]', title);
  content = content.replace('YYYY-MM-DD', date); // 申請日を今日に設定

  // ファイルを作成
  fs.writeFileSync(filepath, content, 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`✅ Waiverを作成しました: ${filepath}`);
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('次のステップ:');
  // eslint-disable-next-line no-console
  console.log('  1. ファイルを編集して必須項目を記入');
  // eslint-disable-next-line no-console
  console.log('  2. `waiver validate` で検証');
  // eslint-disable-next-line no-console
  console.log('  3. Quality Authorityに承認を依頼');
}

/**
 * Waiverを検証
 * @param filePath Waiverファイルのパス
 */
export function validateWaiver(filePath: string): void {
  const result = validateWaiverFile(filePath);
  // eslint-disable-next-line no-console
  console.log(formatValidationResult(result));

  if (!result.valid) {
    process.exit(1);
  }
}

/**
 * Waiver一覧を取得
 * @param overdueOnly 期限切れのみ表示
 * @returns Waiver一覧
 */
export function getWaiverList(overdueOnly: boolean = false): WaiverListItem[] {
  // Waiverディレクトリの存在確認
  if (!fs.existsSync(WAIVER_DIR)) {
    return [];
  }

  // Waiverファイルを取得（TEMPLATE.mdを除く）
  const files = fs.readdirSync(WAIVER_DIR).filter((f) => {
    return f.endsWith('.md') && f !== 'TEMPLATE.md' && f !== '.gitkeep';
  });

  const items: WaiverListItem[] = [];

  for (const file of files) {
    const filepath = path.join(WAIVER_DIR, file);
    const content = fs.readFileSync(filepath, 'utf-8');
    const fields = parseWaiverContent(content);

    // タイトルを抽出（# Waiver: の後）
    const titleMatch = content.match(/^# Waiver: (.+)$/m);
    const title = titleMatch ? titleMatch[1] : file;

    // ステータスを抽出
    let status = '不明';
    if (fields.ステータス) {
      if (fields.ステータス.includes('[x] 承認') || fields.ステータス.includes('[X] 承認')) {
        status = '承認';
      } else if (fields.ステータス.includes('[x] 却下') || fields.ステータス.includes('[X] 却下')) {
        status = '却下';
      } else if (
        fields.ステータス.includes('[x] 解消済み') ||
        fields.ステータス.includes('[X] 解消済み')
      ) {
        status = '解消済み';
      } else if (
        fields.ステータス.includes('[x] 申請中') ||
        fields.ステータス.includes('[X] 申請中')
      ) {
        status = '申請中';
      }
    }

    const deadline = fields.期限 || '未設定';
    const overdue = deadline !== '未設定' && isOverdue(deadline);

    // 期限切れフィルタ
    if (overdueOnly && !overdue) {
      continue;
    }

    items.push({
      filename: file,
      title,
      deadline,
      status,
      overdue,
    });
  }

  // 期限でソート（古い順）
  items.sort((a, b) => {
    if (a.deadline === '未設定') return 1;
    if (b.deadline === '未設定') return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  return items;
}

/**
 * Waiver一覧を表示
 * @param overdueOnly 期限切れのみ表示
 */
export function listWaivers(overdueOnly: boolean = false): void {
  const items = getWaiverList(overdueOnly);

  if (items.length === 0) {
    if (overdueOnly) {
      // eslint-disable-next-line no-console
      console.log('期限切れのWaiverはありません。');
    } else {
      // eslint-disable-next-line no-console
      console.log('Waiverがありません。');
    }
    return;
  }

  // ヘッダー
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Waiver一覧:');
  // eslint-disable-next-line no-console
  console.log('─'.repeat(80));
  // eslint-disable-next-line no-console
  console.log(
    `${'ファイル名'.padEnd(35)} ${'期限'.padEnd(12)} ${'ステータス'.padEnd(10)} ${'期限超過'}`
  );
  // eslint-disable-next-line no-console
  console.log('─'.repeat(80));

  for (const item of items) {
    const overdueFlag = item.overdue ? '⚠️ OVERDUE' : '';
    // eslint-disable-next-line no-console
    console.log(
      `${item.filename.padEnd(35)} ${item.deadline.padEnd(12)} ${item.status.padEnd(10)} ${overdueFlag}`
    );
  }

  // eslint-disable-next-line no-console
  console.log('─'.repeat(80));
  // eslint-disable-next-line no-console
  console.log(`合計: ${items.length}件`);
}

/**
 * Waiverコマンドのヘルプを表示
 */
export function showWaiverHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
Waiver管理コマンド

使用方法:
  waiver <subcommand> [options]

サブコマンド:
  create <title>      新規Waiverを作成
  validate <file>     Waiverの必須項目を検証
  list                全Waiverを一覧表示
  list --overdue      期限切れWaiverのみ表示
  help                このヘルプを表示

例:
  waiver create "テストカバレッジ例外"
  waiver validate workflows/waivers/2026-01-29-test.md
  waiver list
  waiver list --overdue
`);
}

/**
 * Waiverコマンドのエントリポイント
 * @param args コマンドライン引数
 */
export function executeWaiverCommand(args: string[]): void {
  const subcommand = args[0];

  switch (subcommand) {
    case 'create':
      if (!args[1]) {
        // eslint-disable-next-line no-console
        console.error('エラー: タイトルを指定してください。');
        // eslint-disable-next-line no-console
        console.error('使用方法: waiver create <title>');
        process.exit(1);
      }
      createWaiver(args[1]);
      break;

    case 'validate':
      if (!args[1]) {
        // eslint-disable-next-line no-console
        console.error('エラー: ファイルパスを指定してください。');
        // eslint-disable-next-line no-console
        console.error('使用方法: waiver validate <file>');
        process.exit(1);
      }
      validateWaiver(args[1]);
      break;

    case 'list': {
      const overdueOnly = args.includes('--overdue');
      listWaivers(overdueOnly);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      showWaiverHelp();
      break;

    default:
      if (subcommand) {
        // eslint-disable-next-line no-console
        console.error(`不明なサブコマンド: ${subcommand}`);
      }
      showWaiverHelp();
      process.exit(subcommand ? 1 : 0);
  }
}
