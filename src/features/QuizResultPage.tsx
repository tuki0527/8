import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  Clock,
  Flag,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import { CSharpCodeBlock } from '../components/CSharpCodeBlock.tsx';
import { useStudy } from '../context/StudyContext.tsx';
import { reportAndMaybeInvalidate } from '../storage/studyStore.ts';

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

export const QuizResultPage: React.FC = () => {
  const { testRunId = '' } = useParams();
  const { snapshot, reloadSnapshot } = useStudy();

  const [reportingQuestionId, setReportingQuestionId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [invalidateOnReport, setInvalidateOnReport] = useState(true);
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  const run = useMemo(
    () => snapshot?.testRuns.find((r) => r.testRunId === testRunId) ?? null,
    [snapshot, testRunId]
  );

  const answers = useMemo(() => {
    if (!snapshot || !run) return [];
    return snapshot.answers
      .filter((a) => a.testRunId === run.testRunId)
      .sort((a, b) => a.questionIndex - b.questionIndex);
  }, [snapshot, run]);

  const evalByAnswerId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof snapshot>['evaluations'][number]>();
    for (const ev of snapshot?.evaluations ?? []) {
      if (ev.invalidated) continue;
      const prev = map.get(ev.answerId);
      if (!prev || ev.revision >= prev.revision) map.set(ev.answerId, ev);
    }
    return map;
  }, [snapshot]);

  if (!run) {
    return (
      <div
        className="mx-auto max-w-3xl rounded-2xl border p-8 text-center space-y-3"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <p className="text-base font-semibold">找不到測驗結果</p>
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

  const mcqs = answers.filter((a) => a.type === 'single_choice');
  const mcqCorrect = mcqs.filter((a) => a.correct === true).length;
  const shortAnswers = answers.filter((a) => a.type === 'short_answer');
  const pendingShorts = shortAnswers.filter((a) => a.status === 'pending_ai');
  const gradedShorts = shortAnswers.filter((a) => a.status === 'graded');
  const shortCorrect = gradedShorts.filter((a) => a.correct === true).length;

  const reinforceConcepts = Array.from(
    new Set(
      answers
        .filter((a) => a.status === 'graded' && a.correct === false)
        .map((a) => a.primaryConceptId)
    )
  );

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingQuestionId || !reportReason.trim()) return;
    await reportAndMaybeInvalidate({
      targetType: 'question',
      targetId: reportingQuestionId,
      reason: reportReason.trim(),
      invalidateTarget: invalidateOnReport,
    });
    await reloadSnapshot();
    setReportingQuestionId(null);
    setReportReason('');
    setReportNotice('已記錄題目回報；若勾選失效排除，該題作答將不計入掌握指標。');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Result Summary Banner */}
      <section
        className="rounded-2xl border p-5 sm:p-6 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs" style={{ color: 'var(--mc-text-muted)' }}>
              測驗結果總覽 · {run.setTitle}
            </p>
            <h1 className="mt-1 text-xl sm:text-2xl font-semibold">
              單選題 {mcqCorrect} / {mcqs.length}
              {pendingShorts.length === 0
                ? ` · 理解題 ${shortCorrect} / ${shortAnswers.length}`
                : ' · 總成績尚未完整'}
            </h1>
          </div>

          {pendingShorts.length > 0 && (
            <Link
              to={`/ai?task=evaluate_short_answers&testRunId=${run.testRunId}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>前往 AI 工作台批次批改這 {pendingShorts.length} 題理解題</span>
            </Link>
          )}
        </div>

        {pendingShorts.length > 0 && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border p-3.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-secondary)',
            }}
          >
            <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--mc-accent)' }} aria-hidden="true" />
            <span>
              尚有 <strong>{pendingShorts.length} 題理解作答題為「待 AI 判讀」</strong>
              。待評閱屬於工作流程狀態，絕不會被當成答錯，也不會計入錯題本；請在 AI 工作台完成 Plus 手動 JSON 批改以補齊總成績。
            </span>
          </div>
        )}

        {reinforceConcepts.length > 0 && (
          <div className="text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
            建議加強概念：{reinforceConcepts.join(' · ')}
          </div>
        )}

        {reportNotice && (
          <div
            role="status"
            className="rounded-xl border px-4 py-2.5 text-xs"
            style={{ borderColor: 'var(--mc-accent)', color: 'var(--mc-text-primary)' }}
          >
            {reportNotice}
          </div>
        )}
      </section>

      {/* Per-Question Full Review (All 10 answers unlocked) */}
      <section className="space-y-4">
        {run.questionSnapshots.map((snap, idx) => {
          const ans = answers.find((a) => a.questionIndex === idx);
          const ev = ans ? evalByAnswerId.get(ans.answerId) : undefined;
          const isPending = ans?.status === 'pending_ai';
          const isCorrect = ans?.status === 'graded' && ans.correct === true;
          const isWrong = ans?.status === 'graded' && ans.correct === false;

          return (
            <article
              key={`${snap.questionId}-${idx}`}
              className="rounded-2xl border p-5 space-y-3"
              style={{
                backgroundColor: 'var(--mc-bg-secondary)',
                borderColor: 'var(--mc-border)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="tabular-nums">第 {idx + 1} 題</span>
                  <span aria-hidden="true">·</span>
                  {isPending && (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--mc-accent)' }}>
                      <HelpCircle className="h-4 w-4" aria-hidden="true" />
                      <span>待 AI 判讀（未判讀不算答錯）</span>
                    </span>
                  )}
                  {isCorrect && (
                    <span className="inline-flex items-center gap-1" style={{ color: '#7fd1a8' }}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>答對</span>
                    </span>
                  )}
                  {isWrong && (
                    <span className="inline-flex items-center gap-1" style={{ color: '#f5b482' }}>
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      <span>答錯</span>
                    </span>
                  )}
                  {ans?.invalidated && (
                    <span style={{ color: 'var(--mc-text-muted)' }}>（已標記失效，不計統計）</span>
                  )}
                </div>

                {ans && (
                  <div className="flex items-center gap-3 text-xs tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      有效 {formatSeconds(ans.activeElapsedMs)} / 總時長 {formatSeconds(ans.wallElapsedMs)}
                      {ans.interrupted ? ' · 曾中斷' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReportingQuestionId(snap.questionId)}
                      className="inline-flex items-center gap-1 hover:underline"
                      style={{ color: 'var(--mc-text-secondary)' }}
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>回報題目異常</span>
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm font-medium leading-relaxed">{snap.prompt}</p>
              {snap.codeSnippet && <CSharpCodeBlock title="題目程式" code={snap.codeSnippet} />}

              {snap.type === 'single_choice' && snap.options ? (
                <div className="space-y-1.5 text-xs">
                  {snap.options.map((opt, oIdx) => {
                    const isRightOpt = snap.correctShuffledIndex === oIdx;
                    const isUserOpt = ans?.selectedShuffledIndex === oIdx;
                    return (
                      <div
                        key={oIdx}
                        className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                        style={{
                          backgroundColor: isRightOpt
                            ? 'rgba(70,150,115,0.14)'
                            : isUserOpt
                            ? 'rgba(212,124,93,0.14)'
                            : 'var(--mc-bg-primary)',
                          borderColor: isRightOpt
                            ? '#7fd1a8'
                            : isUserOpt
                            ? '#d47c5d'
                            : 'var(--mc-border)',
                        }}
                      >
                        <span>{opt}</span>
                        <span className="shrink-0 font-medium">
                          {isRightOpt ? '正確答案' : isUserOpt ? '您的選擇' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div
                    className="rounded-xl border p-3"
                    style={{ backgroundColor: 'var(--mc-bg-primary)', borderColor: 'var(--mc-border)' }}
                  >
                    <p className="font-medium" style={{ color: 'var(--mc-text-muted)' }}>
                      您的理解回答：
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: 'var(--mc-text-primary)' }}>
                      {ans?.textAnswer ?? '（無紀錄）'}
                    </p>
                  </div>
                  {ev ? (
                    <div
                      className="rounded-xl border p-3 space-y-2"
                      style={{ backgroundColor: 'var(--mc-bg-elevated)', borderColor: 'var(--mc-border)' }}
                    >
                      <p className="font-semibold">AI 逐點檢核回饋：{ev.reason}</p>
                      <ul className="space-y-1">
                        {ev.checks.map((c) => (
                          <li key={c.pointId} className="flex items-start gap-1.5">
                            <span>{c.met ? '✓' : '✗'}</span>
                            <span>
                              {c.conceptId}：{c.reason}（證據：{c.evidence || '無'}）
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p style={{ color: 'var(--mc-text-secondary)' }}>
                        <strong>參考理解方向：</strong>
                        {ev.referenceAnswer}
                      </p>
                    </div>
                  ) : (
                    snap.referenceAnswer && (
                      <div
                        className="rounded-xl border p-3"
                        style={{ backgroundColor: 'var(--mc-bg-elevated)', borderColor: 'var(--mc-border)' }}
                      >
                        <p className="font-medium" style={{ color: 'var(--mc-text-muted)' }}>
                          參考理解要點（完成 10 題後解鎖檢視）：
                        </p>
                        <p className="mt-1" style={{ color: 'var(--mc-text-secondary)' }}>
                          {snap.referenceAnswer}
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}

              <p className="text-xs leading-relaxed border-t pt-3" style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}>
                <strong>解析：</strong>
                {snap.explanation}
              </p>
            </article>
          );
        })}
      </section>

      {/* Inline Issue Report Modal */}
      {reportingQuestionId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="回報題目品質問題"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <form
            onSubmit={handleSubmitIssue}
            className="w-full max-w-md rounded-2xl border p-5 space-y-4"
            style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
          >
            <h2 className="text-base font-semibold">回報題目異常或瑕疵</h2>
            <p className="text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
              題目 ID：{reportingQuestionId}
            </p>
            <label className="block text-xs space-y-1">
              <span>問題說明（例如：選項有歧義、與 C# 行為不符）</span>
              <textarea
                rows={3}
                required
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-xl border p-2.5 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={invalidateOnReport}
                onChange={(e) => setInvalidateOnReport(e.target.checked)}
              />
              <span>同時將此題歷次作答標記為失效（從掌握指標排除）</span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportingQuestionId(null)}
                className="min-h-[40px] rounded-xl border px-4 py-2 text-xs"
                style={{ borderColor: 'var(--mc-border)' }}
              >
                取消
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
              >
                送出回報
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
