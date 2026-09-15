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
  onBuyBonus?: () => void;
  canBuyBonus?: boolean;
  buyBonusCost?: number;
  isBonusMode?: boolean;
  isBonusPaused?: boolean;
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
  onBuyBonus,
  canBuyBonus = true,
  buyBonusCost,
  isBonusMode = false,
  isBonusPaused = false,
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

  const isFreeSpinActive = isBonusMode || freeSpinsLeft > 0;

  const handleSpinClick = () => {
    if (disabled || isSpinning) return;
    // When free spins are automatically executing (not paused), clicks do nothing
    if (isBonusMode && !isBonusPaused) return;
    if (typeof window !== 'undefined' && window?.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
    onSpin();
  };

  return (
    <div className="w-full max-w-[960px] sm:max-w-[1020px] xl:max-w-[1120px] mx-auto px-2 select-none">
      {/* ==================================================================== */}
      {/* 1. MOBILE CONTROLS (Screen < md)                                    */}
      {/* ==================================================================== */}
      <div className="flex md:hidden flex-col gap-2 w-full max-w-[420px] mx-auto">
        {isFreeSpinActive ? (
          /* Bonus Mode on Mobile: Bet is hidden, simply Spin & Turbo centered */
          <div className="flex items-center justify-center gap-6 px-6 py-2 rounded-2xl bg-[#080a0f]/92 border border-amber-500/30 backdrop-blur-xl shadow-lg">
            {/* Turbo Toggle */}
            <button
              type="button"
              onClick={onToggleTurbo}
              className={cn(
                'relative w-12 h-12 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none shrink-0',
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
                unoptimized
                className={cn('object-contain', isTurbo && 'filter brightness-125')}
              />
            </button>

            {/* Master Center Spin (Auto spinning indicator) */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              disabled={disabled || isSpinning || (isBonusMode && !isBonusPaused)}
              onClick={handleSpinClick}
              className={cn(
                'relative w-20 h-20 flex items-center justify-center transition-all focus:outline-none select-none cursor-pointer shrink-0',
                (isSpinning || (isBonusMode && !isBonusPaused)) && 'opacity-90'
              )}
            >
              <div className="absolute inset-[-6px] rounded-full bg-amber-400/35 blur-xl animate-pulse pointer-events-none" />
              <div className="relative w-full h-full drop-shadow-[0_10px_25px_rgba(245,158,11,0.7)]">
                <Image
                  src="/MacvSlot/spinbutton.webp"
                  alt="SPIN"
                  fill
                  priority
                  unoptimized
                  className={cn(
                    'object-contain transition-transform duration-200',
                    isSpinning && 'animate-[spin_4s_linear_infinite]'
                  )}
                />
              </div>
            </motion.button>
          </div>
        ) : (
          /* Normal Base Game 2-Tier Dock on Mobile */
          <>
            {/* Tier 1: Utility Row (Bet Selector - Center Scatter Bonus Button - Balance) */}
            <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-2xl bg-[#080a0f]/92 border border-amber-500/25 backdrop-blur-xl shadow-lg">
              {/* 1. Left: Bet Selector */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={disabled || isSpinning}
                  onClick={() => handleStepBet(-1)}
                  className="w-7 h-7 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
                  aria-label="Decrease bet"
                >
                  <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>

                <button
                  type="button"
                  disabled={disabled || isSpinning}
                  onClick={() => setShowBetModal((prev) => !prev)}
                  className="px-2 py-1 rounded-lg bg-gradient-to-b from-zinc-800 to-zinc-900 border border-amber-500/40 active:scale-95 flex items-center justify-center cursor-pointer shadow-md hover:border-amber-400/60"
                >
                  <span className="font-black text-[11px] text-amber-300 font-brand whitespace-nowrap">
                    {`${betAmount.toFixed(betAmount < 1 ? 2 : 1)} zł`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={disabled || isSpinning}
                  onClick={() => handleStepBet(1)}
                  className="w-7 h-7 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
                  aria-label="Increase bet"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              {/* 2. Center: Кнопка со скеттером и снизу цена (для телефонов) */}
              {onBuyBonus && (
                <button
                  type="button"
                  disabled={disabled || isSpinning || !canBuyBonus}
                  onClick={onBuyBonus}
                  className="flex flex-col items-center justify-center px-3 py-1 rounded-xl bg-gradient-to-b from-amber-500/25 via-[#121624] to-amber-500/20 border border-amber-500/50 hover:border-amber-400 active:scale-95 transition-all cursor-pointer disabled:opacity-40 shadow-[0_0_12px_rgba(251,191,36,0.3)] shrink-0 group"
                  title="Купить 10 фриспинов (100x)"
                >
                  <div className="relative w-6 h-6 shrink-0 group-hover:scale-110 transition-transform">
                    <Image
                      src="/MacvSlot/scatter.webp"
                      alt="Scatter"
                      fill
                      unoptimized
                      className="object-contain drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                    />
                  </div>
                  <span className="text-[10px] font-mono font-black text-amber-300 leading-tight mt-0.5 whitespace-nowrap">
                    {buyBonusCost !== undefined ? `${buyBonusCost.toFixed(0)} zł` : '100x'}
                  </span>
                </button>
              )}

              {/* 3. Right: Баланс */}
              <div className="flex flex-col items-end justify-center px-2 py-1 rounded-lg bg-zinc-900/80 border border-zinc-800 text-right shrink-0">
                <span className="text-[8px] text-zinc-400 font-medium leading-none">Баланс</span>
                <span className="text-[11px] font-mono font-bold text-zinc-200 leading-tight mt-0.5 whitespace-nowrap">
                  {balance.toFixed(1)} zł
                </span>
              </div>
            </div>

            {/* Tier 2: Ergonomic Action Row (AUTO - BIG CENTER SPIN - TURBO) */}
            <div className="flex items-center justify-between px-6 py-1.5 rounded-2xl bg-[#080a0f]/85 border border-amber-500/20 backdrop-blur-xl shadow-lg">
              {/* AUTO BUTTON */}
              <button
                type="button"
                onClick={onToggleAuto}
                className={cn(
                  'relative w-11 h-11 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none shrink-0',
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
                      unoptimized
                      className="object-contain filter hue-rotate-90"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                      <Square className="w-3 h-3 text-white fill-white" />
                      <span className="text-[8px] font-black text-white">{autoSpinsLeft}</span>
                    </div>
                  </div>
                ) : (
                  <Image
                    src="/MacvSlot/autobutton.webp"
                    alt="Auto"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                )}
              </button>

              {/* MASTER SPIN BUTTON */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                disabled={disabled || isSpinning}
                onClick={handleSpinClick}
                className={cn(
                  'relative w-20 h-20 flex items-center justify-center transition-all focus:outline-none select-none cursor-pointer shrink-0',
                  isSpinning && 'opacity-85 cursor-not-allowed'
                )}
              >
                <div className="absolute inset-[-6px] rounded-full bg-amber-400/30 blur-xl animate-pulse pointer-events-none" />
                <div className="relative w-full h-full drop-shadow-[0_10px_25px_rgba(245,158,11,0.7)]">
                  <Image
                    src="/MacvSlot/spinbutton.webp"
                    alt="SPIN"
                    fill
                    priority
                    unoptimized
                    className="object-contain transition-transform duration-200"
                  />
                </div>
              </motion.button>

              {/* TURBO BUTTON */}
              <button
                type="button"
                onClick={onToggleTurbo}
                className={cn(
                  'relative w-11 h-11 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none shrink-0',
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
                  unoptimized
                  className={cn(
                    'object-contain',
                    isTurbo && 'filter brightness-125'
                  )}
                />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 2. DESKTOP CONTROLS (Screen >= md)                                   */}
      {/* ==================================================================== */}
      <div className="hidden md:flex items-center justify-between gap-4 md:gap-6 p-3 md:p-4 rounded-3xl bg-[#080a0f]/92 border border-amber-500/20 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.85)]">
        {isFreeSpinActive ? (
          /* Desktop Bonus HUD: Bet selector is replaced, Spin & Turbo centered */
          <>
            {/* Left: Player Balance */}
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/60 border border-amber-500/30 shadow-inner">
              <span className="text-xs text-zinc-400 font-medium">Баланс:</span>
              <span className="text-base font-mono font-black text-zinc-200">{balance.toFixed(1)} zł</span>
            </div>

            {/* Center: Spin & Turbo */}
            <div className="flex items-center gap-6">
              {/* Turbo Button */}
              <button
                type="button"
                onClick={onToggleTurbo}
                className={cn(
                  'relative w-12 h-12 md:w-13 md:h-13 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none shrink-0',
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
                  unoptimized
                  className={cn('object-contain', isTurbo && 'filter brightness-125')}
                />
              </button>

              {/* Master Spin Button */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.93 }}
                disabled={disabled || isSpinning || (isBonusMode && !isBonusPaused)}
                onClick={handleSpinClick}
                className={cn(
                  'relative w-24 h-24 md:w-28 md:h-28 flex items-center justify-center transition-all focus:outline-none select-none cursor-pointer shrink-0',
                  (isSpinning || (isBonusMode && !isBonusPaused)) && 'opacity-90'
                )}
              >
                <div className="absolute inset-[-6px] rounded-full bg-amber-400/35 blur-xl animate-pulse pointer-events-none" />
                <div className="relative w-full h-full drop-shadow-[0_10px_25px_rgba(245,158,11,0.7)]">
                  <Image
                    src="/MacvSlot/spinbutton.webp"
                    alt="SPIN"
                    fill
                    priority
                    unoptimized
                    className={cn(
                      'object-contain transition-transform duration-200',
                      isSpinning && 'animate-[spin_4s_linear_infinite]'
                    )}
                  />
                </div>
              </motion.button>
            </div>
          </>
        ) : (
          /* Normal Base Game Desktop Dock */
          <>
            {/* Left Group: Bet & Balance Selector */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                disabled={disabled || isSpinning}
                onClick={() => handleStepBet(-1)}
                className="w-10 h-10 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
                aria-label="Decrease bet"
              >
                <Minus className="w-4 h-4 stroke-[2.5]" />
              </button>

              {/* Bet Pill with Live Balance and Current Bet */}
              <button
                type="button"
                disabled={disabled || isSpinning}
                onClick={() => setShowBetModal((prev) => !prev)}
                className="relative px-4 py-2 rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-amber-500/40 active:scale-98 flex items-center gap-2.5 transition-all justify-center cursor-pointer shadow-lg hover:border-amber-400/60"
              >
                <div className="relative w-7 h-7 shrink-0">
                  <Image
                    src="/MacvSlot/coinbutton.webp"
                    alt="coin"
                    fill
                    className="object-contain drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]"
                  />
                </div>
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-[11px] text-zinc-400 font-medium tracking-tight whitespace-nowrap">
                    Баланс: <strong className="text-zinc-200 font-mono font-bold">{balance.toFixed(1)} zł</strong>
                  </span>
                  <span className="font-black text-base text-amber-300 font-brand whitespace-nowrap">
                    Ставка: {`${betAmount.toFixed(betAmount < 1 ? 2 : 1)} zł`}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={disabled || isSpinning}
                onClick={() => handleStepBet(1)}
                className="w-10 h-10 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 disabled:opacity-40 flex items-center justify-center text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-md"
                aria-label="Increase bet"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Right Group: Symmetrical Action Trio: [AUTO] --- [SPIN] --- [TURBO] */}
            <div className="flex items-center gap-4 md:gap-6 shrink-0">
              {/* AUTO BUTTON */}
              <button
                type="button"
                onClick={onToggleAuto}
                className={cn(
                  'relative w-12 h-12 md:w-13 md:h-13 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none shrink-0',
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
                      unoptimized
                      className="object-contain filter hue-rotate-90"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                      <Square className="w-3 h-3 text-white fill-white" />
                      <span className="text-[9px] font-black text-white">{autoSpinsLeft}</span>
                    </div>
                  </div>
                ) : (
                  <Image
                    src="/MacvSlot/autobutton.webp"
                    alt="Auto"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                )}
              </button>

              {/* MASTER SPIN BUTTON */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.93 }}
                disabled={disabled || isSpinning}
                onClick={handleSpinClick}
                className={cn(
                  'relative w-24 h-24 md:w-28 md:h-28 flex items-center justify-center transition-all focus:outline-none select-none cursor-pointer shrink-0',
                  isSpinning && 'opacity-85 cursor-not-allowed'
                )}
              >
                <div className="absolute inset-[-6px] rounded-full bg-amber-400/30 blur-xl animate-pulse pointer-events-none" />
                <div className="relative w-full h-full drop-shadow-[0_10px_25px_rgba(245,158,11,0.7)]">
                  <Image
                    src="/MacvSlot/spinbutton.webp"
                    alt="SPIN"
                    fill
                    priority
                    unoptimized
                    className="object-contain transition-transform duration-200"
                  />
                </div>
              </motion.button>

              {/* TURBO BUTTON */}
              <button
                type="button"
                onClick={onToggleTurbo}
                className={cn(
                  'relative w-12 h-12 md:w-13 md:h-13 flex items-center justify-center transition-transform active:scale-90 cursor-pointer border-0 bg-transparent outline-none select-none shrink-0',
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
                  unoptimized
                  className={cn(
                    'object-contain',
                    isTurbo && 'filter brightness-125'
                  )}
                />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Quick Bet Preset Drawer (Only in Normal Game) */}
      {!isFreeSpinActive && showBetModal && (
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
