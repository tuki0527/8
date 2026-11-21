import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_QUESTION_SETS } from '../src/data/seedSets/index.ts';
import { computeBundleIntegrityHash } from '../src/domain/hash.ts';
import { createTestRun, submitCurrentQuestionAnswer } from '../src/domain/quizEngine.ts';
import { getDb, resetDbConnectionForTest } from '../src/storage/db.ts';
import {
  commitQuizAnswer,
  exportStudyBundle,
  importStudyBundle,
  loadLocalSnapshot,
  recordTestRunStart,
} from '../src/storage/studyStore.ts';

describe('E2E Local IndexedDB Learning & Backup Flows', () => {
  beforeEach(async () => {
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
  });

  it('seeds 9 question sets, completes a 10-question test run, exports StudyBundle, and safely rejects future schema without wiping data', async () => {
    const initial = await loadLocalSnapshot();
    expect(initial.questionSets).toHaveLength(9);
    expect(initial.testRuns).toHaveLength(0);

    // Run full 10-question quiz on Chapter 1 seed set
    let run = createTestRun(SEED_QUESTION_SETS[0], 'e2e-device');
    await recordTestRunStart(run);

    for (let i = 0; i < 10; i++) {
      const snap = run.questionSnapshots[i];
      const { answerRecord, updatedRun } = await submitCurrentQuestionAnswer({
        testRun: run,
        selectedShuffledIndex: snap.type === 'single_choice' ? snap.correctShuffledIndex : undefined,
        textAnswer: snap.type === 'short_answer' ? '透過封裝確保銀行餘額不能由外部任意寫入負值。' : undefined,
        activeElapsedMs: 4000,
        wallElapsedMs: 4200,
        interrupted: false,
      });
      await commitQuizAnswer(answerRecord, updatedRun);
      run = updatedRun;
    }

    const afterQuiz = await loadLocalSnapshot();
    expect(afterQuiz.testRuns).toHaveLength(1);
    expect(afterQuiz.testRuns[0].status).toBe('completed');
    expect(afterQuiz.answers).toHaveLength(10);

    // Export full StudyBundle
    const bundle = await exportStudyBundle();
    expect(bundle.integritySha256).toMatch(/^[a-f0-9]{64}$/);

    // Attempt importing future schemaVersion 99 -> must reject cleanly WITHOUT wiping existing 10 answers!
    const futureBundle = {
      ...bundle,
      schemaVersion: 99,
      integritySha256: await computeBundleIntegrityHash({
        ...bundle,
        schemaVersion: 99,
      } as unknown as Record<string, unknown>),
    };
    const futureRes = await importStudyBundle(JSON.stringify(futureBundle), 'overwrite');
    expect(futureRes.ok).toBe(false);
    if (!futureRes.ok) {
      expect(futureRes.needsUpgrade).toBe(true);
    }

    const stillIntact = await loadLocalSnapshot();
    expect(stillIntact.answers).toHaveLength(10);
  });
});
