import { generateUuid, sha256Utf8 } from './hash.ts';
import type {
  AnswerRecord,
  QuestionSet,
  QuestionSnapshot,
  TestRun,
} from './types.ts';

export function shuffleOptionsDeterministic(
  options: [string, string, string, string],
  correctOriginalIndex: 0 | 1 | 2 | 3,
  rng: () => number = Math.random
): {
  options: [string, string, string, string];
  shuffledToOriginalIndices: [number, number, number, number];
  correctShuffledIndex: 0 | 1 | 2 | 3;
} {
  const indices: [number, number, number, number] = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const newOptions: [string, string, string, string] = [
    options[indices[0]],
    options[indices[1]],
    options[indices[2]],
    options[indices[3]],
  ];
  const correctShuffledIndex = indices.indexOf(correctOriginalIndex) as 0 | 1 | 2 | 3;
  return {
    options: newOptions,
    shuffledToOriginalIndices: indices,
    correctShuffledIndex,
  };
}

export function createTestRun(
  questionSet: QuestionSet,
  deviceId: string,
  nowIso: string = new Date().toISOString(),
  rng: () => number = Math.random
): TestRun {
  const snapshots: QuestionSnapshot[] = questionSet.questions.map((q) => {
    if (q.type === 'single_choice') {
      const shuffled = shuffleOptionsDeterministic(q.options, q.correctOptionIndex, rng);
      return {
        questionId: q.questionId,
        questionVersion: q.questionVersion,
        type: 'single_choice',
        primaryConceptId: q.primaryConceptId,
        secondaryConceptIds: q.secondaryConceptIds,
        difficulty: q.difficulty,
        readingTier: q.readingTier,
        prompt: q.prompt,
        codeSnippet: q.codeSnippet,
        explanation: q.explanation,
        options: shuffled.options,
        shuffledToOriginalIndices: shuffled.shuffledToOriginalIndices,
        correctShuffledIndex: shuffled.correctShuffledIndex,
      };
    }
    return {
      questionId: q.questionId,
      questionVersion: q.questionVersion,
      type: 'short_answer',
      primaryConceptId: q.primaryConceptId,
      secondaryConceptIds: q.secondaryConceptIds,
      difficulty: q.difficulty,
      readingTier: q.readingTier,
      prompt: q.prompt,
      codeSnippet: q.codeSnippet,
      explanation: q.explanation,
      rubricVersion: q.rubricVersion,
      requiredPoints: q.requiredPoints,
      coreMisconceptions: q.coreMisconceptions,
      acceptablePrinciples: q.acceptablePrinciples,
      referenceAnswer: q.referenceAnswer,
    };
  });

  return {
    format: 'mooncode.test_run',
    schemaVersion: 1,
    testRunId: generateUuid(),
    setId: questionSet.setId,
    setVersion: questionSet.setVersion,
    chapterId: questionSet.chapterId,
    setTitle: questionSet.title,
    deviceId,
    startedAt: nowIso,
    status: 'in_progress',
    currentIndex: 0,
    questionSnapshots: snapshots,
    answerIds: [],
    activeQuestionShownAt: undefined,
    accumulatedActiveMsForCurrent: 0,
    accumulatedWallMsForCurrent: 0,
    currentInterrupted: false,
  };
}

export interface SubmitAnswerInput {
  testRun: TestRun;
  selectedShuffledIndex?: 0 | 1 | 2 | 3;
  textAnswer?: string;
  activeElapsedMs: number;
  wallElapsedMs: number;
  interrupted: boolean;
  viewedHintOrAnswerBefore?: boolean;
  nowIso?: string;
}

export async function submitCurrentQuestionAnswer(input: SubmitAnswerInput): Promise<{
  answerRecord: AnswerRecord;
  updatedRun: TestRun;
}> {
  const { testRun } = input;
  if (testRun.status === 'completed') {
    throw new Error('測驗已完成並鎖定，無法重複送出。');
  }
  const idx = testRun.currentIndex;
  if (idx < testRun.answerIds.length) {
    throw new Error('此題已送出並鎖定，不可在同一次測驗中修改先前答案。');
  }

  const snap = testRun.questionSnapshots[idx];
  if (!snap) {
    throw new Error(`無效的題目索引：${idx}`);
  }

  const nowIso = input.nowIso ?? new Date().toISOString();
  const activeMs = Math.max(0, Math.round(input.activeElapsedMs));
  const wallMs = Math.max(activeMs, Math.round(input.wallElapsedMs));

  let answerRecord: AnswerRecord;

  if (snap.type === 'single_choice') {
    if (input.selectedShuffledIndex === undefined) {
      throw new Error('請先選擇一個單選題選項再確認作答。');
    }
    const origIdx = (snap.shuffledToOriginalIndices?.[input.selectedShuffledIndex] ??
      input.selectedShuffledIndex) as 0 | 1 | 2 | 3;
    const isCorrect = input.selectedShuffledIndex === snap.correctShuffledIndex;
    const answerHash = await sha256Utf8(`mc:${snap.questionId}:v${snap.questionVersion}:opt${origIdx}`);

    answerRecord = {
      format: 'mooncode.answer_record',
      schemaVersion: 1,
      answerId: generateUuid(),
      testRunId: testRun.testRunId,
      setId: testRun.setId,
      chapterId: testRun.chapterId,
      questionId: snap.questionId,
      questionVersion: snap.questionVersion,
      questionIndex: idx,
      type: 'single_choice',
      primaryConceptId: snap.primaryConceptId,
      secondaryConceptIds: snap.secondaryConceptIds,
      difficulty: snap.difficulty,
      readingTier: snap.readingTier,
      selectedShuffledIndex: input.selectedShuffledIndex,
      selectedOriginalIndex: origIdx,
      answerHash,
      wallElapsedMs: wallMs,
      activeElapsedMs: activeMs,
      interrupted: input.interrupted,
      viewedHintOrAnswerBefore: Boolean(input.viewedHintOrAnswerBefore),
      submittedAt: nowIso,
      status: 'graded',
      correct: isCorrect,
      deviceId: testRun.deviceId,
    };
  } else {
    const trimmed = (input.textAnswer ?? '').trim();
    if (trimmed.length === 0) {
      throw new Error('理解題不可為空白，請寫下您的理解後再送出。');
    }
    // Note: short_answer CANNOT be rejected for being short (Spec 7.4 & 8.2)!
    const answerHash = await sha256Utf8(trimmed);

    answerRecord = {
      format: 'mooncode.answer_record',
      schemaVersion: 1,
      answerId: generateUuid(),
      testRunId: testRun.testRunId,
      setId: testRun.setId,
      chapterId: testRun.chapterId,
      questionId: snap.questionId,
      questionVersion: snap.questionVersion,
      questionIndex: idx,
      type: 'short_answer',
      primaryConceptId: snap.primaryConceptId,
      secondaryConceptIds: snap.secondaryConceptIds,
      difficulty: snap.difficulty,
      readingTier: snap.readingTier,
      textAnswer: trimmed,
      answerHash,
      wallElapsedMs: wallMs,
      activeElapsedMs: activeMs,
      interrupted: input.interrupted,
      viewedHintOrAnswerBefore: Boolean(input.viewedHintOrAnswerBefore),
      submittedAt: nowIso,
      status: 'pending_ai',
      correct: null, // Workflow state: NOT wrong!
      deviceId: testRun.deviceId,
    };
  }

  const nextAnswerIds = [...testRun.answerIds, answerRecord.answerId];
  const isFinal = nextAnswerIds.length >= 10;

  const updatedRun: TestRun = {
    ...testRun,
    answerIds: nextAnswerIds,
    currentIndex: isFinal ? 9 : idx + 1,
    status: isFinal ? 'completed' : 'in_progress',
    submittedAt: isFinal ? nowIso : undefined,
    activeQuestionShownAt: undefined,
    accumulatedActiveMsForCurrent: 0,
    accumulatedWallMsForCurrent: 0,
    currentInterrupted: false,
  };

  return { answerRecord, updatedRun };
}
