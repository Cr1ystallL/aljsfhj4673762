'use client';

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Soccer Ball Icon — Monopo / Minimalist Outlined Glyph
 * Outlined classic football/soccer ball geometry matching Lucide icon props.
 */
export const SoccerBallIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    { color = 'currentColor', size = 24, strokeWidth = 2, className, ...rest },
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
      {/* Outer circle boundary */}
      <circle cx="12" cy="12" r="10" />

      {/* Central pentagon */}
      <polygon points="12 7.5 15.5 10 14 14.5 10 14.5 8.5 10" />

      {/* Radial seams connecting central pentagon to circumference */}
      <line x1="12" y1="7.5" x2="12" y2="2" />
      <line x1="15.5" y1="10" x2="21.5" y2="8" />
      <line x1="14" y1="14.5" x2="18.5" y2="20" />
      <line x1="10" y1="14.5" x2="5.5" y2="20" />
      <line x1="8.5" y1="10" x2="2.5" y2="8" />
    </svg>
  )
);

SoccerBallIcon.displayName = 'SoccerBallIcon';
