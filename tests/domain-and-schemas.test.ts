import { describe, expect, it } from 'vitest';
import { ALL_CONCEPTS, CANONICAL_CHAPTERS, SLIDES_BY_ID } from '../src/data/curriculum/index.ts';
import { SEED_QUESTION_SETS } from '../src/data/seedSets/index.ts';
import { buildRewriteSlideRequest, validateAndTransformAiImport } from '../src/domain/aiRoundtrip.ts';
import { classifyTimePeriod, getZonedHourMinute, resolveTimePeriodInfo } from '../src/domain/timeTheme.ts';
import { validateQuestionSetWithConcepts } from '../src/schemas/runtimeSchemas.ts';

describe('Curriculum & Seed QuestionSets Integrity', () => {
  const validConcepts = new Set(ALL_CONCEPTS.map((c) => c.conceptId));
  const validChapters = new Set(CANONICAL_CHAPTERS.map((c) => c.chapterId));

  it('has all 9 chapters with 6-7 slides each and 9 valid 7+3 seed sets', () => {
    expect(CANONICAL_CHAPTERS).toHaveLength(9);
    for (const ch of CANONICAL_CHAPTERS) {
      expect(ch.slides.length).toBeGreaterThanOrEqual(6);
      expect(ch.slides.length).toBeLessThanOrEqual(7);
      expect(ch.concepts.length).toBeGreaterThanOrEqual(2);
    }

    expect(SEED_QUESTION_SETS).toHaveLength(9);
    for (const set of SEED_QUESTION_SETS) {
      const check = validateQuestionSetWithConcepts(set, validConcepts, validChapters);
      expect(check.ok, check.ok ? '' : check.errors.join('; ')).toBe(true);
    }
  });

  it('rejects 6+4 distribution, duplicate options, unknown conceptId, and missing fields', () => {
    const base = structuredClone(SEED_QUESTION_SETS[0]);

    // 6+4 distribution
    const badRatio = structuredClone(base);
    badRatio.questions[6] = {
      ...badRatio.questions[7],
      questionId: 'extra-short',
    };
    const r1 = validateQuestionSetWithConcepts(badRatio, validConcepts, validChapters);
    expect(r1.ok).toBe(false);

    // Duplicate MCQ options
    const dupOpt = structuredClone(base);
    if (dupOpt.questions[0].type === 'single_choice') {
      dupOpt.questions[0].options[1] = dupOpt.questions[0].options[0];
    }
    const r2 = validateQuestionSetWithConcepts(dupOpt, validConcepts, validChapters);
    expect(r2.ok).toBe(false);

    // Unknown conceptId
    const unknownConcept = structuredClone(base);
    unknownConcept.questions[0].primaryConceptId = 'ch99_nonexistent';
    const r3 = validateQuestionSetWithConcepts(unknownConcept, validConcepts, validChapters);
    expect(r3.ok).toBe(false);

    // Missing required title
    const missingTitle = structuredClone(base) as unknown as Record<string, unknown>;
    delete missingTitle.title;
    const r4 = validateQuestionSetWithConcepts(missingTitle, validConcepts, validChapters);
    expect(r4.ok).toBe(false);
  });

  it('rejects AI slide rewrite responses that attempt to include locked fields', async () => {
    const slide = CANONICAL_CHAPTERS[0].slides[0];
    const req = buildRewriteSlideRequest(slide, 'analogy_only', '測試改寫', 1);

    const maliciousEnvelope = JSON.stringify({
      format: 'mooncode.ai_response',
      schemaVersion: 1,
      task: 'rewrite_slide',
      requestId: req.requestId,
      baseDatasetEpoch: 1,
      payload: {
        slideId: slide.slideId,
        chapterId: slide.chapterId,
        baseContentVersion: slide.contentVersion,
        mode: 'analogy_only',
        code: 'public class Hacked {}',
        plainExplanation: '試圖修改受保護程式碼',
      },
    });

    const res = await validateAndTransformAiImport(maliciousEnvelope, {
      pendingRequests: [req],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById: new Map(),
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]).toContain('受保護欄位');
    }
  });
});

describe('5-Period Time-of-Day Theme & Boundary Classification', () => {
  it('classifies all 5 periods and exact midnight boundaries accurately', () => {
    expect(classifyTimePeriod(0, 0).period).toBe('midnight');
    expect(classifyTimePeriod(4, 59).period).toBe('midnight');
    expect(classifyTimePeriod(5, 0).period).toBe('dawn');
    expect(classifyTimePeriod(10, 59).period).toBe('dawn');
    expect(classifyTimePeriod(11, 0).period).toBe('noon');
    expect(classifyTimePeriod(15, 59).period).toBe('noon');
    expect(classifyTimePeriod(16, 0).period).toBe('dusk');
    expect(classifyTimePeriod(18, 59).period).toBe('dusk');
    expect(classifyTimePeriod(19, 0).period).toBe('night');
    expect(classifyTimePeriod(23, 59).period).toBe('night');
  });

  it('resolves Asia/Taipei timezone deterministically even across UTC midnight', () => {
    // 2026-11-18T16:30:00Z = 2026-11-19 00:30 in Asia/Taipei (UTC+8) -> midnight
    const utcDate = new Date('2026-11-18T16:30:00Z');
    const zoned = getZonedHourMinute(utcDate, 'Asia/Taipei');
    expect(zoned.hour).toBe(0);
    expect(zoned.minute).toBe(30);

    const info = resolveTimePeriodInfo(utcDate, 'Asia/Taipei', 'auto');
    expect(info.period).toBe('midnight');
    expect(info.effectiveTimezone).toBe('Asia/Taipei');
  });
});
