/**
 * 採用システム（Hiring System）の共通型定義
 *
 * M5: Hiring Systemで使用される全ての型定義を集約
 * - JD生成、面接課題、試用実行、スコア化、Registry登録に関する型
 *
 * @module hiring/types
 */

// =============================================================================
// JD Generator 関連の型定義
// =============================================================================

/**
 * JD生成オプション
 * @description JD（Job Description）を生成する際のオプション
 */
export interface JDGeneratorOptions {
  /** 役割名 */
  role: string;
  /** 追加説明（オプション） */
  description?: string;
  /** 出力ディレクトリ */
  outputDir: string;
}

/**
 * 生成されたJD
 * @description JD生成の結果として返される構造体
 */
export interface GeneratedJD {
  /** 役割タイトル */
  title: string;
  /** 責務一覧 */
  responsibilities: string[];
  /** 必要な能力一覧 */
  capabilities: string[];
  /** 成果物一覧 */
  deliverables: string[];
  /** 品質ゲート一覧 */
  qualityGates: string[];
  /** 予算制約 */
  budget: {
    /** トークン数上限 */
    tokens: number;
    /** 時間上限（分） */
    timeMinutes: number;
  };
  /** 保存先ファイルパス */
  filePath: string;
}

// =============================================================================
// Interview Task Generator 関連の型定義
// =============================================================================

/**
 * 評価基準
 * @description 面接課題の評価に使用する基準
 */
export interface EvaluationCriterion {
  /** 基準名 */
  name: string;
  /** 基準の説明 */
  description: string;
  /** 最大得点 */
  maxPoints: number;
}

/**
 * 面接課題
 * @description 候補エージェントの能力を評価するための課題
 */
export interface InterviewTask {
  /** 課題ID */
  id: string;
  /** 課題タイトル */
  title: string;
  /** 課題の説明 */
  description: string;
  /** 期待される成果物一覧 */
  expectedDeliverables: string[];
  /** 評価基準一覧 */
  evaluationCriteria: EvaluationCriterion[];
  /** 制限時間（分） */
  timeLimit: number;
  /** 難易度 */
  difficulty: 'easy' | 'medium' | 'hard';
}

// =============================================================================
// Trial Runner 関連の型定義
// =============================================================================

/**
 * 試用実行オプション
 * @description 候補エージェントの試用実行に使用するオプション
 */
export interface TrialRunOptions {
  /** 候補エージェント定義パス */
  candidatePath: string;
  /** 面接課題パス */
  taskPath: string;
  /** 出力ディレクトリ */
  outputDir: string;
  /** タイムアウト（分、オプション） */
  timeout?: number;
}

/**
 * 試用実行結果
 * @description 試用実行の結果として返される構造体
 */
export interface TrialRunResult {
  /** 実行ID */
  runId: string;
  /** 候補エージェントID */
  candidateId: string;
  /** 課題ID */
  taskId: string;
  /** 実行ステータス */
  status: 'completed' | 'failed' | 'timeout';
  /** 開始時刻（ISO8601形式） */
  startTime: string;
  /** 終了時刻（ISO8601形式） */
  endTime: string;
  /** 実行時間（分） */
  durationMinutes: number;
  /** 出力ファイルパス一覧 */
  outputs: string[];
  /** ログファイルパス */
  logs: string;
  /** リソース使用量 */
  resourceUsage: {
    /** 使用トークン数 */
    tokensUsed: number;
    /** 使用時間（分） */
    timeUsed: number;
  };
}

// =============================================================================
// Scoring Engine 関連の型定義
// =============================================================================

/**
 * スコアコンポーネント
 * @description スコアの各構成要素
 */
export interface ScoreComponent {
  /** 獲得スコア */
  score: number;
  /** 最大スコア */
  maxScore: number;
  /** スコアの根拠 */
  justification: string;
}

/**
 * スコアリング結果
 * @description 試用実行結果のスコア化結果
 */
export interface ScoringResult {
  /** 実行ID */
  runId: string;
  /** 候補エージェントID */
  candidateId: string;
  /** 総合スコア（0-100） */
  totalScore: number;
  /** スコア内訳 */
  breakdown: {
    /** タスク完了度（0-40点） */
    taskCompletion: ScoreComponent;
    /** 品質ゲート準拠（0-30点） */
    qualityCompliance: ScoreComponent;
    /** 効率性（0-30点） */
    efficiency: ScoreComponent;
  };
  /** 合格判定（60点以上で合格） */
  passed: boolean;
  /** フィードバック一覧 */
  feedback: string[];
  /** スコア算出時刻（ISO8601形式） */
  timestamp: string;
}

// =============================================================================
// Registry Manager 関連の型定義
// =============================================================================

/**
 * 登録結果
 * @description エージェントのRegistry登録結果
 */
export interface RegistrationResult {
  /** 登録成功フラグ */
  success: boolean;
  /** エージェントID */
  agentId: string;
  /** Registryパス */
  registryPath: string;
  /** エラーメッセージ一覧（失敗時） */
  errors?: string[];
  /** 登録時刻（ISO8601形式） */
  timestamp: string;
}

// =============================================================================
// Hiring Logger 関連の型定義
// =============================================================================

/**
 * 採用アクション種別
 * @description 採用プロセスで記録されるアクションの種類
 */
export type HiringAction =
  | 'jd_generated'
  | 'interview_task_generated'
  | 'trial_started'
  | 'trial_completed'
  | 'trial_failed'
  | 'score_calculated'
  | 'registration_approved'
  | 'registration_rejected';

/**
 * 採用ログエントリ
 * @description 採用活動の1つのログエントリ
 */
export interface HiringLogEntry {
  /** タイムスタンプ（ISO8601形式） */
  timestamp: string;
  /** アクション種別 */
  action: HiringAction;
  /** 詳細情報 */
  details: Record<string, unknown>;
  /** 実行者 */
  actor: string;
}

// =============================================================================
// Validation 関連の型定義
// =============================================================================

/**
 * バリデーション結果
 * @description 各種バリデーションの結果
 */
export interface ValidationResult {
  /** 有効フラグ */
  valid: boolean;
  /** エラーメッセージ一覧 */
  errors: string[];
  /** 警告メッセージ一覧 */
  warnings: string[];
}

// =============================================================================
// Schema 定義（データ永続化用）
// =============================================================================

/**
 * JDスキーマ
 * @description JDファイルの永続化形式
 */
export interface JDSchema {
  /** スキーマバージョン */
  version: '1.0';
  /** メタデータ */
  metadata: {
    /** 生成日時（ISO8601形式） */
    generatedAt: string;
    /** 生成者 */
    generatedBy: 'hiring_manager';
    /** 実行ID */
    runId: string;
  };
  /** 役割情報 */
  role: {
    /** タイトル */
    title: string;
    /** 説明 */
    description: string;
  };
  /** 要件 */
  requirements: {
    /** 責務一覧 */
    responsibilities: string[];
    /** 能力一覧 */
    capabilities: string[];
    /** 成果物一覧 */
    deliverables: string[];
    /** 品質ゲート一覧 */
    qualityGates: string[];
  };
  /** 制約 */
  constraints: {
    /** 予算 */
    budget: {
      /** トークン数上限 */
      tokens: number;
      /** 時間上限（分） */
      timeMinutes: number;
    };
  };
}

/**
 * 面接課題スキーマ
 * @description 面接課題ファイルの永続化形式
 */
export interface InterviewTaskSchema {
  /** スキーマバージョン */
  version: '1.0';
  /** メタデータ */
  metadata: {
    /** 生成日時（ISO8601形式） */
    generatedAt: string;
    /** 参照JDパス */
    jdReference: string;
    /** 実行ID */
    runId: string;
  };
  /** 課題情報 */
  task: {
    /** 課題ID */
    id: string;
    /** タイトル */
    title: string;
    /** 説明 */
    description: string;
    /** 難易度 */
    difficulty: 'easy' | 'medium' | 'hard';
  };
  /** 期待事項 */
  expectations: {
    /** 成果物一覧 */
    deliverables: string[];
    /** 評価基準一覧 */
    evaluationCriteria: {
      /** 基準名 */
      name: string;
      /** 説明 */
      description: string;
      /** 最大得点 */
      maxPoints: number;
    }[];
    /** 制限時間（分） */
    timeLimit: number;
  };
}

/**
 * スコアリング結果スキーマ
 * @description スコアリング結果ファイルの永続化形式
 */
export interface ScoringResultSchema {
  /** スキーマバージョン */
  version: '1.0';
  /** メタデータ */
  metadata: {
    /** スコア算出日時（ISO8601形式） */
    scoredAt: string;
    /** 実行ID */
    runId: string;
    /** 候補エージェントID */
    candidateId: string;
  };
  /** スコア情報 */
  scores: {
    /** 総合スコア */
    total: number;
    /** 合格閾値 */
    passingThreshold: number;
    /** 合格フラグ */
    passed: boolean;
    /** スコア内訳 */
    breakdown: {
      /** タスク完了度 */
      taskCompletion: {
        /** 獲得スコア */
        score: number;
        /** 最大スコア */
        maxScore: 40;
        /** 根拠 */
        justification: string;
      };
      /** 品質ゲート準拠 */
      qualityCompliance: {
        /** 獲得スコア */
        score: number;
        /** 最大スコア */
        maxScore: 30;
        /** 根拠 */
        justification: string;
      };
      /** 効率性 */
      efficiency: {
        /** 獲得スコア */
        score: number;
        /** 最大スコア */
        maxScore: 30;
        /** 根拠 */
        justification: string;
      };
    };
  };
  /** フィードバック一覧 */
  feedback: string[];
}

/**
 * 採用ログスキーマ
 * @description 採用ログファイルの永続化形式
 */
export interface HiringLogSchema {
  /** スキーマバージョン */
  version: '1.0';
  /** 実行ID */
  runId: string;
  /** 候補エージェントID */
  candidateId: string;
  /** 開始日時（ISO8601形式） */
  startedAt: string;
  /** 完了日時（ISO8601形式、オプション） */
  completedAt?: string;
  /** ステータス */
  status: 'in_progress' | 'approved' | 'rejected';
  /** ログエントリ一覧 */
  entries: {
    /** タイムスタンプ（ISO8601形式） */
    timestamp: string;
    /** アクション */
    action: string;
    /** 詳細情報 */
    details: Record<string, unknown>;
    /** 実行者 */
    actor: string;
  }[];
}
