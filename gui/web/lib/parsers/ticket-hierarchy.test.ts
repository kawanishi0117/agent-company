/**
 * @file チケット階層表示のユニットテスト
 * @description チケットステータスの色分けと情報表示をテストする
 * @requirements 7.2, 7.4, 7.5 - ステータス色分け、ワーカータイプ・ブランチ表示
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// =============================================================================
// 型定義
// =============================================================================

/**
 * チケットステータス
 */
type TicketStatus =
  | 'pending'
  | 'decomposing'
  | 'in_progress'
  | 'review_requested'
  | 'revision_required'
  | 'completed'
  | 'failed'
  | 'pr_created';

/**
 * ワーカータイプ
 */
type WorkerType = 'research' | 'design' | 'designer' | 'developer' | 'test' | 'reviewer';

// =============================================================================
// ステータス色マッピング（StatusBadgeから抽出）
// =============================================================================

/**
 * ステータスごとの色設定
 * @requirements 7.2 - ステータスに応じた色分け
 */
const STATUS_COLORS: Record<TicketStatus, string> = {
  pending: 'gray',
  decomposing: 'blue',
  in_progress: 'blue',
  review_requested: 'yellow',
  revision_required: 'yellow',
  completed: 'green',
  failed: 'red',
  pr_created: 'green',
};

/**
 * ステータスから色を取得
 */
function getStatusColor(status: TicketStatus): string {
  return STATUS_COLORS[status] || 'gray';
}

// =============================================================================
// ワーカータイプ設定
// =============================================================================

/**
 * ワーカータイプの表示設定
 */
const WORKER_TYPE_CONFIG: Record<WorkerType, { label: string; icon: string }> = {
  research: { label: '調査', icon: '🔍' },
  design: { label: '設計', icon: '📐' },
  designer: { label: 'UI/UX', icon: '🎨' },
  developer: { label: '開発', icon: '💻' },
  test: { label: 'テスト', icon: '🧪' },
  reviewer: { label: 'レビュー', icon: '👀' },
};

/**
 * ワーカータイプの表示情報を取得
 */
function getWorkerTypeDisplay(type: WorkerType): { label: string; icon: string } {
  return WORKER_TYPE_CONFIG[type] || { label: '不明', icon: '❓' };
}

// =============================================================================
// チケット情報表示
// =============================================================================

/**
 * チケット情報の表示項目
 */
interface TicketDisplayInfo {
  workerType?: string;
  assignee?: string;
  gitBranch?: string;
}

/**
 * チケット情報を表示用に整形
 */
function formatTicketInfo(info: TicketDisplayInfo): string[] {
  const items: string[] = [];

  if (info.workerType) {
    const display = getWorkerTypeDisplay(info.workerType as WorkerType);
    items.push(`${display.icon} ${display.label}`);
  }

  if (info.assignee) {
    items.push(`担当: ${info.assignee}`);
  }

  if (info.gitBranch) {
    items.push(`ブランチ: ${info.gitBranch}`);
  }

  return items;
}

// =============================================================================
// ユニットテスト
// =============================================================================

describe('Ticket Status Color Mapping', () => {
  /**
   * Property 13: Ticket Status Color Mapping
   * @validates Requirements 7.2
   */
  describe('Property 13: Ticket Status Color Mapping', () => {
    it('pendingステータスはgrayを返す', () => {
      expect(getStatusColor('pending')).toBe('gray');
    });

    it('in_progressステータスはblueを返す', () => {
      expect(getStatusColor('in_progress')).toBe('blue');
    });

    it('review_requestedステータスはyellowを返す', () => {
      expect(getStatusColor('review_requested')).toBe('yellow');
    });

    it('completedステータスはgreenを返す', () => {
      expect(getStatusColor('completed')).toBe('green');
    });

    it('failedステータスはredを返す', () => {
      expect(getStatusColor('failed')).toBe('red');
    });

    it('全ての有効なステータスに対して色が定義されている', () => {
      const allStatuses: TicketStatus[] = [
        'pending',
        'decomposing',
        'in_progress',
        'review_requested',
        'revision_required',
        'completed',
        'failed',
        'pr_created',
      ];

      for (const status of allStatuses) {
        const color = getStatusColor(status);
        expect(['gray', 'blue', 'yellow', 'green', 'red']).toContain(color);
      }
    });
  });
});

describe('Ticket Information Display', () => {
  /**
   * Property 14: Ticket Information Display
   * @validates Requirements 7.4, 7.5
   */
  describe('Property 14: Ticket Information Display', () => {
    it('ワーカータイプが設定されている場合、表示に含まれる', () => {
      const info: TicketDisplayInfo = {
        workerType: 'developer',
      };
      const display = formatTicketInfo(info);
      expect(display.some((item) => item.includes('開発'))).toBe(true);
    });

    it('アサイニーが設定されている場合、表示に含まれる', () => {
      const info: TicketDisplayInfo = {
        assignee: 'worker-001',
      };
      const display = formatTicketInfo(info);
      expect(display.some((item) => item.includes('worker-001'))).toBe(true);
    });

    it('Gitブランチが設定されている場合、表示に含まれる', () => {
      const info: TicketDisplayInfo = {
        gitBranch: 'agent/proj-001-0001-01-001',
      };
      const display = formatTicketInfo(info);
      expect(display.some((item) => item.includes('agent/proj-001-0001-01-001'))).toBe(true);
    });

    it('全ての情報が設定されている場合、全て表示に含まれる', () => {
      const info: TicketDisplayInfo = {
        workerType: 'test',
        assignee: 'tester-001',
        gitBranch: 'agent/test-branch',
      };
      const display = formatTicketInfo(info);
      expect(display.length).toBe(3);
    });

    it('情報が設定されていない場合、空配列を返す', () => {
      const info: TicketDisplayInfo = {};
      const display = formatTicketInfo(info);
      expect(display.length).toBe(0);
    });
  });
});

describe('Worker Type Configuration', () => {
  it('全てのワーカータイプに対してラベルとアイコンが定義されている', () => {
    const allTypes: WorkerType[] = [
      'research',
      'design',
      'designer',
      'developer',
      'test',
      'reviewer',
    ];

    for (const type of allTypes) {
      const config = getWorkerTypeDisplay(type);
      expect(config.label).toBeTruthy();
      expect(config.icon).toBeTruthy();
    }
  });
});

// =============================================================================
// プロパティベーステスト
// =============================================================================

describe('Property-based tests', () => {
  /**
   * Property 13: Ticket Status Color Mapping (Property-based)
   * @validates Requirements 7.2
   */
  describe('Property 13: Status Color Consistency', () => {
    it('同じステータスは常に同じ色を返す', () => {
      const statuses: TicketStatus[] = [
        'pending',
        'decomposing',
        'in_progress',
        'review_requested',
        'revision_required',
        'completed',
        'failed',
        'pr_created',
      ];

      fc.assert(
        fc.property(fc.constantFrom(...statuses), (status) => {
          const color1 = getStatusColor(status);
          const color2 = getStatusColor(status);
          return color1 === color2;
        }),
        { numRuns: 100 }
      );
    });

    it('返される色は有効な色のみ', () => {
      const statuses: TicketStatus[] = [
        'pending',
        'decomposing',
        'in_progress',
        'review_requested',
        'revision_required',
        'completed',
        'failed',
        'pr_created',
      ];
      const validColors = ['gray', 'blue', 'yellow', 'green', 'red'];

      fc.assert(
        fc.property(fc.constantFrom(...statuses), (status) => {
          const color = getStatusColor(status);
          return validColors.includes(color);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: Ticket Information Display (Property-based)
   * @validates Requirements 7.4, 7.5
   */
  describe('Property 14: Information Display Completeness', () => {
    it('設定された情報は全て表示に含まれる', () => {
      const workerTypes: WorkerType[] = [
        'research',
        'design',
        'designer',
        'developer',
        'test',
        'reviewer',
      ];

      fc.assert(
        fc.property(
          fc.record({
            workerType: fc.option(fc.constantFrom(...workerTypes)),
            assignee: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
            gitBranch: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          }),
          (info) => {
            const display = formatTicketInfo({
              workerType: info.workerType ?? undefined,
              assignee: info.assignee ?? undefined,
              gitBranch: info.gitBranch ?? undefined,
            });

            let expectedCount = 0;
            if (info.workerType) expectedCount++;
            if (info.assignee) expectedCount++;
            if (info.gitBranch) expectedCount++;

            return display.length === expectedCount;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
