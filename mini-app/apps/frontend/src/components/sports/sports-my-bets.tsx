'use client';

import { useCallback, useEffect, useState } from 'react';
import { sportsService, type SportsUserBet } from '@/services/sports.service';
import { useBalance } from '@/hooks/use-balance';
import { useT } from '@/i18n/use-t';
import { GamePrimaryButton } from '@/components/game/kit/game-primary-button';
import { cn } from '@/lib/utils';

export function SportsMyBets({ compact = false, hideHeading = false }: { compact?: boolean; hideHeading?: boolean }) {
  const { t, localeTag } = useT();
  const { syncBalance } = useBalance();
  const [bets, setBets] = useState<SportsUserBet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBets(await sportsService.fetchMyBets());
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const onCashout = async (id: string) => {
    setBusy(id);
    try {
      await sportsService.cashout(id);
      await syncBalance();
      await load();
    } catch {
      /* offer may have expired */
      await load();
    } finally {
      setBusy(null);
    }
  };

  const list = compact ? bets.slice(0, 4) : bets.slice(0, 12);

  return (
    <section className="flex flex-col gap-2">
      {!hideHeading && (
        <div className="flex items-center justify-between px-0.5">
          <h3 className="font-roobert text-[15px] font-bold text-frost-white">{t('sports.myBets')}</h3>
          <span className="font-roobert text-[10px] text-whisper-gray tabular-nums">{list.length}</span>
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0e1015] px-4 py-6 text-center font-roobert text-[12px] text-whisper-gray">
          {t('sports.noBets')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((bet) => (
            <article
              key={bet.id}
              className="rounded-2xl border border-white/10 bg-[#0e1015] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-roobert text-[13px] font-semibold text-frost-white truncate">
                    {bet.eventName}
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray">
                    {bet.type === 'express' ? t('sports.express') : t('sports.single')}
                    {' · '}
                    {bet.odds.toFixed(2)}
                    {' · '}
                    {bet.stake.toLocaleString(localeTag, { maximumFractionDigits: 2 })} zł
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                    bet.state === 'won'
                      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                      : bet.state === 'lost'
                        ? 'text-red-300 border-red-500/25 bg-red-500/10'
                        : 'text-whisper-gray border-white/10 bg-white/[0.04]'
                  )}
                >
                  {t(
                    bet.state === 'won'
                      ? 'sports.stateWon'
                      : bet.state === 'lost'
                        ? 'sports.stateLost'
                        : bet.state === 'cashed_out'
                          ? 'sports.stateCash'
                          : bet.state === 'cancelled'
                            ? 'sports.stateVoid'
                            : 'sports.statePending'
                  )}
                </span>
              </div>

              {!!bet.legs?.length && (
                <div className="mt-2 flex flex-col gap-1">
                  {bet.legs.map((leg, i) => (
                    <div
                      key={`${bet.id}-${i}`}
                      className="flex items-center justify-between gap-2 font-roobert text-[11px] text-whisper-gray"
                    >
                      <span className="truncate">
                        {leg.eventName || leg.outcomeKey || '—'}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {leg.odds ? Number(leg.odds).toFixed(2) : ''}
                        {leg.result && leg.result !== 'pending' ? ` · ${leg.result}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between">
                <span className="font-roobert text-[12px] text-frost-white tabular-nums">
                  {bet.payout > 0
                    ? `${bet.payout.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
                    : '—'}
                </span>
                {bet.cashout && (
                  <div className="w-[160px]">
                    <GamePrimaryButton
                      onClick={() => void onCashout(bet.id)}
                      disabled={busy === bet.id}
                    >
                      {t('sports.cashoutFor', { amount: bet.cashout.amount.toFixed(2) })}
                    </GamePrimaryButton>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
