'use client';

import { memo, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CrashLivePlayer } from '@/lib/games/crash/crash-live-stream';

/**
 * Crash Player Feed — Monopo Saigon Style
 *
 * Live list of players betting in the current round. Each row shows the
 * player's avatar (Telegram photo when available, otherwise initials),
 * username/first name, stake, multiplier and payout once cashed out, or a
 * red minus once the round crashes and the bet is lost.
 *
 * Optimisation note: the previous implementation animated every row with
 * framer-motion `layout`, which is a textbook FLIP — measure → translate
 * on every list change. Combined with the high-frequency player events on
 * busy rounds (10+ players cashing out within 100ms) this dragged the
 * feed list to single-digit FPS on iPhone. We now render a static list
 * with a CSS keyframe `animate-fade-in` for new rows. Looks identical at
 * normal speeds; runs cold on the GPU.
 */

interface CrashPlayerFeedProps {
  players: CrashLivePlayer[];
  currentUserId?: string | null;
  currency?: string;
}

const AVATAR_TINTS = [
  'bg-[#a05cd6]',
  'bg-[#f0a060]',
  'bg-[#5cb6d6]',
  'bg-[#d65c80]',
  'bg-[#7ed09a]',
];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

function displayName(p: CrashLivePlayer): string {
  return (
    p.user?.firstName ||
    p.user?.username ||
    `Player ${p.userId.slice(0, 4)}`
  );
}

const PlayerAvatar = memo(function PlayerAvatar({
  player,
}: {
  player: CrashLivePlayer;
}) {
  const [broken, setBroken] = useState(false);
  const photo = player.user?.photoUrl;
  const name = displayName(player);
  const initials = name.charAt(0).toUpperCase();

  if (photo && !broken) {
    return (
      <div className="w-7 h-7 rounded-pill overflow-hidden flex items-center justify-center bg-white/10 shrink-0">
        <img
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-7 h-7 rounded-pill flex items-center justify-center text-[11px] font-roobert text-frost-white shrink-0',
        tintFor(player.userId)
      )}
    >
      {initials}
    </div>
  );
});

export const CrashPlayerFeed = memo(function CrashPlayerFeed({
  players,
  currentUserId,
  currency = 'zł',
}: CrashPlayerFeedProps) {
  // Memoize sort so we don't reshuffle the list on every parent re-render.
  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const order = (s: CrashLivePlayer['status']) =>
        s === 'cashed' ? 0 : s === 'active' ? 1 : 2;
      if (order(a.status) !== order(b.status))
        return order(a.status) - order(b.status);
      if (a.status === 'cashed' && b.status === 'cashed') {
        return (b.multiplier ?? 0) - (a.multiplier ?? 0);
      }
      return b.betAmount - a.betAmount;
    });
  }, [players]);

  const uniquePlayerCount = useMemo(() => {
    return new Set(players.map((p) => p.userId)).size;
  }, [players]);

  const totalWagered = useMemo(() => {
    return players.reduce((sum, p) => sum + (p.betAmount || 0), 0);
  }, [players]);

  return (
    <div style={{ borderTop: '1px solid rgb(26, 26, 26)' }}>
      {/* Stats header matching LiveBetsTable */}
      <div
        className="flex items-center justify-between py-3"
        style={{ borderBottom: '1px solid rgb(15, 15, 15)' }}
      >
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 10 }}
        >
          {uniquePlayerCount}{' '}
          {uniquePlayerCount === 1
            ? 'игрок'
            : uniquePlayerCount >= 2 && uniquePlayerCount <= 4
            ? 'игрока'
            : 'игроков'}
        </span>
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 10 }}
        >
          {totalWagered.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}{' '}
          {currency}
        </span>
      </div>

      {/* Rows */}
      <div className="max-h-[280px] overflow-y-auto scrollbar-hide">
        {sorted.length === 0 ? (
          <div
            className="py-10 text-center font-sans text-[#636363]"
            style={{ fontSize: 12 }}
          >
            Ожидание ставок
          </div>
        ) : (
          sorted.map((p) => {
            const name = displayName(p);
            const isYou = currentUserId && p.userId === currentUserId;
            const cashed = p.status === 'cashed';
            const lost = p.status === 'lost';

            return (
              <div
                key={p.key}
                className={cn(
                  'flex items-center gap-3 py-3 px-2 border-b border-[#0a0a0a] transition-colors',
                  isYou && 'bg-white/[0.03]'
                )}
              >
                <PlayerAvatar player={p} />

                <div className="flex-1 min-w-0">
                  <div
                    className="font-sans text-[#ffffff] truncate"
                    style={{ fontSize: 13, fontWeight: 400 }}
                  >
                    {isYou ? `${name} (вы)` : name}
                  </div>
                  <div
                    className="font-sans text-[#636363] tabular-nums"
                    style={{ fontSize: 10 }}
                  >
                    {p.betAmount.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </div>
                </div>

                {/* Multiplier Badge */}
                <span
                  className={cn(
                    'font-sans tabular-nums text-xs px-2.5 py-0.5 rounded-full border',
                    cashed && p.multiplier
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold'
                      : lost
                      ? 'border-white/10 bg-white/[0.04] text-white/40'
                      : 'border-white/10 bg-white/[0.04] text-white/60'
                  )}
                >
                  {cashed && p.multiplier
                    ? `×${p.multiplier.toFixed(2)}`
                    : lost
                    ? '0×'
                    : '…'}
                </span>

                {/* Payout */}
                <div
                  className={cn(
                    'w-20 text-right font-sans tabular-nums text-xs',
                    cashed && p.payout != null
                      ? 'text-white font-medium'
                      : lost
                      ? 'text-[#636363]'
                      : 'text-[#636363]'
                  )}
                >
                  {cashed && p.payout != null
                    ? `+${p.payout.toLocaleString('ru-RU', {
                        maximumFractionDigits: 0,
                      })} ${currency}`
                    : lost
                    ? `0 ${currency}`
                    : `…`}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
