# MoonCode 系統文件變更紀錄 (Documentation Changelog)

本檔案記錄 `系統規格書` 與 `使用操作手冊` 的對應版本、截圖核對狀態與功能變更明細。

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
