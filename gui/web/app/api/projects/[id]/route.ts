/**
 * @file Project Detail API Route
 * @description プロジェクト詳細取得・更新・削除API
 * @requirements 6.3, 6.4 - プロジェクト詳細取得、編集、削除
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { ApiResponse } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

/**
 * プロジェクト情報
 */
interface Project {
  id: string;
  name: string;
  gitUrl: string;
  defaultBranch: string;
  integrationBranch: string;
  baseBranch: string;
  agentBranch: string;
  workDir: string;
  createdAt: string;
  lastUsed: string;
}

/**
 * プロジェクト更新リクエスト
 */
interface UpdateProjectRequest {
  name?: string;
  baseBranch?: string;
  agentBranch?: string;
}

/**
 * ルートパラメータ
 */
interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// 定数
// =============================================================================

/** プロジェクトファイルのパス */
// GUIは gui/web/ から実行されるため、ルートへは2階層上がる必要がある
const PROJECTS_FILE = path.join(process.cwd(), '..', '..', 'workspaces', 'projects.json');

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * プロジェクト一覧を読み込む
 */
async function loadProjects(): Promise<Project[]> {
  try {
    const content = await fs.readFile(PROJECTS_FILE, 'utf-8');
    const data = JSON.parse(content);
    return data.projects || [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * プロジェクト一覧を保存する
 */
async function saveProjects(projects: Project[]): Promise<void> {
  const data = { projects };
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * ブランチ名を検証する
 */
function isValidBranchName(branch: string): boolean {
  const pattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  return pattern.test(branch) && !branch.includes('..');
}

// =============================================================================
// APIハンドラ
// =============================================================================

/**
 * GET /api/projects/[id]
 * プロジェクト詳細を取得する
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Project>>> {
  try {
    const { id } = await params;
    const projects = await loadProjects();
    const project = projects.find((p) => p.id === id);

    if (!project) {
      return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ data: project });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `プロジェクトの取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]
 * プロジェクトを更新する
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Project>>> {
  try {
    const { id } = await params;
    const body: UpdateProjectRequest = await request.json();

    const projects = await loadProjects();
    const projectIndex = projects.findIndex((p) => p.id === id);

    if (projectIndex === -1) {
      return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // バリデーション
    if (body.name !== undefined && body.name.trim().length < 2) {
      return NextResponse.json(
        { error: 'プロジェクト名は2文字以上で入力してください' },
        { status: 400 }
      );
    }

    if (body.baseBranch !== undefined && !isValidBranchName(body.baseBranch)) {
      return NextResponse.json(
        { error: '有効なベースブランチ名を入力してください' },
        { status: 400 }
      );
    }

    if (body.agentBranch !== undefined && !isValidBranchName(body.agentBranch)) {
      return NextResponse.json(
        { error: '有効なエージェントブランチ名を入力してください' },
        { status: 400 }
      );
    }

    // 更新
    const updatedProject: Project = {
      ...projects[projectIndex],
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.baseBranch !== undefined && { baseBranch: body.baseBranch }),
      ...(body.agentBranch !== undefined && { agentBranch: body.agentBranch }),
      lastUsed: new Date().toISOString(),
    };

    projects[projectIndex] = updatedProject;
    await saveProjects(projects);

    return NextResponse.json({ data: updatedProject });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `プロジェクトの更新に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * プロジェクトを削除する
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<void>>> {
  try {
    const { id } = await params;
    const projects = await loadProjects();
    const projectIndex = projects.findIndex((p) => p.id === id);

    if (projectIndex === -1) {
      return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // 削除
    projects.splice(projectIndex, 1);
    await saveProjects(projects);

    return NextResponse.json({ data: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `プロジェクトの削除に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
