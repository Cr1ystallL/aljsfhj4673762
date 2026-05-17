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
    `Игрок ${p.userId.slice(0, 4)}`
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

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 border-b border-white/10">
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          Игрок
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert text-right w-16">
          Коэфф.
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert text-right w-20">
          Выигрыш
        </span>
      </div>

      <div className="max-h-[260px] overflow-y-auto scrollbar-hide divide-y divide-white/5">
        {sorted.map((p) => {
          const name = displayName(p);
          const isYou = currentUserId && p.userId === currentUserId;
          return (
            <div
              key={p.key}
              className={cn(
                'grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5',
                isYou && 'bg-white/[0.03]'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar player={p} />
                <div className="min-w-0">
                  <div className="font-roobert text-[13px] text-frost-white truncate">
                    {isYou ? `${name} · вы` : name}
                  </div>
                  <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                    {p.betAmount.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </div>
                </div>
              </div>

              <div className="text-right w-16 font-roobert text-[12px] tabular-nums">
                {p.status === 'cashed' && p.multiplier ? (
                  <span className="text-frost-white">
                    x{p.multiplier.toFixed(2)}
                  </span>
                ) : p.status === 'lost' ? (
                  <span className="text-whisper-gray">—</span>
                ) : (
                  <span className="text-whisper-gray">…</span>
                )}
              </div>

              <div className="text-right w-20 font-roobert text-[12px] tabular-nums">
                {p.status === 'cashed' && p.payout != null ? (
                  <span className="text-frost-white">
                    +
                    {p.payout.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                ) : p.status === 'lost' ? (
                  <span className="text-[#ff8a76]/80">
                    −{p.betAmount.toLocaleString('ru-RU')}
                  </span>
                ) : (
                  <span className="text-whisper-gray">…</span>
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            Игроки появятся здесь, как только сделают ставки
          </div>
        )}
      </div>
    </div>
  );
});
