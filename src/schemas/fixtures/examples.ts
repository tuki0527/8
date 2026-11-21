export const INVALID_QUESTION_SET_6_PLUS_4 = {
  format: 'mooncode.question_set',
  schemaVersion: 1,
  setId: 'bad-set-6-plus-4',
  setVersion: 1,
  chapterId: 'ch1',
  contentVersion: 1,
  title: '錯誤比例題組（6+4）',
  createdAt: '2026-11-18T00:00:00Z',
  source: 'ai_import',
  conceptIds: ['ch1.class_object'],
  difficulty: 'beginner',
  questions: Array.from({ length: 10 }, (_, idx) =>
    idx < 6
      ? {
          questionId: `q-${idx + 1}`,
          questionVersion: 1,
          type: 'single_choice',
          primaryConceptId: 'ch1.class_object',
          difficulty: 'beginner',
          readingTier: 'short',
          prompt: `範例單選題 ${idx + 1}`,
          explanation: '解析內容',
          options: ['A', 'B', 'C', 'D'],
          correctOptionIndex: 0,
        }
      : {
          questionId: `q-${idx + 1}`,
          questionVersion: 1,
          type: 'short_answer',
          primaryConceptId: 'ch1.class_object',
          difficulty: 'beginner',
          readingTier: 'short',
          prompt: `範例理解題 ${idx + 1}`,
          explanation: '解析內容',
          rubricVersion: 1,
          requiredPoints: [
            { pointId: 'p1', conceptId: 'ch1.class_object', description: '說出狀態與行為' },
          ],
          coreMisconceptions: ['把類別與實例混為一談'],
          acceptablePrinciples: ['可用藍圖與物件比喻'],
          referenceAnswer: '類別是藍圖，物件是依藍圖建立的實例。',
        }
  ),
};

export const INVALID_QUESTION_SET_DUPLICATE_OPTIONS = {
  format: 'mooncode.question_set',
  schemaVersion: 1,
  setId: 'bad-set-dup-opts',
  setVersion: 1,
  chapterId: 'ch1',
  contentVersion: 1,
  title: '重複選項題組',
  createdAt: '2026-11-18T00:00:00Z',
  source: 'ai_import',
  conceptIds: ['ch1.class_object'],
  difficulty: 'beginner',
  questions: Array.from({ length: 10 }, (_, idx) =>
    idx < 7
      ? {
          questionId: `q-${idx + 1}`,
          questionVersion: 1,
          type: 'single_choice',
          primaryConceptId: 'ch1.class_object',
          difficulty: 'beginner',
          readingTier: 'short',
          prompt: `單選題 ${idx + 1}`,
          explanation: '解析內容',
          options: idx === 0 ? ['相同選項', '相同選項', '選項C', '選項D'] : ['A', 'B', 'C', 'D'],
          correctOptionIndex: 0,
        }
      : {
          questionId: `q-${idx + 1}`,
          questionVersion: 1,
          type: 'short_answer',
          primaryConceptId: 'ch1.class_object',
          difficulty: 'beginner',
          readingTier: 'short',
          prompt: `理解題 ${idx + 1}`,
          explanation: '解析內容',
          rubricVersion: 1,
          requiredPoints: [
            { pointId: 'p1', conceptId: 'ch1.class_object', description: '說出狀態與行為' },
          ],
          coreMisconceptions: ['把類別與實例混為一談'],
          acceptablePrinciples: ['可用藍圖與物件比喻'],
          referenceAnswer: '類別是藍圖，物件是依藍圖建立的實例。',
        }
  ),
};

export const INVALID_AI_REWRITE_TOUCHING_LOCKED = {
  format: 'mooncode.ai_response',
  schemaVersion: 1,
  task: 'rewrite_slide',
  requestId: 'req-demo-1',
  baseDatasetEpoch: 1,
  payload: {
    slideId: 'ch1-s1',
    chapterId: 'ch1',
    baseContentVersion: 1,
    mode: 'analogy_only',
    code: 'public class Hacked {}',
    analogy: {
      story: '試圖偷改程式碼的惡意/錯誤回覆',
      mapping: '對照',
      boundary: '邊界',
    },
  },
};

export const UNSUPPORTED_FUTURE_SCHEMA_BUNDLE = {
  format: 'mooncode.study_bundle',
  schemaVersion: 99,
  exportedAt: '2026-11-18T00:00:00Z',
  datasetId: 'mooncode-primary',
  syncEpoch: 1,
  generation: 1,
};
