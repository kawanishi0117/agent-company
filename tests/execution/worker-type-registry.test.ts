/**
 * WorkerTypeRegistry ユニットテスト
 *
 * 各ワーカータイプの設定検証とマッチング機能のテスト
 *
 * **Validates: Requirements 3.1-3.8**
 *
 * @module tests/execution/worker-type-registry.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkerTypeRegistry,
  WorkerTypeRegistryError,
  createWorkerTypeRegistry,
  workerTypeRegistry,
  WORKER_CONFIGS,
  WORKER_KEYWORDS,
} from '../../tools/cli/lib/execution/worker-type-registry';
import {
  WorkerType,
  VALID_WORKER_TYPES,
  WORKER_TYPE_CONFIG_REQUIRED_FIELDS,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// ワーカータイプ設定テスト
// =============================================================================

describe('WorkerTypeRegistry - ワーカータイプ設定', () => {
  let registry: WorkerTypeRegistry;

  beforeEach(() => {
    registry = createWorkerTypeRegistry();
  });

  /**
   * @see Requirement 3.1: THE System SHALL support the following worker types
   */
  describe('Requirement 3.1: サポートされるワーカータイプ', () => {
    it('6種類のワーカータイプがサポートされている', () => {
      const types = registry.getAllTypes();
      expect(types).toHaveLength(6);
      expect(types).toContain('research');
      expect(types).toContain('design');
      expect(types).toContain('designer');
      expect(types).toContain('developer');
      expect(types).toContain('test');
      expect(types).toContain('reviewer');
    });

    it('全てのワーカータイプの設定が取得できる', () => {
      const configs = registry.getAllConfigs();
      expect(configs).toHaveLength(6);

      for (const config of configs) {
        expect(VALID_WORKER_TYPES).toContain(config.type);
      }
    });

    it('isValidTypeが正しく動作する', () => {
      expect(registry.isValidType('research')).toBe(true);
      expect(registry.isValidType('design')).toBe(true);
      expect(registry.isValidType('designer')).toBe(true);
      expect(registry.isValidType('developer')).toBe(true);
      expect(registry.isValidType('test')).toBe(true);
      expect(registry.isValidType('reviewer')).toBe(true);
      expect(registry.isValidType('invalid')).toBe(false);
      expect(registry.isValidType('')).toBe(false);
    });
  });

  /**
   * @see Requirement 3.2: THE Research_Worker SHALL have capabilities
   */
  describe('Requirement 3.2: Research Worker能力', () => {
    it('Research Workerが必要な能力を持っている', () => {
      const capabilities = registry.getCapabilities('research');

      expect(capabilities).toContain('web_search');
      expect(capabilities).toContain('document_analysis');
      expect(capabilities).toContain('technology_evaluation');
    });

    it('Research Workerの設定が完全である', () => {
      const config = registry.getConfig('research');

      for (const field of WORKER_TYPE_CONFIG_REQUIRED_FIELDS) {
        expect(config).toHaveProperty(field);
        expect(config[field]).not.toBeUndefined();
      }
    });
  });

  /**
   * @see Requirement 3.3: THE Design_Worker SHALL have capabilities
   */
  describe('Requirement 3.3: Design Worker能力', () => {
    it('Design Workerが必要な能力を持っている', () => {
      const capabilities = registry.getCapabilities('design');

      expect(capabilities).toContain('architecture_design');
      expect(capabilities).toContain('api_design');
      expect(capabilities).toContain('data_model_design');
    });

    it('Design Workerの設定が完全である', () => {
      const config = registry.getConfig('design');

      for (const field of WORKER_TYPE_CONFIG_REQUIRED_FIELDS) {
        expect(config).toHaveProperty(field);
        expect(config[field]).not.toBeUndefined();
      }
    });
  });

  /**
   * @see Requirement 3.4: THE Designer_Worker SHALL have capabilities
   */
  describe('Requirement 3.4: Designer Worker能力', () => {
    it('Designer Workerが必要な能力を持っている', () => {
      const capabilities = registry.getCapabilities('designer');

      expect(capabilities).toContain('ui_design');
      expect(capabilities).toContain('ux_design');
      expect(capabilities).toContain('wireframe_creation');
      expect(capabilities).toContain('style_guide');
    });

    it('Designer Workerの設定が完全である', () => {
      const config = registry.getConfig('designer');

      for (const field of WORKER_TYPE_CONFIG_REQUIRED_FIELDS) {
        expect(config).toHaveProperty(field);
        expect(config[field]).not.toBeUndefined();
      }
    });
  });

  /**
   * @see Requirement 3.5: THE Developer_Worker SHALL have capabilities
   */
  describe('Requirement 3.5: Developer Worker能力', () => {
    it('Developer Workerが必要な能力を持っている', () => {
      const capabilities = registry.getCapabilities('developer');

      expect(capabilities).toContain('code_implementation');
      expect(capabilities).toContain('file_operations');
      expect(capabilities).toContain('command_execution');
    });

    it('Developer Workerの設定が完全である', () => {
      const config = registry.getConfig('developer');

      for (const field of WORKER_TYPE_CONFIG_REQUIRED_FIELDS) {
        expect(config).toHaveProperty(field);
        expect(config[field]).not.toBeUndefined();
      }
    });
  });

  /**
   * @see Requirement 3.6: THE Test_Worker SHALL have capabilities
   */
  describe('Requirement 3.6: Test Worker能力', () => {
    it('Test Workerが必要な能力を持っている', () => {
      const capabilities = registry.getCapabilities('test');

      expect(capabilities).toContain('test_creation');
      expect(capabilities).toContain('test_execution');
      expect(capabilities).toContain('coverage_analysis');
    });

    it('Test Workerの設定が完全である', () => {
      const config = registry.getConfig('test');

      for (const field of WORKER_TYPE_CONFIG_REQUIRED_FIELDS) {
        expect(config).toHaveProperty(field);
        expect(config[field]).not.toBeUndefined();
      }
    });
  });

  /**
   * @see Requirement 3.7: THE Reviewer_Agent SHALL have capabilities
   */
  describe('Requirement 3.7: Reviewer Agent能力', () => {
    it('Reviewer Agentが必要な能力を持っている', () => {
      const capabilities = registry.getCapabilities('reviewer');

      expect(capabilities).toContain('code_review');
      expect(capabilities).toContain('quality_check');
      expect(capabilities).toContain('merge_approval');
    });

    it('Reviewer Agentの設定が完全である', () => {
      const config = registry.getConfig('reviewer');

      for (const field of WORKER_TYPE_CONFIG_REQUIRED_FIELDS) {
        expect(config).toHaveProperty(field);
        expect(config[field]).not.toBeUndefined();
      }
    });
  });
});

// =============================================================================
// ワーカータイプマッチングテスト
// =============================================================================

describe('WorkerTypeRegistry - ワーカータイプマッチング', () => {
  let registry: WorkerTypeRegistry;

  beforeEach(() => {
    registry = createWorkerTypeRegistry();
  });

  /**
   * @see Requirement 3.8: WHEN assigning a Grandchild_Ticket, THE Manager_Agent SHALL select worker type based on task requirements
   */
  describe('Requirement 3.8: タスクベースのワーカータイプ選択', () => {
    it('調査タスクでresearchワーカーが選択される', () => {
      expect(registry.matchWorkerType('市場調査を行う')).toBe('research');
      expect(registry.matchWorkerType('技術トレンドを分析する')).toBe('research');
      expect(registry.matchWorkerType('競合他社を調査する')).toBe('research');
    });

    it('設計タスクでdesignワーカーが選択される', () => {
      expect(registry.matchWorkerType('システムアーキテクチャを設計する')).toBe('design');
      expect(registry.matchWorkerType('APIスキーマを設計する')).toBe('design');
      expect(registry.matchWorkerType('データモデルを設計する')).toBe('design');
    });

    it('UIタスクでdesignerワーカーが選択される', () => {
      expect(registry.matchWorkerType('UIデザインを作成する')).toBe('designer');
      expect(registry.matchWorkerType('ワイヤーフレームを作成する')).toBe('designer');
      expect(registry.matchWorkerType('画面レイアウトを設計する')).toBe('designer');
    });

    it('実装タスクでdeveloperワーカーが選択される', () => {
      expect(registry.matchWorkerType('機能を実装する')).toBe('developer');
      expect(registry.matchWorkerType('コードを作成する')).toBe('developer');
      expect(registry.matchWorkerType('バグを修正する')).toBe('developer');
    });

    it('テストタスクでtestワーカーが選択される', () => {
      expect(registry.matchWorkerType('ユニットテストを作成する')).toBe('test');
      expect(registry.matchWorkerType('テストカバレッジを分析する')).toBe('test');
      expect(registry.matchWorkerType('E2Eテストを実行する')).toBe('test');
    });

    it('レビュータスクでreviewerワーカーが選択される', () => {
      expect(registry.matchWorkerType('コードレビューを行う')).toBe('reviewer');
      expect(registry.matchWorkerType('品質チェックを実施する')).toBe('reviewer');
      expect(registry.matchWorkerType('マージを承認する')).toBe('reviewer');
    });

    it('不明なタスクでdeveloperがデフォルトで選択される', () => {
      expect(registry.matchWorkerType('何かをする')).toBe('developer');
      expect(registry.matchWorkerType('')).toBe('developer');
    });

    it('英語のタスク説明でも正しく選択される', () => {
      expect(registry.matchWorkerType('Research market trends')).toBe('research');
      expect(registry.matchWorkerType('Design the API')).toBe('design');
      expect(registry.matchWorkerType('Create wireframe')).toBe('designer');
      expect(registry.matchWorkerType('Implement the feature')).toBe('developer');
      expect(registry.matchWorkerType('Write unit tests')).toBe('test');
      expect(registry.matchWorkerType('Code review and approve')).toBe('reviewer');
    });
  });
});

// =============================================================================
// ユーティリティメソッドテスト
// =============================================================================

describe('WorkerTypeRegistry - ユーティリティメソッド', () => {
  let registry: WorkerTypeRegistry;

  beforeEach(() => {
    registry = createWorkerTypeRegistry();
  });

  describe('getTools', () => {
    it('各ワーカータイプのツール一覧が取得できる', () => {
      for (const type of VALID_WORKER_TYPES) {
        const tools = registry.getTools(type);
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getPersona', () => {
    it('各ワーカータイプのペルソナが取得できる', () => {
      for (const type of VALID_WORKER_TYPES) {
        const persona = registry.getPersona(type);
        expect(typeof persona).toBe('string');
        expect(persona.length).toBeGreaterThan(0);
      }
    });
  });

  describe('hasCapability', () => {
    it('能力の有無を正しく判定する', () => {
      expect(registry.hasCapability('developer', 'code_implementation')).toBe(true);
      expect(registry.hasCapability('developer', 'web_search')).toBe(false);
      expect(registry.hasCapability('research', 'web_search')).toBe(true);
    });
  });

  describe('findTypesByCapability', () => {
    it('特定の能力を持つワーカータイプを検索できる', () => {
      const types = registry.findTypesByCapability('code_implementation');
      expect(types).toContain('developer');
      expect(types).not.toContain('research');
    });
  });
});

// =============================================================================
// カスタム設定テスト
// =============================================================================

describe('WorkerTypeRegistry - カスタム設定', () => {
  let registry: WorkerTypeRegistry;

  beforeEach(() => {
    registry = createWorkerTypeRegistry();
  });

  describe('setCustomConfig', () => {
    it('カスタム設定でペルソナをオーバーライドできる', () => {
      const customPersona = 'カスタムペルソナ';
      registry.setCustomConfig('developer', { persona: customPersona });

      const config = registry.getConfig('developer');
      expect(config.persona).toBe(customPersona);
    });

    it('カスタム設定でAI設定をオーバーライドできる', () => {
      registry.setCustomConfig('developer', {
        aiConfig: {
          adapter: 'custom',
          model: 'custom-model',
          temperature: 0.9,
        },
      });

      const config = registry.getConfig('developer');
      expect(config.aiConfig.adapter).toBe('custom');
      expect(config.aiConfig.model).toBe('custom-model');
      expect(config.aiConfig.temperature).toBe(0.9);
    });

    it('無効なワーカータイプでエラーが発生する', () => {
      expect(() => {
        registry.setCustomConfig('invalid' as WorkerType, {});
      }).toThrow(WorkerTypeRegistryError);
    });
  });

  describe('clearCustomConfig', () => {
    it('特定のワーカータイプのカスタム設定をクリアできる', () => {
      const customPersona = 'カスタムペルソナ';
      registry.setCustomConfig('developer', { persona: customPersona });

      registry.clearCustomConfig('developer');

      const config = registry.getConfig('developer');
      expect(config.persona).not.toBe(customPersona);
    });

    it('全てのカスタム設定をクリアできる', () => {
      registry.setCustomConfig('developer', { persona: 'カスタム1' });
      registry.setCustomConfig('test', { persona: 'カスタム2' });

      registry.clearCustomConfig();

      const devConfig = registry.getConfig('developer');
      const testConfig = registry.getConfig('test');
      expect(devConfig.persona).not.toBe('カスタム1');
      expect(testConfig.persona).not.toBe('カスタム2');
    });
  });
});

// =============================================================================
// エラーハンドリングテスト
// =============================================================================

describe('WorkerTypeRegistry - エラーハンドリング', () => {
  let registry: WorkerTypeRegistry;

  beforeEach(() => {
    registry = createWorkerTypeRegistry();
  });

  it('無効なワーカータイプでgetConfigがエラーを投げる', () => {
    expect(() => {
      registry.getConfig('invalid' as WorkerType);
    }).toThrow(WorkerTypeRegistryError);
  });

  it('エラーコードが正しく設定される', () => {
    try {
      registry.getConfig('invalid' as WorkerType);
      expect.fail('エラーが投げられるべき');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkerTypeRegistryError);
      expect((error as WorkerTypeRegistryError).code).toBe('INVALID_WORKER_TYPE');
    }
  });
});

// =============================================================================
// エクスポートテスト
// =============================================================================

describe('WorkerTypeRegistry - エクスポート', () => {
  it('デフォルトインスタンスがエクスポートされている', () => {
    expect(workerTypeRegistry).toBeInstanceOf(WorkerTypeRegistry);
  });

  it('ファクトリ関数が正しく動作する', () => {
    const registry = createWorkerTypeRegistry();
    expect(registry).toBeInstanceOf(WorkerTypeRegistry);
  });

  it('WORKER_CONFIGSがエクスポートされている', () => {
    expect(WORKER_CONFIGS).toBeInstanceOf(Map);
    expect(WORKER_CONFIGS.size).toBe(6);
  });

  it('WORKER_KEYWORDSがエクスポートされている', () => {
    expect(WORKER_KEYWORDS).toBeInstanceOf(Map);
    expect(WORKER_KEYWORDS.size).toBe(6);
  });
});
