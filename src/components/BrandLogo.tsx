import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 28, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="MoonCode 月海程式學習室標誌"
      className={className}
    >
      <rect width="128" height="128" rx="28" fill="var(--mc-bg-elevated)" stroke="var(--mc-border)" strokeWidth="3" />
      {/* Left code brace */}
      <path
        d="M40 36c-7 0-10 4-10 11v10c0 4-2.5 7-6.5 7 4 0 6.5 3 6.5 7v10c0 7 3 11 10 11"
        stroke="var(--mc-accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Crescent moon */}
      <path
        d="M68.5 37.5a26.5 26.5 0 1 0 21.5 42A21.5 21.5 0 0 1 68.5 37.5Z"
        fill="var(--mc-moon-color)"
      />
      {/* Right code brace */}
      <path
        d="M88 36c7 0 10 4 10 11v10c0 4 2.5 7 6.5 7-4 0-6.5 3-6.5 7v10c0 7-3 11-10 11"
        stroke="var(--mc-accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Calm ocean wave */}
      <path
        d="M34 103c10-2.5 20 2.5 30 0s20-2.5 30 0"
        stroke="var(--mc-horizon-glow)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
};
