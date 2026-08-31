'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, X, Check, ArrowUpRight } from 'lucide-react';
import { sportsService, type SportsUserBet } from '@/services/sports.service';
import { useBalance } from '@/hooks/use-balance';
import { useT } from '@/i18n/use-t';
import { GamePrimaryButton } from '@/components/game/kit/game-primary-button';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { ExpressTrainIcon } from '@/components/ui/express-train-icon';
import { cn } from '@/lib/utils';

function isOpenBet(state: string) {
  return state === 'pending' || state === 'active';
}

export function formatOutcomeLabel(outcomeKey?: string, marketKind?: string, line?: number): string {
  if (!outcomeKey) return '—';
  const k = outcomeKey.toLowerCase().trim();
  if (k === 'p1' || k === '1') return 'П1 (Победа 1)';
  if (k === 'x') return 'X (Ничья)';
  if (k === 'p2' || k === '2') return 'П2 (Победа 2)';
  if (k === 'over' || k === 'total_over') return `ТБ ${line ?? 2.5}`;
  if (k === 'under' || k === 'total_under') return `ТМ ${line ?? 2.5}`;
  if (k === '1x') return '1X (П1 или ничья)';
  if (k === '12') return '12 (П1 или П2)';
  if (k === 'x2') return 'X2 (Ничья или П2)';
  if (k === 'h1' || k === 'handicap_1') return `Ф1 (${line != null ? (line > 0 ? `+${line}` : line) : ''})`;
  if (k === 'h2' || k === 'handicap_2') return `Ф2 (${line != null ? (line > 0 ? `+${line}` : line) : ''})`;
  if (k === 'yes' || k === 'btts_yes') return 'Обе забьют: Да';
  if (k === 'no' || k === 'btts_no') return 'Обе забьют: Нет';
  if (k === 'cs2_0') return 'Точный счёт: 2:0 (Карты)';
  if (k === 'cs2_1') return 'Точный счёт: 2:1 (Карты)';
  if (k === 'cs1_2') return 'Точный счёт: 1:2 (Карты)';
  if (k === 'cs0_2') return 'Точный счёт: 0:2 (Карты)';
  return outcomeKey;
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
          {list.map((bet) => {
            const isExpress = bet.type === 'express' || (bet.legs && bet.legs.length > 1);
            const openBet = isOpenBet(bet.state);

            return (
              <article
                key={bet.id}
                className="rounded-2xl border border-white/10 bg-[#0e1015] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full border flex items-center justify-center shrink-0',
                        isExpress
                          ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                          : 'border-white/12 bg-white/[0.05] text-frost-white'
                      )}
                    >
                      {isExpress ? (
                        <ExpressTrainIcon size={16} strokeWidth={2.2} />
                      ) : (
                        <SoccerBallIcon size={15} strokeWidth={2.1} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-roobert text-[13px] font-semibold text-frost-white truncate">
                        {isExpress && bet.legs && bet.legs.length > 1
                          ? `${bet.legs[0]?.eventName || bet.eventName || 'Матч'} +${bet.legs.length - 1}`
                          : bet.eventName || (bet.legs?.[0]?.eventName ?? 'Ставка')}
                      </div>
                      <div className="font-roobert text-[10.5px] text-whisper-gray">
                        {isExpress ? 'Экспресс' : 'Ординар'}
                        {' · '}
                        x{bet.odds.toFixed(2)}
                        {' · '}
                        {bet.stake.toLocaleString(localeTag, { maximumFractionDigits: 2 })} zł
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                      openBet
                        ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
                        : bet.state === 'won'
                        ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                        : bet.state === 'lost'
                        ? 'text-red-300 border-red-500/25 bg-red-500/10'
                        : 'text-whisper-gray border-white/10 bg-white/[0.04]'
                    )}
                  >
                    {openBet
                      ? 'Рассчитывается'
                      : bet.state === 'won'
                      ? 'Рассчитана (Выигрыш)'
                      : bet.state === 'lost'
                      ? 'Рассчитана (Проигрыш)'
                      : bet.state === 'cashed_out'
                      ? 'Выкуплена'
                      : 'Рассчитана'}
                  </span>
                </div>

                {!!bet.legs?.length && (
                  <div className="mt-1 rounded-xl bg-black/40 border border-white/5 p-2 flex flex-col gap-1.5">
                    {bet.legs.map((leg, i) => {
                      const matchTitle = leg.eventName || bet.eventName || `Событие #${i + 1}`;
                      const pick = formatOutcomeLabel(leg.outcomeKey, leg.marketKind, leg.line);

                      return (
                        <div
                          key={`${bet.id}-${i}`}
                          className="flex items-center justify-between gap-2 font-roobert text-[11.5px]"
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-frost-white font-medium truncate">
                              {matchTitle}
                            </span>
                            <span className="text-amber-300/90 text-[10.5px]">
                              {pick}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="tabular-nums font-bold text-frost-white">
                              {leg.odds ? Number(leg.odds).toFixed(2) : ''}
                            </span>
                            {leg.result === 'won' && (
                              <span className="text-emerald-400 text-[10px] font-bold">✓</span>
                            )}
                            {leg.result === 'lost' && (
                              <span className="text-rose-400 text-[10px] font-bold">✕</span>
                            )}
                            {(!leg.result || leg.result === 'pending') && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/5 pt-1.5">
                  <span className="font-roobert text-[11px] text-whisper-gray">
                    Ставка: {bet.stake.toLocaleString(localeTag, { maximumFractionDigits: 2 })} zł
                  </span>
                  <span className="font-roobert text-[12px] font-bold text-frost-white tabular-nums">
                    {bet.payout > 0
                      ? `Выплата: ${bet.payout.toLocaleString(localeTag, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} zł`
                      : `К выплате: ${(bet.stake * bet.odds).toLocaleString(localeTag, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} zł`}
                  </span>
                </div>

                {bet.cashout && (
                  <GamePrimaryButton
                    onClick={() => void onCashout(bet.id)}
                    disabled={busy === bet.id}
                  >
                    Выкуп за {bet.cashout.amount.toFixed(2)} zł
                  </GamePrimaryButton>
                )}
              </article>
            );
          })}
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
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 bg-[#111318]">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-whisper-gray">
                  <Clock size={15} className="text-amber-400 shrink-0" strokeWidth={2.2} />
                </div>
                <h2 className="font-roobert font-bold text-white text-[16px] tracking-tight">
                  {t('sports.myBets')}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-roobert text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray tabular-nums">
                  {list.length > 0 ? `1 из ${list.length}` : '0 из 0'}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('sports.myBetsClose')}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={15} strokeWidth={2.2} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar">
              {list.length === 0 ? (
                <div className="px-4 py-14 text-center font-roobert text-[13px] text-whisper-gray">
                  {t('sports.noBets')}
                </div>
              ) : (
                list.map((bet, index) => {
                  const openBet = isOpenBet(bet.state);
                  const isExpress = bet.type === 'express' || (bet.legs && bet.legs.length > 1);
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
                    : bet.isFreebet
                    ? bet.state === 'won'
                      ? Number(bet.payout)
                      : 0
                    : bet.state === 'lost'
                    ? Number(bet.payout) > 0
                      ? Number(bet.payout) - bet.stake
                      : -bet.stake
                    : Number(bet.payout) - bet.stake;

                  // Header title: "Feyenoord Rotterdam — ADO Den Haag +2"
                  const firstLeg = bet.legs?.[0];
                  const titleName = isExpress && bet.legs && bet.legs.length > 1
                    ? `${firstLeg?.eventName || bet.eventName || 'Матч'} +${bet.legs.length - 1}`
                    : bet.eventName || firstLeg?.eventName || 'Ставка';

                  return (
                    <div
                      key={bet.id}
                      className={cn(
                        'rounded-2xl border transition-all overflow-hidden',
                        openBet
                          ? 'border-amber-400/30 bg-black/50 shadow-md shadow-amber-500/5'
                          : bet.state === 'won'
                          ? 'border-emerald-500/20 bg-black/40'
                          : 'border-white/5 bg-black/30 opacity-90'
                      )}
                    >
                      {/* Top Clickable Row */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === bet.id ? null : bet.id)}
                        className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 text-left transition-colors p-3.5"
                      >
                        {/* Icon: Express Train if express, Soccer ball if single */}
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full border flex items-center justify-center shrink-0 shadow-inner',
                            isExpress
                              ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                              : 'border-white/12 bg-white/[0.05] text-frost-white'
                          )}
                        >
                          {isExpress ? (
                            <ExpressTrainIcon size={19} strokeWidth={2.2} />
                          ) : (
                            <SoccerBallIcon size={17} strokeWidth={2.1} />
                          )}
                        </div>

                        {/* Title and date */}
                        <div className="min-w-0">
                          <div className="font-roobert font-bold text-[14px] sm:text-[15px] text-white truncate tracking-tight">
                            {titleName}
                          </div>
                          <div className="font-roobert text-[11.5px] text-whisper-gray/80 tabular-nums mt-0.5 flex items-center gap-1.5">
                            <span>{dateLabel} · {bet.isFreebet ? 'фрибет' : 'ставка'} {stakeLabel} zł</span>
                            {bet.isFreebet && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold text-[10px]">
                                🎁 ФРИБЕТ
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Payout & Odds */}
                        <div className="text-right shrink-0">
                          <div
                            className={cn(
                              'font-roobert font-extrabold text-[14px] sm:text-[15px] tabular-nums',
                              openBet
                                ? 'text-amber-300 text-[12px] font-bold px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/25'
                                : net != null && net > 0
                                ? 'text-emerald-400'
                                : net != null && net < 0
                                ? 'text-[#ff8a76]'
                                : 'text-whisper-gray'
                            )}
                          >
                            {openBet
                              ? 'Рассчитывается'
                              : `${(net ?? 0) >= 0 ? '+' : '−'}${Math.abs(net ?? 0).toLocaleString(localeTag, {
                                  maximumFractionDigits: 2,
                                })} zł`}
                          </div>
                          {bet.odds > 0 && (
                            <div className="mt-0.5 font-roobert text-[11.5px] font-semibold text-whisper-gray tabular-nums">
                              x{bet.odds.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Status indicator bar */}
                      <div className="flex items-center justify-between px-2.5 py-1 rounded-xl bg-black/40 border border-white/5 text-[11px]">
                        <span className="text-whisper-gray">Статус:</span>
                        <span
                          className={cn(
                            'font-bold tracking-tight',
                            openBet
                              ? 'text-amber-300 flex items-center gap-1'
                              : bet.state === 'won'
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          )}
                        >
                          {openBet ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              <span>Рассчитывается</span>
                            </>
                          ) : bet.state === 'won' ? (
                            'Рассчитана (Выигрыш)'
                          ) : (
                            'Рассчитана (Проигрыш)'
                          )}
                        </span>
                      </div>

                      {/* Detailed Match Legs (Full Match Names & Chosen Outcomes instead of raw p1, p2, p3) */}
                      {!!bet.legs?.length && (
                        <div className="rounded-xl border border-white/10 bg-black/50 p-2.5 flex flex-col gap-2 shadow-inner">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-whisper-gray/70 px-0.5">
                            События купона ({bet.legs.length}):
                          </div>

                          <div className="divide-y divide-white/5">
                            {bet.legs.map((leg, i) => {
                              const matchTitle = leg.eventName || bet.eventName || `Матч #${i + 1}`;
                              const pick = formatOutcomeLabel(leg.outcomeKey, leg.marketKind, leg.line);

                              return (
                                <div
                                  key={`${bet.id}-${i}-${index}`}
                                  className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-[12px]"
                                >
                                  {/* Match and Selected Outcome */}
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className="font-semibold text-frost-white truncate">
                                      {matchTitle}
                                    </span>
                                    <span className="text-[11px] text-amber-300/90 font-medium">
                                      {pick}
                                    </span>
                                  </div>

                                  {/* Individual Leg Odds & Outcome Status */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-roobert font-bold text-frost-white tabular-nums text-[12.5px]">
                                      {leg.odds ? Number(leg.odds).toFixed(2) : ''}
                                    </span>
                                    {leg.result === 'won' && (
                                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-[9px] font-bold">
                                        ✓
                                      </span>
                                    )}
                                    {leg.result === 'lost' && (
                                      <span className="w-4 h-4 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center text-[9px] font-bold">
                                        ✕
                                      </span>
                                    )}
                                    {(!leg.result || leg.result === 'pending') && (
                                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {bet.cashout && (
                        <GamePrimaryButton
                          onClick={() => void onCashout(bet.id)}
                          disabled={busy === bet.id}
                        >
                          {t('sports.cashoutFor', { amount: bet.cashout.amount.toFixed(2) })}
                        </GamePrimaryButton>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
