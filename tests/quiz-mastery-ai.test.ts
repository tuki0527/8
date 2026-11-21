import { describe, expect, it } from 'vitest';
import { ALL_CONCEPTS, CANONICAL_CHAPTERS, SLIDES_BY_ID } from '../src/data/curriculum/index.ts';
import { SEED_QUESTION_SETS } from '../src/data/seedSets/index.ts';
import {
  buildEvaluateShortAnswersRequest,
  validateAndTransformAiImport,
} from '../src/domain/aiRoundtrip.ts';
import { computeConceptMastery, MASTERY_CONFIG } from '../src/domain/mastery.ts';
import { createTestRun, submitCurrentQuestionAnswer } from '../src/domain/quizEngine.ts';
import type { AnswerRecord, Evaluation } from '../src/domain/types.ts';

describe('Quiz Engine Rules (Locking, Reload, Timing, Pending AI)', () => {
  it('enforces sequential 10-question lock-on-submit, no blank answers, and marks short answers pending_ai', async () => {
    const seed = SEED_QUESTION_SETS[0];
    let run = createTestRun(seed, 'dev-test-1', '2026-11-18T01:00:00Z', () => 0.42);
    expect(run.questionSnapshots).toHaveLength(10);

    // Reject blank short-answer when reaching index 7, and reject missing option at index 0
    await expect(
      submitCurrentQuestionAnswer({
        testRun: run,
        activeElapsedMs: 3000,
        wallElapsedMs: 3000,
        interrupted: false,
      })
    ).rejects.toThrow();

    const answers: AnswerRecord[] = [];
    for (let i = 0; i < 10; i++) {
      const snap = run.questionSnapshots[i];
      if (snap.type === 'single_choice') {
        const res = await submitCurrentQuestionAnswer({
          testRun: run,
          selectedShuffledIndex: snap.correctShuffledIndex,
          activeElapsedMs: 6000,
          wallElapsedMs: 6500,
          interrupted: i === 2,
          nowIso: `2026-11-18T01:0${i}:00Z`,
        });
        answers.push(res.answerRecord);
        run = res.updatedRun;
      } else {
        // Short answer accepts brief genuine phrasing without length penalty
        const res = await submitCurrentQuestionAnswer({
          testRun: run,
          textAnswer: '物件應自己維護內部狀態，避免外部直接修改。',
          activeElapsedMs: 45000,
          wallElapsedMs: 45000,
          interrupted: false,
          nowIso: `2026-11-18T01:1${i - 7}:00Z`,
        });
        answers.push(res.answerRecord);
        run = res.updatedRun;
      }
    }

    expect(run.status).toBe('completed');
    expect(run.answerIds).toHaveLength(10);
    // Short answers must be pending_ai with correct === null (never marked wrong!)
    const shorts = answers.filter((a) => a.type === 'short_answer');
    expect(shorts).toHaveLength(3);
    for (const s of shorts) {
      expect(s.status).toBe('pending_ai');
      expect(s.correct).toBeNull();
    }

    // Cannot submit again after completion
    await expect(
      submitCurrentQuestionAnswer({
        testRun: run,
        textAnswer: '嘗試重複送出',
        activeElapsedMs: 1000,
        wallElapsedMs: 1000,
        interrupted: false,
      })
    ).rejects.toThrow();
  });
});

describe('AI Evaluation Import Verification & Idempotency', () => {
  const validConcepts = new Set(ALL_CONCEPTS.map((c) => c.conceptId));
  const validChapters = new Set(CANONICAL_CHAPTERS.map((c) => c.chapterId));

  it('rejects mismatched requestId, answerHash, or questionVersion and deduplicates re-imports', async () => {
    const seed = SEED_QUESTION_SETS[0];
    let run = createTestRun(seed, 'dev-test-2', '2026-11-18T02:00:00Z');
    const answers: AnswerRecord[] = [];
    for (let i = 0; i < 10; i++) {
      const snap = run.questionSnapshots[i];
      const res = await submitCurrentQuestionAnswer({
        testRun: run,
        selectedShuffledIndex: snap.type === 'single_choice' ? snap.correctShuffledIndex : undefined,
        textAnswer: snap.type === 'short_answer' ? '透過公開方法驗證金額不可為負數，維持不變條件。' : undefined,
        activeElapsedMs: 8000,
        wallElapsedMs: 8000,
        interrupted: false,
      });
      answers.push(res.answerRecord);
      run = res.updatedRun;
    }

    const shortAnswers = answers.filter((a) => a.type === 'short_answer');
    const req = buildEvaluateShortAnswersRequest(run, shortAnswers, 1);
    const answersById = new Map(answers.map((a) => [a.answerId, a]));

    const buildEnvelope = (overrides?: { requestId?: string; answerHash?: string; questionVersion?: number }) =>
      JSON.stringify({
        format: 'mooncode.ai_response',
        schemaVersion: 1,
        task: 'evaluate_short_answers',
        requestId: overrides?.requestId ?? req.requestId,
        baseDatasetEpoch: 1,
        payload: {
          testRunId: run.testRunId,
          evaluations: shortAnswers.map((a, idx) => ({
            testRunId: run.testRunId,
            answerId: a.answerId,
            questionId: a.questionId,
            questionVersion: idx === 0 && overrides?.questionVersion ? overrides.questionVersion : a.questionVersion,
            answerHash: idx === 0 && overrides?.answerHash ? overrides.answerHash : a.answerHash,
            rubricVersion: 1,
            checks: [
              {
                pointId: 'p1',
                conceptId: a.primaryConceptId,
                met: true,
                evidence: '維持不變條件',
                reason: '概念正確',
              },
            ],
            contradictions: [],
            correct: true,
            reason: '理解正確',
            referenceAnswer: '參考答案',
            reviewConceptIds: [],
          })),
        },
      });

    // Reject wrong requestId
    const badReq = await validateAndTransformAiImport(buildEnvelope({ requestId: 'unknown-req' }), {
      pendingRequests: [req],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(badReq.ok).toBe(false);

    // Reject tampered answerHash
    const badHash = await validateAndTransformAiImport(buildEnvelope({ answerHash: 'deadbeef12345678' }), {
      pendingRequests: [req],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(badHash.ok).toBe(false);

    // Reject mismatched questionVersion
    const badVer = await validateAndTransformAiImport(buildEnvelope({ questionVersion: 99 }), {
      pendingRequests: [req],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(badVer.ok).toBe(false);

    // Valid import succeeds
    const okRes = await validateAndTransformAiImport(buildEnvelope(), {
      pendingRequests: [req],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(okRes.ok).toBe(true);
    if (!okRes.ok || okRes.task !== 'evaluate_short_answers') return;
    expect(okRes.evaluations).toHaveLength(3);

    // Double import with same requestId + answerHash deduplicates to 0 new evaluations
    const dupRes = await validateAndTransformAiImport(buildEnvelope(), {
      pendingRequests: [req],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: okRes.evaluations,
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(dupRes.ok).toBe(true);
    if (dupRes.ok && dupRes.task === 'evaluate_short_answers') {
      expect(dupRes.evaluations).toHaveLength(0);
    }
  });
});

describe('Mastery Algorithm Integrity (v1.0.0)', () => {
  const ch1Concept = CANONICAL_CHAPTERS[0].concepts[0];

  function makeMcqAnswer(overrides: Partial<AnswerRecord> & { answerId: string; questionId: string; submittedAt: string }): AnswerRecord {
    return {
      format: 'mooncode.answer_record',
      schemaVersion: 1,
      testRunId: 'run-1',
      setId: 'set-1',
      chapterId: 'ch01',
      questionVersion: 1,
      questionIndex: 0,
      type: 'single_choice',
      primaryConceptId: ch1Concept.conceptId,
      difficulty: 'beginner',
      readingTier: 'short',
      selectedShuffledIndex: 0,
      selectedOriginalIndex: 0,
      answerHash: 'hash-12345678',
      wallElapsedMs: 6000,
      activeElapsedMs: 6000,
      interrupted: false,
      viewedHintOrAnswerBefore: false,
      status: 'graded',
      correct: true,
      deviceId: 'dev-1',
      ...overrides,
    };
  }

  it('keeps pending_ai out of wrong counts, flags provisional/insufficient speed, deduplicates 24h repeats, and ignores speed on wrong MCQs', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    // 1. Short answer still pending_ai must NOT lower mastery or mark tested
    const pendingShort: AnswerRecord = {
      ...makeMcqAnswer({
        answerId: 'sa-1',
        questionId: 'q-sa-1',
        submittedAt: '2026-11-18T10:00:00Z',
        type: 'short_answer',
        status: 'pending_ai',
        correct: null,
        activeElapsedMs: 120000,
      }),
    };
    const resPendingOnly = computeConceptMastery([ch1Concept], [pendingShort], [], [], now);
    expect(resPendingOnly[0].status).toBe('untested');

    // 2. Same question repeated within 24h counts only 1 independent evidence
    const q1Day1 = makeMcqAnswer({
      answerId: 'a1',
      questionId: 'q-same',
      submittedAt: '2026-11-17T10:00:00Z',
      correct: true,
    });
    const q1Repeat2h = makeMcqAnswer({
      answerId: 'a2',
      questionId: 'q-same',
      submittedAt: '2026-11-17T12:00:00Z',
      correct: true,
    });
    const resDedup = computeConceptMastery([ch1Concept], [q1Day1, q1Repeat2h], [], [], now);
    expect(resDedup[0].independentQuestionCount).toBe(1);
    expect(resDedup[0].totalAttempts).toBe(2);
    expect(resDedup[0].status).toBe('provisional');
    expect(resDedup[0].insufficientSpeedData).toBe(true); // < 5 baseline samples!

    // 3. 5+ prior baseline samples unlock speed factor F, and wrong MCQ never receives speed bonus
    const fiveCorrect = Array.from({ length: MASTERY_CONFIG.minSpeedBaselineSamples + 1 }, (_, i) =>
      makeMcqAnswer({
        answerId: `b-${i}`,
        questionId: `qb-${i}`,
        submittedAt: `2026-11-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
        activeElapsedMs: 6000,
        correct: true,
      })
    );
    const fastWrong = makeMcqAnswer({
      answerId: 'wrong-fast',
      questionId: 'q-wf',
      submittedAt: '2026-11-17T10:00:00Z',
      activeElapsedMs: 500,
      correct: false,
    });
    const resBaseline = computeConceptMastery([ch1Concept], [...fiveCorrect, fastWrong], [], [], now);
    expect(resBaseline[0].status).toBe('established');
    expect(resBaseline[0].insufficientSpeedData).toBe(false);
    expect(resBaseline[0].speedFactorF).not.toBeNull();
    // Fast wrong answer does not get speed bonus or count as needsSpeedRecheck (since wrong)
    expect(resBaseline[0].needsSpeedRecheckCount).toBe(0);

    // 4. Slow short answer evaluated correct gets full weight 2 without speed penalty
    const slowShort: AnswerRecord = makeMcqAnswer({
      answerId: 'sa-slow',
      questionId: 'q-sa-slow',
      submittedAt: '2026-11-18T09:00:00Z',
      type: 'short_answer',
      status: 'graded',
      correct: true,
      activeElapsedMs: 300000,
    });
    const evalSlow: Evaluation = {
      format: 'mooncode.evaluation',
      schemaVersion: 1,
      evaluationId: 'ev-1',
      requestId: 'req-1',
      testRunId: 'run-1',
      answerId: 'sa-slow',
      questionId: 'q-sa-slow',
      questionVersion: 1,
      answerHash: 'hash-12345678',
      rubricVersion: 1,
      checks: [{ pointId: 'p1', conceptId: ch1Concept.conceptId, met: true, evidence: '正確', reason: '完整' }],
      contradictions: [],
      correct: true,
      reason: '理解完全正確',
      referenceAnswer: '參考答案',
      reviewConceptIds: [],
      evaluatedAt: '2026-11-18T09:05:00Z',
      revision: 1,
      source: 'ai_import',
    };
    const resShort = computeConceptMastery([ch1Concept], [slowShort], [evalSlow], [], now);
    expect(resShort[0].accuracyPercent).toBe(100);
    expect(resShort[0].insufficientSpeedData).toBe(true); // Slow typing never penalized!
  });
});
