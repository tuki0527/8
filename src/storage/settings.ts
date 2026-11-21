import { generateUuid } from '../domain/hash.ts';
import type { AppSettings } from '../domain/types.ts';
import { AppSettingsSchema } from '../schemas/runtimeSchemas.ts';

const SETTINGS_KEY = 'mooncode.app_settings.v1';

export function createDefaultSettings(): AppSettings {
  return {
    format: 'mooncode.settings',
    schemaVersion: 1,
    appName: 'MoonCode 月海程式學習室',
    timezoneMode: 'Asia/Taipei',
    themeMode: 'auto',
    reducedMotion: false,
    fontSize: 'md',
    deviceId: `dev-${generateUuid().slice(0, 8)}`,
    recentQuestionTitlesLimit: 50,
    sidebarOpen: true,
    updatedAt: new Date().toISOString(),
  };
}

export function loadAppSettings(): AppSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createDefaultSettings();
    }
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const defaults = createDefaultSettings();
      saveAppSettings(defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    const result = AppSettingsSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    const defaults = createDefaultSettings();
    saveAppSettings(defaults);
    return defaults;
  } catch {
    return createDefaultSettings();
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch {
    // Ignore private mode / storage quota failures for non-critical UI preferences
  }
}
