/**
 * 採用システム（Hiring System）モジュール
 *
 * M5: Hiring Systemの全機能をエクスポート
 * - 型定義
 * - JD生成
 * - 面接課題生成
 * - 試用実行
 * - スコア化
 * - Registry管理
 * - 採用ログ
 *
 * @module hiring
 */

// =============================================================================
// 型定義のエクスポート
// =============================================================================

export type {
  // JD Generator 関連
  JDGeneratorOptions,
  GeneratedJD,

  // Interview Task Generator 関連
  InterviewTask,
  EvaluationCriterion,

  // Trial Runner 関連
  TrialRunOptions,
  TrialRunResult,

  // Scoring Engine 関連
  ScoringResult,
  ScoreComponent,

  // Registry Manager 関連
  RegistrationResult,

  // Hiring Logger 関連
  HiringLogEntry,
  HiringAction,

  // Validation 関連
  ValidationResult,

  // Schema 定義
  JDSchema,
  InterviewTaskSchema,
  ScoringResultSchema,
  HiringLogSchema,
} from './types.js';

// =============================================================================
// 各モジュールのエクスポート
// =============================================================================

// JD Generator
export { generateJD, formatJDAsMarkdown, validateJD } from './jd-generator.js';

// Interview Task Generator
export { generateInterviewTask, formatInterviewTaskAsMarkdown } from './interview-generator.js';

// Trial Runner
export { runTrial, formatTrialResultAsReadable } from './trial-runner.js';

// Scoring Engine
export {
  calculateScore,
  calculateScoreFromResult,
  formatScoreAsJSON,
  formatScoreAsReadable,
  PASSING_THRESHOLD,
  MAX_TASK_COMPLETION_SCORE,
  MAX_QUALITY_COMPLIANCE_SCORE,
  MAX_EFFICIENCY_SCORE,
} from './scoring-engine.js';

// Registry Manager
export {
  registerAgent,
  isDuplicateAgent,
  listRegisteredAgents,
  getAgentDetails,
  removeAgent,
} from './registry-manager.js';

// Hiring Logger
export {
  logHiringActivity,
  formatHiringLogAsMarkdown,
  getHiringLogSchema,
  hasHiringLog,
  clearHiringLog,
} from './hiring-logger.js';

// Notification（登録完了通知）
export {
  generateRegistrationNotification,
  sendRegistrationNotification,
  notifyRegistration,
  formatNotificationsAsMarkdown,
  markNotificationAsRead,
  getUnreadNotifications,
  getAllNotifications,
  clearNotifications,
} from './notification.js';

// Notification 型定義
export type { RegistrationNotification, NotificationSchema } from './notification.js';
