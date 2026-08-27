'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TeamLogoProps {
  src?: string;
  name: string;
  initials: string;
  color?: string;
  size?: number;
  className?: string;
}

export function TeamLogo({
  src,
  name,
  initials,
  color = '#3b82f6',
  size = 28,
  className,
}: TeamLogoProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const showFallback = !src || hasError;

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-white/15 bg-white/[0.04] p-0.5 shadow-sm select-none',
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

      {/* Elegant Fallback Monogram */}
      {showFallback && (
        <div
          className="w-full h-full rounded-lg flex items-center justify-center font-roobert font-extrabold text-frost-white uppercase tracking-tight shadow-inner"
          style={{
            backgroundColor: `${color}25`,
            borderColor: `${color}40`,
            borderWidth: '1px',
            fontSize: Math.max(9, Math.floor(size * 0.38)),
          }}
        >
          {initials.slice(0, 3)}
        </div>
      )}
    </div>
  );
}
