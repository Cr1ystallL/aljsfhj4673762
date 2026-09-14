'use client';

import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Trophy, Zap, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg animate-in fade-in duration-300">
      <motion.div
        initial={{ scale: 0.7, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#131722] to-[#0a0c10] border-2 border-amber-400 p-6 text-center text-white shadow-[0_0_50px_rgba(251,191,36,0.5)] overflow-hidden"
      >
        {/* Glow background */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-amber-500/25 blur-3xl pointer-events-none" />

        {/* Scatter Logo in center */}
        <div className="relative w-28 h-28 mx-auto mb-3 drop-shadow-[0_0_25px_rgba(251,191,36,0.8)] animate-bounce">
          <Image
            src="/MacvSlot/scatter.webp"
            alt="SCATTER WIN"
            fill
            className="object-contain"
            priority
          />
        </div>

        <h3 className="font-brand font-black text-2xl sm:text-3xl text-amber-400 tracking-wider uppercase drop-shadow-[0_2px_10px_rgba(251,191,36,0.5)]">
          БОНУСНАЯ ИГРА!
        </h3>

        <p className="text-zinc-300 text-sm mt-1">
          Выпало 3+ Scatter символа! Вам начислено:
        </p>

        <div className="my-5 py-3 px-4 rounded-2xl bg-amber-500/15 border border-amber-400/40">
          <span className="font-brand font-black text-3xl sm:text-4xl text-white tracking-widest">
            {freeSpinsAwarded} ФРИСПИНОВ
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            soundManager.play('ui.success');
            onStartFreeSpins();
          }}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-black font-brand font-black text-base uppercase tracking-wider shadow-[0_4px_20px_rgba(245,158,11,0.5)] hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2"
        >
          <Zap className="w-5 h-5 fill-black" />
          <span>КРУТИТЬ БОНУСКУ</span>
        </button>
      </motion.div>
    </div>
  );
}
