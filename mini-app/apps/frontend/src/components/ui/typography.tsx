import { cn } from '@/lib/utils';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Typography Components - Monopo Saigon Style
 * 
 * DESIGN:
 * - Roobert primary typeface
 * - Precise type scale (11px, 16px, 18px, 29px, 39px, 54px)
 * - Specific line heights for each size
 * - Frost White (#ffffff) on dark backgrounds
 * - Normal letter spacing for legibility
 */

export function Display({ children, className }: TypographyProps) {
  return (
    <h1 className={cn('text-display font-roobert font-light text-frost-white tracking-normal', className)} style={{ lineHeight: 0.7 }}>
      {children}
    </h1>
  );
}

export function H1({ children, className }: TypographyProps) {
  return (
    <h1 className={cn('text-heading-lg font-roobert font-normal text-frost-white tracking-normal', className)} style={{ lineHeight: 1.39 }}>
      {children}
    </h1>
  );
}

export function H2({ children, className }: TypographyProps) {
  return (
    <h2 className={cn('text-heading font-roobert font-normal text-frost-white tracking-normal', className)} style={{ lineHeight: 1.15 }}>
      {children}
    </h2>
  );
}

export function H3({ children, className }: TypographyProps) {
  return (
    <h3 className={cn('text-heading-sm font-roobert font-semibold text-frost-white tracking-normal', className)} style={{ lineHeight: 1.21 }}>
      {children}
    </h3>
  );
}

export function Subheading({ children, className }: TypographyProps) {
  return (
    <h4 className={cn('text-subheading font-roobert font-normal text-frost-white tracking-normal', className)} style={{ lineHeight: 1.22 }}>
      {children}
    </h4>
  );
}

export function Body({ children, className }: TypographyProps) {
  return (
    <p className={cn('text-body font-roobert font-normal text-frost-white/80 tracking-normal', className)} style={{ lineHeight: 1.25 }}>
      {children}
    </p>
  );
}

export function Caption({ children, className }: TypographyProps) {
  return (
    <p className={cn('text-caption font-roobert font-normal text-whisper-gray tracking-normal', className)} style={{ lineHeight: 1.58 }}>
      {children}
    </p>
  );
}
