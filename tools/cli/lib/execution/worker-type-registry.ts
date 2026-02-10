/**
 * Worker Type Registry - ワーカータイプレジストリ
 *
 * 各ワーカータイプの設定を管理し、タスクに適したワーカータイプを選択する。
 *
 * @module execution/worker-type-registry
 * @see Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import { WorkerType, WorkerTypeConfig, VALID_WORKER_TYPES } from './types.js';

// =============================================================================
// Worker Type Config Definitions
// =============================================================================

/**
 * Research Worker Config
 * @see Requirement 3.2: THE Research_Worker SHALL have capabilities: web search, document analysis, technology evaluation
 */
const RESEARCH_WORKER_CONFIG: WorkerTypeConfig = {
  type: 'research',
  capabilities: [
    'web_search',
    'document_analysis',
    'technology_evaluation',
    'market_research',
    'competitor_analysis',
    'trend_analysis',
  ],
  tools: [
    'web_search',
    'document_reader',
    'note_taker',
    'summary_generator',
  ],
  persona: 'You are an experienced researcher skilled in market trends, technology evaluation, and competitive analysis. You provide objective, data-driven insights.',
  aiConfig: {
    adapter: 'ollama',
    model: 'llama3.2:1b',
    temperature: 0.3,
  },
};

/**
 * Design Worker Config
 * @see Requirement 3.3: THE Design_Worker SHALL have capabilities: architecture design, API design, data model design
 */
const DESIGN_WORKER_CONFIG: WorkerTypeConfig = {
  type: 'design',
  capabilities: [
    'architecture_design',
    'api_design',
    'data_model_design',
    'system_design',
    'component_design',
    'interface_design',
  ],
  tools: [
    'diagram_generator',
    'schema_designer',
    'api_spec_writer',
    'document_writer',
  ],
  persona: 'You are an experienced software architect skilled in scalable, maintainable system design. You understand SOLID principles, clean architecture, and domain-driven design.',
  aiConfig: {
    adapter: 'ollama',
    model: 'llama3.2:1b',
    temperature: 0.4,
  },
};

/**
 * Designer Worker Config
 * @see Requirement 3.4: THE Designer_Worker SHALL have capabilities: UI/UX design, wireframe creation, style guide
 */
const DESIGNER_WORKER_CONFIG: WorkerTypeConfig = {
  type: 'designer',
  capabilities: [
    'ui_design',
    'ux_design',
    'wireframe_creation',
    'style_guide',
    'prototype_design',
    'accessibility_design',
  ],
  tools: [
    'wireframe_tool',
    'color_palette_generator',
    'typography_selector',
    'component_library',
  ],
  persona: 'You are an experienced UI/UX designer skilled in user-centered design and accessibility. You create intuitive interfaces balancing aesthetics and usability.',
  aiConfig: {
    adapter: 'ollama',
    model: 'llama3.2:1b',
    temperature: 0.5,
  },
};

/**
 * Developer Worker Config
 * @see Requirement 3.5: THE Developer_Worker SHALL have capabilities: code implementation, file operations, command execution
 */
const DEVELOPER_WORKER_CONFIG: WorkerTypeConfig = {
  type: 'developer',
  capabilities: [
    'code_implementation',
    'file_operations',
    'command_execution',
    'debugging',
    'refactoring',
    'code_optimization',
  ],
  tools: [
    'code_editor',
    'file_manager',
    'terminal',
    'git',
    'package_manager',
    'linter',
  ],
  persona: 'You are an experienced software developer skilled in clean code, test-driven development, and continuous integration. You write efficient, maintainable code.',
  aiConfig: {
    adapter: 'ollama',
    model: 'llama3.2:1b',
    temperature: 0.2,
  },
};

/**
 * Test Worker Config
 * @see Requirement 3.6: THE Test_Worker SHALL have capabilities: test creation, test execution, coverage analysis
 */
const TEST_WORKER_CONFIG: WorkerTypeConfig = {
  type: 'test',
  capabilities: [
    'test_creation',
    'test_execution',
    'coverage_analysis',
    'test_planning',
    'bug_detection',
    'regression_testing',
  ],
  tools: [
    'test_runner',
    'coverage_tool',
    'assertion_library',
    'mock_generator',
    'test_reporter',
  ],
  persona: 'You are an experienced QA engineer skilled in test-driven development, property testing, and E2E testing. You excel at finding edge cases and corner cases.',
  aiConfig: {
    adapter: 'ollama',
    model: 'llama3.2:1b',
    temperature: 0.3,
  },
};

/**
 * Reviewer Agent Config
 * @see Requirement 3.7: THE Reviewer_Agent SHALL have capabilities: code review, quality check, merge approval
 */
const REVIEWER_WORKER_CONFIG: WorkerTypeConfig = {
  type: 'reviewer',
  capabilities: [
    'code_review',
    'quality_check',
    'merge_approval',
    'security_review',
    'performance_review',
    'best_practices_check',
  ],
  tools: [
    'diff_viewer',
    'code_analyzer',
    'security_scanner',
    'performance_profiler',
    'comment_tool',
  ],
  persona: 'You are an experienced senior engineer skilled in code review, quality assurance, and security. You provide constructive feedback and support team growth.',
  aiConfig: {
    adapter: 'ollama',
    model: 'llama3.2:1b',
    temperature: 0.2,
  },
};

// =============================================================================
// Worker Type Config Map
// =============================================================================

/**
 * Worker Type Config Map
 * @description Holds all worker type configurations
 * @see Requirement 3.1: THE System SHALL support the following worker types
 */
const WORKER_TYPE_CONFIGS: Map<WorkerType, WorkerTypeConfig> = new Map([
  ['research', RESEARCH_WORKER_CONFIG],
  ['design', DESIGN_WORKER_CONFIG],
  ['designer', DESIGNER_WORKER_CONFIG],
  ['developer', DEVELOPER_WORKER_CONFIG],
  ['test', TEST_WORKER_CONFIG],
  ['reviewer', REVIEWER_WORKER_CONFIG],
]);

// =============================================================================
// Task Mapping Keywords
// =============================================================================

/**
 * Worker Type Mapping Keywords
 * @description Keywords for inferring worker type from task content
 * @see Requirement 3.8: WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements
 */
const WORKER_TYPE_KEYWORDS: Map<WorkerType, string[]> = new Map([
  [
    'research',
    [
      // Japanese keywords
      '\u8abf\u67fb', // 調査
      '\u30ea\u30b5\u30fc\u30c1', // リサーチ
      '\u5206\u6790', // 分析
      '\u8a55\u4fa1', // 評価
      '\u6bd4\u8f03', // 比較
      '\u691c\u8a0e', // 検討
      '\u5e02\u5834', // 市場
      '\u30c8\u30ec\u30f3\u30c9', // トレンド
      '\u7af6\u5408', // 競合
      '\u6280\u8853\u8abf\u67fb', // 技術調査
      '\u30d9\u30f3\u30c1\u30de\u30fc\u30af', // ベンチマーク
      // English keywords
      'research',
      'analyze',
      'evaluate',
      'compare',
      'investigate',
      'market',
      'trend',
    ],
  ],
  [
    'design',
    [
      // Japanese keywords
      '\u8a2d\u8a08', // 設計
      '\u30a2\u30fc\u30ad\u30c6\u30af\u30c1\u30e3', // アーキテクチャ
      '\u30b9\u30ad\u30fc\u30de', // スキーマ
      '\u30e2\u30c7\u30eb', // モデル
      '\u30a4\u30f3\u30bf\u30fc\u30d5\u30a7\u30fc\u30b9', // インターフェース
      '\u30b3\u30f3\u30dd\u30fc\u30cd\u30f3\u30c8\u8a2d\u8a08', // コンポーネント設計
      '\u30b7\u30b9\u30c6\u30e0\u8a2d\u8a08', // システム設計
      '\u30c7\u30fc\u30bf\u30e2\u30c7\u30eb', // データモデル
      // English keywords
      'design',
      'architecture',
      'schema',
      'model',
      'structure',
      'API',
    ],
  ],
  [
    'designer',
    [
      // Japanese keywords
      '\u30c7\u30b6\u30a4\u30f3', // デザイン
      '\u30ef\u30a4\u30e4\u30fc\u30d5\u30ec\u30fc\u30e0', // ワイヤーフレーム
      '\u30e2\u30c3\u30af\u30a2\u30c3\u30d7', // モックアップ
      '\u753b\u9762', // 画面
      '\u30ec\u30a4\u30a2\u30a6\u30c8', // レイアウト
      '\u30b9\u30bf\u30a4\u30eb', // スタイル
      '\u30ab\u30e9\u30fc', // カラー
      '\u30d6\u30e9\u30f3\u30c9', // ブランド
      // English keywords
      'UI',
      'UX',
      'wireframe',
      'mockup',
      'prototype',
      'style',
      'visual',
    ],
  ],
  [
    'developer',
    [
      // Japanese keywords
      '\u5b9f\u88c5', // 実装
      '\u958b\u767a', // 開発
      '\u30b3\u30fc\u30c9', // コード
      '\u30d7\u30ed\u30b0\u30e9\u30e0', // プログラム
      '\u4f5c\u6210', // 作成
      '\u6a5f\u80fd', // 機能
      '\u30e2\u30b8\u30e5\u30fc\u30eb', // モジュール
      '\u30af\u30e9\u30b9', // クラス
      '\u95a2\u6570', // 関数
      '\u30e1\u30bd\u30c3\u30c9', // メソッド
      '\u4fee\u6b63', // 修正
      '\u30d0\u30b0', // バグ
      '\u30ea\u30d5\u30a1\u30af\u30bf', // リファクタ
      // English keywords
      'implement',
      'develop',
      'code',
      'create',
      'build',
      'fix',
      'feature',
    ],
  ],
  [
    'test',
    [
      // Japanese keywords
      '\u30c6\u30b9\u30c8', // テスト
      '\u30c6\u30b9\u30c6\u30a3\u30f3\u30b0', // テスティング
      '\u691c\u8a3c', // 検証
      '\u30ab\u30d0\u30ec\u30c3\u30b8', // カバレッジ
      '\u30e6\u30cb\u30c3\u30c8\u30c6\u30b9\u30c8', // ユニットテスト
      '\u7d50\u5408\u30c6\u30b9\u30c8', // 結合テスト
      '\u30d7\u30ed\u30d1\u30c6\u30a3\u30c6\u30b9\u30c8', // プロパティテスト
      // English keywords
      'test',
      'testing',
      'verify',
      'validate',
      'coverage',
      'QA',
      'E2E',
    ],
  ],
  [
    'reviewer',
    [
      // Japanese keywords
      '\u30ec\u30d3\u30e5\u30fc', // レビュー
      '\u30c1\u30a7\u30c3\u30af', // チェック
      '\u78ba\u8a8d', // 確認
      '\u627f\u8a8d', // 承認
      '\u54c1\u8cea', // 品質
      '\u30b3\u30fc\u30c9\u30ec\u30d3\u30e5\u30fc', // コードレビュー
      '\u30bb\u30ad\u30e5\u30ea\u30c6\u30a3', // セキュリティ
      '\u30d1\u30d5\u30a9\u30fc\u30de\u30f3\u30b9', // パフォーマンス
      '\u30de\u30fc\u30b8', // マージ
      // English keywords
      'review',
      'check',
      'approve',
      'quality',
      'audit',
      'merge',
    ],
  ],
]);

// =============================================================================
// WorkerTypeRegistry Class
// =============================================================================

/**
 * WorkerTypeRegistry - Worker Type Registry
 *
 * Manages worker type configurations and selects appropriate worker types for tasks.
 *
 * @see Requirement 3.1: THE System SHALL support the following worker types
 */
export class WorkerTypeRegistry {
  /**
   * Custom configs for overriding
   */
  private customConfigs: Map<WorkerType, Partial<WorkerTypeConfig>> = new Map();

  /**
   * Get worker type config
   *
   * @param type - Worker type
   * @returns Worker type config
   * @throws {WorkerTypeRegistryError} If invalid worker type
   *
   * @see Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
   */
  getConfig(type: WorkerType): WorkerTypeConfig {
    const baseConfig = WORKER_TYPE_CONFIGS.get(type);
    if (!baseConfig) {
      throw new WorkerTypeRegistryError(`Invalid worker type: ${type}`, 'INVALID_WORKER_TYPE');
    }

    // Merge custom config if exists
    const customConfig = this.customConfigs.get(type);
    if (customConfig) {
      return {
        ...baseConfig,
        ...customConfig,
        aiConfig: {
          ...baseConfig.aiConfig,
          ...(customConfig.aiConfig ?? {}),
        },
      };
    }

    return { ...baseConfig };
  }

  /**
   * Get worker type capabilities
   *
   * @param type - Worker type
   * @returns Capabilities list
   *
   * @see Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
   */
  getCapabilities(type: WorkerType): string[] {
    const config = this.getConfig(type);
    return [...config.capabilities];
  }

  /**
   * Get worker type tools
   *
   * @param type - Worker type
   * @returns Tools list
   */
  getTools(type: WorkerType): string[] {
    const config = this.getConfig(type);
    return [...config.tools];
  }

  /**
   * Get worker type persona
   *
   * @param type - Worker type
   * @returns Persona
   */
  getPersona(type: WorkerType): string {
    const config = this.getConfig(type);
    return config.persona;
  }

  /**
   * Match worker type from task description
   *
   * Analyzes task description and returns the most suitable worker type.
   *
   * @param taskDescription - Task description
   * @returns Matched worker type
   *
   * @see Requirement 3.8: WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements
   */
  matchWorkerType(taskDescription: string): WorkerType {
    const lowerDescription = taskDescription.toLowerCase();
    const scores: Map<WorkerType, number> = new Map();

    // Calculate score for each worker type
    for (const [type, keywords] of WORKER_TYPE_KEYWORDS) {
      let score = 0;
      for (const keyword of keywords) {
        // Check both original and lowercase for Japanese support
        if (taskDescription.includes(keyword) || lowerDescription.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }
      scores.set(type, score);
    }

    // Select worker type with highest score
    let bestType: WorkerType = 'developer'; // Default
    let bestScore = 0;

    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    return bestType;
  }

  /**
   * Get all worker types
   *
   * @returns Worker type list
   *
   * @see Requirement 3.1
   */
  getAllTypes(): WorkerType[] {
    return [...VALID_WORKER_TYPES];
  }

  /**
   * Get all worker type configs
   *
   * @returns Worker type config list
   */
  getAllConfigs(): WorkerTypeConfig[] {
    return this.getAllTypes().map((type) => this.getConfig(type));
  }

  /**
   * Check if worker type is valid
   *
   * @param type - Worker type to check
   * @returns true if valid
   */
  isValidType(type: string): type is WorkerType {
    return VALID_WORKER_TYPES.includes(type as WorkerType);
  }

  /**
   * Set custom config
   *
   * @param type - Worker type
   * @param config - Custom config (partial override)
   */
  setCustomConfig(type: WorkerType, config: Partial<WorkerTypeConfig>): void {
    if (!this.isValidType(type)) {
      throw new WorkerTypeRegistryError(`Invalid worker type: ${type}`, 'INVALID_WORKER_TYPE');
    }
    this.customConfigs.set(type, config);
  }

  /**
   * Clear custom config
   *
   * @param type - Worker type (if omitted, clears all)
   */
  clearCustomConfig(type?: WorkerType): void {
    if (type) {
      this.customConfigs.delete(type);
    } else {
      this.customConfigs.clear();
    }
  }

  /**
   * Check if worker type has specific capability
   *
   * @param type - Worker type
   * @param capability - Capability to check
   * @returns true if has capability
   */
  hasCapability(type: WorkerType, capability: string): boolean {
    const capabilities = this.getCapabilities(type);
    return capabilities.includes(capability);
  }

  /**
   * Find worker types with specific capability
   *
   * @param capability - Capability to search
   * @returns Worker types with the capability
   */
  findTypesByCapability(capability: string): WorkerType[] {
    return this.getAllTypes().filter((type) => this.hasCapability(type, capability));
  }
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * WorkerTypeRegistry Error
 */
export class WorkerTypeRegistryError extends Error {
  /** Error code */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'WorkerTypeRegistryError';
    this.code = code;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create WorkerTypeRegistry
 *
 * @returns WorkerTypeRegistry instance
 */
export function createWorkerTypeRegistry(): WorkerTypeRegistry {
  return new WorkerTypeRegistry();
}

// =============================================================================
// Default Instance Export
// =============================================================================

/**
 * Default WorkerTypeRegistry instance
 */
export const workerTypeRegistry = new WorkerTypeRegistry();

// =============================================================================
// Constants Export
// =============================================================================

/**
 * Worker Type Config Map (read-only)
 */
export const WORKER_CONFIGS = WORKER_TYPE_CONFIGS;

/**
 * Worker Type Keywords Map (read-only)
 */
export const WORKER_KEYWORDS = WORKER_TYPE_KEYWORDS;
