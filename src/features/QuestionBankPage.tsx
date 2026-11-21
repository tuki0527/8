import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, ChevronLeft, ChevronRight, Play, Trash2 } from 'lucide-react';
import { ALL_CONCEPTS, CANONICAL_CHAPTERS, CHAPTERS_BY_ID } from '../data/curriculum/index.ts';
import { MoonSeaHero } from '../components/MoonSeaHero.tsx';
import { useStudy } from '../context/StudyContext.tsx';
import { createTestRun } from '../domain/quizEngine.ts';
import type { QuestionSet } from '../domain/types.ts';
import { getQuestionSetsPage } from '../storage/db.ts';
import { createDeletionTombstone, recordTestRunStart } from '../storage/studyStore.ts';

const PAGE_SIZE = 20;

export const QuestionBankPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { settings, snapshot, reloadSnapshot, timeInfo } = useStudy();

  const [chapterFilter, setChapterFilter] = useState(searchParams.get('chapter') ?? 'all');
  const [conceptFilter, setConceptFilter] = useState(searchParams.get('concept') ?? 'all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'seed' | 'ai_import'>('all');
  const [attemptedFilter, setAttemptedFilter] = useState<'all' | 'done' | 'todo'>('all');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<QuestionSet[]>([]);
  const [total, setTotal] = useState(0);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const attemptedSetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of snapshot?.testRuns ?? []) {
      if (run.status === 'completed') ids.add(run.setId);
    }
    return ids;
  }, [snapshot]);

  const inProgressBySetId = useMemo(() => {
    const map = new Map<string, string>();
    for (const run of snapshot?.testRuns ?? []) {
      if (run.status === 'in_progress') {
        map.set(run.setId, run.testRunId);
      }
    }
    return map;
  }, [snapshot]);

  const availableConcepts = useMemo(() => {
    if (chapterFilter === 'all') return ALL_CONCEPTS;
    return CHAPTERS_BY_ID.get(chapterFilter)?.concepts ?? ALL_CONCEPTS;
  }, [chapterFilter]);

  useEffect(() => {
    let active = true;
    void getQuestionSetsPage({
      page,
      pageSize: PAGE_SIZE,
      chapterId: chapterFilter,
      source: sourceFilter === 'all' ? undefined : sourceFilter,
      difficulty: difficultyFilter,
      conceptId: conceptFilter,
      attemptedSetIds,
      attemptedFilter,
    }).then((res) => {
      if (!active) return;
      setItems(res.items);
      setTotal(res.total);
    });
    return () => {
      active = false;
    };
  }, [
    page,
    chapterFilter,
    sourceFilter,
    difficultyFilter,
    conceptFilter,
    attemptedFilter,
    attemptedSetIds,
    snapshot,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStartTest = async (set: QuestionSet) => {
    const existingRunId = inProgressBySetId.get(set.setId);
    if (existingRunId) {
      navigate(`/quiz/${existingRunId}`);
      return;
    }
    const run = createTestRun(set, settings.deviceId);
    await recordTestRunStart(run);
    await reloadSnapshot();
    navigate(`/quiz/${run.testRunId}`);
  };

  const handleDeleteSet = async (setId: string) => {
    setBusyDeleteId(setId);
    try {
      await createDeletionTombstone({
        targetType: 'question_set',
        targetId: setId,
        mode: 'delete_set',
        reason: '使用者於題庫手動刪除題組',
        deviceId: settings.deviceId,
      });
      setConfirmDeleteId(null);
      await reloadSnapshot();
    } finally {
      setBusyDeleteId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <MoonSeaHero
        compact
        timeInfo={timeInfo}
        title="題庫與測驗入口"
        subtitle="每次固定 10 題為一組（7 題單選題 + 3 題以自己理解作答的理解題），作答鎖定後紀錄有效時間。"
        rightSlot={
          <Link
            to="/ai?task=generate_question_set"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(13,22,34,0.75)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
            <span>透過 ChatGPT Plus 擴充新題組</span>
          </Link>
        }
      />

      {/* Filter Bar */}
      <section
        aria-label="題庫篩選條件"
        className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-5"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>章節</span>
          <select
            value={chapterFilter}
            onChange={(e) => {
              setChapterFilter(e.target.value);
              setConceptFilter('all');
              setPage(1);
            }}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部 9 章</option>
            {CANONICAL_CHAPTERS.map((ch) => (
              <option key={ch.chapterId} value={ch.chapterId}>
                第 {ch.order} 章：{ch.titleZh}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>核心概念</span>
          <select
            value={conceptFilter}
            onChange={(e) => {
              setConceptFilter(e.target.value);
              setPage(1);
            }}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部概念</option>
            {availableConcepts.map((c) => (
              <option key={c.conceptId} value={c.conceptId}>
                {c.titleZh}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>難度</span>
          <select
            value={difficultyFilter}
            onChange={(e) => {
              setDifficultyFilter(e.target.value);
              setPage(1);
            }}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部難度</option>
            <option value="beginner">基礎 (beginner)</option>
            <option value="intermediate">進階 (intermediate)</option>
            <option value="advanced">綜合挑戰 (advanced)</option>
          </select>
        </label>

        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>來源</span>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value as 'all' | 'seed' | 'ai_import');
              setPage(1);
            }}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部來源</option>
            <option value="seed">內建教材種子題組</option>
            <option value="ai_import">ChatGPT Plus 匯入題組</option>
          </select>
        </label>

        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>作答狀態</span>
          <select
            value={attemptedFilter}
            onChange={(e) => {
              setAttemptedFilter(e.target.value as 'all' | 'done' | 'todo');
              setPage(1);
            }}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部題組 ({total})</option>
            <option value="todo">尚未完成</option>
            <option value="done">已完成過</option>
          </select>
        </label>
      </section>

      {/* QuestionSet Cards */}
      {items.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center text-sm"
          style={{
            backgroundColor: 'var(--mc-bg-secondary)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-secondary)',
          }}
        >
          目前篩選條件下沒有符合的題組，請放寬篩選條件或匯入新的 AI 題組。
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((set) => {
            const ch = CHAPTERS_BY_ID.get(set.chapterId);
            const inProgressId = inProgressBySetId.get(set.setId);
            const isDone = attemptedSetIds.has(set.setId);
            const isConfirming = confirmDeleteId === set.setId;
            return (
              <div
                key={set.setId}
                className="flex flex-col justify-between rounded-2xl border p-5"
                style={{
                  backgroundColor: 'var(--mc-bg-secondary)',
                  borderColor: 'var(--mc-border)',
                }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
                    第 {ch?.order ?? '?'} 章 ·{' '}
                    {set.source === 'seed' ? '內建種子題組' : 'AI 匯入題組'} ·{' '}
                    {set.difficulty === 'beginner'
                      ? '基礎'
                      : set.difficulty === 'advanced'
                      ? '進階挑戰'
                      : '中等實務'}
                    {isDone ? ' · 已作答過' : ''}
                  </p>
                  <h2 className="mt-1.5 text-base font-semibold">{set.title}</h2>
                  <p className="mt-2 text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
                    涵蓋 {set.conceptIds.length} 項概念 · 7 題單選題 + 3 題理解題（共 10 題）
                  </p>
                </div>

                <div
                  className="mt-4 border-t pt-3 flex flex-wrap items-center justify-between gap-2"
                  style={{ borderColor: 'var(--mc-border)' }}
                >
                  {isConfirming ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span style={{ color: '#f5b482' }}>確定建立刪除標記 (Tombstone)？</span>
                      <button
                        type="button"
                        disabled={busyDeleteId === set.setId}
                        onClick={() => void handleDeleteSet(set.setId)}
                        className="rounded-lg bg-red-900/60 px-3 py-1.5 font-medium text-red-100"
                      >
                        確認刪除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border px-3 py-1.5"
                        style={{ borderColor: 'var(--mc-border)' }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(set.setId)}
                        aria-label={`刪除題組 ${set.title}`}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-white/5"
                        style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-muted)' }}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>移除</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleStartTest(set)}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
                        style={{
                          backgroundColor: 'var(--mc-accent)',
                          color: 'var(--mc-accent-text)',
                        }}
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{inProgressId ? '繼續進行中的測驗' : '開始 10 題測驗'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border px-3 py-1.5 disabled:opacity-40"
            style={{ borderColor: 'var(--mc-border)' }}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>上一頁</span>
          </button>
          <span className="tabular-nums" style={{ color: 'var(--mc-text-secondary)' }}>
            第 {page} / {totalPages} 頁（共 {total} 組）
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border px-3 py-1.5 disabled:opacity-40"
            style={{ borderColor: 'var(--mc-border)' }}
          >
            <span>下一頁</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
