'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Plus, Minus, Square } from 'lucide-react';
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
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-6 p-3 sm:p-4 rounded-3xl bg-[#080a0f]/90 border border-amber-500/20 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
        {/* 1. Large Bet Selector Element */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => handleStepBet(-1)}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
            aria-label="Decrease bet"
          >
            <Minus className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Large Bet Pill */}
          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => setShowBetModal((prev) => !prev)}
            className="relative px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-amber-500/40 active:scale-98 flex items-center gap-3 transition-all min-w-[120px] sm:min-w-[150px] justify-center cursor-pointer shadow-lg hover:border-amber-400/60"
          >
            <div className="relative w-7 h-7 sm:w-8 sm:h-8 shrink-0">
              <Image
                src="/MacvSlot/coinbutton.webp"
                alt="coin"
                fill
                className="object-contain drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]"
              />
            </div>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-xs text-zinc-400 uppercase font-bold tracking-wider">
                СТАВКА
              </span>
              <span className="font-black text-base sm:text-xl text-amber-300 font-brand">
                {isFreeSpinActive ? 'FREE' : `${betAmount.toFixed(2)} zł`}
              </span>
            </div>
          </button>

          <button
            type="button"
            disabled={disabled || isSpinning || isFreeSpinActive}
            onClick={() => handleStepBet(1)}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
            aria-label="Increase bet"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* 2. Symmetrical Action Trio: [AUTO] --- [SPIN] --- [TURBO] */}
        <div className="flex items-center gap-4 sm:gap-6 mx-auto sm:mx-0">
          {/* AUTO BUTTON (Left of Spin, NO border, larger) */}
          <button
            type="button"
            onClick={onToggleAuto}
            className={cn(
              'relative w-14 h-14 sm:w-17 sm:h-17 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none',
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
                  className="object-contain filter hue-rotate-90 animate-spin"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                  <Square className="w-4 h-4 text-white fill-white" />
                  <span className="text-[10px] font-black text-white">{autoSpinsLeft}</span>
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

          {/* BIG SPIN BUTTON (Center) */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            disabled={disabled || (isSpinning && !isFreeSpinActive)}
            onClick={() => {
              if (window?.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
              }
              onSpin();
            }}
            className={cn(
              'relative w-20 h-20 sm:w-26 sm:h-26 flex items-center justify-center transition-all focus:outline-none select-none cursor-pointer',
              isSpinning && 'opacity-90 cursor-not-allowed'
            )}
          >
            {/* Ambient pulse glow */}
            <div className="absolute inset-[-4px] rounded-full bg-amber-400/25 blur-lg animate-pulse pointer-events-none" />

            <div className="relative w-full h-full drop-shadow-[0_10px_22px_rgba(245,158,11,0.6)]">
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

          {/* TURBO BUTTON (Right of Spin, NO border, larger) */}
          <button
            type="button"
            onClick={onToggleTurbo}
            className={cn(
              'relative w-14 h-14 sm:w-17 sm:h-17 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none',
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
