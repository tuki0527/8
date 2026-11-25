# MoonCode 開發與系統文件持續維護規範

## 系統文件與截圖強制同步規則（必讀）

每次使用者提出的功能或流程修改，只要影響到以下任一項目：
- 新增或移除功能、頁面、路由（`src/App.tsx`）
- 改變整體操作步驟、漢堡導覽選單（`src/components/AppShell.tsx`）、按鈕文字或畫面呈現
- 改變 AI 互動工作台任務、提示詞或 JSON 驗證契約（`src/domain/aiRoundtrip.ts`）
- 改變題組測驗、計時、錯題本或掌握指標公式（`src/domain/quizEngine.ts`、`src/domain/mastery.ts`）
- 改變資料格式、本機儲存、StudyBundle、API、或 GitHub 同步／復原流程（`src/storage/*`、`src/sync/*`、`server/*`、`workers/*`）

開發人員與所有協作 AI **都必須在同一輪修改中**同步執行以下步驟，不得僅改程式而留下過期文件或舊截圖：

1. **檢視差異與路由覆蓋**：對照 `docs/docs-config.json`（`sourceTrackedFiles` 與 `routeCoverage`）與 `src/App.tsx`，列出受本次變動影響的功能章節與截圖 ID。
2. **同步更新 Markdown 文件與變更紀錄**：
   - 更新 `docs/system-specification.md`（系統規格、資料結構、公式、邊界與外部依賴）。
   - 更新 `docs/user-guide.md`（以實際繁體中文按鈕與操作順序更新步驟與圖說）。
   - 若屬功能／結構變動，遞增 `docs/docs-config.json` 之 `docsVersion` 與 `updatedAt`（並同步更新下載檔名版本），同時於 `docs/CHANGELOG.md` 新增本次更新紀錄。
3. **實機重新擷取與目視確認**：
   - 先執行 `npm run build` 產生最新 `dist/`。
   - 執行 `npm run docs:capture`（以隔離測試環境與瀏覽器 Context 實機操作擷取 `/docs/screenshots/*.jpg`，嚴禁混用使用者個人學習資料或使用 AI 生成假介面）。
   - 以人工／工具實際查看新截圖，確認按鈕名稱、狀態文字與版面無溢出或截斷。
4. **重新產製 PDF 與更新防呆指紋**：
   - 執行 `npm run docs:build`，產生最新 `public/system-docs/system-specification.pdf`、`public/system-docs/user-guide.pdf`、`public/system-docs/manifest.json` 與 `src/generated/docsExpectation.ts`。
   - 再次執行 `npm run build` 並（若文件頁畫面版本資訊變動）重新擷取 `14_system_docs`、執行 `npm run docs:build` 與 `npm run build`，確保打包入前端的 `DOCS_EXPECTATION` 與靜態資產 PDF 完全一致。
   - **實際開啟產出的兩份 PDF 逐頁檢視**文字、排版、公式、圖表與截圖是否清晰無錯字／截斷。
5. **執行強制檢核與交付邊界**：
   - 執行 `npm run docs:verify` 與 `npm run preflight`（`typecheck`、`build`、`wrangler deploy --dry-run`、`docs:verify`）及 `npm test`。若核心追蹤檔案有變動而未更新文件與重新建置 PDF，`docs:verify` 將明確失敗以阻擋過期文件上線。
   - 除非使用者明確要求，否則**不要自動執行 `git commit`、`git push`、建立 PR 或部署上線**；交由使用者自行測試確認。
