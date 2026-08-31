'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Check, ChevronDown, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { ExpressTrainIcon } from '@/components/ui/express-train-icon';
import { useT } from '@/i18n/use-t';
import { StakeField } from '@/components/game/kit/stake-field';
import { GamePrimaryButton } from '@/components/game/kit/game-primary-button';
import { sportsService, SportsOddsChangedError } from '@/services/sports.service';
import { useBalance } from '@/hooks/use-balance';
import { useSportsSlip } from '@/store/sports-slip-store';
import { conflictingEventIds } from '@/lib/sports-markets';

interface SportsBetslipDrawerProps {
  minBet: number;
  maxBet: number;
  paused?: boolean;
}

interface SlipReceipt {
  count: number;
  stake: number;
  odds: number;
  win: number;
}

export function SportsBetslipDrawer({
  minBet,
  maxBet,
  paused = false,
}: SportsBetslipDrawerProps) {
  const { t, localeTag } = useT();
  const { syncBalance } = useBalance();
  const legs = useSportsSlip((s) => s.legs);
  const collapsed = useSportsSlip((s) => s.collapsed);
  const setCollapsed = useSportsSlip((s) => s.setCollapsed);
  const removeLeg = useSportsSlip((s) => s.removeLeg);
  const clear = useSportsSlip((s) => s.clear);
  const [stake, setStake] = useState<number>(Math.max(minBet, 10));
  const [busy, setBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oddsPrompt, setOddsPrompt] = useState<Array<{ quoted: number; current: number }> | null>(null);
  const [receipt, setReceipt] = useState<SlipReceipt | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [freebets, setFreebets] = useState<Array<{
    id: string;
    campaignTitle?: string;
    amount: number;
    minOdds: number;
    maxOdds: number;
    minLegs: number;
    payoutType: 'net_win' | 'full_win';
    status: string;
  }>>([]);
  const [selectedFreebetId, setSelectedFreebetId] = useState<string | null>(null);
  const prevLegs = useRef(0);
  const dragControls = useDragControls();

  const loadFreebets = useCallback(async () => {
    try {
      const fbs = await sportsService.fetchFreebets();
      setFreebets(fbs.filter((f) => f.status === 'available'));
    } catch {}
  }, []);

  useEffect(() => {
    void loadFreebets();
  }, [loadFreebets]);

  useEffect(() => {
    setStake((current) => Math.min(maxBet, Math.max(minBet, current)));
  }, [minBet, maxBet]);

  useEffect(() => {
    if (legs.length > prevLegs.current) {
      setDismissed(false);
    }
    prevLegs.current = legs.length;
  }, [legs.length]);

  const combinedOdds = useMemo(
    () => Math.min(35, Math.round(legs.reduce((acc, leg) => acc * leg.odds, 1) * 100) / 100),
    [legs]
  );
  const selectedFreebet = useMemo(
    () => freebets.find((f) => f.id === selectedFreebetId) ?? null,
    [freebets, selectedFreebetId]
  );

  const isExpress = legs.length >= 2;
  const effectiveStake = selectedFreebet ? selectedFreebet.amount : stake;

  const freebetEligible = useMemo(() => {
    if (!selectedFreebet) return true;
    if (combinedOdds < selectedFreebet.minOdds - 0.001) return false;
    if (combinedOdds > selectedFreebet.maxOdds + 0.001) return false;
    if (legs.length < selectedFreebet.minLegs) return false;
    return true;
  }, [selectedFreebet, combinedOdds, legs.length]);

  const freebetError = useMemo(() => {
    if (!selectedFreebet) return null;
    if (combinedOdds < selectedFreebet.minOdds - 0.001) {
      return `Мин. кэф для фрибета: x${selectedFreebet.minOdds.toFixed(2)}`;
    }
    if (combinedOdds > selectedFreebet.maxOdds + 0.001) {
      return `Макс. кэф для фрибета: x${selectedFreebet.maxOdds.toFixed(2)}`;
    }
    if (legs.length < selectedFreebet.minLegs) {
      return `Минимум событий: ${selectedFreebet.minLegs}`;
    }
    return null;
  }, [selectedFreebet, combinedOdds, legs.length]);

  const potentialWin = useMemo(() => {
    if (selectedFreebet) {
      if (selectedFreebet.payoutType === 'net_win') {
        return Math.max(0, Math.round(effectiveStake * Math.max(0, combinedOdds - 1) * 100) / 100);
      }
      return Math.round(effectiveStake * combinedOdds * 100) / 100;
    }
    return Math.round(stake * combinedOdds * 100) / 100;
  }, [selectedFreebet, effectiveStake, combinedOdds, stake]);

  const conflictIds = useMemo(() => conflictingEventIds(legs), [legs]);
  const hasConflict = conflictIds.length > 0;
  const conflictLegs = useMemo(
    () => legs.filter((leg) => conflictIds.includes(leg.eventId)),
    [legs, conflictIds]
  );
  const visible = !dismissed && (legs.length > 0 || !!receipt);

  const dismiss = () => {
    setReceipt(null);
    setCollapsed(false);
    setIsSuccess(false);
    setDismissed(true);
    setSelectedFreebetId(null);
    clear();
  };

  const handlePlaceBet = async (acceptChange = false) => {
    if (busy || isSuccess || paused || legs.length === 0 || hasConflict || !freebetEligible) return;
    setBusy(true);
    setError(null);
    try {
      await sportsService.placeBet({
        stake: effectiveStake,
        freebetId: selectedFreebetId ?? undefined,
        acceptChange,
        quotedOdds: legs.map((leg) => leg.odds),
        legs: legs.map((leg) => ({
          eventId: leg.eventId,
          marketKind: leg.marketKind,
          outcomeKey: leg.outcomeType,
          line: leg.line,
        })),
      });
      await syncBalance();
      void loadFreebets();
      setOddsPrompt(null);
      setIsSuccess(true);
      const placed: SlipReceipt = {
        count: legs.length,
        stake: effectiveStake,
        odds: combinedOdds,
        win: potentialWin,
      };
      setTimeout(() => {
        setReceipt(placed);
        setIsSuccess(false);
        setCollapsed(true);
        setDismissed(false);
        setSelectedFreebetId(null);
        clear();
      }, 700);
    } catch (err) {
      if (err instanceof SportsOddsChangedError) {
        setOddsPrompt(err.changed);
        setError(t('sports.oddsChanged'));
        return;
      }
      const message = err instanceof Error ? err.message : t('sports.betFailed');
      setError(
        message === 'Insufficient balance' || message.includes('Недостаточно')
          ? t('common.insufficientFunds')
          : message
      );
    } finally {
      setBusy(false);
    }
  };

  const dockLabel = legs.length
    ? t('sports.betslipTitle')
    : t('sports.betAcceptedShort');
  const dockHint = legs.length
    ? t('sports.legsCount', { count: legs.length })
    : receipt
      ? `${t('sports.legsCount', { count: receipt.count })} · ${receipt.win.toLocaleString(localeTag, { maximumFractionDigits: 2 })} zł`
      : '';

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed bottom-[6.75rem] inset-x-0 z-50 flex justify-center px-3 pointer-events-none">
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.12, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (!collapsed && (info.offset.y > 52 || info.velocity.y > 420)) {
                setCollapsed(true);
              }
              if (collapsed && (info.offset.y < -36 || info.velocity.y < -380)) {
                setCollapsed(false);
              }
            }}
            className="pointer-events-auto w-full max-w-[400px] rounded-2xl border border-white/12 bg-[#0f1217] shadow-[0_12px_45px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden"
          >
            <div
              className="flex justify-center pt-1.5 pb-0 touch-none cursor-grab"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <span className="h-1 w-8 rounded-full bg-white/22" />
            </div>
            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/12 flex items-center justify-center text-frost-white">
                    {receipt && !legs.length ? (
                      <Check size={13} strokeWidth={2.6} />
                    ) : isExpress ? (
                      <ExpressTrainIcon size={13} strokeWidth={2.2} />
                    ) : (
                      <SoccerBallIcon size={13} strokeWidth={2.2} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-roobert text-[12px] font-bold text-frost-white truncate">
                      {dockLabel}
                    </div>
                    <div className="font-roobert text-[10px] text-whisper-gray truncate">{dockHint}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] font-roobert text-[10px] text-frost-white">
                    {t('sports.openCoupon')}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') dismiss();
                    }}
                    className="p-1 rounded-full text-whisper-gray hover:text-frost-white"
                    aria-label={t('common.close')}
                  >
                    <X size={15} />
                  </span>
                </div>
              </button>
            ) : (
              <div className="px-3 pb-2.5 pt-1 flex flex-col gap-2 max-h-[min(38vh,320px)] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/12 flex items-center justify-center text-frost-white">
                      {isExpress ? (
                        <ExpressTrainIcon size={14} strokeWidth={2.2} />
                      ) : (
                        <SoccerBallIcon size={14} strokeWidth={2.2} />
                      )}
                    </div>
                    <span className="font-roobert text-[12px] font-bold text-frost-white tracking-tight">
                      {legs.length
                        ? isExpress
                          ? t('sports.express')
                          : t('sports.betslipTitle')
                        : t('sports.myBets')}
                    </span>
                    {legs.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/[0.08] text-whisper-gray border border-white/10">
                        {t('sports.legsCount', { count: legs.length })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCollapsed(true)}
                      className="p-1 rounded-full text-whisper-gray hover:text-frost-white hover:bg-white/10 transition-colors"
                      aria-label={t('sports.slipHidden')}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      onClick={dismiss}
                      className="p-1 rounded-full text-whisper-gray hover:text-frost-white hover:bg-white/10 transition-colors"
                      aria-label={t('sports.clearCoupon')}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {legs.length > 0 ? (
                  <>
                    {hasConflict && (
                      <div className="rounded-2xl border border-red-400/35 bg-red-950/35 px-3 py-2.5 flex flex-col gap-2">
                        <div className="font-roobert text-[12px] font-bold text-red-200">
                          {t('sports.conflictTitle')}
                        </div>
                        <p className="font-roobert text-[11px] leading-snug text-red-100/80">
                          {t('sports.conflictBody')}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {conflictLegs.map((leg) => (
                            <button
                              key={`${leg.eventId}-${leg.marketKind}-${leg.outcomeType}-${leg.line ?? ''}-fix`}
                              type="button"
                              onClick={() => removeLeg(leg)}
                              className="w-full text-left px-2.5 py-1.5 rounded-xl border border-red-300/25 bg-black/30 font-roobert text-[11px] text-frost-white hover:bg-black/50"
                            >
                              {t('sports.conflictRemove', { label: `${leg.eventName}: ${leg.outcomeLabel}` })}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1 max-h-[108px] overflow-y-auto">
                      {legs.map((leg) => (
                        <div
                          key={`${leg.eventId}-${leg.marketKind}-${leg.outcomeType}-${leg.line ?? ''}`}
                          className={
                            conflictIds.includes(leg.eventId)
                              ? 'rounded-xl border border-red-400/45 bg-red-950/25 px-2 py-1.5 flex items-center justify-between gap-2'
                              : 'rounded-xl border border-white/10 bg-black/40 px-2 py-1.5 flex items-center justify-between gap-2'
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-roobert text-[12px] font-semibold text-frost-white truncate">
                              {leg.eventName}
                            </div>
                            <div className="font-roobert text-[10px] text-whisper-gray truncate">
                              {leg.outcomeLabel}
                              {leg.isLive ? ' · Live' : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-roobert text-[13px] font-bold text-frost-white tabular-nums">
                              {leg.odds.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeLeg(leg)}
                              className="p-1 rounded-full text-whisper-gray hover:text-frost-white"
                              aria-label={t('sports.clearCoupon')}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {isExpress && (
                      <div className="flex items-center justify-between px-0.5">
                        <span className="font-roobert text-[11px] text-whisper-gray">
                          {t('sports.combinedOdds')}
                        </span>
                        <span className="font-roobert text-[14px] font-bold text-frost-white tabular-nums">
                          {combinedOdds.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {freebets.length > 0 && (
                      <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-amber-400/10 border border-amber-400/25">
                        <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                          <span className="flex items-center gap-1.5">
                            <Gift size={13} /> Доступные фрибеты ({freebets.length})
                          </span>
                          {selectedFreebetId && (
                            <button
                              type="button"
                              onClick={() => setSelectedFreebetId(null)}
                              className="text-whisper-gray hover:text-white text-[10px] font-normal underline"
                            >
                              Отменить
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {freebets.map((fb) => {
                            const isSel = selectedFreebetId === fb.id;
                            const valid = combinedOdds >= fb.minOdds && legs.length >= fb.minLegs;
                            return (
                              <button
                                key={fb.id}
                                type="button"
                                onClick={() => setSelectedFreebetId(isSel ? null : fb.id)}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5",
                                  isSel
                                    ? "bg-amber-400 text-black shadow-md shadow-amber-400/20 ring-2 ring-amber-300"
                                    : valid
                                    ? "bg-white/10 text-frost-white hover:bg-white/15 border border-white/10"
                                    : "bg-white/5 text-whisper-gray border border-white/5 opacity-60"
                                )}
                              >
                                <span>{fb.amount} zł</span>
                                <span className="text-[9.5px] opacity-80 font-normal">
                                  (кэф ≥{fb.minOdds})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedFreebet && (
                          <div className="text-[10px] text-amber-200/90 flex items-center justify-between pt-0.5">
                            <span>
                              {selectedFreebet.payoutType === 'net_win' ? 'Чистый выигрыш (кэф - 1)' : 'Полный выигрыш'}
                            </span>
                            {freebetError ? (
                              <span className="text-red-300 font-bold">{freebetError}</span>
                            ) : (
                              <span className="text-emerald-400 font-bold">✓ Условия выполнены</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!selectedFreebet ? (
                      <StakeField
                        amount={stake}
                        onAmountChange={setStake}
                        minBet={minBet}
                        maxBet={maxBet}
                        disabled={busy || isSuccess}
                        label={t('sports.stake')}
                        className="gap-1"
                        inputClassName="text-[16px] text-center"
                      />
                    ) : (
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/40 border border-amber-400/30">
                        <span className="text-[12px] font-semibold text-whisper-gray">Сумма ставки (Фрибет):</span>
                        <span className="text-[14px] font-extrabold text-amber-300">{selectedFreebet.amount} zł</span>
                      </div>
                    )}

                    {error && (
                      <div className="font-roobert text-[11px] text-red-300">{error}</div>
                    )}
                    {oddsPrompt && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-roobert text-[11px] text-whisper-gray">
                        {oddsPrompt.map((row, i) => (
                          <div key={i} className="flex justify-between tabular-nums">
                            <span>{row.quoted.toFixed(2)}</span>
                            <span className="text-frost-white">{row.current.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
                      <div className="flex flex-col">
                        <span className="font-roobert text-[9px] text-whisper-gray uppercase tracking-tight">
                          {t('sports.potentialWin')}
                        </span>
                        <span className="font-roobert text-[14px] font-extrabold text-frost-white tabular-nums">
                          {potentialWin.toLocaleString(localeTag, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          zł
                        </span>
                      </div>

                      <div className="flex-1">
                        <GamePrimaryButton
                          onClick={() => {
                            void handlePlaceBet(!!oddsPrompt);
                          }}
                          disabled={busy || isSuccess || paused || hasConflict || (!!selectedFreebet && !freebetEligible)}
                          tone={isSuccess || hasConflict || (!!selectedFreebet && !freebetEligible) ? 'muted' : 'solid'}
                        >
                          {isSuccess ? (
                            <>
                              <Check size={16} strokeWidth={3} />
                              <span>{t('sports.betAccepted')}</span>
                            </>
                          ) : (
                            <span>
                              {hasConflict
                                ? t('sports.conflictKeepOne')
                                : paused
                                  ? t('sports.linePaused')
                                  : oddsPrompt
                                    ? t('sports.acceptOdds')
                                    : selectedFreebet
                                      ? freebetError
                                        ? freebetError
                                        : `Фрибет ${selectedFreebet.amount} zł`
                                      : isExpress
                                        ? t('sports.express')
                                        : t('sports.placeBet')}
                            </span>
                          )}
                        </GamePrimaryButton>
                      </div>
                    </div>
                  </>
                ) : receipt ? (
                  <div className="font-roobert text-[12px] text-whisper-gray px-0.5 pb-1">
                    {t('sports.betAccepted')}
                    {' · '}
                    {receipt.win.toLocaleString(localeTag, { maximumFractionDigits: 2 })} zł
                  </div>
                ) : null}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
