import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Clock,
  FileWarning,
  Layers,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { CANONICAL_CHAPTERS } from '../data/curriculum/index.ts';
import { MoonSeaHero } from '../components/MoonSeaHero.tsx';
import { useStudy } from '../context/StudyContext.tsx';

export const HomePage: React.FC = () => {
  const {
    settings,
    snapshot,
    loading,
    loadError,
    timeInfo,
    chapterMasteries,
    dueReviews,
    wrongBookEntries,
    pendingAiCount,
    saveStatusMessage,
  } = useStudy();

  const inProgressRun = useMemo(
    () =>
      snapshot?.testRuns
        .filter((r) => r.status === 'in_progress')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null,
    [snapshot]
  );

  const completedRunCount = useMemo(
    () => snapshot?.testRuns.filter((r) => r.status === 'completed').length ?? 0,
    [snapshot]
  );

  const activeWrongCount = useMemo(
    () => wrongBookEntries.filter((w) => !w.hiddenFromWrongBook).length,
    [wrongBookEntries]
  );

  const nextRecommendedChapter = useMemo(() => {
    const untested = chapterMasteries.find((c) => c.testedConcepts < c.totalConcepts);
    return untested?.chapterId ?? CANONICAL_CHAPTERS[0].chapterId;
  }, [chapterMasteries]);

  const urgentReviews = useMemo(
    () => dueReviews.filter((r) => r.lastPracticedAt !== null).slice(0, 4),
    [dueReviews]
  );

  const continueLink = inProgressRun
    ? `/quiz/${inProgressRun.testRunId}`
    : `/chapters/${nextRecommendedChapter}`;
  const continueLabel = inProgressRun
    ? `繼續未完成測驗（第 ${inProgressRun.answerIds.length + 1}/10 題）`
    : '繼續教材學習';

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <MoonSeaHero
        timeInfo={timeInfo}
        title={settings.appName}
        subtitle="以 C# 範例為核心，循序掌握物件導向設計、封裝、多型、低耦合高內聚與 MVC 架構。"
        rightSlot={
          <Link
            to={continueLink}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>{continueLabel}</span>
          </Link>
        }
      />

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border p-4 text-sm"
          style={{
            backgroundColor: 'var(--mc-bg-elevated)',
            borderColor: '#d47c5d',
            color: '#f5b482',
          }}
        >
          本機資料庫提示：{loadError}
        </div>
      )}

      {/* Honest Summary Strip */}
      <section aria-label="學習現況摘要" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>已完成測驗</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {loading ? '…' : `${completedRunCount} 組`}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
            題庫共 {snapshot?.questionSets.length ?? 0} 組（每組 7 單選 + 3 理解題）
          </p>
        </div>

        <Link
          to="/ai"
          className="rounded-2xl border p-4 transition-colors hover:bg-white/5"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            <Bot className="h-4 w-4" aria-hidden="true" />
            <span>待 AI 評閱理解題</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {loading ? '…' : `${pendingAiCount} 題`}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
            {pendingAiCount > 0
              ? '待評閱不算答錯，可前往 Plus JSON 工作台批改'
              : '目前沒有待批改的理解題'}
          </p>
        </Link>

        <Link
          to="/wrong-book"
          className="rounded-2xl border p-4 transition-colors hover:bg-white/5"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            <FileWarning className="h-4 w-4" aria-hidden="true" />
            <span>待複習錯題</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {loading ? '…' : `${activeWrongCount} 題`}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
            僅收錄已判讀且答錯題目
          </p>
        </Link>

        <Link
          to="/storage"
          className="rounded-2xl border p-4 transition-colors hover:bg-white/5"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>資料與同步狀態</span>
          </div>
          <p className="mt-2 text-base font-semibold truncate">{saveStatusMessage}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
            本機 IndexedDB 主存 · Epoch {snapshot?.syncEpoch ?? 1}
          </p>
        </Link>
      </section>

      {/* Today's Review Queue or Honest First-Visit Onboarding */}
      <section
        aria-label="今日建議複習"
        className="rounded-2xl border p-5"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">今日複習與行動建議</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--mc-text-muted)' }}>
              依據最近作答正確性與 1/3/7/14 天遺忘節奏排序，絕無偽造進度。
            </p>
          </div>
          <Link
            to="/mastery"
            className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-medium hover:underline"
            style={{ color: 'var(--mc-accent)' }}
          >
            <span>查看完整掌握度指標</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {completedRunCount === 0 && !inProgressRun ? (
          <div
            className="mt-4 rounded-xl border p-4 text-sm"
            style={{ backgroundColor: 'var(--mc-bg-elevated)', borderColor: 'var(--mc-border)' }}
          >
            <p className="font-medium">尚未開始練習或尚無測驗紀錄</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
              建議先從第 1 章簡報理解物件與資料夾帶行為的思維轉換，或直接前往題庫完成第一組 7 單選 + 3 理解題測驗，系統便會建立專屬的間隔複習清單。
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                to="/chapters/ch1"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                <span>進入第 1 章簡報</span>
              </Link>
              <Link
                to="/bank"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium"
                style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-primary)' }}
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>瀏覽 9 組種子題組</span>
              </Link>
            </div>
          </div>
        ) : urgentReviews.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--mc-text-secondary)' }}>
            目前沒有已到期的複習概念；可繼續學習尚未測驗的章節或挑戰新的 AI 題組。
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {urgentReviews.map((item) => (
              <Link
                key={item.conceptId}
                to={`/bank?chapter=${item.chapterId}&concept=${item.conceptId}`}
                className="flex flex-col justify-between rounded-xl border p-4 transition-colors hover:bg-white/5"
                style={{ backgroundColor: 'var(--mc-bg-elevated)', borderColor: 'var(--mc-border)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.titleZh}</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
                      {item.chapterId.toUpperCase()} · {item.reasons.join(' · ')}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 text-xs tabular-nums shrink-0"
                    style={{ color: 'var(--mc-accent)' }}
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{item.masteryIndex !== null ? `指標 ${item.masteryIndex}` : '待測'}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 9-Chapter Curriculum Map */}
      <section aria-label="9 章節核心教材" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">課程章節地圖（第 1 至第 9 章）</h2>
          <Link
            to="/bank"
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--mc-accent)' }}
          >
            前往題庫全部練習
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CANONICAL_CHAPTERS.map((ch) => {
            const cm = chapterMasteries.find((m) => m.chapterId === ch.chapterId);
            const tested = cm?.testedConcepts ?? 0;
            const total = cm?.totalConcepts ?? ch.concepts.length;
            return (
              <div
                key={ch.chapterId}
                className="flex flex-col justify-between rounded-2xl border p-5"
                style={{
                  backgroundColor: 'var(--mc-bg-secondary)',
                  borderColor: 'var(--mc-border)',
                }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
                    第 {ch.order} 章 · {ch.titleEn}
                  </p>
                  <h3 className="mt-1 text-base font-semibold">{ch.titleZh}</h3>
                  <p
                    className="mt-2 text-xs leading-relaxed"
                    style={{ color: 'var(--mc-text-secondary)' }}
                  >
                    {ch.summary}
                  </p>
                </div>

                <div
                  className="mt-4 border-t pt-3 flex items-center justify-between gap-2 text-xs"
                  style={{ borderColor: 'var(--mc-border)' }}
                >
                  <div className="tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
                    {tested === 0 ? (
                      <span>待測（0/{total} 概念）</span>
                    ) : (
                      <span>
                        已測 {tested}/{total} 概念
                        {cm?.masteryIndex !== null ? ` · 指標 ${cm?.masteryIndex}` : ''}
                        {cm?.assessmentIncomplete ? ' · 評估未完成' : ''}
                      </span>
                    )}
                  </div>
                  <Link
                    to={`/chapters/${ch.chapterId}`}
                    className="inline-flex min-h-[36px] items-center gap-1 font-medium shrink-0 hover:underline"
                    style={{ color: 'var(--mc-accent)' }}
                  >
                    <span>讀簡報</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
