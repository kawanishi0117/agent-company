/**
 * @file Market Research Page
 * @description 市場調査リクエスト・レポート一覧画面
 * @see Requirements: 12.4, 12.6
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Loading, EmptyState } from '@/components/ui';

// =============================================================================
// 型定義
// =============================================================================

interface MarketReport {
  id: string;
  topic: string;
  overview: string;
  competitors: { name: string; strengths: string[]; weaknesses: string[] }[];
  trends: string[];
  recommendations: { title: string; description: string; priority: string }[];
  sources: string[];
  createdAt: string;
}

// =============================================================================
// 優先度バッジ
// =============================================================================

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-status-fail/20 text-status-fail',
  medium: 'bg-status-waiver/20 text-status-waiver',
  low: 'bg-bg-tertiary text-text-muted',
};

// =============================================================================
// レポート詳細パネル
// =============================================================================

function ReportDetail({
  report,
  onClose,
}: {
  report: MarketReport;
  onClose: () => void;
}): JSX.Element {
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{report.topic}</h2>
          <p className="text-xs text-text-muted mt-1">
            {new Date(report.createdAt).toLocaleString('ja-JP')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-sm"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      {/* 概要 */}
      <div>
        <h3 className="text-sm font-semibold text-text-secondary mb-1">概要</h3>
        <p className="text-sm text-text-primary">{report.overview}</p>
      </div>

      {/* 競合分析 */}
      {report.competitors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-2">競合分析</h3>
          <div className="space-y-2">
            {report.competitors.map((comp, i) => (
              <div key={i} className="p-3 rounded-md bg-bg-primary border border-bg-tertiary">
                <p className="text-sm font-medium text-text-primary">{comp.name}</p>
                {comp.strengths.length > 0 && (
                  <p className="text-xs text-status-pass mt-1">
                    強み: {comp.strengths.join(', ')}
                  </p>
                )}
                {comp.weaknesses.length > 0 && (
                  <p className="text-xs text-status-fail mt-0.5">
                    弱み: {comp.weaknesses.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* トレンド */}
      {report.trends.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-2">トレンド</h3>
          <ul className="space-y-1">
            {report.trends.map((trend, i) => (
              <li key={i} className="text-sm text-text-primary flex items-start gap-2">
                <span className="text-accent-primary mt-0.5">→</span>
                {trend}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 推奨アクション */}
      {report.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-2">推奨アクション</h3>
          <div className="space-y-2">
            {report.recommendations.map((rec, i) => (
              <div key={i} className="p-3 rounded-md bg-bg-primary border border-bg-tertiary">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.low
                    }`}
                  >
                    {rec.priority}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{rec.title}</span>
                </div>
                <p className="text-xs text-text-secondary">{rec.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 情報源 */}
      {report.sources.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-1">情報源</h3>
          <ul className="text-xs text-text-muted space-y-0.5">
            {report.sources.map((src, i) => (
              <li key={i}>• {src}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// メインページ
// =============================================================================

export default function MarketPage(): JSX.Element {
  const [reports, setReports] = useState<MarketReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<MarketReport | null>(null);
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/market-research');
      const json = await res.json();
      setReports(json.data ?? []);
    } catch {
      // エラー時は前回値を維持
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 調査リクエスト送信 */
  const handleSubmit = async (): Promise<void> => {
    if (!topic.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/market-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const json = await res.json();
      if (json.error) {
        setMessage(`❌ ${json.error}`);
      } else {
        setMessage('✅ 調査リクエストを送信しました');
        setTopic('');
        await loadData();
      }
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : '送信に失敗しました'}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading message="市場調査データを読み込み中..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Market Research</h1>
        <p className="text-sm text-text-secondary mt-1">
          市場調査リクエストとレポート管理
        </p>
      </div>

      {/* 調査リクエストフォーム */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">新規調査リクエスト</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="調査トピックを入力（例: AIコーディングツール市場）"
            className="flex-1 px-3 py-2 text-sm rounded-md
              bg-bg-primary border border-bg-tertiary
              text-text-primary placeholder:text-text-muted
              focus:outline-none focus:ring-2 focus:ring-accent-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !topic.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md
              bg-accent-primary text-white
              hover:bg-accent-hover transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '送信中...' : '調査開始'}
          </button>
        </div>
        {message && (
          <p className={`text-sm mt-2 ${
            message.startsWith('✅') ? 'text-status-pass' : 'text-status-fail'
          }`}>
            {message}
          </p>
        )}
      </Card>

      {/* レポート詳細 */}
      {selectedReport && (
        <ReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}

      {/* レポート一覧 */}
      {reports.length === 0 ? (
        <EmptyState message="市場調査レポートはまだありません" />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            過去のレポート（{reports.length}件）
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reports.map((report) => (
              <Card
                key={report.id}
                className="p-4 cursor-pointer hover:border-slate-500 transition-colors"
                onClick={() => setSelectedReport(report)}
              >
                <h3 className="text-sm font-semibold text-text-primary">{report.topic}</h3>
                <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                  {report.overview}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                  <span>{new Date(report.createdAt).toLocaleDateString('ja-JP')}</span>
                  {report.competitors.length > 0 && (
                    <span>競合: {report.competitors.length}社</span>
                  )}
                  {report.recommendations.length > 0 && (
                    <span>推奨: {report.recommendations.length}件</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
