/**
 * Installer Tests
 * Property 1: Allowlist Enforcement
 * Property 2: Allowlist Acceptance
 * Validates: Requirements 4.2, 4.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  validateInstall,
  isValidPackageType,
  EXIT_CODES,
  processInstallRequest,
} from '../tools/installers/installer';
import { loadAllowlist, PackageType } from '../tools/installers/allowlist-parser';

const ALLOWLIST_DIR = path.join(__dirname, '../tools/installers/allowlist');

describe('Installer', () => {
  // テスト用の一時ディレクトリ
  let tempDir: string;
  let tempLogDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-test-'));
    tempLogDir = path.join(tempDir, 'logs');
    fs.mkdirSync(tempLogDir, { recursive: true });
  });

  afterEach(() => {
    // 一時ディレクトリを削除
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Package Type Validation', () => {
    it('should accept valid package types', () => {
      expect(isValidPackageType('apt')).toBe(true);
      expect(isValidPackageType('pip')).toBe(true);
      expect(isValidPackageType('npm')).toBe(true);
    });

    it('should reject invalid package types', () => {
      expect(isValidPackageType('yum')).toBe(false);
      expect(isValidPackageType('brew')).toBe(false);
      expect(isValidPackageType('')).toBe(false);
    });
  });

  /**
   * Property 1: Allowlist Enforcement
   * For any package installation request, if the package is NOT in the
   * corresponding allowlist, the installer SHALL reject the request.
   * Validates: Requirements 4.3
   */
  describe('Property 1: Allowlist Enforcement', () => {
    // allowlistに含まれないパッケージ名を生成
    const notInAllowlistPackage = (type: PackageType) => {
      const allowlist = loadAllowlist(type, ALLOWLIST_DIR);
      return fc
        .stringMatching(/^[a-z][a-z0-9\-]{2,30}$/)
        .filter(name => !allowlist.includes(name));
    };

    it('should reject packages not in apt allowlist', () => {
      fc.assert(
        fc.property(notInAllowlistPackage('apt'), (packageName) => {
          const result = validateInstall(
            { type: 'apt', package: packageName },
            ALLOWLIST_DIR
          );
          expect(result.allowed).toBe(false);
          expect(result.reason).toContain('not in');
        }),
        { numRuns: 100 }
      );
    });

    it('should reject packages not in pip allowlist', () => {
      fc.assert(
        fc.property(notInAllowlistPackage('pip'), (packageName) => {
          const result = validateInstall(
            { type: 'pip', package: packageName },
            ALLOWLIST_DIR
          );
          expect(result.allowed).toBe(false);
          expect(result.reason).toContain('not in');
        }),
        { numRuns: 100 }
      );
    });

    it('should reject packages not in npm allowlist', () => {
      fc.assert(
        fc.property(notInAllowlistPackage('npm'), (packageName) => {
          const result = validateInstall(
            { type: 'npm', package: packageName },
            ALLOWLIST_DIR
          );
          expect(result.allowed).toBe(false);
          expect(result.reason).toContain('not in');
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Allowlist Acceptance
   * For any package installation request, if the package IS in the
   * corresponding allowlist, the installer SHALL NOT reject it.
   * Validates: Requirements 4.2
   */
  describe('Property 2: Allowlist Acceptance', () => {
    // allowlistに含まれるパッケージ名を生成
    const inAllowlistPackage = (type: PackageType) => {
      const allowlist = loadAllowlist(type, ALLOWLIST_DIR);
      return fc.constantFrom(...allowlist);
    };

    it('should accept packages in apt allowlist', () => {
      fc.assert(
        fc.property(inAllowlistPackage('apt'), (packageName) => {
          const result = validateInstall(
            { type: 'apt', package: packageName },
            ALLOWLIST_DIR
          );
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should accept packages in pip allowlist', () => {
      fc.assert(
        fc.property(inAllowlistPackage('pip'), (packageName) => {
          const result = validateInstall(
            { type: 'pip', package: packageName },
            ALLOWLIST_DIR
          );
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should accept packages in npm allowlist', () => {
      fc.assert(
        fc.property(inAllowlistPackage('npm'), (packageName) => {
          const result = validateInstall(
            { type: 'npm', package: packageName },
            ALLOWLIST_DIR
          );
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Exit Codes', () => {
    it('should return SUCCESS for allowed packages', async () => {
      const result = await processInstallRequest(
        { type: 'npm', package: 'typescript' },
        { allowlistDir: ALLOWLIST_DIR, dryRun: true }
      );
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should return REJECTED for disallowed packages', async () => {
      const result = await processInstallRequest(
        { type: 'npm', package: 'malicious-package-xyz' },
        { allowlistDir: ALLOWLIST_DIR, dryRun: true }
      );
      expect(result.exitCode).toBe(EXIT_CODES.REJECTED);
    });
  });
});
