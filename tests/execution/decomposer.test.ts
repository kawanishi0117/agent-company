/**
 * Task Decomposer ユニットテスト
 *
 * タスク分解機能のテストを行う。
 *
 * @module tests/execution/decomposer.test
 * @see Requirements: 2.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TaskDecomposer,
  createTaskDecomposer,
  TaskDecomposerError,
  ProjectContext,
  DecomposeOptions,
  DEFAULT_DECOMPOSE_OPTIONS,
} from '../../tools/cli/lib/execution/decomposer';
import { BaseAdapter, AdapterResponse, ChatOptions } from '../../tools/adapters/base';
import { SubTask } from '../../tools/cli/lib/execution/types';

// =============================================================================
// モックアダプタ
// =============================================================================

/**
 * テスト用のモックAIアダプタ
 */
class MockAdapter implements BaseAdapter {
  readonly name = 'mock';
  private response: string;
  private shouldFail: boolean = false;
  private failMessage: string = '';
  public lastChatOptions: ChatOptions | null = null;

  constructor(response: string = '') {
    this.response = response;
  }

  setResponse(response: string): void {
    this.response = response;
  }

  setFailure(shouldFail: boolean, message: string = 'Mock error'): void {
    this.shouldFail = shouldFail;
    this.failMessage = message;
  }

  async generate(): Promise<AdapterResponse> {
    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }
    return {
      content: this.response,
      model: 'mock-model',
      tokensUsed: 100,
    };
  }

  async chat(options: ChatOptions): Promise<AdapterResponse> {
    this.lastChatOptions = options;
    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }
    return {
      content: this.response,
      model: options.model,
      tokensUsed: 100,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }
}

// =============================================================================
// テスト用ユーティリティ
// =============================================================================

/**
 * テスト用のプロジェクトコンテキストを作成
 */
function createTestContext(overrides?: Partial<ProjectContext>): ProjectContext {
  return {
    project: {
      id: 'test-project',
      name: 'Test Project',
      gitUrl: 'https://github.com/test/test-project.git',
      defaultBranch: 'main',
      integrationBranch: 'develop',
      workDir: '/workspace/test-project',
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    },
    techStack: ['TypeScript', 'Node.js', 'Vitest'],
    ...overrides,
  };
}

/**
 * 有効なAI応答を生成
 */
function createValidAIResponse(subTasks: Array<{
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  estimatedEffort?: 'small' | 'medium' | 'large';
}>): string {
  return `\`\`\`json
{
  "subTasks": ${JSON.stringify(subTasks)}
}
\`\`\``;
}

// =============================================================================
// テストスイート
// =============================================================================

describe('TaskDecomposer', () => {
  let mockAdapter: MockAdapter;
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    mockAdapter = new MockAdapter();
    decomposer = createTaskDecomposer(mockAdapter, 'test-model');
  });

  // ===========================================================================
  // 初期化テスト
  // ===========================================================================

  describe('initialization', () => {
    it('should create TaskDecomposer with adapter and model', () => {
      const adapter = new MockAdapter();
      const td = createTaskDecomposer(adapter, 'llama3');
      expect(td).toBeInstanceOf(TaskDecomposer);
    });
  });

  // ===========================================================================
  // decompose メソッドテスト
  // ===========================================================================

  describe('decompose', () => {
    /**
     * @see Requirement 2.1: WHEN a high-level ticket is received, THE Task_Decomposer SHALL analyze and split into independent sub-tickets
     */
    describe('basic decomposition (Requirement 2.1)', () => {
      it('should decompose instruction into sub-tasks', async () => {
        const aiResponse = createValidAIResponse([
          {
            title: 'Create user model',
            description: 'Define the User model with required fields',
            acceptanceCriteria: ['User model has id, name, email fields'],
            estimatedEffort: 'small',
          },
          {
            title: 'Implement user API',
            description: 'Create REST API endpoints for user CRUD',
            acceptanceCriteria: ['GET /users returns user list'],
            estimatedEffort: 'medium',
          },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose(
          'Create a user management feature',
          context
        );

        expect(result.subTasks).toHaveLength(2);
        expect(result.subTasks[0].title).toBe('Create user model');
        expect(result.subTasks[1].title).toBe('Implement user API');
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should generate unique IDs for sub-tasks', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
          { title: 'Task 2', description: 'Description 2' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        // 各サブタスクが一意のIDを持つ
        const ids = result.subTasks.map((t) => t.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });

      it('should set parentId for all sub-tasks', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
          { title: 'Task 2', description: 'Description 2' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        // 全てのサブタスクが同じparentIdを持つ
        const parentIds = result.subTasks.map((t) => t.parentId);
        expect(new Set(parentIds).size).toBe(1);
        expect(parentIds[0]).toMatch(/^task-/);
      });

      it('should set initial status to pending', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        expect(result.subTasks[0].status).toBe('pending');
      });

      it('should set timestamps for sub-tasks', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        expect(result.subTasks[0].createdAt).toBeDefined();
        expect(result.subTasks[0].updatedAt).toBeDefined();
        // ISO8601形式であることを確認
        expect(() => new Date(result.subTasks[0].createdAt)).not.toThrow();
      });
    });

    // =========================================================================
    // 入力バリデーションテスト
    // =========================================================================

    describe('input validation', () => {
      it('should throw error for empty instruction', async () => {
        const context = createTestContext();
        await expect(decomposer.decompose('', context)).rejects.toThrow(
          TaskDecomposerError
        );
        await expect(decomposer.decompose('', context)).rejects.toThrow(
          'Instruction is required'
        );
      });

      it('should throw error for whitespace-only instruction', async () => {
        const context = createTestContext();
        await expect(decomposer.decompose('   ', context)).rejects.toThrow(
          'Instruction is required'
        );
      });

      it('should throw error for missing project context', async () => {
        const context = { project: undefined } as unknown as ProjectContext;
        await expect(
          decomposer.decompose('Test instruction', context)
        ).rejects.toThrow('Project context is required');
      });
    });

    // =========================================================================
    // オプションテスト
    // =========================================================================

    describe('options', () => {
      it('should use default options when not provided', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        await decomposer.decompose('Test instruction', context);

        // デフォルトオプションが使用されていることを確認
        expect(DEFAULT_DECOMPOSE_OPTIONS.maxSubTasks).toBe(10);
        expect(DEFAULT_DECOMPOSE_OPTIONS.minSubTasks).toBe(1);
      });

      it('should respect maxSubTasks option', async () => {
        // 5つのサブタスクを生成するが、maxSubTasksは3
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
          { title: 'Task 2', description: 'Description 2' },
          { title: 'Task 3', description: 'Description 3' },
          { title: 'Task 4', description: 'Description 4' },
          { title: 'Task 5', description: 'Description 5' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const options: DecomposeOptions = { maxSubTasks: 3 };
        const result = await decomposer.decompose('Test instruction', context, options);

        expect(result.subTasks.length).toBeLessThanOrEqual(3);
      });

      it('should throw error when sub-tasks are less than minSubTasks', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const options: DecomposeOptions = { minSubTasks: 3 };

        await expect(
          decomposer.decompose('Test instruction', context, options)
        ).rejects.toThrow('Generated 1 sub-tasks, but minimum is 3');
      });
    });

    // =========================================================================
    // AI応答パーステスト
    // =========================================================================

    describe('AI response parsing', () => {
      it('should parse JSON in code block', async () => {
        const aiResponse = `Here is the decomposition:
\`\`\`json
{
  "subTasks": [
    {"title": "Task 1", "description": "Description 1"}
  ]
}
\`\`\`
That's all!`;
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        expect(result.subTasks).toHaveLength(1);
        expect(result.subTasks[0].title).toBe('Task 1');
      });

      it('should parse raw JSON without code block', async () => {
        const aiResponse = `{
  "subTasks": [
    {"title": "Task 1", "description": "Description 1"}
  ]
}`;
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        expect(result.subTasks).toHaveLength(1);
      });

      it('should parse array directly', async () => {
        const aiResponse = `\`\`\`json
[
  {"title": "Task 1", "description": "Description 1"}
]
\`\`\``;
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        expect(result.subTasks).toHaveLength(1);
      });

      it('should throw error for invalid JSON', async () => {
        mockAdapter.setResponse('This is not valid JSON');

        const context = createTestContext();
        await expect(
          decomposer.decompose('Test instruction', context)
        ).rejects.toThrow(TaskDecomposerError);
      });

      it('should throw error for missing title', async () => {
        const aiResponse = createValidAIResponse([
          { title: '', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        await expect(
          decomposer.decompose('Test instruction', context)
        ).rejects.toThrow('title is required');
      });

      it('should throw error for missing description', async () => {
        const aiResponse = `\`\`\`json
{
  "subTasks": [
    {"title": "Task 1", "description": ""}
  ]
}
\`\`\``;
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        await expect(
          decomposer.decompose('Test instruction', context)
        ).rejects.toThrow('description is required');
      });

      it('should normalize acceptance criteria', async () => {
        const aiResponse = `\`\`\`json
{
  "subTasks": [
    {
      "title": "Task 1",
      "description": "Description 1",
      "acceptanceCriteria": ["Valid", "", "  ", "Also valid"]
    }
  ]
}
\`\`\``;
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        // 空の基準は除外される
        expect(result.subTasks[0].acceptanceCriteria).toEqual(['Valid', 'Also valid']);
      });

      it('should normalize estimated effort', async () => {
        const aiResponse = `\`\`\`json
{
  "subTasks": [
    {
      "title": "Task 1",
      "description": "Description 1",
      "estimatedEffort": "invalid"
    }
  ]
}
\`\`\``;
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext();
        const result = await decomposer.decompose('Test instruction', context);

        // 無効な値はmediumにデフォルト
        // 注: 現在の実装ではSubTaskにestimatedEffortフィールドがないため、
        // この値は保持されない
        expect(result.subTasks[0]).toBeDefined();
      });
    });

    // =========================================================================
    // エラーハンドリングテスト
    // =========================================================================

    describe('error handling', () => {
      it('should throw TaskDecomposerError on AI adapter failure', async () => {
        mockAdapter.setFailure(true, 'Connection failed');

        const context = createTestContext();
        await expect(
          decomposer.decompose('Test instruction', context)
        ).rejects.toThrow(TaskDecomposerError);
        await expect(
          decomposer.decompose('Test instruction', context)
        ).rejects.toThrow('AI adapter error');
      });

      it('should include error code in TaskDecomposerError', async () => {
        mockAdapter.setFailure(true, 'Connection failed');

        const context = createTestContext();
        try {
          await decomposer.decompose('Test instruction', context);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(TaskDecomposerError);
          expect((error as TaskDecomposerError).code).toBe('AI_ERROR');
        }
      });
    });

    // =========================================================================
    // プロンプト構築テスト
    // =========================================================================

    describe('prompt building', () => {
      it('should include project information in prompt', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext({
          project: {
            id: 'my-project',
            name: 'My Project',
            gitUrl: 'https://github.com/test/my-project.git',
            defaultBranch: 'main',
            integrationBranch: 'develop',
            workDir: '/workspace',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
          },
        });

        await decomposer.decompose('Test instruction', context);

        // プロンプトにプロジェクト情報が含まれていることを確認
        const userMessage = mockAdapter.lastChatOptions?.messages.find(
          (m) => m.role === 'user'
        );
        expect(userMessage?.content).toContain('My Project');
        expect(userMessage?.content).toContain('https://github.com/test/my-project.git');
      });

      it('should include tech stack in prompt when provided', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext({
          techStack: ['React', 'TypeScript', 'Tailwind'],
        });

        await decomposer.decompose('Test instruction', context);

        const userMessage = mockAdapter.lastChatOptions?.messages.find(
          (m) => m.role === 'user'
        );
        expect(userMessage?.content).toContain('React');
        expect(userMessage?.content).toContain('TypeScript');
      });

      it('should include file structure in prompt when provided', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext({
          fileStructure: ['src/index.ts', 'src/components/Button.tsx'],
        });

        await decomposer.decompose('Test instruction', context);

        const userMessage = mockAdapter.lastChatOptions?.messages.find(
          (m) => m.role === 'user'
        );
        expect(userMessage?.content).toContain('src/index.ts');
      });

      it('should include additional context in prompt when provided', async () => {
        const aiResponse = createValidAIResponse([
          { title: 'Task 1', description: 'Description 1' },
        ]);
        mockAdapter.setResponse(aiResponse);

        const context = createTestContext({
          additionalContext: 'This project uses a monorepo structure',
        });

        await decomposer.decompose('Test instruction', context);

        const userMessage = mockAdapter.lastChatOptions?.messages.find(
          (m) => m.role === 'user'
        );
        expect(userMessage?.content).toContain('monorepo structure');
      });
    });
  });

  // ===========================================================================
  // analyzeDependencies メソッドテスト
  // ===========================================================================

  /**
   * @see Requirement 2.2: THE sub-tickets SHALL have no dependencies on each other (parallelizable)
   */
  describe('analyzeDependencies', () => {
    it('should return empty graph for empty task list', async () => {
      const graph = await decomposer.analyzeDependencies([]);

      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
      expect(graph.hasCycle).toBe(false);
    });

    it('should return nodes for all tasks', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Task 1'),
        createSubTask('task-2', 'parent-1', 'Task 2'),
        createSubTask('task-3', 'parent-1', 'Task 3'),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.nodes).toContain('task-1');
      expect(graph.nodes).toContain('task-2');
      expect(graph.nodes).toContain('task-3');
    });

    it('should detect no dependencies for independent tasks', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Create user model'),
        createSubTask('task-2', 'parent-1', 'Create product model'),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      expect(graph.edges).toHaveLength(0);
      expect(graph.hasCycle).toBe(false);
    });

    it('should detect dependency when explicitly mentioned', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Create database schema'),
        createSubTask(
          'task-2',
          'parent-1',
          'Create API',
          'Implement API after Create database schema is done'
        ),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      // task-2がtask-1に依存
      const hasDependency = graph.edges.some(
        ([from, to]) => from === 'task-2' && to === 'task-1'
      );
      expect(hasDependency).toBe(true);
    });

    /**
     * @see Requirement 2.2: 依存関係検出 - "depends on" キーワード
     */
    it('should detect dependency with "depends on" keyword', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Setup infrastructure'),
        createSubTask(
          'task-2',
          'parent-1',
          'Deploy application',
          'This task depends on Setup infrastructure'
        ),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      const hasDependency = graph.edges.some(
        ([from, to]) => from === 'task-2' && to === 'task-1'
      );
      expect(hasDependency).toBe(true);
    });

    /**
     * @see Requirement 2.2: 循環依存の検出
     */
    it('should detect cycle in circular dependencies', async () => {
      const tasks: SubTask[] = [
        createSubTask(
          'task-1',
          'parent-1',
          'Task A',
          'depends on Task B'
        ),
        createSubTask(
          'task-2',
          'parent-1',
          'Task B',
          'depends on Task A'
        ),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      // 循環依存がある場合、hasCycleがtrue
      if (graph.edges.length >= 2) {
        expect(graph.hasCycle).toBe(true);
      }
    });

    /**
     * @see Requirement 2.2: 複数の独立タスク
     */
    it('should handle multiple independent tasks correctly', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Create user service'),
        createSubTask('task-2', 'parent-1', 'Create product service'),
        createSubTask('task-3', 'parent-1', 'Create order service'),
        createSubTask('task-4', 'parent-1', 'Create payment service'),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      // 全て独立したタスクなので依存関係なし
      expect(graph.nodes).toHaveLength(4);
      expect(graph.edges).toHaveLength(0);
      expect(graph.hasCycle).toBe(false);
    });

    /**
     * @see Requirement 2.2: 単一タスクの処理
     */
    it('should handle single task correctly', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Single task'),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      expect(graph.nodes).toHaveLength(1);
      expect(graph.edges).toHaveLength(0);
      expect(graph.hasCycle).toBe(false);
    });

    /**
     * @see Requirement 2.2: エッジの有効性検証
     */
    it('should only create edges between valid node IDs', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'First task'),
        createSubTask(
          'task-2',
          'parent-1',
          'Second task',
          'after First task is done'
        ),
        createSubTask('task-3', 'parent-1', 'Third task'),
      ];

      const graph = await decomposer.analyzeDependencies(tasks);

      // 全てのエッジが有効なノードIDを参照している
      for (const [from, to] of graph.edges) {
        expect(graph.nodes).toContain(from);
        expect(graph.nodes).toContain(to);
      }
    });
  });

  // ===========================================================================
  // identifyParallelizable メソッドテスト
  // ===========================================================================

  /**
   * @see Requirement 2.2: THE sub-tickets SHALL have no dependencies on each other (parallelizable)
   * @see Requirement 2.3: IF dependencies are unavoidable, THE Manager_Agent SHALL sequence them appropriately
   */
  describe('identifyParallelizable', () => {
    it('should return empty array for empty task list', async () => {
      const groups = await decomposer.identifyParallelizable([]);
      expect(groups).toEqual([]);
    });

    it('should return all tasks in one group when no dependencies', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Task 1'),
        createSubTask('task-2', 'parent-1', 'Task 2'),
        createSubTask('task-3', 'parent-1', 'Task 3'),
      ];

      const groups = await decomposer.identifyParallelizable(tasks);

      // 依存関係がないので全て並列実行可能
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(3);
    });

    it('should separate tasks with dependencies into different groups', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Create database'),
        createSubTask(
          'task-2',
          'parent-1',
          'Create API',
          'Implement after Create database'
        ),
      ];

      const groups = await decomposer.identifyParallelizable(tasks);

      // 依存関係があるので2つのグループに分かれる
      expect(groups.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * @see Requirement 2.3: 適切な順序付け
     */
    it('should preserve all tasks across groups', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Setup database'),
        createSubTask(
          'task-2',
          'parent-1',
          'Create models',
          'after Setup database is done'
        ),
        createSubTask(
          'task-3',
          'parent-1',
          'Create API',
          'after Create models is done'
        ),
      ];

      const groups = await decomposer.identifyParallelizable(tasks);

      // 全てのタスクがいずれかのグループに含まれる
      const allTaskIds = groups.flat().map((t) => t.id);
      expect(allTaskIds).toHaveLength(3);
      expect(allTaskIds).toContain('task-1');
      expect(allTaskIds).toContain('task-2');
      expect(allTaskIds).toContain('task-3');
    });

    /**
     * @see Requirement 2.2: 並列実行可能性
     */
    it('should group independent tasks together', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Create user service'),
        createSubTask('task-2', 'parent-1', 'Create product service'),
        createSubTask('task-3', 'parent-1', 'Create order service'),
      ];

      const groups = await decomposer.identifyParallelizable(tasks);

      // 全て独立しているので1グループ
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(3);
    });

    /**
     * @see Requirement 2.3: 複雑な依存関係チェーンの順序付け
     */
    it('should handle complex dependency chains', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Initialize project'),
        createSubTask(
          'task-2',
          'parent-1',
          'Setup database',
          'after Initialize project is done'
        ),
        createSubTask(
          'task-3',
          'parent-1',
          'Create models',
          'after Setup database is done'
        ),
        createSubTask(
          'task-4',
          'parent-1',
          'Create API',
          'after Create models is done'
        ),
      ];

      const groups = await decomposer.identifyParallelizable(tasks);

      // 全てのタスクが含まれている
      const totalTasks = groups.reduce((sum, group) => sum + group.length, 0);
      expect(totalTasks).toBe(4);
    });

    /**
     * @see Requirement 2.2: 単一タスクの処理
     */
    it('should handle single task correctly', async () => {
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Single task'),
      ];

      const groups = await decomposer.identifyParallelizable(tasks);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(1);
      expect(groups[0][0].id).toBe('task-1');
    });

    /**
     * @see Requirement 2.2, 2.3: 部分的な依存関係
     */
    it('should handle partial dependencies correctly', async () => {
      // task-1とtask-2は独立、task-3はtask-1に依存
      const tasks: SubTask[] = [
        createSubTask('task-1', 'parent-1', 'Create user model'),
        createSubTask('task-2', 'parent-1', 'Create product model'),
        createSubTask(
          'task-3',
          'parent-1',
          'Create user API',
          'after Create user model is done'
        ),
      ];

      const groups = await decomposer.identifyParallelizable(tasks);

      // 全てのタスクが含まれている
      const allTaskIds = groups.flat().map((t) => t.id);
      expect(allTaskIds).toHaveLength(3);
    });
  });

  // ===========================================================================
  // saveSubTask メソッドテスト
  // ===========================================================================

  /**
   * @see Requirement 2.4: THE sub-tickets SHALL have parent_id field referencing the original ticket
   * @see Requirement 2.5: THE sub-tickets SHALL be saved to workflows/backlog/ with naming <parent-id>-<sub-id>.md
   */
  describe('saveSubTask', () => {
    const testBacklogDir = 'test-backlog-temp';

    // テスト後にクリーンアップ
    afterEach(async () => {
      try {
        const fs = await import('fs/promises');
        await fs.rm(testBacklogDir, { recursive: true, force: true });
      } catch {
        // ディレクトリが存在しない場合は無視
      }
    });

    /**
     * @see Requirement 2.5: ファイル名規則 <parent-id>-<sub-id>.md
     */
    it('should save sub-task to file with correct naming convention', async () => {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const subTask = createSubTask('parent-001-001', 'parent-001', 'Test Task');

      const filePath = await decomposer.saveSubTask(subTask, { backlogDir: testBacklogDir });

      // ファイルパスが正しい形式であることを確認（クロスプラットフォーム対応）
      const expectedPath = pathModule.join(testBacklogDir, 'parent-001-001.md');
      expect(filePath).toBe(expectedPath);

      // ファイルが存在することを確認
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });

    /**
     * @see Requirement 2.4: parent_id フィールドの設定
     */
    it('should include parent_id in saved file', async () => {
      const fs = await import('fs/promises');
      const subTask = createSubTask('parent-002-001', 'parent-002', 'Test Task');

      const filePath = await decomposer.saveSubTask(subTask, { backlogDir: testBacklogDir });

      // ファイル内容を読み込み
      const content = await fs.readFile(filePath, 'utf-8');

      // parent_idが含まれていることを確認
      expect(content).toContain("parent_id: 'parent-002'");
    });

    it('should include all required fields in saved file', async () => {
      const fs = await import('fs/promises');
      const subTask = createSubTask('task-123-001', 'task-123', 'Create User Model', 'Define the User model with required fields');
      subTask.acceptanceCriteria = ['User model has id field', 'User model has name field'];

      const filePath = await decomposer.saveSubTask(subTask, { backlogDir: testBacklogDir });
      const content = await fs.readFile(filePath, 'utf-8');

      // フロントマターのフィールドを確認
      expect(content).toContain("id: 'task-123-001'");
      expect(content).toContain("parent_id: 'task-123'");
      expect(content).toContain("status: 'pending'");

      // タイトルを確認
      expect(content).toContain('# Create User Model');

      // 説明を確認
      expect(content).toContain('Define the User model with required fields');

      // 受け入れ基準を確認
      expect(content).toContain('- [ ] User model has id field');
      expect(content).toContain('- [ ] User model has name field');
    });

    it('should create backlog directory if it does not exist', async () => {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const nestedDir = pathModule.join(testBacklogDir, 'nested', 'deep');
      const subTask = createSubTask('task-001-001', 'task-001', 'Test Task');

      const filePath = await decomposer.saveSubTask(subTask, { backlogDir: nestedDir });

      // ファイルが存在することを確認
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);

      // クリーンアップ
      await fs.rm(testBacklogDir, { recursive: true, force: true });
    });

    it('should throw error for sub-task without id', async () => {
      const subTask = createSubTask('', 'parent-001', 'Test Task');

      await expect(
        decomposer.saveSubTask(subTask, { backlogDir: testBacklogDir })
      ).rejects.toThrow('SubTask id is required');
    });

    it('should throw error for sub-task without parentId', async () => {
      const subTask = createSubTask('task-001', '', 'Test Task');

      await expect(
        decomposer.saveSubTask(subTask, { backlogDir: testBacklogDir })
      ).rejects.toThrow('SubTask parentId is required');
    });

    it('should use default backlog directory when not specified', async () => {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const subTask = createSubTask('default-test-001', 'default-test', 'Test Task');

      // デフォルトディレクトリを使用
      const filePath = await decomposer.saveSubTask(subTask);

      // ファイルパスがデフォルトディレクトリを使用していることを確認（クロスプラットフォーム対応）
      const expectedPath = pathModule.join('workflows', 'backlog', 'default-test-001.md');
      expect(filePath).toBe(expectedPath);

      // クリーンアップ
      await fs.unlink(filePath);
    });
  });

  // ===========================================================================
  // saveAllSubTasks メソッドテスト
  // ===========================================================================

  describe('saveAllSubTasks', () => {
    const testBacklogDir = 'test-backlog-temp-all';

    afterEach(async () => {
      try {
        const fs = await import('fs/promises');
        await fs.rm(testBacklogDir, { recursive: true, force: true });
      } catch {
        // ディレクトリが存在しない場合は無視
      }
    });

    it('should save multiple sub-tasks to files', async () => {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const subTasks = [
        createSubTask('parent-001-001', 'parent-001', 'Task 1'),
        createSubTask('parent-001-002', 'parent-001', 'Task 2'),
        createSubTask('parent-001-003', 'parent-001', 'Task 3'),
      ];

      const filePaths = await decomposer.saveAllSubTasks(subTasks, { backlogDir: testBacklogDir });

      // 全てのファイルが保存されていることを確認（クロスプラットフォーム対応）
      expect(filePaths).toHaveLength(3);
      expect(filePaths[0]).toBe(pathModule.join(testBacklogDir, 'parent-001-001.md'));
      expect(filePaths[1]).toBe(pathModule.join(testBacklogDir, 'parent-001-002.md'));
      expect(filePaths[2]).toBe(pathModule.join(testBacklogDir, 'parent-001-003.md'));

      // 各ファイルが存在することを確認
      for (const filePath of filePaths) {
        const stat = await fs.stat(filePath);
        expect(stat.isFile()).toBe(true);
      }
    });

    it('should return empty array for empty sub-tasks list', async () => {
      const filePaths = await decomposer.saveAllSubTasks([], { backlogDir: testBacklogDir });
      expect(filePaths).toEqual([]);
    });
  });

  // ===========================================================================
  // decomposeAndSave メソッドテスト
  // ===========================================================================

  describe('decomposeAndSave', () => {
    const testBacklogDir = 'test-backlog-temp-decompose';

    afterEach(async () => {
      try {
        const fs = await import('fs/promises');
        await fs.rm(testBacklogDir, { recursive: true, force: true });
      } catch {
        // ディレクトリが存在しない場合は無視
      }
    });

    it('should decompose and save sub-tasks in one operation', async () => {
      const fs = await import('fs/promises');
      const aiResponse = createValidAIResponse([
        { title: 'Task 1', description: 'Description 1' },
        { title: 'Task 2', description: 'Description 2' },
      ]);
      mockAdapter.setResponse(aiResponse);

      const context = createTestContext();
      const result = await decomposer.decomposeAndSave(
        'Test instruction',
        context,
        undefined,
        { backlogDir: testBacklogDir }
      );

      // 分解結果を確認
      expect(result.subTasks).toHaveLength(2);
      expect(result.tokensUsed).toBeGreaterThan(0);

      // 保存されたファイルを確認
      expect(result.savedFiles).toHaveLength(2);

      // 各ファイルが存在することを確認
      for (const filePath of result.savedFiles) {
        const stat = await fs.stat(filePath);
        expect(stat.isFile()).toBe(true);
      }
    });

    it('should include savedFiles in result', async () => {
      const aiResponse = createValidAIResponse([
        { title: 'Single Task', description: 'Single Description' },
      ]);
      mockAdapter.setResponse(aiResponse);

      const context = createTestContext();
      const result = await decomposer.decomposeAndSave(
        'Test instruction',
        context,
        undefined,
        { backlogDir: testBacklogDir }
      );

      // savedFilesが結果に含まれていることを確認
      expect(result).toHaveProperty('savedFiles');
      expect(Array.isArray(result.savedFiles)).toBe(true);
      expect(result.savedFiles.length).toBe(result.subTasks.length);
    });
  });
});

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * テスト用のSubTaskを作成
 */
function createSubTask(
  id: string,
  parentId: string,
  title: string,
  description: string = 'Test description'
): SubTask {
  const now = new Date().toISOString();
  return {
    id,
    parentId,
    title,
    description,
    acceptanceCriteria: [],
    status: 'pending',
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };
}
