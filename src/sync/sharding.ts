import { sha256Utf8 } from '../domain/hash.ts';
import type {
  ActivePointer,
  AnswerRecord,
  DeletionTombstone,
  Evaluation,
  QuestionSet,
  ShardEntry,
  ShardIndex,
  SlideVariant,
  SnapshotManifest,
  TestRun,
} from '../domain/types.ts';
import {
  ActivePointerSchema,
  AnswerRecordSchema,
  DeletionTombstoneSchema,
  EvaluationSchema,
  QuestionSetSchema,
  SlideVariantSchema,
  SnapshotManifestSchema,
  TestRunSchema,
} from '../schemas/runtimeSchemas.ts';

export const STUDY_DATA_PREFIX = 'study-data';
export const MAX_SHARD_ENTRIES = 200;

export function assertSafeStudyDataPath(path: string): void {
  if (!path.startsWith(`${STUDY_DATA_PREFIX}/`) || path.includes('..') || path.includes('\\')) {
    throw new Error(`不安全的同步路徑（僅允許 ${STUDY_DATA_PREFIX}/）：${path}`);
  }
}

export interface StagedBlob {
  path: string;
  contentUtf8: string;
  sha256: string;
}

export interface MaterializedDataset {
  questionSets: QuestionSet[];
  testRuns: TestRun[];
  answers: AnswerRecord[];
  evaluations: Evaluation[];
  slideVariants: SlideVariant[];
  tombstones: DeletionTombstone[];
}

function yearMonthFromIso(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function shardChunks<T>(items: T[], size: number = MAX_SHARD_ENTRIES): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface BuildCandidateSnapshotInput {
  datasetId: string;
  revisionId: string;
  generation: number;
  syncEpoch: number;
  deviceId: string;
  parentRevisionId: string | null;
  appliedOperationIds: string[];
  data: MaterializedDataset;
  existingBlobsByPath: Map<string, string>; // path -> sha256 to avoid rewriting unchanged immutable blobs
  isRecovery?: boolean;
  recoveredFromRevisionId?: string;
  nowIso?: string;
}

export async function buildCandidateSnapshot(input: BuildCandidateSnapshotInput): Promise<{
  manifest: SnapshotManifest;
  manifestPath: string;
  manifestBlob: StagedBlob;
  newBlobs: StagedBlob[];
  allReferencedPaths: Set<string>;
}> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const newBlobs: StagedBlob[] = [];
  const allReferencedPaths = new Set<string>();

  async function stageJsonObject(
    pathBuilder: (hash: string) => string,
    obj: unknown
  ): Promise<{ path: string; sha256: string }> {
    const contentUtf8 = JSON.stringify(obj);
    const sha256 = await sha256Utf8(contentUtf8);
    const path = pathBuilder(sha256);
    assertSafeStudyDataPath(path);
    allReferencedPaths.add(path);
    if (input.existingBlobsByPath.get(path) !== sha256) {
      newBlobs.push({ path, contentUtf8, sha256 });
    }
    return { path, sha256 };
  }

  // Group runs with their answers in YYYY-MM run bundles so a session doesn't rewrite all answers
  const answersByRunId = new Map<string, AnswerRecord[]>();
  for (const ans of input.data.answers) {
    const list = answersByRunId.get(ans.testRunId) ?? [];
    list.push(ans);
    answersByRunId.set(ans.testRunId, list);
  }

  const indexDescriptors: SnapshotManifest['indexes'] = [];

  async function buildShardedIndexes(
    indexType: 'sets' | 'runs' | 'evaluations' | 'slides' | 'changes',
    entriesByPartition: Map<string, ShardEntry[]>
  ): Promise<void> {
    const partitions = Array.from(entriesByPartition.keys()).sort();
    for (const partition of partitions) {
      const entries = (entriesByPartition.get(partition) ?? []).sort((a, b) =>
        a.id.localeCompare(b.id)
      );
      const chunks = shardChunks(entries, MAX_SHARD_ENTRIES);
      for (let i = 0; i < chunks.length; i++) {
        const shardObj: ShardIndex = {
          format: 'mooncode.shard_index',
          schemaVersion: 1,
          indexType,
          partition,
          entries: chunks[i],
        };
        const { path, sha256 } = await stageJsonObject(
          (h) => `${STUDY_DATA_PREFIX}/indexes/${indexType}/${partition}/shard-${String(i + 1).padStart(3, '0')}.${h.slice(0, 12)}.json`,
          shardObj
        );
        indexDescriptors.push({
          indexType,
          partition: `${partition}#${i + 1}`,
          path,
          sha256,
          count: chunks[i].length,
        });
      }
    }
  }

  // 1. QuestionSets partitioned by chapterId
  const setEntries = new Map<string, ShardEntry[]>();
  for (const qs of input.data.questionSets) {
    const { path, sha256 } = await stageJsonObject(
      (h) => `${STUDY_DATA_PREFIX}/objects/sets/${qs.chapterId}/${qs.setId}.${h.slice(0, 12)}.json`,
      qs
    );
    const arr = setEntries.get(qs.chapterId) ?? [];
    arr.push({
      id: qs.setId,
      hash: sha256,
      objectPath: path,
      updatedAt: qs.createdAt,
      chapterId: qs.chapterId,
      summary: { title: qs.title, source: qs.source, difficulty: qs.difficulty },
    });
    setEntries.set(qs.chapterId, arr);
  }
  await buildShardedIndexes('sets', setEntries);

  // 2. TestRuns + their AnswerRecords partitioned by YYYY-MM
  const runEntries = new Map<string, ShardEntry[]>();
  for (const run of input.data.testRuns) {
    const ym = yearMonthFromIso(run.startedAt);
    const runAnswers = (answersByRunId.get(run.testRunId) ?? []).sort(
      (a, b) => a.questionIndex - b.questionIndex
    );
    const bundleObj = { run, answers: runAnswers };
    const { path, sha256 } = await stageJsonObject(
      (h) => `${STUDY_DATA_PREFIX}/objects/runs/${ym}/${run.testRunId}.${h.slice(0, 12)}.json`,
      bundleObj
    );
    const arr = runEntries.get(ym) ?? [];
    arr.push({
      id: run.testRunId,
      hash: sha256,
      objectPath: path,
      updatedAt: run.submittedAt ?? run.startedAt,
      chapterId: run.chapterId,
      yearMonth: ym,
      summary: { setId: run.setId, status: run.status, answerCount: runAnswers.length },
    });
    runEntries.set(ym, arr);
  }
  await buildShardedIndexes('runs', runEntries);

  // 3. Evaluations partitioned by YYYY-MM
  const evalEntries = new Map<string, ShardEntry[]>();
  for (const ev of input.data.evaluations) {
    const ym = yearMonthFromIso(ev.evaluatedAt);
    const { path, sha256 } = await stageJsonObject(
      (h) => `${STUDY_DATA_PREFIX}/objects/evaluations/${ym}/${ev.evaluationId}.${h.slice(0, 12)}.json`,
      ev
    );
    const arr = evalEntries.get(ym) ?? [];
    arr.push({
      id: ev.evaluationId,
      hash: sha256,
      objectPath: path,
      updatedAt: ev.evaluatedAt,
      yearMonth: ym,
      summary: { answerId: ev.answerId, correct: ev.correct, revision: ev.revision },
    });
    evalEntries.set(ym, arr);
  }
  await buildShardedIndexes('evaluations', evalEntries);

  // 4. SlideVariants partitioned by chapterId
  const slideEntries = new Map<string, ShardEntry[]>();
  for (const sv of input.data.slideVariants) {
    const { path, sha256 } = await stageJsonObject(
      (h) => `${STUDY_DATA_PREFIX}/objects/slides/${sv.chapterId}/${sv.variantId}.${h.slice(0, 12)}.json`,
      sv
    );
    const arr = slideEntries.get(sv.chapterId) ?? [];
    arr.push({
      id: sv.variantId,
      hash: sha256,
      objectPath: path,
      updatedAt: sv.savedAt,
      chapterId: sv.chapterId,
      summary: { slideId: sv.slideId, mode: sv.mode, revision: sv.updatedRevision },
    });
    slideEntries.set(sv.chapterId, arr);
  }
  await buildShardedIndexes('slides', slideEntries);

  // 5. DeletionTombstones partitioned under changes/tombstones
  const changeEntries = new Map<string, ShardEntry[]>();
  for (const tb of input.data.tombstones) {
    const ym = yearMonthFromIso(tb.deletedAt);
    const { path, sha256 } = await stageJsonObject(
      (h) => `${STUDY_DATA_PREFIX}/objects/changes/${ym}/${tb.tombstoneId}.${h.slice(0, 12)}.json`,
      tb
    );
    const arr = changeEntries.get(ym) ?? [];
    arr.push({
      id: tb.tombstoneId,
      hash: sha256,
      objectPath: path,
      updatedAt: tb.deletedAt,
      yearMonth: ym,
      summary: { targetType: tb.targetType, targetId: tb.targetId, mode: tb.mode },
    });
    changeEntries.set(ym, arr);
  }
  await buildShardedIndexes('changes', changeEntries);

  const manifest: SnapshotManifest = {
    format: 'mooncode.manifest',
    schemaVersion: 1,
    datasetId: input.datasetId,
    revisionId: input.revisionId,
    generation: input.generation,
    syncEpoch: input.syncEpoch,
    createdAt: nowIso,
    deviceId: input.deviceId,
    parentRevisionId: input.parentRevisionId,
    isRecovery: input.isRecovery,
    recoveredFromRevisionId: input.recoveredFromRevisionId,
    stats: {
      questionSetCount: input.data.questionSets.length,
      testRunCount: input.data.testRuns.length,
      answerCount: input.data.answers.length,
      evaluationCount: input.data.evaluations.length,
      slideVariantCount: input.data.slideVariants.length,
      tombstoneCount: input.data.tombstones.length,
    },
    indexes: indexDescriptors,
    archives: [],
    appliedOperationIds: Array.from(new Set(input.appliedOperationIds)),
  };

  const manifestPath = `${STUDY_DATA_PREFIX}/manifests/${input.revisionId}.json`;
  const manifestUtf8 = JSON.stringify(manifest, null, 2);
  const manifestSha = await sha256Utf8(manifestUtf8);
  allReferencedPaths.add(manifestPath);

  return {
    manifest,
    manifestPath,
    manifestBlob: { path: manifestPath, contentUtf8: manifestUtf8, sha256: manifestSha },
    newBlobs,
    allReferencedPaths,
  };
}

export async function verifyAndLoadSnapshot(
  manifestPath: string,
  expectedManifestSha256: string | undefined,
  readUtf8: (path: string) => Promise<string | null>
): Promise<{
  ok: true;
  manifest: SnapshotManifest;
  dataset: MaterializedDataset;
  referencedPaths: Set<string>;
} | {
  ok: false;
  reason: string;
}> {
  const referencedPaths = new Set<string>();
  try {
    assertSafeStudyDataPath(manifestPath);
    const manifestRaw = await readUtf8(manifestPath);
    if (manifestRaw === null) {
      return { ok: false, reason: `遺失 manifest 檔案：${manifestPath}` };
    }
    const actualManifestSha = await sha256Utf8(manifestRaw);
    if (expectedManifestSha256 && actualManifestSha !== expectedManifestSha256) {
      return {
        ok: false,
        reason: `Manifest 雜湊不符（${manifestPath}）：預期 ${expectedManifestSha256.slice(0, 12)}，實際 ${actualManifestSha.slice(0, 12)}`,
      };
    }
    const parsedManifest = SnapshotManifestSchema.safeParse(JSON.parse(manifestRaw));
    if (!parsedManifest.success) {
      return { ok: false, reason: `Manifest 格式損毀或版次不相容：${manifestPath}` };
    }
    const manifest = parsedManifest.data as SnapshotManifest;
    referencedPaths.add(manifestPath);

    const questionSets: QuestionSet[] = [];
    const testRuns: TestRun[] = [];
    const answers: AnswerRecord[] = [];
    const evaluations: Evaluation[] = [];
    const slideVariants: SlideVariant[] = [];
    const tombstones: DeletionTombstone[] = [];

    for (const idxDesc of manifest.indexes) {
      assertSafeStudyDataPath(idxDesc.path);
      const shardRaw = await readUtf8(idxDesc.path);
      if (shardRaw === null) {
        return { ok: false, reason: `缺少索引分片：${idxDesc.path}` };
      }
      const actualShardSha = await sha256Utf8(shardRaw);
      if (actualShardSha !== idxDesc.sha256) {
        return { ok: false, reason: `索引分片雜湊損毀：${idxDesc.path}` };
      }
      referencedPaths.add(idxDesc.path);
      const shard = JSON.parse(shardRaw) as ShardIndex;

      for (const entry of shard.entries) {
        assertSafeStudyDataPath(entry.objectPath);
        const objRaw = await readUtf8(entry.objectPath);
        if (objRaw === null) {
          return { ok: false, reason: `缺少資料物件：${entry.objectPath}` };
        }
        const actualObjSha = await sha256Utf8(objRaw);
        if (actualObjSha !== entry.hash) {
          return { ok: false, reason: `物件內容雜湊驗證失敗（疑似損毀）：${entry.objectPath}` };
        }
        referencedPaths.add(entry.objectPath);
        const objJson = JSON.parse(objRaw);

        if (idxDesc.indexType === 'sets') {
          const r = QuestionSetSchema.safeParse(objJson);
          if (!r.success) return { ok: false, reason: `題組物件驗證失敗：${entry.objectPath}` };
          questionSets.push(r.data as QuestionSet);
        } else if (idxDesc.indexType === 'runs') {
          const bundle = objJson as { run: unknown; answers: unknown[] };
          const rRun = TestRunSchema.safeParse(bundle.run);
          if (!rRun.success) return { ok: false, reason: `測驗紀錄物件驗證失敗：${entry.objectPath}` };
          testRuns.push(rRun.data as TestRun);
          for (const a of bundle.answers ?? []) {
            const rAns = AnswerRecordSchema.safeParse(a);
            if (!rAns.success) return { ok: false, reason: `作答紀錄驗證失敗：${entry.objectPath}` };
            answers.push(rAns.data as AnswerRecord);
          }
        } else if (idxDesc.indexType === 'evaluations') {
          const r = EvaluationSchema.safeParse(objJson);
          if (!r.success) return { ok: false, reason: `評閱物件驗證失敗：${entry.objectPath}` };
          evaluations.push(r.data as Evaluation);
        } else if (idxDesc.indexType === 'slides') {
          const r = SlideVariantSchema.safeParse(objJson);
          if (!r.success) return { ok: false, reason: `簡報變體驗證失敗：${entry.objectPath}` };
          slideVariants.push(r.data as SlideVariant);
        } else if (idxDesc.indexType === 'changes') {
          const r = DeletionTombstoneSchema.safeParse(objJson);
          if (!r.success) return { ok: false, reason: `刪除墓碑驗證失敗：${entry.objectPath}` };
          tombstones.push(r.data as DeletionTombstone);
        }
      }
    }

    return {
      ok: true,
      manifest,
      dataset: { questionSets, testRuns, answers, evaluations, slideVariants, tombstones },
      referencedPaths,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `讀取快照時發生錯誤：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function parseActivePointerSafe(rawUtf8: string | null): {
  ok: true;
  pointer: ActivePointer;
} | {
  ok: false;
  reason: string;
} {
  if (rawUtf8 === null) {
    return { ok: false, reason: '遠端尚未建立 HEAD.json' };
  }
  try {
    const parsed = ActivePointerSchema.safeParse(JSON.parse(rawUtf8));
    if (!parsed.success) {
      return { ok: false, reason: 'HEAD.json 結構損毀或不支援的 schemaVersion' };
    }
    return { ok: true, pointer: parsed.data as ActivePointer };
  } catch (err) {
    return { ok: false, reason: `HEAD.json 解析失敗：${err instanceof Error ? err.message : String(err)}` };
  }
}

export function buildArchiveExports(data: MaterializedDataset): Array<{
  archiveId: string;
  label: string;
  chapterId: string;
  itemCount: number;
  content: {
    format: 'mooncode.chapter_archive';
    schemaVersion: 1;
    chapterId: string;
    exportedAt: string;
    questionSets: QuestionSet[];
    testRuns: TestRun[];
    answers: AnswerRecord[];
    evaluations: Evaluation[];
    slideVariants: SlideVariant[];
  };
}> {
  const chapters = new Set<string>();
  data.questionSets.forEach((s) => chapters.add(s.chapterId));
  data.testRuns.forEach((r) => chapters.add(r.chapterId));
  data.slideVariants.forEach((v) => chapters.add(v.chapterId));

  const nowIso = new Date().toISOString();
  return Array.from(chapters)
    .sort()
    .map((chapterId) => {
      const questionSets = data.questionSets.filter((s) => s.chapterId === chapterId);
      const testRuns = data.testRuns.filter((r) => r.chapterId === chapterId);
      const runIds = new Set(testRuns.map((r) => r.testRunId));
      const answers = data.answers.filter((a) => a.chapterId === chapterId);
      const evaluations = data.evaluations.filter((e) => runIds.has(e.testRunId));
      const slideVariants = data.slideVariants.filter((v) => v.chapterId === chapterId);
      const itemCount =
        questionSets.length +
        testRuns.length +
        answers.length +
        evaluations.length +
        slideVariants.length;

      return {
        archiveId: `archive-${chapterId}`,
        label: `章節封存 (${chapterId})`,
        chapterId,
        itemCount,
        content: {
          format: 'mooncode.chapter_archive' as const,
          schemaVersion: 1 as const,
          chapterId,
          exportedAt: nowIso,
          questionSets,
          testRuns,
          answers,
          evaluations,
          slideVariants,
        },
      };
    });
}

