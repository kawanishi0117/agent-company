/**
 * @file Projects API Route
 * @description プロジェクト一覧取得・作成API
 * @requirements 6.1, 6.2 - プロジェクト一覧取得と登録
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
 * プロジェクト作成リクエスト
 */
interface CreateProjectRequest {
  name: string;
  gitUrl: string;
  baseBranch?: string;
  agentBranch?: string;
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
    // ファイルが存在しない場合は空配列を返す
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
 * プロジェクトIDを生成する
 */
function generateProjectId(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
}

/**
 * Git URLを検証する
 */
function isValidGitUrl(url: string): boolean {
  const httpsPattern = /^https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
  const sshPattern = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
  return httpsPattern.test(url) || sshPattern.test(url);
}

// =============================================================================
// APIハンドラ
// =============================================================================

/**
 * GET /api/projects
 * プロジェクト一覧を取得する
 */
export async function GET(): Promise<NextResponse<ApiResponse<Project[]>>> {
  try {
    const projects = await loadProjects();
    return NextResponse.json({ data: projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `プロジェクト一覧の取得に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * 新規プロジェクトを作成する
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
    const body: CreateProjectRequest = await request.json();

    // バリデーション
    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json(
        { error: 'プロジェクト名は2文字以上で入力してください' },
        { status: 400 }
      );
    }

    if (!body.gitUrl || !isValidGitUrl(body.gitUrl)) {
      return NextResponse.json({ error: '有効なGit URLを入力してください' }, { status: 400 });
    }

    // 既存プロジェクトを読み込む
    const projects = await loadProjects();

    // 同じGit URLのプロジェクトが存在しないか確認
    const existingProject = projects.find((p) => p.gitUrl === body.gitUrl);
    if (existingProject) {
      return NextResponse.json(
        { error: '同じGit URLのプロジェクトが既に存在します' },
        { status: 409 }
      );
    }

    // 新規プロジェクトを作成
    const projectId = generateProjectId(body.name);
    const now = new Date().toISOString();

    const newProject: Project = {
      id: projectId,
      name: body.name.trim(),
      gitUrl: body.gitUrl,
      defaultBranch: 'main',
      integrationBranch: 'develop',
      baseBranch: body.baseBranch || 'main',
      agentBranch: body.agentBranch || `agent/${projectId}`,
      workDir: path.join('workspaces', projectId),
      createdAt: now,
      lastUsed: now,
    };

    // 保存
    projects.push(newProject);
    await saveProjects(projects);

    return NextResponse.json({ data: { id: projectId } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: `プロジェクトの作成に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
