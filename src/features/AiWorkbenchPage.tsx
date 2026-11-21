import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileUp,
  Info,
} from 'lucide-react';
import {
  ALL_CONCEPTS,
  CANONICAL_CHAPTERS,
  CHAPTERS_BY_ID,
  SLIDES_BY_ID,
} from '../data/curriculum/index.ts';
import { useStudy } from '../context/StudyContext.tsx';
import {
  type AiImportValidationResult,
  MANUAL_AI_ADAPTER_STATUS,
  UNVERIFIED_AUTO_ADAPTER_STATUS,
  buildEvaluateShortAnswersRequest,
  buildGenerateSetRequest,
  buildRewriteSlideRequest,
  validateAndTransformAiImport,
} from '../domain/aiRoundtrip.ts';
import type { AiRequest, AiTaskType, RewriteMode } from '../domain/types.ts';
import { applyValidatedAiImport, saveAiRequestRecord } from '../storage/studyStore.ts';

export const AiWorkbenchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const {
    settings,
    snapshot,
    reloadSnapshot,
    conceptMasteries,
    dueReviews,
  } = useStudy();

  const initialTask = (searchParams.get('task') as AiTaskType | null) ?? 'generate_question_set';
  const [task, setTask] = useState<AiTaskType>(initialTask);

  // Task A: generate_question_set
  const [genChapterId, setGenChapterId] = useState(
    searchParams.get('chapterId') ?? CANONICAL_CHAPTERS[0].chapterId
  );

  // Task B: evaluate_short_answers
  const pendingRuns = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.testRuns.filter((run) => {
      if (run.status !== 'completed') return false;
      const runShortAnswers = snapshot.answers.filter(
        (a) => a.testRunId === run.testRunId && a.type === 'short_answer' && !a.invalidated
      );
      return runShortAnswers.length === 3 && runShortAnswers.some((a) => a.status === 'pending_ai');
    });
  }, [snapshot]);

  const [selectedRunId, setSelectedRunId] = useState(searchParams.get('testRunId') ?? '');
  useEffect(() => {
    if (!selectedRunId && pendingRuns.length > 0) {
      setSelectedRunId(pendingRuns[0].testRunId);
    }
  }, [pendingRuns, selectedRunId]);

  // Task C: rewrite_slide
  const [rewriteChapterId, setRewriteChapterId] = useState(
    searchParams.get('chapterId') ?? CANONICAL_CHAPTERS[0].chapterId
  );
  const rewriteChapter = CHAPTERS_BY_ID.get(rewriteChapterId) ?? CANONICAL_CHAPTERS[0];
  const [rewriteSlideId, setRewriteSlideId] = useState(
    searchParams.get('slideId') ?? rewriteChapter.slides[0].slideId
  );
  const [rewriteMode, setRewriteMode] = useState<RewriteMode>('analogy_only');
  const [rewriteInstruction, setRewriteInstruction] = useState('');

  useEffect(() => {
    if (!rewriteChapter.slides.some((s) => s.slideId === rewriteSlideId)) {
      setRewriteSlideId(rewriteChapter.slides[0].slideId);
    }
  }, [rewriteChapter, rewriteSlideId]);

  // Prompt & Response Import state
  const [activeRequest, setActiveRequest] = useState<AiRequest | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [pasteJson, setPasteJson] = useState('');
  const [validation, setValidation] = useState<AiImportValidationResult | null>(null);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const handleGeneratePrompt = async () => {
    setGenError(null);
    setApplyMsg(null);
    setValidation(null);
    const epoch = snapshot?.syncEpoch ?? 1;

    try {
      let req: AiRequest;
      if (task === 'generate_question_set') {
        const ch = CHAPTERS_BY_ID.get(genChapterId) ?? CANONICAL_CHAPTERS[0];
        const recentStems = (snapshot?.questionSets ?? [])
          .filter((s) => s.chapterId === ch.chapterId)
          .flatMap((s) =>
            s.questions.map((q) => ({
              questionId: q.questionId,
              stem: q.prompt,
              primaryConceptId: q.primaryConceptId,
            }))
          )
          .slice(-settings.recentQuestionTitlesLimit);

        req = buildGenerateSetRequest({
          chapter: ch,
          recentQuestionStems: recentStems,
          conceptMasteries,
          dueReviews,
          baseDatasetEpoch: epoch,
          maxRecentTitles: settings.recentQuestionTitlesLimit,
        });
      } else if (task === 'evaluate_short_answers') {
        const run = snapshot?.testRuns.find((r) => r.testRunId === selectedRunId);
        if (!run) {
          setGenError('目前沒有包含 3 題待批改理解題的已完成測驗。');
          return;
        }
        const shortAnswers = (snapshot?.answers ?? [])
          .filter((a) => a.testRunId === run.testRunId && a.type === 'short_answer' && !a.invalidated)
          .sort((a, b) => a.questionIndex - b.questionIndex);
        req = buildEvaluateShortAnswersRequest(run, shortAnswers, epoch);
      } else {
        const slide = SLIDES_BY_ID.get(rewriteSlideId);
        if (!slide) {
          setGenError('找不到目標簡報。');
          return;
        }
        req = buildRewriteSlideRequest(slide, rewriteMode, rewriteInstruction, epoch);
      }

      await saveAiRequestRecord(req);
      await reloadSnapshot();
      setActiveRequest(req);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '產生提示詞失敗');
    }
  };

  const handleCopyPrompt = async () => {
    if (!activeRequest) return;
    await navigator.clipboard.writeText(activeRequest.promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1800);
  };

  const handleValidateJson = async () => {
    setApplyMsg(null);
    if (!pasteJson.trim()) return;
    const validConceptIds = new Set(ALL_CONCEPTS.map((c) => c.conceptId));
    const validChapterIds = new Set(CANONICAL_CHAPTERS.map((c) => c.chapterId));
    const answersById = new Map((snapshot?.answers ?? []).map((a) => [a.answerId, a]));

    const res = await validateAndTransformAiImport(pasteJson, {
      pendingRequests: snapshot?.aiRequests ?? [],
      validConceptIds,
      validChapterIds,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: snapshot?.evaluations ?? [],
      existingVariants: snapshot?.slideVariants ?? [],
      currentDatasetEpoch: snapshot?.syncEpoch ?? 1,
    });
    setValidation(res);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPasteJson(text);
    setValidation(null);
  };

  const handleApplyValidated = async () => {
    if (!validation || !validation.ok) return;
    const parsed = JSON.parse(
      pasteJson.trim().replace(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i, '$1')
    ) as { requestId: string };
    await applyValidatedAiImport(parsed.requestId, validation);
    await reloadSnapshot();
    setApplyMsg(`已驗證並套用：${validation.summary}`);
    setValidation(null);
    setPasteJson('');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">AI 互動工作台</h1>
        <div className="grid gap-3 md:grid-cols-2 text-xs">
          <div
            className="rounded-2xl border p-4 space-y-1"
            style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-accent)' }}
          >
            <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--mc-accent)' }}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>{MANUAL_AI_ADAPTER_STATUS.label}（已啟用）</span>
            </div>
            <p style={{ color: 'var(--mc-text-secondary)' }}>
              {MANUAL_AI_ADAPTER_STATUS.description}
            </p>
          </div>

          <div
            className="rounded-2xl border p-4 space-y-1"
            style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
          >
            <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--mc-text-muted)' }}>
              <Info className="h-4 w-4" aria-hidden="true" />
              <span>{UNVERIFIED_AUTO_ADAPTER_STATUS.label}</span>
            </div>
            <p style={{ color: 'var(--mc-text-muted)' }}>
              {UNVERIFIED_AUTO_ADAPTER_STATUS.description}
            </p>
          </div>
        </div>
      </header>

      {/* Task Selector */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'generate_question_set', label: '任務 A：產生 7+3 新題組' },
            {
              id: 'evaluate_short_answers',
              label: `任務 B：批次評閱 3 題理解題 (${pendingRuns.length} 組待評)`,
            },
            { id: 'rewrite_slide', label: '任務 C：改寫簡報比喻與版面' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTask(t.id);
              setActiveRequest(null);
              setGenError(null);
            }}
            className="min-h-[42px] rounded-xl border px-4 py-2 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: task === t.id ? 'var(--mc-accent)' : 'var(--mc-bg-secondary)',
              color: task === t.id ? 'var(--mc-accent-text)' : 'var(--mc-text-secondary)',
              borderColor: task === t.id ? 'var(--mc-accent)' : 'var(--mc-border)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Step 1: Configure & Generate Prompt Packet */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <h2 className="text-base font-semibold">步驟 1：產生帶驗證權杖的提示詞與資料包</h2>

        {task === 'generate_question_set' && (
          <label className="block text-xs space-y-1 max-w-md">
            <span style={{ color: 'var(--mc-text-secondary)' }}>目標章節</span>
            <select
              value={genChapterId}
              onChange={(e) => setGenChapterId(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'var(--mc-bg-elevated)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            >
              {CANONICAL_CHAPTERS.map((ch) => (
                <option key={ch.chapterId} value={ch.chapterId}>
                  第 {ch.order} 章：{ch.titleZh}
                </option>
              ))}
            </select>
          </label>
        )}

        {task === 'evaluate_short_answers' && (
          <div className="space-y-2 max-w-xl">
            <label className="block text-xs space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>選擇待評閱的測驗紀錄（每組含 3 題理解題）</span>
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-elevated)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              >
                {pendingRuns.length === 0 ? (
                  <option value="">目前沒有待評閱理解題的測驗</option>
                ) : (
                  pendingRuns.map((r) => (
                    <option key={r.testRunId} value={r.testRunId}>
                      {r.setTitle} ({new Date(r.submittedAt ?? r.startedAt).toLocaleString('zh-TW')})
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        )}

        {task === 'rewrite_slide' && (
          <div className="grid gap-3 md:grid-cols-3 text-xs">
            <label className="block space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>章節</span>
              <select
                value={rewriteChapterId}
                onChange={(e) => setRewriteChapterId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: 'var(--mc-bg-elevated)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              >
                {CANONICAL_CHAPTERS.map((ch) => (
                  <option key={ch.chapterId} value={ch.chapterId}>
                    第 {ch.order} 章：{ch.titleZh}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>目標簡報頁</span>
              <select
                value={rewriteSlideId}
                onChange={(e) => setRewriteSlideId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: 'var(--mc-bg-elevated)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              >
                {rewriteChapter.slides.map((s, i) => (
                  <option key={s.slideId} value={s.slideId}>
                    {i + 1}. {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>改寫範圍</span>
              <select
                value={rewriteMode}
                onChange={(e) => setRewriteMode(e.target.value as RewriteMode)}
                className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: 'var(--mc-bg-elevated)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              >
                <option value="analogy_only">僅改寫生活比喻與白話說明</option>
                <option value="presentation_only">改寫比喻、詳盡度與版面布局</option>
              </select>
            </label>
            <label className="block space-y-1 md:col-span-3">
              <span style={{ color: 'var(--mc-text-secondary)' }}>補充提示（例如：請用餐廳點餐比喻）</span>
              <input
                type="text"
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                placeholder="選填：輸入希望加強的比喻方向…"
                className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              />
            </label>
          </div>
        )}

        {genError && (
          <p className="text-xs" style={{ color: '#f5b482' }}>
            {genError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleGeneratePrompt()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
            <span>產生提示詞與 Request ID</span>
          </button>

          <a
            href="https://chatgpt.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium hover:bg-white/5"
            style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-primary)' }}
          >
            <span>另開 ChatGPT Plus 分頁</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        {activeRequest && (
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span style={{ color: 'var(--mc-text-muted)' }}>
                Request ID：<code className="font-mono">{activeRequest.requestId}</code> · Epoch {activeRequest.baseDatasetEpoch}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyPrompt()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5"
                style={{ borderColor: 'var(--mc-border)' }}
              >
                {copiedPrompt ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                <span>{copiedPrompt ? '已複製全部提示詞' : '複製提示詞'}</span>
              </button>
            </div>
            <textarea
              readOnly
              rows={9}
              value={activeRequest.promptText}
              className="w-full rounded-xl border p-3 text-xs font-mono leading-relaxed"
              style={{
                backgroundColor: 'var(--mc-bg-primary)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-secondary)',
              }}
            />
          </div>
        )}
      </section>

      {/* Step 2: Paste / Import & Validate Response JSON */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">步驟 2：貼回或匯入 ChatGPT JSON 回覆並驗證</h2>
          <label
            className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-white/5"
            style={{ borderColor: 'var(--mc-border)' }}
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>匯入 .json 檔案</span>
            <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="sr-only" />
          </label>
        </div>

        <textarea
          rows={8}
          value={pasteJson}
          onChange={(e) => {
            setPasteJson(e.target.value);
            setValidation(null);
          }}
          placeholder="將 ChatGPT Plus 回覆的純 JSON（或單層 ```json ... ``` 區塊）貼於此處…"
          className="w-full rounded-xl border p-3 text-xs font-mono leading-relaxed"
          style={{
            backgroundColor: 'var(--mc-bg-primary)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-primary)',
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!pasteJson.trim()}
            onClick={() => void handleValidateJson()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold disabled:opacity-40"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <span>執行完整 Schema 與安全性驗證</span>
          </button>

          {validation?.ok && (
            <button
              type="button"
              onClick={() => void handleApplyValidated()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>確認套用至本機資料庫</span>
            </button>
          )}
        </div>

        {validation && !validation.ok && (
          <div
            role="alert"
            className="rounded-xl border p-4 space-y-1.5 text-xs"
            style={{
              backgroundColor: 'rgba(180,60,50,0.14)',
              borderColor: '#d47c5d',
              color: '#f5b482',
            }}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <span>驗證失敗，已拒絕套用（未寫入任何資料）：</span>
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {validation?.ok && (
          <div
            role="status"
            className="rounded-xl border p-4 text-xs"
            style={{
              backgroundColor: 'rgba(70,150,115,0.14)',
              borderColor: '#7fd1a8',
              color: '#b9f0d4',
            }}
          >
            <strong>預覽驗證通過：</strong>
            {validation.summary}
          </div>
        )}

        {applyMsg && (
          <div
            role="status"
            className="rounded-xl border p-4 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-accent)',
              color: 'var(--mc-text-primary)',
            }}
          >
            {applyMsg}
          </div>
        )}
      </section>

      {/* Pending Requests History */}
      {(snapshot?.aiRequests.length ?? 0) > 0 && (
        <section
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <h2 className="text-sm font-semibold">本機 AI 請求紀錄（供核對 requestId）</h2>
          <div className="divide-y text-xs" style={{ borderColor: 'var(--mc-border)' }}>
            {[...(snapshot?.aiRequests ?? [])]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 8)
              .map((req) => (
                <div key={req.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <span className="font-mono">{req.requestId.slice(0, 12)}…</span> · {req.task} ·{' '}
                    <span style={{ color: req.status === 'applied' ? '#7fd1a8' : '#e6c38d' }}>
                      {req.status === 'applied' ? '已套用' : '待回覆'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRequest(req)}
                    className="hover:underline"
                    style={{ color: 'var(--mc-accent)' }}
                  >
                    檢視提示詞
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
};
