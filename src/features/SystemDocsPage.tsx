import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  Download,
  FileText,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext.tsx';
import { DOCS_EXPECTATION } from '../generated/docsExpectation.ts';

type DocId = 'system-specification' | 'user-guide';

interface RuntimeDocItem {
  id: DocId;
  title: string;
  subtitle?: string;
  description: string;
  fileName: string;
  downloadFileName: string;
  pageCount: number;
  byteSize: number;
  sha256: string;
}

interface RuntimeDocsManifest {
  format: 'mooncode.system_docs_manifest';
  schemaVersion: 1;
  appVersion: string;
  docsVersion: string;
  updatedAt: string;
  status: 'draft' | 'published';
  sourceFingerprint: string;
  docsFingerprint: string;
  documents: RuntimeDocItem[];
}

type VerificationState =
  | { kind: 'checking' }
  | { kind: 'ready'; manifest: RuntimeDocsManifest }
  | { kind: 'mismatch'; manifest: RuntimeDocsManifest; reason: string }
  | { kind: 'unavailable'; reason: string; offline: boolean };

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function computeBufferSha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hasPdfMagicHeader(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const head = new Uint8Array(buffer.slice(0, 5));
  // "%PDF-" in ASCII: 0x25 0x50 0x44 0x46 0x2D
  return (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46 &&
    head[4] === 0x2d
  );
}

const DEFAULT_CARDS: Array<{
  id: DocId;
  title: string;
  description: string;
  buttonLabel: string;
  highlights: string[];
}> = [
  {
    id: 'system-specification',
    title: '系統規格書',
    description:
      '完整記錄 MoonCode 系統邊界、9 章簡報改寫規則、7+3 測驗與有效計時、掌握度公式、AI 手動 JSON 驗證與 GitHub 分片同步／版本復原規範。',
    buttonLabel: '下載系統規格書 PDF',
    highlights: [
      '涵蓋功能範圍、實作與待外部設定清單',
      '可驗證掌握指標公式、測驗計時與錯題證據規則',
      '資料格式、分片同步、版本復原與後續維護流程',
    ],
  },
  {
    id: 'user-guide',
    title: '使用操作手冊',
    description:
      '面向手機與電腦自用者的圖文步驟指南，依實際介面與真實按鈕名稱介紹章節學習、測驗操作、ChatGPT Plus 往返、錯題複習與備份還原。',
    buttonLabel: '下載使用操作手冊 PDF',
    highlights: [
      '電腦側欄與手機漢堡抽屜操作步驟與實拍畫面',
      '逐題作答、暫停計時、待 AI 判讀與錯題重練',
      '手動 JSON 匯入、StudyBundle 備份與離線限制說明',
    ],
  },
];

export const SystemDocsPage: React.FC = () => {
  const { isOnline } = useStudy();
  const [state, setState] = useState<VerificationState>({ kind: 'checking' });
  const [downloadingId, setDownloadingId] = useState<DocId | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadAndVerifyManifest = useCallback(async () => {
    setState({ kind: 'checking' });
    setDownloadFeedback(null);

    try {
      const res = await fetch('/system-docs/manifest.json', {
        cache: isOnline ? 'no-store' : 'default',
      });
      if (!res.ok) {
        setState({
          kind: 'unavailable',
          offline: !navigator.onLine,
          reason: `無法讀取文件索引（HTTP ${res.status}），文件可能尚未產生或尚未隨網站建置發布。`,
        });
        return;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        setState({
          kind: 'unavailable',
          offline: !navigator.onLine,
          reason: '伺服器回傳了 HTML 頁面而非文件索引（可能缺少 public/system-docs/manifest.json）。',
        });
        return;
      }

      const manifest = (await res.json()) as RuntimeDocsManifest;
      if (
        manifest?.format !== 'mooncode.system_docs_manifest' ||
        !Array.isArray(manifest.documents) ||
        manifest.documents.length < 2
      ) {
        setState({
          kind: 'unavailable',
          offline: !navigator.onLine,
          reason: '文件索引格式不完整或已損毀，請重新建置系統文件。',
        });
        return;
      }

      const specDoc = manifest.documents.find((d) => d.id === 'system-specification');
      const guideDoc = manifest.documents.find((d) => d.id === 'user-guide');

      if (!specDoc || !guideDoc || specDoc.pageCount <= 0 || guideDoc.pageCount <= 0) {
        setState({
          kind: 'unavailable',
          offline: !navigator.onLine,
          reason: '系統文件 PDF 尚未正式產製完成或頁數異常，請重試或執行文件建置流程。',
        });
        return;
      }

      if (manifest.status === 'draft') {
        setState({
          kind: 'mismatch',
          manifest,
          reason: '目前載入的是開發過程暫稿索引，尚未完成正式版驗證與定稿產製。',
        });
        return;
      }

      const versionMatches =
        manifest.docsVersion === DOCS_EXPECTATION.docsVersion &&
        manifest.sourceFingerprint === DOCS_EXPECTATION.sourceFingerprint &&
        manifest.docsFingerprint === DOCS_EXPECTATION.docsFingerprint &&
        specDoc.sha256 === DOCS_EXPECTATION.documents['system-specification'].sha256 &&
        guideDoc.sha256 === DOCS_EXPECTATION.documents['user-guide'].sha256;

      if (!versionMatches) {
        setState({
          kind: 'mismatch',
          manifest,
          reason:
            '網站程式版本與伺服器快取的文件版本不一致（可能為網站剛更新但瀏覽器或快取仍保留舊文件），請先更新頁面或重新產製文件。',
        });
        return;
      }

      setState({ kind: 'ready', manifest });
    } catch {
      setState({
        kind: 'unavailable',
        offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
        reason:
          typeof navigator !== 'undefined' && !navigator.onLine
            ? '目前為離線狀態且尚未快取最新文件索引，無法確認文件是否可用；請恢復連線後重試。'
            : '讀取文件索引時發生網路或解析錯誤，請稍後重試。',
      });
    }
  }, [isOnline]);

  useEffect(() => {
    void loadAndVerifyManifest();
  }, [loadAndVerifyManifest]);

  const handleDownloadPdf = async (docId: DocId) => {
    setDownloadFeedback(null);
    if (state.kind !== 'ready' && state.kind !== 'mismatch') {
      setDownloadFeedback({
        kind: 'error',
        message: '尚未取得可驗證的文件清單，無法執行下載。請先點選「重新檢查文件」。',
      });
      return;
    }

    const docMeta = state.manifest.documents.find((d) => d.id === docId);
    if (!docMeta) {
      setDownloadFeedback({
        kind: 'error',
        message: '文件清單中找不到目標 PDF 資訊，請重新整理後再試。',
      });
      return;
    }

    setDownloadingId(docId);
    try {
      const versionQuery = encodeURIComponent(`${state.manifest.docsVersion}-${docMeta.sha256.slice(0, 8)}`);
      const url = `/system-docs/${docMeta.fileName}?v=${versionQuery}`;
      const res = await fetch(url, {
        cache: isOnline ? 'no-store' : 'default',
      });

      if (!res.ok) {
        setDownloadFeedback({
          kind: 'error',
          message: `無法下載「${docMeta.title}」（HTTP ${res.status}），檔案可能不存在或離線尚未快取。`,
        });
        return;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        setDownloadFeedback({
          kind: 'error',
          message: `下載中止：伺服器針對「${docMeta.title}」回傳了網頁而非 PDF 檔案，請確認靜態資產包含該 PDF。`,
        });
        return;
      }

      const buffer = await res.arrayBuffer();
      if (!hasPdfMagicHeader(buffer)) {
        setDownloadFeedback({
          kind: 'error',
          message: `下載中止：「${docMeta.title}」檔案標頭不是有效的 PDF 格式（檔頭檢核失敗）。`,
        });
        return;
      }

      if (docMeta.sha256) {
        const actualSha256 = await computeBufferSha256Hex(buffer);
        if (actualSha256 && actualSha256 !== docMeta.sha256) {
          setDownloadFeedback({
            kind: 'error',
            message: `下載中止：「${docMeta.title}」檔案內容校驗與目前文件索引不一致，可能為快取過期或檔案損毀，請重新整理後再試。`,
          });
          return;
        }
      }

      const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = docMeta.downloadFileName || docMeta.fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      setDownloadFeedback({
        kind: 'success',
        message: `已準備並觸發「${docMeta.title}」（${docMeta.downloadFileName}，共 ${docMeta.pageCount} 頁）下載。請於瀏覽器下載紀錄或裝置「檔案」中離線開啟；iOS Safari 若直接於分頁預覽，可點擊「分享 → 儲存到檔案」。`,
      });
    } catch {
      setDownloadFeedback({
        kind: 'error',
        message:
          typeof navigator !== 'undefined' && !navigator.onLine
            ? `目前處於離線狀態且瀏覽器尚未快取「${docMeta.title}」PDF，請連線後再下載。`
            : `取得「${docMeta.title}」PDF 時發生連線錯誤，請點擊重試。`,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const manifestDocs =
    state.kind === 'ready' || state.kind === 'mismatch' ? state.manifest.documents : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1.5">
        <p className="text-xs font-medium tracking-wide" style={{ color: 'var(--mc-text-muted)' }}>
          MoonCode / Documentation
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">系統文件下載</h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
          下載與目前網站版本對應的系統規格書及使用操作手冊（圖文繁體中文 PDF）。兩份文件皆隨版本更新與真實操作畫面同步產製，下載後可離線開啟閱讀。
        </p>
      </header>

      {/* Truthful Version & Availability Status Banner */}
      <section
        aria-label="文件版本與狀態"
        className="rounded-2xl border p-4 sm:p-5"
        style={{
          backgroundColor: 'var(--mc-bg-secondary)',
          borderColor:
            state.kind === 'ready'
              ? 'var(--mc-border)'
              : state.kind === 'checking'
              ? 'var(--mc-border)'
              : '#d47c5d',
        }}
      >
        {state.kind === 'checking' && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5" style={{ color: 'var(--mc-text-secondary)' }}>
              <RefreshCw className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              <span>正在向網站確認文件版本與 PDF 可用狀態…</span>
            </div>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-2 font-medium" style={{ color: '#7fd1a8' }}>
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>文件與目前網站版本一致</span>
              </span>
              <span className="tabular-nums" style={{ color: 'var(--mc-text-secondary)' }}>
                文件版本：{state.manifest.docsVersion}
              </span>
              <span className="tabular-nums" style={{ color: 'var(--mc-text-secondary)' }}>
                更新日期：{state.manifest.updatedAt}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadAndVerifyManifest()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-white/5"
              style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>重新核對</span>
            </button>
          </div>
        )}

        {state.kind === 'mismatch' && (
          <div className="flex flex-wrap items-start justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold" style={{ color: '#f5b482' }}>
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>文件版本核對警示</span>
              </div>
              <p style={{ color: 'var(--mc-text-secondary)' }}>{state.reason}</p>
              <p className="tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
                目前索引版本：{state.manifest.docsVersion}（更新於 {state.manifest.updatedAt}）· 網站期待版本：
                {DOCS_EXPECTATION.docsVersion}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAndVerifyManifest()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium hover:bg-white/5"
              style={{ borderColor: '#d47c5d', color: '#f5b482' }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>重新檢查文件</span>
            </button>
          </div>
        )}

        {state.kind === 'unavailable' && (
          <div className="flex flex-wrap items-start justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold" style={{ color: '#f5b482' }}>
                {state.offline ? (
                  <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>無法確認或下載系統文件</span>
              </div>
              <p style={{ color: 'var(--mc-text-secondary)' }}>{state.reason}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadAndVerifyManifest()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium hover:bg-white/5"
              style={{ borderColor: '#d47c5d', color: '#f5b482' }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>重試載入</span>
            </button>
          </div>
        )}
      </section>

      {downloadFeedback && (
        <div
          role={downloadFeedback.kind === 'error' ? 'alert' : 'status'}
          className="rounded-2xl border px-4 py-3 text-xs leading-relaxed flex items-start gap-2.5"
          style={{
            backgroundColor:
              downloadFeedback.kind === 'error'
                ? 'rgba(180,60,50,0.14)'
                : 'var(--mc-bg-elevated)',
            borderColor: downloadFeedback.kind === 'error' ? '#d47c5d' : 'var(--mc-accent)',
            color: downloadFeedback.kind === 'error' ? '#f5b482' : 'var(--mc-text-primary)',
          }}
        >
          {downloadFeedback.kind === 'error' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--mc-accent)' }} aria-hidden="true" />
          )}
          <span>{downloadFeedback.message}</span>
        </div>
      )}

      {/* Two Document Cards */}
      <section aria-label="可下載 PDF 文件" className="grid gap-5 md:grid-cols-2">
        {DEFAULT_CARDS.map((card) => {
          const runtimeDoc = manifestDocs?.find((d) => d.id === card.id) ?? null;
          const isChecking = state.kind === 'checking';
          const canAttemptDownload =
            (state.kind === 'ready' || state.kind === 'mismatch') && runtimeDoc !== null;
          const isBusy = downloadingId === card.id;
          const Icon = card.id === 'system-specification' ? FileText : BookOpenText;

          return (
            <article
              key={card.id}
              className="flex flex-col justify-between rounded-2xl border p-5 sm:p-6 space-y-5"
              style={{
                backgroundColor: 'var(--mc-bg-secondary)',
                borderColor: 'var(--mc-border)',
              }}
            >
              <div className="space-y-3">
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                  style={{
                    backgroundColor: 'var(--mc-bg-elevated)',
                    borderColor: 'var(--mc-border)',
                    color: 'var(--mc-accent)',
                  }}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>

                <div>
                  <h2 className="text-lg font-semibold">{card.title}</h2>
                  <p className="mt-1.5 text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
                    {runtimeDoc?.description ?? card.description}
                  </p>
                </div>

                <ul className="space-y-1.5 text-xs pt-1" style={{ color: 'var(--mc-text-muted)' }}>
                  {card.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <span aria-hidden="true">·</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--mc-border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
                  <span>
                    {runtimeDoc
                      ? `PDF · 共 ${runtimeDoc.pageCount} 頁 · 含實際系統畫面`
                      : isChecking
                      ? '正在確認文件頁數與大小…'
                      : '尚未確認檔案可用性'}
                  </span>
                  {runtimeDoc && <span>{formatByteSize(runtimeDoc.byteSize)}</span>}
                </div>

                <button
                  type="button"
                  disabled={!canAttemptDownload || isBusy}
                  onClick={() => void handleDownloadPdf(card.id)}
                  className="w-full inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--mc-accent)',
                    color: 'var(--mc-accent-text)',
                  }}
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{isBusy ? '正在取得並檢查 PDF…' : card.buttonLabel}</span>
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* Honest Scope & Browser Download Behavior Note */}
      <section
        aria-label="關於畫面、版本與瀏覽器下載說明"
        className="rounded-2xl border p-5 space-y-2.5 text-xs leading-relaxed"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <h2 className="text-sm font-semibold">關於文件內容、離線閱讀與跨裝置差異</h2>
        <p style={{ color: 'var(--mc-text-secondary)' }}>
          兩份文件內的網站畫面皆於隔離測試環境實機擷取，示例作答紀錄僅用於展示介面流程，不會讀取或外洩您的個人紀錄；未配置 GitHub App 憑證的「本機模式」與 ChatGPT Plus 手動 JSON 往返流程皆如實記載。
        </p>
        <p style={{ color: 'var(--mc-text-muted)' }}>
          桌面瀏覽器（Chrome／Edge／Firefox）會直接將 PDF 存至下載資料夾；手機瀏覽器（尤其 iOS Safari）可能會先於瀏覽器內建預覽開啟 PDF，請再透過「分享 → 儲存到檔案」保存至裝置供離線閱讀。若瀏覽器目前離線且先前未快取過該 PDF，系統將顯示離線提示而不會假裝下載成功。
        </p>
      </section>
    </div>
  );
};
