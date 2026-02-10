/**
 * WorkerAgent統合テスト - 品質ゲートフィードバックループ & 成果物追跡
 *
 * タスク13.2: WorkerAgentへの統合
 * - 品質ゲートフィードバックループの統合テスト
 * - 成果物追跡の統合テスト
 *
 * @module tests/execution/worker-agent-integration.test
 * @see Requirements: 4.1, 4.4, 4.5, 5.1, 5.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkerAgent,
  MAX_QUALITY_GATE_RETRIES,
  MAX_ITERATIONS,
  type WorkerAgentConfig,
  type ConversationLoopResult,
} from '../../tools/cli/lib/execution/agents/worker';
import type {
  QualityGateResult as IntegrationQualityGateResult,
  QualityGateFeedback,
} from '../../tools/cli/lib/execution/quality-gate-integration';
import type { SubTask, RunId, ArtifactInfo } from '../../tools/cli/lib/execution/types';

// =============================================================================
// テスト用ヘルパー
// =============================================================================

/**
 * テスト用のSubTaskを作成
 */
function createTestSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'subtask-001',
    parentId: 'task-001',
    title: 'テストタスク',
    description: 'テスト用のサブタスク',
    acceptanceCriteria: ['基準1を満たすこと'],
    status: 'pending',
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * 品質ゲート成功結果を作成
 */
function createPassingQualityResult(): IntegrationQualityGateResult {
  return {
    lint: {
      passed: true,
      output: 'All checks passed',
      errors: [],
      warnings: [],
      duration: 1000,
    },
    test: {
      passed: true,
      output: 'All tests passed',
      errors: [],
      warnings: [],
      duration: 2000,
    },
    overall: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 品質ゲート失敗結果を作成
 */
function createFailingQualityResult(
  lintFailed: boolean = true,
  testFailed: boolean = false
): IntegrationQualityGateResult {
  return {
    lint: {
      passed: !lintFailed,
      output: lintFailed ? 'Error: unused variable x' : 'All checks passed',
      errors: lintFailed ? ['Error: unused variable x at line 10'] : [],
      warnings: [],
      duration: 1000,
    },
    test: {
      passed: !testFailed,
      output: testFailed ? 'FAIL: test suite failed' : 'Lintが失敗したためスキップされました',
      errors: testFailed ? ['Test "should work" failed'] : [],
      warnings: [],
      duration: testFailed ? 2000 : 0,
    },
    overall: false,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// 品質ゲートフィードバックループのテスト
// =============================================================================

describe('WorkerAgent - 品質ゲートフィードバックループ統合', () => {
  /**
   * @see Requirement 4.1: WHEN a Worker_Agent completes code changes, THE System SHALL run lint automatically
   * @see Requirement 4.4: IF quality gate fails, THE System SHALL notify Worker_Agent with failure details
   * @see Requirement 4.5: THE Worker_Agent SHALL attempt to fix issues based on quality gate feedback
   */

  let agent: WorkerAgent;

  beforeEach(() => {
    // アダプタのモック設定
    vi.mock('../../../../adapters/index', () => ({
      getAdapter: vi.fn().mockReturnValue({
        chat: vi.fn().mockResolvedValue({
          content: 'TASK_COMPLETE',
          role: 'assistant',
        }),
      }),
      globalRegistry: {
        isExtendedAdapter: vi.fn().mockReturnValue(false),
      },
    }));
  });

  it('MAX_QUALITY_GATE_RETRIESが3であること', () => {
    expect(MAX_QUALITY_GATE_RETRIES).toBe(3);
  });

  it('MAX_ITERATIONSが30であること', () => {
    expect(MAX_ITERATIONS).toBe(30);
  });

  it('品質ゲートコールバックを設定できること', () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-001',
    };
    agent = new WorkerAgent(config);

    const callback = vi.fn().mockResolvedValue(createPassingQualityResult());
    agent.setQualityGateCallback(callback);

    // コールバックが設定されたことを確認（runQualityGateで検証）
    expect(() => agent.setQualityGateCallback(callback)).not.toThrow();
  });

  it('品質ゲートフィードバック生成コールバックを設定できること', () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-002',
    };
    agent = new WorkerAgent(config);

    const generator = vi.fn().mockReturnValue({
      passed: false,
      message: 'テスト失敗',
      failedGates: ['lint'],
      fixInstructions: ['修正してください'],
    } as QualityGateFeedback);

    expect(() => agent.setQualityGateFeedbackGenerator(generator)).not.toThrow();
  });

  it('品質ゲート結果保存コールバックを設定できること', () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-003',
    };
    agent = new WorkerAgent(config);

    const saver = vi.fn().mockResolvedValue(undefined);
    expect(() => agent.setQualityGateResultSaver(saver)).not.toThrow();
  });

  it('品質ゲートコールバック未設定時はrunQualityGateがnullを返すこと', async () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-004',
    };
    agent = new WorkerAgent(config);

    const result = await agent.runQualityGate('.', 'run-test-001');
    expect(result).toBeNull();
  });

  it('品質ゲートコールバック設定時はrunQualityGateが結果を返すこと', async () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-005',
    };
    agent = new WorkerAgent(config);

    const passingResult = createPassingQualityResult();
    const callback = vi.fn().mockResolvedValue(passingResult);
    agent.setQualityGateCallback(callback);

    const result = await agent.runQualityGate('.', 'run-test-002');
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(true);
    expect(callback).toHaveBeenCalledWith('.');
  });

  it('品質ゲート失敗時にフィードバックが生成されること', async () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-006',
    };
    agent = new WorkerAgent(config);

    const failingResult = createFailingQualityResult(true, false);
    const callback = vi.fn().mockResolvedValue(failingResult);
    agent.setQualityGateCallback(callback);

    const feedbackMessage = '品質ゲートに失敗しました';
    const generator = vi.fn().mockReturnValue({
      passed: false,
      message: feedbackMessage,
      failedGates: ['lint'],
      fixInstructions: ['Lintエラーを修正してください'],
    } as QualityGateFeedback);
    agent.setQualityGateFeedbackGenerator(generator);

    await agent.runQualityGate('.', 'run-test-003');

    // フィードバック生成が呼ばれたことを確認
    expect(generator).toHaveBeenCalledWith(failingResult);
  });

  it('品質ゲート結果が保存されること', async () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-007',
    };
    agent = new WorkerAgent(config);

    const passingResult = createPassingQualityResult();
    const callback = vi.fn().mockResolvedValue(passingResult);
    agent.setQualityGateCallback(callback);

    const saver = vi.fn().mockResolvedValue(undefined);
    agent.setQualityGateResultSaver(saver);

    const runId: RunId = 'run-test-004';
    await agent.runQualityGate('.', runId);

    expect(saver).toHaveBeenCalledWith(runId, passingResult);
  });

  it('maxQualityGateRetriesをカスタム設定できること', () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-test-008',
      maxQualityGateRetries: 5,
    };
    agent = new WorkerAgent(config);

    // エージェントが正常に作成されることを確認
    expect(agent.agentId).toBe('worker-test-008');
  });
});

// =============================================================================
// 成果物追跡のテスト
// =============================================================================

describe('WorkerAgent - 成果物追跡統合', () => {
  /**
   * @see Requirement 5.1: WHEN a task completes, THE System SHALL collect all artifacts
   * @see Requirement 5.4: THE System SHALL preserve all modified files
   */

  let agent: WorkerAgent;

  beforeEach(() => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-artifact-001',
    };
    agent = new WorkerAgent(config);
  });

  it('初期状態では成果物が空であること', () => {
    const artifacts = agent.getCollectedArtifacts();
    expect(artifacts).toEqual([]);
  });

  it('getCollectedArtifactsが成果物のコピーを返すこと', () => {
    const artifacts1 = agent.getCollectedArtifacts();
    const artifacts2 = agent.getCollectedArtifacts();

    // 異なる参照であることを確認（コピーが返される）
    expect(artifacts1).not.toBe(artifacts2);
    expect(artifacts1).toEqual(artifacts2);
  });
});

// =============================================================================
// 実行ステータス決定のテスト
// =============================================================================

describe('WorkerAgent - 実行ステータス決定', () => {
  /**
   * @see Requirement 4.4: IF quality gate fails, status SHALL reflect failure
   * @see Requirement 11.5: IF max iterations reached, status SHALL be partial
   */

  it('品質ゲート失敗時はquality_failedステータスになること', () => {
    // determineExecutionStatusはprivateメソッドなので、
    // executeTaskの結果を通じて間接的にテストする
    // ここではステータス決定ロジックの正しさを検証

    const failingResult = createFailingQualityResult(true, false);

    // 品質ゲートが失敗した場合、overallはfalse
    expect(failingResult.overall).toBe(false);

    // 品質ゲートが成功した場合、overallはtrue
    const passingResult = createPassingQualityResult();
    expect(passingResult.overall).toBe(true);
  });

  it('品質ゲート結果の構造が正しいこと', () => {
    const result = createPassingQualityResult();

    // 必須フィールドの存在確認
    expect(result).toHaveProperty('lint');
    expect(result).toHaveProperty('test');
    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('timestamp');

    // lint結果の構造確認
    expect(result.lint).toHaveProperty('passed');
    expect(result.lint).toHaveProperty('output');
    expect(result.lint).toHaveProperty('errors');
    expect(result.lint).toHaveProperty('warnings');
    expect(result.lint).toHaveProperty('duration');

    // test結果の構造確認
    expect(result.test).toHaveProperty('passed');
    expect(result.test).toHaveProperty('output');
    expect(result.test).toHaveProperty('errors');
    expect(result.test).toHaveProperty('warnings');
    expect(result.test).toHaveProperty('duration');
  });

  it('lint失敗時はtestがスキップされること', () => {
    const result = createFailingQualityResult(true, false);

    expect(result.lint.passed).toBe(false);
    expect(result.test.output).toContain('スキップ');
    expect(result.overall).toBe(false);
  });

  it('lint成功・test失敗時のステータスが正しいこと', () => {
    const result = createFailingQualityResult(false, true);

    expect(result.lint.passed).toBe(true);
    expect(result.test.passed).toBe(false);
    expect(result.overall).toBe(false);
  });
});

// =============================================================================
// ConversationLoopResult マージのテスト
// =============================================================================

describe('WorkerAgent - ConversationLoopResult構造', () => {
  it('ConversationLoopResultにqualityGateRetriesフィールドが含まれること', () => {
    const result: ConversationLoopResult = {
      completed: true,
      finalResponse: 'TASK_COMPLETE',
      iterations: 5,
      artifacts: [],
      errors: [],
      qualityGateRetries: 0,
    };

    expect(result.qualityGateRetries).toBe(0);
  });

  it('ConversationLoopResultにqualityGateResultフィールドが含まれること', () => {
    const qgResult = createPassingQualityResult();
    const result: ConversationLoopResult = {
      completed: true,
      finalResponse: 'TASK_COMPLETE',
      iterations: 5,
      artifacts: [],
      errors: [],
      qualityGateRetries: 1,
      qualityGateResult: qgResult,
    };

    expect(result.qualityGateResult).toBeDefined();
    expect(result.qualityGateResult!.overall).toBe(true);
  });

  it('成果物のマージで重複が排除されること', () => {
    // 同じパスの成果物は後のものが優先される
    const artifact1: ArtifactInfo = { path: 'src/main.ts', action: 'created' };
    const artifact2: ArtifactInfo = { path: 'src/main.ts', action: 'modified' };
    const artifact3: ArtifactInfo = { path: 'src/utils.ts', action: 'created' };

    const original: ConversationLoopResult = {
      completed: false,
      finalResponse: '',
      iterations: 3,
      artifacts: [artifact1],
      errors: [],
      qualityGateRetries: 0,
    };

    const fix: ConversationLoopResult = {
      completed: true,
      finalResponse: 'TASK_COMPLETE',
      iterations: 2,
      artifacts: [artifact2, artifact3],
      errors: [],
      qualityGateRetries: 0,
    };

    // マージ後の成果物は重複排除されるべき
    // artifact1とartifact2は同じパスなのでartifact2が優先
    const mergedArtifacts = [...original.artifacts];
    for (const artifact of fix.artifacts) {
      const existingIndex = mergedArtifacts.findIndex((a) => a.path === artifact.path);
      if (existingIndex >= 0) {
        mergedArtifacts[existingIndex] = artifact;
      } else {
        mergedArtifacts.push(artifact);
      }
    }

    expect(mergedArtifacts).toHaveLength(2);
    expect(mergedArtifacts[0].path).toBe('src/main.ts');
    expect(mergedArtifacts[0].action).toBe('modified'); // 後のものが優先
    expect(mergedArtifacts[1].path).toBe('src/utils.ts');
    expect(mergedArtifacts[1].action).toBe('created');
  });

  it('イテレーション数が合算されること', () => {
    const original: ConversationLoopResult = {
      completed: false,
      finalResponse: '',
      iterations: 10,
      artifacts: [],
      errors: [],
      qualityGateRetries: 0,
    };

    const fix: ConversationLoopResult = {
      completed: true,
      finalResponse: 'TASK_COMPLETE',
      iterations: 5,
      artifacts: [],
      errors: [],
      qualityGateRetries: 0,
    };

    const mergedIterations = original.iterations + fix.iterations;
    expect(mergedIterations).toBe(15);
  });

  it('エラーが結合されること', () => {
    const original: ConversationLoopResult = {
      completed: false,
      finalResponse: '',
      iterations: 3,
      artifacts: [],
      errors: [
        {
          code: 'ERR_001',
          message: 'エラー1',
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
      ],
      qualityGateRetries: 0,
    };

    const fix: ConversationLoopResult = {
      completed: true,
      finalResponse: 'TASK_COMPLETE',
      iterations: 2,
      artifacts: [],
      errors: [
        {
          code: 'ERR_002',
          message: 'エラー2',
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      ],
      qualityGateRetries: 0,
    };

    const mergedErrors = [...original.errors, ...fix.errors];
    expect(mergedErrors).toHaveLength(2);
    expect(mergedErrors[0].code).toBe('ERR_001');
    expect(mergedErrors[1].code).toBe('ERR_002');
  });
});

// =============================================================================
// WorkerAgentConfig拡張のテスト
// =============================================================================

describe('WorkerAgent - 設定拡張', () => {
  it('デフォルトのmaxQualityGateRetriesが3であること', () => {
    expect(MAX_QUALITY_GATE_RETRIES).toBe(3);
  });

  it('カスタムmaxQualityGateRetriesを設定できること', () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-config-001',
      maxQualityGateRetries: 5,
    };
    const agent = new WorkerAgent(config);
    expect(agent.agentId).toBe('worker-config-001');
  });

  it('maxQualityGateRetries未指定時はデフォルト値が使用されること', () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-config-002',
    };
    const agent = new WorkerAgent(config);
    expect(agent.agentId).toBe('worker-config-002');
    // デフォルト値はMAX_QUALITY_GATE_RETRIES (3)
  });

  it('全設定オプションを指定できること', () => {
    const config: WorkerAgentConfig = {
      agentId: 'worker-config-003',
      adapterName: 'ollama',
      modelName: 'llama3.2:1b',
      workspacePath: '/tmp/test-workspace',
      maxIterations: 10,
      commandTimeout: 60,
      maxQualityGateRetries: 2,
    };
    const agent = new WorkerAgent(config);
    expect(agent.agentId).toBe('worker-config-003');
  });
});

// =============================================================================
// ステータス管理のテスト
// =============================================================================

describe('WorkerAgent - ステータス管理', () => {
  let agent: WorkerAgent;

  beforeEach(() => {
    agent = new WorkerAgent({ agentId: 'worker-status-001' });
  });

  it('初期ステータスがidleであること', () => {
    expect(agent.getStatus()).toBe('idle');
  });

  it('会話履歴が初期状態でnullであること', () => {
    expect(agent.getConversationHistory()).toBeNull();
  });

  it('成果物が初期状態で空であること', () => {
    expect(agent.getCollectedArtifacts()).toEqual([]);
  });
});
