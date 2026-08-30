'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import type { SelectedBet } from '@/types/sports';
import { useT } from '@/i18n/use-t';
import { StakeField } from '@/components/game/kit/stake-field';
import { GamePrimaryButton } from '@/components/game/kit/game-primary-button';
import { sportsService } from '@/services/sports.service';
import { useBalance } from '@/hooks/use-balance';

interface SportsBetslipDrawerProps {
  selectedBet: SelectedBet | null;
  onClearBet: () => void;
  minBet: number;
  maxBet: number;
  paused?: boolean;
}

export function SportsBetslipDrawer({
  selectedBet,
  onClearBet,
  minBet,
  maxBet,
  paused = false,
}: SportsBetslipDrawerProps) {
  const { t, localeTag } = useT();
  const { syncBalance } = useBalance();
  const [stake, setStake] = useState<number>(Math.max(minBet, 10));
  const [busy, setBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStake((current) => Math.min(maxBet, Math.max(minBet, current)));
  }, [minBet, maxBet]);

  if (!selectedBet) return null;

  const potentialWin = stake * selectedBet.odds;

  const handlePlaceBet = async () => {
    if (busy || isSuccess || paused) return;
    setBusy(true);
    setError(null);
    try {
      await sportsService.placeBet({
        eventId: selectedBet.eventId,
        outcome: selectedBet.outcomeType,
        stake,
      });
      await syncBalance();
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClearBet();
      }, 1400);
    } catch (err) {
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
      <div className="fixed bottom-16 inset-x-0 z-40 flex justify-center px-3 pointer-events-none">
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
                {t('sports.betslipTitle')}
              </span>
              {selectedBet.isLive && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-300 border border-red-500/25 uppercase">
                  Live
                </span>
              )}
            </div>

            <button
              onClick={onClearBet}
              className="p-1 rounded-full text-whisper-gray hover:text-frost-white hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-roobert text-[11px] text-whisper-gray truncate">
                {selectedBet.league}
              </div>
              <div className="font-roobert text-[13px] font-semibold text-frost-white truncate">
                {selectedBet.eventName}
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
              <span className="font-roobert text-[10px] text-whisper-gray uppercase tracking-wider">
                {selectedBet.outcomeLabel}
              </span>
              <span className="font-roobert text-[15px] font-bold text-frost-white tabular-nums">
                {selectedBet.odds.toFixed(2)}
              </span>
            </div>
          </div>

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
                  void handlePlaceBet();
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
                    {paused ? t('sports.linePaused') : t('sports.placeBet')}
                  </span>
                )}
              </GamePrimaryButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
