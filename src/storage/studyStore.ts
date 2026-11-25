import { CANONICAL_CHAPTERS } from '../data/curriculum/index.ts';
import { SEED_QUESTION_SETS } from '../data/seedSets/index.ts';
import { computeBundleIntegrityHash, generateUuid, sha256Canonical } from '../domain/hash.ts';
import type {
  ActivePointer,
  AiRequest,
  AnswerRecord,
  AppSettings,
  DeletionTombstone,
  Evaluation,
  IssueReport,
  PendingOperation,
  QuarantinedOperation,
  QuestionSet,
  SlideVariant,
  StudyBundle,
  TestRun,
} from '../domain/types.ts';
import type { AiImportValidationResult } from '../domain/aiRoundtrip.ts';
import type { MaterializedDataset } from '../sync/sharding.ts';
import {
  HttpRemoteGitAdapter,
  type LocalSyncBackend,
  type RemoteGitAdapter,
  SyncCoordinator,
  type SyncRunOutcome,
} from '../sync/syncEngine.ts';
import { validateStudyBundleOffThread } from '../workers/workerClient.ts';
import {
  getDatasetEpoch,
  getDatasetId,
  getDb,
  getMetaValue,
  putWithOutbox,
  setMetaValue,
} from './db.ts';
import { loadAppSettings, saveAppSettings } from './settings.ts';

export interface LocalStoreSnapshot {
  questionSets: QuestionSet[];
  testRuns: TestRun[];
  answers: AnswerRecord[];
  evaluations: Evaluation[];
  slideVariants: SlideVariant[];
  tombstones: DeletionTombstone[];
  pendingOutbox: PendingOperation[];
  quarantined: QuarantinedOperation[];
  aiRequests: AiRequest[];
  issueReports: IssueReport[];
  pointer: ActivePointer | null;
  lastKnownGoodPointer: ActivePointer | null;
  syncEpoch: number;
  generation: number;
  datasetId: string;
  lastSavedAt: string | null;
}

class IndexedDbSyncBackend implements LocalSyncBackend {
  async getDatasetId(): Promise<string> {
    return getDatasetId();
  }
  async getSyncEpoch(): Promise<number> {
    return getDatasetEpoch();
  }
  async setSyncEpoch(epoch: number): Promise<void> {
    await setMetaValue('syncEpoch', epoch);
  }
  async getLocalDataset(): Promise<MaterializedDataset> {
    const db = await getDb();
    const [questionSets, testRuns, answers, evaluations, slideVariants, tombstones] =
      await Promise.all([
        db.getAll('question_sets'),
        db.getAll('test_runs'),
        db.getAll('answers'),
        db.getAll('evaluations'),
        db.getAll('slide_variants'),
        db.getAll('tombstones'),
      ]);
    return { questionSets, testRuns, answers, evaluations, slideVariants, tombstones };
  }
  async replaceLocalWithDataset(dataset: MaterializedDataset): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(
      ['question_sets', 'test_runs', 'answers', 'evaluations', 'slide_variants', 'tombstones'],
      'readwrite'
    );
    await Promise.all([
      tx.objectStore('question_sets').clear(),
      tx.objectStore('test_runs').clear(),
      tx.objectStore('answers').clear(),
      tx.objectStore('evaluations').clear(),
      tx.objectStore('slide_variants').clear(),
      tx.objectStore('tombstones').clear(),
    ]);
    for (const s of dataset.questionSets) await tx.objectStore('question_sets').put(s);
    for (const r of dataset.testRuns) await tx.objectStore('test_runs').put(r);
    for (const a of dataset.answers) await tx.objectStore('answers').put(a);
    for (const e of dataset.evaluations) await tx.objectStore('evaluations').put(e);
    for (const v of dataset.slideVariants) await tx.objectStore('slide_variants').put(v);
    for (const t of dataset.tombstones) await tx.objectStore('tombstones').put(t);
    await tx.done;
  }
  async getPendingOutbox(): Promise<PendingOperation[]> {
    const db = await getDb();
    return db.getAllFromIndex('outbox', 'by-status', 'pending');
  }
  async markOutboxSynced(operationIds: string[]): Promise<void> {
    if (operationIds.length === 0) return;
    const db = await getDb();
    const tx = db.transaction('outbox', 'readwrite');
    for (const id of operationIds) {
      const existing = await tx.store.get(id);
      if (existing) {
        await tx.store.put({ ...existing, status: 'synced' });
      }
    }
    await tx.done;
  }
  async quarantineOperations(ops: QuarantinedOperation[]): Promise<void> {
    if (ops.length === 0) return;
    const db = await getDb();
    const tx = db.transaction(['outbox', 'quarantine'], 'readwrite');
    for (const q of ops) {
      await tx.objectStore('outbox').put(q.operation);
      await tx.objectStore('quarantine').put(q);
    }
    await tx.done;
  }
  async getSavedPointer(): Promise<ActivePointer | null> {
    const db = await getDb();
    const rec = await db.get('snapshots_meta', 'head');
    return rec ? (rec.data as ActivePointer) : null;
  }
  async savePointer(pointer: ActivePointer, isLastKnownGood: boolean): Promise<void> {
    const db = await getDb();
    const nowIso = new Date().toISOString();
    const tx = db.transaction(['snapshots_meta', 'meta'], 'readwrite');
    await tx.objectStore('snapshots_meta').put({ key: 'head', data: pointer, savedAt: nowIso });
    if (isLastKnownGood) {
      await tx.objectStore('snapshots_meta').put({
        key: 'last_known_good_head',
        data: pointer,
        savedAt: nowIso,
      });
    }
    await tx.objectStore('meta').put({ key: 'generation', value: pointer.generation });
    await tx.objectStore('meta').put({ key: 'syncEpoch', value: pointer.syncEpoch });
    await tx.done;
  }
}

export const httpRemoteAdapter = new HttpRemoteGitAdapter();
export const localSyncBackend = new IndexedDbSyncBackend();

export function broadcastDataChange(reason: string): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('mooncode-sync-events');
      ch.postMessage({ type: 'data_changed', reason, at: Date.now() });
      ch.close();
    }
  } catch {
    // Ignore unsupported BroadcastChannel contexts
  }
}

export async function initializeLocalStore(): Promise<void> {
  const db = await getDb();
  const initialized = await getMetaValue<boolean>('seeded_v1', false);

  // Ensure canonical chapters cache is always up to date
  const chTx = db.transaction('chapters_cache', 'readwrite');
  for (const ch of CANONICAL_CHAPTERS) {
    await chTx.store.put(ch);
  }
  await chTx.done;

  if (!initialized) {
    const tombstones = await db.getAll('tombstones');
    const deletedIds = new Set(tombstones.filter((t) => t.mode === 'delete_set').map((t) => t.targetId));
    const preparedSeeds: Array<(typeof SEED_QUESTION_SETS)[number] & { contentHash: string }> = [];
    for (const seed of SEED_QUESTION_SETS) {
      if (!deletedIds.has(seed.setId)) {
        const hash = await sha256Canonical({ ...seed, contentHash: undefined });
        preparedSeeds.push({ ...seed, contentHash: hash });
      }
    }

    const tx = db.transaction(['question_sets', 'meta'], 'readwrite');
    for (const item of preparedSeeds) {
      await tx.objectStore('question_sets').put(item);
    }
    await tx.objectStore('meta').put({ key: 'seeded_v1', value: true });
    await tx.objectStore('meta').put({ key: 'datasetId', value: 'mooncode-primary' });
    await tx.objectStore('meta').put({ key: 'syncEpoch', value: 1 });
    await tx.objectStore('meta').put({ key: 'generation', value: 0 });
    await tx.done;
  }
}

export async function loadLocalSnapshot(): Promise<LocalStoreSnapshot> {
  await initializeLocalStore();
  const db = await getDb();
  const [
    questionSets,
    testRuns,
    answers,
    evaluations,
    slideVariants,
    tombstones,
    pendingOutbox,
    quarantined,
    aiRequests,
    issueReports,
    headMeta,
    lastKnownGoodPointer,
    syncEpoch,
    generation,
    datasetId,
    lastSavedAt,
  ] = await Promise.all([
    db.getAll('question_sets'),
    db.getAll('test_runs'),
    db.getAll('answers'),
    db.getAll('evaluations'),
    db.getAll('slide_variants'),
    db.getAll('tombstones'),
    db.getAllFromIndex('outbox', 'by-status', 'pending'),
    db.getAll('quarantine'),
    db.getAll('ai_requests'),
    db.getAll('issue_reports'),
    db.get('snapshots_meta', 'head'),
    db.get('snapshots_meta', 'last_known_good_head'),
    getMetaValue<number>('syncEpoch', 1),
    getMetaValue<number>('generation', 0),
    getMetaValue<string>('datasetId', 'mooncode-primary'),
    getMetaValue<string | null>('lastManualSavedAt', null),
  ]);

  const deletedSetIds = new Set(
    tombstones.filter((t) => t.mode === 'delete_set').map((t) => t.targetId)
  );
  const revertedVariantIds = new Set(
    tombstones.filter((t) => t.mode === 'revert_variant').map((t) => t.targetId)
  );

  return {
    questionSets: questionSets.filter((s) => !deletedSetIds.has(s.setId)),
    testRuns,
    answers,
    evaluations,
    slideVariants: slideVariants.filter((v) => !revertedVariantIds.has(v.variantId)),
    tombstones,
    pendingOutbox,
    quarantined,
    aiRequests,
    issueReports,
    pointer: headMeta ? (headMeta.data as ActivePointer) : null,
    lastKnownGoodPointer: lastKnownGoodPointer ? (lastKnownGoodPointer.data as ActivePointer) : null,
    syncEpoch,
    generation,
    datasetId,
    lastSavedAt,
  };
}

export async function recordTestRunStart(run: TestRun): Promise<void> {
  const epoch = await getDatasetEpoch();
  await putWithOutbox('test_runs', run, {
    operationId: generateUuid(),
    entityType: 'test_run',
    entityId: run.testRunId,
    action: 'upsert',
    payload: run,
    createdAt: new Date().toISOString(),
    epoch,
    status: 'pending',
  });
  broadcastDataChange('test_run_started');
}

export async function updateInProgressRunTimer(run: TestRun): Promise<void> {
  const db = await getDb();
  const existing = await db.get('test_runs', run.testRunId);
  if (existing && existing.status !== 'in_progress') {
    return;
  }
  await db.put('test_runs', run);
}

export async function commitQuizAnswer(
  answer: AnswerRecord,
  updatedRun: TestRun
): Promise<void> {
  const db = await getDb();
  const epoch = await getDatasetEpoch();
  const nowIso = new Date().toISOString();

  const tx = db.transaction(['answers', 'test_runs', 'outbox'], 'readwrite');
  await tx.objectStore('answers').put(answer);
  await tx.objectStore('test_runs').put(updatedRun);
  await tx.objectStore('outbox').put({
    operationId: generateUuid(),
    entityType: 'answer_record',
    entityId: answer.answerId,
    action: 'upsert',
    payload: answer,
    createdAt: nowIso,
    epoch,
    status: 'pending',
  });
  await tx.objectStore('outbox').put({
    operationId: generateUuid(),
    entityType: 'test_run',
    entityId: updatedRun.testRunId,
    action: 'upsert',
    payload: updatedRun,
    createdAt: nowIso,
    epoch,
    status: 'pending',
  });
  await tx.done;
  broadcastDataChange('answer_committed');
}

export async function saveSlideVariant(variant: SlideVariant): Promise<void> {
  const epoch = await getDatasetEpoch();
  await putWithOutbox('slide_variants', variant, {
    operationId: generateUuid(),
    entityType: 'slide_variant',
    entityId: variant.variantId,
    action: 'upsert',
    payload: variant,
    createdAt: new Date().toISOString(),
    epoch,
    status: 'pending',
  });
  broadcastDataChange('slide_variant_saved');
}

export async function revertSlideVariantsForSlide(
  slideId: string,
  deviceId: string
): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllFromIndex('slide_variants', 'by-slide', slideId);
  if (existing.length === 0) return;
  const epoch = await getDatasetEpoch();
  const nowIso = new Date().toISOString();
  const tx = db.transaction(['tombstones', 'outbox'], 'readwrite');
  for (const v of existing) {
    const tb: DeletionTombstone = {
      format: 'mooncode.tombstone',
      schemaVersion: 1,
      tombstoneId: generateUuid(),
      targetType: 'slide_variant',
      targetId: v.variantId,
      mode: 'revert_variant',
      revision: v.updatedRevision + 1,
      deletedAt: nowIso,
      deviceId,
    };
    await tx.objectStore('tombstones').put(tb);
    await tx.objectStore('outbox').put({
      operationId: generateUuid(),
      entityType: 'tombstone',
      entityId: tb.tombstoneId,
      action: 'upsert',
      payload: tb,
      createdAt: nowIso,
      epoch,
      status: 'pending',
    });
  }
  await tx.done;
  broadcastDataChange('slide_variant_reverted');
}

export async function saveAiRequestRecord(req: AiRequest): Promise<void> {
  const db = await getDb();
  await db.put('ai_requests', req);
}

export async function applyValidatedAiImport(
  requestId: string,
  result: Extract<AiImportValidationResult, { ok: true }>
): Promise<void> {
  const db = await getDb();
  const epoch = await getDatasetEpoch();
  const nowIso = new Date().toISOString();

  const tx = db.transaction(
    ['ai_requests', 'question_sets', 'evaluations', 'answers', 'slide_variants', 'outbox'],
    'readwrite'
  );

  const req = await tx.objectStore('ai_requests').get(requestId);
  if (req) {
    await tx.objectStore('ai_requests').put({ ...req, status: 'applied' });
  }

  if (result.task === 'generate_question_set') {
    await tx.objectStore('question_sets').put(result.questionSet);
    await tx.objectStore('outbox').put({
      operationId: generateUuid(),
      entityType: 'question_set',
      entityId: result.questionSet.setId,
      action: 'upsert',
      payload: result.questionSet,
      createdAt: nowIso,
      epoch,
      status: 'pending',
    });
  } else if (result.task === 'evaluate_short_answers') {
    for (const ev of result.evaluations) {
      await tx.objectStore('evaluations').put(ev);
      const ans = await tx.objectStore('answers').get(ev.answerId);
      if (ans) {
        const updatedAns: AnswerRecord = {
          ...ans,
          status: 'graded',
          correct: ev.correct,
        };
        await tx.objectStore('answers').put(updatedAns);
        await tx.objectStore('outbox').put({
          operationId: generateUuid(),
          entityType: 'answer_record',
          entityId: updatedAns.answerId,
          action: 'upsert',
          payload: updatedAns,
          createdAt: nowIso,
          epoch,
          status: 'pending',
        });
      }
      await tx.objectStore('outbox').put({
        operationId: generateUuid(),
        entityType: 'evaluation',
        entityId: ev.evaluationId,
        action: 'upsert',
        payload: ev,
        createdAt: nowIso,
        epoch,
        status: 'pending',
      });
    }
  } else if (result.task === 'rewrite_slide') {
    await tx.objectStore('slide_variants').put(result.slideVariant);
    await tx.objectStore('outbox').put({
      operationId: generateUuid(),
      entityType: 'slide_variant',
      entityId: result.slideVariant.variantId,
      action: 'upsert',
      payload: result.slideVariant,
      createdAt: nowIso,
      epoch,
      status: 'pending',
    });
  }

  await tx.done;
  broadcastDataChange('ai_import_applied');
}

export async function createDeletionTombstone(input: {
  targetType: DeletionTombstone['targetType'];
  targetId: string;
  mode: DeletionTombstone['mode'];
  reason?: string;
  deviceId: string;
}): Promise<void> {
  const db = await getDb();
  const epoch = await getDatasetEpoch();
  const existing = await db.getAllFromIndex('tombstones', 'by-target', input.targetId);
  const maxRev = existing.reduce((m, t) => Math.max(m, t.revision), 0);
  const tb: DeletionTombstone = {
    format: 'mooncode.tombstone',
    schemaVersion: 1,
    tombstoneId: generateUuid(),
    targetType: input.targetType,
    targetId: input.targetId,
    mode: input.mode,
    revision: maxRev + 1,
    reason: input.reason,
    deletedAt: new Date().toISOString(),
    deviceId: input.deviceId,
  };
  await putWithOutbox('tombstones', tb, {
    operationId: generateUuid(),
    entityType: 'tombstone',
    entityId: tb.tombstoneId,
    action: 'upsert',
    payload: tb,
    createdAt: tb.deletedAt,
    epoch,
    status: 'pending',
  });
  broadcastDataChange('tombstone_created');
}

export async function reportAndMaybeInvalidate(input: {
  targetType: IssueReport['targetType'];
  targetId: string;
  reason: string;
  invalidateTarget: boolean;
}): Promise<void> {
  const db = await getDb();
  const epoch = await getDatasetEpoch();
  const nowIso = new Date().toISOString();
  const report: IssueReport = {
    format: 'mooncode.issue_report',
    schemaVersion: 1,
    reportId: generateUuid(),
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    createdAt: nowIso,
    actionTaken:
      input.invalidateTarget && input.targetType === 'question'
        ? 'invalidated_question'
        : input.invalidateTarget && input.targetType === 'slide_variant'
        ? 'reverted_variant'
        : 'recorded',
  };

  const tx = db.transaction(['issue_reports', 'answers', 'evaluations', 'outbox'], 'readwrite');
  await tx.objectStore('issue_reports').put(report);
  await tx.objectStore('outbox').put({
    operationId: generateUuid(),
    entityType: 'issue_report',
    entityId: report.reportId,
    action: 'upsert',
    payload: report,
    createdAt: nowIso,
    epoch,
    status: 'pending',
  });

  if (input.invalidateTarget && input.targetType === 'question') {
    const allAns = await tx.objectStore('answers').index('by-question').getAll(input.targetId);
    for (const a of allAns) {
      const updated = { ...a, invalidated: true, invalidReason: input.reason };
      await tx.objectStore('answers').put(updated);
      await tx.objectStore('outbox').put({
        operationId: generateUuid(),
        entityType: 'answer_record',
        entityId: updated.answerId,
        action: 'upsert',
        payload: updated,
        createdAt: nowIso,
        epoch,
        status: 'pending',
      });
    }
  }
  await tx.done;
  broadcastDataChange('issue_reported');
}

export async function resolveQuarantinedItem(
  quarantineId: string,
  action: 'reimport' | 'discard'
): Promise<void> {
  const db = await getDb();
  const q = await db.get('quarantine', quarantineId);
  if (!q) return;
  const currentEpoch = await getDatasetEpoch();

  const tx = db.transaction(['quarantine', 'outbox'], 'readwrite');
  await tx.objectStore('quarantine').delete(quarantineId);
  if (action === 'reimport') {
    await tx.objectStore('outbox').put({
      ...q.operation,
      operationId: generateUuid(),
      epoch: currentEpoch,
      status: 'pending',
    });
  } else {
    await tx.objectStore('outbox').delete(q.operation.operationId);
  }
  await tx.done;
  broadcastDataChange('quarantine_resolved');
}

export async function exportStudyBundle(settings?: AppSettings): Promise<StudyBundle> {
  const snap = await loadLocalSnapshot();
  const effectiveSettings = settings ?? loadAppSettings();
  const payload = {
    format: 'mooncode.study_bundle' as const,
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    datasetId: snap.datasetId,
    syncEpoch: snap.syncEpoch,
    generation: snap.generation,
    settings: effectiveSettings,
    questionSets: snap.questionSets,
    testRuns: snap.testRuns,
    answers: snap.answers,
    evaluations: snap.evaluations,
    slideVariants: snap.slideVariants,
    tombstones: snap.tombstones,
    issueReports: snap.issueReports,
  };
  const integritySha256 = await computeBundleIntegrityHash(
    payload as unknown as Record<string, unknown>
  );
  return { ...payload, integritySha256 };
}

export async function importStudyBundle(
  rawJson: string,
  mode: 'merge' | 'overwrite',
  options: { onProgress?: (percent: number, message: string) => void; signal?: AbortSignal } = {}
): Promise<{ ok: true; summary: string } | { ok: false; errors: string[]; needsUpgrade?: boolean }> {
  const check = await validateStudyBundleOffThread(rawJson, {
    currentSchemaVersion: 1,
    onProgress: options.onProgress,
    signal: options.signal,
  });
  if (!check.ok) {
    return check;
  }

  const bundle = check.bundle;
  const db = await getDb();
  const currentEpoch = await getDatasetEpoch();

  // Save a pre-import local recovery snapshot before overwrite!
  if (mode === 'overwrite') {
    const backupBefore = await exportStudyBundle();
    await setMetaValue('pre_overwrite_backup', backupBefore);
  }

  const tx = db.transaction(
    ['question_sets', 'test_runs', 'answers', 'evaluations', 'slide_variants', 'tombstones', 'issue_reports', 'outbox'],
    'readwrite'
  );

  if (mode === 'overwrite') {
    await Promise.all([
      tx.objectStore('question_sets').clear(),
      tx.objectStore('test_runs').clear(),
      tx.objectStore('answers').clear(),
      tx.objectStore('evaluations').clear(),
      tx.objectStore('slide_variants').clear(),
      tx.objectStore('tombstones').clear(),
      tx.objectStore('issue_reports').clear(),
    ]);
  }

  const nowIso = new Date().toISOString();
  let addedOrUpdated = 0;

  for (const s of bundle.questionSets) {
    const existing = await tx.objectStore('question_sets').get(s.setId);
    if (!existing || mode === 'overwrite') {
      await tx.objectStore('question_sets').put(s);
      await tx.objectStore('outbox').put({
        operationId: generateUuid(),
        entityType: 'question_set',
        entityId: s.setId,
        action: 'upsert',
        payload: s,
        createdAt: nowIso,
        epoch: currentEpoch,
        status: 'pending',
      });
      addedOrUpdated += 1;
    }
  }
  for (const r of bundle.testRuns) {
    const existing = await tx.objectStore('test_runs').get(r.testRunId);
    if (!existing || (existing.status === 'in_progress' && r.status === 'completed') || mode === 'overwrite') {
      await tx.objectStore('test_runs').put(r);
      addedOrUpdated += 1;
    }
  }
  for (const a of bundle.answers) {
    const existing = await tx.objectStore('answers').get(a.answerId);
    if (!existing || mode === 'overwrite') {
      await tx.objectStore('answers').put(a);
      await tx.objectStore('outbox').put({
        operationId: generateUuid(),
        entityType: 'answer_record',
        entityId: a.answerId,
        action: 'upsert',
        payload: a,
        createdAt: nowIso,
        epoch: currentEpoch,
        status: 'pending',
      });
      addedOrUpdated += 1;
    }
  }
  for (const e of bundle.evaluations) {
    const existing = await tx.objectStore('evaluations').get(e.evaluationId);
    if (!existing || e.revision > existing.revision || mode === 'overwrite') {
      await tx.objectStore('evaluations').put(e);
      addedOrUpdated += 1;
    }
  }
  for (const v of bundle.slideVariants) {
    const existing = await tx.objectStore('slide_variants').get(v.variantId);
    if (!existing || v.updatedRevision > existing.updatedRevision || mode === 'overwrite') {
      await tx.objectStore('slide_variants').put(v);
      addedOrUpdated += 1;
    }
  }
  for (const t of bundle.tombstones) {
    const existing = await tx.objectStore('tombstones').get(t.tombstoneId);
    if (!existing || t.revision > existing.revision || mode === 'overwrite') {
      await tx.objectStore('tombstones').put(t);
      addedOrUpdated += 1;
    }
  }
  for (const rep of bundle.issueReports) {
    await tx.objectStore('issue_reports').put(rep);
  }

  await tx.done;
  if (mode === 'overwrite') {
    saveAppSettings(bundle.settings);
  }
  broadcastDataChange('bundle_imported');
  return {
    ok: true,
    summary:
      mode === 'overwrite'
        ? `已完整還原備份資料（${bundle.questionSets.length} 組題組、${bundle.answers.length} 筆作答）。還原前本機資料已保留為上一恢復快照。`
        : `已完成合併匯入，新增或更新 ${addedOrUpdated} 筆學習紀錄（題組與作答皆已自動去重）。`,
  };
}

export async function restorePreOverwriteLocalBackup(): Promise<boolean> {
  const prev = await getMetaValue<StudyBundle | null>('pre_overwrite_backup', null);
  if (!prev) return false;
  const res = await importStudyBundle(JSON.stringify(prev), 'overwrite');
  return res.ok;
}

export async function persistManualLocalSave(settings: AppSettings): Promise<{
  savedAt: string;
  snapshot: LocalStoreSnapshot;
}> {
  const savedAt = new Date().toISOString();
  saveAppSettings(settings);
  await initializeLocalStore();
  await setMetaValue('lastManualSavedAt', savedAt);
  const verifiedTimestamp = await getMetaValue<string | null>('lastManualSavedAt', null);
  if (verifiedTimestamp !== savedAt) {
    throw new Error('本機 IndexedDB 回讀確認失敗，請確認瀏覽器儲存空間是否已滿或停用。');
  }
  const snapshot = await loadLocalSnapshot();
  broadcastDataChange('manual_local_save');
  return { savedAt, snapshot };
}

export async function runCloudSave(
  deviceId: string,
  adapter: RemoteGitAdapter = httpRemoteAdapter
): Promise<SyncRunOutcome> {
  const coordinator = new SyncCoordinator(adapter, localSyncBackend, deviceId);
  const outcome = await coordinator.enqueueSave();
  broadcastDataChange('sync_completed');
  return outcome;
}
