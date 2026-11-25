# MoonCode 月海程式學習室｜系統規格書

> 產品行為、資料結構、演算法公式與維護基準（C# OOP & MVC）

---

## 1. 產品定位與適用版本

**MoonCode 月海程式學習室**（名稱可於設定頁自訂，預設 `MoonCode 月海程式學習室`）是一套為個人自用設計的互動式程式設計學習網站，協助已具備變數、判斷式與函式基礎的讀者，透過手機與電腦掌握 **C# 物件導向設計（Object-Oriented Programming, OOP）**、類別設計、**高內聚低耦合（High Cohesion / Low Coupling）**、**依賴注入（Dependency Injection, DI）** 與 **MVC（Model-View-Controller）** 架構。

- **教學語言與術語**：全面採用繁體中文與臺灣常見技術用語，專有名詞於首次出現時附上英文對照；教學程式碼固定採用 **C#**（不以 Unity 專屬 API 作為基礎）。
- **本文件對應基準**：`package.json` 版本 `1.0.0`、文件版本 `v1.3.0`（更新日期 `2026-11-25`），內容依目前實際專案原始碼查證撰寫；截圖均於隔離的本機預覽與測試環境實機擷取，不暴露使用者個人作答紀錄、帳號或憑證。

<!-- FIGURE: 01_home | 圖 1：首頁總覽實機畫面（潔淨初始狀態），顯示學習導覽選單、月海橫幅、學習摘要卡、複習建議與 9 章課程地圖。 -->

---

## 2. 系統功能模組與導覽架構

前端採用 **React 19 + TypeScript + Vite 8 + Tailwind CSS 4**，路由採 `HashRouter` 以保留靜態資產空間部署相容性；後端可雙軌運行於 **Cloudflare Workers Free + Static Assets**（正式公開 HTTPS 部署）或本機 **Express + Vite Middleware**（開發預覽），僅 `/api/*` 經由程式邏輯處理授權與 GitHub 同步，其餘靜態資源直接供應。

| 模組與路由 | 對應頁面元件 | 核心責任與執行邊界 |
| --- | --- | --- |
| 首頁總覽（`/`） | `HomePage` | 顯示繼續學習／未完成測驗捷徑、已完成題組數、待 AI 評閱題數、待複習錯題、本機／同步狀態與 9 章地圖。 |
| 章節簡報（`/chapters/:chapterId`） | `ChapterSlidesPage` | 呈現 9 章共 55 頁簡報、深海護眼 C# 程式碼、步驟模擬／結果推演，以及受控比喻／呈現改寫。 |
| 題庫瀏覽（`/bank`） | `QuestionBankPage` | 依章節、概念、難度、來源與作答狀態篩選 7+3 題組（分頁每頁 20 組），啟動或繼續 10 題測驗，並支援 Tombstone 移除。 |
| 逐題測驗（`/quiz/:testRunId`） | `QuizRunnerPage` | 固定一題一頁顯示、鎖定已送出題目、記錄 `activeElapsedMs` 與 `wallElapsedMs`，處理暫停與背景中斷。 |
| 測驗結果（`/quiz/:testRunId/result`） | `QuizResultPage` | 顯示單選題即時成績、標示「待 AI 判讀」理解題、導向 AI 工作台批次批改與題目品質回報。 |
| 錯題本（`/wrong-book`） | `WrongBookPage` | 僅收錄已評閱且答錯題目；提供重練、篩選、「移出複習清單（保留統計）」與「重置此筆作答紀錄」。 |
| 掌握度（`/mastery`） | `MasteryPage` | 依可解釋公式計算 26 項概念與 9 章掌握指標 `M`、標示「待測」與「（暫估）」，並輸出 1/3/7/14 天間隔複習排程。 |
| AI 工作台（`/ai`） | `AiWorkbenchPage` | 提供 Plus 手動 JSON 往返三任務（出題、批改 3 題理解題、改寫簡報）；官方自動連線介面維持明確未啟用狀態。 |
| 儲存與版本（`/storage`） | `StorageVersionsPage` | 顯示本機 IndexedDB、同步世代與 Epoch、StudyBundle 完整備份匯入／匯出、正向復原、Reachability GC 與章節封存。 |
| 系統文件下載（`/docs`） | `SystemDocsPage` | 向靜態清單核對文件版本後，提供系統規格書與使用操作手冊 PDF 下載、離線提示與檔頭／雜湊驗證。 |
| 設定（`/settings`） | `SettingsPage` | 管理 localStorage 偏好（名稱、字級、時區、去重題數、五時段月海氛圍、減少動態）、PWA 安裝引導與 GitHub App 授權狀態。 |

導覽由 `AppShell` 統一控管：電腦版點擊左上角漢堡按鈕可展開或收合左側固定側欄（偏好保存於 `settings.sidebarOpen`）；手機版點擊漢堡按鈕開啟全高抽屜，選取任一頁面或章節後自動收起抽屜，並透過 `overflow-x: clip` 防止 375px 窄螢幕橫向溢出。

<!-- DIAGRAM: system_architecture | 圖 2（概念架構圖）：MoonCode 前端模組、本機 IndexedDB 主存、同源 `/api/*` Worker 與外部服務邊界（標示為結構示意圖）。 -->

---

## 3. 教材結構與簡報安全改寫規則

全套教材包含 **第 1 至第 9 章、26 項核心概念、55 頁規範簡報**（第 1–8 章各 6 頁、第 9 章綜合小案例 7 頁），搭配 9 組內建種子題組（共 90 題）。

每張 `CanonicalSlide` 皆帶有穩定 `slideId` 與 `contentVersion`，將內容嚴格切分為「原版核心鎖定區」與「可安全改寫區」：

| 區塊類型 | 欄位與內容 | 改寫與保護規則 |
| --- | --- | --- |
| 原版核心鎖定區（`locked` + `corePoint`） | `corePoint`、核心定義 `definition`、關鍵名詞對照 `termMappings`、C# 程式碼 `code`、預期行為 `expectedBehavior`、學習目標 `learningObjectives`、判分依據 `rubricBasis` | 系統禁止使用者表單與 AI 匯入修改。若 AI 回覆 JSON 試圖夾帶 `LOCKED_SLIDE_KEYS` 任一欄位，驗證層將直接拒絕套用。 |
| 可編輯呈現區（`editable`） | 生活比喻（`analogy.story`、`mapping`、`boundary`）、白話補充說明 `plainExplanation`、詳盡層級 `detailLevel`（`concise`／`standard`／`detailed`）、版面布局 `layoutVariant`（`split_code`／`focused_concept`／`comparison_columns`） | 使用者可於「自訂比喻與版面」微調，或經 AI 工作台任務 C 產出 `SlideVariant` 獨立保存，絕不覆蓋原版教材，隨時可切換「原版教材」或建立 `revert_variant` Tombstone 還原。 |

簡報右側程式碼區塊固定使用深海低彩度護眼藍青與柔琥珀配色（`--mc-code-*` CSS 變數），與五時段海面色溫變化解耦。部分簡報內建 **「步驟模擬／結果推演」**，介面明確註記為預定義步驟模擬，供觀察物件配置與 MVC 呼叫流程，**不在瀏覽器端編譯或執行真實 C# 程式**。

<!-- FIGURE: 02_chapter_slides | 圖 3：第 1 章簡報頁面，左側呈現核心結論鎖定區與生活比喻／適用邊界，右側顯示 C# 程式碼與步驟模擬／結果推演。 -->

---

## 4. 題組、7+3 作答與評閱規則

每次出題與測驗皆以 **「題組 QuestionSet」** 為單位，每組強制嚴格包含 **10 題**：**7 題單選題**（`single_choice`，4 個不重複選項）與 **3 題文字理解題**（`short_answer`），每題必對應已存在的 `primaryConceptId`。

1. **題組快照不可變性**：建立 `TestRun` 時，系統將當時題幹、選項洗牌對應（`shuffledToOriginalIndices`、`correctShuffledIndex`）與理解題評閱基準（`rubricVersion`、`requiredPoints`、`coreMisconceptions`、`acceptablePrinciples`、`referenceAnswer`）凍結為 `QuestionSnapshot`，確保後續題庫變動或版本更新不破壞歷史成績的定義。
2. **單向作答鎖定**：每題必先完成選擇（單選）或輸入非空白文字（理解題，不設定字數下限也不因簡短回答拒收）才能點擊「確認作答並下一題」；最後第 10 題按鈕為「送出最後一題並查看結果」。送出後立即建立 `AnswerRecord` 寫入 IndexedDB 並鎖定答案與耗時，使用者僅可唯讀檢視先前題目，全部 10 題完成前不提前揭露解析。
3. **對錯狀態分離原則**：單選題於送出時由本機標準答案即時判定 `status: 'graded'`、`correct: true | false`。理解題送出時固定寫入 `status: 'pending_ai'`、`correct: null`，代表**「待 AI 判讀」工作流程狀態**，答錯仍可繼續測驗，且待評閱理解題**絕不計入錯誤、不計入錯題本、也不降低掌握度**。
4. **理解題評閱與重複匯入去重**：經 AI 工作台匯入 `Evaluation` 時，程式強制依據 `checks.every((c) => c.met) && contradictions.length === 0` 計算 `correct` 布林值（只有對或錯，無模糊部分分數），並核對 `requestId`、`testRunId`、`answerId`、`questionVersion` 與 `answerHash`。相同 `answerId + requestId + answerHash` 重複匯入時自動去重略過，不重複產生作答紀錄或計分。

<!-- FIGURE: 05_quiz_mcq | 圖 4：逐題測驗介面（單選題第 1/10 題），顯示有效作答計時、「暫停」按鈕、1–10 題進度狀態與「確認作答並下一題」。 -->

<!-- FIGURE: 07_quiz_result_pending_ai | 圖 5：完成 10 題測驗後的結果頁面，誠實顯示單選題即時得分與 3 題「待 AI 判讀（未判讀不算答錯）」提示，並提供前往 AI 工作台批改入口。 -->

---

## 5. 有效作答計時與中斷處理規則

`QuizRunnerPage` 為每道題目維護兩組獨立毫秒時間：

- **`activeElapsedMs`（有效作答時間）**：僅在該題元件與程式碼片段經 `requestAnimationFrame` 完成繪製後才啟動計時（避免網路或排版延遲算成作答時間）；每 500 毫秒累加增量（單次上限 2,000 毫秒防止休眠跳鐘），當 `document.visibilityState === 'visible'` 且未手動暫停時才累進。送出當下停止並隨 `AnswerRecord` 永久鎖定。
- **`wallElapsedMs`（牆上總時間）**：自題目呈現至送出間經過的總時長（含暫停與視窗切換時間），僅作輔助紀錄。
- **中斷偵測（`interrupted`）**：一旦使用者點擊右上角「暫停」、觸發 `visibilitychange` 隱藏頁面或觸發視窗 `blur`，即永久將該題 `currentInterrupted` 標記為 `true`，介面提示「已標記離開／暫停，本題僅計正確率不計速度加成」。
- **排除項目**：完成測驗後在 `QuizResultPage` 閱讀解析、在簡報頁瀏覽教材，以及等待 ChatGPT 批改理解題的時間，**全數不計入任何題目的有效作答時間或掌握指標計算**。

---

## 6. 錯題紀錄、重練與證據移除規則

`StudyContext` 自 `answers` 與 `evaluations` 衍生 `WrongBookEntry` 清單：

1. **收錄條件**：嚴格僅收錄 `status === 'graded' && correct === false` 的紀錄；`pending_ai` 理解題絕不進入錯題本。每筆錯題附帶同題歷史作答軌跡 `retryHistory`。
2. **重練與保留初始錯誤**：點擊「重練原題組」會開啟新的 `TestRun`；即使後續重練答對，系統預設「仍待複習錯題」篩選會移出該項，但切換至「曾錯但後續重練已答對」或「全部歷史錯題紀錄」仍可回看最初錯誤與完整作答歷程。
3. **清單隱藏 vs 移除證據（關鍵區分）**：
   - **「移出複習清單 (保留統計)」**：建立 `mode: 'hide_wrong_book'` 的 `DeletionTombstone`，僅隱藏錯題本顯示，**完整保留該筆作答作為掌握度計算證據**。
   - **「重置此筆作答紀錄」**：建立 `mode: 'reset_record'` 的 `DeletionTombstone`，不僅從錯題本移除，也會讓 `computeConceptMastery` 與 `computeSpacedReviewQueue` 排除該筆作答證據並重新計算所有指標。
   - **題目品質回報失效**：於結果頁點擊「回報題目異常」並勾選將歷次作答標記失效（`invalidateTarget`）時，該題作答標記為 `invalidated: true`，同步自掌握度與待評閱統計排除。

<!-- FIGURE: 10_wrong_book_populated | 圖 6：錯題本實機畫面（隔離測試資料），顯示當時回答與正確答案對照、解析，以及「移出複習清單 (保留統計)」、「重置此筆作答紀錄」與「重練原題組」按鈕。 -->

---

## 7. 掌握度指標公式、限制與間隔複習規則

所有掌握度與複習排程皆實作於 `src/domain/mastery.ts`（`MASTERY_CONFIG` 演算法版本 **`v1.0.0`**）。系統明確在介面向使用者說明：**掌握指標 `M` 為可解釋的自訂練習綜合指標，並非經過心理計量校準（例如 IRT）的考試及格機率預測**。

### 7.1 獨立證據篩選規則

- 僅採計未失效且未遭 `reset_record` 清除的已判讀證據（單選題取該題紀錄；理解題依 `Evaluation.checks` 對每個涵蓋概念彙總為**每題每概念最多 1 筆證據**，需該概念下所有檢核點皆為 `true` 且若為主概念則 `contradictions` 須為空）。
- **24 小時同題冷卻與看過提示降級**：同概念同題目在 **24 小時（`sameQuestionCooldownHours = 24`）內重複作答**，或 `viewedHintOrAnswerBefore === true` 的練習，標記為 `isPracticeOnly = true`，雖保留作答紀錄，但**不計入獨立證據池**，防止短時間刷同一題人為抬高掌握度。
- 每個概念僅取**最近 20 筆（`maxEvidencePerConcept = 20`）獨立證據**。

### 7.2 正確率估計 `A`、速度係數 `F` 與綜合指標 `M`

針對納入計算的獨立證據集合，單選題基礎權重 `weight = 1`，理解題概念檢核基礎權重 `weight = 2`，依距今天數 `daysSince` 套用 30 天時間衰減權重，並加入弱先驗平滑避免少數樣本出現極端 0 或 100 分：

$$w_i = \text{baseWeight}_i \times \exp\left(-\frac{\text{daysSince}_i}{30}\right), \quad A = \frac{1 + \sum w_i c_i}{2 + \sum w_i}$$

其中 $c_i \in \{0, 1\}$ 代表該筆證據是否通過。關於作答速度修正：

- 僅從「同難度（`difficulty`）且同閱讀量級（`readingTier`）」、無中斷（`!interrupted`）、未看提示且**先於當前作答發生**的正確單選題池中計算速度基準；**至少需累積 5 筆（`minSpeedBaselineSamples = 5`）先前有效樣本**才建立該分類基準中位數 $\text{baseMs}$（當前題目絕不參與建立自己的基準）。
- 若正確單選耗時小於 1,200 毫秒或低於基準中位數的 25%，標記 `needsSpeedRecheck = true` 提示過快需確認；理解題的輸入時間僅記錄於歷史供趨勢參考，**絕對不參與速度分數計算或懲罰打字較慢者**。
- 當存在有效速度基準樣本時，單題速度因子 $f_i = \min(1, \text{baseMs} / \text{activeElapsedMs}_i)$，加權平均為速度係數 $F$：

$$M = \begin{cases} \text{round}\Big(100 \cdot A \cdot (0.9 + 0.1 \cdot F)\Big), & \text{若具備足夠同分組速度基準樣本} \\ \text{round}(100 \cdot A), & \text{若速度資料尚不足（停用速度修正）} \end{cases}$$

### 7.3 概念狀態、章節彙總與間隔複習

- **概念狀態判定**：無任何獨立證據時狀態為 `untested`（介面顯示**「待測」**，不給 0 分）；若獨立不同題目數 `< 5` **或** 跨日練習天數 `< 2` 天，狀態為 `provisional`（介面明確標註**「（暫估）」**）；兩項門檻皆達標才成為 `established`。
- **章節掌握摘要**：依章節內各概念的 `importanceWeight` 對「已測概念」做加權平均，同時顯示 `已測 X / Y 概念`；若有概念尚未測驗則明確標註 `評估未完成`，未測概念不偽裝已精通。
- **間隔複習排程**：採用 `[1, 3, 7, 14]` 天間隔週期。最近一次答錯重置為 1 天間隔；連續跨日答對依連續天數遞增至 3 / 7 / 14 天；若概念超過 14 天未練習則標示建議複習。`priorityScore` 依最近錯誤（+45）、指標低於 70（+30）、尚屬暫估（+15）與逾期天數（每逾期 1 天 +5，上限 +40）綜合排序；未測概念以較低探索權重（25）列於排程供選擇。

<!-- FIGURE: 11_mastery | 圖 7：概念掌握度與間隔複習實機畫面（隔離單次測驗資料），已測概念依規則標示「（暫估）」與「速度資料尚不足」，未測章節誠實顯示「待測」。 -->

---

## 8. AI 工作台任務與 JSON 驗證規格

為恪守不引入未授權自動化、不強制付費 AI API 的邊界，系統透過可擴充的 AI Adapter 契約將能力明確區分：

- **`MANUAL_AI_ADAPTER_STATUS`（已啟用）**：**Plus 手動 JSON 往返模式**，完整可用。
- **`UNVERIFIED_AUTO_ADAPTER_STATUS`（未啟用）**：**官方自動連線擴充介面**，在官方文件、應用資格與真實登入／請求完成驗證前維持停用，介面明確標示未連線。

### 8.1 三項手動任務、檔案往返契約與防呆保護

系統明確區分 **送給 ChatGPT：`提示詞 .txt`** 與 **從 ChatGPT 帶回網站：`回覆 .json`**，完整流程分為 **5 步驟**：`1. 下載提示詞 TXT → 2. 交給 ChatGPT Plus → 3. 取得 .json 附件 → 4. 匯入並執行驗證 → 5. 確認套用至本機`。

- **提示詞檔案下載（主要方式）**：產生 `AiRequest` 後，點擊 **「下載提示詞（.txt）」** 會將 `activeRequest.promptText` 以純 UTF-8（`text/plain;charset=utf-8`）匯出為 `mooncode-<task>-<requestId>.txt`，不做 HTML escaping 或多餘加工（同時保留預覽文字框與「複製提示詞（備用）」）。尚未產生有效請求時下載按鈕維持停用，防止匯出空白檔；重覆點擊下載既有請求的 `.txt` 只會重下同一份內容，**不會產生新 `requestId` 或新資料庫紀錄**。唯有使用者主動點擊 **「重新產生（建立新 Request ID）」** 時才會建立新請求。
- **要求 AI 優先回傳 `.json` 附件**：任務 A、B、C 的提示詞均明確指示 ChatGPT 優先建立並提供可下載的純 UTF-8 `.json` 檔案附件；僅在介面不支援產檔時，才退回直接輸出可被 `JSON.parse` 解析的純原始 JSON（禁止 `&quot;` 等 HTML 編碼、外層額外字串包裝或行尾反斜線）。
- **嚴格驗證與多請求狀態獨立性**：匯入端維持「先執行完整 Schema 與安全性驗證、通過預覽後才由使用者點擊確認套用」兩段式流程；系統不對不合法字串執行全域移除反斜線或全域 HTML 解碼以掩蓋錯誤。各筆 `AiRequest` 依 `requestId` 獨立追蹤狀態（`已套用` / `待回覆`）；已套用請求若再次匯入相同 `requestId` 與 `answerHash` 會自動去重不重複計分，且不會影響其他仍為 `待回覆` 的不同 `requestId`。

| 任務類型 | 打包給 ChatGPT Plus 的資料內容 | 寫入前強制驗證規則（`validateAndTransformAiImport`） |
| --- | --- | --- |
| 任務 A：`generate_question_set`（出題） | 章節規範概念、概念掌握狀態、到期複習原因，及最多近期 50 題題幹摘要（依設定去重） | 嚴格驗證外層信封 `mooncode.ai_response`、`requestId` 與 `baseDatasetEpoch` 相符；必須為 7 單選 + 3 理解題且概念 ID 均存在；由本機指派全新 UUID 與 `contentHash` 寫入，不覆蓋舊題組。 |
| 任務 B：`evaluate_short_answers`（批改 3 題理解題） | 指定已完成 `TestRun` 內恰好 3 題理解題之題幹、必要檢核點、核心迷思、參考理解、學生回答與 `answerHash` | 核對 `testRunId`、`answerId` 必須屬於本次待評 3 題且不重複、`questionVersion` 與 `answerHash` 完全一致；由系統依據 `checks` 與 `contradictions` 重算 `correct` 並寫入新 `revision`，重複回覆不重複計分。 |
| 任務 C：`rewrite_slide`（簡報改寫） | 鎖定區上下文（唯讀參考）、目前可編輯欄位、`baseContentVersion` 與改寫模式 | 拒絕包含任何 `LOCKED_SLIDE_KEYS`（`locked`、`definition`、`code`、`expectedBehavior`、`learningObjectives`、`rubricBasis`、`corePoint`）；核對 `baseContentVersion` 相符；`analogy_only` 模式下拒絕更改 `detailLevel` 或 `layoutVariant`。 |

<!-- FIGURE: 08_ai_workbench | 圖 8：AI 互動工作台實機畫面，呈現 5 步驟檔案往返導引、任務切換、下載提示詞（.txt）主按鈕、.json 檔案匯入區與獨立 Request ID 紀錄。 -->

---

## 9. 本機保存、備份、跨裝置同步與版本復原

資料儲存採 **「本機 IndexedDB 為主、GitHub 私有倉庫分片為跨裝置同步來源」** 設計。未配置後端 GitHub App Secrets 時，系統於前端誠實呈現「本機模式」，所有學習、測驗、備份與改寫功能均正常運作，絕不將本機落盤偽裝為雲端同步成功。

### 9.0 頂端手動「儲存」確認、非同步鎖定與真實結果回饋

- **不干擾日常自動保存**：測驗逐題送出（`commitQuizAnswer`）與簡報自訂改寫仍維持背景靜默寫入本機 IndexedDB，不會跳出確認視窗。
- **手動確認對話框（`SaveConfirmModal`）**：點擊頂端 **「儲存」** 後開啟「確認儲存」無障礙對話框（支援 `Escape`、`Tab` 焦點循環、關閉還原焦點與 375px 手機版面），依真實模式分別說明寫入本機範圍（`本機模式` / `已完成授權並可同步雲端` / `離線或連線暫不可用`）。點擊 **「取消」** 僅中止本次手動觸發，絕不呼叫 `handlePrimarySave`，也不會清除或回滾既有資料。
- **真正非同步完成後才回饋**：確認後鎖定按鈕顯示「儲存中…」防止重複送出；系統執行 `persistManualLocalSave` 寫入並回讀確認本機 `lastManualSavedAt` 後，若已授權且在線才執行 `runCloudSave`，並透過 `role="status"` / `role="alert"` 橫幅誠實區分四種結果：**「已儲存至本機」**、**「已儲存至本機並完成同步」**、**「已儲存至本機，目前尚未同步」**（說明離線或失敗原因並提供 **「重試同步」**），以及 **「儲存失敗」**（不更新最近儲存時間、完整保留既有資料並提供 **「重試儲存」**）。

<!-- FIGURE: 16_save_confirm_dialog | 圖 9：點擊頂端「儲存」開啟之確認儲存對話框，依實際連線與授權模式說明儲存範圍並提供取消與確認儲存操作。 -->

<!-- FIGURE: 17_save_result_banner | 圖 10：確認儲存真正完成後呈現之結果通知橫幅，誠實區分本機保存與雲端同步狀態並標示實際完成時間。 -->

### 9.1 檔案分層與 `StudyBundle` 備份

- **Level A（`QuestionSet`）**：7+3 單一題組交換單位。
- **Level B（`StudyBundle`）**：完整手動備份 JSON，內含 `settings`（已排除外部機密）、全部資料集合與規範化 JSON 的 `integritySha256`。匯入時於獨立 **Web Worker** 執行 Zod Schema 與 SHA-256 驗證（支援進度回報與中止）；若讀入高於本程式支援的 `schemaVersion`（目前為 `1`），直接安全拒絕並保留現有本機資料；選擇「覆蓋還原」前會先自動保存覆蓋前保護快照。
- **Level C（`study-data/` GitHub 分片目錄）**：將同步資料拆分寫入私有倉庫的 `study-data/` 路徑下：含指標檔 `HEAD.json`、版本清單 `manifests/rev-*.json`、分區索引 `indexes/{sets,runs,evaluations,slides,changes}/*`（每片最多 200 筆）、內容物件 `objects/*` 與依章節／年月彙整之 `archives/*`。

### 9.2 Fast-Forward 合併、正向復原與 Reachability GC

1. **只走 Fast-Forward（`force: false`）與 Tombstone 防復活**：透過 `/api/sync/publish` 提交 Git Data API（blobs -> tree -> commit -> non-force ref update）。若遭遇多裝置競爭（HTTP `409`/`422`），自動重抓遠端快照並依穩定 ID 與 Tombstone `revision` 聯集合併後重試（最多 3 次）。提交成功後回讀新 commit 下的 `HEAD.json` 並比對 `appliedOperationIds`，避免網路重試造成重複作答。
2. **A → B → C 雙槽保護與正向復原**：`HEAD.json` 僅追蹤 `active` 與 `previous` 兩個已驗證版本槽位。恢復上一版時先對 `previous` 指向的清單與所有分片執行逐檔 SHA-256 校驗；通過後**以新提交正向切換**並將 **`syncEpoch` 加 1**、把 `previous` 清空為 `null`，不執行會破壞歷史的 `git reset --hard`。
3. **舊裝置隔離區（Epoch Quarantine）**：離線舊裝置若持有舊 `syncEpoch` 的待同步 `outbox` 作業，再次同步偵測到遠端 `syncEpoch > localEpoch` 時，系統不會自動補回覆蓋復原結果，而是先將本地資料對齊遠端最新快照，並將舊作業移入隔離區，交由使用者於「儲存與版本」逐筆決定「重新匯入目前 Epoch」或「安全丟棄」。
4. **可達性垃圾清理（Reachability GC）**：需先執行 Dry-Run 掃描計算 `active` 與 `previous` 兩版共同引用的可達路徑集合，僅從最新樹狀快照移除「兩版皆不再引用」的過期索引與分片（同時如實提醒 Git commit 歷史本身仍會保留舊記錄）。

<!-- FIGURE: 12_storage_versions | 圖 11：儲存、版本管理與備份還原頁面（本機模式狀態），呈現 Generation／SyncEpoch、StudyBundle 匯出匯入、Reachability GC 與章節封存匯出。 -->

---

## 10. 資料結構與核心識別碼

本機 IndexedDB（資料庫名稱 `mooncode-study-db`，`version = 1`）共建立 13 個 Object Stores，詳細結構見專案 `DATA_FORMAT.md` 與 `/schemas/*.schema.json`：

- **核心資料表**：`question_sets`、`test_runs`、`answers`、`evaluations`、`slide_variants`、`tombstones`、`issue_reports`、`chapters_cache`。
- **同步與工作流程表**：`outbox`（尚未推送至遠端之變更佇列）、`quarantine`（復原 Epoch 隔離作業）、`ai_requests`（手動 JSON 往返提示詞紀錄與狀態）、`snapshots_meta`（`head`、`last_known_good_head`）、`meta`（`datasetId`、`syncEpoch`、`generation`、`seeded_v1`）。
- **核心識別碼規範**：`setId`、`testRunId`、`answerId`、`evaluationId`、`variantId`、`tombstoneId`、`requestId`、`operationId` 與 `deviceId` 均採 UUID（`crypto.randomUUID` 或密碼學安全回退）或固定格式識別碼；時間統一採 **UTC ISO 8601** 字串。**任何認證 Cookie（`HttpOnly` HMAC 簽章 Session Cookie）、GitHub App 私鑰、Installation ID 與 Client Secret 均僅存於後端環境變數／Worker Secrets，嚴禁進入 IndexedDB、StudyBundle JSON 或系統文件。**

---

## 11. 系統文件下載、PDF 產製與版本校驗機制

1. **前端入口與按需載入**：網站導覽於「儲存與版本」旁提供「系統文件下載」（`/docs`）。為維持首頁與教材載入速度，PDF 與文件清單**不列入首頁預快取（Workbox `globPatterns`）**，僅在使用者進入 `/docs` 時動態請求 `/system-docs/manifest.json`，點擊按鈕後才讀取對應 PDF。
2. **防止 PWA SPA 回退與過期文件**：`vite.config.ts` 已將 `/^\/system-docs\//i` 加入 `navigateFallbackDenylist` 並設定 `NetworkFirst` 快取策略；下載按鈕實際透過 JS 讀取陣列位元組，依序驗證 HTTP 200、`Content-Type` 非 `text/html`、`%PDF-` 檔頭與清單 `sha256`，通過後才觸發檔案保存。
3. **版本一致與防竄改鎖定**：文件配置（`docs/docs-config.json`）、圖資清單（`docs/screenshots/manifest.json`）與自動產生之預期常數（`src/generated/docsExpectation.ts`）由產製腳本統一計算 `sourceFingerprint`（所有受追蹤核心程式之 SHA-256 摘要）、`docsFingerprint` 與兩份 PDF 的頁數、位元組長度及雜湊。開發與建置檢查 `npm run docs:verify` 會偵測文件遺漏、程式修改未同步更新文件或檔案損毀並阻止錯誤發布。

<!-- FIGURE: 14_system_docs | 圖 12：系統文件下載頁實機畫面，呈現版本核對通過狀態、更新日期與兩顆明確 PDF 下載按鈕。 -->

---

## 12. 執行邊界與外部設定依賴清單

| 能力項目 | 目前實際狀態 | 說明與前置需求 |
| --- | --- | --- |
| 9 章教材、步驟模擬與安全改寫 | **本機立即可用** | 純前端內建與 IndexedDB 保存；步驟模擬明確標示非瀏覽器 C# 編譯器。 |
| 7+3 測驗、計時、錯題本、掌握度與 StudyBundle | **本機立即可用** | 完整離線讀寫、Worker 背景驗證匯入與覆蓋保護快照皆可獨立運行。 |
| ChatGPT Plus 手動 JSON 往返工作台 | **本機立即可用** | 下載純文字提示詞（`.txt`）交給 ChatGPT Plus，優先匯入 `.json` 回覆附件經網站驗證套用（亦保留複製與貼回備用）。 |
| 系統文件 PDF 檢視與下載 | **本機與靜態部署可用** | `public/system-docs/` 隨專案靜態資產供應；首次離線尚未快取時會誠實提示需先連線。 |
| Cloudflare Workers + Static Assets 同源 API | **部署架構與 `dry-run` 已就緒；待實際登入部署** | 執行 `npx wrangler login`、`npm run preflight` 與 `npm run deploy` 後可取得公開 HTTPS 網址；未部署或未登入前不提供猜測網址。 |
| GitHub 私有資料倉庫自動同步 | **程式與邏輯已實作；待外部憑證設定與實帳號驗證** | 需自行建立 GitHub 私有倉庫與 GitHub App，將 `GITHUB_APP_ID`、`GITHUB_APP_CLIENT_ID`、`GITHUB_APP_CLIENT_SECRET`、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_APP_INSTALLATION_ID`、`GITHUB_DATA_OWNER`、`GITHUB_DATA_REPO`、`ALLOWED_GITHUB_USER_ID`、`SESSION_SECRET` 寫入後端 Worker Secrets，並在設定頁完成 OAuth 登入。 |
| ChatGPT Plus 官方自動連線呼叫 | **未啟用（保留擴充介面）** | 在官方文件、應用資格與真實登入驗證完成前維持停用，絕不偽稱已連線或抓取登入 Cookie。 |

---

## 13. 後續功能變更的文件維護與發佈檢查流程

專案根目錄 `AGENTS.md` 已建立持續維護規則，要求任何開發人員或 AI 代理在變更使用者可見功能、導覽、按鈕名稱、AI 任務、API、資料格式或同步／復原流程時，必須於**同一輪任務**完成以下流程：

1. 讀取本次程式差異，對照 `docs/docs-config.json` 中受影響之路由覆蓋與章節。
2. 更新 `docs/system-specification.md`、`docs/user-guide.md` 與 `docs/CHANGELOG.md`（若版本或範圍變動則遞增 `docsVersion`）。
3. 啟動隔離預覽環境並執行 `npm run docs:capture` 重新擷取受影響頁面截圖（確認無半截轉場、狀態與圖說完全相符）。
4. 執行 `npm run docs:build` 重新產製兩份 PDF、更新 `public/system-docs/manifest.json` 與 `src/generated/docsExpectation.ts`。
5. 實際開啟產出之 PDF 逐頁檢視文字、表格、頁碼與截圖品質，最後執行 `npm run docs:verify` 與 `npm run preflight` 確認全部通過後方可交付測試。
