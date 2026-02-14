/**
 * 市場調査エージェント
 *
 * トピックに基づいて市場調査を実施し、構造化レポートを生成する。
 * CodingAgentまたはAIアダプタを使用して情報を収集・分析する。
 *
 * @module execution/market-research-agent
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

/** 競合情報 */
export interface CompetitorInfo {
  /** 競合名 */
  name: string;
  /** 強み */
  strengths: string[];
  /** 弱み */
  weaknesses: string[];
}

/** 推奨アクション */
export interface RecommendedAction {
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** 優先度 */
  priority: 'high' | 'medium' | 'low';
}

/** 市場調査レポート */
export interface MarketResearchReport {
  /** レポートID */
  id: string;
  /** 調査トピック */
  topic: string;
  /** 概要 */
  overview: string;
  /** 競合分析 */
  competitors: CompetitorInfo[];
  /** トレンド */
  trends: string[];
  /** 推奨アクション */
  recommendations: RecommendedAction[];
  /** 情報源 */
  sources: string[];
  /** 作成日時 */
  createdAt: string;
}

/** AI生成インターフェース */
export interface ITextGenerator {
  generate(prompt: string): Promise<string>;
}

// =============================================================================
// 定数
// =============================================================================

/** 市場調査データ保存ディレクトリ */
const MARKET_RESEARCH_DIR = 'runtime/state/market-research';

// =============================================================================
// MarketResearchAgent
// =============================================================================

/**
 * 市場調査エージェント
 *
 * トピックに基づいて市場調査を実施し、構造化レポートを生成する。
 */
export class MarketResearchAgent {
  private readonly basePath: string;
  private readonly textGenerator?: ITextGenerator;

  /**
   * @param options - 設定オプション
   */
  constructor(options?: {
    basePath?: string;
    textGenerator?: ITextGenerator;
  }) {
    this.basePath = options?.basePath ?? MARKET_RESEARCH_DIR;
    this.textGenerator = options?.textGenerator;
  }

  /**
   * 市場調査を実施する
   *
   * @param topic - 調査トピック
   * @returns 市場調査レポート
   */
  async research(topic: string): Promise<MarketResearchReport> {
    const id = `mr-${Date.now()}`;

    let report: MarketResearchReport;

    if (this.textGenerator) {
      report = await this.conductAIResearch(id, topic);
    } else {
      report = this.generatePlaceholderReport(id, topic);
    }

    await this.saveReport(report);
    return report;
  }

  /**
   * 保存済みレポートを取得する
   *
   * @param id - レポートID
   * @returns レポート（存在しない場合はnull）
   */
  async getReport(id: string): Promise<MarketResearchReport | null> {
    try {
      const filePath = path.join(this.basePath, `${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as MarketResearchReport;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 全レポートを一覧取得する
   *
   * @returns レポート配列（新しい順）
   */
  async listReports(): Promise<MarketResearchReport[]> {
    try {
      const entries = await fs.readdir(this.basePath);
      const reports: MarketResearchReport[] = [];
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const filePath = path.join(this.basePath, entry);
          const content = await fs.readFile(filePath, 'utf-8');
          reports.push(JSON.parse(content) as MarketResearchReport);
        }
      }
      reports.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return reports;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * AIを使用して市場調査を実施する
   */
  private async conductAIResearch(
    id: string,
    topic: string
  ): Promise<MarketResearchReport> {
    const prompt = [
      `以下のトピックについて市場調査を実施してください。`,
      `トピック: ${topic}`,
      '',
      '以下の形式でJSON出力してください:',
      '{',
      '  "overview": "概要テキスト",',
      '  "competitors": [{"name": "名前", "strengths": ["強み"], "weaknesses": ["弱み"]}],',
      '  "trends": ["トレンド1", "トレンド2"],',
      '  "recommendations": [{"title": "タイトル", "description": "説明", "priority": "high|medium|low"}],',
      '  "sources": ["情報源1"]',
      '}',
    ].join('\n');

    try {
      const response = await this.textGenerator!.generate(prompt);
      const parsed = this.parseAIResponse(response);

      return {
        id,
        topic,
        overview: parsed.overview ?? `${topic}に関する市場調査`,
        competitors: parsed.competitors ?? [],
        trends: parsed.trends ?? [],
        recommendations: parsed.recommendations ?? [],
        sources: parsed.sources ?? [],
        createdAt: new Date().toISOString(),
      };
    } catch {
      return this.generatePlaceholderReport(id, topic);
    }
  }

  /**
   * AI応答をパースする
   */
  private parseAIResponse(response: string): Partial<MarketResearchReport> {
    try {
      // JSON部分を抽出
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // パース失敗
    }
    return {};
  }

  /**
   * プレースホルダーレポートを生成する（AI不使用時）
   */
  private generatePlaceholderReport(
    id: string,
    topic: string
  ): MarketResearchReport {
    return {
      id,
      topic,
      overview: `${topic}に関する市場調査レポート（AI未使用のためプレースホルダー）`,
      competitors: [],
      trends: [`${topic}分野は成長傾向にある`],
      recommendations: [
        {
          title: '詳細調査の実施',
          description: `${topic}について、AIを使用した詳細な調査を実施することを推奨`,
          priority: 'medium',
        },
      ],
      sources: [],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * レポートを保存する
   */
  private async saveReport(report: MarketResearchReport): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${report.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  }

  /** ファイル未存在エラー判定 */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
