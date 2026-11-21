import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ALL_CONCEPTS,
  CANONICAL_CHAPTERS,
  CHAPTERS_BY_ID,
} from '../data/curriculum/index.ts';
import {
  computeChapterMastery,
  computeConceptMastery,
  computeSpacedReviewQueue,
} from '../domain/mastery.ts';
import {
  interpolateThemePalette,
  resolveTimePeriodInfo,
  type TimePeriodInfo,
} from '../domain/timeTheme.ts';
import type {
  AppSettings,
  ChapterMasterySummary,
  MasterySummary,
  ReviewItem,
  SaveSyncStatus,
  WrongBookEntry,
} from '../domain/types.ts';
import { useOnlineStatus } from '../hooks/usePWAInstall.ts';
import { loadAppSettings, saveAppSettings } from '../storage/settings.ts';
import {
  type LocalStoreSnapshot,
  httpRemoteAdapter,
  loadLocalSnapshot,
  runCloudSave,
} from '../storage/studyStore.ts';

export interface SyncAuthState {
  configured: boolean;
  authenticated: boolean;
  user?: { id: string; login: string };
  targetRepo?: string;
  branch?: string;
}

interface StudyContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  snapshot: LocalStoreSnapshot | null;
  loading: boolean;
  loadError: string | null;
  reloadSnapshot: () => Promise<void>;
  timeInfo: TimePeriodInfo;
  isOnline: boolean;
  syncAuth: SyncAuthState;
  refreshSyncAuth: () => Promise<void>;
  saveStatus: SaveSyncStatus;
  saveStatusMessage: string;
  handlePrimarySave: () => Promise<void>;
  conceptMasteries: MasterySummary[];
  chapterMasteries: ChapterMasterySummary[];
  dueReviews: ReviewItem[];
  wrongBookEntries: WrongBookEntry[];
  pendingAiCount: number;
}

const StudyContext = createContext<StudyContextValue | null>(null);

export const StudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [snapshot, setSnapshot] = useState<LocalStoreSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isDocHidden, setIsDocHidden] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  );
  const isOnline = useOnlineStatus();

  const [syncAuth, setSyncAuth] = useState<SyncAuthState>({
    configured: false,
    authenticated: false,
  });
  const [saveStatus, setSaveStatus] = useState<SaveSyncStatus>('local_only');
  const [saveStatusMessage, setSaveStatusMessage] = useState('本機模式');

  const reloadSnapshot = useCallback(async () => {
    try {
      const data = await loadLocalSnapshot();
      setSnapshot(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '無法讀取本機學習資料庫');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSyncAuth = useCallback(async () => {
    if (!navigator.onLine) {
      httpRemoteAdapter.isConfigured = false;
      setSyncAuth((prev) => ({ ...prev, authenticated: false }));
      return;
    }
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as SyncAuthState;
      httpRemoteAdapter.isConfigured = Boolean(data.configured && data.authenticated);
      setSyncAuth(data);
    } catch {
      httpRemoteAdapter.isConfigured = false;
    }
  }, []);

  useEffect(() => {
    void reloadSnapshot();
    void refreshSyncAuth();
  }, [reloadSnapshot, refreshSyncAuth]);

  // BroadcastChannel multi-tab sync notification
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('mooncode-sync-events');
    ch.onmessage = () => {
      void reloadSnapshot();
    };
    return () => ch.close();
  }, [reloadSnapshot]);

  // Listen for OAuth popup completion
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MOONCODE_GITHUB_AUTH_SUCCESS') {
        void refreshSyncAuth();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshSyncAuth]);

  // Minute-level clock tick + visibility pause
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
      }
    }, 60_000);

    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      setIsDocHidden(hidden);
      if (!hidden) {
        setNow(new Date());
        void refreshSyncAuth();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshSyncAuth]);

  const timeInfo = useMemo(
    () => resolveTimePeriodInfo(now, settings.timezoneMode, settings.themeMode),
    [now, settings.timezoneMode, settings.themeMode]
  );

  // Apply CSS custom properties whenever themeInfo, fontScale, or reducedMotion changes
  useEffect(() => {
    const root = document.documentElement;
    const palette = interpolateThemePalette(timeInfo.period, timeInfo.progress);
    root.style.setProperty('--mc-bg-primary', palette.bgPrimary);
    root.style.setProperty('--mc-bg-secondary', palette.bgSecondary);
    root.style.setProperty('--mc-bg-elevated', palette.bgElevated);
    root.style.setProperty('--mc-border', palette.borderHairline);
    root.style.setProperty('--mc-text-primary', palette.textPrimary);
    root.style.setProperty('--mc-text-secondary', palette.textSecondary);
    root.style.setProperty('--mc-text-muted', palette.textMuted);
    root.style.setProperty('--mc-accent', palette.accent);
    root.style.setProperty('--mc-accent-text', palette.accentText);
    root.style.setProperty('--mc-sky-top', palette.skyTop);
    root.style.setProperty('--mc-sky-bottom', palette.skyBottom);
    root.style.setProperty('--mc-horizon-glow', palette.horizonGlow);
    root.style.setProperty('--mc-moon-color', palette.moonColor);
    root.style.setProperty('--mc-moon-glow', palette.moonGlow);
    root.style.setProperty('--mc-sea-top', palette.seaTop);
    root.style.setProperty('--mc-sea-bottom', palette.seaBottom);
    root.style.setProperty('--mc-shimmer', palette.shimmerColor);
    root.style.setProperty('--mc-star-opacity', String(palette.starOpacity));
    root.style.setProperty('--mc-moon-y', String(palette.sunOrMoonYPercent));

    const fontScale = settings.fontSize === 'sm' ? '0.93' : settings.fontSize === 'lg' ? '1.1' : '1';
    root.style.setProperty('--mc-font-scale', fontScale);

    root.classList.toggle('mc-reduced-motion', settings.reducedMotion);
    root.classList.toggle('mc-paused', isDocHidden);
  }, [timeInfo, settings.fontSize, settings.reducedMotion, isDocHidden]);

  // Derive saveStatus cleanly from real state
  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.quarantined.length > 0) {
      setSaveStatus('conflict_quarantine');
      setSaveStatusMessage(`隔離區 ${snapshot.quarantined.length} 筆待確認`);
      return;
    }
    if (!syncAuth.configured || !syncAuth.authenticated) {
      setSaveStatus(snapshot.pendingOutbox.length > 0 ? 'saved_local' : 'local_only');
      setSaveStatusMessage(
        snapshot.pendingOutbox.length > 0
          ? `本機模式 · 已存 ${snapshot.pendingOutbox.length} 筆`
          : '本機模式'
      );
      return;
    }
    if (!isOnline) {
      setSaveStatus('saved_local');
      setSaveStatusMessage(
        snapshot.pendingOutbox.length > 0
          ? `離線已存本機 · 待同步 ${snapshot.pendingOutbox.length}`
          : '離線本機保留'
      );
      return;
    }
    if (snapshot.pendingOutbox.length > 0) {
      setSaveStatus('pending_sync');
      setSaveStatusMessage(`待同步 ${snapshot.pendingOutbox.length} 筆`);
    } else if (snapshot.pointer?.active) {
      setSaveStatus('synced');
      setSaveStatusMessage(`已同步 v${snapshot.generation}`);
    } else {
      setSaveStatus('saved_local');
      setSaveStatusMessage('已儲存本機');
    }
  }, [snapshot, syncAuth, isOnline]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      saveAppSettings(next);
      return next;
    });
  }, []);

  const handlePrimarySave = useCallback(async () => {
    await reloadSnapshot();
    if (!isOnline) {
      setSaveStatus('saved_local');
      setSaveStatusMessage('目前離線，已確保資料安全寫入本機 IndexedDB');
      return;
    }
    if (!syncAuth.configured || !syncAuth.authenticated) {
      setSaveStatus('saved_local');
      setSaveStatusMessage('已儲存本機（本機模式：未連線 GitHub 倉庫）');
      return;
    }
    setSaveStatus('syncing');
    setSaveStatusMessage('安全同步中…');
    const outcome = await runCloudSave(settings.deviceId, httpRemoteAdapter);
    await reloadSnapshot();
    if (outcome.ok) {
      setSaveStatus('synced');
      setSaveStatusMessage(outcome.message);
    } else if (outcome.status === 'conflict_quarantine') {
      setSaveStatus('conflict_quarantine');
      setSaveStatusMessage(outcome.message);
    } else {
      setSaveStatus('sync_failed');
      setSaveStatusMessage(outcome.message);
    }
  }, [isOnline, reloadSnapshot, settings.deviceId, syncAuth]);

  const conceptMasteries = useMemo(() => {
    if (!snapshot) return [];
    return computeConceptMastery(
      ALL_CONCEPTS,
      snapshot.answers,
      snapshot.evaluations,
      snapshot.tombstones
    );
  }, [snapshot]);

  const chapterMasteries = useMemo(() => {
    return computeChapterMastery(CANONICAL_CHAPTERS, conceptMasteries);
  }, [conceptMasteries]);

  const dueReviews = useMemo(() => {
    if (!snapshot) return [];
    return computeSpacedReviewQueue(
      ALL_CONCEPTS,
      snapshot.answers,
      snapshot.evaluations,
      snapshot.tombstones,
      conceptMasteries
    );
  }, [snapshot, conceptMasteries]);

  const wrongBookEntries = useMemo<WrongBookEntry[]>(() => {
    if (!snapshot) return [];
    const runMap = new Map(snapshot.testRuns.map((r) => [r.testRunId, r]));
    const evalMap = new Map(
      snapshot.evaluations.filter((e) => !e.invalidated).map((e) => [e.answerId, e])
    );
    const hiddenIds = new Set(
      snapshot.tombstones.filter((t) => t.mode === 'hide_wrong_book').map((t) => t.targetId)
    );
    const resetIds = new Set(
      snapshot.tombstones.filter((t) => t.mode === 'reset_record').map((t) => t.targetId)
    );

    // Group all answers by questionId to build retryHistory
    const byQuestion = new Map<string, WrongBookEntry['retryHistory']>();
    const sortedAnswers = [...snapshot.answers]
      .filter((a) => !a.invalidated && !resetIds.has(a.answerId) && !resetIds.has(a.testRunId))
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    for (const a of sortedAnswers) {
      const list = byQuestion.get(a.questionId) ?? [];
      list.push({
        answerId: a.answerId,
        submittedAt: a.submittedAt,
        correct: a.correct,
        status: a.status,
      });
      byQuestion.set(a.questionId, list);
    }

    const entries: WrongBookEntry[] = [];
    for (const a of sortedAnswers) {
      if (a.status !== 'graded' || a.correct !== false) continue; // Only confirmed wrong records (never pending_ai!)
      const run = runMap.get(a.testRunId);
      const snap = run?.questionSnapshots[a.questionIndex];
      if (!snap) continue;

      const ev = evalMap.get(a.answerId);
      const userAnswerDisplay =
        a.type === 'single_choice'
          ? snap.options?.[a.selectedShuffledIndex ?? 0] ?? '(已選選項)'
          : a.textAnswer ?? '';
      const referenceAnswerDisplay =
        a.type === 'single_choice'
          ? snap.options?.[snap.correctShuffledIndex ?? 0] ?? ''
          : ev?.referenceAnswer ?? snap.referenceAnswer ?? '';

      entries.push({
        answerId: a.answerId,
        testRunId: a.testRunId,
        setId: a.setId,
        chapterId: a.chapterId,
        questionId: a.questionId,
        questionVersion: a.questionVersion,
        primaryConceptId: a.primaryConceptId,
        prompt: snap.prompt,
        codeSnippet: snap.codeSnippet,
        type: a.type,
        submittedAt: a.submittedAt,
        correct: false,
        explanation: ev ? `${ev.reason}\n\n${snap.explanation}` : snap.explanation,
        userAnswerDisplay,
        referenceAnswerDisplay,
        hiddenFromWrongBook: hiddenIds.has(a.answerId) || hiddenIds.has(a.questionId),
        retryHistory: byQuestion.get(a.questionId) ?? [],
      });
    }

    return entries.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [snapshot]);

  const pendingAiCount = useMemo(() => {
    if (!snapshot) return 0;
    const resetIds = new Set(
      snapshot.tombstones.filter((t) => t.mode === 'reset_record').map((t) => t.targetId)
    );
    return snapshot.answers.filter(
      (a) =>
        !a.invalidated &&
        !resetIds.has(a.answerId) &&
        !resetIds.has(a.testRunId) &&
        a.status === 'pending_ai'
    ).length;
  }, [snapshot]);

  // Touch CHAPTERS_BY_ID to avoid dead import if needed elsewhere
  void CHAPTERS_BY_ID;

  return (
    <StudyContext.Provider
      value={{
        settings,
        updateSettings,
        snapshot,
        loading,
        loadError,
        reloadSnapshot,
        timeInfo,
        isOnline,
        syncAuth,
        refreshSyncAuth,
        saveStatus,
        saveStatusMessage,
        handlePrimarySave,
        conceptMasteries,
        chapterMasteries,
        dueReviews,
        wrongBookEntries,
        pendingAiCount,
      }}
    >
      {children}
    </StudyContext.Provider>
  );
};

export function useStudy(): StudyContextValue {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy must be used inside StudyProvider');
  return ctx;
}
