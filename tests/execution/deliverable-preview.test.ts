/**
 * DeliverablePreview ユニットテスト
 *
 * @module tests/execution/deliverable-preview
 * @see Requirements: 17.1, 17.2, 17.3, 17.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DeliverablePreview } from '../../tools/cli/lib/execution/deliverable-preview.js';

describe('DeliverablePreview', () => {
  let preview: DeliverablePreview;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-preview-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    preview = new DeliverablePreview(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('buildPreview()', () => {
    it('成功するビルドコマンドでプレビューを生成できる', async () => {
      const result = await preview.buildPreview('wf-001', 'run-001', {
        command: 'node',
        args: ['-e', 'console.log("build success")'],
        cwd: process.cwd(),
      });

      expect(result.workflowId).toBe('wf-001');
      expect(result.buildSuccess).toBe(true);
      expect(result.buildOutput).toContain('build success');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.previewFiles.length).toBeGreaterThan(0);
    });

    it('失敗するビルドコマンドでエラーをキャプチャする', async () => {
      const result = await preview.buildPreview('wf-002', 'run-002', {
        command: 'node',
        args: ['-e', 'process.exit(1)'],
        cwd: process.cwd(),
      });

      expect(result.buildSuccess).toBe(false);
    });

    it('結果がファイルに保存される', async () => {
      await preview.buildPreview('wf-003', 'run-003', {
        command: 'node',
        args: ['-e', 'console.log("test")'],
        cwd: process.cwd(),
      });

      const saved = await preview.getPreview('run-003');
      expect(saved).not.toBeNull();
      expect(saved?.workflowId).toBe('wf-003');
    });
  });

  describe('getPreview()', () => {
    it('存在しないプレビューはnullを返す', async () => {
      const result = await preview.getPreview('nonexistent');
      expect(result).toBeNull();
    });
  });
});
