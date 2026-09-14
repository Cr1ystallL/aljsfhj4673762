'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Plus, Minus, Zap, Play, Square, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';

interface MacvSlotControlsProps {
  betAmount: number;
  onBetChange: (amount: number) => void;
  onSpin: () => void;
  isSpinning: boolean;
  isTurbo: boolean;
  onToggleTurbo: () => void;
  autoSpinsLeft: number;
  onToggleAuto: () => void;
  lastWin: number;
  freeSpinsLeft: number;
  disabled?: boolean;
}

const BET_PRESETS = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

export function MacvSlotControls({
  betAmount,
  onBetChange,
  onSpin,
  isSpinning,
  isTurbo,
  onToggleTurbo,
  autoSpinsLeft,
  onToggleAuto,
  lastWin,
  freeSpinsLeft,
  disabled = false,
}: MacvSlotControlsProps) {
  const [showBetModal, setShowBetModal] = useState(false);

  const handleStepBet = (delta: number) => {
    soundManager.play('ui.click', { volume: 0.4 });
    const curIdx = BET_PRESETS.findIndex((b) => Math.abs(b - betAmount) < 0.01);
    if (curIdx !== -1) {
      const nextIdx = Math.max(0, Math.min(BET_PRESETS.length - 1, curIdx + delta));
      onBetChange(BET_PRESETS[nextIdx]);
    } else {
      const fallback = Math.max(0.2, Math.min(500, Math.round((betAmount + delta) * 10) / 10));
      onBetChange(fallback);
    }
  };

  const isFreeSpinActive = freeSpinsLeft > 0;

  return (
    <div className="w-full max-w-[840px] mx-auto mt-2 px-2 select-none">
      {/* 1. Top Dashboard: Win & Free Spins Indicators */}
      <div className="flex items-center justify-between gap-3 mb-2 px-3 py-2 rounded-2xl bg-black/60 border border-amber-500/25 backdrop-blur-md shadow-lg">
        {/* Left: Free Spins badge if active */}
        <div className="flex items-center gap-2">
          {isFreeSpinActive ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-black font-extrabold text-xs tracking-wider animate-pulse">
              <Zap className="w-3.5 h-3.5 fill-black" />
              <span>ФРИСПИНЫ: {freeSpinsLeft}</span>
            </div>
          ) : (
            <div className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>20 ЛИНИЙ</span>
            </div>
          )}
        </div>

        {/* Right: Last Win counter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 uppercase tracking-wider">Выигрыш:</span>
          <motion.span
            key={lastWin}
            initial={{ scale: 1.3, color: '#fef08a' }}
            animate={{ scale: 1, color: lastWin > 0 ? '#fbbf24' : '#ffffff' }}
            className={cn(
              'font-brand font-black text-lg sm:text-xl tracking-wide',
              lastWin > 0 ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]' : 'text-zinc-300'
            )}
          >
            {lastWin.toFixed(2)} zł
          </motion.span>
        </div>
      </div>

      {/* 2. Main Controls Dock */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 p-2 sm:p-3 rounded-2xl bg-[#090b10]/85 border border-amber-500/20 backdrop-blur-xl shadow-2xl">
        {/* Left Controls: Bet selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => handleStepBet(-1)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/20 transition-all"
            aria-label="Decrease bet"
          >
            <Minus className="w-4 h-4" />
          </button>

          {/* Bet value display / modal opener */}
          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => setShowBetModal((prev) => !prev)}
            className="relative px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-b from-zinc-800/90 to-zinc-900/90 border border-amber-500/30 active:scale-98 flex items-center gap-2 transition-all min-w-[90px] sm:min-w-[110px] justify-center"
          >
            <div className="relative w-5 h-5 shrink-0">
              <Image
                src="/MacvSlot/coinbutton.webp"
                alt="coin"
                fill
                className="object-contain"
              />
            </div>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Ставка</span>
              <span className="font-bold text-sm sm:text-base text-amber-400 font-brand">
                {isFreeSpinActive ? 'БЕСПЛАТНО' : `${betAmount.toFixed(2)} zł`}
              </span>
            </div>
          </button>

          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => handleStepBet(1)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/20 transition-all"
            aria-label="Increase bet"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Center: BIG SPIN BUTTON */}
        <div className="relative flex items-center justify-center">
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            disabled={disabled || (isSpinning && !isFreeSpinActive)}
            onClick={() => {
              if (window?.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
              }
              onSpin();
            }}
            className={cn(
              'relative w-18 h-18 sm:w-22 sm:h-22 rounded-full flex items-center justify-center transition-all focus:outline-none select-none',
              isSpinning && 'opacity-90 cursor-not-allowed'
            )}
          >
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-full bg-amber-500/30 blur-md animate-pulse pointer-events-none" />

            <div className="relative w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_8px_18px_rgba(245,158,11,0.5)]">
              <Image
                src="/MacvSlot/spinbutton.webp"
                alt="SPIN"
                fill
                priority
                className={cn(
                  'object-contain transition-transform duration-500',
                  isSpinning && 'animate-spin'
                )}
              />
            </div>
          </motion.button>
        </div>

        {/* Right Controls: Turbo & Auto Buttons */}
        <div className="flex items-center gap-2">
          {/* Turbo Toggle */}
          <button
            type="button"
            onClick={onToggleTurbo}
            className={cn(
              'relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all active:scale-95 border',
              isTurbo
                ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                : 'bg-zinc-800/80 border-zinc-700/60 opacity-70 hover:opacity-100'
            )}
            title={isTurbo ? 'Турбо-режим включен' : 'Включить турбо'}
          >
            <div className="relative w-8 h-8">
              <Image
                src="/MacvSlot/turbobutton.webp"
                alt="Turbo"
                fill
                className="object-contain"
              />
            </div>
          </button>

          {/* Auto Spin Toggle */}
          <button
            type="button"
            onClick={onToggleAuto}
            className={cn(
              'relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all active:scale-95 border',
              autoSpinsLeft > 0
                ? 'bg-red-500/20 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                : 'bg-zinc-800/80 border-zinc-700/60 opacity-70 hover:opacity-100'
            )}
            title={autoSpinsLeft > 0 ? 'Остановить авто-спины' : 'Авто-спины'}
          >
            {autoSpinsLeft > 0 ? (
              <div className="flex flex-col items-center justify-center">
                <Square className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                <span className="text-[9px] font-black text-white">{autoSpinsLeft}</span>
              </div>
            ) : (
              <div className="relative w-8 h-8">
                <Image
                  src="/MacvSlot/autobutton.webp"
                  alt="Auto"
                  fill
                  className="object-contain"
                />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Quick Bet Preset Drawer / Modal */}
      {showBetModal && (
        <div className="mt-2 p-2.5 rounded-xl bg-black/90 border border-amber-500/30 backdrop-blur-md flex flex-wrap gap-1.5 justify-center items-center">
          <span className="text-xs text-zinc-400 mr-1 font-semibold">Быстрая ставка:</span>
          {BET_PRESETS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                soundManager.play('ui.click', { volume: 0.35 });
                onBetChange(amount);
                setShowBetModal(false);
              }}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
                Math.abs(betAmount - amount) < 0.01
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {amount.toFixed(amount < 1 ? 2 : 0)} zł
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
