'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

export type GameAuraType = 'win' | 'lose';

/**
 * Trigger the ambient win/lose halo across any listening game stage.
 */
export function triggerGameAura(type: GameAuraType) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('casino:game-aura', { detail: { type } })
    );
  }
}

/**
 * Hook to manage game aura state and automatically listen to global result events.
 */
export function useGameAura(duration = 2600) {
  const [aura, setAura] = useState<GameAuraType | null>(null);
  const [auraKey, setAuraKey] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const trigger = useCallback(
    (type: GameAuraType) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setAura(type);
      setAuraKey((k) => k + 1);

      timerRef.current = setTimeout(() => {
        setAura(null);
      }, duration);
    },
    [duration]
  );

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: GameAuraType }>;
      if (customEvent.detail?.type) {
        trigger(customEvent.detail.type);
      }
    };

    window.addEventListener('casino:game-aura', handleEvent);
    return () => {
      window.removeEventListener('casino:game-aura', handleEvent);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [trigger]);

  const auraClass =
    aura === 'win'
      ? 'aura-glow-win'
      : aura === 'lose'
        ? 'aura-glow-lose'
        : '';

  return {
    aura,
    auraKey,
    auraClass,
    triggerWin: () => trigger('win'),
    triggerLose: () => trigger('lose'),
    clearAura: () => setAura(null),
  };
}

interface GameAuraWrapperProps {
  /** Optional explicit result override */
  result?: GameAuraType | null;
  /** Custom class name */
  className?: string;
  /** Inner content / game stage */
  children: React.ReactNode;
}

/**
 * Wraps any game arena/card to illuminate a subtle neon halo around it on win (green) or loss (red).
 */
export function GameAuraWrapper({
  result,
  className,
  children,
}: GameAuraWrapperProps) {
  const { aura, auraClass, triggerWin, triggerLose } = useGameAura();

  useEffect(() => {
    if (result === 'win') triggerWin();
    else if (result === 'lose') triggerLose();
  }, [result, triggerWin, triggerLose]);

  return (
    <div className={cn('relative transition-all duration-500', auraClass, className)}>
      {/* Soft ambient bloom behind the stage */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-2 rounded-[inherit] opacity-0 transition-opacity duration-500 blur-xl',
          aura === 'win' && 'opacity-70 bg-emerald-500/25',
          aura === 'lose' && 'opacity-70 bg-rose-500/25'
        )}
      />
      {children}
    </div>
  );
}
