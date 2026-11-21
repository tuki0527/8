import { performance } from 'node:perf_hooks';
import { ALL_CONCEPTS, CANONICAL_CHAPTERS } from '../src/data/curriculum/index.ts';
import { SEED_QUESTION_SETS } from '../src/data/seedSets/index.ts';
import { computeConceptMastery } from '../src/domain/mastery.ts';
import type { AnswerRecord, QuestionSet, TestRun } from '../src/domain/types.ts';
import { buildCandidateSnapshot } from '../src/sync/sharding.ts';

async function runBenchmark() {
  console.log('MoonCode Synthetic Scale Benchmark (5,000 QuestionSets / 50,000 Questions & 50,000 AnswerRecords)');
  console.log('Environment: Node.js synthetic in-memory simulation (not mobile browser IndexedDB)\n');

  const baseSet = SEED_QUESTION_SETS[0];
  const sets: QuestionSet[] = [];
  const runs: TestRun[] = [];
  const answers: AnswerRecord[] = [];

  const tGenStart = performance.now();
  for (let i = 0; i < 5000; i++) {
    const ch = CANONICAL_CHAPTERS[i % CANONICAL_CHAPTERS.length];
    const primaryConcept = ch.concepts[i % ch.concepts.length].conceptId;
    const setId = `bench-set-${String(i).padStart(5, '0')}`;
    const runId = `bench-run-${String(i).padStart(5, '0')}`;
    const day = String((i % 28) + 1).padStart(2, '0');
    const createdAt = `2026-10-${day}T10:00:00Z`;

    sets.push({
      ...baseSet,
      setId,
      chapterId: ch.chapterId,
      title: `合成壓力測試題組 #${i + 1}`,
      createdAt,
      source: 'ai_import',
      conceptIds: ch.concepts.map((c) => c.conceptId),
      questions: baseSet.questions.map((q, qi) => ({
        ...q,
        questionId: `${setId}-q${qi}`,
        primaryConceptId: primaryConcept,
      })),
    });

    runs.push({
      format: 'mooncode.test_run',
      schemaVersion: 1,
      testRunId: runId,
      setId,
      setVersion: 1,
      chapterId: ch.chapterId,
      setTitle: `Benchmark #${i + 1}`,
      deviceId: 'bench-device',
      startedAt: createdAt,
      submittedAt: createdAt,
      status: 'completed',
      currentIndex: 9,
      questionSnapshots: [],
      answerIds: [],
      accumulatedActiveMsForCurrent: 0,
      accumulatedWallMsForCurrent: 0,
      currentInterrupted: false,
    });

    for (let qi = 0; qi < 10; qi++) {
      answers.push({
        format: 'mooncode.answer_record',
        schemaVersion: 1,
        answerId: `${runId}-a${qi}`,
        testRunId: runId,
        setId,
        chapterId: ch.chapterId,
        questionId: `${setId}-q${qi}`,
        questionVersion: 1,
        questionIndex: qi,
        type: qi < 7 ? 'single_choice' : 'short_answer',
        primaryConceptId: primaryConcept,
        difficulty: 'intermediate',
        readingTier: 'short',
        answerHash: 'benchhash1234',
        wallElapsedMs: 5200,
        activeElapsedMs: 5000,
        interrupted: false,
        viewedHintOrAnswerBefore: false,
        submittedAt: createdAt,
        status: qi < 7 ? 'graded' : 'pending_ai',
        correct: qi < 7 ? i % 4 !== 0 : null,
        deviceId: 'bench-device',
      });
    }
  }
  const tGenEnd = performance.now();

  const tMasteryStart = performance.now();
  const masteries = computeConceptMastery(ALL_CONCEPTS, answers, [], [], new Date('2026-11-18T00:00:00Z'));
  const tMasteryEnd = performance.now();

  const tPageStart = performance.now();
  const targetCh = CANONICAL_CHAPTERS[2].chapterId;
  const filteredPage = sets
    .filter((s) => s.chapterId === targetCh)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  const tPageEnd = performance.now();

  const tShardStart = performance.now();
  const snap = await buildCandidateSnapshot({
    datasetId: 'bench-dataset',
    revisionId: 'rev-bench-001',
    generation: 1,
    syncEpoch: 1,
    deviceId: 'bench-device',
    parentRevisionId: null,
    appliedOperationIds: [],
    data: {
      questionSets: sets,
      testRuns: runs,
      answers,
      evaluations: [],
      slideVariants: [],
      tombstones: [],
    },
    existingBlobsByPath: new Map(),
  });
  const tShardEnd = performance.now();

  const maxShardEntries = Math.max(...snap.manifest.indexes.map((i) => i.count));

  console.log(`- Generated 5,000 QuestionSets (50,000 questions) + 50,000 AnswerRecords in ${(tGenEnd - tGenStart).toFixed(1)} ms`);
  console.log(`- computeConceptMastery across 50,000 answers (${masteries.length} concepts): ${(tMasteryEnd - tMasteryStart).toFixed(1)} ms`);
  console.log(`- Paginated 20-item QuestionSet query (from 5,000 sets): ${(tPageEnd - tPageStart).toFixed(2)} ms (${filteredPage.length} items returned)`);
  console.log(`- buildCandidateSnapshot sharding plan: ${(tShardEnd - tShardStart).toFixed(1)} ms`);
  console.log(`- Total shard indexes produced: ${snap.manifest.indexes.length}, max entries per shard: ${maxShardEntries} (limit: 200)`);
}

void runBenchmark();
