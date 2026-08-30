'use client';

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Soccer ball — Tabler Icons `ball-football` (MIT).
 * https://github.com/tabler/tabler-icons
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
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55z" />
      <path d="M12 7v-4" />
      <path d="M15 16l2.5 3" />
      <path d="M16.24 10.45l3.76 -1.45" />
      <path d="M8.76 10.45l-3.76 -1.45" />
      <path d="M9 16l-2.5 3" />
    </svg>
  )
);

SoccerBallIcon.displayName = 'SoccerBallIcon';
