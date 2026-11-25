import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Lock,
  Pause,
  Play,
  Send,
} from 'lucide-react';
import { CSharpCodeBlock } from '../components/CSharpCodeBlock.tsx';
import { useStudy } from '../context/StudyContext.tsx';
import { submitCurrentQuestionAnswer } from '../domain/quizEngine.ts';
import type { AnswerRecord, TestRun } from '../domain/types.ts';
import { getDb } from '../storage/db.ts';
import { commitQuizAnswer, updateInProgressRunTimer } from '../storage/studyStore.ts';

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const QuizRunnerPage: React.FC = () => {
  const { testRunId = '' } = useParams();
  const navigate = useNavigate();
  const { reloadSnapshot } = useStudy();

  const [run, setRun] = useState<TestRun | null>(null);
  const [runAnswers, setRunAnswers] = useState<AnswerRecord[]>([]);
  const [loadingRun, setLoadingRun] = useState(true);
  const [viewIndex, setViewIndex] = useState(0);

  const [selectedOption, setSelectedOption] = useState<0 | 1 | 2 | 3 | undefined>(undefined);
  const [textAnswer, setTextAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Timing state: activeElapsedMs pauses on hidden/blur/manual pause; wallElapsedMs tracks total elapsed
  const [activeMs, setActiveMs] = useState(0);
  const [wallMs, setWallMs] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);

  const activeMsRef = useRef(0);
  const wallMsRef = useRef(0);
  const interruptedRef = useRef(false);
  const isPausedRef = useRef(false);
  const lastTickRef = useRef<number | null>(null);
  const runRef = useRef<TestRun | null>(null);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const loadRunFromDb = useCallback(async () => {
    setLoadingRun(true);
    try {
      const db = await getDb();
      const loadedRun = await db.get('test_runs', testRunId);
      if (!loadedRun) {
        setRun(null);
        return;
      }
      if (loadedRun.status === 'completed') {
        navigate(`/quiz/${loadedRun.testRunId}/result`, { replace: true });
        return;
      }
      const existingAns = await db.getAllFromIndex('answers', 'by-testRun', loadedRun.testRunId);
      existingAns.sort((a, b) => a.questionIndex - b.questionIndex);

      setRun(loadedRun);
      setRunAnswers(existingAns);
      setViewIndex(loadedRun.currentIndex);
      setSelectedOption(undefined);
      setTextAnswer('');

      activeMsRef.current = loadedRun.accumulatedActiveMsForCurrent || 0;
      wallMsRef.current = loadedRun.accumulatedWallMsForCurrent || 0;
      interruptedRef.current = Boolean(loadedRun.currentInterrupted);
      setActiveMs(activeMsRef.current);
      setWallMs(wallMsRef.current);
      setInterrupted(interruptedRef.current);
    } finally {
      setLoadingRun(false);
    }
  }, [navigate, testRunId]);

  useEffect(() => {
    void loadRunFromDb();
  }, [loadRunFromDb]);

  // Start timer ONLY after question & code snippet have rendered (Rule 7.6)
  useEffect(() => {
    if (!run || viewIndex !== run.currentIndex) {
      setTimerStarted(false);
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      lastTickRef.current = Date.now();
      setTimerStarted(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [run, viewIndex]);

  // Tick loop + visibilitychange/blur interruption handling
  useEffect(() => {
    if (!timerStarted || !run) return;

    const persistProgress = () => {
      const curr = runRef.current;
      if (!curr || curr.status !== 'in_progress') return;
      void updateInProgressRunTimer({
        ...curr,
        accumulatedActiveMsForCurrent: Math.round(activeMsRef.current),
        accumulatedWallMsForCurrent: Math.round(wallMsRef.current),
        currentInterrupted: interruptedRef.current,
      });
    };

    const interval = window.setInterval(() => {
      const now = Date.now();
      const prev = lastTickRef.current ?? now;
      const delta = Math.max(0, Math.min(2000, now - prev));
      lastTickRef.current = now;

      wallMsRef.current += delta;
      setWallMs(wallMsRef.current);

      const docVisible = document.visibilityState === 'visible';
      if (docVisible && !isPausedRef.current) {
        activeMsRef.current += delta;
        setActiveMs(activeMsRef.current);
      }
    }, 500);

    const persistTimer = window.setInterval(persistProgress, 4000);

    const markInterruptedAndPause = () => {
      if (document.visibilityState === 'hidden') {
        interruptedRef.current = true;
        setInterrupted(true);
        isPausedRef.current = true;
        setIsPaused(true);
        persistProgress();
      }
    };

    const onBlur = () => {
      interruptedRef.current = true;
      setInterrupted(true);
      persistProgress();
    };

    document.addEventListener('visibilitychange', markInterruptedAndPause);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', persistProgress);

    return () => {
      window.clearInterval(interval);
      window.clearInterval(persistTimer);
      document.removeEventListener('visibilitychange', markInterruptedAndPause);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', persistProgress);
      persistProgress();
    };
  }, [timerStarted, run]);

  const toggleManualPause = () => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (next) {
      interruptedRef.current = true;
      setInterrupted(true);
    } else {
      lastTickRef.current = Date.now();
    }
  };

  const currentSnap = useMemo(
    () => (run ? run.questionSnapshots[viewIndex] : undefined),
    [run, viewIndex]
  );

  const submittedAnswerForView = useMemo(
    () => runAnswers.find((a) => a.questionIndex === viewIndex) ?? null,
    [runAnswers, viewIndex]
  );

  const isViewingPreviousLocked = Boolean(run && viewIndex < run.currentIndex);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!run || !currentSnap || isViewingPreviousLocked || submitting) return;
    setErrorMsg(null);

    if (currentSnap.type === 'single_choice' && selectedOption === undefined) {
      setErrorMsg('請先選擇一個單選題選項再確認作答。');
      return;
    }
    if (currentSnap.type === 'short_answer' && textAnswer.trim().length === 0) {
      setErrorMsg('理解題不可為空白，請以自己的話寫下理解後再送出。');
      return;
    }

    setSubmitting(true);
    try {
      const { answerRecord, updatedRun } = await submitCurrentQuestionAnswer({
        testRun: run,
        selectedShuffledIndex: selectedOption,
        textAnswer,
        activeElapsedMs: activeMsRef.current,
        wallElapsedMs: wallMsRef.current,
        interrupted: interruptedRef.current,
        viewedHintOrAnswerBefore: false,
      });

      runRef.current = updatedRun;
      await commitQuizAnswer(answerRecord, updatedRun);
      await reloadSnapshot();

      if (updatedRun.status === 'completed') {
        setRun(updatedRun);
        navigate(`/quiz/${updatedRun.testRunId}/result`, { replace: true });
        return;
      }

      setRun(updatedRun);
      setRunAnswers((prev) => [...prev, answerRecord]);
      setViewIndex(updatedRun.currentIndex);
      setSelectedOption(undefined);
      setTextAnswer('');
      activeMsRef.current = 0;
      wallMsRef.current = 0;
      interruptedRef.current = false;
      isPausedRef.current = false;
      setActiveMs(0);
      setWallMs(0);
      setInterrupted(false);
      setIsPaused(false);
      lastTickRef.current = Date.now();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '儲存作答失敗，請再試一次。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingRun) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center text-sm" style={{ color: 'var(--mc-text-muted)' }}>
        正在載入測驗狀態…
      </div>
    );
  }

  if (!run || !currentSnap) {
    return (
      <div
        className="mx-auto max-w-3xl rounded-2xl border p-8 text-center space-y-3"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <p className="text-base font-semibold">找不到此測驗紀錄</p>
        <Link
          to="/bank"
          className="inline-flex min-h-[40px] items-center rounded-xl px-4 py-2 text-xs font-semibold"
          style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
        >
          返回題庫
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Quiz Status Header */}
      <div
        className="rounded-2xl border p-4 sm:p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs" style={{ color: 'var(--mc-text-muted)' }}>
              {run.setTitle} · {currentSnap.type === 'single_choice' ? '單選題' : '理解作答題'}
            </p>
            <h1 className="text-lg font-semibold mt-0.5">
              第 {viewIndex + 1} / 10 題
            </h1>
          </div>

          {/* Timer & Pause */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right text-xs tabular-nums" style={{ color: 'var(--mc-text-secondary)' }}>
              <div className="flex items-center justify-end gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>有效作答 {formatMs(isViewingPreviousLocked ? submittedAnswerForView?.activeElapsedMs ?? 0 : activeMs)}</span>
              </div>
              {interrupted && !isViewingPreviousLocked && (
                <p className="text-[11px]" style={{ color: '#e6c38d' }}>
                  已標記離開／暫停，本題僅計正確率不計速度加成
                </p>
              )}
            </div>

            {!isViewingPreviousLocked && (
              <button
                type="button"
                onClick={toggleManualPause}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: 'var(--mc-border)', backgroundColor: 'var(--mc-bg-elevated)' }}
              >
                {isPaused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
                <span>{isPaused ? '繼續計時' : '暫停'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 1..10 Progress Buttons (can only view submitted 0..currentIndex-1 read-only, or currentIndex) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {run.questionSnapshots.map((_, i) => {
            const isSubmitted = i < run.answerIds.length;
            const isCurrent = i === run.currentIndex;
            const canClick = isSubmitted || isCurrent;
            const active = i === viewIndex;
            return (
              <button
                key={i}
                type="button"
                disabled={!canClick}
                onClick={() => setViewIndex(i)}
                className="min-h-[36px] min-w-[36px] rounded-lg border text-xs font-medium tabular-nums disabled:opacity-35"
                style={{
                  backgroundColor: active
                    ? 'var(--mc-accent)'
                    : isSubmitted
                    ? 'var(--mc-bg-elevated)'
                    : 'transparent',
                  color: active ? 'var(--mc-accent-text)' : 'var(--mc-text-secondary)',
                  borderColor: active ? 'var(--mc-accent)' : 'var(--mc-border)',
                }}
                title={
                  isSubmitted
                    ? `第 ${i + 1} 題已鎖定送出（僅供唯讀檢視）`
                    : isCurrent
                    ? `第 ${i + 1} 題作答中`
                    : '必須送出前一題後才可作答'
                }
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question Card */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border p-5 sm:p-6 space-y-5"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            <span>主要概念：{currentSnap.primaryConceptId}</span>
            <span>
              {isViewingPreviousLocked
                ? '已送出鎖定（全部 10 題完成後統一顯示解析）'
                : '確認作答後將鎖定本題答案'}
            </span>
          </div>
          <p className="text-base leading-relaxed font-medium">{currentSnap.prompt}</p>
        </div>

        {currentSnap.codeSnippet && (
          <CSharpCodeBlock title="題目程式碼片段" code={currentSnap.codeSnippet} />
        )}

        {/* Options or Short Answer */}
        {currentSnap.type === 'single_choice' && currentSnap.options ? (
          <fieldset disabled={isViewingPreviousLocked || submitting} className="space-y-2.5">
            <legend className="sr-only">單選題選項</legend>
            {currentSnap.options.map((opt, idx) => {
              const typedIdx = idx as 0 | 1 | 2 | 3;
              const isChosen = isViewingPreviousLocked
                ? submittedAnswerForView?.selectedShuffledIndex === typedIdx
                : selectedOption === typedIdx;
              return (
                <label
                  key={idx}
                  className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors"
                  style={{
                    backgroundColor: isChosen ? 'var(--mc-bg-elevated)' : 'var(--mc-bg-primary)',
                    borderColor: isChosen ? 'var(--mc-accent)' : 'var(--mc-border)',
                  }}
                >
                  <input
                    type="radio"
                    name={`q-${viewIndex}`}
                    checked={isChosen}
                    onChange={() => {
                      setSelectedOption(typedIdx);
                      setErrorMsg(null);
                    }}
                    className="mt-1 shrink-0"
                  />
                  <span className="leading-relaxed">{opt}</span>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-medium" style={{ color: 'var(--mc-text-secondary)' }}>
              請以自己的理解作答（不要求逐字背誦；送出後進入「待 AI 評閱」狀態，絕不會因待評而被當成答錯）
            </label>
            <textarea
              rows={5}
              readOnly={isViewingPreviousLocked}
              disabled={submitting}
              value={isViewingPreviousLocked ? submittedAnswerForView?.textAnswer ?? '' : textAnswer}
              onChange={(e) => {
                setTextAnswer(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="例如：說明設計目的、責任歸屬、或與其他寫法相比的優缺點…"
              className="w-full rounded-xl border p-3.5 text-sm leading-relaxed"
              style={{
                backgroundColor: 'var(--mc-bg-primary)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            />
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs"
            style={{
              backgroundColor: 'rgba(180,60,50,0.14)',
              borderColor: '#d47c5d',
              color: '#f5b482',
            }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: 'var(--mc-border)' }}
        >
          {isViewingPreviousLocked ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>此題已作答並鎖定，尚不可查看解析</span>
              </span>
              <button
                type="button"
                onClick={() => setViewIndex(run.currentIndex)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                <span>回到目前題目（第 {run.currentIndex + 1} 題）</span>
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>送出後自動保存本機 IndexedDB</span>
              </span>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>{run.currentIndex === 9 ? '送出最後一題並查看結果' : '確認作答並下一題'}</span>
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};
