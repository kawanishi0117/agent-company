/**
 * @file Run Artifacts API Route
 * @description GET /api/runs/[id]/artifacts - 指定RunIDの成果物一覧を取得
 * @requirements 5.5 - 成果物・レポートの取得エンドポイント
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 成果物情報
 * @description 各成果物ファイルのメタデータ
 */
interface ArtifactInfo {
  /** ファイル名 */
  name: string;
  /** ファイルの相対パス（artifacts/ディレクトリからの相対） */
  path: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** 最終更新日時（ISO 8601形式） */
  updatedAt: string;
}

// =============================================================================
// 定数
// =============================================================================

/** プロジェクトルートからのrunsディレクトリパス */
const RUNS_DIR = path.join(process.cwd(), '..', '..', 'runtime', 'runs');

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ディレクトリが存在するか確認する
 * @param dirPath - 確認するディレクトリパス
 * @returns ディレクトリが存在すればtrue
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 指定ディレクトリ内のファイル一覧を再帰的に取得する
 * @param dirPath - スキャン対象のディレクトリパス
 * @param basePath - 相対パス計算用のベースパス
 * @returns 成果物情報の配列
 */
async function collectArtifacts(dirPath: string, basePath: string): Promise<ArtifactInfo[]> {
  const artifacts: ArtifactInfo[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // 隠しファイルはスキップ
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        artifacts.push({
          name: entry.name,
          path: relativePath,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      } else if (entry.isDirectory()) {
        // サブディレクトリも再帰的にスキャン
        const subArtifacts = await collectArtifacts(fullPath, basePath);
        artifacts.push(...subArtifacts);
      }
    }
  } catch {
    // ディレクトリ読み込みエラーは無視
  }

  return artifacts;
}

// =============================================================================
// API ハンドラ
// =============================================================================

/**
 * GET /api/runs/[id]/artifacts
 * 指定RunIDの成果物一覧を取得する
 * @param _request - リクエスト（未使用）
 * @param params - パスパラメータ（id: Run ID）
 * @returns 成果物情報の配列
 * @see Requirement 5.5: 成果物の取得エンドポイント
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<ArtifactInfo[]>>> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Run IDが指定されていません' },
        { status: 400 }
      );
    }

    // Runディレクトリの存在確認
    const runDir = path.join(RUNS_DIR, id);
    if (!(await directoryExists(runDir))) {
      return NextResponse.json(
        { error: `Runが見つかりません: ${id}` },
        { status: 404 }
      );
    }

    // artifactsディレクトリの確認
    const artifactsDir = path.join(runDir, 'artifacts');
    if (!(await directoryExists(artifactsDir))) {
      // artifactsディレクトリが存在しない場合は空配列を返す
      return NextResponse.json({ data: [] });
    }

    // 成果物一覧を収集
    const artifacts = await collectArtifacts(artifactsDir, artifactsDir);

    // 更新日時の降順でソート（新しい順）
    artifacts.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({ data: artifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `成果物一覧の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
