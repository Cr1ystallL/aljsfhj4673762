'use client';

import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Custom outlined SVG glyphs for the bot-side mini-games.
 *
 * Each icon is a Lucide-compatible component (24×24 viewBox, currentColor
 * stroke, round caps/joins) so it slots into the existing GameIcon
 * plumbing. Kept restrained — single-stroke silhouettes that read at 22px.
 */

function makeIcon(
  display: string,
  draw: (color: string) => React.ReactNode
): LucideIcon {
  const Comp = forwardRef<SVGSVGElement, LucideProps>(
    (
      {
        color = 'currentColor',
        size = 24,
        strokeWidth = 1.6,
        className,
        ...rest
      },
      ref
    ) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...rest}
      >
        {draw(color)}
      </svg>
    )
  );
  Comp.displayName = display;
  return Comp;
}

/** Кубики — front cube + 3D back-layer hint, dotted pips. */
export const DiceCubeIcon = makeIcon('DiceCubeIcon', (color) => (
  <>
    <rect x="3.5" y="3.5" width="13" height="13" rx="2.4" />
    <circle cx="7.5" cy="7.5" r="0.9" fill={color} stroke="none" />
    <circle cx="12.5" cy="12.5" r="0.9" fill={color} stroke="none" />
    <path d="M9.5 18.5 H20.5 V7.5" />
    <path d="M16.5 16.5 L20.5 16.5" />
  </>
));

/** Боулинг — bowling ball with three finger holes + two pins behind. */
export const BowlingIcon = makeIcon('BowlingIcon', (color) => (
  <>
    <circle cx="9" cy="13" r="6.5" />
    <circle cx="7.5" cy="11" r="0.7" fill={color} stroke="none" />
    <circle cx="9.8" cy="10.4" r="0.7" fill={color} stroke="none" />
    <circle cx="9.4" cy="13" r="0.7" fill={color} stroke="none" />
    <path d="M19 5 C20 5 20.5 5.8 20.5 6.5 C20.5 7.3 20 7.8 20 8.6 L18.5 14 L17 8.6 C17 7.8 16.5 7.3 16.5 6.5 C16.5 5.8 17 5 18 5 Z" />
    <path d="M16 9.8 C16.7 9.8 17 10.3 17 10.9 C17 11.5 16.7 11.9 16.7 12.5 L15.7 16 L14.7 12.5 C14.7 11.9 14.4 11.5 14.4 10.9 C14.4 10.3 14.7 9.8 15.4 9.8 Z" />
  </>
));

/** Дартс — board with a dart hitting near the bullseye. */
export const DartsIcon = makeIcon('DartsIcon', (color) => (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
    <path d="M21 3 L13.5 10.5" />
    <path d="M19.5 4.5 L21 3 L21 6 Z" fill={color} stroke="none" />
  </>
));

/** Баскетбол — ball with the classic seam pattern. */
export const BasketballIcon = makeIcon('BasketballIcon', () => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12 H21" />
    <path d="M12 3 V21" />
    <path d="M5.5 5.5 C9 9 9 15 5.5 18.5" />
    <path d="M18.5 5.5 C15 9 15 15 18.5 18.5" />
  </>
));

/** Футбол — soccer ball with a centre pentagon and seams to the edges. */
export const FootballIcon = makeIcon('FootballIcon', (color) => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path
      d="M12 7.5 L15.5 10 L14.2 14 H9.8 L8.5 10 Z"
      fill={color}
      fillOpacity="0.14"
    />
    <path d="M12 3 L12 7.5" />
    <path d="M3 11 L8.5 10" />
    <path d="M21 11 L15.5 10" />
    <path d="M6 19 L9.8 14" />
    <path d="M18 19 L14.2 14" />
  </>
));

/** КНБ — rock + paper + scissors arranged in a triangle. */
export const RpsIcon = makeIcon('RpsIcon', () => (
  <>
    {/* Rock — top-left */}
    <path d="M3 8.5 C3 7 4 6 5.5 6 H8 C9 6 9.5 6.5 9.5 7.5 V10 C9.5 11 9 11.5 8 11.5 H5.5 C4 11.5 3 10.5 3 9 V8.5 Z" />
    {/* Paper — top-right */}
    <path d="M14.5 5.5 H20 V11.5 H14.5 V5.5 Z" />
    <path d="M16 8 H18.5 M16 9.5 H18" />
    {/* Scissors — bottom centre */}
    <circle cx="9.5" cy="17.5" r="1.8" />
    <circle cx="14.5" cy="17.5" r="1.8" />
    <path d="M11 16 L20 13" />
    <path d="M13 16 L20 19" />
  </>
));

/** Spider — body + 8 radiating legs. */
export const SpiderIcon = makeIcon('SpiderIcon', () => (
  <>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M9 9 L4 5" />
    <path d="M15 9 L20 5" />
    <path d="M9 12 L3 11" />
    <path d="M15 12 L21 11" />
    <path d="M9 15 L4 19" />
    <path d="M15 15 L20 19" />
    <path d="M11 8.5 L9 3.5" />
    <path d="M13 8.5 L15 3.5" />
  </>
));
