'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Plus, Minus, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';

interface MacvSlotControlsProps {
  balance: number;
  betAmount: number;
  onBetChange: (amount: number) => void;
  onSpin: () => void;
  isSpinning: boolean;
  isTurbo: boolean;
  onToggleTurbo: () => void;
  autoSpinsLeft: number;
  onToggleAuto: () => void;
  freeSpinsLeft: number;
  disabled?: boolean;
}

const BET_PRESETS = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

export function MacvSlotControls({
  balance,
  betAmount,
  onBetChange,
  onSpin,
  isSpinning,
  isTurbo,
  onToggleTurbo,
  autoSpinsLeft,
  onToggleAuto,
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
    <div className="w-full max-w-[960px] sm:max-w-[1020px] xl:max-w-[1120px] mx-auto px-2 select-none">
      {/* Main Controls Dock */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-4 md:gap-6 p-2 sm:p-3 md:p-4 rounded-2xl sm:rounded-3xl bg-[#080a0f]/92 border border-amber-500/20 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.85)]">
        {/* 1. Compact Bet & Balance Selector */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => handleStepBet(-1)}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
            aria-label="Decrease bet"
          >
            <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          </button>

          {/* Compact Bet Pill with Live Balance and Current Bet */}
          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => setShowBetModal((prev) => !prev)}
            className="relative px-2 sm:px-4 py-1 sm:py-2 rounded-xl sm:rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-amber-500/40 active:scale-98 flex items-center gap-1.5 sm:gap-2.5 transition-all justify-center cursor-pointer shadow-lg hover:border-amber-400/60"
          >
            <div className="relative w-5 h-5 sm:w-7 sm:h-7 shrink-0">
              <Image
                src="/MacvSlot/coinbutton.webp"
                alt="coin"
                fill
                className="object-contain drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]"
              />
            </div>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[9px] sm:text-[11px] text-zinc-400 font-medium tracking-tight whitespace-nowrap">
                Баланс: <strong className="text-zinc-200 font-mono font-bold">{balance.toFixed(1)} zł</strong>
              </span>
              <span className="font-black text-xs sm:text-base text-amber-300 font-brand whitespace-nowrap">
                Ставка: {isFreeSpinActive ? 'FREE' : `${betAmount.toFixed(betAmount < 1 ? 2 : 1)} zł`}
              </span>
            </div>
          </button>

          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => handleStepBet(1)}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
            aria-label="Increase bet"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* 2. Symmetrical Action Trio: [AUTO] --- [SPIN] --- [TURBO] */}
        <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
          {/* AUTO BUTTON */}
          <button
            type="button"
            onClick={onToggleAuto}
            className={cn(
              'relative w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none',
              autoSpinsLeft > 0 ? 'drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'hover:scale-105 opacity-85 hover:opacity-100'
            )}
            title={autoSpinsLeft > 0 ? 'Остановить авто-спины' : 'Авто-спины'}
          >
            {autoSpinsLeft > 0 ? (
              <div className="relative w-full h-full flex flex-col items-center justify-center">
                <Image
                  src="/MacvSlot/autobutton.webp"
                  alt="Auto"
                  fill
                  className="object-contain filter hue-rotate-90"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                  <Square className="w-3.5 h-3.5 text-white fill-white" />
                  <span className="text-[9px] sm:text-[10px] font-black text-white">{autoSpinsLeft}</span>
                </div>
              </div>
            ) : (
              <Image
                src="/MacvSlot/autobutton.webp"
                alt="Auto"
                fill
                className="object-contain"
              />
            )}
          </button>

          {/* BIG SPIN BUTTON (Center) - No rotation */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            disabled={disabled || (isSpinning && !isFreeSpinActive)}
            onClick={() => {
              if (window?.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
              }
              onSpin();
            }}
            className={cn(
              'relative w-16 h-16 sm:w-22 sm:h-22 md:w-26 md:h-26 flex items-center justify-center transition-all focus:outline-none select-none cursor-pointer',
              isSpinning && 'opacity-85 cursor-not-allowed'
            )}
          >
            {/* Ambient pulse glow */}
            <div className="absolute inset-[-4px] rounded-full bg-amber-400/25 blur-lg animate-pulse pointer-events-none" />

            <div className="relative w-full h-full drop-shadow-[0_8px_20px_rgba(245,158,11,0.6)]">
              <Image
                src="/MacvSlot/spinbutton.webp"
                alt="SPIN"
                fill
                priority
                className="object-contain transition-transform duration-200"
              />
            </div>
          </motion.button>

          {/* TURBO BUTTON */}
          <button
            type="button"
            onClick={onToggleTurbo}
            className={cn(
              'relative w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none',
              isTurbo
                ? 'drop-shadow-[0_0_18px_rgba(251,191,36,0.95)] scale-105'
                : 'opacity-75 hover:opacity-100 hover:scale-105'
            )}
            title={isTurbo ? 'Турбо-режим включен' : 'Включить турбо'}
          >
            <Image
              src="/MacvSlot/turbobutton.webp"
              alt="Turbo"
              fill
              className={cn(
                'object-contain',
                isTurbo && 'filter brightness-125'
              )}
            />
          </button>
        </div>
      </div>

      {/* Quick Bet Preset Drawer */}
      {showBetModal && (
        <div className="mt-2.5 p-3 rounded-2xl bg-black/95 border border-amber-500/35 backdrop-blur-md flex flex-wrap gap-2 justify-center items-center shadow-xl">
          <span className="text-xs text-zinc-400 mr-2 font-bold uppercase tracking-wider">
            Быстрая ставка:
          </span>
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
                'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer',
                Math.abs(betAmount - amount) < 0.01
                  ? 'bg-amber-400 text-black shadow-lg scale-105'
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
