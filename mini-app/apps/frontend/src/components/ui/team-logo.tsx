'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CsPlayerIcon } from '@/components/ui/sport-icons';

export type TeamLogoMark = 'cs' | 'dota';

interface TeamLogoProps {
  src?: string;
  name: string;
  initials: string;
  color?: string;
  size?: number;
  className?: string;
  mark?: TeamLogoMark;
}

export function TeamLogo({
  src,
  name,
  initials,
  color = '#3b82f6',
  size = 28,
  className,
  mark,
}: TeamLogoProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const showFallback = !src || hasError;

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative overflow-hidden flex items-center justify-center shrink-0 border border-white/15 p-0.5 shadow-sm select-none',
        mark ? 'rounded-lg' : 'rounded-xl',
        src && !hasError ? 'bg-white' : 'bg-white/[0.04]',
        className
      )}
    >
      {src && !hasError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          onError={() => setHasError(true)}
          onLoad={() => setIsLoaded(true)}
          className={cn(
            'w-full h-full object-contain filter drop-shadow transition-opacity duration-200',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
        />
      )}

      {showFallback && (
        <div
          className={cn(
            'w-full h-full flex items-center justify-center font-roobert font-extrabold text-frost-white uppercase tracking-tight shadow-inner',
            mark ? 'rounded-md' : 'rounded-lg'
          )}
          style={{
            background: mark
              ? `linear-gradient(160deg, ${color}55 0%, ${color}18 100%)`
              : `${color}25`,
            borderColor: `${color}40`,
            borderWidth: '1px',
            fontSize: Math.max(8, Math.floor(size * (mark ? 0.3 : 0.38))),
          }}
        >
          {mark === 'cs' && size >= 22 ? (
            <span className="flex flex-col items-center leading-none gap-0.5">
              <CsPlayerIcon size={Math.max(10, Math.floor(size * 0.42))} strokeWidth={1.8} />
              <span>{initials.slice(0, 3)}</span>
            </span>
          ) : mark === 'dota' && size >= 22 ? (
            <span className="flex flex-col items-center leading-none gap-0.5">
              <DotaMark size={Math.max(10, Math.floor(size * 0.38))} />
              <span>{initials.slice(0, 3)}</span>
            </span>
          ) : (
            initials.slice(0, 3)
          )}
        </div>
      )}
    </div>
  );
}

function DotaMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 5.5 14.6 12 12 18.5 9.4 12z" />
    </svg>
  );
}
