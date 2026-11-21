import React, { useState } from 'react';
import { Download, ExternalLink, LogIn, LogOut, Smartphone } from 'lucide-react';
import { useStudy } from '../context/StudyContext.tsx';
import type { FontSizeScale, ThemePreference, TimePeriod, TimezonePreference } from '../domain/types.ts';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

const PERIOD_OPTIONS: Array<{ value: TimePeriod; label: string }> = [
  { value: 'dawn', label: '晨曦 Dawn (05:00–10:59)' },
  { value: 'noon', label: '晴午 Noon (11:00–15:59)' },
  { value: 'dusk', label: '暮霞 Dusk (16:00–18:59)' },
  { value: 'night', label: '深海夜航 Night (19:00–23:59)' },
  { value: 'midnight', label: '子夜靜海 Midnight (00:00–04:59)' },
];

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, timeInfo, syncAuth, refreshSyncAuth } = useStudy();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  const callbackUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback` : '/api/auth/callback';

  const handleGitHubLogin = async () => {
    setAuthMsg(null);
    const res = await fetch('/api/auth/login-url', { credentials: 'include' });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setAuthMsg(data.error ?? '無法取得 GitHub OAuth 登入網址');
      return;
    }
    window.open(data.url, 'mooncode-gh-oauth', 'width=640,height=740,noopener');
  };

  const handleGitHubLogout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-MoonCode-CSRF': '1' },
    });
    await refreshSyncAuth();
    setAuthMsg('已安全登出 GitHub 同步工作階段（本機資料完整保留）。');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">學習室設定與連線管理</h1>
        <p className="text-xs" style={{ color: 'var(--mc-text-secondary)' }}>
          偏好設定儲存於本機 localStorage，不含任何機密憑證。
        </p>
      </header>

      {/* General & Brand Settings */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <h2 className="text-base font-semibold">顯示與學習室基本設定</h2>

        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <label className="block space-y-1">
            <span style={{ color: 'var(--mc-text-secondary)' }}>學習室名稱</span>
            <input
              type="text"
              value={settings.appName}
              maxLength={60}
              onChange={(e) => updateSettings({ appName: e.target.value || 'MoonCode 月海程式學習室' })}
              className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'var(--mc-bg-primary)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            />
          </label>

          <label className="block space-y-1">
            <span style={{ color: 'var(--mc-text-secondary)' }}>AI 出題去重參考近期題數（5–50）</span>
            <input
              type="number"
              min={5}
              max={50}
              value={settings.recentQuestionTitlesLimit}
              onChange={(e) =>
                updateSettings({
                  recentQuestionTitlesLimit: Math.min(50, Math.max(5, Number(e.target.value) || 20)),
                })
              }
              className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-sm tabular-nums"
              style={{
                backgroundColor: 'var(--mc-bg-primary)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            />
          </label>

          <label className="block space-y-1">
            <span style={{ color: 'var(--mc-text-secondary)' }}>文字縮放</span>
            <select
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: e.target.value as FontSizeScale })}
              className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'var(--mc-bg-elevated)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            >
              <option value="sm">精巧 (sm)</option>
              <option value="md">標準閱讀 (md)</option>
              <option value="lg">放大護眼 (lg)</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span style={{ color: 'var(--mc-text-secondary)' }}>日夜海面時區基準</span>
            <select
              value={settings.timezoneMode}
              onChange={(e) => updateSettings({ timezoneMode: e.target.value as TimezonePreference })}
              className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'var(--mc-bg-elevated)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            >
              <option value="Asia/Taipei">Asia/Taipei（臺灣標準時間）</option>
              <option value="device">跟隨目前裝置本機時區</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs pt-1">
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
          />
          <span>停用海面波紋與光影微動畫（降低動態干擾 / Reduced Motion）</span>
        </label>
      </section>

      {/* 5-Time-Period Ocean Theme Preview */}
      <section
        className="rounded-2xl border p-5 space-y-3"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">五時段月海氛圍與手動預覽</h2>
          <span className="text-xs tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
            目前顯示：{timeInfo.labelZh}（{timeInfo.formattedTime}）
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--mc-text-muted)' }}>
          自動模式下會隨一天 5 個時段平滑微調天空與海面色溫，程式碼編輯區則固定保持低彩度護眼藍青配色。
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateSettings({ themeMode: 'auto' })}
            className="min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: settings.themeMode === 'auto' ? 'var(--mc-accent)' : 'var(--mc-bg-elevated)',
              color: settings.themeMode === 'auto' ? 'var(--mc-accent-text)' : 'var(--mc-text-secondary)',
              borderColor: settings.themeMode === 'auto' ? 'var(--mc-accent)' : 'var(--mc-border)',
            }}
          >
            自動跟隨時間
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ themeMode: 'fixed_night' })}
            className="min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor:
                settings.themeMode === 'fixed_night' ? 'var(--mc-accent)' : 'var(--mc-bg-elevated)',
              color:
                settings.themeMode === 'fixed_night' ? 'var(--mc-accent-text)' : 'var(--mc-text-secondary)',
              borderColor:
                settings.themeMode === 'fixed_night' ? 'var(--mc-accent)' : 'var(--mc-border)',
            }}
          >
            固定深海夜間
          </button>
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => updateSettings({ themeMode: p.value as ThemePreference })}
              className="min-h-[38px] rounded-xl border px-3 py-1.5 text-xs"
              style={{
                backgroundColor:
                  settings.themeMode === p.value ? 'var(--mc-accent)' : 'var(--mc-bg-elevated)',
                color:
                  settings.themeMode === p.value ? 'var(--mc-accent-text)' : 'var(--mc-text-secondary)',
                borderColor:
                  settings.themeMode === p.value ? 'var(--mc-accent)' : 'var(--mc-border)',
              }}
            >
              預覽：{p.label}
            </button>
          ))}
        </div>
      </section>

      {/* PWA Installation */}
      <section
        className="rounded-2xl border p-5 space-y-3"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4" style={{ color: 'var(--mc-accent)' }} aria-hidden="true" />
          <h2 className="text-base font-semibold">安裝為桌面或手機離線應用程式 (PWA)</h2>
        </div>
        {isInstalled ? (
          <p className="text-xs" style={{ color: '#7fd1a8' }}>
            目前已安裝為獨立應用程式視窗模式，支援離線閱讀與測驗。
          </p>
        ) : isInstallable ? (
          <button
            type="button"
            onClick={() => void install()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>安裝 MoonCode 至主畫面</span>
          </button>
        ) : isIOS ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
            iOS Safari 安裝步驟：點擊下方工具列的「分享」圖示 → 向下捲動選擇「加入主畫面」→ 點擊「新增」即可於全螢幕離線開啟。
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--mc-text-muted)' }}>
            若使用 Chrome／Edge 瀏覽器，可從網址列右側安裝圖示將本網站加入桌面；離線快取已於背景就緒。
          </p>
        )}
      </section>

      {/* GitHub App Sync & OAuth Setup */}
      <section
        className="rounded-2xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <h2 className="text-base font-semibold">GitHub 私有資料倉庫同步連線</h2>

        <div className="text-xs space-y-1.5" style={{ color: 'var(--mc-text-secondary)' }}>
          <p>
            伺服器設定狀態：
            <strong>
              {!syncAuth.configured
                ? '本機模式（未配置 GitHub App 伺服器環境變數）'
                : syncAuth.authenticated
                ? `已連線登入 (${syncAuth.user?.login} · 倉庫 ${syncAuth.targetRepo}@${syncAuth.branch})`
                : '伺服器已配置 GitHub App，尚未登入授權'}
            </strong>
          </p>
          <p style={{ color: 'var(--mc-text-muted)' }}>
            GitHub App 設定專用 Callback URL：<code className="font-mono select-all">{callbackUrl}</code>
          </p>
          <p style={{ color: 'var(--mc-text-muted)' }}>
            裝置識別碼 (deviceId)：<code className="font-mono">{settings.deviceId}</code>
          </p>
        </div>

        {authMsg && (
          <p className="text-xs" style={{ color: 'var(--mc-accent)' }}>
            {authMsg}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {syncAuth.configured && !syncAuth.authenticated && (
            <button
              type="button"
              onClick={() => void handleGitHubLogin()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>使用 GitHub 帳號登入授權</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {syncAuth.authenticated && (
            <button
              type="button"
              onClick={() => void handleGitHubLogout()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium"
              style={{ borderColor: 'var(--mc-border)' }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>中斷此瀏覽器登入狀態</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
