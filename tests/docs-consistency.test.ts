import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyDocumentationState } from '../scripts/docs/verify-docs.mjs';
import { verifyPdfBuffer } from '../scripts/docs/lib/manifest-utils.mjs';
import { DOCS_EXPECTATION } from '../src/generated/docsExpectation.ts';

describe('System Documentation Consistency & PDF Artifacts', () => {
  const rootDir = process.cwd();

  it('passes full documentation verification (routes, screenshots, source fingerprint, PDFs, manifest)', () => {
    const result = verifyDocumentationState(rootDir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('produces valid published PDFs matching runtime manifest and bundled DOCS_EXPECTATION', () => {
    const manifestPath = path.resolve(rootDir, 'public/system-docs/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.format).toBe('mooncode.system_docs_manifest');
    expect(manifest.status).toBe('published');
    expect(DOCS_EXPECTATION.status).toBe('published');
    expect(DOCS_EXPECTATION.docsVersion).toBe(manifest.docsVersion);
    expect(DOCS_EXPECTATION.sourceFingerprint).toBe(manifest.sourceFingerprint);
    expect(DOCS_EXPECTATION.docsFingerprint).toBe(manifest.docsFingerprint);

    for (const id of ['system-specification', 'user-guide'] as const) {
      const entry = manifest.documents.find((d: { id: string }) => d.id === id);
      expect(entry).toBeTruthy();

      const pdfPath = path.resolve(rootDir, 'public/system-docs', entry.fileName);
      const buf = fs.readFileSync(pdfPath);
      const pdfCheck = verifyPdfBuffer(buf);

      expect(pdfCheck.ok).toBe(true);
      expect(pdfCheck.pageCount).toBe(entry.pageCount);
      expect(DOCS_EXPECTATION.documents[id].pageCount).toBe(entry.pageCount);
      expect(DOCS_EXPECTATION.documents[id].sha256).toBe(entry.sha256);
    }
  });
});
