import {
  AiEvaluateAnswersPayloadSchema,
  AiGenerateSetPayloadSchema,
  AiResponseEnvelopeSchema,
  AiRewriteSlidePayloadSchema,
  LOCKED_SLIDE_KEYS,
  formatZodIssues,
  validateQuestionSetWithConcepts,
} from '../schemas/runtimeSchemas.ts';
import { generateUuid, sha256Canonical } from './hash.ts';
import type {
  AiRequest,
  AnswerRecord,
  CanonicalChapter,
  CanonicalSlide,
  Evaluation,
  MasterySummary,
  QuestionSet,
  ReviewItem,
  RewriteMode,
  SlideVariant,
  TestRun,
} from './types.ts';

/**
 * Safely strips at most ONE outer markdown ```json ... ``` fence without using eval().
 */
export function extractJsonFromPaste(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

export interface GenerateSetPromptContext {
  chapter: CanonicalChapter;
  recentQuestionStems: Array<{ questionId: string; stem: string; primaryConceptId: string }>;
  conceptMasteries: MasterySummary[];
  dueReviews: ReviewItem[];
  baseDatasetEpoch: number;
  maxRecentTitles: number;
}

export function buildGenerateSetRequest(ctx: GenerateSetPromptContext): AiRequest {
  const requestId = generateUuid();
  const nowIso = new Date().toISOString();
  const chapterConcepts = ctx.chapter.concepts.map((c) => ({
    conceptId: c.conceptId,
    titleZh: c.titleZh,
    titleEn: c.titleEn,
    summary: c.summary,
  }));
  const conceptIdsSet = new Set(ctx.chapter.concepts.map((c) => c.conceptId));
  const weakConcepts = ctx.conceptMasteries
    .filter((m) => conceptIdsSet.has(m.conceptId))
    .map((m) => ({
      conceptId: m.conceptId,
      status: m.status,
      masteryIndex: m.masteryIndex,
      accuracyPercent: m.accuracyPercent,
    }));
  const due = ctx.dueReviews
    .filter((r) => r.chapterId === ctx.chapter.chapterId)
    .slice(0, 5)
    .map((r) => ({ conceptId: r.conceptId, reasons: r.reasons }));

  const recentStems = ctx.recentQuestionStems
    .slice(0, ctx.maxRecentTitles)
    .map((q) => ({ id: q.questionId, concept: q.primaryConceptId, promptPreview: q.stem.slice(0, 120) }));

  const packet = {
    task: 'generate_question_set',
    requestId,
    baseDatasetEpoch: ctx.baseDatasetEpoch,
    chapterId: ctx.chapter.chapterId,
    contentVersion: ctx.chapter.contentVersion,
    chapterTitle: `${ctx.chapter.titleZh} (${ctx.chapter.titleEn})`,
    concepts: chapterConcepts,
    conceptStats: weakConcepts,
    dueReviews: due,
    avoidRepeatingRecentQuestions: recentStems,
  };

  const promptText = `你是一位嚴謹的 C# 物件導向與 MVC 教學命題老師。請使用繁體中文（臺灣技術用語），根據下方資料產生一組恰好 10 題的題組：
- 必須恰好包含 7 題 single_choice（4 個不重複選項、correctOptionIndex 為 0..3）與 3 題 short_answer（理解題，需含 requiredPoints 對應 conceptId、coreMisconceptions、acceptablePrinciples、referenceAnswer）。
- 涵蓋本章主要概念，並加強弱點與到期複習概念，避免與近期題目重複。
- 僅輸出純 JSON，不要附加任何 Markdown 解釋文字。若新題使用暫時 localId，匯入時會由系統指派正式 UUID；也可填寫 "questionId": "local-q1" .. "local-q10"。
- 必須嚴格符合以下回傳信封結構：
{
  "format": "mooncode.ai_response",
  "schemaVersion": 1,
  "task": "generate_question_set",
  "requestId": "${requestId}",
  "baseDatasetEpoch": ${ctx.baseDatasetEpoch},
  "payload": {
    "chapterId": "${ctx.chapter.chapterId}",
    "contentVersion": ${ctx.chapter.contentVersion},
    "title": "題組標題",
    "conceptIds": ${JSON.stringify(ctx.chapter.concepts.map((c) => c.conceptId))},
    "difficulty": "intermediate",
    "questions": [ /* 7 single_choice + 3 short_answer */ ]
  }
}

出題參考資料包：
${JSON.stringify(packet, null, 2)}`;

  return {
    format: 'mooncode.ai_request',
    schemaVersion: 1,
    requestId,
    task: 'generate_question_set',
    baseDatasetEpoch: ctx.baseDatasetEpoch,
    createdAt: nowIso,
    status: 'pending',
    meta: { chapterId: ctx.chapter.chapterId },
    promptText,
  };
}

export function buildEvaluateShortAnswersRequest(
  testRun: TestRun,
  shortAnswers: AnswerRecord[],
  baseDatasetEpoch: number
): AiRequest {
  if (shortAnswers.length !== 3) {
    throw new Error('理解題批次評閱必須恰好對應 3 題作答紀錄。');
  }
  const requestId = generateUuid();
  const nowIso = new Date().toISOString();

  const items = shortAnswers.map((ans) => {
    const snap = testRun.questionSnapshots[ans.questionIndex];
    return {
      testRunId: testRun.testRunId,
      answerId: ans.answerId,
      questionId: ans.questionId,
      questionVersion: ans.questionVersion,
      answerHash: ans.answerHash,
      rubricVersion: snap?.rubricVersion ?? 1,
      prompt: snap?.prompt ?? '',
      codeSnippet: snap?.codeSnippet ?? null,
      requiredPoints: snap?.requiredPoints ?? [],
      coreMisconceptions: snap?.coreMisconceptions ?? [],
      acceptablePrinciples: snap?.acceptablePrinciples ?? [],
      referenceAnswer: snap?.referenceAnswer ?? '',
      studentAnswer: ans.textAnswer ?? '',
    };
  });

  const promptText = `你是一位重視理解而非逐字背誦的 C# 講師。請根據每題的 requiredPoints、coreMisconceptions 與 acceptablePrinciples 評閱這 3 題理解題作答。
評閱規則：
1. 允許口語、不同比喻與同義表達；不可因字數短、用詞不完全相同或打字速度慢而判錯。
2. 每個必要點輸出 met (true/false)、從學生回答中摘錄的 evidence 與理由 reason。
3. 只有「所有必要點皆為 true 且無核心矛盾 contradictions」時 correct 才為 true；不提供模糊的半對分數。
4. 不可修改 requestId、testRunId、answerId、questionVersion、answerHash、rubricVersion。
5. 僅回傳純 JSON，勿加多餘說明。

回傳格式：
{
  "format": "mooncode.ai_response",
  "schemaVersion": 1,
  "task": "evaluate_short_answers",
  "requestId": "${requestId}",
  "baseDatasetEpoch": ${baseDatasetEpoch},
  "payload": {
    "testRunId": "${testRun.testRunId}",
    "evaluations": [
      {
        "testRunId": "${testRun.testRunId}",
        "answerId": "<對應 answerId>",
        "questionId": "<對應 questionId>",
        "questionVersion": 1,
        "answerHash": "<原樣帶回 answerHash>",
        "rubricVersion": 1,
        "checks": [
          { "pointId": "p1", "conceptId": "...", "met": true, "evidence": "...", "reason": "..." }
        ],
        "contradictions": [],
        "correct": true,
        "reason": "總結說明",
        "referenceAnswer": "參考解答",
        "reviewConceptIds": []
      }
    ]
  }
}

待評閱作答資料包（共 3 題）：
${JSON.stringify(items, null, 2)}`;

  return {
    format: 'mooncode.ai_request',
    schemaVersion: 1,
    requestId,
    task: 'evaluate_short_answers',
    baseDatasetEpoch,
    createdAt: nowIso,
    status: 'pending',
    meta: {
      testRunId: testRun.testRunId,
      answerIds: shortAnswers.map((a) => a.answerId),
    },
    promptText,
  };
}

export function buildRewriteSlideRequest(
  slide: CanonicalSlide,
  mode: RewriteMode,
  userInstruction: string,
  baseDatasetEpoch: number
): AiRequest {
  const requestId = generateUuid();
  const nowIso = new Date().toISOString();

  const packet = {
    slideId: slide.slideId,
    chapterId: slide.chapterId,
    baseContentVersion: slide.contentVersion,
    mode,
    userInstruction: userInstruction.trim() || '請以清晰的生活比喻與白話說明協助理解，程式碼與定義保持不變。',
    lockedContextDoNotModify: {
      corePoint: slide.corePoint,
      definition: slide.locked.definition,
      code: slide.locked.code,
      expectedBehavior: slide.locked.expectedBehavior,
      learningObjectives: slide.locked.learningObjectives,
    },
    currentEditable: slide.editable,
    allowedFieldsForMode:
      mode === 'analogy_only'
        ? ['analogy', 'plainExplanation']
        : ['analogy', 'plainExplanation', 'detailLevel', 'layoutVariant'],
  };

  const promptText = `請在不更動任何 C# 程式碼、核心定義、程式行為與學習目標的前提下，僅改寫指定簡報的可編輯欄位。
限制：
- 絕對不可輸出或修改 locked、definition、code、expectedBehavior、learningObjectives、rubricBasis、corePoint。
- baseContentVersion 必須原樣維持為 ${slide.contentVersion}。
- layoutVariant 只允許："split_code" | "focused_concept" | "comparison_columns"。
- 僅輸出純 JSON。

回傳格式：
{
  "format": "mooncode.ai_response",
  "schemaVersion": 1,
  "task": "rewrite_slide",
  "requestId": "${requestId}",
  "baseDatasetEpoch": ${baseDatasetEpoch},
  "payload": {
    "slideId": "${slide.slideId}",
    "chapterId": "${slide.chapterId}",
    "baseContentVersion": ${slide.contentVersion},
    "mode": "${mode}",
    "analogy": {
      "story": "比喻故事",
      "mapping": "與 C# 程式概念的精確對照",
      "boundary": "此比喻的適用邊界（不可過度類比之處）"
    },
    "plainExplanation": "白話補充說明",
    "detailLevel": "standard",
    "layoutVariant": "split_code"
  }
}

簡報改寫資料包：
${JSON.stringify(packet, null, 2)}`;

  return {
    format: 'mooncode.ai_request',
    schemaVersion: 1,
    requestId,
    task: 'rewrite_slide',
    baseDatasetEpoch,
    createdAt: nowIso,
    status: 'pending',
    meta: {
      slideId: slide.slideId,
      chapterId: slide.chapterId,
      baseContentVersion: slide.contentVersion,
      mode,
    },
    promptText,
  };
}

export type AiImportValidationResult =
  | {
      ok: true;
      task: 'generate_question_set';
      questionSet: QuestionSet;
      summary: string;
    }
  | {
      ok: true;
      task: 'evaluate_short_answers';
      evaluations: Evaluation[];
      summary: string;
    }
  | {
      ok: true;
      task: 'rewrite_slide';
      slideVariant: SlideVariant;
      summary: string;
    }
  | {
      ok: false;
      errors: string[];
    };

export interface AiValidationContext {
  pendingRequests: AiRequest[];
  validConceptIds: Set<string>;
  validChapterIds: Set<string>;
  answersById: Map<string, AnswerRecord>;
  slidesById: Map<string, CanonicalSlide>;
  existingEvaluations: Evaluation[];
  existingVariants: SlideVariant[];
  currentDatasetEpoch: number;
}

export async function validateAndTransformAiImport(
  rawPaste: string,
  ctx: AiValidationContext
): Promise<AiImportValidationResult> {
  let parsedJson: unknown;
  try {
    const cleaned = extractJsonFromPaste(rawPaste);
    parsedJson = JSON.parse(cleaned);
  } catch (err) {
    return {
      ok: false,
      errors: [`JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const envResult = AiResponseEnvelopeSchema.safeParse(parsedJson);
  if (!envResult.success) {
    return { ok: false, errors: formatZodIssues(envResult.error) };
  }

  const env = envResult.data;
  const req = ctx.pendingRequests.find((r) => r.requestId === env.requestId);
  if (!req) {
    return {
      ok: false,
      errors: [`requestId "${env.requestId}" 不對應本機待處理請求，已拒絕匯入不明或過期回覆。`],
    };
  }
  if (req.task !== env.task) {
    return {
      ok: false,
      errors: [`task 不符：本機請求為 ${req.task}，回覆為 ${env.task}`],
    };
  }
  if (env.baseDatasetEpoch !== req.baseDatasetEpoch || env.baseDatasetEpoch !== ctx.currentDatasetEpoch) {
    return {
      ok: false,
      errors: [
        `資料集 epoch 不符（回覆為 ${env.baseDatasetEpoch}，目前為 ${ctx.currentDatasetEpoch}），請重新產生提示詞。`,
      ],
    };
  }

  const nowIso = new Date().toISOString();

  if (env.task === 'generate_question_set') {
    const p = AiGenerateSetPayloadSchema.safeParse(env.payload);
    if (!p.success) {
      return { ok: false, errors: formatZodIssues(p.error) };
    }
    const assignedSetId = generateUuid();
    const candidateSet: QuestionSet = {
      format: 'mooncode.question_set',
      schemaVersion: 1,
      setId: assignedSetId,
      localId: `ai-${env.requestId}`,
      setVersion: 1,
      chapterId: p.data.chapterId,
      contentVersion: p.data.contentVersion,
      title: p.data.title,
      createdAt: nowIso,
      source: 'ai_import',
      conceptIds: p.data.conceptIds,
      difficulty: p.data.difficulty,
      questions: p.data.questions.map((q) => ({
        ...q,
        localId: q.questionId,
        questionId: generateUuid(),
      })),
    };
    const checked = validateQuestionSetWithConcepts(
      candidateSet,
      ctx.validConceptIds,
      ctx.validChapterIds
    );
    if (!checked.ok) {
      return { ok: false, errors: checked.errors };
    }
    const contentHash = await sha256Canonical({
      ...checked.data,
      contentHash: undefined,
    });
    return {
      ok: true,
      task: 'generate_question_set',
      questionSet: { ...checked.data, contentHash },
      summary: `將匯入 1 組新題組「${checked.data.title}」（7 題單選 + 3 題理解題），並配置全新 UUID。`,
    };
  }

  if (env.task === 'evaluate_short_answers') {
    const p = AiEvaluateAnswersPayloadSchema.safeParse(env.payload);
    if (!p.success) {
      return { ok: false, errors: formatZodIssues(p.error) };
    }
    if (req.meta.testRunId && p.data.testRunId !== req.meta.testRunId) {
      return {
        ok: false,
        errors: [`testRunId 不符：預期 ${req.meta.testRunId}，收到 ${p.data.testRunId}`],
      };
    }

    const expectedAnswerIds = new Set(req.meta.answerIds ?? []);
    const seenAnswerIds = new Set<string>();
    const evaluations: Evaluation[] = [];
    const errors: string[] = [];

    for (const item of p.data.evaluations) {
      if (seenAnswerIds.has(item.answerId)) {
        errors.push(`重複的 answerId：${item.answerId}`);
        continue;
      }
      seenAnswerIds.add(item.answerId);

      if (expectedAnswerIds.size > 0 && !expectedAnswerIds.has(item.answerId)) {
        errors.push(`answerId "${item.answerId}" 不在此次待評閱的 3 題範圍內`);
        continue;
      }
      const ans = ctx.answersById.get(item.answerId);
      if (!ans) {
        errors.push(`找不到對應作答紀錄：${item.answerId}`);
        continue;
      }
      if (ans.testRunId !== item.testRunId) {
        errors.push(`answerId "${item.answerId}" 的 testRunId 不一致`);
        continue;
      }
      if (ans.questionVersion !== item.questionVersion) {
        errors.push(
          `題目版本不符（answerId ${item.answerId} 為 v${ans.questionVersion}，評閱為 v${item.questionVersion}）`
        );
        continue;
      }
      if (ans.answerHash !== item.answerHash) {
        errors.push(`answerHash 驗證失敗：此評閱非針對目前作答內容（不可將舊答案評閱套用到新答案）`);
        continue;
      }

      // Check for duplicate exact evaluation import (idempotent skip/dedup)
      const duplicateSameRequest = ctx.existingEvaluations.find(
        (e) =>
          e.answerId === item.answerId &&
          e.requestId === env.requestId &&
          e.answerHash === item.answerHash &&
          !e.invalidated
      );
      if (duplicateSameRequest) {
        continue;
      }

      const maxPrevRev = ctx.existingEvaluations
        .filter((e) => e.answerId === item.answerId)
        .reduce((max, e) => Math.max(max, e.revision), 0);

      // Enforce Rule 8.4: correct ONLY when ALL checks met === true AND contradictions.length === 0
      const computedCorrect = item.checks.every((c) => c.met) && item.contradictions.length === 0;

      evaluations.push({
        format: 'mooncode.evaluation',
        schemaVersion: 1,
        evaluationId: generateUuid(),
        requestId: env.requestId,
        testRunId: item.testRunId,
        answerId: item.answerId,
        questionId: item.questionId,
        questionVersion: item.questionVersion,
        answerHash: item.answerHash,
        rubricVersion: item.rubricVersion,
        checks: item.checks,
        contradictions: item.contradictions,
        correct: computedCorrect,
        reason: item.reason,
        referenceAnswer: item.referenceAnswer,
        reviewConceptIds: item.reviewConceptIds,
        evaluatedAt: nowIso,
        revision: maxPrevRev + 1,
        source: 'ai_import',
      });
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      task: 'evaluate_short_answers',
      evaluations,
      summary:
        evaluations.length === 0
          ? '此評閱結果已匯入過（相同 requestId 與 answerHash），不會重複計分。'
          : `驗證通過，將套用 ${evaluations.length} 題理解題評閱結果。`,
    };
  }

  // task === 'rewrite_slide'
  const rawPayload = env.payload as Record<string, unknown> | null;
  if (rawPayload && typeof rawPayload === 'object') {
    for (const forbiddenKey of LOCKED_SLIDE_KEYS) {
      if (forbiddenKey in rawPayload) {
        return {
          ok: false,
          errors: [`安全性拒絕：改寫回覆試圖包含受保護欄位 "${forbiddenKey}"`],
        };
      }
    }
  }

  const p = AiRewriteSlidePayloadSchema.safeParse(env.payload);
  if (!p.success) {
    return { ok: false, errors: formatZodIssues(p.error) };
  }

  const targetSlide = ctx.slidesById.get(p.data.slideId);
  if (!targetSlide) {
    return { ok: false, errors: [`找不到目標簡報：${p.data.slideId}`] };
  }
  if (targetSlide.contentVersion !== p.data.baseContentVersion) {
    return {
      ok: false,
      errors: [
        `簡報版本不符（目前版本為 v${targetSlide.contentVersion}，改寫基準為 v${p.data.baseContentVersion}），已拒絕套用。`,
      ],
    };
  }
  if (p.data.mode === 'analogy_only' && (p.data.detailLevel || p.data.layoutVariant)) {
    return {
      ok: false,
      errors: ['目前改寫模式為 analogy_only，不可變更 detailLevel 或 layoutVariant。'],
    };
  }

  const maxRev = ctx.existingVariants
    .filter((v) => v.slideId === p.data.slideId)
    .reduce((m, v) => Math.max(m, v.updatedRevision), 0);

  const variant: SlideVariant = {
    format: 'mooncode.slide_variant',
    schemaVersion: 1,
    variantId: generateUuid(),
    slideId: p.data.slideId,
    chapterId: p.data.chapterId,
    baseContentVersion: p.data.baseContentVersion,
    mode: p.data.mode,
    analogy: p.data.analogy,
    plainExplanation: p.data.plainExplanation,
    detailLevel: p.data.detailLevel,
    layoutVariant: p.data.layoutVariant,
    source: 'ai_import',
    requestId: env.requestId,
    savedAt: nowIso,
    updatedRevision: maxRev + 1,
  };

  return {
    ok: true,
    task: 'rewrite_slide',
    slideVariant: variant,
    summary: `驗證通過，將為簡報「${targetSlide.title}」儲存個人／AI 改寫版本（原版核心定義與程式碼保持不變）。`,
  };
}

/**
 * Extensible AI Adapter contract.
 * ManualJsonAiAdapter is active and fully verified.
 * OfficialAutoAiAdapter remains disabled until official OpenAI/ChatGPT app eligibility & real auth are verified.
 */
export interface AiAdapterStatus {
  id: 'manual_json' | 'official_auto';
  label: string;
  mode: 'manual' | 'unverified';
  connected: false | true;
  description: string;
}

export const MANUAL_AI_ADAPTER_STATUS: AiAdapterStatus = {
  id: 'manual_json',
  label: 'Plus 手動 JSON 往返模式',
  mode: 'manual',
  connected: true,
  description: '本版預設且完整可用：複製提示詞交給 ChatGPT Plus，再貼回或匯入 JSON 回覆。',
};

export const UNVERIFIED_AUTO_ADAPTER_STATUS: AiAdapterStatus = {
  id: 'official_auto',
  label: '官方自動連線擴充介面（未啟用）',
  mode: 'unverified',
  connected: false,
  description: '需完成官方文件、應用資格與真實登入／請求驗證後才可啟用；本系統絕不偽稱已連線。',
};
