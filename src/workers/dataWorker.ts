import { computeBundleIntegrityHash, sha256Utf8 } from '../domain/hash.ts';
import type { StudyBundle } from '../domain/types.ts';
import { MAX_BUNDLE_BYTES, StudyBundleSchema, formatZodIssues } from '../schemas/runtimeSchemas.ts';

export type WorkerRequest =
  | { id: string; type: 'validate_bundle'; rawJson: string; currentSchemaVersion: number }
  | { id: string; type: 'hash_batch'; items: Array<{ key: string; text: string }> }
  | { id: string; type: 'cancel'; targetId: string };

export type WorkerResponse =
  | { id: string; type: 'progress'; percent: number; message: string }
  | { id: string; type: 'validate_bundle_result'; ok: true; bundle: StudyBundle }
  | { id: string; type: 'validate_bundle_result'; ok: false; errors: string[]; needsUpgrade?: boolean }
  | { id: string; type: 'hash_batch_result'; hashes: Record<string, string> }
  | { id: string; type: 'cancelled' };

const cancelledIds = new Set<string>();

export async function processBundleValidation(
  rawJson: string,
  currentSchemaVersion: number,
  onProgress?: (percent: number, message: string) => void,
  isCancelled?: () => boolean
): Promise<
  | { ok: true; bundle: StudyBundle }
  | { ok: false; errors: string[]; needsUpgrade?: boolean }
> {
  const byteSize = new TextEncoder().encode(rawJson).byteLength;
  if (byteSize > MAX_BUNDLE_BYTES) {
    return {
      ok: false,
      errors: [
        `檔案大小 (${(byteSize / 1024 / 1024).toFixed(2)} MB) 超過目前單次支援上限 ${(MAX_BUNDLE_BYTES / 1024 / 1024).toFixed(0)} MB，請改用分批封存匯入。`,
      ],
    };
  }
  if (isCancelled?.()) return { ok: false, errors: ['操作已取消'] };

  onProgress?.(20, '解析 JSON 結構...');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      ok: false,
      errors: [`JSON 語法損毀：${err instanceof Error ? err.message : String(err)}`],
    };
  }
  if (isCancelled?.()) return { ok: false, errors: ['操作已取消'] };

  if (parsed && typeof parsed === 'object' && 'schemaVersion' in parsed) {
    const sv = Number((parsed as { schemaVersion: unknown }).schemaVersion);
    if (!Number.isNaN(sv) && sv > currentSchemaVersion) {
      return {
        ok: false,
        needsUpgrade: true,
        errors: [
          `此備份採用較新格式 schemaVersion=${sv}（目前程式僅支援 v${currentSchemaVersion}）。請更新網站後再匯入，本機原有資料已保留不動。`,
        ],
      };
    }
  }

  onProgress?.(55, '驗證資料型別與 7+3 題組規則...');
  const result = StudyBundleSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, errors: formatZodIssues(result.error) };
  }
  if (isCancelled?.()) return { ok: false, errors: ['操作已取消'] };

  onProgress?.(85, '驗證完整性 SHA-256 雜湊...');
  const expectedHash = await computeBundleIntegrityHash(
    result.data as unknown as Record<string, unknown>
  );
  if (expectedHash !== result.data.integritySha256) {
    return {
      ok: false,
      errors: [
        `完整性雜湊不符（預期 ${expectedHash.slice(0, 12)}…，檔案為 ${result.data.integritySha256.slice(0, 12)}…），檔案可能已遭截斷或竄改。`,
      ],
    };
  }

  onProgress?.(100, '驗證完成');
  return { ok: true, bundle: result.data as StudyBundle };
}

if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const req = event.data;
    if (req.type === 'cancel') {
      cancelledIds.add(req.targetId);
      return;
    }
    if (req.type === 'validate_bundle') {
      const res = await processBundleValidation(
        req.rawJson,
        req.currentSchemaVersion,
        (percent, message) => {
          self.postMessage({ id: req.id, type: 'progress', percent, message } satisfies WorkerResponse);
        },
        () => cancelledIds.has(req.id)
      );
      if (cancelledIds.has(req.id)) {
        cancelledIds.delete(req.id);
        self.postMessage({ id: req.id, type: 'cancelled' } satisfies WorkerResponse);
        return;
      }
      self.postMessage({
        id: req.id,
        type: 'validate_bundle_result',
        ...res,
      } satisfies WorkerResponse);
    } else if (req.type === 'hash_batch') {
      const hashes: Record<string, string> = {};
      const total = req.items.length || 1;
      for (let i = 0; i < req.items.length; i++) {
        if (cancelledIds.has(req.id)) {
          cancelledIds.delete(req.id);
          self.postMessage({ id: req.id, type: 'cancelled' } satisfies WorkerResponse);
          return;
        }
        const item = req.items[i];
        hashes[item.key] = await sha256Utf8(item.text);
        if (i % 50 === 0) {
          self.postMessage({
            id: req.id,
            type: 'progress',
            percent: Math.round(((i + 1) / total) * 100),
            message: `正在計算雜湊 ${i + 1} / ${total}`,
          } satisfies WorkerResponse);
        }
      }
      self.postMessage({ id: req.id, type: 'hash_batch_result', hashes } satisfies WorkerResponse);
    }
  };
}
