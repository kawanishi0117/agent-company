/**
 * Worker Agent - タスク実行エージェント
 *
 * AIとの会話ループを通じてタスクを実行する部下エージェント。
 * ツール呼び出し、状態管理、会話履歴の保存を担当する。
 *
 * @module execution/agents/worker
 * @see Requirements: 8.1, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AgentId,
  RunId,
  SubTask,
  ExecutionResult,
  ExecutionStatus,
  ConversationHistory,
  ConversationMessage,
  ToolCallRecord,
  WorkerStatus,
  ArtifactInfo,
  QualityGateResult,
  ErrorInfo,
} from '../types';
import { ToolExecutor, toolExecutor, FileEdit } from '../tools';
import {
  ExtendedAdapter,
  BaseAdapter,
  ChatMessage,
  ToolCall,
  ToolCallResult,
  ToolDefinition,
  ToolCallResponse,
} from '../../../../adapters/base';
import { getAdapter, globalRegistry } from '../../../../adapters/index';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * 最大会話イテレーション数
 * @see Requirement 11.3: THE conversation loop SHALL continue until AI signals completion or max iterations (30)
 */
export const MAX_ITERATIONS = 30;

/**
 * 会話履歴保存ディレクトリのベースパス
 */
const RUNS_BASE_DIR = 'runtime/runs';

/**
 * AI完了シグナルのパターン
 * @see Requirement 11.4: WHEN AI signals completion, THE System SHALL collect all artifacts
 */
const COMPLETION_SIGNALS = [
  'TASK_COMPLETE',
  'タスク完了',
  '作業完了',
  'DONE',
  '完了しました',
];

// =============================================================================
// 型定義
// =============================================================================

/**
 * Worker Agent設定
 */
export interface WorkerAgentConfig {
  /** エージェントID */
  agentId: AgentId;
  /** 使用するAIアダプタ名 */
  adapterName?: string;
  /** 使用するモデル名 */
  modelName?: string;
  /** ワークスペースパス */
  workspacePath?: string;
  /** 最大イテレーション数 */
  maxIterations?: number;
  /** コマンドタイムアウト（秒） */
  commandTimeout?: number;
}

/**
 * タスク実行オプション
 */
export interface ExecuteTaskOptions {
  /** 実行ID */
  runId: RunId;
  /** 追加のシステムプロンプト */
  systemPrompt?: string;
  /** 既存の会話履歴（再開用） */
  existingHistory?: ConversationHistory;
}

/**
 * 会話ループ結果
 */
export interface ConversationLoopResult {
  /** 完了フラグ */
  completed: boolean;
  /** 最終レスポンス */
  finalResponse: string;
  /** イテレーション数 */
  iterations: number;
  /** 収集された成果物 */
  artifacts: ArtifactInfo[];
  /** エラー一覧 */
  errors: ErrorInfo[];
}

// =============================================================================
// ツール定義
// =============================================================================

/**
 * Worker Agentが使用可能なツール定義
 * @see Requirement 8.1: THE Execution_Engine SHALL support Tool_Calls
 */
export const WORKER_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'ファイルの内容を読み取る',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '読み取るファイルのパス（ワークスペース相対）',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'ファイルを作成または上書きする',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '書き込むファイルのパス（ワークスペース相対）',
        },
        content: {
          type: 'string',
          description: 'ファイルの内容',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'ファイルを編集する（差分ベース）',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '編集するファイルのパス（ワークスペース相対）',
        },
        edits: {
          type: 'array',
          description: '編集操作の配列',
          items: {
            type: 'object',
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
  {
    name: 'list_directory',
    description: 'ディレクトリの内容を一覧表示する',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ディレクトリのパス（ワークスペース相対）',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_command',
    description: 'シェルコマンドを実行する',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '実行するコマンド',
        },
        timeout: {
          type: 'number',
          description: 'タイムアウト秒数（オプション）',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'git_commit',
    description: '変更をGitにコミットする',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'コミットメッセージ',
        },
        files: {
          type: 'array',
          description: 'ステージングするファイル（省略時は全ファイル）',
          items: {
            type: 'string',
          },
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'git_status',
    description: 'Gitリポジトリの状態を取得する',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'task_complete',
    description: 'タスクの完了を報告する',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '完了サマリー',
        },
        artifacts: {
          type: 'array',
          description: '作成・変更したファイルのパス一覧',
          items: {
            type: 'string',
          },
        },
      },
      required: ['summary'],
    },
  },
];

// =============================================================================
// WorkerAgent クラス
// =============================================================================

/**
 * WorkerAgent - タスク実行エージェント
 *
 * AIとの会話ループを通じてタスクを実行する。
 * ツール呼び出しを処理し、会話履歴を保存する。
 *
 * @see Requirement 8.1: THE Execution_Engine SHALL support Tool_Calls
 * @see Requirement 11.1: THE Execution_Engine SHALL maintain conversation history during task execution
 * @see Requirement 11.3: THE conversation loop SHALL continue until AI signals completion or max iterations (30)
 */
export class WorkerAgent {
  /** エージェントID */
  readonly agentId: AgentId;

  /** AIアダプタ */
  private adapter: BaseAdapter | ExtendedAdapter;

  /** ツール実行器 */
  private toolExecutor: ToolExecutor;

  /** モデル名 */
  private modelName: string;

  /** 最大イテレーション数 */
  private maxIterations: number;

  /** 現在のステータス */
  private status: WorkerStatus = 'idle';

  /** 現在の実行ID */
  private currentRunId?: RunId;

  /** 会話履歴 */
  private conversationHistory: ConversationHistory | null = null;

  /** 収集された成果物 */
  private collectedArtifacts: ArtifactInfo[] = [];

  /** タスク完了フラグ */
  private taskCompleted: boolean = false;

  /**
   * コンストラクタ
   * @param config - Worker Agent設定
   */
  constructor(config: WorkerAgentConfig) {
    this.agentId = config.agentId;
    this.maxIterations = config.maxIterations ?? MAX_ITERATIONS;
    this.modelName = config.modelName ?? 'llama3';

    // AIアダプタを取得
    const adapterName = config.adapterName ?? 'ollama';
    this.adapter = getAdapter(adapterName);

    // ツール実行器を設定
    this.toolExecutor = new ToolExecutor();
    if (config.workspacePath) {
      this.toolExecutor.setWorkspacePath(config.workspacePath);
    }
    if (config.commandTimeout) {
      this.toolExecutor.setCommandTimeout(config.commandTimeout);
    }
  }

  // ===========================================================================
  // ステータス管理
  // ===========================================================================

  /**
   * 現在のステータスを取得
   * @returns ワーカーステータス
   */
  getStatus(): WorkerStatus {
    return this.status;
  }

  /**
   * ステータスを設定
   * @param status - 新しいステータス
   */
  private setStatus(status: WorkerStatus): void {
    this.status = status;
  }

  // ===========================================================================
  // タスク実行
  // ===========================================================================

  /**
   * タスクを実行する
   *
   * AIとの会話ループを通じてタスクを完了させる。
   * 最大イテレーション数に達した場合はpartialステータスで終了。
   *
   * @param task - 実行するサブタスク
   * @param options - 実行オプション
   * @returns 実行結果
   *
   * @see Requirement 8.1: THE Execution_Engine SHALL support Tool_Calls
   * @see Requirement 11.1: THE Execution_Engine SHALL maintain conversation history
   * @see Requirement 11.5: IF max iterations reached, THE System SHALL mark task as `partial`
   */
  async executeTask(task: SubTask, options: ExecuteTaskOptions): Promise<ExecutionResult> {
    const startTime = new Date().toISOString();
    this.currentRunId = options.runId;
    this.setStatus('working');
    this.taskCompleted = false;
    this.collectedArtifacts = [];

    // ツール実行器に実行IDを設定
    this.toolExecutor.setRunId(options.runId);

    // 会話履歴を初期化または復元
    if (options.existingHistory) {
      this.conversationHistory = options.existingHistory;
    } else {
      this.conversationHistory = this.createInitialHistory(options.runId);
    }

    const errors: ErrorInfo[] = [];

    try {
      // システムプロンプトを構築
      const systemPrompt = this.buildSystemPrompt(task, options.systemPrompt);

      // 初期メッセージを追加
      this.addMessage('system', systemPrompt);
      this.addMessage('user', this.buildTaskPrompt(task));

      // 会話ループを実行
      const loopResult = await this.runConversationLoop();

      // 会話履歴を保存
      await this.saveConversationHistory(options.runId);

      // 実行結果を構築
      const endTime = new Date().toISOString();
      const status: ExecutionStatus = loopResult.completed ? 'success' : 'partial';

      return this.buildExecutionResult(
        options.runId,
        task,
        status,
        startTime,
        endTime,
        loopResult,
        errors
      );
    } catch (error) {
      // エラーを記録
      const errorInfo = this.createErrorInfo(error);
      errors.push(errorInfo);

      // 会話履歴を保存（エラー時も）
      await this.saveConversationHistory(options.runId);

      const endTime = new Date().toISOString();
      return this.buildExecutionResult(
        options.runId,
        task,
        'error',
        startTime,
        endTime,
        { completed: false, finalResponse: '', iterations: 0, artifacts: [], errors: [] },
        errors
      );
    } finally {
      this.setStatus('idle');
      this.currentRunId = undefined;
    }
  }

  // ===========================================================================
  // 会話ループ
  // ===========================================================================

  /**
   * 会話ループを実行
   *
   * AIとの複数回のやり取りを行い、タスクを完了させる。
   *
   * @returns 会話ループ結果
   *
   * @see Requirement 11.2: WHEN AI requests Tool_Call, THE System SHALL execute and return result
   * @see Requirement 11.3: THE conversation loop SHALL continue until AI signals completion or max iterations (30)
   */
  private async runConversationLoop(): Promise<ConversationLoopResult> {
    let iterations = 0;
    let finalResponse = '';
    const errors: ErrorInfo[] = [];

    while (iterations < this.maxIterations && !this.taskCompleted) {
      iterations++;

      try {
        // AIにリクエストを送信
        const response = await this.sendToAI();

        // レスポンスを会話履歴に追加
        this.addMessage('assistant', response.content);
        finalResponse = response.content;

        // 完了シグナルをチェック
        if (this.checkCompletionSignal(response.content)) {
          this.taskCompleted = true;
          break;
        }

        // ツール呼び出しを処理
        if (response.toolCalls && response.toolCalls.length > 0) {
          const toolResults = await this.processToolCalls(response.toolCalls);

          // ツール結果をメッセージとして追加
          const toolResultMessage = this.formatToolResults(toolResults);
          this.addMessage('user', toolResultMessage);

          // task_completeツールが呼ばれた場合は完了
          if (this.taskCompleted) {
            break;
          }
        } else if (response.isComplete) {
          // AIが完了を示した場合
          this.taskCompleted = true;
          break;
        }
      } catch (error) {
        // エラーを記録して続行
        const errorInfo = this.createErrorInfo(error);
        errors.push(errorInfo);

        // エラーをAIに伝える
        this.addMessage('user', `エラーが発生しました: ${errorInfo.message}`);
      }
    }

    return {
      completed: this.taskCompleted,
      finalResponse,
      iterations,
      artifacts: [...this.collectedArtifacts],
      errors,
    };
  }

  // ===========================================================================
  // AI通信
  // ===========================================================================

  /**
   * AIにリクエストを送信
   *
   * @returns AIレスポンス
   */
  private async sendToAI(): Promise<ToolCallResponse> {
    // 会話履歴からChatMessage形式に変換
    const messages: ChatMessage[] = this.conversationHistory!.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // ExtendedAdapterかチェック
    if (globalRegistry.isExtendedAdapter(this.adapter)) {
      // ツール付きチャットを使用
      return await (this.adapter as ExtendedAdapter).chatWithTools({
        model: this.modelName,
        messages,
        tools: WORKER_TOOLS,
      });
    } else {
      // 通常のチャットを使用（ツール呼び出しなし）
      const response = await this.adapter.chat({
        model: this.modelName,
        messages,
      });
      return {
        ...response,
        isComplete: true,
      };
    }
  }

  // ===========================================================================
  // ツール呼び出し処理
  // ===========================================================================

  /**
   * ツール呼び出しを処理
   *
   * @param toolCalls - ツール呼び出しの配列
   * @returns ツール呼び出し結果の配列
   *
   * @see Requirement 11.2: WHEN AI requests Tool_Call, THE System SHALL execute and return result
   */
  private async processToolCalls(toolCalls: ToolCall[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (const toolCall of toolCalls) {
      const startTime = Date.now();
      let result: unknown;
      let error: string | undefined;

      try {
        result = await this.executeToolCall(toolCall);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        result = { error };
      }

      const endTime = Date.now();

      // ツール呼び出し記録を追加
      this.addToolCallRecord({
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        result,
        timestamp: new Date().toISOString(),
        durationMs: endTime - startTime,
      });

      results.push({
        toolCallId: toolCall.id,
        result,
        error,
      });
    }

    return results;
  }

  /**
   * 個別のツール呼び出しを実行
   *
   * @param toolCall - ツール呼び出し
   * @returns 実行結果
   */
  private async executeToolCall(toolCall: ToolCall): Promise<unknown> {
    const args = toolCall.arguments;

    switch (toolCall.name) {
      case 'read_file': {
        const filePath = args.path as string;
        const result = await this.toolExecutor.readFile(filePath);
        return result;
      }

      case 'write_file': {
        const filePath = args.path as string;
        const content = args.content as string;
        const result = await this.toolExecutor.writeFile(filePath, content);
        if (result.success) {
          this.trackArtifact(filePath, 'created');
        }
        return result;
      }

      case 'edit_file': {
        const filePath = args.path as string;
        const edits = args.edits as FileEdit[];
        const result = await this.toolExecutor.editFile(filePath, edits);
        if (result.success) {
          this.trackArtifact(filePath, 'modified');
        }
        return result;
      }

      case 'list_directory': {
        const dirPath = args.path as string;
        const result = await this.toolExecutor.listDirectory(dirPath);
        return result;
      }

      case 'run_command': {
        const command = args.command as string;
        const timeout = args.timeout as number | undefined;
        const result = await this.toolExecutor.runCommand(command, timeout);
        return result;
      }

      case 'git_commit': {
        const message = args.message as string;
        const files = args.files as string[] | undefined;
        const result = await this.toolExecutor.gitCommit(message, files);
        return result;
      }

      case 'git_status': {
        const result = await this.toolExecutor.gitStatus();
        return result;
      }

      case 'task_complete': {
        // タスク完了を記録
        this.taskCompleted = true;
        const summary = args.summary as string;
        const artifacts = args.artifacts as string[] | undefined;
        if (artifacts) {
          for (const artifact of artifacts) {
            this.trackArtifact(artifact, 'created');
          }
        }
        return { success: true, summary };
      }

      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }
  }

  // ===========================================================================
  // 会話履歴管理
  // ===========================================================================

  /**
   * 初期会話履歴を作成
   *
   * @param runId - 実行ID
   * @returns 初期会話履歴
   */
  private createInitialHistory(runId: RunId): ConversationHistory {
    return {
      runId,
      agentId: this.agentId,
      messages: [],
      toolCalls: [],
      totalTokens: 0,
    };
  }

  /**
   * メッセージを会話履歴に追加
   *
   * @param role - メッセージロール
   * @param content - メッセージ内容
   */
  private addMessage(role: ConversationMessage['role'], content: string): void {
    if (!this.conversationHistory) return;

    this.conversationHistory.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * ツール呼び出し記録を追加
   *
   * @param record - ツール呼び出し記録
   */
  private addToolCallRecord(record: ToolCallRecord): void {
    if (!this.conversationHistory) return;
    this.conversationHistory.toolCalls.push(record);
  }

  /**
   * 会話履歴を取得
   *
   * @returns 現在の会話履歴（存在しない場合はnull）
   */
  getConversationHistory(): ConversationHistory | null {
    return this.conversationHistory;
  }

  /**
   * 会話履歴を保存
   *
   * @param runId - 実行ID
   *
   * @see Requirement 11.6: THE conversation history SHALL be saved to `runtime/runs/<run-id>/conversation.json`
   */
  async saveConversationHistory(runId: RunId): Promise<void> {
    if (!this.conversationHistory) return;

    const runDir = path.join(RUNS_BASE_DIR, runId);
    await fs.mkdir(runDir, { recursive: true });

    const historyPath = path.join(runDir, 'conversation.json');
    const historyJson = JSON.stringify(this.conversationHistory, null, 2);
    await fs.writeFile(historyPath, historyJson, 'utf-8');
  }

  /**
   * 会話履歴を読み込み
   *
   * @param runId - 実行ID
   * @returns 会話履歴（存在しない場合はnull）
   *
   * @see Requirement 11.7: THE System SHALL support resuming from saved conversation state
   */
  async loadConversationHistory(runId: RunId): Promise<ConversationHistory | null> {
    const historyPath = path.join(RUNS_BASE_DIR, runId, 'conversation.json');

    try {
      const historyJson = await fs.readFile(historyPath, 'utf-8');
      return JSON.parse(historyJson) as ConversationHistory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // プロンプト構築
  // ===========================================================================

  /**
   * システムプロンプトを構築
   *
   * @param task - サブタスク
   * @param additionalPrompt - 追加のシステムプロンプト
   * @returns システムプロンプト
   */
  private buildSystemPrompt(task: SubTask, additionalPrompt?: string): string {
    let prompt = `あなたはWorker Agentです。与えられたタスクを実行してください。

## 利用可能なツール
- read_file: ファイルを読み取る
- write_file: ファイルを作成・上書きする
- edit_file: ファイルを編集する
- list_directory: ディレクトリ内容を一覧表示する
- run_command: シェルコマンドを実行する
- git_commit: 変更をコミットする
- git_status: Gitステータスを確認する
- task_complete: タスク完了を報告する

## 作業ルール
1. タスクの受け入れ基準を満たすまで作業を続けてください
2. ファイルを変更したら必ずgit_commitでコミットしてください
3. 作業が完了したらtask_completeツールを呼び出してください
4. エラーが発生した場合は、原因を分析して対処してください

## 完了報告
タスクが完了したら、必ず「TASK_COMPLETE」または「タスク完了」と明記してください。
`;

    if (additionalPrompt) {
      prompt += `\n## 追加指示\n${additionalPrompt}\n`;
    }

    return prompt;
  }

  /**
   * タスクプロンプトを構築
   *
   * @param task - サブタスク
   * @returns タスクプロンプト
   */
  private buildTaskPrompt(task: SubTask): string {
    let prompt = `## タスク: ${task.title}

### 説明
${task.description}

### 受け入れ基準
`;

    for (const criterion of task.acceptanceCriteria) {
      prompt += `- ${criterion}\n`;
    }

    prompt += `
上記のタスクを実行してください。
まず、現在のファイル構造を確認し、必要な変更を計画してから実装を開始してください。
`;

    return prompt;
  }

  // ===========================================================================
  // ユーティリティメソッド
  // ===========================================================================

  /**
   * 完了シグナルをチェック
   *
   * @param content - AIレスポンス内容
   * @returns 完了シグナルが含まれている場合はtrue
   *
   * @see Requirement 11.4: WHEN AI signals completion, THE System SHALL collect all artifacts
   */
  private checkCompletionSignal(content: string): boolean {
    const upperContent = content.toUpperCase();
    return COMPLETION_SIGNALS.some((signal) =>
      upperContent.includes(signal.toUpperCase())
    );
  }

  /**
   * 成果物を追跡
   *
   * @param filePath - ファイルパス
   * @param action - アクション種別
   */
  private trackArtifact(filePath: string, action: ArtifactInfo['action']): void {
    // 既存のエントリを更新または新規追加
    const existingIndex = this.collectedArtifacts.findIndex(
      (a) => a.path === filePath
    );

    if (existingIndex >= 0) {
      this.collectedArtifacts[existingIndex].action = action;
    } else {
      this.collectedArtifacts.push({ path: filePath, action });
    }
  }

  /**
   * ツール結果をフォーマット
   *
   * @param results - ツール呼び出し結果の配列
   * @returns フォーマットされたメッセージ
   */
  private formatToolResults(results: ToolCallResult[]): string {
    const parts: string[] = [];

    for (const result of results) {
      if (result.error) {
        parts.push(`ツール実行エラー (${result.toolCallId}): ${result.error}`);
      } else {
        parts.push(`ツール実行結果 (${result.toolCallId}): ${JSON.stringify(result.result)}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * エラー情報を作成
   *
   * @param error - エラーオブジェクト
   * @returns エラー情報
   */
  private createErrorInfo(error: unknown): ErrorInfo {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      code: 'EXECUTION_ERROR',
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
      recoverable: true,
    };
  }

  /**
   * 実行結果を構築
   *
   * @param runId - 実行ID
   * @param task - サブタスク
   * @param status - 実行ステータス
   * @param startTime - 開始時刻
   * @param endTime - 終了時刻
   * @param loopResult - 会話ループ結果
   * @param errors - エラー一覧
   * @returns 実行結果
   */
  private buildExecutionResult(
    runId: RunId,
    task: SubTask,
    status: ExecutionStatus,
    startTime: string,
    endTime: string,
    loopResult: ConversationLoopResult,
    errors: ErrorInfo[]
  ): ExecutionResult {
    // デフォルトの品質ゲート結果
    const qualityGates: QualityGateResult = {
      lint: { passed: false, output: '' },
      test: { passed: false, output: '' },
      overall: false,
    };

    return {
      runId,
      ticketId: task.parentId,
      agentId: this.agentId,
      status,
      startTime,
      endTime,
      artifacts: loopResult.artifacts,
      gitBranch: task.gitBranch ?? '',
      commits: [],
      qualityGates,
      errors: [...errors, ...loopResult.errors],
      conversationTurns: loopResult.iterations,
      tokensUsed: this.conversationHistory?.totalTokens ?? 0,
    };
  }

  // ===========================================================================
  // 一時停止・再開
  // ===========================================================================

  /**
   * タスク実行を一時停止
   */
  async pause(): Promise<void> {
    if (this.status === 'working') {
      this.setStatus('idle');
      // 会話履歴を保存
      if (this.currentRunId) {
        await this.saveConversationHistory(this.currentRunId);
      }
    }
  }

  /**
   * タスク実行を再開
   */
  async resume(): Promise<void> {
    if (this.status === 'idle' && this.conversationHistory) {
      this.setStatus('working');
    }
  }
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 会話履歴を保存（スタンドアロン関数）
 *
 * @param runId - 実行ID
 * @param history - 会話履歴
 *
 * @see Requirement 11.6: THE conversation history SHALL be saved to `runtime/runs/<run-id>/conversation.json`
 */
export async function saveConversationHistory(
  runId: RunId,
  history: ConversationHistory
): Promise<void> {
  const runDir = path.join(RUNS_BASE_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  const historyPath = path.join(runDir, 'conversation.json');
  const historyJson = JSON.stringify(history, null, 2);
  await fs.writeFile(historyPath, historyJson, 'utf-8');
}

/**
 * 会話履歴を読み込み（スタンドアロン関数）
 *
 * @param runId - 実行ID
 * @returns 会話履歴（存在しない場合はnull）
 */
export async function loadConversationHistory(
  runId: RunId
): Promise<ConversationHistory | null> {
  const historyPath = path.join(RUNS_BASE_DIR, runId, 'conversation.json');

  try {
    const historyJson = await fs.readFile(historyPath, 'utf-8');
    return JSON.parse(historyJson) as ConversationHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Worker Agentを作成
 *
 * @param config - Worker Agent設定
 * @returns Worker Agentインスタンス
 */
export function createWorkerAgent(config: WorkerAgentConfig): WorkerAgent {
  return new WorkerAgent(config);
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

export default WorkerAgent;
