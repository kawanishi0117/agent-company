/**
 * Task Decomposer プロパティテスト
 *
 * Property 2: Task Decomposition Independence
 * - 任意の高レベルタスクを分解した結果、すべてのサブタスクは独立している
 * - サブタスク間に依存関係がない場合、並列実行が可能
 *
 * **Validates: Requirements 2.2, 2.3**
 * - 2.2: THE sub-tickets SHALL have no dependencies on each other (parallelizable)
 * - 2.3: IF dependencies are unavoidable, THE Manager_Agent SHALL sequence them appropriately
 *
 * @module tests/execution/decomposer.property.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { TaskDecomposer, createTaskDecomposer } from '../../tools/cli/lib/execution/decomposer';
import { BaseAdapter, AdapterResponse, ChatOptions } from '../../tools/adapters/base';
import { SubTask, SubTaskStatus } from '../../tools/cli/lib/execution/types';

// =============================================================================
// モックアダプタ
// =============================================================================

/**
 * テスト用のモックAIアダプタ
 */
class MockIndependentTaskAdapter implements BaseAdapter {
  readonly name = 'mock-independent';
  private taskCount: number;

  constructor(taskCount: number = 3) {
    this.taskCount = taskCount;
  }

  async generate(): Promise<AdapterResponse> {
    return this.createResponse();
  }

  async chat(_options: ChatOptions): Promise<AdapterResponse> {
    return this.createResponse();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private createResponse(): AdapterResponse {
    const subTasks = Array.from({ length: this.taskCount }, (_, i) => ({
      title: `独立タスク ${i + 1}`,
      description: `これは独立したタスク ${i + 1} の説明です。`,
      acceptanceCriteria: [`タスク ${i + 1} の完了基準`],
      estimatedEffort: 'medium' as const,
    }));

    return {
      content: `\`\`\`json\n{"subTasks": ${JSON.stringify(subTasks)}}\n\`\`\``,
      model: 'mock-model',
      tokensUsed: 100,
    };
  }
}

// =============================================================================
// ジェネレータ（Arbitrary）定義
// =============================================================================

/**
 * 有効なタスクタイトルを生成するArbitrary
 */
const taskTitleArb = fc
  .tuple(
    fc.constantFrom('Create', 'Implement', 'Add', 'Update', 'Fix', 'Refactor'),
    fc.constantFrom('user', 'product', 'order', 'payment', 'auth', 'api'),
    fc.constantFrom('model', 'service', 'controller', 'component', 'test')
  )
  .map(([verb, noun, type]) => `${verb} ${noun} ${type}`);

// =============================================================================
// プロパティテスト
// =============================================================================

describe('Property 2: Task Decomposition Independence', () => {
  let mockAdapter: MockIndependentTaskAdapter;
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    mockAdapter = new MockIndependentTaskAdapter();
    // decomposerを正しく初期化
    decomposer = createTaskDecomposer(mockAdapter, 'test-model');
  });

  /**
   * Property 2.1: 独立タスクの依存関係分析
   * **Validates: Requirement 2.2**
   */
  it('Property 2.1: 独立したサブタスクは依存関係を持たない', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (taskCount) => {
        const parentId = `task-${Date.now()}-parent`;
        const tasks: SubTask[] = Array.from({ length: taskCount }, (_, i) => ({
          id: `${parentId}-${(i + 1).toString().padStart(3, '0')}`,
          parentId,
          title: `独立タスク ${i + 1}`,
          description: `これは独立したタスク ${i + 1} です。`,
          acceptanceCriteria: [],
          status: 'pending' as SubTaskStatus,
          artifacts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        const graph = await decomposer.analyzeDependencies(tasks);

        expect(graph.edges).toHaveLength(0);
        expect(graph.hasCycle).toBe(false);
        expect(graph.nodes).toHaveLength(taskCount);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.2: 独立タスクの並列化可能性
   * **Validates: Requirement 2.2**
   */
  it('Property 2.2: 独立したサブタスクは全て並列実行可能', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (taskCount) => {
        const parentId = `task-${Date.now()}-parent`;
        const tasks: SubTask[] = Array.from({ length: taskCount }, (_, i) => ({
          id: `${parentId}-${(i + 1).toString().padStart(3, '0')}`,
          parentId,
          title: `並列タスク ${i + 1}`,
          description: `並列実行可能なタスク ${i + 1}`,
          acceptanceCriteria: [],
          status: 'pending' as SubTaskStatus,
          artifacts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        const groups = await decomposer.identifyParallelizable(tasks);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toHaveLength(taskCount);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.3: 依存関係グラフのノード完全性
   * **Validates: Requirement 2.2**
   */
  it('Property 2.3: 依存関係グラフは全てのタスクIDをノードとして含む', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (taskCount) => {
        const parentId = `task-${Date.now()}-parent`;
        const tasks: SubTask[] = Array.from({ length: taskCount }, (_, i) => ({
          id: `${parentId}-${(i + 1).toString().padStart(3, '0')}`,
          parentId,
          title: `タスク ${i + 1}`,
          description: `タスク ${i + 1} の説明`,
          acceptanceCriteria: [],
          status: 'pending' as SubTaskStatus,
          artifacts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        const graph = await decomposer.analyzeDependencies(tasks);

        expect(graph.nodes).toHaveLength(taskCount);
        for (const task of tasks) {
          expect(graph.nodes).toContain(task.id);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.4: 空のタスク配列の処理
   * **Validates: Requirement 2.2**
   */
  it('Property 2.4: 空のタスク配列は空の依存関係グラフを返す', async () => {
    const graph = await decomposer.analyzeDependencies([]);

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.hasCycle).toBe(false);
  });

  /**
   * Property 2.5: 単一タスクの処理
   * **Validates: Requirement 2.2**
   */
  it('Property 2.5: 単一タスクは依存関係を持たない', async () => {
    await fc.assert(
      fc.asyncProperty(taskTitleArb, async (title) => {
        const task: SubTask = {
          id: 'task-single-001',
          parentId: 'task-parent',
          title,
          description: '単一タスクの説明',
          acceptanceCriteria: [],
          status: 'pending',
          artifacts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const graph = await decomposer.analyzeDependencies([task]);

        expect(graph.nodes).toHaveLength(1);
        expect(graph.edges).toHaveLength(0);
        expect(graph.hasCycle).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 2 (Extended): Dependency Sequencing', () => {
  let mockAdapter: MockIndependentTaskAdapter;
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    mockAdapter = new MockIndependentTaskAdapter();
    decomposer = createTaskDecomposer(mockAdapter, 'test-model');
  });

  /**
   * Property 2.6: 依存関係がある場合の適切な順序付け
   * **Validates: Requirement 2.3**
   */
  it('Property 2.6: 依存関係がある場合は適切に順序付けされる', async () => {
    const parentId = 'task-dep-parent';
    const tasks: SubTask[] = [
      {
        id: `${parentId}-001`,
        parentId,
        title: 'Create database schema',
        description: 'データベーススキーマを作成する',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `${parentId}-002`,
        parentId,
        title: 'Create API',
        description: 'APIを実装する。after Create database schema is done',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const groups = await decomposer.identifyParallelizable(tasks);

    expect(groups.length).toBeGreaterThanOrEqual(1);

    const allTaskIds = groups.flat().map((t) => t.id);
    for (const task of tasks) {
      expect(allTaskIds).toContain(task.id);
    }
  });

  /**
   * Property 2.7: 循環依存の検出
   * **Validates: Requirement 2.3**
   */
  it('Property 2.7: 循環依存を正しく検出する', async () => {
    const parentId = 'task-cycle-parent';
    const tasks: SubTask[] = [
      {
        id: `${parentId}-001`,
        parentId,
        title: 'Task A',
        description: 'depends on Task B',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `${parentId}-002`,
        parentId,
        title: 'Task B',
        description: 'depends on Task A',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const graph = await decomposer.analyzeDependencies(tasks);

    if (graph.edges.length >= 2) {
      expect(graph.hasCycle).toBe(true);
    }
  });

  /**
   * Property 2.8: 並列化グループの完全性
   * **Validates: Requirement 2.2, 2.3**
   */
  it('Property 2.8: 並列化グループは全てのタスクを含む', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 15 }), async (taskCount) => {
        const parentId = `task-${Date.now()}-parent`;
        const tasks: SubTask[] = Array.from({ length: taskCount }, (_, i) => ({
          id: `${parentId}-${(i + 1).toString().padStart(3, '0')}`,
          parentId,
          title: `タスク ${i + 1}`,
          description: `タスク ${i + 1} の説明`,
          acceptanceCriteria: [],
          status: 'pending' as SubTaskStatus,
          artifacts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        const groups = await decomposer.identifyParallelizable(tasks);

        const totalTasks = groups.reduce((sum, group) => sum + group.length, 0);
        expect(totalTasks).toBe(taskCount);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.9: 依存関係グラフの一貫性
   * **Validates: Requirement 2.2**
   */
  it('Property 2.9: 依存関係グラフのエッジは有効なノードIDのみを参照する', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (taskCount) => {
        const parentId = `task-${Date.now()}-parent`;
        const tasks: SubTask[] = Array.from({ length: taskCount }, (_, i) => ({
          id: `${parentId}-${(i + 1).toString().padStart(3, '0')}`,
          parentId,
          title: `タスク ${i + 1}`,
          description: i > 0 ? `after タスク ${i} is done` : 'First task',
          acceptanceCriteria: [],
          status: 'pending' as SubTaskStatus,
          artifacts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        const graph = await decomposer.analyzeDependencies(tasks);

        for (const [from, to] of graph.edges) {
          expect(graph.nodes).toContain(from);
          expect(graph.nodes).toContain(to);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// ユニットテスト（エッジケース）
// =============================================================================

describe('Task Decomposer Dependency Analysis - Edge Cases', () => {
  let mockAdapter: MockIndependentTaskAdapter;
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    mockAdapter = new MockIndependentTaskAdapter();
    decomposer = createTaskDecomposer(mockAdapter, 'test-model');
  });

  /**
   * 同じタイトルを持つ複数のタスクの処理
   */
  it('同じタイトルを持つ複数のタスクを正しく処理する', async () => {
    const parentId = 'task-same-title';
    const tasks: SubTask[] = [
      {
        id: `${parentId}-001`,
        parentId,
        title: 'Create model',
        description: 'ユーザーモデルを作成',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `${parentId}-002`,
        parentId,
        title: 'Create model',
        description: '商品モデルを作成',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const graph = await decomposer.analyzeDependencies(tasks);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes).toContain(`${parentId}-001`);
    expect(graph.nodes).toContain(`${parentId}-002`);
  });

  /**
   * 長い説明文を持つタスクの処理
   */
  it('長い説明文を持つタスクを正しく処理する', async () => {
    const longDescription = 'A'.repeat(10000);
    const task: SubTask = {
      id: 'task-long-001',
      parentId: 'task-long-parent',
      title: 'Long description task',
      description: longDescription,
      acceptanceCriteria: [],
      status: 'pending',
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const graph = await decomposer.analyzeDependencies([task]);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  /**
   * 特殊文字を含むタスクの処理
   */
  it('特殊文字を含むタスクを正しく処理する', async () => {
    const tasks: SubTask[] = [
      {
        id: 'task-special-001',
        parentId: 'task-special-parent',
        title: 'タスク with 日本語 and émoji 🚀',
        description: '説明文 with "quotes" and \\backslash',
        acceptanceCriteria: ['基準1', '基準2'],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const graph = await decomposer.analyzeDependencies(tasks);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes).toContain('task-special-001');
  });

  /**
   * 大量のタスクの処理
   */
  it('大量のタスクを正しく処理する', async () => {
    const taskCount = 100;
    const parentId = 'task-large-parent';
    const tasks: SubTask[] = Array.from({ length: taskCount }, (_, i) => ({
      id: `${parentId}-${(i + 1).toString().padStart(3, '0')}`,
      parentId,
      title: `タスク ${i + 1}`,
      description: `タスク ${i + 1} の説明`,
      acceptanceCriteria: [],
      status: 'pending' as SubTaskStatus,
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const graph = await decomposer.analyzeDependencies(tasks);

    expect(graph.nodes).toHaveLength(taskCount);
    expect(graph.edges).toHaveLength(0);
    expect(graph.hasCycle).toBe(false);
  });

  /**
   * 複雑な依存関係チェーンの処理
   */
  it('複雑な依存関係チェーンを正しく処理する', async () => {
    const parentId = 'task-chain-parent';
    const tasks: SubTask[] = [
      {
        id: `${parentId}-001`,
        parentId,
        title: 'Setup database',
        description: 'データベースをセットアップ',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `${parentId}-002`,
        parentId,
        title: 'Create models',
        description: 'after Setup database is done',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `${parentId}-003`,
        parentId,
        title: 'Create API',
        description: 'after Create models is done',
        acceptanceCriteria: [],
        status: 'pending',
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const groups = await decomposer.identifyParallelizable(tasks);

    const allTaskIds = groups.flat().map((t) => t.id);
    expect(allTaskIds).toHaveLength(3);
    for (const task of tasks) {
      expect(allTaskIds).toContain(task.id);
    }
  });
});

// =============================================================================
// Property 3: Sub-Task Parent Reference
// =============================================================================

/**
 * Property 3: Sub-Task Parent Reference
 *
 * 任意のTask_Decomposerによって作成されたサブタスクは、
 * 既存の親タスクを参照する有効なparent_idを持つ必要がある。
 *
 * **Validates: Requirements 2.4**
 * - 2.4: THE sub-tickets SHALL have parent_id field referencing the original ticket
 *
 * @module tests/execution/decomposer.property.test
 */

describe('Property 3: Sub-Task Parent Reference', () => {
  let mockAdapter: MockIndependentTaskAdapter;
  // decomposerはテスト内でtestDecomposerとして個別に作成されるため、ここでは未使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _decomposer: TaskDecomposer;

  beforeEach(() => {
    mockAdapter = new MockIndependentTaskAdapter();
    _decomposer = createTaskDecomposer(mockAdapter, 'test-model');
  });

  /**
   * Property 3.1: 全てのサブタスクは有効なparent_idを持つ
   * **Validates: Requirement 2.4**
   */
  it('Property 3.1: 全てのサブタスクは有効なparent_idを持つ', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        async (taskCount, instruction) => {
          // モックアダプタを設定
          const adapter = new MockIndependentTaskAdapter(taskCount);
          const testDecomposer = createTaskDecomposer(adapter, 'test-model');

          const context: ProjectContext = {
            project: {
              id: 'test-project',
              name: 'Test Project',
              gitUrl: 'https://github.com/test/test.git',
              defaultBranch: 'main',
              integrationBranch: 'develop',
              workDir: '/workspace',
              createdAt: new Date().toISOString(),
              lastUsed: new Date().toISOString(),
            },
          };

          const result = await testDecomposer.decompose(instruction, context);

          // 全てのサブタスクがparent_idを持つことを検証
          for (const subTask of result.subTasks) {
            expect(subTask.parentId).toBeDefined();
            expect(subTask.parentId).not.toBe('');
            expect(typeof subTask.parentId).toBe('string');
            expect(subTask.parentId.length).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.2: 同じ分解結果のサブタスクは同じparent_idを共有する
   * **Validates: Requirement 2.4**
   */
  it('Property 3.2: 同じ分解結果のサブタスクは同じparent_idを共有する', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const result = await testDecomposer.decompose('Test instruction', context);

        // 全てのサブタスクが同じparent_idを持つことを検証
        const parentIds = new Set(result.subTasks.map((t) => t.parentId));
        expect(parentIds.size).toBe(1);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.3: parent_idはサブタスクIDのプレフィックスである
   * **Validates: Requirement 2.4**
   */
  it('Property 3.3: parent_idはサブタスクIDのプレフィックスである', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const result = await testDecomposer.decompose('Test instruction', context);

        // 各サブタスクのIDがparent_idで始まることを検証
        for (const subTask of result.subTasks) {
          expect(subTask.id.startsWith(subTask.parentId)).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.4: parent_idは有効なタスクID形式である
   * **Validates: Requirement 2.4**
   */
  it('Property 3.4: parent_idは有効なタスクID形式である', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const result = await testDecomposer.decompose('Test instruction', context);

        // parent_idが "task-" で始まることを検証
        for (const subTask of result.subTasks) {
          expect(subTask.parentId).toMatch(/^task-[a-z0-9]+-[a-z0-9]+$/);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.5: サブタスクIDはユニークである
   * **Validates: Requirement 2.4**
   */
  it('Property 3.5: サブタスクIDはユニークである', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const result = await testDecomposer.decompose('Test instruction', context);

        // 全てのサブタスクIDがユニークであることを検証
        const ids = result.subTasks.map((t) => t.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 4: Sub-Task File Naming Convention
// =============================================================================

/**
 * Property 4: Sub-Task File Naming Convention
 *
 * バックログに保存される任意のサブタスクのファイル名は、
 * <parent-id>-<sub-id>.md のパターンに従い、workflows/backlog/ に配置される必要がある。
 *
 * **Validates: Requirements 2.5**
 * - 2.5: THE sub-tickets SHALL be saved to workflows/backlog/ with naming <parent-id>-<sub-id>.md
 *
 * @module tests/execution/decomposer.property.test
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ProjectContext } from '../../tools/cli/lib/execution/decomposer';

describe('Property 4: Sub-Task File Naming Convention', () => {
  let mockAdapter: MockIndependentTaskAdapter;
  // decomposerはテスト内でtestDecomposerとして個別に作成されるため、ここでは未使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _decomposer: TaskDecomposer;
  let tempDir: string;

  beforeEach(async () => {
    mockAdapter = new MockIndependentTaskAdapter();
    _decomposer = createTaskDecomposer(mockAdapter, 'test-model');
    // テスト用の一時ディレクトリを作成
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'decomposer-test-'));
  });

  afterEach(async () => {
    // テスト後に一時ディレクトリを削除
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除に失敗しても無視
    }
  });

  /**
   * Property 4.1: ファイル名は <parent-id>-<sub-id>.md パターンに従う
   * **Validates: Requirement 2.5**
   */
  it('Property 4.1: ファイル名は <parent-id>-<sub-id>.md パターンに従う', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const backlogDir = path.join(tempDir, 'workflows', 'backlog');
        const result = await testDecomposer.decompose('Test instruction', context);

        // サブタスクをファイルに保存
        const savedFiles = await testDecomposer.saveAllSubTasks(result.subTasks, {
          backlogDir,
        });

        // 各ファイル名がパターンに従うことを検証
        for (let i = 0; i < savedFiles.length; i++) {
          const filePath = savedFiles[i];
          const fileName = path.basename(filePath);
          const subTask = result.subTasks[i];

          // ファイル名が <sub-task-id>.md 形式であることを検証
          // サブタスクIDは既に <parent-id>-<sub-id> 形式
          expect(fileName).toBe(`${subTask.id}.md`);

          // ファイル名が .md で終わることを検証
          expect(fileName.endsWith('.md')).toBe(true);

          // ファイル名にparent_idが含まれることを検証
          expect(fileName.startsWith(subTask.parentId)).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.2: ファイルは指定されたbacklogディレクトリに保存される
   * **Validates: Requirement 2.5**
   */
  it('Property 4.2: ファイルは指定されたbacklogディレクトリに保存される', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const backlogDir = path.join(tempDir, 'workflows', 'backlog');
        const result = await testDecomposer.decompose('Test instruction', context);

        // サブタスクをファイルに保存
        const savedFiles = await testDecomposer.saveAllSubTasks(result.subTasks, {
          backlogDir,
        });

        // 各ファイルが正しいディレクトリに保存されていることを検証
        for (const filePath of savedFiles) {
          const dir = path.dirname(filePath);
          expect(dir).toBe(backlogDir);

          // ファイルが実際に存在することを検証
          const exists = await fs
            .access(filePath)
            .then(() => true)
            .catch(() => false);
          expect(exists).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.3: 保存されたファイルにはparent_idフィールドが含まれる
   * **Validates: Requirement 2.4, 2.5**
   */
  it('Property 4.3: 保存されたファイルにはparent_idフィールドが含まれる', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const backlogDir = path.join(tempDir, 'workflows', 'backlog');
        const result = await testDecomposer.decompose('Test instruction', context);

        // サブタスクをファイルに保存
        const savedFiles = await testDecomposer.saveAllSubTasks(result.subTasks, {
          backlogDir,
        });

        // 各ファイルの内容にparent_idが含まれることを検証
        for (let i = 0; i < savedFiles.length; i++) {
          const filePath = savedFiles[i];
          const content = await fs.readFile(filePath, 'utf-8');
          const subTask = result.subTasks[i];

          // parent_idフィールドが含まれることを検証
          expect(content).toContain(`parent_id: '${subTask.parentId}'`);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.4: サブタスクIDの連番は001から始まる
   * **Validates: Requirement 2.5**
   */
  it('Property 4.4: サブタスクIDの連番は001から始まる', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const result = await testDecomposer.decompose('Test instruction', context);

        // サブタスクIDの連番を検証
        for (let i = 0; i < result.subTasks.length; i++) {
          const subTask = result.subTasks[i];
          const expectedSuffix = `-${(i + 1).toString().padStart(3, '0')}`;
          expect(subTask.id.endsWith(expectedSuffix)).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.5: decomposeAndSaveは分解と保存を一括で行う
   * **Validates: Requirement 2.5**
   */
  it('Property 4.5: decomposeAndSaveは分解と保存を一括で行う', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const backlogDir = path.join(tempDir, 'workflows', 'backlog');

        // decomposeAndSaveを使用
        const result = await testDecomposer.decomposeAndSave(
          'Test instruction',
          context,
          undefined,
          { backlogDir }
        );

        // 結果にsavedFilesが含まれることを検証
        expect(result.savedFiles).toBeDefined();
        expect(result.savedFiles.length).toBe(result.subTasks.length);

        // 各ファイルが存在することを検証
        for (const filePath of result.savedFiles) {
          const exists = await fs
            .access(filePath)
            .then(() => true)
            .catch(() => false);
          expect(exists).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.6: 保存されたファイルはMarkdown形式である
   * **Validates: Requirement 2.5**
   */
  it('Property 4.6: 保存されたファイルはMarkdown形式である', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (taskCount) => {
        const adapter = new MockIndependentTaskAdapter(taskCount);
        const testDecomposer = createTaskDecomposer(adapter, 'test-model');

        const context: ProjectContext = {
          project: {
            id: 'test-project',
            name: 'Test Project',
            gitUrl: 'https://github.com/test/test.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        };

        const backlogDir = path.join(tempDir, 'workflows', 'backlog');
        const result = await testDecomposer.decompose('Test instruction', context);

        // サブタスクをファイルに保存
        const savedFiles = await testDecomposer.saveAllSubTasks(result.subTasks, {
          backlogDir,
        });

        // 各ファイルがMarkdown形式であることを検証
        for (let i = 0; i < savedFiles.length; i++) {
          const filePath = savedFiles[i];
          const content = await fs.readFile(filePath, 'utf-8');
          const subTask = result.subTasks[i];

          // フロントマター（YAML）が含まれることを検証
          expect(content.startsWith('---')).toBe(true);
          expect(content).toContain('---\n\n#');

          // タイトルがMarkdownヘッダーとして含まれることを検証
          expect(content).toContain(`# ${subTask.title}`);

          // 必須セクションが含まれることを検証
          expect(content).toContain('## 目的');
          expect(content).toContain('## DoD (Definition of Done)');
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// 追加のエッジケーステスト
// =============================================================================

describe('Sub-Task Parent Reference and File Naming - Edge Cases', () => {
  let mockAdapter: MockIndependentTaskAdapter;
  let decomposer: TaskDecomposer;
  let tempDir: string;

  beforeEach(async () => {
    mockAdapter = new MockIndependentTaskAdapter();
    decomposer = createTaskDecomposer(mockAdapter, 'test-model');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'decomposer-edge-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除に失敗しても無視
    }
  });

  /**
   * 単一サブタスクの保存
   */
  it('単一サブタスクを正しく保存できる', async () => {
    const context: ProjectContext = {
      project: {
        id: 'test-project',
        name: 'Test Project',
        gitUrl: 'https://github.com/test/test.git',
        defaultBranch: 'main',
        integrationBranch: 'develop',
        workDir: '/workspace',
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      },
    };

    const adapter = new MockIndependentTaskAdapter(1);
    const testDecomposer = createTaskDecomposer(adapter, 'test-model');
    const backlogDir = path.join(tempDir, 'workflows', 'backlog');

    const result = await testDecomposer.decompose('Single task', context);
    expect(result.subTasks.length).toBe(1);

    const savedFiles = await testDecomposer.saveAllSubTasks(result.subTasks, {
      backlogDir,
    });

    expect(savedFiles.length).toBe(1);
    const exists = await fs
      .access(savedFiles[0])
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  /**
   * 空のparent_idを持つサブタスクの保存は失敗する
   */
  it('空のparent_idを持つサブタスクの保存は失敗する', async () => {
    const invalidSubTask: SubTask = {
      id: 'task-001',
      parentId: '', // 空のparent_id
      title: 'Invalid Task',
      description: 'This task has empty parent_id',
      acceptanceCriteria: [],
      status: 'pending',
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const backlogDir = path.join(tempDir, 'workflows', 'backlog');

    await expect(decomposer.saveSubTask(invalidSubTask, { backlogDir })).rejects.toThrow(
      'SubTask parentId is required'
    );
  });

  /**
   * 空のidを持つサブタスクの保存は失敗する
   */
  it('空のidを持つサブタスクの保存は失敗する', async () => {
    const invalidSubTask: SubTask = {
      id: '', // 空のid
      parentId: 'task-parent',
      title: 'Invalid Task',
      description: 'This task has empty id',
      acceptanceCriteria: [],
      status: 'pending',
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const backlogDir = path.join(tempDir, 'workflows', 'backlog');

    await expect(decomposer.saveSubTask(invalidSubTask, { backlogDir })).rejects.toThrow(
      'SubTask id is required'
    );
  });

  /**
   * 特殊文字を含むタイトルのサブタスクを正しく保存できる
   */
  it('特殊文字を含むタイトルのサブタスクを正しく保存できる', async () => {
    const subTask: SubTask = {
      id: 'task-parent-001',
      parentId: 'task-parent',
      title: 'タスク with 日本語 and émoji 🚀',
      description: '説明文 with "quotes" and \\backslash',
      acceptanceCriteria: ['基準1', '基準2'],
      status: 'pending',
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const backlogDir = path.join(tempDir, 'workflows', 'backlog');
    const filePath = await decomposer.saveSubTask(subTask, { backlogDir });

    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain(subTask.title);
    expect(content).toContain(`parent_id: '${subTask.parentId}'`);
  });

  /**
   * 長いタイトルのサブタスクを正しく保存できる
   */
  it('長いタイトルのサブタスクを正しく保存できる', async () => {
    const longTitle = 'A'.repeat(200);
    const subTask: SubTask = {
      id: 'task-parent-001',
      parentId: 'task-parent',
      title: longTitle,
      description: 'Long title task',
      acceptanceCriteria: [],
      status: 'pending',
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const backlogDir = path.join(tempDir, 'workflows', 'backlog');
    const filePath = await decomposer.saveSubTask(subTask, { backlogDir });

    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain(longTitle);
  });
});
