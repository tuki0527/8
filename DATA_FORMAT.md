# MoonCode 資料格式與分片規範 (DATA_FORMAT)

本系統所有時間欄位皆採 **UTC ISO 8601** 字串（`YYYY-MM-DDTHH:mm:ss.sssZ`），並以穩定的內容雜湊（UTF-8 位元組 SHA-256、鍵名排序標準化 JSON）進行完整性驗證。獨立 JSON Schema 定義位於 `/schemas/` 目錄。

---

## 一、三層資料格式設計

### Level A：`QuestionSet`（題組交換格式，`format: "mooncode.question_set"`）
- 每次測驗與出題的最小單位，**嚴格限制恰好 10 題**：
  - `7` 題 `single_choice`（4 個彼此不重複的選項，`correctOptionIndex` 為 `0..3`）
  - `3` 題 `short_answer`（含 `rubricVersion`、`requiredPoints[]`、`coreMisconceptions[]`、`acceptablePrinciples[]`、`referenceAnswer`）
- 每題必須對應已存在的 `primaryConceptId`（不得捏造未知概念）。
- 支援 AI 匯入時使用暫時 `localId`，匯入驗證通過後由系統配置全域唯一 `UUID`，不覆蓋既有題組。

### Level B：`StudyBundle`（完整學習備份封包，`format: "mooncode.study_bundle"`）
- 用於手動下載備份或跨裝置離線匯入，包含：
  - `settings`（不含任何外部機密／Token）
  - `questionSets`、`testRuns`、`answers`、`evaluations`、`slideVariants`、`tombstones`、`issueReports`
  - `integritySha256`：對規範化負載計算的 64 字元小寫 SHA-256 雜湊。
- **背景驗證與版本防呆**：
  - 匯入操作在 Web Worker 執行結構、必填欄位與 SHA-256 驗證，避免大型 JSON 阻塞介面。
  - 若讀取到較新的 `schemaVersion`（大於本程式支援的 `1`），會明確提示需要升級網站並拒絕寫入，**絕不清空或損毀現有本機資料**。

### Level C：`SnapshotManifest` + `HEAD.json` + 分片儲存（GitHub 同步格式）
私有資料倉庫內所有檔案嚴格限制於 `study-data/` 目錄下：

```text
study-data/
├── HEAD.json                         # ActivePointer：記錄 active 與 previous 指標、syncEpoch、generation
├── manifests/
│   └── rev-00001-xxxxxxxx.json       # SnapshotManifest：列出所有索引路徑與 SHA-256、統計數字與 appliedOperationIds
├── indexes/
│   ├── sets/ch01-p00.json            # 依章節分區，每片最多 200 筆 ShardEntry
│   ├── runs/2026-11-p00.json         # 依 YYYY-MM 分區，每片最多 200 筆 ShardEntry
│   ├── evaluations/2026-11-p00.json
│   ├── slides/ch01-p00.json
│   └── changes/epoch-1-p00.json      # 跨裝置 tombstone 變更分片
├── objects/
│   ├── sets/ch01/<setId>.json
│   ├── runs/2026-11/<testRunId>.json # 內含不可變的 QuestionSnapshot 與該次作答紀錄
│   ├── evaluations/2026-11/<evalId>.json
│   ├── slides/<slideId>/<variantId>.json
│   └── tombstones/<tombstoneId>.json
└── archives/
    ├── chapter-ch01.json             # 依章節整理的可讀性封存檔
    └── month-2026-11.json            # 依年月整理的可讀性封存檔
```

---

## 二、同步合併與防覆寫規則

1. **只走 Fast-Forward（`force: false`）**：
   - 上傳前透過 `/api/sync/head` 取得遠端 commit SHA。
   - 若多裝置同時更新導致 Git ref 衝突（HTTP `409` / `422`），自動重抓遠端 `HEAD`，依穩定 ID 聯集合併（`QuestionSet`、`TestRun`、`AnswerRecord`、`Evaluation`、`SlideVariant` 與 `DeletionTombstone`）後重試，最多 3 次。
2. **Tombstone 防復活機制**：
   - 刪除題組（`delete_set`）、移出錯題（`hide_wrong_book`）、重置作答紀錄（`reset_record`）或還原簡報改寫（`revert_variant`）皆建立具遞增 `revision` 的 `DeletionTombstone`。
   - 合併遠端與本機資料時，依 Tombstone 與 `revision` 決定最終狀態，已刪除或撤回的資料不會在其他裝置同步後自動復活。
3. **回讀驗證與冪等去重**：
   - 提交成功後會回讀該 commit 下的 `HEAD.json` 確認一致性後才清除本機 `outbox`；每次發布都附帶 `appliedOperationIds`，即使網路在遠端提交後斷線，重試時也能識別並跳過已套用的操作。
