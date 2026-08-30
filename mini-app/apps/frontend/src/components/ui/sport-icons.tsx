'use client';

import { forwardRef, type ForwardedRef, type ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';

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

export const TennisRacquetIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <ellipse cx="14.5" cy="8.2" rx="6.2" ry="7" />
          <path d="M10.2 5.2 18.8 11.2" />
          <path d="M9.4 8.2h10.2" />
          <path d="M11.2 12.4 17.6 4.6" />
          <path d="M13.2 15.1 10.1 22" />
          <path d="M8.6 21.2h3.4" />
        </>
      ),
    },
    ref
  )
);
TennisRacquetIcon.displayName = 'TennisRacquetIcon';

export const BasketballIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2c3.2 3.6 3.2 16.4 0 20" />
          <path d="M2 12h20" />
          <path d="M4.2 6.6c4.2 2.2 11.4 2.2 15.6 0" />
          <path d="M4.2 17.4c4.2-2.2 11.4-2.2 15.6 0" />
        </>
      ),
    },
    ref
  )
);
BasketballIcon.displayName = 'BasketballIcon';

export const HockeyStickIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <path d="M6.2 3.4 14.6 18.2" />
          <path d="M12.8 16.6h8.2l.8 3.2H11.6z" />
          <circle cx="18.6" cy="20.4" r="1.35" fill="currentColor" stroke="none" />
        </>
      ),
    },
    ref
  )
);
HockeyStickIcon.displayName = 'HockeyStickIcon';

/** CS operator silhouette — helmet, vest, rifle. Readable at 14–18px. */
export const CsPlayerIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
  SvgBase(
    {
      ...props,
      children: (
        <>
          <path d="M8.2 4.6c1.1-1.3 3.1-1.8 4.6-.6.8.6 1.2 1.5 1.2 2.5v.7H8.1V6.5c0-.7.3-1.4.1-1.9z" />
          <path d="M7.8 7.4h6.6v1.5H7.8z" />
          <path d="M8.2 9.2h5.8c.7 0 1.2.6 1.2 1.3v4.8H7V10.5c0-.7.5-1.3 1.2-1.3z" />
          <path d="M15.1 11.4h6.2l.9 1.4h-5.4" />
          <path d="M15.4 11.4v2.1" />
          <path d="M8.6 15.4 7.2 21" />
          <path d="M12.6 15.4 14 21" />
        </>
      ),
    },
    ref
  )
);
CsPlayerIcon.displayName = 'CsPlayerIcon';
