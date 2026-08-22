'use client';

import { useEffect, useState } from 'react';
import { GameIcon, gameLabel, type GameKey } from '@/components/ui/game-icon';
import { StreakPips } from '@/components/ui/streak-pips';
import { useT } from '@/i18n/use-t';

export interface TrophyStats {
  totalBets: number;
  totalWon: number;
  maxWin: number;
  maxMultiplier: number;
  favorite: GameKey | null;
}

export function ProfileTrophyShelf({ stats }: { stats: TrophyStats }) {
  const { t, localeTag } = useT();
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/balance/catch-up', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.ok) return;
        setStreak(Math.max(0, Math.floor(Number(json.winStreak) || 0)));
      } catch {
        /* keep 0 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-[20px] border border-white/12 bg-white/[0.04] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
      <div className="px-4 pt-3 pb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          {t('profile.shelf')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/10">
        <div className="bg-[#050505] px-4 py-4">
          <span className="text-[10px] uppercase tracking-[0.16em] text-whisper-gray font-roobert">
            {t('profile.maxMult')}
          </span>
          <div
            className="mt-2 font-roobert font-light tabular-nums tracking-tight text-[#F4E8C8]"
            style={{ fontSize: 34, letterSpacing: '-0.03em' }}
          >
            {stats.maxMultiplier > 0 ? `×${stats.maxMultiplier.toFixed(2)}` : '—'}
          </div>
        </div>

        <div className="bg-[#050505] px-4 py-4">
          <span className="text-[10px] uppercase tracking-[0.16em] text-whisper-gray font-roobert">
            {t('profile.favorite')}
          </span>
          <div className="mt-2 flex items-center gap-2.5 min-w-0">
            {stats.favorite ? (
              <>
                <div className="w-10 h-10 rounded-[12px] border border-white/12 bg-white/[0.05] flex items-center justify-center shrink-0">
                  <GameIcon game={stats.favorite} size={18} strokeWidth={1.6} />
                </div>
                <span className="font-roobert text-[16px] text-frost-white truncate">
                  {gameLabel(stats.favorite)}
                </span>
              </>
            ) : (
              <span className="font-roobert text-[16px] text-white/40">
                {t('profile.noFavorite')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-white/10 border-t border-white/10">
        <MiniStat
          label={t('profile.totalBets')}
          value={stats.totalBets.toLocaleString(localeTag)}
        />
        <MiniStat
          label={t('profile.totalWon')}
          value={`${stats.totalWon.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł`}
        />
        <MiniStat
          label={t('profile.maxWin')}
          value={`${stats.maxWin.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł`}
        />
      </div>

      {streak > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10">
          <div>
            <span className="block text-[9px] uppercase tracking-[0.14em] text-whisper-gray font-roobert">
              {t('profile.streak')}
            </span>
            <span className="mt-1 block font-roobert text-[13px] text-[#F4E8C8] tabular-nums">
              {t('profile.streakN', { n: streak })}
            </span>
          </div>
          <StreakPips n={streak} />
        </div>
      )}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#050505] px-3 py-3">
      <span className="block text-[9px] uppercase tracking-[0.14em] text-whisper-gray font-roobert truncate">
        {label}
      </span>
      <span className="mt-1 block font-roobert tabular-nums text-[13px] text-frost-white">
        {value}
      </span>
    </div>
  );
}
