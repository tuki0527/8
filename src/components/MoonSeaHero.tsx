import React from 'react';
import { interpolateThemePalette, type TimePeriodInfo } from '../domain/timeTheme.ts';

interface MoonSeaHeroProps {
  timeInfo: TimePeriodInfo;
  title: string;
  subtitle: string;
  compact?: boolean;
  rightSlot?: React.ReactNode;
}

const STARS = [
  { x: 110, y: 26, r: 1.4 },
  { x: 195, y: 44, r: 1.1 },
  { x: 280, y: 20, r: 1.6 },
  { x: 375, y: 52, r: 1.0 },
  { x: 480, y: 28, r: 1.5 },
  { x: 560, y: 46, r: 1.1 },
  { x: 675, y: 22, r: 1.3 },
  { x: 760, y: 40, r: 1.7 },
  { x: 870, y: 30, r: 1.2 },
  { x: 980, y: 48, r: 1.4 },
  { x: 1090, y: 24, r: 1.1 },
];

export const MoonSeaHero: React.FC<MoonSeaHeroProps> = ({
  timeInfo,
  title,
  subtitle,
  compact = false,
  rightSlot,
}) => {
  const palette = interpolateThemePalette(timeInfo.period, timeInfo.progress);
  const moonCy = 26 + ((palette.sunOrMoonYPercent - 28) / 40) * 44;

  return (
    <section
      aria-label="月海主視覺橫幅"
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'var(--mc-border)',
        background: 'linear-gradient(180deg, var(--mc-sky-top) 0%, var(--mc-sky-bottom) 62%, var(--mc-sea-top) 62%, var(--mc-sea-bottom) 100%)',
      }}
    >
      {/* Original SVG Ocean, Moon, Stars & Light Rays */}
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id="mc-hero-moon-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--mc-moon-glow)" stopOpacity="0.42" />
            <stop offset="65%" stopColor="var(--mc-horizon-glow)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--mc-sky-bottom)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mc-hero-horizon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mc-horizon-glow)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--mc-sea-bottom)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Stars */}
        <g style={{ opacity: 'var(--mc-star-opacity)' }}>
          {STARS.map((s, idx) => (
            <circle key={idx} cx={s.x} cy={s.y} r={s.r} fill="var(--mc-moon-color)" />
          ))}
        </g>

        {/* Moon halo & crescent */}
        <circle cx="940" cy={moonCy} r="78" fill="url(#mc-hero-moon-glow)" />
        {timeInfo.period === 'noon' || timeInfo.period === 'dawn' ? (
          <circle cx="940" cy={moonCy} r="22" fill="var(--mc-moon-color)" opacity="0.92" />
        ) : (
          <path
            d={`M ${944} ${moonCy - 23} a 23 23 0 1 0 18 37 A 18.5 18.5 0 0 1 ${944} ${moonCy - 23} Z`}
            fill="var(--mc-moon-color)"
          />
        )}

        {/* Horizon line & light wash */}
        <rect x="0" y="148" width="1200" height="92" fill="url(#mc-hero-horizon)" />
        <line
          x1="0"
          y1="148"
          x2="1200"
          y2="148"
          stroke="var(--mc-horizon-glow)"
          strokeOpacity="0.45"
          strokeWidth="1.2"
        />

        {/* Light reflection column on sea */}
        <g className="mc-animate-shimmer" style={{ transformOrigin: '940px 185px' }}>
          <ellipse cx="940" cy="162" rx="52" ry="3.5" fill="var(--mc-shimmer)" opacity="0.35" />
          <ellipse cx="940" cy="176" rx="38" ry="2.8" fill="var(--mc-shimmer)" opacity="0.28" />
          <ellipse cx="940" cy="192" rx="28" ry="2.2" fill="var(--mc-shimmer)" opacity="0.22" />
          <ellipse cx="940" cy="210" rx="18" ry="1.8" fill="var(--mc-shimmer)" opacity="0.18" />
        </g>

        {/* Subtle sea wave contours */}
        <g className="mc-animate-wave" opacity="0.35">
          <path
            d="M-30 168 Q 120 163 270 168 T 570 168 T 870 168 T 1230 168"
            fill="none"
            stroke="var(--mc-shimmer)"
            strokeWidth="1"
          />
          <path
            d="M-20 198 Q 160 193 340 198 T 700 198 T 1060 198 T 1260 198"
            fill="none"
            stroke="var(--mc-horizon-glow)"
            strokeWidth="1"
          />
        </g>
      </svg>

      {/* Contrast Scrim & Foreground Content */}
      <div
        className={`relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${
          compact ? 'px-5 py-6 md:px-7 md:py-7' : 'px-5 py-7 md:px-8 md:py-9'
        }`}
        style={{
          background:
            'linear-gradient(90deg, rgba(8,12,18,0.72) 0%, rgba(8,12,18,0.45) 60%, rgba(8,12,18,0.18) 100%)',
        }}
      >
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-wide" style={{ color: 'var(--mc-text-secondary)' }}>
            <span>{timeInfo.labelZh}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span className="tabular-nums">{timeInfo.formattedTime}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>{timeInfo.effectiveTimezone}</span>
          </p>
          <h1
            className={`mt-2 font-semibold tracking-tight text-balance ${
              compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'
            }`}
            style={{ color: 'var(--mc-text-primary)' }}
          >
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
            {subtitle}
          </p>
        </div>

        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </section>
  );
};
