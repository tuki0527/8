import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Info } from 'lucide-react';
import { CANONICAL_CHAPTERS } from '../data/curriculum/index.ts';
import { useStudy } from '../context/StudyContext.tsx';
import { MASTERY_CONFIG } from '../domain/mastery.ts';

export const MasteryPage: React.FC = () => {
  const { chapterMasteries, conceptMasteries, dueReviews } = useStudy();
  const [chapterFilter, setChapterFilter] = useState('all');

  const filteredConcepts = useMemo(() => {
    if (chapterFilter === 'all') return conceptMasteries;
    return conceptMasteries.filter((c) => c.chapterId === chapterFilter);
  }, [conceptMasteries, chapterFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">概念掌握度與間隔複習</h1>
        <div
          className="flex items-start gap-2.5 rounded-2xl border p-4 text-xs leading-relaxed"
          style={{
            backgroundColor: 'var(--mc-bg-secondary)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-secondary)',
          }}
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--mc-accent)' }} aria-hidden="true" />
          <div className="space-y-1">
            <p>
              <strong>指標性質說明（演算法 v{MASTERY_CONFIG.algorithmVersion}）：</strong>
              本頁的掌握指標 <code className="font-mono">M</code> 為可解釋的自訂練習綜合指標，並非經過心理計量校準的考試機率預測。
            </p>
            <p style={{ color: 'var(--mc-text-muted)' }}>
              計算方式：每個概念取最近 {MASTERY_CONFIG.maxEvidencePerConcept} 筆獨立證據（同題 {MASTERY_CONFIG.sameQuestionCooldownHours} 小時內重複只計 1 次），單選權重 {MASTERY_CONFIG.singleChoiceWeight}、理解題檢核權重 {MASTERY_CONFIG.shortAnswerConceptCheckWeight}，採 {MASTERY_CONFIG.decayHalfLifeScaleDays} 天時間衰減與弱先驗 <code className="font-mono">A=(1+Σw·c)/(2+Σw)</code>。只有同難度同閱讀量級累積至少 {MASTERY_CONFIG.minSpeedBaselineSamples} 筆無中斷正確單選題後，才計算速度係數 <code className="font-mono">F</code>。
            </p>
          </div>
        </div>
      </header>

      {/* Chapter Summary Grid */}
      <section aria-label="各章節掌握摘要" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {chapterMasteries.map((cm) => {
          const ch = CANONICAL_CHAPTERS.find((c) => c.chapterId === cm.chapterId);
          return (
            <button
              key={cm.chapterId}
              type="button"
              onClick={() =>
                setChapterFilter((prev) => (prev === cm.chapterId ? 'all' : cm.chapterId))
              }
              className="text-left rounded-2xl border p-4 transition-colors hover:bg-white/5"
              style={{
                backgroundColor:
                  chapterFilter === cm.chapterId ? 'var(--mc-bg-elevated)' : 'var(--mc-bg-secondary)',
                borderColor:
                  chapterFilter === cm.chapterId ? 'var(--mc-accent)' : 'var(--mc-border)',
              }}
            >
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--mc-text-muted)' }}>
                <span>第 {ch?.order} 章</span>
                <span className="tabular-nums">
                  已測 {cm.testedConcepts}/{cm.totalConcepts} 概念
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold">{cm.titleZh}</p>
              <p className="mt-2 text-xs tabular-nums" style={{ color: 'var(--mc-text-secondary)' }}>
                {cm.testedConcepts === 0
                  ? '尚無作答資料（待測）'
                  : `掌握指標 ${cm.masteryIndex ?? '—'} · 正確率 ${cm.accuracyPercent ?? '—'}%${
                      cm.assessmentIncomplete ? ' · 評估未完成' : ''
                    }`}
              </p>
            </button>
          );
        })}
      </section>

      {/* Concept Details */}
      <section aria-label="概念明細" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            概念掌握明細（{filteredConcepts.length} 項）
          </h2>
          {chapterFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setChapterFilter('all')}
              className="text-xs hover:underline"
              style={{ color: 'var(--mc-accent)' }}
            >
              顯示全部 9 章概念
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filteredConcepts.map((m) => (
            <div
              key={m.conceptId}
              className="rounded-2xl border p-4 space-y-2.5"
              style={{
                backgroundColor: 'var(--mc-bg-secondary)',
                borderColor: 'var(--mc-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs" style={{ color: 'var(--mc-text-muted)' }}>
                    {m.chapterId.toUpperCase()} · {m.titleEn}
                  </p>
                  <h3 className="text-sm font-semibold mt-0.5">{m.titleZh}</h3>
                </div>
                <span
                  className="text-sm font-semibold tabular-nums shrink-0"
                  style={{
                    color:
                      m.status === 'untested'
                        ? 'var(--mc-text-muted)'
                        : m.masteryIndex !== null && m.masteryIndex >= 75
                        ? '#7fd1a8'
                        : '#f5b482',
                  }}
                >
                  {m.status === 'untested'
                    ? '待測'
                    : `${m.masteryIndex} 分${m.status === 'provisional' ? '（暫估）' : ''}`}
                </span>
              </div>

              {m.status !== 'untested' && (
                <div className="grid grid-cols-2 gap-2 text-xs tabular-nums" style={{ color: 'var(--mc-text-secondary)' }}>
                  <div>正確率：{m.accuracyPercent}%</div>
                  <div>獨立題數：{m.independentQuestionCount} 題</div>
                  <div>跨日天數：{m.distinctDatesCount} 天</div>
                  <div>
                    題型涵蓋：單選 {m.hasSingleChoice ? '✓' : '—'} · 理解 {m.hasShortAnswer ? '✓' : '—'}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--mc-text-muted)' }}>
                {m.status === 'provisional' && (
                  <span className="inline-flex items-center gap-1" style={{ color: '#e6c38d' }}>
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    樣本或跨日資料未達門檻（暫估 · 建議再測）
                  </span>
                )}
                {m.status === 'established' && (
                  <span className="inline-flex items-center gap-1" style={{ color: '#7fd1a8' }}>
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    已建立穩定評估樣本
                  </span>
                )}
                {m.insufficientSpeedData && m.status !== 'untested' && (
                  <span>· 速度資料尚不足</span>
                )}
                {m.needsSpeedRecheckCount > 0 && (
                  <span style={{ color: '#f5b482' }}>· {m.needsSpeedRecheckCount} 題作答過快需再次確認</span>
                )}
                {m.needsReviewSuggestion && (
                  <span style={{ color: '#f5b482' }}>· 超過 14 天未練習建議複習</span>
                )}
              </div>

              {m.recentMcqTimesMs.length > 0 && (
                <p className="text-[11px] tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
                  近期無中斷正確單選耗時（秒）：
                  {m.recentMcqTimesMs.map((ms) => (ms / 1000).toFixed(1)).join(' → ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Spaced Review Queue */}
      <section
        aria-label="間隔複習排程佇列"
        className="rounded-2xl border p-5 space-y-3"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <h2 className="text-lg font-semibold">間隔複習排程（1 / 3 / 7 / 14 天）</h2>
        <div className="divide-y" style={{ borderColor: 'var(--mc-border)' }}>
          {dueReviews.slice(0, 12).map((r) => (
            <div key={r.conceptId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
              <div>
                <p className="font-medium text-sm">{r.titleZh}</p>
                <p style={{ color: 'var(--mc-text-muted)' }}>
                  {r.chapterId.toUpperCase()} · {r.reasons.join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: 'var(--mc-text-secondary)' }}>
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>週期 {r.intervalDays} 天</span>
                </span>
                <Link
                  to={`/bank?chapter=${r.chapterId}&concept=${r.conceptId}`}
                  className="rounded-lg px-3 py-1.5 font-semibold"
                  style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
                >
                  前往練習
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
