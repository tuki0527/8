import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT_DIR = process.cwd();
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const SCREENSHOTS_DIR = path.resolve(ROOT_DIR, 'docs/screenshots');
const SCREENSHOT_MANIFEST_PATH = path.resolve(SCREENSHOTS_DIR, 'manifest.json');
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
      // try next candidate
    }
  }
  throw new Error(
    '找不到 playwright-core / playwright 套件，請先安裝或確認容器內建瀏覽器路徑。'
  );
}

function findChromiumExecutable() {
  for (const exe of CHROMIUM_EXECUTABLE_CANDIDATES) {
    if (exe && fs.existsSync(exe)) {
      return exe;
    }
  }
  return undefined;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function startDistStaticServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
      if (!rel || rel === '') rel = 'index.html';

      if (rel.startsWith('api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            configured: false,
            authenticated: false,
            mode: 'local_only',
            message: '未配置 GitHub App 伺服器環境變數，目前以本機模式運行。',
          })
        );
        return;
      }

      const candidate = path.resolve(distDir, rel);
      const insideDist = candidate.startsWith(distDir + path.sep) || candidate === distDir;

      if (insideDist && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(candidate).pipe(res);
        return;
      }

      if (rel.startsWith('system-docs/')) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const indexHtml = path.resolve(distDir, 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexHtml).pipe(res);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('無法取得靜態預覽伺服器埠號'));
        return;
      }
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function settlePage(page, waitMs = 350) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(waitMs);
}

async function recordScreenshot(page, meta, recordsMap) {
  const fileName = `${meta.id}.jpg`;
  const absPath = path.resolve(SCREENSHOTS_DIR, fileName);
  const buffer = await page.screenshot({
    type: 'jpeg',
    quality: 88,
    fullPage: false,
  });
  fs.writeFileSync(absPath, buffer);
  const entry = {
    id: meta.id,
    fileName,
    route: meta.route,
    viewport: meta.viewportLabel,
    stateDescription: meta.stateDescription,
    capturedAt: new Date().toISOString(),
    byteSize: buffer.length,
    sha256: sha256Buffer(buffer),
  };
  recordsMap.set(meta.id, entry);
  console.log(`Captured ${fileName} (${buffer.length} bytes, route=${meta.route})`);
}

async function openFreshContext(browser, viewport, extra = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    ...extra,
  });
  const page = await context.newPage();
  return { context, page };
}

async function main() {
  if (!fs.existsSync(path.resolve(DIST_DIR, 'index.html'))) {
    throw new Error('找不到 dist/index.html，請先執行 npm run build 後再擷取實機畫面。');
  }

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlySet = onlyArg
    ? new Set(
        onlyArg
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const need = (id) => !onlySet || onlySet.has(id);

  const recordsMap = new Map();
  if (onlySet && fs.existsSync(SCREENSHOT_MANIFEST_PATH)) {
    const prev = JSON.parse(fs.readFileSync(SCREENSHOT_MANIFEST_PATH, 'utf8'));
    for (const item of prev.screenshots ?? []) {
      recordsMap.set(item.id, item);
    }
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const { chromium } = loadPlaywright();
  const executablePath = findChromiumExecutable();
  const { server, baseUrl } = await startDistStaticServer(DIST_DIR);

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // =========================================================================
    // Context A: Clean initial browser storage (Desktop 1440x900)
    // =========================================================================
    const needsContextA =
      need('01_home') ||
      need('16_save_confirm_dialog') ||
      need('17_save_result_banner') ||
      need('02_chapter_slides') ||
      need('03_chapter_rewrite_edit') ||
      need('04_question_bank') ||
      need('09_wrong_book_empty') ||
      need('12_storage_versions') ||
      need('13_settings') ||
      need('14_system_docs');

    if (needsContextA) {
      const { context, page } = await openFreshContext(browser, { width: 1440, height: 900 });
      try {
        await page.goto(`${baseUrl}/#/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('h1', { timeout: 15000 });
        await settlePage(page, 450);

        if (need('01_home')) {
          await recordScreenshot(
            page,
            {
              id: '01_home',
              route: '/',
              viewportLabel: '1440x900',
              stateDescription: '潔淨初始狀態首頁總覽，側欄展開並含「系統文件下載」項目與 9 章課程地圖。',
            },
            recordsMap
          );
        }

        if (need('16_save_confirm_dialog') || need('17_save_result_banner')) {
          await page.getByRole('button', { name: '儲存', exact: true }).click();
          await page.waitForSelector('role=dialog[name="確認儲存"]', { timeout: 10000 });
          await settlePage(page, 250);

          if (need('16_save_confirm_dialog')) {
            await recordScreenshot(
              page,
              {
                id: '16_save_confirm_dialog',
                route: '/ (save confirmation dialog)',
                viewportLabel: '1440x900',
                stateDescription: '點擊頂端「儲存」開啟之確認儲存對話框，顯示本機模式範圍說明與「取消」／「確認儲存」按鈕。',
              },
              recordsMap
            );
          }

          await page
            .getByRole('dialog', { name: '確認儲存' })
            .getByRole('button', { name: '確認儲存', exact: true })
            .click();
          await page.waitForSelector('text=已儲存至本機', { timeout: 10000 });
          await settlePage(page, 300);

          if (need('17_save_result_banner')) {
            await recordScreenshot(
              page,
              {
                id: '17_save_result_banner',
                route: '/ (save result notification)',
                viewportLabel: '1440x900',
                stateDescription: '完成手動儲存確認後顯示之結果通知橫幅（「已儲存至本機」），呈現實際完成時間與關閉按鈕。',
              },
              recordsMap
            );
          }

          // Close banner cleanly before capturing subsequent Context A views
          const dismissBtn = page.getByRole('button', { name: '關閉儲存通知' });
          if (await dismissBtn.isVisible().catch(() => false)) {
            await dismissBtn.click();
          }
        }

        if (need('02_chapter_slides') || need('03_chapter_rewrite_edit')) {
          await page.goto(`${baseUrl}/#/chapters/ch1`, { waitUntil: 'networkidle' });
          await page.waitForSelector('h1', { timeout: 15000 });
          await settlePage(page, 400);

          if (need('02_chapter_slides')) {
            await recordScreenshot(
              page,
              {
                id: '02_chapter_slides',
                route: '/chapters/ch1',
                viewportLabel: '1440x900',
                stateDescription: '第 1 章第 1 頁簡報，顯示核心結論鎖定區、生活比喻邊界、C# 程式碼區塊與步驟模擬推演。',
              },
              recordsMap
            );
          }

          if (need('03_chapter_rewrite_edit')) {
            await page.getByRole('button', { name: /自訂比喻與版面/ }).click();
            await page.waitForSelector('text=受保護欄位與 C# 程式碼已鎖定', { timeout: 10000 }).catch(() => {});
            await settlePage(page, 300);
            await recordScreenshot(
              page,
              {
                id: '03_chapter_rewrite_edit',
                route: '/chapters/ch1 (editing)',
                viewportLabel: '1440x900',
                stateDescription: '展開「自訂比喻與版面」受控改寫表單，僅開放比喻、白話補充、詳盡度與版面切換。',
              },
              recordsMap
            );
          }
        }

        if (need('04_question_bank')) {
          await page.goto(`${baseUrl}/#/bank`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=題庫與測驗入口', { timeout: 15000 });
          await settlePage(page, 350);
          await recordScreenshot(
            page,
            {
              id: '04_question_bank',
              route: '/bank',
              viewportLabel: '1440x900',
              stateDescription: '題庫與測驗入口，呈現 5 欄篩選條件、擴充新題組按鈕與 9 組內建 7+3 種子題組。',
            },
            recordsMap
          );
        }

        if (need('09_wrong_book_empty')) {
          await page.goto(`${baseUrl}/#/wrong-book`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=錯題本與精準複習', { timeout: 15000 });
          await settlePage(page, 350);
          await recordScreenshot(
            page,
            {
              id: '09_wrong_book_empty',
              route: '/wrong-book',
              viewportLabel: '1440x900',
              stateDescription: '潔淨初始狀態錯題本，尚未有答錯紀錄時誠實顯示無錯題紀錄。',
            },
            recordsMap
          );
        }

        if (need('12_storage_versions')) {
          await page.goto(`${baseUrl}/#/storage`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=儲存、版本管理與備份還原', { timeout: 15000 });
          await settlePage(page, 350);
          await recordScreenshot(
            page,
            {
              id: '12_storage_versions',
              route: '/storage',
              viewportLabel: '1440x900',
              stateDescription: '本機模式下之儲存與版本管理頁，顯示 Generation／Epoch、StudyBundle 匯出匯入與清理選項。',
            },
            recordsMap
          );
        }

        if (need('13_settings')) {
          await page.goto(`${baseUrl}/#/settings`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=學習室設定與連線管理', { timeout: 15000 });
          await settlePage(page, 350);
          await recordScreenshot(
            page,
            {
              id: '13_settings',
              route: '/settings',
              viewportLabel: '1440x900',
              stateDescription: '學習室設定與連線管理頁，顯示基本偏好、五時段月海預覽、PWA 安裝說明與 GitHub 本機模式。',
            },
            recordsMap
          );
        }

        if (need('14_system_docs')) {
          await page.goto(`${baseUrl}/#/docs`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=下載系統規格書 PDF', { timeout: 15000 });
          await page
            .waitForFunction(
              () => !document.body.innerText.includes('正在向網站確認文件版本'),
              null,
              { timeout: 10000 }
            )
            .catch(() => {});
          await settlePage(page, 400);
          await recordScreenshot(
            page,
            {
              id: '14_system_docs',
              route: '/docs',
              viewportLabel: '1440x900',
              stateDescription: '系統文件下載頁，顯示版本核對狀態、頁數與檔案大小摘要及兩份 PDF 下載按鈕。',
            },
            recordsMap
          );
        }
      } finally {
        await context.close();
      }
    }

    // =========================================================================
    // Context B: Ephemeral test run (1 intentional wrong MCQ + 6 correct MCQ + 3 short answers)
    // =========================================================================
    const needsContextB =
      need('05_quiz_mcq') ||
      need('06_quiz_short_last') ||
      need('07_quiz_result_pending_ai') ||
      need('08_ai_workbench') ||
      need('10_wrong_book_populated') ||
      need('11_mastery');

    if (needsContextB) {
      const { context, page } = await openFreshContext(browser, { width: 1440, height: 900 });
      try {
        await page.goto(`${baseUrl}/#/bank`, { waitUntil: 'networkidle' });
        await page.waitForSelector('text=第 1 章核心練習', { timeout: 15000 });

        // Click first "開始 10 題測驗" button (ch1 seed set)
        const startButtons = page.getByRole('button', { name: /開始 10 題測驗/ });
        await startButtons.first().click();
        await page.waitForSelector('text=第 1 / 10 題', { timeout: 15000 });

        // Wait ~1.5s so active elapsed timer shows realistic time (e.g. 00:01)
        await settlePage(page, 1400);

        // Answer Q1 intentionally WRONG using unique option text so shuffle never affects it
        await page.locator('label', { hasText: '類別與實例是同一個概念' }).click();
        await settlePage(page, 250);

        if (need('05_quiz_mcq')) {
          await recordScreenshot(
            page,
            {
              id: '05_quiz_mcq',
              route: '/quiz/:testRunId (Q1)',
              viewportLabel: '1440x900',
              stateDescription: '逐題作答介面（單選題第 1/10 題），顯示已點選選項、有效作答計時、暫停按鈕與確認作答按鈕。',
            },
            recordsMap
          );
        }

        await page.getByRole('button', { name: '確認作答並下一題' }).click();

        const mcqCorrectSubstrings = [
          'a.PartySize 為 6，b.PartySize 為 6',
          '允許外部讀取座位數，但限制只有類別自身內部的方法能修改它',
          '寫在帶參數的建構子內，若為空白便擲出 ArgumentException',
          '物件能於方法內同時檢查規則並同步維護相關狀態',
          '在建構過程中擲出 ArgumentOutOfRangeException',
          '原本應負責維護業務規則的領域物件',
        ];

        for (let i = 0; i < mcqCorrectSubstrings.length; i += 1) {
          const qNum = i + 2;
          await page.waitForSelector(`text=第 ${qNum} / 10 題`, { timeout: 10000 });
          await page.locator('label', { hasText: mcqCorrectSubstrings[i] }).click();
          await page.getByRole('button', { name: '確認作答並下一題' }).click();
        }

        const shortAnswers = [
          '類別 (Class) 是定義屬性與方法的型別藍圖，而物件實例 (Instance) 是透過 new 在記憶體配置出的獨立實體；各實例擁有獨立的非靜態欄位空間，因此修改實例 A 通常不會影響實例 B。',
          '應把 guestName 與 partySize 檢查寫在建構子內並搭配 { get; private set; } 限制外部任意改寫，確保物件從誕生起就不存在人數小於等於零的非法狀態。',
          '若外部程式碼直接檢查與修改欄位，會造成規則散落且難維護；收斂為 CheckIn() 與 Cancel() 方法可由物件自身統一驗證狀態轉換條件並保護不變量。',
        ];

        for (let i = 0; i < shortAnswers.length; i += 1) {
          const qNum = i + 8;
          await page.waitForSelector(`text=第 ${qNum} / 10 題`, { timeout: 10000 });
          await page.locator('textarea').fill(shortAnswers[i]);
          await settlePage(page, 250);
          if (qNum === 10) {
            if (need('06_quiz_short_last')) {
              await recordScreenshot(
                page,
                {
                  id: '06_quiz_short_last',
                  route: '/quiz/:testRunId (Q10)',
                  viewportLabel: '1440x900',
                  stateDescription: '第 10/10 題理解作答題畫面，已輸入理解作答並呈現「送出最後一題並查看結果」按鈕。',
                },
                recordsMap
              );
            }
            await page.getByRole('button', { name: '送出最後一題並查看結果' }).click();
          } else {
            await page.getByRole('button', { name: '確認作答並下一題' }).click();
          }
        }

        await page.waitForSelector('text=測驗結果總覽', { timeout: 15000 });
        await settlePage(page, 400);

        if (need('07_quiz_result_pending_ai')) {
          await recordScreenshot(
            page,
            {
              id: '07_quiz_result_pending_ai',
              route: '/quiz/:testRunId/result',
              viewportLabel: '1440x900',
              stateDescription: '完成 10 題測驗之結果總覽（隔離測試紀錄），顯示單選 6/7 分數與 3 題「待 AI 判讀（未判讀不算答錯）」提示。',
            },
            recordsMap
          );
        }

        if (need('08_ai_workbench')) {
          await page.goto(`${baseUrl}/#/ai?task=evaluate_short_answers`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=AI 互動工作台', { timeout: 15000 });
          await page.getByRole('button', { name: '產生提示詞與 Request ID' }).click();
          await page.waitForSelector('text=提示詞純文字預覽', { timeout: 10000 }).catch(() => {});
          await settlePage(page, 350);
          await recordScreenshot(
            page,
            {
              id: '08_ai_workbench',
              route: '/ai',
              viewportLabel: '1440x900',
              stateDescription: 'AI 互動工作台實機畫面，呈現 5 步驟 TXT→JSON 導引、任務 B 已產生提示詞與「下載提示詞（.txt）」主按鈕、.json 檔案匯入區與本機 Request ID 紀錄。',
            },
            recordsMap
          );
        }

        if (need('10_wrong_book_populated')) {
          await page.goto(`${baseUrl}/#/wrong-book`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=移出複習清單 (保留統計)', { timeout: 15000 });
          await settlePage(page, 350);
          await recordScreenshot(
            page,
            {
              id: '10_wrong_book_populated',
              route: '/wrong-book (with 1 sample wrong MCQ)',
              viewportLabel: '1440x900',
              stateDescription: '錯題本有錯題紀錄實機畫面（隔離測試資料），顯示當時回答與正解對照、「移出複習清單 (保留統計)」、「重置此筆作答紀錄」與「重練原題組」。',
            },
            recordsMap
          );
        }

        if (need('11_mastery')) {
          await page.goto(`${baseUrl}/#/mastery`, { waitUntil: 'networkidle' });
          await page.waitForSelector('text=概念掌握度與間隔複習', { timeout: 15000 });
          await settlePage(page, 350);
          await recordScreenshot(
            page,
            {
              id: '11_mastery',
              route: '/mastery (after 1 isolated run)',
              viewportLabel: '1440x900',
              stateDescription: '概念掌握度頁實機畫面（隔離單次測驗資料），已測概念顯示「（暫估）」與速度資料尚不足，未測概念與章節誠實顯示「待測」。',
            },
            recordsMap
          );
        }
      } finally {
        await context.close();
      }
    }

    // =========================================================================
    // Context C: Mobile viewport (390x844) with hamburger drawer open
    // =========================================================================
    if (need('15_mobile_nav_docs')) {
      const { context, page } = await openFreshContext(
        browser,
        { width: 390, height: 844 },
        { hasTouch: true, isMobile: true }
      );
      try {
        await page.goto(`${baseUrl}/#/docs`, { waitUntil: 'networkidle' });
        await page.waitForSelector('text=下載系統規格書 PDF', { timeout: 15000 });
        await page
          .waitForFunction(
            () => !document.body.innerText.includes('正在向網站確認文件版本'),
            null,
            { timeout: 10000 }
          )
          .catch(() => {});
        await page.getByRole('button', { name: '切換章節與功能導覽選單' }).click();
        await page.waitForSelector('role=dialog[name="章節導覽抽屜"]', { timeout: 10000 });
        await settlePage(page, 350);

        const overflowCheck = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        if (overflowCheck.scrollWidth > overflowCheck.innerWidth) {
          throw new Error(
            `手機版 390px 偵測到橫向溢出：scrollWidth=${overflowCheck.scrollWidth} > innerWidth=${overflowCheck.innerWidth}`
          );
        }

        await recordScreenshot(
          page,
          {
            id: '15_mobile_nav_docs',
            route: '/docs (mobile drawer open)',
            viewportLabel: '390x844',
            stateDescription: '手機窄螢幕開啟漢堡導覽抽屜實機畫面，顯示「系統文件下載」入口並確認無任何橫向溢出。',
          },
          recordsMap
        );
      } finally {
        await context.close();
      }
    }

    const sortedScreenshots = Array.from(recordsMap.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    const manifest = {
      format: 'mooncode.screenshots_manifest',
      schemaVersion: 1,
      appVersion: pkg.version,
      capturedAt: new Date().toISOString(),
      screenshots: sortedScreenshots,
    };

    fs.writeFileSync(SCREENSHOT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Updated ${SCREENSHOT_MANIFEST_PATH} with ${sortedScreenshots.length} screenshots.`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
