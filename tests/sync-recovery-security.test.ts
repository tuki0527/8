import { describe, expect, it } from 'vitest';
import { handleApiRequest, type MoonCodeServerEnv } from '../server/shared/githubSyncHandler.ts';
import { SEED_QUESTION_SETS } from '../src/data/seedSets/index.ts';
import { generateUuid } from '../src/domain/hash.ts';
import type {
  ActivePointer,
  DeletionTombstone,
  PendingOperation,
  QuarantinedOperation,
  QuestionSet,
} from '../src/domain/types.ts';
import type { MaterializedDataset } from '../src/sync/sharding.ts';
import {
  InMemoryRemoteGitAdapter,
  type LocalSyncBackend,
  SyncCoordinator,
} from '../src/sync/syncEngine.ts';

class MemoryLocalBackend implements LocalSyncBackend {
  public datasetId = 'mooncode-primary';
  public syncEpoch = 1;
  public dataset: MaterializedDataset = {
    questionSets: [structuredClone(SEED_QUESTION_SETS[0])],
    testRuns: [],
    answers: [],
    evaluations: [],
    slideVariants: [],
    tombstones: [],
  };
  public outbox: PendingOperation[] = [];
  public quarantine: QuarantinedOperation[] = [];
  public pointer: ActivePointer | null = null;

  async getDatasetId() {
    return this.datasetId;
  }
  async getSyncEpoch() {
    return this.syncEpoch;
  }
  async setSyncEpoch(epoch: number) {
    this.syncEpoch = epoch;
  }
  async getLocalDataset() {
    return structuredClone(this.dataset);
  }
  async replaceLocalWithDataset(dataset: MaterializedDataset) {
    this.dataset = structuredClone(dataset);
  }
  async getPendingOutbox() {
    return this.outbox.filter((o) => o.status === 'pending');
  }
  async markOutboxSynced(operationIds: string[]) {
    const ids = new Set(operationIds);
    this.outbox = this.outbox.map((o) => (ids.has(o.operationId) ? { ...o, status: 'synced' } : o));
  }
  async quarantineOperations(ops: QuarantinedOperation[]) {
    const qIds = new Set(ops.map((q) => q.operation.operationId));
    this.outbox = this.outbox.map((o) =>
      qIds.has(o.operationId) ? { ...o, status: 'quarantined' } : o
    );
    this.quarantine.push(...ops);
  }
  async getSavedPointer() {
    return this.pointer;
  }
  async savePointer(pointer: ActivePointer) {
    this.pointer = pointer;
    this.syncEpoch = pointer.syncEpoch;
  }

  enqueueQuestionSet(qs: QuestionSet) {
    this.dataset.questionSets.push(qs);
    this.outbox.push({
      operationId: generateUuid(),
      entityType: 'question_set',
      entityId: qs.setId,
      action: 'upsert',
      payload: qs,
      createdAt: new Date().toISOString(),
      epoch: this.syncEpoch,
      status: 'pending',
    });
  }

  enqueueTombstone(tb: DeletionTombstone) {
    this.dataset.tombstones.push(tb);
    this.outbox.push({
      operationId: generateUuid(),
      entityType: 'tombstone',
      entityId: tb.tombstoneId,
      action: 'upsert',
      payload: tb,
      createdAt: tb.deletedAt,
      epoch: this.syncEpoch,
      status: 'pending',
    });
  }
}

describe('A->B->C Versioning, Faults, Concurrent Merge, Recovery Quarantine, Tombstones & GC', () => {
  it('handles A->B->C transitions, interrupted publish keeping A safe, idempotency on timeout after commit, and GC protecting B+C shared blobs', async () => {
    const remote = new InMemoryRemoteGitAdapter();
    const localA = new MemoryLocalBackend();
    const coord = new SyncCoordinator(remote, localA, 'desktop-1');

    // Publish Version A (generation 1)
    localA.enqueueQuestionSet(structuredClone(SEED_QUESTION_SETS[1]));
    const resA = await coord.enqueueSave();
    expect(resA.ok).toBe(true);
    const headA = await remote.getHead();
    const revA = JSON.parse(headA.headRawUtf8!).active.revisionId;

    // Simulate failed publish before HEAD switch -> A stays completely intact
    localA.enqueueQuestionSet(structuredClone(SEED_QUESTION_SETS[2]));
    remote.faultInjection.failNextPublishStatus = 500;
    const resFail = await coord.enqueueSave();
    expect(resFail.ok).toBe(false);
    const headAfterFail = await remote.getHead();
    expect(JSON.parse(headAfterFail.headRawUtf8!).active.revisionId).toBe(revA);

    // Retry succeeds -> Version B (generation 2, previous = A)
    const resB = await coord.enqueueSave();
    expect(resB.ok).toBe(true);

    // Simulate network drop AFTER commit succeeded -> coordinator verifies HEAD/operationId idempotently!
    localA.enqueueQuestionSet(structuredClone(SEED_QUESTION_SETS[3]));
    remote.faultInjection.dropResponseAfterCommit = true;
    const resC = await coord.enqueueSave();
    expect(resC.ok).toBe(true);
    expect(localA.outbox.every((o) => o.status === 'synced')).toBe(true);

    // Reachability GC after A->B->C: keeps B & C reachable files, marks A-only manifest/indexes as unreachable
    const gcPlan = await coord.planGarbageCollection();
    expect(gcPlan.ok).toBe(true);
    if (gcPlan.ok) {
      expect(gcPlan.unreachablePaths.some((p) => p.includes(revA))).toBe(true);
      const gcExec = await coord.executeGarbageCollection();
      expect(gcExec.ok).toBe(true);
      // Verify active (C) and previous (B) still pass full integrity check after GC!
      const saveAfterGc = await coord.enqueueSave();
      expect(saveAfterGc.ok).toBe(true);
    }
  });

  it('merges concurrent mobile + desktop writes on 422 non-fast-forward conflict, enforces forward recovery epoch quarantine, and propagates tombstones', async () => {
    const remote = new InMemoryRemoteGitAdapter();
    const desktop = new MemoryLocalBackend();
    const mobile = new MemoryLocalBackend();
    const coordDesktop = new SyncCoordinator(remote, desktop, 'desktop-1');
    const coordMobile = new SyncCoordinator(remote, mobile, 'mobile-1');

    // Initial sync so both start from rev 1
    desktop.enqueueQuestionSet(structuredClone(SEED_QUESTION_SETS[1]));
    await coordDesktop.enqueueSave();
    await coordMobile.enqueueSave();

    // Concurrent edits: desktop adds set2, mobile adds set3
    desktop.enqueueQuestionSet(structuredClone(SEED_QUESTION_SETS[2]));
    mobile.enqueueQuestionSet(structuredClone(SEED_QUESTION_SETS[3]));

    // Desktop commits first
    const dSave = await coordDesktop.enqueueSave();
    expect(dSave.ok).toBe(true);

    // Mobile commits concurrently -> hits parent mismatch 422 -> auto-reloads & merges BOTH sets!
    const mSave = await coordMobile.enqueueSave();
    expect(mSave.ok).toBe(true);
    expect(mobile.dataset.questionSets.some((s) => s.setId === SEED_QUESTION_SETS[2].setId)).toBe(true);
    expect(mobile.dataset.questionSets.some((s) => s.setId === SEED_QUESTION_SETS[3].setId)).toBe(true);

    // Mobile queues an offline edit under old epoch, while Desktop executes forward recovery to previous!
    mobile.enqueueQuestionSet(structuredClone(SEED_QUESTION_SETS[4]));
    const rec = await coordDesktop.recoverToPrevious();
    expect(rec.ok).toBe(true);
    expect(desktop.syncEpoch).toBe(2);

    // When mobile syncs next, it detects remote syncEpoch (2) > local (1) and QUARANTINES its stale op!
    const mAfterRec = await coordMobile.enqueueSave();
    expect(mAfterRec.ok).toBe(false);
    expect(mAfterRec.status).toBe('conflict_quarantine');
    expect(mobile.quarantine).toHaveLength(1);
    expect(mobile.syncEpoch).toBe(2);

    // Tombstone deletion on desktop propagates and prevents resurrection on mobile
    desktop.enqueueTombstone({
      format: 'mooncode.tombstone',
      schemaVersion: 1,
      tombstoneId: generateUuid(),
      targetType: 'question_set',
      targetId: SEED_QUESTION_SETS[2].setId,
      mode: 'delete_set',
      revision: 1,
      deletedAt: new Date().toISOString(),
      deviceId: 'desktop-1',
    });
    await coordDesktop.enqueueSave();
    await coordMobile.enqueueSave();
    expect(mobile.dataset.questionSets.some((s) => s.setId === SEED_QUESTION_SETS[2].setId)).toBe(false);
  });
});

describe('Backend Security & Path Allowlist Boundaries', () => {
  const env: MoonCodeServerEnv = {
    APP_ORIGIN: 'https://mooncode.example',
    GITHUB_APP_ID: '12345',
    GITHUB_APP_CLIENT_ID: 'client-id',
    GITHUB_APP_CLIENT_SECRET: 'super-secret-client',
    GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
    GITHUB_APP_INSTALLATION_ID: '999',
    GITHUB_DATA_OWNER: 'owner',
    GITHUB_DATA_REPO: 'study-data-repo',
    ALLOWED_GITHUB_USER_ID: '10001',
    SESSION_SECRET: 'test-session-secret-with-at-least-32-chars',
  };

  it('rejects unauthenticated /api/sync/* requests and never leaks secrets', async () => {
    const req = new Request('https://mooncode.example/api/sync/head', { method: 'GET' });
    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).not.toContain('super-secret-client');
    expect(body).not.toContain('test-session-secret');
  });

  it('rejects cross-origin CSRF POST /api/auth/logout and safely returns local_only status when unconfigured', async () => {
    const evilLogout = new Request('https://mooncode.example/api/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://evil.attacker', 'X-MoonCode-CSRF': '1' },
    });
    const resForbidden = await handleApiRequest(evilLogout, env);
    expect(resForbidden.status).toBe(403);

    const statusLocal = await handleApiRequest(
      new Request('http://localhost:3000/api/sync/status', { method: 'GET' }),
      {}
    );
    expect(statusLocal.status).toBe(200);
    const statusJson = (await statusLocal.json()) as { configured: boolean; authenticated: boolean };
    expect(statusJson.configured).toBe(false);
    expect(statusJson.authenticated).toBe(false);
  });
});
