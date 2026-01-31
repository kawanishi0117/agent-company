/**
 * 面接課題（Interview Task）生成モジュール
 *
 * 採用システムにおける面接課題生成機能を提供
 * - JDから面接課題を生成
 * - 課題をMarkdown形式に変換
 * - 予算制約のチェック
 *
 * @module hiring/interview-generator
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import * as fs from 'fs';
import * as path from 'path';
import type { InterviewTask, EvaluationCriterion, GeneratedJD } from './types.js';

// =============================================================================
// 定数定義
// =============================================================================

/**
 * デフォルトの制限時間（分）
 * @description 難易度別のデフォルト制限時間
 */
const DEFAULT_TIME_LIMITS: Record<InterviewTask['difficulty'], number> = {
  easy: 15,
  medium: 30,
  hard: 45,
} as const;

/**
 * 難易度別の評価基準テンプレート
 * @description 各難易度に対応する標準的な評価基準
 */
const EVALUATION_CRITERIA_TEMPLATES: Record<InterviewTask['difficulty'], EvaluationCriterion[]> = {
  easy: [
    {
      name: 'タスク完了度',
      description: '指定された要件を満たしているか',
      maxPoints: 40,
    },
    {
      name: '品質',
      description: '成果物の品質が基準を満たしているか',
      maxPoints: 30,
    },
    {
      name: '効率性',
      description: '時間内に効率的に作業を完了したか',
      maxPoints: 30,
    },
  ],
  medium: [
    {
      name: 'タスク完了度',
      description: '全ての要件を正確に満たしているか',
      maxPoints: 40,
    },
    {
      name: '品質ゲート準拠',
      description: 'lint、テスト、コードレビュー基準を満たしているか',
      maxPoints: 30,
    },
    {
      name: '効率性と最適化',
      description: 'リソースを効率的に使用し、最適な解決策を提示したか',
      maxPoints: 30,
    },
  ],
  hard: [
    {
      name: 'タスク完了度と正確性',
      description: '複雑な要件を正確かつ完全に満たしているか',
      maxPoints: 40,
    },
    {
      name: '品質と堅牢性',
      description: 'エッジケース対応、エラーハンドリング、テストカバレッジ',
      maxPoints: 30,
    },
    {
      name: '効率性と創造性',
      description: '効率的かつ創造的なアプローチで問題を解決したか',
      maxPoints: 30,
    },
  ],
} as const;

/**
 * 役割別の課題テンプレート
 * @description 一般的な役割に対する面接課題のプリセット
 */
const TASK_TEMPLATES: Record<
  string,
  {
    title: string;
    description: string;
    expectedDeliverables: string[];
    difficulty: InterviewTask['difficulty'];
  }
> = {
  developer: {
    title: '小規模機能の実装課題',
    description:
      '指定された仕様に基づいて、小規模な機能を実装してください。' +
      'コードの品質、テストの作成、ドキュメントの更新を含めて評価します。',
    expectedDeliverables: ['実装コード（TypeScript）', 'ユニットテスト', '簡潔なREADME更新'],
    difficulty: 'medium',
  },
  qa_executor: {
    title: 'テスト計画と実行課題',
    description:
      '提供されたコードに対するテスト計画を作成し、テストを実行してください。' +
      'バグの発見と報告、品質メトリクスの収集を含めて評価します。',
    expectedDeliverables: [
      'テスト計画書',
      'テスト実行結果レポート',
      'バグレポート（発見した場合）',
    ],
    difficulty: 'medium',
  },
  reviewer: {
    title: 'コードレビュー課題',
    description:
      '提供されたプルリクエストをレビューし、フィードバックを提供してください。' +
      'コード品質、セキュリティ、ベストプラクティスの観点から評価します。',
    expectedDeliverables: ['レビューコメント一覧', '改善提案', '承認/却下の判定と理由'],
    difficulty: 'easy',
  },
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 一意のIDを生成する
 * @returns 生成されたID
 */
function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `task-${timestamp}-${random}`;
}

/**
 * JDファイルからGeneratedJDを解析する
 * @param jdContent - JDファイルの内容
 * @param jdPath - JDファイルのパス
 * @returns 解析されたJD
 */
function parseJDFromMarkdown(jdContent: string, jdPath: string): GeneratedJD {
  // タイトルを抽出
  const titleMatch = jdContent.match(/^#\s+Job Description:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown Role';

  // 責務を抽出
  const responsibilities = extractListSection(jdContent, 'Responsibilities');

  // 能力を抽出
  const capabilities = extractListSection(jdContent, 'Capabilities');

  // 成果物を抽出
  const deliverables = extractListSection(jdContent, 'Deliverables');

  // 品質ゲートを抽出
  const qualityGates = extractListSection(jdContent, 'Quality Gates');

  // 予算を抽出
  const budget = extractBudget(jdContent);

  return {
    title,
    responsibilities,
    capabilities,
    deliverables,
    qualityGates,
    budget,
    filePath: jdPath,
  };
}

/**
 * Markdownからリストセクションを抽出する
 * @param content - Markdown内容
 * @param sectionName - セクション名
 * @returns 抽出されたリスト項目
 */
function extractListSection(content: string, sectionName: string): string[] {
  // セクションヘッダーを探す（日本語名も含む）
  const sectionRegex = new RegExp(`##\\s+${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, 'i');
  const match = content.match(sectionRegex);

  if (!match) {
    return [];
  }

  // リスト項目を抽出
  const listItems: string[] = [];
  const lines = match[1].split('\n');

  for (const line of lines) {
    const itemMatch = line.match(/^[-*]\s+(.+)$/);
    if (itemMatch) {
      listItems.push(itemMatch[1].trim());
    }
  }

  return listItems;
}

/**
 * Markdownから予算情報を抽出する
 * @param content - Markdown内容
 * @returns 予算情報
 */
function extractBudget(content: string): { tokens: number; timeMinutes: number } {
  // デフォルト値
  let tokens = 30000;
  let timeMinutes = 30;

  // トークン数を抽出
  const tokensMatch = content.match(/トークン上限\s*\|\s*([\d,]+)/);
  if (tokensMatch) {
    tokens = parseInt(tokensMatch[1].replace(/,/g, ''), 10);
  }

  // 時間を抽出
  const timeMatch = content.match(/時間上限\s*\|\s*(\d+)/);
  if (timeMatch) {
    timeMinutes = parseInt(timeMatch[1], 10);
  }

  return { tokens, timeMinutes };
}

/**
 * 役割名からタイトルを推測する
 * @param title - JDのタイトル
 * @returns 推測された役割キー
 */
function inferRoleFromTitle(title: string): string {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes('developer') || normalizedTitle.includes('開発')) {
    return 'developer';
  }
  if (
    normalizedTitle.includes('qa') ||
    normalizedTitle.includes('test') ||
    normalizedTitle.includes('品質')
  ) {
    return 'qa_executor';
  }
  if (normalizedTitle.includes('review') || normalizedTitle.includes('レビュー')) {
    return 'reviewer';
  }

  return 'default';
}

/**
 * 難易度を決定する
 * @param jd - JD情報
 * @returns 難易度
 */
function determineDifficulty(jd: GeneratedJD): InterviewTask['difficulty'] {
  // 予算に基づいて難易度を決定
  const { timeMinutes } = jd.budget;

  if (timeMinutes <= 20) {
    return 'easy';
  }
  if (timeMinutes <= 35) {
    return 'medium';
  }
  return 'hard';
}

/**
 * 予算制約をチェックする
 * @param timeLimit - 課題の制限時間
 * @param budgetTimeMinutes - JDの予算時間
 * @returns 予算内であればtrue
 */
function checkBudgetConstraint(timeLimit: number, budgetTimeMinutes: number): boolean {
  // 課題の制限時間は予算の80%以内に収める
  return timeLimit <= budgetTimeMinutes * 0.8;
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * JDから面接課題を生成する
 *
 * 指定されたJDファイルを読み込み、その内容に基づいて
 * 候補エージェントの能力を評価するための面接課題を生成する。
 *
 * @param jdPath - JDファイルパス
 * @param outputDir - 出力ディレクトリ
 * @returns 生成された面接課題
 * @throws Error - JDファイルが存在しない場合、または無効な場合
 *
 * @example
 * ```typescript
 * const task = generateInterviewTask(
 *   'runtime/runs/run-001/jd.md',
 *   'runtime/runs/run-001'
 * );
 * ```
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5
 */
export function generateInterviewTask(jdPath: string, outputDir: string): InterviewTask {
  // JDファイルの存在チェック
  if (!fs.existsSync(jdPath)) {
    throw new Error(`JDNotFound: 指定されたJDファイルが存在しません: ${jdPath}`);
  }

  // JDファイルを読み込み
  const jdContent = fs.readFileSync(jdPath, 'utf-8');

  // JDを解析
  const jd = parseJDFromMarkdown(jdContent, jdPath);

  // JDのバリデーション
  if (!jd.title || jd.responsibilities.length === 0) {
    throw new Error('InvalidJD: JDが必須セクションを欠いています');
  }

  // 役割を推測
  const roleKey = inferRoleFromTitle(jd.title);

  // 難易度を決定
  const difficulty = determineDifficulty(jd);

  // テンプレートを取得（なければデフォルト生成）
  const template = TASK_TEMPLATES[roleKey];

  // 制限時間を決定（予算制約を考慮）
  let timeLimit = template?.difficulty
    ? DEFAULT_TIME_LIMITS[template.difficulty]
    : DEFAULT_TIME_LIMITS[difficulty];

  // 予算制約チェック - 制限時間が予算を超えないように調整
  if (!checkBudgetConstraint(timeLimit, jd.budget.timeMinutes)) {
    // 予算の80%に制限
    timeLimit = Math.floor(jd.budget.timeMinutes * 0.8);
    // 最低5分は確保
    timeLimit = Math.max(timeLimit, 5);
  }

  // 課題IDを生成
  const taskId = generateTaskId();

  // 面接課題を構築
  const task: InterviewTask = {
    id: taskId,
    title: template?.title ?? `${jd.title} 評価課題`,
    description: generateTaskDescription(jd, template?.description),
    expectedDeliverables: generateExpectedDeliverables(jd, template?.expectedDeliverables),
    evaluationCriteria: generateEvaluationCriteria(jd, difficulty),
    timeLimit,
    difficulty,
  };

  // 出力ディレクトリが存在しない場合は作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 面接課題をファイルに保存
  const taskFilePath = path.join(outputDir, 'interview_task.md');
  const markdown = formatInterviewTaskAsMarkdown(task);
  fs.writeFileSync(taskFilePath, markdown, 'utf-8');

  return task;
}

/**
 * 課題の説明を生成する
 * @param jd - JD情報
 * @param templateDescription - テンプレートの説明
 * @returns 生成された説明
 */
function generateTaskDescription(jd: GeneratedJD, templateDescription?: string): string {
  if (templateDescription) {
    return templateDescription;
  }

  // JDの責務と能力から説明を生成
  const mainResponsibility = jd.responsibilities[0] || '指定されたタスク';
  const mainCapability = jd.capabilities[0] || '必要なスキル';

  return (
    `この課題では、${jd.title}としての能力を評価します。\n\n` +
    `主な評価ポイント:\n` +
    `- ${mainResponsibility}\n` +
    `- ${mainCapability}の実践\n\n` +
    `制限時間内に、指定された成果物を完成させてください。`
  );
}

/**
 * 期待される成果物を生成する
 * @param jd - JD情報
 * @param templateDeliverables - テンプレートの成果物
 * @returns 生成された成果物リスト
 */
function generateExpectedDeliverables(jd: GeneratedJD, templateDeliverables?: string[]): string[] {
  if (templateDeliverables && templateDeliverables.length > 0) {
    return templateDeliverables;
  }

  // JDの成果物から生成
  if (jd.deliverables.length > 0) {
    return jd.deliverables.slice(0, 3); // 最大3つ
  }

  // デフォルトの成果物
  return ['完了した作業成果物', '作業ログまたはレポート'];
}

/**
 * 評価基準を生成する
 * @param jd - JD情報
 * @param difficulty - 難易度
 * @returns 生成された評価基準
 */
function generateEvaluationCriteria(
  jd: GeneratedJD,
  difficulty: InterviewTask['difficulty']
): EvaluationCriterion[] {
  // 難易度に応じたテンプレートを取得
  const baseCriteria = [...EVALUATION_CRITERIA_TEMPLATES[difficulty]];

  // JDの品質ゲートを考慮して説明を調整
  if (jd.qualityGates.length > 0) {
    // 品質ゲート準拠の説明を更新
    const qualityIndex = baseCriteria.findIndex((c) => c.name.includes('品質'));
    if (qualityIndex >= 0) {
      baseCriteria[qualityIndex] = {
        ...baseCriteria[qualityIndex],
        description: `${baseCriteria[qualityIndex].description}（${jd.qualityGates.slice(0, 2).join('、')}）`,
      };
    }
  }

  return baseCriteria;
}

// =============================================================================
// Markdown変換関数
// =============================================================================

/**
 * 面接課題をMarkdown形式に変換する
 *
 * 生成された面接課題を人間が読みやすいMarkdown形式に変換する。
 * 候補エージェントに提示する形式で出力する。
 *
 * @param task - 面接課題
 * @returns Markdown文字列
 *
 * @example
 * ```typescript
 * const markdown = formatInterviewTaskAsMarkdown(task);
 * fs.writeFileSync('interview_task.md', markdown);
 * ```
 *
 * Validates: Requirements 3.3, 3.4
 */
export function formatInterviewTaskAsMarkdown(task: InterviewTask): string {
  const lines: string[] = [];

  // ヘッダー
  lines.push(`# 面接課題: ${task.title}`);
  lines.push('');
  lines.push(`> Task ID: ${task.id}`);
  lines.push(`> 難易度: ${formatDifficulty(task.difficulty)}`);
  lines.push(`> 制限時間: ${task.timeLimit}分`);
  lines.push('');

  // 課題説明セクション
  lines.push('## 課題説明');
  lines.push('');
  lines.push(task.description);
  lines.push('');

  // 期待される成果物セクション
  lines.push('## 期待される成果物');
  lines.push('');
  for (const deliverable of task.expectedDeliverables) {
    lines.push(`- ${deliverable}`);
  }
  lines.push('');

  // 評価基準セクション
  lines.push('## 評価基準');
  lines.push('');
  lines.push('| 基準 | 説明 | 配点 |');
  lines.push('|------|------|------|');
  for (const criterion of task.evaluationCriteria) {
    lines.push(`| ${criterion.name} | ${criterion.description} | ${criterion.maxPoints}点 |`);
  }
  lines.push('');

  // 合計点
  const totalPoints = task.evaluationCriteria.reduce((sum, c) => sum + c.maxPoints, 0);
  lines.push(`**合計: ${totalPoints}点**`);
  lines.push('');

  // 注意事項セクション
  lines.push('## 注意事項');
  lines.push('');
  lines.push('- 制限時間を厳守してください');
  lines.push('- 成果物は指定された形式で提出してください');
  lines.push('- 不明点がある場合は、合理的な仮定を置いて進めてください');
  lines.push('- 品質ゲート（lint、テスト等）を通過することが求められます');
  lines.push('');

  // フッター
  lines.push('---');
  lines.push('');
  lines.push('*この課題はHiring Managerによって自動生成されました。*');

  return lines.join('\n');
}

/**
 * 難易度を日本語表記に変換する
 * @param difficulty - 難易度
 * @returns 日本語表記
 */
function formatDifficulty(difficulty: InterviewTask['difficulty']): string {
  const labels: Record<InterviewTask['difficulty'], string> = {
    easy: '易（Easy）',
    medium: '中（Medium）',
    hard: '難（Hard）',
  };
  return labels[difficulty];
}
