'use client';

import { HelpCircle, Shield, Volume2, VolumeX, Rocket } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Crash Top Bar — Monopo Saigon Style
 *
 * Title with rocket glyph on the left, support pills on the right
 * ("Как играть", provably-fair, demo dot, sound). Pure pill chrome,
 * 1px translucent borders, no shadows.
 */

interface CrashTopBarProps {
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  onHowToPlay?: () => void;
  onProvablyFair?: () => void;
}

export function CrashTopBar({
  isDemoMode,
  onToggleDemoMode,
  onHowToPlay,
  onProvablyFair,
}: CrashTopBarProps) {
  const [muted, setMuted] = useState(soundManager.isMuted());

  const toggleSound = () => {
    setMuted(soundManager.toggleMute());
  };

  return (
    <div className="flex items-center justify-between px-1">
      {/* Title */}
      <div className="flex items-center gap-2.5">
        <span className="font-roobert text-frost-white text-[24px] font-normal leading-none">
          Crash
        </span>
        <Rocket
          size={18}
          className="text-frost-white/85"
          strokeWidth={1.6}
          style={{ transform: 'rotate(-30deg)' }}
        />
      </div>

      {/* Pills */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onHowToPlay}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
        >
          <span className="font-roobert text-[12px]">Как играть</span>
          <HelpCircle size={12} strokeWidth={1.8} />
        </button>

        <button
          onClick={onProvablyFair}
          className="w-8 h-8 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
          aria-label="Provably fair"
        >
          <Shield size={13} strokeWidth={1.8} />
        </button>

        <button
          onClick={onToggleDemoMode}
          className={cn(
            'w-8 h-8 rounded-pill flex items-center justify-center transition-colors border',
            isDemoMode
              ? 'bg-frost-white text-midnight-canvas border-frost-white'
              : 'bg-white/[0.04] text-frost-white/80 border-white/15 hover:border-white/25'
          )}
          aria-label="Toggle demo mode"
        >
          <span
            className={cn(
              'w-2.5 h-2.5 rounded-full',
              isDemoMode ? 'bg-midnight-canvas' : 'bg-frost-white/80'
            )}
          />
        </button>

        <button
          onClick={toggleSound}
          className="w-8 h-8 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
          aria-label="Toggle sound"
        >
          {muted ? <VolumeX size={13} strokeWidth={1.8} /> : <Volume2 size={13} strokeWidth={1.8} />}
        </button>
      </div>
    </div>
  );
}
