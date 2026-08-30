'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { useT } from '@/i18n/use-t';
import { StakeField } from '@/components/game/kit/stake-field';
import { GamePrimaryButton } from '@/components/game/kit/game-primary-button';
import { sportsService, SportsOddsChangedError } from '@/services/sports.service';
import { useBalance } from '@/hooks/use-balance';
import { useSportsSlip } from '@/store/sports-slip-store';

interface SportsBetslipDrawerProps {
  minBet: number;
  maxBet: number;
  paused?: boolean;
}

export function SportsBetslipDrawer({
  minBet,
  maxBet,
  paused = false,
}: SportsBetslipDrawerProps) {
  const { t, localeTag } = useT();
  const { syncBalance } = useBalance();
  const legs = useSportsSlip((s) => s.legs);
  const remove = useSportsSlip((s) => s.remove);
  const clear = useSportsSlip((s) => s.clear);
  const [stake, setStake] = useState<number>(Math.max(minBet, 10));
  const [busy, setBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oddsPrompt, setOddsPrompt] = useState<Array<{ quoted: number; current: number }> | null>(null);

  useEffect(() => {
    setStake((current) => Math.min(maxBet, Math.max(minBet, current)));
  }, [minBet, maxBet]);

  const combinedOdds = useMemo(
    () => Math.round(legs.reduce((acc, leg) => acc * leg.odds, 1) * 100) / 100,
    [legs]
  );
  const isExpress = legs.length >= 2;
  const potentialWin = stake * combinedOdds;

  const handlePlaceBet = async (acceptChange = false) => {
    if (busy || isSuccess || paused || legs.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await sportsService.placeBet({
        stake,
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
      setOddsPrompt(null);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        clear();
      }, 1400);
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

  return (
    <AnimatePresence>
      {legs.length > 0 && (
        <div className="fixed bottom-[6.75rem] inset-x-0 z-50 flex justify-center px-3 pointer-events-none">
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            className="pointer-events-auto w-full max-w-[460px] rounded-3xl border border-white/12 bg-[#0f1217] p-4 shadow-[0_12px_45px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/12 flex items-center justify-center text-frost-white">
                  <SoccerBallIcon size={14} strokeWidth={2.2} />
                </div>
                <span className="font-roobert text-[13px] font-bold text-frost-white tracking-tight">
                  {isExpress ? t('sports.express') : t('sports.betslipTitle')}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/[0.08] text-whisper-gray border border-white/10">
                  {t('sports.legsCount', { count: legs.length })}
                </span>
              </div>

              <button
                onClick={clear}
                className="p-1 rounded-full text-whisper-gray hover:text-frost-white hover:bg-white/10 transition-colors"
                aria-label={t('sports.clearCoupon')}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[168px] overflow-y-auto">
              {legs.map((leg) => (
                <div
                  key={`${leg.eventId}-${leg.marketKind}-${leg.outcomeType}-${leg.line ?? ''}`}
                  className="rounded-2xl border border-white/10 bg-black/40 p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-roobert text-[11px] text-whisper-gray truncate">
                      {leg.league}
                    </div>
                    <div className="font-roobert text-[13px] font-semibold text-frost-white truncate">
                      {leg.eventName}
                    </div>
                    <div className="font-roobert text-[10px] text-whisper-gray truncate">
                      {leg.outcomeLabel}
                      {leg.isLive ? ' · Live' : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-roobert text-[15px] font-bold text-frost-white tabular-nums">
                      {leg.odds.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(leg.eventId)}
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

            <StakeField
              amount={stake}
              onAmountChange={setStake}
              minBet={minBet}
              maxBet={maxBet}
              disabled={busy || isSuccess}
              label={t('sports.stake')}
            />

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
                <span className="font-roobert text-[10px] text-whisper-gray uppercase tracking-tight">
                  {t('sports.potentialWin')}
                </span>
                <span className="font-roobert text-[16px] font-extrabold text-frost-white tabular-nums">
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
                  disabled={busy || isSuccess || paused}
                  tone={isSuccess ? 'muted' : 'solid'}
                >
                  {isSuccess ? (
                    <>
                      <Check size={16} strokeWidth={3} />
                      <span>{t('sports.betAccepted')}</span>
                    </>
                  ) : (
                    <span>
                      {paused
                        ? t('sports.linePaused')
                        : oddsPrompt
                          ? t('sports.acceptOdds')
                          : isExpress
                            ? t('sports.express')
                            : t('sports.placeBet')}
                    </span>
                  )}
                </GamePrimaryButton>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
