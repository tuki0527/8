export type TimePeriod = 'dawn' | 'noon' | 'dusk' | 'night' | 'midnight';

export type ThemePreference = 'auto' | TimePeriod | 'fixed_night';

export type TimezonePreference = 'Asia/Taipei' | 'device';

export type FontSizeScale = 'sm' | 'md' | 'lg';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export type ReadingTier = 'short' | 'medium' | 'long';

export interface AppSettings {
  format: 'mooncode.settings';
  schemaVersion: 1;
  appName: string;
  timezoneMode: TimezonePreference;
  themeMode: ThemePreference;
  reducedMotion: boolean;
  fontSize: FontSizeScale;
  deviceId: string;
  recentQuestionTitlesLimit: number;
  sidebarOpen: boolean;
  updatedAt: string;
}

export interface ConceptDef {
  conceptId: string;
  chapterId: string;
  titleZh: string;
  titleEn: string;
  importanceWeight: number;
  summary: string;
}

export interface SlideTermMapping {
  termZh: string;
  termEn: string;
  meaning: string;
}

export interface SlideSimulationStep {
  stepLabel: string;
  actor: string;
  stateSnapshot: Record<string, string>;
  explanation: string;
  highlightLine?: number;
}

export interface SlideSimulation {
  title: string;
  modeLabel: '步驟模擬／結果推演';
  initialActionLabel: string;
  steps: SlideSimulationStep[];
}

export type SlideLayoutVariant = 'split_code' | 'focused_concept' | 'comparison_columns';

export interface CanonicalSlide {
  slideId: string;
  chapterId: string;
  order: number;
  title: string;
  contentVersion: number;
  conceptIds: string[];
  corePoint: string;
  locked: {
    definition: string;
    termMappings: SlideTermMapping[];
    codeTitle: string;
    codeLanguage: 'csharp';
    code: string;
    expectedBehavior: string[];
    learningObjectives: string[];
    rubricBasis: string[];
  };
  editable: {
    analogy: {
      story: string;
      mapping: string;
      boundary: string;
    };
    plainExplanation: string;
    detailLevel: 'concise' | 'standard' | 'detailed';
    layoutVariant: SlideLayoutVariant;
  };
  simulation?: SlideSimulation;
}

export interface CanonicalChapter {
  chapterId: string;
  order: number;
  titleZh: string;
  titleEn: string;
  scenarioTitle: string;
  summary: string;
  contentVersion: number;
  concepts: ConceptDef[];
  slides: CanonicalSlide[];
}

export type RewriteMode = 'analogy_only' | 'presentation_only';

export interface SlideVariant {
  format: 'mooncode.slide_variant';
  schemaVersion: 1;
  variantId: string;
  slideId: string;
  chapterId: string;
  baseContentVersion: number;
  mode: RewriteMode;
  analogy?: {
    story: string;
    mapping: string;
    boundary: string;
  };
  plainExplanation?: string;
  detailLevel?: 'concise' | 'standard' | 'detailed';
  layoutVariant?: SlideLayoutVariant;
  promptNote?: string;
  source: 'user' | 'ai_import';
  requestId?: string;
  savedAt: string;
  updatedRevision: number;
}

export interface RequiredConceptPoint {
  pointId: string;
  conceptId: string;
  description: string;
}

interface QuestionBase {
  questionId: string;
  localId?: string;
  questionVersion: number;
  primaryConceptId: string;
  secondaryConceptIds?: string[];
  difficulty: DifficultyLevel;
  readingTier: ReadingTier;
  prompt: string;
  codeSnippet?: string;
  explanation: string;
}

export interface SingleChoiceQuestion extends QuestionBase {
  type: 'single_choice';
  options: [string, string, string, string];
  correctOptionIndex: 0 | 1 | 2 | 3;
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: 'short_answer';
  rubricVersion: number;
  requiredPoints: RequiredConceptPoint[];
  coreMisconceptions: string[];
  acceptablePrinciples: string[];
  referenceAnswer: string;
}

export type QuestionItem = SingleChoiceQuestion | ShortAnswerQuestion;

export interface QuestionSet {
  format: 'mooncode.question_set';
  schemaVersion: 1;
  setId: string;
  localId?: string;
  setVersion: number;
  chapterId: string;
  contentVersion: number;
  title: string;
  createdAt: string;
  source: 'seed' | 'ai_import';
  conceptIds: string[];
  difficulty: DifficultyLevel;
  questions: QuestionItem[]; // Strictly 7 single_choice + 3 short_answer = 10
  contentHash?: string;
  invalidated?: boolean;
  invalidReason?: string;
}

export interface QuestionSnapshot {
  questionId: string;
  questionVersion: number;
  type: 'single_choice' | 'short_answer';
  primaryConceptId: string;
  secondaryConceptIds?: string[];
  difficulty: DifficultyLevel;
  readingTier: ReadingTier;
  prompt: string;
  codeSnippet?: string;
  explanation: string;
  // Shuffled order stored for single choice
  options?: [string, string, string, string];
  shuffledToOriginalIndices?: [number, number, number, number];
  correctShuffledIndex?: 0 | 1 | 2 | 3;
  // Short answer rubric snapshot
  rubricVersion?: number;
  requiredPoints?: RequiredConceptPoint[];
  coreMisconceptions?: string[];
  acceptablePrinciples?: string[];
  referenceAnswer?: string;
}

export interface TestRun {
  format: 'mooncode.test_run';
  schemaVersion: 1;
  testRunId: string;
  setId: string;
  setVersion: number;
  chapterId: string;
  setTitle: string;
  deviceId: string;
  startedAt: string;
  submittedAt?: string;
  status: 'in_progress' | 'completed';
  currentIndex: number; // 0..9
  questionSnapshots: QuestionSnapshot[];
  answerIds: string[];
  activeQuestionShownAt?: string;
  accumulatedActiveMsForCurrent: number;
  accumulatedWallMsForCurrent: number;
  currentInterrupted: boolean;
}

export interface AnswerRecord {
  format: 'mooncode.answer_record';
  schemaVersion: 1;
  answerId: string;
  testRunId: string;
  setId: string;
  chapterId: string;
  questionId: string;
  questionVersion: number;
  questionIndex: number;
  type: 'single_choice' | 'short_answer';
  primaryConceptId: string;
  secondaryConceptIds?: string[];
  difficulty: DifficultyLevel;
  readingTier: ReadingTier;
  selectedShuffledIndex?: 0 | 1 | 2 | 3;
  selectedOriginalIndex?: 0 | 1 | 2 | 3;
  textAnswer?: string;
  answerHash: string;
  wallElapsedMs: number;
  activeElapsedMs: number;
  interrupted: boolean;
  viewedHintOrAnswerBefore: boolean;
  submittedAt: string;
  // Result status
  status: 'graded' | 'pending_ai';
  correct: boolean | null; // null while pending_ai
  deviceId: string;
  invalidated?: boolean;
  invalidReason?: string;
}

export interface EvaluationPointCheck {
  pointId: string;
  conceptId: string;
  met: boolean;
  evidence: string;
  reason: string;
}

export interface Evaluation {
  format: 'mooncode.evaluation';
  schemaVersion: 1;
  evaluationId: string;
  requestId: string;
  testRunId: string;
  answerId: string;
  questionId: string;
  questionVersion: number;
  answerHash: string;
  rubricVersion: number;
  checks: EvaluationPointCheck[];
  contradictions: string[];
  correct: boolean;
  reason: string;
  referenceAnswer: string;
  reviewConceptIds: string[];
  evaluatedAt: string;
  revision: number;
  source: 'ai_import';
  invalidated?: boolean;
  invalidReason?: string;
}

export interface ConceptEvidence {
  evidenceId: string;
  conceptId: string;
  questionId: string;
  answerId: string;
  testRunId: string;
  type: 'single_choice' | 'short_answer';
  correct: boolean; // 1 or 0
  weight: number; // 1 for single_choice, 2 for short_answer
  submittedAt: string;
  daysSince: number;
  activeElapsedMs: number;
  interrupted: boolean;
  difficulty: DifficultyLevel;
  readingTier: ReadingTier;
  isPracticeOnly: boolean;
  needsSpeedRecheck: boolean;
}

export interface MasterySummary {
  conceptId: string;
  chapterId: string;
  titleZh: string;
  titleEn: string;
  status: 'untested' | 'provisional' | 'established';
  accuracyPercent: number | null;
  masteryIndex: number | null; // M = 0..100
  accuracyEstimateA: number | null;
  speedFactorF: number | null;
  insufficientSpeedData: boolean;
  independentQuestionCount: number;
  totalAttempts: number;
  distinctDatesCount: number;
  hasSingleChoice: boolean;
  hasShortAnswer: boolean;
  lastPracticedAt: string | null;
  needsReviewSuggestion: boolean; // > 14 days stale
  recentMcqTimesMs: number[];
  needsSpeedRecheckCount: number;
}

export interface ChapterMasterySummary {
  chapterId: string;
  titleZh: string;
  titleEn: string;
  testedConcepts: number;
  totalConcepts: number;
  assessmentIncomplete: boolean;
  masteryIndex: number | null;
  accuracyPercent: number | null;
  lastPracticedAt: string | null;
}

export interface ReviewItem {
  conceptId: string;
  chapterId: string;
  titleZh: string;
  priorityScore: number;
  reasons: string[];
  dueAt: string;
  overdueDays: number;
  intervalDays: number;
  lastPracticedAt: string | null;
  masteryIndex: number | null;
}

export interface WrongBookEntry {
  answerId: string;
  testRunId: string;
  setId: string;
  chapterId: string;
  questionId: string;
  questionVersion: number;
  primaryConceptId: string;
  prompt: string;
  codeSnippet?: string;
  type: 'single_choice' | 'short_answer';
  submittedAt: string;
  correct: boolean;
  explanation: string;
  userAnswerDisplay: string;
  referenceAnswerDisplay: string;
  hiddenFromWrongBook: boolean;
  retryHistory: Array<{
    answerId: string;
    submittedAt: string;
    correct: boolean | null;
    status: 'graded' | 'pending_ai';
  }>;
}

export interface DeletionTombstone {
  format: 'mooncode.tombstone';
  schemaVersion: 1;
  tombstoneId: string;
  targetType: 'question_set' | 'wrong_book_item' | 'test_run' | 'answer_record' | 'slide_variant';
  targetId: string;
  mode: 'hide_wrong_book' | 'reset_record' | 'delete_set' | 'revert_variant';
  revision: number;
  reason?: string;
  deletedAt: string;
  deviceId: string;
}

export interface PendingOperation {
  operationId: string;
  entityType: 'question_set' | 'test_run' | 'answer_record' | 'evaluation' | 'slide_variant' | 'tombstone' | 'issue_report';
  entityId: string;
  action: 'upsert' | 'delete';
  payload: unknown;
  createdAt: string;
  epoch: number;
  status: 'pending' | 'syncing' | 'synced' | 'quarantined';
}

export interface QuarantinedOperation {
  quarantineId: string;
  operation: PendingOperation;
  quarantinedAt: string;
  localEpoch: number;
  remoteEpoch: number;
  reason: string;
}

export type AiTaskType = 'generate_question_set' | 'evaluate_short_answers' | 'rewrite_slide';

export interface AiRequest {
  format: 'mooncode.ai_request';
  schemaVersion: 1;
  requestId: string;
  task: AiTaskType;
  baseDatasetEpoch: number;
  createdAt: string;
  status: 'pending' | 'applied' | 'cancelled' | 'expired';
  meta: {
    chapterId?: string;
    testRunId?: string;
    answerIds?: string[];
    slideId?: string;
    baseContentVersion?: number;
    mode?: RewriteMode;
  };
  promptText: string;
}

export interface AiResponseEnvelope<T = unknown> {
  format: 'mooncode.ai_response';
  schemaVersion: 1;
  task: AiTaskType;
  requestId: string;
  baseDatasetEpoch: number;
  payload: T;
}

export interface IssueReport {
  format: 'mooncode.issue_report';
  schemaVersion: 1;
  reportId: string;
  targetType: 'question' | 'evaluation' | 'slide_variant';
  targetId: string;
  reason: string;
  createdAt: string;
  actionTaken: 'recorded' | 'invalidated_question' | 'reverted_variant';
}

export interface ShardEntry {
  id: string;
  hash: string;
  objectPath: string;
  updatedAt: string;
  chapterId?: string;
  yearMonth?: string;
  summary?: Record<string, unknown>;
}

export interface ShardIndex {
  format: 'mooncode.shard_index';
  schemaVersion: 1;
  indexType: 'sets' | 'runs' | 'evaluations' | 'slides' | 'changes';
  partition: string;
  entries: ShardEntry[];
}

export interface SnapshotManifest {
  format: 'mooncode.manifest';
  schemaVersion: 1;
  datasetId: string;
  revisionId: string;
  generation: number;
  syncEpoch: number;
  createdAt: string;
  deviceId: string;
  parentRevisionId: string | null;
  isRecovery?: boolean;
  recoveredFromRevisionId?: string;
  stats: {
    questionSetCount: number;
    testRunCount: number;
    answerCount: number;
    evaluationCount: number;
    slideVariantCount: number;
    tombstoneCount: number;
  };
  indexes: Array<{
    indexType: 'sets' | 'runs' | 'evaluations' | 'slides' | 'changes';
    partition: string;
    path: string;
    sha256: string;
    count: number;
  }>;
  archives: Array<{
    archiveId: string;
    label: string;
    chapterId?: string;
    yearMonth?: string;
    path: string;
    sha256: string;
    itemCount: number;
  }>;
  appliedOperationIds: string[];
}

export interface PointerSlot {
  revisionId: string;
  manifestPath: string;
  manifestSha256: string;
  generation: number;
  syncEpoch: number;
  committedAt: string;
  commitSha?: string;
}

export interface ActivePointer {
  format: 'mooncode.head';
  schemaVersion: 1;
  datasetId: string;
  syncEpoch: number;
  generation: number;
  active: PointerSlot | null;
  previous: PointerSlot | null;
  recoveryLog: Array<{
    at: string;
    fromRevisionId: string;
    toRevisionId: string;
    newEpoch: number;
    reason: string;
  }>;
}

export interface StudyBundlePayload {
  format: 'mooncode.study_bundle';
  schemaVersion: 1;
  exportedAt: string;
  datasetId: string;
  syncEpoch: number;
  generation: number;
  settings: AppSettings;
  questionSets: QuestionSet[];
  testRuns: TestRun[];
  answers: AnswerRecord[];
  evaluations: Evaluation[];
  slideVariants: SlideVariant[];
  tombstones: DeletionTombstone[];
  issueReports: IssueReport[];
}

export interface StudyBundle extends StudyBundlePayload {
  integritySha256: string;
}

export type SaveSyncStatus =
  | 'local_only'
  | 'saved_local'
  | 'pending_sync'
  | 'syncing'
  | 'synced'
  | 'sync_failed'
  | 'conflict_quarantine';
