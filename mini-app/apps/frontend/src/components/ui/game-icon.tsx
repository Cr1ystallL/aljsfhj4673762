'use client';

import {
  Bomb,
  CircleDot,
  Rocket,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
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
 */

export type GameKey = 'crash' | 'mines' | 'plinko' | 'unknown';

const META: Record<GameKey, { label: string; Icon: LucideIcon }> = {
  crash: { label: 'Crash', Icon: Rocket },
  mines: { label: 'Mines', Icon: Bomb },
  plinko: { label: 'Plinko', Icon: CircleDot },
  unknown: { label: 'Игра', Icon: CircleDot },
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
