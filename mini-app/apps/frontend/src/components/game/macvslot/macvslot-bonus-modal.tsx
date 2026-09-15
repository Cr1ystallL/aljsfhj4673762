'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Zap, Sparkles } from 'lucide-react';
import { soundManager } from '@/lib/sound/sound-manager';
import { cn } from '@/lib/utils';

interface MacvSlotBonusModalProps {
  freeSpinsAwarded: number;
  onStartFreeSpins: () => void;
}

export function MacvSlotBonusModal({
  freeSpinsAwarded,
  onStartFreeSpins,
}: MacvSlotBonusModalProps) {
  if (freeSpinsAwarded <= 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-300 select-none">
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="relative w-full max-w-sm rounded-3xl bg-[#080a12]/98 border border-amber-500/40 p-6 sm:p-7 text-center text-white shadow-[0_20px_60px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(251,191,36,0.3)] overflow-hidden"
      >
        {/* Soft atmospheric golden ambient bloom */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

        {/* Top luxury badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300 mb-4">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>BONUS FEATURE</span>
        </div>

        {/* Scatter Logo in refined gold ring */}
        <div className="relative w-28 h-28 mx-auto mb-4 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-amber-500/25 animate-[spin_12s_linear_infinite]" />
          <div className="absolute inset-2 rounded-full bg-gradient-to-b from-amber-500/10 to-transparent blur-sm" />
          <div className="relative w-24 h-24 drop-shadow-[0_0_20px_rgba(251,191,36,0.7)]">
            <Image
              src="/MacvSlot/scatter.webp"
              alt="Scatter Bonus"
              fill
              unoptimized
              className="object-contain"
              priority
            />
          </div>
        </div>

        <h3 className="font-brand font-black text-2xl sm:text-3xl text-white tracking-wide uppercase">
          ФРИСПИНЫ
        </h3>

        <p className="text-zinc-400 text-xs sm:text-sm mt-1 font-sans">
          3+ Scatter символа активировали бонусный раунд
        </p>

        {/* Free Spins Count Card */}
        <div className="my-5 py-3 px-4 rounded-2xl bg-black/60 border border-amber-500/30 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]">
          <span className="block text-[10px] font-mono tracking-[0.25em] text-zinc-500 uppercase">
            КОЛИЧЕСТВО СПИНОВ
          </span>
          <span className="font-brand font-black text-3xl sm:text-4xl text-amber-300 tracking-wider">
            {freeSpinsAwarded}
          </span>
        </div>

        {/* Luxury CTA Button */}
        <button
          type="button"
          onClick={() => {
            soundManager.play('ui.success');
            onStartFreeSpins();
          }}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-black font-brand font-black text-sm uppercase tracking-widest shadow-[0_4px_25px_rgba(245,158,11,0.4)] hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Zap className="w-4 h-4 fill-black" />
          <span>НАЧАТЬ РАУНД</span>
        </button>
      </motion.div>
    </div>
  );
}

interface MacvSlotBuyBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  betAmount: number;
  onBetChange: (amount: number) => void;
  balance: number;
  isSpinning?: boolean;
}

const BUY_BET_PRESETS = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

export function MacvSlotBuyBonusModal({
  isOpen,
  onClose,
  onConfirm,
  betAmount,
  onBetChange,
  balance,
  isSpinning = false,
}: MacvSlotBuyBonusModalProps) {
  if (!isOpen) return null;

  const cost = Math.round(betAmount * 100 * 100) / 100;
  const canAfford = balance >= cost;

  const handleStepBet = (delta: number) => {
    soundManager.play('ui.click', { volume: 0.35 });
    const curIdx = BUY_BET_PRESETS.findIndex((b) => Math.abs(b - betAmount) < 0.01);
    if (curIdx !== -1) {
      const nextIdx = Math.max(0, Math.min(BUY_BET_PRESETS.length - 1, curIdx + delta));
      onBetChange(BUY_BET_PRESETS[nextIdx]);
    } else {
      const fallback = Math.max(0.2, Math.min(500, Math.round((betAmount + delta) * 10) / 10));
      onBetChange(fallback);
    }
  };

  const handleBuy = () => {
    if (!canAfford || isSpinning) return;
    soundManager.play('ui.click', { volume: 0.4 });
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl select-none animate-in fade-in duration-200">
      {/* Backdrop dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Chassis */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 15 }}
        transition={{ type: 'spring', damping: 26, stiffness: 350 }}
        className="relative z-10 w-full max-w-[420px] rounded-[32px] bg-gradient-to-b from-[#181c28] via-[#0d1018] to-[#06080c] border-2 border-amber-500/50 shadow-[0_25px_80px_rgba(0,0,0,0.95),0_0_50px_rgba(245,158,11,0.25)] p-5 sm:p-6 overflow-hidden flex flex-col items-center text-center"
      >
        {/* Ambient Top Glow Flare */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-48 rounded-full bg-gradient-to-b from-amber-400/25 to-transparent blur-3xl pointer-events-none" />

        {/* Close Button (X) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer z-20 active:scale-90"
          aria-label="Close"
        >
          <span className="text-base leading-none">&times;</span>
        </button>

        {/* Header Plaque */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-400/50 text-amber-300 font-brand font-black text-[11px] uppercase tracking-[0.2em] shadow-inner mb-2">
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>FEATURE BUY</span>
        </div>

        <h2 className="font-brand font-black text-2xl sm:text-3xl text-white uppercase tracking-wider drop-shadow-md">
          КУПИТЬ БОНУС
        </h2>

        <p className="text-zinc-400 text-xs mt-1 font-sans">
          Гарантированный запуск бонусной игры с множителями
        </p>

        {/* Feature Showcase: 3 Glowing Scatters */}
        <div className="relative my-4 py-2 flex items-center justify-center gap-3">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 -rotate-6 transition-transform hover:scale-110">
            <Image
              src="/MacvSlot/scatter.webp"
              alt="Scatter 1"
              fill
              unoptimized
              className="object-contain drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]"
            />
          </div>
          <div className="relative w-18 h-18 sm:w-20 sm:h-20 z-10 transition-transform hover:scale-110">
            <div className="absolute inset-0 bg-amber-400/30 rounded-full blur-xl animate-pulse" />
            <Image
              src="/MacvSlot/scatter.webp"
              alt="Scatter Center"
              fill
              unoptimized
              className="object-contain drop-shadow-[0_0_20px_rgba(251,191,36,0.9)]"
            />
          </div>
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rotate-6 transition-transform hover:scale-110">
            <Image
              src="/MacvSlot/scatter.webp"
              alt="Scatter 3"
              fill
              unoptimized
              className="object-contain drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]"
            />
          </div>
        </div>

        {/* In-Modal Bet Selector */}
        <div className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-[#090b12] border border-amber-500/30 mb-4 shadow-inner">
          <div className="flex flex-col text-left leading-tight">
            <span className="text-[9px] text-zinc-400 uppercase font-mono tracking-wider font-semibold">
              Базовая ставка:
            </span>
            <span className="font-brand font-black text-lg text-white">
              {betAmount.toFixed(betAmount < 1 ? 2 : 1)} zł
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleStepBet(-1)}
              className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md font-bold text-base"
            >
              -
            </button>

            <button
              type="button"
              onClick={() => handleStepBet(1)}
              className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md font-bold text-base"
            >
              +
            </button>
          </div>
        </div>

        {/* Action CTA Button */}
        <button
          type="button"
          disabled={!canAfford || isSpinning}
          onClick={handleBuy}
          className={cn(
            'w-full py-3.5 px-4 rounded-2xl font-brand font-black text-sm uppercase tracking-wider transition-all duration-200 cursor-pointer select-none shadow-lg',
            canAfford
              ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:brightness-110 active:scale-[0.98] text-black shadow-[0_0_25px_rgba(245,158,11,0.5)]'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-500 cursor-not-allowed opacity-75'
          )}
        >
          {canAfford ? (
            <span>КУПИТЬ ЗА {cost.toFixed(0)} zł (100x)</span>
          ) : (
            <span className="text-xs">
              НЕДОСТАТОЧНО СРЕДСТВ ({balance.toFixed(1)} / {cost.toFixed(0)} zł)
            </span>
          )}
        </button>
      </motion.div>
    </div>
  );
}
