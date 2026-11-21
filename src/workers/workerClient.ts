import { generateUuid } from '../domain/hash.ts';
import type { StudyBundle } from '../domain/types.ts';
import { processBundleValidation, type WorkerResponse } from './dataWorker.ts';

export async function validateStudyBundleOffThread(
  rawJson: string,
  options: {
    currentSchemaVersion?: number;
    onProgress?: (percent: number, message: string) => void;
    signal?: AbortSignal;
  } = {}
): Promise<{ ok: true; bundle: StudyBundle } | { ok: false; errors: string[]; needsUpgrade?: boolean }> {
  const version = options.currentSchemaVersion ?? 1;

  if (typeof Worker === 'undefined') {
    return processBundleValidation(
      rawJson,
      version,
      options.onProgress,
      () => Boolean(options.signal?.aborted)
    );
  }

  return new Promise((resolve) => {
    const id = generateUuid();
    const worker = new Worker(new URL('./dataWorker.ts', import.meta.url), { type: 'module' });

    const cleanup = () => {
      options.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    const onAbort = () => {
      worker.postMessage({ id, type: 'cancel', targetId: id });
      cleanup();
      resolve({ ok: false, errors: ['操作已由使用者取消'] });
    };

    if (options.signal?.aborted) {
      cleanup();
      resolve({ ok: false, errors: ['操作已由使用者取消'] });
      return;
    }
    options.signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        options.onProgress?.(msg.percent, msg.message);
      } else if (msg.type === 'validate_bundle_result') {
        cleanup();
        if (msg.ok) {
          resolve({ ok: true, bundle: msg.bundle });
        } else {
          resolve({ ok: false, errors: msg.errors, needsUpgrade: msg.needsUpgrade });
        }
      } else if (msg.type === 'cancelled') {
        cleanup();
        resolve({ ok: false, errors: ['操作已由使用者取消'] });
      }
    };

    worker.onerror = () => {
      cleanup();
      void processBundleValidation(rawJson, version, options.onProgress).then(resolve);
    };

    worker.postMessage({
      id,
      type: 'validate_bundle',
      rawJson,
      currentSchemaVersion: version,
    });
  });
}
