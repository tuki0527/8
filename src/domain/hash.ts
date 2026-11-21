/**
 * Deterministic canonical JSON serialization & SHA-256 utilities.
 * Note: Git object integrity hashes MUST be calculated on the exact stored UTF-8 bytes,
 * whereas StudyBundle integritySha256 hashes stableStringify(payloadWithoutIntegrityField).
 */

export function stableNormalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    if (obj[key] !== undefined) {
      out[key] = stableNormalize(obj[key]);
    }
  }
  return out;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export async function sha256Utf8(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return sha256Bytes(bytes);
}

export async function sha256Canonical(value: unknown): Promise<string> {
  return sha256Utf8(stableStringify(value));
}

export function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function computeBundleIntegrityHash(
  bundleWithoutHash: Record<string, unknown>
): Promise<string> {
  const copy = { ...bundleWithoutHash };
  delete copy.integritySha256;
  return sha256Canonical(copy);
}
