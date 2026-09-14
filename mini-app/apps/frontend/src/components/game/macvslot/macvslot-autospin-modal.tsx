'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';

interface MacvSlotAutoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartAuto: (rounds: number, turbo: boolean) => void;
  currentTurbo: boolean;
}

const ROUND_PRESETS = [10, 20, 50, 100, 250];

export function MacvSlotAutoModal({
  isOpen,
  onClose,
  onStartAuto,
  currentTurbo,
}: MacvSlotAutoModalProps) {
  const [selectedRounds, setSelectedRounds] = useState<number>(20);
  const [turboEnabled, setTurboEnabled] = useState<boolean>(currentTurbo);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200 select-none">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="relative w-full max-w-sm rounded-3xl bg-[#080a12]/98 border border-amber-500/40 p-5 sm:p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(251,191,36,0.25)] overflow-hidden"
      >
        {/* Soft atmospheric golden bloom */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

        {/* Header with Close */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 shrink-0 drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]">
              <Image
                src="/MacvSlot/autobutton.webp"
                alt="Auto"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
            <div>
              <h3 className="font-brand font-black text-base sm:text-lg text-white uppercase tracking-wider">
                АВТО-ИГРА
              </h3>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 block">
                НАСТРОЙКА РАУНДОВ
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundManager.play('ui.click', { volume: 0.3 });
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-zinc-700/50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Select Rounds Count */}
        <div className="mb-4">
          <label className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 block mb-2 font-semibold">
            Количество спинов:
          </label>
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {ROUND_PRESETS.map((rounds) => {
              const isSelected = selectedRounds === rounds;
              return (
                <button
                  key={rounds}
                  type="button"
                  onClick={() => {
                    soundManager.play('ui.click', { volume: 0.35 });
                    setSelectedRounds(rounds);
                  }}
                  className={cn(
                    'py-2.5 rounded-xl font-brand font-black text-xs sm:text-sm transition-all cursor-pointer border',
                    isSelected
                      ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-black border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.4)] scale-105 z-10'
                      : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border-zinc-700/60'
                  )}
                >
                  {rounds}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Turbo Mode Switch with Authentic 3D Turbo Asset */}
        <div
          onClick={() => {
            soundManager.play('ui.click', { volume: 0.35 });
            setTurboEnabled((prev) => !prev);
          }}
          className="flex items-center justify-between p-3 rounded-2xl bg-black/60 border border-amber-500/25 hover:border-amber-400/50 transition-all cursor-pointer mb-5 group"
        >
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 shrink-0">
              <Image
                src="/MacvSlot/turbobutton.webp"
                alt="Turbo"
                fill
                unoptimized
                className={cn(
                  'object-contain transition-all duration-200',
                  turboEnabled
                    ? 'filter brightness-125 drop-shadow-[0_0_10px_rgba(251,191,36,0.85)] scale-105'
                    : 'opacity-40 grayscale group-hover:opacity-70'
                )}
              />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Турбо-режим</span>
              <span className="text-[10px] text-zinc-400 block font-mono">
                {turboEnabled ? 'Быстрые спины включены' : 'Обычная скорость вращения'}
              </span>
            </div>
          </div>

          {/* Toggle pill */}
          <div
            className={cn(
              'w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5',
              turboEnabled ? 'bg-amber-400' : 'bg-zinc-800 border border-zinc-700'
            )}
          >
            <motion.div
              animate={{ x: turboEnabled ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={cn(
                'w-5 h-5 rounded-full shadow-md',
                turboEnabled ? 'bg-black' : 'bg-zinc-400'
              )}
            />
          </div>
        </div>

        {/* 3. Start Auto-Spins Button with 3D Spin Graphic */}
        <button
          type="button"
          onClick={() => {
            soundManager.play('ui.success', { volume: 0.7 });
            onStartAuto(selectedRounds, turboEnabled);
          }}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:brightness-105 active:scale-[0.98] text-black font-brand font-black text-sm uppercase tracking-widest transition-all cursor-pointer shadow-[0_4px_20px_rgba(251,191,36,0.4)] flex items-center justify-center gap-2.5"
        >
          <div className="relative w-5 h-5 shrink-0">
            <Image
              src="/MacvSlot/spinbutton.webp"
              alt="Spin"
              fill
              unoptimized
              className="object-contain"
            />
          </div>
          <span>СТАРТ ({selectedRounds} СПИНОВ)</span>
        </button>
      </motion.div>
    </div>
  );
}
