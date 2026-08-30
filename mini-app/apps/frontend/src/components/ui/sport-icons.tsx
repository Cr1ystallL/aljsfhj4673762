'use client';

import { forwardRef, type ForwardedRef, type ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Sport glyphs from Tabler Icons (MIT) and Material Design Icons (Apache 2.0).
 * https://github.com/tabler/tabler-icons
 * https://github.com/Templarian/MaterialDesign
 */

function SvgBase(
  {
    color = 'currentColor',
    size = 24,
    strokeWidth = 2,
    className,
    children,
    ...rest
  }: LucideProps & { children: ReactNode },
  ref: ForwardedRef<SVGSVGElement>
) {
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
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Tabler `ball-tennis` */
export const TennisRacquetIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <path d="M6 5.3a9 9 0 0 1 0 13.4" />
          <path d="M18 5.3a9 9 0 0 0 0 13.4" />
        </>
      ),
    },
    ref
  )
);
TennisRacquetIcon.displayName = 'TennisRacquetIcon';

/** Tabler `ball-basketball` */
export const BasketballIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <path d="M5.65 5.65a9 9 0 0 0 12.7 12.7" />
          <path d="M5.65 18.35a9 9 0 0 0 12.7 -12.7" />
          <path d="M12 3a9 9 0 0 0 9 9" />
          <path d="M3 12a9 9 0 0 1 9 9" />
        </>
      ),
    },
    ref
  )
);
BasketballIcon.displayName = 'BasketballIcon';

/** Ice hockey stick + puck — public-domain outline used by sports UIs. */
export const HockeyStickIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <path d="M5 3l8.2 14.6" />
          <path d="M11.4 16.2h8.8c.7 0 1.2.6 1 1.2l-.7 2.1H10.6z" />
          <circle cx="7.2" cy="20.2" r="1.55" />
        </>
      ),
    },
    ref
  )
);
HockeyStickIcon.displayName = 'HockeyStickIcon';

/** Tabler `device-gamepad` — киберспорт. */
export const CsPlayerIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
          <path d="M6 12h4m-2-2v4" />
          <path d="M15 11h.01" />
          <path d="M18 13h.01" />
        </>
      ),
    },
    ref
  )
);
CsPlayerIcon.displayName = 'CsPlayerIcon';
