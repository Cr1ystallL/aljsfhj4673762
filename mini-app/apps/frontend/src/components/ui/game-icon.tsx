'use client';

import {
  Bomb,
  Rocket,
  Disc3,
  Footprints,
  Spade,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Game Icon — Monopo Saigon Style
 *
 * Single source of truth for game labels and outline icons. Used in the
 * profile recent-bets list, the menu drawer, and any future surface that
 * needs to refer to a specific game.
 *
 * Icons are restrained — minimal outlined glyphs, frost-white on a
 * frosted glass tile. No emoji, no rainbow accents.
 *
 * Plinko and Coinflip have custom SVGs (the lucide stand-ins were too
 * generic — a circle and a circle-with-dot didn't read as the games).
 */

export type GameKey =
  | 'crash'
  | 'mines'
  | 'plinko'
  | 'coinflip'
  | 'wheel'
  | 'bridges'
  | 'blackjack'
  | 'cards'
  | 'hilo'
  | 'baccarat'
  | 'unknown';

/**
 * Plinko glyph — a peg pyramid with a ball about to drop. Three rows of
 * dots sit below a single ball above, evoking the 16-row pin board.
 */
const PlinkoIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    { color = 'currentColor', size = 24, strokeWidth = 1.6, className, ...rest },
    ref
  ) => (
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
      {/* Ball at top */}
      <circle cx="12" cy="4" r="1.6" fill={color} />
      {/* Row 1 — 1 peg */}
      <circle cx="12" cy="9" r="1" />
      {/* Row 2 — 2 pegs */}
      <circle cx="9" cy="13" r="1" />
      <circle cx="15" cy="13" r="1" />
      {/* Row 3 — 3 pegs */}
      <circle cx="6" cy="17" r="1" />
      <circle cx="12" cy="17" r="1" />
      <circle cx="18" cy="17" r="1" />
      {/* Bucket floor */}
      <path d="M3 21h18" />
    </svg>
  )
);
PlinkoIcon.displayName = 'PlinkoIcon';
export { PlinkoIcon };

/**
 * Coinflip glyph — a tilted coin in motion. Outer ellipse hints at the
 * spinning side-on view, inner circle plus a dollar-style mark reads as
 * a coin face. Distinct from a plain circle.
 */
const CoinflipIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    { color = 'currentColor', size = 24, strokeWidth = 1.6, className, ...rest },
    ref
  ) => (
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
      {/* Outer face */}
      <circle cx="12" cy="12" r="9" />
      {/* Inner ring */}
      <circle cx="12" cy="12" r="6.2" />
      {/* Centre M-shape (Macvbet hint) — two strokes meeting at apex */}
      <path d="M9 14.5V10l3 3 3-3v4.5" />
      {/* Motion lines suggesting a flip */}
      <path d="M3 8.5h2" />
      <path d="M3 15.5h2" />
    </svg>
  )
);
CoinflipIcon.displayName = 'CoinflipIcon';
export { CoinflipIcon };

const META: Record<GameKey, { label: string; Icon: LucideIcon }> = {
  crash: { label: 'MacvJet', Icon: Rocket },
  mines: { label: 'Mines', Icon: Bomb },
  plinko: { label: 'Plinko', Icon: PlinkoIcon },
  coinflip: { label: 'Coinflip', Icon: CoinflipIcon },
  wheel: { label: 'Wheel', Icon: Disc3 },
  bridges: { label: 'Bridges', Icon: Footprints },
  blackjack: { label: 'Blackjack', Icon: Spade },
  baccarat: { label: 'Baccarat', Icon: Spade },
  cards: { label: 'Card Games', Icon: Spade },
  hilo: { label: 'Hi-Lo', Icon: Spade },
  unknown: { label: 'Game', Icon: PlinkoIcon },
};

/**
 * Normalise a free-form gameType / gameId / metadata.gameType string into
 * one of the supported keys. Anything we don't recognise becomes
 * 'unknown' rather than throwing.
 */
export function resolveGameKey(input: unknown): GameKey {
  if (typeof input !== 'string') return 'unknown';
  const v = input.toLowerCase();
  if (v.startsWith('crash')) return 'crash';
  if (v.startsWith('mines')) return 'mines';
  if (v.startsWith('plinko')) return 'plinko';
  if (v.startsWith('coinflip')) return 'coinflip';
  if (v.startsWith('wheel')) return 'wheel';
  if (v.startsWith('bridges')) return 'bridges';
  if (v.startsWith('blackjack')) return 'blackjack';
  if (v.startsWith('baccarat')) return 'baccarat';
  if (v.startsWith('cards')) return 'cards';
  if (v.startsWith('hilo')) return 'hilo';
  return 'unknown';
}

export function gameLabel(key: GameKey): string {
  return META[key].label;
}

interface GameIconProps extends Omit<LucideProps, 'ref'> {
  game: GameKey;
}

export function GameIcon({ game, className, ...rest }: GameIconProps) {
  const Icon = META[game].Icon;
  return <Icon className={cn('text-frost-white/85', className)} {...rest} />;
}

interface GameIconTileProps {
  game: GameKey;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Frosted-glass square tile with the game icon centred. The site-wide
 * "card" radius (10px from tokens) keeps it consistent with stats tiles
 * and bet panels.
 */
export function GameIconTile({ game, size = 'md', className }: GameIconTileProps) {
  const dims =
    size === 'sm'
      ? 'w-9 h-9'
      : size === 'lg'
      ? 'w-12 h-12'
      : 'w-10 h-10';
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 22 : 18;

  return (
    <div
      className={cn(
        'rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl flex items-center justify-center shrink-0',
        dims,
        className
      )}
    >
      <GameIcon game={game} size={iconSize} strokeWidth={1.6} />
    </div>
  );
}
