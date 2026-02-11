/**
 * WorkspaceManager プロパティテスト
 *
 * Property 4: Workspace Isolation
 * Property 5: Git Branch Naming Convention
 *
 * @module tests/execution/workspace-manager.property
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  WorkspaceManager,
} from '../../tools/cli/lib/execution/workspace-manager.js';
import * as childProcess from 'node:child_process';

// spawn をモック化
vi.mock('node:child_process');
vi.mock('node:fs/promises');

// =============================================================================
// spawn モックヘルパー
// =============================================================================

function mockSpawnSuccess(): void {
  const mockChild = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (code: number | null) => void) => {
      if (event === 'close') cb(0);
    }),
  };
  vi.mocked(childProcess.spawn).mockReturnValue(mockChild as never);
}

// =============================================================================
// Property 4: Workspace Isolation
// 異なるプロジェクトIDのワークスペースパスは重複しない
// =============================================================================

describe('Property 4: Workspace Isolation', () => {
  it('異なるプロジェクトIDに対して異なるパスが生成されること', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/[\\/]/g, '-')),
        fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/[\\/]/g, '-')),
        (projectId1, projectId2) => {
          // 同じIDの場合はスキップ
          if (projectId1 === projectId2) return;

          const manager = new WorkspaceManager('runtime/workspaces');

          const path1 = manager.getProjectDir(projectId1);
          const path2 = manager.getProjectDir(projectId2);

          // 異なるプロジェクトIDは異なるパスを生成する
          expect(path1).not.toBe(path2);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('同じプロジェクトIDに対して同じパスが生成されること', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (projectId) => {
          const manager = new WorkspaceManager('runtime/workspaces');

          const path1 = manager.getProjectDir(projectId);
          const path2 = manager.getProjectDir(projectId);

          // 同じプロジェクトIDは同じパスを生成する（冪等性）
          expect(path1).toBe(path2);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// =============================================================================
// Property 5: Git Branch Naming Convention
// ブランチ名は agent/<ticket-id>-<description> 形式に従う
// =============================================================================

describe('Property 5: Git Branch Naming Convention', () => {
  it('ブランチ名が agent/ プレフィックスで始まること', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/[^a-z0-9]/gi, 'x')),
        fc.string({ minLength: 1, maxLength: 30 }),
        async (ticketId, description) => {
          mockSpawnSuccess();

          const manager = new WorkspaceManager('test');
          const branchName = await manager.createTaskBranch(
            '/workspace',
            ticketId,
            description
          );

          // agent/ プレフィックスで始まる
          expect(branchName.startsWith('agent/')).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('ブランチ名にチケットIDが含まれること', () => {
    fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (ticketId, description) => {
          mockSpawnSuccess();

          const manager = new WorkspaceManager('test');
          const branchName = await manager.createTaskBranch(
            '/workspace',
            ticketId,
            description
          );

          // チケットIDが含まれる
          expect(branchName).toContain(ticketId);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('ブランチ名に不正な文字が含まれないこと', () => {
    fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z0-9]{1,10}$/),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (ticketId, description) => {
          mockSpawnSuccess();

          const manager = new WorkspaceManager('test');
          const branchName = await manager.createTaskBranch(
            '/workspace',
            ticketId,
            description
          );

          // agent/ プレフィックス以降は英小文字、数字、ハイフンのみ
          // （ticketIdはそのまま、descriptionは小文字変換+サニタイズされる）
          const afterPrefix = branchName.replace('agent/', '');
          expect(afterPrefix).toMatch(/^[a-z0-9-]+$/);
        }
      ),
      { numRuns: 10 }
    );
  });
});
