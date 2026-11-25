import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  computeFilesBundleFingerprint,
  extractAppRoutes,
  sha256File,
  verifyPdfBuffer,
} from './lib/manifest-utils.mjs';

export function verifyDocumentationState(rootDir = process.cwd()) {
  const errors = [];
  const docsConfigPath = path.resolve(rootDir, 'docs/docs-config.json');
  const agentsPath = path.resolve(rootDir, 'AGENTS.md');
  const appTsxPath = path.resolve(rootDir, 'src/App.tsx');
  const screenshotManifestPath = path.resolve(rootDir, 'docs/screenshots/manifest.json');
  const runtimeManifestPath = path.resolve(rootDir, 'public/system-docs/manifest.json');
  const generatedExpectationPath = path.resolve(rootDir, 'src/generated/docsExpectation.ts');

  if (!fs.existsSync(agentsPath)) {
    errors.push('缺少根目錄維護規則檔 AGENTS.md');
  } else {
    const agentsText = fs.readFileSync(agentsPath, 'utf8');
    if (
      !agentsText.includes('每次使用者提出的功能或流程修改') ||
      !agentsText.includes('docs:verify') ||
      !agentsText.includes('docs:build')
    ) {
      errors.push('AGENTS.md 缺少強制同步維護系統文件與截圖之規則或指令。');
    }
  }

  if (!fs.existsSync(docsConfigPath)) {
    errors.push('缺少 docs/docs-config.json');
    return { ok: false, errors };
  }

  const docsConfig = JSON.parse(fs.readFileSync(docsConfigPath, 'utf8'));

  // 1. Check all App.tsx routes are covered in docs/docs-config.json
  const appRoutes = extractAppRoutes(appTsxPath);
  const coveredRoutes = new Set((docsConfig.routeCoverage ?? []).map((r) => r.route));
  for (const route of appRoutes) {
    if (!coveredRoutes.has(route)) {
      errors.push(`src/App.tsx 路由 "${route}" 尚未記錄於 docs/docs-config.json routeCoverage。`);
    }
  }

  // 2. Check Markdown sources & figure references
  const referencedFigureIds = new Set();
  for (const docMeta of docsConfig.documents ?? []) {
    const mdPath = path.resolve(rootDir, docMeta.sourceMarkdown);
    if (!fs.existsSync(mdPath)) {
      errors.push(`缺少文件原始檔 ${docMeta.sourceMarkdown}`);
      continue;
    }
    const mdText = fs.readFileSync(mdPath, 'utf8');
    const regex = /<!--\s*FIGURE:\s*([a-zA-Z0-9_-]+)\s*\|\s*(.+?)\s*-->/g;
    let match;
    while ((match = regex.exec(mdText)) !== null) {
      referencedFigureIds.add(match[1]);
    }
  }

  // 3. Check screenshot manifest and all referenced screenshots
  if (!fs.existsSync(screenshotManifestPath)) {
    errors.push('缺少截圖清單 docs/screenshots/manifest.json（請先執行 npm run docs:capture）。');
  } else {
    const shotManifest = JSON.parse(fs.readFileSync(screenshotManifestPath, 'utf8'));
    const shotById = new Map((shotManifest.screenshots ?? []).map((s) => [s.id, s]));
    for (const figId of referencedFigureIds) {
      const entry = shotById.get(figId);
      if (!entry) {
        errors.push(`文件引用了截圖 "${figId}"，但 docs/screenshots/manifest.json 無此紀錄。`);
        continue;
      }
      const absShot = path.resolve(rootDir, 'docs/screenshots', entry.fileName);
      if (!fs.existsSync(absShot)) {
        errors.push(`找不到截圖檔案 docs/screenshots/${entry.fileName}`);
        continue;
      }
      const actualHash = sha256File(absShot);
      if (actualHash !== entry.sha256) {
        errors.push(`截圖 docs/screenshots/${entry.fileName} 內容已變動但未更新 manifest.json。`);
      }
    }
  }

  // 4. Check PDFs, runtime manifest, and generated docsExpectation.ts
  if (!fs.existsSync(runtimeManifestPath)) {
    errors.push('缺少 public/system-docs/manifest.json（請執行 npm run docs:build）。');
  } else if (!fs.existsSync(generatedExpectationPath)) {
    errors.push('缺少 src/generated/docsExpectation.ts（請執行 npm run docs:build）。');
  } else {
    const runtimeManifest = JSON.parse(fs.readFileSync(runtimeManifestPath, 'utf8'));
    if (runtimeManifest.status !== 'published') {
      errors.push(
        `public/system-docs/manifest.json 目前為 "${runtimeManifest.status}"（僅允許正式版 "published"）。`
      );
    }

    const expectedSourceFp = computeFilesBundleFingerprint(rootDir, docsConfig.sourceTrackedFiles);
    if (runtimeManifest.sourceFingerprint !== expectedSourceFp) {
      errors.push(
        `核心原始碼已變更（目前 sourceFingerprint=${expectedSourceFp}，文件紀錄=${runtimeManifest.sourceFingerprint}）。請同步檢視文件／截圖並重新執行 npm run docs:build。`
      );
    }

    const docIds = [];
    for (const docMeta of docsConfig.documents ?? []) {
      const pdfAbs = path.resolve(rootDir, docMeta.outputPdf);
      if (!fs.existsSync(pdfAbs)) {
        errors.push(`缺少輸出 PDF：${docMeta.outputPdf}`);
        continue;
      }
      const pdfBuf = fs.readFileSync(pdfAbs);
      const pdfCheck = verifyPdfBuffer(pdfBuf);
      if (!pdfCheck.ok) {
        errors.push(`${docMeta.outputPdf} 檢核失敗：${pdfCheck.reason}`);
        continue;
      }
      const actualHash = sha256File(pdfAbs);
      const manifestEntry = (runtimeManifest.documents ?? []).find((d) => d.id === docMeta.id);
      if (!manifestEntry) {
        errors.push(`public/system-docs/manifest.json 缺少文件項目 ${docMeta.id}`);
      } else {
        if (manifestEntry.sha256 !== actualHash) {
          errors.push(`${docMeta.outputPdf} SHA-256 與 manifest.json 不符。`);
        }
        if (manifestEntry.pageCount !== pdfCheck.pageCount) {
          errors.push(
            `${docMeta.outputPdf} 頁數 (${pdfCheck.pageCount}) 與 manifest.json (${manifestEntry.pageCount}) 不符。`
          );
        }
      }
      docIds.push(`public/system-docs/${docMeta.fileName}`);
    }

    const expectedDocsFp = computeFilesBundleFingerprint(rootDir, [
      ...(docsConfig.docSourceFiles ?? []),
      ...docIds,
    ]);
    if (runtimeManifest.docsFingerprint !== expectedDocsFp) {
      errors.push(
        `文件原始檔或 PDF 已變更（目前 docsFingerprint=${expectedDocsFp}，manifest=${runtimeManifest.docsFingerprint}），請重新執行 npm run docs:build。`
      );
    }

    // Compare src/generated/docsExpectation.ts against runtimeManifest
    const genText = fs.readFileSync(generatedExpectationPath, 'utf8');
    if (
      !genText.includes(`"sourceFingerprint": "${runtimeManifest.sourceFingerprint}"`) ||
      !genText.includes(`"docsFingerprint": "${runtimeManifest.docsFingerprint}"`) ||
      !genText.includes(`"status": "${runtimeManifest.status}"`) ||
      !genText.includes(`"docsVersion": "${runtimeManifest.docsVersion}"`)
    ) {
      errors.push('src/generated/docsExpectation.ts 與 public/system-docs/manifest.json 不一致，請重新執行 npm run docs:build。');
    }
    for (const d of runtimeManifest.documents ?? []) {
      if (!genText.includes(`"sha256": "${d.sha256}"`)) {
        errors.push(`src/generated/docsExpectation.ts 尚未同步 ${d.fileName} 之最新 SHA-256。`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = verifyDocumentationState(process.cwd());
  if (!result.ok) {
    console.error('系統文件一致性檢查未通過：');
    for (const err of result.errors) {
      console.error(` - ${err}`);
    }
    process.exit(1);
  }
  console.log('系統文件一致性檢查通過（所有路由、截圖、核心指紋與 PDF 雜湊皆同步）。');
}
