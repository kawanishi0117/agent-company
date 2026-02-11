/**
 * Orchestrator Fix プロパティテスト
 *
 * Property 22: Orchestrator Awaits All Workers Before Finalization
 * - 任意のN個のサブタスクに対して、finalizeTaskExecution は全N個のワーカー
 *   ExecutionResult promise が resolve した後にのみ呼ばれることを検証
 *
 * Property 23: Worker Results Collected in ExecutionState
 * - 任意の完了したワーカー実行に対して、ExecutionState にワーカーの artifacts と
 *   conversation history が含まれることを検証
 * - 失敗したワーカーについても、失敗が ExecutionState に記録されることを検証
 *
 * @module tests/execution/orchestrator-fix.property.test
 * @see Requirements: 9.3, 9.4 (ワーカー管理)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Orchestrator,
  createOrchestrator,
} from '../../tools/cli/lib/execution/orchestrator';
import { StateManager } from '../../tools/cli/lib/execution/state-manager';
import { createAgentBus } from '../../tools/cli/lib/execution/agent-bus';
import { createWorkerPool } from '../../tools/cli/lib/execution/worker-pool';
import {
  ExecutionResult,
  ExecutionState,
  SubTask,
  ArtifactInfo,
} from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用定数
// =============================================================================

/** テスト用一時ディレクトリのベースパス */
const TEST_BASE_DIR = 'runtime/test-orchestrator-fix';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * テスト用の一時ディレクトリを作成
 * @returns 一時ディレクトリパス
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(TEST_BASE_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * テスト用の一時ディレクトリを削除
 * @param tempDir - 削除対象ディレクトリパス
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 削除に失敗しても無視
  }
}

/**
 * テスト用のサブタスクを生成
 * @param index - サブタスクのインデックス
 * @returns サブタスク
 */
function createMockSubTask(index: number): SubTask {
  return {
    id: `subtask-${index}`,
    parentTaskId: 'task-001',
    title: `サブタスク ${index}`,
    description: `テスト用サブタスク ${index}`,
    status: 'pending',
    assignedTo: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * テスト用のExecutionResultを生成
 * @param runId - 実行ID
 * @param agentId - エージェントID
 * @param status - 実行ステータス
 * @param artifactPaths - 成果物パス一覧
 * @param conversationTurns - 会話ターン数
 * @returns ExecutionResult
 */
function createMockExecutionResult(
  runId: string,
  agentId: string,
  status: 'success' | 'error' | 'quality_failed',
  artifactPaths: string[],
  conversationTurns: number
): ExecutionResult {
  const artifacts: ArtifactInfo[] = artifactPaths.map((p) => ({
    path: p,
    action: 'created' as const,
  }));

  return {
    runId,
    ticketId: 'task-001',
    agentId,
    status,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    artifacts,
    gitBranch: `feature/task-${agentId}`,
    commits: [],
    qualityGates: {
      lint: { passed: status === 'success', output: '' },
      test: { passed: status === 'success', output: '' },
      overall: status === 'success',
    },
    errors: [],
    conversationTurns,
    tokensUsed: 100,
  };
}

// =============================================================================
// テストスイート
// =============================================================================

describe('Orchestrator Fix Property Tests', () => {
  let tempDir: string;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    tempDir = await createTempDir();

    const stateManager = new StateManager(tempDir);
    const agentBus = createAgentBus({
      messageQueueConfig: {
        type: 'file',
        basePath: path.join(tempDir, 'bus'),
      },
      runtimeBasePath: path.join(tempDir, 'runs'),
    });
    const workerPool = createWorkerPool({
      maxWorkers: 5,
      useContainers: false,
    });

    orchestrator = createOrchestrator({
      stateManager,
      agentBus,
      workerPool,
    });
  });

  afterEach(async () => {
    if (orchestrator && orchestrator.isInitialized()) {
      try {
        await orchestrator.emergencyStop();
      } catch {
        // エラーを無視
      }
    }
    await cleanupTempDir(tempDir);
  });

  // ===========================================================================
  // Property 22: Orchestrator Awaits All Workers Before Finalization
  // ===========================================================================

  it('Property 22: Orchestrator Awaits All Workers Before Finalization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (numSubTasks) => {
          // --- セットアップ ---
          // サブタスクを生成
          const subTasks = Array.from({ length: numSubTasks }, (_, i) =>
            createMockSubTask(i)
          );

          // 各ワーカーの完了を追跡するフラグ
          const workerCompleted: boolean[] = new Array(numSubTasks).fill(false);
          let finalizeCalledBeforeAllComplete = false;

          // ワーカーの実行結果Promise（遅延解決）
          const resolvers: Array<(result: ExecutionResult) => void> = [];
          const workerPromises: Promise<ExecutionResult>[] = [];

          for (let i = 0; i < numSubTasks; i++) {
            const promise = new Promise<ExecutionResult>((resolve) => {
              resolvers.push(resolve);
            });
            workerPromises.push(promise);
          }

          // Orchestratorの内部メソッドをモック
          const workerPool = orchestrator.getWorkerPool();
          let workerIndex = 0;

          // getAvailableWorker をモック: 各呼び出しでモックワーカーを返す
          const getAvailableWorkerSpy = vi.spyOn(workerPool, 'getAvailableWorker');
          getAvailableWorkerSpy.mockImplementation(async () => {
            const idx = workerIndex++;
            if (idx >= numSubTasks) return null;

            const agentId = `worker-${idx}`;
            return {
              agentId,
              executeTask: async () => {
                // ワーカーの実行をシミュレート
                const result = await workerPromises[idx];
                workerCompleted[idx] = true;
                return result;
              },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any;
          });

          // ManagerAgent のモック
          const managerAgent = orchestrator.getManagerAgent();
          vi.spyOn(managerAgent, 'receiveTask').mockResolvedValue();
          vi.spyOn(managerAgent, 'decomposeTask').mockResolvedValue(subTasks);
          vi.spyOn(managerAgent, 'assignTask').mockResolvedValue();
          vi.spyOn(managerAgent, 'startProgressMonitoring').mockReturnValue();

          // finalizeTaskExecution をスパイ
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const finalizeSpy = vi.spyOn(orchestrator as any, 'finalizeTaskExecution');
          finalizeSpy.mockImplementation(async () => {
            // finalize呼び出し時に全ワーカーが完了しているか確認
            const allComplete = workerCompleted.every((c) => c);
            if (!allComplete) {
              finalizeCalledBeforeAllComplete = true;
            }
          });

          // --- 実行 ---
          await orchestrator.initialize();

          // submitTaskを呼び出し（非同期で処理開始）
          const taskId = await orchestrator.submitTask(
            'テストタスク',
            'test-project',
            { autoDecompose: true }
          );

          // 少し待ってからワーカーを順次完了させる
          await new Promise((resolve) => setTimeout(resolve, 50));

          // ワーカーを順次完了させる（逆順で解決して非同期性をテスト）
          for (let i = numSubTasks - 1; i >= 0; i--) {
            resolvers[i](
              createMockExecutionResult(
                'run-test',
                `worker-${i}`,
                'success',
                [`artifact-${i}.ts`],
                3
              )
            );
            // 各解決の間に少し待つ
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          // 処理完了を待つ
          await new Promise((resolve) => setTimeout(resolve, 200));

          // --- 検証 ---
          // finalizeTaskExecution が全ワーカー完了後にのみ呼ばれたことを確認
          expect(finalizeCalledBeforeAllComplete).toBe(false);

          // finalizeTaskExecution が呼ばれたことを確認
          expect(finalizeSpy).toHaveBeenCalled();

          // クリーンアップ
          getAvailableWorkerSpy.mockRestore();
          finalizeSpy.mockRestore();
        }
      ),
      { numRuns: 10 }
    );
  });

  // ===========================================================================
  // Property 23: Worker Results Collected in ExecutionState
  // ===========================================================================

  it('Property 23: Worker Results Collected in ExecutionState', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.boolean(),
        async (numSubTasks, hasFailure) => {
          // --- セットアップ ---
          const subTasks = Array.from({ length: numSubTasks }, (_, i) =>
            createMockSubTask(i)
          );

          // ワーカーの実行結果を事前に定義
          const expectedResults: ExecutionResult[] = subTasks.map((_, i) => {
            // hasFailure が true の場合、最後のワーカーを失敗させる
            const isFailed = hasFailure && i === numSubTasks - 1;
            const status = isFailed ? 'error' : 'success';
            const artifactPaths = isFailed
              ? []
              : [`src/output-${i}.ts`, `test/output-${i}.test.ts`];
            const turns = isFailed ? 0 : i + 1;

            return createMockExecutionResult(
              'run-test',
              `worker-${i}`,
              status as 'success' | 'error',
              artifactPaths,
              turns
            );
          });

          // WorkerPool のモック
          const workerPool = orchestrator.getWorkerPool();
          let workerIndex = 0;

          const getAvailableWorkerSpy = vi.spyOn(workerPool, 'getAvailableWorker');
          getAvailableWorkerSpy.mockImplementation(async () => {
            const idx = workerIndex++;
            if (idx >= numSubTasks) return null;

            return {
              agentId: `worker-${idx}`,
              executeTask: async () => expectedResults[idx],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any;
          });

          // ManagerAgent のモック
          const managerAgent = orchestrator.getManagerAgent();
          vi.spyOn(managerAgent, 'receiveTask').mockResolvedValue();
          vi.spyOn(managerAgent, 'decomposeTask').mockResolvedValue(subTasks);
          vi.spyOn(managerAgent, 'assignTask').mockResolvedValue();
          vi.spyOn(managerAgent, 'startProgressMonitoring').mockReturnValue();

          // finalizeTaskExecution をスパイして ExecutionState をキャプチャ
          let capturedState: ExecutionState | undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const finalizeSpy = vi.spyOn(orchestrator as any, 'finalizeTaskExecution');
          finalizeSpy.mockImplementation(
            async (
              _task: unknown,
              _runId: unknown,
              executionState: ExecutionState
            ) => {
              capturedState = { ...executionState };
            }
          );

          // --- 実行 ---
          await orchestrator.initialize();

          await orchestrator.submitTask(
            'テストタスク',
            'test-project',
            { autoDecompose: true }
          );

          // 処理完了を待つ
          await new Promise((resolve) => setTimeout(resolve, 300));

          // --- 検証 ---
          expect(capturedState).toBeDefined();

          if (capturedState) {
            // 成果物が正しく収集されていることを確認
            const expectedArtifactPaths: string[] = [];
            for (const result of expectedResults) {
              for (const artifact of result.artifacts) {
                if (typeof artifact === 'string') {
                  expectedArtifactPaths.push(artifact);
                } else {
                  expectedArtifactPaths.push(artifact.path);
                }
              }
            }
            expect(capturedState.artifacts).toEqual(expectedArtifactPaths);

            // 会話履歴が記録されていることを確認
            for (const result of expectedResults) {
              if (result.conversationTurns > 0) {
                expect(capturedState.conversationHistories).toHaveProperty(
                  result.agentId
                );
              }
            }

            // 失敗したワーカーがある場合、ExecutionState が failed になっていることを確認
            if (hasFailure) {
              expect(capturedState.status).toBe('failed');
            }
          }

          // クリーンアップ
          getAvailableWorkerSpy.mockRestore();
          finalizeSpy.mockRestore();
        }
      ),
      { numRuns: 10 }
    );
  });
});
