'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check, ArrowRight, Wallet } from 'lucide-react';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { cn } from '@/lib/utils';
import type { SelectedBet } from '@/types/sports';
import { useT } from '@/i18n/use-t';

interface SportsBetslipDrawerProps {
  selectedBet: SelectedBet | null;
  onClearBet: () => void;
}

const PRESET_AMOUNTS = [10, 25, 50, 100, 250];

export function SportsBetslipDrawer({
  selectedBet,
  onClearBet,
}: SportsBetslipDrawerProps) {
  const { t, localeTag } = useT();
  const [stake, setStake] = useState<number>(50);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!selectedBet) return null;

  const potentialWin = stake * selectedBet.odds;

  const handlePlaceBet = () => {
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClearBet();
    }, 1800);
  };

  return (
    <AnimatePresence>
      <div className="fixed bottom-16 inset-x-0 z-40 flex justify-center px-3 pointer-events-none">
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 450, damping: 30 }}
          className="pointer-events-auto w-full max-w-[460px] rounded-3xl border border-amber-400/40 bg-[#0f1217]/95 backdrop-blur-xl p-4 shadow-[0_12px_45px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.15)] flex flex-col gap-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
                <SoccerBallIcon size={14} strokeWidth={2.2} />
              </div>
              <span className="font-roobert text-[13px] font-bold text-frost-white tracking-tight">
                {t('sports.betslipTitle')}
              </span>
              {selectedBet.isLive && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase">
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

          {/* Event & Selected Outcome Info */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-2.5 flex items-center justify-between gap-2 shadow-inner">
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
              <span className="font-roobert text-[15px] font-bold text-amber-400 tabular-nums">
                {selectedBet.odds.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Stake Quick Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => setStake(amt)}
                className={cn(
                  'flex-1 py-1 px-2 rounded-xl border text-[11px] font-roobert font-semibold transition-all active:scale-95 text-center',
                  stake === amt
                    ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow-sm'
                    : 'bg-white/[0.04] border-white/10 text-whisper-gray hover:text-frost-white'
                )}
              >
                +{amt}
              </button>
            ))}
          </div>

          {/* Potential Win & Action Button */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
            <div className="flex flex-col">
              <span className="font-roobert text-[10px] text-whisper-gray uppercase tracking-tight">
                {t('sports.potentialWin')}
              </span>
              <span className="font-roobert text-[16px] font-extrabold text-emerald-400 tabular-nums">
                {potentialWin.toLocaleString(localeTag, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                zł
              </span>
            </div>

            <button
              onClick={handlePlaceBet}
              disabled={isSuccess}
              className={cn(
                'flex-1 py-2.5 px-4 rounded-2xl font-roobert text-[13px] font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg',
                isSuccess
                  ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.5)]'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 text-black hover:brightness-110 shadow-[0_4px_18px_rgba(251,191,36,0.35)]'
              )}
            >
              {isSuccess ? (
                <>
                  <Check size={16} strokeWidth={3} />
                  <span>Ставка принята!</span>
                </>
              ) : (
                <>
                  <span>{t('sports.placeBet')}</span>
                  <span className="opacity-75">· {stake} zł</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
