/**
 * @file MeetingsTab コンポーネント
 * @description ワークフロー詳細 - 会議録タブ
 * @see Requirements: 9.4, 12.5, 12.6, 16.7
 */

'use client';

import { useState } from 'react';
import type { MeetingMinutesData } from '@/lib/types';

// =============================================================================
// 型定義
// =============================================================================

interface MeetingsTabProps {
  /** 会議録一覧 */
  meetings: MeetingMinutesData[];
}

// =============================================================================
// 定数
// =============================================================================

/** ロールアイコンマップ */
const ROLE_ICONS: Record<string, string> = {
  'coo_pm': '👔',
  'developer': '💻',
  'researcher': '🔬',
  'designer': '🎨',
  'tester': '🧪',
  'reviewer': '📝',
  'default': '🤖',
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 会議録タブコンポーネント
 */
export function MeetingsTab({ meetings }: MeetingsTabProps): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (meetings.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        <span className="text-4xl mb-4 block">📝</span>
        <p>会議録はまだありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => {
        const isExpanded = expandedId === meeting.meetingId;
        return (
          <div
            key={meeting.meetingId}
            className="bg-bg-secondary rounded-md border border-bg-tertiary overflow-hidden"
          >
            {/* アコーディオンヘッダー */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : meeting.meetingId)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg-tertiary/30 transition-colors text-left"
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">📋</span>
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {new Date(meeting.date).toLocaleString('ja-JP')}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* 参加者アイコン */}
                    <div className="flex -space-x-1">
                      {meeting.participants.slice(0, 5).map((p, i) => (
                        <span
                          key={i}
                          className="inline-block text-xs"
                          title={`${p.agentId} (${p.role})`}
                        >
                          {ROLE_ICONS[p.role] ?? ROLE_ICONS['default']}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-text-muted">
                      議題{meeting.agendaItems.length}件 · 決定{meeting.decisions.length}件
                    </span>
                  </div>
                </div>
              </div>
              <svg
                className={`w-5 h-5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* 展開コンテンツ */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 border-t border-bg-tertiary">
                {/* 議論タイムライン */}
                {meeting.discussions.map((disc, dIdx) => (
                  <div key={dIdx} className="mt-4">
                    <h4 className="text-xs font-medium text-accent-primary mb-2">
                      議題 {dIdx + 1}: {meeting.agendaItems[disc.agendaIndex]?.topic ?? '—'}
                    </h4>
                    <div className="space-y-2 pl-2 border-l-2 border-bg-tertiary">
                      {disc.statements.map((stmt, sIdx) => {
                        const icon = ROLE_ICONS[stmt.role] ?? ROLE_ICONS['default'];
                        return (
                          <div key={sIdx} className="pl-3 py-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span>{icon}</span>
                              <span className="font-medium text-text-primary">{stmt.speaker}</span>
                              <span className="text-text-muted">
                                {new Date(stmt.timestamp).toLocaleTimeString('ja-JP')}
                              </span>
                            </div>
                            <p className="text-sm text-text-secondary mt-0.5 ml-6">{stmt.content}</p>
                          </div>
                        );
                      })}
                      {/* ファシリテーターまとめ */}
                      {disc.summary && (
                        <div className="pl-3 py-2 ml-2 bg-accent-primary/10 rounded-md border-l-2 border-accent-primary">
                          <div className="text-xs text-accent-primary font-medium mb-1">📌 まとめ</div>
                          <p className="text-sm text-text-secondary">{disc.summary}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* 決定事項 */}
                {meeting.decisions.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-medium text-text-muted mb-2">決定事項</h4>
                    <div className="space-y-2">
                      {meeting.decisions.map((dec, idx) => (
                        <div key={idx} className="p-2 bg-status-pass/5 rounded border border-status-pass/20">
                          <div className="text-sm text-text-primary">{dec.topic}: {dec.decision}</div>
                          <div className="text-xs text-text-muted mt-0.5">理由: {dec.rationale}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* アクションアイテム */}
                {meeting.actionItems.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-medium text-text-muted mb-2">アクションアイテム</h4>
                    <div className="space-y-1">
                      {meeting.actionItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="text-text-muted">☐</span>
                          <span className="text-text-primary">{item.task}</span>
                          <span className="text-xs text-accent-primary">@{item.assignee}</span>
                          {item.deadline && (
                            <span className="text-xs text-text-muted">期限: {item.deadline}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default MeetingsTab;
