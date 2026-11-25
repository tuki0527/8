import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  computeFilesBundleFingerprint,
  sha256Buffer,
  verifyPdfBuffer,
} from './lib/manifest-utils.mjs';

const require = createRequire(import.meta.url);
const ROOT_DIR = process.cwd();
const DOCS_CONFIG_PATH = path.resolve(ROOT_DIR, 'docs/docs-config.json');
const SCREENSHOTS_DIR = path.resolve(ROOT_DIR, 'docs/screenshots');
const SCREENSHOT_MANIFEST_PATH = path.resolve(SCREENSHOTS_DIR, 'manifest.json');
const OUTPUT_DOCS_DIR = path.resolve(ROOT_DIR, 'public/system-docs');
const RUNTIME_MANIFEST_PATH = path.resolve(OUTPUT_DOCS_DIR, 'manifest.json');
const GENERATED_EXPECTATION_PATH = path.resolve(ROOT_DIR, 'src/generated/docsExpectation.ts');
const PACKAGE_JSON_PATH = path.resolve(ROOT_DIR, 'package.json');

const PLAYWRIGHT_CANDIDATES = [
  '/usr/local/share/bun-global/node_modules/playwright-core/index.js',
  'playwright-core',
  'playwright',
];

const CHROMIUM_EXECUTABLE_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

function loadPlaywright() {
  for (const mod of PLAYWRIGHT_CANDIDATES) {
    try {
      return require(mod);
    } catch {
      // try next
    }
  }
  throw new Error('找不到 playwright-core / playwright，無法執行 Chromium PDF 產製。');
}

function findChromiumExecutable() {
  for (const exe of CHROMIUM_EXECUTABLE_CANDIDATES) {
    if (exe && fs.existsSync(exe)) {
      return exe;
    }
  }
  return undefined;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInlineMath(expr) {
  let out = expr.trim();
  out = out.replace(/\\text\{([^}]+)\}/g, '<span class="math-text">$1</span>');
  out = out.replace(/\\in/g, '∈');
  out = out.replace(/\\sum/g, '∑');
  out = out.replace(/\\cdot/g, '·');
  out = out.replace(/\\times/g, '×');
  out = out.replace(/\\min/g, '<span class="math-op">min</span>');
  out = out.replace(/\\exp/g, '<span class="math-op">exp</span>');
  out = out.replace(/\\round/g, '<span class="math-op">round</span>');
  out = out.replace(/\\left/g, '').replace(/\\right/g, '');
  out = out.replace(/\\\{/g, '{').replace(/\\\}/g, '}');
  out = out.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="math-frac"><span>$1</span><span>$2</span></span>');
  out = out.replace(/_i\b/g, '<sub>i</sub>');
  return `<span class="math-inline">${out}</span>`;
}

function renderDisplayMath(expr) {
  const raw = expr.trim();
  if (raw.includes('begin{cases}')) {
    return `<div class="math-block">
      <div class="math-piecewise">
        <span class="math-lhs">M =</span>
        <span class="math-brace">{</span>
        <div class="math-cases">
          <div><span class="math-op">round</span>(100 · <i>A</i> · (0.9 + 0.1 · <i>F</i>)), &nbsp;<span class="math-cond">若具備足夠同分組速度基準樣本</span></div>
          <div><span class="math-op">round</span>(100 · <i>A</i>), &nbsp;<span class="math-cond">若速度資料尚不足（停用速度修正）</span></div>
        </div>
      </div>
    </div>`;
  }

  if (raw.includes('\\exp') && raw.includes('daysSince')) {
    return `<div class="math-block">
      <i>w</i><sub>i</sub> = baseWeight<sub>i</sub> × exp(<span class="math-frac"><span>−daysSince<sub>i</sub></span><span>30</span></span>)
      ,&nbsp;&nbsp;&nbsp;
      <i>A</i> = <span class="math-frac"><span>1 + ∑ <i>w</i><sub>i</sub><i>c</i><sub>i</sub></span><span>2 + ∑ <i>w</i><sub>i</sub></span></span>
    </div>`;
  }

  return `<div class="math-block">${renderInlineMath(raw)}</div>`;
}

function formatInlineMarkdown(raw) {
  // Protect inline code & inline math tokens cleanly before escaping
  const placeholders = [];
  let tokenized = raw.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE_${placeholders.length}@@`;
    placeholders.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  tokenized = tokenized.replace(/\$([^$]+)\$/g, (_, mathExpr) => {
    const token = `@@MATH_${placeholders.length}@@`;
    placeholders.push(renderInlineMath(mathExpr));
    return token;
  });

  let html = escapeHtml(tokenized);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="doc-link">$1 ($2)</span>');

  placeholders.forEach((snippet, idx) => {
    html = html.replace(`@@CODE_${idx}@@`, snippet);
    html = html.replace(`@@MATH_${idx}@@`, snippet);
  });
  return html;
}

function getArchitectureDiagramSvg(caption) {
  return `
    <figure class="doc-figure diagram-figure">
      <div class="diagram-badge">系統概念架構示意圖（非實機網站截圖）</div>
      <svg viewBox="0 0 820 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MoonCode 系統架構圖" style="width:100%;height:auto;display:block;">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#3a6a99" />
          </marker>
        </defs>
        <rect x="0" y="0" width="820" height="340" rx="14" fill="#f7fafc" stroke="#cbd8e6" stroke-width="1.5"/>

        <!-- Client Browser Layer -->
        <rect x="24" y="24" width="470" height="292" rx="12" fill="#eef4fa" stroke="#99b6d4" stroke-width="1.5"/>
        <text x="40" y="48" font-size="13" font-weight="700" fill="#133353">使用者瀏覽器 / PWA 離線環境（React 19 + HashRouter）</text>

        <rect x="42" y="66" width="205" height="96" rx="8" fill="#ffffff" stroke="#85a8cc" stroke-width="1.2"/>
        <text x="54" y="88" font-size="12" font-weight="700" fill="#0f2b46">學習與測驗模組</text>
        <text x="54" y="107" font-size="10.5" fill="#3c556e">· 9 章簡報 / 安全改寫</text>
        <text x="54" y="124" font-size="10.5" fill="#3c556e">· 7+3 測驗引擎與有效計時</text>
        <text x="54" y="141" font-size="10.5" fill="#3c556e">· 錯題本 / 掌握指標 v1.0.0</text>

        <rect x="268" y="66" width="208" height="96" rx="8" fill="#ffffff" stroke="#85a8cc" stroke-width="1.2"/>
        <text x="280" y="88" font-size="12" font-weight="700" fill="#0f2b46">AI 工作台與文件中心</text>
        <text x="280" y="107" font-size="10.5" fill="#3c556e">· Plus 手動往返 (Task A/B/C)</text>
        <text x="280" y="124" font-size="10.5" fill="#3c556e">· 官方自動介面（明確未啟用）</text>
        <text x="280" y="141" font-size="10.5" fill="#3c556e">· /docs PDF 版本檢核下載</text>

        <rect x="42" y="190" width="205" height="106" rx="8" fill="#ffffff" stroke="#4f83b5" stroke-width="1.5"/>
        <text x="54" y="213" font-size="12" font-weight="700" fill="#0f2b46">本機主存 IndexedDB</text>
        <text x="54" y="232" font-size="10.5" fill="#3c556e">· mooncode-study-db (13 Stores)</text>
        <text x="54" y="249" font-size="10.5" fill="#3c556e">· outbox / quarantine 佇列</text>
        <text x="54" y="266" font-size="10.5" fill="#3c556e">· 偏好另存 localStorage</text>
        <text x="54" y="283" font-size="10.5" fill="#1b6b52" font-weight="600">未設同步憑證時獨立運作</text>

        <rect x="268" y="190" width="208" height="106" rx="8" fill="#ffffff" stroke="#85a8cc" stroke-width="1.2"/>
        <text x="280" y="213" font-size="12" font-weight="700" fill="#0f2b46">Web Worker 與 PWA 快取</text>
        <text x="280" y="232" font-size="10.5" fill="#3c556e">· StudyBundle SHA-256 匯入驗證</text>
        <text x="280" y="249" font-size="10.5" fill="#3c556e">· Workbox App Shell 快取</text>
        <text x="280" y="266" font-size="10.5" fill="#3c556e">· /system-docs NetworkFirst</text>
        <text x="280" y="283" font-size="10.5" fill="#3c556e">· /api/* NetworkOnly 不快取</text>

        <line x1="145" y1="162" x2="145" y2="188" stroke="#3a6a99" stroke-width="1.6" marker-end="url(#arrow)"/>
        <line x1="247" y1="243" x2="266" y2="243" stroke="#3a6a99" stroke-width="1.6" marker-end="url(#arrow)"/>

        <!-- External / Optional Cloud Layer -->
        <rect x="526" y="24" width="270" height="138" rx="12" fill="#f9f6ee" stroke="#d4b97c" stroke-width="1.5"/>
        <text x="542" y="48" font-size="12" font-weight="700" fill="#5e4309">ChatGPT Plus 網頁（手動往返）</text>
        <text x="542" y="72" font-size="10.5" fill="#594a2b">1. 使用者複製帶 Request ID 提示詞</text>
        <text x="542" y="92" font-size="10.5" fill="#594a2b">2. 手動貼回 / 匯入回覆 JSON</text>
        <text x="542" y="112" font-size="10.5" fill="#594a2b">3. Schema + 雜湊 + 鎖定欄位檢查</text>
        <text x="542" y="138" font-size="10.5" fill="#8b4d0a" font-weight="600">無付費 API 金鑰 · 無背景自動抓取</text>

        <rect x="526" y="178" width="270" height="138" rx="12" fill="#eef6f2" stroke="#7fb39b" stroke-width="1.5"/>
        <text x="542" y="202" font-size="12" font-weight="700" fill="#144933">選配雲端同步與靜態交付</text>
        <text x="542" y="224" font-size="10.5" fill="#295240">· Cloudflare Worker (/api/*)</text>
        <text x="542" y="242" font-size="10.5" fill="#295240">· HMAC Session Cookie + Secrets</text>
        <text x="542" y="260" font-size="10.5" fill="#295240">· GitHub Private Repo study-data/</text>
        <text x="542" y="278" font-size="10.5" fill="#295240">· Fast-Forward + 正向 Epoch 復原</text>
        <text x="542" y="298" font-size="10.5" fill="#144933" font-weight="600">Static Assets 同源供應 dist/ 與 PDF</text>

        <line x1="476" y1="100" x2="524" y2="100" stroke="#a67c2e" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#arrow)"/>
        <line x1="476" y1="244" x2="524" y2="244" stroke="#3a6a99" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#arrow)"/>
      </svg>
      <figcaption>${escapeHtml(caption)}</figcaption>
    </figure>
  `;
}

function getBrandCoverSvg() {
  return `
    <svg width="42" height="42" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="128" height="128" rx="28" fill="#132338" stroke="#4275a8" stroke-width="4"/>
      <path d="M40 36c-7 0-10 4-10 11v10c0 4-2.5 7-6.5 7 4 0 6.5 3 6.5 7v10c0 7 3 11 10 11" stroke="#7bc3f7" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M68.5 37.5a26.5 26.5 0 1 0 21.5 42A21.5 21.5 0 0 1 68.5 37.5Z" fill="#f3d68a"/>
      <path d="M88 36c7 0 10 4 10 11v10c0 4 2.5 7 6.5 7-4 0-6.5 3-6.5 7v10c0 7-3 11-10 11" stroke="#7bc3f7" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M34 103c10-2.5 20 2.5 30 0s20-2.5 30 0" stroke="#7bc3f7" stroke-width="3.5" stroke-linecap="round" opacity="0.85"/>
    </svg>
  `;
}

function parseMarkdownToSectionsHtml(markdownText, screenshotResolver, draftMode) {
  const lines = markdownText.replace(/\r\n/g, '\n').split('\n');
  const toc = [];
  const bodyChunks = [];

  let i = 0;
  let title = '';
  let subtitle = '';
  let headingCounter = 0;

  // Extract top H1 and immediate blockquote subtitle if present
  if (lines[i]?.startsWith('# ')) {
    title = lines[i].slice(2).trim();
    i += 1;
    while (i < lines.length && lines[i].trim() === '') i += 1;
    if (lines[i]?.startsWith('> ')) {
      subtitle = lines[i].slice(2).trim();
      i += 1;
    }
  }

  const parseTable = () => {
    const tableLines = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      tableLines.push(lines[i].trim());
      i += 1;
    }
    if (tableLines.length < 2) {
      return tableLines.map((l) => `<p>${formatInlineMarkdown(l)}</p>`).join('\n');
    }
    const splitRow = (line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

    const headers = splitRow(tableLines[0]);
    const rows = tableLines.slice(2).map(splitRow);
    const thead = `<thead><tr>${headers.map((h) => `<th>${formatInlineMarkdown(h)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows
      .map((r) => `<tr>${r.map((cell) => `<td>${formatInlineMarkdown(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>`;
    return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed === '---') {
      i += 1;
      continue;
    }

    // Directives: <!-- FIGURE: id | caption --> or <!-- DIAGRAM: id | caption -->
    const figureMatch = trimmed.match(/^<!--\s*FIGURE:\s*([a-zA-Z0-9_-]+)\s*\|\s*(.+?)\s*-->$/);
    if (figureMatch) {
      const [, figId, caption] = figureMatch;
      const figAsset = screenshotResolver(figId);
      if (figAsset) {
        bodyChunks.push(`
          <figure class="doc-figure">
            <div class="figure-frame">
              <img src="${figAsset.dataUri}" alt="${escapeHtml(caption)}" />
            </div>
            <figcaption>${escapeHtml(caption)} <span class="fig-meta">(${escapeHtml(figAsset.viewport)})</span></figcaption>
          </figure>
        `);
      } else if (draftMode) {
        bodyChunks.push(`
          <figure class="doc-figure draft-placeholder">
            <div class="draft-box">待擷取實機畫面：${escapeHtml(figId)}</div>
            <figcaption>${escapeHtml(caption)}</figcaption>
          </figure>
        `);
      } else {
        throw new Error(`正式 PDF 建置失敗：找不到截圖檔 ${figId}.jpg`);
      }
      i += 1;
      continue;
    }

    const diagramMatch = trimmed.match(/^<!--\s*DIAGRAM:\s*([a-zA-Z0-9_-]+)\s*\|\s*(.+?)\s*-->$/);
    if (diagramMatch) {
      const [, diagramId, caption] = diagramMatch;
      if (diagramId === 'system_architecture') {
        bodyChunks.push(getArchitectureDiagramSvg(caption));
      }
      i += 1;
      continue;
    }

    // Headings
    if (trimmed.startsWith('## ')) {
      headingCounter += 1;
      const text = trimmed.slice(3).trim();
      const id = `sec-${headingCounter}`;
      toc.push({ level: 2, id, text: text.replace(/`([^`]+)`/g, '$1') });
      bodyChunks.push(`<h2 id="${id}">${formatInlineMarkdown(text)}</h2>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      headingCounter += 1;
      const text = trimmed.slice(4).trim();
      const id = `sec-${headingCounter}`;
      toc.push({ level: 3, id, text: text.replace(/`([^`]+)`/g, '$1') });
      bodyChunks.push(`<h3 id="${id}">${formatInlineMarkdown(text)}</h3>`);
      i += 1;
      continue;
    }

    // Display Math Block $$...$$
    if (trimmed.startsWith('$$')) {
      let mathRaw = trimmed.slice(2);
      if (mathRaw.endsWith('$$') && mathRaw.length >= 2) {
        mathRaw = mathRaw.slice(0, -2);
        i += 1;
      } else {
        i += 1;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          mathRaw += '\n' + lines[i];
          i += 1;
        }
        if (i < lines.length) {
          mathRaw += '\n' + lines[i].trim().slice(0, -2);
          i += 1;
        }
      }
      bodyChunks.push(renderDisplayMath(mathRaw));
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      bodyChunks.push(
        `<pre class="code-block" data-lang="${escapeHtml(lang)}"><code>${escapeHtml(
          codeLines.join('\n')
        )}</code></pre>`
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i += 1;
      }
      bodyChunks.push(
        `<blockquote class="doc-callout">${quoteLines
          .map((q) => `<p>${formatInlineMarkdown(q)}</p>`)
          .join('')}</blockquote>`
      );
      continue;
    }

    // Table
    if (trimmed.startsWith('|')) {
      bodyChunks.push(parseTable());
      continue;
    }

    // Lists (unordered & ordered with simple 1-level indented sub-bullets)
    if (trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
      const isOrdered = /^\d+\.\s/.test(trimmed);
      const tag = isOrdered ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        const curTrim = cur.trim();
        if (!curTrim) break;
        const topMatch = isOrdered
          ? cur.match(/^\d+\.\s+(.+)$/)
          : cur.match(/^-\s+(.+)$/);
        if (topMatch) {
          items.push({ html: formatInlineMarkdown(topMatch[1]), sub: [] });
          i += 1;
          continue;
        }
        const subMatch = cur.match(/^\s{2,}-\s+(.+)$/);
        if (subMatch && items.length > 0) {
          items[items.length - 1].sub.push(formatInlineMarkdown(subMatch[1]));
          i += 1;
          continue;
        }
        break;
      }
      const listHtml = items
        .map((it) => {
          const subHtml =
            it.sub.length > 0
              ? `<ul>${it.sub.map((s) => `<li>${s}</li>`).join('')}</ul>`
              : '';
          return `<li>${it.html}${subHtml}</li>`;
        })
        .join('');
      bodyChunks.push(`<${tag}>${listHtml}</${tag}>`);
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      lines[i].trim() !== '---' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('> ') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('<!--') &&
      !lines[i].trim().startsWith('- ') &&
      !/^\d+\.\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('$$')
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    bodyChunks.push(`<p>${formatInlineMarkdown(paraLines.join(' '))}</p>`);
  }

  return { title, subtitle, toc, bodyHtml: bodyChunks.join('\n') };
}

function buildPrintableHtml({ docMeta, parsed, docsVersion, updatedAt, appVersion, status }) {
  const tocH2 = parsed.toc.filter((t) => t.level === 2);
  const tocHtml = tocH2
    .map(
      (item, idx) => `
      <a class="toc-item" href="#${item.id}">
        <span class="toc-num">${String(idx + 1).padStart(2, '0')}</span>
        <span class="toc-label">${escapeHtml(item.text.replace(/^\d+\.\s*/, ''))}</span>
      </a>`
    )
    .join('');

  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(parsed.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: A4;
      margin: 18mm 14mm 18mm 14mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #162230;
      font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
      font-size: 10.5pt;
      line-height: 1.68;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Cover Block */
    .cover {
      border: 1.5px solid #c9d9ea;
      background: linear-gradient(155deg, #0d1a2b 0%, #142b45 65%, #1c3a5c 100%);
      color: #eef5fc;
      border-radius: 14px;
      padding: 26px 28px;
      margin-bottom: 18px;
    }
    .cover-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .cover-brand-text {
      font-size: 10pt;
      letter-spacing: 0.04em;
      color: #9dc5eb;
      font-weight: 600;
    }
    .cover h1 {
      margin: 0 0 8px 0;
      font-size: 21pt;
      line-height: 1.25;
      font-weight: 700;
      color: #ffffff;
    }
    .cover-sub {
      margin: 0 0 18px 0;
      font-size: 10.5pt;
      color: #cfe2f5;
    }
    .cover-meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      border-top: 1px solid rgba(157, 197, 235, 0.28);
      padding-top: 14px;
      font-size: 8.5pt;
    }
    .meta-cell span {
      display: block;
      color: #9dc5eb;
      font-size: 7.5pt;
      margin-bottom: 2px;
    }
    .meta-cell strong {
      color: #ffffff;
      font-weight: 600;
    }

    /* Table of Contents */
    .toc-box {
      border: 1px solid #d7e2ee;
      background: #f8fafd;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
      break-inside: avoid;
    }
    .toc-title {
      margin: 0 0 10px 0;
      font-size: 10.5pt;
      font-weight: 700;
      color: #133353;
    }
    .toc-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 18px;
    }
    .toc-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      text-decoration: none;
      color: #243b53;
      font-size: 9.2pt;
      padding: 2px 0;
      border-bottom: 1px dotted #d9e3ee;
    }
    .toc-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5pt;
      font-weight: 600;
      color: #2a659e;
      flex-shrink: 0;
    }

    /* Typography */
    h2 {
      margin: 22px 0 9px 0;
      padding-bottom: 5px;
      border-bottom: 2px solid #2b649b;
      font-size: 13.5pt;
      line-height: 1.35;
      color: #0e2a47;
      break-after: avoid;
    }
    h3 {
      margin: 14px 0 6px 0;
      font-size: 11pt;
      line-height: 1.4;
      color: #1c4a78;
      break-after: avoid;
    }
    p {
      margin: 0 0 8px 0;
      text-align: justify;
    }
    ul, ol {
      margin: 4px 0 10px 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 4.5px;
    }
    li > ul {
      margin-top: 4px;
      margin-bottom: 4px;
    }
    code {
      font-family: 'JetBrains Mono', monospace;
      font-variant-ligatures: none;
      font-size: 8.5pt;
      background: #eff4fa;
      color: #143d66;
      border: 1px solid #d4e0ec;
      padding: 0.5px 4px;
      border-radius: 4px;
      overflow-wrap: break-word;
      word-break: normal;
    }
    sub {
      font-size: 72%;
      line-height: 0;
      vertical-align: -0.22em;
    }
    .code-block {
      background: #0f1b2b;
      color: #d6e4f2;
      padding: 10px 12px;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-variant-ligatures: none;
      font-size: 8.5pt;
      line-height: 1.5;
      overflow-x: auto;
      break-inside: avoid;
      margin: 10px 0;
    }
    .code-block code {
      background: none;
      border: none;
      color: inherit;
      padding: 0;
    }
    .doc-callout {
      margin: 10px 0 12px 0;
      padding: 10px 14px;
      border-left: 4px solid #2b649b;
      background: #f2f6fb;
      border-radius: 0 8px 8px 0;
      font-size: 9.5pt;
      color: #21374d;
      break-inside: avoid;
    }
    .doc-callout p:last-child { margin-bottom: 0; }

    /* Tables */
    .table-wrap {
      margin: 10px 0 14px 0;
      break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.6pt;
      line-height: 1.48;
      table-layout: auto;
    }
    th, td {
      border: 1px solid #cddae8;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: break-word;
    }
    td:first-child, td:nth-child(2) {
      white-space: normal;
    }
    th {
      background: #e9f0f8;
      color: #123354;
      font-weight: 700;
    }
    tr:nth-child(even) td {
      background: #fafcff;
    }

    /* Math formulas */
    .math-block {
      margin: 10px 0 12px 0;
      padding: 10px 14px;
      border: 1px solid #d6e1ec;
      background: #f9fbfe;
      border-radius: 8px;
      text-align: center;
      font-size: 10pt;
      break-inside: avoid;
    }
    .math-inline {
      font-family: 'Noto Sans TC', serif;
      white-space: nowrap;
    }
    .math-op, .math-text {
      font-style: normal;
      font-family: 'JetBrains Mono', 'Noto Sans TC', monospace;
      font-size: 9pt;
    }
    .math-frac {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      vertical-align: middle;
      margin: 0 3px;
      font-size: 8.8pt;
      line-height: 1.25;
    }
    .math-frac > span:first-child {
      border-bottom: 1px solid #1e3348;
      padding: 0 4px 1px 4px;
    }
    .math-frac > span:last-child {
      padding: 1px 4px 0 4px;
    }
    .math-piecewise {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-align: left;
    }
    .math-lhs { font-style: italic; font-weight: 600; }
    .math-brace { font-size: 28pt; font-weight: 300; line-height: 1; color: #365778; }
    .math-cases { display: flex; flex-direction: column; gap: 4px; font-size: 9.2pt; }
    .math-cond { color: #435b73; font-size: 8.8pt; }

    /* Figures & Screenshots */
    .doc-figure {
      margin: 12px 0 15px 0;
      padding: 9px;
      border: 1px solid #cddae8;
      border-radius: 10px;
      background: #f8fafd;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .figure-frame {
      border: 1px solid #b8c9dc;
      border-radius: 7px;
      overflow: hidden;
      background: #0b111a;
      display: flex;
      justify-content: center;
    }
    .figure-frame img {
      display: block;
      width: 100%;
      max-height: 92mm;
      object-fit: contain;
    }
    .doc-figure figcaption {
      margin-top: 7px;
      font-size: 8.7pt;
      line-height: 1.45;
      color: #253d56;
      font-weight: 500;
    }
    .fig-meta {
      color: #637991;
      font-weight: 400;
      font-family: 'JetBrains Mono', monospace;
      font-size: 7.8pt;
    }
    .diagram-badge {
      display: inline-block;
      margin-bottom: 6px;
      padding: 2px 8px;
      border-radius: 4px;
      background: #e2ecf6;
      color: #1b4670;
      font-size: 8pt;
      font-weight: 600;
    }
    .draft-box {
      padding: 26px;
      text-align: center;
      background: #edf2f7;
      color: #4a6078;
      border: 1px dashed #8aa4bf;
      border-radius: 6px;
      font-size: 9.5pt;
    }
    .doc-link {
      color: #1f5c99;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="cover-brand">
      ${getBrandCoverSvg()}
      <div>
        <div class="cover-brand-text">MOONCODE 月海程式學習室 · 正式系統文件</div>
        <div style="font-size:8.5pt;color:#a9c3de;">C# OOP、低耦合高內聚與 MVC 架構自學系統</div>
      </div>
    </div>
    <h1>${escapeHtml(parsed.title)}</h1>
    <p class="cover-sub">${escapeHtml(parsed.subtitle || docMeta.subtitle)}</p>
    <div class="cover-meta">
      <div class="meta-cell">
        <span>文件版本</span>
        <strong>v${escapeHtml(docsVersion)}</strong>
      </div>
      <div class="meta-cell">
        <span>更新日期</span>
        <strong>${escapeHtml(updatedAt)}</strong>
      </div>
      <div class="meta-cell">
        <span>對應程式版本</span>
        <strong>${escapeHtml(appVersion)}</strong>
      </div>
      <div class="meta-cell">
        <span>文件狀態</span>
        <strong>${status === 'published' ? '已驗證定稿' : '建置暫稿'}</strong>
      </div>
    </div>
  </section>

  <section class="toc-box">
    <h2 class="toc-title" style="border:none;margin-top:0;padding:0;font-size:10.5pt;">文件章節目錄</h2>
    <div class="toc-grid">${tocHtml}</div>
  </section>

  <main>
    ${parsed.bodyHtml}
  </main>
</body>
</html>`;
}

async function main() {
  const draftMode = process.argv.includes('--draft');
  const docsConfig = JSON.parse(fs.readFileSync(DOCS_CONFIG_PATH, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

  fs.mkdirSync(OUTPUT_DOCS_DIR, { recursive: true });

  const screenshotManifest = fs.existsSync(SCREENSHOT_MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(SCREENSHOT_MANIFEST_PATH, 'utf8'))
    : null;

  const screenshotMap = new Map();
  if (screenshotManifest && Array.isArray(screenshotManifest.screenshots)) {
    for (const item of screenshotManifest.screenshots) {
      const abs = path.resolve(SCREENSHOTS_DIR, item.fileName);
      if (fs.existsSync(abs)) {
        const buf = fs.readFileSync(abs);
        screenshotMap.set(item.id, {
          ...item,
          dataUri: `data:image/jpeg;base64,${buf.toString('base64')}`,
        });
      }
    }
  }

  const { chromium } = loadPlaywright();
  const executablePath = findChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const builtDocs = [];

  try {
    for (const docMeta of docsConfig.documents) {
      const mdPath = path.resolve(ROOT_DIR, docMeta.sourceMarkdown);
      const mdText = fs.readFileSync(mdPath, 'utf8');
      const parsed = parseMarkdownToSectionsHtml(
        mdText,
        (id) => screenshotMap.get(id) ?? null,
        draftMode
      );

      const status = draftMode ? 'draft' : 'published';
      const html = buildPrintableHtml({
        docMeta,
        parsed,
        docsVersion: docsConfig.docsVersion,
        updatedAt: docsConfig.updatedAt,
        appVersion: pkg.version,
        status,
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.addEventListener('load', resolve, { once: true });
                  img.addEventListener('error', resolve, { once: true });
                })
          )
        );
      });

      const headerTemplate = `
        <div style="width:100%;font-family:'Noto Sans TC',sans-serif;font-size:8px;color:#5c728a;padding:0 14mm;display:flex;justify-content:space-between;align-items:center;">
          <span>MoonCode 月海程式學習室 · ${docMeta.title}</span>
          <span>v${docsConfig.docsVersion} (${docsConfig.updatedAt})</span>
        </div>`;

      const footerTemplate = `
        <div style="width:100%;font-family:'Noto Sans TC',sans-serif;font-size:8px;color:#5c728a;padding:0 14mm;display:flex;justify-content:space-between;align-items:center;">
          <span>實機截圖與程式原始碼同步核對 · 僅供本機／授權學習使用</span>
          <span>第 <span class="pageNumber"></span> / <span class="totalPages"></span> 頁</span>
        </div>`;

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: {
          top: '18mm',
          right: '14mm',
          bottom: '18mm',
          left: '14mm',
        },
      });
      await page.close();

      const pdfCheck = verifyPdfBuffer(pdfBuffer);
      if (!pdfCheck.ok) {
        throw new Error(`產製 ${docMeta.fileName} 失敗：${pdfCheck.reason}`);
      }

      const outPath = path.resolve(ROOT_DIR, docMeta.outputPdf);
      fs.writeFileSync(outPath, pdfBuffer);

      builtDocs.push({
        id: docMeta.id,
        title: docMeta.title,
        subtitle: docMeta.subtitle,
        description: docMeta.description,
        fileName: docMeta.fileName,
        downloadFileName: docMeta.downloadFileName,
        pageCount: pdfCheck.pageCount,
        byteSize: pdfBuffer.length,
        sha256: sha256Buffer(pdfBuffer),
      });

      console.log(
        `Built ${docMeta.outputPdf} (${pdfCheck.pageCount} pages, ${pdfBuffer.length} bytes, status=${status})`
      );
    }
  } finally {
    await browser.close();
  }

  const sourceFingerprint = computeFilesBundleFingerprint(ROOT_DIR, docsConfig.sourceTrackedFiles);
  const docsFingerprint = computeFilesBundleFingerprint(ROOT_DIR, [
    ...docsConfig.docSourceFiles,
    ...builtDocs.map((d) => `public/system-docs/${d.fileName}`),
  ]);
  const status = draftMode ? 'draft' : 'published';

  const runtimeManifest = {
    format: 'mooncode.system_docs_manifest',
    schemaVersion: 1,
    appVersion: pkg.version,
    docsVersion: docsConfig.docsVersion,
    updatedAt: docsConfig.updatedAt,
    status,
    sourceFingerprint,
    docsFingerprint,
    documents: builtDocs,
  };

  fs.writeFileSync(RUNTIME_MANIFEST_PATH, `${JSON.stringify(runtimeManifest, null, 2)}\n`, 'utf8');

  const docsMap = Object.fromEntries(
    builtDocs.map((d) => [
      d.id,
      {
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        pageCount: d.pageCount,
        byteSize: d.byteSize,
        sha256: d.sha256,
      },
    ])
  );

  const tsContent = `// AUTO-GENERATED BY scripts/docs/build-docs.mjs — DO NOT EDIT MANUALLY.
export interface DocFileExpectation {
  id: 'system-specification' | 'user-guide';
  title: string;
  fileName: string;
  pageCount: number;
  byteSize: number;
  sha256: string;
}

export interface DocsExpectation {
  appVersion: string;
  docsVersion: string;
  updatedAt: string;
  status: 'draft' | 'published';
  sourceFingerprint: string;
  docsFingerprint: string;
  documents: Record<'system-specification' | 'user-guide', DocFileExpectation>;
}

export const DOCS_EXPECTATION: DocsExpectation = ${JSON.stringify(
    {
      appVersion: pkg.version,
      docsVersion: docsConfig.docsVersion,
      updatedAt: docsConfig.updatedAt,
      status,
      sourceFingerprint,
      docsFingerprint,
      documents: docsMap,
    },
    null,
    2
  )};
`;

  fs.writeFileSync(GENERATED_EXPECTATION_PATH, tsContent, 'utf8');
  console.log(
    `Updated ${RUNTIME_MANIFEST_PATH} and ${GENERATED_EXPECTATION_PATH} (source=${sourceFingerprint}, docs=${docsFingerprint}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
