'use client';

import { HelpCircle, Volume2, VolumeX, Rocket } from 'lucide-react';
import { useState } from 'react';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Crash Top Bar — Monopo Saigon Style
 *
 * Title with rocket glyph on the left, two pills on the right:
 *   - "Как играть" → opens the rules modal.
 *   - Sound mute toggle.
 */

interface CrashTopBarProps {
  onHowToPlay?: () => void;
}

export function CrashTopBar({ onHowToPlay }: CrashTopBarProps) {
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
