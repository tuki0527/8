import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FileUp,
  Info,
  RefreshCw,
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
  buildAiPromptFilename,
  buildEvaluateShortAnswersRequest,
  buildGenerateSetRequest,
  buildRewriteSlideRequest,
  extractJsonFromPaste,
  validateAndTransformAiImport,
} from '../domain/aiRoundtrip.ts';
import type { AiRequest, AiTaskType, RewriteMode } from '../domain/types.ts';
import { applyValidatedAiImport, saveAiRequestRecord } from '../storage/studyStore.ts';

const TASK_LABELS: Record<AiTaskType, string> = {
  generate_question_set: '任務 A：產生 7+3 新題組',
  evaluate_short_answers: '任務 B：批改 3 題理解題',
  rewrite_slide: '任務 C：改寫簡報比喻與版面',
};

function triggerUtf8TextDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

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
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [fallbackActiveRequest, setFallbackActiveRequest] = useState<AiRequest | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<{
    ok: boolean;
    message: string;
    targetReq?: AiRequest;
  } | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [pasteJson, setPasteJson] = useState('');
  const [validation, setValidation] = useState<AiImportValidationResult | null>(null);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const activeRequest = useMemo(() => {
    if (!activeRequestId) return fallbackActiveRequest;
    return (
      snapshot?.aiRequests.find((r) => r.requestId === activeRequestId) ?? fallbackActiveRequest
    );
  }, [activeRequestId, fallbackActiveRequest, snapshot?.aiRequests]);

  const handleGeneratePrompt = async () => {
    setGenError(null);
    setApplyMsg(null);
    setValidation(null);
    setDownloadNotice(null);
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
      setFallbackActiveRequest(req);
      setActiveRequestId(req.requestId);
      await reloadSnapshot();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '產生提示詞失敗');
    }
  };

  const handleDownloadPromptTxt = (targetReq: AiRequest | null) => {
    if (!targetReq || !targetReq.promptText.trim()) {
      setDownloadNotice({
        ok: false,
        message: '目前沒有可下載的提示詞內容，請先點擊「產生提示詞與 Request ID」。',
      });
      return;
    }
    const filename = buildAiPromptFilename(targetReq.task, targetReq.requestId);
    try {
      triggerUtf8TextDownload(filename, targetReq.promptText);
      setDownloadNotice({
        ok: true,
        message: `已開始下載提示詞檔案「${filename}」（UTF-8 純文字 .txt，Request ID：${targetReq.requestId.slice(0, 12)}…，不會產生重複請求）。`,
        targetReq,
      });
    } catch (err) {
      setDownloadNotice({
        ok: false,
        message: `提示詞檔案下載失敗，請重試或改用下方「複製提示詞（備用）」：${err instanceof Error ? err.message : String(err)}`,
        targetReq,
      });
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
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    setUploadedFileName(file.name);
    setPasteJson(text);
    setValidation(null);
    setApplyMsg(null);
  };

  const handleApplyValidated = async () => {
    if (!validation || !validation.ok) return;
    const parsed = JSON.parse(extractJsonFromPaste(pasteJson)) as { requestId: string };
    await applyValidatedAiImport(parsed.requestId, validation);
    await reloadSnapshot();
    if (validation.task === 'evaluate_short_answers' && validation.evaluations.length === 0) {
      setApplyMsg(
        `此評閱結果先前已匯入並套用過（Request ID：${parsed.requestId.slice(0, 12)}…），不會重複計分；其他待回覆請求仍維持獨立狀態。`
      );
    } else {
      setApplyMsg(`已驗證並套用：${validation.summary}`);
    }
    setValidation(null);
    setPasteJson('');
    setUploadedFileName(null);
  };

  const sortedRequests = useMemo(() => {
    return [...(snapshot?.aiRequests ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
  }, [snapshot?.aiRequests]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
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

        {/* Clear 5-step TXT -> ChatGPT -> JSON flow guide */}
        <div
          className="rounded-2xl border p-4 space-y-2.5 text-xs"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold" style={{ color: 'var(--mc-text-primary)' }}>
              檔案往返建議流程（降低網頁複製貼上格式損毀）
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5"
                style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-accent)' }}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>送給 ChatGPT：提示詞 TXT</span>
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5"
                style={{ borderColor: 'var(--mc-border)', color: '#7fd1a8' }}
              >
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>從 ChatGPT 帶回網站：回覆 JSON</span>
              </span>
            </div>
          </div>

          <ol className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
            <li className="rounded-lg border px-2.5 py-1" style={{ borderColor: 'var(--mc-border)' }}>
              1. 下載提示詞 TXT
            </li>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <li className="rounded-lg border px-2.5 py-1" style={{ borderColor: 'var(--mc-border)' }}>
              2. 交給 ChatGPT Plus
            </li>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <li className="rounded-lg border px-2.5 py-1" style={{ borderColor: 'var(--mc-border)' }}>
              3. 取得 .json 附件
            </li>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <li className="rounded-lg border px-2.5 py-1" style={{ borderColor: 'var(--mc-border)' }}>
              4. 匯入並執行驗證
            </li>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <li className="rounded-lg border px-2.5 py-1" style={{ borderColor: 'var(--mc-border)' }}>
              5. 確認套用至本機
            </li>
          </ol>
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
              setActiveRequestId(null);
              setFallbackActiveRequest(null);
              setDownloadNotice(null);
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

      {/* Step 1: Configure & Download Prompt TXT */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            步驟 1：產生並下載提示詞檔案（送給 ChatGPT：提示詞 .txt）
          </h2>
          <span className="text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            提示詞要求 AI 優先回傳可下載的 .json 檔案附件
          </span>
        </div>

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
          <p role="alert" className="text-xs" style={{ color: '#f5b482' }}>
            {genError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {!activeRequest ? (
            <button
              type="button"
              onClick={() => void handleGeneratePrompt()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>產生提示詞與 Request ID</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleGeneratePrompt()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium hover:bg-white/5"
              style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-primary)' }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>重新產生（建立新 Request ID）</span>
            </button>
          )}

          <button
            type="button"
            disabled={!activeRequest}
            onClick={() => handleDownloadPromptTxt(activeRequest)}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-40"
            style={
              activeRequest
                ? { backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }
                : {
                    backgroundColor: 'var(--mc-bg-elevated)',
                    border: '1px solid var(--mc-border)',
                    color: 'var(--mc-text-muted)',
                  }
            }
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>下載提示詞（.txt）</span>
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

        {!activeRequest && (
          <p className="text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            尚未產生提示詞時「下載提示詞（.txt）」會維持停用，以避免下載空白檔案；請先點選上方「產生提示詞與 Request ID」。
          </p>
        )}

        {downloadNotice && (
          <div
            role={downloadNotice.ok ? 'status' : 'alert'}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs"
            style={{
              backgroundColor: downloadNotice.ok ? 'var(--mc-bg-elevated)' : 'rgba(180,60,50,0.14)',
              borderColor: downloadNotice.ok ? 'var(--mc-accent)' : '#d47c5d',
              color: downloadNotice.ok ? 'var(--mc-text-primary)' : '#f5b482',
            }}
          >
            <span>{downloadNotice.message}</span>
            {!downloadNotice.ok && downloadNotice.targetReq && (
              <button
                type="button"
                onClick={() => handleDownloadPromptTxt(downloadNotice.targetReq ?? null)}
                className="rounded-lg border px-2.5 py-1 font-medium hover:bg-white/5"
                style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-primary)' }}
              >
                重試下載 .txt
              </button>
            )}
          </div>
        )}

        {activeRequest && (
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2" style={{ color: 'var(--mc-text-muted)' }}>
                <span>
                  Request ID：<code className="font-mono">{activeRequest.requestId}</code>
                </span>
                <span>· Epoch {activeRequest.baseDatasetEpoch}</span>
                <span>·</span>
                <span style={{ color: activeRequest.status === 'applied' ? '#7fd1a8' : '#e6c38d' }}>
                  {activeRequest.status === 'applied' ? '已套用' : '待回覆'}
                </span>
                <span className="hidden sm:inline">
                  · 檔名：<code className="font-mono">{buildAiPromptFilename(activeRequest.task, activeRequest.requestId)}</code>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyPrompt()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-white/5"
                style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
              >
                {copiedPrompt ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                <span>{copiedPrompt ? '已複製全部提示詞' : '複製提示詞（備用）'}</span>
              </button>
            </div>
            <textarea
              readOnly
              aria-label="提示詞純文字預覽"
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

      {/* Step 2: Import .json File (primary) / Paste fallback & Validate */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              步驟 2：匯入 ChatGPT 回覆並驗證（帶回網站：回覆 .json）
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mc-text-muted)' }}>
              建議直接上傳 ChatGPT 產生的 .json 檔案，可避免網頁複製時產生 HTML 編碼字元或行尾反斜線。
            </p>
          </div>
          <label
            className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            <FileUp className="h-4 w-4" aria-hidden="true" />
            <span>匯入 .json 檔案</span>
            <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="sr-only" />
          </label>
        </div>

        {uploadedFileName && (
          <p className="text-xs" style={{ color: '#7fd1a8' }}>
            已載入回覆檔案：<code className="font-mono">{uploadedFileName}</code>（請執行下方驗證並確認套用）
          </p>
        )}

        <label className="block space-y-1.5 text-xs">
          <span style={{ color: 'var(--mc-text-secondary)' }}>
            JSON 內容預覽／貼上備用區（支援純 JSON 或單層 ```json 區塊）
          </span>
          <textarea
            rows={8}
            value={pasteJson}
            onChange={(e) => {
              setPasteJson(e.target.value);
              setUploadedFileName(null);
              setValidation(null);
            }}
            placeholder="建議使用上方「匯入 .json 檔案」載入 ChatGPT 回覆附件；若 ChatGPT 未提供檔案下載，也可將純 JSON 貼於此處…"
            className="w-full rounded-xl border p-3 text-xs font-mono leading-relaxed"
            style={{
              backgroundColor: 'var(--mc-bg-primary)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          />
        </label>

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

      {/* Independent Per-Request History */}
      {sortedRequests.length > 0 && (
        <section
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <div>
            <h2 className="text-sm font-semibold">本機 AI 請求紀錄（供核對 requestId）</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mc-text-muted)' }}>
              各筆 Request ID 彼此獨立呈現狀態；重新下載既有請求的 .txt 檔案不會建立新請求或覆蓋其他待回覆項目。
            </p>
          </div>
          <div className="divide-y text-xs" style={{ borderColor: 'var(--mc-border)' }}>
            {sortedRequests.map((req) => (
              <div key={req.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{req.requestId.slice(0, 12)}…</span>
                  <span style={{ color: 'var(--mc-text-secondary)' }}>
                    · {TASK_LABELS[req.task] ?? req.task}
                  </span>
                  <span
                    className="rounded-md border px-2 py-0.5 font-medium"
                    style={{
                      borderColor: req.status === 'applied' ? 'rgba(127,209,168,0.45)' : 'rgba(230,195,141,0.45)',
                      color: req.status === 'applied' ? '#7fd1a8' : '#e6c38d',
                    }}
                  >
                    {req.status === 'applied' ? '已套用' : '待回覆'}
                  </span>
                  <span style={{ color: 'var(--mc-text-muted)' }}>
                    {new Date(req.createdAt).toLocaleString('zh-TW')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTask(req.task);
                      setFallbackActiveRequest(req);
                      setActiveRequestId(req.requestId);
                      setDownloadNotice(null);
                    }}
                    className="hover:underline"
                    style={{ color: 'var(--mc-text-secondary)' }}
                  >
                    檢視提示詞
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadPromptTxt(req)}
                    className="inline-flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--mc-accent)' }}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>下載 .txt</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
