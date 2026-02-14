/**
 * @file EmployeeCard コンポーネント
 * @description 社員カード（アバター、名前、役割、ステータス、品質スコア）
 * @see Requirements: 1.1, 1.2, 1.3
 */

'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';
import { StatusIndicator } from './StatusIndicator';

// =============================================================================
// 型定義
// =============================================================================

interface EmployeeCardProps {
  /** エージェントID */
  id: string;
  /** 役職名 */
  title: string;
  /** 現在のステータス */
  status: string;
  /** 現在のタスク */
  currentTask?: { id: string; title: string };
  /** パフォーマンスデータ */
  performance?: {
    totalTasks: number;
    successRate: number;
    averageQuality: number;
  };
  /** ムードスコア（0-100） */
  mood?: number;
  /** MVP受賞月（例: "2026-01"） */
  mvpMonth?: string;
}

// =============================================================================
// ヘルパー
// =============================================================================

/** エージェントIDからアバターの頭文字を生成 */
function getInitials(id: string): string {
  return id
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

/** 品質スコアに応じた色クラスを返す */
function getQualityColor(score: number): string {
  if (score >= 80) return 'text-status-pass';
  if (score >= 60) return 'text-status-waiver';
  return 'text-status-fail';
}

/** ムードスコアに応じた絵文字を返す */
function getMoodEmoji(score: number): string {
  if (score >= 80) return '😊';
  if (score >= 60) return '🙂';
  if (score >= 40) return '😐';
  return '😟';
}

/** ムードスコアに応じた色クラスを返す */
function getMoodColorClass(score: number): string {
  if (score >= 70) return 'text-status-pass';
  if (score >= 40) return 'text-status-waiver';
  return 'text-status-fail';
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 社員カードコンポーネント
 * 社員の基本情報をカード形式で表示する
 */
export function EmployeeCard({
  id,
  title,
  status,
  currentTask,
  performance,
  mood,
  mvpMonth,
}: EmployeeCardProps): JSX.Element {
  return (
    <Link href={`/employees/${id}`}>
      <Card className="p-4 hover:bg-bg-tertiary/50 transition-colors cursor-pointer">
        <div className="flex items-start gap-3">
          {/* アバター */}
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-lg bg-accent-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-accent-primary">
                {getInitials(id)}
              </span>
            </div>
            {/* MVPバッジ */}
            {mvpMonth && (
              <span
                className="absolute -top-1.5 -right-1.5 text-xs"
                title={`${mvpMonth} MVP`}
                aria-label={`${mvpMonth} MVP受賞`}
              >
                🏆
              </span>
            )}
          </div>

          {/* 情報 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-text-primary truncate">
                {title}
              </h3>
              <StatusIndicator status={status} size="sm" />
              {/* ムードインジケータ */}
              {mood !== undefined && (
                <span
                  className={`text-xs ${getMoodColorClass(mood)}`}
                  title={`ムード: ${mood}`}
                  aria-label={`ムードスコア ${mood}`}
                >
                  {getMoodEmoji(mood)}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">{id}</p>

            {/* 現在のタスク */}
            {currentTask && (
              <p className="text-xs text-accent-primary mt-1 truncate">
                📋 {currentTask.title}
              </p>
            )}
          </div>

          {/* パフォーマンス */}
          {performance && performance.totalTasks > 0 && (
            <div className="flex-shrink-0 text-right">
              <p className={`text-lg font-bold ${getQualityColor(performance.averageQuality)}`}>
                {Math.round(performance.averageQuality)}
              </p>
              <p className="text-[10px] text-text-muted">品質</p>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
