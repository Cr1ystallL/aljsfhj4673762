'use client';

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ExpressIcon / ExpressTrainIcon — Modern vector icon representing an Express / Accumulator bet.
 * Designed with tiered multi-ticket combo cards, boost multiplier chevron, and linked nodes.
 */
export const ExpressIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = 'currentColor',
      size = 24,
      strokeWidth = 2,
      className,
      ...rest
    },
    ref
  ) => {
    return (
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
        className={cn('shrink-0', className)}
        {...rest}
      >
        {/* Tier 1: Background stacked card */}
        <path d="M4 8.5V6a2 2 0 0 1 2-2h10" opacity="0.4" />
        
        {/* Tier 2: Middle stacked card */}
        <path d="M6 12.5V8.5a2 2 0 0 1 2-2h11" opacity="0.7" />

        {/* Tier 3: Foreground main ticket card */}
        <rect x="7.5" y="6.5" width="13.5" height="15" rx="2.5" />

        {/* Dynamic Combo Energy / Multiplier Lightning Bolt */}
        <path
          d="M14.5 9.5L12 13.5H15.5L13.5 18"
          strokeWidth={strokeWidth}
          fill="currentColor"
          fillOpacity="0.25"
        />

        {/* Multi-bet connector link line */}
        <path d="M3 18.5h2.5" />
        <circle cx="3" cy="18.5" r="1" fill="currentColor" />
      </svg>
    );
  }
);

ExpressIcon.displayName = 'ExpressIcon';

// Backward-compatible alias
export const ExpressTrainIcon = ExpressIcon;

