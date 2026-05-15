'use client';

import { HelpCircle, type LucideIcon } from 'lucide-react';

/**
 * Game Top Bar — Monopo Saigon Style
 *
 * Shared header used across all game screens. Hosts the brand mark
 * (`/SmallLogo.png`) on the left, followed by the game title and its
 * brand glyph, with a "Как играть" pill on the right that opens the
 * rules modal. Intentionally minimal — no sound toggle, no demo dot,
 * nothing that would clutter the otherwise calm layout.
 */
interface GameTopBarProps {
  title: string;
  Icon: LucideIcon;
  iconRotate?: number;
  onHowToPlay?: () => void;
}

export function GameTopBar({
  title,
  Icon,
  iconRotate = 0,
  onHowToPlay,
}: GameTopBarProps) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2.5">
        {/* Brand mark — small Macvbet logo to the left of the game title */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/SmallLogo.png"
          alt="Macvbet"
          width={40}
          height={40}
          className="w-10 h-10 object-contain shrink-0"
        />
        <span className="font-roobert text-frost-white text-[24px] font-normal leading-none">
          {title}
        </span>
        <Icon
          size={18}
          className="text-frost-white/85"
          strokeWidth={1.6}
          style={iconRotate ? { transform: `rotate(${iconRotate}deg)` } : undefined}
        />
      </div>

      <button
        onClick={onHowToPlay}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
      >
        <span className="font-roobert text-[12px]">Как играть</span>
        <HelpCircle size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}
