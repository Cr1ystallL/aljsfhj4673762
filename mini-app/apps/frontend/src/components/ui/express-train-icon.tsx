'use client';

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Express Train Icon — Vector icon representing an Express / Accumulator bet.
 * Designed after high-speed bullet train with speed motion lines.
 */
export const ExpressTrainIcon = forwardRef<SVGSVGElement, LucideProps>(
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
        {/* Speed motion lines trailing behind */}
        <path d="M1 4h1" />
        <path d="M2.5 7h4" />
        <path d="M1 9.5h3" />
        <path d="M1 18.5h1.5" />
        <path d="M1 23h2" />

        {/* Pantograph / Roof power connector */}
        <path d="M8.5 2.5L11 5h4" />

        {/* Locomotive Aerodynamic Hull */}
        <path d="M8 5h6.5l6.5 7.5h2l-2.5 4.5h-15l-1.5 3h17l2-3.5L23 12.5 15.5 5" />
        
        {/* Horizontal dividing streamline */}
        <path d="M3 13.5h19" />

        {/* Slanted Aerodynamic Windows */}
        <path d="M10 7.5h2.5l2.5 3.5h-2.5z" />
        <path d="M14 7.5h2.5l2.5 3.5h-2.5z" />

        {/* Undercarriage Wheels */}
        <circle cx="5.5" cy="20.5" r="1.8" />
        <circle cx="10" cy="20.5" r="1.8" />
        <circle cx="14.5" cy="20.5" r="1.8" />
      </svg>
    );
  }
);

ExpressTrainIcon.displayName = 'ExpressTrainIcon';
