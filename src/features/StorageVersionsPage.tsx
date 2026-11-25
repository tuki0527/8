import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Download,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { CANONICAL_CHAPTERS } from '../data/curriculum/index.ts';
import { useStudy } from '../context/StudyContext.tsx';
import {
  exportStudyBundle,
  httpRemoteAdapter,
  importStudyBundle,
  localSyncBackend,
  resolveQuarantinedItem,
  restorePreOverwriteLocalBackup,
} from '../storage/studyStore.ts';
import { SyncCoordinator } from '../sync/syncEngine.ts';
import { buildArchiveExports } from '../sync/sharding.ts';

function downloadJsonFile(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const StorageVersionsPage: React.FC = () => {
  const {
    settings,
    snapshot,
    reloadSnapshot,
    syncAuth,
    handlePrimarySave,
    saveStatusMessage,
    isSaving,
    lastSavedAt,
  } = useStudy();

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [importProgress, setImportProgress] = useState<{ percent: number; message: string } | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const [gcPreview, setGcPreview] = useState<{
    unreachablePaths: string[];
    totalReclaimableBytes: number;
    reachableCount: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const [archiveChapter, setArchiveChapter] = useState(CANONICAL_CHAPTERS[0].chapterId);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const archives = useMemo(() => {
    if (!snapshot) return [];
    return buildArchiveExports({
      questionSets: snapshot.questionSets,
      testRuns: snapshot.testRuns,
      answers: snapshot.answers,
      evaluations: snapshot.evaluations,
      slideVariants: snapshot.slideVariants,
      tombstones: snapshot.tombstones,
    });
  }, [snapshot]);

  const handleExportFullBundle = async () => {
    const bundle = await exportStudyBundle(settings);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`mooncode-study-bundle-${stamp}.json`, bundle);
    setActionMsg('已下載完整 StudyBundle JSON 備份（含 integritySha256 校驗碼，不含任何外部機密）。');
  };

  const handleBundleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const rawText = await file.text();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;
    setActionMsg(null);
    setImportProgress({ percent: 5, message: '準備在背景 Worker 檢查備份檔…' });

    const res = await importStudyBundle(rawText, importMode, {
      signal: ctrl.signal,
      onProgress: (percent, message) => setImportProgress({ percent, message }),
    });

    abortCtrlRef.current = null;
    setImportProgress(null);

    if (res.ok) {
      await reloadSnapshot();
      setActionMsg(res.summary);
    } else {
      setActionMsg(`匯入失敗（未修改現有本機資料）：${res.errors.join('；')}`);
    }
  };

  const handleRecoverPrevious = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      if (syncAuth.configured && syncAuth.authenticated) {
        const coord = new SyncCoordinator(httpRemoteAdapter, localSyncBackend, settings.deviceId);
        const out = await coord.recoverToPrevious(snapshot?.pointer?.active?.revisionId);
        await reloadSnapshot();
        setActionMsg(out.message);
      } else {
        const restored = await restorePreOverwriteLocalBackup();
        await reloadSnapshot();
        setActionMsg(
          restored
            ? '已還原覆蓋前的本機保護快照。'
            : '目前沒有覆蓋前本機保護快照；本機模式可透過 StudyBundle JSON 匯入還原。'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGcDryRun = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      const coord = new SyncCoordinator(httpRemoteAdapter, localSyncBackend, settings.deviceId);
      const plan = await coord.planGarbageCollection();
      if (!plan.ok) {
        setActionMsg(`無法預覽清理：${plan.reason}`);
        setGcPreview(null);
      } else {
        setGcPreview(plan);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGcExecute = async () => {
    setBusy(true);
    try {
      const coord = new SyncCoordinator(httpRemoteAdapter, localSyncBackend, settings.deviceId);
      const res = await coord.executeGarbageCollection();
      setActionMsg(res.message);
      setGcPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const handleExportChapterArchive = () => {
    const found = archives.find((a) => a.chapterId === archiveChapter);
    if (!found) {
      setActionMsg('該章節目前沒有可封存的額外練習資料。');
      return;
    }
    downloadJsonFile(`mooncode-archive-${archiveChapter}.json`, found.content);
    setActionMsg(`已匯出章節封存檔（${found.itemCount} 筆資料）。`);
  };

  const ptr = snapshot?.pointer;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">儲存、版本管理與備份還原</h1>
        <p className="text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
          本機 IndexedDB 為主儲存；當連線且授權 GitHub 私有資料倉庫時，採分片索引 + 正向不可變回復保護。
        </p>
      </header>

      {actionMsg && (
        <div
          role="status"
          className="rounded-xl border px-4 py-3 text-xs leading-relaxed"
          style={{
            backgroundColor: 'var(--mc-bg-elevated)',
            borderColor: 'var(--mc-accent)',
            color: 'var(--mc-text-primary)',
          }}
        >
          {actionMsg}
        </div>
      )}

      {/* Active & Previous Snapshot Info */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">本機與雲端版本狀態</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mc-text-muted)' }}>
              狀態：{saveStatusMessage} · Dataset ID：{snapshot?.datasetId ?? 'mooncode-primary'}
              {lastSavedAt ? ` · 最近儲存：${new Date(lastSavedAt).toLocaleString('zh-TW')}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSaving || busy}
              onClick={() => void handlePrimarySave()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isSaving ? '儲存中…' : '立即儲存並同步'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRecoverPrevious()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-4 py-2 text-xs hover:bg-white/5 disabled:opacity-40"
              style={{ borderColor: 'var(--mc-border)' }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>恢復上一版</span>
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div
            className="rounded-xl border p-3.5 space-y-1"
            style={{ backgroundColor: 'var(--mc-bg-primary)', borderColor: 'var(--mc-border)' }}
          >
            <p style={{ color: 'var(--mc-text-muted)' }}>Generation / SyncEpoch</p>
            <p className="text-base font-semibold tabular-nums">
              v{snapshot?.generation ?? 0} · Epoch {snapshot?.syncEpoch ?? 1}
            </p>
            <p style={{ color: 'var(--mc-text-secondary)' }}>
              待同步佇列：{snapshot?.pendingOutbox.length ?? 0} 筆
            </p>
          </div>

          <div
            className="rounded-xl border p-3.5 space-y-1"
            style={{ backgroundColor: 'var(--mc-bg-primary)', borderColor: 'var(--mc-border)' }}
          >
            <p style={{ color: 'var(--mc-text-muted)' }}>目前遠端 Active 版</p>
            <p className="font-mono text-xs truncate">{ptr?.active?.revisionId ?? '（尚未建立遠端快照）'}</p>
            <p style={{ color: 'var(--mc-text-secondary)' }}>
              {ptr?.active ? new Date(ptr.active.committedAt).toLocaleString('zh-TW') : '僅本機保存中'}
            </p>
          </div>

          <div
            className="rounded-xl border p-3.5 space-y-1"
            style={{ backgroundColor: 'var(--mc-bg-primary)', borderColor: 'var(--mc-border)' }}
          >
            <p style={{ color: 'var(--mc-text-muted)' }}>上一個可用版 (Previous)</p>
            <p className="font-mono text-xs truncate">{ptr?.previous?.revisionId ?? '（無）'}</p>
            <p style={{ color: 'var(--mc-text-secondary)' }}>
              {ptr?.previous ? `v${ptr.previous.generation}` : '尚未輪替或剛執行完復原'}
            </p>
          </div>
        </div>
      </section>

      {/* Epoch Quarantine Section */}
      {(snapshot?.quarantined.length ?? 0) > 0 && (
        <section
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: 'rgba(212,124,93,0.1)', borderColor: '#d47c5d' }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#f5b482' }}>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>隔離區：偵測到版本復原前的舊裝置待同步紀錄</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
            為避免舊裝置把已復原撤回的資料自動補回，系統已先隔離下列紀錄，請逐筆決定重新匯入或安全丟棄：
          </p>
          <div className="space-y-2">
            {snapshot?.quarantined.map((q) => (
              <div
                key={q.quarantineId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs"
                style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
              >
                <div>
                  <p className="font-medium">
                    {q.operation.entityType} ({q.operation.entityId.slice(0, 8)}…)
                  </p>
                  <p style={{ color: 'var(--mc-text-muted)' }}>{q.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await resolveQuarantinedItem(q.quarantineId, 'reimport');
                      await reloadSnapshot();
                    }}
                    className="rounded-lg px-3 py-1.5 font-semibold"
                    style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
                  >
                    重新匯入目前 Epoch
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await resolveQuarantinedItem(q.quarantineId, 'discard');
                      await reloadSnapshot();
                    }}
                    className="rounded-lg border px-3 py-1.5"
                    style={{ borderColor: 'var(--mc-border)' }}
                  >
                    安全丟棄
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* StudyBundle Full Backup & Restore */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div>
          <h2 className="text-base font-semibold">完整學習封包備份與還原 (StudyBundle JSON)</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--mc-text-muted)' }}>
            屬進階手動備份與跨裝置離線搬移功能。匯入前將於 Web Worker 背景執行完整結構與 SHA-256 驗證，若為較新 schemaVersion 會安全拒絕且不覆蓋現有資料。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExportFullBundle()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold hover:bg-white/5"
            style={{ borderColor: 'var(--mc-border)' }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>下載完整備份 (StudyBundle)</span>
          </button>

          <select
            aria-label="匯入模式"
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'merge' | 'overwrite')}
            className="min-h-[42px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="merge">合併匯入（保留現有資料並去重）</option>
            <option value="overwrite">覆蓋還原（自動保留覆蓋前保護快照）</option>
          </select>

          <label
            className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>選擇備份 JSON 匯入</span>
            <input type="file" accept=".json,application/json" onChange={handleBundleFileSelected} className="sr-only" />
          </label>
        </div>

        {importProgress && (
          <div className="space-y-2 rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--mc-border)' }}>
            <div className="flex items-center justify-between">
              <span>{importProgress.message}</span>
              <button
                type="button"
                onClick={() => abortCtrlRef.current?.abort()}
                className="underline"
                style={{ color: '#f5b482' }}
              >
                中斷匯入
              </button>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full transition-all"
                style={{ width: `${importProgress.percent}%`, backgroundColor: 'var(--mc-accent)' }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Reachability GC & Archive Export */}
      <div className="grid gap-4 md:grid-cols-2">
        <section
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <h2 className="text-base font-semibold">可達性過期檔案清理 (Reachability GC)</h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--mc-text-muted)' }}>
            僅清理「目前版與上一個可用版」皆未引用的舊索引與未引用分片。先預覽再確認刪除，且需注意 Git commit 歷史紀錄依設計仍會保留。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !syncAuth.authenticated}
              onClick={() => void handleGcDryRun()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs disabled:opacity-40"
              style={{ borderColor: 'var(--mc-border)' }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>預覽可清理物件 (Dry-Run)</span>
            </button>
            {gcPreview && gcPreview.unreachablePaths.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGcExecute()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-900/60 px-3.5 py-1.5 text-xs font-medium text-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>確認清理 {gcPreview.unreachablePaths.length} 個未引用檔案</span>
              </button>
            )}
          </div>
          {gcPreview && (
            <p className="text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
              已保護 {gcPreview.reachableCount} 個目前／上一版引用檔案；可從最新樹移除 {gcPreview.unreachablePaths.length} 個舊檔（約 {Math.round(gcPreview.totalReclaimableBytes / 1024)} KB）。
            </p>
          )}
        </section>

        <section
          className="rounded-2xl border p-5 space-y-3"
          style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
        >
          <h2 className="text-base font-semibold">可讀性封存匯出（依章節）</h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--mc-text-muted)' }}>
            匯出單一章節的題組、測驗與評閱整理檔，方便歸檔保存或閱讀。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={archiveChapter}
              onChange={(e) => setArchiveChapter(e.target.value)}
              className="min-h-[38px] rounded-xl border px-3 py-1.5 text-xs"
              style={{
                backgroundColor: 'var(--mc-bg-elevated)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            >
              {CANONICAL_CHAPTERS.map((ch) => (
                <option key={ch.chapterId} value={ch.chapterId}>
                  第 {ch.order} 章：{ch.titleZh}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportChapterArchive}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs"
              style={{ borderColor: 'var(--mc-border)' }}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>匯出章節封存 JSON</span>
            </button>
          </div>
        </section>
      </div>

      {/* Opt-In Diagnostics Section (strictly hidden unless toggled by user) */}
      <section className="pt-2">
        <button
          type="button"
          onClick={() => setShowDiagnostics((v) => !v)}
          className="text-xs underline"
          style={{ color: 'var(--mc-text-muted)' }}
        >
          {showDiagnostics ? '隱藏本機資料庫診斷資訊' : '展開本機資料庫診斷資訊'}
        </button>
        {showDiagnostics && snapshot && (
          <div
            className="mt-3 rounded-2xl border p-4 text-xs grid grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums"
            style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
          >
            <div>QuestionSets: {snapshot.questionSets.length}</div>
            <div>TestRuns: {snapshot.testRuns.length}</div>
            <div>Answers: {snapshot.answers.length}</div>
            <div>Evaluations: {snapshot.evaluations.length}</div>
            <div>SlideVariants: {snapshot.slideVariants.length}</div>
            <div>Tombstones: {snapshot.tombstones.length}</div>
          </div>
        )}
      </section>
    </div>
  );
};
