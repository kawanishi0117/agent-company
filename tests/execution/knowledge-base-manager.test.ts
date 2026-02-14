/**
 * KnowledgeBaseManager ユニットテスト
 *
 * @module tests/execution/knowledge-base-manager
 * @see Requirements: 7.1, 7.2, 7.5, 7.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  KnowledgeBaseManager,
  type KnowledgeEntry,
} from '../../tools/cli/lib/execution/knowledge-base-manager.js';
import type { RetrospectiveResult } from '../../tools/cli/lib/execution/retrospective-engine.js';

// =============================================================================
// テストヘルパー
// =============================================================================

let testDir: string;

beforeEach(async () => {
  testDir = path.join(os.tmpdir(), `kb-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

/** テスト用レトロスペクティブ結果 */
function createMockRetroResult(
  overrides?: Partial<RetrospectiveResult>
): RetrospectiveResult {
  return {
    workflowId: 'wf-test',
    meetingMinutes: {
      meetingId: 'meeting-1',
      workflowId: 'wf-test',
      facilitator: 'quality_authority',
      participants: [],
      agenda: [],
      summary: 'テスト会議',
      actionItems: [],
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    },
    goodPoints: ['コードレビューが効果的だった'],
    improvementPoints: ['テストカバレッジが不足'],
    actionItems: [],
    proposedRules: [],
    conductedAt: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// テスト
// =============================================================================

describe('KnowledgeBaseManager', () => {
  it('エントリを追加して取得できる', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    const entry = await manager.addEntry({
      title: 'テストエントリ',
      category: 'best_practice',
      content: 'テスト内容',
      tags: ['test'],
      relatedWorkflows: ['wf-001'],
      authorAgentId: 'coo_pm',
    });

    expect(entry.id).toBeDefined();
    expect(entry.title).toBe('テストエントリ');
    expect(entry.createdAt).toBeDefined();

    // IDで取得
    const loaded = await manager.getEntry(entry.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('テストエントリ');
  });

  it('キーワード検索ができる', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    await manager.addEntry({
      title: 'TypeScript型安全性',
      category: 'technical_note',
      content: 'TypeScriptの型システムを活用する',
      tags: ['typescript', 'type-safety'],
      relatedWorkflows: [],
      authorAgentId: 'worker_1',
    });

    await manager.addEntry({
      title: 'Pythonテスト手法',
      category: 'best_practice',
      content: 'pytestを使ったテスト',
      tags: ['python', 'testing'],
      relatedWorkflows: [],
      authorAgentId: 'worker_2',
    });

    // TypeScriptで検索
    const results = await manager.search('TypeScript');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('TypeScript型安全性');

    // タグで検索
    const tagResults = await manager.search('testing');
    expect(tagResults).toHaveLength(1);
  });

  it('カテゴリフィルタで検索できる', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    await manager.addEntry({
      title: 'ベストプラクティス1',
      category: 'best_practice',
      content: '内容1',
      tags: [],
      relatedWorkflows: [],
      authorAgentId: 'coo_pm',
    });

    await manager.addEntry({
      title: '失敗事例1',
      category: 'failure_case',
      content: '内容2',
      tags: [],
      relatedWorkflows: [],
      authorAgentId: 'coo_pm',
    });

    const results = await manager.search('', {
      category: 'best_practice',
    });
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('best_practice');
  });

  it('タグフィルタで検索できる', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    await manager.addEntry({
      title: 'エントリA',
      category: 'technical_note',
      content: '内容A',
      tags: ['docker', 'infra'],
      relatedWorkflows: [],
      authorAgentId: 'worker_1',
    });

    await manager.addEntry({
      title: 'エントリB',
      category: 'technical_note',
      content: '内容B',
      tags: ['frontend', 'react'],
      relatedWorkflows: [],
      authorAgentId: 'worker_2',
    });

    const results = await manager.search('', { tags: ['docker'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('エントリA');
  });

  it('全エントリを一覧取得できる（新しい順）', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    await manager.addEntry({
      title: '古いエントリ',
      category: 'best_practice',
      content: '内容',
      tags: [],
      relatedWorkflows: [],
      authorAgentId: 'coo_pm',
    });

    // 少し待ってから2つ目を追加
    await new Promise((r) => setTimeout(r, 10));

    await manager.addEntry({
      title: '新しいエントリ',
      category: 'best_practice',
      content: '内容',
      tags: [],
      relatedWorkflows: [],
      authorAgentId: 'coo_pm',
    });

    const entries = await manager.listEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe('新しいエントリ');
  });

  it('レトロスペクティブ結果からエントリを自動生成できる', async () => {
    const manager = new KnowledgeBaseManager(testDir);
    const retroResult = createMockRetroResult();

    const entries = await manager.autoGenerateFromRetrospective(retroResult);

    // goodPoints + improvementPoints からエントリが生成される
    expect(entries.length).toBeGreaterThan(0);
    const categories = entries.map((e) => e.category);
    expect(categories).toContain('best_practice');
    expect(categories).toContain('failure_case');
  });

  it('エスカレーション解決からエントリを自動生成できる', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    const entry = await manager.autoGenerateFromEscalation({
      pattern: 'ビルドが頻繁に失敗する',
      resolution: 'CI設定を修正し、キャッシュを有効化した',
      agentId: 'worker_1',
      workflowId: 'wf-esc-001',
    });

    expect(entry).not.toBeNull();
    expect(entry!.category).toBe('process_improvement');
    expect(entry!.tags).toContain('escalation');
  });

  it('解決策がない場合はエスカレーションからエントリを生成しない', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    const entry = await manager.autoGenerateFromEscalation({
      pattern: '問題',
      resolution: '',
      agentId: 'worker_1',
    });

    expect(entry).toBeNull();
  });

  it('ワークフロー指示に関連するエントリを検索できる', async () => {
    const manager = new KnowledgeBaseManager(testDir);

    await manager.addEntry({
      title: 'Docker設定のベストプラクティス',
      category: 'best_practice',
      content: 'Dockerfileの最適化手法',
      tags: ['docker'],
      relatedWorkflows: [],
      authorAgentId: 'worker_1',
    });

    await manager.addEntry({
      title: 'React コンポーネント設計',
      category: 'technical_note',
      content: 'Reactコンポーネントの設計パターン',
      tags: ['react', 'frontend'],
      relatedWorkflows: [],
      authorAgentId: 'worker_2',
    });

    const results = await manager.getRelevantForWorkflow(
      'Docker環境の構築と最適化'
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title.includes('Docker'))).toBe(true);
  });

  it('存在しないエントリIDでnullを返す', async () => {
    const manager = new KnowledgeBaseManager(testDir);
    const result = await manager.getEntry('nonexistent');
    expect(result).toBeNull();
  });
});
