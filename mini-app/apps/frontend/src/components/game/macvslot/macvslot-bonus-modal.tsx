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

  // Always display at least 10 spins for the completed bonus round
  const displaySpinsCount = Math.max(10, totalSpins);

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
          В {displaySpinsCount} БЕСПЛАТНЫХ ВРАЩЕНИЯХ
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
// 3. FEATURE BUY MODAL (Authentic Pragmatic Wood Scroll with Red/Green Action Badges)
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
    soundManager.play('ui.success', { volume: 0.8 });
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
      (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl select-none animate-in fade-in duration-200">
      {/* Backdrop dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Wooden Scroll Chassis matching User Screenshot */}
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative z-10 w-full max-w-[420px] rounded-[32px] bg-gradient-to-b from-[#6b3512] via-[#451e08] to-[#2b1003] border-4 border-[#b45309] shadow-[0_30px_90px_rgba(0,0,0,0.95),inset_0_4px_12px_rgba(254,240,138,0.35),inset_0_-4px_12px_rgba(0,0,0,0.9)] p-6 sm:p-7 overflow-hidden flex flex-col items-center text-center"
      >
        {/* Curled glowing top scroll roll edge */}
        <div className="absolute top-0 inset-x-0 h-4 bg-gradient-to-b from-amber-200/40 via-amber-400/20 to-transparent blur-[1px] pointer-events-none" />

        {/* Ambient Top Golden Aura */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full bg-gradient-to-b from-amber-400/30 to-transparent blur-3xl pointer-events-none" />

        {/* Horizontal plank lines texture overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0px,transparent_38px,rgba(0,0,0,0.35)_39px,rgba(0,0,0,0.35)_40px)] pointer-events-none opacity-60" />

        {/* 3D Cyan Title matching screenshot: КУПИТЬ / БЕСПЛАТНЫЕ / СПИНЫ */}
        <h2
          className="relative z-10 font-brand font-black uppercase text-2xl sm:text-3xl leading-tight tracking-wider text-[#22d3ee] mt-1"
          style={{
            textShadow: '0 2px 0 #0e7490, 0 4px 0 #155e75, 0 6px 0 #083344, 0 8px 12px rgba(0,0,0,0.9)',
          }}
        >
          КУПИТЬ<br />
          БЕСПЛАТНЫЕ<br />
          СПИНЫ
        </h2>

        {/* Price & Bet Selector Section */}
        <div className="relative z-10 my-5 flex items-center justify-center gap-3 sm:gap-4">
          {/* Bet Decrement */}
          <button
            type="button"
            onClick={() => handleStepBet(-1)}
            className="w-10 h-10 rounded-full bg-gradient-to-b from-[#854d0e] to-[#451a03] border-2 border-amber-400/80 text-yellow-200 font-black text-xl flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.8)] active:scale-90 cursor-pointer transition-transform"
            aria-label="Уменьшить ставку"
          >
            -
          </button>

          {/* Giant 3D Yellow Price matching Screenshot */}
          <span
            className="font-brand font-black text-4xl sm:text-5xl text-yellow-300 tracking-tight select-none leading-none"
            style={{
              textShadow: '0 2px 0 #f59e0b, 0 4px 0 #b91c1c, 0 7px 0 #7f1d1d, 0 10px 16px rgba(0,0,0,0.95)',
            }}
          >
            {cost.toFixed(0)} zł
          </span>

          {/* Bet Increment */}
          <button
            type="button"
            onClick={() => handleStepBet(1)}
            className="w-10 h-10 rounded-full bg-gradient-to-b from-[#854d0e] to-[#451a03] border-2 border-amber-400/80 text-yellow-200 font-black text-xl flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.8)] active:scale-90 cursor-pointer transition-transform"
            aria-label="Увеличить ставку"
          >
            +
          </button>
        </div>

        {/* Current Bet info */}
        <span className="relative z-10 text-xs font-mono text-amber-200/90 font-bold mb-6">
          Базовая ставка: {betAmount.toFixed(betAmount < 1 ? 2 : 1)} zł
        </span>

        {/* Authentic Red (✕) and Green (✓) Action Buttons matching Screenshot */}
        <div className="relative z-10 flex items-center justify-center gap-8 sm:gap-10 mt-1 mb-2">
          {/* CANCEL BUTTON: Red 3D Button with ✕ */}
          <button
            type="button"
            onClick={onClose}
            className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-b from-[#dc2626] via-[#b91c1c] to-[#7f1d1d] border-4 border-[#991b1b] shadow-[0_10px_25px_rgba(0,0,0,0.9),inset_0_3px_6px_rgba(255,255,255,0.4)] active:translate-y-1 active:shadow-none flex items-center justify-center cursor-pointer group transition-all"
            title="Отмена"
            aria-label="Отмена"
          >
            <span
              className="text-white font-brand font-black text-3xl sm:text-4xl leading-none"
              style={{
                textShadow: '0 2px 0 #7f1d1d, 0 4px 6px rgba(0,0,0,0.85)',
              }}
            >
              ✕
            </span>
          </button>

          {/* CONFIRM / BUY BUTTON: Green 3D Button with ✓ */}
          <button
            type="button"
            disabled={!canAfford || isSpinning}
            onClick={handleBuy}
            className={cn(
              'w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 shadow-[0_10px_25px_rgba(0,0,0,0.9),inset_0_3px_6px_rgba(255,255,255,0.4)] active:translate-y-1 active:shadow-none flex items-center justify-center cursor-pointer group transition-all',
              canAfford
                ? 'bg-gradient-to-b from-[#10b981] via-[#059669] to-[#047857] border-[#065f46]'
                : 'bg-zinc-800 border-zinc-700 opacity-50 cursor-not-allowed'
            )}
            title={canAfford ? 'Купить бонуску' : 'Недостаточно средств'}
            aria-label="Купить бонуску"
          >
            <span
              className="text-white font-brand font-black text-3xl sm:text-4xl leading-none"
              style={{
                textShadow: '0 2px 0 #064e3b, 0 4px 6px rgba(0,0,0,0.85)',
              }}
            >
              ✓
            </span>
          </button>
        </div>

        {!canAfford && (
          <span className="relative z-10 text-[11px] font-mono text-red-300 mt-2 font-bold">
            Недостаточно средств: {balance.toFixed(1)} / {cost.toFixed(0)} zł
          </span>
        )}
      </motion.div>
    </div>
  );
}
