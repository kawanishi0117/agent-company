/**
 * Task Decomposer
 *
 * 大雑把な指示を独立したサブタスクに分解するコンポーネント。
 * AIを使用してタスクを分析し、並列実行可能な独立したサブタスクを生成する。
 *
 * @module execution/decomposer
 * @see Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseAdapter, ChatMessage, AdapterResponse } from '../../../adapters/base.js';
import { SubTask, SubTaskStatus, Project } from './types.js';

// =============================================================================
// 型定義
// =============================================================================

/**
 * プロジェクトコンテキスト
 * @description タスク分解時に参照するプロジェクト情報
 */
export interface ProjectContext {
  /** プロジェクト情報 */
  project: Project;
  /** 既存のファイル構造（オプション） */
  fileStructure?: string[];
  /** 技術スタック情報（オプション） */
  techStack?: string[];
  /** 追加のコンテキスト情報（オプション） */
  additionalContext?: string;
}

/**
 * 依存関係グラフ
 * @description サブタスク間の依存関係を表現
 */
export interface DependencyGraph {
  /** ノード（サブタスクID）一覧 */
  nodes: string[];
  /** エッジ（依存関係）一覧: [from, to] は from が to に依存することを示す */
  edges: Array<[string, string]>;
  /** 循環依存の有無 */
  hasCycle: boolean;
}

/**
 * 分解オプション
 * @description タスク分解時のオプション設定
 */
export interface DecomposeOptions {
  /** 最大サブタスク数（デフォルト: 10） */
  maxSubTasks?: number;
  /** 最小サブタスク数（デフォルト: 1） */
  minSubTasks?: number;
  /** 工数見積もりを含めるか（デフォルト: true） */
  includeEstimates?: boolean;
  /** 受け入れ基準を生成するか（デフォルト: true） */
  generateAcceptanceCriteria?: boolean;
}

/**
 * 分解結果
 * @description タスク分解の結果
 */
export interface DecomposeResult {
  /** 生成されたサブタスク一覧 */
  subTasks: SubTask[];
  /** 分解に使用したトークン数 */
  tokensUsed: number;
  /** 分解にかかった時間（ミリ秒） */
  durationMs: number;
}

/**
 * AI応答のサブタスク形式
 * @description AIからの応答をパースした中間形式
 */
interface AISubTaskResponse {
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  estimatedEffort?: 'small' | 'medium' | 'large';
}

// =============================================================================
// デフォルト設定
// =============================================================================

/**
 * デフォルトの分解オプション
 */
export const DEFAULT_DECOMPOSE_OPTIONS: Required<DecomposeOptions> = {
  maxSubTasks: 10,
  minSubTasks: 1,
  includeEstimates: true,
  generateAcceptanceCriteria: true,
};

// =============================================================================
// TaskDecomposer インターフェース
// =============================================================================

/**
 * サブタスクファイル保存オプション
 * @description サブタスクをファイルに保存する際のオプション
 */
export interface SaveSubTaskOptions {
  /** 保存先ディレクトリ（デフォルト: 'workflows/backlog'） */
  backlogDir?: string;
}

/**
 * デフォルトの保存オプション
 */
export const DEFAULT_SAVE_OPTIONS: Required<SaveSubTaskOptions> = {
  backlogDir: 'workflows/backlog',
};

/**
 * TaskDecomposer インターフェース
 * @description タスク分解機能のインターフェース定義
 */
export interface ITaskDecomposer {
  /**
   * 指示をサブタスクに分解
   * @param instruction 分解対象の指示
   * @param context プロジェクトコンテキスト
   * @param options 分解オプション
   * @returns 分解結果
   */
  decompose(
    instruction: string,
    context: ProjectContext,
    options?: DecomposeOptions
  ): Promise<DecomposeResult>;

  /**
   * サブタスク間の依存関係を分析
   * @param tasks サブタスク一覧
   * @returns 依存関係グラフ
   */
  analyzeDependencies(tasks: SubTask[]): Promise<DependencyGraph>;

  /**
   * 並列実行可能なタスクグループを特定
   * @param tasks サブタスク一覧
   * @returns 並列実行可能なタスクグループ（各グループ内は並列実行可能）
   */
  identifyParallelizable(tasks: SubTask[]): Promise<SubTask[][]>;

  /**
   * サブタスクをファイルに保存
   * @param subTask 保存するサブタスク
   * @param options 保存オプション
   * @returns 保存されたファイルパス
   * @see Requirement 2.4: THE sub-tickets SHALL have parent_id field referencing the original ticket
   * @see Requirement 2.5: THE sub-tickets SHALL be saved to workflows/backlog/ with naming <parent-id>-<sub-id>.md
   */
  saveSubTask(subTask: SubTask, options?: SaveSubTaskOptions): Promise<string>;

  /**
   * 複数のサブタスクをファイルに保存
   * @param subTasks 保存するサブタスク一覧
   * @param options 保存オプション
   * @returns 保存されたファイルパス一覧
   */
  saveAllSubTasks(subTasks: SubTask[], options?: SaveSubTaskOptions): Promise<string[]>;

  /**
   * 指示を分解してファイルに保存
   * @param instruction 分解対象の指示
   * @param context プロジェクトコンテキスト
   * @param decomposeOptions 分解オプション
   * @param saveOptions 保存オプション
   * @returns 分解結果と保存されたファイルパス一覧
   */
  decomposeAndSave(
    instruction: string,
    context: ProjectContext,
    decomposeOptions?: DecomposeOptions,
    saveOptions?: SaveSubTaskOptions
  ): Promise<DecomposeResult & { savedFiles: string[] }>;
}

// =============================================================================
// TaskDecomposer 実装
// =============================================================================

/**
 * TaskDecomposer クラス
 * @description AIを使用してタスクを分解するクラス
 * @see Requirement 2.1: WHEN a high-level ticket is received, THE Task_Decomposer SHALL analyze and split into independent sub-tickets
 */
export class TaskDecomposer implements ITaskDecomposer {
  private readonly adapter: BaseAdapter;
  private readonly model: string;

  /**
   * コンストラクタ
   * @param adapter AIアダプタ
   * @param model 使用するモデル名
   */
  constructor(adapter: BaseAdapter, model: string) {
    this.adapter = adapter;
    this.model = model;
  }

  /**
   * 指示をサブタスクに分解
   * @see Requirement 2.1: analyze and split into independent sub-tickets
   */
  async decompose(
    instruction: string,
    context: ProjectContext,
    options?: DecomposeOptions
  ): Promise<DecomposeResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_DECOMPOSE_OPTIONS, ...options };

    // 入力バリデーション
    if (!instruction || instruction.trim().length === 0) {
      throw new TaskDecomposerError('Instruction is required', 'INVALID_INPUT');
    }

    if (!context.project) {
      throw new TaskDecomposerError('Project context is required', 'INVALID_INPUT');
    }

    // プロンプトを構築
    const systemPrompt = this.buildSystemPrompt(opts);
    const userPrompt = this.buildUserPrompt(instruction, context, opts);

    // AIに分解を依頼
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    let response: AdapterResponse;
    try {
      response = await this.adapter.chat({
        model: this.model,
        messages,
        temperature: 0.3, // 一貫性のある出力のため低めに設定
      });
    } catch (error) {
      throw new TaskDecomposerError(
        `AI adapter error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AI_ERROR',
        error instanceof Error ? error : undefined
      );
    }

    // 応答をパース
    const aiSubTasks = this.parseAIResponse(response.content);

    // サブタスク数のバリデーション
    if (aiSubTasks.length < opts.minSubTasks) {
      throw new TaskDecomposerError(
        `Generated ${aiSubTasks.length} sub-tasks, but minimum is ${opts.minSubTasks}`,
        'INSUFFICIENT_SUBTASKS'
      );
    }

    if (aiSubTasks.length > opts.maxSubTasks) {
      // 最大数を超えた場合は切り詰める
      aiSubTasks.splice(opts.maxSubTasks);
    }

    // SubTask形式に変換
    const parentId = this.generateTaskId();
    const subTasks = aiSubTasks.map((aiTask, index) =>
      this.convertToSubTask(aiTask, parentId, index + 1)
    );

    const durationMs = Date.now() - startTime;

    return {
      subTasks,
      tokensUsed: response.tokensUsed ?? 0,
      durationMs,
    };
  }

  /**
   * サブタスク間の依存関係を分析
   * @see Requirement 2.2: THE sub-tickets SHALL have no dependencies on each other (parallelizable)
   */
  async analyzeDependencies(tasks: SubTask[]): Promise<DependencyGraph> {
    if (tasks.length === 0) {
      return {
        nodes: [],
        edges: [],
        hasCycle: false,
      };
    }

    const nodes = tasks.map((t) => t.id);
    const edges: Array<[string, string]> = [];

    // タスクの説明と受け入れ基準から依存関係を推測
    // 注: 本来はAIを使用してより精密な分析を行うが、
    // 基本実装では独立したタスクを生成することを前提とする
    for (let i = 0; i < tasks.length; i++) {
      for (let j = 0; j < tasks.length; j++) {
        if (i !== j) {
          const dependency = this.detectDependency(tasks[i], tasks[j]);
          if (dependency) {
            edges.push([tasks[i].id, tasks[j].id]);
          }
        }
      }
    }

    // 循環依存のチェック
    const hasCycle = this.detectCycle(nodes, edges);

    return {
      nodes,
      edges,
      hasCycle,
    };
  }

  /**
   * 並列実行可能なタスクグループを特定
   * @see Requirement 2.2: parallelizable
   */
  async identifyParallelizable(tasks: SubTask[]): Promise<SubTask[][]> {
    if (tasks.length === 0) {
      return [];
    }

    // 依存関係を分析
    const graph = await this.analyzeDependencies(tasks);

    // 依存関係がない場合は全て並列実行可能
    if (graph.edges.length === 0) {
      return [tasks];
    }

    // トポロジカルソートで実行順序を決定
    const levels = this.topologicalSort(tasks, graph);

    return levels;
  }

  // ===========================================================================
  // サブタスクファイル保存メソッド
  // ===========================================================================

  /**
   * サブタスクをファイルに保存
   * @see Requirement 2.4: THE sub-tickets SHALL have parent_id field referencing the original ticket
   * @see Requirement 2.5: THE sub-tickets SHALL be saved to workflows/backlog/ with naming <parent-id>-<sub-id>.md
   */
  async saveSubTask(subTask: SubTask, options?: SaveSubTaskOptions): Promise<string> {
    const opts = { ...DEFAULT_SAVE_OPTIONS, ...options };

    // 入力バリデーション
    if (!subTask.id || subTask.id.trim().length === 0) {
      throw new TaskDecomposerError('SubTask id is required', 'INVALID_INPUT');
    }

    if (!subTask.parentId || subTask.parentId.trim().length === 0) {
      throw new TaskDecomposerError('SubTask parentId is required', 'INVALID_INPUT');
    }

    // ファイル名を生成: <parent-id>-<sub-id>.md
    // サブタスクIDは既に "parentId-XXX" 形式なので、そのまま使用
    const fileName = `${subTask.id}.md`;
    const filePath = path.join(opts.backlogDir, fileName);

    // Markdown形式でサブタスクを生成
    const content = this.generateSubTaskMarkdown(subTask);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(opts.backlogDir, { recursive: true });

    // ファイルに書き込み
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * 複数のサブタスクをファイルに保存
   * @see Requirement 2.5: THE sub-tickets SHALL be saved to workflows/backlog/
   */
  async saveAllSubTasks(subTasks: SubTask[], options?: SaveSubTaskOptions): Promise<string[]> {
    const savedFiles: string[] = [];

    for (const subTask of subTasks) {
      const filePath = await this.saveSubTask(subTask, options);
      savedFiles.push(filePath);
    }

    return savedFiles;
  }

  /**
   * 指示を分解してファイルに保存
   * @description 分解と保存を一括で行うコンビニエンスメソッド
   */
  async decomposeAndSave(
    instruction: string,
    context: ProjectContext,
    decomposeOptions?: DecomposeOptions,
    saveOptions?: SaveSubTaskOptions
  ): Promise<DecomposeResult & { savedFiles: string[] }> {
    // タスクを分解
    const result = await this.decompose(instruction, context, decomposeOptions);

    // サブタスクをファイルに保存
    const savedFiles = await this.saveAllSubTasks(result.subTasks, saveOptions);

    return {
      ...result,
      savedFiles,
    };
  }

  /**
   * サブタスクをMarkdown形式に変換
   * @description workflows/backlog/TEMPLATE.md に準拠した形式で生成
   */
  private generateSubTaskMarkdown(subTask: SubTask): string {
    const now = new Date().toISOString();

    // フロントマター（YAML形式のメタデータ）
    const frontMatter = [
      '---',
      `id: '${subTask.id}'`,
      `parent_id: '${subTask.parentId}'`,
      `status: '${subTask.status}'`,
      `assignee: '${subTask.assignee ?? ''}'`,
      `created: '${subTask.createdAt}'`,
      `updated: '${now}'`,
      '---',
    ].join('\n');

    // タイトル
    const title = `# ${subTask.title}`;

    // 目的セクション
    const purpose = ['## 目的', '', subTask.description].join('\n');

    // DoD（受け入れ基準）セクション
    const dodItems =
      subTask.acceptanceCriteria.length > 0
        ? subTask.acceptanceCriteria.map((c) => `- [ ] ${c}`).join('\n')
        : '- [ ] タスクが完了している';

    const dod = ['## DoD (Definition of Done)', '', dodItems].join('\n');

    // 範囲セクション（空のプレースホルダー）
    const scope = [
      '## 範囲',
      '',
      '[変更対象のファイル・コンポーネントをリスト化]',
      '',
      '- [ ] 対象ファイル/コンポーネント',
    ].join('\n');

    // リスクセクション（空のプレースホルダー）
    const risk = [
      '## リスク',
      '',
      '| リスク | 影響度 | 対策 |',
      '| ------ | ------ | ---- |',
      '| - | - | - |',
    ].join('\n');

    // ロールバックセクション（空のプレースホルダー）
    const rollback = ['## ロールバック', '', '1. 変更を元に戻す'].join('\n');

    // 作業ログセクション
    const workLog = [
      '---',
      '',
      '## 作業ログ',
      '',
      `### ${now.split('T')[0]}`,
      '',
      '- サブタスクとして自動生成',
    ].join('\n');

    // 全体を結合
    return [
      frontMatter,
      '',
      title,
      '',
      purpose,
      '',
      scope,
      '',
      dod,
      '',
      risk,
      '',
      rollback,
      '',
      workLog,
      '',
    ].join('\n');
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * システムプロンプトを構築
   */
  private buildSystemPrompt(options: Required<DecomposeOptions>): string {
    return `あなたはタスク分解の専門家です。与えられた指示を独立した並列実行可能なサブタスクに分解してください。

## ルール
1. 各サブタスクは他のサブタスクに依存せず、独立して実行可能であること
2. サブタスクは具体的で実行可能な単位であること
3. サブタスクの数は${options.minSubTasks}〜${options.maxSubTasks}個の範囲であること
4. 各サブタスクには明確なタイトルと説明を含めること
${options.generateAcceptanceCriteria ? '5. 各サブタスクには受け入れ基準を含めること' : ''}
${options.includeEstimates ? '6. 各サブタスクには工数見積もり（small/medium/large）を含めること' : ''}

## 出力形式
以下のJSON形式で出力してください：
\`\`\`json
{
  "subTasks": [
    {
      "title": "サブタスクのタイトル",
      "description": "サブタスクの詳細な説明",
      "acceptanceCriteria": ["基準1", "基準2"],
      "estimatedEffort": "small|medium|large"
    }
  ]
}
\`\`\`

重要: 必ず有効なJSON形式で出力してください。`;
  }

  /**
   * ユーザープロンプトを構築
   */
  private buildUserPrompt(
    instruction: string,
    context: ProjectContext,
    _options: Required<DecomposeOptions>
  ): string {
    let prompt = `## 指示
${instruction}

## プロジェクト情報
- プロジェクト名: ${context.project.name}
- リポジトリ: ${context.project.gitUrl}
- デフォルトブランチ: ${context.project.defaultBranch}
`;

    if (context.techStack && context.techStack.length > 0) {
      prompt += `\n## 技術スタック\n${context.techStack.join(', ')}\n`;
    }

    if (context.fileStructure && context.fileStructure.length > 0) {
      prompt += `\n## ファイル構造\n${context.fileStructure.slice(0, 20).join('\n')}\n`;
    }

    if (context.additionalContext) {
      prompt += `\n## 追加情報\n${context.additionalContext}\n`;
    }

    prompt += `\n上記の指示を独立したサブタスクに分解してください。`;

    return prompt;
  }

  /**
   * AI応答をパース
   */
  private parseAIResponse(content: string): AISubTaskResponse[] {
    // JSON部分を抽出
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonStr = jsonMatch ? jsonMatch[1] : content;

    // JSONブロックがない場合、直接JSONとしてパースを試みる
    if (!jsonMatch) {
      // 最初の { から最後の } までを抽出
      const startIndex = content.indexOf('{');
      const endIndex = content.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        jsonStr = content.substring(startIndex, endIndex + 1);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // subTasksフィールドがある場合
      if (parsed.subTasks && Array.isArray(parsed.subTasks)) {
        return this.validateAndNormalizeSubTasks(parsed.subTasks);
      }

      // 配列が直接返された場合
      if (Array.isArray(parsed)) {
        return this.validateAndNormalizeSubTasks(parsed);
      }

      throw new TaskDecomposerError(
        'Invalid AI response format: expected subTasks array',
        'PARSE_ERROR'
      );
    } catch (error) {
      if (error instanceof TaskDecomposerError) {
        throw error;
      }
      throw new TaskDecomposerError(
        `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PARSE_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * サブタスクを検証・正規化
   */
  private validateAndNormalizeSubTasks(tasks: unknown[]): AISubTaskResponse[] {
    return tasks.map((task, index) => {
      if (typeof task !== 'object' || task === null) {
        throw new TaskDecomposerError(
          `Invalid sub-task at index ${index}: expected object`,
          'VALIDATION_ERROR'
        );
      }

      const t = task as Record<string, unknown>;

      // 必須フィールドのチェック
      if (typeof t.title !== 'string' || t.title.trim().length === 0) {
        throw new TaskDecomposerError(
          `Invalid sub-task at index ${index}: title is required`,
          'VALIDATION_ERROR'
        );
      }

      if (typeof t.description !== 'string' || t.description.trim().length === 0) {
        throw new TaskDecomposerError(
          `Invalid sub-task at index ${index}: description is required`,
          'VALIDATION_ERROR'
        );
      }

      // 受け入れ基準の正規化
      let acceptanceCriteria: string[] = [];
      if (Array.isArray(t.acceptanceCriteria)) {
        acceptanceCriteria = t.acceptanceCriteria.filter(
          (c): c is string => typeof c === 'string' && c.trim().length > 0
        );
      }

      // 工数見積もりの正規化
      let estimatedEffort: 'small' | 'medium' | 'large' = 'medium';
      if (
        t.estimatedEffort === 'small' ||
        t.estimatedEffort === 'medium' ||
        t.estimatedEffort === 'large'
      ) {
        estimatedEffort = t.estimatedEffort;
      }

      return {
        title: t.title.trim(),
        description: t.description.trim(),
        acceptanceCriteria,
        estimatedEffort,
      };
    });
  }

  /**
   * AISubTaskResponseをSubTaskに変換
   */
  private convertToSubTask(aiTask: AISubTaskResponse, parentId: string, index: number): SubTask {
    const now = new Date().toISOString();
    const subId = `${parentId}-${index.toString().padStart(3, '0')}`;

    return {
      id: subId,
      parentId,
      title: aiTask.title,
      description: aiTask.description,
      acceptanceCriteria: aiTask.acceptanceCriteria ?? [],
      status: 'pending' as SubTaskStatus,
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * タスクIDを生成
   */
  private generateTaskId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `task-${timestamp}-${random}`;
  }

  /**
   * 2つのタスク間の依存関係を検出
   * @description タスクAがタスクBに依存しているかを判定
   */
  private detectDependency(taskA: SubTask, taskB: SubTask): boolean {
    // 簡易的な依存関係検出
    // タスクAの説明にタスクBのタイトルや成果物への参照が含まれているかチェック
    const aText = `${taskA.description} ${taskA.acceptanceCriteria.join(' ')}`.toLowerCase();
    const bTitle = taskB.title.toLowerCase();

    // タスクBのタイトルがタスクAの説明に含まれている場合、依存関係があると判定
    // ただし、独立したタスクを生成することを前提としているため、
    // この検出は保守的に行う
    if (aText.includes(`after ${bTitle}`) || aText.includes(`depends on ${bTitle}`)) {
      return true;
    }

    return false;
  }

  /**
   * 循環依存を検出
   */
  private detectCycle(nodes: string[], edges: Array<[string, string]>): boolean {
    // DFSで循環を検出
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const adjacencyList = new Map<string, string[]>();
    for (const node of nodes) {
      adjacencyList.set(node, []);
    }
    for (const [from, to] of edges) {
      adjacencyList.get(from)?.push(to);
    }

    const hasCycleFromNode = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = adjacencyList.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycleFromNode(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node)) {
        if (hasCycleFromNode(node)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * トポロジカルソートで実行レベルを決定
   */
  private topologicalSort(tasks: SubTask[], graph: DependencyGraph): SubTask[][] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // 初期化
    for (const node of graph.nodes) {
      inDegree.set(node, 0);
      adjacencyList.set(node, []);
    }

    // 入次数と隣接リストを構築
    for (const [from, to] of graph.edges) {
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
      adjacencyList.get(from)?.push(to);
    }

    const levels: SubTask[][] = [];
    const remaining = new Set(graph.nodes);

    while (remaining.size > 0) {
      // 入次数が0のノードを収集（並列実行可能）
      const currentLevel: SubTask[] = [];
      const toRemove: string[] = [];

      for (const node of remaining) {
        if ((inDegree.get(node) ?? 0) === 0) {
          const task = taskMap.get(node);
          if (task) {
            currentLevel.push(task);
          }
          toRemove.push(node);
        }
      }

      // 進捗がない場合は循環依存
      if (toRemove.length === 0) {
        // 残りのタスクを1つのグループとして追加
        const remainingTasks = Array.from(remaining)
          .map((id) => taskMap.get(id))
          .filter((t): t is SubTask => t !== undefined);
        if (remainingTasks.length > 0) {
          levels.push(remainingTasks);
        }
        break;
      }

      // 現在のレベルを追加
      if (currentLevel.length > 0) {
        levels.push(currentLevel);
      }

      // 処理済みノードを削除し、隣接ノードの入次数を更新
      for (const node of toRemove) {
        remaining.delete(node);
        const neighbors = adjacencyList.get(node) ?? [];
        for (const neighbor of neighbors) {
          inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
        }
      }
    }

    return levels;
  }
}

// =============================================================================
// エラークラス
// =============================================================================

/**
 * TaskDecomposerエラーコード
 */
export type TaskDecomposerErrorCode =
  | 'INVALID_INPUT'
  | 'AI_ERROR'
  | 'PARSE_ERROR'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_SUBTASKS'
  | 'FILE_SAVE_ERROR';

/**
 * TaskDecomposerエラー
 */
export class TaskDecomposerError extends Error {
  constructor(
    message: string,
    public readonly code: TaskDecomposerErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TaskDecomposerError';
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * TaskDecomposerを作成
 * @param adapter AIアダプタ
 * @param model 使用するモデル名
 * @returns TaskDecomposerインスタンス
 */
export function createTaskDecomposer(adapter: BaseAdapter, model: string): TaskDecomposer {
  return new TaskDecomposer(adapter, model);
}
