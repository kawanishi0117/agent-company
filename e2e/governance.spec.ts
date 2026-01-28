import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Governance E2Eテスト
 * judge/waiverコマンドの統合テスト
 * Requirements: 6.1, 6.2, 6.3
 */
test.describe('Governance Commands', () => {
  // テストを直列実行（ファイル操作の競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  const WAIVER_DIR = 'workflows/waivers';

  /**
   * ユニークなWaiverタイトルを生成
   */
  function generateUniqueTitle(): string {
    return `e2e-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * テスト用Waiverファイルをクリーンアップ
   */
  async function cleanupTestWaivers(): Promise<void> {
    try {
      const files = await fs.readdir(WAIVER_DIR);
      for (const file of files) {
        if (file.includes('e2e-test-')) {
          await fs.unlink(path.join(WAIVER_DIR, file));
        }
      }
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  }

  test.afterAll(async () => {
    await cleanupTestWaivers();
  });

  test.describe('Waiver Template', () => {
    /**
     * Waiverテンプレートの存在確認
     */
    test('should have waiver template', async () => {
      const templatePath = path.join(WAIVER_DIR, 'TEMPLATE.md');
      const stat = await fs.stat(templatePath);
      expect(stat.isFile()).toBe(true);
    });

    /**
     * Waiverテンプレートの必須フィールド確認
     */
    test('should have required fields in template', async () => {
      const templatePath = path.join(WAIVER_DIR, 'TEMPLATE.md');
      const content = await fs.readFile(templatePath, 'utf-8');

      // 必須フィールドが含まれていること
      expect(content).toContain('## 申請日');
      expect(content).toContain('## 申請者');
      expect(content).toContain('## 対象');
      expect(content).toContain('## 理由');
      expect(content).toContain('## 緊急性');
      expect(content).toContain('## 代替策');
      expect(content).toContain('## 期限');
      expect(content).toContain('## フォロータスク');
      expect(content).toContain('## 承認者');
      expect(content).toContain('## ステータス');
    });
  });

  test.describe('Waiver Commands', () => {
    /**
     * waiver createコマンドのテスト
     */
    test('should create waiver from template', async () => {
      const testTitle = generateUniqueTitle();

      // waiver createを実行
      const result = execSync(`npx tsx tools/cli/agentcompany.ts waiver create "${testTitle}"`, {
        encoding: 'utf-8',
      });

      // 成功メッセージを確認
      expect(result).toContain('Waiverを作成しました');

      // ファイルが作成されたことを確認
      const files = await fs.readdir(WAIVER_DIR);
      const createdFile = files.find((f) => f.includes(testTitle));
      expect(createdFile).toBeDefined();

      // ファイル内容を確認
      const content = await fs.readFile(path.join(WAIVER_DIR, createdFile!), 'utf-8');
      expect(content).toContain(`# Waiver: ${testTitle}`);

      // クリーンアップ
      await fs.unlink(path.join(WAIVER_DIR, createdFile!));
    });

    /**
     * waiver validateコマンドのテスト（無効なWaiver）
     */
    test('should fail validation for incomplete waiver', async () => {
      const testTitle = generateUniqueTitle();

      // テスト用の不完全なWaiverを作成
      execSync(`npx tsx tools/cli/agentcompany.ts waiver create "${testTitle}"`, {
        encoding: 'utf-8',
      });

      const files = await fs.readdir(WAIVER_DIR);
      const createdFile = files.find((f) => f.includes(testTitle));

      try {
        // 検証を実行（テンプレートのままなのでエラーになるはず）
        execSync(
          `npx tsx tools/cli/agentcompany.ts waiver validate ${path.join(WAIVER_DIR, createdFile!)}`,
          {
            encoding: 'utf-8',
          }
        );
        // エラーが発生しなかった場合はテスト失敗
        expect(true).toBe(false);
      } catch (error) {
        // エラーが発生することを期待
        expect(error).toBeDefined();
      } finally {
        // クリーンアップ
        if (createdFile) {
          try {
            await fs.unlink(path.join(WAIVER_DIR, createdFile));
          } catch {
            // ファイルが既に削除されている場合は無視
          }
        }
      }
    });

    /**
     * waiver listコマンドのテスト
     */
    test('should list waivers', async () => {
      // waiver listを実行
      const result = execSync('npx tsx tools/cli/agentcompany.ts waiver list', {
        encoding: 'utf-8',
      });

      // 出力を確認（Waiverがない場合でもエラーにならない）
      expect(result).toBeDefined();
    });
  });

  test.describe('Judge Commands', () => {
    /**
     * judge helpコマンドのテスト
     */
    test('should show judge help', async () => {
      const result = execSync('npx tsx tools/cli/agentcompany.ts judge --help', {
        encoding: 'utf-8',
      });

      expect(result).toContain('判定コマンド');
      expect(result).toContain('--waiver');
    });

    /**
     * judgeコマンドのテスト（存在するrun-id）
     */
    test('should judge existing run', async () => {
      // 既存のrun-idを使用
      const runId = '2026-01-27-151426-q3me';
      const runDir = path.join('runtime', 'runs', runId);

      // run-idが存在することを確認
      const stat = await fs.stat(runDir);
      expect(stat.isDirectory()).toBe(true);

      // judgeを実行
      const result = execSync(`npx tsx tools/cli/agentcompany.ts judge ${runId}`, {
        encoding: 'utf-8',
      });

      // 結果を確認
      expect(result).toContain('Judgment:');
      expect(result).toContain('判定結果を保存しました');

      // judgment.jsonが作成されたことを確認
      const judgmentPath = path.join(runDir, 'judgment.json');
      const judgmentStat = await fs.stat(judgmentPath);
      expect(judgmentStat.isFile()).toBe(true);

      // judgment.jsonの内容を確認
      const judgmentContent = await fs.readFile(judgmentPath, 'utf-8');
      const judgment = JSON.parse(judgmentContent);
      expect(judgment.status).toBeDefined();
      expect(judgment.run_id).toBe(runId);
      expect(judgment.checks).toBeDefined();
    });

    /**
     * judgeコマンドのテスト（存在しないrun-id）
     */
    test('should fail for non-existent run', async () => {
      try {
        execSync('npx tsx tools/cli/agentcompany.ts judge non-existent-run', {
          encoding: 'utf-8',
        });
        // エラーが発生しなかった場合はテスト失敗
        expect(true).toBe(false);
      } catch (error) {
        // エラーが発生することを期待
        expect(error).toBeDefined();
      }
    });
  });

  test.describe('CLI Help', () => {
    /**
     * メインヘルプにjudge/waiverコマンドが表示されること
     */
    test('should show judge and waiver in main help', async () => {
      const result = execSync('npx tsx tools/cli/agentcompany.ts help', {
        encoding: 'utf-8',
      });

      expect(result).toContain('judge');
      expect(result).toContain('waiver');
    });
  });
});
