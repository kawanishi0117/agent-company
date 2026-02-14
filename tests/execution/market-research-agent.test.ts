/**
 * MarketResearchAgent ユニットテスト
 *
 * @module tests/execution/market-research-agent
 * @see Requirements: 12.1, 12.2, 12.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MarketResearchAgent } from '../../tools/cli/lib/execution/market-research-agent.js';

describe('MarketResearchAgent', () => {
  let agent: MarketResearchAgent;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('runtime', 'test-market-research-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('research()', () => {
    it('AI不使用時にプレースホルダーレポートを生成できる', async () => {
      agent = new MarketResearchAgent({ basePath: testDir });

      const report = await agent.research('AIコーディングツール市場');

      expect(report.id).toMatch(/^mr-/);
      expect(report.topic).toBe('AIコーディングツール市場');
      expect(report.overview).toBeTruthy();
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.createdAt).toBeTruthy();
    });

    it('AIを使用してレポートを生成できる', async () => {
      const mockGenerator = {
        generate: async () => JSON.stringify({
          overview: 'AI市場は急成長中',
          competitors: [
            { name: 'CompA', strengths: ['速度'], weaknesses: ['価格'] },
          ],
          trends: ['LLM統合の加速'],
          recommendations: [
            { title: '差別化戦略', description: '独自機能の開発', priority: 'high' },
          ],
          sources: ['市場レポート2026'],
        }),
      };

      agent = new MarketResearchAgent({
        basePath: testDir,
        textGenerator: mockGenerator,
      });

      const report = await agent.research('AI市場');

      expect(report.overview).toBe('AI市場は急成長中');
      expect(report.competitors.length).toBe(1);
      expect(report.trends).toContain('LLM統合の加速');
    });

    it('AI応答パース失敗時はフォールバックする', async () => {
      const mockGenerator = {
        generate: async () => 'invalid json response',
      };

      agent = new MarketResearchAgent({
        basePath: testDir,
        textGenerator: mockGenerator,
      });

      const report = await agent.research('テスト市場');

      // フォールバックレポートが生成される
      expect(report.topic).toBe('テスト市場');
      expect(report.overview).toContain('プレースホルダー');
    });

    it('レポートが永続化される', async () => {
      agent = new MarketResearchAgent({ basePath: testDir });

      const report = await agent.research('テスト');
      const saved = await agent.getReport(report.id);

      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(report.id);
    });
  });

  describe('listReports()', () => {
    it('全レポートを新しい順に取得できる', async () => {
      agent = new MarketResearchAgent({ basePath: testDir });

      await agent.research('トピック1');
      await new Promise((r) => setTimeout(r, 10));
      await agent.research('トピック2');

      const reports = await agent.listReports();
      expect(reports.length).toBe(2);
      expect(reports[0].topic).toBe('トピック2');
    });

    it('データがない場合は空配列を返す', async () => {
      agent = new MarketResearchAgent({ basePath: testDir });
      const reports = await agent.listReports();
      expect(reports).toEqual([]);
    });
  });

  describe('getReport()', () => {
    it('存在しないレポートはnullを返す', async () => {
      agent = new MarketResearchAgent({ basePath: testDir });
      const report = await agent.getReport('nonexistent');
      expect(report).toBeNull();
    });
  });
});
