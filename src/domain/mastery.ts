import type {
  AnswerRecord,
  CanonicalChapter,
  ChapterMasterySummary,
  ConceptDef,
  ConceptEvidence,
  DeletionTombstone,
  DifficultyLevel,
  Evaluation,
  MasterySummary,
  ReadingTier,
  ReviewItem,
} from './types.ts';

/**
 * Centralized, documented Mastery & Spaced Review parameters (v1.0.0).
 * Custom explainable practice metrics — NOT claimed as psychometrically calibrated IRT probabilities.
 */
export const MASTERY_CONFIG = {
  algorithmVersion: '1.0.0',
  maxEvidencePerConcept: 20,
  sameQuestionCooldownHours: 24,
  singleChoiceWeight: 1,
  shortAnswerConceptCheckWeight: 2,
  decayHalfLifeScaleDays: 30,
  weakPriorNumerator: 1,
  weakPriorDenominator: 2,
  minSpeedBaselineSamples: 5,
  abnormalFastRatioThreshold: 0.25,
  abnormalFastAbsoluteMs: 1200,
  provisionalMinDistinctQuestions: 5,
  provisionalMinDistinctDates: 2,
  staleReviewDays: 14,
  reviewIntervalsDays: [1, 3, 7, 14] as const,
} as const;

function daysBetween(earlierIso: string, nowDate: Date): number {
  const diffMs = Math.max(0, nowDate.getTime() - new Date(earlierIso).getTime());
  return diffMs / (1000 * 60 * 60 * 24);
}

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function speedBucketKey(difficulty: DifficultyLevel, readingTier: ReadingTier): string {
  return `${difficulty}:${readingTier}`;
}

export function buildConceptEvidenceList(
  answers: AnswerRecord[],
  evaluationsByAnswerId: Map<string, Evaluation>,
  resetTombstones: Set<string>,
  now: Date = new Date()
): ConceptEvidence[] {
  const validAnswers = answers
    .filter((a) => !a.invalidated && !resetTombstones.has(a.answerId) && !resetTombstones.has(a.testRunId))
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  // Track last independent timestamp per (conceptId + questionId) for 24h dedup
  const lastIndependentByConceptQuestion = new Map<string, number>();
  const evidenceOut: ConceptEvidence[] = [];

  for (const ans of validAnswers) {
    const submittedMs = new Date(ans.submittedAt).getTime();

    if (ans.type === 'single_choice') {
      if (ans.status !== 'graded' || ans.correct === null) continue;
      const cqKey = `${ans.primaryConceptId}::${ans.questionId}`;
      const lastMs = lastIndependentByConceptQuestion.get(cqKey);
      const within24h =
        lastMs !== undefined &&
        submittedMs - lastMs < MASTERY_CONFIG.sameQuestionCooldownHours * 3600 * 1000;
      const isPracticeOnly = within24h || ans.viewedHintOrAnswerBefore;

      if (!isPracticeOnly) {
        lastIndependentByConceptQuestion.set(cqKey, submittedMs);
      }

      evidenceOut.push({
        evidenceId: `${ans.answerId}:${ans.primaryConceptId}`,
        conceptId: ans.primaryConceptId,
        questionId: ans.questionId,
        answerId: ans.answerId,
        testRunId: ans.testRunId,
        type: 'single_choice',
        correct: ans.correct,
        weight: MASTERY_CONFIG.singleChoiceWeight,
        submittedAt: ans.submittedAt,
        daysSince: daysBetween(ans.submittedAt, now),
        activeElapsedMs: ans.activeElapsedMs,
        interrupted: ans.interrupted,
        difficulty: ans.difficulty,
        readingTier: ans.readingTier,
        isPracticeOnly,
        needsSpeedRecheck: false,
      });
    } else {
      // short_answer: only use graded valid Evaluation; pending_ai is NOT counted as wrong!
      const evalItem = evaluationsByAnswerId.get(ans.answerId);
      if (!evalItem || evalItem.invalidated) continue;

      // Spec Rule 8.5: At most ONE concept evidence per concept per question!
      // Aggregate checks per conceptId: a concept passes on this question if all checks for that conceptId are met AND no contradiction exists when that concept is the primary one.
      const checksByConcept = new Map<string, boolean[]>();
      for (const chk of evalItem.checks) {
        const list = checksByConcept.get(chk.conceptId) ?? [];
        list.push(chk.met);
        checksByConcept.set(chk.conceptId, list);
      }

      for (const [conceptId, metList] of checksByConcept.entries()) {
        const conceptPassed =
          metList.every(Boolean) &&
          (conceptId !== ans.primaryConceptId || evalItem.contradictions.length === 0);

        const cqKey = `${conceptId}::${ans.questionId}`;
        const lastMs = lastIndependentByConceptQuestion.get(cqKey);
        const within24h =
          lastMs !== undefined &&
          submittedMs - lastMs < MASTERY_CONFIG.sameQuestionCooldownHours * 3600 * 1000;
        const isPracticeOnly = within24h || ans.viewedHintOrAnswerBefore;

        if (!isPracticeOnly) {
          lastIndependentByConceptQuestion.set(cqKey, submittedMs);
        }

        evidenceOut.push({
          evidenceId: `${ans.answerId}:${conceptId}`,
          conceptId,
          questionId: ans.questionId,
          answerId: ans.answerId,
          testRunId: ans.testRunId,
          type: 'short_answer',
          correct: conceptPassed,
          weight: MASTERY_CONFIG.shortAnswerConceptCheckWeight,
          submittedAt: ans.submittedAt,
          daysSince: daysBetween(ans.submittedAt, now),
          activeElapsedMs: ans.activeElapsedMs,
          interrupted: ans.interrupted,
          difficulty: ans.difficulty,
          readingTier: ans.readingTier,
          isPracticeOnly,
          needsSpeedRecheck: false,
        });
      }
    }
  }

  return evidenceOut;
}

export function computeConceptMastery(
  concepts: ConceptDef[],
  answers: AnswerRecord[],
  evaluations: Evaluation[],
  tombstones: DeletionTombstone[],
  now: Date = new Date()
): MasterySummary[] {
  const evalMap = new Map<string, Evaluation>();
  for (const ev of evaluations) {
    if (ev.invalidated) continue;
    const prev = evalMap.get(ev.answerId);
    if (!prev || ev.revision >= prev.revision) {
      evalMap.set(ev.answerId, ev);
    }
  }

  const resetIds = new Set<string>();
  for (const t of tombstones) {
    if (t.mode === 'reset_record') {
      resetIds.add(t.targetId);
    }
  }

  const allEvidence = buildConceptEvidenceList(answers, evalMap, resetIds, now);

  // Build chronological pool of uninterrupted, no-hint, correct single_choice times per comparable bucket
  // Remember Rule 9.7: current question MUST NOT use itself to establish its own baseline,
  // and at least 5 PRIOR valid correct records are required!
  const speedEligiblePool = answers
    .filter(
      (a) =>
        !a.invalidated &&
        !resetIds.has(a.answerId) &&
        !resetIds.has(a.testRunId) &&
        a.type === 'single_choice' &&
        a.status === 'graded' &&
        a.correct === true &&
        !a.interrupted &&
        !a.viewedHintOrAnswerBefore &&
        a.activeElapsedMs > 0
    )
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

function sortedMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function insertSorted(sorted: number[], value: number): void {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  sorted.splice(lo, 0, value);
}

  const priorTimesByBucket = new Map<string, number[]>();
  const baselineForAnswerId = new Map<string, number | null>();
  const recheckForAnswerId = new Map<string, boolean>();

  for (const a of speedEligiblePool) {
    const bucket = speedBucketKey(a.difficulty, a.readingTier);
    let priors = priorTimesByBucket.get(bucket);
    if (!priors) {
      priors = [];
      priorTimesByBucket.set(bucket, priors);
    }
    if (priors.length >= MASTERY_CONFIG.minSpeedBaselineSamples) {
      const baseMs = sortedMedian(priors);
      baselineForAnswerId.set(a.answerId, baseMs);
      const isAbnormalFast =
        a.activeElapsedMs < MASTERY_CONFIG.abnormalFastAbsoluteMs ||
        a.activeElapsedMs < baseMs * MASTERY_CONFIG.abnormalFastRatioThreshold;
      recheckForAnswerId.set(a.answerId, isAbnormalFast);
    } else {
      baselineForAnswerId.set(a.answerId, null);
      recheckForAnswerId.set(a.answerId, false);
    }
    insertSorted(priors, a.activeElapsedMs);
  }

  const evidenceByConcept = new Map<string, ConceptEvidence[]>();
  for (const ev of allEvidence) {
    const list = evidenceByConcept.get(ev.conceptId) ?? [];
    list.push({
      ...ev,
      needsSpeedRecheck: recheckForAnswerId.get(ev.answerId) ?? false,
    });
    evidenceByConcept.set(ev.conceptId, list);
  }

  return concepts.map((concept) => {
    const rawList = evidenceByConcept.get(concept.conceptId) ?? [];
    const independentList = rawList
      .filter((e) => !e.isPracticeOnly)
      .slice(-MASTERY_CONFIG.maxEvidencePerConcept);

    if (independentList.length === 0) {
      return {
        conceptId: concept.conceptId,
        chapterId: concept.chapterId,
        titleZh: concept.titleZh,
        titleEn: concept.titleEn,
        status: 'untested',
        accuracyPercent: null,
        masteryIndex: null,
        accuracyEstimateA: null,
        speedFactorF: null,
        insufficientSpeedData: true,
        independentQuestionCount: 0,
        totalAttempts: rawList.length,
        distinctDatesCount: 0,
        hasSingleChoice: false,
        hasShortAnswer: false,
        lastPracticedAt: null,
        needsReviewSuggestion: false,
        recentMcqTimesMs: [],
        needsSpeedRecheckCount: 0,
      };
    }

    let sumW = 0;
    let sumWC = 0;
    let rawCorrect = 0;

    let speedNum = 0;
    let speedDen = 0;
    const recentMcqTimesMs: number[] = [];
    let needsSpeedRecheckCount = 0;

    for (const item of independentList) {
      const w = item.weight * Math.exp(-item.daysSince / MASTERY_CONFIG.decayHalfLifeScaleDays);
      const c = item.correct ? 1 : 0;
      sumW += w;
      sumWC += w * c;
      rawCorrect += c;

      if (item.type === 'single_choice' && item.correct && !item.interrupted) {
        recentMcqTimesMs.push(Math.round(item.activeElapsedMs));
        if (item.needsSpeedRecheck) {
          needsSpeedRecheckCount += 1;
        }
        const baseMs = baselineForAnswerId.get(item.answerId);
        if (baseMs && baseMs > 0 && item.activeElapsedMs > 0) {
          const f = Math.min(1, baseMs / item.activeElapsedMs);
          speedNum += w * f;
          speedDen += w;
        }
      }
    }

    const A =
      (MASTERY_CONFIG.weakPriorNumerator + sumWC) /
      (MASTERY_CONFIG.weakPriorDenominator + sumW);
    const hasSpeed = speedDen > 0;
    const F = hasSpeed ? speedNum / speedDen : null;
    const M = hasSpeed
      ? Math.round(100 * A * (0.9 + 0.1 * (F as number)))
      : Math.round(100 * A);

    const distinctQuestions = new Set(independentList.map((e) => e.questionId)).size;
    const distinctDates = new Set(independentList.map((e) => utcDateKey(e.submittedAt))).size;
    const lastPracticedAt = independentList[independentList.length - 1].submittedAt;
    const staleDays = daysBetween(lastPracticedAt, now);

    const isProvisional =
      distinctQuestions < MASTERY_CONFIG.provisionalMinDistinctQuestions ||
      distinctDates < MASTERY_CONFIG.provisionalMinDistinctDates;

    return {
      conceptId: concept.conceptId,
      chapterId: concept.chapterId,
      titleZh: concept.titleZh,
      titleEn: concept.titleEn,
      status: isProvisional ? 'provisional' : 'established',
      accuracyPercent: Math.round((rawCorrect / independentList.length) * 100),
      masteryIndex: M,
      accuracyEstimateA: Number(A.toFixed(4)),
      speedFactorF: F !== null ? Number(F.toFixed(4)) : null,
      insufficientSpeedData: !hasSpeed,
      independentQuestionCount: distinctQuestions,
      totalAttempts: rawList.length,
      distinctDatesCount: distinctDates,
      hasSingleChoice: independentList.some((e) => e.type === 'single_choice'),
      hasShortAnswer: independentList.some((e) => e.type === 'short_answer'),
      lastPracticedAt,
      needsReviewSuggestion: staleDays > MASTERY_CONFIG.staleReviewDays,
      recentMcqTimesMs: recentMcqTimesMs.slice(-6),
      needsSpeedRecheckCount,
    };
  });
}

export function computeChapterMastery(
  chapters: CanonicalChapter[],
  conceptMasteries: MasterySummary[]
): ChapterMasterySummary[] {
  const masteryMap = new Map(conceptMasteries.map((m) => [m.conceptId, m]));

  return chapters.map((ch) => {
    let weightedSum = 0;
    let weightTotal = 0;
    let accSum = 0;
    let testedCount = 0;
    let latestIso: string | null = null;

    for (const c of ch.concepts) {
      const m = masteryMap.get(c.conceptId);
      if (m && m.status !== 'untested' && m.masteryIndex !== null && m.accuracyPercent !== null) {
        testedCount += 1;
        const w = c.importanceWeight || 1;
        weightedSum += m.masteryIndex * w;
        accSum += m.accuracyPercent * w;
        weightTotal += w;
        if (m.lastPracticedAt && (!latestIso || m.lastPracticedAt > latestIso)) {
          latestIso = m.lastPracticedAt;
        }
      }
    }

    return {
      chapterId: ch.chapterId,
      titleZh: ch.titleZh,
      titleEn: ch.titleEn,
      testedConcepts: testedCount,
      totalConcepts: ch.concepts.length,
      assessmentIncomplete: testedCount < ch.concepts.length,
      masteryIndex: weightTotal > 0 ? Math.round(weightedSum / weightTotal) : null,
      accuracyPercent: weightTotal > 0 ? Math.round(accSum / weightTotal) : null,
      lastPracticedAt: latestIso,
    };
  });
}

export function computeSpacedReviewQueue(
  concepts: ConceptDef[],
  answers: AnswerRecord[],
  evaluations: Evaluation[],
  tombstones: DeletionTombstone[],
  conceptMasteries: MasterySummary[],
  now: Date = new Date()
): ReviewItem[] {
  const masteryMap = new Map(conceptMasteries.map((m) => [m.conceptId, m]));
  const evalMap = new Map(evaluations.filter((e) => !e.invalidated).map((e) => [e.answerId, e]));
  const resetIds = new Set(tombstones.filter((t) => t.mode === 'reset_record').map((t) => t.targetId));
  const evidence = buildConceptEvidenceList(answers, evalMap, resetIds, now).filter(
    (e) => !e.isPracticeOnly
  );

  const byConcept = new Map<string, ConceptEvidence[]>();
  for (const ev of evidence) {
    const arr = byConcept.get(ev.conceptId) ?? [];
    arr.push(ev);
    byConcept.set(ev.conceptId, arr);
  }

  const items: ReviewItem[] = [];
  const intervals = MASTERY_CONFIG.reviewIntervalsDays;

  for (const concept of concepts) {
    const m = masteryMap.get(concept.conceptId);
    const list = byConcept.get(concept.conceptId) ?? [];

    if (list.length === 0) {
      // Untested concept: low-urgency discovery suggestion, or skip if user prefers practiced first?
      // Include with modest priority so learners know untested concepts exist.
      items.push({
        conceptId: concept.conceptId,
        chapterId: concept.chapterId,
        titleZh: concept.titleZh,
        priorityScore: 25,
        reasons: ['尚未作答測驗（待測）'],
        dueAt: now.toISOString(),
        overdueDays: 0,
        intervalDays: 1,
        lastPracticedAt: null,
        masteryIndex: null,
      });
      continue;
    }

    // Count consecutive cross-day correct streak from the end
    const distinctCorrectDates: string[] = [];
    let recentWrongCount = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const ev = list[i];
      if (!ev.correct) {
        if (i >= list.length - 3) recentWrongCount += 1;
        break;
      }
      const dKey = utcDateKey(ev.submittedAt);
      if (!distinctCorrectDates.includes(dKey)) {
        distinctCorrectDates.push(dKey);
      }
    }

    const lastEv = list[list.length - 1];
    let intervalIdx = 0;
    if (!lastEv.correct) {
      intervalIdx = 0; // 1 day when last answer was wrong
    } else {
      intervalIdx = Math.min(intervals.length - 1, Math.max(0, distinctCorrectDates.length - 1));
    }
    const intervalDays = intervals[intervalIdx];
    const dueMs = new Date(lastEv.submittedAt).getTime() + intervalDays * 86400000;
    const overdueDays = (now.getTime() - dueMs) / 86400000;

    const reasons: string[] = [];
    let priorityScore = 0;

    if (recentWrongCount > 0 || !lastEv.correct) {
      reasons.push('近期作答有誤，提前複習');
      priorityScore += 45;
    }
    if (m && m.masteryIndex !== null && m.masteryIndex < 70) {
      reasons.push(`掌握指標偏低 (${m.masteryIndex})`);
      priorityScore += 30;
    }
    if (m && m.status === 'provisional') {
      reasons.push('樣本或跨日資料仍不足（暫估）');
      priorityScore += 15;
    }
    if (overdueDays > 0) {
      reasons.push(`已到期 ${Math.ceil(overdueDays)} 天（週期 ${intervalDays} 天）`);
      priorityScore += Math.min(40, overdueDays * 5);
    }

    if (reasons.length > 0 || overdueDays >= -0.25) {
      items.push({
        conceptId: concept.conceptId,
        chapterId: concept.chapterId,
        titleZh: concept.titleZh,
        priorityScore: Math.round(priorityScore),
        reasons: reasons.length > 0 ? reasons : [`排程週期 ${intervalDays} 天`],
        dueAt: new Date(dueMs).toISOString(),
        overdueDays: Number(overdueDays.toFixed(1)),
        intervalDays,
        lastPracticedAt: lastEv.submittedAt,
        masteryIndex: m?.masteryIndex ?? null,
      });
    }
  }

  return items.sort((a, b) => b.priorityScore - a.priorityScore || b.overdueDays - a.overdueDays);
}
