'use client';

import {
  Bomb,
  Rocket,
  Disc3,
  Spade,
  Dice5,
  Box,
  Trophy,
  CircleDot,
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
 * Coinflip has a custom SVG (the lucide stand-in was too
 * generic — a circle-with-dot didn't read as the game).
 */

export type GameKey =
  | 'crash'
  | 'mines'
  | 'coinflip'
  | 'wheel'
  | 'blackjack'
  | 'cards'
  | 'hilo'
  | 'baccarat'
  | 'keno'
  | 'cases'
  | 'macvpot'
  | 'sports'
  | 'unknown';

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

const ClownIcon = forwardRef<SVGSVGElement, Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'>>(
  ({ size = 24, color = 'currentColor', className, strokeWidth = 1.5, ...rest }, ref) => (
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
      <circle cx="12" cy="12" r="10" />
      <path d="M8 9.5h.01" />
      <path d="M16 9.5h.01" />
      <path d="M12 13.5v.01" strokeWidth="3" />
      <path d="M8 16a4 4 0 0 0 8 0" />
      <path d="M2 12a2 2 0 0 1 2 0" />
      <path d="M20 12a2 2 0 0 1 2 0" />
      <path d="M9 4l3-3 3 3" />
    </svg>
  )
);
ClownIcon.displayName = 'ClownIcon';
export { ClownIcon };

const META: Record<GameKey, { label: string; Icon: LucideIcon }> = {
  crash: { label: 'MacvJet', Icon: Rocket },
  mines: { label: 'Mines', Icon: Bomb },
  coinflip: { label: 'Coinflip', Icon: CoinflipIcon },
  wheel: { label: 'Wheel', Icon: Disc3 },
  blackjack: { label: 'Blackjack', Icon: Spade },
  baccarat: { label: 'Baccarat', Icon: Spade },
  cards: { label: 'Card Games', Icon: Spade },
  hilo: { label: 'Hi-Lo', Icon: Spade },
  keno: { label: 'Keno', Icon: Dice5 },
  cases: { label: 'Case', Icon: Box },
  macvpot: { label: 'MacvPot', Icon: Trophy },
  sports: { label: 'Спорт', Icon: CircleDot },
  unknown: { label: 'Прочее', Icon: Box },
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
  if (v.startsWith('coinflip')) return 'coinflip';
  if (v.startsWith('wheel')) return 'wheel';
  if (v.startsWith('blackjack')) return 'blackjack';
  if (v.startsWith('baccarat')) return 'baccarat';
  if (v.startsWith('cards')) return 'cards';
  if (v.startsWith('hilo')) return 'hilo';
  if (v.startsWith('keno')) return 'keno';
  if (v.startsWith('cases') || v.startsWith('case')) return 'cases';
  if (v.startsWith('macvpot') || v.startsWith('pot')) return 'macvpot';
  if (v.startsWith('sport')) return 'sports';
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
