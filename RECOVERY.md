# MoonCode 版本復原與垃圾清理指南 (RECOVERY)

本系統確保任何同步中斷、遠端檔案損毀或跨裝置操作衝突都不會導致學習資料靜默遺失，也不會使用 `git reset --hard` 或 `force push` 破壞歷史。

---

## 一、A -> B -> C 版本生命週期與安全指標

`study-data/HEAD.json` 永遠只記錄兩個通過驗證的指標槽位：
- `active`：目前生效版本的 `revisionId`、`manifestPath`、`manifestSha256`、`generation`、`syncEpoch`。
- `previous`：上一個已驗證可用的版本槽位（A 被覆蓋成 B 時，`previous` 保留 A；B 升級成 C 時，`previous` 保留 B）。

### 失敗防護情境
1. **上傳中途斷線或新版本 B 未完成寫入**：
   - 因寫入採 Git Data API 原子性建立 blobs -> tree -> commit -> `HEAD.json` 更新，若未成功更新 `HEAD.json`，遠端仍停留在完整的版次 A。
2. **已切換至 B 但部分索引或物件遺失／SHA-256 不符**：
   - 讀取與同步流程在每次載入遠端快照時皆逐檔驗證 UTF-8 SHA-256。一旦發現缺檔或損毀，系統會立刻停止並提示，不以壞資料覆蓋本機。

---

## 二、正向復原流程 (Forward-Only Recovery)

當需要回到 `previous` 版本時（可於「儲存與版本」點擊 **恢復上一版**）：
1. **確認目前遠端指標**：若畫面開啟後遠端已被其他裝置更新至更新的 `revisionId`，會安全拒絕舊畫面送出的復原請求。
2. **先驗證目標版本**：系統完整讀取 `previous` 指向的 `SnapshotManifest` 與所有分片物件，逐一比對 SHA-256；若 `previous` 自身不完整，則中止自動回復並改以本機快照／`StudyBundle` 備份處理。
3. **以新提交正向切換（不改寫 Git 歷史）**：
   - 遞增 `generation` 並將 **`syncEpoch` 加 1**。
   - 產生全新的復原版快照（`isRecovery: true`、`recoveredFromRevisionId`），把 `active` 設為這個新版本並將 `previous` 設為 `null`（壞掉的版次不再留作回復目標）。
4. **舊裝置隔離保護 (Epoch Quarantine)**：
   - 另一台離線裝置若仍持有舊 `syncEpoch` 的未同步 `outbox` 作業，下次連線同步時會偵測到遠端 `syncEpoch > localEpoch`。
   - 系統**不會**自動把舊裝置的待同步作業補回覆蓋剛剛復原的資料，而是先將該裝置資料對齊復原後的遠端快照，並將舊作業移入本機「隔離區 (`quarantine`)」，交由使用者在介面中逐筆決定「重新匯入目前 Epoch」或「安全丟棄」。

---

## 三、可達性垃圾清理 (Reachability GC)

當長期累積多個歷史分片與舊索引時，可於「儲存與版本」執行清理：
1. **必須先執行 Dry-Run 預覽**：計算目前 `active` 與 `previous` 兩版 `SnapshotManifest` 所引用的全部路徑（`reachable` 集合），**只要任一版本（含共用的資料分片或索引）仍引用某檔案，就絕對保留**。
2. **確認執行清理**：只會把 `study-data/` 下「兩版皆不再引用」的過期物件與舊索引從最新樹移除。
3. **重要限制說明**：從最新 Git tree 移除檔案只會精簡目前工作樹與後續同步讀取量；**Git 過去的 commit 歷史紀錄仍會依 Git 設計保留**，若需徹底縮減倉庫磁碟歷史，需另外手動重建資料倉庫。

---

## 四、本機 `StudyBundle` 覆蓋保護與離線救援
- 在本機匯入 `StudyBundle` 並選擇「覆蓋還原」前，系統會自動把覆蓋前的完整狀態先寫入 `pre_overwrite_backup` 本機保護快照。
- 若因較高 `schemaVersion` 無法解析或檔案中途毀損，匯入會在寫入交易前中止，現有 IndexedDB 學習資料保持 100% 完整。
