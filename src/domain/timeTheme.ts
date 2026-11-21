import type { ThemePreference, TimePeriod, TimezonePreference } from './types.ts';

export interface TimePeriodInfo {
  period: TimePeriod;
  labelZh: string;
  subtitleZh: string;
  hour: number;
  minute: number;
  /** 0..1 progress within the active period for subtle smooth transitions */
  progress: number;
  formattedTime: string;
  effectiveTimezone: string;
}

export interface ThemePaletteTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgElevated: string;
  borderHairline: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  skyTop: string;
  skyBottom: string;
  horizonGlow: string;
  moonColor: string;
  moonGlow: string;
  seaTop: string;
  seaBottom: string;
  shimmerColor: string;
  starOpacity: number;
  sunOrMoonYPercent: number;
}

const PERIOD_LABELS: Record<TimePeriod, { labelZh: string; subtitleZh: string }> = {
  dawn: { labelZh: '晨光海面', subtitleZh: '05:00 – 10:59 · 深暖灰與晨曦微光' },
  noon: { labelZh: '晴午海平線', subtitleZh: '11:00 – 15:59 · 炭灰與暖白淡金' },
  dusk: { labelZh: '黃昏夕照', subtitleZh: '16:00 – 18:59 · 深褐灰與落日倒影' },
  night: { labelZh: '月夜星海', subtitleZh: '19:00 – 23:59 · 黑底銀輝與靜謐海浪' },
  midnight: { labelZh: '深更月影', subtitleZh: '00:00 – 04:59 · 冷灰深黑與低亮度月光' },
};

export function getZonedHourMinute(
  date: Date,
  timezoneMode: TimezonePreference
): { hour: number; minute: number; effectiveTimezone: string } {
  const effectiveTimezone =
    timezoneMode === 'Asia/Taipei'
      ? 'Asia/Taipei'
      : Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: effectiveTimezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? date.getHours());
  if (hour === 24) hour = 0;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? date.getMinutes());
  return { hour, minute, effectiveTimezone };
}

export function classifyTimePeriod(hour: number, minute: number): { period: TimePeriod; progress: number } {
  const totalMinutes = ((hour % 24) + 24) % 24 * 60 + Math.max(0, Math.min(59, minute));

  // 00:00 - 04:59 (0 .. 299)
  if (totalMinutes < 5 * 60) {
    return { period: 'midnight', progress: totalMinutes / (5 * 60 - 1) };
  }
  // 05:00 - 10:59 (300 .. 659)
  if (totalMinutes < 11 * 60) {
    return { period: 'dawn', progress: (totalMinutes - 5 * 60) / (6 * 60 - 1) };
  }
  // 11:00 - 15:59 (660 .. 959)
  if (totalMinutes < 16 * 60) {
    return { period: 'noon', progress: (totalMinutes - 11 * 60) / (5 * 60 - 1) };
  }
  // 16:00 - 18:59 (960 .. 1139)
  if (totalMinutes < 19 * 60) {
    return { period: 'dusk', progress: (totalMinutes - 16 * 60) / (3 * 60 - 1) };
  }
  // 19:00 - 23:59 (1140 .. 1439)
  return { period: 'night', progress: (totalMinutes - 19 * 60) / (5 * 60 - 1) };
}

export function resolveTimePeriodInfo(
  date: Date,
  timezoneMode: TimezonePreference,
  themeMode: ThemePreference
): TimePeriodInfo {
  const { hour, minute, effectiveTimezone } = getZonedHourMinute(date, timezoneMode);
  const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (themeMode === 'fixed_night') {
    return {
      period: 'night',
      ...PERIOD_LABELS.night,
      hour,
      minute,
      progress: 0.5,
      formattedTime,
      effectiveTimezone,
    };
  }

  if (themeMode !== 'auto') {
    return {
      period: themeMode,
      ...PERIOD_LABELS[themeMode],
      hour,
      minute,
      progress: 0.5,
      formattedTime,
      effectiveTimezone,
    };
  }

  const { period, progress } = classifyTimePeriod(hour, minute);
  return {
    period,
    ...PERIOD_LABELS[period],
    hour,
    minute,
    progress,
    formattedTime,
    effectiveTimezone,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const bl = Math.round(b1 + (b2 - b1) * clamped);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

const PERIOD_ANCHORS: Record<
  TimePeriod,
  { start: ThemePaletteTokens; end: ThemePaletteTokens }
> = {
  dawn: {
    start: {
      bgPrimary: '#1a1918',
      bgSecondary: '#22201e',
      bgElevated: '#2a2724',
      borderHairline: '#3a3530',
      textPrimary: '#f5efe6',
      textSecondary: '#d4cabd',
      textMuted: '#9e9589',
      accent: '#e39b4f',
      accentText: '#1a1510',
      skyTop: '#1c1d22',
      skyBottom: '#3c2e26',
      horizonGlow: '#d98a42',
      moonColor: '#f3d7a3',
      moonGlow: '#d98a42',
      seaTop: '#242224',
      seaBottom: '#161618',
      shimmerColor: '#e8a864',
      starOpacity: 0.35,
      sunOrMoonYPercent: 64,
    },
    end: {
      bgPrimary: '#1c1b1a',
      bgSecondary: '#252321',
      bgElevated: '#2d2a27',
      borderHairline: '#3d3934',
      textPrimary: '#f7f2ea',
      textSecondary: '#dad1c5',
      textMuted: '#a69d91',
      accent: '#e8aa5e',
      accentText: '#1a1510',
      skyTop: '#23262c',
      skyBottom: '#47392c',
      horizonGlow: '#e5a457',
      moonColor: '#f7e5be',
      moonGlow: '#e5a457',
      seaTop: '#27282b',
      seaBottom: '#18181a',
      shimmerColor: '#f0be7a',
      starOpacity: 0.12,
      sunOrMoonYPercent: 44,
    },
  },
  noon: {
    start: {
      bgPrimary: '#1b1d1f',
      bgSecondary: '#232629',
      bgElevated: '#2b2f33',
      borderHairline: '#3b4046',
      textPrimary: '#f5f4f0',
      textSecondary: '#d1d5d9',
      textMuted: '#989fa6',
      accent: '#d8bc78',
      accentText: '#181713',
      skyTop: '#21272e',
      skyBottom: '#353a3d',
      horizonGlow: '#cbb47a',
      moonColor: '#f4ebd0',
      moonGlow: '#d5c28d',
      seaTop: '#252b31',
      seaBottom: '#181b1f',
      shimmerColor: '#e3cf98',
      starOpacity: 0.04,
      sunOrMoonYPercent: 30,
    },
    end: {
      bgPrimary: '#1d1e20',
      bgSecondary: '#25272a',
      bgElevated: '#2e3135',
      borderHairline: '#3e4247',
      textPrimary: '#f5f3ee',
      textSecondary: '#d4d4d0',
      textMuted: '#9c9e99',
      accent: '#dec07c',
      accentText: '#181713',
      skyTop: '#23282e',
      skyBottom: '#3c3b36',
      horizonGlow: '#d6b672',
      moonColor: '#f6e7c2',
      moonGlow: '#dec07c',
      seaTop: '#262b2f',
      seaBottom: '#191b1e',
      shimmerColor: '#e7cf92',
      starOpacity: 0.06,
      sunOrMoonYPercent: 36,
    },
  },
  dusk: {
    start: {
      bgPrimary: '#1b1817',
      bgSecondary: '#241f1d',
      bgElevated: '#2d2623',
      borderHairline: '#403530',
      textPrimary: '#f4ede8',
      textSecondary: '#d6c7be',
      textMuted: '#a29289',
      accent: '#e27d4a',
      accentText: '#1c120d',
      skyTop: '#1f1c24',
      skyBottom: '#4b2d22',
      horizonGlow: '#df7843',
      moonColor: '#f5c79e',
      moonGlow: '#df7843',
      seaTop: '#281f21',
      seaBottom: '#161314',
      shimmerColor: '#e88b59',
      starOpacity: 0.18,
      sunOrMoonYPercent: 52,
    },
    end: {
      bgPrimary: '#171516',
      bgSecondary: '#1f1c1d',
      bgElevated: '#272223',
      borderHairline: '#383031',
      textPrimary: '#f0eae6',
      textSecondary: '#cabec0',
      textMuted: '#94898c',
      accent: '#d67349',
      accentText: '#1c120d',
      skyTop: '#16161e',
      skyBottom: '#362221',
      horizonGlow: '#bd5c3b',
      moonColor: '#e6c5b3',
      moonGlow: '#bd5c3b',
      seaTop: '#1f1b20',
      seaBottom: '#121114',
      shimmerColor: '#cf7452',
      starOpacity: 0.45,
      sunOrMoonYPercent: 68,
    },
  },
  night: {
    start: {
      bgPrimary: '#0c0f14',
      bgSecondary: '#121720',
      bgElevated: '#18202c',
      borderHairline: '#263142',
      textPrimary: '#eef3f8',
      textSecondary: '#c1cbd6',
      textMuted: '#8694a6',
      accent: '#8cbce0',
      accentText: '#0a1017',
      skyTop: '#080b11',
      skyBottom: '#141e2c',
      horizonGlow: '#6f97b8',
      moonColor: '#eef4fa',
      moonGlow: '#9ec4e2',
      seaTop: '#111a26',
      seaBottom: '#090d13',
      shimmerColor: '#c9ddec',
      starOpacity: 0.78,
      sunOrMoonYPercent: 34,
    },
    end: {
      bgPrimary: '#0a0d11',
      bgSecondary: '#10141b',
      bgElevated: '#161c25',
      borderHairline: '#232c3a',
      textPrimary: '#e9eff6',
      textSecondary: '#bac4d0',
      textMuted: '#7f8c9d',
      accent: '#98c1e0',
      accentText: '#0a1017',
      skyTop: '#06080d',
      skyBottom: '#111824',
      horizonGlow: '#6083a3',
      moonColor: '#e8eff7',
      moonGlow: '#8db4d6',
      seaTop: '#0f1620',
      seaBottom: '#080b10',
      shimmerColor: '#bfd2e3',
      starOpacity: 0.88,
      sunOrMoonYPercent: 28,
    },
  },
  midnight: {
    start: {
      bgPrimary: '#07090c',
      bgSecondary: '#0c1016',
      bgElevated: '#121720',
      borderHairline: '#1d2430',
      textPrimary: '#dfe6ee',
      textSecondary: '#aeb9c7',
      textMuted: '#737f8e',
      accent: '#859eb5',
      accentText: '#07090c',
      skyTop: '#040609',
      skyBottom: '#0c121b',
      horizonGlow: '#435870',
      moonColor: '#d7e1ec',
      moonGlow: '#6a829c',
      seaTop: '#0b1018',
      seaBottom: '#05070a',
      shimmerColor: '#9fb2c7',
      starOpacity: 0.72,
      sunOrMoonYPercent: 32,
    },
    end: {
      bgPrimary: '#090b0f',
      bgSecondary: '#0f131a',
      bgElevated: '#151b24',
      borderHairline: '#212834',
      textPrimary: '#e4eaf1',
      textSecondary: '#b4bfcc',
      textMuted: '#7b8796',
      accent: '#90acc4',
      accentText: '#080b0f',
      skyTop: '#06080c',
      skyBottom: '#111722',
      horizonGlow: '#526880',
      moonColor: '#dde5ee',
      moonGlow: '#758fa8',
      seaTop: '#0e141d',
      seaBottom: '#07090d',
      shimmerColor: '#adbfd1',
      starOpacity: 0.62,
      sunOrMoonYPercent: 42,
    },
  },
};

export function interpolateThemePalette(period: TimePeriod, progress: number): ThemePaletteTokens {
  const { start, end } = PERIOD_ANCHORS[period];
  return {
    bgPrimary: mixHex(start.bgPrimary, end.bgPrimary, progress),
    bgSecondary: mixHex(start.bgSecondary, end.bgSecondary, progress),
    bgElevated: mixHex(start.bgElevated, end.bgElevated, progress),
    borderHairline: mixHex(start.borderHairline, end.borderHairline, progress),
    textPrimary: mixHex(start.textPrimary, end.textPrimary, progress),
    textSecondary: mixHex(start.textSecondary, end.textSecondary, progress),
    textMuted: mixHex(start.textMuted, end.textMuted, progress),
    accent: mixHex(start.accent, end.accent, progress),
    accentText: mixHex(start.accentText, end.accentText, progress),
    skyTop: mixHex(start.skyTop, end.skyTop, progress),
    skyBottom: mixHex(start.skyBottom, end.skyBottom, progress),
    horizonGlow: mixHex(start.horizonGlow, end.horizonGlow, progress),
    moonColor: mixHex(start.moonColor, end.moonColor, progress),
    moonGlow: mixHex(start.moonGlow, end.moonGlow, progress),
    seaTop: mixHex(start.seaTop, end.seaTop, progress),
    seaBottom: mixHex(start.seaBottom, end.seaBottom, progress),
    shimmerColor: mixHex(start.shimmerColor, end.shimmerColor, progress),
    starOpacity: Number((start.starOpacity + (end.starOpacity - start.starOpacity) * progress).toFixed(2)),
    sunOrMoonYPercent: Number(
      (start.sunOrMoonYPercent + (end.sunOrMoonYPercent - start.sunOrMoonYPercent) * progress).toFixed(1)
    ),
  };
}
