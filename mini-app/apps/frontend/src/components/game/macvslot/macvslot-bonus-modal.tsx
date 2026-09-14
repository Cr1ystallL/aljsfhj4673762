'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Zap, Sparkles } from 'lucide-react';
import { soundManager } from '@/lib/sound/sound-manager';

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
