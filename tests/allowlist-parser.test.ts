/**
 * Allowlist Parser Tests
 * Property 4: Allowlist Format Consistency
 * Validates: Requirements 3.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseAllowlistFile,
  isValidPackageName,
  loadAllowlist,
  loadAllAllowlists,
} from '../tools/installers/allowlist-parser';
import * as path from 'path';

const ALLOWLIST_DIR = path.join(__dirname, '../tools/installers/allowlist');

describe('Allowlist Parser', () => {
  /**
   * Property 4: Allowlist Format Consistency
   * For any valid allowlist file, each line SHALL contain exactly one package name
   * (ignoring empty lines and comments starting with #).
   */
  describe('Property 4: Allowlist Format Consistency', () => {
    // 有効なパッケージ名を生成するArbitrary
    const validPackageName = fc.stringMatching(/^[a-z][a-z0-9\-\_\.]{0,50}$/);
    
    // コメント行を生成するArbitrary
    const commentLine = fc.string().map(s => `# ${s.replace(/\n/g, ' ')}`);
    
    // 空行を生成するArbitrary
    const emptyLine = fc.constant('');
    
    // allowlistの行を生成するArbitrary
    const allowlistLine = fc.oneof(
      validPackageName,
      commentLine,
      emptyLine
    );

    it('should parse each non-empty, non-comment line as exactly one package name', () => {
      fc.assert(
        fc.property(
          fc.array(allowlistLine, { minLength: 0, maxLength: 50 }),
          (lines) => {
            const content = lines.join('\n');
            const parsed = parseAllowlistFile(content);
            
            // パースされた結果は、元の行から空行とコメントを除いたものと一致
            const expectedPackages = lines
              .map(l => l.trim())
              .filter(l => l.length > 0 && !l.startsWith('#'));
            
            expect(parsed).toEqual(expectedPackages);
            
            // 各パース結果は1つのパッケージ名（空白を含まない）
            parsed.forEach(pkg => {
              expect(pkg).not.toContain('\n');
              expect(pkg.trim()).toBe(pkg);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ignore lines starting with #', () => {
      fc.assert(
        fc.property(
          fc.array(commentLine, { minLength: 1, maxLength: 20 }),
          (comments) => {
            const content = comments.join('\n');
            const parsed = parseAllowlistFile(content);
            expect(parsed).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ignore empty lines', () => {
      fc.assert(
        fc.property(
          fc.array(emptyLine, { minLength: 1, maxLength: 20 }),
          (empties) => {
            const content = empties.join('\n');
            const parsed = parseAllowlistFile(content);
            expect(parsed).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trim whitespace from package names', () => {
      fc.assert(
        fc.property(
          validPackageName,
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          (pkg, leadingSpaces, trailingSpaces) => {
            const paddedPkg = ' '.repeat(leadingSpaces) + pkg + ' '.repeat(trailingSpaces);
            const parsed = parseAllowlistFile(paddedPkg);
            expect(parsed).toHaveLength(1);
            expect(parsed[0]).toBe(pkg);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Package Name Validation', () => {
    it('should reject empty strings', () => {
      expect(isValidPackageName('')).toBe(false);
    });

    it('should reject whitespace-only strings', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(' ', '\t', '\r')),
          (whitespace) => {
            expect(isValidPackageName(whitespace)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should accept valid package names', () => {
      const validNames = ['typescript', 'eslint', 'fast-check', 'python3.11', '@types/node'];
      validNames.forEach(name => {
        expect(isValidPackageName(name)).toBe(true);
      });
    });
  });

  describe('Actual Allowlist Files', () => {
    it('should load apt.txt successfully', () => {
      const packages = loadAllowlist('apt', ALLOWLIST_DIR);
      expect(packages.length).toBeGreaterThan(0);
      expect(packages).toContain('curl');
      expect(packages).toContain('git');
    });

    it('should load pip.txt successfully', () => {
      const packages = loadAllowlist('pip', ALLOWLIST_DIR);
      expect(packages.length).toBeGreaterThan(0);
      expect(packages).toContain('requests');
      expect(packages).toContain('pytest');
    });

    it('should load npm.txt successfully', () => {
      const packages = loadAllowlist('npm', ALLOWLIST_DIR);
      expect(packages.length).toBeGreaterThan(0);
      expect(packages).toContain('typescript');
      expect(packages).toContain('eslint');
    });

    it('should load all allowlists', () => {
      const config = loadAllAllowlists(ALLOWLIST_DIR);
      expect(config.apt.length).toBeGreaterThan(0);
      expect(config.pip.length).toBeGreaterThan(0);
      expect(config.npm.length).toBeGreaterThan(0);
    });
  });
});
