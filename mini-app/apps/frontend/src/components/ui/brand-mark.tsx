'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * BrandMark — Macvbet "M" silhouette as a paintable inline SVG.
 *
 * The artwork comes from `public/ButtonLogo.svg`. It's inlined here so we
 * can repaint the path with the brand Deep Ocean gradient (or any solid
 * fill) without relying on a static raster.
 *
 * Variants:
 *   - 'gradient' — Deep Ocean gradient. Use on dark backgrounds.
 *   - 'dark'     — solid Midnight (#0a0a0a). Use on the bright Play pill.
 *   - 'white'    — Frost White. Fallback for ghost surfaces.
 */
interface BrandMarkProps {
  variant?: 'gradient' | 'dark' | 'white';
  className?: string;
  /** Optional pixel size; falls back to className-driven sizing. */
  size?: number;
  title?: string;
}

export function BrandMark({
  variant = 'gradient',
  className,
  size,
  title,
}: BrandMarkProps) {
  const gradientId = useId();
  const fill =
    variant === 'gradient'
      ? `url(#${gradientId})`
      : variant === 'dark'
      ? '#0a0a0a'
      : '#ffffff';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      {variant === 'gradient' && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(160, 224, 171)" />
            <stop offset="50%" stopColor="rgb(255, 172, 46)" />
            <stop offset="100%" stopColor="rgb(165, 45, 37)" />
          </linearGradient>
        </defs>
      )}
      <g
        transform="translate(0,1024) scale(0.1,-0.1)"
        fill={fill}
        stroke="none"
      >
        <path
          d="M5050 8891 c-186 -60 -321 -200 -450 -465 -181 -372 -333 -968 -486 -1906 -20 -124 -38 -232 -41 -240 -3 -8 -22 35 -43 95 -129 377 -321 783 -495 1045 -195 294 -367 434 -585 477 -218 43 -440 -63 -585 -281 -268 -403 -405 -1125 -405 -2136 0 -955 176 -2298 335 -2549 93 -148 230 -221 389 -208 138 12 263 105 329 244 30 65 32 74 31 183 0 102 -7 144 -57 365 -125 557 -201 1068 -239 1615 -19 283 -16 1071 5 1340 39 478 93 772 144 788 31 9 115 -120 197 -305 236 -528 498 -1528 636 -2427 86 -566 99 -960 50 -1546 -26 -312 -20 -400 38 -515 35 -70 68 -110 136 -161 121 -92 292 -111 427 -46 122 58 216 182 245 324 13 62 13 102 -3 362 -24 399 -24 1277 0 1616 33 459 68 801 142 1392 112 891 214 1493 334 1971 60 234 86 309 109 305 42 -8 159 -453 256 -968 93 -495 211 -1393 271 -2055 94 -1040 92 -1452 -12 -2659 -14 -163 -15 -213 -5 -280 36 -247 222 -398 474 -384 69 4 100 12 153 36 85 41 175 129 214 212 50 106 56 167 41 449 -19 367 -6 665 51 1121 104 839 333 1741 594 2346 109 250 248 496 302 531 25 16 26 16 49 -10 72 -84 156 -523 196 -1017 17 -219 17 -987 0 -1220 -35 -467 -75 -835 -148 -1355 -43 -304 -46 -335 -35 -398 24 -142 112 -260 238 -320 62 -29 77 -32 163 -32 131 1 190 25 279 114 99 99 135 181 175 412 88 495 122 972 113 1569 -19 1153 -141 1925 -384 2416 -105 213 -230 350 -388 426 -224 107 -451 83 -681 -73 -221 -149 -470 -481 -674 -902 l-68 -139 -22 124 c-134 741 -300 1479 -410 1823 -172 536 -366 817 -618 895 -82 25 -205 26 -282 1z"
        />
      </g>
    </svg>
  );
}

/**
 * BrandWordmark — BrandMark followed by "Bет" in Roobert. The SVG
 * stands in for the leading "Macv", so the composite reads as
 * "MacvBет" — bilingual logo blending the brand sigil with a Cyrillic
 * tail.
 *
 * Used in the menu drawer header.
 */
export function BrandWordmark({
  size = 56,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      style={{ height: size }}
    >
      <BrandMark variant="gradient" size={size} title="Macv" />
      <span
        className="font-roobert font-light text-frost-white tracking-tight"
        style={{
          fontSize: Math.round(size * 0.62),
          lineHeight: 1,
          marginLeft: -Math.round(size * 0.06),
        }}
      >
        acvBet
      </span>
    </span>
  );
}

/**
 * BrandLockup — BrandMark stacked above the "Macvbet" word.
 *
 * Used wherever the small brand mark used to live (top bar, drawer
 * footer). The SVG is the focal point; the wordmark sits beneath it as
 * a quiet caption.
 */
export function BrandLockup({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex flex-col items-center gap-1', className)}
    >
      <BrandMark variant="gradient" size={size} title="MacvBet" />
      <span
        className="font-roobert font-light text-frost-white tracking-[0.18em] uppercase"
        style={{ fontSize: Math.max(8, Math.round(size * 0.18)), lineHeight: 1 }}
      >
        MacvBet
      </span>
    </span>
  );
}
