import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type {
  ActivePointer,
  AiRequest,
  AnswerRecord,
  CanonicalChapter,
  DeletionTombstone,
  Evaluation,
  IssueReport,
  PendingOperation,
  QuarantinedOperation,
  QuestionSet,
  SlideVariant,
  SnapshotManifest,
  TestRun,
} from '../domain/types.ts';

export const MOONCODE_DB_NAME = 'mooncode-study-db';
export const MOONCODE_DB_VERSION = 1;

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface MoonCodeDBSchema extends DBSchema {
  meta: {
    key: string;
    value: MetaRecord;
  };
  chapters_cache: {
    key: string;
    value: CanonicalChapter;
  };
  slide_variants: {
    key: string;
    value: SlideVariant;
    indexes: { 'by-slide': string; 'by-chapter': string };
  };
  question_sets: {
    key: string;
    value: QuestionSet;
    indexes: { 'by-chapter': string; 'by-createdAt': string; 'by-source': string };
  };
  test_runs: {
    key: string;
    value: TestRun;
    indexes: { 'by-setId': string; 'by-status': string; 'by-startedAt': string };
  };
  answers: {
    key: string;
    value: AnswerRecord;
    indexes: {
      'by-testRun': string;
      'by-question': string;
      'by-submittedAt': string;
      'by-chapter': string;
      'by-status': string;
    };
  };
  evaluations: {
    key: string;
    value: Evaluation;
    indexes: { 'by-testRun': string; 'by-answer': string };
  };
  tombstones: {
    key: string;
    value: DeletionTombstone;
    indexes: { 'by-target': string };
  };
  outbox: {
    key: string;
    value: PendingOperation;
    indexes: { 'by-status': string; 'by-epoch': number };
  };
  quarantine: {
    key: string;
    value: QuarantinedOperation;
  };
  ai_requests: {
    key: string;
    value: AiRequest;
    indexes: { 'by-status': string };
  };
  issue_reports: {
    key: string;
    value: IssueReport;
  };
  snapshots_meta: {
    key: string;
    value: {
      key: 'head' | 'last_known_good_head' | 'active_manifest' | 'previous_manifest';
      data: ActivePointer | SnapshotManifest;
      savedAt: string;
    };
  };
}

export class StorageError extends Error {
  public readonly code: 'QUOTA_EXCEEDED' | 'VERSION_BLOCKED' | 'TX_ABORTED' | 'UNAVAILABLE';
  constructor(
    code: 'QUOTA_EXCEEDED' | 'VERSION_BLOCKED' | 'TX_ABORTED' | 'UNAVAILABLE',
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

function mapIdbError(err: unknown): StorageError {
  if (err instanceof StorageError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (name === 'QuotaExceededError' || msg.toLowerCase().includes('quota')) {
    return new StorageError(
      'QUOTA_EXCEEDED',
      '瀏覽器本機儲存空間已滿，無法確保寫入完成。請前往「儲存與版本」匯出備份或進行封存清理。'
    );
  }
  if (name === 'AbortError') {
    return new StorageError('TX_ABORTED', '本機資料寫入交易被中斷，資料尚未落盤，請重試操作。');
  }
  return new StorageError(
    'UNAVAILABLE',
    `無法開啟本機 IndexedDB（可能為無痕／私密瀏覽限制或瀏覽器權限受限）：${msg}`
  );
}

let dbPromise: Promise<IDBPDatabase<MoonCodeDBSchema>> | null = null;

export function resetDbConnectionForTest(): void {
  dbPromise = null;
}

export async function getDb(): Promise<IDBPDatabase<MoonCodeDBSchema>> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<MoonCodeDBSchema>(MOONCODE_DB_NAME, MOONCODE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('chapters_cache')) {
        db.createObjectStore('chapters_cache', { keyPath: 'chapterId' });
      }
      if (!db.objectStoreNames.contains('slide_variants')) {
        const s = db.createObjectStore('slide_variants', { keyPath: 'variantId' });
        s.createIndex('by-slide', 'slideId');
        s.createIndex('by-chapter', 'chapterId');
      }
      if (!db.objectStoreNames.contains('question_sets')) {
        const s = db.createObjectStore('question_sets', { keyPath: 'setId' });
        s.createIndex('by-chapter', 'chapterId');
        s.createIndex('by-createdAt', 'createdAt');
        s.createIndex('by-source', 'source');
      }
      if (!db.objectStoreNames.contains('test_runs')) {
        const s = db.createObjectStore('test_runs', { keyPath: 'testRunId' });
        s.createIndex('by-setId', 'setId');
        s.createIndex('by-status', 'status');
        s.createIndex('by-startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains('answers')) {
        const s = db.createObjectStore('answers', { keyPath: 'answerId' });
        s.createIndex('by-testRun', 'testRunId');
        s.createIndex('by-question', 'questionId');
        s.createIndex('by-submittedAt', 'submittedAt');
        s.createIndex('by-chapter', 'chapterId');
        s.createIndex('by-status', 'status');
      }
      if (!db.objectStoreNames.contains('evaluations')) {
        const s = db.createObjectStore('evaluations', { keyPath: 'evaluationId' });
        s.createIndex('by-testRun', 'testRunId');
        s.createIndex('by-answer', 'answerId');
      }
      if (!db.objectStoreNames.contains('tombstones')) {
        const s = db.createObjectStore('tombstones', { keyPath: 'tombstoneId' });
        s.createIndex('by-target', 'targetId');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const s = db.createObjectStore('outbox', { keyPath: 'operationId' });
        s.createIndex('by-status', 'status');
        s.createIndex('by-epoch', 'epoch');
      }
      if (!db.objectStoreNames.contains('quarantine')) {
        db.createObjectStore('quarantine', { keyPath: 'quarantineId' });
      }
      if (!db.objectStoreNames.contains('ai_requests')) {
        const s = db.createObjectStore('ai_requests', { keyPath: 'requestId' });
        s.createIndex('by-status', 'status');
      }
      if (!db.objectStoreNames.contains('issue_reports')) {
        db.createObjectStore('issue_reports', { keyPath: 'reportId' });
      }
      if (!db.objectStoreNames.contains('snapshots_meta')) {
        db.createObjectStore('snapshots_meta', { keyPath: 'key' });
      }
    },
    blocked() {
      throw new StorageError('VERSION_BLOCKED', '另一個分頁正在開啟舊版資料庫，請重新整理其他分頁後再試。');
    },
  }).catch((err) => {
    dbPromise = null;
    throw mapIdbError(err);
  });
  return dbPromise;
}

export async function getMetaValue<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.get('meta', key);
  return row ? (row.value as T) : fallback;
}

export async function setMetaValue(key: string, value: unknown): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction('meta', 'readwrite');
    await tx.store.put({ key, value });
    await tx.done;
  } catch (err) {
    throw mapIdbError(err);
  }
}

export async function getDatasetEpoch(): Promise<number> {
  return getMetaValue<number>('syncEpoch', 1);
}

export async function getDatasetId(): Promise<string> {
  return getMetaValue<string>('datasetId', 'mooncode-primary');
}

export async function putWithOutbox(
  storeName:
    | 'question_sets'
    | 'test_runs'
    | 'answers'
    | 'evaluations'
    | 'slide_variants'
    | 'tombstones'
    | 'issue_reports',
  record: unknown,
  op: PendingOperation
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction([storeName, 'outbox'], 'readwrite');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.objectStore(storeName) as any).put(record);
    await tx.objectStore('outbox').put(op);
    await tx.done;
  } catch (err) {
    throw mapIdbError(err);
  }
}

export async function getQuestionSetsPage(options: {
  page: number;
  pageSize: number;
  chapterId?: string;
  source?: 'seed' | 'ai_import';
  difficulty?: string;
  conceptId?: string;
  attemptedSetIds?: Set<string>;
  attemptedFilter?: 'all' | 'done' | 'todo';
}): Promise<{ items: QuestionSet[]; total: number }> {
  const db = await getDb();
  let all: QuestionSet[];
  if (options.chapterId && options.chapterId !== 'all') {
    all = await db.getAllFromIndex('question_sets', 'by-chapter', options.chapterId);
  } else {
    all = await db.getAll('question_sets');
  }

  const tombstones = await db.getAll('tombstones');
  const deletedSetIds = new Set(
    tombstones.filter((t) => t.mode === 'delete_set').map((t) => t.targetId)
  );

  const filtered = all
    .filter((s) => !deletedSetIds.has(s.setId))
    .filter((s) => !options.source || s.source === options.source)
    .filter((s) => !options.difficulty || options.difficulty === 'all' || s.difficulty === options.difficulty)
    .filter((s) => !options.conceptId || options.conceptId === 'all' || s.conceptIds.includes(options.conceptId))
    .filter((s) => {
      if (!options.attemptedFilter || options.attemptedFilter === 'all' || !options.attemptedSetIds) {
        return true;
      }
      const isDone = options.attemptedSetIds.has(s.setId);
      return options.attemptedFilter === 'done' ? isDone : !isDone;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const start = Math.max(0, (options.page - 1) * options.pageSize);
  return {
    items: filtered.slice(start, start + options.pageSize),
    total: filtered.length,
  };
}
