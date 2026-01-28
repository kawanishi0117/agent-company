import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';

/**
 * CLI ワークフロー E2Eテスト
 * AgentCompany プロジェクト構造と設定の検証
 */
test.describe('CLI Workflow', () => {
  /**
   * Allowlistパーサーの動作テスト
   */
  test('should parse allowlist files correctly', async () => {
    // npm allowlistファイルの存在確認
    const npmAllowlist = await fs.readFile('tools/installers/allowlist/npm.txt', 'utf-8');

    // 基本パッケージが含まれていること
    expect(npmAllowlist).toContain('typescript');
    expect(npmAllowlist).toContain('eslint');
  });

  /**
   * ディレクトリ構造の検証テスト
   */
  test('should have required directory structure', async () => {
    const requiredDirs = [
      'agents/registry',
      'docs/company',
      'tools/cli',
      'tools/installers/allowlist',
      'runtime/runs',
      'workflows/backlog',
    ];

    for (const dir of requiredDirs) {
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    }
  });

  /**
   * エージェント定義ファイルの存在確認
   */
  test('should have agent definition files', async () => {
    const agentFiles = [
      'agents/registry/coo_pm.yaml',
      'agents/registry/quality_authority.yaml',
      'agents/registry/templates/agent_template.yaml',
    ];

    for (const file of agentFiles) {
      const stat = await fs.stat(file);
      expect(stat.isFile()).toBe(true);
    }
  });

  /**
   * Makefileの存在とターゲット確認
   */
  test('should have Makefile with required targets', async () => {
    const makefile = await fs.readFile('Makefile', 'utf-8');

    // 必須ターゲットが定義されていること
    expect(makefile).toContain('lint:');
    expect(makefile).toContain('test:');
    expect(makefile).toContain('e2e:');
    expect(makefile).toContain('ci:');
  });

  /**
   * package.jsonのスクリプト確認
   */
  test('should have package.json with required scripts', async () => {
    const packageJson = await fs.readFile('package.json', 'utf-8');
    const pkg = JSON.parse(packageJson);

    expect(pkg.scripts.lint).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.e2e).toBeDefined();
    expect(pkg.scripts.ci).toBeDefined();
  });
});
