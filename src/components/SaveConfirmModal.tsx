import React, { useEffect, useRef } from 'react';
import { Cloud, Database, HardDrive, Loader2, WifiOff, X } from 'lucide-react';
import type { SaveScopeSummary } from '../context/StudyContext.tsx';

interface SaveConfirmModalProps {
  open: boolean;
  isSaving: boolean;
  scope: SaveScopeSummary;
  lastSavedAt: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  returnFocusTo?: React.RefObject<HTMLButtonElement | null>;
}

export const SaveConfirmModal: React.FC<SaveConfirmModalProps> = ({
  open,
  isSaving,
  scope,
  lastSavedAt,
  onCancel,
  onConfirm,
  returnFocusTo,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);

  // Move focus into dialog on open; restore focus to trigger button on close
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      window.requestAnimationFrame(() => {
        confirmBtnRef.current?.focus();
      });
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusTo?.current?.focus();
    }
  }, [open, returnFocusTo]);

  // Escape & Tab focus trap while modal is open
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isSaving) {
          e.preventDefault();
          onCancel();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusables = [
          closeBtnRef.current,
          cancelBtnRef.current,
          confirmBtnRef.current,
        ].filter((el): el is HTMLButtonElement => Boolean(el && !el.disabled));
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isSaving, onCancel]);

  if (!open) return null;

  const ModeIcon =
    scope.mode === 'authorized_online'
      ? Cloud
      : scope.mode === 'offline_or_unavailable'
      ? WifiOff
      : HardDrive;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-confirm-title"
      aria-describedby="save-confirm-desc"
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs"
        onClick={() => {
          if (!isSaving) onCancel();
        }}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4"
        style={{
          backgroundColor: 'var(--mc-bg-secondary)',
          borderColor: 'var(--mc-border)',
          color: 'var(--mc-text-primary)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
              style={{
                backgroundColor: 'var(--mc-bg-elevated)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-accent)',
              }}
            >
              <Database className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id="save-confirm-title" className="text-base font-semibold tracking-tight">
                確認儲存
              </h2>
              <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--mc-text-muted)' }}>
                <ModeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{scope.modeLabel}</span>
              </p>
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            aria-label="關閉確認儲存視窗"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl hover:bg-white/5 disabled:opacity-40"
            style={{ color: 'var(--mc-text-muted)' }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div
          id="save-confirm-desc"
          className="rounded-xl border p-3.5 space-y-2.5 text-xs leading-relaxed"
          style={{
            backgroundColor: 'var(--mc-bg-primary)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-secondary)',
          }}
        >
          <p>{scope.description}</p>
          <div
            className="border-t pt-2 grid grid-cols-2 gap-2 tabular-nums"
            style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-muted)' }}
          >
            <div>目前題組：{scope.questionSetCount} 組</div>
            <div>已存作答：{scope.answerCount} 筆</div>
            <div>待同步佇列：{scope.pendingCount} 筆</div>
            <div>
              最近確認：{lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('zh-TW') : '尚未確認'}
            </div>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--mc-text-muted)' }}>
          提示：測驗每題送出與簡報改寫均會自動寫入本機；此確認只針對手動儲存／同步檢查，取消不會清除任何既有學習資料。
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            ref={cancelBtnRef}
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border px-4 py-2 text-xs font-medium hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
          >
            取消
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            disabled={isSaving}
            onClick={() => void onConfirm()}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-60"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            <span>{isSaving ? '儲存中…' : '確認儲存'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
