import { generateUuid, sha256Utf8 } from '../domain/hash.ts';
import type {
  ActivePointer,
  AnswerRecord,
  DeletionTombstone,
  Evaluation,
  PendingOperation,
  QuarantinedOperation,
  QuestionSet,
  SlideVariant,
  SnapshotManifest,
  TestRun,
} from '../domain/types.ts';
import {
  STUDY_DATA_PREFIX,
  type MaterializedDataset,
  type StagedBlob,
  assertSafeStudyDataPath,
  buildCandidateSnapshot,
  parseActivePointerSafe,
  verifyAndLoadSnapshot,
} from './sharding.ts';

export interface RemoteHeadInfo {
  commitSha: string;
  headRawUtf8: string | null;
}

export interface PublishCommitInput {
  expectedParentCommitSha: string | null;
  message: string;
  blobsToUpsert: StagedBlob[];
  pathsToDelete?: string[];
}

export type PublishCommitResult =
  | { ok: true; newCommitSha: string }
  | { ok: false; status: number; isConflict: boolean; retryAfterMs?: number; error: string };

export interface RemoteGitAdapter {
  readonly isConfigured: boolean;
  getHead(): Promise<RemoteHeadInfo>;
  readBlobUtf8(path: string, atCommitSha: string): Promise<string | null>;
  listStudyDataPaths(atCommitSha: string): Promise<Array<{ path: string; sizeBytes: number }>>;
  publishAtomicCommit(input: PublishCommitInput): Promise<PublishCommitResult>;
}

/**
 * Deterministic in-memory Git simulator for integration testing of A/B/C versions,
 * interrupted uploads, 409/422 non-fast-forward conflicts, recovery epoch quarantine, and GC.
 */
export class InMemoryRemoteGitAdapter implements RemoteGitAdapter {
  public readonly isConfigured = true;
  private commits = new Map<string, Map<string, string>>(); // commitSha -> (path -> utf8)
  private parents = new Map<string, string | null>();
  private currentHeadSha: string | null = null;
  private commitCounter = 0;

  public faultInjection: {
    failNextPublishStatus?: number;
    failNextPublishConflict?: boolean;
    dropResponseAfterCommit?: boolean;
    corruptNextReadPath?: string;
    deleteNextReadPath?: string;
  } = {};

  async getHead(): Promise<RemoteHeadInfo> {
    if (!this.currentHeadSha) {
      return { commitSha: '', headRawUtf8: null };
    }
    const tree = this.commits.get(this.currentHeadSha);
    return {
      commitSha: this.currentHeadSha,
      headRawUtf8: tree?.get(`${STUDY_DATA_PREFIX}/HEAD.json`) ?? null,
    };
  }

  async readBlobUtf8(path: string, atCommitSha: string): Promise<string | null> {
    assertSafeStudyDataPath(path);
    if (this.faultInjection.deleteNextReadPath === path) {
      return null;
    }
    if (this.faultInjection.corruptNextReadPath === path) {
      return '{"corrupt": true';
    }
    const tree = this.commits.get(atCommitSha);
    return tree?.get(path) ?? null;
  }

  async listStudyDataPaths(atCommitSha: string): Promise<Array<{ path: string; sizeBytes: number }>> {
    const tree = this.commits.get(atCommitSha);
    if (!tree) return [];
    const out: Array<{ path: string; sizeBytes: number }> = [];
    for (const [p, content] of tree.entries()) {
      if (p.startsWith(`${STUDY_DATA_PREFIX}/`)) {
        out.push({ path: p, sizeBytes: new TextEncoder().encode(content).byteLength });
      }
    }
    return out;
  }

  async publishAtomicCommit(input: PublishCommitInput): Promise<PublishCommitResult> {
    if (this.faultInjection.failNextPublishStatus) {
      const status = this.faultInjection.failNextPublishStatus;
      const isConflict = Boolean(this.faultInjection.failNextPublishConflict);
      this.faultInjection.failNextPublishStatus = undefined;
      this.faultInjection.failNextPublishConflict = undefined;
      return {
        ok: false,
        status,
        isConflict,
        error: `Simulated HTTP ${status}`,
      };
    }

    const expected = input.expectedParentCommitSha || null;
    if (expected !== this.currentHeadSha) {
      return {
        ok: false,
        status: 422,
        isConflict: true,
        error: `Non-fast-forward: expected parent ${expected}, actual HEAD ${this.currentHeadSha}`,
      };
    }

    const prevTree = this.currentHeadSha ? this.commits.get(this.currentHeadSha) : undefined;
    const nextTree = new Map<string, string>(prevTree ?? []);

    for (const delPath of input.pathsToDelete ?? []) {
      assertSafeStudyDataPath(delPath);
      nextTree.delete(delPath);
    }
    for (const blob of input.blobsToUpsert) {
      assertSafeStudyDataPath(blob.path);
      nextTree.set(blob.path, blob.contentUtf8);
    }

    this.commitCounter += 1;
    const newSha = `sim-commit-${String(this.commitCounter).padStart(4, '0')}`;
    this.commits.set(newSha, nextTree);
    this.parents.set(newSha, this.currentHeadSha);
    this.currentHeadSha = newSha;

    if (this.faultInjection.dropResponseAfterCommit) {
      this.faultInjection.dropResponseAfterCommit = false;
      return {
        ok: false,
        status: 504,
        isConflict: false,
        error: 'Simulated network timeout after remote commit succeeded',
      };
    }

    return { ok: true, newCommitSha: newSha };
  }

  // Test helpers
  public getCommitCount(): number {
    return this.commitCounter;
  }

  public getRawTree(commitSha?: string): Map<string, string> | undefined {
    return this.commits.get(commitSha ?? this.currentHeadSha ?? '');
  }

  public tamperFileInLatestCommit(path: string, newContent: string | null): void {
    if (!this.currentHeadSha) return;
    const tree = this.commits.get(this.currentHeadSha);
    if (!tree) return;
    if (newContent === null) tree.delete(path);
    else tree.set(path, newContent);
  }
}

export class HttpRemoteGitAdapter implements RemoteGitAdapter {
  public isConfigured = false;

  async checkStatus(): Promise<{ configured: boolean; authenticated: boolean; message: string }> {
    const res = await fetch('/api/sync/status', { credentials: 'include' });
    if (!res.ok) {
      this.isConfigured = false;
      return { configured: false, authenticated: false, message: '後端狀態檢查失敗，維持本機模式' };
    }
    const data = (await res.json()) as { configured: boolean; authenticated: boolean; message: string };
    this.isConfigured = Boolean(data.configured && data.authenticated);
    return data;
  }

  async getHead(): Promise<RemoteHeadInfo> {
    const res = await fetch('/api/sync/head', { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`讀取遠端 HEAD 失敗 (${res.status})`);
    }
    return (await res.json()) as RemoteHeadInfo;
  }

  async readBlobUtf8(path: string, atCommitSha: string): Promise<string | null> {
    assertSafeStudyDataPath(path);
    const url = `/api/sync/object?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(atCommitSha)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`讀取物件失敗 (${res.status}): ${path}`);
    return res.text();
  }

  async listStudyDataPaths(atCommitSha: string): Promise<Array<{ path: string; sizeBytes: number }>> {
    const url = `/api/sync/tree?ref=${encodeURIComponent(atCommitSha)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`列出目錄失敗 (${res.status})`);
    const data = (await res.json()) as { files: Array<{ path: string; sizeBytes: number }> };
    return data.files;
  }

  async publishAtomicCommit(input: PublishCommitInput): Promise<PublishCommitResult> {
    const res = await fetch('/api/sync/publish', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-MoonCode-CSRF': '1',
      },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const okData = (await res.json()) as { newCommitSha: string };
      return { ok: true, newCommitSha: okData.newCommitSha };
    }
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: string;
      isConflict?: boolean;
      retryAfterMs?: number;
    };
    return {
      ok: false,
      status: res.status,
      isConflict: Boolean(errBody.isConflict || res.status === 409),
      retryAfterMs: errBody.retryAfterMs,
      error: errBody.error ?? `HTTP ${res.status}`,
    };
  }
}

export function mergeMaterializedDatasets(
  remote: MaterializedDataset,
  local: MaterializedDataset,
  pendingOps: PendingOperation[]
): MaterializedDataset {
  const opSets = new Map<string, QuestionSet>(remote.questionSets.map((s) => [s.setId, s]));
  const opRuns = new Map<string, TestRun>(remote.testRuns.map((r) => [r.testRunId, r]));
  const opAnswers = new Map<string, AnswerRecord>(remote.answers.map((a) => [a.answerId, a]));
  const opEvals = new Map<string, Evaluation>(remote.evaluations.map((e) => [e.evaluationId, e]));
  const opSlides = new Map<string, SlideVariant>(remote.slideVariants.map((v) => [v.variantId, v]));
  const opTombstones = new Map<string, DeletionTombstone>(
    remote.tombstones.map((t) => [t.tombstoneId, t])
  );

  // Also ensure any local records not yet in remote or queued in pendingOps are union-merged by stable ID
  for (const s of local.questionSets) {
    if (!opSets.has(s.setId)) opSets.set(s.setId, s);
  }
  for (const r of local.testRuns) {
    const prev = opRuns.get(r.testRunId);
    if (!prev || (prev.status === 'in_progress' && r.status === 'completed') || r.answerIds.length > prev.answerIds.length) {
      opRuns.set(r.testRunId, r);
    }
  }
  for (const a of local.answers) {
    if (!opAnswers.has(a.answerId)) {
      opAnswers.set(a.answerId, a);
    }
  }
  for (const e of local.evaluations) {
    const prev = opEvals.get(e.evaluationId);
    if (!prev || e.revision > prev.revision || (e.invalidated && !prev.invalidated)) {
      opEvals.set(e.evaluationId, e);
    }
  }
  for (const v of local.slideVariants) {
    const prev = opSlides.get(v.variantId);
    if (!prev || v.updatedRevision > prev.updatedRevision) {
      opSlides.set(v.variantId, v);
    }
  }
  for (const t of local.tombstones) {
    const prev = opTombstones.get(t.tombstoneId);
    if (!prev || t.revision > prev.revision) {
      opTombstones.set(t.tombstoneId, t);
    }
  }

  for (const op of pendingOps) {
    if (op.status === 'quarantined') continue;
    if (op.entityType === 'question_set') {
      const qs = op.payload as QuestionSet;
      opSets.set(qs.setId, qs);
    } else if (op.entityType === 'test_run') {
      const run = op.payload as TestRun;
      opRuns.set(run.testRunId, run);
    } else if (op.entityType === 'answer_record') {
      const ans = op.payload as AnswerRecord;
      if (!opAnswers.has(ans.answerId)) opAnswers.set(ans.answerId, ans);
    } else if (op.entityType === 'evaluation') {
      const ev = op.payload as Evaluation;
      opEvals.set(ev.evaluationId, ev);
    } else if (op.entityType === 'slide_variant') {
      const sv = op.payload as SlideVariant;
      opSlides.set(sv.variantId, sv);
    } else if (op.entityType === 'tombstone') {
      const tb = op.payload as DeletionTombstone;
      opTombstones.set(tb.tombstoneId, tb);
    }
  }

  // Apply tombstone deletions deterministically by revision / targetId
  const deletedSetIds = new Set(
    Array.from(opTombstones.values())
      .filter((t) => t.mode === 'delete_set')
      .map((t) => t.targetId)
  );
  const revertedVariantIds = new Set(
    Array.from(opTombstones.values())
      .filter((t) => t.mode === 'revert_variant')
      .map((t) => t.targetId)
  );

  return {
    questionSets: Array.from(opSets.values()).filter((s) => !deletedSetIds.has(s.setId)),
    testRuns: Array.from(opRuns.values()),
    answers: Array.from(opAnswers.values()),
    evaluations: Array.from(opEvals.values()),
    slideVariants: Array.from(opSlides.values()).filter((v) => !revertedVariantIds.has(v.variantId)),
    tombstones: Array.from(opTombstones.values()),
  };
}

export interface LocalSyncBackend {
  getDatasetId(): Promise<string>;
  getSyncEpoch(): Promise<number>;
  setSyncEpoch(epoch: number): Promise<void>;
  getLocalDataset(): Promise<MaterializedDataset>;
  replaceLocalWithDataset(dataset: MaterializedDataset): Promise<void>;
  getPendingOutbox(): Promise<PendingOperation[]>;
  markOutboxSynced(operationIds: string[]): Promise<void>;
  quarantineOperations(ops: QuarantinedOperation[]): Promise<void>;
  getSavedPointer(): Promise<ActivePointer | null>;
  savePointer(pointer: ActivePointer, isLastKnownGood: boolean): Promise<void>;
}

export interface SyncRunOutcome {
  ok: boolean;
  status: 'synced' | 'conflict_quarantine' | 'corrupt_remote' | 'failed';
  message: string;
  pointer?: ActivePointer;
  quarantinedCount?: number;
}

export class SyncCoordinator {
  private activeSavePromise: Promise<SyncRunOutcome> | null = null;
  private rerunRequested = false;

  constructor(
    private readonly remote: RemoteGitAdapter,
    private readonly local: LocalSyncBackend,
    private readonly deviceId: string,
    private readonly maxRetries: number = 3
  ) {}

  /**
   * Single local save queue + Web Locks + coalesced concurrent save clicks.
   */
  async enqueueSave(): Promise<SyncRunOutcome> {
    if (this.activeSavePromise) {
      this.rerunRequested = true;
      return this.activeSavePromise;
    }

    const executeWithLock = async (): Promise<SyncRunOutcome> => {
      let lastOutcome: SyncRunOutcome = { ok: true, status: 'synced', message: '完成' };
      do {
        this.rerunRequested = false;
        lastOutcome = await this.performSaveWithRetries();
      } while (this.rerunRequested);
      return lastOutcome;
    };

    const run = async (): Promise<SyncRunOutcome> => {
      if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
        return navigator.locks.request('mooncode-sync-save-lock', executeWithLock);
      }
      return executeWithLock();
    };

    this.activeSavePromise = run().finally(() => {
      this.activeSavePromise = null;
    });
    return this.activeSavePromise;
  }

  private async performSaveWithRetries(): Promise<SyncRunOutcome> {
    if (!this.remote.isConfigured) {
      return { ok: false, status: 'failed', message: '尚未連線 GitHub 同步，資料已安全保留於本機。' };
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const outcome = await this.singleSaveAttempt();
        if (outcome.shouldRetry && attempt < this.maxRetries) {
          const delayMs = outcome.retryAfterMs ?? Math.min(2000, 150 * Math.pow(2, attempt));
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        return outcome.result;
      } catch (err) {
        if (attempt >= this.maxRetries) {
          return {
            ok: false,
            status: 'failed',
            message: `同步失敗（已保留本機待同步佇列）：${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
    }
    return { ok: false, status: 'failed', message: '同步重試次數已達上限，待同步操作已安全保留於本機。' };
  }

  private async singleSaveAttempt(): Promise<{
    result: SyncRunOutcome;
    shouldRetry: boolean;
    retryAfterMs?: number;
  }> {
    const head = await this.remote.getHead();
    const datasetId = await this.local.getDatasetId();
    const localEpoch = await this.local.getSyncEpoch();
    const pendingOps = await this.local.getPendingOutbox();
    const localData = await this.local.getLocalDataset();

    let remotePointer: ActivePointer | null = null;
    let remoteActiveManifest: SnapshotManifest | null = null;
    let remoteDataset: MaterializedDataset = {
      questionSets: [],
      testRuns: [],
      answers: [],
      evaluations: [],
      slideVariants: [],
      tombstones: [],
    };
    const existingBlobsByPath = new Map<string, string>();

    if (head.headRawUtf8 !== null) {
      const parsedPtr = parseActivePointerSafe(head.headRawUtf8);
      if (!parsedPtr.ok) {
        return {
          shouldRetry: false,
          result: {
            ok: false,
            status: 'corrupt_remote',
            message: `遠端 HEAD.json 損毀，已阻止覆蓋：${parsedPtr.reason}`,
          },
        };
      }
      remotePointer = parsedPtr.pointer;
      if (remotePointer.datasetId !== datasetId) {
        return {
          shouldRetry: false,
          result: {
            ok: false,
            status: 'failed',
            message: `遠端 datasetId (${remotePointer.datasetId}) 與本機 (${datasetId}) 不符，已中止同步。`,
          },
        };
      }

      // Epoch check: if remote has bumped syncEpoch (e.g. another device triggered Recovery), quarantine stale local ops!
      if (remotePointer.syncEpoch > localEpoch) {
        const staleOps = pendingOps.filter((op) => op.epoch < remotePointer!.syncEpoch);
        const remoteLoaded = remotePointer.active
          ? await verifyAndLoadSnapshot(
              remotePointer.active.manifestPath,
              remotePointer.active.manifestSha256,
              (p) => this.remote.readBlobUtf8(p, head.commitSha)
            )
          : null;

        if (staleOps.length > 0) {
          const nowIso = new Date().toISOString();
          await this.local.quarantineOperations(
            staleOps.map((op) => ({
              quarantineId: generateUuid(),
              operation: { ...op, status: 'quarantined' },
              quarantinedAt: nowIso,
              localEpoch,
              remoteEpoch: remotePointer!.syncEpoch,
              reason: `遠端資料已復原並提升 syncEpoch (${localEpoch} -> ${remotePointer!.syncEpoch})，為避免把已撤回資料補回，已暫時隔離此筆未同步作業。`,
            }))
          );
        }
        if (remoteLoaded && remoteLoaded.ok) {
          await this.local.replaceLocalWithDataset(remoteLoaded.dataset);
        }
        await this.local.setSyncEpoch(remotePointer.syncEpoch);
        await this.local.savePointer(remotePointer, true);

        return {
          shouldRetry: false,
          result: {
            ok: false,
            status: 'conflict_quarantine',
            quarantinedCount: staleOps.length,
            pointer: remotePointer,
            message: `偵測到雲端資料已執行版本復原（epoch ${remotePointer.syncEpoch}）。已將 ${staleOps.length} 筆舊裝置待同步作業移至隔離區，請於「儲存與版本」決定重新匯入或丟棄。`,
          },
        };
      }

      if (remotePointer.active) {
        const loaded = await verifyAndLoadSnapshot(
          remotePointer.active.manifestPath,
          remotePointer.active.manifestSha256,
          (p) => this.remote.readBlobUtf8(p, head.commitSha)
        );
        if (!loaded.ok) {
          return {
            shouldRetry: false,
            result: {
              ok: false,
              status: 'corrupt_remote',
              message: `遠端目前版本無法通過完整性驗證（${loaded.reason}），請先執行版本檢查或恢復上一版。`,
            },
          };
        }
        remoteActiveManifest = loaded.manifest;
        remoteDataset = loaded.dataset;
        // Record known shard/object hashes for deduplicating unchanged blobs
        for (const idx of loaded.manifest.indexes) {
          existingBlobsByPath.set(idx.path, idx.sha256);
        }
      }
    }

    // Idempotency check (Spec 12.11): If all pendingOps were already applied in remoteActiveManifest (e.g. response lost after commit), don't re-publish!
    const alreadyApplied = new Set(remoteActiveManifest?.appliedOperationIds ?? []);
    const unappliedOps = pendingOps.filter((op) => !alreadyApplied.has(op.operationId));

    if (remotePointer && unappliedOps.length === 0 && head.headRawUtf8 !== null) {
      await this.local.replaceLocalWithDataset(
        mergeMaterializedDatasets(remoteDataset, localData, [])
      );
      await this.local.markOutboxSynced(pendingOps.map((o) => o.operationId));
      await this.local.savePointer(remotePointer, true);
      return {
        shouldRetry: false,
        result: {
          ok: true,
          status: 'synced',
          pointer: remotePointer,
          message: '遠端已確認包含最新資料，已完成同步確認。',
        },
      };
    }

    const merged = mergeMaterializedDatasets(remoteDataset, localData, unappliedOps);
    const nextGeneration = (remotePointer?.generation ?? 0) + 1;
    const effectiveEpoch = remotePointer?.syncEpoch ?? localEpoch;
    const revisionId = `rev-${String(nextGeneration).padStart(5, '0')}-${generateUuid().slice(0, 8)}`;

    const candidate = await buildCandidateSnapshot({
      datasetId,
      revisionId,
      generation: nextGeneration,
      syncEpoch: effectiveEpoch,
      deviceId: this.deviceId,
      parentRevisionId: remotePointer?.active?.revisionId ?? null,
      appliedOperationIds: [
        ...alreadyApplied,
        ...unappliedOps.map((o) => o.operationId),
      ],
      data: merged,
      existingBlobsByPath,
    });

    const nextPointer: ActivePointer = {
      format: 'mooncode.head',
      schemaVersion: 1,
      datasetId,
      syncEpoch: effectiveEpoch,
      generation: nextGeneration,
      active: {
        revisionId,
        manifestPath: candidate.manifestPath,
        manifestSha256: candidate.manifestBlob.sha256,
        generation: nextGeneration,
        syncEpoch: effectiveEpoch,
        committedAt: candidate.manifest.createdAt,
      },
      previous: remotePointer?.active ?? null,
      recoveryLog: remotePointer?.recoveryLog ?? [],
    };

    const headUtf8 = JSON.stringify(nextPointer, null, 2);
    const blobsToUpsert: StagedBlob[] = [
      ...candidate.newBlobs,
      candidate.manifestBlob,
      {
        path: `${STUDY_DATA_PREFIX}/HEAD.json`,
        contentUtf8: headUtf8,
        sha256: await sha256Utf8(headUtf8),
      },
    ];

    const pubRes = await this.remote.publishAtomicCommit({
      expectedParentCommitSha: head.commitSha || null,
      message: `MoonCode snapshot ${revisionId} (gen ${nextGeneration}, epoch ${effectiveEpoch})`,
      blobsToUpsert,
    });

    if (!pubRes.ok) {
      if (pubRes.isConflict) {
        return {
          shouldRetry: true,
          retryAfterMs: pubRes.retryAfterMs,
          result: { ok: false, status: 'failed', message: pubRes.error },
        };
      }
      // If network timeout occurred (e.g. 504), check if remote actually committed our operationId!
      if (pubRes.status >= 500) {
        try {
          const checkHead = await this.remote.getHead();
          const checkPtr = parseActivePointerSafe(checkHead.headRawUtf8);
          if (checkPtr.ok && checkPtr.pointer.active?.revisionId === revisionId) {
            await this.local.replaceLocalWithDataset(merged);
            await this.local.markOutboxSynced(pendingOps.map((o) => o.operationId));
            await this.local.savePointer({ ...checkPtr.pointer, active: { ...checkPtr.pointer.active, commitSha: checkHead.commitSha } }, true);
            return {
              shouldRetry: false,
              result: {
                ok: true,
                status: 'synced',
                pointer: checkPtr.pointer,
                message: '已透過 commit 核對確認遠端發布成功。',
              },
            };
          }
        } catch {
          // Ignore follow-up check failure; keep local outbox intact
        }
      }
      return {
        shouldRetry: pubRes.status === 429,
        retryAfterMs: pubRes.retryAfterMs,
        result: {
          ok: false,
          status: 'failed',
          message: `遠端寫入失敗（已保留本機版本與待同步佇列）：${pubRes.error}`,
        },
      };
    }

    // Spec 12.10: Read back HEAD & manifest at the published commitSha to confirm integrity before clearing outbox
    const verifyHeadRaw = await this.remote.readBlobUtf8(
      `${STUDY_DATA_PREFIX}/HEAD.json`,
      pubRes.newCommitSha
    );
    const verifyPtr = parseActivePointerSafe(verifyHeadRaw);
    if (!verifyPtr.ok || verifyPtr.pointer.active?.revisionId !== revisionId) {
      return {
        shouldRetry: false,
        result: {
          ok: false,
          status: 'failed',
          message: '發布後回讀驗證 HEAD 不符，未清除本機待同步佇列以策安全。',
        },
      };
    }

    const savedPtr: ActivePointer = {
      ...verifyPtr.pointer,
      active: verifyPtr.pointer.active
        ? { ...verifyPtr.pointer.active, commitSha: pubRes.newCommitSha }
        : null,
    };
    await this.local.replaceLocalWithDataset(merged);
    await this.local.markOutboxSynced(pendingOps.map((o) => o.operationId));
    await this.local.savePointer(savedPtr, true);

    return {
      shouldRetry: false,
      result: {
        ok: true,
        status: 'synced',
        pointer: savedPtr,
        message: `已安全同步至第 ${nextGeneration} 版（${revisionId}）。`,
      },
    };
  }

  /**
   * Spec 13: Forward-only recovery to `previous` available snapshot.
   * Never does Git reset / force push. Verifies target integrity first and bumps syncEpoch.
   */
  async recoverToPrevious(expectedCurrentRevisionId?: string): Promise<SyncRunOutcome> {
    if (!this.remote.isConfigured) {
      return { ok: false, status: 'failed', message: '尚未設定遠端同步，請於本機使用 JSON 備份還原。' };
    }

    const head = await this.remote.getHead();
    const parsedPtr = parseActivePointerSafe(head.headRawUtf8);
    if (!parsedPtr.ok) {
      return { ok: false, status: 'corrupt_remote', message: `HEAD.json 無法讀取：${parsedPtr.reason}` };
    }
    const ptr = parsedPtr.pointer;

    if (
      expectedCurrentRevisionId &&
      ptr.active &&
      ptr.active.revisionId !== expectedCurrentRevisionId
    ) {
      return {
        ok: false,
        status: 'failed',
        message: `遠端已被其他裝置更新至 ${ptr.active.revisionId}，已取消舊畫面回復請求，請先重新整理最新狀態。`,
      };
    }

    if (!ptr.previous) {
      return {
        ok: false,
        status: 'failed',
        message: '目前沒有可供回復的「上一個可用版」，已維持現狀。',
      };
    }

    const prevLoaded = await verifyAndLoadSnapshot(
      ptr.previous.manifestPath,
      ptr.previous.manifestSha256,
      (p) => this.remote.readBlobUtf8(p, head.commitSha)
    );
    if (!prevLoaded.ok) {
      return {
        ok: false,
        status: 'corrupt_remote',
        message: `上一個可用版 (${ptr.previous.revisionId}) 也已損毀或缺檔（${prevLoaded.reason}），無法執行雲端自動回復，請使用本機快照或 StudyBundle 修復。`,
      };
    }

    const nextGeneration = ptr.generation + 1;
    const nextEpoch = ptr.syncEpoch + 1;
    const newRevisionId = `rev-${String(nextGeneration).padStart(5, '0')}-rec`;

    const candidate = await buildCandidateSnapshot({
      datasetId: ptr.datasetId,
      revisionId: newRevisionId,
      generation: nextGeneration,
      syncEpoch: nextEpoch,
      deviceId: this.deviceId,
      parentRevisionId: ptr.active?.revisionId ?? null,
      appliedOperationIds: prevLoaded.manifest.appliedOperationIds,
      data: prevLoaded.dataset,
      existingBlobsByPath: new Map(),
      isRecovery: true,
      recoveredFromRevisionId: ptr.previous.revisionId,
    });

    const recoveredPointer: ActivePointer = {
      format: 'mooncode.head',
      schemaVersion: 1,
      datasetId: ptr.datasetId,
      syncEpoch: nextEpoch,
      generation: nextGeneration,
      active: {
        revisionId: newRevisionId,
        manifestPath: candidate.manifestPath,
        manifestSha256: candidate.manifestBlob.sha256,
        generation: nextGeneration,
        syncEpoch: nextEpoch,
        committedAt: candidate.manifest.createdAt,
      },
      // Failed B/C is retired from the recovery target list!
      previous: null,
      recoveryLog: [
        ...ptr.recoveryLog.slice(-19),
        {
          at: candidate.manifest.createdAt,
          fromRevisionId: ptr.active?.revisionId ?? 'unknown',
          toRevisionId: ptr.previous.revisionId,
          newEpoch: nextEpoch,
          reason: '使用者主動回復至上一個已驗證可用版本',
        },
      ],
    };

    const headUtf8 = JSON.stringify(recoveredPointer, null, 2);
    const pub = await this.remote.publishAtomicCommit({
      expectedParentCommitSha: head.commitSha,
      message: `MoonCode forward recovery to ${ptr.previous.revisionId} -> ${newRevisionId} (epoch ${nextEpoch})`,
      blobsToUpsert: [
        ...candidate.newBlobs,
        candidate.manifestBlob,
        {
          path: `${STUDY_DATA_PREFIX}/HEAD.json`,
          contentUtf8: headUtf8,
          sha256: await sha256Utf8(headUtf8),
        },
      ],
    });

    if (!pub.ok) {
      return { ok: false, status: 'failed', message: `提交復原版本失敗：${pub.error}` };
    }

    await this.local.replaceLocalWithDataset(prevLoaded.dataset);
    await this.local.setSyncEpoch(nextEpoch);
    await this.local.savePointer(recoveredPointer, true);

    return {
      ok: true,
      status: 'synced',
      pointer: recoveredPointer,
      message: `已透過正向復原提交回到 ${ptr.previous.revisionId} 的內容（epoch 提升至 ${nextEpoch}）。`,
    };
  }

  /**
   * Spec 14: Reachability-based Garbage Collection (Dry-run first, never deletes files still needed by active or previous!).
   */
  async planGarbageCollection(): Promise<
    | { ok: true; commitSha: string; unreachablePaths: string[]; totalReclaimableBytes: number; reachableCount: number }
    | { ok: false; reason: string }
  > {
    const head = await this.remote.getHead();
    const ptrRes = parseActivePointerSafe(head.headRawUtf8);
    if (!ptrRes.ok) return { ok: false, reason: ptrRes.reason };

    const ptr = ptrRes.pointer;
    const reachable = new Set<string>([`${STUDY_DATA_PREFIX}/HEAD.json`]);

    if (!ptr.active) {
      return { ok: false, reason: '目前沒有已驗證的 active 版本，禁止執行清理。' };
    }
    const activeLoaded = await verifyAndLoadSnapshot(
      ptr.active.manifestPath,
      ptr.active.manifestSha256,
      (p) => this.remote.readBlobUtf8(p, head.commitSha)
    );
    if (!activeLoaded.ok) {
      return { ok: false, reason: `目前版本驗證失敗，不可清理：${activeLoaded.reason}` };
    }
    for (const p of activeLoaded.referencedPaths) reachable.add(p);

    if (ptr.previous) {
      const prevLoaded = await verifyAndLoadSnapshot(
        ptr.previous.manifestPath,
        ptr.previous.manifestSha256,
        (p) => this.remote.readBlobUtf8(p, head.commitSha)
      );
      if (!prevLoaded.ok) {
        return { ok: false, reason: `上一個可用版驗證失敗，不可清理：${prevLoaded.reason}` };
      }
      for (const p of prevLoaded.referencedPaths) reachable.add(p);
    }

    const allFiles = await this.remote.listStudyDataPaths(head.commitSha);
    const unreachablePaths: string[] = [];
    let totalReclaimableBytes = 0;

    for (const file of allFiles) {
      if (!reachable.has(file.path)) {
        unreachablePaths.push(file.path);
        totalReclaimableBytes += file.sizeBytes;
      }
    }

    return {
      ok: true,
      commitSha: head.commitSha,
      unreachablePaths,
      totalReclaimableBytes,
      reachableCount: reachable.size,
    };
  }

  async executeGarbageCollection(): Promise<{ ok: boolean; deletedCount: number; message: string }> {
    const plan = await this.planGarbageCollection();
    if (!plan.ok) {
      return { ok: false, deletedCount: 0, message: plan.reason };
    }
    if (plan.unreachablePaths.length === 0) {
      return { ok: true, deletedCount: 0, message: '沒有任何未被引用的過期分片或舊索引可清理。' };
    }
    const res = await this.remote.publishAtomicCommit({
      expectedParentCommitSha: plan.commitSha,
      message: `MoonCode reachability GC (${plan.unreachablePaths.length} unreachable files)`,
      blobsToUpsert: [],
      pathsToDelete: plan.unreachablePaths,
    });
    if (!res.ok) {
      return { ok: false, deletedCount: 0, message: `清理提交失敗：${res.error}` };
    }
    return {
      ok: true,
      deletedCount: plan.unreachablePaths.length,
      message: `已清理 ${plan.unreachablePaths.length} 個不再被目前版與上一版引用的舊檔案（注意：Git 歷史紀錄仍會依設計保留）。`,
    };
  }
}
