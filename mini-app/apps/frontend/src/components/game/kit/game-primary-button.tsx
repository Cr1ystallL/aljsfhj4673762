'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type GamePrimaryTone = 'solid' | 'muted' | 'gradient' | 'stop';

interface GamePrimaryButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: GamePrimaryTone;
  className?: string;
}

export function GamePrimaryButton({
  children,
  onClick,
  disabled = false,
  tone = 'solid',
  className,
}: GamePrimaryButtonProps) {
  const gradient =
    tone === 'gradient'
      ? {
          background:
            'linear-gradient(90deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 55%, rgb(165, 45, 37) 100%)',
          color: '#0a0a0a',
        }
      : tone === 'stop'
        ? {
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
          }
        : undefined;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.99 } : undefined}
      style={gradient}
      className={cn(
        'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2',
        tone === 'solid' &&
          'bg-frost-white text-midnight-canvas hover:bg-frost-white/90',
        tone === 'muted' &&
          'bg-white/[0.06] text-frost-white/70 border border-white/15 hover:bg-white/10',
        tone === 'gradient' && 'hover:opacity-90',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </motion.button>
  );
}
