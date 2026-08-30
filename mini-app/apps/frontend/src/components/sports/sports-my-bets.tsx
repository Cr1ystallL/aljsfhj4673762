'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { sportsService, type SportsUserBet } from '@/services/sports.service';
import { useBalance } from '@/hooks/use-balance';
import { useT } from '@/i18n/use-t';
import { GamePrimaryButton } from '@/components/game/kit/game-primary-button';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { cn } from '@/lib/utils';

function isOpenBet(state: string) {
  return state === 'pending' || state === 'active';
}

function useSportsBetList(reloadToken = 0, active = true) {
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
    if (!active) return;
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load, reloadToken, active]);

  const onCashout = async (id: string) => {
    setBusy(id);
    try {
      await sportsService.cashout(id);
      await syncBalance();
      await load();
    } catch {
      await load();
    } finally {
      setBusy(null);
    }
  };

  return { bets, busy, onCashout };
}

export function SportsMyBets({
  compact = false,
  hideHeading = false,
  reloadToken = 0,
}: {
  compact?: boolean;
  hideHeading?: boolean;
  reloadToken?: number;
}) {
  const { t, localeTag } = useT();
  const { bets, busy, onCashout } = useSportsBetList(reloadToken);

  const list = compact ? bets.slice(0, 4) : bets;

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

              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-roobert text-[11px] text-whisper-gray">
                    {t('sports.stakeShort', {
                      amount: bet.stake.toLocaleString(localeTag, { maximumFractionDigits: 2 }),
                    })}
                  </span>
                  <span className="font-roobert text-[12px] font-bold text-frost-white tabular-nums">
                    {bet.payout > 0
                      ? t('sports.paidOut', {
                          amount: bet.payout.toLocaleString(localeTag, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }),
                        })
                      : t('sports.toWin', {
                          amount: (bet.stake * bet.odds).toLocaleString(localeTag, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }),
                        })}
                  </span>
                </div>
                {bet.cashout && (
                  <>
                    <p className="font-roobert text-[10px] leading-snug text-whisper-gray">
                      {t('sports.cashoutHint')}
                    </p>
                    <GamePrimaryButton
                      onClick={() => void onCashout(bet.id)}
                      disabled={busy === bet.id}
                    >
                      {t('sports.cashoutFor', { amount: bet.cashout.amount.toFixed(2) })}
                    </GamePrimaryButton>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function SportsMyBetsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, localeTag } = useT();
  const { bets, busy, onCashout } = useSportsBetList(0, open);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const list = useMemo(() => {
    return [...bets].sort((a, b) => {
      const ao = isOpenBet(a.state) ? 0 : 1;
      const bo = isOpenBet(b.state) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime();
    });
  }, [bets]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('sports.myBetsClose')}
            className="absolute inset-0 bg-black/80 cursor-pointer"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="relative z-10 w-full max-w-lg max-h-[86vh] flex flex-col rounded-t-[28px] sm:rounded-3xl border border-white/10 bg-[#0c0d0f] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <Clock size={15} className="text-whisper-gray shrink-0" strokeWidth={1.8} />
                <h2 className="font-roobert font-medium text-white text-[15px]">
                  {t('sports.myBets')}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-roobert text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray tabular-nums">
                  {t('sports.shownOf', { n: list.length, total: list.length })}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('sports.myBetsClose')}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-4 py-14 text-center font-roobert text-[13px] text-whisper-gray">
                  {t('sports.noBets')}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {list.map((bet, index) => {
                    const openBet = isOpenBet(bet.state);
                    const dateLabel = new Date(bet.placedAt).toLocaleString(localeTag, {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const stakeLabel = bet.stake.toLocaleString(localeTag, {
                      maximumFractionDigits: 2,
                    });
                    const net = openBet
                      ? null
                      : bet.state === 'lost'
                        ? Number(bet.payout) > 0
                          ? Number(bet.payout) - bet.stake
                          : -bet.stake
                        : Number(bet.payout) - bet.stake;
                    const expanded = expandedId === bet.id;

                    return (
                      <div key={bet.id}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : bet.id)}
                          className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
                        >
                          <div className="w-9 h-9 rounded-full border border-white/12 bg-white/[0.05] flex items-center justify-center text-frost-white shrink-0">
                            <SoccerBallIcon size={16} strokeWidth={2.1} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-roobert font-medium text-[14px] text-white truncate">
                              {bet.eventName || (bet.type === 'express' ? t('sports.express') : t('sports.title'))}
                            </div>
                            <div className="font-roobert text-[11.5px] text-whisper-gray/70 tabular-nums">
                              {t('profile.stakeAt', { date: dateLabel, amount: stakeLabel })}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={cn(
                                'font-roobert font-medium text-[14px] tabular-nums',
                                openBet
                                  ? 'text-whisper-gray'
                                  : net != null && net > 0
                                    ? 'text-white font-semibold'
                                    : net != null && net < 0
                                      ? 'text-[#ff8a76]/80'
                                      : 'text-whisper-gray'
                              )}
                            >
                              {openBet
                                ? '…'
                                : `${(net ?? 0) >= 0 ? '+' : '−'}${Math.abs(net ?? 0).toLocaleString(localeTag, {
                                    maximumFractionDigits: 2,
                                  })} zł`}
                            </div>
                            {!openBet && bet.odds > 0 && (
                              <div className="mt-0.5 font-roobert text-[10px] font-medium text-whisper-gray tabular-nums">
                                x{bet.odds.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </button>

                        {expanded && (
                          <div className="px-4 pb-3 flex flex-col gap-1.5">
                            {!!bet.legs?.length &&
                              bet.legs.map((leg, i) => (
                                <div
                                  key={`${bet.id}-${i}-${index}`}
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
                            {bet.cashout && (
                              <GamePrimaryButton
                                onClick={() => void onCashout(bet.id)}
                                disabled={busy === bet.id}
                              >
                                {t('sports.cashoutFor', { amount: bet.cashout.amount.toFixed(2) })}
                              </GamePrimaryButton>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
