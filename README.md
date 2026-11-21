# MoonCode 月海程式學習室

個人專用的 C# 物件導向設計（Object-Oriented Programming, OOP）、類別設計、低耦合高內聚（Low Coupling / High Cohesion）與 MVC 架構互動學習室。支援桌機與手機 375px 響應式版面、離線 PWA 安裝、五時段月海氛圍主題、7+3 固定節奏題組測驗、Plus 手動 JSON 往返 AI 工作流程，以及可選的 GitHub 私有資料倉庫跨裝置同步。

---

## 一、核心邊界與目前已驗證 vs 待外部環境驗證能力

| 項目 | 目前狀態 | 說明 |
| --- | --- | --- |
| 本機離線模式（IndexedDB + 9 章簡報 + 90 題種子題庫） | **已可直接使用** | 無需任何外部帳號或 API 金鑰即可開啟與保存 |
| Plus 手動 JSON 往返 AI 工作台（出題／評閱／簡報改寫） | **已完整實作且可用** | 需手動複製提示詞至 ChatGPT Plus，再貼回或匯入 JSON 驗證套用 |
| 五時段月海動態主題與深海低彩度 C# 語法高亮 | **已實作** | 預設 `Asia/Taipei`，可在設定中切換時區與手動預覽五時段 |
| GitHub App 授權與 `study-data/` 分片同步邏輯 | **後端／測試已實作，待實際憑證驗證** | 需使用者自行建立 GitHub App、私有資料倉庫並填入 Cloudflare Workers / 本機 `.env` Secrets 後於真實帳號驗證 |
| ChatGPT Plus 網頁自動直連（免手動複製貼上） | **未啟用（保留介面）** | 在官方文件、應用資格與真實登入／請求皆未完成驗證前，介面誠實標示為未啟用，絕不偽裝已連線 |

---

## 二、本機開發、型別檢查與測試指令

```bash
# 安裝依賴
npm install

# 1. 本機完整全端預覽（Express + Vite Middleware + 同源 /api/*）
npm run dev

# 2. 純靜態前端開發（僅 Vite，無 /api/* 後端，用於純前端/Pages 驗證）
npm run dev:static

# 型別檢查 / Lint
npm run typecheck
npm run lint

# 執行單元、同步、復原與安全性測試（Vitest + fake-indexeddb）
npm test

# 執行端對端 IndexedDB 學習流程測試
npm run test:e2e

# 執行 5,000 題組 / 50,000 題合成壓力測試基準
npm run benchmark

# 建置正式靜態產物（輸出至 dist/）
npm run build
```

> **重要提醒**：`npm run dev` 會啟動 `server.ts`（port 3000），同源供應 Vite 前端與 `/api/*` 路由；未配置環境變數時，`/api/sync/status` 會安全回傳「本機模式」，不會假裝已同步。

---

## 三、ChatGPT Plus 手動 JSON 往返流程（無須付費 API）

本系統不內建任何付費 AI API，也不使用未經核實的自動化外掛或 iframe 抓取 ChatGPT：

1. 前往網站內 **AI 工作台**：
   - **任務 A**：針對指定章節與弱點概念，產生「7 題單選 + 3 題理解題」命題提示詞。
   - **任務 B**：將已完成測驗的 3 題「待 AI 判讀」理解題打包（含 `requestId`、`answerHash`、`questionVersion` 與 `rubricVersion`）。
   - **任務 C**：針對特定簡報頁，請求改寫生活比喻或版面層級（受保護的程式碼、核心定義與學習目標會嚴格鎖定）。
2. 點擊「複製提示詞」並「另開 ChatGPT Plus 分頁」（`https://chatgpt.com`）貼上送出。
3. 將 ChatGPT 回覆的 JSON 貼回網站或匯入 `.json` 檔案。
4. 網站會先驗證 `requestId`、`baseDatasetEpoch`、`answerHash`、`questionVersion`、7+3 結構與禁用欄位，通過預覽後才寫入本機 IndexedDB。

---

## 四、選配：設定 GitHub 私有資料倉庫跨裝置同步（Workers Free）

若需在手機與桌機間自動同步學習資料，建議使用 **Cloudflare Workers Free + Static Assets**（無需付費 KV、D1 或 Queue）搭配一個獨立的 **GitHub 私有資料倉庫**：

### 1. 建立私有資料倉庫
1. 在 GitHub 建立一個 **Private Repository**（例如 `mooncode-study-data`），**務必勾選 Initialize with a README**（否則空倉庫沒有分支 `HEAD`，Git Data API 無法寫入）。
2. 程式原始碼與學習資料分開存放，本系統只會讀寫該資料倉庫下的 `study-data/` 目錄。

### 2. 建立專用 GitHub App（最小權限）
1. 前往 GitHub `Settings -> Developer settings -> GitHub Apps -> New GitHub App`。
2. **Callback URL**：填入您的網站同源回呼網址，例如：
   - 本機開發：`http://localhost:3000/api/auth/callback`
   - 正式 Cloudflare Worker：`https://<your-worker>.workers.dev/api/auth/callback`
   （也可在網站「設定」頁直接複製目前網址對應的 Callback URL）。
3. **Repository permissions** 僅開啟：
   - **Contents**：`Read and write`
   - **Metadata**：`Read-only`
4. 產生一組 **Private Key (`.pem`)**，並記錄 `App ID`、`Client ID`、`Client Secret`。
5. 將此 GitHub App **Install** 到您剛建立的私有資料倉庫（僅授權該單一資料倉庫），並從安裝網址取得 `GITHUB_APP_INSTALLATION_ID`。
6. 查詢自己的數字型 GitHub User ID（可於 `https://api.github.com/users/<你的帳號>` 查看 `id` 欄位），填入 `ALLOWED_GITHUB_USER_ID`。

### 3. 設定 Cloudflare Workers 或本機 Secrets
- 參考 `wrangler.toml` 與 `.dev.vars.example`（本機測試 Cloudflare Worker 可複製 `.dev.vars.example` 為 `.dev.vars`；Express 本機開發可參考 `.env.example` 建立 `.env`，切勿將含真實憑證的 `.env` 或 `.dev.vars` 提交至 Git）。
- 需設定的秘密環境變數名稱：
  - `GITHUB_APP_ID`
  - `GITHUB_APP_CLIENT_ID`
  - `GITHUB_APP_CLIENT_SECRET`
  - `GITHUB_APP_PRIVATE_KEY`（PEM 內容，換行可寫成 `\n`）
  - `GITHUB_APP_INSTALLATION_ID`
  - `GITHUB_DATA_OWNER`（GitHub 使用者名稱）
  - `GITHUB_DATA_REPO`（私有資料倉庫名稱）
  - `GITHUB_DATA_BRANCH`（預設 `main`）
  - `ALLOWED_GITHUB_USER_ID`（不可變的數字 ID 白名單）
  - `SESSION_SECRET`（至少 32 字元隨機密鑰，用於簽章 HttpOnly Session Cookie）
  - `APP_ORIGIN`（例如 `https://<your-worker>.workers.dev`）
- 部署至 Cloudflare Workers：
  ```bash
  npm run build
  npx wrangler secret put GITHUB_APP_PRIVATE_KEY
  # 依序設定其餘 secrets 後執行：
  npx wrangler deploy
  ```

### 4. 純靜態部署（GitHub Pages）注意事項
若僅將 `dist/` 部署到純靜態空間（例如 GitHub Pages）：
- **可用功能**：完整 9 章教材、離線 PWA、IndexedDB 本機保存、StudyBundle JSON 匯出匯入與 Plus 手動 AI JSON 往返皆完全可用。
- **不可用功能**：純靜態環境沒有安全保管 GitHub App 私鑰的後端，無法直接執行 `/api/sync/*` 自動 GitHub 同步，頁面會誠實維持「本機模式」。

---

## 五、手機使用與 PWA 安裝
- **Android / 桌面 Chrome／Edge**：開啟網站後可於網址列或「設定」頁點擊「安裝 MoonCode 至主畫面」。
- **iOS Safari**：點擊 Safari 下方「分享」按鈕 -> 「加入主畫面」即可全螢幕離線使用；Service Worker 僅快取靜態資源與教材，不會快取 `/api/*`。
- **資料格式與復原詳見**：[DATA_FORMAT.md](./DATA_FORMAT.md) 與 [RECOVERY.md](./RECOVERY.md)。
