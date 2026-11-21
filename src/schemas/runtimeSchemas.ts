import { z } from 'zod';

export const MAX_BUNDLE_BYTES = 15 * 1024 * 1024; // 15 MB safety threshold
export const MAX_TEXT_FIELD_LEN = 12000;
export const MAX_CODE_FIELD_LEN = 24000;
export const MAX_ARRAY_ITEMS = 50000;

const utcIsoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
export const UtcIsoStringSchema = z
  .string()
  .min(20)
  .max(40)
  .refine((v) => utcIsoRegex.test(v) && !Number.isNaN(Date.parse(v)), {
    message: '必須為合法的 UTC ISO 8601 時間字串（以 Z 結尾）',
  });

export const DifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const ReadingTierSchema = z.enum(['short', 'medium', 'long']);
export const TimePeriodSchema = z.enum(['dawn', 'noon', 'dusk', 'night', 'midnight']);

export const AppSettingsSchema = z.object({
  format: z.literal('mooncode.settings'),
  schemaVersion: z.literal(1),
  appName: z.string().trim().min(1).max(80),
  timezoneMode: z.enum(['Asia/Taipei', 'device']),
  themeMode: z.union([z.literal('auto'), z.literal('fixed_night'), TimePeriodSchema]),
  reducedMotion: z.boolean(),
  fontSize: z.enum(['sm', 'md', 'lg']),
  deviceId: z.string().min(4).max(120),
  recentQuestionTitlesLimit: z.number().int().min(5).max(100),
  sidebarOpen: z.boolean(),
  updatedAt: UtcIsoStringSchema,
});

export const RequiredConceptPointSchema = z.object({
  pointId: z.string().min(1).max(80),
  conceptId: z.string().min(1).max(80),
  description: z.string().trim().min(2).max(500),
});

const QuestionBaseSchema = z.object({
  questionId: z.string().min(1).max(120),
  localId: z.string().min(1).max(120).optional(),
  questionVersion: z.number().int().min(1),
  primaryConceptId: z.string().min(1).max(80),
  secondaryConceptIds: z.array(z.string().min(1).max(80)).max(6).optional(),
  difficulty: DifficultySchema,
  readingTier: ReadingTierSchema,
  prompt: z.string().trim().min(5).max(MAX_TEXT_FIELD_LEN),
  codeSnippet: z.string().max(MAX_CODE_FIELD_LEN).optional(),
  explanation: z.string().trim().min(4).max(MAX_TEXT_FIELD_LEN),
});

export const SingleChoiceQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('single_choice'),
  options: z
    .tuple([
      z.string().trim().min(1).max(1000),
      z.string().trim().min(1).max(1000),
      z.string().trim().min(1).max(1000),
      z.string().trim().min(1).max(1000),
    ])
    .refine((opts) => new Set(opts.map((o) => o.trim())).size === 4, {
      message: '單選題 4 個選項不可重複',
    }),
  correctOptionIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export const ShortAnswerQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal('short_answer'),
  rubricVersion: z.number().int().min(1),
  requiredPoints: z.array(RequiredConceptPointSchema).min(1).max(8),
  coreMisconceptions: z.array(z.string().trim().min(2).max(500)).min(1).max(8),
  acceptablePrinciples: z.array(z.string().trim().min(2).max(500)).min(1).max(8),
  referenceAnswer: z.string().trim().min(5).max(MAX_TEXT_FIELD_LEN),
});

export const QuestionItemSchema = z.discriminatedUnion('type', [
  SingleChoiceQuestionSchema,
  ShortAnswerQuestionSchema,
]);

export const QuestionSetSchema = z
  .object({
    format: z.literal('mooncode.question_set'),
    schemaVersion: z.literal(1),
    setId: z.string().min(1).max(120),
    localId: z.string().min(1).max(120).optional(),
    setVersion: z.number().int().min(1),
    chapterId: z.string().min(1).max(80),
    contentVersion: z.number().int().min(1),
    title: z.string().trim().min(2).max(200),
    createdAt: UtcIsoStringSchema,
    source: z.enum(['seed', 'ai_import']),
    conceptIds: z.array(z.string().min(1).max(80)).min(1).max(30),
    difficulty: DifficultySchema,
    questions: z.array(QuestionItemSchema).length(10, { message: '題組必須恰好包含 10 題' }),
    contentHash: z.string().max(128).optional(),
    invalidated: z.boolean().optional(),
    invalidReason: z.string().max(500).optional(),
  })
  .superRefine((set, ctx) => {
    const singleCount = set.questions.filter((q) => q.type === 'single_choice').length;
    const shortCount = set.questions.filter((q) => q.type === 'short_answer').length;
    if (singleCount !== 7 || shortCount !== 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: `題組必須恰好為 7 題單選與 3 題理解題（目前為 ${singleCount} 單選 + ${shortCount} 理解）`,
      });
    }
    const seenIds = new Set<string>();
    set.questions.forEach((q, idx) => {
      if (seenIds.has(q.questionId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', idx, 'questionId'],
          message: `題目 ID 重複：${q.questionId}`,
        });
      }
      seenIds.add(q.questionId);
    });
  });

export function validateQuestionSetWithConcepts(
  input: unknown,
  validConceptIds: Set<string>,
  validChapterIds?: Set<string>
): { ok: true; data: z.infer<typeof QuestionSetSchema> } | { ok: false; errors: string[] } {
  const parsed = QuestionSetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: formatZodIssues(parsed.error) };
  }
  const data = parsed.data;
  const errors: string[] = [];

  if (validChapterIds && !validChapterIds.has(data.chapterId)) {
    errors.push(`chapterId: 未知的章節識別碼 "${data.chapterId}"`);
  }
  data.conceptIds.forEach((cid, i) => {
    if (!validConceptIds.has(cid)) {
      errors.push(`conceptIds[${i}]: 未知的概念識別碼 "${cid}"`);
    }
  });
  data.questions.forEach((q, qi) => {
    if (!validConceptIds.has(q.primaryConceptId)) {
      errors.push(`questions[${qi}].primaryConceptId: 未知的概念識別碼 "${q.primaryConceptId}"`);
    }
    q.secondaryConceptIds?.forEach((sid, si) => {
      if (!validConceptIds.has(sid)) {
        errors.push(`questions[${qi}].secondaryConceptIds[${si}]: 未知的概念識別碼 "${sid}"`);
      }
    });
    if (q.type === 'short_answer') {
      q.requiredPoints.forEach((pt, pi) => {
        if (!validConceptIds.has(pt.conceptId)) {
          errors.push(`questions[${qi}].requiredPoints[${pi}].conceptId: 未知的概念識別碼 "${pt.conceptId}"`);
        }
      });
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data };
}

export const SlideVariantSchema = z.object({
  format: z.literal('mooncode.slide_variant'),
  schemaVersion: z.literal(1),
  variantId: z.string().min(1).max(120),
  slideId: z.string().min(1).max(80),
  chapterId: z.string().min(1).max(80),
  baseContentVersion: z.number().int().min(1),
  mode: z.enum(['analogy_only', 'presentation_only']),
  analogy: z
    .object({
      story: z.string().trim().min(5).max(4000),
      mapping: z.string().trim().min(5).max(4000),
      boundary: z.string().trim().min(5).max(2000),
    })
    .optional(),
  plainExplanation: z.string().trim().min(5).max(5000).optional(),
  detailLevel: z.enum(['concise', 'standard', 'detailed']).optional(),
  layoutVariant: z.enum(['split_code', 'focused_concept', 'comparison_columns']).optional(),
  promptNote: z.string().max(1000).optional(),
  source: z.enum(['user', 'ai_import']),
  requestId: z.string().max(120).optional(),
  savedAt: UtcIsoStringSchema,
  updatedRevision: z.number().int().min(1),
});

export const QuestionSnapshotSchema = z.object({
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().min(1),
  type: z.enum(['single_choice', 'short_answer']),
  primaryConceptId: z.string().min(1).max(80),
  secondaryConceptIds: z.array(z.string()).optional(),
  difficulty: DifficultySchema,
  readingTier: ReadingTierSchema,
  prompt: z.string().min(1).max(MAX_TEXT_FIELD_LEN),
  codeSnippet: z.string().max(MAX_CODE_FIELD_LEN).optional(),
  explanation: z.string().min(1).max(MAX_TEXT_FIELD_LEN),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  shuffledToOriginalIndices: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional(),
  correctShuffledIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  rubricVersion: z.number().int().min(1).optional(),
  requiredPoints: z.array(RequiredConceptPointSchema).optional(),
  coreMisconceptions: z.array(z.string()).optional(),
  acceptablePrinciples: z.array(z.string()).optional(),
  referenceAnswer: z.string().optional(),
});

export const TestRunSchema = z.object({
  format: z.literal('mooncode.test_run'),
  schemaVersion: z.literal(1),
  testRunId: z.string().min(1).max(120),
  setId: z.string().min(1).max(120),
  setVersion: z.number().int().min(1),
  chapterId: z.string().min(1).max(80),
  setTitle: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(120),
  startedAt: UtcIsoStringSchema,
  submittedAt: UtcIsoStringSchema.optional(),
  status: z.enum(['in_progress', 'completed']),
  currentIndex: z.number().int().min(0).max(9),
  questionSnapshots: z.array(QuestionSnapshotSchema).length(10),
  answerIds: z.array(z.string()).max(10),
  activeQuestionShownAt: UtcIsoStringSchema.optional(),
  accumulatedActiveMsForCurrent: z.number().min(0),
  accumulatedWallMsForCurrent: z.number().min(0),
  currentInterrupted: z.boolean(),
});

export const AnswerRecordSchema = z.object({
  format: z.literal('mooncode.answer_record'),
  schemaVersion: z.literal(1),
  answerId: z.string().min(1).max(120),
  testRunId: z.string().min(1).max(120),
  setId: z.string().min(1).max(120),
  chapterId: z.string().min(1).max(80),
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().min(1),
  questionIndex: z.number().int().min(0).max(9),
  type: z.enum(['single_choice', 'short_answer']),
  primaryConceptId: z.string().min(1).max(80),
  secondaryConceptIds: z.array(z.string()).optional(),
  difficulty: DifficultySchema,
  readingTier: ReadingTierSchema,
  selectedShuffledIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  selectedOriginalIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  textAnswer: z.string().max(MAX_TEXT_FIELD_LEN).optional(),
  answerHash: z.string().min(8).max(128),
  wallElapsedMs: z.number().min(0),
  activeElapsedMs: z.number().min(0),
  interrupted: z.boolean(),
  viewedHintOrAnswerBefore: z.boolean(),
  submittedAt: UtcIsoStringSchema,
  status: z.enum(['graded', 'pending_ai']),
  correct: z.boolean().nullable(),
  deviceId: z.string().min(1).max(120),
  invalidated: z.boolean().optional(),
  invalidReason: z.string().max(500).optional(),
});

export const EvaluationPointCheckSchema = z.object({
  pointId: z.string().min(1).max(80),
  conceptId: z.string().min(1).max(80),
  met: z.boolean(),
  evidence: z.string().max(2000),
  reason: z.string().min(1).max(2000),
});

export const EvaluationSchema = z.object({
  format: z.literal('mooncode.evaluation'),
  schemaVersion: z.literal(1),
  evaluationId: z.string().min(1).max(120),
  requestId: z.string().min(1).max(120),
  testRunId: z.string().min(1).max(120),
  answerId: z.string().min(1).max(120),
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().min(1),
  answerHash: z.string().min(8).max(128),
  rubricVersion: z.number().int().min(1),
  checks: z.array(EvaluationPointCheckSchema).min(1).max(12),
  contradictions: z.array(z.string().max(1000)).max(12),
  correct: z.boolean(),
  reason: z.string().min(2).max(4000),
  referenceAnswer: z.string().min(2).max(4000),
  reviewConceptIds: z.array(z.string().min(1).max(80)).max(12),
  evaluatedAt: UtcIsoStringSchema,
  revision: z.number().int().min(1),
  source: z.literal('ai_import'),
  invalidated: z.boolean().optional(),
  invalidReason: z.string().max(500).optional(),
});

export const DeletionTombstoneSchema = z.object({
  format: z.literal('mooncode.tombstone'),
  schemaVersion: z.literal(1),
  tombstoneId: z.string().min(1).max(120),
  targetType: z.enum(['question_set', 'wrong_book_item', 'test_run', 'answer_record', 'slide_variant']),
  targetId: z.string().min(1).max(120),
  mode: z.enum(['hide_wrong_book', 'reset_record', 'delete_set', 'revert_variant']),
  revision: z.number().int().min(1),
  reason: z.string().max(500).optional(),
  deletedAt: UtcIsoStringSchema,
  deviceId: z.string().min(1).max(120),
});

export const IssueReportSchema = z.object({
  format: z.literal('mooncode.issue_report'),
  schemaVersion: z.literal(1),
  reportId: z.string().min(1).max(120),
  targetType: z.enum(['question', 'evaluation', 'slide_variant']),
  targetId: z.string().min(1).max(120),
  reason: z.string().min(2).max(2000),
  createdAt: UtcIsoStringSchema,
  actionTaken: z.enum(['recorded', 'invalidated_question', 'reverted_variant']),
});

export const StudyBundleSchema = z.object({
  format: z.literal('mooncode.study_bundle'),
  schemaVersion: z.literal(1),
  exportedAt: UtcIsoStringSchema,
  datasetId: z.string().min(1).max(120),
  syncEpoch: z.number().int().min(1),
  generation: z.number().int().min(0),
  settings: AppSettingsSchema,
  questionSets: z.array(QuestionSetSchema).max(MAX_ARRAY_ITEMS),
  testRuns: z.array(TestRunSchema).max(MAX_ARRAY_ITEMS),
  answers: z.array(AnswerRecordSchema).max(MAX_ARRAY_ITEMS),
  evaluations: z.array(EvaluationSchema).max(MAX_ARRAY_ITEMS),
  slideVariants: z.array(SlideVariantSchema).max(MAX_ARRAY_ITEMS),
  tombstones: z.array(DeletionTombstoneSchema).max(MAX_ARRAY_ITEMS),
  issueReports: z.array(IssueReportSchema).max(MAX_ARRAY_ITEMS),
  integritySha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const PointerSlotSchema = z.object({
  revisionId: z.string().min(1).max(120),
  manifestPath: z.string().min(1).max(300),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  generation: z.number().int().min(1),
  syncEpoch: z.number().int().min(1),
  committedAt: UtcIsoStringSchema,
  commitSha: z.string().max(64).optional(),
});

export const ActivePointerSchema = z.object({
  format: z.literal('mooncode.head'),
  schemaVersion: z.literal(1),
  datasetId: z.string().min(1).max(120),
  syncEpoch: z.number().int().min(1),
  generation: z.number().int().min(0),
  active: PointerSlotSchema.nullable(),
  previous: PointerSlotSchema.nullable(),
  recoveryLog: z.array(
    z.object({
      at: UtcIsoStringSchema,
      fromRevisionId: z.string(),
      toRevisionId: z.string(),
      newEpoch: z.number().int().min(1),
      reason: z.string(),
    })
  ),
});

export const SnapshotManifestSchema = z.object({
  format: z.literal('mooncode.manifest'),
  schemaVersion: z.literal(1),
  datasetId: z.string().min(1).max(120),
  revisionId: z.string().min(1).max(120),
  generation: z.number().int().min(1),
  syncEpoch: z.number().int().min(1),
  createdAt: UtcIsoStringSchema,
  deviceId: z.string().min(1).max(120),
  parentRevisionId: z.string().nullable(),
  isRecovery: z.boolean().optional(),
  recoveredFromRevisionId: z.string().optional(),
  stats: z.object({
    questionSetCount: z.number().int().min(0),
    testRunCount: z.number().int().min(0),
    answerCount: z.number().int().min(0),
    evaluationCount: z.number().int().min(0),
    slideVariantCount: z.number().int().min(0),
    tombstoneCount: z.number().int().min(0),
  }),
  indexes: z.array(
    z.object({
      indexType: z.enum(['sets', 'runs', 'evaluations', 'slides', 'changes']),
      partition: z.string().min(1).max(80),
      path: z.string().min(1).max(300),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      count: z.number().int().min(0),
    })
  ),
  archives: z.array(
    z.object({
      archiveId: z.string(),
      label: z.string(),
      chapterId: z.string().optional(),
      yearMonth: z.string().optional(),
      path: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      itemCount: z.number().int().min(0),
    })
  ),
  appliedOperationIds: z.array(z.string()),
});

export const AiGenerateSetPayloadSchema = z.object({
  chapterId: z.string().min(1).max(80),
  contentVersion: z.number().int().min(1),
  title: z.string().trim().min(2).max(200),
  conceptIds: z.array(z.string().min(1).max(80)).min(1).max(30),
  difficulty: DifficultySchema,
  questions: z.array(QuestionItemSchema).length(10),
}).superRefine((payload, ctx) => {
  const singleCount = payload.questions.filter((q) => q.type === 'single_choice').length;
  const shortCount = payload.questions.filter((q) => q.type === 'short_answer').length;
  if (singleCount !== 7 || shortCount !== 3) {
    ctx.addIssue({
      code: 'custom',
      path: ['questions'],
      message: `AI 產出題組必須恰好為 7 題單選與 3 題理解題（實際為 ${singleCount} + ${shortCount}）`,
    });
  }
});

export const AiEvaluateItemSchema = z.object({
  testRunId: z.string().min(1).max(120),
  answerId: z.string().min(1).max(120),
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().min(1),
  answerHash: z.string().min(8).max(128),
  rubricVersion: z.number().int().min(1),
  checks: z.array(EvaluationPointCheckSchema).min(1).max(12),
  contradictions: z.array(z.string().max(1000)).max(12),
  correct: z.boolean(),
  reason: z.string().min(2).max(4000),
  referenceAnswer: z.string().min(2).max(4000),
  reviewConceptIds: z.array(z.string().min(1).max(80)).max(12),
});

export const AiEvaluateAnswersPayloadSchema = z.object({
  testRunId: z.string().min(1).max(120),
  evaluations: z.array(AiEvaluateItemSchema).length(3, {
    message: '理解題批次評閱必須恰好包含該次測驗的 3 題評閱結果',
  }),
});

export const LOCKED_SLIDE_KEYS = [
  'locked',
  'definition',
  'termMappings',
  'code',
  'codeTitle',
  'codeLanguage',
  'expectedBehavior',
  'learningObjectives',
  'rubricBasis',
  'corePoint',
] as const;

export const AiRewriteSlidePayloadSchema = z
  .object({
    slideId: z.string().min(1).max(80),
    chapterId: z.string().min(1).max(80),
    baseContentVersion: z.number().int().min(1),
    mode: z.enum(['analogy_only', 'presentation_only']),
    analogy: z
      .object({
        story: z.string().trim().min(5).max(4000),
        mapping: z.string().trim().min(5).max(4000),
        boundary: z.string().trim().min(5).max(2000),
      })
      .optional(),
    plainExplanation: z.string().trim().min(5).max(5000).optional(),
    detailLevel: z.enum(['concise', 'standard', 'detailed']).optional(),
    layoutVariant: z.enum(['split_code', 'focused_concept', 'comparison_columns']).optional(),
  })
  .strict();

export const AiResponseEnvelopeSchema = z.object({
  format: z.literal('mooncode.ai_response'),
  schemaVersion: z.literal(1),
  task: z.enum(['generate_question_set', 'evaluate_short_answers', 'rewrite_slide']),
  requestId: z.string().min(1).max(120),
  baseDatasetEpoch: z.number().int().min(1),
  payload: z.unknown(),
});

export function formatZodIssues(err: z.ZodError): string[] {
  return err.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}
