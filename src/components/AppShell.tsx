import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
  FileWarning,
  Home,
  Layers,
  Loader2,
  Menu,
  RefreshCw,
  Save,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import { CANONICAL_CHAPTERS } from '../data/curriculum/index.ts';
import { useStudy } from '../context/StudyContext.tsx';
import { BrandLogo } from './BrandLogo.tsx';
import { SaveConfirmModal } from './SaveConfirmModal.tsx';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const {
    settings,
    updateSettings,
    saveStatus,
    saveStatusMessage,
    isSaving,
    lastSavedAt,
    saveScopeSummary,
    saveFeedback,
    clearSaveFeedback,
    handlePrimarySave,
    isOnline,
    pendingAiCount,
  } = useStudy();
  const location = useLocation();

  // Desktop uses settings.sidebarOpen; Mobile drawer starts closed
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);

  // Register PWA Service Worker with explicit prompt on update (Spec 18.8)
  useEffect(() => {
    let active = true;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (!active) return;
        const updateSW = registerSW({
          onNeedRefresh() {
            setUpdateAvailable(true);
          },
          onOfflineReady() {
            // App shell cached cleanly
          },
        });
        updateFnRef.current = updateSW;
      })
      .catch(() => {
        // Ignore in test or non-PWA dev mode
      });
    return () => {
      active = false;
    };
  }, []);

  // Close mobile drawer automatically on route change (Spec 3.10)
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  // Escape closes mobile drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileDrawerOpen]);

  const handleHamburger = () => {
    if (window.innerWidth < 1024) {
      setMobileDrawerOpen((v) => !v);
    } else {
      updateSettings({ sidebarOpen: !settings.sidebarOpen });
    }
  };

  const navItems = [
    { to: '/', label: '首頁總覽', icon: Home },
    { to: '/bank', label: '題庫瀏覽', icon: Layers },
    { to: '/wrong-book', label: '錯題本', icon: FileWarning },
    { to: '/mastery', label: '掌握度', icon: BarChart3 },
    {
      to: '/ai',
      label: pendingAiCount > 0 ? `AI 工作台 (${pendingAiCount} 待評)` : 'AI 工作台',
      icon: Bot,
    },
    { to: '/storage', label: '儲存與版本', icon: Database },
    { to: '/docs', label: '系統文件下載', icon: FileText },
    { to: '/settings', label: '設定', icon: Settings },
  ];

  const isRouteActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const SidebarContent = (
    <nav aria-label="學習室主要導覽" className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
            學習導覽
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileDrawerOpen(false)}
                className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--mc-bg-elevated)' : 'transparent',
                  color: active ? 'var(--mc-text-primary)' : 'var(--mc-text-secondary)',
                }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="space-y-1 border-t pt-4" style={{ borderColor: 'var(--mc-border)' }}>
          <p className="px-3 pb-1 text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
            C# OOP 與 MVC 教材（9 章）
          </p>
          {CANONICAL_CHAPTERS.map((ch) => {
            const to = `/chapters/${ch.chapterId}`;
            const active = location.pathname === to;
            return (
              <Link
                key={ch.chapterId}
                to={to}
                onClick={() => setMobileDrawerOpen(false)}
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors"
                style={{
                  backgroundColor: active ? 'var(--mc-bg-elevated)' : 'transparent',
                  color: active ? 'var(--mc-text-primary)' : 'var(--mc-text-secondary)',
                }}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <BookOpen className="h-4 w-4 shrink-0 opacity-75" aria-hidden="true" />
                  <span className="truncate">
                    {ch.order}. {ch.titleZh}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6 border-t pt-4 text-xs" style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-muted)' }}>
        <p className="truncate">{settings.appName}</p>
        <p className="mt-1">本機離線優先 · 手動 AI JSON</p>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--mc-bg-primary)' }}>
      {/* Top Bar */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--mc-bg-primary) 88%, transparent)',
          borderColor: 'var(--mc-border)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-3 sm:px-6">
          {/* Left: Hamburger + Brand */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleHamburger}
              aria-label="切換章節與功能導覽選單"
              aria-expanded={mobileDrawerOpen || settings.sidebarOpen}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-primary)' }}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link to="/" className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
              <BrandLogo size={28} className="shrink-0" />
              <span
                className="truncate text-base font-semibold tracking-tight"
                style={{ color: 'var(--mc-text-primary)' }}
              >
                {settings.appName}
              </span>
            </Link>
          </div>

          {/* Right: Quiet save status + Primary Save button */}
          <div className="flex shrink-0 items-center gap-3">
            <span
              className="hidden sm:inline-block max-w-[280px] truncate text-xs"
              style={{
                color:
                  saveStatus === 'sync_failed' || saveStatus === 'conflict_quarantine'
                    ? '#f5b482'
                    : 'var(--mc-text-muted)',
              }}
              title={
                lastSavedAt
                  ? `${saveStatusMessage} · 最近儲存 ${new Date(lastSavedAt).toLocaleTimeString('zh-TW')}`
                  : saveStatusMessage
              }
            >
              {saveStatusMessage}
              {lastSavedAt && !isSaving ? ` · ${new Date(lastSavedAt).toLocaleTimeString('zh-TW')}` : ''}
            </span>
            <button
              ref={saveBtnRef}
              type="button"
              onClick={() => setSaveConfirmOpen(true)}
              disabled={isSaving || saveStatus === 'syncing'}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-60 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--mc-accent)',
                color: 'var(--mc-accent-text)',
              }}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{isSaving || saveStatus === 'syncing' ? '儲存中…' : '儲存'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Manual Save Result Feedback Banner */}
      {saveFeedback && (
        <div
          role={
            saveFeedback.kind === 'save_failed' || saveFeedback.kind === 'saved_local_unsynced'
              ? 'alert'
              : 'status'
          }
          aria-live={
            saveFeedback.kind === 'save_failed' || saveFeedback.kind === 'saved_local_unsynced'
              ? 'assertive'
              : 'polite'
          }
          className="border-b px-4 py-3 text-xs"
          style={{
            backgroundColor:
              saveFeedback.kind === 'save_failed'
                ? 'rgba(180,60,50,0.18)'
                : saveFeedback.kind === 'saved_local_unsynced'
                ? 'rgba(212,124,93,0.14)'
                : 'var(--mc-bg-elevated)',
            borderColor:
              saveFeedback.kind === 'save_failed' || saveFeedback.kind === 'saved_local_unsynced'
                ? '#d47c5d'
                : 'var(--mc-accent)',
            color: 'var(--mc-text-primary)',
          }}
        >
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              {saveFeedback.kind === 'save_failed' ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f5b482]" aria-hidden="true" />
              ) : saveFeedback.kind === 'saved_local_unsynced' ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f5b482]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#7fd1a8]" aria-hidden="true" />
              )}
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold">
                  {saveFeedback.title}
                  {saveFeedback.savedAt && (
                    <span className="ml-2 font-normal tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
                      （時間：{new Date(saveFeedback.savedAt).toLocaleTimeString('zh-TW')}）
                    </span>
                  )}
                </p>
                <p className="leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
                  {saveFeedback.detail}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {saveFeedback.canRetry && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handlePrimarySave()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-3 py-1 font-medium hover:bg-white/5 disabled:opacity-50"
                  style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-primary)' }}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{saveFeedback.localSaved ? '重試同步' : '重試儲存'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={clearSaveFeedback}
                aria-label="關閉儲存通知"
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 py-1 hover:bg-white/5"
                style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>關閉</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline or App Update Notices */}
      {!isOnline && (
        <div
          role="status"
          className="border-b px-4 py-2 text-xs flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--mc-bg-secondary)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-secondary)',
          }}
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>目前為離線狀態：可正常閱讀已快取教材與作答測驗，資料已保存本機。</span>
        </div>
      )}

      {updateAvailable && (
        <div
          role="alert"
          className="border-b px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--mc-bg-elevated)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-primary)',
          }}
        >
          <span>發現新版本網站資源，重新載入即可更新（不影響您的本機 IndexedDB 學習資料）。</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void updateFnRef.current?.(true)}
              className="rounded-lg px-3 py-1.5 font-medium"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              立即更新
            </button>
            <button
              type="button"
              onClick={() => setUpdateAvailable(false)}
              className="rounded-lg border px-3 py-1.5"
              style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
            >
              稍後
            </button>
          </div>
        </div>
      )}

      {/* Main Layout: Desktop Collapsible Sidebar + Content */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        {settings.sidebarOpen && (
          <aside
            className="hidden lg:block w-[264px] shrink-0 border-r overflow-y-auto"
            style={{
              backgroundColor: 'var(--mc-bg-secondary)',
              borderColor: 'var(--mc-border)',
            }}
          >
            {SidebarContent}
          </aside>
        )}

        {/* Mobile Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="章節導覽抽屜">
            <div
              className="fixed inset-0 bg-black/65"
              onClick={() => setMobileDrawerOpen(false)}
              aria-hidden="true"
            />
            <aside
              className="relative z-10 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto border-r"
              style={{
                backgroundColor: 'var(--mc-bg-secondary)',
                borderColor: 'var(--mc-border)',
              }}
            >
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{ borderColor: 'var(--mc-border)' }}
              >
                <span className="text-sm font-semibold">{settings.appName}</span>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="關閉導覽選單"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-white/5"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{SidebarContent}</div>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <SaveConfirmModal
        open={saveConfirmOpen}
        isSaving={isSaving}
        scope={saveScopeSummary}
        lastSavedAt={lastSavedAt}
        returnFocusTo={saveBtnRef}
        onCancel={() => {
          if (!isSaving) setSaveConfirmOpen(false);
        }}
        onConfirm={async () => {
          await handlePrimarySave();
          setSaveConfirmOpen(false);
        }}
      />
    </div>
  );
};
