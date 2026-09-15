'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { soundManager } from '@/lib/sound/sound-manager';
import { cn } from '@/lib/utils';

// ============================================================================
// 1. BONUS START CELEBRATION MODAL (Triggered when 3+ Scatters hit)
// ============================================================================
interface MacvSlotBonusModalProps {
  freeSpinsAwarded: number;
  onStartFreeSpins: () => void;
}

export function MacvSlotBonusModal({
  freeSpinsAwarded,
  onStartFreeSpins,
}: MacvSlotBonusModalProps) {
  if (freeSpinsAwarded <= 0) return null;

  const handleStart = () => {
    soundManager.play('ui.success', { volume: 0.8 });
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
      (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
    }
    onStartFreeSpins();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-300 select-none">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 25 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="relative w-full max-w-[460px] rounded-[36px] bg-gradient-to-b from-[#78350f] via-[#451a03] to-[#1a0802] border-4 border-[#b45309] p-6 sm:p-8 text-center text-white shadow-[0_25px_80px_rgba(0,0,0,0.95),inset_0_4px_12px_rgba(254,240,138,0.35),inset_0_-4px_12px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col items-center"
      >
        {/* Decorative corner scrolls */}
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-amber-300/40 rounded-tl-xl pointer-events-none" />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-amber-300/40 rounded-tr-xl pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-amber-300/40 rounded-bl-xl pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-amber-300/40 rounded-br-xl pointer-events-none" />

        {/* Top 3D Title */}
        <h2
          className="font-brand font-black uppercase text-3xl sm:text-5xl tracking-wider text-yellow-300"
          style={{
            textShadow: '0 2px 0 #b45309, 0 4px 0 #991b1b, 0 6px 0 #7f1d1d, 0 8px 0 #450a0a, 0 12px 16px rgba(0,0,0,0.9)',
          }}
        >
          ПОЗДРАВЛЯЕМ!
        </h2>

        {/* 3D Cyan Subtitle */}
        <h3
          className="font-brand font-black uppercase text-xl sm:text-2xl tracking-wide text-[#22d3ee] mt-1"
          style={{
            textShadow: '0 2px 0 #0e7490, 0 4px 0 #155e75, 0 6px 0 #083344, 0 8px 12px rgba(0,0,0,0.8)',
          }}
        >
          БОНУСНЫЙ РАУНД
        </h3>

        {/* Glowing 3D Scatter Symbol */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 my-3 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-amber-400/25 blur-2xl animate-pulse pointer-events-none" />
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_0_25px_rgba(251,191,36,0.9)] animate-bounce duration-1000">
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

        {/* Inner Carved Plaque: Free Spins Count */}
        <div className="w-full max-w-[380px] my-2 py-3 px-6 rounded-full border-4 border-[#eab308] bg-gradient-to-b from-[#1c0c05] via-[#2d1205] to-[#120602] shadow-[inset_0_4px_15px_rgba(0,0,0,0.95),0_0_25px_rgba(234,179,8,0.35)] flex flex-col items-center justify-center">
          <span
            className="font-brand font-black text-4xl sm:text-5xl text-yellow-300 leading-none"
            style={{
              textShadow: '0 2px 0 #f59e0b, 0 4px 0 #b91c1c, 0 7px 0 #7f1d1d, 0 10px 15px rgba(0,0,0,0.9)',
            }}
          >
            {freeSpinsAwarded}
          </span>
          <span
            className="font-brand font-black uppercase text-sm sm:text-base text-[#22d3ee] tracking-wider mt-1"
            style={{
              textShadow: '0 2px 0 #0e7490, 0 3px 0 #155e75, 0 5px 8px rgba(0,0,0,0.8)',
            }}
          >
            БЕСПЛАТНЫХ ВРАЩЕНИЙ
          </span>
        </div>

        <p className="text-amber-200/80 text-xs sm:text-sm font-sans mt-2 mb-5">
          3+ Scatter активировали 10 автоматических вращений!
        </p>

        {/* Heavy Physical 3D Arcade Machine Button */}
        <button
          type="button"
          onClick={handleStart}
          className="w-full max-w-[340px] py-4 px-6 rounded-2xl bg-gradient-to-b from-[#fef08a] via-[#f59e0b] to-[#b45309] border-b-6 border-[#78350f] active:border-b-0 active:translate-y-1.5 transition-all shadow-[0_12px_30px_rgba(0,0,0,0.85),0_0_35px_rgba(245,158,11,0.5)] cursor-pointer flex items-center justify-center gap-2 select-none group"
        >
          <Zap className="w-5 h-5 fill-black text-black shrink-0" />
          <span
            className="font-brand font-black text-base sm:text-lg text-black uppercase tracking-wider"
            style={{ textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
          >
            НАЧАТЬ РАУНД
          </span>
        </button>
      </motion.div>
    </div>
  );
}

// ============================================================================
// 2. BONUS VICTORY CELEBRATION MODAL (Matching Screenshot 2 Pragmatic Style)
// ============================================================================
interface MacvSlotBonusVictoryModalProps {
  isOpen: boolean;
  totalWon: number;
  totalSpins: number;
  onDismiss: () => void;
}

export function MacvSlotBonusVictoryModal({
  isOpen,
  totalWon,
  totalSpins,
  onDismiss,
}: MacvSlotBonusVictoryModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = () => {
    soundManager.play('ui.success', { volume: 0.8 });
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
      (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
    onDismiss();
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-300 select-none cursor-pointer"
    >
      <motion.div
        initial={{ scale: 0.75, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="relative w-full max-w-[560px] rounded-[36px] bg-gradient-to-b from-[#78350f] via-[#451a03] to-[#1c0802] border-4 border-[#b45309] p-6 sm:p-9 text-center text-white shadow-[0_30px_90px_rgba(0,0,0,0.95),inset_0_4px_14px_rgba(254,240,138,0.4),inset_0_-4px_14px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col items-center"
      >
        {/* Decorative corner scrolls */}
        <div className="absolute top-2.5 left-2.5 w-8 h-8 border-t-2 border-l-2 border-amber-300/40 rounded-tl-2xl pointer-events-none" />
        <div className="absolute top-2.5 right-2.5 w-8 h-8 border-t-2 border-r-2 border-amber-300/40 rounded-tr-2xl pointer-events-none" />
        <div className="absolute bottom-2.5 left-2.5 w-8 h-8 border-b-2 border-l-2 border-amber-300/40 rounded-bl-2xl pointer-events-none" />
        <div className="absolute bottom-2.5 right-2.5 w-8 h-8 border-b-2 border-r-2 border-amber-300/40 rounded-br-2xl pointer-events-none" />

        {/* Ambient Top Golden Aura */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-56 rounded-full bg-gradient-to-b from-yellow-400/30 to-transparent blur-3xl pointer-events-none" />

        {/* Top 3D Title: ПОЗДРАВЛЯЕМ! */}
        <h2
          className="font-brand font-black uppercase text-4xl sm:text-6xl tracking-wider text-yellow-300 leading-tight"
          style={{
            textShadow: '0 2px 0 #b45309, 0 4px 0 #991b1b, 0 7px 0 #7f1d1d, 0 10px 0 #450a0a, 0 14px 20px rgba(0,0,0,0.9)',
          }}
        >
          ПОЗДРАВЛЯЕМ!
        </h2>

        {/* Subtitle: ВЫ ВЫИГРАЛИ */}
        <h3
          className="font-brand font-black uppercase text-2xl sm:text-4xl tracking-wide text-[#22d3ee] mt-1 sm:mt-2"
          style={{
            textShadow: '0 2px 0 #0e7490, 0 4px 0 #155e75, 0 6px 0 #083344, 0 8px 14px rgba(0,0,0,0.85)',
          }}
        >
          ВЫ ВЫИГРАЛИ
        </h3>

        {/* Inner Carved Wooden Plaque with Golden Scroll Border */}
        <div className="w-full max-w-[440px] my-4 sm:my-5 py-3 sm:py-4 px-6 sm:px-8 rounded-full border-4 border-[#eab308] bg-gradient-to-b from-[#1a0b04] via-[#2c1105] to-[#120602] shadow-[inset_0_5px_18px_rgba(0,0,0,0.95),0_0_30px_rgba(234,179,8,0.4)] flex items-center justify-center">
          <span
            className="font-brand font-black text-4xl sm:text-6xl text-yellow-300 tracking-tight"
            style={{
              textShadow: '0 2px 0 #f59e0b, 0 5px 0 #b91c1c, 0 8px 0 #7f1d1d, 0 12px 0 #450a0a, 0 16px 22px rgba(0,0,0,0.9)',
            }}
          >
            {totalWon.toFixed(2)} zł
          </span>
        </div>

        {/* Below Plaque: В X БЕСПЛАТНЫХ ВРАЩЕНИЯХ */}
        <h4
          className="font-brand font-black uppercase text-lg sm:text-2xl text-[#22d3ee] tracking-wide"
          style={{
            textShadow: '0 2px 0 #0e7490, 0 4px 0 #155e75, 0 6px 10px rgba(0,0,0,0.8)',
          }}
        >
          В {totalSpins} БЕСПЛАТНЫХ ВРАЩЕНИЯХ
        </h4>

        {/* Bottom prompt: НАЖМИТЕ В ЛЮБОМ МЕСТЕ, ЧТОБЫ ПРОДОЛЖИТЬ */}
        <p className="text-amber-300/95 font-black text-xs sm:text-sm uppercase tracking-[0.2em] mt-6 animate-pulse drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          НАЖМИТЕ В ЛЮБОМ МЕСТЕ, ЧТОБЫ ПРОДОЛЖИТЬ
        </p>
      </motion.div>
    </div>
  );
}

// ============================================================================
// 3. FEATURE BUY MODAL (Physical Arcade Machine Dialog, Anti-AI-Slop)
// ============================================================================
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
    soundManager.play('ui.success', { volume: 0.7 });
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
      (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl select-none animate-in fade-in duration-200">
      {/* Backdrop dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Arcade Chassis */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 350 }}
        className="relative z-10 w-full max-w-[430px] rounded-[36px] bg-gradient-to-b from-[#1f1624] via-[#100c18] to-[#08060c] border-3 border-amber-500/60 shadow-[0_25px_80px_rgba(0,0,0,0.95),0_0_50px_rgba(245,158,11,0.25)] p-6 sm:p-7 overflow-hidden flex flex-col items-center text-center"
      >
        {/* Ambient Top Golden Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-48 rounded-full bg-gradient-to-b from-amber-400/25 to-transparent blur-3xl pointer-events-none" />

        {/* Close Button (X) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer z-20 active:scale-90"
          aria-label="Close"
        >
          <span className="text-lg leading-none">&times;</span>
        </button>

        {/* 3D Golden Arcade Header: КУПИТЬ БОНУС */}
        <h2
          className="font-brand font-black uppercase text-3xl sm:text-4xl tracking-wider text-yellow-300 drop-shadow-md mt-1"
          style={{
            textShadow: '0 2px 0 #b45309, 0 4px 0 #78350f, 0 6px 10px rgba(0,0,0,0.85)',
          }}
        >
          КУПИТЬ БОНУС
        </h2>

        <p className="text-amber-200/75 text-xs mt-1 font-sans">
          Гарантированный запуск 10 фриспинов со скеттерами
        </p>

        {/* Feature Showcase: 3 Glowing 3D Scatters */}
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
          <div className="relative w-20 h-20 sm:w-22 sm:h-22 z-10 transition-transform hover:scale-110">
            <div className="absolute inset-0 bg-amber-400/30 rounded-full blur-xl animate-pulse" />
            <Image
              src="/MacvSlot/scatter.webp"
              alt="Scatter Center"
              fill
              unoptimized
              className="object-contain drop-shadow-[0_0_22px_rgba(251,191,36,0.95)]"
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
        <div className="w-full flex items-center justify-between p-3 rounded-2xl bg-black/60 border border-amber-500/30 mb-5 shadow-inner">
          <div className="flex flex-col text-left leading-tight">
            <span className="text-[10px] text-amber-200/70 uppercase font-mono tracking-wider font-bold">
              Базовая ставка:
            </span>
            <span className="font-brand font-black text-xl text-white mt-0.5">
              {betAmount.toFixed(betAmount < 1 ? 2 : 1)} zł
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleStepBet(-1)}
              className="w-9 h-9 rounded-xl bg-gradient-to-b from-zinc-700 to-zinc-900 hover:from-zinc-600 hover:to-zinc-800 text-amber-300 border border-amber-500/40 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md font-black text-lg"
            >
              -
            </button>

            <button
              type="button"
              onClick={() => handleStepBet(1)}
              className="w-9 h-9 rounded-xl bg-gradient-to-b from-zinc-700 to-zinc-900 hover:from-zinc-600 hover:to-zinc-800 text-amber-300 border border-amber-500/40 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md font-black text-lg"
            >
              +
            </button>
          </div>
        </div>

        {/* Heavy Physical 3D Arcade Machine Button */}
        <button
          type="button"
          disabled={!canAfford || isSpinning}
          onClick={handleBuy}
          className={cn(
            'w-full py-4 px-6 rounded-2xl font-brand font-black text-base uppercase tracking-wider transition-all select-none cursor-pointer flex items-center justify-center',
            canAfford
              ? 'bg-gradient-to-b from-[#fef08a] via-[#f59e0b] to-[#b45309] border-b-6 border-[#78350f] active:border-b-0 active:translate-y-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.85),0_0_35px_rgba(245,158,11,0.5)] text-black'
              : 'bg-zinc-800 border-b-4 border-zinc-900 text-zinc-500 cursor-not-allowed opacity-75'
          )}
        >
          {canAfford ? (
            <span style={{ textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}>
              КУПИТЬ ЗА {cost.toFixed(0)} zł (100x)
            </span>
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
