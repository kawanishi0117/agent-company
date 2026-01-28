/**
 * Log Writer Tests
 * Property 3: Log Completeness
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  writeInstallLog,
  readInstallLogs,
  validateLogResult,
  getCurrentTimestamp,
  InstallLogInput,
  InstallResult,
  InstallStatus,
} from '../tools/installers/log-writer';
import { PackageType } from '../tools/installers/allowlist-parser';

describe('Log Writer', () => {
  // テスト用の一時ディレクトリ
  let tempLogDir: string;

  beforeEach(() => {
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-writer-test-'));
  });

  afterEach(() => {
    // 一時ディレクトリを削除
    fs.rmSync(tempLogDir, { recursive: true, force: true });
  });

  describe('Timestamp Generation', () => {
    it('should generate valid ISO 8601 timestamps', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  /**
   * Property 3: Log Completeness
   * For any package installation request (whether successful, rejected, or failed),
   * the installer SHALL write a log entry containing timestamp, package type,
   * package name, and status.
   * Validates: Requirements 5.2, 5.3, 5.4, 5.5
   */
  describe('Property 3: Log Completeness', () => {
    // パッケージタイプを生成
    const packageType = fc.constantFrom<PackageType>('apt', 'pip', 'npm');

    // ステータスを生成
    const installStatus = fc.constantFrom<InstallStatus>('success', 'rejected', 'failed');

    // 有効なパッケージ名を生成
    const validPackageName = fc.stringMatching(/^[a-z][a-z0-9-]{2,30}$/);

    // オプショナルなduration_msを生成
    const optionalDuration = fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined });

    // オプショナルなエラーメッセージを生成
    const optionalError = fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
      nil: undefined,
    });

    it('should write log entries with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          packageType,
          validPackageName,
          installStatus,
          optionalDuration,
          optionalError,
          async (type, pkg, status, duration, error) => {
            const input: InstallLogInput = {
              type,
              package: pkg,
              status,
              ...(duration !== undefined && { duration_ms: duration }),
              ...(error !== undefined && { error }),
            };

            const result = await writeInstallLog(input, tempLogDir);

            // 必須フィールドの検証
            expect(result.timestamp).toBeDefined();
            expect(result.timestamp.length).toBeGreaterThan(0);
            expect(result.type).toBe(type);
            expect(result.package).toBe(pkg);
            expect(result.status).toBe(status);

            // validateLogResultでも検証
            expect(validateLogResult(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should persist log entries to file', async () => {
      await fc.assert(
        fc.asyncProperty(
          packageType,
          validPackageName,
          installStatus,
          async (type, pkg, status) => {
            const input: InstallLogInput = {
              type,
              package: pkg,
              status,
            };

            await writeInstallLog(input, tempLogDir);

            // ログファイルが存在することを確認
            const files = fs.readdirSync(tempLogDir);
            expect(files.length).toBeGreaterThan(0);

            // ログファイルの内容を読み込み
            const logFile = path.join(tempLogDir, files[0]);
            const logs = readInstallLogs(logFile);

            // 書き込んだログが含まれていることを確認
            const found = logs.some(
              (log) => log.type === type && log.package === pkg && log.status === status
            );
            expect(found).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should include error message for failed/rejected status', async () => {
      await fc.assert(
        fc.asyncProperty(
          packageType,
          validPackageName,
          fc.constantFrom<InstallStatus>('rejected', 'failed'),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (type, pkg, status, errorMsg) => {
            const input: InstallLogInput = {
              type,
              package: pkg,
              status,
              error: errorMsg,
            };

            const result = await writeInstallLog(input, tempLogDir);

            expect(result.error).toBe(errorMsg);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should include duration_ms when provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          packageType,
          validPackageName,
          installStatus,
          fc.integer({ min: 0, max: 60000 }),
          async (type, pkg, status, duration) => {
            const input: InstallLogInput = {
              type,
              package: pkg,
              status,
              duration_ms: duration,
            };

            const result = await writeInstallLog(input, tempLogDir);

            expect(result.duration_ms).toBe(duration);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Log Validation', () => {
    it('should validate correct log results', () => {
      const validResult: InstallResult = {
        timestamp: '2026-01-28T10:30:00.000Z',
        type: 'npm',
        package: 'typescript',
        status: 'success',
      };
      expect(validateLogResult(validResult)).toBe(true);
    });

    it('should reject invalid log results', () => {
      const invalidResults = [
        { timestamp: '', type: 'npm', package: 'test', status: 'success' },
        {
          timestamp: '2026-01-28',
          type: 'invalid' as PackageType,
          package: 'test',
          status: 'success',
        },
        { timestamp: '2026-01-28', type: 'npm', package: '', status: 'success' },
        {
          timestamp: '2026-01-28',
          type: 'npm',
          package: 'test',
          status: 'unknown' as InstallStatus,
        },
      ];

      invalidResults.forEach((result) => {
        expect(validateLogResult(result as InstallResult)).toBe(false);
      });
    });
  });
});
