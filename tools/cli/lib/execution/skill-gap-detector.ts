/**
 * スキルギャップ検出モジュール
 *
 * エージェントのパフォーマンス履歴とレジストリ情報を分析し、
 * 組織に不足しているスキルを検出する。
 * 閾値を超えるギャップがある場合、自動採用提案を生成する。
 *
 * @module execution/skill-gap-detector
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AgentPerformanceTracker,
  PerformanceProfile,
  TaskCategory,
} from './agent-performance-tracker.js';

// =============================================================================
// 型定義
// =============================================================================

/** スキルギャップの深刻度 */
export type GapSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * スキルギャップ
 * @description 組織に不足しているスキルの詳細
 */
export interface SkillGap {
  /** 必要なスキル（タスクカテゴリ） */
  requiredSkill: TaskCategory;
  /** 現在のカバレッジ（0-1、対応可能エージェント数/必要数） */
  currentCoverage: number;
  /** 深刻度 */
  severity: GapSeverity;
  /** 推奨アクション */
  suggestedAction: string;
  /** 推奨する採用ロール */
  suggestedRole: string;
}

/**
 * 採用提案
 * @description スキルギャップに基づく自動採用提案
 */
export interface HiringProposal {
  /** 提案ID */
  id: string;
  /** 提案理由 */
  reason: string;
  /** 対象スキルギャップ */
  gaps: SkillGap[];
  /** 推奨ロール */
  suggestedRole: string;
  /** 推奨能力一覧 */
  suggestedCapabilities: string[];
  /** 優先度 */
  priority: 'low' | 'medium' | 'high';
  /** 生成日時（ISO8601形式） */
  createdAt: string;
}

/**
 * エージェントレジストリエントリ
 * @description agents/registry/ のYAMLから読み取るエージェント情報（簡易版）
 */
export interface AgentRegistryEntry {
  /** エージェントID */
  id: string;
  /** タイトル */
  title: string;
  /** 能力一覧 */
  capabilities: string[];
}

/**
 * スキルギャップ分析結果
 * @description 分析の全体結果
 */
export interface SkillGapAnalysis {
  /** 検出されたギャップ一覧 */
  gaps: SkillGap[];
  /** 採用提案一覧 */
  proposals: HiringProposal[];
  /** 分析日時（ISO8601形式） */
  analyzedAt: string;
  /** 分析対象エージェント数 */
  agentCount: number;
}

// =============================================================================
// 定数
// =============================================================================

/** 採用提案を生成するカバレッジ閾値 */
const HIRING_THRESHOLD = 0.3;

/** 深刻度判定の閾値 */
const SEVERITY_THRESHOLDS = {
  critical: 0.1,
  high: 0.3,
  medium: 0.5,
  low: 0.7,
} as const;

/** タスクカテゴリとロールのマッピング */
const CATEGORY_ROLE_MAP: Record<TaskCategory, string> = {
  coding: 'developer',
  review: 'reviewer',
  test: 'test-engineer',
  documentation: 'technical-writer',
  other: 'generalist',
};

/** タスクカテゴリと推奨能力のマッピング */
const CATEGORY_CAPABILITIES_MAP: Record<TaskCategory, string[]> = {
  coding: ['TypeScript実装', 'コード品質管理', 'リファクタリング'],
  review: ['コードレビュー', '品質基準適用', 'フィードバック生成'],
  test: ['テスト設計', 'テスト自動化', 'カバレッジ分析'],
  documentation: ['技術文書作成', 'API仕様書', 'ユーザーガイド'],
  other: ['汎用タスク処理', '調査・分析'],
};

/** 提案保存ディレクトリ */
const PROPOSALS_DIR = 'runtime/state/hiring-proposals';

// =============================================================================
// スキルギャップ検出器
// =============================================================================

/**
 * スキルギャップ検出器
 *
 * パフォーマンス履歴とエージェントレジストリを分析し、
 * 組織に不足しているスキルを検出する。
 */
export class SkillGapDetector {
  private readonly tracker: AgentPerformanceTracker;
  private readonly registryDir: string;
  private readonly proposalsDir: string;

  /**
   * @param tracker - パフォーマンストラッカー
   * @param registryDir - エージェントレジストリディレクトリ（デフォルト: agents/registry）
   * @param proposalsDir - 提案保存ディレクトリ
   */
  constructor(
    tracker: AgentPerformanceTracker,
    registryDir: string = 'agents/registry',
    proposalsDir: string = PROPOSALS_DIR
  ) {
    this.tracker = tracker;
    this.registryDir = registryDir;
    this.proposalsDir = proposalsDir;
  }

  /**
   * スキルギャップ分析を実行する
   *
   * @returns 分析結果
   */
  async analyze(): Promise<SkillGapAnalysis> {
    const profiles = await this.tracker.getAllProfiles();
    const registryAgents = await this.loadRegistryAgents();

    // カテゴリ別のカバレッジを計算
    const gaps = this.detectGaps(profiles, registryAgents);

    // 採用提案を生成
    const proposals = this.generateProposals(gaps);

    // 提案を永続化
    if (proposals.length > 0) {
      await this.saveProposals(proposals);
    }

    return {
      gaps,
      proposals,
      analyzedAt: new Date().toISOString(),
      agentCount: profiles.length + registryAgents.length,
    };
  }

  /**
   * カテゴリ別のスキルギャップを検出する
   *
   * @param profiles - パフォーマンスプロファイル一覧
   * @param registryAgents - レジストリのエージェント一覧
   * @returns 検出されたギャップ一覧
   */
  detectGaps(
    profiles: PerformanceProfile[],
    registryAgents: AgentRegistryEntry[]
  ): SkillGap[] {
    const allCategories: TaskCategory[] = [
      'coding',
      'review',
      'test',
      'documentation',
    ];
    const gaps: SkillGap[] = [];

    for (const category of allCategories) {
      const coverage = this.computeCategoryCoverage(
        category,
        profiles,
        registryAgents
      );
      if (coverage < SEVERITY_THRESHOLDS.low) {
        const severity = this.determineSeverity(coverage);
        gaps.push({
          requiredSkill: category,
          currentCoverage: Math.round(coverage * 100) / 100,
          severity,
          suggestedAction: this.suggestAction(category, severity),
          suggestedRole: CATEGORY_ROLE_MAP[category],
        });
      }
    }

    return gaps;
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * カテゴリのカバレッジを計算する
   *
   * カバレッジ = (そのカテゴリが得意なエージェント数 + レジストリで対応可能なエージェント数)
   *              / (全エージェント数 or 1)
   */
  private computeCategoryCoverage(
    category: TaskCategory,
    profiles: PerformanceProfile[],
    registryAgents: AgentRegistryEntry[]
  ): number {
    const totalAgents = Math.max(profiles.length + registryAgents.length, 1);

    // パフォーマンス履歴から得意なエージェント数
    const strongAgents = profiles.filter((p) =>
      p.strengths.includes(category)
    ).length;

    // レジストリから対応可能なエージェント数（能力キーワードマッチ）
    const capableAgents = registryAgents.filter((a) =>
      this.agentHasCapability(a, category)
    ).length;

    return (strongAgents + capableAgents) / totalAgents;
  }

  /**
   * エージェントが特定カテゴリの能力を持つか判定する
   */
  private agentHasCapability(
    agent: AgentRegistryEntry,
    category: TaskCategory
  ): boolean {
    const keywords = CATEGORY_CAPABILITIES_MAP[category];
    return agent.capabilities.some((cap) =>
      keywords.some(
        (kw) =>
          cap.toLowerCase().includes(kw.toLowerCase()) ||
          cap.toLowerCase().includes(category.toLowerCase())
      )
    );
  }

  /**
   * カバレッジから深刻度を判定する
   */
  private determineSeverity(coverage: number): GapSeverity {
    if (coverage < SEVERITY_THRESHOLDS.critical) return 'critical';
    if (coverage < SEVERITY_THRESHOLDS.high) return 'high';
    if (coverage < SEVERITY_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * 推奨アクションを生成する
   */
  private suggestAction(category: TaskCategory, severity: GapSeverity): string {
    const role = CATEGORY_ROLE_MAP[category];
    if (severity === 'critical' || severity === 'high') {
      return `${role}ロールのエージェントを早急に採用してください`;
    }
    if (severity === 'medium') {
      return `${role}ロールのエージェント採用を検討してください`;
    }
    return `既存エージェントの${category}スキル向上を検討してください`;
  }

  /**
   * 採用提案を生成する
   */
  private generateProposals(gaps: SkillGap[]): HiringProposal[] {
    // 閾値以下のギャップのみ提案対象
    const criticalGaps = gaps.filter(
      (g) => g.currentCoverage < HIRING_THRESHOLD
    );
    if (criticalGaps.length === 0) return [];

    // ロール別にグループ化
    const byRole = new Map<string, SkillGap[]>();
    for (const gap of criticalGaps) {
      const existing = byRole.get(gap.suggestedRole) ?? [];
      existing.push(gap);
      byRole.set(gap.suggestedRole, existing);
    }

    const proposals: HiringProposal[] = [];
    for (const [role, roleGaps] of byRole) {
      const maxSeverity = roleGaps.reduce(
        (max, g) => {
          const order: GapSeverity[] = ['low', 'medium', 'high', 'critical'];
          return order.indexOf(g.severity) > order.indexOf(max)
            ? g.severity
            : max;
        },
        'low' as GapSeverity
      );

      const capabilities = roleGaps.flatMap(
        (g) => CATEGORY_CAPABILITIES_MAP[g.requiredSkill]
      );

      proposals.push({
        id: `proposal-${Date.now()}-${role}`,
        reason: `${roleGaps.map((g) => g.requiredSkill).join(', ')}のスキルギャップが検出されました`,
        gaps: roleGaps,
        suggestedRole: role,
        suggestedCapabilities: [...new Set(capabilities)],
        priority:
          maxSeverity === 'critical' || maxSeverity === 'high'
            ? 'high'
            : maxSeverity === 'medium'
              ? 'medium'
              : 'low',
        createdAt: new Date().toISOString(),
      });
    }

    return proposals;
  }

  /**
   * レジストリからエージェント情報を読み込む（簡易版）
   */
  private async loadRegistryAgents(): Promise<AgentRegistryEntry[]> {
    try {
      const entries = await fs.readdir(this.registryDir);
      const agents: AgentRegistryEntry[] = [];

      for (const entry of entries) {
        if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
        try {
          const content = await fs.readFile(
            path.join(this.registryDir, entry),
            'utf-8'
          );
          // 簡易YAMLパース（id, title, capabilitiesのみ抽出）
          const agent = this.parseAgentYaml(content, entry);
          if (agent) agents.push(agent);
        } catch {
          // 個別ファイルの読み込み失敗は無視
        }
      }

      return agents;
    } catch {
      return [];
    }
  }

  /**
   * YAML文字列からエージェント情報を簡易パースする
   */
  private parseAgentYaml(
    content: string,
    _filename: string
  ): AgentRegistryEntry | null {
    // 簡易パース: id, title, capabilities を行ベースで抽出
    const idMatch = content.match(/^id:\s*(.+)$/m);
    const titleMatch = content.match(/^title:\s*(.+)$/m);

    if (!idMatch) return null;

    const capabilities: string[] = [];
    const capSection = content.match(
      /capabilities:\s*\n((?:\s+-\s+.+\n?)*)/
    );
    if (capSection) {
      const lines = capSection[1].split('\n');
      for (const line of lines) {
        const match = line.match(/^\s+-\s+(.+)/);
        if (match) capabilities.push(match[1].trim());
      }
    }

    return {
      id: idMatch[1].trim(),
      title: titleMatch?.[1].trim() ?? idMatch[1].trim(),
      capabilities,
    };
  }

  /**
   * 採用提案をファイルに保存する
   */
  private async saveProposals(proposals: HiringProposal[]): Promise<void> {
    await fs.mkdir(this.proposalsDir, { recursive: true });
    const filePath = path.join(
      this.proposalsDir,
      `analysis-${Date.now()}.json`
    );
    await fs.writeFile(filePath, JSON.stringify(proposals, null, 2), 'utf-8');
  }
}
