import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sha256File(absPath) {
  return sha256Buffer(fs.readFileSync(absPath));
}

export function computeFilesBundleFingerprint(rootDir, relativePaths) {
  const hash = crypto.createHash('sha256');
  const sorted = [...relativePaths].sort();
  for (const rel of sorted) {
    const abs = path.resolve(rootDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Tracked file missing for fingerprint: ${rel}`);
    }
    const content = fs.readFileSync(abs);
    hash.update(`${rel}:${content.length}:`);
    hash.update(sha256Buffer(content));
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, 12);
}

export function countPdfPagesFromBuffer(buf) {
  const text = buf.toString('latin1');
  const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  if (pageMatches && pageMatches.length > 0) {
    return pageMatches.length;
  }
  const countMatches = text.match(/\/Count\s+(\d+)/g);
  if (countMatches && countMatches.length > 0) {
    const counts = countMatches.map((m) => Number(m.replace(/\/Count\s+/, '')));
    return Math.max(...counts);
  }
  return 0;
}

export function verifyPdfBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) {
    return { ok: false, reason: 'PDF 檔案大小異常（過小或為空白檔）', pageCount: 0 };
  }
  const header = buf.subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') {
    return { ok: false, reason: `PDF 檔頭無效（取得 "${header}"，預期 "%PDF-"）`, pageCount: 0 };
  }
  const pageCount = countPdfPagesFromBuffer(buf);
  if (pageCount <= 0) {
    return { ok: false, reason: '無法從 PDF 解析有效頁數（/Type /Page 數量為 0）', pageCount: 0 };
  }
  return { ok: true, pageCount };
}

export function extractAppRoutes(appTsxPath) {
  const content = fs.readFileSync(appTsxPath, 'utf8');
  const routes = [];
  const regex = /<Route\s+path="([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[1] !== '*') {
      routes.push(match[1]);
    }
  }
  return routes;
}
