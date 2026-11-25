import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_CONCEPTS, CANONICAL_CHAPTERS, SLIDES_BY_ID } from '../src/data/curriculum/index.ts';
import { SEED_QUESTION_SETS } from '../src/data/seedSets/index.ts';
import {
  buildAiPromptFilename,
  buildEvaluateShortAnswersRequest,
  buildGenerateSetRequest,
  buildRewriteSlideRequest,
  validateAndTransformAiImport,
} from '../src/domain/aiRoundtrip.ts';
import { createTestRun, submitCurrentQuestionAnswer } from '../src/domain/quizEngine.ts';
import type { AnswerRecord } from '../src/domain/types.ts';
import { buildSaveScopeSummary } from '../src/context/StudyContext.tsx';
import { getDb, resetDbConnectionForTest } from '../src/storage/db.ts';
import { loadAppSettings } from '../src/storage/settings.ts';
import {
  applyValidatedAiImport,
  commitQuizAnswer,
  loadLocalSnapshot,
  persistManualLocalSave,
  recordTestRunStart,
  saveAiRequestRecord,
} from '../src/storage/studyStore.ts';

async function resetIndexedDb(): Promise<void> {
  resetDbConnectionForTest();
  const db = await getDb();
  const stores = [
    'meta',
    'question_sets',
    'test_runs',
    'answers',
    'evaluations',
    'slide_variants',
    'tombstones',
    'outbox',
    'quarantine',
    'ai_requests',
    'issue_reports',
  ] as const;
  const tx = db.transaction([...stores], 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}

describe('Manual Save Scope & IndexedDB Verification', () => {
  beforeEach(async () => {
    await resetIndexedDb();
  });

  it('builds truthful save scope summaries for local_only, authorized_online, and offline_or_unavailable', async () => {
    const snap = await loadLocalSnapshot();

    const localScope = buildSaveScopeSummary(
      true,
      { configured: false, authenticated: false },
      snap
    );
    expect(localScope.mode).toBe('local_only');
    expect(localScope.description).toContain('不會宣稱已同步至雲端');

    const authOnlineScope = buildSaveScopeSummary(
      true,
      {
        configured: true,
        authenticated: true,
        user: { id: '1', login: 'moonuser' },
        targetRepo: 'moonuser/moon-study-data',
      },
      snap
    );
    expect(authOnlineScope.mode).toBe('authorized_online');
    expect(authOnlineScope.description).toContain('moonuser/moon-study-data');

    const offlineScope = buildSaveScopeSummary(
      false,
      { configured: true, authenticated: true, targetRepo: 'moonuser/moon-study-data' },
      snap
    );
    expect(offlineScope.mode).toBe('offline_or_unavailable');
    expect(offlineScope.description).toContain('離線');
  });

  it('persists verified lastSavedAt without altering auto-saved quiz answers', async () => {
    const before = await loadLocalSnapshot();
    expect(before.lastSavedAt).toBeNull();

    // Auto-save a quiz start + 1 answer (without calling persistManualLocalSave)
    const run = createTestRun(SEED_QUESTION_SETS[0], 'test-dev');
    await recordTestRunStart(run);
    const snapQ0 = run.questionSnapshots[0];
    const submitted = await submitCurrentQuestionAnswer({
      testRun: run,
      selectedShuffledIndex: snapQ0.correctShuffledIndex,
      activeElapsedMs: 4000,
      wallElapsedMs: 4000,
      interrupted: false,
    });
    await commitQuizAnswer(submitted.answerRecord, submitted.updatedRun);

    const afterAutoSave = await loadLocalSnapshot();
    expect(afterAutoSave.answers).toHaveLength(1);
    expect(afterAutoSave.lastSavedAt).toBeNull();

    // Manual confirmed save updates real lastSavedAt and preserves existing data
    const settings = loadAppSettings();
    const res = await persistManualLocalSave(settings);
    expect(res.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.snapshot.lastSavedAt).toBe(res.savedAt);
    expect(res.snapshot.answers).toHaveLength(1);
    expect(res.snapshot.questionSets).toHaveLength(9);
  });
});

describe('AI Prompt TXT Generation, Filenames & Multi-Request Isolation', () => {
  const validConcepts = new Set(ALL_CONCEPTS.map((c) => c.conceptId));
  const validChapters = new Set(CANONICAL_CHAPTERS.map((c) => c.chapterId));

  beforeEach(async () => {
    await resetIndexedDb();
  });

  it('includes .json attachment preference rules and clean UTF-8 content across all 3 tasks', async () => {
    const ch1 = CANONICAL_CHAPTERS[0];
    const reqA = buildGenerateSetRequest({
      chapter: ch1,
      recentQuestionStems: [],
      conceptMasteries: [],
      dueReviews: [],
      baseDatasetEpoch: 1,
      maxRecentTitles: 20,
    });

    let run = createTestRun(SEED_QUESTION_SETS[0], 'test-dev');
    const answers: AnswerRecord[] = [];
    for (let i = 0; i < 10; i++) {
      const snap = run.questionSnapshots[i];
      const res = await submitCurrentQuestionAnswer({
        testRun: run,
        selectedShuffledIndex: snap.type === 'single_choice' ? snap.correctShuffledIndex : undefined,
        textAnswer:
          snap.type === 'short_answer' ? '物件狀態由建構子與公開方法保護不變量。' : undefined,
        activeElapsedMs: 5000,
        wallElapsedMs: 5000,
        interrupted: false,
      });
      answers.push(res.answerRecord);
      run = res.updatedRun;
    }
    const shortAnswers = answers.filter((a) => a.type === 'short_answer');
    const reqB = buildEvaluateShortAnswersRequest(run, shortAnswers, 1);

    const reqC = buildRewriteSlideRequest(ch1.slides[0], 'analogy_only', '餐廳訂位比喻', 1);

    for (const req of [reqA, reqB, reqC]) {
      expect(req.promptText).toContain('.json');
      expect(req.promptText).toContain('優先建立並提供可下載的純 UTF-8「.json」檔案附件');
      expect(req.promptText).toContain(req.requestId);
      expect(req.promptText).not.toContain('&quot;&quot;');
      const filename = buildAiPromptFilename(req.task, req.requestId);
      expect(filename).toMatch(/^mooncode-(generate-question-set|evaluate-short-answers|rewrite-slide)-[a-zA-Z0-9_-]+\.txt$/);
      expect(filename).toContain(req.requestId);
    }
  });

  it('keeps distinct requestId statuses isolated and rejects corrupted paste artifacts', async () => {
    let run = createTestRun(SEED_QUESTION_SETS[0], 'test-dev');
    await recordTestRunStart(run);
    const answers: AnswerRecord[] = [];
    for (let i = 0; i < 10; i++) {
      const snap = run.questionSnapshots[i];
      const res = await submitCurrentQuestionAnswer({
        testRun: run,
        selectedShuffledIndex: snap.type === 'single_choice' ? snap.correctShuffledIndex : undefined,
        textAnswer: snap.type === 'short_answer' ? '透過封裝確保規則一致。' : undefined,
        activeElapsedMs: 5000,
        wallElapsedMs: 5000,
        interrupted: false,
      });
      await commitQuizAnswer(res.answerRecord, res.updatedRun);
      answers.push(res.answerRecord);
      run = res.updatedRun;
    }

    const shortAnswers = answers.filter((a) => a.type === 'short_answer');
    const req1 = buildEvaluateShortAnswersRequest(run, shortAnswers, 1);
    const req2 = buildEvaluateShortAnswersRequest(run, shortAnswers, 1);
    await saveAiRequestRecord(req1);
    await saveAiRequestRecord(req2);

    const answersById = new Map(answers.map((a) => [a.answerId, a]));

    const buildValidReply = (requestId: string) =>
      JSON.stringify({
        format: 'mooncode.ai_response',
        schemaVersion: 1,
        task: 'evaluate_short_answers',
        requestId,
        baseDatasetEpoch: 1,
        payload: {
          testRunId: run.testRunId,
          evaluations: shortAnswers.map((a) => ({
            testRunId: run.testRunId,
            answerId: a.answerId,
            questionId: a.questionId,
            questionVersion: a.questionVersion,
            answerHash: a.answerHash,
            rubricVersion: 1,
            checks: [
              {
                pointId: 'p1',
                conceptId: a.primaryConceptId,
                met: true,
                evidence: '封裝',
                reason: '已命中核心觀念',
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

    // Reject HTML-encoded or trailing-backslash corrupted paste strictly
    const corruptedHtml = buildValidReply(req1.requestId).replace(/"/g, '&quot;');
    const badRes1 = await validateAndTransformAiImport(corruptedHtml, {
      pendingRequests: [req1, req2],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(badRes1.ok).toBe(false);
    if (!badRes1.ok) {
      expect(badRes1.errors[0]).toContain('JSON 解析失敗');
    }

    const corruptedSlash = `{\\\n  "format": "mooncode.ai_response" }`;
    const badRes2 = await validateAndTransformAiImport(corruptedSlash, {
      pendingRequests: [req1, req2],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(badRes2.ok).toBe(false);

    // Apply req1 -> req1 becomes applied while req2 stays pending!
    const ok1 = await validateAndTransformAiImport(buildValidReply(req1.requestId), {
      pendingRequests: [req1, req2],
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: [],
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(ok1.ok).toBe(true);
    if (!ok1.ok) return;

    await applyValidatedAiImport(req1.requestId, ok1);
    const snapAfterReq1 = await loadLocalSnapshot();
    const r1 = snapAfterReq1.aiRequests.find((r) => r.requestId === req1.requestId);
    const r2 = snapAfterReq1.aiRequests.find((r) => r.requestId === req2.requestId);
    expect(r1?.status).toBe('applied');
    expect(r2?.status).toBe('pending');
    expect(snapAfterReq1.evaluations).toHaveLength(3);

    // Re-import req1 -> idempotent (0 new evaluations) & req2 STILL remains pending
    const dupCheck = await validateAndTransformAiImport(buildValidReply(req1.requestId), {
      pendingRequests: snapAfterReq1.aiRequests,
      validConceptIds: validConcepts,
      validChapterIds: validChapters,
      answersById,
      slidesById: SLIDES_BY_ID,
      existingEvaluations: snapAfterReq1.evaluations,
      existingVariants: [],
      currentDatasetEpoch: 1,
    });
    expect(dupCheck.ok).toBe(true);
    if (dupCheck.ok && dupCheck.task === 'evaluate_short_answers') {
      expect(dupCheck.evaluations).toHaveLength(0);
      await applyValidatedAiImport(req1.requestId, dupCheck);
    }

    const snapAfterDup = await loadLocalSnapshot();
    expect(snapAfterDup.evaluations).toHaveLength(3);
    expect(snapAfterDup.aiRequests.find((r) => r.requestId === req2.requestId)?.status).toBe('pending');
  });
});
