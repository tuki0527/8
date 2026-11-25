# MoonCode 系統文件變更紀錄 (Documentation Changelog)

本檔案記錄 `系統規格書` 與 `使用操作手冊` 的對應版本、截圖核對狀態與功能變更明細。

---

## v1.3.0（2026-11-25）

### 對應程式基準與功能更新
- **頂端「儲存」確認與真實結果回饋**（`src/components/SaveConfirmModal.tsx`、`src/components/AppShell.tsx`、`src/context/StudyContext.tsx`、`src/storage/studyStore.ts`）：
  - 點擊頂端 **「儲存」** 先開啟 **「確認儲存」** 對話框，依目前真實狀態（「本機模式」、「已完成授權並可同步雲端」、「離線或連線暫不可用」）說明實際影響範圍；**「取消」** 只中止本次手動儲存且不呼叫 `handlePrimarySave`。
  - **「確認儲存」** 鎖定重複點擊並顯示「儲存中…」，於完成本機 IndexedDB 回讀確認（更新 `lastSavedAt`）及有需要時的雲端同步後，於頁面顯示具無障礙朗讀屬性的結果橫幅，明確區分「已儲存至本機」、「已儲存至本機並完成同步」、「已儲存至本機，目前尚未同步（含原因與重試）」與「儲存失敗」，同時保留測驗逐題等背景自動保存。
- **AI 工作台改以 `.txt` 提示詞檔案下載與 `.json` 附件匯入為主流程**（`src/features/AiWorkbenchPage.tsx`、`src/domain/aiRoundtrip.ts`）：
  - 明確區分 **「送給 ChatGPT：提示詞 TXT」** 與 **「從 ChatGPT 帶回網站：回覆 JSON」** 五步驟流程，並提供主按鈕 **「下載提示詞（.txt）」** 輸出純 UTF-8 純文字檔（未產生有效請求時維持停用）。
  - 任務 A、B、C 提示詞均要求 ChatGPT 優先回傳可下載之純 UTF-8 `.json` 檔案附件；重覆下載同一請求不會建立新 `requestId`，唯主動點擊 **「重新產生（建立新 Request ID）」** 時才新增請求，並維持各 `requestId` 狀態（`已套用`／`待回覆`）與重複匯入去重彼此獨立。

### 截圖與圖資更新紀錄
- 新增實機截圖 `16_save_confirm_dialog`（「確認儲存」對話框）與 `17_save_result_banner`（完成儲存通知橫幅），並全面重新擷取新版 `08_ai_workbench`、`12_storage_versions`、`14_system_docs`、`15_mobile_nav_docs` 等畫面；完整清單與 SHA-256 記錄於 `docs/screenshots/manifest.json`。

### 驗證範圍
- [x] 本機儲存確認對話框、取消／確認／重複鎖定、模擬連線與同步失敗區分、AI 三任務 `.txt` 下載內容與不重複建立 `requestId`、`.json` 匯入去重與獨立狀態均已完成單元測試、隔離瀏覽器實機操作與文件核對。
- [ ] 真實外部 ChatGPT Plus 網頁對話產檔與已授權 GitHub App 線上環境推送仍依賴外部憑證／帳號環境，未在無憑證環境宣稱已聯網成功。

---

## v1.2.0（2026-11-24）

### 對應程式基準
- `package.json` 版本：`1.0.0`（統一 `npm` + `package-lock.json`、支援 Cloudflare Workers Free + Static Assets 部署預檢）
- 相較先前外部參考版 `1.1.0-e3c5a571` 之對照確認：
  - 新增正式文件路由 `/docs`（「系統文件下載」）於 `src/components/AppShell.tsx` 側欄與手機抽屜「儲存與版本」旁。
  - 下載頁按鈕依最新規格統一為明確名稱：**「下載系統規格書 PDF」** 與 **「下載使用操作手冊 PDF」**。
  - 補齊 `vite.config.ts` 中 PWA `navigateFallbackDenylist` 對 `/system-docs/` 的排除規則與 `NetworkFirst` 快取策略，避免 SPA 回退傳回 HTML，並於前端下載前執行 HTTP 狀態、`Content-Type`、`%PDF-` 檔頭與 SHA-256 校驗。
  - 依 `src/domain/mastery.ts`、`src/domain/quizEngine.ts`、`src/domain/aiRoundtrip.ts`、`src/storage/db.ts` 與 `server/shared/githubSyncHandler.ts` 真實實作重寫規格書與操作手冊，補齊測驗結果頁與手機漢堡選單說明。

### 截圖與圖資更新紀錄
- 本版所有頁面（共 15 張截圖：`01_home` 至 `15_mobile_nav_docs`）皆於隔離本機預覽與無污染瀏覽器環境**全部重新擷取**，因左側導覽列新增「系統文件下載」項目且補入測驗結果待判讀、有錯題狀態、簡報改寫編輯表單與手機版抽屜實景；所有截圖來源、頁面路由、狀態說明與 SHA-256 記錄於 `docs/screenshots/manifest.json`。

### 驗證範圍
- [x] 本機 IndexedDB、7+3 測驗、有效計時、掌握指標公式、Plus 手動 JSON 往返、StudyBundle 匯入匯出、系統文件下載與 PWA 快取排除機制已實測確認。
- [ ] GitHub App 實際遠端 OAuth 授權與跨裝置遠端推送：因尚未填入正式環境 Cloudflare Worker Secrets 與 GitHub App 憑證，於文件與介面如實標示為「待外部設定驗證」。
- [ ] ChatGPT Plus 官方自動連線介面：尚未完成官方資格與連線驗證，維持未啟用標示，並提供完整手動 JSON 往返功能。

---

## v1.1.0-e3c5a571（2026-11-22 · 先前外部參考基準）
- 附於任務參考包之舊版系統規格書（8 頁）、使用操作手冊（10 頁）與 10 張舊版截圖，僅作為本次版面與內容規劃參考；所有圖文已依目前實作全面核對與重製。
