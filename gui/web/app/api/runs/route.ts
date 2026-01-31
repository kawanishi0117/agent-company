/**
 * @file Runs API Route
 * @description GET /api/runs - Run一覧を取得（ページネーション・フィルタ対応）
 * @requirements 6.4 - runtime/runs/からRun一覧を返す
 * @requirements 4.9 - ステータスフィルタ対応
 * @requirements 4.10 - ページネーション対応（10 runs per page）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllRuns, filterRunsByStatus, paginateRuns } from '@/lib/parsers/run';
import type { PaginatedResponse, RunSummary, RunStatus } from '@/lib/types';

/**
 * デフォルトのページサイズ
 */
const DEFAULT_PAGE_SIZE = 10;

/**
 * 有効なステータス値
 */
const VALID_STATUSES: RunStatus[] = ['success', 'failure', 'running'];

/**
 * GET /api/runs
 * Run一覧を取得する
 * @param request - リクエスト（クエリパラメータ: page, pageSize, status）
 * @returns ページネーションされたRun一覧
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<PaginatedResponse<RunSummary> | { error: string }>> {
  try {
    // クエリパラメータの取得
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(
      1,
      parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)
    );
    const statusParam = searchParams.get('status');

    // Run一覧を取得
    const result = getAllRuns();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    let runs = result.data;

    // ステータスフィルタの適用
    if (statusParam && VALID_STATUSES.includes(statusParam as RunStatus)) {
      runs = filterRunsByStatus(runs, statusParam as RunStatus);
    }

    // ページネーションの適用
    const paginated = paginateRuns(runs, page, pageSize);

    // logsを除いたサマリー形式に変換
    const summaries: RunSummary[] = paginated.items.map((run) => ({
      runId: run.runId,
      ticketId: run.ticketId,
      status: run.status,
      startTime: run.startTime,
      endTime: run.endTime,
      artifacts: run.artifacts,
      judgment: run.judgment,
    }));

    return NextResponse.json({
      items: summaries,
      total: paginated.total,
      page,
      pageSize,
      hasMore: paginated.hasMore,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: `Run一覧の取得に失敗しました: ${message}` }, { status: 500 });
  }
}
